import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../../middleware/auth';
import { setTenantContext } from '../../middleware/tenantContext';
import { requirePermission } from '../../middleware/permissions';
import { parsePaginationQuery, buildPaginationMeta, addPaginationToQuery } from '../../middleware/pagination';
import { logAuditEvent, extractIp } from '../../middleware/auditLog';
import { runLeaveAccrual } from '../../services/leaveAccrual';
import { sendLeaveNotification } from '../../services/pushNotification';
import sql from 'mssql';

const router = Router();

router.use(authMiddleware);
router.use(setTenantContext);

// ──────────────────────────────────────────────────────────────
// LEAVE TYPES CRUD
// ──────────────────────────────────────────────────────────────

// GET /api/v1/leave/types - List leave types
router.get('/types', requirePermission('leave:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;

    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        SELECT Id, Code, Name, IsPaid, AccrualRatePerMonth, MaxCarryOverDays,
               IsMonetizable, RequiresDocumentation, LegalBasis
        FROM dbo.LeaveTypes
        WHERE TenantId = @TenantId AND IsDeleted = 0
        ORDER BY Code
      `);

    res.json({
      success: true,
      data: { leaveTypes: result.recordset }
    });
  } catch (error) {
    console.error('Error getting leave types:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve leave types' }
    });
  }
});

// POST /api/v1/leave/types - Create leave type
router.post('/types', requirePermission('leave:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { code, name, isPaid, accrualRatePerMonth, maxCarryOverDays, isMonetizable, requiresDocumentation, legalBasis } = req.body;

    if (!code || !name) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Code and Name are required' }
      });
      return;
    }

    // Check duplicate code
    const dupCheck = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Code', sql.NVarChar, code)
      .query('SELECT Id FROM dbo.LeaveTypes WHERE TenantId = @TenantId AND Code = @Code AND IsDeleted = 0');

    if (dupCheck.recordset.length > 0) {
      res.status(409).json({
        success: false,
        error: { code: 'DUPLICATE', message: 'Leave type code already exists' }
      });
      return;
    }

    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Code', sql.NVarChar, code)
      .input('Name', sql.NVarChar, name)
      .input('IsPaid', sql.Bit, isPaid !== undefined ? isPaid : true)
      .input('AccrualRatePerMonth', sql.Decimal(5, 2), accrualRatePerMonth || 0)
      .input('MaxCarryOverDays', sql.Decimal(5, 2), maxCarryOverDays || 0)
      .input('IsMonetizable', sql.Bit, isMonetizable !== undefined ? isMonetizable : false)
      .input('RequiresDocumentation', sql.Bit, requiresDocumentation !== undefined ? requiresDocumentation : false)
      .input('LegalBasis', sql.NVarChar, legalBasis || null)
      .input('CreatedBy', sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO dbo.LeaveTypes (TenantId, Code, Name, IsPaid, AccrualRatePerMonth, MaxCarryOverDays, IsMonetizable, RequiresDocumentation, LegalBasis, CreatedBy)
        OUTPUT INSERTED.Id
        VALUES (@TenantId, @Code, @Name, @IsPaid, @AccrualRatePerMonth, @MaxCarryOverDays, @IsMonetizable, @RequiresDocumentation, @LegalBasis, @CreatedBy);
      `);

    const newId = result.recordset[0].Id;

    await logAuditEvent(pool, {
      tenantId: tenantId!, userId, action: 'CREATE', entityName: 'LeaveType', entityId: newId,
      afterJson: { code, name, isPaid, accrualRatePerMonth, maxCarryOverDays },
      ipAddress: extractIp(req)
    });

    res.status(201).json({
      success: true,
      data: { id: newId, message: 'Leave type created successfully' }
    });
  } catch (error) {
    console.error('Error creating leave type:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to create leave type' }
    });
  }
});

// PUT /api/v1/leave/types/:id - Update leave type
router.put('/types/:id', requirePermission('leave:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { id } = req.params;
    const { code, name, isPaid, accrualRatePerMonth, maxCarryOverDays, isMonetizable, requiresDocumentation, legalBasis } = req.body;

    const existing = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, id)
      .query('SELECT Id FROM dbo.LeaveTypes WHERE Id = @Id AND TenantId = @TenantId AND IsDeleted = 0');

    if (existing.recordset.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Leave type not found' }
      });
      return;
    }

    await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, id)
      .input('Code', sql.NVarChar, code)
      .input('Name', sql.NVarChar, name)
      .input('IsPaid', sql.Bit, isPaid)
      .input('AccrualRatePerMonth', sql.Decimal(5, 2), accrualRatePerMonth || 0)
      .input('MaxCarryOverDays', sql.Decimal(5, 2), maxCarryOverDays || 0)
      .input('IsMonetizable', sql.Bit, isMonetizable !== undefined ? isMonetizable : false)
      .input('RequiresDocumentation', sql.Bit, requiresDocumentation !== undefined ? requiresDocumentation : false)
      .input('LegalBasis', sql.NVarChar, legalBasis || null)
      .input('UpdatedBy', sql.UniqueIdentifier, userId)
      .query(`
        UPDATE dbo.LeaveTypes SET
          Code = @Code, Name = @Name, IsPaid = @IsPaid,
          AccrualRatePerMonth = @AccrualRatePerMonth, MaxCarryOverDays = @MaxCarryOverDays,
          IsMonetizable = @IsMonetizable, RequiresDocumentation = @RequiresDocumentation,
          LegalBasis = @LegalBasis, UpdatedAtUtc = GETUTCDATE(), UpdatedBy = @UpdatedBy
        WHERE Id = @Id AND TenantId = @TenantId
      `);

    await logAuditEvent(pool, {
      tenantId: tenantId!, userId, action: 'UPDATE', entityName: 'LeaveType', entityId: id as string,
      afterJson: { code, name, isPaid, accrualRatePerMonth, maxCarryOverDays },
      ipAddress: extractIp(req)
    });

    res.json({
      success: true,
      data: { message: 'Leave type updated successfully' }
    });
  } catch (error) {
    console.error('Error updating leave type:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to update leave type' }
    });
  }
});

