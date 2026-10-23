import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../../middleware/auth';
import { setTenantContext } from '../../middleware/tenantContext';
import { requirePermission } from '../../middleware/permissions';
import { computePayrollForAllEmployees, generatePayslipLineItems, generateGovernmentReport, roundTo2 } from '../../services/payrollEngine';
import { parsePaginationQuery, buildPaginationMeta, addPaginationToQuery } from '../../middleware/pagination';
import { logAuditEvent, extractIp } from '../../middleware/auditLog';
import { sendPayslipNotification } from '../../services/pushNotification';
import sql from 'mssql';

const router = Router();

router.use(authMiddleware);
router.use(setTenantContext);

const VALID_PERIOD_TRANSITIONS: Record<string, string[]> = {
  Open: ['Processing'],
  Processing: ['Approved'],
  Approved: ['Paid'],
  Paid: ['Closed'],
};

router.get('/periods', requirePermission('payroll:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { status } = req.query;
    const pagination = parsePaginationQuery(req.query);
    
    let whereClause = 'WHERE TenantId = @TenantId AND IsDeleted = 0';
    const request = pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId);
    
    if (status) {
      whereClause += ' AND Status = @Status';
      request.input('Status', sql.NVarChar, status);
    }
    
    const countResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`SELECT COUNT(*) AS total FROM dbo.PayrollPeriods ${whereClause}`);
    const total = countResult.recordset[0]?.total || 0;
    
    const selectQuery = `SELECT Id, PeriodStart, PeriodEnd, PayDate, PayFrequency, Status FROM dbo.PayrollPeriods`;
    const fullQuery = addPaginationToQuery(selectQuery, whereClause, 'ORDER BY PeriodStart DESC', pagination);
    const result = await request.query(fullQuery);
    
    res.json({
      success: true,
      data: {
        payrollPeriods: result.recordset,
        pagination: buildPaginationMeta(pagination.page, pagination.pageSize, total)
      }
    });
  } catch (error) {
    console.error('Error getting payroll periods:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve payroll periods' }
    });
  }
});

router.get('/periods/:id', requirePermission('payroll:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const periodId = req.params.id as string;

    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, periodId)
      .query(`
        SELECT pp.Id, pp.PeriodStart, pp.PeriodEnd, pp.PayDate, pp.PayFrequency, pp.Status,
               pr.Id AS RunId, pr.RunDate, pr.Status AS RunStatus, pr.TotalGrossPay, pr.TotalNetPay, pr.TotalEmployerCost
        FROM dbo.PayrollPeriods pp
        LEFT JOIN dbo.PayrollRuns pr ON pr.PayrollPeriodId = pp.Id AND pr.IsDeleted = 0
        WHERE pp.Id = @Id AND pp.TenantId = @TenantId AND pp.IsDeleted = 0
        ORDER BY pr.RunDate DESC
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Payroll period not found' } });
      return;
    }

    const period = result.recordset[0];
    const runs = result.recordset.filter((r: any) => r.RunId).map((r: any) => ({
      Id: r.RunId, RunDate: r.RunDate, Status: r.RunStatus,
      TotalGrossPay: r.TotalGrossPay, TotalNetPay: r.TotalNetPay, TotalEmployerCost: r.TotalEmployerCost,
    }));

    res.json({
      success: true,
      data: { period: { ...period, runs }, runs: undefined }
    });
  } catch (error) {
    console.error('Error getting payroll period:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve payroll period' } });
  }
});

router.post('/period', requirePermission('payroll:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { periodStart, periodEnd, payDate, payFrequency } = req.body;
    
    if (!periodStart || !periodEnd || !payDate || !payFrequency) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing required fields' } });
      return;
    }
    
    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('PeriodStart', sql.Date, new Date(periodStart))
      .input('PeriodEnd', sql.Date, new Date(periodEnd))
      .input('PayDate', sql.Date, new Date(payDate))
      .input('PayFrequency', sql.NVarChar, payFrequency)
      .input('CreatedBy', sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO dbo.PayrollPeriods (TenantId, PeriodStart, PeriodEnd, PayDate, PayFrequency, CreatedBy)
        OUTPUT INSERTED.Id
        VALUES (@TenantId, @PeriodStart, @PeriodEnd, @PayDate, @PayFrequency, @CreatedBy);
      `);
    
    await logAuditEvent(pool, {
      tenantId: tenantId!, userId, action: 'CREATE', entityName: 'PayrollPeriod',
      entityId: result.recordset[0].Id, afterJson: { periodStart, periodEnd, payDate, payFrequency },
      ipAddress: extractIp(req)
    });
    
    res.status(201).json({ success: true, data: { id: result.recordset[0].Id, message: 'Payroll period created successfully' } });
  } catch (error) {
    console.error('Error creating payroll period:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to create payroll period' } });
  }
});

router.put('/periods/:id', requirePermission('payroll:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const periodId = req.params.id as string;
    const { periodStart, periodEnd, payDate, payFrequency } = req.body;

    const existing = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, periodId)
      .query(`SELECT Status FROM dbo.PayrollPeriods WHERE Id = @Id AND TenantId = @TenantId AND IsDeleted = 0`);

    if (existing.recordset.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Payroll period not found' } });
      return;
    }

    if (existing.recordset[0].Status !== 'Open') {
      res.status(400).json({ success: false, error: { code: 'INVALID_STATUS', message: 'Can only edit periods in Open status' } });
      return;
    }

    await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, periodId)
      .input('PeriodStart', sql.Date, new Date(periodStart))
      .input('PeriodEnd', sql.Date, new Date(periodEnd))
      .input('PayDate', sql.Date, new Date(payDate))
      .input('PayFrequency', sql.NVarChar, payFrequency)
      .input('UpdatedBy', sql.UniqueIdentifier, userId)
      .query(`
        UPDATE dbo.PayrollPeriods
        SET PeriodStart = @PeriodStart, PeriodEnd = @PeriodEnd, PayDate = @PayDate,
            PayFrequency = @PayFrequency, UpdatedBy = @UpdatedBy, UpdatedAtUtc = GETUTCDATE()
        WHERE Id = @Id AND TenantId = @TenantId AND IsDeleted = 0
      `);

    res.json({ success: true, data: { message: 'Payroll period updated' } });
  } catch (error) {
    console.error('Error updating payroll period:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to update payroll period' } });
  }
});

