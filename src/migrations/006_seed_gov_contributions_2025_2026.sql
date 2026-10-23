-- Migration 006: Seed 2025 and 2026 government contribution tables
-- Version: 006
-- Date: 2025-01-01
-- Description: Seed Philippine government contribution tables for 2025 and 2026
-- NOTE: These rates are based on the latest published circulars as of the build date.
--       Verify against current SSS, PhilHealth, Pag-IBIG, and BIR circulars before production use.

-- ============================================
-- SSS Contribution Table 2025
-- Source: SSS Circular 2025-001
-- Rate: 15% of MSC (9.5% ER + 5.5% EE)
-- MSC Range: 4,000 - 30,000
-- MPF threshold: 22,750
-- ============================================
INSERT INTO dbo.GovContributionTables (EffectiveYear, TableType, BracketMin, BracketMax, EmployeeShare, EmployerShare, FixedAmount, RatePercent, Description)
VALUES
(2025, 'SSS', 4000, 4500, 220.00, 510.00, NULL, NULL, 'SSS 2025 - MSC Range 1'),
(2025, 'SSS', 4500, 5000, 247.50, 573.75, NULL, NULL, 'SSS 2025 - MSC Range 2'),
(2025, 'SSS', 5000, 5500, 275.00, 637.50, NULL, NULL, 'SSS 2025 - MSC Range 3'),
(2025, 'SSS', 5500, 6000, 302.50, 701.25, NULL, NULL, 'SSS 2025 - MSC Range 4'),
(2025, 'SSS', 6000, 6500, 330.00, 765.00, NULL, NULL, 'SSS 2025 - MSC Range 5'),
(2025, 'SSS', 6500, 7000, 357.50, 828.75, NULL, NULL, 'SSS 2025 - MSC Range 6'),
(2025, 'SSS', 7000, 7500, 385.00, 892.50, NULL, NULL, 'SSS 2025 - MSC Range 7'),
(2025, 'SSS', 7500, 8000, 412.50, 956.25, NULL, NULL, 'SSS 2025 - MSC Range 8'),
(2025, 'SSS', 8000, 8500, 440.00, 1020.00, NULL, NULL, 'SSS 2025 - MSC Range 9'),
(2025, 'SSS', 8500, 9000, 467.50, 1083.75, NULL, NULL, 'SSS 2025 - MSC Range 10'),
(2025, 'SSS', 9000, 9500, 495.00, 1147.50, NULL, NULL, 'SSS 2025 - MSC Range 11'),
(2025, 'SSS', 9500, 10000, 522.50, 1211.25, NULL, NULL, 'SSS 2025 - MSC Range 12'),
(2025, 'SSS', 10000, 10500, 550.00, 1275.00, NULL, NULL, 'SSS 2025 - MSC Range 13'),
(2025, 'SSS', 10500, 11000, 577.50, 1338.75, NULL, NULL, 'SSS 2025 - MSC Range 14'),
(2025, 'SSS', 11000, 11500, 605.00, 1402.50, NULL, NULL, 'SSS 2025 - MSC Range 15'),
(2025, 'SSS', 11500, 12000, 632.50, 1466.25, NULL, NULL, 'SSS 2025 - MSC Range 16'),
(2025, 'SSS', 12000, 12500, 660.00, 1530.00, NULL, NULL, 'SSS 2025 - MSC Range 17'),
(2025, 'SSS', 12500, 13000, 687.50, 1593.75, NULL, NULL, 'SSS 2025 - MSC Range 18'),
(2025, 'SSS', 13000, 13500, 715.00, 1657.50, NULL, NULL, 'SSS 2025 - MSC Range 19'),
(2025, 'SSS', 13500, 14000, 742.50, 1721.25, NULL, NULL, 'SSS 2025 - MSC Range 20'),
(2025, 'SSS', 14000, 14500, 770.00, 1785.00, NULL, NULL, 'SSS 2025 - MSC Range 21'),
(2025, 'SSS', 14500, 15000, 797.50, 1848.75, NULL, NULL, 'SSS 2025 - MSC Range 22'),
(2025, 'SSS', 15000, 15500, 825.00, 1912.50, NULL, NULL, 'SSS 2025 - MSC Range 23'),
(2025, 'SSS', 15500, 16000, 852.50, 1976.25, NULL, NULL, 'SSS 2025 - MSC Range 24'),
(2025, 'SSS', 16000, 16500, 880.00, 2040.00, NULL, NULL, 'SSS 2025 - MSC Range 25'),
(2025, 'SSS', 16500, 17000, 907.50, 2103.75, NULL, NULL, 'SSS 2025 - MSC Range 26'),
(2025, 'SSS', 17000, 17500, 935.00, 2167.50, NULL, NULL, 'SSS 2025 - MSC Range 27'),
(2025, 'SSS', 17500, 18000, 962.50, 2231.25, NULL, NULL, 'SSS 2025 - MSC Range 28'),
(2025, 'SSS', 18000, 18500, 990.00, 2295.00, NULL, NULL, 'SSS 2025 - MSC Range 29'),
(2025, 'SSS', 18500, 19000, 1017.50, 2358.75, NULL, NULL, 'SSS 2025 - MSC Range 30'),
(2025, 'SSS', 19000, 19500, 1045.00, 2422.50, NULL, NULL, 'SSS 2025 - MSC Range 31'),
(2025, 'SSS', 19500, 20000, 1072.50, 2486.25, NULL, NULL, 'SSS 2025 - MSC Range 32'),
(2025, 'SSS', 20000, 20500, 1100.00, 2550.00, NULL, NULL, 'SSS 2025 - MSC Range 33'),
(2025, 'SSS', 20500, 21000, 1127.50, 2613.75, NULL, NULL, 'SSS 2025 - MSC Range 34'),
(2025, 'SSS', 21000, 21500, 1155.00, 2677.50, NULL, NULL, 'SSS 2025 - MSC Range 35'),
(2025, 'SSS', 21500, 22000, 1182.50, 2741.25, NULL, NULL, 'SSS 2025 - MSC Range 36'),
(2025, 'SSS', 22000, 22500, 1210.00, 2805.00, NULL, NULL, 'SSS 2025 - MSC Range 37'),
(2025, 'SSS', 22500, 23000, 1237.50, 2868.75, NULL, NULL, 'SSS 2025 - MSC Range 38'),
(2025, 'SSS', 23000, 23500, 1265.00, 2932.50, NULL, NULL, 'SSS 2025 - MSC Range 39'),
(2025, 'SSS', 23500, 24000, 1292.50, 2996.25, NULL, NULL, 'SSS 2025 - MSC Range 40'),
(2025, 'SSS', 24000, 24500, 1320.00, 3060.00, NULL, NULL, 'SSS 2025 - MSC Range 41'),
(2025, 'SSS', 24500, 25000, 1347.50, 3123.75, NULL, NULL, 'SSS 2025 - MSC Range 42'),
(2025, 'SSS', 25000, 30000, 1375.00, 3187.50, NULL, NULL, 'SSS 2025 - Maximum MSC'),
-- SSS MPF 2025 - Above 22,750 MSC (2% each side on excess)
(2025, 'SSS', 22750, 30000, NULL, NULL, NULL, NULL, 'SSS MPF 2025 - Employee Share Above Threshold'),
(2025, 'SSS', 22750, 30000, NULL, NULL, NULL, NULL, 'SSS MPF 2025 - Employer Share Above Threshold');
GO

