import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../../middleware/auth';
import { setTenantContext } from '../../middleware/tenantContext';
import { requirePermission } from '../../middleware/permissions';
import { logAuditEvent, extractIp } from '../../middleware/auditLog';
import { encrypt, decrypt, encryptPiiFields, decryptPiiRows, PII_FIELDS } from '../../utils/encryption';
import sql from 'mssql';

const router = Router();

// Apply auth and tenant context middleware to all routes
router.use(authMiddleware);
router.use(setTenantContext);

// ──────────────────────────────────────────────────────────────
// DEPARTMENTS CRUD
// ──────────────────────────────────────────────────────────────

// GET /api/v1/employees/departments - List departments
router.get('/departments', requirePermission('employee:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    
    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        SELECT Id, Name, Code, ParentDepartmentId 
        FROM dbo.Departments 
        WHERE TenantId = @TenantId AND IsDeleted = 0 
        ORDER BY Name
      `);
    
    res.json({
      success: true,
      data: { departments: result.recordset }
    });
  } catch (error) {
    console.error('Error listing departments:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve departments' }
    });
  }
});

// POST /api/v1/employees/departments - Create department
router.post('/departments', requirePermission('employee:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { name, code, parentDepartmentId } = req.body;

    if (!name || !code) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Name and Code are required' }
      });
      return;
    }

    // Check duplicate code
    const dupCheck = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Code', sql.NVarChar, code)
      .query('SELECT Id FROM dbo.Departments WHERE TenantId = @TenantId AND Code = @Code AND IsDeleted = 0');

    if (dupCheck.recordset.length > 0) {
      res.status(409).json({
        success: false,
        error: { code: 'DUPLICATE', message: 'Department code already exists' }
      });
      return;
    }

    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Name', sql.NVarChar, name)
      .input('Code', sql.NVarChar, code)
      .input('ParentDepartmentId', sql.UniqueIdentifier, parentDepartmentId || null)
      .input('CreatedBy', sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO dbo.Departments (TenantId, Name, Code, ParentDepartmentId, CreatedBy)
        OUTPUT INSERTED.Id
        VALUES (@TenantId, @Name, @Code, @ParentDepartmentId, @CreatedBy);
      `);

    const newId = result.recordset[0].Id;

    await logAuditEvent(pool, {
      tenantId: tenantId!,
      userId,
      action: 'CREATE',
      entityName: 'Department',
      entityId: newId,
      afterJson: { name, code, parentDepartmentId },
      ipAddress: extractIp(req)
    });

    res.status(201).json({
      success: true,
      data: { id: newId, message: 'Department created successfully' }
    });
  } catch (error) {
    console.error('Error creating department:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to create department' }
    });
  }
});

// PUT /api/v1/employees/departments/:id - Update department
router.put('/departments/:id', requirePermission('employee:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { id } = req.params;
    const { name, code, parentDepartmentId } = req.body;

    const existing = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, id)
      .query('SELECT Id FROM dbo.Departments WHERE Id = @Id AND TenantId = @TenantId AND IsDeleted = 0');

    if (existing.recordset.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Department not found' }
      });
      return;
    }

    // Check duplicate code (excluding self)
    if (code) {
      const dupCheck = await pool.request()
        .input('TenantId', sql.UniqueIdentifier, tenantId)
        .input('Code', sql.NVarChar, code)
        .input('Id', sql.UniqueIdentifier, id)
        .query('SELECT Id FROM dbo.Departments WHERE TenantId = @TenantId AND Code = @Code AND Id != @Id AND IsDeleted = 0');

      if (dupCheck.recordset.length > 0) {
        res.status(409).json({
          success: false,
          error: { code: 'DUPLICATE', message: 'Department code already exists' }
        });
        return;
      }
    }

    await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, id)
      .input('Name', sql.NVarChar, name)
      .input('Code', sql.NVarChar, code)
      .input('ParentDepartmentId', sql.UniqueIdentifier, parentDepartmentId || null)
      .input('UpdatedBy', sql.UniqueIdentifier, userId)
      .query(`
        UPDATE dbo.Departments SET
          Name = @Name,
          Code = @Code,
          ParentDepartmentId = @ParentDepartmentId,
          UpdatedAtUtc = GETUTCDATE(),
          UpdatedBy = @UpdatedBy
        WHERE Id = @Id AND TenantId = @TenantId
      `);

    await logAuditEvent(pool, {
      tenantId: tenantId!,
      userId,
      action: 'UPDATE',
      entityName: 'Department',
      entityId: id as string,
      afterJson: { name, code, parentDepartmentId },
      ipAddress: extractIp(req)
    });

    res.json({
      success: true,
      data: { message: 'Department updated successfully' }
    });
  } catch (error) {
    console.error('Error updating department:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to update department' }
    });
  }
});