router.patch('/periods/:id/status', requirePermission('payroll:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const periodId = req.params.id as string;
    const { status: newStatus } = req.body;

    if (!newStatus) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Status is required' } });
      return;
    }

    const existing = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, periodId)
      .query(`SELECT Status FROM dbo.PayrollPeriods WHERE Id = @Id AND TenantId = @TenantId AND IsDeleted = 0`);

    if (existing.recordset.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Payroll period not found' } });
      return;
    }

    const currentStatus = existing.recordset[0].Status;
    const allowed = VALID_PERIOD_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_TRANSITION', message: `Cannot transition from '${currentStatus}' to '${newStatus}'` }
      });
      return;
    }

    await pool.request()
      .input('Id', sql.UniqueIdentifier, periodId)
      .input('Status', sql.NVarChar, newStatus)
      .input('UpdatedBy', sql.UniqueIdentifier, userId)
      .query(`
        UPDATE dbo.PayrollPeriods SET Status = @Status, UpdatedBy = @UpdatedBy, UpdatedAtUtc = GETUTCDATE() WHERE Id = @Id
      `);

    await logAuditEvent(pool, {
      tenantId: tenantId!, userId, action: 'STATUS_CHANGE', entityName: 'PayrollPeriod',
      entityId: periodId, beforeJson: { Status: currentStatus }, afterJson: { Status: newStatus },
      ipAddress: extractIp(req)
    });

    res.json({ success: true, data: { message: `Period status updated to '${newStatus}'` } });
  } catch (error) {
    console.error('Error updating period status:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to update period status' } });
  }
});