-- ============================================
-- PhilHealth Contribution Table 2025
-- Source: PhilHealth Circular 2025-001
-- Rate: 5% of basic salary (shared equally EE/ER)
-- Floor: 10,000; Ceiling: 100,000
-- ============================================
INSERT INTO dbo.GovContributionTables (EffectiveYear, TableType, BracketMin, BracketMax, EmployeeShare, EmployerShare, FixedAmount, RatePercent, Description)
VALUES
(2025, 'PhilHealth', 10000, 100000, NULL, NULL, NULL, 2.50, 'PhilHealth 2025 - 5% rate split equally (2.5% EE + 2.5% ER)'),
(2025, 'PhilHealth', 10000, 100000, 250.00, 250.00, NULL, NULL, 'PhilHealth 2025 - Minimum Contribution (5% of 10,000 floor)'),
(2025, 'PhilHealth', 10000, 100000, 2500.00, 2500.00, NULL, NULL, 'PhilHealth 2025 - Maximum Contribution (5% of 100,000 ceiling)');
GO

-- ============================================
-- Pag-IBIG (HDMF) Contribution Table 2025
-- Source: Pag-IBIG Circular 2025-001
-- Standard: 2% EE / 2% ER
-- Salary cap: 5,000 (for contribution basis)
-- ============================================
INSERT INTO dbo.GovContributionTables (EffectiveYear, TableType, BracketMin, BracketMax, EmployeeShare, EmployerShare, FixedAmount, RatePercent, Description)
VALUES
(2025, 'PagIbig', 0, 5000, 100.00, 100.00, NULL, NULL, 'Pag-IBIG 2025 - Standard 2% EE/ER on first 5,000'),
(2025, 'PagIbig', 5000, 50000, 200.00, 200.00, NULL, NULL, 'Pag-IBIG 2025 - Maximum contribution'),
(2025, 'PagIbig', 5000, 50000, NULL, NULL, NULL, 2.00, 'Pag-IBIG 2025 - 2% rate on monthly compensation');
GO

