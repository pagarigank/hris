-- Migration 008: Onboarding/Offboarding Checklists
-- Adds tables for tracking employee onboarding and offboarding processes

-- Onboarding checklist templates (tenant-configurable)
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'OnboardingTemplates')
BEGIN
    CREATE TABLE dbo.OnboardingTemplates (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        Name NVARCHAR(100) NOT NULL,
        Description NVARCHAR(500),
        IsActive BIT DEFAULT 1,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2,
        CreatedBy UNIQUEIDENTIFIER,
        UpdatedBy UNIQUEIDENTIFIER,
        IsDeleted BIT DEFAULT 0
    );
    CREATE INDEX IX_OnboardingTemplates_TenantId ON dbo.OnboardingTemplates(TenantId);
END;

-- Onboarding template items (checklist items for each template)
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'OnboardingTemplateItems')
BEGIN
    CREATE TABLE dbo.OnboardingTemplateItems (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        TemplateId UNIQUEIDENTIFIER NOT NULL,
        ItemName NVARCHAR(200) NOT NULL,
        Description NVARCHAR(500),
        Category NVARCHAR(50) DEFAULT 'General', -- General, Documents, IT, HR, Finance
        SortOrder INT DEFAULT 0,
        IsRequired BIT DEFAULT 1,
        IsActive BIT DEFAULT 1,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2,
        CreatedBy UNIQUEIDENTIFIER,
        UpdatedBy UNIQUEIDENTIFIER,
        IsDeleted BIT DEFAULT 0,
        CONSTRAINT FK_OnboardingTemplateItems_Template FOREIGN KEY (TemplateId) REFERENCES dbo.OnboardingTemplates(Id)
    );
    CREATE INDEX IX_OnboardingTemplateItems_TenantId ON dbo.OnboardingTemplateItems(TenantId);
    CREATE INDEX IX_OnboardingTemplateItems_TemplateId ON dbo.OnboardingTemplateItems(TemplateId);
END;

-- Employee onboarding records
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'EmployeeOnboarding')
BEGIN
    CREATE TABLE dbo.EmployeeOnboarding (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        EmployeeId UNIQUEIDENTIFIER NOT NULL,
        TemplateId UNIQUEIDENTIFIER NOT NULL,
        Status NVARCHAR(20) DEFAULT 'InProgress', -- NotStarted, InProgress, Completed, Cancelled
        StartedAtUtc DATETIME2,
        CompletedAtUtc DATETIME2,
        Notes NVARCHAR(MAX),
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2,
        CreatedBy UNIQUEIDENTIFIER,
        UpdatedBy UNIQUEIDENTIFIER,
        IsDeleted BIT DEFAULT 0,
        CONSTRAINT FK_EmployeeOnboarding_Employee FOREIGN KEY (EmployeeId) REFERENCES dbo.Employees(Id),
        CONSTRAINT FK_EmployeeOnboarding_Template FOREIGN KEY (TemplateId) REFERENCES dbo.OnboardingTemplates(Id)
    );
    CREATE INDEX IX_EmployeeOnboarding_TenantId ON dbo.EmployeeOnboarding(TenantId);
    CREATE INDEX IX_EmployeeOnboarding_EmployeeId ON dbo.EmployeeOnboarding(EmployeeId);
END;

-- Employee onboarding checklist items (actual progress per employee)
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'EmployeeOnboardingItems')
BEGIN
    CREATE TABLE dbo.EmployeeOnboardingItems (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        OnboardingId UNIQUEIDENTIFIER NOT NULL,
        TemplateItemId UNIQUEIDENTIFIER NOT NULL,
        IsCompleted BIT DEFAULT 0,
        CompletedAtUtc DATETIME2,
        CompletedBy UNIQUEIDENTIFIER,
        Notes NVARCHAR(500),
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2,
        IsDeleted BIT DEFAULT 0,
        CONSTRAINT FK_EmployeeOnboardingItems_Onboarding FOREIGN KEY (OnboardingId) REFERENCES dbo.EmployeeOnboarding(Id),
        CONSTRAINT FK_EmployeeOnboardingItems_TemplateItem FOREIGN KEY (TemplateItemId) REFERENCES dbo.OnboardingTemplateItems(Id)
    );
    CREATE INDEX IX_EmployeeOnboardingItems_TenantId ON dbo.EmployeeOnboardingItems(TenantId);
    CREATE INDEX IX_EmployeeOnboardingItems_OnboardingId ON dbo.EmployeeOnboardingItems(OnboardingId);
END;

