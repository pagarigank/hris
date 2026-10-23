-- Migration 001: Create all HRIS tables
-- Version: 001
-- Date: 2024-01-01
-- Description: Initial schema creation for Philippine HRIS

-- ============================================
-- SECTION 3.1: Tenancy & Identity
-- ============================================

-- Tenants table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Tenants')
BEGIN
    CREATE TABLE dbo.Tenants (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        CompanyName NVARCHAR(200) NOT NULL,
        CompanyCode NVARCHAR(50) NOT NULL UNIQUE,
        TIN NVARCHAR(20) NULL,
        SssEmployerNo NVARCHAR(20) NULL,
        PhilHealthEmployerNo NVARCHAR(20) NULL,
        PagIbigEmployerNo NVARCHAR(20) NULL,
        Address NVARCHAR(500) NULL,
        TimeZone NVARCHAR(50) DEFAULT 'Asia/Manila',
        SubscriptionPlan NVARCHAR(50) NULL,
        Status NVARCHAR(20) DEFAULT 'Active',
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        IsDeleted BIT DEFAULT 0
    );
END
GO

-- Users table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Users')
BEGIN
    CREATE TABLE dbo.Users (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        Email NVARCHAR(255) NOT NULL,
        PasswordHash NVARCHAR(255) NOT NULL,
        PhoneNumber NVARCHAR(20) NULL,
        IsActive BIT DEFAULT 1,
        MfaEnabled BIT DEFAULT 0,
        LastLoginAtUtc DATETIME2 NULL,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        IsDeleted BIT DEFAULT 0,
        CONSTRAINT FK_Users_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id)
    );
    CREATE INDEX idx_users_tenant_email ON dbo.Users(TenantId, Email);
END
GO

-- Roles table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Roles')
BEGIN
    CREATE TABLE dbo.Roles (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NULL,
        Name NVARCHAR(100) NOT NULL,
        IsSystemRole BIT DEFAULT 0,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        IsDeleted BIT DEFAULT 0,
        CONSTRAINT FK_Roles_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id)
    );
    CREATE INDEX idx_roles_tenant_name ON dbo.Roles(TenantId, Name);
END
GO

-- Permissions table (global catalog, not tenant-scoped)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Permissions')
BEGIN
    CREATE TABLE dbo.Permissions (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        Code NVARCHAR(100) NOT NULL UNIQUE,
        Description NVARCHAR(500) NULL,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        IsDeleted BIT DEFAULT 0
    );
END
GO

-- RolePermissions table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'RolePermissions')
BEGIN
    CREATE TABLE dbo.RolePermissions (
        RoleId UNIQUEIDENTIFIER NOT NULL,
        PermissionId UNIQUEIDENTIFIER NOT NULL,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        CONSTRAINT PK_RolePermissions PRIMARY KEY (RoleId, PermissionId),
        CONSTRAINT FK_RolePermissions_Role FOREIGN KEY (RoleId) REFERENCES dbo.Roles(Id),
        CONSTRAINT FK_RolePermissions_Permission FOREIGN KEY (PermissionId) REFERENCES dbo.Permissions(Id)
    );
END
GO

-- UserRoles table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'UserRoles')
BEGIN
    CREATE TABLE dbo.UserRoles (
        UserId UNIQUEIDENTIFIER NOT NULL,
        RoleId UNIQUEIDENTIFIER NOT NULL,
        TenantId UNIQUEIDENTIFIER NOT NULL,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        CONSTRAINT PK_UserRoles PRIMARY KEY (UserId, RoleId),
        CONSTRAINT FK_UserRoles_User FOREIGN KEY (UserId) REFERENCES dbo.Users(Id),
        CONSTRAINT FK_UserRoles_Role FOREIGN KEY (RoleId) REFERENCES dbo.Roles(Id),
        CONSTRAINT FK_UserRoles_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id)
    );
    CREATE INDEX idx_userroles_tenant ON dbo.UserRoles(TenantId);
END
GO

-- EmployeeUserLink table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'EmployeeUserLink')
BEGIN
    CREATE TABLE dbo.EmployeeUserLink (
        EmployeeId UNIQUEIDENTIFIER NOT NULL,
        UserId UNIQUEIDENTIFIER NOT NULL UNIQUE,
        TenantId UNIQUEIDENTIFIER NOT NULL,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        CONSTRAINT PK_EmployeeUserLink PRIMARY KEY (EmployeeId),
        CONSTRAINT FK_EmployeeUserLink_User FOREIGN KEY (UserId) REFERENCES dbo.Users(Id),
        CONSTRAINT FK_EmployeeUserLink_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id)
    );
    CREATE INDEX idx_employeeuserlink_tenant ON dbo.EmployeeUserLink(TenantId);
END
GO

-- RefreshTokens table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'RefreshTokens')
BEGIN
    CREATE TABLE dbo.RefreshTokens (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        UserId UNIQUEIDENTIFIER NOT NULL,
        TokenHash NVARCHAR(255) NOT NULL,
        ExpiresAtUtc DATETIME2 NOT NULL,
        DeviceInfo NVARCHAR(500) NULL,
        RevokedAtUtc DATETIME2 NULL,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        CONSTRAINT FK_RefreshTokens_User FOREIGN KEY (UserId) REFERENCES dbo.Users(Id)
    );
    CREATE INDEX idx_refreshtokens_user ON dbo.RefreshTokens(UserId);
END
GO

