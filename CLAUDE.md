# HRIS Philippines - Project Memory

## How to Start

```bash
# Kill existing node processes first
powershell -Command "Stop-Process -Name node -Force -ErrorAction SilentlyContinue"

# Backend (port 3002)
cd D:\hris && npx ts-node src/index.ts

# Frontend (port 3000, proxies /api to backend:3002)
cd D:\hris\frontend && npx vite --port 3000 --host
```

## Test Accounts

| Role | Email | Password | Company Code |
|------|-------|----------|-------------|
| Super Admin | admin@system.com | Admin123! | SYSTEM |
| Tenant Admin | tenantadmin@system.com | Admin123! | SYSTEM |
| HR Admin | hradmin@system.com | Admin123! | SYSTEM |
| Employee | employee@system.com | Admin123! | SYSTEM |

Password has `!` at the end - `Admin123!` not `Admin123`.

## Architecture

- **Backend:** Express + TypeScript + mssql (SQL Server on port 1433)
- **Frontend:** React + TypeScript + Vite + Tailwind CSS
- **Database:** HRIS on localhost:1433, user: sa, password: P@ssw0rd
- **Auth:** JWT (15min access, 7d refresh) with bcrypt password hashing
- **RLS:** Row-level security with TenantFilter policy, uses `sp_set_session_context N'TenantId'`
- **Multi-tenant:** All data filtered by TenantId via session context

## Key Config Files

- `.env` - Backend config (PORT=3002, DB on port 1433)
- `frontend/vite.config.ts` - Vite config, proxies /api to localhost:3002
- `src/config/database.ts` - DB connection, parses DATABASE_URL

## Ports

| Service | Port |
|---------|------|
| Backend API | 3002 |
| Frontend (Vite) | 3000 |
| SQL Server | 1433 |

## Database Notes

- Migration 007 is intentionally empty (test accounts created via `scripts/create-test-accounts.ts` and `scripts/seed-admin.ts`)
- Migration 008 creates onboarding/offboarding tables
- Migration 009 seeds onboarding/offboarding templates (SYSTEM tenant)
- Password hashes must be regenerated if recreated - use `bcrypt.hash('Admin123!', 10)`
- All INSERT/UPDATE on tenant-scoped tables require RLS session context set first
- **CRITICAL:** Auth /me and /refresh endpoints must set `sp_set_session_context` for RLS-protected queries
- **CRITICAL:** RolePermissions had NULL TenantId/IsDeleted breaking RLS — fixed with UPDATE to set proper values

## Fixing Broken Passwords

If login fails with 500, run:
```bash
cd D:\hris && npx ts-node scripts/fix-test-passwords.ts
```
or
```bash
cd D:\hris && npx ts-node scripts/seed-admin.ts
```

## PDF Generation System

### Services (`src/services/pdf/`)
| File | Purpose |
|------|---------|
| `pdfUtils.ts` | Shared: createDoc, drawHeader, drawFooter, drawTable, drawLine, drawKeyValue, addPageNumbers, phCurrency |
| `payslipPdf.ts` | Individual payslip PDF with earnings/deductions |
| `dtrPdf.ts` | Daily Time Record PDF (landscape, monthly grid) |
| `payrollSummaryPdf.ts` | Salary Register PDF (landscape, all employees) |
| `thirteenthMonthPdf.ts` | 13th month pay report |
| `governmentReportPdf.ts` | All 7 gov reports: SSS R-3, SSS R-5, PhilHealth RF-1, Pag-IBIG M1-A, Pag-IBIG M2, BIR Alphalist, BIR 1601-C |
| `index.ts` | Barrel export |

### PDF API Endpoints
| Endpoint | Description |
|----------|-------------|
| `GET /payroll/payslips/:id/pdf` | Individual payslip |
| `GET /payroll/summary/:runId/pdf` | Payroll summary |
| `GET /payroll/thirteenth-month/:year/pdf` | 13th month pay |
| `GET /payroll/government-reports/:reportType/pdf?periodCovered=...` | Government reports (7 types) |
| `GET /attendance/dtr/pdf?month=...&year=...` | DTR PDF (must be before /dtr/:id) |

### Frontend PDF Download Buttons
- `Payroll.tsx`: PayslipDetail, PayrollRunDetail, ThirteenthMonthPay, GovernmentReports all have Download PDF buttons
- `Attendance.tsx`: DTR table header has Download PDF button
- Uses shared `downloadPdf()` helper that fetches blob via axios and triggers download

