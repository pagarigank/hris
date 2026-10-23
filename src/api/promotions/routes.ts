import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../../middleware/auth';
import { setTenantContext } from '../../middleware/tenantContext';
import { requirePermission } from '../../middleware/permissions';
import {
  evaluatePromotionCandidate,
  PromotionCriteriaConfig,
  KpiItem,
  EmployeeDataForPromotion
} from '../../services/kpiService';
import sql from 'mssql';

const router = Router();

router.use(authMiddleware);
router.use(setTenantContext);

// ──────────────────────────────────────────────────────────────
// PROMOTION CRITERIA PARAMETERS CRUD
// ──────────────────────────────────────────────────────────────

// GET /api/v1/promotions/criteria - Get company promotion criteria parameters
router.get('/criteria', requirePermission('reports:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;

    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        SELECT TOP 1 
          Id, TenantId, DepartmentId, MinKpiScorePercent, MinPerformanceRating,
          MinTenureMonths, RequireCleanDisciplinary, MinCompetencyScore,
          RecommendedSalaryIncreasePercent, AutoFlagDue
        FROM dbo.PromotionCriteria
        WHERE TenantId = @TenantId AND DepartmentId IS NULL AND IsDeleted = 0
      `);

    const criteria = result.recordset[0] || {
      MinKpiScorePercent: 85.0,
      MinPerformanceRating: 4.0,
      MinTenureMonths: 12,
      RequireCleanDisciplinary: true,
      MinCompetencyScore: 3.5,
      RecommendedSalaryIncreasePercent: 10.0,
      AutoFlagDue: true
    };

    res.json({
      success: true,
      data: { criteria }
    });
  } catch (error) {
    console.error('Error fetching promotion criteria:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve promotion criteria' }
    });
  }
});

// PUT /api/v1/promotions/criteria - Update promotion criteria parameters
router.put('/criteria', requirePermission('reports:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const {
      minKpiScorePercent, minPerformanceRating, minTenureMonths,
      requireCleanDisciplinary, minCompetencyScore, recommendedSalaryIncreasePercent,
      autoFlagDue
    } = req.body;

    const existing = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`SELECT Id FROM dbo.PromotionCriteria WHERE TenantId = @TenantId AND DepartmentId IS NULL AND IsDeleted = 0`);

    if (existing.recordset.length > 0) {
      await pool.request()
        .input('TenantId', sql.UniqueIdentifier, tenantId)
        .input('MinKpiScorePercent', sql.Decimal(5, 2), minKpiScorePercent !== undefined ? minKpiScorePercent : 85.0)
        .input('MinPerformanceRating', sql.Decimal(3, 2), minPerformanceRating !== undefined ? minPerformanceRating : 4.0)
        .input('MinTenureMonths', sql.Int, minTenureMonths !== undefined ? minTenureMonths : 12)
        .input('RequireCleanDisciplinary', sql.Bit, requireCleanDisciplinary !== undefined ? requireCleanDisciplinary : 1)
        .input('MinCompetencyScore', sql.Decimal(3, 2), minCompetencyScore !== undefined ? minCompetencyScore : 3.5)
        .input('RecommendedSalaryIncreasePercent', sql.Decimal(5, 2), recommendedSalaryIncreasePercent !== undefined ? recommendedSalaryIncreasePercent : 10.0)
        .input('AutoFlagDue', sql.Bit, autoFlagDue !== undefined ? autoFlagDue : 1)
        .input('UpdatedBy', sql.UniqueIdentifier, userId)
        .query(`
          UPDATE dbo.PromotionCriteria
          SET MinKpiScorePercent = @MinKpiScorePercent,
              MinPerformanceRating = @MinPerformanceRating,
              MinTenureMonths = @MinTenureMonths,
              RequireCleanDisciplinary = @RequireCleanDisciplinary,
              MinCompetencyScore = @MinCompetencyScore,
              RecommendedSalaryIncreasePercent = @RecommendedSalaryIncreasePercent,
              AutoFlagDue = @AutoFlagDue,
              UpdatedAtUtc = GETUTCDATE(),
              UpdatedBy = @UpdatedBy
          WHERE TenantId = @TenantId AND DepartmentId IS NULL
        `);
    } else {
      await pool.request()
        .input('TenantId', sql.UniqueIdentifier, tenantId)
        .input('MinKpiScorePercent', sql.Decimal(5, 2), minKpiScorePercent || 85.0)
        .input('MinPerformanceRating', sql.Decimal(3, 2), minPerformanceRating || 4.0)
        .input('MinTenureMonths', sql.Int, minTenureMonths || 12)
        .input('RequireCleanDisciplinary', sql.Bit, requireCleanDisciplinary !== undefined ? requireCleanDisciplinary : 1)
        .input('MinCompetencyScore', sql.Decimal(3, 2), minCompetencyScore || 3.5)
        .input('RecommendedSalaryIncreasePercent', sql.Decimal(5, 2), recommendedSalaryIncreasePercent || 10.0)
        .input('AutoFlagDue', sql.Bit, autoFlagDue !== undefined ? autoFlagDue : 1)
        .input('CreatedBy', sql.UniqueIdentifier, userId)
        .query(`
          INSERT INTO dbo.PromotionCriteria (
            TenantId, DepartmentId, MinKpiScorePercent, MinPerformanceRating,
            MinTenureMonths, RequireCleanDisciplinary, MinCompetencyScore,
            RecommendedSalaryIncreasePercent, AutoFlagDue, CreatedBy
          )
          VALUES (
            @TenantId, NULL, @MinKpiScorePercent, @MinPerformanceRating,
            @MinTenureMonths, @RequireCleanDisciplinary, @MinCompetencyScore,
            @RecommendedSalaryIncreasePercent, @AutoFlagDue, @CreatedBy
          )
        `);
    }

    res.json({ success: true, message: 'Promotion criteria updated successfully' });
  } catch (error) {
    console.error('Error updating promotion criteria:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to update promotion criteria' }
    });
  }
});

// ──────────────────────────────────────────────────────────────
// EMPLOYEES DUE FOR PROMOTION (ENGINE EVALUATION)
// ──────────────────────────────────────────────────────────────

// GET /api/v1/promotions/due - Evaluate and retrieve employees due for promotion
router.get('/due', requirePermission('reports:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { departmentId, statusFilter } = req.query;

    // 1. Fetch Tenant Criteria
    const critRes = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        SELECT TOP 1 
          MinKpiScorePercent, MinPerformanceRating, MinTenureMonths,
          RequireCleanDisciplinary, MinCompetencyScore, RecommendedSalaryIncreasePercent
        FROM dbo.PromotionCriteria
        WHERE TenantId = @TenantId AND DepartmentId IS NULL AND IsDeleted = 0
      `);

    const criteriaConfig: PromotionCriteriaConfig = {
      minKpiScorePercent: critRes.recordset[0]?.MinKpiScorePercent ? Number(critRes.recordset[0].MinKpiScorePercent) : 85.0,
      minPerformanceRating: critRes.recordset[0]?.MinPerformanceRating ? Number(critRes.recordset[0].MinPerformanceRating) : 4.0,
      minTenureMonths: critRes.recordset[0]?.MinTenureMonths ? Number(critRes.recordset[0].MinTenureMonths) : 12,
      requireCleanDisciplinary: critRes.recordset[0]?.RequireCleanDisciplinary !== undefined ? Boolean(critRes.recordset[0].RequireCleanDisciplinary) : true,
      minCompetencyScore: critRes.recordset[0]?.MinCompetencyScore ? Number(critRes.recordset[0].MinCompetencyScore) : 3.5,
      recommendedSalaryIncreasePercent: critRes.recordset[0]?.RecommendedSalaryIncreasePercent ? Number(critRes.recordset[0].RecommendedSalaryIncreasePercent) : 10.0
    };

    // 2. Fetch Active Employees
    let empQuery = `
      SELECT e.Id, e.EmployeeNo, e.FirstName, e.LastName, e.BasicSalary,
             e.DateHired, e.DepartmentId, d.Name AS DepartmentName,
             e.PositionId, p.Title AS PositionTitle, p.JobGrade,
             p.SalaryGradeMin, p.SalaryGradeMax
      FROM dbo.Employees e
      INNER JOIN dbo.Departments d ON e.DepartmentId = d.Id
      INNER JOIN dbo.Positions p ON e.PositionId = p.Id
      WHERE e.TenantId = @TenantId AND e.IsActive = 1 AND e.IsDeleted = 0
    `;
    const empReq = pool.request().input('TenantId', sql.UniqueIdentifier, tenantId);
    if (departmentId) {
      empQuery += ' AND e.DepartmentId = @DepartmentId';
      empReq.input('DepartmentId', sql.UniqueIdentifier, departmentId);
    }
    const empResult = await empReq.query(empQuery);
    const employees = empResult.recordset;

    // 3. Fetch All Available Positions (for Next Position recommendations)
    const posResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        SELECT Id, Title, DepartmentId, JobGrade, SalaryGradeMin, SalaryGradeMax
        FROM dbo.Positions
        WHERE TenantId = @TenantId AND IsDeleted = 0
        ORDER BY DepartmentId, SalaryGradeMin ASC
      `);
    const allPositions = posResult.recordset;

    // 4. Fetch All Active KPIs for this tenant
    const kpiResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        SELECT EmployeeId, MetricType, TargetValue, ActualValue, WeightPercent
        FROM dbo.EmployeeKpis
        WHERE TenantId = @TenantId AND IsDeleted = 0
      `);
    const kpiMap = new Map<string, KpiItem[]>();
    for (const row of kpiResult.recordset) {
      const items = kpiMap.get(row.EmployeeId) || [];
      items.push({
        metricType: row.MetricType,
        targetValue: Number(row.TargetValue),
        actualValue: Number(row.ActualValue),
        weightPercent: Number(row.WeightPercent)
      });
      kpiMap.set(row.EmployeeId, items);
    }

    // 5. Fetch Latest Performance Review Rating per employee
    const reviewResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        SELECT pr.EmployeeId, pr.Rating
        FROM dbo.PerformanceReviews pr
        INNER JOIN (
          SELECT EmployeeId, MAX(CreatedAtUtc) AS MaxCreated
          FROM dbo.PerformanceReviews
          WHERE TenantId = @TenantId AND IsDeleted = 0
          GROUP BY EmployeeId
        ) latest ON pr.EmployeeId = latest.EmployeeId AND pr.CreatedAtUtc = latest.MaxCreated
        WHERE pr.TenantId = @TenantId AND pr.IsDeleted = 0
      `);
    const reviewMap = new Map<string, number>();
    for (const r of reviewResult.recordset) {
      if (r.Rating !== null && r.Rating !== undefined) {
        reviewMap.set(r.EmployeeId, Number(r.Rating));
      }
    }

    // 6. Fetch Active Disciplinary records
    const discResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        SELECT EmployeeId, COUNT(*) AS ViolationCount
        FROM dbo.DisciplinaryRecords
        WHERE TenantId = @TenantId AND IsDeleted = 0 AND Status <> 'Dismissed'
        GROUP BY EmployeeId
      `);
    const discMap = new Map<string, number>();
    for (const d of discResult.recordset) {
      discMap.set(d.EmployeeId, Number(d.ViolationCount));
    }

    // 7. Fetch Average Competency scores
    const compResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        SELECT EmployeeId, AVG(CAST(ProficiencyLevel AS DECIMAL(3,2))) AS AvgProficiency
        FROM dbo.CompetencyMatrix
        WHERE TenantId = @TenantId AND IsDeleted = 0
        GROUP BY EmployeeId
      `);
    const compMap = new Map<string, number>();
    for (const c of compResult.recordset) {
      compMap.set(c.EmployeeId, Number(c.AvgProficiency));
    }

    // 8. Fetch Pending Promotion Requests so we can tag them
    const pendingReqResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        SELECT EmployeeId, Status, ProposedPositionId
        FROM dbo.PromotionRequests
        WHERE TenantId = @TenantId AND IsDeleted = 0 AND Status IN ('PendingReview', 'Endorsed')
      `);
    const pendingMap = new Map<string, any>();
    for (const p of pendingReqResult.recordset) {
      pendingMap.set(p.EmployeeId, p);
    }

    // 9. Evaluate each employee
    const evaluatedCandidates = employees.map((emp: any) => {
      const empData: EmployeeDataForPromotion = {
        id: emp.Id,
        employeeNo: emp.EmployeeNo,
        firstName: emp.FirstName,
        lastName: emp.LastName,
        basicSalary: Number(emp.BasicSalary) || 0,
        dateHired: emp.DateHired,
        departmentId: emp.DepartmentId,
        departmentName: emp.DepartmentName,
        positionId: emp.PositionId,
        positionTitle: emp.PositionTitle,
        jobGrade: emp.JobGrade,
        salaryGradeMin: emp.SalaryGradeMin ? Number(emp.SalaryGradeMin) : undefined,
        salaryGradeMax: emp.SalaryGradeMax ? Number(emp.SalaryGradeMax) : undefined
      };

      const kpis = kpiMap.get(emp.Id) || [];
      const latestRating = reviewMap.has(emp.Id) ? reviewMap.get(emp.Id)! : null;
      const activeDisc = discMap.get(emp.Id) || 0;
      const compAvg = compMap.get(emp.Id) || 0;

      // Find recommended next position in same department with higher minimum salary
      const currentSalaryMin = emp.SalaryGradeMin ? Number(emp.SalaryGradeMin) : 0;
      const potentialNextPositions = allPositions.filter((p: any) =>
        p.DepartmentId === emp.DepartmentId &&
        p.Id !== emp.PositionId &&
        (Number(p.SalaryGradeMin) > currentSalaryMin || Number(p.SalaryGradeMax) > (emp.SalaryGradeMax || 0))
      );

      const nextPos = potentialNextPositions.length > 0 ? {
        id: potentialNextPositions[0].Id,
        title: potentialNextPositions[0].Title,
        salaryGradeMin: potentialNextPositions[0].SalaryGradeMin ? Number(potentialNextPositions[0].SalaryGradeMin) : undefined,
        salaryGradeMax: potentialNextPositions[0].SalaryGradeMax ? Number(potentialNextPositions[0].SalaryGradeMax) : undefined
      } : undefined;

      const evalResult = evaluatePromotionCandidate(
        empData,
        criteriaConfig,
        kpis,
        latestRating,
        activeDisc,
        compAvg,
        nextPos
      );

      return {
        ...evalResult,
        hasPendingRequest: pendingMap.has(emp.Id),
        pendingRequestStatus: pendingMap.get(emp.Id)?.Status || null
      };
    });

    // Filter by status if requested
    let filtered = evaluatedCandidates;
    if (statusFilter) {
      filtered = evaluatedCandidates.filter((c: any) => c.eligibilityStatus === statusFilter);
    }

    // Sort: Due for Promotion first, then High Potential, by readinessScore descending
    filtered.sort((a: any, b: any) => {
      const rank = (s: string) => s === 'Due for Promotion' ? 3 : s === 'High Potential' ? 2 : s === 'Developing' ? 1 : 0;
      const rankDiff = rank(b.eligibilityStatus) - rank(a.eligibilityStatus);
      if (rankDiff !== 0) return rankDiff;
      return b.readinessScore - a.readinessScore;
    });

    // Summary counts
    const summary = {
      totalEvaluated: evaluatedCandidates.length,
      dueCount: evaluatedCandidates.filter((c: any) => c.eligibilityStatus === 'Due for Promotion').length,
      highPotentialCount: evaluatedCandidates.filter((c: any) => c.eligibilityStatus === 'High Potential').length,
      developingCount: evaluatedCandidates.filter((c: any) => c.eligibilityStatus === 'Developing').length,
      disqualifiedCount: evaluatedCandidates.filter((c: any) => c.eligibilityStatus === 'Disqualified').length,
      totalProjectedBudgetImpact: evaluatedCandidates
        .filter((c: any) => c.eligibilityStatus === 'Due for Promotion')
        .reduce((sum: number, c: any) => sum + c.projectedSalaryIncreaseAmount, 0)
    };

    res.json({
      success: true,
      data: {
        criteria: criteriaConfig,
        summary,
        candidates: filtered
      }
    });
  } catch (error) {
    console.error('Error evaluating employees due for promotion:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to evaluate promotion candidates' }
    });
  }
});

