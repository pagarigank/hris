import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../../middleware/auth';
import { setTenantContext } from '../../middleware/tenantContext';
import { requirePermission } from '../../middleware/permissions';
import { parsePaginationQuery, buildPaginationMeta, addPaginationToQuery } from '../../middleware/pagination';
import sql from 'mssql';

const router = Router();

router.use(authMiddleware);
router.use(setTenantContext);

// GET /api/v1/hr-matrix/org-chart - Get organization chart
router.get('/org-chart', requirePermission('reports:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    
    // Get all employees with their supervisor relationships
    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        SELECT 
          e.Id, e.EmployeeNo, e.FirstName, e.LastName, e.MiddleName,
          e.ImmediateSupervisorId,
          d.Name AS DepartmentName, d.Id AS DepartmentId,
          p.Title AS PositionTitle,
          e.PhotoUrl
        FROM dbo.Employees e
        INNER JOIN dbo.Departments d ON e.DepartmentId = d.Id
        INNER JOIN dbo.Positions p ON e.PositionId = p.Id
        WHERE e.TenantId = @TenantId AND e.IsActive = 1 AND e.IsDeleted = 0
        ORDER BY d.Name, e.LastName, e.FirstName
      `);
    
    // Build org chart tree
    const employees = result.recordset;
    const employeeMap = new Map<string, any>();
    const roots: any[] = [];
    
    // Create employee map
    for (const emp of employees) {
      employeeMap.set(emp.Id, {
        ...emp,
        children: []
      });
    }
    
    // Build tree structure
    for (const emp of employees) {
      const employee = employeeMap.get(emp.Id);
      if (emp.ImmediateSupervisorId && employeeMap.has(emp.ImmediateSupervisorId)) {
        const supervisor = employeeMap.get(emp.ImmediateSupervisorId);
        supervisor.children.push(employee);
      } else {
        roots.push(employee);
      }
    }
    
    res.json({
      success: true,
      data: {
        orgChart: roots.length === 1 ? roots[0] : roots,
        totalEmployees: employees.length
      }
    });
  } catch (error) {
    console.error('Error getting org chart:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to retrieve organization chart'
      }
    });
  }
});

// POST /api/v1/hr-matrix/org-chart/snapshot - Save org chart snapshot
router.post('/org-chart/snapshot', requirePermission('reports:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    
    // Get current org chart structure
    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        SELECT 
          e.Id, e.EmployeeNo, e.FirstName, e.LastName,
          e.ImmediateSupervisorId,
          d.Name AS DepartmentName,
          p.Title AS PositionTitle
        FROM dbo.Employees e
        INNER JOIN dbo.Departments d ON e.DepartmentId = d.Id
        INNER JOIN dbo.Positions p ON e.PositionId = p.Id
        WHERE e.TenantId = @TenantId AND e.IsActive = 1 AND e.IsDeleted = 0
      `);
    
    const structureJson = JSON.stringify(result.recordset);
    
    // Save snapshot
    await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('SnapshotDate', sql.Date, new Date())
      .input('StructureJson', sql.NVarChar(sql.MAX), structureJson)
      .input('CreatedBy', sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO dbo.OrgChartSnapshots (TenantId, SnapshotDate, StructureJson, CreatedBy)
        VALUES (@TenantId, @SnapshotDate, @StructureJson, @CreatedBy)
      `);
    
    res.status(201).json({
      success: true,
      data: {
        message: 'Org chart snapshot saved successfully'
      }
    });
  } catch (error) {
    console.error('Error saving org chart snapshot:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to save org chart snapshot'
      }
    });
  }
});

// GET /api/v1/hr-matrix/headcount - Get headcount matrix
router.get('/headcount', requirePermission('reports:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { departmentId, startDate, endDate } = req.query;
    const pagination = parsePaginationQuery(req.query);
    
    let whereClause = 'WHERE hs.TenantId = @TenantId';
    const request = pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId);
    
    if (departmentId) {
      whereClause += ' AND hs.DepartmentId = @DepartmentId';
      request.input('DepartmentId', sql.UniqueIdentifier, departmentId);
    }
    
    if (startDate) {
      whereClause += ' AND hs.SnapshotDate >= @StartDate';
      request.input('StartDate', sql.Date, new Date(startDate as string));
    }
    
    if (endDate) {
      whereClause += ' AND hs.SnapshotDate <= @EndDate';
      request.input('EndDate', sql.Date, new Date(endDate as string));
    }
    
    // Count total
    const countResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`SELECT COUNT(*) AS total FROM dbo.HeadcountSnapshots hs ${whereClause}`);
    const total = countResult.recordset[0]?.total || 0;
    
    // Fetch page
    const selectQuery = `SELECT hs.SnapshotDate, d.Name AS DepartmentName, hs.HeadcountActive, hs.HeadcountHired, hs.HeadcountSeparated FROM dbo.HeadcountSnapshots hs INNER JOIN dbo.Departments d ON hs.DepartmentId = d.Id`;
    const fullQuery = addPaginationToQuery(selectQuery, whereClause, 'ORDER BY hs.SnapshotDate DESC, d.Name', pagination);
    const result = await request.query(fullQuery);
    
    // Also get current headcount from active employees
    const currentHeadcount = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        SELECT 
          d.Name AS DepartmentName,
          COUNT(*) AS Headcount,
          SUM(CASE WHEN e.EmploymentStatus = 'Regular' THEN 1 ELSE 0 END) AS RegularCount,
          SUM(CASE WHEN e.EmploymentStatus = 'Probationary' THEN 1 ELSE 0 END) AS ProbationaryCount,
          SUM(CASE WHEN e.EmploymentStatus = 'Contractual' THEN 1 ELSE 0 END) AS ContractualCount
        FROM dbo.Employees e
        INNER JOIN dbo.Departments d ON e.DepartmentId = d.Id
        WHERE e.TenantId = @TenantId AND e.IsActive = 1 AND e.IsDeleted = 0
        GROUP BY d.Name
        ORDER BY d.Name
      `);
    
    res.json({
      success: true,
      data: {
        headcountSnapshots: result.recordset,
        currentHeadcount: currentHeadcount.recordset,
        pagination: buildPaginationMeta(pagination.page, pagination.pageSize, total)
      }
    });
  } catch (error) {
    console.error('Error getting headcount:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to retrieve headcount data'
      }
    });
  }
});

