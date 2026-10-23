import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../../middleware/auth';
import { setTenantContext } from '../../middleware/tenantContext';
import { requirePermission } from '../../middleware/permissions';
import { computeKpiAchievement, computeWeightedKpiScore } from '../../services/kpiService';
import sql from 'mssql';

const router = Router();

router.use(authMiddleware);
router.use(setTenantContext);

// ──────────────────────────────────────────────────────────────
// KPI DEFINITIONS / TEMPLATES CRUD
// ──────────────────────────────────────────────────────────────

// GET /api/v1/kpis/definitions - List KPI definitions
router.get('/definitions', requirePermission('reports:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { departmentId, positionId, category } = req.query;

    let query = `
      SELECT kd.Id, kd.TenantId, kd.DepartmentId, kd.PositionId, kd.Title, kd.Description,
             kd.Category, kd.MetricType, kd.TargetValue, kd.DefaultWeightPercent, kd.Unit,
             kd.CreatedAtUtc, d.Name AS DepartmentName, p.Title AS PositionTitle
      FROM dbo.KpiDefinitions kd
      LEFT JOIN dbo.Departments d ON kd.DepartmentId = d.Id
      LEFT JOIN dbo.Positions p ON kd.PositionId = p.Id
      WHERE kd.TenantId = @TenantId AND kd.IsDeleted = 0
    `;

    const request = pool.request().input('TenantId', sql.UniqueIdentifier, tenantId);

    if (departmentId) {
      query += ' AND (kd.DepartmentId = @DepartmentId OR kd.DepartmentId IS NULL)';
      request.input('DepartmentId', sql.UniqueIdentifier, departmentId);
    }
    if (positionId) {
      query += ' AND (kd.PositionId = @PositionId OR kd.PositionId IS NULL)';
      request.input('PositionId', sql.UniqueIdentifier, positionId);
    }
    if (category) {
      query += ' AND kd.Category = @Category';
      request.input('Category', sql.NVarChar, category);
    }

    query += ' ORDER BY kd.Category, kd.Title';

    const result = await request.query(query);

    res.json({
      success: true,
      data: { definitions: result.recordset }
    });
  } catch (error) {
    console.error('Error fetching KPI definitions:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve KPI definitions' }
    });
  }
});

