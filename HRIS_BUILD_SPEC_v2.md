# Philippine HRIS — Autonomous Build Specification

**Document type:** Engineering build spec for autonomous execution by a coding agent ("ECC")
**Target stack:** MSSQL Server backend, REST API, mobile-ready web app (responsive PWA + native-ready API)
**Architecture:** Multi-tenant SaaS with strict data isolation
**Domain:** Philippines-compliant HRIS — Payroll, Attendance, Leave, HR Matrix
 
 mssql server credentials: username:sa, password:P@ssw0rd
---

## 0. How the ECC Should Use This Document

1. Treat each numbered section as a work package. Complete packages in order (0 → 10); later packages depend on earlier ones (schema before API, API before UI).
2. Every package ends with an **Acceptance Criteria** checklist. Do not mark a package done until all criteria pass.
3. Every DB table listed in Section 3 must be created via versioned migration scripts (not ad-hoc scripts). Use a migration tool (e.g., DbUp, Flyway, or EF Core Migrations) — pick one and use it consistently for every table.
4. Do not skip the multi-tenancy isolation rules in Section 2. Every table, every query, every API endpoint must respect tenant boundaries. This is the single most important non-functional requirement in this spec.
5. If a requirement is ambiguous, prefer the interpretation that is: (a) safer for tenant data isolation, (b) compliant with Philippine labor law, (c) simplest to extend later. Log the assumption in `/docs/ASSUMPTIONS.md` and continue — do not stop and wait for clarification unless a legal compliance rule is genuinely unknown.
6. Build order: Database schema → Auth & Tenancy → Core HR (employee master) → Attendance → Leave → Payroll → HR Matrix/Reporting → Mobile API hardening → Admin/Tenant provisioning → Testing/Deployment.
7. All monetary values stored as `DECIMAL(18,4)`. All dates stored as `DATE` or `DATETIME2`. All times/timestamps use UTC in storage; convert to `Asia/Manila` (UTC+8) at the presentation layer only.

---

## 1. System Overview

### 1.1 Modules
- **Tenant & Identity Management** — company onboarding, subscription/plan, users, roles, permissions.
- **Employee Master (Core HR)** — 201 file equivalent, employment history, positions, org structure.
- **Attendance Monitoring** — mobile clock-in/out with GPS + geofence + selfie capture, biometric device integration hooks, shift scheduling, DTR (Daily Time Record) generation.
- **Leave Monitoring** — leave types per Philippine law, leave credits, accrual, filing/approval workflow, leave calendar.
- **Payroll (Philippines-compliant)** — SSS/GSIS, PhilHealth, Pag-IBIG, BIR withholding tax, 13th month pay, holiday pay, overtime, night differential, de minimis benefits, payslip generation, government report exports (alphalist, R-3, R-5, M1, M2, GSIS Premium Remittance), and optional **PERA** (Personal Equity and Retirement Account) contributions with employer-matching support. Supports both private (SSS) and government/public (GSIS) employer types.
- **HR Matrix** — org chart, headcount matrix, skills/competency matrix, performance/disciplinary matrix, turnover & attrition analytics dashboard.
- **Mobile Layer** — REST/JSON API consumed by a responsive PWA and ready for native iOS/Android wrapper (Flutter/React Native) — no server-side rendering dependency.

### 1.2 Non-Functional Requirements
| Requirement | Detail |
|---|---|
| Multi-tenancy | Strict row-level isolation, one shared DB or DB-per-tenant (see Section 2) |
| Mobile-ready | All functional endpoints usable from a small-screen client; stateless JWT auth; offline-tolerant attendance capture with sync queue |
| Compliance | SSS/GSIS contribution tables, PhilHealth split rate (2024 onward), Pag-IBIG, BIR TRAIN law withholding tax tables |
| Audit | Every payroll run, leave approval, and attendance edit must be immutably logged (who, when, before/after) |
| Localization | Currency PHP, timezone Asia/Manila, date format flexible per tenant setting |
| Security | Encryption at rest for PII/SSS/TIN numbers, encryption in transit (TLS), password hashing (bcrypt/argon2), MFA optional per tenant |

---

## 2. Multi-Tenant Data Isolation Strategy

### 2.1 Chosen Model: **Shared Database, Shared Schema, Tenant Discriminator Column + Row-Level Security (RLS)**
Rationale: cheapest to operate at scale while MSSQL's native Row-Level Security gives strict enforcement at the database engine level, not just the application level (defense in depth).

If the ECC determines the tenant count will be small (<20) and enterprise clients require physical separation, offer **Database-per-Tenant** as an alternate deployment mode (Section 2.4), but the default build target is shared-schema + RLS.