-- AuditLogs table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AuditLogs')
BEGIN
    CREATE TABLE dbo.AuditLogs (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        UserId UNIQUEIDENTIFIER NULL,
        Action NVARCHAR(50) NOT NULL,
        EntityName NVARCHAR(100) NOT NULL,
        EntityId NVARCHAR(100) NULL,
        BeforeJson NVARCHAR(MAX) NULL,
        AfterJson NVARCHAR(MAX) NULL,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        IpAddress NVARCHAR(50) NULL,
        CONSTRAINT FK_AuditLogs_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id)
    );
    CREATE INDEX idx_auditlogs_tenant ON dbo.AuditLogs(TenantId);
    CREATE INDEX idx_auditlogs_tenant_entity ON dbo.AuditLogs(TenantId, EntityName);
    CREATE INDEX idx_auditlogs_tenant_date ON dbo.AuditLogs(TenantId, CreatedAtUtc);
END
GO

-- ============================================
-- SECTION 3.2: Core HR / Employee Master
-- ============================================

-- Departments table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Departments')
BEGIN
    CREATE TABLE dbo.Departments (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        Name NVARCHAR(200) NOT NULL,
        ParentDepartmentId UNIQUEIDENTIFIER NULL,
        Code NVARCHAR(50) NOT NULL,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        IsDeleted BIT DEFAULT 0,
        CONSTRAINT FK_Departments_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
        CONSTRAINT FK_Departments_Parent FOREIGN KEY (ParentDepartmentId) REFERENCES dbo.Departments(Id)
    );
    CREATE INDEX idx_departments_tenant ON dbo.Departments(TenantId);
    CREATE INDEX idx_departments_tenant_code ON dbo.Departments(TenantId, Code);
END
GO

-- Positions table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Positions')
BEGIN
    CREATE TABLE dbo.Positions (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        Title NVARCHAR(200) NOT NULL,
        DepartmentId UNIQUEIDENTIFIER NOT NULL,
        JobGrade NVARCHAR(50) NULL,
        SalaryGradeMin DECIMAL(18,4) NULL,
        SalaryGradeMax DECIMAL(18,4) NULL,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        IsDeleted BIT DEFAULT 0,
        CONSTRAINT FK_Positions_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
        CONSTRAINT FK_Positions_Department FOREIGN KEY (DepartmentId) REFERENCES dbo.Departments(Id)
    );
    CREATE INDEX idx_positions_tenant ON dbo.Positions(TenantId);
    CREATE INDEX idx_positions_tenant_department ON dbo.Positions(TenantId, DepartmentId);
END
GO

-- Employees table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Employees')
BEGIN
    CREATE TABLE dbo.Employees (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        EmployeeNo NVARCHAR(50) NOT NULL,
        FirstName NVARCHAR(100) NOT NULL,
        MiddleName NVARCHAR(100) NULL,
        LastName NVARCHAR(100) NOT NULL,
        Suffix NVARCHAR(20) NULL,
        BirthDate DATE NULL,
        Gender NVARCHAR(20) NULL,
        CivilStatus NVARCHAR(20) NULL,
        Nationality NVARCHAR(50) NULL,
        PhilSysNo NVARCHAR(30) NULL,
        TIN NVARCHAR(20) NULL,
        SssNo NVARCHAR(20) NULL,
        PhilHealthNo NVARCHAR(20) NULL,
        PagIbigNo NVARCHAR(20) NULL,
        Email NVARCHAR(255) NULL,
        MobileNumber NVARCHAR(20) NULL,
        Address NVARCHAR(500) NULL,
        EmploymentStatus NVARCHAR(30) DEFAULT 'Probationary',
        DateHired DATE NOT NULL,
        DateRegularized DATE NULL,
        DateSeparated DATE NULL,
        SeparationReason NVARCHAR(500) NULL,
        DepartmentId UNIQUEIDENTIFIER NOT NULL,
        PositionId UNIQUEIDENTIFIER NOT NULL,
        ImmediateSupervisorId UNIQUEIDENTIFIER NULL,
        BasicSalary DECIMAL(18,4) NOT NULL,
        PayFrequency NVARCHAR(20) DEFAULT 'Monthly',
        BankName NVARCHAR(100) NULL,
        BankAccountNo NVARCHAR(50) NULL,
        PhotoUrl NVARCHAR(500) NULL,
        IsActive BIT DEFAULT 1,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        IsDeleted BIT DEFAULT 0,
        CONSTRAINT FK_Employees_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
        CONSTRAINT FK_Employees_Department FOREIGN KEY (DepartmentId) REFERENCES dbo.Departments(Id),
        CONSTRAINT FK_Employees_Position FOREIGN KEY (PositionId) REFERENCES dbo.Positions(Id),
        CONSTRAINT FK_Employees_Supervisor FOREIGN KEY (ImmediateSupervisorId) REFERENCES dbo.Employees(Id),
        CONSTRAINT UQ_Employees_TenantEmployeeNo UNIQUE (TenantId, EmployeeNo)
    );
    CREATE INDEX idx_employees_tenant ON dbo.Employees(TenantId);
    CREATE INDEX idx_employees_tenant_department ON dbo.Employees(TenantId, DepartmentId);
    CREATE INDEX idx_employees_tenant_active ON dbo.Employees(TenantId, IsActive);
END
GO