router.post('/run', requirePermission('payroll:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { payrollPeriodId } = req.body;
    
    if (!payrollPeriodId) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Payroll period ID is required' } });
      return;
    }
    
    const periodResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, payrollPeriodId)
      .query(`SELECT Id, Status FROM dbo.PayrollPeriods WHERE Id = @Id AND TenantId = @TenantId AND IsDeleted = 0`);
    
    if (periodResult.recordset.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Payroll period not found' } });
      return;
    }
    
    if (periodResult.recordset[0].Status !== 'Open') {
      res.status(400).json({ success: false, error: { code: 'INVALID_STATUS', message: 'Payroll period is not in open status' } });
      return;
    }
    
    await pool.request()
      .input('Id', sql.UniqueIdentifier, payrollPeriodId)
      .input('Status', sql.NVarChar, 'Processing')
      .query(`UPDATE dbo.PayrollPeriods SET Status = @Status, UpdatedAtUtc = GETUTCDATE() WHERE Id = @Id`);
    
    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('PayrollPeriodId', sql.UniqueIdentifier, payrollPeriodId)
      .input('RunDate', sql.DateTime2, new Date())
      .input('RunByUserId', sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO dbo.PayrollRuns (TenantId, PayrollPeriodId, RunDate, RunByUserId, Status)
        OUTPUT INSERTED.Id
        VALUES (@TenantId, @PayrollPeriodId, @RunDate, @RunByUserId, 'Processing');
      `);
    
    const payrollRunId = result.recordset[0].Id;
    
    const engineResult = await computePayrollForAllEmployees(pool, tenantId!, payrollPeriodId);
    const { payslips, totalGrossPay, totalNetPay, totalEmployerCost } = engineResult;
    
    for (const payslip of payslips) {
      const payslipResult = await pool.request()
        .input('TenantId', sql.UniqueIdentifier, tenantId)
        .input('PayrollRunId', sql.UniqueIdentifier, payrollRunId)
        .input('EmployeeId', sql.UniqueIdentifier, payslip.EmployeeId)
        .input('BasicPay', sql.Decimal(18, 4), payslip.BasicPay)
        .input('TotalWorkedDays', sql.Decimal(5, 2), payslip.TotalWorkedDays)
        .input('AbsentDeduction', sql.Decimal(18, 4), payslip.AbsentDeduction)
        .input('LateDeduction', sql.Decimal(18, 4), payslip.LateDeduction)
        .input('UndertimeDeduction', sql.Decimal(18, 4), payslip.UndertimeDeduction)
        .input('OvertimePay', sql.Decimal(18, 4), payslip.OvertimePay)
        .input('NightDiffPay', sql.Decimal(18, 4), payslip.NightDiffPay)
        .input('HolidayPay', sql.Decimal(18, 4), payslip.HolidayPay)
        .input('RestDayPremium', sql.Decimal(18, 4), payslip.RestDayPremium)
        .input('Allowances', sql.Decimal(18, 4), payslip.Allowances)
        .input('DeMinimisBenefits', sql.Decimal(18, 4), payslip.DeMinimisBenefits)
        .input('GrossPay', sql.Decimal(18, 4), payslip.GrossPay)
        .input('SssEmployeeShare', sql.Decimal(18, 4), payslip.SssEmployeeShare)
        .input('SssEmployerShare', sql.Decimal(18, 4), payslip.SssEmployerShare)
        .input('SssMPFEmployee', sql.Decimal(18, 4), payslip.SssMPFEmployee)
        .input('SssMPFEmployer', sql.Decimal(18, 4), payslip.SssMPFEmployer)
        .input('PhilHealthEmployeeShare', sql.Decimal(18, 4), payslip.PhilHealthEmployeeShare)
        .input('PhilHealthEmployerShare', sql.Decimal(18, 4), payslip.PhilHealthEmployerShare)
        .input('PagIbigEmployeeShare', sql.Decimal(18, 4), payslip.PagIbigEmployeeShare)
        .input('PagIbigEmployerShare', sql.Decimal(18, 4), payslip.PagIbigEmployerShare)
        .input('WithholdingTax', sql.Decimal(18, 4), payslip.WithholdingTax)
        .input('ThirteenthMonthPayAccrual', sql.Decimal(18, 4), payslip.ThirteenthMonthPayAccrual)
        .input('LoanDeductions', sql.Decimal(18, 4), payslip.LoanDeductions)
        .input('OtherDeductions', sql.Decimal(18, 4), payslip.OtherDeductions)
        .input('TotalDeductions', sql.Decimal(18, 4), payslip.TotalDeductions)
        .input('NetPay', sql.Decimal(18, 4), payslip.NetPay)
        .input('GsisEmployeeShare', sql.Decimal(18, 4), payslip.GsisEmployeeShare)
        .input('GsisEmployerShare', sql.Decimal(18, 4), payslip.GsisEmployerShare)
        .input('GsisECShare', sql.Decimal(18, 4), payslip.GsisECShare)
        .input('PeraEmployeeShare', sql.Decimal(18, 4), payslip.PeraEmployeeShare)
        .input('PeraEmployerShare', sql.Decimal(18, 4), payslip.PeraEmployerShare)
        .input('CreatedBy', sql.UniqueIdentifier, userId)
          .query(`
          INSERT INTO dbo.Payslips (
            TenantId, PayrollRunId, EmployeeId,
            BasicPay, TotalWorkedDays, AbsentDeduction, LateDeduction, UndertimeDeduction,
            OvertimePay, NightDiffPay, HolidayPay, RestDayPremium, Allowances, DeMinimisBenefits, GrossPay,
            SssEmployeeShare, SssEmployerShare, SssMPFEmployee, SssMPFEmployer,
            PhilHealthEmployeeShare, PhilHealthEmployerShare,
            PagIbigEmployeeShare, PagIbigEmployerShare,
            GsisEmployeeShare, GsisEmployerShare, GsisECShare,
            PeraEmployeeShare, PeraEmployerShare,
            WithholdingTax, ThirteenthMonthPayAccrual,
            LoanDeductions, OtherDeductions, TotalDeductions, NetPay, CreatedBy
          )
          OUTPUT INSERTED.Id
          VALUES (
            @TenantId, @PayrollRunId, @EmployeeId,
            @BasicPay, @TotalWorkedDays, @AbsentDeduction, @LateDeduction, @UndertimeDeduction,
            @OvertimePay, @NightDiffPay, @HolidayPay, @RestDayPremium, @Allowances, @DeMinimisBenefits, @GrossPay,
            @SssEmployeeShare, @SssEmployerShare, @SssMPFEmployee, @SssMPFEmployer,
            @PhilHealthEmployeeShare, @PhilHealthEmployerShare,
            @PagIbigEmployeeShare, @PagIbigEmployerShare,
            @GsisEmployeeShare, @GsisEmployerShare, @GsisECShare,
            @PeraEmployeeShare, @PeraEmployerShare,
            @WithholdingTax, @ThirteenthMonthPayAccrual,
            @LoanDeductions, @OtherDeductions, @TotalDeductions, @NetPay, @CreatedBy
          );
        `);

      const payslipId = payslipResult.recordset[0].Id;
      const lineItems = generatePayslipLineItems(payslip);
      for (const item of lineItems) {
        await pool.request()
          .input('PayslipId', sql.UniqueIdentifier, payslipId)
          .input('TenantId', sql.UniqueIdentifier, tenantId)
          .input('ItemType', sql.NVarChar, item.ItemType)
          .input('Code', sql.NVarChar, item.Code)
          .input('Description', sql.NVarChar, item.Description)
          .input('Amount', sql.Decimal(18, 4), item.Amount)
          .query(`
            INSERT INTO dbo.PayslipLineItems (PayslipId, TenantId, ItemType, Code, Description, Amount)
            VALUES (@PayslipId, @TenantId, @ItemType, @Code, @Description, @Amount)
          `);
      }

      if (payslip.PeraEmployeeShare > 0 || payslip.PeraEmployerShare > 0) {
        const now = new Date();
        await pool.request()
          .input('TenantId', sql.UniqueIdentifier, tenantId)
          .input('EmployeeId', sql.UniqueIdentifier, payslip.EmployeeId)
          .input('PayrollRunId', sql.UniqueIdentifier, payrollRunId)
          .input('PayrollPeriodId', sql.UniqueIdentifier, payrollPeriodId)
          .input('ContributionDate', sql.Date, now)
          .input('EmployeeContribution', sql.Decimal(18, 4), payslip.PeraEmployeeShare)
          .input('EmployerContribution', sql.Decimal(18, 4), payslip.PeraEmployerShare)
          .input('ContributionYear', sql.Int, now.getFullYear())
          .input('ContributionMonth', sql.Int, now.getMonth() + 1)
          .input('CreatedBy', sql.UniqueIdentifier, userId)
          .query(`
            INSERT INTO dbo.EmployeePeraContributions (
              TenantId, EmployeeId, PayrollRunId, PayrollPeriodId, ContributionDate,
              EmployeeContribution, EmployerContribution, ContributionYear, ContributionMonth, CreatedBy
            ) VALUES (
              @TenantId, @EmployeeId, @PayrollRunId, @PayrollPeriodId, @ContributionDate,
              @EmployeeContribution, @EmployerContribution, @ContributionYear, @ContributionMonth, @CreatedBy
            );
          `);
      }
    }
    
    await pool.request()
      .input('Id', sql.UniqueIdentifier, payrollRunId)
      .input('TotalGrossPay', sql.Decimal(18, 4), totalGrossPay)
      .input('TotalNetPay', sql.Decimal(18, 4), totalNetPay)
      .input('TotalEmployerCost', sql.Decimal(18, 4), totalEmployerCost)
      .input('Status', sql.NVarChar, 'Approved')
      .query(`
        UPDATE dbo.PayrollRuns
        SET TotalGrossPay = @TotalGrossPay, TotalNetPay = @TotalNetPay,
            TotalEmployerCost = @TotalEmployerCost, Status = @Status, UpdatedAtUtc = GETUTCDATE()
        WHERE Id = @Id
      `);
    
    await pool.request()
      .input('Id', sql.UniqueIdentifier, payrollPeriodId)
      .input('Status', sql.NVarChar, 'Processing')
      .query(`UPDATE dbo.PayrollPeriods SET Status = @Status, UpdatedAtUtc = GETUTCDATE() WHERE Id = @Id`);
    
    await logAuditEvent(pool, {
      tenantId: tenantId!, userId, action: 'RUN_PAYROLL', entityName: 'PayrollRun',
      entityId: payrollRunId, afterJson: { payrollPeriodId, totalGrossPay, totalNetPay, totalEmployerCost, payslipCount: payslips.length },
      ipAddress: extractIp(req)
    });

    // Spec §8.8: Push notification — notify all employees their payslips are ready
    // Fire-and-forget: don't block the response
    const payDate = new Date().toISOString().split('T')[0];
    for (const payslip of payslips) {
      sendPayslipNotification(pool, tenantId!, payslip.EmployeeId, payDate).catch(() => {});
    }
    
    res.status(201).json({
      success: true,
      data: { payrollRunId, totalGrossPay, totalNetPay, totalEmployerCost, payslipCount: payslips.length, message: 'Payroll run completed successfully' }
    });
  } catch (error) {
    console.error('Error running payroll:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to run payroll' } });
  }
});

router.get('/runs', requirePermission('payroll:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { status } = req.query;
    const pagination = parsePaginationQuery(req.query);
    
    let whereClause = 'WHERE pr.TenantId = @TenantId AND pr.IsDeleted = 0';
    const request = pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId);
    
    if (status) {
      whereClause += ' AND pr.Status = @Status';
      request.input('Status', sql.NVarChar, status);
    }
    
    const countResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`SELECT COUNT(*) AS total FROM dbo.PayrollRuns pr ${whereClause}`);
    const total = countResult.recordset[0]?.total || 0;
    
    const selectQuery = `SELECT pr.Id, pr.RunDate, pr.Status, pr.TotalGrossPay, pr.TotalNetPay, pr.TotalEmployerCost, pp.PeriodStart, pp.PeriodEnd, pp.PayDate, pp.PayFrequency FROM dbo.PayrollRuns pr INNER JOIN dbo.PayrollPeriods pp ON pr.PayrollPeriodId = pp.Id`;
    const fullQuery = addPaginationToQuery(selectQuery, whereClause, 'ORDER BY pr.RunDate DESC', pagination);
    const result = await request.query(fullQuery);
    
    res.json({
      success: true,
      data: { payrollRuns: result.recordset, pagination: buildPaginationMeta(pagination.page, pagination.pageSize, total) }
    });
  } catch (error) {
    console.error('Error getting payroll runs:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve payroll runs' } });
  }
});

router.get('/runs/:id', requirePermission('payroll:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const runId = req.params.id as string;

    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, runId)
      .query(`
        SELECT pr.Id, pr.RunDate, pr.Status, pr.TotalGrossPay, pr.TotalNetPay, pr.TotalEmployerCost,
               pp.PeriodStart, pp.PeriodEnd, pp.PayDate, pp.PayFrequency
        FROM dbo.PayrollRuns pr
        INNER JOIN dbo.PayrollPeriods pp ON pr.PayrollPeriodId = pp.Id
        WHERE pr.Id = @Id AND pr.TenantId = @TenantId AND pr.IsDeleted = 0
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Payroll run not found' } });
      return;
    }

    const payslipCountResult = await pool.request()
      .input('RunId', sql.UniqueIdentifier, runId)
      .query(`SELECT COUNT(*) AS Count FROM dbo.Payslips WHERE PayrollRunId = @RunId AND IsDeleted = 0`);

    res.json({
      success: true,
      data: { ...result.recordset[0], payslipCount: payslipCountResult.recordset[0]?.Count || 0 }
    });
  } catch (error) {
    console.error('Error getting payroll run:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve payroll run' } });
  }
});