// POST /api/v1/hr-matrix/headcount/snapshot - Generate headcount snapshot
router.post('/headcount/snapshot', requirePermission('reports:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    
    // Get current headcount by department
    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        SELECT 
          d.Id AS DepartmentId,
          d.Name AS DepartmentName,
          COUNT(CASE WHEN e.IsActive = 1 THEN 1 END) AS HeadcountActive,
          COUNT(CASE WHEN e.DateHired >= DATEADD(MONTH, -1, GETDATE()) THEN 1 END) AS HeadcountHired,
          COUNT(CASE WHEN e.DateSeparated >= DATEADD(MONTH, -1, GETDATE()) THEN 1 END) AS HeadcountSeparated
        FROM dbo.Departments d
        LEFT JOIN dbo.Employees e ON d.Id = e.DepartmentId AND e.IsDeleted = 0
        WHERE d.TenantId = @TenantId AND d.IsDeleted = 0
        GROUP BY d.Id, d.Name
        ORDER BY d.Name
      `);
    
    const snapshotDate = new Date();
    
    // Insert snapshots
    for (const row of result.recordset) {
      await pool.request()
        .input('TenantId', sql.UniqueIdentifier, tenantId)
        .input('SnapshotDate', sql.Date, snapshotDate)
        .input('DepartmentId', sql.UniqueIdentifier, row.DepartmentId)
        .input('HeadcountActive', sql.Int, row.HeadcountActive)
        .input('HeadcountHired', sql.Int, row.HeadcountHired)
        .input('HeadcountSeparated', sql.Int, row.HeadcountSeparated)
        .input('CreatedBy', sql.UniqueIdentifier, userId)
        .query(`
          INSERT INTO dbo.HeadcountSnapshots (
            TenantId, SnapshotDate, DepartmentId, HeadcountActive, HeadcountHired, HeadcountSeparated, CreatedBy
          )
          VALUES (
            @TenantId, @SnapshotDate, @DepartmentId, @HeadcountActive, @HeadcountHired, @HeadcountSeparated, @CreatedBy
          )
        `);
    }
    
    res.status(201).json({
      success: true,
      data: {
        departments: result.recordset.length,
        message: 'Headcount snapshot generated successfully'
      }
    });
  } catch (error) {
    console.error('Error generating headcount snapshot:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to generate headcount snapshot'
      }
    });
  }
});

// GET /api/v1/hr-matrix/competency - Get competency matrix
router.get('/competency', requirePermission('reports:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { departmentId, skillName } = req.query;
    const pagination = parsePaginationQuery(req.query);
    
    let whereClause = 'WHERE cm.TenantId = @TenantId AND cm.IsDeleted = 0';
    const request = pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId);
    
    if (departmentId) {
      whereClause += ' AND e.DepartmentId = @DepartmentId';
      request.input('DepartmentId', sql.UniqueIdentifier, departmentId);
    }
    
    if (skillName) {
      whereClause += ' AND cm.SkillName = @SkillName';
      request.input('SkillName', sql.NVarChar, skillName as string);
    }
    
    // Count total
    const countResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`SELECT COUNT(*) AS total FROM dbo.CompetencyMatrix cm INNER JOIN dbo.Employees e ON cm.EmployeeId = e.Id ${whereClause}`);
    const total = countResult.recordset[0]?.total || 0;
    
    // Fetch page
    const selectQuery = `SELECT cm.Id, cm.SkillName, cm.ProficiencyLevel, cm.AssessedDate, e.EmployeeNo, e.FirstName, e.LastName, d.Name AS DepartmentName FROM dbo.CompetencyMatrix cm INNER JOIN dbo.Employees e ON cm.EmployeeId = e.Id INNER JOIN dbo.Departments d ON e.DepartmentId = d.Id`;
    const fullQuery = addPaginationToQuery(selectQuery, whereClause, 'ORDER BY e.LastName, e.FirstName, cm.SkillName', pagination);
    const result = await request.query(fullQuery);
    
    // Get unique skills for matrix headers
    const skillsResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        SELECT DISTINCT SkillName
        FROM dbo.CompetencyMatrix
        WHERE TenantId = @TenantId AND IsDeleted = 0
        ORDER BY SkillName
      `);
    
    res.json({
      success: true,
      data: {
        competencyMatrix: result.recordset,
        skills: skillsResult.recordset.map((r: any) => r.SkillName),
        pagination: buildPaginationMeta(pagination.page, pagination.pageSize, total)
      }
    });
  } catch (error) {
    console.error('Error getting competency matrix:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to retrieve competency matrix'
      }
    });
  }
});

