# Assumptions Log

This document records assumptions made during the build of the Philippine HRIS.
Per spec Section 0.5: "If a requirement is ambiguous, prefer the interpretation that is:
(a) safer for tenant data isolation, (b) compliant with Philippine labor law, (c) simplest to extend later."

---

## A-001: PII Encryption Approach
**Date:** 2026-08-18
**Section:** 1.2 (Security - Encryption at rest)
**Assumption:** Application-level AES-256-GCM encryption is used instead of MSSQL Always Encrypted.
**Rationale:** MSSQL Always Encrypted has known compatibility issues with the Node.js `mssql` driver (requires `Column Encryption Setting=Enabled` in connection string and a Column Master Key Store Provider). Application-level encryption provides equivalent security without driver complexity. The encryption key is stored in an environment variable (`ENCRYPTION_KEY`), not in the database.
**Impact:** PII fields are encrypted before INSERT/UPDATE and decrypted after SELECT. Encrypted values are stored as base64-encoded binary in `NVARCHAR(500)` columns.

---

## A-002: Working Days Factor
**Date:** 2026-07-01
**Section:** 4.1 (Daily Rate)
**Assumption:** Default working days per year = 261 (the most common Philippine standard). This is configurable per tenant via environment variable `WORKING_DAYS_PER_YEAR`. Common alternatives: 261, 313, 314.
**Rationale:** The spec lists 261 as the common standard but notes alternatives exist. Making it configurable allows each tenant to use their own factor.

---

## A-003: Tax Bracket Application
**Date:** 2026-07-01
**Section:** 4.7 (Withholding Tax)
**Assumption:** Monthly withholding tax brackets from the TRAIN Law (2018) are used. These have not been changed by subsequent legislation as of the build date. The system uses the per-payroll-period bracket method (not annualized), which is the standard for monthly-paid employees.
**Rationale:** The TRAIN law brackets are the current standard. Semi-monthly and weekly employees may use different bracket tables — this can be added as a data variant in `GovContributionTables` with different `Description` tags.

---

## A-004: PERA Contribution Limits
**Date:** 2026-08-18
**Section:** 4.11 (PERA)
**Assumption:** Maximum annual PERA contribution = ₱200,000 for local employees, ₱400,000 for OFW. These limits may be adjusted by the Secretary of Finance.
**Rationale:** Current limits as of RA 12214. The system stores these in `GovContributionTables` so updates don't require code changes.

---

## A-005: Leave Approval Chain Fallback
**Date:** 2026-07-01
**Section:** 6 (Leave Monitoring)
**Assumption:** If no explicit approval chain is configured via `LeaveApprovalChains`, the system falls back to the employee's `ImmediateSupervisorId` hierarchy, walking up the chain for a maximum of 10 levels.
**Rationale:** Not all tenants will configure approval chains immediately. The supervisor hierarchy provides a reasonable default.

---

## A-006: DTR Nightly Job Schedule
**Date:** 2026-07-01
**Section:** 5 (Attendance)
**Assumption:** The DTR computation job runs at 1:00 AM Philippine time (5:00 PM UTC) daily. It computes DTR for the previous day. The job is per-tenant and idempotent (MERGE-based upsert).
**Rationale:** Running after midnight ensures all attendance logs for the day are synced (including offline-captured logs from employees who clocked out late).

---

## A-007: GSIS Salary Basis
**Date:** 2026-07-27
**Section:** 4.4a (GSIS)
**Assumption:** GSIS contribution basis salary range: ₱5,000 minimum, ₱25,000 maximum. Rates: 9% EE + 9% ER premium, 2% ER-only EC.
**Rationale:** Based on standard GSIS contribution tables for government employees. SSS is optional for government employees (not applied unless employee has existing SSS coverage).

---

## A-008: Multi-Tenancy Default
**Date:** 2026-07-01
**Section:** 2 (Multi-Tenancy)
**Assumption:** Default deployment mode is Shared Database + Shared Schema with RLS. Database-per-Tenant mode is documented but not implemented unless explicitly requested.
**Rationale:** The spec states shared-schema is the default and most cost-effective for scale. RLS provides strict enforcement.

---

## A-009: Currency and Timezone
**Date:** 2026-07-01
**Section:** 1.2 (Non-Functional)
**Assumption:** All monetary values stored as `DECIMAL(18,4)`. All dates/times stored in UTC. Presentation layer converts to `Asia/Manila` (UTC+8). Currency is PHP throughout.
**Rationale:** Spec requirements for localization and data consistency.

---

## A-010: Soft Delete Pattern
**Date:** 2026-07-01
**Section:** 3 (Schema)
**Assumption:** Every table uses `IsDeleted BIT DEFAULT 0` for soft deletes. Hard deletes are never performed by the application. Audit logs are append-only.
**Rationale:** Provides data recovery capability and audit trail integrity per spec Section 1.2.

---

## A-011: Push Notification Implementation
**Date:** 2026-08-19
**Section:** 8.8 (Push Notification Hooks)
**Assumption:** FCM HTTP v1 API is used for Android/web push notifications. iOS APNs will require a separate APNs HTTP/2 integration or Firebase Cloud Messaging relay. Device tokens are stored in the DeviceRegistry table (not in-memory) for persistence across server restarts.
**Rationale:** FCM HTTP v1 is the current recommended approach for Google's push notification service. Using service account OAuth2 for authentication avoids the deprecated legacy server key approach. DB-backed tokens ensure reliability in multi-instance deployments.
**Required Environment Variables:**
- `FCM_PROJECT_ID` — Firebase project ID
- `FCM_SERVICE_ACCOUNT_EMAIL` — Service account email from Firebase console
- `FCM_PRIVATE_KEY` — Service account private key (PEM format)

**Graceful Degradation:** When no FCM credentials are configured, notifications are logged to console (development mode). This allows the application to function fully without requiring push notification infrastructure.
