# HRIS Project — Session Notes

## Project Overview
- **Location:** `D:\hris`
- **Backend:** Express + TypeScript + MSSQL (port 3002)
- **Frontend:** React + Vite + Tailwind CSS (port 3000)
- **Database:** SQL Server on port **1433** (sa/P@ssw0rd), database name: **HRIS**
- **Admin credentials:** `admin@system.com` / `Admin123!` / Company Code: `SYSTEM`

---

## Session: August 18, 2026

### Completed Work

#### 1. Comprehensive Spec Compliance Audit
- Studied `HRIS_BUILD_SPEC_v2.md` in full and compared against the entire codebase
- Assessed all 10 spec sections (Multi-Tenancy, Schema, Payroll, Attendance, Leave, HR Matrix, API, Roles, Build Phases)
- Found **~75-80% of spec already implemented** — solid foundation across all modules

#### 2. PII Encryption at Rest (AES-256-GCM)
- **Created:** `src/utils/encryption.ts` — full AES-256-GCM encryption utility
  - Random IV per encryption call (never reuse IVs)
  - IV + AuthTag + Ciphertext packed into base64
  - Backward-compatible decrypt (returns unencrypted values as-is)
  - Helper functions: `encryptPiiFields()`, `decryptPiiRows()`, `maskPii()`
- **Created:** `src/migrations/013_add_pii_encryption.sql` — adds encrypted columns
- **Applied to employee routes:** Encrypt on CREATE/UPDATE, decrypt on GET
- **Rationale:** Philippine Data Privacy Act (RA 10173) Section 20 requires "reasonable and appropriate technical measures" for sensitive personal information (SSS/TIN/PhilHealth/Pag-IBIG numbers)
- **Key decision:** Application-level encryption instead of MSSQL Always Encrypted due to Node.js driver compatibility issues

#### 3. Payroll Run State Machine Enforcement
- **Created:** `src/middleware/payrollLock.ts`
  - `blockIfPayrollLocked` middleware — blocks clock-in/out, break, and DTR computation when current date falls within a locked payroll period
  - `isDateRangePayrollLocked()` — service-level function for checking date ranges
  - `isValidPayrollTransition()` — validates status transitions: Open → Processing → Approved → Paid → Closed (with reversal to Open allowed)
- **Applied to attendance routes:** clock-in, clock-out, break-out, break-in, compute-dtr
- **Spec compliance:** Section 4.10 — "Locking behavior prevents attendance edits on a period once its PayrollRun.Status is Processing or later"

#### 4. Comprehensive PayrollEngine Unit Tests (43 tests)
- **Rewrote:** `src/tests/payrollEngine.test.ts` with full test suite
- **3 employee profiles tested:**
  - ₱15,000/month minimum wage earner
  - ₱50,000/month mid-level (with OT, late, holidays)
  - ₱100,000/month high earner (above SSS/PhilHealth ceiling)
- **Test coverage:**
  - Daily/hourly rate computations
  - OT, night diff, holiday, rest day premiums
  - SSS, PhilHealth, Pag-IBIG, GSIS, withholding tax lookups
  - PERA contribution (enrolled and unenrolled)
  - Loan deductions, 13th month pay
  - Payslip line items generation
  - Rounding verification (no drift > ₱0.01)
  - Full payslip equation: GrossPay − TotalDeductions = NetPay
- **Result:** All 43 tests pass ✅

#### 5. RLS Tenant Isolation Integration Test
- **Created:** `src/tests/rlsIsolation.test.ts` — 5 tests, all passing ✅
  - Tests cross-tenant isolation (Tenant A cannot see Tenant B data)
  - Tests SESSION_CONTEXT requirement (no context = no data)
  - Tests RLS block predicate (INSERT with wrong TenantId rejected)
  - Tests correct session context allows INSERT
  - Tests cross-tenant department partitioning