// DELETE /api/v1/employees/departments/:id - Soft delete department
router.delete('/departments/:id', requirePermission('employee:delete'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { id } = req.params;

    const existing = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, id)
      .query('SELECT Id FROM dbo.Departments WHERE Id = @Id AND TenantId = @TenantId AND IsDeleted = 0');

    if (existing.recordset.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Department not found' }
      });
      return;
    }

    // Check for employees using this department
    const empCheck = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, id)
      .query('SELECT COUNT(*) AS Cnt FROM dbo.Employees WHERE DepartmentId = @Id AND TenantId = @TenantId AND IsDeleted = 0');

    if (empCheck.recordset[0].Cnt > 0) {
      res.status(409).json({
        success: false,
        error: { code: 'IN_USE', message: 'Cannot delete department with assigned employees' }
      });
      return;
    }

    await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, id)
      .input('UpdatedBy', sql.UniqueIdentifier, userId)
      .query(`
        UPDATE dbo.Departments SET
          IsDeleted = 1,
          UpdatedAtUtc = GETUTCDATE(),
          UpdatedBy = @UpdatedBy
        WHERE Id = @Id AND TenantId = @TenantId
      `);

    await logAuditEvent(pool, {
      tenantId: tenantId!,
      userId,
      action: 'DELETE',
      entityName: 'Department',
      entityId: id as string,
      ipAddress: extractIp(req)
    });

    res.json({
      success: true,
      data: { message: 'Department deleted successfully' }
    });
  } catch (error) {
    console.error('Error deleting department:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to delete department' }
    });
  }
});

// ──────────────────────────────────────────────────────────────
// POSITIONS CRUD
// ──────────────────────────────────────────────────────────────

// GET /api/v1/employees/positions - List positions
router.get('/positions', requirePermission('employee:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { departmentId } = req.query;
    
    let query = `
      SELECT p.Id, p.Title, p.DepartmentId, p.JobGrade, p.SalaryGradeMin, p.SalaryGradeMax,
             d.Name AS DepartmentName
      FROM dbo.Positions p
      INNER JOIN dbo.Departments d ON p.DepartmentId = d.Id
      WHERE p.TenantId = @TenantId AND p.IsDeleted = 0
    `;
    
    const request = pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId);
    
    if (departmentId) {
      query += ' AND p.DepartmentId = @DepartmentId';
      request.input('DepartmentId', sql.UniqueIdentifier, departmentId);
    }
    
    query += ' ORDER BY p.Title';
    
    const result = await request.query(query);
    
    res.json({
      success: true,
      data: { positions: result.recordset }
    });
  } catch (error) {
    console.error('Error listing positions:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve positions' }
    });
  }
});