-- EmployeeDependents table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'EmployeeDependents')
BEGIN
    CREATE TABLE dbo.EmployeeDependents (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        EmployeeId UNIQUEIDENTIFIER NOT NULL,
        TenantId UNIQUEIDENTIFIER NOT NULL,
        FullName NVARCHAR(200) NOT NULL,
        Relationship NVARCHAR(50) NOT NULL,
        BirthDate DATE NULL,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        IsDeleted BIT DEFAULT 0,
        CONSTRAINT FK_EmployeeDependents_Employee FOREIGN KEY (EmployeeId) REFERENCES dbo.Employees(Id)
    );
    CREATE INDEX idx_employeedependents_tenant ON dbo.EmployeeDependents(TenantId);
    CREATE INDEX idx_employeedependents_employee ON dbo.EmployeeDependents(EmployeeId);
END
GO

-- EmployeeEmploymentHistory table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'EmployeeEmploymentHistory')
BEGIN
    CREATE TABLE dbo.EmployeeEmploymentHistory (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        EmployeeId UNIQUEIDENTIFIER NOT NULL,
        TenantId UNIQUEIDENTIFIER NOT NULL,
        EffectiveDate DATE NOT NULL,
        ChangeType NVARCHAR(30) NOT NULL,
        OldValueJson NVARCHAR(MAX) NULL,
        NewValueJson NVARCHAR(MAX) NULL,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        CONSTRAINT FK_EmployeeEmploymentHistory_Employee FOREIGN KEY (EmployeeId) REFERENCES dbo.Employees(Id)
    );
    CREATE INDEX idx_employeeemploymenthistory_tenant ON dbo.EmployeeEmploymentHistory(TenantId);
    CREATE INDEX idx_employeeemploymenthistory_employee ON dbo.EmployeeEmploymentHistory(EmployeeId);
END
GO

-- EmployeeDocuments table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'EmployeeDocuments')
BEGIN
    CREATE TABLE dbo.EmployeeDocuments (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        EmployeeId UNIQUEIDENTIFIER NOT NULL,
        TenantId UNIQUEIDENTIFIER NOT NULL,
        DocType NVARCHAR(50) NOT NULL,
        FileUrl NVARCHAR(500) NOT NULL,
        UploadedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        ExpiryDate DATE NULL,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        IsDeleted BIT DEFAULT 0,
        CONSTRAINT FK_EmployeeDocuments_Employee FOREIGN KEY (EmployeeId) REFERENCES dbo.Employees(Id)
    );
    CREATE INDEX idx_employeedocuments_tenant ON dbo.EmployeeDocuments(TenantId);
    CREATE INDEX idx_employeedocuments_employee ON dbo.EmployeeDocuments(EmployeeId);
END
GO

-- ============================================
-- SECTION 3.3: Attendance Monitoring
-- ============================================

-- Shifts table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Shifts')
BEGIN
    CREATE TABLE dbo.Shifts (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        Name NVARCHAR(100) NOT NULL,
        TimeIn NVARCHAR(5) NOT NULL,
        TimeOut NVARCHAR(5) NOT NULL,
        BreakMinutes INT DEFAULT 60,
        GraceMinutesLate INT DEFAULT 10,
        IsNightShift BIT DEFAULT 0,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        IsDeleted BIT DEFAULT 0,
        CONSTRAINT FK_Shifts_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id)
    );
    CREATE INDEX idx_shifts_tenant ON dbo.Shifts(TenantId);
END
GO

-- EmployeeSchedules table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'EmployeeSchedules')
BEGIN
    CREATE TABLE dbo.EmployeeSchedules (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        EmployeeId UNIQUEIDENTIFIER NOT NULL,
        TenantId UNIQUEIDENTIFIER NOT NULL,
        ShiftId UNIQUEIDENTIFIER NOT NULL,
        EffectiveDate DATE NOT NULL,
        DayOfWeekPattern NVARCHAR(20) NOT NULL,
        ExpiryDate DATE NULL,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        IsDeleted BIT DEFAULT 0,
        CONSTRAINT FK_EmployeeSchedules_Employee FOREIGN KEY (EmployeeId) REFERENCES dbo.Employees(Id),
        CONSTRAINT FK_EmployeeSchedules_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
        CONSTRAINT FK_EmployeeSchedules_Shift FOREIGN KEY (ShiftId) REFERENCES dbo.Shifts(Id)
    );
    CREATE INDEX idx_employeeschedules_tenant ON dbo.EmployeeSchedules(TenantId);
    CREATE INDEX idx_employeeschedules_employee ON dbo.EmployeeSchedules(EmployeeId);
END
GO

-- Geofences table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Geofences')
BEGIN
    CREATE TABLE dbo.Geofences (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        Name NVARCHAR(200) NOT NULL,
        Latitude DECIMAL(10,8) NOT NULL,
        Longitude DECIMAL(11,8) NOT NULL,
        RadiusMeters INT DEFAULT 100,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        IsDeleted BIT DEFAULT 0,
        CONSTRAINT FK_Geofences_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id)
    );
    CREATE INDEX idx_geofences_tenant ON dbo.Geofences(TenantId);
END
GO

