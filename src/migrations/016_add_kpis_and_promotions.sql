-- Migration 016: Add KPIs, Promotion Criteria, and Promotion Pipeline Support
-- Version: 016
-- Date: 2026-10-23
-- Description: Adds tables for KPI definitions, Employee KPIs, Promotion Criteria parameters, and Promotion Requests

-- ============================================
-- 1. KpiDefinitions table (Catalog / Templates)
-- ============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'KpiDefinitions')
BEGIN
    CREATE TABLE dbo.KpiDefinitions (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        DepartmentId UNIQUEIDENTIFIER NULL,
        PositionId UNIQUEIDENTIFIER NULL,
        Title NVARCHAR(200) NOT NULL,
        Description NVARCHAR(MAX) NULL,
        Category NVARCHAR(50) DEFAULT 'Operational', -- 'Financial', 'Operational', 'Customer', 'People', 'Quality'
        MetricType NVARCHAR(30) NOT NULL, -- 'Percentage', 'Currency', 'Numeric', 'Milestone'
        TargetValue DECIMAL(18,4) NOT NULL,
        DefaultWeightPercent DECIMAL(5,2) DEFAULT 20.00,
        Unit NVARCHAR(50) NULL,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        IsDeleted BIT DEFAULT 0,
        CONSTRAINT FK_KpiDefinitions_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
        CONSTRAINT FK_KpiDefinitions_Department FOREIGN KEY (DepartmentId) REFERENCES dbo.Departments(Id),
        CONSTRAINT FK_KpiDefinitions_Position FOREIGN KEY (PositionId) REFERENCES dbo.Positions(Id)
    );
    CREATE INDEX idx_kpidefinitions_tenant ON dbo.KpiDefinitions(TenantId);
    CREATE INDEX idx_kpidefinitions_dept ON dbo.KpiDefinitions(TenantId, DepartmentId);
    PRINT 'Created KpiDefinitions table';
END
GO

-- ============================================
-- 2. EmployeeKpis table (Employee Goals & Tracking)
-- ============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'EmployeeKpis')
BEGIN
    CREATE TABLE dbo.EmployeeKpis (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        EmployeeId UNIQUEIDENTIFIER NOT NULL,
        KpiDefinitionId UNIQUEIDENTIFIER NULL,
        ReviewPeriod NVARCHAR(50) NOT NULL, -- e.g. '2026-Q1', '2026-Annual'
        Title NVARCHAR(200) NOT NULL,
        Description NVARCHAR(MAX) NULL,
        Category NVARCHAR(50) DEFAULT 'Operational',
        MetricType NVARCHAR(30) NOT NULL,
        Unit NVARCHAR(50) NULL,
        WeightPercent DECIMAL(5,2) NOT NULL DEFAULT 20.00,
        TargetValue DECIMAL(18,4) NOT NULL,
        ActualValue DECIMAL(18,4) DEFAULT 0,
        AchievementScorePercent DECIMAL(5,2) DEFAULT 0,
        Status NVARCHAR(30) DEFAULT 'InProgress', -- 'InProgress', 'Submitted', 'Evaluated', 'Closed'
        ManagerComment NVARCHAR(MAX) NULL,
        EvaluatedAtUtc DATETIME2 NULL,
        EvaluatedBy UNIQUEIDENTIFIER NULL,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        IsDeleted BIT DEFAULT 0,
        CONSTRAINT FK_EmployeeKpis_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
        CONSTRAINT FK_EmployeeKpis_Employee FOREIGN KEY (EmployeeId) REFERENCES dbo.Employees(Id),
        CONSTRAINT FK_EmployeeKpis_KpiDef FOREIGN KEY (KpiDefinitionId) REFERENCES dbo.KpiDefinitions(Id)
    );
    CREATE INDEX idx_employeekpis_tenant ON dbo.EmployeeKpis(TenantId);
    CREATE INDEX idx_employeekpis_employee ON dbo.EmployeeKpis(EmployeeId);
    CREATE INDEX idx_employeekpis_period ON dbo.EmployeeKpis(TenantId, ReviewPeriod);
    PRINT 'Created EmployeeKpis table';
END
GO

-- ============================================
-- 3. PromotionCriteria table (Configurable Parameters)
-- ============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PromotionCriteria')
BEGIN
    CREATE TABLE dbo.PromotionCriteria (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        DepartmentId UNIQUEIDENTIFIER NULL,
        MinKpiScorePercent DECIMAL(5,2) DEFAULT 85.00,
        MinPerformanceRating DECIMAL(3,2) DEFAULT 4.00,
        MinTenureMonths INT DEFAULT 12,
        RequireCleanDisciplinary BIT DEFAULT 1,
        MinCompetencyScore DECIMAL(3,2) DEFAULT 3.50,
        RecommendedSalaryIncreasePercent DECIMAL(5,2) DEFAULT 10.00,
        AutoFlagDue BIT DEFAULT 1,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        IsDeleted BIT DEFAULT 0,
        CONSTRAINT FK_PromotionCriteria_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
        CONSTRAINT FK_PromotionCriteria_Department FOREIGN KEY (DepartmentId) REFERENCES dbo.Departments(Id)
    );
    CREATE INDEX idx_promotioncriteria_tenant ON dbo.PromotionCriteria(TenantId);
    PRINT 'Created PromotionCriteria table';
