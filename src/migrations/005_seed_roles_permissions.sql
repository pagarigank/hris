-- Migration 005: Seed Roles, Permissions, RolePermissions, and UserRoles
-- Requires RLS tenant context to be set

DECLARE @TenantId UNIQUEIDENTIFIER;
SELECT @TenantId = Id FROM dbo.Tenants WHERE CompanyCode = 'SYSTEM' AND IsDeleted = 0;

-- Set tenant context for RLS
EXEC sp_set_session_context @name=N'TenantId', @value=@TenantId;

-- ============================================================
-- 1. SEED PERMISSIONS (if empty)
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM dbo.Permissions WHERE IsDeleted = 0)
BEGIN
    INSERT INTO dbo.Permissions (Code, Description) VALUES
    ('employee:read', 'View employee profiles and lists'),
    ('employee:write', 'Create and edit employee profiles'),
    ('employee:delete', 'Soft-delete employee records'),
    ('attendance:read', 'View attendance and DTR records'),
    ('attendance:read:self', 'View own attendance and DTR records'),
    ('attendance:write', 'Clock in/out, edit attendance'),
    ('attendance:write:self', 'Clock in/out for self'),
    ('attendance:approve', 'Approve overtime and DTR corrections'),
    ('attendance:manage', 'Manage shifts, schedules, geofences, holidays'),
    ('leave:read', 'View leave credits and requests'),
    ('leave:read:self', 'View own leave credits and requests'),
    ('leave:write', 'Submit leave requests'),
    ('leave:write:self', 'Submit own leave requests'),
    ('leave:approve', 'Approve or reject leave requests'),
    ('payroll:read', 'View payroll periods, runs, and payslips'),
    ('payroll:write', 'Create payroll periods and run payroll'),
    ('payroll:approve', 'Approve payroll runs'),
    ('reports:read', 'View reports and analytics'),
    ('hr-matrix:read', 'View HR matrix dashboard'),
    ('hr-matrix:write', 'Edit HR matrix settings and assignments'),
    ('settings:read', 'View system settings'),
    ('settings:write', 'Edit system settings'),
    ('tenant:manage', 'Manage tenant configuration'),
    ('role:manage', 'Create and manage roles'),
    ('user:manage', 'Create and manage user accounts');
    PRINT 'Permissions seeded: 19 rows';
END
ELSE
BEGIN
    PRINT 'Permissions already exist, skipping';
END

-- ============================================================
-- 2. SEED ROLES (if missing for this tenant)
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE TenantId = @TenantId AND Name = 'Super Admin' AND IsDeleted = 0)
BEGIN
    INSERT INTO dbo.Roles (TenantId, Name, IsSystemRole) VALUES
    (@TenantId, 'Super Admin', 1);
    PRINT 'Role Super Admin created';
END

IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE TenantId = @TenantId AND Name = 'Tenant Admin' AND IsDeleted = 0)
BEGIN
    INSERT INTO dbo.Roles (TenantId, Name, IsSystemRole) VALUES
    (@TenantId, 'Tenant Admin', 1);
    PRINT 'Role Tenant Admin created';
END

IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE TenantId = @TenantId AND Name = 'HR Admin' AND IsDeleted = 0)
BEGIN
    INSERT INTO dbo.Roles (TenantId, Name, IsSystemRole) VALUES
    (@TenantId, 'HR Admin', 1);
    PRINT 'Role HR Admin created';
END

IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE TenantId = @TenantId AND Name = 'Payroll Officer' AND IsDeleted = 0)
BEGIN
    INSERT INTO dbo.Roles (TenantId, Name, IsSystemRole) VALUES
    (@TenantId, 'Payroll Officer', 1);
    PRINT 'Role Payroll Officer created';
END

IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE TenantId = @TenantId AND Name = 'Department Manager' AND IsDeleted = 0)
BEGIN
    INSERT INTO dbo.Roles (TenantId, Name, IsSystemRole) VALUES
    (@TenantId, 'Department Manager', 1);
    PRINT 'Role Department Manager created';
END

IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE TenantId = @TenantId AND Name = 'Employee' AND IsDeleted = 0)
BEGIN
    INSERT INTO dbo.Roles (TenantId, Name, IsSystemRole) VALUES
    (@TenantId, 'Employee', 1);
    PRINT 'Role Employee created';
END

