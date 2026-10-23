import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../../middleware/auth';
import { setTenantContext } from '../../middleware/tenantContext';
import { requirePermission } from '../../middleware/permissions';
import { logAuditEvent, extractIp } from '../../middleware/auditLog';
import { validate } from '../../middleware/validate';
import { validatePassword } from '../../utils/validation';
import { createLogger } from '../../utils/logger';
import {
  createTenantSchema, createUserSchema, createRoleSchema,
  assignRoleSchema, assignPermissionSchema, createContributionTableSchema, copyYearSchema
} from '../../utils/schemas';
import sql from 'mssql';
import bcrypt from 'bcryptjs';

const log = createLogger('admin');

const router = Router();

router.use(authMiddleware);
router.use(setTenantContext);

// ──────────────────────────────────────────────────────────────
// TENANT CRUD
// ──────────────────────────────────────────────────────────────

// GET /api/v1/admin/tenants - List all tenants
router.get('/tenants', requirePermission('tenant:manage'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;

    const result = await pool.request()
      .query(`
        SELECT Id, CompanyName, CompanyCode, TIN, SssEmployerNo, PhilHealthEmployerNo,
               PagIbigEmployerNo, GsisEmployerNo, IsGovernment, Address, TimeZone, SubscriptionPlan, Status, CreatedAtUtc
        FROM dbo.Tenants
        WHERE IsDeleted = 0
        ORDER BY CreatedAtUtc DESC
      `);

    res.json({
      success: true,
      data: { tenants: result.recordset }
    });
  } catch (error) {
    log.error('Error listing tenants:', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve tenants' }
    });
  }
});

// POST /api/v1/admin/tenants - Create tenant
router.post('/tenants', requirePermission('tenant:manage'), validate(createTenantSchema), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const userId = req.userId;
    const { companyName, companyCode, tin, sssEmployerNo, philHealthEmployerNo, pagIbigEmployerNo, gsisEmployerNo, isGovernment, address, subscriptionPlan, adminEmail, adminPassword } = req.body;

    // Check duplicate code
    const dupCheck = await pool.request()
      .input('CompanyCode', sql.NVarChar, companyCode)
      .query('SELECT Id FROM dbo.Tenants WHERE CompanyCode = @CompanyCode AND IsDeleted = 0');

    if (dupCheck.recordset.length > 0) {
      res.status(409).json({
        success: false,
        error: { code: 'DUPLICATE', message: 'Company code already exists' }
      });
      return;
    }

    // Create tenant
    const tenantResult = await pool.request()
      .input('CompanyName', sql.NVarChar, companyName)
      .input('CompanyCode', sql.NVarChar, companyCode)
      .input('TIN', sql.NVarChar, tin || null)
      .input('SssEmployerNo', sql.NVarChar, sssEmployerNo || null)
      .input('PhilHealthEmployerNo', sql.NVarChar, philHealthEmployerNo || null)
      .input('PagIbigEmployerNo', sql.NVarChar, pagIbigEmployerNo || null)
      .input('GsisEmployerNo', sql.NVarChar, gsisEmployerNo || null)
      .input('IsGovernment', sql.Bit, isGovernment ? 1 : 0)
      .input('Address', sql.NVarChar, address || null)
      .input('SubscriptionPlan', sql.NVarChar, subscriptionPlan || 'Basic')
      .input('CreatedBy', sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO dbo.Tenants (CompanyName, CompanyCode, TIN, SssEmployerNo, PhilHealthEmployerNo, PagIbigEmployerNo, GsisEmployerNo, IsGovernment, Address, SubscriptionPlan, CreatedBy)
        OUTPUT INSERTED.Id
        VALUES (@CompanyName, @CompanyCode, @TIN, @SssEmployerNo, @PhilHealthEmployerNo, @PagIbigEmployerNo, @GsisEmployerNo, @IsGovernment, @Address, @SubscriptionPlan, @CreatedBy);
      `);

    const tenantId = tenantResult.recordset[0].Id;

    // Seed default roles for this tenant
    const systemRolesResult = await pool.request()
      .input('SystemTenantId', sql.UniqueIdentifier, await getSystemTenantId(pool))
      .query(`
        SELECT Name, IsSystemRole FROM dbo.Roles
        WHERE TenantId = @SystemTenantId AND IsDeleted = 0
      `);

    const roleIds: Record<string, string> = {};
    for (const role of systemRolesResult.recordset) {
      const roleResult = await pool.request()
        .input('TenantId', sql.UniqueIdentifier, tenantId)
        .input('Name', sql.NVarChar, role.Name)
        .input('IsSystemRole', sql.Bit, role.IsSystemRole)
        .input('CreatedBy', sql.UniqueIdentifier, userId)
        .query(`
          INSERT INTO dbo.Roles (TenantId, Name, IsSystemRole, CreatedBy)
          OUTPUT INSERTED.Id
          VALUES (@TenantId, @Name, @IsSystemRole, @CreatedBy);
        `);
      roleIds[role.Name] = roleResult.recordset[0].Id;
    }

    // Copy system role permissions to new tenant roles
    const systemTenantId = await getSystemTenantId(pool);
    const systemRolesResult2 = await pool.request()
      .input('SystemTenantId', sql.UniqueIdentifier, systemTenantId)
      .query(`
        SELECT r.Name AS RoleName, p.Code AS PermissionCode
        FROM dbo.Roles r
        INNER JOIN dbo.RolePermissions rp ON r.Id = rp.RoleId
        INNER JOIN dbo.Permissions p ON rp.PermissionId = p.Id
        WHERE r.TenantId = @SystemTenantId AND r.IsSystemRole = 1 AND r.IsDeleted = 0 AND p.IsDeleted = 0
      `);

    for (const rp of systemRolesResult2.recordset) {
      if (roleIds[rp.RoleName]) {
        const permResult = await pool.request()
          .input('Code', sql.NVarChar, rp.PermissionCode)
          .query('SELECT Id FROM dbo.Permissions WHERE Code = @Code AND IsDeleted = 0');

        if (permResult.recordset.length > 0) {
          await pool.request()
            .input('RoleId', sql.UniqueIdentifier, roleIds[rp.RoleName])
            .input('PermissionId', sql.UniqueIdentifier, permResult.recordset[0].Id)
            .input('CreatedBy', sql.UniqueIdentifier, userId)
            .query(`
              INSERT INTO dbo.RolePermissions (RoleId, PermissionId, CreatedBy)
              VALUES (@RoleId, @PermissionId, @CreatedBy)
            `);
        }
      }
    }

    // Create admin user
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    const userResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Email', sql.NVarChar, adminEmail)
      .input('PasswordHash', sql.NVarChar, passwordHash)
      .input('CreatedBy', sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO dbo.Users (TenantId, Email, PasswordHash, CreatedBy)
        OUTPUT INSERTED.Id
        VALUES (@TenantId, @Email, @PasswordHash, @CreatedBy);
      `);

    const adminUserId = userResult.recordset[0].Id;

    // Assign Tenant Admin role to admin user
    if (roleIds['Tenant Admin']) {
      await pool.request()
        .input('UserId', sql.UniqueIdentifier, adminUserId)
        .input('RoleId', sql.UniqueIdentifier, roleIds['Tenant Admin'])
        .input('TenantId', sql.UniqueIdentifier, tenantId)
        .input('CreatedBy', sql.UniqueIdentifier, userId)
        .query(`
          INSERT INTO dbo.UserRoles (UserId, RoleId, TenantId, CreatedBy)
          VALUES (@UserId, @RoleId, @TenantId, @CreatedBy)
        `);
    }

    await logAuditEvent(pool, {
      tenantId: tenantId!, userId, action: 'CREATE', entityName: 'Tenant', entityId: tenantId,
      afterJson: { companyName, companyCode, subscriptionPlan, adminEmail },
      ipAddress: extractIp(req)
    });

    res.status(201).json({
      success: true,
      data: {
        id: tenantId,
        message: 'Tenant created successfully',
        adminEmail
      }
    });
  } catch (error) {
    log.error('Error creating tenant:', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to create tenant' }
    });
  }
});