### 2.2 Rules (Mandatory)
1. Every tenant-scoped table has a `TenantId UNIQUEIDENTIFIER NOT NULL` column, indexed, and is the **first column** in every composite index.
2. MSSQL **Row-Level Security** is enabled on every tenant-scoped table using a security policy bound to a predicate function:
   ```sql
   CREATE FUNCTION security.fn_TenantAccessPredicate(@TenantId UNIQUEIDENTIFIER)
   RETURNS TABLE
   WITH SCHEMABINDING
   AS
   RETURN SELECT 1 AS fn_result
   WHERE @TenantId = CAST(SESSION_CONTEXT(N'TenantId') AS UNIQUEIDENTIFIER);
   GO

   CREATE SECURITY POLICY security.TenantFilter
   ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.Employees,
   ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.Employees AFTER INSERT
   WITH (STATE = ON);
   -- Repeat ADD FILTER/BLOCK PREDICATE for every tenant-scoped table.
   ```
3. On every DB connection/request, the API layer MUST call `EXEC sp_set_session_context @key = N'TenantId', @value = @CurrentTenantId, @read_only = 1;` immediately after opening the connection and before any query executes. Use a connection-open middleware/interceptor so this cannot be forgotten in any repository class.
4. The API layer additionally filters every query by `TenantId` explicitly (defense-in-depth: never rely on RLS alone).
5. The `TenantId` for a request is derived only from the authenticated JWT claim, never from a client-supplied header, query string, or body field. Reject any request where a body/query TenantId disagrees with the JWT claim.
6. Cross-tenant queries (e.g., platform-level super-admin analytics) run under a separate elevated service identity that bypasses RLS via `EXECUTE AS` with explicit `TenantId` filtering coded in application logic — never expose this identity to tenant-facing APIs.
7. File storage (payslips, IDs, selfies) is partitioned by `/{TenantId}/...` path prefix in blob storage; access URLs are short-lived signed URLs scoped to tenant.
8. All background jobs (payroll run, leave accrual cron, biometric sync) are queued and executed **per tenant**, never as one query spanning tenants, so a runtime failure in one tenant cannot leak or block another.

### 2.3 Tenant Provisioning Table
See `Tenants` table in Section 3.1. New tenant signup triggers: create `Tenants` row → seed default leave types, default payroll government contribution tables (versioned, shared reference data, not tenant-scoped), default roles → send admin invite.

### 2.4 Alternate Mode — Database-per-Tenant (optional, document only)
If selected per-tenant later: one MSSQL database per tenant, same schema, connection string resolved from a central `TenantRegistry` catalog DB at login time. RLS becomes unnecessary in this mode but connection pooling per tenant must be handled (e.g., pool-per-tenant with eviction). Build this only if explicitly requested later; do not build both modes simultaneously.

### Acceptance Criteria — Section 2
- [ ] RLS security policy exists and is `STATE = ON` for every tenant-scoped table.
- [ ] A test proves User A (Tenant 1) cannot retrieve, update, or delete a row belonging to Tenant 2 even with a manually crafted API call.
- [ ] `SESSION_CONTEXT` is set on every single DB connection open path (verified via code review / interceptor, not per-call).
- [ ] Cross-tenant super-admin path is documented and access-restricted (separate role, separate audit log).

---

## 3. Database Schema (MSSQL)

> Naming convention: PascalCase tables/columns, singular-noun schemas, `Id UNIQUEIDENTIFIER DEFAULT NEWID()` primary keys, `CreatedAtUtc`, `UpdatedAtUtc`, `CreatedBy`, `UpdatedBy`, `IsDeleted BIT DEFAULT 0` (soft delete) on every table.

### 3.1 Tenancy & Identity
```
Tenants (Id, CompanyName, CompanyCode UNIQUE, TIN, SssEmployerNo, PhilHealthEmployerNo, PagIbigEmployerNo,
         GsisEmployerNo, IsGovernment BIT DEFAULT 0,
         Address, TimeZone DEFAULT 'Asia/Manila', SubscriptionPlan, Status, CreatedAtUtc, ...)

Users (Id, TenantId, Email, PasswordHash, PhoneNumber, IsActive, MfaEnabled, LastLoginAtUtc, ...)

Roles (Id, TenantId NULL-able for system roles, Name, IsSystemRole)
Permissions (Id, Code, Description)              -- global catalog, not tenant-scoped
RolePermissions (RoleId, PermissionId)
UserRoles (UserId, RoleId, TenantId)

EmployeeUserLink (EmployeeId, UserId, TenantId)   -- links portal login to 201 record
RefreshTokens (Id, UserId, TokenHash, ExpiresAtUtc, DeviceInfo, RevokedAtUtc)
AuditLogs (Id, TenantId, UserId, Action, EntityName, EntityId, BeforeJson, AfterJson, CreatedAtUtc, IpAddress)
```