// DELETE /api/v1/leave/types/:id - Soft delete leave type
router.delete('/types/:id', requirePermission('leave:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { id } = req.params;

    // Check if leave type has any credits or requests
    const usageCheck = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('LeaveTypeId', sql.UniqueIdentifier, id)
      .query(`
        SELECT
          (SELECT COUNT(*) FROM dbo.LeaveCredits WHERE LeaveTypeId = @LeaveTypeId AND TenantId = @TenantId AND IsDeleted = 0) AS CreditCount,
          (SELECT COUNT(*) FROM dbo.LeaveRequests WHERE LeaveTypeId = @LeaveTypeId AND TenantId = @TenantId AND IsDeleted = 0) AS RequestCount
      `);

    const usage = usageCheck.recordset[0];
    if (usage.CreditCount > 0 || usage.RequestCount > 0) {
      res.status(409).json({
        success: false,
        error: { code: 'IN_USE', message: 'Cannot delete leave type with existing credits or requests' }
      });
      return;
    }

    await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, id)
      .input('UpdatedBy', sql.UniqueIdentifier, userId)
      .query(`
        UPDATE dbo.LeaveTypes SET IsDeleted = 1, UpdatedAtUtc = GETUTCDATE(), UpdatedBy = @UpdatedBy
        WHERE Id = @Id AND TenantId = @TenantId
      `);

    await logAuditEvent(pool, {
      tenantId: tenantId!, userId, action: 'DELETE', entityName: 'LeaveType', entityId: id as string,
      ipAddress: extractIp(req)
    });

    res.json({
      success: true,
      data: { message: 'Leave type deleted successfully' }
    });
  } catch (error) {
    console.error('Error deleting leave type:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to delete leave type' }
    });
  }
});

// ──────────────────────────────────────────────────────────────
// LEAVE APPROVAL CHAIN CONFIG
// ──────────────────────────────────────────────────────────────

// GET /api/v1/leave/approval-chains - List approval chains
router.get('/approval-chains', requirePermission('leave:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { departmentId } = req.query;

    let whereClause = 'WHERE lac.TenantId = @TenantId AND lac.IsDeleted = 0';
    const request = pool.request().input('TenantId', sql.UniqueIdentifier, tenantId);

    if (departmentId) {
      whereClause += ' AND lac.DepartmentId = @DepartmentId';
      request.input('DepartmentId', sql.UniqueIdentifier, departmentId);
    }

    const result = await request.query(`
      SELECT lac.Id, lac.DepartmentId, lac.LeaveTypeId, lac.SequenceNo, lac.ApproverId, lac.IsActive,
             d.Name AS DepartmentName, lt.Name AS LeaveTypeName,
             e.FirstName + ' ' + e.LastName AS ApproverName
      FROM dbo.LeaveApprovalChains lac
      LEFT JOIN dbo.Departments d ON lac.DepartmentId = d.Id
      LEFT JOIN dbo.LeaveTypes lt ON lac.LeaveTypeId = lt.Id
      INNER JOIN dbo.Employees e ON lac.ApproverId = e.Id
      ${whereClause}
      ORDER BY lac.DepartmentId, lac.LeaveTypeId, lac.SequenceNo
    `);

    res.json({
      success: true,
      data: { approvalChains: result.recordset }
    });
  } catch (error) {
    console.error('Error listing approval chains:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve approval chains' }
    });
  }
});

