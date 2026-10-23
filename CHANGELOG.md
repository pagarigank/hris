# Changelog

All notable changes to the Philippine HRIS project will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added
- **Push Notifications (FCM HTTP v1)** — Spec §8.8 push notification hooks for leave approval, payslip release, and DTR exception alerts.
  - `src/services/pushNotification.ts` — rewritten with FCM HTTP v1 API, OAuth2 service account auth, DB-backed device tokens from DeviceRegistry
  - `src/migrations/015_add_device_token_column.sql` — adds DeviceToken column to DeviceRegistry
  - Leave approval/rejection → notifies employee with leave type name
  - Payroll run completion → notifies all affected employees
  - DTR nightly job → alerts on absences, excessive lateness (>1hr), missing clock-out
  - Auto-removes invalid FCM tokens (UNREGISTERED errors)
  - Graceful degradation: logs to console when no FCM credentials configured
- **PIE Encryption at Rest** — AES-256-GCM encryption for employee PII fields (TIN, SSS No, PhilHealth No, Pag-IBIG No, PhilSys No) per Philippine Data Privacy Act (RA 10173) compliance.
  - `src/utils/encryption.ts` — encryption/decryption utility with random IV per encryption call
  - `src/migrations/013_add_pii_encryption.sql` — migration to add encrypted columns
  - Applied to employee CREATE and UPDATE routes; PII decrypted on read
- **Payroll Lock Middleware** — Prevents attendance edits when a payroll period is in Processing, Approved, Paid, or Closed status.
  - `src/middleware/payrollLock.ts` — middleware + state machine validation for payroll period transitions
  - Applied to clock-in, clock-out, break-out, break-in, and DTR computation routes
- **Comprehensive PayrollEngine Unit Tests** — 43 tests covering all formulas per spec Section 4 acceptance criteria:
  - 3 employee profiles: minimum wage (₱15K), mid-level (₱50K), high earner (₱100K)
  - SSS, PhilHealth, Pag-IBIG, GSIS, withholding tax lookups
  - Overtime, night diff, holiday, rest day premiums
  - PERA contribution (enrolled and unenrolled)
  - Loan deductions, 13th month pay, payslip line items
  - Rounding verification (no drift > ₱0.01)

### Added (cont.)
- **GSIS Loan Type Handling in Application Layer** — validates loan types against spec enum and provides per-type breakdown.
  - `src/migrations/014_add_gsis_loan_types.sql` — CHECK constraint on EmployeeLoans.LoanType
  - `src/services/payrollEngine.ts` — `computeLoanDeductions()` now returns per-type `LoanBreakdownItem[]`, `LOAN_TYPE_LABELS` and `LOAN_TYPE_CODES` maps
  - `generatePayslipLineItems()` emits individual line items per loan type (LOAN_SSS, LOAN_GSIS_CONSO, LOAN_GSIS_POLICY, etc.)
  - `generateGovernmentReport()` now supports `GSIS_Loans` report type
  - `src/api/payroll/routes.ts` — POST `/loans` validates loanType against spec enum
- **3 new GSIS loan deduction tests** — per-type breakdown, aggregation, and fully-paid scenarios (total: 46 tests passing)

### Changed
- Employee routes now encrypt PII on write and decrypt on read
- `LoanBreakdown` in `PayslipResult` changed from `number` to `LoanBreakdownItem[]` for per-type payslip line items
- **Frontend role-based navigation** — Layout filters sidebar for ESS (Employee Self-Service) users per spec §9
- **Admin page protection** — Admin routes wrapped in RoleGate component (requires Super Admin or Tenant Admin role)

### Added (frontend)
- **`RoleGate` component** (`frontend/src/components/RoleGate.tsx`) — page-level role/permission access control
- ESS sidebar navigation — simplified view for Employee role (Clock In/Out, My DTR, My Leave, My Payslips)

### Security
- PII fields encrypted at rest using AES-256-GCM with random IVs
- Payroll period locking prevents attendance tampering during payroll processing
- Admin pages restricted to authorized roles only

---

## [1.2.0] - 2026-07-27

### Added
- GSIS (Government Service Insurance System) support for government/public employers
  - `IsGovernment` flag on Tenants table
  - GSIS premium (9% EE + 9% ER) and EC (2% ER-only) contribution computation
  - GSIS loan type support in schema
  - Government report exports (GSIS_Premium report type)
  - Frontend tenant admin UI: government checkbox, GSIS employer number
- Zod input validation middleware on auth and admin routes
- JWT to httpOnly cookie migration (SameSite=Strict, 15min access / 7d refresh)
- Structured logging with winston (JSON in production, colorized in dev)
- Login page redesign (split-screen layout)
- Sidebar color-coding per module

### Security
- Tokens stored as httpOnly cookies instead of localStorage
- Failed login attempt tracking with account lockout (5 attempts / 15 min)

---

## [1.1.0] - 2026-07-01

### Added
- Core HR / Employee Master CRUD (employees, departments, positions, dependents, employment history, documents)
- Attendance Monitoring (clock-in/out with GPS + geofence, DTR computation, shift scheduling, biometric webhook)
- Leave Monitoring (leave types, credits, accrual, filing, approval chain, calendar, year-end processing, LWOP)
- Payroll Engine (SSS, PhilHealth, Pag-IBIG, withholding tax, 13th month, loan deductions, payslip generation, government report exports)
- HR Matrix (org chart, headcount, competency, performance, disciplinary, attrition metrics)
- Mobile API layer (REST/JSON, JWT auth, rate limiting, offline sync middleware)
- Admin/Tenant provisioning (tenant CRUD, role/permission management)
- Row-Level Security (RLS) on all tenant-scoped tables
- Migration system with 12 versioned SQL scripts
- Swagger/OpenAPI documentation at `/api/v1/docs`
- Responsive PWA frontend (React + Vite + Tailwind CSS)
- PERA (Personal Equity and Retirement Account) contribution support with employer matching

### Security
- MSSQL Row-Level Security with security policy on all tenant-scoped tables
- Session context binding on every API request (defense-in-depth)
- bcrypt password hashing
- Role-based access control (RBAC) with permission catalog

---

## [1.0.0] - 2026-06-01

### Added
- Initial project scaffolding
- Express + TypeScript backend
- React + Vite + Tailwind CSS frontend
- MSSQL database connection and migration runner