-- DeviceRegistry table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'DeviceRegistry')
BEGIN
    CREATE TABLE dbo.DeviceRegistry (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        EmployeeId UNIQUEIDENTIFIER NOT NULL,
        DeviceId NVARCHAR(100) NOT NULL,
        DeviceType NVARCHAR(20) NOT NULL,
        RegisteredAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        IsTrusted BIT DEFAULT 0,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        IsDeleted BIT DEFAULT 0,
        CONSTRAINT FK_DeviceRegistry_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
        CONSTRAINT FK_DeviceRegistry_Employee FOREIGN KEY (EmployeeId) REFERENCES dbo.Employees(Id)
    );
    CREATE INDEX idx_deviceregistry_tenant ON dbo.DeviceRegistry(TenantId);
    CREATE INDEX idx_deviceregistry_employee ON dbo.DeviceRegistry(EmployeeId);
END
GO

-- AttendanceLogs table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AttendanceLogs')
BEGIN
    CREATE TABLE dbo.AttendanceLogs (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        EmployeeId UNIQUEIDENTIFIER NOT NULL,
        LogType NVARCHAR(20) NOT NULL,
        LogTimestampUtc DATETIME2 NOT NULL,
        SourceLatitude DECIMAL(10,8) NULL,
        SourceLongitude DECIMAL(11,8) NULL,
        WithinGeofence BIT DEFAULT 0,
        SelfieUrl NVARCHAR(500) NULL,
        DeviceId NVARCHAR(100) NULL,
        SyncedFromOfflineQueue BIT DEFAULT 0,
        RawBiometricPayload NVARCHAR(MAX) NULL,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        IsDeleted BIT DEFAULT 0,
        CONSTRAINT FK_AttendanceLogs_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
        CONSTRAINT FK_AttendanceLogs_Employee FOREIGN KEY (EmployeeId) REFERENCES dbo.Employees(Id)
    );
    CREATE INDEX idx_attendancelogs_tenant ON dbo.AttendanceLogs(TenantId);
    CREATE INDEX idx_attendancelogs_employee ON dbo.AttendanceLogs(EmployeeId);
    CREATE INDEX idx_attendancelogs_employee_timestamp ON dbo.AttendanceLogs(EmployeeId, LogTimestampUtc);
END
GO

-- Add idempotency constraint for attendance logs
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'uq_attendance_idempotency' AND object_id = OBJECT_ID('dbo.AttendanceLogs'))
BEGIN
    ALTER TABLE dbo.AttendanceLogs
    ADD CONSTRAINT uq_attendance_idempotency UNIQUE (EmployeeId, LogType, LogTimestampUtc);
END
GO

-- DailyTimeRecords table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'DailyTimeRecords')
BEGIN
    CREATE TABLE dbo.DailyTimeRecords (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        EmployeeId UNIQUEIDENTIFIER NOT NULL,
        WorkDate DATE NOT NULL,
        ScheduledTimeIn NVARCHAR(5) NULL,
        ScheduledTimeOut NVARCHAR(5) NULL,
        ActualTimeIn DATETIME2 NULL,
        ActualTimeOut DATETIME2 NULL,
        LateMinutes INT DEFAULT 0,
        UndertimeMinutes INT DEFAULT 0,
        OvertimeMinutes INT DEFAULT 0,
        NightDiffMinutes INT DEFAULT 0,
        Status NVARCHAR(20) DEFAULT 'Present',
        IsManualEntry BIT DEFAULT 0,
        ApprovedBy UNIQUEIDENTIFIER NULL,
        RemarkNote NVARCHAR(500) NULL,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        IsDeleted BIT DEFAULT 0,
        CONSTRAINT FK_DailyTimeRecords_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
        CONSTRAINT FK_DailyTimeRecords_Employee FOREIGN KEY (EmployeeId) REFERENCES dbo.Employees(Id),
        CONSTRAINT UQ_DailyTimeRecords_TenantEmployeeDate UNIQUE (TenantId, EmployeeId, WorkDate)
    );
    CREATE INDEX idx_dailytimerecords_tenant ON dbo.DailyTimeRecords(TenantId);
    CREATE INDEX idx_dailytimerecords_employee ON dbo.DailyTimeRecords(EmployeeId);
END
GO

-- OvertimeRequests table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'OvertimeRequests')
BEGIN
    CREATE TABLE dbo.OvertimeRequests (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        EmployeeId UNIQUEIDENTIFIER NOT NULL,
        WorkDate DATE NOT NULL,
        RequestedHours DECIMAL(5,2) NOT NULL,
        Reason NVARCHAR(500) NOT NULL,
        Status NVARCHAR(20) DEFAULT 'Pending',
        ApproverId UNIQUEIDENTIFIER NULL,
        ApprovedAtUtc DATETIME2 NULL,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        IsDeleted BIT DEFAULT 0,
        CONSTRAINT FK_OvertimeRequests_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
        CONSTRAINT FK_OvertimeRequests_Employee FOREIGN KEY (EmployeeId) REFERENCES dbo.Employees(Id),
        CONSTRAINT FK_OvertimeRequests_Approver FOREIGN KEY (ApproverId) REFERENCES dbo.Employees(Id)
    );
    CREATE INDEX idx_overtimerequests_tenant ON dbo.OvertimeRequests(TenantId);
    CREATE INDEX idx_overtimerequests_employee ON dbo.OvertimeRequests(EmployeeId);
END
GO

-- Holidays table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Holidays')
BEGIN
    CREATE TABLE dbo.Holidays (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NULL,
        HolidayDate DATE NOT NULL,
        Name NVARCHAR(200) NOT NULL,
        Type NVARCHAR(30) NOT NULL,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        IsDeleted BIT DEFAULT 0,
        CONSTRAINT FK_Holidays_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id)
    );
    CREATE INDEX idx_holidays_tenant ON dbo.Holidays(TenantId);
    CREATE INDEX idx_holidays_date ON dbo.Holidays(HolidayDate);
