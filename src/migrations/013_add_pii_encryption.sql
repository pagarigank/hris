-- Migration 013: Add PII encryption support for sensitive employee fields
-- Version: 013
-- Date: 2026-08-18
-- Description: 
--   Adds encrypted columns for PII fields per RA 10173 (Data Privacy Act) compliance.
--   Uses application-level AES-256-GCM encryption (see src/utils/encryption.ts).
--   Encrypted values are stored as NVARCHAR(500) to accommodate base64-encoded ciphertext.
--   Original plaintext columns are retained temporarily for backward compatibility 
--   and should be dropped after verifying the encryption migration.
--
-- IMPORTANT: Run the encryption migration script (scripts/encrypt-pii.ts) after this 
-- migration to encrypt existing plaintext data in the new columns.

-- Add encrypted column variants for PII fields
-- These store the AES-256-GCM encrypted values
IF NOT EXISTS (SELECT * FROM sys.columns WHERE name = 'TIN_Encrypted' AND object_id = OBJECT_ID('dbo.Employees'))
BEGIN
    ALTER TABLE dbo.Employees ADD TIN_Encrypted NVARCHAR(500) NULL;
    ALTER TABLE dbo.Employees ADD SssNo_Encrypted NVARCHAR(500) NULL;
    ALTER TABLE dbo.Employees ADD PhilHealthNo_Encrypted NVARCHAR(500) NULL;
    ALTER TABLE dbo.Employees ADD PagIbigNo_Encrypted NVARCHAR(500) NULL;
    ALTER TABLE dbo.Employees ADD PhilSysNo_Encrypted NVARCHAR(500) NULL;
    PRINT 'Added encrypted PII columns to Employees table';
END
ELSE
BEGIN
    PRINT 'Encrypted PII columns already exist, skipping';
END
GO

-- Create index on encrypted columns for searchability (deterministic encryption would allow this)
-- For now, these are for storage only; queries use application-level decrypt
PRINT 'Migration 013 completed successfully - PII encryption columns added';
GO