// POST /api/v1/hr-matrix/competency - Add/update competency assessment
router.post('/competency', requirePermission('reports:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { employeeId, skillName, proficiencyLevel, assessedDate } = req.body;
    
    if (!employeeId || !skillName || !proficiencyLevel) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing required fields'
        }
      });
      return;
    }
    
    if (proficiencyLevel < 1 || proficiencyLevel > 5) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Proficiency level must be between 1 and 5'
        }
      });
      return;
    }
    
    // Check if assessment exists
    const existingResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, employeeId)
      .input('SkillName', sql.NVarChar, skillName)
      .query(`
        SELECT Id FROM dbo.CompetencyMatrix
        WHERE TenantId = @TenantId AND EmployeeId = @EmployeeId AND SkillName = @SkillName AND IsDeleted = 0
      `);
    
    if (existingResult.recordset.length > 0) {
      // Update existing
      await pool.request()
        .input('Id', sql.UniqueIdentifier, existingResult.recordset[0].Id)
        .input('ProficiencyLevel', sql.Int, proficiencyLevel)
        .input('AssessedDate', sql.Date, assessedDate ? new Date(assessedDate) : new Date())
        .input('AssessedBy', sql.UniqueIdentifier, userId)
        .query(`
          UPDATE dbo.CompetencyMatrix
          SET ProficiencyLevel = @ProficiencyLevel, AssessedDate = @AssessedDate,
              AssessedBy = @AssessedBy, UpdatedAtUtc = GETUTCDATE()
          WHERE Id = @Id
        `);
    } else {
      // Insert new
      await pool.request()
        .input('TenantId', sql.UniqueIdentifier, tenantId)
        .input('EmployeeId', sql.UniqueIdentifier, employeeId)
        .input('SkillName', sql.NVarChar, skillName)
        .input('ProficiencyLevel', sql.Int, proficiencyLevel)
        .input('AssessedDate', sql.Date, assessedDate ? new Date(assessedDate) : new Date())
        .input('AssessedBy', sql.UniqueIdentifier, userId)
        .query(`
          INSERT INTO dbo.CompetencyMatrix (
            TenantId, EmployeeId, SkillName, ProficiencyLevel, AssessedDate, AssessedBy
          )
          VALUES (
            @TenantId, @EmployeeId, @SkillName, @ProficiencyLevel, @AssessedDate, @AssessedBy
          )
        `);
    }
    
    res.json({
      success: true,
      data: {
        message: 'Competency assessment saved successfully'
      }
    });
  } catch (error) {
    console.error('Error saving competency assessment:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to save competency assessment'
      }
    });
  }
});