### 3.2 Core HR / Employee Master (201 File)
```
Departments (Id, TenantId, Name, ParentDepartmentId NULL, Code)
Positions   (Id, TenantId, Title, DepartmentId, JobGrade, SalaryGradeMin, SalaryGradeMax)
Employees (Id, TenantId, EmployeeNo, FirstName, MiddleName, LastName, Suffix, BirthDate, Gender,
           CivilStatus, Nationality, PhilSysNo, TIN, SssNo, PhilHealthNo, PagIbigNo,
           Email, MobileNumber, Address, EmploymentStatus ENUM('Probationary','Regular','Contractual','Project-Based','Seasonal'),
           DateHired, DateRegularized, DateSeparated, SeparationReason, DepartmentId, PositionId,
           ImmediateSupervisorId NULL self-ref, BasicSalary, PayFrequency ENUM('Monthly','SemiMonthly','Weekly','Daily'),
           BankName, BankAccountNo, PhotoUrl, IsActive)

EmployeeDependents (Id, EmployeeId, TenantId, FullName, Relationship, BirthDate)
EmployeeEmploymentHistory (Id, EmployeeId, TenantId, EffectiveDate, ChangeType ENUM('Hire','Promotion','Transfer','SalaryAdjustment','Regularization','Separation'), OldValueJson, NewValueJson)
EmployeeDocuments (Id, EmployeeId, TenantId, DocType, FileUrl, UploadedAtUtc, ExpiryDate NULL)  -- 201 file attachments, gov IDs, COE, clearance
```

### 3.3 Attendance Monitoring
```
Shifts (Id, TenantId, Name, TimeIn, TimeOut, BreakMinutes, GraceMinutesLate, IsNightShift)
EmployeeSchedules (Id, EmployeeId, TenantId, ShiftId, EffectiveDate, DayOfWeekPattern, ExpiryDate NULL)

Geofences (Id, TenantId, Name, Latitude, Longitude, RadiusMeters)
DeviceRegistry (Id, TenantId, EmployeeId, DeviceId, DeviceType ENUM('Mobile','Biometric'), RegisteredAtUtc, IsTrusted)

AttendanceLogs (Id, TenantId, EmployeeId, LogType ENUM('TimeIn','BreakOut','BreakIn','TimeOut'),
                LogTimestampUtc, SourceLatitude, SourceLongitude, WithinGeofence BIT, SelfieUrl,
                DeviceId, SyncedFromOfflineQueue BIT, RawBiometricPayload NULL)

DailyTimeRecords (Id, TenantId, EmployeeId, WorkDate, ScheduledTimeIn, ScheduledTimeOut,
                  ActualTimeIn, ActualTimeOut, LateMinutes, UndertimeMinutes, OvertimeMinutes,
                  NightDiffMinutes, Status ENUM('Present','Absent','Late','HalfDay','OnLeave','Holiday','RestDay'),
                  IsManualEntry, ApprovedBy NULL, RemarkNote)

OvertimeRequests (Id, TenantId, EmployeeId, WorkDate, RequestedHours, Reason, Status ENUM('Pending','Approved','Rejected'), ApproverId, ApprovedAtUtc)
Holidays (Id, TenantId NULL for national default, HolidayDate, Name, Type ENUM('Regular','SpecialNonWorking'))
```

### 3.4 Leave Monitoring
```
LeaveTypes (Id, TenantId, Code, Name, IsPaid, AccrualRatePerMonth, MaxCarryOverDays, IsMonetizable,
            RequiresDocumentation, LegalBasis)   -- seed: VL, SL, Maternity(105d RA11210), Paternity(7d),
                                                  -- SoloParent(7d RA8972), VAWC(10d), Bereavement, Magna Carta Women(60d Gynae),
                                                  -- Special Leave for Women, Rehabilitation(6mo comp for injury)

LeaveCredits (Id, TenantId, EmployeeId, LeaveTypeId, Year, EarnedDays, UsedDays, CarriedOverDays, MonetizedDays, BalanceDays)
LeaveRequests (Id, TenantId, EmployeeId, LeaveTypeId, DateFrom, DateTo, TotalDays, IsHalfDay,
               Reason, AttachmentUrl NULL, Status ENUM('Pending','Approved','Rejected','Cancelled'),
               CurrentApproverId, SubmittedAtUtc, DecidedAtUtc)
LeaveApprovalSteps (Id, LeaveRequestId, TenantId, SequenceNo, ApproverId, Status, ActedAtUtc, Comment)  -- supports multi-level approval chains
LeaveCreditLedger (Id, TenantId, EmployeeId, LeaveTypeId, TransactionType ENUM('Accrual','Deduction','CarryOver','Monetization','Adjustment'), Days, ReferenceId, CreatedAtUtc)
```