// GET /api/v1/admin/tenants/:id - Get tenant details
router.get('/tenants/:id', requirePermission('tenant:manage'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const { id } = req.params;

    const result = await pool.request()
      .input('Id', sql.UniqueIdentifier, id as string)
      .query(`
        SELECT Id, CompanyName, CompanyCode, TIN, SssEmployerNo, PhilHealthEmployerNo,
               PagIbigEmployerNo, GsisEmployerNo, IsGovernment, Address, TimeZone, SubscriptionPlan, Status, CreatedAtUtc, UpdatedAtUtc
        FROM dbo.Tenants
        WHERE Id = @Id AND IsDeleted = 0
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Tenant not found' }
      });
      return;
    }

    // Get user count
    const userCount = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, id as string)
      .query('SELECT COUNT(*) AS count FROM dbo.Users WHERE TenantId = @TenantId AND IsDeleted = 0');

    res.json({
      success: true,
      data: {
        ...result.recordset[0],
        userCount: userCount.recordset[0].count
      }
    });
  } catch (error) {
    log.error('Error getting tenant:', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve tenant' }
    });
  }
});

// PUT /api/v1/admin/tenants/:id - Update tenant
router.put('/tenants/:id', requirePermission('tenant:manage'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const userId = req.userId;
    const { id } = req.params;
    const { companyName, tin, sssEmployerNo, philHealthEmployerNo, pagIbigEmployerNo, gsisEmployerNo, isGovernment, address, subscriptionPlan } = req.body;

    const existing = await pool.request()
      .input('Id', sql.UniqueIdentifier, id as string)
      .query('SELECT Id FROM dbo.Tenants WHERE Id = @Id AND IsDeleted = 0');

    if (existing.recordset.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Tenant not found' }
      });
      return;
    }

    await pool.request()
      .input('Id', sql.UniqueIdentifier, id as string)
      .input('CompanyName', sql.NVarChar, companyName)
      .input('TIN', sql.NVarChar, tin || null)
      .input('SssEmployerNo', sql.NVarChar, sssEmployerNo || null)
      .input('PhilHealthEmployerNo', sql.NVarChar, philHealthEmployerNo || null)
      .input('PagIbigEmployerNo', sql.NVarChar, pagIbigEmployerNo || null)
      .input('GsisEmployerNo', sql.NVarChar, gsisEmployerNo || null)
      .input('IsGovernment', sql.Bit, isGovernment ? 1 : 0)
      .input('Address', sql.NVarChar, address || null)
      .input('SubscriptionPlan', sql.NVarChar, subscriptionPlan)
      .input('UpdatedBy', sql.UniqueIdentifier, userId)
      .query(`
        UPDATE dbo.Tenants SET
          CompanyName = @CompanyName, TIN = @TIN, SssEmployerNo = @SssEmployerNo,
          PhilHealthEmployerNo = @PhilHealthEmployerNo, PagIbigEmployerNo = @PagIbigEmployerNo,
          GsisEmployerNo = @GsisEmployerNo, IsGovernment = @IsGovernment,
          Address = @Address, SubscriptionPlan = @SubscriptionPlan,
          UpdatedAtUtc = GETUTCDATE(), UpdatedBy = @UpdatedBy
        WHERE Id = @Id
      `);

    await logAuditEvent(pool, {
      tenantId: id as string, userId, action: 'UPDATE', entityName: 'Tenant', entityId: id as string,
      afterJson: { companyName, subscriptionPlan },
      ipAddress: extractIp(req)
    });

    res.json({
      success: true,
      data: { message: 'Tenant updated successfully' }
    });
  } catch (error) {
    log.error('Error updating tenant:', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to update tenant' }
    });
  }
});

// PATCH /api/v1/admin/tenants/:id/status - Activate/suspend tenant
router.patch('/tenants/:id/status', requirePermission('tenant:manage'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const userId = req.userId;
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['Active', 'Suspended'].includes(status)) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Status must be Active or Suspended' }
      });
      return;
    }

    const existing = await pool.request()
      .input('Id', sql.UniqueIdentifier, id as string)
      .query('SELECT Id, Status FROM dbo.Tenants WHERE Id = @Id AND IsDeleted = 0');

    if (existing.recordset.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Tenant not found' }
      });
      return;
    }

    await pool.request()
      .input('Id', sql.UniqueIdentifier, id as string)
      .input('Status', sql.NVarChar, status)
      .input('UpdatedBy', sql.UniqueIdentifier, userId)
      .query(`
        UPDATE dbo.Tenants SET Status = @Status, UpdatedAtUtc = GETUTCDATE(), UpdatedBy = @UpdatedBy
        WHERE Id = @Id
      `);

    await logAuditEvent(pool, {
      tenantId: id as string, userId, action: 'UPDATE', entityName: 'Tenant', entityId: id as string,
      beforeJson: { status: existing.recordset[0].Status },
      afterJson: { status },
      ipAddress: extractIp(req)
    });

    res.json({
      success: true,
      data: { message: `Tenant ${status === 'Active' ? 'activated' : 'suspended'} successfully` }
    });
  } catch (error) {
    log.error('Error updating tenant status:', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to update tenant status' }
    });
  }
});

// ──────────────────────────────────────────────────────────────
// USER MANAGEMENT
// ──────────────────────────────────────────────────────────────

// GET /api/v1/admin/users - List users
router.get('/users', requirePermission('user:manage'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const { tenantId: filterTenantId } = req.query;

    let whereClause = 'WHERE u.IsDeleted = 0';
    const request = pool.request();

    if (filterTenantId) {
      whereClause += ' AND u.TenantId = @FilterTenantId';
      request.input('FilterTenantId', sql.UniqueIdentifier, filterTenantId);
    }

    const result = await request.query(`
      SELECT u.Id, u.Email, u.PhoneNumber, u.IsActive, u.LastLoginAtUtc, u.CreatedAtUtc,
             t.CompanyName, t.CompanyCode,
             STUFF((
               SELECT ', ' + r.Name
               FROM dbo.UserRoles ur2
               INNER JOIN dbo.Roles r ON ur2.RoleId = r.Id
               WHERE ur2.UserId = u.Id AND r.IsDeleted = 0
               FOR XML PATH('')
             ), 1, 2, '') AS Roles
      FROM dbo.Users u
      INNER JOIN dbo.Tenants t ON u.TenantId = t.Id
      ${whereClause}
      ORDER BY u.CreatedAtUtc DESC
    `);

    res.json({
      success: true,
      data: { users: result.recordset }
    });
  } catch (error) {
    log.error('Error listing users:', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve users' }
    });
  }
});

// POST /api/v1/admin/users - Create user
router.post('/users', requirePermission('user:manage'), validate(createUserSchema), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const userId = req.userId;
    const { tenantId, email, password, phoneNumber } = req.body;

    const pwCheck = validatePassword(password);
    if (!pwCheck.valid) {
      res.status(400).json({
        success: false,
        error: { code: 'WEAK_PASSWORD', message: pwCheck.errors.join('. ') }
      });
      return;
    }

    // Check tenant exists
    const tenantCheck = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query('SELECT Id FROM dbo.Tenants WHERE Id = @TenantId AND IsDeleted = 0');

    if (tenantCheck.recordset.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found' }
      });
      return;
    }

    // Check duplicate email within tenant
    const dupCheck = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Email', sql.NVarChar, email)
      .query('SELECT Id FROM dbo.Users WHERE TenantId = @TenantId AND Email = @Email AND IsDeleted = 0');

    if (dupCheck.recordset.length > 0) {
      res.status(409).json({
        success: false,
        error: { code: 'DUPLICATE', message: 'Email already exists in this tenant' }
      });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Email', sql.NVarChar, email)
      .input('PasswordHash', sql.NVarChar, passwordHash)
      .input('PhoneNumber', sql.NVarChar, phoneNumber || null)
      .input('CreatedBy', sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO dbo.Users (TenantId, Email, PasswordHash, PhoneNumber, CreatedBy)
        OUTPUT INSERTED.Id
        VALUES (@TenantId, @Email, @PasswordHash, @PhoneNumber, @CreatedBy);
      `);

    const newId = result.recordset[0].Id;

    await logAuditEvent(pool, {
      tenantId, userId, action: 'CREATE', entityName: 'User', entityId: newId,
      afterJson: { email, phoneNumber },
      ipAddress: extractIp(req)
    });

    res.status(201).json({
      success: true,
      data: { id: newId, message: 'User created successfully' }
    });
  } catch (error) {
    log.error('Error creating user:', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to create user' }
    });
  }
});