// GET /api/v1/hr-matrix/performance - Get performance reviews
router.get('/performance', requirePermission('reports:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { departmentId, reviewPeriod, status } = req.query;
    const pagination = parsePaginationQuery(req.query);
    
    let whereClause = 'WHERE pr.TenantId = @TenantId AND pr.IsDeleted = 0';
    const request = pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId);
    
    if (departmentId) {
      whereClause += ' AND e.DepartmentId = @DepartmentId';
      request.input('DepartmentId', sql.UniqueIdentifier, departmentId);
    }
    
    if (reviewPeriod) {
      whereClause += ' AND pr.ReviewPeriod = @ReviewPeriod';
      request.input('ReviewPeriod', sql.NVarChar, reviewPeriod as string);
    }
    
    if (status) {
      whereClause += ' AND pr.Status = @Status';
      request.input('Status', sql.NVarChar, status as string);
    }
    
    // Count total
    const countResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`SELECT COUNT(*) AS total FROM dbo.PerformanceReviews pr INNER JOIN dbo.Employees e ON pr.EmployeeId = e.Id ${whereClause}`);
    const total = countResult.recordset[0]?.total || 0;
    
    // Fetch page
    const selectQuery = `SELECT pr.Id, pr.ReviewPeriod, pr.Rating, pr.Comments, pr.Status, e.EmployeeNo, e.FirstName, e.LastName, d.Name AS DepartmentName, r.FirstName AS ReviewerFirstName, r.LastName AS ReviewerLastName FROM dbo.PerformanceReviews pr INNER JOIN dbo.Employees e ON pr.EmployeeId = e.Id INNER JOIN dbo.Departments d ON e.DepartmentId = d.Id LEFT JOIN dbo.Employees r ON pr.ReviewerId = r.Id`;
    const fullQuery = addPaginationToQuery(selectQuery, whereClause, 'ORDER BY pr.ReviewPeriod DESC, e.LastName, e.FirstName', pagination);
    const result = await request.query(fullQuery);
    
    res.json({
      success: true,
      data: {
        performanceReviews: result.recordset,
        pagination: buildPaginationMeta(pagination.page, pagination.pageSize, total)
      }
    });
  } catch (error) {
    console.error('Error getting performance reviews:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to retrieve performance reviews'
      }
    });
  }
});