// POST /api/v1/kpis/definitions - Create KPI definition
router.post('/definitions', requirePermission('reports:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const {
      title, description, category, metricType,
      targetValue, defaultWeightPercent, unit,
      departmentId, positionId
    } = req.body;

    if (!title || !metricType || targetValue === undefined) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Title, MetricType, and TargetValue are required' }
      });
      return;
    }

    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('DepartmentId', sql.UniqueIdentifier, departmentId || null)
      .input('PositionId', sql.UniqueIdentifier, positionId || null)
      .input('Title', sql.NVarChar, title)
      .input('Description', sql.NVarChar(sql.MAX), description || null)
      .input('Category', sql.NVarChar, category || 'Operational')
      .input('MetricType', sql.NVarChar, metricType)
      .input('TargetValue', sql.Decimal(18, 4), targetValue)
      .input('DefaultWeightPercent', sql.Decimal(5, 2), defaultWeightPercent || 20.0)
      .input('Unit', sql.NVarChar, unit || null)
      .input('CreatedBy', sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO dbo.KpiDefinitions (
          TenantId, DepartmentId, PositionId, Title, Description,
          Category, MetricType, TargetValue, DefaultWeightPercent, Unit, CreatedBy
        )
        OUTPUT INSERTED.Id
        VALUES (
          @TenantId, @DepartmentId, @PositionId, @Title, @Description,
          @Category, @MetricType, @TargetValue, @DefaultWeightPercent, @Unit, @CreatedBy
        )
      `);

    res.status(201).json({
      success: true,
      data: { id: result.recordset[0].Id, message: 'KPI definition created successfully' }
    });
  } catch (error) {
    console.error('Error creating KPI definition:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to create KPI definition' }
    });
  }
});

// PUT /api/v1/kpis/definitions/:id - Update KPI definition
router.put('/definitions/:id', requirePermission('reports:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { id } = req.params;
    const {
      title, description, category, metricType,
      targetValue, defaultWeightPercent, unit,
      departmentId, positionId
    } = req.body;

    await pool.request()
      .input('Id', sql.UniqueIdentifier, id)
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('DepartmentId', sql.UniqueIdentifier, departmentId || null)
      .input('PositionId', sql.UniqueIdentifier, positionId || null)
      .input('Title', sql.NVarChar, title)
      .input('Description', sql.NVarChar(sql.MAX), description || null)
      .input('Category', sql.NVarChar, category || 'Operational')
      .input('MetricType', sql.NVarChar, metricType)
      .input('TargetValue', sql.Decimal(18, 4), targetValue)
      .input('DefaultWeightPercent', sql.Decimal(5, 2), defaultWeightPercent)
      .input('Unit', sql.NVarChar, unit || null)
      .input('UpdatedBy', sql.UniqueIdentifier, userId)
      .query(`
        UPDATE dbo.KpiDefinitions
        SET DepartmentId = @DepartmentId, PositionId = @PositionId,
            Title = @Title, Description = @Description, Category = @Category,
            MetricType = @MetricType, TargetValue = @TargetValue,
            DefaultWeightPercent = @DefaultWeightPercent, Unit = @Unit,
            UpdatedAtUtc = GETUTCDATE(), UpdatedBy = @UpdatedBy
        WHERE Id = @Id AND TenantId = @TenantId AND IsDeleted = 0
      `);

    res.json({ success: true, message: 'KPI definition updated successfully' });
  } catch (error) {
    console.error('Error updating KPI definition:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to update KPI definition' }
    });
  }
});

// DELETE /api/v1/kpis/definitions/:id - Soft delete KPI definition
router.delete('/definitions/:id', requirePermission('reports:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { id } = req.params;

    await pool.request()
      .input('Id', sql.UniqueIdentifier, id)
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('UpdatedBy', sql.UniqueIdentifier, userId)
      .query(`
        UPDATE dbo.KpiDefinitions
        SET IsDeleted = 1, UpdatedAtUtc = GETUTCDATE(), UpdatedBy = @UpdatedBy
        WHERE Id = @Id AND TenantId = @TenantId
      `);

    res.json({ success: true, message: 'KPI definition deleted' });
  } catch (error) {
    console.error('Error deleting KPI definition:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to delete KPI definition' }
    });
  }
});

// ──────────────────────────────────────────────────────────────
// EMPLOYEE KPIS & TRACKING
// ──────────────────────────────────────────────────────────────

// GET /api/v1/kpis/employee - List employee KPIs
router.get('/employee', requirePermission('reports:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { employeeId, reviewPeriod, status, departmentId } = req.query;

    let query = `
      SELECT ek.Id, ek.TenantId, ek.EmployeeId, ek.KpiDefinitionId, ek.ReviewPeriod,
             ek.Title, ek.Description, ek.Category, ek.MetricType, ek.Unit,
             ek.WeightPercent, ek.TargetValue, ek.ActualValue, ek.AchievementScorePercent,
             ek.Status, ek.ManagerComment, ek.EvaluatedAtUtc, ek.CreatedAtUtc,
             e.EmployeeNo, e.FirstName, e.LastName, d.Name AS DepartmentName, p.Title AS PositionTitle
      FROM dbo.EmployeeKpis ek
      INNER JOIN dbo.Employees e ON ek.EmployeeId = e.Id
      INNER JOIN dbo.Departments d ON e.DepartmentId = d.Id
      LEFT JOIN dbo.Positions p ON e.PositionId = p.Id
      WHERE ek.TenantId = @TenantId AND ek.IsDeleted = 0
    `;

    const request = pool.request().input('TenantId', sql.UniqueIdentifier, tenantId);

    if (employeeId) {
      query += ' AND ek.EmployeeId = @EmployeeId';
      request.input('EmployeeId', sql.UniqueIdentifier, employeeId);
    }
    if (reviewPeriod) {
      query += ' AND ek.ReviewPeriod = @ReviewPeriod';
      request.input('ReviewPeriod', sql.NVarChar, reviewPeriod);
    }
    if (status) {
      query += ' AND ek.Status = @Status';
      request.input('Status', sql.NVarChar, status);
    }
    if (departmentId) {
      query += ' AND e.DepartmentId = @DepartmentId';
      request.input('DepartmentId', sql.UniqueIdentifier, departmentId);
    }

    query += ' ORDER BY ek.ReviewPeriod DESC, e.LastName, ek.Category, ek.Title';

    const result = await request.query(query);

    res.json({
      success: true,
      data: { kpis: result.recordset }
    });
  } catch (error) {
    console.error('Error fetching employee KPIs:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve employee KPIs' }
    });
  }
});

// POST /api/v1/kpis/employee - Assign KPI to employee
router.post('/employee', requirePermission('reports:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const {
      employeeId, kpiDefinitionId, reviewPeriod, title,
      description, category, metricType, unit,
      weightPercent, targetValue, actualValue
    } = req.body;

    if (!employeeId || !reviewPeriod || !title || targetValue === undefined) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'EmployeeId, ReviewPeriod, Title, and TargetValue are required' }
      });
      return;
    }

    const actual = actualValue || 0;
    const mType = metricType || 'Percentage';
    const achievementScore = computeKpiAchievement(mType, targetValue, actual);

    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, employeeId)
      .input('KpiDefinitionId', sql.UniqueIdentifier, kpiDefinitionId || null)
      .input('ReviewPeriod', sql.NVarChar, reviewPeriod)
      .input('Title', sql.NVarChar, title)
      .input('Description', sql.NVarChar(sql.MAX), description || null)
      .input('Category', sql.NVarChar, category || 'Operational')
      .input('MetricType', sql.NVarChar, mType)
      .input('Unit', sql.NVarChar, unit || null)
      .input('WeightPercent', sql.Decimal(5, 2), weightPercent || 20.0)
      .input('TargetValue', sql.Decimal(18, 4), targetValue)
      .input('ActualValue', sql.Decimal(18, 4), actual)
      .input('AchievementScorePercent', sql.Decimal(5, 2), achievementScore)
      .input('Status', sql.NVarChar, actual > 0 ? 'InProgress' : 'InProgress')
      .input('CreatedBy', sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO dbo.EmployeeKpis (
          TenantId, EmployeeId, KpiDefinitionId, ReviewPeriod, Title,
          Description, Category, MetricType, Unit, WeightPercent,
          TargetValue, ActualValue, AchievementScorePercent, Status, CreatedBy
        )
        OUTPUT INSERTED.Id
        VALUES (
          @TenantId, @EmployeeId, @KpiDefinitionId, @ReviewPeriod, @Title,
          @Description, @Category, @MetricType, @Unit, @WeightPercent,
          @TargetValue, @ActualValue, @AchievementScorePercent, @Status, @CreatedBy
        )
      `);

    res.status(201).json({
      success: true,
      data: { id: result.recordset[0].Id, message: 'Employee KPI assigned successfully' }
    });
  } catch (error) {
    console.error('Error assigning employee KPI:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to assign employee KPI' }
    });
  }
});