router.get('/runs/:id/payslips', requirePermission('payroll:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const runId = req.params.id as string;
    const pagination = parsePaginationQuery(req.query);

    const countResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('RunId', sql.UniqueIdentifier, runId)
      .query(`SELECT COUNT(*) AS total FROM dbo.Payslips WHERE TenantId = @TenantId AND PayrollRunId = @RunId AND IsDeleted = 0`);
    const total = countResult.recordset[0]?.total || 0;

    const selectQuery = `SELECT p.Id, p.BasicPay, p.TotalWorkedDays, p.GrossPay, p.TotalDeductions, p.NetPay,
      e.EmployeeNo, e.FirstName, e.LastName, e.MiddleName
      FROM dbo.Payslips p
      INNER JOIN dbo.Employees e ON p.EmployeeId = e.Id`;
    const whereClause = 'WHERE p.TenantId = @TenantId AND p.PayrollRunId = @RunId AND p.IsDeleted = 0';
    const fullQuery = addPaginationToQuery(selectQuery, whereClause, 'ORDER BY e.LastName, e.FirstName', pagination);
    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('RunId', sql.UniqueIdentifier, runId)
      .query(fullQuery);

    res.json({
      success: true,
      data: { payslips: result.recordset, pagination: buildPaginationMeta(pagination.page, pagination.pageSize, total) }
    });
  } catch (error) {
    console.error('Error getting run payslips:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve payslips' } });
  }
});

router.get('/payslips', requirePermission('payroll:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { payrollRunId, employeeId } = req.query;
    const pagination = parsePaginationQuery(req.query);
    
    let whereClause = 'WHERE p.TenantId = @TenantId AND p.IsDeleted = 0';
    const request = pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId);
    
    if (payrollRunId) {
      whereClause += ' AND p.PayrollRunId = @PayrollRunId';
      request.input('PayrollRunId', sql.UniqueIdentifier, payrollRunId);
    }
    
    if (employeeId) {
      whereClause += ' AND p.EmployeeId = @EmployeeId';
      request.input('EmployeeId', sql.UniqueIdentifier, employeeId);
    }
    
    const countResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`SELECT COUNT(*) AS total FROM dbo.Payslips p ${whereClause}`);
    const total = countResult.recordset[0]?.total || 0;
    
    const selectQuery = `SELECT p.Id, p.BasicPay, p.TotalWorkedDays, p.AbsentDeduction, p.LateDeduction, p.UndertimeDeduction, p.OvertimePay, p.NightDiffPay, p.HolidayPay, p.RestDayPremium, p.Allowances, p.DeMinimisBenefits, p.GrossPay, p.SssEmployeeShare, p.SssEmployerShare, p.SssMPFEmployee, p.SssMPFEmployer, p.PhilHealthEmployeeShare, p.PhilHealthEmployerShare, p.PagIbigEmployeeShare, p.PagIbigEmployerShare, p.GsisEmployeeShare, p.GsisEmployerShare, p.GsisECShare, p.PeraEmployeeShare, p.PeraEmployerShare, p.WithholdingTax, p.ThirteenthMonthPayAccrual, p.OtherDeductions, p.LoanDeductions, p.TotalDeductions, p.NetPay, e.EmployeeNo, e.FirstName, e.LastName, pp.PeriodStart, pp.PeriodEnd, pp.PayDate FROM dbo.Payslips p INNER JOIN dbo.Employees e ON p.EmployeeId = e.Id INNER JOIN dbo.PayrollRuns pr ON p.PayrollRunId = pr.Id INNER JOIN dbo.PayrollPeriods pp ON pr.PayrollPeriodId = pp.Id`;
    const fullQuery = addPaginationToQuery(selectQuery, whereClause, 'ORDER BY pp.PayDate DESC, e.LastName, e.FirstName', pagination);
    const result = await request.query(fullQuery);
    
    res.json({
      success: true,
      data: { payslips: result.recordset, pagination: buildPaginationMeta(pagination.page, pagination.pageSize, total) }
    });
  } catch (error) {
    console.error('Error getting payslips:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve payslips' } });
  }
});