END
GO

-- ============================================
-- SECTION 3.4: Leave Monitoring
-- ============================================

-- LeaveTypes table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'LeaveTypes')
BEGIN
    CREATE TABLE dbo.LeaveTypes (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        Code NVARCHAR(20) NOT NULL,
        Name NVARCHAR(100) NOT NULL,
        IsPaid BIT DEFAULT 1,
        AccrualRatePerMonth DECIMAL(5,2) NOT NULL,
        MaxCarryOverDays INT DEFAULT 0,
        IsMonetizable BIT DEFAULT 0,
        RequiresDocumentation BIT DEFAULT 0,
        LegalBasis NVARCHAR(200) NULL,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        IsDeleted BIT DEFAULT 0,
        CONSTRAINT FK_LeaveTypes_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id)
    );
    CREATE INDEX idx_leavetypes_tenant ON dbo.LeaveTypes(TenantId);
    CREATE INDEX idx_leavetypes_tenant_code ON dbo.LeaveTypes(TenantId, Code);
END
GO

-- LeaveCredits table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'LeaveCredits')
BEGIN
    CREATE TABLE dbo.LeaveCredits (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        EmployeeId UNIQUEIDENTIFIER NOT NULL,
        LeaveTypeId UNIQUEIDENTIFIER NOT NULL,
        Year INT NOT NULL,
        EarnedDays DECIMAL(5,2) DEFAULT 0,
        UsedDays DECIMAL(5,2) DEFAULT 0,
        CarriedOverDays DECIMAL(5,2) DEFAULT 0,
        MonetizedDays DECIMAL(5,2) DEFAULT 0,
        BalanceDays DECIMAL(5,2) DEFAULT 0,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        IsDeleted BIT DEFAULT 0,
        CONSTRAINT FK_LeaveCredits_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
        CONSTRAINT FK_LeaveCredits_Employee FOREIGN KEY (EmployeeId) REFERENCES dbo.Employees(Id),
        CONSTRAINT FK_LeaveCredits_LeaveType FOREIGN KEY (LeaveTypeId) REFERENCES dbo.LeaveTypes(Id),
        CONSTRAINT UQ_LeaveCredits_TenantEmployeeTypeYear UNIQUE (TenantId, EmployeeId, LeaveTypeId, Year)
    );
    CREATE INDEX idx_leavecredits_tenant ON dbo.LeaveCredits(TenantId);
    CREATE INDEX idx_leavecredits_employee ON dbo.LeaveCredits(EmployeeId);
END
GO

-- LeaveRequests table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'LeaveRequests')
BEGIN
    CREATE TABLE dbo.LeaveRequests (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        EmployeeId UNIQUEIDENTIFIER NOT NULL,
        LeaveTypeId UNIQUEIDENTIFIER NOT NULL,
        DateFrom DATE NOT NULL,
        DateTo DATE NOT NULL,
        TotalDays DECIMAL(5,2) NOT NULL,
        IsHalfDay BIT DEFAULT 0,
        Reason NVARCHAR(1000) NOT NULL,
        AttachmentUrl NVARCHAR(500) NULL,
        Status NVARCHAR(20) DEFAULT 'Pending',
        CurrentApproverId UNIQUEIDENTIFIER NULL,
        SubmittedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        DecidedAtUtc DATETIME2 NULL,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        IsDeleted BIT DEFAULT 0,
        CONSTRAINT FK_LeaveRequests_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
        CONSTRAINT FK_LeaveRequests_Employee FOREIGN KEY (EmployeeId) REFERENCES dbo.Employees(Id),
        CONSTRAINT FK_LeaveRequests_LeaveType FOREIGN KEY (LeaveTypeId) REFERENCES dbo.LeaveTypes(Id)
    );
    CREATE INDEX idx_leaverequests_tenant ON dbo.LeaveRequests(TenantId);
    CREATE INDEX idx_leaverequests_employee ON dbo.LeaveRequests(EmployeeId);
END
GO

-- LeaveApprovalSteps table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'LeaveApprovalSteps')
BEGIN
    CREATE TABLE dbo.LeaveApprovalSteps (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        LeaveRequestId UNIQUEIDENTIFIER NOT NULL,
        TenantId UNIQUEIDENTIFIER NOT NULL,
        SequenceNo INT NOT NULL,
        ApproverId UNIQUEIDENTIFIER NOT NULL,
        Status NVARCHAR(20) DEFAULT 'Pending',
        ActedAtUtc DATETIME2 NULL,
        Comment NVARCHAR(1000) NULL,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        CONSTRAINT FK_LeaveApprovalSteps_LeaveRequest FOREIGN KEY (LeaveRequestId) REFERENCES dbo.LeaveRequests(Id),
        CONSTRAINT FK_LeaveApprovalSteps_Approver FOREIGN KEY (ApproverId) REFERENCES dbo.Employees(Id)
    );
    CREATE INDEX idx_leaveapprovalsteps_tenant ON dbo.LeaveApprovalSteps(TenantId);
    CREATE INDEX idx_leaveapprovalsteps_leaverequest ON dbo.LeaveApprovalSteps(LeaveRequestId);
END
GO