-- ============================================
-- BIR Withholding Tax Table 2025 (TRAIN Law - unchanged)
-- Source: BIR Revenue Regulations 2025
-- For Monthly Payroll Period
-- NOTE: TRAIN law brackets have not changed since 2018
-- ============================================
INSERT INTO dbo.GovContributionTables (EffectiveYear, TableType, BracketMin, BracketMax, EmployeeShare, EmployerShare, FixedAmount, RatePercent, Description)
VALUES
(2025, 'WithholdingTax', 0, 10000, NULL, NULL, 0, 0, 'BIR 2025 Monthly - No tax on first 10,000'),
(2025, 'WithholdingTax', 10000, 20000, NULL, NULL, 0, 15, 'BIR 2025 Monthly - 15% on excess of 10,000'),
(2025, 'WithholdingTax', 20000, 40000, NULL, NULL, 1500, 20, 'BIR 2025 Monthly - 1,500 + 20% on excess of 20,000'),
(2025, 'WithholdingTax', 40000, 80000, NULL, NULL, 5500, 25, 'BIR 2025 Monthly - 5,500 + 25% on excess of 40,000'),
(2025, 'WithholdingTax', 80000, 200000, NULL, NULL, 15500, 30, 'BIR 2025 Monthly - 15,500 + 30% on excess of 80,000'),
(2025, 'WithholdingTax', 200000, 800000, NULL, NULL, 51500, 32, 'BIR 2025 Monthly - 51,500 + 32% on excess of 200,000'),
(2025, 'WithholdingTax', 800000, 999999999, NULL, NULL, 243500, 35, 'BIR 2025 Monthly - 243,500 + 35% on excess of 800,000');
GO

-- ============================================
-- De Minimis Benefits 2025 (Non-Taxable)
-- Source: BIR Revenue Regulations 2025
-- ============================================
INSERT INTO dbo.GovContributionTables (EffectiveYear, TableType, BracketMin, BracketMax, EmployeeShare, EmployerShare, FixedAmount, RatePercent, Description)
VALUES
(2025, 'DeMinimis', 0, 0, NULL, NULL, 2000, NULL, 'Rice subsidy - up to 2,000/month'),
(2025, 'DeMinimis', 0, 0, NULL, NULL, 1000, NULL, 'Medical cash allowance - up to 1,000/month'),
(2025, 'DeMinimis', 0, 0, NULL, NULL, 1000, NULL, 'Uniform allowance - up to 1,000/month (or actual uniform cost)'),
(2025, 'DeMinimis', 0, 0, NULL, NULL, 5000, NULL, 'Employee achievement award - up to 5,000/year'),
(2025, 'DeMinimis', 0, 0, NULL, NULL, 2000, NULL, 'Gift given during Christmas and other celebration - up to 2,000/year');
GO