// GET /api/v1/admin/users/:id - Get user details
router.get('/users/:id', requirePermission('user:manage'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const { id } = req.params;

    const result = await pool.request()
      .input('Id', sql.UniqueIdentifier, id as string)
      .query(`
        SELECT u.Id, u.Email, u.PhoneNumber, u.IsActive, u.LastLoginAtUtc, u.CreatedAtUtc,
               t.Id AS TenantId, t.CompanyName, t.CompanyCode
        FROM dbo.Users u
        INNER JOIN dbo.Tenants t ON u.TenantId = t.Id
        WHERE u.Id = @Id AND u.IsDeleted = 0
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
      return;
    }

    // Get user roles
    const rolesResult = await pool.request()
      .input('UserId', sql.UniqueIdentifier, id as string)
      .query(`
        SELECT r.Id, r.Name
        FROM dbo.UserRoles ur
        INNER JOIN dbo.Roles r ON ur.RoleId = r.Id
        WHERE ur.UserId = @UserId AND r.IsDeleted = 0
      `);

    res.json({
      success: true,
      data: {
        ...result.recordset[0],
        roles: rolesResult.recordset
      }
    });
  } catch (error) {
    log.error('Error getting user:', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve user' }
    });
  }
});

// PUT /api/v1/admin/users/:id - Update user
router.put('/users/:id', requirePermission('user:manage'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const userId = req.userId;
    const { id } = req.params;
    const { phoneNumber, isActive } = req.body;

    const existing = await pool.request()
      .input('Id', sql.UniqueIdentifier, id as string)
      .query('SELECT Id FROM dbo.Users WHERE Id = @Id AND IsDeleted = 0');

    if (existing.recordset.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
      return;
    }

    await pool.request()
      .input('Id', sql.UniqueIdentifier, id as string)
      .input('PhoneNumber', sql.NVarChar, phoneNumber || null)
      .input('IsActive', sql.Bit, isActive !== undefined ? isActive : true)
      .input('UpdatedBy', sql.UniqueIdentifier, userId)
      .query(`
        UPDATE dbo.Users SET
          PhoneNumber = @PhoneNumber, IsActive = @IsActive,
          UpdatedAtUtc = GETUTCDATE(), UpdatedBy = @UpdatedBy
        WHERE Id = @Id
      `);

    res.json({
      success: true,
      data: { message: 'User updated successfully' }
    });
  } catch (error) {
    log.error('Error updating user:', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to update user' }
    });
  }
});

// PATCH /api/v1/admin/users/:id/status - Activate/deactivate user
router.patch('/users/:id/status', requirePermission('user:manage'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const userId = req.userId;
    const { id } = req.params;
    const { isActive } = req.body;

    const existing = await pool.request()
      .input('Id', sql.UniqueIdentifier, id as string)
      .query('SELECT Id, IsActive FROM dbo.Users WHERE Id = @Id AND IsDeleted = 0');

    if (existing.recordset.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
      return;
    }

    await pool.request()
      .input('Id', sql.UniqueIdentifier, id as string)
      .input('IsActive', sql.Bit, isActive)
      .input('UpdatedBy', sql.UniqueIdentifier, userId)
      .query(`
        UPDATE dbo.Users SET IsActive = @IsActive, UpdatedAtUtc = GETUTCDATE(), UpdatedBy = @UpdatedBy
        WHERE Id = @Id
      `);

    res.json({
      success: true,
      data: { message: `User ${isActive ? 'activated' : 'deactivated'} successfully` }
    });
  } catch (error) {
    log.error('Error updating user status:', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to update user status' }
    });
  }
});

// POST /api/v1/admin/users/:id/roles - Assign role to user
router.post('/users/:id/roles', requirePermission('user:manage'), validate(assignRoleSchema), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const userId = req.userId;
    const { id } = req.params;
    const { roleId } = req.body;

    // Check user exists
    const userCheck = await pool.request()
      .input('Id', sql.UniqueIdentifier, id as string)
      .query('SELECT Id, TenantId FROM dbo.Users WHERE Id = @Id AND IsDeleted = 0');

    if (userCheck.recordset.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
      return;
    }

    const userTenantId = userCheck.recordset[0].TenantId;

    // Check role exists
    const roleCheck = await pool.request()
      .input('RoleId', sql.UniqueIdentifier, roleId)
      .query('SELECT Id FROM dbo.Roles WHERE Id = @RoleId AND IsDeleted = 0');

    if (roleCheck.recordset.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'ROLE_NOT_FOUND', message: 'Role not found' }
      });
      return;
    }

    // Check duplicate
    const dupCheck = await pool.request()
      .input('UserId', sql.UniqueIdentifier, id as string)
      .input('RoleId', sql.UniqueIdentifier, roleId)
      .query('SELECT 1 FROM dbo.UserRoles WHERE UserId = @UserId AND RoleId = @RoleId');

    if (dupCheck.recordset.length > 0) {
      res.status(409).json({
        success: false,
        error: { code: 'DUPLICATE', message: 'User already has this role' }
      });
      return;
    }

    await pool.request()
      .input('UserId', sql.UniqueIdentifier, id as string)
      .input('RoleId', sql.UniqueIdentifier, roleId)
      .input('TenantId', sql.UniqueIdentifier, userTenantId)
      .input('CreatedBy', sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO dbo.UserRoles (UserId, RoleId, TenantId, CreatedBy)
        VALUES (@UserId, @RoleId, @TenantId, @CreatedBy)
      `);

    res.status(201).json({
      success: true,
      data: { message: 'Role assigned successfully' }
    });
  } catch (error) {
    log.error('Error assigning role:', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to assign role' }
    });
  }
});