### 3.5 Payroll (Philippines Standard)
```
PayrollPeriods (Id, TenantId, PeriodStart, PeriodEnd, PayDate, PayFrequency, Status ENUM('Open','Processing','Approved','Paid','Closed'))

GovContributionTables (Id, EffectiveYear, TableType ENUM('SSS','PhilHealth','PagIbig','WithholdingTax','GSIS','GSIS_EC','PERA'),
                        BracketMin, BracketMax, EmployeeShare, EmployerShare, FixedAmount, RatePercent)
                        -- shared reference data, versioned by EffectiveYear, NOT tenant-scoped, admin-maintained
                        -- GSIS: 9% EE + 9% ER premium; GSIS_EC: 2% ER-only Employee Compensation

PayrollRuns (Id, TenantId, PayrollPeriodId, RunDate, RunByUserId, Status, TotalGrossPay, TotalNetPay, TotalEmployerCost)

Payslips (Id, TenantId, PayrollRunId, EmployeeId,
          BasicPay, TotalWorkedDays, AbsentDeduction, LateDeduction, UndertimeDeduction,
          OvertimePay, NightDiffPay, HolidayPay, RestDayPremium,
          Allowances DECIMAL, DeMinimisBenefits DECIMAL,
          GrossPay,
          SssEmployeeShare, SssEmployerShare, SssMPFEmployee, SssMPFEmployer,
          PhilHealthEmployeeShare, PhilHealthEmployerShare,
          PagIbigEmployeeShare, PagIbigEmployerShare,
          GsisEmployeeShare, GsisEmployerShare, GsisECShare,
          PeraEmployeeShare DECIMAL DEFAULT 0, PeraEmployerShare DECIMAL DEFAULT 0,
          WithholdingTax, ThirteenthMonthPayAccrual,
          OtherDeductions, LoanDeductions,
          TotalDeductions, NetPay, PayslipUrl, GeneratedAtUtc)

PayslipLineItems (Id, PayslipId, TenantId, ItemType ENUM('Earning','Deduction'), Code, Description, Amount)

EmployeeLoans (Id, TenantId, EmployeeId, LoanType ENUM('SSS','PagIbig','GSIS_Conso','GSIS_Policy','GSIS_Enhanced','GSIS_Emergency','CompanyLoan','Other'),
               PrincipalAmount, MonthlyAmortization, RemainingBalance, StartDate, EndDate)

EmployeePeraContributions (Id, TenantId, EmployeeId, PayrollRunId NULL, PayrollPeriodId NULL,
                           EmployeeContribution DECIMAL(18,4) DEFAULT 0,
                           EmployerContribution DECIMAL(18,4) DEFAULT 0,
                           ContributionDate DATE NOT NULL,
                           Year INT NOT NULL,
                           Month INT NOT NULL,
                           PERA AdministratorName NVARCHAR(200) NULL,
                           PERAAccountNo NVARCHAR(50) NULL,
                           Remarks NVARCHAR(500) NULL,
                           CreatedAtUtc, UpdatedAtUtc, CreatedBy, UpdatedBy, IsDeleted)
                           -- Tracks both employee and employer PERA contributions per period
                           -- YTD totals computed by summing EmployeeContribution + EmployerContribution per year

EmployeePeraEnrollment (Id, TenantId, EmployeeId,
                         IsEnrolled BIT DEFAULT 0,
                         EnrollmentDate DATE NULL,
                         EmployeeContributionAmount DECIMAL(18,4) DEFAULT 0,   -- per payroll period
                         EmployerMatchEnabled BIT DEFAULT 0,
                         EmployerMatchType ENUM('Fixed','Percentage') NULL,
                         EmployerMatchValue DECIMAL(18,4) NULL,                -- fixed amount or percentage
                         EmployerMatchMax DECIMAL(18,4) NULL,                  -- max cap on employer match
                         PERAAdministratorId NVARCHAR(50) NULL,
                         PERAAccountNo NVARCHAR(50) NULL,
                         CreatedAtUtc, UpdatedAtUtc, CreatedBy, UpdatedBy, IsDeleted)
                         -- One row per enrolled employee, defines their PERA deduction setup

ThirteenthMonthPay (Id, TenantId, EmployeeId, Year, TotalBasicSalaryEarned, ComputedAmount, PaidDate, PayoutStatus)

GovernmentReportExports (Id, TenantId, ReportType ENUM('SSS_R3','SSS_R5','PhilHealth_RF1','PagIbig_M1A','PagIbig_M2','BIR_Alphalist','BIR_1601C','GSIS_Premium','PERA_Summary'),
                          PeriodCovered, FileUrl, GeneratedAtUtc)
```

### 3.6 HR Matrix / Analytics
```
OrgChartSnapshots (Id, TenantId, SnapshotDate, StructureJson)   -- generated view, cached
CompetencyMatrix (Id, TenantId, EmployeeId, SkillName, ProficiencyLevel 1-5, AssessedDate, AssessedBy)
PerformanceReviews (Id, TenantId, EmployeeId, ReviewPeriod, Rating, ReviewerId, Comments, Status)
DisciplinaryRecords (Id, TenantId, EmployeeId, IncidentDate, Category, ActionTaken, DueProcessNTE_Url, DueProcessNODA_Url, Status)
HeadcountSnapshots (Id, TenantId, SnapshotDate, DepartmentId, HeadcountActive, HeadcountHired, HeadcountSeparated)
AttritionMetrics (Id, TenantId, Year, Month, DepartmentId, VoluntarySeparations, InvoluntarySeparations, AttritionRatePercent)
```