-- LeaveCreditLedger table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'LeaveCreditLedger')
BEGIN
    CREATE TABLE dbo.LeaveCreditLedger (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        EmployeeId UNIQUEIDENTIFIER NOT NULL,
        LeaveTypeId UNIQUEIDENTIFIER NOT NULL,
        TransactionType NVARCHAR(20) NOT NULL,
        Days DECIMAL(5,2) NOT NULL,
        ReferenceId NVARCHAR(100) NULL,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CONSTRAINT FK_LeaveCreditLedger_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
        CONSTRAINT FK_LeaveCreditLedger_Employee FOREIGN KEY (EmployeeId) REFERENCES dbo.Employees(Id),
        CONSTRAINT FK_LeaveCreditLedger_LeaveType FOREIGN KEY (LeaveTypeId) REFERENCES dbo.LeaveTypes(Id)
    );
    CREATE INDEX idx_leavecreditledger_tenant ON dbo.LeaveCreditLedger(TenantId);
    CREATE INDEX idx_leavecreditledger_employee ON dbo.LeaveCreditLedger(EmployeeId);
    CREATE INDEX idx_leavecreditledger_employee_type ON dbo.LeaveCreditLedger(EmployeeId, LeaveTypeId);
END
GO

-- ============================================
-- SECTION 3.5: Payroll
-- ============================================

-- PayrollPeriods table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PayrollPeriods')
BEGIN
    CREATE TABLE dbo.PayrollPeriods (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        PeriodStart DATE NOT NULL,
        PeriodEnd DATE NOT NULL,
        PayDate DATE NOT NULL,
        PayFrequency NVARCHAR(20) NOT NULL,
        Status NVARCHAR(20) DEFAULT 'Open',
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        IsDeleted BIT DEFAULT 0,
        CONSTRAINT FK_PayrollPeriods_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id)
    );
    CREATE INDEX idx_payrollperiods_tenant ON dbo.PayrollPeriods(TenantId);
END
GO

-- GovContributionTables (shared reference data, NOT tenant-scoped)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'GovContributionTables')
BEGIN
    CREATE TABLE dbo.GovContributionTables (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        EffectiveYear INT NOT NULL,
        TableType NVARCHAR(20) NOT NULL,
        BracketMin DECIMAL(18,4) NOT NULL,
        BracketMax DECIMAL(18,4) NOT NULL,
        EmployeeShare DECIMAL(18,4) NULL,
        EmployerShare DECIMAL(18,4) NULL,
        FixedAmount DECIMAL(18,4) NULL,
        RatePercent DECIMAL(8,4) NULL,
        Description NVARCHAR(500) NULL,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        IsDeleted BIT DEFAULT 0
    );
    CREATE INDEX idx_govcontributiontables_year_type ON dbo.GovContributionTables(EffectiveYear, TableType);
END
GO

-- PayrollRuns table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PayrollRuns')
BEGIN
    CREATE TABLE dbo.PayrollRuns (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        PayrollPeriodId UNIQUEIDENTIFIER NOT NULL,
        RunDate DATETIME2 NOT NULL,
        RunByUserId UNIQUEIDENTIFIER NULL,
        Status NVARCHAR(20) DEFAULT 'Open',
        TotalGrossPay DECIMAL(18,4) DEFAULT 0,
        TotalNetPay DECIMAL(18,4) DEFAULT 0,
        TotalEmployerCost DECIMAL(18,4) DEFAULT 0,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        IsDeleted BIT DEFAULT 0,
        CONSTRAINT FK_PayrollRuns_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
        CONSTRAINT FK_PayrollRuns_PayrollPeriod FOREIGN KEY (PayrollPeriodId) REFERENCES dbo.PayrollPeriods(Id)
    );
    CREATE INDEX idx_payrollruns_tenant ON dbo.PayrollRuns(TenantId);
    CREATE INDEX idx_payrollruns_payrollperiod ON dbo.PayrollRuns(PayrollPeriodId);
END
GO

-- Payslips table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Payslips')
BEGIN
    CREATE TABLE dbo.Payslips (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        PayrollRunId UNIQUEIDENTIFIER NOT NULL,
        EmployeeId UNIQUEIDENTIFIER NOT NULL,
        BasicPay DECIMAL(18,4) NOT NULL,
        TotalWorkedDays DECIMAL(5,2) NOT NULL,
        AbsentDeduction DECIMAL(18,4) DEFAULT 0,
        LateDeduction DECIMAL(18,4) DEFAULT 0,
        UndertimeDeduction DECIMAL(18,4) DEFAULT 0,
        OvertimePay DECIMAL(18,4) DEFAULT 0,
        NightDiffPay DECIMAL(18,4) DEFAULT 0,
        HolidayPay DECIMAL(18,4) DEFAULT 0,
        RestDayPremium DECIMAL(18,4) DEFAULT 0,
        Allowances DECIMAL(18,4) DEFAULT 0,
        DeMinimisBenefits DECIMAL(18,4) DEFAULT 0,
        GrossPay DECIMAL(18,4) NOT NULL,
        SssEmployeeShare DECIMAL(18,4) DEFAULT 0,
        SssEmployerShare DECIMAL(18,4) DEFAULT 0,
        SssMPFEmployee DECIMAL(18,4) DEFAULT 0,
        SssMPFEmployer DECIMAL(18,4) DEFAULT 0,
        PhilHealthEmployeeShare DECIMAL(18,4) DEFAULT 0,
        PhilHealthEmployerShare DECIMAL(18,4) DEFAULT 0,
        PagIbigEmployeeShare DECIMAL(18,4) DEFAULT 0,
        PagIbigEmployerShare DECIMAL(18,4) DEFAULT 0,
        WithholdingTax DECIMAL(18,4) DEFAULT 0,
        ThirteenthMonthPayAccrual DECIMAL(18,4) DEFAULT 0,
        OtherDeductions DECIMAL(18,4) DEFAULT 0,
        LoanDeductions DECIMAL(18,4) DEFAULT 0,
        TotalDeductions DECIMAL(18,4) DEFAULT 0,
        NetPay DECIMAL(18,4) NOT NULL,
        PayslipUrl NVARCHAR(500) NULL,
        GeneratedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        IsDeleted BIT DEFAULT 0,
        CONSTRAINT FK_Payslips_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
        CONSTRAINT FK_Payslips_PayrollRun FOREIGN KEY (PayrollRunId) REFERENCES dbo.PayrollRuns(Id),
        CONSTRAINT FK_Payslips_Employee FOREIGN KEY (EmployeeId) REFERENCES dbo.Employees(Id)
    );
    CREATE INDEX idx_payslips_tenant ON dbo.Payslips(TenantId);
    CREATE INDEX idx_payslips_employee ON dbo.Payslips(EmployeeId);
    CREATE INDEX idx_payslips_payrollrun ON dbo.Payslips(PayrollRunId);