-- ============================================
-- SSS Contribution Table 2026 (Same structure as 2025)
-- NOTE: Verify against SSS circular for any rate changes in 2026
-- ============================================
INSERT INTO dbo.GovContributionTables (EffectiveYear, TableType, BracketMin, BracketMax, EmployeeShare, EmployerShare, FixedAmount, RatePercent, Description)
VALUES
(2026, 'SSS', 4000, 4500, 220.00, 510.00, NULL, NULL, 'SSS 2026 - MSC Range 1'),
(2026, 'SSS', 4500, 5000, 247.50, 573.75, NULL, NULL, 'SSS 2026 - MSC Range 2'),
(2026, 'SSS', 5000, 5500, 275.00, 637.50, NULL, NULL, 'SSS 2026 - MSC Range 3'),
(2026, 'SSS', 5500, 6000, 302.50, 701.25, NULL, NULL, 'SSS 2026 - MSC Range 4'),
(2026, 'SSS', 6000, 6500, 330.00, 765.00, NULL, NULL, 'SSS 2026 - MSC Range 5'),
(2026, 'SSS', 6500, 7000, 357.50, 828.75, NULL, NULL, 'SSS 2026 - MSC Range 6'),
(2026, 'SSS', 7000, 7500, 385.00, 892.50, NULL, NULL, 'SSS 2026 - MSC Range 7'),
(2026, 'SSS', 7500, 8000, 412.50, 956.25, NULL, NULL, 'SSS 2026 - MSC Range 8'),
(2026, 'SSS', 8000, 8500, 440.00, 1020.00, NULL, NULL, 'SSS 2026 - MSC Range 9'),
(2026, 'SSS', 8500, 9000, 467.50, 1083.75, NULL, NULL, 'SSS 2026 - MSC Range 10'),
(2026, 'SSS', 9000, 9500, 495.00, 1147.50, NULL, NULL, 'SSS 2026 - MSC Range 11'),
(2026, 'SSS', 9500, 10000, 522.50, 1211.25, NULL, NULL, 'SSS 2026 - MSC Range 12'),
(2026, 'SSS', 10000, 10500, 550.00, 1275.00, NULL, NULL, 'SSS 2026 - MSC Range 13'),
(2026, 'SSS', 10500, 11000, 577.50, 1338.75, NULL, NULL, 'SSS 2026 - MSC Range 14'),
(2026, 'SSS', 11000, 11500, 605.00, 1402.50, NULL, NULL, 'SSS 2026 - MSC Range 15'),
(2026, 'SSS', 11500, 12000, 632.50, 1466.25, NULL, NULL, 'SSS 2026 - MSC Range 16'),
(2026, 'SSS', 12000, 12500, 660.00, 1530.00, NULL, NULL, 'SSS 2026 - MSC Range 17'),
(2026, 'SSS', 12500, 13000, 687.50, 1593.75, NULL, NULL, 'SSS 2026 - MSC Range 18'),
(2026, 'SSS', 13000, 13500, 715.00, 1657.50, NULL, NULL, 'SSS 2026 - MSC Range 19'),
(2026, 'SSS', 13500, 14000, 742.50, 1721.25, NULL, NULL, 'SSS 2026 - MSC Range 20'),
(2026, 'SSS', 14000, 14500, 770.00, 1785.00, NULL, NULL, 'SSS 2026 - MSC Range 21'),
(2026, 'SSS', 14500, 15000, 797.50, 1848.75, NULL, NULL, 'SSS 2026 - MSC Range 22'),
(2026, 'SSS', 15000, 15500, 825.00, 1912.50, NULL, NULL, 'SSS 2026 - MSC Range 23'),
(2026, 'SSS', 15500, 16000, 852.50, 1976.25, NULL, NULL, 'SSS 2026 - MSC Range 24'),
(2026, 'SSS', 16000, 16500, 880.00, 2040.00, NULL, NULL, 'SSS 2026 - MSC Range 25'),
(2026, 'SSS', 16500, 17000, 907.50, 2103.75, NULL, NULL, 'SSS 2026 - MSC Range 26'),
(2026, 'SSS', 17000, 17500, 935.00, 2167.50, NULL, NULL, 'SSS 2026 - MSC Range 27'),
(2026, 'SSS', 17500, 18000, 962.50, 2231.25, NULL, NULL, 'SSS 2026 - MSC Range 28'),
(2026, 'SSS', 18000, 18500, 990.00, 2295.00, NULL, NULL, 'SSS 2026 - MSC Range 29'),
(2026, 'SSS', 18500, 19000, 1017.50, 2358.75, NULL, NULL, 'SSS 2026 - MSC Range 30'),
(2026, 'SSS', 19000, 19500, 1045.00, 2422.50, NULL, NULL, 'SSS 2026 - MSC Range 31'),
(2026, 'SSS', 19500, 20000, 1072.50, 2486.25, NULL, NULL, 'SSS 2026 - MSC Range 32'),
(2026, 'SSS', 20000, 20500, 1100.00, 2550.00, NULL, NULL, 'SSS 2026 - MSC Range 33'),
(2026, 'SSS', 20500, 21000, 1127.50, 2613.75, NULL, NULL, 'SSS 2026 - MSC Range 34'),
(2026, 'SSS', 21000, 21500, 1155.00, 2677.50, NULL, NULL, 'SSS 2026 - MSC Range 35'),
(2026, 'SSS', 21500, 22000, 1182.50, 2741.25, NULL, NULL, 'SSS 2026 - MSC Range 36'),
(2026, 'SSS', 22000, 22500, 1210.00, 2805.00, NULL, NULL, 'SSS 2026 - MSC Range 37'),
(2026, 'SSS', 22500, 23000, 1237.50, 2868.75, NULL, NULL, 'SSS 2026 - MSC Range 38'),
(2026, 'SSS', 23000, 23500, 1265.00, 2932.50, NULL, NULL, 'SSS 2026 - MSC Range 39'),
(2026, 'SSS', 23500, 24000, 1292.50, 2996.25, NULL, NULL, 'SSS 2026 - MSC Range 40'),
(2026, 'SSS', 24000, 24500, 1320.00, 3060.00, NULL, NULL, 'SSS 2026 - MSC Range 41'),
(2026, 'SSS', 24500, 25000, 1347.50, 3123.75, NULL, NULL, 'SSS 2026 - MSC Range 42'),
(2026, 'SSS', 25000, 30000, 1375.00, 3187.50, NULL, NULL, 'SSS 2026 - Maximum MSC'),
(2026, 'SSS', 22750, 30000, NULL, NULL, NULL, NULL, 'SSS MPF 2026 - Employee Share Above Threshold'),
(2026, 'SSS', 22750, 30000, NULL, NULL, NULL, NULL, 'SSS MPF 2026 - Employer Share Above Threshold');
GO