### Acceptance Criteria — Section 3
- [ ] Every table above exists with correct data types, PK, FK constraints, and `TenantId` indexing.
- [ ] `GovContributionTables` seeded with current SSS/GSIS, PhilHealth, Pag-IBIG, and BIR withholding tax brackets (verify effective year before seeding — rates change; do not hardcode stale tables).
- [ ] `LeaveTypes` default seed matches Philippine statutory leaves listed in Section 3.4.
- [ ] Migration scripts are idempotent and version-numbered.

---

## 4. Philippine Payroll Computation Rules (Business Logic Spec)

Implement as a dedicated `PayrollEngine` service, pure functions where possible, fully unit-testable independent of the DB.

### 4.1 Daily Rate & Hourly Rate
```
DailyRate = MonthlySalary * 12 / 261     (261 working days factor is the common standard; make this a tenant-level configurable factor, common alternatives: 261, 313, 314)
HourlyRate = DailyRate / 8
```

### 4.2 Overtime, Night Differential, Holiday/Rest Day Premiums
| Scenario | Formula |
|---|---|
| Ordinary Overtime | HourlyRate × 1.25 × OT hours |
| Rest Day OT | HourlyRate × 1.69 × OT hours |
| Night Differential (10PM–6AM) | HourlyRate × 0.10 × night hours worked |
| Regular Holiday, worked | DailyRate × 2.00 (for first 8 hrs) |
| Regular Holiday, not worked | DailyRate × 1.00 (if present/on leave with pay the day before) |
| Regular Holiday + Rest Day, worked | DailyRate × 2.60 |
| Special Non-Working Day, worked | DailyRate × 1.30 |
| Special Non-Working Day + Rest Day, worked | DailyRate × 1.50 |
| Special Non-Working Day, not worked | No pay unless company policy/CBA states otherwise ("no work, no pay" default) |

Make all multipliers configurable per tenant (some CBAs are more generous) but seed with the above DOLE-standard defaults.

### 4.3 Absences, Late, Undertime
```
AbsentDeduction    = DailyRate × NumberOfAbsentDays
LateDeduction      = (HourlyRate / 60) × LateMinutes
UndertimeDeduction = (HourlyRate / 60) × UndertimeMinutes
```

### 4.4 SSS Contribution (Private Employers)
- Use the `GovContributionTables` bracket lookup by `MonthlySalaryCredit` range.
- Contribution is a percentage of MSC, split between employee and employer, with a mandatory Provident/MPF component above a certain MSC threshold.
- **Do not hardcode the bracket table in application code.** Read from `GovContributionTables` so a rate change only requires a data update, not a redeploy. Verify current-year rates against the official SSS circular before seeding — rates increase periodically; do not assume a training-era table remains current at build time.
- SSS applies when `Tenants.IsGovernment = 0` (private employer).

### 4.4a GSIS Contribution (Government/Public Employers)
- Applies when `Tenants.IsGovernment = 1` (government/public institution employer).
- Employee and employer each contribute 9% of monthly salary to GSIS premium.
- Additional 2% Employer-only contribution for Employee Compensation (EC) — stored as `GSIS_EC` table type.
- GSIS rates are stored in `GovContributionTables` with `TableType = 'GSIS'` (premium) and `TableType = 'GSIS_EC'` (EC).
- Monthly salary range: minimum ₱5,000, maximum ₱25,000 for contribution basis.
- SSS is optional for government employees (may be applied if employee has existing SSS coverage).
- The payroll engine selects GSIS or SSS based on the tenant's `IsGovernment` flag — never both for the same employee.

### 4.5 PhilHealth Contribution
- Premium rate applied to monthly basic salary, split equally EE/ER, with a floor and ceiling salary bracket.
- Same rule: store the current rate/floor/ceiling in `GovContributionTables`, verify against the latest PhilHealth circular before seeding since the rate has stepped up over recent years under the Universal Health Care law schedule.

### 4.6 Pag-IBIG (HDMF) Contribution
- Standard historical pattern: 2% EE / 2% ER of monthly compensation, with a customary low salary-cap basis unless the tenant enables uncapped contribution.
- Store in `GovContributionTables`; confirm the current cap against the latest Pag-IBIG circular before seeding.

### 4.7 Withholding Tax (BIR, TRAIN Law)
- Use the graduated withholding tax table (annualized or per-payroll-period bracket depending on `PayFrequency`).
- Formula pattern per bracket: `Tax = FixedAmount + (RatePercent × (TaxableIncome − BracketMin))`.
- `TaxableIncome = GrossPay − NonTaxableDeMinimis − SSS/PhilHealth/PagIbig/GSISEmployeeShare − OtherStatutoryExempt`.
- Confirm current BIR withholding tax brackets before seeding — verify no further legislated change since the last known TRAIN law adjustment.

### 4.8 13th Month Pay (PD 851)
```
13thMonthPay = TotalBasicSalaryEarnedInCalendarYear / 12
```
- Excludes overtime, allowances, and other non-basic pay unless tenant policy states otherwise.
- Must be paid on/before December 24 each year — build a scheduled reminder/report, not an enforced hard date.
- Pro-rate for employees who did not work the full year (separated mid-year, hired mid-year).