- **Key finding:** mssql Node.js driver acquires and releases connections per Request object. Session context is connection-scoped. Solution: use a **single persistent Request** (`pool.request()`) for the entire test suite, which binds to ONE connection for all queries.
  - Reference: https://github.com/tediousjs/node-mssql/issues/1483
  - Each `pool.request()` creates a new Request that gets a fresh connection
  - Session context set in one Request's query persists to the next query on the same Request
  - Parameter names must be unique per Request (use DECLARE in SQL, not `.input()` re-declaration)
- **Requires running MSSQL instance; skipped if `SKIP_DB_TESTS=1`**

#### 6. Documentation
- **Created:** `CHANGELOG.md` — versioned changelog per spec Section 10
- **Created:** `docs/ASSUMPTIONS.md` — 10 documented assumptions with rationale
  - PII encryption approach (A-001)
  - Working days factor (A-002)
  - Tax bracket application (A-003)
  - PERA contribution limits (A-004)
  - Leave approval chain fallback (A-005)
  - DTR nightly job schedule (A-006)
  - GSIS salary basis (A-007)
  - Multi-tenancy default mode (A-008)
  - Currency and timezone (A-009)
  - Soft delete pattern (A-010)

#### 7. GSIS Loan Type Handling in Application Layer
- **Migration:** `src/migrations/014_add_gsis_loan_types.sql` — CHECK constraint on `EmployeeLoans.LoanType`
  - Valid types: SSS, PagIbig, GSIS_Conso, GSIS_Policy, GSIS_Enhanced, GSIS_Emergency, CompanyLoan, Other
  - Column expanded to `NVARCHAR(30)` to accommodate longest type name
- **Payroll Engine:** `LoanBreakdownItem[]` tracks per-loan-type deductions
  - `computeLoanDeductions()` aggregates same-type loans, returns `breakdown[]`
  - `LOAN_TYPE_LABELS` — human-readable names for payslip display
  - `LOAN_TYPE_CODES` — deduction codes for line items (LOAN_SSS, LOAN_GSIS_CONSO, etc.)
  - `generatePayslipLineItems()` emits individual line items per loan type
  - `generateGovernmentReport()` supports `GSIS_Loans` report type
- **API validation:** POST `/api/v1/payroll/loans` validates loanType against spec enum
- **Tests:** 3 new GSIS-specific tests (per-type breakdown, aggregation, fully-paid)
  - Total: 46 PayrollEngine tests passing

### Typecheck Status
- ✅ `npx tsc --noEmit` passes cleanly after all changes
- ✅ `npx jest` — 46 PayrollEngine tests pass (51 total including 5 skipped DB tests)

---

## Spec Compliance Summary (Post-Session)

| Section | Status | Notes |
|---------|--------|-------|
| §2 Multi-Tenancy | ✅ Complete | RLS + session context + defense-in-depth |
| §3 Database Schema | ✅ Complete | All tables, migrations, seeds, GSIS, PERA |
| §4 Payroll Engine | ✅ Complete | All formulas, SSS/GSIS/PhilHealth/PagIBIG/PERA, GSIS loan breakdown, 46 unit tests |
| §5 Attendance | ✅ Complete | Clock-in/out, geofence, DTR, biometric, payroll lock |
| §6 Leave | ✅ Complete | Types, credits, accrual, approval chain, calendar, year-end, LWOP |
| §7 HR Matrix | ✅ Complete | Org chart, headcount, competency, performance, attrition |
| §8 API Design | ✅ Complete | REST/JSON, JWT, pagination, Swagger, rate limiting, pre-signed file URLs, push notifications (FCM HTTP v1) |
| §9 Roles & Permissions | ✅ Complete | 6 roles, permission catalog, middleware enforcement |
| §10 Build & Docs | ✅ Complete | CHANGELOG.md, ASSUMPTIONS.md, migration system |
| Security: PII Encryption | ✅ Complete | AES-256-GCM on employee sensitive fields |

### Remaining Open Items