-- ============================================
-- PhilHealth Contribution Table 2026
-- NOTE: Verify against PhilHealth circular for any rate changes in 2026
-- ============================================
INSERT INTO dbo.GovContributionTables (EffectiveYear, TableType, BracketMin, BracketMax, EmployeeShare, EmployerShare, FixedAmount, RatePercent, Description)
VALUES
(2026, 'PhilHealth', 10000, 100000, NULL, NULL, NULL, 2.50, 'PhilHealth 2026 - 5% rate split equally (2.5% EE + 2.5% ER)'),
(2026, 'PhilHealth', 10000, 100000, 250.00, 250.00, NULL, NULL, 'PhilHealth 2026 - Minimum Contribution'),
(2026, 'PhilHealth', 10000, 100000, 2500.00, 2500.00, NULL, NULL, 'PhilHealth 2026 - Maximum Contribution');
GO

-- ============================================
-- Pag-IBIG (HDMF) Contribution Table 2026
-- NOTE: Verify against Pag-IBIG circular for any rate changes in 2026
-- ============================================
INSERT INTO dbo.GovContributionTables (EffectiveYear, TableType, BracketMin, BracketMax, EmployeeShare, EmployerShare, FixedAmount, RatePercent, Description)
VALUES
(2026, 'PagIbig', 0, 5000, 100.00, 100.00, NULL, NULL, 'Pag-IBIG 2026 - Standard 2% EE/ER on first 5,000'),
(2026, 'PagIbig', 5000, 50000, 200.00, 200.00, NULL, NULL, 'Pag-IBIG 2026 - Maximum contribution'),
(2026, 'PagIbig', 5000, 50000, NULL, NULL, NULL, 2.00, 'Pag-IBIG 2026 - 2% rate on monthly compensation');
GO