### Route Ordering Notes
- `GET /dtr/pdf` MUST be defined before `GET /dtr/:id` or the `:id` param catches "pdf"
- Payroll period create is `POST /period` (singular), not `/periods`

## Recent Changes (This Session)

1. **Fixed Auth RLS Bug:** `/auth/me` and `/auth/refresh` now call `sp_set_session_context` before querying RLS-protected tables
2. **Added Tenant ID to Refresh Token:** Refresh token now includes `tenant_id` claim
3. **Added Offboarding Frontend:** New pages for offboarding templates, list, and detail views
4. **Fixed Route Ordering:** Onboarding routes restructured to prevent `/:id` from catching `/offboarding`
5. **Fixed Migration Numbering:** Renamed `008_seed_onboarding_templates.sql` to `009` to avoid duplicate key error
6. **Database Seeding:** Created Dept, Position, Employee, User, Roles, RolePermissions, UserRoles for SYSTEM tenant
7. **Fixed RLS on RolePermissions:** Updated NULL TenantId/IsDeleted values that blocked all permission queries
8. **PDF Generation System:** Built complete PDF pipeline — 7 PDF services, 10 API endpoints, frontend download buttons on all payroll/DTR pages
9. **Added DTR PDF Endpoint:** `GET /attendance/dtr/pdf` with route ordering fix (before /dtr/:id)
10. **Payroll Test Data:** Seeded payroll period, run, payslip with line items for EMP-001
11. **OWASP Security Audit:** Full Top 10 audit — found rate limits disabled, no lockout, no password policy, hardcoded JWT fallback
12. **Fixed Rate Limits:** Production values — 200/min tenant, 100/min user, 10/15min auth
13. **Added Failed Login Lockout:** 5 attempts in 15 min → 15 min lockout (in-memory per IP)
14. **Added Password Policy:** Min 8 chars, uppercase, lowercase, number, special char required
15. **Removed Hardcoded JWT Fallback:** Now throws if JWT_SECRET env var not set
16. **Removed DB Password Fallback:** database.ts no longer defaults to P@ssw0rd

## Key Files

- `src/index.ts` - Main server, mounts all routes
- `src/api/auth/routes.ts` - Login, logout, refresh, /me (FIXED: session context for RLS)
- `src/api/admin/routes.ts` - Admin CRUD (tenants, users, roles, contribution tables)
- `src/api/employees/routes.ts` - Departments, positions, employees CRUD
- `src/api/attendance/routes.ts` - Attendance, DTR, shifts, schedules, DTR PDF endpoint
- `src/api/leave/routes.ts` - Leave types, requests, credits, calendar
- `src/api/payroll/routes.ts` - Payroll periods, runs, payslips, all PDF endpoints
- `src/api/hr-matrix/routes.ts` - Org chart, headcount, competency, performance, attrition, dashboard
- `src/api/onboarding/routes.ts` - Onboarding/offboarding templates and workflows
- `src/middleware/connection.ts` - DB pool, attaches `req.pool`
- `src/middleware/auth.ts` - JWT verification
- `src/middleware/permissions.ts` - Permission checking (Super Admin wildcard bypass)
- `src/middleware/tenantContext.ts` - Sets sp_set_session_context for RLS
- `src/middleware/rateLimit.ts` - Rate limiting (production values: 200/100/10 per 15min)
- `src/services/payrollEngine.ts` - Payroll computation, reads rates from GovContributionTables
- `src/services/pdf/` - PDF generation (pdfUtils, payslipPdf, dtrPdf, payrollSummaryPdf, thirteenthMonthPdf, governmentReportPdf)
- `src/utils/validation.ts` - Password policy, email validation, string sanitization
- `frontend/src/pages/Dashboard.tsx` - Dashboard with charts (recharts)
- `frontend/src/pages/Onboarding.tsx` - Onboarding/offboarding modules
- `frontend/src/pages/OrgStructure.tsx` - Departments + Positions (FIXED: independent API calls)
- `frontend/src/pages/Admin.tsx` - All admin pages (tenants, users, roles, contribution tables)
- `frontend/src/pages/Employees.tsx` - Employee CRUD
- `frontend/src/pages/Attendance.tsx` - Attendance management + DTR PDF download
- `frontend/src/pages/Leave.tsx` - Leave management
- `frontend/src/pages/Payroll.tsx` - Payroll management + all PDF downloads
- `frontend/src/contexts/AuthContext.tsx` - Auth state, login with tenantCode
- `frontend/src/components/Layout.tsx` - Sidebar navigation with admin section
- `frontend/src/lib/api.ts` - Axios instance with token interceptor and refresh logic