// POST /api/v1/leave/approval-chains - Create approval chain step
router.post('/approval-chains', requirePermission('leave:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { departmentId, leaveTypeId, sequenceNo, approverId } = req.body;

    if (!sequenceNo || !approverId) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'SequenceNo and ApproverId are required' }
      });
      return;
    }

    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('DepartmentId', sql.UniqueIdentifier, departmentId || null)
      .input('LeaveTypeId', sql.UniqueIdentifier, leaveTypeId || null)
      .input('SequenceNo', sql.Int, sequenceNo)
      .input('ApproverId', sql.UniqueIdentifier, approverId)
      .input('CreatedBy', sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO dbo.LeaveApprovalChains (TenantId, DepartmentId, LeaveTypeId, SequenceNo, ApproverId, CreatedBy)
        OUTPUT INSERTED.Id
        VALUES (@TenantId, @DepartmentId, @LeaveTypeId, @SequenceNo, @ApproverId, @CreatedBy);
      `);

    const newId = result.recordset[0].Id;

    res.status(201).json({
      success: true,
      data: { id: newId, message: 'Approval chain step created' }
    });
  } catch (error) {
    console.error('Error creating approval chain:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to create approval chain' }
    });
  }
});

// DELETE /api/v1/leave/approval-chains/:id - Delete approval chain step
router.delete('/approval-chains/:id', requirePermission('leave:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { id } = req.params;

    await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, id)
      .input('UpdatedBy', sql.UniqueIdentifier, userId)
      .query(`
        UPDATE dbo.LeaveApprovalChains SET IsDeleted = 1, UpdatedAtUtc = GETUTCDATE(), UpdatedBy = @UpdatedBy
        WHERE Id = @Id AND TenantId = @TenantId
      `);

    res.json({
      success: true,
      data: { message: 'Approval chain step deleted' }
    });
  } catch (error) {
    console.error('Error deleting approval chain:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to delete approval chain' }
    });
  }
});

// ──────────────────────────────────────────────────────────────
// LEAVE CREDITS
// ──────────────────────────────────────────────────────────────

// GET /api/v1/leave/credits - Get leave credits
router.get('/credits', requirePermission('leave:read:self'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { employeeId, year } = req.query;
    const pagination = parsePaginationQuery(req.query);

    let targetEmployeeId = employeeId;
    if (!targetEmployeeId) {
      const employeeResult = await pool.request()
        .input('TenantId', sql.UniqueIdentifier, tenantId)
        .input('UserId', sql.UniqueIdentifier, userId)
        .query(`
          SELECT e.Id FROM dbo.EmployeeUserLink eul
          INNER JOIN dbo.Employees e ON eul.EmployeeId = e.Id
          WHERE eul.UserId = @UserId AND eul.TenantId = @TenantId
        `);
      if (employeeResult.recordset.length > 0) {
        targetEmployeeId = employeeResult.recordset[0].Id;
      }
    }

    const targetYear = year || new Date().getFullYear();
    let whereClause = 'WHERE lc.TenantId = @TenantId AND lc.Year = @Year AND lc.IsDeleted = 0';
    const request = pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Year', sql.Int, Number(targetYear));

    if (targetEmployeeId) {
      whereClause += ' AND lc.EmployeeId = @EmployeeId';
      request.input('EmployeeId', sql.UniqueIdentifier, targetEmployeeId);
    }

    const countResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Year', sql.Int, Number(targetYear))
      .query(`SELECT COUNT(*) AS total FROM dbo.LeaveCredits lc ${whereClause}`);
    const total = countResult.recordset[0]?.total || 0;

    const selectQuery = `SELECT lc.Id, lc.Year, lc.EarnedDays, lc.UsedDays, lc.CarriedOverDays, lc.MonetizedDays, lc.BalanceDays, lt.Code AS LeaveTypeCode, lt.Name AS LeaveTypeName, e.EmployeeNo, e.FirstName, e.LastName FROM dbo.LeaveCredits lc INNER JOIN dbo.LeaveTypes lt ON lc.LeaveTypeId = lt.Id INNER JOIN dbo.Employees e ON lc.EmployeeId = e.Id`;
    const fullQuery = addPaginationToQuery(selectQuery, whereClause, 'ORDER BY lt.Code', pagination);
    const result = await request.query(fullQuery);

    res.json({
      success: true,
      data: {
        leaveCredits: result.recordset,
        pagination: buildPaginationMeta(pagination.page, pagination.pageSize, total)
      }
    });
  } catch (error) {
    console.error('Error getting leave credits:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve leave credits' }
    });
  }
});

// GET /api/v1/leave/ledger - Get leave credit ledger
router.get('/ledger', requirePermission('leave:read:self'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { employeeId, leaveTypeId } = req.query;

    let targetEmployeeId = employeeId;
    if (!targetEmployeeId) {
      const employeeResult = await pool.request()
        .input('TenantId', sql.UniqueIdentifier, tenantId)
        .input('UserId', sql.UniqueIdentifier, userId)
        .query(`
          SELECT e.Id FROM dbo.EmployeeUserLink eul
          INNER JOIN dbo.Employees e ON eul.EmployeeId = e.Id
          WHERE eul.UserId = @UserId AND eul.TenantId = @TenantId
        `);
      if (employeeResult.recordset.length > 0) {
        targetEmployeeId = employeeResult.recordset[0].Id;
      }
    }

    let whereClause = 'WHERE lcl.TenantId = @TenantId';
    const request = pool.request().input('TenantId', sql.UniqueIdentifier, tenantId);

    if (targetEmployeeId) {
      whereClause += ' AND lcl.EmployeeId = @EmployeeId';
      request.input('EmployeeId', sql.UniqueIdentifier, targetEmployeeId);
    }
    if (leaveTypeId) {
      whereClause += ' AND lcl.LeaveTypeId = @LeaveTypeId';
      request.input('LeaveTypeId', sql.UniqueIdentifier, leaveTypeId);
    }

    const result = await request.query(`
      SELECT lcl.Id, lcl.TransactionType, lcl.Days, lcl.ReferenceId, lcl.CreatedAtUtc,
             lt.Code AS LeaveTypeCode, lt.Name AS LeaveTypeName
      FROM dbo.LeaveCreditLedger lcl
      INNER JOIN dbo.LeaveTypes lt ON lcl.LeaveTypeId = lt.Id
      ${whereClause}
      ORDER BY lcl.CreatedAtUtc DESC
    `);

    res.json({
      success: true,
      data: { ledger: result.recordset }
    });
  } catch (error) {
    console.error('Error getting leave ledger:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve leave ledger' }
    });
  }
});

// ──────────────────────────────────────────────────────────────
// LEAVE REQUESTS
// ──────────────────────────────────────────────────────────────

// POST /api/v1/leave/request - Submit leave request (supports LWOP)
router.post('/request', requirePermission('leave:write:self'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { leaveTypeId, dateFrom, dateTo, isHalfDay, reason, attachmentUrl, isLwop } = req.body;

    if (!leaveTypeId || !dateFrom || !dateTo || !reason) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Missing required fields' }
      });
      return;
    }

    // Get employee ID from user
    const employeeResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('UserId', sql.UniqueIdentifier, userId)
      .query(`
        SELECT e.Id, e.ImmediateSupervisorId, e.DepartmentId
        FROM dbo.EmployeeUserLink eul
        INNER JOIN dbo.Employees e ON eul.EmployeeId = e.Id
        WHERE eul.UserId = @UserId AND eul.TenantId = @TenantId
      `);

    if (employeeResult.recordset.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'EMPLOYEE_NOT_FOUND', message: 'No employee linked to this user account' }
      });
      return;
    }

    const employee = employeeResult.recordset[0];

    // Calculate total days
    const startDate = new Date(dateFrom);
    const endDate = new Date(dateTo);
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    const totalDays = isHalfDay ? 0.5 : diffDays;

    // Check leave balance (skip if LWOP)
    let effectiveIsLwop = isLwop || false;
    if (!effectiveIsLwop) {
      const balanceResult = await pool.request()
        .input('TenantId', sql.UniqueIdentifier, tenantId)
        .input('EmployeeId', sql.UniqueIdentifier, employee.Id)
        .input('LeaveTypeId', sql.UniqueIdentifier, leaveTypeId)
        .input('Year', sql.Int, new Date().getFullYear())
        .query(`
          SELECT BalanceDays FROM dbo.LeaveCredits
          WHERE TenantId = @TenantId AND EmployeeId = @EmployeeId
                AND LeaveTypeId = @LeaveTypeId AND Year = @Year AND IsDeleted = 0
        `);

      if (balanceResult.recordset.length > 0) {
        const balance = balanceResult.recordset[0].BalanceDays;
        if (balance < totalDays) {
          res.status(400).json({
            success: false,
            error: {
              code: 'INSUFFICIENT_BALANCE',
              message: `Insufficient leave balance. Available: ${balance} days, Requested: ${totalDays} days. Use LWOP if you wish to proceed without pay.`
            }
          });
          return;
        }
      } else {
        // No credits record found - must be LWOP
        effectiveIsLwop = true;
      }
    }

    // Resolve approval chain: check LeaveApprovalChains table first, fall back to supervisor hierarchy
    const chainResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('DepartmentId', sql.UniqueIdentifier, employee.DepartmentId)
      .query(`
        SELECT lac.ApproverId, lac.SequenceNo
        FROM dbo.LeaveApprovalChains lac
        WHERE lac.TenantId = @TenantId
          AND (lac.DepartmentId = @DepartmentId OR lac.DepartmentId IS NULL)
          AND lac.IsActive = 1 AND lac.IsDeleted = 0
        ORDER BY lac.DepartmentId DESC, lac.LeaveTypeId DESC, lac.SequenceNo ASC
      `);

    let approverChain: string[] = [];

    if (chainResult.recordset.length > 0) {
      // Use configured chain - deduplicate by approver, maintain sequence
      const seen = new Set<string>();
      for (const row of chainResult.recordset) {
        if (!seen.has(row.ApproverId)) {
          seen.add(row.ApproverId);
          approverChain.push(row.ApproverId);
        }
      }
    } else {
      // Fall back to supervisor hierarchy
      let currentSupervisorId: string | null = employee.ImmediateSupervisorId;
      const MAX_LEVELS = 10;
      let levelCount = 0;
      while (currentSupervisorId && levelCount < MAX_LEVELS) {
        approverChain.push(currentSupervisorId);
        const supResult = await pool.request()
          .input('SupervisorId', sql.UniqueIdentifier, currentSupervisorId)
          .query(`SELECT ImmediateSupervisorId FROM dbo.Employees WHERE Id = @SupervisorId`);
        currentSupervisorId = supResult.recordset[0]?.ImmediateSupervisorId ?? null;
        levelCount++;
      }
      if (approverChain.length === 0 && employee.ImmediateSupervisorId) {
        approverChain.push(employee.ImmediateSupervisorId);
      }
    }

    // Create leave request
    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, employee.Id)
      .input('LeaveTypeId', sql.UniqueIdentifier, leaveTypeId)
      .input('DateFrom', sql.Date, startDate)
      .input('DateTo', sql.Date, endDate)
      .input('TotalDays', sql.Decimal(5, 2), totalDays)
      .input('IsHalfDay', sql.Bit, isHalfDay || false)
      .input('Reason', sql.NVarChar, reason)
      .input('AttachmentUrl', sql.NVarChar, attachmentUrl || null)
      .input('CurrentApproverId', sql.UniqueIdentifier, approverChain[0] || null)
      .input('CreatedBy', sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO dbo.LeaveRequests (TenantId, EmployeeId, LeaveTypeId, DateFrom, DateTo,
          TotalDays, IsHalfDay, Reason, AttachmentUrl, CurrentApproverId, CreatedBy)
        OUTPUT INSERTED.Id
        VALUES (@TenantId, @EmployeeId, @LeaveTypeId, @DateFrom, @DateTo,
          @TotalDays, @IsHalfDay, @Reason, @AttachmentUrl, @CurrentApproverId, @CreatedBy);
      `);

    const leaveRequestId = result.recordset[0].Id;

    // Insert approval steps
    for (let i = 0; i < approverChain.length; i++) {
      await pool.request()
        .input('LeaveRequestId', sql.UniqueIdentifier, leaveRequestId)
        .input('TenantId', sql.UniqueIdentifier, tenantId)
        .input('SequenceNo', sql.Int, i + 1)
        .input('ApproverId', sql.UniqueIdentifier, approverChain[i])
        .input('CreatedBy', sql.UniqueIdentifier, userId)
        .query(`
          INSERT INTO dbo.LeaveApprovalSteps (LeaveRequestId, TenantId, SequenceNo, ApproverId, CreatedBy)
          VALUES (@LeaveRequestId, @TenantId, @SequenceNo, @ApproverId, @CreatedBy)
        `);
    }

    await logAuditEvent(pool, {
      tenantId: tenantId!, userId, action: 'CREATE', entityName: 'LeaveRequest', entityId: leaveRequestId,
      afterJson: { leaveTypeId, dateFrom, dateTo, totalDays, isHalfDay, isLwop: effectiveIsLwop, approvalLevels: approverChain.length },
      ipAddress: extractIp(req)
    });

    res.status(201).json({
      success: true,
      data: {
        id: leaveRequestId,
        message: effectiveIsLwop ? 'Leave request submitted as LWOP (Leave Without Pay)' : 'Leave request submitted successfully',
        approvalLevels: approverChain.length,
        isLwop: effectiveIsLwop
      }
    });
  } catch (error) {
    console.error('Error submitting leave request:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to submit leave request' }
    });
  }
});