// DELETE /api/v1/admin/users/:id/roles/:roleId - Remove role from user
router.delete('/users/:id/roles/:roleId', requirePermission('user:manage'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const { id, roleId } = req.params;

    const existing = await pool.request()
      .input('UserId', sql.UniqueIdentifier, id as string)
      .input('RoleId', sql.UniqueIdentifier, roleId as string)
      .query('SELECT 1 FROM dbo.UserRoles WHERE UserId = @UserId AND RoleId = @RoleId');

    if (existing.recordset.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User role not found' }
      });
      return;
    }

    await pool.request()
      .input('UserId', sql.UniqueIdentifier, id as string)
      .input('RoleId', sql.UniqueIdentifier, roleId as string)
      .query('DELETE FROM dbo.UserRoles WHERE UserId = @UserId AND RoleId = @RoleId');

    res.json({
      success: true,
      data: { message: 'Role removed successfully' }
    });
  } catch (error) {
    log.error('Error removing role:', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to remove role' }
    });
  }
});

// ──────────────────────────────────────────────────────────────
// ROLE MANAGEMENT
// ──────────────────────────────────────────────────────────────

// GET /api/v1/admin/roles - List roles
router.get('/roles', requirePermission('role:manage'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const { tenantId: filterTenantId } = req.query;

    let whereClause = 'WHERE r.IsDeleted = 0';
    const request = pool.request();

    if (filterTenantId) {
      whereClause += ' AND r.TenantId = @FilterTenantId';
      request.input('FilterTenantId', sql.UniqueIdentifier, filterTenantId);
    }

    const result = await request.query(`
      SELECT r.Id, r.Name, r.IsSystemRole, r.TenantId, r.CreatedAtUtc,
             t.CompanyName,
             (SELECT COUNT(*) FROM dbo.RolePermissions rp WHERE rp.RoleId = r.Id) AS PermissionCount,
             (SELECT COUNT(*) FROM dbo.UserRoles ur WHERE ur.RoleId = r.Id) AS UserCount
      FROM dbo.Roles r
      LEFT JOIN dbo.Tenants t ON r.TenantId = t.Id
      ${whereClause}
      ORDER BY r.IsSystemRole DESC, r.Name ASC
    `);

    res.json({
      success: true,
      data: { roles: result.recordset }
    });
  } catch (error) {
    log.error('Error listing roles:', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve roles' }
    });
  }
});