router.get('/payslips/:id', requirePermission('payroll:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const payslipId = req.params.id as string;

    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, payslipId)
      .query(`
        SELECT p.*, e.EmployeeNo, e.FirstName, e.LastName, e.MiddleName, e.TIN, e.SssNo, e.PhilHealthNo, e.PagIbigNo,
               pp.PeriodStart, pp.PeriodEnd, pp.PayDate, pp.PayFrequency
        FROM dbo.Payslips p
        INNER JOIN dbo.Employees e ON p.EmployeeId = e.Id
        INNER JOIN dbo.PayrollRuns pr ON p.PayrollRunId = pr.Id
        INNER JOIN dbo.PayrollPeriods pp ON pr.PayrollPeriodId = pp.Id
        WHERE p.Id = @Id AND p.TenantId = @TenantId AND p.IsDeleted = 0
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Payslip not found' } });
      return;
    }

    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    console.error('Error getting payslip:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve payslip' } });
  }
});

router.get('/payslips/:id/line-items', requirePermission('payroll:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const payslipId = req.params.id as string;

    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('PayslipId', sql.UniqueIdentifier, payslipId)
      .query(`
        SELECT Id, ItemType, Code, Description, Amount
        FROM dbo.PayslipLineItems
        WHERE PayslipId = @PayslipId AND TenantId = @TenantId
        ORDER BY ItemType, Code
      `);

    const earnings = result.recordset.filter((r: any) => r.ItemType === 'Earning');
    const deductions = result.recordset.filter((r: any) => r.ItemType === 'Deduction');

    res.json({ success: true, data: { earnings, deductions } });
  } catch (error) {
    console.error('Error getting payslip line items:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve payslip line items' } });
  }
});

// Valid loan types per spec Section 3.5
const VALID_LOAN_TYPES = [
  'SSS', 'PagIbig',
  'GSIS_Conso', 'GSIS_Policy', 'GSIS_Enhanced', 'GSIS_Emergency',
  'CompanyLoan', 'Other',
];

router.post('/loans', requirePermission('payroll:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { employeeId, loanType, principalAmount, monthlyAmortization, startDate, endDate } = req.body;

    if (!employeeId || !loanType || !principalAmount || !monthlyAmortization || !startDate) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing required fields' } });
      return;
    }

    // Validate loan type against spec enum
    if (!VALID_LOAN_TYPES.includes(loanType)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `Invalid loan type '${loanType}'. Valid types: ${VALID_LOAN_TYPES.join(', ')}`
        }
      });
      return;
    }

    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, employeeId)
      .input('LoanType', sql.NVarChar, loanType)
      .input('PrincipalAmount', sql.Decimal(18, 4), principalAmount)
      .input('MonthlyAmortization', sql.Decimal(18, 4), monthlyAmortization)
      .input('RemainingBalance', sql.Decimal(18, 4), principalAmount)
      .input('StartDate', sql.Date, new Date(startDate))
      .input('EndDate', sql.Date, endDate ? new Date(endDate) : null)
      .input('CreatedBy', sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO dbo.EmployeeLoans (TenantId, EmployeeId, LoanType, PrincipalAmount, MonthlyAmortization, RemainingBalance, StartDate, EndDate, CreatedBy)
        OUTPUT INSERTED.Id
        VALUES (@TenantId, @EmployeeId, @LoanType, @PrincipalAmount, @MonthlyAmortization, @RemainingBalance, @StartDate, @EndDate, @CreatedBy);
      `);

    res.status(201).json({ success: true, data: { id: result.recordset[0].Id, message: 'Loan created' } });
  } catch (error) {
    console.error('Error creating loan:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to create loan' } });
  }
});

router.get('/loans', requirePermission('payroll:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { employeeId } = req.query;
    const pagination = parsePaginationQuery(req.query);

    let whereClause = 'WHERE el.TenantId = @TenantId AND el.IsDeleted = 0';
    const request = pool.request().input('TenantId', sql.UniqueIdentifier, tenantId);

    if (employeeId) {
      whereClause += ' AND el.EmployeeId = @EmployeeId';
      request.input('EmployeeId', sql.UniqueIdentifier, employeeId);
    }

    const countResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`SELECT COUNT(*) AS total FROM dbo.EmployeeLoans el ${whereClause}`);
    const total = countResult.recordset[0]?.total || 0;

    const selectQuery = `SELECT el.Id, el.LoanType, el.PrincipalAmount, el.MonthlyAmortization, el.RemainingBalance, el.StartDate, el.EndDate, el.CreatedAtUtc,
      e.EmployeeNo, e.FirstName, e.LastName
      FROM dbo.EmployeeLoans el
      INNER JOIN dbo.Employees e ON el.EmployeeId = e.Id`;
    const fullQuery = addPaginationToQuery(selectQuery, whereClause, 'ORDER BY el.StartDate DESC', pagination);
    const result = await request.query(fullQuery);

    res.json({
      success: true,
      data: { loans: result.recordset, pagination: buildPaginationMeta(pagination.page, pagination.pageSize, total) }
    });
  } catch (error) {
    console.error('Error getting loans:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve loans' } });
  }
});

// ─── PERA Enrollments ──────────────────────────────────────────────

router.get('/pera/enrollments', requirePermission('payroll:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { employeeId } = req.query;
    const pagination = parsePaginationQuery(req.query);

    let whereClause = 'WHERE pe.TenantId = @TenantId AND pe.IsDeleted = 0';
    const request = pool.request().input('TenantId', sql.UniqueIdentifier, tenantId);

    if (employeeId) {
      whereClause += ' AND pe.EmployeeId = @EmployeeId';
      request.input('EmployeeId', sql.UniqueIdentifier, employeeId);
    }

    const countResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`SELECT COUNT(*) AS total FROM dbo.EmployeePeraEnrollment pe ${whereClause}`);
    const total = countResult.recordset[0]?.total || 0;

    const selectQuery = `SELECT pe.Id, pe.EmployeeId, pe.IsEnrolled, pe.EnrolledDate, pe.ContributionType,
      pe.EmployeeContributionAmount, pe.EmployerMatchType, pe.EmployerMatchValue, pe.EmployerMatchMaxCap,
      pe.PERAAdministratorId, pe.PERAAccountNo, pe.UpdatedAtUtc,
      e.EmployeeNo, e.FirstName, e.LastName
      FROM dbo.EmployeePeraEnrollment pe
      INNER JOIN dbo.Employees e ON pe.EmployeeId = e.Id`;
    const fullQuery = addPaginationToQuery(selectQuery, whereClause, 'ORDER BY e.LastName, e.FirstName', pagination);
    const result = await request.query(fullQuery);

    res.json({
      success: true,
      data: { enrollments: result.recordset, pagination: buildPaginationMeta(pagination.page, pagination.pageSize, total) }
    });
  } catch (error) {
    console.error('Error getting PERA enrollments:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve PERA enrollments' } });
  }
});