// GET /api/v1/leave/requests - Get leave requests
router.get('/requests', requirePermission('leave:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { status, employeeId, startDate, endDate } = req.query;
    const pagination = parsePaginationQuery(req.query);

    let whereClause = 'WHERE lr.TenantId = @TenantId AND lr.IsDeleted = 0';
    const request = pool.request().input('TenantId', sql.UniqueIdentifier, tenantId);

    if (status) {
      whereClause += ' AND lr.Status = @Status';
      request.input('Status', sql.NVarChar, status);
    }
    if (employeeId) {
      whereClause += ' AND lr.EmployeeId = @EmployeeId';
      request.input('EmployeeId', sql.UniqueIdentifier, employeeId);
    }
    if (startDate) {
      whereClause += ' AND lr.DateFrom >= @StartDate';
      request.input('StartDate', sql.Date, new Date(startDate as string));
    }
    if (endDate) {
      whereClause += ' AND lr.DateTo <= @EndDate';
      request.input('EndDate', sql.Date, new Date(endDate as string));
    }

    const countResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`SELECT COUNT(*) AS total FROM dbo.LeaveRequests lr ${whereClause}`);
    const total = countResult.recordset[0]?.total || 0;

    const selectQuery = `SELECT lr.Id, lr.DateFrom, lr.DateTo, lr.TotalDays, lr.IsHalfDay, lr.Reason, lr.Status, lr.SubmittedAtUtc, lr.DecidedAtUtc,
      lt.Code AS LeaveTypeCode, lt.Name AS LeaveTypeName, e.EmployeeNo, e.FirstName, e.LastName
      FROM dbo.LeaveRequests lr
      INNER JOIN dbo.LeaveTypes lt ON lr.LeaveTypeId = lt.Id
      INNER JOIN dbo.Employees e ON lr.EmployeeId = e.Id`;
    const fullQuery = addPaginationToQuery(selectQuery, whereClause, 'ORDER BY lr.SubmittedAtUtc DESC', pagination);
    const result = await request.query(fullQuery);

    res.json({
      success: true,
      data: {
        leaveRequests: result.recordset,
        pagination: buildPaginationMeta(pagination.page, pagination.pageSize, total)
      }
    });
  } catch (error) {
    console.error('Error getting leave requests:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve leave requests' }
    });
  }
});