// POST /api/v1/employees/positions - Create position
router.post('/positions', requirePermission('employee:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { title, departmentId, jobGrade, salaryGradeMin, salaryGradeMax } = req.body;

    if (!title || !departmentId) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Title and DepartmentId are required' }
      });
      return;
    }

    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Title', sql.NVarChar, title)
      .input('DepartmentId', sql.UniqueIdentifier, departmentId)
      .input('JobGrade', sql.NVarChar, jobGrade || null)
      .input('SalaryGradeMin', sql.Decimal(18, 4), salaryGradeMin || null)
      .input('SalaryGradeMax', sql.Decimal(18, 4), salaryGradeMax || null)
      .input('CreatedBy', sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO dbo.Positions (TenantId, Title, DepartmentId, JobGrade, SalaryGradeMin, SalaryGradeMax, CreatedBy)
        OUTPUT INSERTED.Id
        VALUES (@TenantId, @Title, @DepartmentId, @JobGrade, @SalaryGradeMin, @SalaryGradeMax, @CreatedBy);
      `);

    const newId = result.recordset[0].Id;

    await logAuditEvent(pool, {
      tenantId: tenantId!,
      userId,
      action: 'CREATE',
      entityName: 'Position',
      entityId: newId,
      afterJson: { title, departmentId, jobGrade, salaryGradeMin, salaryGradeMax },
      ipAddress: extractIp(req)
    });

    res.status(201).json({
      success: true,
      data: { id: newId, message: 'Position created successfully' }
    });
  } catch (error) {
    console.error('Error creating position:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to create position' }
    });
  }
});

// PUT /api/v1/employees/positions/:id - Update position
router.put('/positions/:id', requirePermission('employee:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { id } = req.params;
    const { title, departmentId, jobGrade, salaryGradeMin, salaryGradeMax } = req.body;

    const existing = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, id)
      .query('SELECT Id FROM dbo.Positions WHERE Id = @Id AND TenantId = @TenantId AND IsDeleted = 0');

    if (existing.recordset.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Position not found' }
      });
      return;
    }

    await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, id)
      .input('Title', sql.NVarChar, title)
      .input('DepartmentId', sql.UniqueIdentifier, departmentId)
      .input('JobGrade', sql.NVarChar, jobGrade || null)
      .input('SalaryGradeMin', sql.Decimal(18, 4), salaryGradeMin || null)
      .input('SalaryGradeMax', sql.Decimal(18, 4), salaryGradeMax || null)
      .input('UpdatedBy', sql.UniqueIdentifier, userId)
      .query(`
        UPDATE dbo.Positions SET
          Title = @Title,
          DepartmentId = @DepartmentId,
          JobGrade = @JobGrade,
          SalaryGradeMin = @SalaryGradeMin,
          SalaryGradeMax = @SalaryGradeMax,
          UpdatedAtUtc = GETUTCDATE(),
          UpdatedBy = @UpdatedBy
        WHERE Id = @Id AND TenantId = @TenantId
      `);

    await logAuditEvent(pool, {
      tenantId: tenantId!,
      userId,
      action: 'UPDATE',
      entityName: 'Position',
      entityId: id as string,
      afterJson: { title, departmentId, jobGrade, salaryGradeMin, salaryGradeMax },
      ipAddress: extractIp(req)
    });

    res.json({
      success: true,
      data: { message: 'Position updated successfully' }
    });
  } catch (error) {
    console.error('Error updating position:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to update position' }
    });
  }
});

// DELETE /api/v1/employees/positions/:id - Soft delete position
router.delete('/positions/:id', requirePermission('employee:delete'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { id } = req.params;

    const existing = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, id)
      .query('SELECT Id FROM dbo.Positions WHERE Id = @Id AND TenantId = @TenantId AND IsDeleted = 0');

    if (existing.recordset.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Position not found' }
      });
      return;
    }

    // Check for employees using this position
    const empCheck = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, id)
      .query('SELECT COUNT(*) AS Cnt FROM dbo.Employees WHERE PositionId = @Id AND TenantId = @TenantId AND IsDeleted = 0');

    if (empCheck.recordset[0].Cnt > 0) {
      res.status(409).json({
        success: false,
        error: { code: 'IN_USE', message: 'Cannot delete position with assigned employees' }
      });
      return;
    }

    await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, id)
      .input('UpdatedBy', sql.UniqueIdentifier, userId)
      .query(`
        UPDATE dbo.Positions SET
          IsDeleted = 1,
          UpdatedAtUtc = GETUTCDATE(),
          UpdatedBy = @UpdatedBy
        WHERE Id = @Id AND TenantId = @TenantId
      `);

    await logAuditEvent(pool, {
      tenantId: tenantId!,
      userId,
      action: 'DELETE',
      entityName: 'Position',
      entityId: id as string,
      ipAddress: extractIp(req)
    });

    res.json({
      success: true,
      data: { message: 'Position deleted successfully' }
    });
  } catch (error) {
    console.error('Error deleting position:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to delete position' }
    });
  }
});

// ──────────────────────────────────────────────────────────────
// EMPLOYEES CRUD
// ──────────────────────────────────────────────────────────────

// GET /api/v1/employees - List employees (with server-side search)
router.get('/', requirePermission('employee:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { page = 1, pageSize = 20, departmentId, status, search } = req.query;
    
    const offset = (Number(page) - 1) * Number(pageSize);
    const limit = Math.min(Number(pageSize), 100);
    
    let query = `
      SELECT 
        e.Id, e.EmployeeNo, e.FirstName, e.MiddleName, e.LastName, e.Suffix,
        e.BirthDate, e.Gender, e.CivilStatus, e.Nationality,
        e.PhilSysNo, e.TIN, e.SssNo, e.PhilHealthNo, e.PagIbigNo,
        e.Email, e.MobileNumber, e.Address,
        e.EmploymentStatus, e.DateHired, e.DateRegularized,
        e.DateSeparated, e.SeparationReason,
        e.DepartmentId, e.PositionId, e.ImmediateSupervisorId,
        e.BasicSalary, e.PayFrequency,
        e.BankName, e.BankAccountNo, e.PhotoUrl, e.IsActive,
        d.Name AS DepartmentName, p.Title AS PositionTitle
      FROM dbo.Employees e
      INNER JOIN dbo.Departments d ON e.DepartmentId = d.Id
      INNER JOIN dbo.Positions p ON e.PositionId = p.Id
      WHERE e.TenantId = @TenantId AND e.IsDeleted = 0
    `;
    
    const request = pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Offset', sql.Int, offset)
      .input('Limit', sql.Int, limit);
    
    if (search && typeof search === 'string' && search.trim()) {
      query += ` AND (
        e.FirstName LIKE @Search OR e.LastName LIKE @Search OR 
        e.EmployeeNo LIKE @Search OR e.Email LIKE @Search OR
        e.MiddleName LIKE @Search
      )`;
      request.input('Search', sql.NVarChar, `%${search.trim()}%`);
    }
    
    if (departmentId) {
      query += ' AND e.DepartmentId = @DepartmentId';
      request.input('DepartmentId', sql.UniqueIdentifier, departmentId);
    }
    
    if (status) {
      query += ' AND e.EmploymentStatus = @Status';
      request.input('Status', sql.NVarChar, status);
    }
    
    // Get total count
    const countQuery = query.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) AS Total FROM');
    const countResult = await request.query(countQuery);
    const total = countResult.recordset[0].Total;
    
    // Get paginated results
    query += ' ORDER BY e.LastName, e.FirstName OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY';
    const result = await request.query(query);
    
    // Decrypt PII fields for response (RA 10173 compliance)
    const decryptedEmployees = decryptPiiRows(result.recordset);
    
    res.json({
      success: true,
      data: {
        employees: decryptedEmployees,
        pagination: {
          page: Number(page),
          pageSize: limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error listing employees:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to retrieve employees'
      }
    });
  }
});

// GET /api/v1/employees/:id - Get employee by ID
router.get('/:id', requirePermission('employee:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { id } = req.params;
    
    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, id)
      .query(`
        SELECT 
          e.*,
          d.Name AS DepartmentName, p.Title AS PositionTitle,
          s.FirstName AS SupervisorFirstName, s.LastName AS SupervisorLastName
        FROM dbo.Employees e
        INNER JOIN dbo.Departments d ON e.DepartmentId = d.Id
        INNER JOIN dbo.Positions p ON e.PositionId = p.Id
        LEFT JOIN dbo.Employees s ON e.ImmediateSupervisorId = s.Id
        WHERE e.Id = @Id AND e.TenantId = @TenantId AND e.IsDeleted = 0
      `);
    
    if (result.recordset.length === 0) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Employee not found'
        }
      });
      return;
    }
    
    // Decrypt PII fields for response (RA 10173 compliance)
    const decryptedEmployee = decryptPiiRows(result.recordset)[0];
    
    res.json({
      success: true,
      data: {
        employee: decryptedEmployee
      }
    });
  } catch (error) {
    console.error('Error getting employee:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to retrieve employee'
      }
    });
  }
});

// POST /api/v1/employees - Create employee
router.post('/', requirePermission('employee:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    
    const {
      employeeNo, firstName, middleName, lastName, suffix,
      birthDate, gender, civilStatus, nationality,
      philSysNo, tin, sssNo, philHealthNo, pagIbigNo,
      email, mobileNumber, address,
      employmentStatus, dateHired, dateRegularized,
      departmentId, positionId,
      immediateSupervisorId, basicSalary, payFrequency,
      bankName, bankAccountNo, photoUrl, isActive
    } = req.body;
    
    // Validate required fields
    if (!employeeNo || !firstName || !lastName || !dateHired || !departmentId || !positionId || !basicSalary) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing required fields'
        }
      });
      return;
    }
    
    // Check for duplicate employee number
    const duplicateCheck = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeNo', sql.NVarChar, employeeNo)
      .query('SELECT Id FROM dbo.Employees WHERE TenantId = @TenantId AND EmployeeNo = @EmployeeNo AND IsDeleted = 0');
    
    if (duplicateCheck.recordset.length > 0) {
      res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE',
          message: 'Employee number already exists'
        }
      });
      return;
    }
    
    // Encrypt PII fields before storing (RA 10173 compliance)
    const encryptedPii = {
      philSysNo: philSysNo ? encrypt(philSysNo) : null,
      tin: tin ? encrypt(tin) : null,
      sssNo: sssNo ? encrypt(sssNo) : null,
      philHealthNo: philHealthNo ? encrypt(philHealthNo) : null,
      pagIbigNo: pagIbigNo ? encrypt(pagIbigNo) : null,
    };
    
    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeNo', sql.NVarChar, employeeNo)
      .input('FirstName', sql.NVarChar, firstName)
      .input('MiddleName', sql.NVarChar, middleName || null)
      .input('LastName', sql.NVarChar, lastName)
      .input('Suffix', sql.NVarChar, suffix || null)
      .input('BirthDate', sql.Date, birthDate ? new Date(birthDate) : null)
      .input('Gender', sql.NVarChar, gender || null)
      .input('CivilStatus', sql.NVarChar, civilStatus || null)
      .input('Nationality', sql.NVarChar, nationality || null)
      .input('PhilSysNo', sql.NVarChar, encryptedPii.philSysNo)
      .input('TIN', sql.NVarChar, encryptedPii.tin)
      .input('SssNo', sql.NVarChar, encryptedPii.sssNo)
      .input('PhilHealthNo', sql.NVarChar, encryptedPii.philHealthNo)
      .input('PagIbigNo', sql.NVarChar, encryptedPii.pagIbigNo)
      .input('Email', sql.NVarChar, email || null)
      .input('MobileNumber', sql.NVarChar, mobileNumber || null)
      .input('Address', sql.NVarChar, address || null)
      .input('EmploymentStatus', sql.NVarChar, employmentStatus || 'Probationary')
      .input('DateHired', sql.Date, new Date(dateHired))
      .input('DateRegularized', sql.Date, dateRegularized ? new Date(dateRegularized) : null)
      .input('DepartmentId', sql.UniqueIdentifier, departmentId)
      .input('PositionId', sql.UniqueIdentifier, positionId)
      .input('ImmediateSupervisorId', sql.UniqueIdentifier, immediateSupervisorId || null)
      .input('BasicSalary', sql.Decimal(18, 4), basicSalary)
      .input('PayFrequency', sql.NVarChar, payFrequency || 'Monthly')
      .input('BankName', sql.NVarChar, bankName || null)
      .input('BankAccountNo', sql.NVarChar, bankAccountNo || null)
      .input('PhotoUrl', sql.NVarChar, photoUrl || null)
      .input('IsActive', sql.Bit, isActive !== undefined ? isActive : true)
      .input('CreatedBy', sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO dbo.Employees (
          TenantId, EmployeeNo, FirstName, MiddleName, LastName, Suffix,
          BirthDate, Gender, CivilStatus, Nationality,
          PhilSysNo, TIN, SssNo, PhilHealthNo, PagIbigNo,
          Email, MobileNumber, Address,
          EmploymentStatus, DateHired, DateRegularized,
          DepartmentId, PositionId,
          ImmediateSupervisorId, BasicSalary, PayFrequency,
          BankName, BankAccountNo, PhotoUrl, IsActive, CreatedBy
        )
        OUTPUT INSERTED.Id
        VALUES (
          @TenantId, @EmployeeNo, @FirstName, @MiddleName, @LastName, @Suffix,
          @BirthDate, @Gender, @CivilStatus, @Nationality,
          @PhilSysNo, @TIN, @SssNo, @PhilHealthNo, @PagIbigNo,
          @Email, @MobileNumber, @Address,
          @EmploymentStatus, @DateHired, @DateRegularized,
          @DepartmentId, @PositionId,
          @ImmediateSupervisorId, @BasicSalary, @PayFrequency,
          @BankName, @BankAccountNo, @PhotoUrl, @IsActive, @CreatedBy
        );
      `);
    
    const newId = result.recordset[0].Id;
    
    await logAuditEvent(pool, {
      tenantId: tenantId!,
      userId,
      action: 'CREATE',
      entityName: 'Employee',
      entityId: newId,
      afterJson: { employeeNo, firstName, lastName, departmentId, positionId, basicSalary, employmentStatus },
      ipAddress: extractIp(req)
    });
    
    res.status(201).json({
      success: true,
      data: {
        id: newId,
        message: 'Employee created successfully'
      }
    });
  } catch (error) {
    console.error('Error creating employee:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to create employee'
      }
    });
  }
});