// ──────────────────────────────────────────────────────────────
// PROMOTION REQUESTS & NOMINATIONS
// ──────────────────────────────────────────────────────────────

// GET /api/v1/promotions/requests - List promotion requests / nominations
router.get('/requests', requirePermission('reports:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { status, employeeId, departmentId } = req.query;

    let query = `
      SELECT pr.Id, pr.TenantId, pr.EmployeeId, pr.NominatedBy,
             pr.CurrentPositionId, pr.ProposedPositionId,
             pr.CurrentBasicSalary, pr.ProposedBasicSalary,
             pr.JustificationReason, pr.KpiScoreAtNomination,
             pr.PerformanceRatingAtNomination, pr.TenureMonthsAtNomination,
             pr.Status, pr.EffectiveDate, pr.ApprovedBy, pr.ApprovedAtUtc,
             pr.ActionNotes, pr.CreatedAtUtc,
             e.EmployeeNo, e.FirstName, e.LastName, d.Name AS DepartmentName,
             cp.Title AS CurrentPositionTitle, pp.Title AS ProposedPositionTitle,
             u.FirstName AS NominatedByFirstName, u.LastName AS NominatedByLastName
      FROM dbo.PromotionRequests pr
      INNER JOIN dbo.Employees e ON pr.EmployeeId = e.Id
      INNER JOIN dbo.Departments d ON e.DepartmentId = d.Id
      INNER JOIN dbo.Positions cp ON pr.CurrentPositionId = cp.Id
      INNER JOIN dbo.Positions pp ON pr.ProposedPositionId = pp.Id
      LEFT JOIN dbo.Users u ON pr.NominatedBy = u.Id
      WHERE pr.TenantId = @TenantId AND pr.IsDeleted = 0
    `;
    const request = pool.request().input('TenantId', sql.UniqueIdentifier, tenantId);

    if (status) {
      query += ' AND pr.Status = @Status';
      request.input('Status', sql.NVarChar, status);
    }
    if (employeeId) {
      query += ' AND pr.EmployeeId = @EmployeeId';
      request.input('EmployeeId', sql.UniqueIdentifier, employeeId);
    }
    if (departmentId) {
      query += ' AND e.DepartmentId = @DepartmentId';
      request.input('DepartmentId', sql.UniqueIdentifier, departmentId);
    }

    query += ' ORDER BY pr.CreatedAtUtc DESC';

    const result = await request.query(query);

    res.json({
      success: true,
      data: { requests: result.recordset }
    });
  } catch (error) {
    console.error('Error fetching promotion requests:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve promotion requests' }
    });
  }
});