// POST /api/v1/admin/roles - Create role
router.post('/roles', requirePermission('role:manage'), validate(createRoleSchema), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const userId = req.userId;
    const { tenantId, name } = req.body;

    // Check duplicate name within tenant
    const dupCheck = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Name', sql.NVarChar, name)
      .query('SELECT Id FROM dbo.Roles WHERE TenantId = @TenantId AND Name = @Name AND IsDeleted = 0');

    if (dupCheck.recordset.length > 0) {
      res.status(409).json({
        success: false,
        error: { code: 'DUPLICATE', message: 'Role name already exists in this tenant' }
      });
      return;
    }

    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Name', sql.NVarChar, name)
      .input('CreatedBy', sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO dbo.Roles (TenantId, Name, CreatedBy)
        OUTPUT INSERTED.Id
        VALUES (@TenantId, @Name, @CreatedBy);
      `);

    const newId = result.recordset[0].Id;

    res.status(201).json({
      success: true,
      data: { id: newId, message: 'Role created successfully' }
    });
  } catch (error) {
    log.error('Error creating role:', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to create role' }
    });
  }
});

// GET /api/v1/admin/roles/:id - Get role with permissions
router.get('/roles/:id', requirePermission('role:manage'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const { id } = req.params;

    const result = await pool.request()
      .input('Id', sql.UniqueIdentifier, id as string)
      .query(`
        SELECT r.Id, r.Name, r.IsSystemRole, r.TenantId, t.CompanyName
        FROM dbo.Roles r
        LEFT JOIN dbo.Tenants t ON r.TenantId = t.Id
        WHERE r.Id = @Id AND r.IsDeleted = 0
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Role not found' }
      });
      return;
    }

    // Get role permissions
    const permissionsResult = await pool.request()
      .input('RoleId', sql.UniqueIdentifier, id as string)
      .query(`
        SELECT p.Id, p.Code, p.Description
        FROM dbo.RolePermissions rp
        INNER JOIN dbo.Permissions p ON rp.PermissionId = p.Id
        WHERE rp.RoleId = @RoleId AND p.IsDeleted = 0
        ORDER BY p.Code
      `);

    res.json({
      success: true,
      data: {
        ...result.recordset[0],
        permissions: permissionsResult.recordset
      }
    });
  } catch (error) {
    log.error('Error getting role:', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve role' }
    });
  }
});

