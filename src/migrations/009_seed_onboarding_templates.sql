-- Seed default onboarding and offboarding templates
-- Run after migration 008

DECLARE @TenantId UNIQUEIDENTIFIER = '33B96EC9-9615-4D98-9302-8C3E49F7EEE8'; -- SYSTEM tenant
DECLARE @AdminUserId UNIQUEIDENTIFIER = 'DA20D2A5-CA48-401F-87BA-375FE3156620'; -- admin@system.com

-- ============================================================
-- DEFAULT ONBOARDING TEMPLATE
-- ============================================================
DECLARE @OnboardingTemplateId UNIQUEIDENTIFIER = NEWID();

IF NOT EXISTS (SELECT 1 FROM dbo.OnboardingTemplates WHERE TenantId = @TenantId AND Name = 'Standard Onboarding' AND IsDeleted = 0)
BEGIN
    INSERT INTO dbo.OnboardingTemplates (Id, TenantId, Name, Description, CreatedBy)
    VALUES (@OnboardingTemplateId, @TenantId, 'Standard Onboarding', 'Standard employee onboarding checklist for new hires', @AdminUserId);

    INSERT INTO dbo.OnboardingTemplateItems (TenantId, TemplateId, ItemName, Description, Category, SortOrder, IsRequired, CreatedBy)
    VALUES
    -- HR Documents
    (@TenantId, @OnboardingTemplateId, 'Collect Government IDs', 'SSS, PhilHealth, Pag-IBIG, TIN numbers verified', 'Documents', 1, 1, @AdminUserId),
    (@TenantId, @OnboardingTemplateId, 'Collect Birth Certificate', 'PSA-issued birth certificate', 'Documents', 2, 1, @AdminUserId),
    (@TenantId, @OnboardingTemplateId, 'Collect Diploma/COR', 'Highest educational attainment proof', 'Documents', 3, 1, @AdminUserId),
    (@TenantId, @OnboardingTemplateId, 'Collect NBI Clearance', 'Valid NBI clearance', 'Documents', 4, 0, @AdminUserId),
    (@TenantId, @OnboardingTemplateId, 'Collect Medical Certificate', 'Pre-employment medical examination result', 'Documents', 5, 1, @AdminUserId),
    (@TenantId, @OnboardingTemplateId, 'Collect 2x2 ID Photo', '2x2 ID photos for company ID', 'Documents', 6, 1, @AdminUserId),
    -- HR Setup
    (@TenantId, @OnboardingTemplateId, 'Create Employee Profile', 'Complete all employee information in the system', 'HR', 10, 1, @AdminUserId),
    (@TenantId, @OnboardingTemplateId, 'Assign Department & Position', 'Assign to department and position', 'HR', 11, 1, @AdminUserId),
    (@TenantId, @OnboardingTemplateId, 'Set Payroll Information', 'Set salary, pay frequency, bank details', 'HR', 12, 1, @AdminUserId),
    (@TenantId, @OnboardingTemplateId, 'Sign Employment Contract', 'Employee signs employment contract', 'HR', 13, 1, @AdminUserId),
    (@TenantId, @OnboardingTemplateId, 'Company Policies Orientation', 'Review and acknowledge company policies', 'HR', 14, 1, @AdminUserId),
    -- IT Setup
    (@TenantId, @OnboardingTemplateId, 'Create Company Email', 'Set up company email account', 'IT', 20, 1, @AdminUserId),
    (@TenantId, @OnboardingTemplateId, 'Setup Workstation', 'Prepare computer and work tools', 'IT', 21, 1, @AdminUserId),
    (@TenantId, @OnboardingTemplateId, 'Grant System Access', 'Provide access to required systems', 'IT', 22, 1, @AdminUserId),
    (@TenantId, @OnboardingTemplateId, 'Issue Company ID', 'Issue company identification card', 'IT', 23, 0, @AdminUserId),
    -- Finance
    (@TenantId, @OnboardingTemplateId, 'Setup Bank Account', 'Employee bank account for salary', 'Finance', 30, 1, @AdminUserId),
    (@TenantId, @OnboardingTemplateId, 'PhilHealth Registration', 'Register employee to PhilHealth', 'Finance', 31, 1, @AdminUserId),
    (@TenantId, @OnboardingTemplateId, 'Pag-IBIG Registration', 'Register employee to Pag-IBIG', 'Finance', 32, 1, @AdminUserId),
    (@TenantId, @OnboardingTemplateId, 'SSS Registration', 'Register employee to SSS', 'Finance', 33, 1, @AdminUserId),
    (@TenantId, @OnboardingTemplateId, 'BIR TIN Registration', 'Register employee TIN with BIR', 'Finance', 34, 1, @AdminUserId),
    -- General
    (@TenantId, @OnboardingTemplateId, 'Workplace Tour', 'Tour of office facilities', 'General', 40, 0, @AdminUserId),
    (@TenantId, @OnboardingTemplateId, 'Meet Team Members', 'Introduction to team members', 'General', 41, 0, @AdminUserId),
    (@TenantId, @OnboardingTemplateId, 'Assign Buddy/Mentor', 'Assign onboarding buddy', 'General', 42, 0, @AdminUserId);

    PRINT 'Default onboarding template created';
