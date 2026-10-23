-- Migration 003: Seed data for government contribution tables and leave types
-- Version: 003
-- Date: 2024-01-01
-- Description: Seed Philippine government contribution tables and default leave types

-- ============================================
-- SSS Contribution Table 2024
-- Source: SSS Circular 2024-001
-- ============================================
INSERT INTO dbo.GovContributionTables (EffectiveYear, TableType, BracketMin, BracketMax, EmployeeShare, EmployerShare, FixedAmount, RatePercent, Description)
VALUES
-- SSS Contribution Table 2024
(2024, 'SSS', 3250, 3750, 135.00, 225.00, NULL, NULL, 'SSS Contribution - Monthly Salary Credit Range 1'),
(2024, 'SSS', 3750, 4250, 157.50, 262.50, NULL, NULL, 'SSS Contribution - Monthly Salary Credit Range 2'),
(2024, 'SSS', 4250, 4750, 180.00, 300.00, NULL, NULL, 'SSS Contribution - Monthly Salary Credit Range 3'),
(2024, 'SSS', 4750, 5250, 202.50, 337.50, NULL, NULL, 'SSS Contribution - Monthly Salary Credit Range 4'),
(2024, 'SSS', 5250, 5750, 225.00, 375.00, NULL, NULL, 'SSS Contribution - Monthly Salary Credit Range 5'),
(2024, 'SSS', 5750, 6250, 247.50, 412.50, NULL, NULL, 'SSS Contribution - Monthly Salary Credit Range 6'),
(2024, 'SSS', 6250, 6750, 270.00, 450.00, NULL, NULL, 'SSS Contribution - Monthly Salary Credit Range 7'),
(2024, 'SSS', 6750, 7250, 292.50, 487.50, NULL, NULL, 'SSS Contribution - Monthly Salary Credit Range 8'),
(2024, 'SSS', 7250, 7750, 315.00, 525.00, NULL, NULL, 'SSS Contribution - Monthly Salary Credit Range 9'),
(2024, 'SSS', 7750, 8250, 337.50, 562.50, NULL, NULL, 'SSS Contribution - Monthly Salary Credit Range 10'),
(2024, 'SSS', 8250, 8750, 360.00, 600.00, NULL, NULL, 'SSS Contribution - Monthly Salary Credit Range 11'),
(2024, 'SSS', 8750, 9250, 382.50, 637.50, NULL, NULL, 'SSS Contribution - Monthly Salary Credit Range 12'),
(2024, 'SSS', 9250, 9750, 405.00, 675.00, NULL, NULL, 'SSS Contribution - Monthly Salary Credit Range 13'),
(2024, 'SSS', 9750, 10250, 427.50, 712.50, NULL, NULL, 'SSS Contribution - Monthly Salary Credit Range 14'),
(2024, 'SSS', 10250, 10750, 450.00, 750.00, NULL, NULL, 'SSS Contribution - Monthly Salary Credit Range 15'),
(2024, 'SSS', 10750, 11250, 472.50, 787.50, NULL, NULL, 'SSS Contribution - Monthly Salary Credit Range 16'),
(2024, 'SSS', 11250, 11750, 495.00, 825.00, NULL, NULL, 'SSS Contribution - Monthly Salary Credit Range 17'),
(2024, 'SSS', 11750, 12250, 517.50, 862.50, NULL, NULL, 'SSS Contribution - Monthly Salary Credit Range 18'),
(2024, 'SSS', 12250, 12750, 540.00, 900.00, NULL, NULL, 'SSS Contribution - Monthly Salary Credit Range 19'),
(2024, 'SSS', 12750, 13250, 562.50, 937.50, NULL, NULL, 'SSS Contribution - Monthly Salary Credit Range 20'),
(2024, 'SSS', 13250, 13750, 585.00, 975.00, NULL, NULL, 'SSS Contribution - Monthly Salary Credit Range 21'),
(2024, 'SSS', 13750, 14250, 607.50, 1012.50, NULL, NULL, 'SSS Contribution - Monthly Salary Credit Range 22'),
(2024, 'SSS', 14250, 14750, 630.00, 1050.00, NULL, NULL, 'SSS Contribution - Monthly Salary Credit Range 23'),
(2024, 'SSS', 14750, 15250, 652.50, 1087.50, NULL, NULL, 'SSS Contribution - Monthly Salary Credit Range 24'),
(2024, 'SSS', 15250, 15750, 675.00, 1125.00, NULL, NULL, 'SSS Contribution - Monthly Salary Credit Range 25'),
(2024, 'SSS', 15750, 16250, 697.50, 1162.50, NULL, NULL, 'SSS Contribution - Monthly Salary Credit Range 26'),
(2024, 'SSS', 16250, 16750, 720.00, 1200.00, NULL, NULL, 'SSS Contribution - Monthly Salary Credit Range 27'),
(2024, 'SSS', 16750, 17250, 742.50, 1237.50, NULL, NULL, 'SSS Contribution - Monthly Salary Credit Range 28'),
(2024, 'SSS', 17250, 17750, 765.00, 1275.00, NULL, NULL, 'SSS Contribution - Monthly Salary Credit Range 29'),
(2024, 'SSS', 17750, 18250, 787.50, 1312.50, NULL, NULL, 'SSS Contribution - Monthly Salary Credit Range 30'),
(2024, 'SSS', 18250, 18750, 810.00, 1350.00, NULL, NULL, 'SSS Contribution - Monthly Salary Credit Range 31'),
(2024, 'SSS', 18750, 19250, 832.50, 1387.50, NULL, NULL, 'SSS Contribution - Monthly Salary Credit Range 32'),
(2024, 'SSS', 19250, 19750, 855.00, 1425.00, NULL, NULL, 'SSS Contribution - Monthly Salary Credit Range 33'),
(2024, 'SSS', 19750, 20250, 877.50, 1462.50, NULL, NULL, 'SSS Contribution - Monthly Salary Credit Range 34'),
(2024, 'SSS', 20250, 20750, 900.00, 1500.00, NULL, NULL, 'SSS Contribution - Monthly Salary Credit Range 35'),
(2024, 'SSS', 20750, 25000, 900.00, 1500.00, NULL, NULL, 'SSS Contribution - Maximum MSC'),
-- SSS MPF (Modified Pag-IBIG Fund) - Above 20,250 MSC
(2024, 'SSS', 20250, 25000, 900.00, 1500.00, NULL, NULL, 'SSS MPF - Employee Share Above Threshold'),
(2024, 'SSS', 20250, 25000, NULL, NULL, NULL, NULL, 'SSS MPF - Employer Share Above Threshold');
GO