// POST /api/v1/promotions/requests - Submit a promotion nomination
router.post('/requests', requirePermission('reports:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const {
      employeeId, proposedPositionId, proposedBasicSalary,
      justificationReason, effectiveDate, kpiScoreAtNomination,
      performanceRatingAtNomination, tenureMonthsAtNomination
    } = req.body;

    if (!employeeId || !proposedPositionId || !proposedBasicSalary || !justificationReason || !effectiveDate) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Missing required nomination fields' }
      });
      return;
    }

    // Get current employee state
    const empRes = await pool.request()
      .input('Id', sql.UniqueIdentifier, employeeId)
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`SELECT PositionId, BasicSalary FROM dbo.Employees WHERE Id = @Id AND TenantId = @TenantId`);

    if (empRes.recordset.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Employee not found' } });
      return;
    }

    const currentPositionId = empRes.recordset[0].PositionId;
    const currentBasicSalary = empRes.recordset[0].BasicSalary;

    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, employeeId)
      .input('NominatedBy', sql.UniqueIdentifier, userId)
      .input('CurrentPositionId', sql.UniqueIdentifier, currentPositionId)
      .input('ProposedPositionId', sql.UniqueIdentifier, proposedPositionId)
      .input('CurrentBasicSalary', sql.Decimal(18, 4), currentBasicSalary)
      .input('ProposedBasicSalary', sql.Decimal(18, 4), proposedBasicSalary)
      .input('JustificationReason', sql.NVarChar(sql.MAX), justificationReason)
      .input('KpiScoreAtNomination', sql.Decimal(5, 2), kpiScoreAtNomination || null)
      .input('PerformanceRatingAtNomination', sql.Decimal(3, 2), performanceRatingAtNomination || null)
      .input('TenureMonthsAtNomination', sql.Int, tenureMonthsAtNomination || null)
      .input('Status', sql.NVarChar, 'PendingReview')
      .input('EffectiveDate', sql.Date, effectiveDate)
      .input('CreatedBy', sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO dbo.PromotionRequests (
          TenantId, EmployeeId, NominatedBy, CurrentPositionId, ProposedPositionId,
          CurrentBasicSalary, ProposedBasicSalary, JustificationReason,
          KpiScoreAtNomination, PerformanceRatingAtNomination, TenureMonthsAtNomination,
          Status, EffectiveDate, CreatedBy
        )
        OUTPUT INSERTED.Id
        VALUES (
          @TenantId, @EmployeeId, @NominatedBy, @CurrentPositionId, @ProposedPositionId,
          @CurrentBasicSalary, @ProposedBasicSalary, @JustificationReason,
          @KpiScoreAtNomination, @PerformanceRatingAtNomination, @TenureMonthsAtNomination,
          @Status, @EffectiveDate, @CreatedBy
        )
      `);

    res.status(201).json({
      success: true,
      data: {
        id: result.recordset[0].Id,
        message: 'Promotion nomination submitted successfully'
      }
    });
  } catch (error) {
    console.error('Error submitting promotion request:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to submit promotion nomination' }
    });
  }
});

// PUT /api/v1/promotions/requests/:id/action - Approve, endorse, or reject promotion request
router.put('/requests/:id/action', requirePermission('reports:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { id } = req.params;
    const { action, actionNotes } = req.body; // 'Approve', 'Endorse', 'Reject'

    if (!['Approve', 'Endorse', 'Reject'].includes(action)) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Action must be Approve, Endorse, or Reject' }
      });
      return;
    }

    // Fetch existing request
    const reqRes = await pool.request()
      .input('Id', sql.UniqueIdentifier, id)
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        SELECT EmployeeId, CurrentPositionId, ProposedPositionId, CurrentBasicSalary, ProposedBasicSalary, Status
        FROM dbo.PromotionRequests
        WHERE Id = @Id AND TenantId = @TenantId AND IsDeleted = 0
      `);

    if (reqRes.recordset.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Promotion request not found' } });
      return;
    }

    const promo = reqRes.recordset[0];
    const newStatus = action === 'Approve' ? 'Approved' : action === 'Endorse' ? 'Endorsed' : 'Rejected';

    // Update request
    await pool.request()
      .input('Id', sql.UniqueIdentifier, id)
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Status', sql.NVarChar, newStatus)
      .input('ActionNotes', sql.NVarChar(sql.MAX), actionNotes || null)
      .input('ApprovedBy', sql.UniqueIdentifier, userId)
      .query(`
        UPDATE dbo.PromotionRequests
        SET Status = @Status, ActionNotes = @ActionNotes,
            ApprovedBy = CASE WHEN @Status = 'Approved' THEN @ApprovedBy ELSE ApprovedBy END,
            ApprovedAtUtc = CASE WHEN @Status = 'Approved' THEN GETUTCDATE() ELSE ApprovedAtUtc END,
            UpdatedAtUtc = GETUTCDATE()
        WHERE Id = @Id AND TenantId = @TenantId
      `);

    // If approved, update Employee position and salary + create Employment History record!
    if (action === 'Approve') {
      // 1. Update Employee
      await pool.request()
        .input('EmployeeId', sql.UniqueIdentifier, promo.EmployeeId)
        .input('TenantId', sql.UniqueIdentifier, tenantId)
        .input('PositionId', sql.UniqueIdentifier, promo.ProposedPositionId)
        .input('BasicSalary', sql.Decimal(18, 4), promo.ProposedBasicSalary)
        .input('UpdatedBy', sql.UniqueIdentifier, userId)
        .query(`
          UPDATE dbo.Employees
          SET PositionId = @PositionId,
              BasicSalary = @BasicSalary,
              UpdatedAtUtc = GETUTCDATE(),
              UpdatedBy = @UpdatedBy
          WHERE Id = @EmployeeId AND TenantId = @TenantId
        `);

      // 2. Insert into EmployeeEmploymentHistory
      const oldVals = { PositionId: promo.CurrentPositionId, BasicSalary: promo.CurrentBasicSalary };
      const newVals = { PositionId: promo.ProposedPositionId, BasicSalary: promo.ProposedBasicSalary };

      await pool.request()
        .input('TenantId', sql.UniqueIdentifier, tenantId)
        .input('EmployeeId', sql.UniqueIdentifier, promo.EmployeeId)
        .input('ChangeType', sql.NVarChar, 'Promotion')
        .input('OldValueJson', sql.NVarChar, JSON.stringify(oldVals))
        .input('NewValueJson', sql.NVarChar, JSON.stringify(newVals))
        .input('CreatedBy', sql.UniqueIdentifier, userId)
        .query(`
          INSERT INTO dbo.EmployeeEmploymentHistory (
            TenantId, EmployeeId, EffectiveDate, ChangeType, OldValueJson, NewValueJson, CreatedBy
          )
          VALUES (
            @TenantId, @EmployeeId, CAST(GETUTCDATE() AS DATE), @ChangeType, @OldValueJson, @NewValueJson, @CreatedBy
          )
        `);
    }

    res.json({
      success: true,
      data: {
        status: newStatus,
        message: action === 'Approve'
          ? 'Promotion approved and applied to employee compensation and position'
          : `Promotion ${action.toLowerCase()}d successfully`
      }
    });
  } catch (error) {
    console.error('Error acting on promotion request:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to process promotion action' }
    });
  }
});