router.post('/pera/enroll', requirePermission('payroll:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { employeeId, contributionType, employeeContributionAmount, employerMatchType, employerMatchValue, employerMatchMaxCap, peraAdministratorId, peraAccountNo } = req.body;

    if (!employeeId) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'employeeId is required' } });
      return;
    }

    const existing = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, employeeId)
      .query(`SELECT Id FROM dbo.EmployeePeraEnrollment WHERE TenantId = @TenantId AND EmployeeId = @EmployeeId AND IsDeleted = 0`);

    let enrollmentId: string;

    if (existing.recordset.length > 0) {
      await pool.request()
        .input('Id', sql.UniqueIdentifier, existing.recordset[0].Id)
        .input('IsEnrolled', sql.Bit, true)
        .input('EnrolledDate', sql.Date, new Date())
        .input('ContributionType', sql.NVarChar, contributionType || 'Fixed')
        .input('EmployeeContributionAmount', sql.Decimal(18, 4), employeeContributionAmount || 0)
        .input('EmployerMatchType', sql.NVarChar, employerMatchType || null)
        .input('EmployerMatchValue', sql.Decimal(18, 4), employerMatchValue || null)
        .input('EmployerMatchMaxCap', sql.Decimal(18, 4), employerMatchMaxCap || null)
        .input('PERAAdministratorId', sql.NVarChar, peraAdministratorId || null)
        .input('PERAAccountNo', sql.NVarChar, peraAccountNo || null)
        .input('UpdatedBy', sql.UniqueIdentifier, userId)
        .query(`
          UPDATE dbo.EmployeePeraEnrollment SET
            IsEnrolled = @IsEnrolled, EnrolledDate = @EnrolledDate,
            ContributionType = @ContributionType, EmployeeContributionAmount = @EmployeeContributionAmount,
            EmployerMatchType = @EmployerMatchType, EmployerMatchValue = @EmployerMatchValue,
            EmployerMatchMaxCap = @EmployerMatchMaxCap,
            PERAAdministratorId = @PERAAdministratorId, PERAAccountNo = @PERAAccountNo,
            UpdatedBy = @UpdatedBy, UpdatedAtUtc = GETUTCDATE()
          WHERE Id = @Id
        `);
      enrollmentId = existing.recordset[0].Id;
    } else {
      const result = await pool.request()
        .input('TenantId', sql.UniqueIdentifier, tenantId)
        .input('EmployeeId', sql.UniqueIdentifier, employeeId)
        .input('IsEnrolled', sql.Bit, true)
        .input('EnrolledDate', sql.Date, new Date())
        .input('ContributionType', sql.NVarChar, contributionType || 'Fixed')
        .input('EmployeeContributionAmount', sql.Decimal(18, 4), employeeContributionAmount || 0)
        .input('EmployerMatchType', sql.NVarChar, employerMatchType || null)
        .input('EmployerMatchValue', sql.Decimal(18, 4), employerMatchValue || null)
        .input('EmployerMatchMaxCap', sql.Decimal(18, 4), employerMatchMaxCap || null)
        .input('PERAAdministratorId', sql.NVarChar, peraAdministratorId || null)
        .input('PERAAccountNo', sql.NVarChar, peraAccountNo || null)
        .input('CreatedBy', sql.UniqueIdentifier, userId)
        .query(`
          INSERT INTO dbo.EmployeePeraEnrollment (
            TenantId, EmployeeId, IsEnrolled, EnrolledDate, ContributionType, EmployeeContributionAmount,
            EmployerMatchType, EmployerMatchValue, EmployerMatchMaxCap, PERAAdministratorId, PERAAccountNo, CreatedBy
          ) OUTPUT INSERTED.Id
          VALUES (
            @TenantId, @EmployeeId, @IsEnrolled, @EnrolledDate, @ContributionType, @EmployeeContributionAmount,
            @EmployerMatchType, @EmployerMatchValue, @EmployerMatchMaxCap, @PERAAdministratorId, @PERAAccountNo, @CreatedBy
          );
        `);
      enrollmentId = result.recordset[0].Id;
    }

    res.status(201).json({ success: true, data: { id: enrollmentId, message: 'PERA enrollment saved' } });
  } catch (error) {
    console.error('Error enrolling PERA:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to enroll PERA' } });
  }
});

router.put('/pera/enrollments/:id', requirePermission('payroll:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const enrollmentId = req.params.id as string;
    const { contributionType, employeeContributionAmount, employerMatchType, employerMatchValue, employerMatchMaxCap, isEnrolled, peraAdministratorId, peraAccountNo } = req.body;

    const existing = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, enrollmentId)
      .query(`SELECT Id FROM dbo.EmployeePeraEnrollment WHERE Id = @Id AND TenantId = @TenantId AND IsDeleted = 0`);

    if (existing.recordset.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'PERA enrollment not found' } });
      return;
    }

    await pool.request()
      .input('Id', sql.UniqueIdentifier, enrollmentId)
      .input('IsEnrolled', sql.Bit, isEnrolled !== undefined ? isEnrolled : true)
      .input('ContributionType', sql.NVarChar, contributionType || 'Fixed')
      .input('EmployeeContributionAmount', sql.Decimal(18, 4), employeeContributionAmount !== undefined ? employeeContributionAmount : 0)
      .input('EmployerMatchType', sql.NVarChar, employerMatchType || null)
      .input('EmployerMatchValue', sql.Decimal(18, 4), employerMatchValue || null)
      .input('EmployerMatchMaxCap', sql.Decimal(18, 4), employerMatchMaxCap || null)
      .input('PERAAdministratorId', sql.NVarChar, peraAdministratorId || null)
      .input('PERAAccountNo', sql.NVarChar, peraAccountNo || null)
      .input('UpdatedBy', sql.UniqueIdentifier, userId)
      .query(`
        UPDATE dbo.EmployeePeraEnrollment SET
          IsEnrolled = @IsEnrolled, ContributionType = @ContributionType,
          EmployeeContributionAmount = @EmployeeContributionAmount,
          EmployerMatchType = @EmployerMatchType, EmployerMatchValue = @EmployerMatchValue,
          EmployerMatchMaxCap = @EmployerMatchMaxCap,
          PERAAdministratorId = @PERAAdministratorId, PERAAccountNo = @PERAAccountNo,
          UpdatedBy = @UpdatedBy, UpdatedAtUtc = GETUTCDATE()
        WHERE Id = @Id AND TenantId = @TenantId
      `);

    res.json({ success: true, data: { message: 'PERA enrollment updated' } });
  } catch (error) {
    console.error('Error updating PERA enrollment:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to update PERA enrollment' } });
  }
});

router.delete('/pera/enrollments/:id', requirePermission('payroll:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const enrollmentId = req.params.id as string;

    const existing = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, enrollmentId)
      .query(`SELECT Id FROM dbo.EmployeePeraEnrollment WHERE Id = @Id AND TenantId = @TenantId AND IsDeleted = 0`);

    if (existing.recordset.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'PERA enrollment not found' } });
      return;
    }

    await pool.request()
      .input('Id', sql.UniqueIdentifier, enrollmentId)
      .input('UpdatedBy', sql.UniqueIdentifier, userId)
      .query(`UPDATE dbo.EmployeePeraEnrollment SET IsEnrolled = 0, UpdatedBy = @UpdatedBy, UpdatedAtUtc = GETUTCDATE() WHERE Id = @Id`);

    res.json({ success: true, data: { message: 'Employee unenrolled from PERA' } });
  } catch (error) {
    console.error('Error deleting PERA enrollment:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to delete PERA enrollment' } });
  }
});

// ─── PERA Contributions ────────────────────────────────────────────

router.get('/pera/contributions', requirePermission('payroll:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { employeeId, year } = req.query;
    const pagination = parsePaginationQuery(req.query);
    const targetYear = year || new Date().getFullYear();

    let whereClause = 'WHERE pc.TenantId = @TenantId AND pc.IsDeleted = 0 AND pc.ContributionYear = @Year';
    const request = pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Year', sql.Int, parseInt(targetYear as string));

    if (employeeId) {
      whereClause += ' AND pc.EmployeeId = @EmployeeId';
      request.input('EmployeeId', sql.UniqueIdentifier, employeeId);
    }

    const countResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Year', sql.Int, parseInt(targetYear as string))
      .query(`SELECT COUNT(*) AS total FROM dbo.EmployeePeraContributions pc ${whereClause}`);
    const total = countResult.recordset[0]?.total || 0;

    const selectQuery = `SELECT pc.Id, pc.EmployeeId, pc.ContributionDate, pc.EmployeeContribution, pc.EmployerContribution,
      pc.ContributionYear, pc.ContributionMonth,
      e.EmployeeNo, e.FirstName, e.LastName
      FROM dbo.EmployeePeraContributions pc
      INNER JOIN dbo.Employees e ON pc.EmployeeId = e.Id`;
    const fullQuery = addPaginationToQuery(selectQuery, whereClause, 'ORDER BY pc.ContributionDate DESC', pagination);
    const result = await request.query(fullQuery);

    res.json({
      success: true,
      data: { contributions: result.recordset, pagination: buildPaginationMeta(pagination.page, pagination.pageSize, total) }
    });
  } catch (error) {
    console.error('Error getting PERA contributions:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve PERA contributions' } });
  }
});