END
GO

-- PayslipLineItems table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PayslipLineItems')
BEGIN
    CREATE TABLE dbo.PayslipLineItems (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        PayslipId UNIQUEIDENTIFIER NOT NULL,
        TenantId UNIQUEIDENTIFIER NOT NULL,
        ItemType NVARCHAR(20) NOT NULL,
        Code NVARCHAR(50) NOT NULL,
        Description NVARCHAR(200) NOT NULL,
        Amount DECIMAL(18,4) NOT NULL,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CONSTRAINT FK_PayslipLineItems_Payslip FOREIGN KEY (PayslipId) REFERENCES dbo.Payslips(Id)
    );
    CREATE INDEX idx_paysliplineitems_tenant ON dbo.PayslipLineItems(TenantId);
    CREATE INDEX idx_paysliplineitems_payslip ON dbo.PayslipLineItems(PayslipId);
END
GO

-- EmployeeLoans table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'EmployeeLoans')
BEGIN
    CREATE TABLE dbo.EmployeeLoans (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        EmployeeId UNIQUEIDENTIFIER NOT NULL,
        LoanType NVARCHAR(20) NOT NULL,
        PrincipalAmount DECIMAL(18,4) NOT NULL,
        MonthlyAmortization DECIMAL(18,4) NOT NULL,
        RemainingBalance DECIMAL(18,4) NOT NULL,
        StartDate DATE NOT NULL,
        EndDate DATE NULL,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        IsDeleted BIT DEFAULT 0,
        CONSTRAINT FK_EmployeeLoans_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
        CONSTRAINT FK_EmployeeLoans_Employee FOREIGN KEY (EmployeeId) REFERENCES dbo.Employees(Id)
    );
    CREATE INDEX idx_employeeloans_tenant ON dbo.EmployeeLoans(TenantId);
    CREATE INDEX idx_employeeloans_employee ON dbo.EmployeeLoans(EmployeeId);
END
GO

-- ThirteenthMonthPay table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ThirteenthMonthPay')
BEGIN
    CREATE TABLE dbo.ThirteenthMonthPay (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        EmployeeId UNIQUEIDENTIFIER NOT NULL,
        Year INT NOT NULL,
        TotalBasicSalaryEarned DECIMAL(18,4) NOT NULL,
        ComputedAmount DECIMAL(18,4) NOT NULL,
        PaidDate DATE NULL,
        PayoutStatus NVARCHAR(20) DEFAULT 'Pending',
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        IsDeleted BIT DEFAULT 0,
        CONSTRAINT FK_ThirteenthMonthPay_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
        CONSTRAINT FK_ThirteenthMonthPay_Employee FOREIGN KEY (EmployeeId) REFERENCES dbo.Employees(Id),
        CONSTRAINT UQ_ThirteenthMonthPay_TenantEmployeeYear UNIQUE (TenantId, EmployeeId, Year)
    );
    CREATE INDEX idx_thirteenthmonthpay_tenant ON dbo.ThirteenthMonthPay(TenantId);
    CREATE INDEX idx_thirteenthmonthpay_employee ON dbo.ThirteenthMonthPay(EmployeeId);
END
GO

-- GovernmentReportExports table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'GovernmentReportExports')
BEGIN
    CREATE TABLE dbo.GovernmentReportExports (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        ReportType NVARCHAR(30) NOT NULL,
        PeriodCovered NVARCHAR(50) NOT NULL,
        FileUrl NVARCHAR(500) NOT NULL,
        GeneratedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        IsDeleted BIT DEFAULT 0,
        CONSTRAINT FK_GovernmentReportExports_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id)
    );
    CREATE INDEX idx_governmentreportexports_tenant ON dbo.GovernmentReportExports(TenantId);
END
GO

-- ============================================
-- SECTION 3.6: HR Matrix / Analytics
-- ============================================

