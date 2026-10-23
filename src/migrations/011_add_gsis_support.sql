-- Migration 011: Add GSIS support for government/public sector employers
-- Version: 011
-- Date: 2026-07-27
-- Description: Adds GSIS contribution support for government employers, adds IsGovernment flag to Tenants

-- ============================================
-- 1. Add IsGovernment flag and GSIS employer number to Tenants
-- ============================================
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Tenants') AND name = 'IsGovernment')
BEGIN
    ALTER TABLE dbo.Tenants ADD IsGovernment BIT DEFAULT 0;
    
    -- Update existing SYSTEM tenant as private (default)
    UPDATE dbo.Tenants SET IsGovernment = 0 WHERE IsGovernment IS NULL;
    
    PRINT 'Added IsGovernment column to Tenants';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Tenants') AND name = 'GsisEmployerNo')
BEGIN
    ALTER TABLE dbo.Tenants ADD GsisEmployerNo NVARCHAR(20) NULL;
    PRINT 'Added GsisEmployerNo column to Tenants';
END
GO

-- ============================================
-- 2. Add GSIS fields to Payslips
-- ============================================
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Payslips') AND name = 'GsisEmployeeShare')
BEGIN
    ALTER TABLE dbo.Payslips ADD GsisEmployeeShare DECIMAL(18,4) DEFAULT 0;
    ALTER TABLE dbo.Payslips ADD GsisEmployerShare DECIMAL(18,4) DEFAULT 0;
    ALTER TABLE dbo.Payslips ADD GsisECShare DECIMAL(18,4) DEFAULT 0;  -- Employee Compensation
    
    PRINT 'Added GSIS columns to Payslips';
END
GO

-- ============================================
-- 3. Add GSIS to GovContributionTables TableType enum
-- Note: MSSQL doesn't have native ENUM, so we just add GSIS type data
-- ============================================
IF NOT EXISTS (SELECT * FROM dbo.GovContributionTables WHERE TableType = 'GSIS')
BEGIN
    -- GSIS Contribution Table (Government employees)
    -- Based on GSIS Circular 2024-2025 rates
    -- GSIS uses a different structure: based on monthly salary, not brackets like SSS
    
    -- Premium contributions (employee + employer)
    INSERT INTO dbo.GovContributionTables (EffectiveYear, TableType, BracketMin, BracketMax, EmployeeShare, EmployerShare, FixedAmount, RatePercent, Description)
    VALUES 
    -- 2025 GSIS Premium Rates (9% employee, 9% employer of monthly salary)
    (2025, 'GSIS', 0, 10000, NULL, NULL, NULL, 9.00, 'GSIS Premium - Monthly salary up to ₱10,000'),
    (2025, 'GSIS', 10001, 20000, NULL, NULL, NULL, 9.00, 'GSIS Premium - Monthly salary ₱10,001-20,000'),
    (2025, 'GSIS', 20001, 30000, NULL, NULL, NULL, 9.00, 'GSIS Premium - Monthly salary ₱20,001-30,000'),
    (2025, 'GSIS', 30001, 50000, NULL, NULL, NULL, 9.00, 'GSIS Premium - Monthly salary ₱30,001-50,000'),
    (2025, 'GSIS', 50001, 100000, NULL, NULL, NULL, 9.00, 'GSIS Premium - Monthly salary ₱50,001-100,000'),
    (2025, 'GSIS', 100001, 999999, NULL, NULL, NULL, 9.00, 'GSIS Premium - Monthly salary above ₱100,000'),
    
    -- Employee Compensation (EC) - additional 2% employer share
    (2025, 'GSIS_EC', 0, 999999, NULL, NULL, NULL, 2.00, 'GSIS EC - Employer only, 2% of monthly salary'),
    
    -- 2026 rates (same structure, update if rates change)
    (2026, 'GSIS', 0, 10000, NULL, NULL, NULL, 9.00, 'GSIS Premium - Monthly salary up to ₱10,000'),
    (2026, 'GSIS', 10001, 20000, NULL, NULL, NULL, 9.00, 'GSIS Premium - Monthly salary ₱10,001-20,000'),
    (2026, 'GSIS', 20001, 30000, NULL, NULL, NULL, 9.00, 'GSIS Premium - Monthly salary ₱20,001-30,000'),
    (2026, 'GSIS', 30001, 50000, NULL, NULL, NULL, 9.00, 'GSIS Premium - Monthly salary ₱30,001-50,000'),
    (2026, 'GSIS', 50001, 100000, NULL, NULL, NULL, 9.00, 'GSIS Premium - Monthly salary ₱50,001-100,000'),
    (2026, 'GSIS', 100001, 999999, NULL, NULL, NULL, 9.00, 'GSIS Premium - Monthly salary above ₱100,000'),
    (2026, 'GSIS_EC', 0, 999999, NULL, NULL, NULL, 2.00, 'GSIS EC - Employer only, 2% of monthly salary');
    
    PRINT 'Seeded GSIS contribution tables for 2025-2026';
END
GO

-- ============================================
-- 4. Add GSIS loan types to EmployeeLoans
-- ============================================
-- Note: EmployeeLoans already has LoanType ENUM which we can extend
-- The application layer should handle GSIS loan types: 'GSIS_Conso', 'GSIS_Policy', 'GSIS_Enhanced', 'GSIS_Emergency'

PRINT 'Migration 011 completed: GSIS support added';
GO