-- ============================================
-- PhilHealth Contribution Table 2024
-- Source: PhilHealth Circular 2024-001
-- Rate: 5% of basic salary (shared equally EE/ER)
-- Floor: 10,000; Ceiling: 100,000
-- ============================================
INSERT INTO dbo.GovContributionTables (EffectiveYear, TableType, BracketMin, BracketMax, EmployeeShare, EmployerShare, FixedAmount, RatePercent, Description)
VALUES
(2024, 'PhilHealth', 10000, 100000, NULL, NULL, NULL, 2.50, 'PhilHealth - 5% rate split equally (2.5% EE + 2.5% ER)'),
(2024, 'PhilHealth', 10000, 100000, 250.00, 250.00, NULL, NULL, 'PhilHealth - Minimum Contribution (5% of 10,000 floor)'),
(2024, 'PhilHealth', 10000, 100000, 2500.00, 2500.00, NULL, NULL, 'PhilHealth - Maximum Contribution (5% of 100,000 ceiling)');
GO

-- ============================================
-- Pag-IBIG (HDMF) Contribution Table 2024
-- Source: Pag-IBIG Circular 2024-001
-- Standard: 2% EE / 2% ER
-- Salary cap: 5,000 (for contribution basis)
-- ============================================
INSERT INTO dbo.GovContributionTables (EffectiveYear, TableType, BracketMin, BracketMax, EmployeeShare, EmployerShare, FixedAmount, RatePercent, Description)
VALUES
(2024, 'PagIbig', 0, 5000, 100.00, 100.00, NULL, NULL, 'Pag-IBIG - Standard 2% EE/ER on first 5,000'),
(2024, 'PagIbig', 5000, 50000, 200.00, 200.00, NULL, NULL, 'Pag-IBIG - Maximum contribution (2% of 10,000 monthly compensation)'),
(2024, 'PagIbig', 5000, 50000, NULL, NULL, NULL, 2.00, 'Pag-IBIG - 2% rate on monthly compensation above cap');
GO