1. **GSIS loan types** — ✅ DONE: CHECK constraint added (migration 014), API validation added to payroll routes
2. **Push notification delivery** — ✅ DONE: FCM HTTP v1 API integrated, DB-backed device tokens, triggers on leave approval, payslip release, DTR exceptions
3. **Pre-signed upload URLs** — ✅ DONE: HMAC-signed URLs for file upload/download per spec §8.7
4. **E2E testing** — Playwright config exists but comprehensive E2E tests not yet written

#### 8. Frontend Completeness Verification

#### 8. Frontend Completeness Verification
- Verified all 10 pages (9,462 lines total) against spec requirements
- **Gaps found and fixed:**
  - **Role-based navigation filtering** — Layout.tsx now filters sidebar for ESS (Employee Self-Service) users
  - **RoleGate component** — New `RoleGate.tsx` for page-level role/permission access control
  - **Admin page protection** — Admin routes wrapped in RoleGate (requires Super Admin or Tenant Admin role)
  - **PWA manifest** — Already linked in index.html, verified `manifest.json` exists in `public/`
  - **Service worker** — Already registered in main.tsx, verified `sw.js` exists in `public/`

**Frontend inventory:**
| Page | Lines | Routes | Spec Section |
|------|-------|--------|-------------|
| Login | 238 | `/login` | §8 Auth |
| Dashboard | 205 | `/` | Overview |
| Employees | 865 | `/employees/*` | §3 Employee Master |
| Attendance | 1,735 | 7 sub-routes | §5 Attendance |
| Leave | 1,222 | 7 sub-routes | §6 Leave |
| Payroll | 1,457 | 10 sub-routes | §4 Payroll |
| Org Structure | 406 | 2 sub-routes | §7 HR Matrix |
| HrMatrix | 586 | 6 tabs | §7 HR Matrix |
| Onboarding | 1,105 | 6 sub-routes | §9 |
| Admin | 1,327 | 10 sub-routes | §8/§9 Admin |

---

## Session: July 27, 2026

### Completed Work

#### 1. Zod Input Validation on Routes
- Created `src/middleware/validate.ts` — Zod validation middleware
- Created `src/utils/schemas.ts` — Validation schemas for auth, admin, and contribution endpoints
- Applied to `src/api/auth/routes.ts` and `src/api/admin/routes.ts`

#### 2. npm Audit Fixes
- Ran `npm audit fix` — removed unused `uuid` + `@types/uuid`
- Remaining 23 vulnerabilities are in dev dependencies (jest/ts-jest chain)

#### 3. JWT → httpOnly Cookie Migration (Security Fix)
**Backend:**
- Installed `cookie-parser` + `@types/cookie-parser`
- Login sets `accessToken` + `refreshToken` as httpOnly, SameSite=Strict cookies
- `/auth/me` reads token from cookie (falls back to Authorization header)
- `/auth/refresh` reads token from cookie (falls back to body)
- `/auth/logout` clears cookies

**Frontend:**
- Removed all `localStorage.setItem/getItem/removeItem` for tokens
- Added `withCredentials: true` to axios

**Cookie Security:**
| Cookie | HttpOnly | SameSite | Path | MaxAge |
|--------|----------|----------|------|--------|
| accessToken | Yes | Strict | / | 15m |
| refreshToken | Yes | Strict | /api/v1/auth/refresh | 7d |

#### 4. Structured Logging (winston)
- Created `src/utils/logger.ts` — JSON in production, colorized in development
- Replaced `console.error`/`console.log` in auth, admin routes, and index.ts

#### 5. Login Page Redesign
- Professional split-screen layout with gradient left panel and clean white form right panel

#### 6. Sidebar Colors
- Updated `frontend/src/components/Layout.tsx` with color-coded sidebar for each menu section

#### 7. GSIS (Government Service Insurance System) Support — COMPLETE

**Migration 011** (`src/migrations/011_add_gsis_support.sql`):
- Added `IsGovernment BIT` and `GsisEmployerNo NVARCHAR(20)` to `Tenants`
- Added `GsisEmployeeShare`, `GsisEmployerShare`, `GsisECShare` to `Payslips`
- Seeded GSIS contribution tables for 2025-2026