// PUT /api/v1/admin/roles/:id - Update role
router.put('/roles/:id', requirePermission('role:manage'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const userId = req.userId;
    const { id } = req.params;
    const { name } = req.body;

    const existing = await pool.request()
      .input('Id', sql.UniqueIdentifier, id as string)
      .query('SELECT Id, IsSystemRole FROM dbo.Roles WHERE Id = @Id AND IsDeleted = 0');

    if (existing.recordset.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Role not found' }
      });
      return;
    }

    await pool.request()
      .input('Id', sql.UniqueIdentifier, id as string)
      .input('Name', sql.NVarChar, name)
      .input('UpdatedBy', sql.UniqueIdentifier, userId)
      .query(`
        UPDATE dbo.Roles SET Name = @Name, UpdatedAtUtc = GETUTCDATE(), UpdatedBy = @UpdatedBy
        WHERE Id = @Id
      `);

    res.json({
      success: true,
      data: { message: 'Role updated successfully' }
    });
  } catch (error) {
    log.error('Error updating role:', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to update role' }
    });
  }
});

// DELETE /api/v1/admin/roles/:id - Soft delete role
router.delete('/roles/:id', requirePermission('role:manage'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const userId = req.userId;
    const { id } = req.params;

    const existing = await pool.request()
      .input('Id', sql.UniqueIdentifier, id as string)
      .query('SELECT Id, IsSystemRole FROM dbo.Roles WHERE Id = @Id AND IsDeleted = 0');

    if (existing.recordset.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Role not found' }
      });
      return;
    }

    if (existing.recordset[0].IsSystemRole) {
      res.status(409).json({
        success: false,
        error: { code: 'SYSTEM_ROLE', message: 'Cannot delete system roles' }
      });
      return;
    }

    await pool.request()
      .input('Id', sql.UniqueIdentifier, id as string)
      .input('UpdatedBy', sql.UniqueIdentifier, userId)
      .query(`
        UPDATE dbo.Roles SET IsDeleted = 1, UpdatedAtUtc = GETUTCDATE(), UpdatedBy = @UpdatedBy
        WHERE Id = @Id
      `);

    res.json({
      success: true,
      data: { message: 'Role deleted successfully' }
    });
  } catch (error) {
    log.error('Error deleting role:', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to delete role' }
    });
  }
});

// POST /api/v1/admin/roles/:id/permissions - Assign permission to role
router.post('/roles/:id/permissions', requirePermission('role:manage'), validate(assignPermissionSchema), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const { id } = req.params;
    const { permissionId } = req.body;

    // Check role exists
    const roleCheck = await pool.request()
      .input('Id', sql.UniqueIdentifier, id as string)
      .query('SELECT Id FROM dbo.Roles WHERE Id = @Id AND IsDeleted = 0');

    if (roleCheck.recordset.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Role not found' }
      });
      return;
    }

    // Check permission exists
    const permCheck = await pool.request()
      .input('Id', sql.UniqueIdentifier, permissionId)
      .query('SELECT Id FROM dbo.Permissions WHERE Id = @Id AND IsDeleted = 0');

    if (permCheck.recordset.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'PERMISSION_NOT_FOUND', message: 'Permission not found' }
      });
      return;
    }

    // Check duplicate
    const dupCheck = await pool.request()
      .input('RoleId', sql.UniqueIdentifier, id as string)
      .input('PermissionId', sql.UniqueIdentifier, permissionId)
      .query('SELECT 1 FROM dbo.RolePermissions WHERE RoleId = @RoleId AND PermissionId = @PermissionId');

    if (dupCheck.recordset.length > 0) {
      res.status(409).json({
        success: false,
        error: { code: 'DUPLICATE', message: 'Role already has this permission' }
      });
      return;
    }

    await pool.request()
      .input('RoleId', sql.UniqueIdentifier, id as string)
      .input('PermissionId', sql.UniqueIdentifier, permissionId)
      .input('CreatedBy', sql.UniqueIdentifier, req.userId)
      .query(`
        INSERT INTO dbo.RolePermissions (RoleId, PermissionId, CreatedBy)
        VALUES (@RoleId, @PermissionId, @CreatedBy)
      `);

    res.status(201).json({
      success: true,
      data: { message: 'Permission assigned successfully' }
    });
  } catch (error) {
    log.error('Error assigning permission:', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to assign permission' }
    });
  }
});

// DELETE /api/v1/admin/roles/:id/permissions/:permissionId - Remove permission
router.delete('/roles/:id/permissions/:permissionId', requirePermission('role:manage'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const { id, permissionId } = req.params;

    const existing = await pool.request()
      .input('RoleId', sql.UniqueIdentifier, id as string)
      .input('PermissionId', sql.UniqueIdentifier, permissionId as string)
      .query('SELECT 1 FROM dbo.RolePermissions WHERE RoleId = @RoleId AND PermissionId = @PermissionId');

    if (existing.recordset.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Role permission not found' }
      });
      return;
    }

    await pool.request()
      .input('RoleId', sql.UniqueIdentifier, id as string)
      .input('PermissionId', sql.UniqueIdentifier, permissionId as string)
      .query('DELETE FROM dbo.RolePermissions WHERE RoleId = @RoleId AND PermissionId = @PermissionId');

    res.json({
      success: true,
      data: { message: 'Permission removed successfully' }
    });
  } catch (error) {
    log.error('Error removing permission:', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to remove permission' }
    });
  }
});

// ──────────────────────────────────────────────────────────────
// GOVERNMENT CONTRIBUTION TABLES (SUPER ADMIN ONLY)
// ──────────────────────────────────────────────────────────────