-- ============================================================
-- 3. SEED ROLE-PERMISSIONS (if empty)
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM dbo.RolePermissions)
BEGIN
    DECLARE @SuperAdminId UNIQUEIDENTIFIER;
    DECLARE @TenantAdminId UNIQUEIDENTIFIER;
    DECLARE @HRAdminId UNIQUEIDENTIFIER;
    DECLARE @PayrollOfficerId UNIQUEIDENTIFIER;
    DECLARE @DeptManagerId UNIQUEIDENTIFIER;
    DECLARE @EmployeeRoleId UNIQUEIDENTIFIER;

    SELECT @SuperAdminId = Id FROM dbo.Roles WHERE TenantId = @TenantId AND Name = 'Super Admin' AND IsDeleted = 0;
    SELECT @TenantAdminId = Id FROM dbo.Roles WHERE TenantId = @TenantId AND Name = 'Tenant Admin' AND IsDeleted = 0;
    SELECT @HRAdminId = Id FROM dbo.Roles WHERE TenantId = @TenantId AND Name = 'HR Admin' AND IsDeleted = 0;
    SELECT @PayrollOfficerId = Id FROM dbo.Roles WHERE TenantId = @TenantId AND Name = 'Payroll Officer' AND IsDeleted = 0;
    SELECT @DeptManagerId = Id FROM dbo.Roles WHERE TenantId = @TenantId AND Name = 'Department Manager' AND IsDeleted = 0;
    SELECT @EmployeeRoleId = Id FROM dbo.Roles WHERE TenantId = @TenantId AND Name = 'Employee' AND IsDeleted = 0;

    -- Super Admin: ALL permissions
    INSERT INTO dbo.RolePermissions (RoleId, PermissionId)
    SELECT @SuperAdminId, Id FROM dbo.Permissions WHERE IsDeleted = 0;

    -- Tenant Admin: ALL permissions
    INSERT INTO dbo.RolePermissions (RoleId, PermissionId)
    SELECT @TenantAdminId, Id FROM dbo.Permissions WHERE IsDeleted = 0;

    -- HR Admin
    INSERT INTO dbo.RolePermissions (RoleId, PermissionId)
    SELECT @HRAdminId, Id FROM dbo.Permissions WHERE Code IN (
        'employee:read', 'employee:write', 'employee:delete',
        'attendance:read', 'attendance:read:self', 'attendance:write', 'attendance:write:self', 'attendance:approve', 'attendance:manage',
        'leave:read', 'leave:read:self', 'leave:write', 'leave:write:self', 'leave:approve',
        'payroll:read', 'payroll:write', 'payroll:approve',
        'reports:read', 'hr-matrix:read', 'hr-matrix:write'
    ) AND IsDeleted = 0;

    -- Payroll Officer
    INSERT INTO dbo.RolePermissions (RoleId, PermissionId)
    SELECT @PayrollOfficerId, Id FROM dbo.Permissions WHERE Code IN (
        'employee:read', 'payroll:read', 'payroll:write', 'payroll:approve', 'reports:read'
    ) AND IsDeleted = 0;

    -- Department Manager
    INSERT INTO dbo.RolePermissions (RoleId, PermissionId)
    SELECT @DeptManagerId, Id FROM dbo.Permissions WHERE Code IN (
        'attendance:read', 'attendance:read:self', 'attendance:approve',
        'leave:read', 'leave:read:self', 'leave:approve', 'reports:read'
    ) AND IsDeleted = 0;

    -- Employee
    INSERT INTO dbo.RolePermissions (RoleId, PermissionId)
    SELECT @EmployeeRoleId, Id FROM dbo.Permissions WHERE Code IN (
        'attendance:read', 'attendance:read:self', 'attendance:write', 'attendance:write:self',
        'leave:read', 'leave:read:self', 'leave:write', 'leave:write:self', 'employee:read'
    ) AND IsDeleted = 0;

    PRINT 'RolePermissions seeded for all 6 roles';
END
ELSE
BEGIN
    PRINT 'RolePermissions already exist, skipping';
END

-- ============================================================
-- 4. ASSIGN Super Admin ROLE TO admin@system.com
-- ============================================================
DECLARE @AdminUserId UNIQUEIDENTIFIER;
DECLARE @SuperAdminRoleId UNIQUEIDENTIFIER;

SELECT @AdminUserId = Id FROM dbo.Users WHERE Email = 'admin@system.com' AND IsDeleted = 0;
SELECT @SuperAdminRoleId = Id FROM dbo.Roles WHERE TenantId = @TenantId AND Name = 'Super Admin' AND IsDeleted = 0;

IF @AdminUserId IS NOT NULL AND @SuperAdminRoleId IS NOT NULL
BEGIN
    IF NOT EXISTS (SELECT 1 FROM dbo.UserRoles WHERE UserId = @AdminUserId AND RoleId = @SuperAdminRoleId)
    BEGIN
        INSERT INTO dbo.UserRoles (UserId, RoleId, TenantId, CreatedBy)
        VALUES (@AdminUserId, @SuperAdminRoleId, @TenantId, @AdminUserId);
        PRINT 'Assigned Super Admin role to admin@system.com';
    END
    ELSE
    BEGIN
        PRINT 'admin@system.com already has Super Admin role';
    END
END
ELSE
BEGIN
    PRINT 'WARNING: admin user or Super Admin role not found';
END
GO