// PUT /api/v1/employees/:id - Update employee (with employment history recording)
router.put('/:id', requirePermission('employee:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { id } = req.params;
    
    const {
      firstName, middleName, lastName, suffix,
      birthDate, gender, civilStatus, nationality,
      philSysNo, tin, sssNo, philHealthNo, pagIbigNo,
      email, mobileNumber, address,
      employmentStatus, dateHired, dateRegularized,
      dateSeparated, separationReason,
      departmentId, positionId,
      immediateSupervisorId, basicSalary, payFrequency,
      bankName, bankAccountNo, photoUrl, isActive
    } = req.body;
    
    // Check if employee exists and get current values for history
    const existingCheck = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, id)
      .query(`
        SELECT Id, EmploymentStatus, DepartmentId, PositionId, BasicSalary, PayFrequency,
               ImmediateSupervisorId, DateRegularized, IsActive
        FROM dbo.Employees 
        WHERE Id = @Id AND TenantId = @TenantId AND IsDeleted = 0
      `);
    
    if (existingCheck.recordset.length === 0) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Employee not found'
        }
      });
      return;
    }

    const old = existingCheck.recordset[0];

    // Record employment history for significant changes
    const changes: Record<string, any> = {};
    if (employmentStatus && employmentStatus !== old.EmploymentStatus) changes.EmploymentStatus = { old: old.EmploymentStatus, new: employmentStatus };
    if (departmentId && departmentId !== old.DepartmentId) changes.DepartmentId = { old: old.DepartmentId, new: departmentId };
    if (positionId && positionId !== old.PositionId) changes.PositionId = { old: old.PositionId, new: positionId };
    if (basicSalary !== undefined && Number(basicSalary) !== Number(old.BasicSalary)) changes.BasicSalary = { old: old.BasicSalary, new: basicSalary };
    if (payFrequency && payFrequency !== old.PayFrequency) changes.PayFrequency = { old: old.PayFrequency, new: payFrequency };
    if (immediateSupervisorId !== undefined && immediateSupervisorId !== old.ImmediateSupervisorId) changes.ImmediateSupervisorId = { old: old.ImmediateSupervisorId, new: immediateSupervisorId };
    if (dateRegularized !== undefined && dateRegularized !== old.DateRegularized) changes.DateRegularized = { old: old.DateRegularized, new: dateRegularized };
    if (isActive !== undefined && isActive !== old.IsActive) changes.IsActive = { old: old.IsActive, new: isActive };
    
    if (Object.keys(changes).length > 0) {
      const changeTypes: string[] = [];
      if (changes.EmploymentStatus) changeTypes.push('Status');
      if (changes.DepartmentId || changes.PositionId) changeTypes.push('Role');
      if (changes.BasicSalary || changes.PayFrequency) changeTypes.push('Compensation');
      if (changes.DateRegularized) changeTypes.push('Regularization');
      if (changes.ImmediateSupervisorId) changeTypes.push('Supervisor');

      await pool.request()
        .input('TenantId', sql.UniqueIdentifier, tenantId)
        .input('EmployeeId', sql.UniqueIdentifier, id)
        .input('ChangeType', sql.NVarChar, changeTypes.join(', '))
        .input('OldValueJson', sql.NVarChar, JSON.stringify(old))
        .input('NewValueJson', sql.NVarChar, JSON.stringify(changes))
        .input('CreatedBy', sql.UniqueIdentifier, userId)
        .query(`
          INSERT INTO dbo.EmployeeEmploymentHistory (TenantId, EmployeeId, EffectiveDate, ChangeType, OldValueJson, NewValueJson, CreatedBy)
          VALUES (@TenantId, @EmployeeId, CAST(GETUTCDATE() AS DATE), @ChangeType, @OldValueJson, @NewValueJson, @CreatedBy)
        `);
    }
    
    // Encrypt PII fields before storing (RA 10173 compliance)
    const updatedEncryptedPii = {
      philSysNo: philSysNo ? encrypt(philSysNo) : null,
      tin: tin ? encrypt(tin) : null,
      sssNo: sssNo ? encrypt(sssNo) : null,
      philHealthNo: philHealthNo ? encrypt(philHealthNo) : null,
      pagIbigNo: pagIbigNo ? encrypt(pagIbigNo) : null,
    };

    await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, id)
      .input('FirstName', sql.NVarChar, firstName)
      .input('MiddleName', sql.NVarChar, middleName || null)
      .input('LastName', sql.NVarChar, lastName)
      .input('Suffix', sql.NVarChar, suffix || null)
      .input('BirthDate', sql.Date, birthDate ? new Date(birthDate) : null)
      .input('Gender', sql.NVarChar, gender || null)
      .input('CivilStatus', sql.NVarChar, civilStatus || null)
      .input('Nationality', sql.NVarChar, nationality || null)
      .input('PhilSysNo', sql.NVarChar, updatedEncryptedPii.philSysNo)
      .input('TIN', sql.NVarChar, updatedEncryptedPii.tin)
      .input('SssNo', sql.NVarChar, updatedEncryptedPii.sssNo)
      .input('PhilHealthNo', sql.NVarChar, updatedEncryptedPii.philHealthNo)
      .input('PagIbigNo', sql.NVarChar, updatedEncryptedPii.pagIbigNo)
      .input('Email', sql.NVarChar, email || null)
      .input('MobileNumber', sql.NVarChar, mobileNumber || null)
      .input('Address', sql.NVarChar, address || null)
      .input('EmploymentStatus', sql.NVarChar, employmentStatus)
      .input('DateHired', sql.Date, new Date(dateHired))
      .input('DateRegularized', sql.Date, dateRegularized ? new Date(dateRegularized) : null)
      .input('DateSeparated', sql.Date, dateSeparated ? new Date(dateSeparated) : null)
      .input('SeparationReason', sql.NVarChar, separationReason || null)
      .input('DepartmentId', sql.UniqueIdentifier, departmentId)
      .input('PositionId', sql.UniqueIdentifier, positionId)
      .input('ImmediateSupervisorId', sql.UniqueIdentifier, immediateSupervisorId || null)
      .input('BasicSalary', sql.Decimal(18, 4), basicSalary)
      .input('PayFrequency', sql.NVarChar, payFrequency)
      .input('BankName', sql.NVarChar, bankName || null)
      .input('BankAccountNo', sql.NVarChar, bankAccountNo || null)
      .input('PhotoUrl', sql.NVarChar, photoUrl || null)
      .input('IsActive', sql.Bit, isActive !== undefined ? isActive : true)
      .input('UpdatedBy', sql.UniqueIdentifier, userId)
      .query(`
        UPDATE dbo.Employees SET
          FirstName = @FirstName,
          MiddleName = @MiddleName,
          LastName = @LastName,
          Suffix = @Suffix,
          BirthDate = @BirthDate,
          Gender = @Gender,
          CivilStatus = @CivilStatus,
          Nationality = @Nationality,
          PhilSysNo = @PhilSysNo,
          TIN = @TIN,
          SssNo = @SssNo,
          PhilHealthNo = @PhilHealthNo,
          PagIbigNo = @PagIbigNo,
          Email = @Email,
          MobileNumber = @MobileNumber,
          Address = @Address,
          EmploymentStatus = @EmploymentStatus,
          DateHired = @DateHired,
          DateRegularized = @DateRegularized,
          DateSeparated = @DateSeparated,
          SeparationReason = @SeparationReason,
          DepartmentId = @DepartmentId,
          PositionId = @PositionId,
          ImmediateSupervisorId = @ImmediateSupervisorId,
          BasicSalary = @BasicSalary,
          PayFrequency = @PayFrequency,
          BankName = @BankName,
          BankAccountNo = @BankAccountNo,
          PhotoUrl = @PhotoUrl,
          IsActive = @IsActive,
          UpdatedAtUtc = GETUTCDATE(),
          UpdatedBy = @UpdatedBy
        WHERE Id = @Id AND TenantId = @TenantId
      `);
    
    await logAuditEvent(pool, {
      tenantId: tenantId!,
      userId,
      action: 'UPDATE',
      entityName: 'Employee',
      entityId: id as string,
      afterJson: { firstName, lastName, employmentStatus, departmentId, positionId, basicSalary, isActive },
      ipAddress: extractIp(req)
    });
    
    res.json({
      success: true,
      data: {
        message: 'Employee updated successfully'
      }
    });
  } catch (error) {
    console.error('Error updating employee:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to update employee'
      }
    });
  }
});