router.get('/pera/contributions/:employeeId/summary', requirePermission('payroll:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const employeeId = req.params.employeeId as string;
    const { year } = req.query;
    const targetYear = year || new Date().getFullYear();

    const ytdResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, employeeId)
      .input('Year', sql.Int, parseInt(targetYear as string))
      .query(`
        SELECT
          ISNULL(SUM(EmployeeContribution), 0) AS YtdEmployeeShare,
          ISNULL(SUM(EmployerContribution), 0) AS YtdEmployerShare,
          COUNT(*) AS ContributionCount
        FROM dbo.EmployeePeraContributions
        WHERE TenantId = @TenantId AND EmployeeId = @EmployeeId
          AND ContributionYear = @Year AND IsDeleted = 0
      `);

    const limitsResult = await pool.request()
      .input('Year', sql.Int, parseInt(targetYear as string))
      .query(`
        SELECT Description, FixedAmount FROM dbo.GovContributionTables
        WHERE TableType = 'PERA' AND EffectiveYear = @Year
      `);

    const localCap = limitsResult.recordset.find((l: any) => l.Description?.includes('Local'));
    const ofwCap = limitsResult.recordset.find((l: any) => l.Description?.includes('OFW'));

    res.json({
      success: true,
      data: {
        employeeId,
        year: targetYear,
        ytdEmployeeShare: ytdResult.recordset[0]?.YtdEmployeeShare || 0,
        ytdEmployerShare: ytdResult.recordset[0]?.YtdEmployerShare || 0,
        contributionCount: ytdResult.recordset[0]?.ContributionCount || 0,
        annualLimitLocal: localCap?.FixedAmount || 200000,
        annualLimitOfw: ofwCap?.FixedAmount || 400000,
        remainingLimitLocal: (localCap?.FixedAmount || 200000) - (ytdResult.recordset[0]?.YtdEmployeeShare || 0),
      }
    });
  } catch (error) {
    console.error('Error getting PERA summary:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve PERA summary' } });
  }
});

router.put('/loans/:id', requirePermission('payroll:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const loanId = req.params.id as string;
    const { remainingBalance, monthlyAmortization } = req.body;

    const existing = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, loanId)
      .query(`SELECT RemainingBalance FROM dbo.EmployeeLoans WHERE Id = @Id AND TenantId = @TenantId AND IsDeleted = 0`);

    if (existing.recordset.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Loan not found' } });
      return;
    }

    const updateFields: string[] = [];
    const request = pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, loanId)
      .input('UpdatedBy', sql.UniqueIdentifier, userId);

    if (remainingBalance !== undefined) {
      updateFields.push('RemainingBalance = @RemainingBalance');
      request.input('RemainingBalance', sql.Decimal(18, 4), remainingBalance);
    }
    if (monthlyAmortization !== undefined) {
      updateFields.push('MonthlyAmortization = @MonthlyAmortization');
      request.input('MonthlyAmortization', sql.Decimal(18, 4), monthlyAmortization);
    }

    if (updateFields.length > 0) {
      updateFields.push('UpdatedBy = @UpdatedBy', 'UpdatedAtUtc = GETUTCDATE()');
      await request.query(`UPDATE dbo.EmployeeLoans SET ${updateFields.join(', ')} WHERE Id = @Id AND TenantId = @TenantId AND IsDeleted = 0`);
    }

    res.json({ success: true, data: { message: 'Loan updated' } });
  } catch (error) {
    console.error('Error updating loan:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to update loan' } });
  }
});

router.post('/thirteenth-month/compute', requirePermission('payroll:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { year } = req.body;
    const targetYear = year || new Date().getFullYear();

    const employeesResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`SELECT Id FROM dbo.Employees WHERE TenantId = @TenantId AND IsActive = 1 AND IsDeleted = 0`);

    let computed = 0;
    for (const emp of employeesResult.recordset) {
      const salaryResult = await pool.request()
        .input('TenantId', sql.UniqueIdentifier, tenantId)
        .input('EmployeeId', sql.UniqueIdentifier, emp.Id)
        .input('Year', sql.Int, targetYear)
        .query(`
          SELECT ISNULL(SUM(p.BasicPay), 0) AS TotalBasicSalaryEarned
          FROM dbo.Payslips p
          INNER JOIN dbo.PayrollRuns pr ON p.PayrollRunId = pr.Id
          INNER JOIN dbo.PayrollPeriods pp ON pr.PayrollPeriodId = pp.Id
          WHERE p.TenantId = @TenantId AND p.EmployeeId = @EmployeeId
            AND pp.Status IN ('Approved','Paid','Closed')
            AND YEAR(pp.PayDate) = @Year
            AND p.IsDeleted = 0
        `);

      const totalBasicSalaryEarned = salaryResult.recordset[0]?.TotalBasicSalaryEarned || 0;
      const computedAmount = roundTo2(totalBasicSalaryEarned / 12);

      await pool.request()
        .input('TenantId', sql.UniqueIdentifier, tenantId)
        .input('EmployeeId', sql.UniqueIdentifier, emp.Id)
        .input('Year', sql.Int, targetYear)
        .input('TotalBasicSalaryEarned', sql.Decimal(18, 4), totalBasicSalaryEarned)
        .input('ComputedAmount', sql.Decimal(18, 4), computedAmount)
        .input('CreatedBy', sql.UniqueIdentifier, userId)
        .query(`
          MERGE dbo.ThirteenthMonthPay AS target
          USING (SELECT @TenantId AS TenantId, @EmployeeId AS EmployeeId, @Year AS Year) AS source
          ON target.TenantId = source.TenantId AND target.EmployeeId = source.EmployeeId AND target.Year = source.Year
          WHEN MATCHED THEN
            UPDATE SET TotalBasicSalaryEarned = @TotalBasicSalaryEarned, ComputedAmount = @ComputedAmount, UpdatedAtUtc = GETUTCDATE()
          WHEN NOT MATCHED THEN
            INSERT (TenantId, EmployeeId, Year, TotalBasicSalaryEarned, ComputedAmount, CreatedBy)
            VALUES (@TenantId, @EmployeeId, @Year, @TotalBasicSalaryEarned, @ComputedAmount, @CreatedBy);
        `);
      computed++;
    }

    res.json({ success: true, data: { computed, year: targetYear, message: `13th month computed for ${computed} employees` } });
  } catch (error) {
    console.error('Error computing 13th month:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to compute 13th month pay' } });
  }
});