-- ============================================
-- BIR Withholding Tax Table 2024 (TRAIN Law)
-- Source: BIR Revenue Regulations 2024
-- For Monthly Payroll Period
-- ============================================
INSERT INTO dbo.GovContributionTables (EffectiveYear, TableType, BracketMin, BracketMax, EmployeeShare, EmployerShare, FixedAmount, RatePercent, Description)
VALUES
-- Monthly payroll period (0-10,000)
(2024, 'WithholdingTax', 0, 10000, NULL, NULL, 0, 0, 'BIR Monthly - No tax on first 10,000'),
-- Monthly payroll period (10,001-20,000)
(2024, 'WithholdingTax', 10000, 20000, NULL, NULL, 0, 15, 'BIR Monthly - 15% on excess of 10,000'),
-- Monthly payroll period (20,001-40,000)
(2024, 'WithholdingTax', 20000, 40000, NULL, NULL, 1500, 20, 'BIR Monthly - 1,500 + 20% on excess of 20,000'),
-- Monthly payroll period (40,001-80,000)
(2024, 'WithholdingTax', 40000, 80000, NULL, NULL, 5500, 25, 'BIR Monthly - 5,500 + 25% on excess of 40,000'),
-- Monthly payroll period (80,001-200,000)
(2024, 'WithholdingTax', 80000, 200000, NULL, NULL, 15500, 30, 'BIR Monthly - 15,500 + 30% on excess of 80,000'),
-- Monthly payroll period (200,001-800,000)
(2024, 'WithholdingTax', 200000, 800000, NULL, NULL, 51500, 32, 'BIR Monthly - 51,500 + 32% on excess of 200,000'),
-- Monthly payroll period (above 800,000)
(2024, 'WithholdingTax', 800000, 999999999, NULL, NULL, 243500, 35, 'BIR Monthly - 243,500 + 35% on excess of 800,000');
GO

-- ============================================
-- De Minimis Benefits (Non-Taxable)
-- Source: BIR Revenue Regulations 2024
-- ============================================
INSERT INTO dbo.GovContributionTables (EffectiveYear, TableType, BracketMin, BracketMax, EmployeeShare, EmployerShare, FixedAmount, RatePercent, Description)
VALUES
(2024, 'DeMinimis', 0, 0, NULL, NULL, 2000, NULL, 'Rice subsidy - up to 2,000/month'),
(2024, 'DeMinimis', 0, 0, NULL, NULL, 1000, NULL, 'Medical cash allowance - up to 1,000/month'),
(2024, 'DeMinimis', 0, 0, NULL, NULL, 1000, NULL, 'Uniform allowance - up to 1,000/month (or actual uniform cost)'),
(2024, 'DeMinimis', 0, 0, NULL, NULL, 5000, NULL, 'Employee achievement award - up to 5,000/year'),
(2024, 'DeMinimis', 0, 0, NULL, NULL, 2000, NULL, 'Gift given during Christmas and other celebration - up to 2,000/year');
GO

PRINT 'Migration 003 completed successfully - Government contribution tables seeded';
GO