// DELETE /api/v1/employees/:id - Soft delete employee
router.delete('/:id', requirePermission('employee:delete'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { id } = req.params;
    
    // Check if employee exists
    const existingCheck = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, id)
      .query('SELECT Id FROM dbo.Employees WHERE Id = @Id AND TenantId = @TenantId AND IsDeleted = 0');
    
    if (existingCheck.recordset.length === 0) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Employee not found'
        }
      });
      return;
    }
    
    // Soft delete
    await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, id)
      .input('UpdatedBy', sql.UniqueIdentifier, userId)
      .query(`
        UPDATE dbo.Employees SET
          IsDeleted = 1,
          UpdatedAtUtc = GETUTCDATE(),
          UpdatedBy = @UpdatedBy
        WHERE Id = @Id AND TenantId = @TenantId
      `);
    
    await logAuditEvent(pool, {
      tenantId: tenantId!,
      userId,
      action: 'DELETE',
      entityName: 'Employee',
      entityId: id as string,
      ipAddress: extractIp(req)
    });
    
    res.json({
      success: true,
      data: {
        message: 'Employee deleted successfully'
      }
    });
  } catch (error) {
    console.error('Error deleting employee:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to delete employee'
      }
    });
  }
});

// ──────────────────────────────────────────────────────────────
// EMPLOYEE DEPENDENTS
// ──────────────────────────────────────────────────────────────