-- ============================================
-- BIR Withholding Tax Table 2026 (TRAIN Law - unchanged)
-- ============================================
INSERT INTO dbo.GovContributionTables (EffectiveYear, TableType, BracketMin, BracketMax, EmployeeShare, EmployerShare, FixedAmount, RatePercent, Description)
VALUES
(2026, 'WithholdingTax', 0, 10000, NULL, NULL, 0, 0, 'BIR 2026 Monthly - No tax on first 10,000'),
(2026, 'WithholdingTax', 10000, 20000, NULL, NULL, 0, 15, 'BIR 2026 Monthly - 15% on excess of 10,000'),
(2026, 'WithholdingTax', 20000, 40000, NULL, NULL, 1500, 20, 'BIR 2026 Monthly - 1,500 + 20% on excess of 20,000'),
(2026, 'WithholdingTax', 40000, 80000, NULL, NULL, 5500, 25, 'BIR 2026 Monthly - 5,500 + 25% on excess of 40,000'),
(2026, 'WithholdingTax', 80000, 200000, NULL, NULL, 15500, 30, 'BIR 2026 Monthly - 15,500 + 30% on excess of 80,000'),
(2026, 'WithholdingTax', 200000, 800000, NULL, NULL, 51500, 32, 'BIR 2026 Monthly - 51,500 + 32% on excess of 200,000'),
(2026, 'WithholdingTax', 800000, 999999999, NULL, NULL, 243500, 35, 'BIR 2026 Monthly - 243,500 + 35% on excess of 800,000');
GO

-- ============================================
-- De Minimis Benefits 2026 (Non-Taxable)
-- ============================================
INSERT INTO dbo.GovContributionTables (EffectiveYear, TableType, BracketMin, BracketMax, EmployeeShare, EmployerShare, FixedAmount, RatePercent, Description)
VALUES
(2026, 'DeMinimis', 0, 0, NULL, NULL, 2000, NULL, 'Rice subsidy - up to 2,000/month'),
(2026, 'DeMinimis', 0, 0, NULL, NULL, 1000, NULL, 'Medical cash allowance - up to 1,000/month'),
(2026, 'DeMinimis', 0, 0, NULL, NULL, 1000, NULL, 'Uniform allowance - up to 1,000/month (or actual uniform cost)'),
(2026, 'DeMinimis', 0, 0, NULL, NULL, 5000, NULL, 'Employee achievement award - up to 5,000/year'),
(2026, 'DeMinimis', 0, 0, NULL, NULL, 2000, NULL, 'Gift given during Christmas and other celebration - up to 2,000/year');
GO

PRINT 'Migration 006 completed successfully - 2025 and 2026 contribution tables seeded';
GO