// GET /api/v1/admin/contribution-tables - List contribution tables
router.get('/contribution-tables', requirePermission('system:manage'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const { year, tableType } = req.query;

    let whereClause = 'WHERE 1=1';
    const request = pool.request();

    if (year) {
      whereClause += ' AND EffectiveYear = @Year';
      request.input('Year', sql.Int, parseInt(year as string));
    }

    if (tableType) {
      whereClause += ' AND TableType = @TableType';
      request.input('TableType', sql.NVarChar, tableType);
    }

    const result = await request.query(`
      SELECT Id, EffectiveYear, TableType, BracketMin, BracketMax,
             EmployeeShare, EmployerShare, FixedAmount, RatePercent, Description
      FROM dbo.GovContributionTables
      ${whereClause}
      ORDER BY EffectiveYear DESC, TableType, BracketMin
    `);

    res.json({
      success: true,
      data: { tables: result.recordset }
    });
  } catch (error) {
    log.error('Error listing contribution tables:', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve contribution tables' }
    });
  }
});

// POST /api/v1/admin/contribution-tables - Create contribution table entry
router.post('/contribution-tables', requirePermission('system:manage'), validate(createContributionTableSchema), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const userId = req.userId;
    const { effectiveYear, tableType, bracketMin, bracketMax, employeeShare, employerShare, fixedAmount, ratePercent, description } = req.body;

    const result = await pool.request()
      .input('EffectiveYear', sql.Int, effectiveYear)
      .input('TableType', sql.NVarChar, tableType)
      .input('BracketMin', sql.Decimal(18,2), bracketMin || 0)
      .input('BracketMax', sql.Decimal(18,2), bracketMax || 999999999)
      .input('EmployeeShare', sql.Decimal(18,2), employeeShare || null)
      .input('EmployerShare', sql.Decimal(18,2), employerShare || null)
      .input('FixedAmount', sql.Decimal(18,2), fixedAmount || null)
      .input('RatePercent', sql.Decimal(5,2), ratePercent || null)
      .input('Description', sql.NVarChar, description || null)
      .input('CreatedBy', sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO dbo.GovContributionTables (EffectiveYear, TableType, BracketMin, BracketMax, EmployeeShare, EmployerShare, FixedAmount, RatePercent, Description, CreatedBy)
        OUTPUT INSERTED.Id
        VALUES (@EffectiveYear, @TableType, @BracketMin, @BracketMax, @EmployeeShare, @EmployerShare, @FixedAmount, @RatePercent, @Description, @CreatedBy);
      `);

    const newId = result.recordset[0].Id;

    await logAuditEvent(pool, {
      tenantId: req.tenantId!, userId, action: 'CREATE', entityName: 'GovContributionTables', entityId: String(newId),
      afterJson: { effectiveYear, tableType, description },
      ipAddress: extractIp(req)
    });

    res.status(201).json({
      success: true,
      data: { id: newId, message: 'Contribution table entry created successfully' }
    });
  } catch (error) {
    log.error('Error creating contribution table:', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to create contribution table entry' }
    });
  }
});

// PUT /api/v1/admin/contribution-tables/:id - Update contribution table entry
router.put('/contribution-tables/:id', requirePermission('system:manage'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const userId = req.userId;
    const { id } = req.params;
    const { bracketMin, bracketMax, employeeShare, employerShare, fixedAmount, ratePercent, description } = req.body;

    const entryId = parseInt(id as string);
    const existing = await pool.request()
      .input('Id', sql.Int, entryId)
      .query('SELECT Id FROM dbo.GovContributionTables WHERE Id = @Id');

    if (existing.recordset.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Contribution table entry not found' }
      });
      return;
    }

    await pool.request()
      .input('Id', sql.Int, entryId)
      .input('BracketMin', sql.Decimal(18,2), bracketMin)
      .input('BracketMax', sql.Decimal(18,2), bracketMax)
      .input('EmployeeShare', sql.Decimal(18,2), employeeShare || null)
      .input('EmployerShare', sql.Decimal(18,2), employerShare || null)
      .input('FixedAmount', sql.Decimal(18,2), fixedAmount || null)
      .input('RatePercent', sql.Decimal(5,2), ratePercent || null)
      .input('Description', sql.NVarChar, description || null)
      .input('UpdatedBy', sql.UniqueIdentifier, userId)
      .query(`
        UPDATE dbo.GovContributionTables SET
          BracketMin = @BracketMin, BracketMax = @BracketMax,
          EmployeeShare = @EmployeeShare, EmployerShare = @EmployerShare,
          FixedAmount = @FixedAmount, RatePercent = @RatePercent,
          Description = @Description, UpdatedAtUtc = GETUTCDATE(), UpdatedBy = @UpdatedBy
        WHERE Id = @Id
      `);

    await logAuditEvent(pool, {
      tenantId: req.tenantId!, userId, action: 'UPDATE', entityName: 'GovContributionTables', entityId: String(entryId),
      afterJson: { bracketMin, bracketMax, employeeShare, employerShare, description },
      ipAddress: extractIp(req)
    });

    res.json({
      success: true,
      data: { message: 'Contribution table entry updated successfully' }
    });
  } catch (error) {
    log.error('Error updating contribution table:', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to update contribution table entry' }
    });
  }
});

// DELETE /api/v1/admin/contribution-tables/:id - Delete contribution table entry
router.delete('/contribution-tables/:id', requirePermission('system:manage'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const userId = req.userId;
    const { id } = req.params;

    const entryId = parseInt(id as string);
    const existing = await pool.request()
      .input('Id', sql.Int, entryId)
      .query('SELECT Id, Description FROM dbo.GovContributionTables WHERE Id = @Id');

    if (existing.recordset.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Contribution table entry not found' }
      });
      return;
    }

    await pool.request()
      .input('Id', sql.Int, entryId)
      .query('DELETE FROM dbo.GovContributionTables WHERE Id = @Id');

    await logAuditEvent(pool, {
      tenantId: req.tenantId!, userId, action: 'DELETE', entityName: 'GovContributionTables', entityId: String(entryId),
      beforeJson: existing.recordset[0],
      ipAddress: extractIp(req)
    });

    res.json({
      success: true,
      data: { message: 'Contribution table entry deleted successfully' }
    });
  } catch (error) {
    log.error('Error deleting contribution table:', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to delete contribution table entry' }
    });
  }
});

// POST /api/v1/admin/contribution-tables/copy-year - Copy tables from one year to another
router.post('/contribution-tables/copy-year', requirePermission('system:manage'), validate(copyYearSchema), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const userId = req.userId;
    const { sourceYear, targetYear } = req.body;

    // Check if target year already has data
    const targetCheck = await pool.request()
      .input('TargetYear', sql.Int, targetYear)
      .query('SELECT COUNT(*) AS count FROM dbo.GovContributionTables WHERE EffectiveYear = @TargetYear');

    if (targetCheck.recordset[0].count > 0) {
      res.status(409).json({
        success: false,
        error: { code: 'DUPLICATE', message: `Year ${targetYear} already has contribution data. Delete existing data first.` }
      });
      return;
    }

    // Copy from source to target
    await pool.request()
      .input('SourceYear', sql.Int, sourceYear)
      .input('TargetYear', sql.Int, targetYear)
      .input('CreatedBy', sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO dbo.GovContributionTables (EffectiveYear, TableType, BracketMin, BracketMax, EmployeeShare, EmployerShare, FixedAmount, RatePercent, Description, CreatedBy)
        SELECT @TargetYear, TableType, BracketMin, BracketMax, EmployeeShare, EmployerShare, FixedAmount, RatePercent, 
               REPLACE(Description, CAST(@SourceYear AS NVARCHAR), CAST(@TargetYear AS NVARCHAR)),
               @CreatedBy
        FROM dbo.GovContributionTables
        WHERE EffectiveYear = @SourceYear
      `);

    await logAuditEvent(pool, {
      tenantId: req.tenantId!, userId, action: 'CREATE', entityName: 'GovContributionTables', entityId: `copy-${sourceYear}-to-${targetYear}`,
      afterJson: { sourceYear, targetYear },
      ipAddress: extractIp(req)
    });

    res.status(201).json({
      success: true,
      data: { message: `Copied contribution tables from ${sourceYear} to ${targetYear}` }
    });
  } catch (error) {
    log.error('Error copying contribution tables:', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to copy contribution tables' }
    });
  }
});