// GET /api/v1/employees/:id/dependents
router.get('/:id/dependents', requirePermission('employee:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { id } = req.params;

    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, id)
      .query(`
        SELECT Id, EmployeeId, FullName, Relationship, BirthDate, CreatedAtUtc
        FROM dbo.EmployeeDependents
        WHERE EmployeeId = @EmployeeId AND TenantId = @TenantId AND IsDeleted = 0
        ORDER BY FullName
      `);

    res.json({
      success: true,
      data: { dependents: result.recordset }
    });
  } catch (error) {
    console.error('Error listing dependents:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve dependents' }
    });
  }
});

// POST /api/v1/employees/:id/dependents
router.post('/:id/dependents', requirePermission('employee:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { id } = req.params;
    const { fullName, relationship, birthDate } = req.body;

    if (!fullName || !relationship) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'FullName and Relationship are required' }
      });
      return;
    }

    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, id)
      .input('FullName', sql.NVarChar, fullName)
      .input('Relationship', sql.NVarChar, relationship)
      .input('BirthDate', sql.Date, birthDate ? new Date(birthDate) : null)
      .input('CreatedBy', sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO dbo.EmployeeDependents (TenantId, EmployeeId, FullName, Relationship, BirthDate, CreatedBy)
        OUTPUT INSERTED.Id
        VALUES (@TenantId, @EmployeeId, @FullName, @Relationship, @BirthDate, @CreatedBy);
      `);

    const newId = result.recordset[0].Id;

    res.status(201).json({
      success: true,
      data: { id: newId, message: 'Dependent added successfully' }
    });
  } catch (error) {
    console.error('Error creating dependent:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to add dependent' }
    });
  }
});

// PUT /api/v1/employees/:id/dependents/:depId
router.put('/:id/dependents/:depId', requirePermission('employee:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { id, depId } = req.params;
    const { fullName, relationship, birthDate } = req.body;

    const existing = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, id)
      .input('DepId', sql.UniqueIdentifier, depId)
      .query('SELECT Id FROM dbo.EmployeeDependents WHERE Id = @DepId AND EmployeeId = @EmployeeId AND TenantId = @TenantId AND IsDeleted = 0');

    if (existing.recordset.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Dependent not found' }
      });
      return;
    }

    await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('DepId', sql.UniqueIdentifier, depId)
      .input('FullName', sql.NVarChar, fullName)
      .input('Relationship', sql.NVarChar, relationship)
      .input('BirthDate', sql.Date, birthDate ? new Date(birthDate) : null)
      .input('UpdatedBy', sql.UniqueIdentifier, userId)
      .query(`
        UPDATE dbo.EmployeeDependents SET
          FullName = @FullName,
          Relationship = @Relationship,
          BirthDate = @BirthDate,
          UpdatedAtUtc = GETUTCDATE(),
          UpdatedBy = @UpdatedBy
        WHERE Id = @DepId AND TenantId = @TenantId
      `);

    res.json({
      success: true,
      data: { message: 'Dependent updated successfully' }
    });
  } catch (error) {
    console.error('Error updating dependent:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to update dependent' }
    });
  }
});

// DELETE /api/v1/employees/:id/dependents/:depId
router.delete('/:id/dependents/:depId', requirePermission('employee:delete'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { id, depId } = req.params;

    const existing = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, id)
      .input('DepId', sql.UniqueIdentifier, depId)
      .query('SELECT Id FROM dbo.EmployeeDependents WHERE Id = @DepId AND EmployeeId = @EmployeeId AND TenantId = @TenantId AND IsDeleted = 0');

    if (existing.recordset.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Dependent not found' }
      });
      return;
    }

    await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('DepId', sql.UniqueIdentifier, depId)
      .input('UpdatedBy', sql.UniqueIdentifier, userId)
      .query(`
        UPDATE dbo.EmployeeDependents SET
          IsDeleted = 1,
          UpdatedAtUtc = GETUTCDATE(),
          UpdatedBy = @UpdatedBy
        WHERE Id = @DepId AND TenantId = @TenantId
      `);

    res.json({
      success: true,
      data: { message: 'Dependent removed successfully' }
    });
  } catch (error) {
    console.error('Error deleting dependent:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to remove dependent' }
    });
  }
});

// ──────────────────────────────────────────────────────────────
// EMPLOYEE EMPLOYMENT HISTORY
// ──────────────────────────────────────────────────────────────

// GET /api/v1/employees/:id/history
router.get('/:id/history', requirePermission('employee:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { id } = req.params;

    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, id)
      .query(`
        SELECT h.Id, h.EmployeeId, h.EffectiveDate, h.ChangeType,
               h.OldValueJson, h.NewValueJson, h.CreatedAtUtc,
               u.FirstName AS CreatedByFirstName, u.LastName AS CreatedByLastName
        FROM dbo.EmployeeEmploymentHistory h
        LEFT JOIN dbo.Users u ON h.CreatedBy = u.Id
        WHERE h.EmployeeId = @EmployeeId AND h.TenantId = @TenantId
        ORDER BY h.EffectiveDate DESC
      `);

    res.json({
      success: true,
      data: { history: result.recordset }
    });
  } catch (error) {
    console.error('Error listing employment history:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve employment history' }
    });
  }
});

// ──────────────────────────────────────────────────────────────
// EMPLOYEE DOCUMENTS
// ──────────────────────────────────────────────────────────────

// GET /api/v1/employees/:id/documents
router.get('/:id/documents', requirePermission('employee:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { id } = req.params;

    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, id)
      .query(`
        SELECT Id, EmployeeId, DocType, FileUrl, UploadedAtUtc, ExpiryDate, CreatedAtUtc
        FROM dbo.EmployeeDocuments
        WHERE EmployeeId = @EmployeeId AND TenantId = @TenantId AND IsDeleted = 0
        ORDER BY UploadedAtUtc DESC
      `);

    res.json({
      success: true,
      data: { documents: result.recordset }
    });
  } catch (error) {
    console.error('Error listing documents:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve documents' }
    });
  }
});

// POST /api/v1/employees/:id/documents
router.post('/:id/documents', requirePermission('employee:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { id } = req.params;
    const { docType, fileUrl, expiryDate } = req.body;

    if (!docType || !fileUrl) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'DocType and FileUrl are required' }
      });
      return;
    }

    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, id)
      .input('DocType', sql.NVarChar, docType)
      .input('FileUrl', sql.NVarChar, fileUrl)
      .input('ExpiryDate', sql.Date, expiryDate ? new Date(expiryDate) : null)
      .input('CreatedBy', sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO dbo.EmployeeDocuments (TenantId, EmployeeId, DocType, FileUrl, ExpiryDate, CreatedBy)
        OUTPUT INSERTED.Id
        VALUES (@TenantId, @EmployeeId, @DocType, @FileUrl, @ExpiryDate, @CreatedBy);
      `);

    const newId = result.recordset[0].Id;

    res.status(201).json({
      success: true,
      data: { id: newId, message: 'Document uploaded successfully' }
    });
  } catch (error) {
    console.error('Error creating document:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to upload document' }
    });
  }
});

// DELETE /api/v1/employees/:id/documents/:docId
router.delete('/:id/documents/:docId', requirePermission('employee:delete'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { id, docId } = req.params;

    const existing = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, id)
      .input('DocId', sql.UniqueIdentifier, docId)
      .query('SELECT Id FROM dbo.EmployeeDocuments WHERE Id = @DocId AND EmployeeId = @EmployeeId AND TenantId = @TenantId AND IsDeleted = 0');

    if (existing.recordset.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Document not found' }
      });
      return;
    }

    await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('DocId', sql.UniqueIdentifier, docId)
      .input('UpdatedBy', sql.UniqueIdentifier, userId)
      .query(`
        UPDATE dbo.EmployeeDocuments SET
          IsDeleted = 1,
          UpdatedAtUtc = GETUTCDATE(),
          UpdatedBy = @UpdatedBy
        WHERE Id = @DocId AND TenantId = @TenantId
      `);

    res.json({
      success: true,
      data: { message: 'Document deleted successfully' }
    });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to delete document' }
    });
  }
});

export default router;