// PUT /api/v1/kpis/employee/:id - Update actual value / manager evaluation
router.put('/employee/:id', requirePermission('reports:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { id } = req.params;
    const { actualValue, managerComment, status, targetValue, weightPercent } = req.body;

    // Fetch existing KPI to get metricType and target
    const currentKpi = await pool.request()
      .input('Id', sql.UniqueIdentifier, id)
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`SELECT TargetValue, MetricType, ActualValue, WeightPercent FROM dbo.EmployeeKpis WHERE Id = @Id AND TenantId = @TenantId`);

    if (currentKpi.recordset.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'KPI record not found' } });
      return;
    }

    const row = currentKpi.recordset[0];
    const target = targetValue !== undefined ? targetValue : row.TargetValue;
    const actual = actualValue !== undefined ? actualValue : row.ActualValue;
    const weight = weightPercent !== undefined ? weightPercent : row.WeightPercent;
    const achievementScore = computeKpiAchievement(row.MetricType, target, actual);

    const newStatus = status || (actual >= target ? 'Evaluated' : 'InProgress');

    await pool.request()
      .input('Id', sql.UniqueIdentifier, id)
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('TargetValue', sql.Decimal(18, 4), target)
      .input('ActualValue', sql.Decimal(18, 4), actual)
      .input('WeightPercent', sql.Decimal(5, 2), weight)
      .input('AchievementScorePercent', sql.Decimal(5, 2), achievementScore)
      .input('Status', sql.NVarChar, newStatus)
      .input('ManagerComment', sql.NVarChar(sql.MAX), managerComment || null)
      .input('EvaluatedBy', sql.UniqueIdentifier, userId)
      .input('UpdatedBy', sql.UniqueIdentifier, userId)
      .query(`
        UPDATE dbo.EmployeeKpis
        SET TargetValue = @TargetValue, ActualValue = @ActualValue,
            WeightPercent = @WeightPercent, AchievementScorePercent = @AchievementScorePercent,
            Status = @Status, ManagerComment = COALESCE(@ManagerComment, ManagerComment),
            EvaluatedAtUtc = CASE WHEN @Status = 'Evaluated' THEN GETUTCDATE() ELSE EvaluatedAtUtc END,
            EvaluatedBy = @EvaluatedBy,
            UpdatedAtUtc = GETUTCDATE(), UpdatedBy = @UpdatedBy
        WHERE Id = @Id AND TenantId = @TenantId AND IsDeleted = 0
      `);

    res.json({
      success: true,
      data: {
        achievementScorePercent: achievementScore,
        status: newStatus,
        message: 'Employee KPI updated successfully'
      }
    });
  } catch (error) {
    console.error('Error updating employee KPI:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to update employee KPI' }
    });
  }
});