-- OrgChartSnapshots table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'OrgChartSnapshots')
BEGIN
    CREATE TABLE dbo.OrgChartSnapshots (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        SnapshotDate DATE NOT NULL,
        StructureJson NVARCHAR(MAX) NOT NULL,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        CONSTRAINT FK_OrgChartSnapshots_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id)
    );
    CREATE INDEX idx_orgchartsnapshots_tenant ON dbo.OrgChartSnapshots(TenantId);
END
GO

-- CompetencyMatrix table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CompetencyMatrix')
BEGIN
    CREATE TABLE dbo.CompetencyMatrix (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        EmployeeId UNIQUEIDENTIFIER NOT NULL,
        SkillName NVARCHAR(100) NOT NULL,
        ProficiencyLevel INT NOT NULL,
        AssessedDate DATE NOT NULL,
        AssessedBy UNIQUEIDENTIFIER NULL,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        IsDeleted BIT DEFAULT 0,
        CONSTRAINT FK_CompetencyMatrix_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
        CONSTRAINT FK_CompetencyMatrix_Employee FOREIGN KEY (EmployeeId) REFERENCES dbo.Employees(Id)
    );
    CREATE INDEX idx_competencymatrix_tenant ON dbo.CompetencyMatrix(TenantId);
    CREATE INDEX idx_competencymatrix_employee ON dbo.CompetencyMatrix(EmployeeId);
END
GO

-- PerformanceReviews table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PerformanceReviews')
BEGIN
    CREATE TABLE dbo.PerformanceReviews (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        EmployeeId UNIQUEIDENTIFIER NOT NULL,
        ReviewPeriod NVARCHAR(50) NOT NULL,
        Rating DECIMAL(3,2) NULL,
        ReviewerId UNIQUEIDENTIFIER NULL,
        Comments NVARCHAR(MAX) NULL,
        Status NVARCHAR(20) DEFAULT 'Draft',
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        IsDeleted BIT DEFAULT 0,
        CONSTRAINT FK_PerformanceReviews_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
        CONSTRAINT FK_PerformanceReviews_Employee FOREIGN KEY (EmployeeId) REFERENCES dbo.Employees(Id),
        CONSTRAINT FK_PerformanceReviews_Reviewer FOREIGN KEY (ReviewerId) REFERENCES dbo.Employees(Id)
    );
    CREATE INDEX idx_performancereviews_tenant ON dbo.PerformanceReviews(TenantId);
    CREATE INDEX idx_performancereviews_employee ON dbo.PerformanceReviews(EmployeeId);
END
GO

-- DisciplinaryRecords table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'DisciplinaryRecords')
BEGIN
    CREATE TABLE dbo.DisciplinaryRecords (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        EmployeeId UNIQUEIDENTIFIER NOT NULL,
        IncidentDate DATE NOT NULL,
        Category NVARCHAR(50) NOT NULL,
        ActionTaken NVARCHAR(500) NOT NULL,
        DueProcessNTEUrl NVARCHAR(500) NULL,
        DueProcessNODAUrl NVARCHAR(500) NULL,
        Status NVARCHAR(20) DEFAULT 'Open',
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        IsDeleted BIT DEFAULT 0,
        CONSTRAINT FK_DisciplinaryRecords_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
        CONSTRAINT FK_DisciplinaryRecords_Employee FOREIGN KEY (EmployeeId) REFERENCES dbo.Employees(Id)
    );
    CREATE INDEX idx_disciplinaryrecords_tenant ON dbo.DisciplinaryRecords(TenantId);
    CREATE INDEX idx_disciplinaryrecords_employee ON dbo.DisciplinaryRecords(EmployeeId);
END
GO

-- HeadcountSnapshots table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'HeadcountSnapshots')
BEGIN
    CREATE TABLE dbo.HeadcountSnapshots (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        SnapshotDate DATE NOT NULL,
        DepartmentId UNIQUEIDENTIFIER NOT NULL,
        HeadcountActive INT NOT NULL,
        HeadcountHired INT NOT NULL,
        HeadcountSeparated INT NOT NULL,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        CONSTRAINT FK_HeadcountSnapshots_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
        CONSTRAINT FK_HeadcountSnapshots_Department FOREIGN KEY (DepartmentId) REFERENCES dbo.Departments(Id)
    );
    CREATE INDEX idx_headcountsnapshots_tenant ON dbo.HeadcountSnapshots(TenantId);
    CREATE INDEX idx_headcountsnapshots_department ON dbo.HeadcountSnapshots(DepartmentId);
END
GO

-- AttritionMetrics table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AttritionMetrics')
BEGIN
    CREATE TABLE dbo.AttritionMetrics (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        Year INT NOT NULL,
        Month INT NOT NULL,
        DepartmentId UNIQUEIDENTIFIER NOT NULL,
        VoluntarySeparations INT DEFAULT 0,
        InvoluntarySeparations INT DEFAULT 0,
        AttritionRatePercent DECIMAL(5,2) DEFAULT 0,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        CONSTRAINT FK_AttritionMetrics_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
        CONSTRAINT FK_AttritionMetrics_Department FOREIGN KEY (DepartmentId) REFERENCES dbo.Departments(Id),
        CONSTRAINT UQ_AttritionMetrics_TenantYearMonthDept UNIQUE (TenantId, Year, Month, DepartmentId)
    );
    CREATE INDEX idx_attritionmetrics_tenant ON dbo.AttritionMetrics(TenantId);
END
GO

PRINT 'Migration 001 completed successfully - All tables created';
GO
