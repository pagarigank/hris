-- Migration 012: Add PERA (Personal Equity and Retirement Account) support
-- Version: 012
-- Date: 2026-07-29
-- Description: Adds PERA contribution support per RA 9505, optional employer-matched retirement savings

-- ============================================
-- 1. Add PERA columns to Payslips
-- ============================================
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Payslips') AND name = 'PeraEmployeeShare')
BEGIN
    ALTER TABLE dbo.Payslips ADD PeraEmployeeShare DECIMAL(18,4) DEFAULT 0;
    ALTER TABLE dbo.Payslips ADD PeraEmployerShare DECIMAL(18,4) DEFAULT 0;
    PRINT 'Added PERA columns to Payslips';
END
GO

-- ============================================
-- 2. Create EmployeePeraEnrollment table
-- ============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'EmployeePeraEnrollment')
BEGIN
    CREATE TABLE dbo.EmployeePeraEnrollment (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        EmployeeId UNIQUEIDENTIFIER NOT NULL,
        IsEnrolled BIT DEFAULT 0,
        EnrolledDate DATE NULL,
        ContributionType NVARCHAR(20) DEFAULT 'Fixed',
        EmployeeContributionAmount DECIMAL(18,4) DEFAULT 0,
        EmployerMatchType NVARCHAR(20) NULL,
        EmployerMatchValue DECIMAL(18,4) NULL,
        EmployerMatchMaxCap DECIMAL(18,4) NULL,
        PERAAdministratorId NVARCHAR(50) NULL,
        PERAAccountNo NVARCHAR(50) NULL,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        IsDeleted BIT DEFAULT 0,
        CONSTRAINT FK_PeraEnrollment_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
        CONSTRAINT FK_PeraEnrollment_Employee FOREIGN KEY (EmployeeId) REFERENCES dbo.Employees(Id),
        CONSTRAINT UQ_PeraEnrollment_TenantEmployee UNIQUE (TenantId, EmployeeId)
    );
    CREATE INDEX idx_peraenrollment_tenant ON dbo.EmployeePeraEnrollment(TenantId);
    CREATE INDEX idx_peraenrollment_employee ON dbo.EmployeePeraEnrollment(EmployeeId);
    PRINT 'Created EmployeePeraEnrollment table';
END
GO

-- ============================================
-- 3. Create EmployeePeraContributions table (ledger)
-- ============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'EmployeePeraContributions')
BEGIN
    CREATE TABLE dbo.EmployeePeraContributions (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        EmployeeId UNIQUEIDENTIFIER NOT NULL,
        PayrollRunId UNIQUEIDENTIFIER NULL,
        PayrollPeriodId UNIQUEIDENTIFIER NULL,
        ContributionDate DATE NOT NULL,
        EmployeeContribution DECIMAL(18,4) DEFAULT 0,
        EmployerContribution DECIMAL(18,4) DEFAULT 0,
        ContributionYear INT NOT NULL,
        ContributionMonth INT NOT NULL,
        PERAAdministratorName NVARCHAR(200) NULL,
        PERAAccountNo NVARCHAR(50) NULL,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        IsDeleted BIT DEFAULT 0,
        CONSTRAINT FK_PeraContributions_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
        CONSTRAINT FK_PeraContributions_Employee FOREIGN KEY (EmployeeId) REFERENCES dbo.Employees(Id),
        CONSTRAINT FK_PeraContributions_PayrollRun FOREIGN KEY (PayrollRunId) REFERENCES dbo.PayrollRuns(Id),
        CONSTRAINT FK_PeraContributions_PayrollPeriod FOREIGN KEY (PayrollPeriodId) REFERENCES dbo.PayrollPeriods(Id)
    );
    CREATE INDEX idx_peracontributions_tenant ON dbo.EmployeePeraContributions(TenantId);
    CREATE INDEX idx_peracontributions_employee ON dbo.EmployeePeraContributions(EmployeeId);
    CREATE INDEX idx_peracontributions_year ON dbo.EmployeePeraContributions(TenantId, EmployeeId, ContributionYear);
    PRINT 'Created EmployeePeraContributions table';
END
GO

-- ============================================
-- 4. Seed PERA reference data in GovContributionTables
-- ============================================
IF NOT EXISTS (SELECT * FROM dbo.GovContributionTables WHERE TableType = 'PERA')
BEGIN
    INSERT INTO dbo.GovContributionTables (EffectiveYear, TableType, BracketMin, BracketMax, EmployeeShare, EmployerShare, FixedAmount, RatePercent, Description)
    VALUES
    -- PERA annual contribution limits (RA 9505, as amended by RA 12214)
    (2025, 'PERA', 0, 999999, NULL, NULL, 200000, NULL, 'PERA Max Annual Contribution - Local Employee (₱200K)'),
    (2025, 'PERA', 0, 999999, NULL, NULL, 400000, NULL, 'PERA Max Annual Contribution - OFW (₱400K)'),
    (2026, 'PERA', 0, 999999, NULL, NULL, 200000, NULL, 'PERA Max Annual Contribution - Local Employee (₱200K)'),
    (2026, 'PERA', 0, 999999, NULL, NULL, 400000, NULL, 'PERA Max Annual Contribution - OFW (₱400K)');

    PRINT 'Seeded PERA contribution limits for 2025-2026';
END
GO

-- ============================================
-- 5. Add PERA_Summary to GovernmentReportExports ReportType
--    Note: Existing rows are not affected; ReportType column is NVARCHAR
-- ============================================
PRINT 'Migration 012 completed: PERA support added';
GO