// DELETE /api/v1/kpis/employee/:id - Delete employee KPI
router.delete('/employee/:id', requirePermission('reports:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { id } = req.params;

    await pool.request()
      .input('Id', sql.UniqueIdentifier, id)
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('UpdatedBy', sql.UniqueIdentifier, userId)
      .query(`UPDATE dbo.EmployeeKpis SET IsDeleted = 1, UpdatedAtUtc = GETUTCDATE(), UpdatedBy = @UpdatedBy WHERE Id = @Id AND TenantId = @TenantId`);

    res.json({ success: true, message: 'Employee KPI deleted' });
  } catch (error) {
    console.error('Error deleting employee KPI:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to delete employee KPI' }
    });
  }
});

// GET /api/v1/kpis/summary/:employeeId - Overall summary of employee KPI achievement
router.get('/summary/:employeeId', requirePermission('reports:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { employeeId } = req.params;
    const { reviewPeriod } = req.query;

    let query = `
      SELECT ek.Id, ek.Title, ek.MetricType, ek.TargetValue, ek.ActualValue,
             ek.WeightPercent, ek.AchievementScorePercent, ek.Status, ek.Category
      FROM dbo.EmployeeKpis ek
      WHERE ek.EmployeeId = @EmployeeId AND ek.TenantId = @TenantId AND ek.IsDeleted = 0
    `;
    const request = pool.request()
      .input('EmployeeId', sql.UniqueIdentifier, employeeId)
      .input('TenantId', sql.UniqueIdentifier, tenantId);

    if (reviewPeriod) {
      query += ' AND ek.ReviewPeriod = @ReviewPeriod';
      request.input('ReviewPeriod', sql.NVarChar, reviewPeriod);
    }

    const result = await request.query(query);
    const kpiList = result.recordset.map((r: any) => ({
      metricType: r.MetricType,
      targetValue: Number(r.TargetValue),
      actualValue: Number(r.ActualValue),
      weightPercent: Number(r.WeightPercent)
    }));

    const weightedScore = computeWeightedKpiScore(kpiList);

    res.json({
      success: true,
      data: {
        employeeId,
        reviewPeriod: reviewPeriod || 'All',
        totalKpis: result.recordset.length,
        weightedScorePercent: weightedScore,
        kpis: result.recordset
      }
    });
  } catch (error) {
    console.error('Error fetching employee KPI summary:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to compute employee KPI summary' }
    });
  }
});

export default router;
