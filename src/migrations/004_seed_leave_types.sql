-- Migration 004: Seed default leave types (Philippine statutory leaves)
-- Version: 004
-- Date: 2024-01-01
-- Description: Seed Philippine statutory leave types per Labor Code and special laws

-- Note: This migration requires a TenantId parameter
-- We'll seed for a system default tenant or use a variable

-- First, create a system default tenant if it doesn't exist
DECLARE @SystemTenantId UNIQUEIDENTIFIER;
SELECT @SystemTenantId = Id FROM dbo.Tenants WHERE CompanyCode = 'SYSTEM';

IF @SystemTenantId IS NULL
BEGIN
    SET @SystemTenantId = NEWID();
    INSERT INTO dbo.Tenants (Id, CompanyName, CompanyCode, Status)
    VALUES (@SystemTenantId, 'System Default', 'SYSTEM', 'Active');
END

-- Set SESSION_CONTEXT so RLS block predicates allow INSERTs
EXEC sp_set_session_context 'TenantId', @SystemTenantId;

-- ============================================
-- Default Leave Types (Philippine Statutory)
-- ============================================

-- Vacation Leave (VL) - 15 days/year for regular employees
INSERT INTO dbo.LeaveTypes (TenantId, Code, Name, IsPaid, AccrualRatePerMonth, MaxCarryOverDays, IsMonetizable, RequiresDocumentation, LegalBasis)
VALUES
(@SystemTenantId, 'VL', 'Vacation Leave', 1, 1.25, 10, 1, 0, 'Company Policy - 15 days/year');

-- Sick Leave (SL) - 15 days/year for regular employees
INSERT INTO dbo.LeaveTypes (TenantId, Code, Name, IsPaid, AccrualRatePerMonth, MaxCarryOverDays, IsMonetizable, RequiresDocumentation, LegalBasis)
VALUES
(@SystemTenantId, 'SL', 'Sick Leave', 1, 1.25, 10, 1, 1, 'Company Policy - 15 days/year');

-- Maternity Leave - 105 days (RA 11210)
INSERT INTO dbo.LeaveTypes (TenantId, Code, Name, IsPaid, AccrualRatePerMonth, MaxCarryOverDays, IsMonetizable, RequiresDocumentation, LegalBasis)
VALUES
(@SystemTenantId, 'MAT', 'Maternity Leave', 1, 0, 0, 0, 1, 'RA 11210 - Expanded Maternity Leave Act of 2017');

-- Paternity Leave - 7 days (RA 8187)
INSERT INTO dbo.LeaveTypes (TenantId, Code, Name, IsPaid, AccrualRatePerMonth, MaxCarryOverDays, IsMonetizable, RequiresDocumentation, LegalBasis)
VALUES
(@SystemTenantId, 'PAT', 'Paternity Leave', 1, 0, 0, 0, 1, 'RA 8187 - Paternity Leave Act of 1996');

-- Solo Parent Leave - 7 days (RA 8972)
INSERT INTO dbo.LeaveTypes (TenantId, Code, Name, IsPaid, AccrualRatePerMonth, MaxCarryOverDays, IsMonetizable, RequiresDocumentation, LegalBasis)
VALUES
(@SystemTenantId, 'SOLO', 'Solo Parent Leave', 1, 0, 0, 0, 1, 'RA 8972 - Solo Parents'' Welfare Act of 2000');

-- Special Leave for Women - 60 days (RA 9710)
INSERT INTO dbo.LeaveTypes (TenantId, Code, Name, IsPaid, AccrualRatePerMonth, MaxCarryOverDays, IsMonetizable, RequiresDocumentation, LegalBasis)
VALUES
(@SystemTenantId, 'VAWC', 'Special Leave for Women (VAWC)', 1, 0, 0, 0, 1, 'RA 9710 - Magna Carta of Women / RA 9262');

-- Bereavement Leave - 3-5 days (company policy, no law mandate)
INSERT INTO dbo.LeaveTypes (TenantId, Code, Name, IsPaid, AccrualRatePerMonth, MaxCarryOverDays, IsMonetizable, RequiresDocumentation, LegalBasis)
VALUES
(@SystemTenantId, 'BEREAV', 'Bereavement Leave', 1, 0, 0, 0, 1, 'Company Policy - typically 3-5 days');

-- Special Leave for Women (Gynecological) - 60 days (Magna Carta of Women)
INSERT INTO dbo.LeaveTypes (TenantId, Code, Name, IsPaid, AccrualRatePerMonth, MaxCarryOverDays, IsMonetizable, RequiresDocumentation, LegalBasis)
VALUES
(@SystemTenantId, 'GYNAE', 'Special Leave for Women (Gynecological)', 1, 0, 0, 0, 1, 'RA 9710 - Magna Carta of Women');

-- Rehabilitation Leave - 6 months (for work-related injury/illness)
INSERT INTO dbo.LeaveTypes (TenantId, Code, Name, IsPaid, AccrualRatePerMonth, MaxCarryOverDays, IsMonetizable, RequiresDocumentation, LegalBasis)
VALUES
(@SystemTenantId, 'REHAB', 'Rehabilitation Leave', 1, 0, 0, 0, 1, 'Company Policy / DOLE guidelines');

-- Service Incentive Leave (SIL) - 5 days/year (Labor Code)
INSERT INTO dbo.LeaveTypes (TenantId, Code, Name, IsPaid, AccrualRatePerMonth, MaxCarryOverDays, IsMonetizable, RequiresDocumentation, LegalBasis)
VALUES
(@SystemTenantId, 'SIL', 'Service Incentive Leave', 1, 0.4167, 5, 1, 0, 'Labor Code Art. 94 - 5 days/year after 1 year service');

-- Leave Without Pay (LWOP)
INSERT INTO dbo.LeaveTypes (TenantId, Code, Name, IsPaid, AccrualRatePerMonth, MaxCarryOverDays, IsMonetizable, RequiresDocumentation, LegalBasis)
VALUES
(@SystemTenantId, 'LWOP', 'Leave Without Pay', 0, 0, 0, 0, 0, 'Company Policy - unpaid leave');

PRINT 'Migration 004 completed successfully - Default leave types seeded';
GO