// GET /api/v1/promotions/dashboard - High-level Executive Dashboard
router.get('/dashboard', requirePermission('reports:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;

    // Requests count by status
    const statusCounts = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        SELECT Status, COUNT(*) AS Count, SUM(ProposedBasicSalary - CurrentBasicSalary) AS TotalSalaryIncrease
        FROM dbo.PromotionRequests
        WHERE TenantId = @TenantId AND IsDeleted = 0
        GROUP BY Status
      `);

    // Top recent promotions
    const recentPromotions = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        SELECT TOP 5 pr.Id, e.FirstName, e.LastName, e.EmployeeNo,
               cp.Title AS FromPosition, pp.Title AS ToPosition,
               pr.CurrentBasicSalary, pr.ProposedBasicSalary,
               (pr.ProposedBasicSalary - pr.CurrentBasicSalary) AS SalaryIncrease,
               pr.Status, pr.EffectiveDate, pr.CreatedAtUtc
        FROM dbo.PromotionRequests pr
        INNER JOIN dbo.Employees e ON pr.EmployeeId = e.Id
        INNER JOIN dbo.Positions cp ON pr.CurrentPositionId = cp.Id
        INNER JOIN dbo.Positions pp ON pr.ProposedPositionId = pp.Id
        WHERE pr.TenantId = @TenantId AND pr.IsDeleted = 0
        ORDER BY pr.CreatedAtUtc DESC
      `);

    // Department breakdown
    const deptBreakdown = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        SELECT d.Name AS DepartmentName, COUNT(pr.Id) AS RequestCount,
               SUM(CASE WHEN pr.Status = 'Approved' THEN 1 ELSE 0 END) AS ApprovedCount
        FROM dbo.PromotionRequests pr
        INNER JOIN dbo.Employees e ON pr.EmployeeId = e.Id
        INNER JOIN dbo.Departments d ON e.DepartmentId = d.Id
        WHERE pr.TenantId = @TenantId AND pr.IsDeleted = 0
        GROUP BY d.Name
      `);

    res.json({
      success: true,
      data: {
        statusBreakdown: statusCounts.recordset,
        recentPromotions: recentPromotions.recordset,
        departmentBreakdown: deptBreakdown.recordset
      }
    });
  } catch (error) {
    console.error('Error fetching promotion dashboard:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve promotion dashboard' }
    });
  }
});

export default router;