-- Offboarding checklist templates
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'OffboardingTemplates')
BEGIN
    CREATE TABLE dbo.OffboardingTemplates (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        Name NVARCHAR(100) NOT NULL,
        Description NVARCHAR(500),
        IsActive BIT DEFAULT 1,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2,
        CreatedBy UNIQUEIDENTIFIER,
        UpdatedBy UNIQUEIDENTIFIER,
        IsDeleted BIT DEFAULT 0
    );
    CREATE INDEX IX_OffboardingTemplates_TenantId ON dbo.OffboardingTemplates(TenantId);
END;

-- Offboarding template items
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'OffboardingTemplateItems')
BEGIN
    CREATE TABLE dbo.OffboardingTemplateItems (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        TemplateId UNIQUEIDENTIFIER NOT NULL,
        ItemName NVARCHAR(200) NOT NULL,
        Description NVARCHAR(500),
        Category NVARCHAR(50) DEFAULT 'General', -- General, Clearance, IT, HR, Finance, Legal
        SortOrder INT DEFAULT 0,
        IsRequired BIT DEFAULT 1,
        IsActive BIT DEFAULT 1,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2,
        CreatedBy UNIQUEIDENTIFIER,
        UpdatedBy UNIQUEIDENTIFIER,
        IsDeleted BIT DEFAULT 0,
        CONSTRAINT FK_OffboardingTemplateItems_Template FOREIGN KEY (TemplateId) REFERENCES dbo.OffboardingTemplates(Id)
    );
    CREATE INDEX IX_OffboardingTemplateItems_TenantId ON dbo.OffboardingTemplateItems(TenantId);
    CREATE INDEX IX_OffboardingTemplateItems_TemplateId ON dbo.OffboardingTemplateItems(TemplateId);
END;

-- Employee offboarding records
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'EmployeeOffboarding')
BEGIN
    CREATE TABLE dbo.EmployeeOffboarding (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        EmployeeId UNIQUEIDENTIFIER NOT NULL,
        TemplateId UNIQUEIDENTIFIER NOT NULL,
        Status NVARCHAR(20) DEFAULT 'InProgress', -- NotStarted, InProgress, Completed, Cancelled
        SeparationType NVARCHAR(50), -- Resignation, Termination, EndOfContract, Retirement, Redundancy
        LastDayOfWork DATE,
        Reason NVARCHAR(500),
        StartedAtUtc DATETIME2,
        CompletedAtUtc DATETIME2,
        Notes NVARCHAR(MAX),
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2,
        CreatedBy UNIQUEIDENTIFIER,
        UpdatedBy UNIQUEIDENTIFIER,
        IsDeleted BIT DEFAULT 0,
        CONSTRAINT FK_EmployeeOffboarding_Employee FOREIGN KEY (EmployeeId) REFERENCES dbo.Employees(Id),
        CONSTRAINT FK_EmployeeOffboarding_Template FOREIGN KEY (TemplateId) REFERENCES dbo.OffboardingTemplates(Id)
    );
    CREATE INDEX IX_EmployeeOffboarding_TenantId ON dbo.EmployeeOffboarding(TenantId);
    CREATE INDEX IX_EmployeeOffboarding_EmployeeId ON dbo.EmployeeOffboarding(EmployeeId);
END;

-- Employee offboarding checklist items
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'EmployeeOffboardingItems')
BEGIN
    CREATE TABLE dbo.EmployeeOffboardingItems (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        OffboardingId UNIQUEIDENTIFIER NOT NULL,
        TemplateItemId UNIQUEIDENTIFIER NOT NULL,
        IsCompleted BIT DEFAULT 0,
        CompletedAtUtc DATETIME2,
        CompletedBy UNIQUEIDENTIFIER,
        Notes NVARCHAR(500),
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2,
        IsDeleted BIT DEFAULT 0,
        CONSTRAINT FK_EmployeeOffboardingItems_Offboarding FOREIGN KEY (OffboardingId) REFERENCES dbo.EmployeeOffboarding(Id),
        CONSTRAINT FK_EmployeeOffboardingItems_TemplateItem FOREIGN KEY (TemplateItemId) REFERENCES dbo.OffboardingTemplateItems(Id)
    );
    CREATE INDEX IX_EmployeeOffboardingItems_TenantId ON dbo.EmployeeOffboardingItems(TenantId);
    CREATE INDEX IX_EmployeeOffboardingItems_OffboardingId ON dbo.EmployeeOffboardingItems(OffboardingId);
END;

PRINT 'Migration 008 completed: Onboarding/Offboarding tables created';