### 4.9 De Minimis Benefits
- Track configurable list (rice subsidy, meal allowance, uniform allowance, medical cash allowance, etc.) with current non-taxable ceilings per BIR regulation — treat ceilings as tenant-configurable/versioned reference data, not hardcoded constants, since BIR periodically revises them.

### 4.10 Payroll Run Workflow (State Machine)
```
Open → Processing (locks attendance edits for the period) → Approved (requires role Payroll Approver) → Paid (bank file/payslip release) → Closed (immutable, audit-only)
```
- Any edit to `Approved` or later payroll requires a reversal/adjustment run, never an in-place edit (audit integrity).

### 4.11 PERA Contribution (Optional Retirement Savings Program)

#### 4.11.1 Legal Basis
- **Republic Act No. 9505** — PERA Act of 2008, as amended by **RA 12214** (Capital Markets Efficiency Promotion Act)
- **BIR Revenue Regulation No. 22-2025** — Additional deduction for qualified employer's actual contributions (effective July 1, 2025)

#### 4.11.2 Overview
PERA is a **voluntary** personal retirement savings program. It supplements mandatory SSS/GSIS benefits. It is NOT a mandatory government contribution — it is an employer-offered benefit that employees can opt into.

#### 4.11.3 Maximum Annual Contribution Limits
| Contributor Type | Max Annual Qualified Contribution |
|---|---|
| Regular local employee / self-employed | ₱200,000 |
| Married (per spouse) | ₱200,000 each |
| Overseas Filipino (OFW) | ₱400,000 |
| Private employer (to employee's PERA) | Up to the employee's max allowable amount |

- As of 2026 the limits are ₱200,000 (local) / ₱400,000 (OFW). The BSP/BIR may adjust these periodically.
- Contributions exceeding the max are not entitled to the 5% tax credit.

#### 4.11.4 Employer Contribution Rules (RR 22-2025)
1. A **private employer** may contribute to its employee's PERA up to the extent of the employee's allowable annual limit.
2. Employer contributions are **deductible** from the employer's gross income.
3. **Additional 50% deduction** is allowed if BOTH conditions are met:
   - (a) Employer contributes at least an amount **equal to** the employee's own PERA contribution (matching), and
   - (b) Employer contributes to **ALL** employees' PERA (not just select employees).
4. Employer contributions are **exempt from withholding tax** on compensation.
5. The employee retains investment decision prerogative over the contributed amounts.

#### 4.11.5 PERA in the HRIS Payroll
- PERA is **optional per employee** — controlled by `EmployeePeraEnrollment.IsEnrolled`.
- When enrolled, the employee's PERA deduction is computed per payroll period based on their `EmployeeContributionAmount`.
- If `EmployerMatchEnabled = true`, the employer match is computed as either:
  - **Fixed**: `EmployerMatchValue` added per period, OR
  - **Percentage**: `EmployeeContributionAmount × EmployerMatchValue ÷ 100` (capped at `EmployerMatchMax`)
- Year-to-date (YTD) tracking: sum of `EmployeeContribution + EmployerContribution` per year must not exceed maximum annual limits.
- PERA contributions appear on the payslip as:
  - `PERA_EE` (Employee Share) — deduction line item
  - `PERA_ER` (Employer Share) — employer cost line item (informational on payslip, actual contribution remitted by employer separately)

#### 4.11.6 PERA in Payslips
Two new fields on `Payslips`:
- `PeraEmployeeShare DECIMAL(18,4) DEFAULT 0` — amount deducted from employee
- `PeraEmployerShare DECIMAL(18,4) DEFAULT 0` — employer matching contribution

Payslip line item codes:
| Code | ItemType | Description |
|---|---|---|
| `PERA_EE` | Deduction | PERA Contribution (Employee Share) |
| `PERA_ER` | Deduction | PERA Employer Match (for reference/info) |

#### 4.11.7 YTD & Reporting
- PERA contributions are **NOT** reported to government via standard SSS/PhilHealth/Pag-IBIG/BIR reports.
- The system should provide a **PERA Contribution Summary** report per employee showing:
  - Per-payroll breakdown (date, EE amount, ER amount)
  - YTD totals
  - Remaining annual limit
- Admin UI: list of enrolled employees, toggle enrollment, set contribution amounts, enable/disable employer matching.
- The PERA Administrator certificate (for employer tax deduction) must be issuable from the system or noted as obtained externally.

#### 4.11.8 Tax Implications (Informational for HR, not enforced by system)
- Employee receives a **5% tax credit** on qualified contributions (claimed on annual income tax return, not through payroll).
- Employer claims **deduction** on contributions + **additional 50% deduction** if matching conditions are met.
- Investment income within PERA is tax-exempt.
- Withdrawals after meeting "55 and 5" rule (age 55 + 5 years of contributions) are tax-free.

### Acceptance Criteria — Section 4
- [ ] `PayrollEngine` has unit tests for every formula in this section using at least 3 realistic sample employees (minimum wage earner, mid-level, high earner above SSS/PhilHealth ceiling).
- [ ] All government contribution/tax rates are sourced from `GovContributionTables`, none hardcoded in code.
- [ ] A payroll run produces a `Payslip` whose `GrossPay − TotalDeductions = NetPay` exactly, with no rounding drift greater than ₱0.01 per line item.
- [ ] Locking behavior prevents attendance edits on a period once its `PayrollRun.Status` is `Processing` or later.
- [ ] PERA employee enrollment is optional; unenrolled employees never get PERA deductions.
- [ ] PERA employer matching respects the match type (Fixed/Percentage) and maximum cap.
- [ ] YTD PERA contributions per employee are accumulated and visible in the payslip/PERA report.

---

## 5. Attendance Monitoring — Functional Spec

1. **Mobile Clock In/Out**: employee opens app → GPS captured → optional selfie captured → compared against assigned `Geofence` (radius check) → `AttendanceLogs` row created client-side then synced.
2. **Offline tolerance**: if no connectivity, log locally on-device (native/PWA local storage, not a web-artifact concern) with a client-generated timestamp + device clock, queue for sync, mark `SyncedFromOfflineQueue = true`, and flag for HR review if device clock drift exceeds a threshold.
3. **Biometric device hook**: expose a webhook/ingestion endpoint (`POST /api/v1/attendance/biometric-ingest`) authenticated by device API key, tenant-scoped, accepting vendor payloads (e.g., ZKTeco push protocol) and mapping `DeviceId → EmployeeId` via `DeviceRegistry`.
4. **DTR Generation**: nightly job per tenant computes `DailyTimeRecords` from raw `AttendanceLogs` + `EmployeeSchedules`, calculating late/undertime/overtime/night-diff minutes, and flags exceptions for manual HR review.
5. **Manual correction workflow**: HR/Manager can submit a correction; every correction is logged in `AuditLogs` with before/after state, and original raw log is never deleted (append-only for `AttendanceLogs`).
6. **Approval chain**: overtime and manual DTR edits route through `OvertimeRequests`/approval workflow before feeding into payroll.

### Acceptance Criteria — Section 5
- [ ] Clock-in rejected (or flagged, per tenant policy) if outside geofence radius, but always still recorded with `WithinGeofence = false` for HR visibility (never silently drop data).
- [ ] Offline-captured logs sync and reconcile without duplication (idempotency key = EmployeeId + LogType + client timestamp).
- [ ] DTR nightly job is idempotent — re-running it for the same date recomputes rather than duplicates.

---

## 6. Leave Monitoring — Functional Spec

1. Seed `LeaveTypes` per Section 3.4 statutory leaves; allow tenants to add company-specific leave types (e.g., Birthday Leave, Sabbatical).
2. Monthly accrual job (per tenant, per employee, based on `LeaveTypes.AccrualRatePerMonth`) writes to `LeaveCreditLedger` and updates `LeaveCredits.BalanceDays`.
3. Leave filing: employee submits `LeaveRequests` → routes through `LeaveApprovalSteps` (configurable single or multi-level chain by department) → on approval, deduct from `LeaveCredits` via ledger entry; on rejection/cancellation, no deduction (or reversal if already deducted).
4. Leave calendar view: team/department calendar showing approved leaves, for manager planning (read-only aggregate, still tenant/department scoped).
5. Year-end processing: carry-over up to `LeaveTypes.MaxCarryOverDays`, monetize excess if `IsMonetizable = true` and tenant policy allows, else forfeit — all as explicit ledger entries, never silent balance edits.
6. Leave without pay (LWOP): when balance is insufficient, allow filing as LWOP which feeds `AbsentDeduction` in payroll rather than a paid leave line.

### Acceptance Criteria — Section 6
- [ ] Leave balance cannot go negative unless LWOP is explicitly chosen.
- [ ] Every balance change has a corresponding `LeaveCreditLedger` row (balance is a derived/cached value, ledger is source of truth).
- [ ] Approval chain supports at least 2 levels (immediate supervisor → HR) configurable per department.

---

## 7. HR Matrix Module — Functional Spec

1. **Org Chart**: derived from `Employees.ImmediateSupervisorId` + `Departments`, rendered as an interactive tree; snapshot on demand into `OrgChartSnapshots` for historical comparison.
2. **Headcount Matrix**: `HeadcountSnapshots` populated by nightly job; dashboard shows headcount by department/status/employment type over time.
3. **Competency/Skills Matrix**: grid view — employees (rows) × skills (columns) × proficiency (1–5), filterable by department, exportable to Excel.
4. **Performance & Disciplinary Matrix**: consolidated view combining `PerformanceReviews` and `DisciplinaryRecords` per employee, with due-process document links (NTE/NODA) for compliance with Philippine due process (twin-notice rule).
5. **Attrition Analytics**: `AttritionMetrics` computed monthly = separations / average headcount; break down voluntary vs. involuntary; surfaced as trend chart.

### Acceptance Criteria — Section 7
- [ ] Org chart renders correctly for at least 4 levels of hierarchy depth.
- [ ] All HR Matrix views respect the logged-in user's role scope (e.g., a department manager sees only their department, HR admin sees all).

---

## 8. API Design (Mobile-Ready)

1. REST/JSON, versioned base path `/api/v1/...`.
2. Stateless JWT auth (access token short-lived ~15 min, refresh token rotated, stored hashed in `RefreshTokens`).
3. JWT claims include `sub` (UserId), `tenant_id`, `roles[]`. `tenant_id` is set at login and is immutable for the token's lifetime.
4. All endpoints validate the JWT `tenant_id` claim server-side before touching Section 2 session-context binding — no endpoint trusts a client-supplied tenant identifier.
5. Pagination on all list endpoints (`?page=`, `?pageSize=`, max 100).
6. Consistent envelope: `{ "success": bool, "data": ..., "error": { "code", "message" } }`.
7. File uploads (selfies, documents) via pre-signed upload URLs, not multipart through the API server, to keep mobile clients lightweight on flaky connections.
8. Push notification hooks (leave approval, payslip released, DTR exception) via FCM/APNs token registered per device in `DeviceRegistry`.
9. Rate limiting per tenant and per user to prevent one tenant's traffic spike from degrading others (shared-infra fairness).
10. OpenAPI/Swagger spec generated and published at `/api/v1/docs` for client app consumption.

### Acceptance Criteria — Section 8
- [ ] Swagger spec is complete and matches implemented endpoints exactly.
- [ ] A manual pen-test-style check confirms a request bearing Tenant A's JWT cannot read/write any Tenant B resource regardless of path parameters supplied.
- [ ] Mobile clock-in endpoint tested over a simulated flaky/offline connection and confirmed to queue-and-sync correctly.

---

## 9. Roles & Permissions (Seed Data)

| Role | Scope |
|---|---|
| Super Admin (platform) | Cross-tenant, provisioning only, never sees tenant HR data directly |
| Tenant Admin | Full access within own tenant |
| HR Admin | Employee master, payroll, leave, attendance — full within tenant |
| Payroll Officer | Payroll module only |
| Department Manager | Own department's attendance/leave approvals, read-only HR matrix for own dept |
| Employee (ESS) | Self-service: own DTR, own leave filing, own payslip view, own profile |

Implement via `Roles`/`Permissions`/`RolePermissions`/`UserRoles` tables (Section 3.1) — do not hardcode role checks; drive from the permission catalog so new roles can be composed later without code changes.

### Acceptance Criteria — Section 9
- [ ] Every API endpoint declares its required permission code and is enforced by middleware, not scattered `if (role == "Admin")` checks in controllers.

---

## 10. Build Phases & Deliverables (Execution Plan for ECC)

| Phase | Deliverable | Depends On |
|---|---|---|
| 1 | MSSQL schema + migrations + RLS policies (Sections 2, 3) | — |
| 2 | Auth/Tenancy API (login, JWT, refresh, tenant provisioning) | Phase 1 |
| 3 | Employee Master CRUD API + Org structure | Phase 2 |
| 4 | Attendance API (clock-in/out, geofence check, DTR job, biometric webhook) | Phase 3 |
| 5 | Leave API (filing, approval chain, accrual job, ledger) | Phase 3 |
| 6 | Payroll Engine (unit-tested pure logic) + Payroll API + government report exports | Phase 4, 5 |
| 7 | HR Matrix dashboards/reporting API | Phase 3–6 |
| 8 | Mobile-facing API hardening: offline sync, push notifications, rate limiting | Phase 4–7 |
| 9 | Frontend (responsive PWA) for ESS + Admin console | Phase 2–8 |
| 10 | End-to-end testing, security review (tenant isolation pen-test), deployment scripts | All |

For each phase, the ECC should:
1. Write/execute migration or code.
2. Write automated tests covering the phase's Acceptance Criteria.
3. Update `/docs/CHANGELOG.md` and `/docs/ASSUMPTIONS.md`.
4. Only then proceed to the next phase.

---

## 11. Open Items Requiring Periodic Verification (Not One-Time)

These values change by law/regulation over time and must be re-verified against current official circulars whenever a payroll build or update is executed — they should never be treated as permanently fixed constants in this document or in code:
- SSS contribution table (rate/MSC brackets)
- GSIS premium/EC rates (for government employers)
- PhilHealth premium rate/floor/ceiling
- Pag-IBIG contribution rate/cap
- BIR withholding tax brackets
- De minimis benefit ceilings
- Minimum wage rates (regional wage boards, affects absence/late/OT computations' base)
- PERA maximum annual contribution limits (₱200K local / ₱400K OFW — may be adjusted by the Secretary of Finance)

Build the system so these are **data**, not **code**, specifically so updates never require a redeploy.

---

*End of specification. This document is intended to be sufficient for autonomous, phase-by-phase execution without further clarification, except where explicitly flagged above as requiring current-year regulatory verification.*