// ──────────────────────────────────────────────────────────────
// PERMISSION CATALOG
// ──────────────────────────────────────────────────────────────

// GET /api/v1/admin/permissions - List all permissions
router.get('/permissions', requirePermission('role:manage'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;

    const result = await pool.request()
      .query(`
        SELECT Id, Code, Description
        FROM dbo.Permissions
        WHERE IsDeleted = 0
        ORDER BY Code
      `);

    res.json({
      success: true,
      data: { permissions: result.recordset }
    });
  } catch (error) {
    log.error('Error listing permissions:', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve permissions' }
    });
  }
});

// ──────────────────────────────────────────────────────────────
// PERA ENROLLMENT MANAGEMENT (SUPER ADMIN)
// ──────────────────────────────────────────────────────────────

// GET /api/v1/admin/pera/enrollments - List all PERA enrollments across tenants
router.get('/pera/enrollments', requirePermission('system:manage'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const { tenantId } = req.query;

    let whereClause = 'WHERE pe.IsDeleted = 0';
    const request = pool.request();

    if (tenantId) {
      whereClause += ' AND pe.TenantId = @TenantId';
      request.input('TenantId', sql.UniqueIdentifier, tenantId);
    }

    const result = await request.query(`
      SELECT pe.Id, pe.TenantId, pe.EmployeeId, pe.IsEnrolled, pe.EnrolledDate,
             pe.ContributionType, pe.EmployeeContributionAmount,
             pe.EmployerMatchType, pe.EmployerMatchValue, pe.EmployerMatchMaxCap,
             pe.PERAAdministratorId, pe.PERAAccountNo, pe.UpdatedAtUtc,
             t.CompanyName, t.CompanyCode,
             e.EmployeeNo, e.FirstName, e.LastName
      FROM dbo.EmployeePeraEnrollment pe
      INNER JOIN dbo.Tenants t ON pe.TenantId = t.Id
      INNER JOIN dbo.Employees e ON pe.EmployeeId = e.Id
      ${whereClause}
      ORDER BY t.CompanyName, e.LastName, e.FirstName
    `);

    res.json({
      success: true,
      data: { enrollments: result.recordset }
    });
  } catch (error) {
    console.error('Error listing PERA enrollments:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve PERA enrollments' } });
  }
});

// Helper to get the system tenant ID
async function getSystemTenantId(pool: any): Promise<string> {
  const result = await pool.request()
    .query('SELECT Id FROM dbo.Tenants WHERE CompanyCode = \'SYSTEM\' AND IsDeleted = 0');
  return result.recordset[0]?.Id;
}

export default router;