// POST /api/v1/hr-matrix/performance - Create performance review
router.post('/performance', requirePermission('reports:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { employeeId, reviewPeriod, rating, comments } = req.body;
    
    if (!employeeId || !reviewPeriod) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing required fields'
        }
      });
      return;
    }
    
    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, employeeId)
      .input('ReviewPeriod', sql.NVarChar, reviewPeriod)
      .input('Rating', sql.Decimal(3, 2), rating || null)
      .input('ReviewerId', sql.UniqueIdentifier, userId)
      .input('Comments', sql.NVarChar(sql.MAX), comments || null)
      .input('CreatedBy', sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO dbo.PerformanceReviews (
          TenantId, EmployeeId, ReviewPeriod, Rating, ReviewerId, Comments, CreatedBy
        )
        OUTPUT INSERTED.Id
        VALUES (
          @TenantId, @EmployeeId, @ReviewPeriod, @Rating, @ReviewerId, @Comments, @CreatedBy
        );
      `);
    
    res.status(201).json({
      success: true,
      data: {
        id: result.recordset[0].Id,
        message: 'Performance review created successfully'
      }
    });
  } catch (error) {
    console.error('Error creating performance review:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to create performance review'
      }
    });
  }
});

// GET /api/v1/hr-matrix/disciplinary - Get disciplinary records
router.get('/disciplinary', requirePermission('reports:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { departmentId, status, category } = req.query;
    const pagination = parsePaginationQuery(req.query);
    
    let whereClause = 'WHERE dr.TenantId = @TenantId AND dr.IsDeleted = 0';
    const request = pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId);
    
    if (departmentId) {
      whereClause += ' AND e.DepartmentId = @DepartmentId';
      request.input('DepartmentId', sql.UniqueIdentifier, departmentId);
    }
    
    if (status) {
      whereClause += ' AND dr.Status = @Status';
      request.input('Status', sql.NVarChar, status as string);
    }
    
    if (category) {
      whereClause += ' AND dr.Category = @Category';
      request.input('Category', sql.NVarChar, category as string);
    }
    
    // Count total
    const countResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`SELECT COUNT(*) AS total FROM dbo.DisciplinaryRecords dr INNER JOIN dbo.Employees e ON dr.EmployeeId = e.Id ${whereClause}`);
    const total = countResult.recordset[0]?.total || 0;
    
    // Fetch page
    const selectQuery = `SELECT dr.Id, dr.IncidentDate, dr.Category, dr.ActionTaken, dr.DueProcessNTEUrl, dr.DueProcessNODAUrl, dr.Status, e.EmployeeNo, e.FirstName, e.LastName, d.Name AS DepartmentName FROM dbo.DisciplinaryRecords dr INNER JOIN dbo.Employees e ON dr.EmployeeId = e.Id INNER JOIN dbo.Departments d ON e.DepartmentId = d.Id`;
    const fullQuery = addPaginationToQuery(selectQuery, whereClause, 'ORDER BY dr.IncidentDate DESC', pagination);
    const result = await request.query(fullQuery);
    
    res.json({
      success: true,
      data: {
        disciplinaryRecords: result.recordset,
        pagination: buildPaginationMeta(pagination.page, pagination.pageSize, total)
      }
    });
  } catch (error) {
    console.error('Error getting disciplinary records:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to retrieve disciplinary records'
      }
    });
  }
});

// POST /api/v1/hr-matrix/disciplinary - Create disciplinary record
router.post('/disciplinary', requirePermission('reports:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { employeeId, incidentDate, category, actionTaken, dueProcessNTEUrl, dueProcessNODAUrl } = req.body;
    
    if (!employeeId || !incidentDate || !category || !actionTaken) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing required fields'
        }
      });
      return;
    }
    
    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, employeeId)
      .input('IncidentDate', sql.Date, new Date(incidentDate))
      .input('Category', sql.NVarChar, category)
      .input('ActionTaken', sql.NVarChar, actionTaken)
      .input('DueProcessNTEUrl', sql.NVarChar, dueProcessNTEUrl || null)
      .input('DueProcessNODAUrl', sql.NVarChar, dueProcessNODAUrl || null)
      .input('CreatedBy', sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO dbo.DisciplinaryRecords (
          TenantId, EmployeeId, IncidentDate, Category, ActionTaken,
          DueProcessNTEUrl, DueProcessNODAUrl, CreatedBy
        )
        OUTPUT INSERTED.Id
        VALUES (
          @TenantId, @EmployeeId, @IncidentDate, @Category, @ActionTaken,
          @DueProcessNTEUrl, @DueProcessNODAUrl, @CreatedBy
        );
      `);
    
    res.status(201).json({
      success: true,
      data: {
        id: result.recordset[0].Id,
        message: 'Disciplinary record created successfully'
      }
    });
  } catch (error) {
    console.error('Error creating disciplinary record:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to create disciplinary record'
      }
    });
  }
});