router.get('/thirteenth-month', requirePermission('payroll:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { year } = req.query;
    const pagination = parsePaginationQuery(req.query);
    const targetYear = year || new Date().getFullYear();

    const countResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Year', sql.Int, targetYear)
      .query(`SELECT COUNT(*) AS total FROM dbo.ThirteenthMonthPay WHERE TenantId = @TenantId AND Year = @Year AND IsDeleted = 0`);
    const total = countResult.recordset[0]?.total || 0;

    const selectQuery = `SELECT tmp.Id, tmp.Year, tmp.TotalBasicSalaryEarned, tmp.ComputedAmount, tmp.PaidDate, tmp.PayoutStatus,
      e.EmployeeNo, e.FirstName, e.LastName
      FROM dbo.ThirteenthMonthPay tmp
      INNER JOIN dbo.Employees e ON tmp.EmployeeId = e.Id`;
    const whereClause = 'WHERE tmp.TenantId = @TenantId AND tmp.Year = @Year AND tmp.IsDeleted = 0';
    const fullQuery = addPaginationToQuery(selectQuery, whereClause, 'ORDER BY e.LastName, e.FirstName', pagination);
    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Year', sql.Int, targetYear)
      .query(fullQuery);

    res.json({
      success: true,
      data: { records: result.recordset, pagination: buildPaginationMeta(pagination.page, pagination.pageSize, total) }
    });
  } catch (error) {
    console.error('Error getting 13th month:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve 13th month records' } });
  }
});

router.post('/government-reports/generate', requirePermission('payroll:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { reportType, periodCovered, payrollPeriodId } = req.body;

    if (!reportType || !periodCovered) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'reportType and periodCovered are required' } });
      return;
    }

    const validTypes = ['SSS_R3', 'SSS_R5', 'PhilHealth_RF1', 'PagIbig_M1A', 'PagIbig_M2', 'BIR_Alphalist', 'BIR_1601C', 'GSIS_Premium', 'GSIS_Loans', 'PERA_Summary'];
    if (!validTypes.includes(reportType)) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: `Invalid report type. Valid: ${validTypes.join(', ')}` } });
      return;
    }

    const { reportId, fileUrl } = await generateGovernmentReport(pool, tenantId!, reportType, periodCovered, payrollPeriodId);

    await logAuditEvent(pool, {
      tenantId: tenantId!, userId, action: 'GENERATE_REPORT', entityName: 'GovernmentReportExport',
      entityId: reportId, afterJson: { reportType, periodCovered }, ipAddress: extractIp(req)
    });

    res.json({ success: true, data: { reportId, reportType, periodCovered, fileUrl, message: 'Report generated' } });
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to generate report' } });
  }
});

router.get('/government-reports', requirePermission('payroll:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { reportType } = req.query;
    const pagination = parsePaginationQuery(req.query);

    let whereClause = 'WHERE TenantId = @TenantId AND IsDeleted = 0';
    const request = pool.request().input('TenantId', sql.UniqueIdentifier, tenantId);

    if (reportType) {
      whereClause += ' AND ReportType = @ReportType';
      request.input('ReportType', sql.NVarChar, reportType);
    }

    const countResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`SELECT COUNT(*) AS total FROM dbo.GovernmentReportExports ${whereClause}`);
    const total = countResult.recordset[0]?.total || 0;

    const selectQuery = `SELECT Id, ReportType, PeriodCovered, FileUrl, GeneratedAtUtc FROM dbo.GovernmentReportExports`;
    const fullQuery = addPaginationToQuery(selectQuery, whereClause, 'ORDER BY GeneratedAtUtc DESC', pagination);
    const result = await request.query(fullQuery);

    res.json({
      success: true,
      data: { reports: result.recordset, pagination: buildPaginationMeta(pagination.page, pagination.pageSize, total) }
    });
  } catch (error) {
    console.error('Error getting reports:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve reports' } });
  }
});

router.get('/government-reports/:id/download', requirePermission('payroll:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const reportId = req.params.id as string;

    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, reportId)
      .query(`SELECT ReportType, FileUrl FROM dbo.GovernmentReportExports WHERE Id = @Id AND TenantId = @TenantId AND IsDeleted = 0`);

    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Report not found' } });
      return;
    }

    const report = result.recordset[0];
    res.json({
      success: true,
      data: { reportId, reportType: report.ReportType, fileUrl: report.FileUrl, message: 'Download URL generated (placeholder - implement file storage)' }
    });
  } catch (error) {
    console.error('Error downloading report:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to download report' } });
  }
});

// ─── PDF Generation Endpoints ──────────────────────────────────────

router.get('/payslips/:id/pdf', requirePermission('payroll:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const payslipId = req.params.id as string;
    const { generatePayslipPdf } = await import('../../services/pdf');
    const pdfBuffer = await generatePayslipPdf(pool, tenantId!, payslipId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="payslip-${payslipId}.pdf"`);
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error('Error generating payslip PDF:', error);
    res.status(500).json({ success: false, error: { code: 'PDF_ERROR', message: error.message || 'Failed to generate payslip PDF' } });
  }
});

router.get('/summary/:runId/pdf', requirePermission('payroll:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const runId = req.params.runId as string;
    const { generatePayrollSummaryPdf } = await import('../../services/pdf');
    const pdfBuffer = await generatePayrollSummaryPdf(pool, tenantId!, runId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="payroll-summary-${runId}.pdf"`);
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error('Error generating payroll summary PDF:', error);
    res.status(500).json({ success: false, error: { code: 'PDF_ERROR', message: error.message || 'Failed to generate payroll summary PDF' } });
  }
});

router.get('/thirteenth-month/:year/pdf', requirePermission('payroll:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const year = parseInt(req.params.year as string, 10);
    const { generateThirteenthMonthPdf } = await import('../../services/pdf');
    const pdfBuffer = await generateThirteenthMonthPdf(pool, tenantId!, year);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="13th-month-${year}.pdf"`);
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error('Error generating 13th month PDF:', error);
    res.status(500).json({ success: false, error: { code: 'PDF_ERROR', message: error.message || 'Failed to generate 13th month PDF' } });
  }
});

router.get('/government-reports/:reportType/pdf', requirePermission('payroll:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const reportType = req.params.reportType as string;
    const { periodCovered } = req.query;
    if (!periodCovered) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'periodCovered query param is required' } });
      return;
    }
    const { generateGovernmentReportPdf } = await import('../../services/pdf');
    const pdfBuffer = await generateGovernmentReportPdf(pool, tenantId!, reportType, periodCovered as string);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${reportType}-${(periodCovered as string).replace(/[^a-zA-Z0-9]/g, '-')}.pdf"`);
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error('Error generating government report PDF:', error);
    res.status(500).json({ success: false, error: { code: 'PDF_ERROR', message: error.message || 'Failed to generate government report PDF' } });
  }
});

export default router;
