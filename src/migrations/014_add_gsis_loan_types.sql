-- Migration 014: Add GSIS loan type support and CHECK constraint on LoanType
-- Version: 014
-- Date: 2026-08-18
-- Description:
--   Expands EmployeeLoans.LoanType to NVARCHAR(30) for GSIS loan type names.
--   Adds CHECK constraint to enforce valid loan types per spec Section 3.5.
--   Spec loan types: SSS, PagIbig, GSIS_Conso, GSIS_Policy, GSIS_Enhanced,
--                     GSIS_Emergency, CompanyLoan, Other

-- Expand column width if needed
IF EXISTS (SELECT * FROM sys.columns WHERE name = 'LoanType' AND object_id = OBJECT_ID('dbo.EmployeeLoans')
           AND max_length < 60) -- 30 NVARCHAR = 60 bytes
BEGIN
    ALTER TABLE dbo.EmployeeLoans ALTER COLUMN LoanType NVARCHAR(30) NOT NULL;
    PRINT 'Expanded EmployeeLoans.LoanType to NVARCHAR(30)';
END
GO

-- Add CHECK constraint for valid loan types (skip if exists)
IF NOT EXISTS (SELECT * FROM sys.check_constraints WHERE name = 'CK_EmployeeLoans_LoanType')
BEGIN
    ALTER TABLE dbo.EmployeeLoans
    ADD CONSTRAINT CK_EmployeeLoans_LoanType
    CHECK (LoanType IN (
        'SSS',              -- SSS salary loan
        'PagIbig',          -- Pag-IBIG multipurpose loan
        'GSIS_Conso',       -- GSIS Consolidated Loan
        'GSIS_Policy',      -- GSIS Policy Loan
        'GSIS_Enhanced',    -- GSIS Enhanced Salary Loan
        'GSIS_Emergency',   -- GSIS Emergency Loan
        'CompanyLoan',      -- Company-provided loan
        'Other'             -- Any other loan type
    ));
    PRINT 'Added CHECK constraint CK_EmployeeLoans_LoanType';
END
ELSE
BEGIN
    PRINT 'CHECK constraint CK_EmployeeLoans_LoanType already exists';
END
GO

PRINT 'Migration 014 completed successfully - GSIS loan types added';
GO