// GET /api/v1/hr-matrix/attrition - Get attrition metrics
router.get('/attrition', requirePermission('reports:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { year, departmentId } = req.query;
    const pagination = parsePaginationQuery(req.query);
    
    let whereClause = 'WHERE am.TenantId = @TenantId';
    const request = pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId);
    
    if (year) {
      whereClause += ' AND am.Year = @Year';
      request.input('Year', sql.Int, Number(year));
    }
    
    if (departmentId) {
      whereClause += ' AND am.DepartmentId = @DepartmentId';
      request.input('DepartmentId', sql.UniqueIdentifier, departmentId);
    }
    
    // Count total
    const countResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`SELECT COUNT(*) AS total FROM dbo.AttritionMetrics am ${whereClause}`);
    const total = countResult.recordset[0]?.total || 0;
    
    // Fetch page
    const selectQuery = `SELECT am.Year, am.Month, am.VoluntarySeparations, am.InvoluntarySeparations, am.AttritionRatePercent, d.Name AS DepartmentName FROM dbo.AttritionMetrics am INNER JOIN dbo.Departments d ON am.DepartmentId = d.Id`;
    const fullQuery = addPaginationToQuery(selectQuery, whereClause, 'ORDER BY am.Year DESC, am.Month DESC, d.Name', pagination);
    const result = await request.query(fullQuery);
    
    // Calculate current attrition rate
    const currentAttrition = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        SELECT 
          d.Name AS DepartmentName,
          COUNT(CASE WHEN e.DateSeparated IS NOT NULL AND e.DateSeparated >= DATEADD(MONTH, -1, GETDATE()) THEN 1 END) AS Separations,
          COUNT(CASE WHEN e.IsActive = 1 THEN 1 END) AS CurrentHeadcount,
          CASE 
            WHEN COUNT(CASE WHEN e.IsActive = 1 THEN 1 END) > 0 
            THEN CAST(COUNT(CASE WHEN e.DateSeparated IS NOT NULL AND e.DateSeparated >= DATEADD(MONTH, -1, GETDATE()) THEN 1 END) AS FLOAT) / 
                 COUNT(CASE WHEN e.IsActive = 1 THEN 1 END) * 100
            ELSE 0 
          END AS AttritionRate
        FROM dbo.Employees e
        INNER JOIN dbo.Departments d ON e.DepartmentId = d.Id
        WHERE e.TenantId = @TenantId AND e.IsDeleted = 0
        GROUP BY d.Name
        ORDER BY d.Name
      `);
    
    res.json({
      success: true,
      data: {
        attritionMetrics: result.recordset,
        currentAttrition: currentAttrition.recordset,
        pagination: buildPaginationMeta(pagination.page, pagination.pageSize, total)
      }
    });
  } catch (error) {
    console.error('Error getting attrition metrics:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to retrieve attrition metrics'
      }
    });
  }
});

// POST /api/v1/hr-matrix/attrition/snapshot - Generate attrition metrics
router.post('/attrition/snapshot', requirePermission('reports:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { year, month } = req.body;
    
    const targetYear = year || new Date().getFullYear();
    const targetMonth = month || new Date().getMonth() + 1;
    
    // Calculate attrition by department for the month
    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Year', sql.Int, targetYear)
      .input('Month', sql.Int, targetMonth)
      .query(`
        WITH DepartmentStats AS (
          SELECT 
            d.Id AS DepartmentId,
            d.Name AS DepartmentName,
            COUNT(CASE 
              WHEN e.DateSeparated IS NOT NULL 
                   AND MONTH(e.DateSeparated) = @Month 
                   AND YEAR(e.DateSeparated) = @Year
                   AND e.SeparationReason IN ('Voluntary', 'Resignation')
              THEN 1 
            END) AS VoluntarySeparations,
            COUNT(CASE 
              WHEN e.DateSeparated IS NOT NULL 
                   AND MONTH(e.DateSeparated) = @Month 
                   AND YEAR(e.DateSeparated) = @Year
                   AND e.SeparationReason NOT IN ('Voluntary', 'Resignation')
              THEN 1 
            END) AS InvoluntarySeparations,
            COUNT(CASE WHEN e.IsActive = 1 THEN 1 END) AS CurrentHeadcount
          FROM dbo.Departments d
          LEFT JOIN dbo.Employees e ON d.Id = e.DepartmentId AND e.IsDeleted = 0
          WHERE d.TenantId = @TenantId AND d.IsDeleted = 0
          GROUP BY d.Id, d.Name
        )
        SELECT 
          DepartmentId,
          DepartmentName,
          VoluntarySeparations,
          InvoluntarySeparations,
          CurrentHeadcount,
          CASE 
            WHEN CurrentHeadcount > 0 
            THEN CAST((VoluntarySeparations + InvoluntarySeparations) AS FLOAT) / CurrentHeadcount * 100
            ELSE 0 
          END AS AttritionRatePercent
        FROM DepartmentStats
        ORDER BY DepartmentName
      `);
    
    // Insert attrition metrics
    for (const row of result.recordset) {
      await pool.request()
        .input('TenantId', sql.UniqueIdentifier, tenantId)
        .input('Year', sql.Int, targetYear)
        .input('Month', sql.Int, targetMonth)
        .input('DepartmentId', sql.UniqueIdentifier, row.DepartmentId)
        .input('VoluntarySeparations', sql.Int, row.VoluntarySeparations)
        .input('InvoluntarySeparations', sql.Int, row.InvoluntarySeparations)
        .input('AttritionRatePercent', sql.Decimal(5, 2), row.AttritionRatePercent)
        .input('CreatedBy', sql.UniqueIdentifier, userId)
        .query(`
          MERGE dbo.AttritionMetrics AS target
          USING (SELECT @TenantId AS TenantId, @Year AS Year, @Month AS Month, @DepartmentId AS DepartmentId) AS source
          ON target.TenantId = source.TenantId AND target.Year = source.Year 
              AND target.Month = source.Month AND target.DepartmentId = source.DepartmentId
          WHEN MATCHED THEN
            UPDATE SET 
              VoluntarySeparations = @VoluntarySeparations,
              InvoluntarySeparations = @InvoluntarySeparations,
              AttritionRatePercent = @AttritionRatePercent
          WHEN NOT MATCHED THEN
            INSERT (TenantId, Year, Month, DepartmentId, VoluntarySeparations, InvoluntarySeparations, AttritionRatePercent, CreatedBy)
            VALUES (@TenantId, @Year, @Month, @DepartmentId, @VoluntarySeparations, @InvoluntarySeparations, @AttritionRatePercent, @CreatedBy);
        `);
    }
    
    res.status(201).json({
      success: true,
      data: {
        departments: result.recordset.length,
        year: targetYear,
        month: targetMonth,
        message: 'Attrition metrics generated successfully'
      }
    });
  } catch (error) {
    console.error('Error generating attrition metrics:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to generate attrition metrics'
      }
    });
  }
});

// GET /api/v1/hr-matrix/dashboard - Get HR dashboard summary
router.get('/dashboard', requirePermission('reports:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    
    // Get current headcount
    const headcountResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        SELECT 
          COUNT(*) AS TotalEmployees,
          SUM(CASE WHEN IsActive = 1 THEN 1 ELSE 0 END) AS ActiveEmployees,
          SUM(CASE WHEN EmploymentStatus = 'Regular' THEN 1 ELSE 0 END) AS RegularEmployees,
          SUM(CASE WHEN EmploymentStatus = 'Probationary' THEN 1 ELSE 0 END) AS ProbationaryEmployees,
          SUM(CASE WHEN EmploymentStatus = 'Contractual' THEN 1 ELSE 0 END) AS ContractualEmployees,
          SUM(CASE WHEN DateHired >= DATEADD(MONTH, -1, GETDATE()) THEN 1 ELSE 0 END) AS NewHiresLastMonth,
          SUM(CASE WHEN DateSeparated >= DATEADD(MONTH, -1, GETDATE()) THEN 1 ELSE 0 END) AS SeparationsLastMonth
        FROM dbo.Employees
        WHERE TenantId = @TenantId AND IsDeleted = 0
      `);
    
    // Get departments count
    const deptCountResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`SELECT COUNT(*) AS DepartmentCount FROM dbo.Departments WHERE TenantId = @TenantId AND IsDeleted = 0`);
    
    // Get headcount by department (for bar chart)
    const headcountByDeptResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        SELECT 
          d.Name AS DepartmentName,
          COUNT(e.Id) AS Headcount
        FROM dbo.Departments d
        LEFT JOIN dbo.Employees e ON d.Id = e.DepartmentId AND e.IsActive = 1 AND e.IsDeleted = 0
        WHERE d.TenantId = @TenantId AND d.IsDeleted = 0
        GROUP BY d.Name
        ORDER BY COUNT(e.Id) DESC
      `);
    
    // Get employment status breakdown (for pie chart)
    const employmentStatusResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        SELECT 
          EmploymentStatus AS name,
          COUNT(*) AS value
        FROM dbo.Employees
        WHERE TenantId = @TenantId AND IsDeleted = 0 AND IsActive = 1
        GROUP BY EmploymentStatus
        ORDER BY COUNT(*) DESC
      `);
    
    // Get pending leave requests
    const leaveResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        SELECT COUNT(*) AS PendingLeaveRequests
        FROM dbo.LeaveRequests
        WHERE TenantId = @TenantId AND Status = 'Pending' AND IsDeleted = 0
      `);
    
    // Get pending overtime requests
    const overtimeResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        SELECT COUNT(*) AS PendingOvertimeRequests
        FROM dbo.OvertimeRequests
        WHERE TenantId = @TenantId AND Status = 'Pending' AND IsDeleted = 0
      `);
    
    // Get current payroll status
    const payrollResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        SELECT TOP 1 Status AS CurrentPayrollStatus
        FROM dbo.PayrollRuns
        WHERE TenantId = @TenantId AND IsDeleted = 0
        ORDER BY CreatedAtUtc DESC
      `);
    
    // Get attendance summary for today
    const attendanceResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        SELECT 
          COUNT(CASE WHEN LogType = 'TimeIn' THEN 1 END) AS ClockInsToday
        FROM dbo.AttendanceLogs
        WHERE TenantId = @TenantId 
              AND CAST(LogTimestampUtc AS DATE) = CAST(GETUTCDATE() AS DATE)
      `);
    
    res.json({
      success: true,
      data: {
        headcount: headcountResult.recordset[0],
        departmentCount: deptCountResult.recordset[0].DepartmentCount,
        headcountByDepartment: headcountByDeptResult.recordset,
        employmentStatusBreakdown: employmentStatusResult.recordset,
        pendingLeaveRequests: leaveResult.recordset[0].PendingLeaveRequests,
        pendingOvertimeRequests: overtimeResult.recordset[0].PendingOvertimeRequests,
        currentPayrollStatus: payrollResult.recordset.length > 0 ? payrollResult.recordset[0].CurrentPayrollStatus : null,
        clockInsToday: attendanceResult.recordset[0].ClockInsToday
      }
    });
  } catch (error) {
    console.error('Error getting HR dashboard:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to retrieve HR dashboard'
      }
    });
  }
});

export default router;