**Backend API** (`src/api/admin/routes.ts`):
- Tenant CRUD fully supports GSIS fields (create, get list, get detail, update)

**Payroll Engine** (`src/services/payrollEngine.ts`):
- Added `lookupGSIS()` function (9% EE + 9% ER premium, 2% EC employer-only)
- `computePayslip()` branches between SSS (private) and GSIS (government) based on `isGovernment` flag
- `computePayrollForAllEmployees()` fetches tenant's `IsGovernment` flag
- `generatePayslipLineItems()` emits `GSIS_EE` deduction line
- `generateGovernmentReport()` supports `GSIS_Premium` report type

**Payslip PDF** (`src/services/pdf/payslipPdf.ts`):
- GSIS fields in PayslipData interface
- GSIS employee deduction in deductions section
- Dynamic employer contributions reference including GSIS

**Frontend** (`frontend/src/pages/Admin.tsx`):
- Tenant interface: `IsGovernment`, `GsisEmployerNo` fields
- Tenant create form: Government checkbox + GSIS employer number field
- Tenant detail view: Shows employer type and GSIS/SSS number
- Contribution table filters: `GSIS` and `GSIS_EC` types with color-coded badges

**Spec Document** (`HRIS_BUILD_SPEC_v2.md`):
- Updated Sections 1.1, 1.2, 3.1, 3.5, 4.4a, 4.7, 11

---

## GSIS Concept (Quick Reference)

**GSIS** is the Philippine government insurance for **public sector/government employees**. It replaces SSS for government workers.

| Aspect | SSS (Private) | GSIS (Government) |
|--------|---------------|-------------------|
| Employee share | Varies by bracket (0.45-4.5%) | 9% of monthly salary |
| Employer share | Varies by bracket (6.5-9.5%) | 9% of monthly salary |
| EC (Employee Compensation) | Included in SSS | Additional 2% employer-only |
| MPF (Modified Pag-IBIG Fund) | Optional above threshold | Not applicable |
| Applicability | Private sector employees | Government/public sector employees |

**Implementation:**
- `Tenants.IsGovernment = 0` → Use SSS (private company)
- `Tenants.IsGovernment = 1` → Use GSIS (government company)
- SSS is optional for government employees
- PhilHealth and Pag-IBIG apply to both sectors

---

## Open Items / Future Work