// GET /api/v1/leave/request/:id - Get single leave request detail with approval chain
router.get('/request/:id', requirePermission('leave:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { id } = req.params;

    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, id)
      .query(`
        SELECT lr.*,
          lt.Code AS LeaveTypeCode, lt.Name AS LeaveTypeName, lt.IsPaid,
          e.EmployeeNo, e.FirstName, e.LastName, e.DepartmentId,
          d.Name AS DepartmentName
        FROM dbo.LeaveRequests lr
        INNER JOIN dbo.LeaveTypes lt ON lr.LeaveTypeId = lt.Id
        INNER JOIN dbo.Employees e ON lr.EmployeeId = e.Id
        INNER JOIN dbo.Departments d ON e.DepartmentId = d.Id
        WHERE lr.Id = @Id AND lr.TenantId = @TenantId AND lr.IsDeleted = 0
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Leave request not found' }
      });
      return;
    }

    // Get approval steps
    const stepsResult = await pool.request()
      .input('LeaveRequestId', sql.UniqueIdentifier, id)
      .query(`
        SELECT las.SequenceNo, las.Status, las.ActedAtUtc, las.Comment,
               e.FirstName + ' ' + e.LastName AS ApproverName
        FROM dbo.LeaveApprovalSteps las
        INNER JOIN dbo.Employees e ON las.ApproverId = e.Id
        WHERE las.LeaveRequestId = @LeaveRequestId
        ORDER BY las.SequenceNo ASC
      `);

    res.json({
      success: true,
      data: {
        leaveRequest: result.recordset[0],
        approvalSteps: stepsResult.recordset
      }
    });
  } catch (error) {
    console.error('Error getting leave request:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve leave request' }
    });
  }
});

// GET /api/v1/leave/request/:id/approval-steps - Get approval steps
router.get('/request/:id/approval-steps', requirePermission('leave:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { id } = req.params;

    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('LeaveRequestId', sql.UniqueIdentifier, id)
      .query(`
        SELECT las.Id, las.SequenceNo, las.Status, las.ActedAtUtc, las.Comment,
               e.Id AS ApproverId, e.FirstName + ' ' + e.LastName AS ApproverName
        FROM dbo.LeaveApprovalSteps las
        INNER JOIN dbo.Employees e ON las.ApproverId = e.Id
        WHERE las.LeaveRequestId = @LeaveRequestId AND las.TenantId = @TenantId
        ORDER BY las.SequenceNo ASC
      `);

    res.json({
      success: true,
      data: result.recordset
    });
  } catch (error) {
    console.error('Error fetching approval steps:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to fetch approval steps' }
    });
  }
});

// PUT /api/v1/leave/request/:id/approve - Approve leave request
router.put('/request/:id/approve', requirePermission('leave:approve'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { id } = req.params;
    const { comment } = req.body;

    const leaveRequestResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, id)
      .query(`
        SELECT lr.*, e.ImmediateSupervisorId
        FROM dbo.LeaveRequests lr
        INNER JOIN dbo.Employees e ON lr.EmployeeId = e.Id
        WHERE lr.Id = @Id AND lr.TenantId = @TenantId AND lr.IsDeleted = 0
      `);

    if (leaveRequestResult.recordset.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Leave request not found' } });
      return;
    }

    const leaveRequest = leaveRequestResult.recordset[0];
    if (leaveRequest.Status !== 'Pending') {
      res.status(400).json({ success: false, error: { code: 'INVALID_STATUS', message: 'Leave request is not pending' } });
      return;
    }

    // Update current approver's step
    await pool.request()
      .input('LeaveRequestId', sql.UniqueIdentifier, id)
      .input('ApproverId', sql.UniqueIdentifier, userId)
      .input('Status', sql.NVarChar, 'Approved')
      .input('ActedAtUtc', sql.DateTime2, new Date())
      .input('Comment', sql.NVarChar, comment || null)
      .query(`
        UPDATE dbo.LeaveApprovalSteps SET Status = @Status, ActedAtUtc = @ActedAtUtc, Comment = @Comment
        WHERE LeaveRequestId = @LeaveRequestId AND ApproverId = @ApproverId AND Status = 'Pending'
      `);

    // Check for more pending steps
    const pendingStepsResult = await pool.request()
      .input('LeaveRequestId', sql.UniqueIdentifier, id)
      .query(`
        SELECT TOP 1 SequenceNo, ApproverId FROM dbo.LeaveApprovalSteps
        WHERE LeaveRequestId = @LeaveRequestId AND Status = 'Pending' ORDER BY SequenceNo ASC
      `);

    const hasMoreSteps = pendingStepsResult.recordset.length > 0;

    if (hasMoreSteps) {
      const nextApprover = pendingStepsResult.recordset[0];
      await pool.request()
        .input('Id', sql.UniqueIdentifier, id)
        .input('CurrentApproverId', sql.UniqueIdentifier, nextApprover.ApproverId)
        .query(`UPDATE dbo.LeaveRequests SET CurrentApproverId = @CurrentApproverId, UpdatedAtUtc = GETUTCDATE() WHERE Id = @Id`);
    } else {
      // All approved - finalize
      await pool.request()
        .input('Id', sql.UniqueIdentifier, id)
        .input('Status', sql.NVarChar, 'Approved')
        .input('DecidedAtUtc', sql.DateTime2, new Date())
        .query(`UPDATE dbo.LeaveRequests SET Status = @Status, DecidedAtUtc = @DecidedAtUtc, CurrentApproverId = NULL WHERE Id = @Id`);

      // Deduct from credits (unless LWOP or unpaid leave)
      const leaveTypeCheck = await pool.request()
        .input('LeaveTypeId', sql.UniqueIdentifier, leaveRequest.LeaveTypeId)
        .query('SELECT IsPaid FROM dbo.LeaveTypes WHERE Id = @LeaveTypeId');

      const isPaid = leaveTypeCheck.recordset[0]?.IsPaid !== false;

      if (isPaid) {
        await pool.request()
          .input('TenantId', sql.UniqueIdentifier, tenantId)
          .input('EmployeeId', sql.UniqueIdentifier, leaveRequest.EmployeeId)
          .input('LeaveTypeId', sql.UniqueIdentifier, leaveRequest.LeaveTypeId)
          .input('Year', sql.Int, new Date(leaveRequest.DateFrom).getFullYear())
          .input('Days', sql.Decimal(5, 2), leaveRequest.TotalDays)
          .query(`
            UPDATE dbo.LeaveCredits
            SET UsedDays = UsedDays + @Days, BalanceDays = BalanceDays - @Days, UpdatedAtUtc = GETUTCDATE()
            WHERE TenantId = @TenantId AND EmployeeId = @EmployeeId
                  AND LeaveTypeId = @LeaveTypeId AND Year = @Year AND IsDeleted = 0
          `);

        await pool.request()
          .input('TenantId', sql.UniqueIdentifier, tenantId)
          .input('EmployeeId', sql.UniqueIdentifier, leaveRequest.EmployeeId)
          .input('LeaveTypeId', sql.UniqueIdentifier, leaveRequest.LeaveTypeId)
          .input('TransactionType', sql.NVarChar, 'Deduction')
          .input('Days', sql.Decimal(5, 2), leaveRequest.TotalDays)
          .input('ReferenceId', sql.NVarChar, id)
          .query(`
            INSERT INTO dbo.LeaveCreditLedger (TenantId, EmployeeId, LeaveTypeId, TransactionType, Days, ReferenceId)
            VALUES (@TenantId, @EmployeeId, @LeaveTypeId, @TransactionType, @Days, @ReferenceId)
          `);
      }
    }

    await logAuditEvent(pool, {
      tenantId: tenantId!, userId, action: 'APPROVE', entityName: 'LeaveRequest', entityId: id as string,
      beforeJson: { status: 'Pending' },
      afterJson: { status: hasMoreSteps ? 'Pending' : 'Approved', comment },
      ipAddress: extractIp(req)
    });

    // Spec §8.8: Push notification — fire-and-forget (don't block response)
    if (!hasMoreSteps) {
      const leaveTypeResult = await pool.request()
        .input('LeaveTypeId', sql.UniqueIdentifier, leaveRequest.LeaveTypeId)
        .query('SELECT Name FROM dbo.LeaveTypes WHERE Id = @LeaveTypeId');
      const leaveTypeName = leaveTypeResult.recordset[0]?.Name || 'Leave';
      sendLeaveNotification(pool, tenantId!, leaveRequest.EmployeeId, 'approved', leaveTypeName).catch(() => {});
    }

    res.json({
      success: true,
      data: {
        message: hasMoreSteps ? 'Approved at this level. Forwarded to next approver.' : 'Leave request fully approved',
        status: hasMoreSteps ? 'Pending' : 'Approved'
      }
    });
  } catch (error) {
    console.error('Error approving leave request:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to approve leave request' } });
  }
});

// PUT /api/v1/leave/request/:id/reject - Reject leave request
router.put('/request/:id/reject', requirePermission('leave:approve'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { id } = req.params;
    const { comment } = req.body;

    const leaveRequestResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, id)
      .query(`SELECT lr.* FROM dbo.LeaveRequests lr WHERE lr.Id = @Id AND lr.TenantId = @TenantId AND lr.IsDeleted = 0`);

    if (leaveRequestResult.recordset.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Leave request not found' } });
      return;
    }

    const leaveRequest = leaveRequestResult.recordset[0];
    if (leaveRequest.Status !== 'Pending') {
      res.status(400).json({ success: false, error: { code: 'INVALID_STATUS', message: 'Leave request is not pending' } });
      return;
    }

    await pool.request()
      .input('Id', sql.UniqueIdentifier, id)
      .input('Status', sql.NVarChar, 'Rejected')
      .input('DecidedAtUtc', sql.DateTime2, new Date())
      .query(`UPDATE dbo.LeaveRequests SET Status = @Status, DecidedAtUtc = @DecidedAtUtc, CurrentApproverId = NULL WHERE Id = @Id`);

    await pool.request()
      .input('LeaveRequestId', sql.UniqueIdentifier, id)
      .input('ApproverId', sql.UniqueIdentifier, userId)
      .input('Status', sql.NVarChar, 'Rejected')
      .input('ActedAtUtc', sql.DateTime2, new Date())
      .input('Comment', sql.NVarChar, comment || null)
      .query(`UPDATE dbo.LeaveApprovalSteps SET Status = @Status, ActedAtUtc = @ActedAtUtc, Comment = @Comment WHERE LeaveRequestId = @LeaveRequestId AND ApproverId = @ApproverId AND Status = 'Pending'`);

    await pool.request()
      .input('LeaveRequestId', sql.UniqueIdentifier, id)
      .input('Status', sql.NVarChar, 'Cancelled')
      .query(`UPDATE dbo.LeaveApprovalSteps SET Status = @Status, ActedAtUtc = GETUTCDATE(), Comment = 'Cancelled due to rejection' WHERE LeaveRequestId = @LeaveRequestId AND Status = 'Pending'`);

    await logAuditEvent(pool, {
      tenantId: tenantId!, userId, action: 'REJECT', entityName: 'LeaveRequest', entityId: id as string,
      beforeJson: { status: 'Pending' }, afterJson: { status: 'Rejected', comment },
      ipAddress: extractIp(req)
    });

    // Spec §8.8: Push notification — fire-and-forget (don't block response)
    const leaveTypeResult = await pool.request()
      .input('LeaveTypeId', sql.UniqueIdentifier, leaveRequest.LeaveTypeId)
      .query('SELECT Name FROM dbo.LeaveTypes WHERE Id = @LeaveTypeId');
    const leaveTypeName = leaveTypeResult.recordset[0]?.Name || 'Leave';
    sendLeaveNotification(pool, tenantId!, leaveRequest.EmployeeId, 'rejected', leaveTypeName).catch(() => {});

    res.json({ success: true, data: { message: 'Leave request rejected' } });
  } catch (error) {
    console.error('Error rejecting leave request:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to reject leave request' } });
  }
});

// PUT /api/v1/leave/request/:id/cancel - Cancel own pending leave request
router.put('/request/:id/cancel', requirePermission('leave:write:self'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { id } = req.params;

    // Get the leave request - must be the employee's own and pending
    const leaveResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, id)
      .input('UserId', sql.UniqueIdentifier, userId)
      .query(`
        SELECT lr.* FROM dbo.LeaveRequests lr
        INNER JOIN dbo.EmployeeUserLink eul ON lr.EmployeeId = eul.EmployeeId
        WHERE lr.Id = @Id AND lr.TenantId = @TenantId AND eul.UserId = @UserId AND lr.IsDeleted = 0
      `);

    if (leaveResult.recordset.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Leave request not found' } });
      return;
    }

    if (leaveResult.recordset[0].Status !== 'Pending') {
      res.status(400).json({ success: false, error: { code: 'INVALID_STATUS', message: 'Only pending requests can be cancelled' } });
      return;
    }

    await pool.request()
      .input('Id', sql.UniqueIdentifier, id)
      .input('Status', sql.NVarChar, 'Cancelled')
      .query(`UPDATE dbo.LeaveRequests SET Status = @Status, DecidedAtUtc = GETUTCDATE(), CurrentApproverId = NULL, UpdatedAtUtc = GETUTCDATE() WHERE Id = @Id`);

    // Cancel all pending approval steps
    await pool.request()
      .input('LeaveRequestId', sql.UniqueIdentifier, id)
      .input('Status', sql.NVarChar, 'Cancelled')
      .query(`UPDATE dbo.LeaveApprovalSteps SET Status = @Status, ActedAtUtc = GETUTCDATE(), Comment = 'Cancelled by employee' WHERE LeaveRequestId = @LeaveRequestId AND Status = 'Pending'`);

    await logAuditEvent(pool, {
      tenantId: tenantId!, userId, action: 'CANCEL', entityName: 'LeaveRequest', entityId: id as string,
      beforeJson: { status: 'Pending' }, afterJson: { status: 'Cancelled' },
      ipAddress: extractIp(req)
    });

    res.json({ success: true, data: { message: 'Leave request cancelled' } });
  } catch (error) {
    console.error('Error cancelling leave request:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to cancel leave request' } });
  }
});

// ──────────────────────────────────────────────────────────────
// LEAVE CALENDAR
// ──────────────────────────────────────────────────────────────

// GET /api/v1/leave/calendar - Get approved leaves for calendar view
router.get('/calendar', requirePermission('leave:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { startDate, endDate, departmentId } = req.query;

    const start = startDate ? new Date(startDate as string) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = endDate ? new Date(endDate as string) : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);

    let whereClause = `WHERE lr.TenantId = @TenantId AND lr.Status = 'Approved' AND lr.IsDeleted = 0
      AND lr.DateFrom <= @EndDate AND lr.DateTo >= @StartDate`;
    const request = pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('StartDate', sql.Date, start)
      .input('EndDate', sql.Date, end);

    if (departmentId) {
      whereClause += ' AND e.DepartmentId = @DepartmentId';
      request.input('DepartmentId', sql.UniqueIdentifier, departmentId);
    }

    const result = await request.query(`
      SELECT lr.Id, lr.DateFrom, lr.DateTo, lr.TotalDays, lr.IsHalfDay,
        lt.Code AS LeaveTypeCode, lt.Name AS LeaveTypeName,
        e.Id AS EmployeeId, e.FirstName, e.LastName, e.EmployeeNo,
        d.Name AS DepartmentName
      FROM dbo.LeaveRequests lr
      INNER JOIN dbo.LeaveTypes lt ON lr.LeaveTypeId = lt.Id
      INNER JOIN dbo.Employees e ON lr.EmployeeId = e.Id
      INNER JOIN dbo.Departments d ON e.DepartmentId = d.Id
      ${whereClause}
      ORDER BY lr.DateFrom
    `);

    res.json({
      success: true,
      data: { leaves: result.recordset }
    });
  } catch (error) {
    console.error('Error getting leave calendar:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve leave calendar' }
    });
  }
});

// ──────────────────────────────────────────────────────────────
// YEAR-END PROCESSING
// ──────────────────────────────────────────────────────────────

// POST /api/v1/leave/year-end - Run year-end processing (carry-over, monetization, forfeiture)
router.post('/year-end', requirePermission('leave:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { year } = req.body;

    const targetYear = year || new Date().getFullYear() - 1;
    const nextYear = targetYear + 1;
    const results: any[] = [];

    // Get all leave types
    const leaveTypesResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`SELECT Id, Code, MaxCarryOverDays, IsMonetizable FROM dbo.LeaveTypes WHERE TenantId = @TenantId AND IsDeleted = 0`);

    // Get all employees with credits for the target year
    const creditsResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Year', sql.Int, targetYear)
      .query(`
        SELECT lc.*, e.Id AS EmployeeId
        FROM dbo.LeaveCredits lc
        INNER JOIN dbo.Employees e ON lc.EmployeeId = e.Id
        WHERE lc.TenantId = @TenantId AND lc.Year = @Year AND lc.IsDeleted = 0 AND e.IsActive = 1
      `);

    for (const credit of creditsResult.recordset) {
      const leaveType = leaveTypesResult.recordset.find((lt: any) => lt.Id.toString() === credit.LeaveTypeId.toString());
      if (!leaveType) continue;

      const unusedDays = Math.max(0, Number(credit.BalanceDays));
      const maxCarryOver = Number(leaveType.MaxCarryOverDays);
      const carryOverDays = Math.min(unusedDays, maxCarryOver);
      const excessDays = unusedDays - carryOverDays;
      const monetizedDays = (excessDays > 0 && leaveType.IsMonetizable) ? excessDays : 0;
      const forfeitedDays = excessDays - monetizedDays;

      if (carryOverDays > 0) {
        // Upsert carry-over to next year
        const existingNextYear = await pool.request()
          .input('TenantId', sql.UniqueIdentifier, tenantId)
          .input('EmployeeId', sql.UniqueIdentifier, credit.EmployeeId)
          .input('LeaveTypeId', sql.UniqueIdentifier, credit.LeaveTypeId)
          .input('Year', sql.Int, nextYear)
          .query(`SELECT Id FROM dbo.LeaveCredits WHERE TenantId = @TenantId AND EmployeeId = @EmployeeId AND LeaveTypeId = @LeaveTypeId AND Year = @Year AND IsDeleted = 0`);

        if (existingNextYear.recordset.length > 0) {
          await pool.request()
            .input('Id', sql.UniqueIdentifier, existingNextYear.recordset[0].Id)
            .input('CarriedOverDays', sql.Decimal(5, 2), carryOverDays)
            .input('BalanceDays', sql.Decimal(5, 2), carryOverDays)
            .query(`UPDATE dbo.LeaveCredits SET CarriedOverDays = @CarriedOverDays, BalanceDays = BalanceDays + @CarriedOverDays, UpdatedAtUtc = GETUTCDATE() WHERE Id = @Id`);
        } else {
          await pool.request()
            .input('TenantId', sql.UniqueIdentifier, tenantId)
            .input('EmployeeId', sql.UniqueIdentifier, credit.EmployeeId)
            .input('LeaveTypeId', sql.UniqueIdentifier, credit.LeaveTypeId)
            .input('Year', sql.Int, nextYear)
            .input('CarriedOverDays', sql.Decimal(5, 2), carryOverDays)
            .query(`INSERT INTO dbo.LeaveCredits (TenantId, EmployeeId, LeaveTypeId, Year, CarriedOverDays, BalanceDays) VALUES (@TenantId, @EmployeeId, @LeaveTypeId, @Year, @CarriedOverDays, @CarriedOverDays)`);
        }

        // Ledger entry for carry-over
        await pool.request()
          .input('TenantId', sql.UniqueIdentifier, tenantId)
          .input('EmployeeId', sql.UniqueIdentifier, credit.EmployeeId)
          .input('LeaveTypeId', sql.UniqueIdentifier, credit.LeaveTypeId)
          .input('TransactionType', sql.NVarChar, 'CarryOver')
          .input('Days', sql.Decimal(5, 2), carryOverDays)
          .input('ReferenceId', sql.NVarChar, `CARRYOVER-${targetYear}-${nextYear}`)
          .query(`INSERT INTO dbo.LeaveCreditLedger (TenantId, EmployeeId, LeaveTypeId, TransactionType, Days, ReferenceId) VALUES (@TenantId, @EmployeeId, @LeaveTypeId, @TransactionType, @Days, @ReferenceId)`);
      }

      if (monetizedDays > 0) {
        // Ledger entry for monetization
        await pool.request()
          .input('TenantId', sql.UniqueIdentifier, tenantId)
          .input('EmployeeId', sql.UniqueIdentifier, credit.EmployeeId)
          .input('LeaveTypeId', sql.UniqueIdentifier, credit.LeaveTypeId)
          .input('TransactionType', sql.NVarChar, 'Monetization')
          .input('Days', sql.Decimal(5, 2), monetizedDays)
          .input('ReferenceId', sql.NVarChar, `MONETIZE-${targetYear}`)
          .query(`INSERT INTO dbo.LeaveCreditLedger (TenantId, EmployeeId, LeaveTypeId, TransactionType, Days, ReferenceId) VALUES (@TenantId, @EmployeeId, @LeaveTypeId, @TransactionType, @Days, @ReferenceId)`);

        // Update monetized days on current year credit
        await pool.request()
          .input('Id', sql.UniqueIdentifier, credit.Id)
          .input('MonetizedDays', sql.Decimal(5, 2), monetizedDays)
          .input('BalanceDays', sql.Decimal(5, 2), -monetizedDays)
          .query(`UPDATE dbo.LeaveCredits SET MonetizedDays = MonetizedDays + @MonetizedDays, BalanceDays = BalanceDays - @MonetizedDays, UpdatedAtUtc = GETUTCDATE() WHERE Id = @Id`);
      }

      if (forfeitedDays > 0) {
        // Zero out remaining balance
        await pool.request()
          .input('Id', sql.UniqueIdentifier, credit.Id)
          .query(`UPDATE dbo.LeaveCredits SET BalanceDays = 0, UpdatedAtUtc = GETUTCDATE() WHERE Id = @Id`);

        // Ledger entry for forfeiture
        await pool.request()
          .input('TenantId', sql.UniqueIdentifier, tenantId)
          .input('EmployeeId', sql.UniqueIdentifier, credit.EmployeeId)
          .input('LeaveTypeId', sql.UniqueIdentifier, credit.LeaveTypeId)
          .input('TransactionType', sql.NVarChar, 'Adjustment')
          .input('Days', sql.Decimal(5, 2), -forfeitedDays)
          .input('ReferenceId', sql.NVarChar, `FORFEIT-${targetYear}`)
          .query(`INSERT INTO dbo.LeaveCreditLedger (TenantId, EmployeeId, LeaveTypeId, TransactionType, Days, ReferenceId) VALUES (@TenantId, @EmployeeId, @LeaveTypeId, @TransactionType, @Days, @ReferenceId)`);
      }

      results.push({
        employeeId: credit.EmployeeId,
        leaveTypeCode: leaveType.Code,
        unusedDays,
        carryOverDays,
        monetizedDays,
        forfeitedDays
      });
    }

    await logAuditEvent(pool, {
      tenantId: tenantId!, userId, action: 'YEAR_END_PROCESSING', entityName: 'LeaveCredits',
      afterJson: { targetYear, nextYear, totalProcessed: results.length },
      ipAddress: extractIp(req)
    });

    res.json({
      success: true,
      data: {
        targetYear,
        nextYear,
        totalProcessed: results.length,
        results,
        message: `Year-end processing complete for ${targetYear} → ${nextYear}`
      }
    });
  } catch (error) {
    console.error('Error running year-end processing:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to run year-end processing' }
    });
  }
});

// ──────────────────────────────────────────────────────────────
// ACCRUAL
// ──────────────────────────────────────────────────────────────

// POST /api/v1/leave/accrual - Run monthly leave accrual
router.post('/accrual', requirePermission('leave:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;

    const results = await runLeaveAccrual(pool, tenantId!);

    await logAuditEvent(pool, {
      tenantId: tenantId!, userId, action: 'LEAVE_ACCRUAL', entityName: 'LeaveCredits',
      afterJson: { totalProcessed: results.length, accruedCount: results.filter(r => r.action === 'accrued').length },
      ipAddress: extractIp(req)
    });

    res.json({
      success: true,
      data: {
        totalProcessed: results.length,
        accrued: results.filter(r => r.action === 'accrued').length,
        results,
        message: 'Leave accrual completed'
      }
    });
  } catch (error) {
    console.error('Error running leave accrual:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to run leave accrual' }
    });
  }
});

export default router;