END
GO

-- ============================================
-- 4. PromotionRequests table (Nomination & Approval)
-- ============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PromotionRequests')
BEGIN
    CREATE TABLE dbo.PromotionRequests (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        EmployeeId UNIQUEIDENTIFIER NOT NULL,
        NominatedBy UNIQUEIDENTIFIER NOT NULL,
        CurrentPositionId UNIQUEIDENTIFIER NOT NULL,
        ProposedPositionId UNIQUEIDENTIFIER NOT NULL,
        CurrentBasicSalary DECIMAL(18,4) NOT NULL,
        ProposedBasicSalary DECIMAL(18,4) NOT NULL,
        JustificationReason NVARCHAR(MAX) NOT NULL,
        KpiScoreAtNomination DECIMAL(5,2) NULL,
        PerformanceRatingAtNomination DECIMAL(3,2) NULL,
        TenureMonthsAtNomination INT NULL,
        Status NVARCHAR(30) DEFAULT 'PendingReview', -- 'PendingReview', 'Endorsed', 'Approved', 'Rejected', 'Cancelled'
        EffectiveDate DATE NOT NULL,
        CurrentApproverId UNIQUEIDENTIFIER NULL,
        ApprovedBy UNIQUEIDENTIFIER NULL,
        ApprovedAtUtc DATETIME2 NULL,
        ActionNotes NVARCHAR(MAX) NULL,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        IsDeleted BIT DEFAULT 0,
        CONSTRAINT FK_PromotionRequests_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
        CONSTRAINT FK_PromotionRequests_Employee FOREIGN KEY (EmployeeId) REFERENCES dbo.Employees(Id),
        CONSTRAINT FK_PromotionRequests_CurrentPosition FOREIGN KEY (CurrentPositionId) REFERENCES dbo.Positions(Id),
        CONSTRAINT FK_PromotionRequests_ProposedPosition FOREIGN KEY (ProposedPositionId) REFERENCES dbo.Positions(Id)
    );
    CREATE INDEX idx_promotionrequests_tenant ON dbo.PromotionRequests(TenantId);
    CREATE INDEX idx_promotionrequests_employee ON dbo.PromotionRequests(EmployeeId);
    CREATE INDEX idx_promotionrequests_status ON dbo.PromotionRequests(TenantId, Status);
    PRINT 'Created PromotionRequests table';
END
GO

-- ============================================
-- 5. RLS Security Policy Extension
-- ============================================
IF EXISTS (SELECT * FROM sys.security_policies WHERE name = 'TenantFilter' AND schema_id = SCHEMA_ID('security'))
BEGIN
    BEGIN TRY
        ALTER SECURITY POLICY security.TenantFilter
        ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.KpiDefinitions,
        ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.KpiDefinitions AFTER INSERT,
        ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.EmployeeKpis,
        ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.EmployeeKpis AFTER INSERT,
        ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.PromotionCriteria,
        ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.PromotionCriteria AFTER INSERT,
        ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.PromotionRequests,
        ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.PromotionRequests AFTER INSERT;
        PRINT 'Added RLS predicates for KPI and Promotion tables';
    END TRY
    BEGIN CATCH
        PRINT 'RLS predicates already configured or error: ' + ERROR_MESSAGE();
    END CATCH
END
GO

-- ============================================
-- 6. Seed Default Promotion Criteria for Existing Tenants
-- ============================================
DECLARE @TenantCursor CURSOR;
DECLARE @CurrentTenantId UNIQUEIDENTIFIER;

SET @TenantCursor = CURSOR FOR
    SELECT Id FROM dbo.Tenants WHERE IsDeleted = 0;

OPEN @TenantCursor;
FETCH NEXT FROM @TenantCursor INTO @CurrentTenantId;

WHILE @@FETCH_STATUS = 0
BEGIN
    IF NOT EXISTS (SELECT 1 FROM dbo.PromotionCriteria WHERE TenantId = @CurrentTenantId AND DepartmentId IS NULL)
    BEGIN
        INSERT INTO dbo.PromotionCriteria (
            TenantId, DepartmentId, MinKpiScorePercent, MinPerformanceRating,
            MinTenureMonths, RequireCleanDisciplinary, MinCompetencyScore,
            RecommendedSalaryIncreasePercent, AutoFlagDue
        )
        VALUES (
            @CurrentTenantId, NULL, 85.00, 4.00, 12, 1, 3.50, 10.00, 1
        );
    END
    FETCH NEXT FROM @TenantCursor INTO @CurrentTenantId;
END

CLOSE @TenantCursor;
DEALLOCATE @TenantCursor;
GO

PRINT 'Migration 016 completed: KPIs and Promotions schema ready';
GO