1. **GSIS loan types** — GSIS_Conso, GSIS_Policy, GSIS_Enhanced, GSIS_Emergency are in the spec but application-layer handling not yet implemented
2. **EmployeeLoans LoanType enum** — Spec updated but actual DB migration may need to add GSIS loan types
3. **RLS is very strict** — Always set session context before queries when testing via sqlcmd
4. **Database:** SQL Server port 1433 (not 1434), database name HRIS (not HRIS_Philippines)
5. **ENCRYPTION_KEY env var** — Must be set for PII encryption to work. Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`

---

## Session: October 23, 2026

### Completed Work: KPIs, Promotion Engine, & Talent Sight Dashboards

#### 1. Schema & Migration 016 (`016_add_kpis_and_promotions.sql`)
- **Created tables with RLS policies**:
  - `dbo.KpiDefinitions` — Catalog / template of reusable goals (Title, Description, Category, MetricType, TargetValue, DefaultWeightPercent, Unit, DepartmentId, PositionId).
  - `dbo.EmployeeKpis` — Employee-assigned goals and tracking (Target vs Actual, AchievementScorePercent, WeightPercent, ReviewPeriod, ManagerComment).
  - `dbo.PromotionCriteria` — Configurable tenant parameters (MinKpiScorePercent, MinPerformanceRating, MinTenureMonths, RequireCleanDisciplinary, MinCompetencyScore, RecommendedSalaryIncreasePercent).
  - `dbo.PromotionRequests` — Pipeline nomination and approval table (CurrentPositionId, ProposedPositionId, CurrentBasicSalary, ProposedBasicSalary, Justification, Status, EffectiveDate).
- **Security & Multi-Tenancy**: Added RLS filter and block predicates (`security.fn_TenantAccessPredicate`) for all 4 new tables.
- **Default Seed**: Seeded default promotion parameters for all active tenants.

#### 2. KPI & Promotion Calculation Engine (`src/services/kpiService.ts`)
- **`computeKpiAchievement()`**: Calculates achievement percentage per metric type (Percentage, Currency, Numeric, Milestone) with 150% stretch performance cap.
- **`computeWeightedKpiScore()`**: Calculates normalized weighted KPI score across active goals.
- **`calculateTenureMonths()`**: Accurate tenure difference calculation in months.
- **`evaluatePromotionCandidate()`**: Evaluates employees against 5 dimensions (KPI score, performance review, tenure, clean disciplinary records, competency proficiency) to generate:
  - Readiness score (0–100%)
  - Eligibility status (`Due for Promotion`, `High Potential`, `Developing`, `Disqualified`)
  - Recommended next position in department career ladder
  - Projected salary bump and percentage increment (+10% or position salary grade minimum)
- **Unit Tests**: 11 new unit tests in `src/tests/kpiService.test.ts` (all 11 pass ✅, 57 total passing unit tests).

#### 3. Backend API Endpoints
- **KPI Routes (`src/api/kpis/routes.ts`)**:
  - `GET /api/v1/kpis/definitions` — List catalog definitions
  - `POST /api/v1/kpis/definitions` — Create definition
  - `PUT /api/v1/kpis/definitions/:id` — Update definition
  - `DELETE /api/v1/kpis/definitions/:id` — Delete definition
  - `GET /api/v1/kpis/employee` — List employee goals
  - `POST /api/v1/kpis/employee` — Assign goal to employee
  - `PUT /api/v1/kpis/employee/:id` — Check-in progress and update actual value
  - `DELETE /api/v1/kpis/employee/:id` — Remove employee goal
  - `GET /api/v1/kpis/summary/:employeeId` — Overall weighted KPI summary
- **Promotion Routes (`src/api/promotions/routes.ts`)**:
  - `GET /api/v1/promotions/criteria` — Read criteria parameters
  - `PUT /api/v1/promotions/criteria` — Update criteria parameters
  - `GET /api/v1/promotions/due` — Evaluates all active employees and returns candidates classified by readiness
  - `GET /api/v1/promotions/requests` — List promotion requests pipeline
  - `POST /api/v1/promotions/requests` — Submit promotion nomination
  - `PUT /api/v1/promotions/requests/:id/action` — Approve/Endorse/Reject promotion. When approved, updates `Employees.PositionId`, `Employees.BasicSalary`, and records `EmployeeEmploymentHistory` (`ChangeType = 'Promotion'`).
  - `GET /api/v1/promotions/dashboard` — Executive metrics summary

#### 4. Frontend Dashboards & Talent Cockpit
- **`DueForPromotionTab.tsx`**:
  - Real-time candidate evaluation table with KPI scores, tenure, ratings, disciplinary flags, and readiness bars.
  - One-click "Nominate for Promotion" modal with suggested salary calculations.
  - Active nominations pipeline view with inline "Approve & Sync Salary" actions.
- **`KpiManagementTab.tsx`**:
  - Objective tracking list with visual progress bars, weight distribution, and achievement scores.
  - "Assign KPI" modal and "Check-in / Update Actuals" drawer.
- **`TalentSight9BoxTab.tsx`**:
  - Interactive 3x3 Performance vs. Potential grid with employee chips and talent dossier inspector.
- **`PromotionParametersTab.tsx`**:
  - Full CRUD for promotion eligibility parameters and standard KPI template catalog.
- **`Dashboard.tsx` Integration**:
  - Added executive "Talent Radar: Employees Due for Promotion" alert banner linking to the promotions cockpit.
- **Navigation (`Layout.tsx`)**:
  - Added color-coded submenus under HR Analytics for quick direct access.