END
ELSE
BEGIN
    PRINT 'Default onboarding template already exists';
END

-- ============================================================
-- DEFAULT OFFBOARDING TEMPLATE
-- ============================================================
DECLARE @OffboardingTemplateId UNIQUEIDENTIFIER = NEWID();

IF NOT EXISTS (SELECT 1 FROM dbo.OffboardingTemplates WHERE TenantId = @TenantId AND Name = 'Standard Offboarding' AND IsDeleted = 0)
BEGIN
    INSERT INTO dbo.OffboardingTemplates (Id, TenantId, Name, Description, CreatedBy)
    VALUES (@OffboardingTemplateId, @TenantId, 'Standard Offboarding', 'Standard employee offboarding/separation checklist', @AdminUserId);

    INSERT INTO dbo.OffboardingTemplateItems (TenantId, TemplateId, ItemName, Description, Category, SortOrder, IsRequired, CreatedBy)
    VALUES
    -- HR
    (@TenantId, @OffboardingTemplateId, 'Exit Interview', 'Conduct exit interview', 'HR', 1, 1, @AdminUserId),
    (@TenantId, @OffboardingTemplateId, 'Collect Company ID', 'Retrieve company identification card', 'HR', 2, 1, @AdminUserId),
    (@TenantId, @OffboardingTemplateId, 'Collect Company Assets', 'Return laptop, phone, equipment', 'HR', 3, 1, @AdminUserId),
    (@TenantId, @OffboardingTemplateId, 'Process COE', 'Generate Certificate of Employment', 'HR', 4, 1, @AdminUserId),
    (@TenantId, @OffboardingTemplateId, 'Update Employee Status', 'Update employee status to Separated', 'HR', 5, 1, @AdminUserId),
    -- IT
    (@TenantId, @OffboardingTemplateId, 'Deactivate Email Account', 'Disable company email access', 'IT', 10, 1, @AdminUserId),
    (@TenantId, @OffboardingTemplateId, 'Revoke System Access', 'Remove access to all systems', 'IT', 11, 1, @AdminUserId),
    (@TenantId, @OffboardingTemplateId, 'Collect IT Equipment', 'Return computer and peripherals', 'IT', 12, 1, @AdminUserId),
    (@TenantId, @OffboardingTemplateId, 'Backup Work Files', 'Backup important work files', 'IT', 13, 0, @AdminUserId),
    -- Finance
    (@TenantId, @OffboardingTemplateId, 'Final Pay Calculation', 'Calculate final pay including pro-rated 13th month', 'Finance', 20, 1, @AdminUserId),
    (@TenantId, @OffboardingTemplateId, 'Process Final Pay', 'Release final salary', 'Finance', 21, 1, @AdminUserId),
    (@TenantId, @OffboardingTemplateId, 'Tax Clearance', 'BIR tax clearance processing', 'Finance', 22, 0, @AdminUserId),
    -- Clearance
    (@TenantId, @OffboardingTemplateId, 'Department Clearance', 'Clearance from immediate supervisor', 'Clearance', 30, 1, @AdminUserId),
    (@TenantId, @OffboardingTemplateId, 'HR Clearance', 'Clearance from HR department', 'Clearance', 31, 1, @AdminUserId),
    (@TenantId, @OffboardingTemplateId, 'Finance Clearance', 'Clearance from finance department', 'Clearance', 32, 1, @AdminUserId),
    (@TenantId, @OffboardingTemplateId, 'Admin Clearance', 'Clearance from admin/facilities', 'Clearance', 33, 0, @AdminUserId),
    -- General
    (@TenantId, @OffboardingTemplateId, 'Return Office Keys', 'Return office/locker keys', 'General', 40, 0, @AdminUserId),
    (@TenantId, @OffboardingTemplateId, 'Update Org Chart', 'Update organizational chart', 'General', 41, 0, @AdminUserId);

    PRINT 'Default offboarding template created';
END
ELSE
BEGIN
    PRINT 'Default offboarding template already exists';
END
