# HRIS Build Specification — Philippines-Compliant, MSSQL Backend, Mobile-Ready

**Document type:** Autonomous execution spec for an engineering coding agent (ECC)
**Status:** Ready to build
**Last updated:** July 25, 2026

---

## 0. How the ECC should use this document

1. Treat each numbered module (Sections 4–9) as an independent work package with its own schema, API, business rules, and acceptance criteria.
2. Build in the order given in **Section 11 (Build Phases)**. Do not skip ahead — later modules depend on tables and services created earlier.
3. Every DDL script in this document is idempotent-ready (`IF NOT EXISTS` guards) — write your own scripts the same way so re-runs don't fail.
4. Every business rule that involves government-mandated rates (SSS, PhilHealth, Pag-IBIG, BIR) must be stored in **configurable rate tables**, never hardcoded in application logic. Rates change yearly by law; the schema in Section 7.2 already accounts for this.
5. When a requirement is ambiguous, prefer the interpretation that keeps the system **audit-safe** (nothing is hard-deleted; everything is timestamped and attributable to a user).
6. Stop and flag for human review only when: (a) a legal contribution rate cannot be sourced/confirmed, or (b) a requirement would conflict with the Philippine Labor Code. Otherwise proceed autonomously using the defaults specified here.
7. Definition of done for the whole project = all module acceptance criteria in Section 10 pass, plus the end-to-end scenario in Section 12.

---

## 1. Project Overview

Build a full **Human Resource Information System (HRIS)** for a Philippine employer, covering:

- Employee 201 file / master data management
- Biometric-ready **Attendance Monitoring**
- **Leave Management** (statutory + company leave types)
- **Payroll** fully compliant with Philippine statutory rules (SSS, PhilHealth, Pag-IBIG, BIR withholding tax, 13th month pay, holiday pay, night differential, overtime)
- **HR Matrix / Analytics Dashboard** (headcount, turnover, attrition, absenteeism, tardiness, DTR compliance, leave utilization)
- **Mobile-ready** — API-first architecture consumable by a responsive web app and/or native mobile app (Android/iOS), including selfie/geo-tagged time-in/out.

### 1.1 Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Database | **Microsoft SQL Server (MSSQL)** 2019+ | Given backend constraint. Use schemas to separate modules (`hr`, `attendance`, `leave`, `payroll`, `analytics`, `security`). |
| ORM / Data Access | Entity Framework Core (Code-First against existing schema) or Dapper for payroll-critical queries | Use Dapper for payroll computation paths where raw SQL control matters for auditability. |
| Backend API | **.NET 8 Web API** (C#) | REST + JSON. Alternative: Node.js/NestJS with `mssql`/`tedious` driver if the ECC's environment favors JS — pick ONE and stay consistent. |
| Auth | JWT (access + refresh tokens), ASP.NET Identity or custom `security.Users` table, role-based access control (RBAC) | MFA optional toggle for admin/payroll roles. |
| Mobile/Web frontend | **Single API, two clients**: React (Vite) responsive PWA for desktop/web HR use, and React Native (Expo) for the mobile time-in/out + leave-filing app | Both consume the same REST API. PWA must be installable and offline-tolerant for attendance capture (queue-and-sync). |
| File/Image storage | Azure Blob Storage or local file storage with path stored in DB | For selfies, ID photos, government form scans, payslip PDFs. |
| Background jobs | Hangfire (.NET) or node-cron | Nightly payroll cutoffs, leave accrual, tardiness computation, holiday calendar sync. |
| Reporting/exports | QuestPDF or similar for payslips/BIR forms; ClosedXML for Excel exports | |
| Hosting | Any (IIS/Azure App Service/Docker) — infra choice is out of scope; container the API for portability. |

### 1.2 High-Level Architecture

```
                    ┌─────────────────────┐
                    │   Mobile App (RN)    │  Time in/out, leave filing, payslip view
                    └──────────┬───────────┘
                               │ HTTPS/REST (JWT)
┌─────────────────┐           │            ┌──────────────────┐
│  Web App (React) │◄──────────┼───────────►│   REST API (.NET) │
│  HR/Payroll Admin │          │            │  Modules below    │
└─────────────────┘           │            └─────────┬─────────┘
                               │                      │
                               ▼                      ▼
                       ┌───────────────┐      ┌───────────────┐
                       │ Background Jobs│      │  MSSQL Server │
                       │ (accrual, cutoff)│───►│  (schemas:    │
                       └───────────────┘      │  hr, attendance,│
                                               │  leave, payroll,│
                                               │  analytics,     │
                                               │  security)      │
                                               └───────────────┘
```

---

## 2. Global Non-Functional Requirements

- **Data Privacy:** Comply with the Philippine Data Privacy Act of 2012 (RA 10173). Encrypt PII at rest (SSN/SSS/TIN numbers), mask sensitive fields in list views, log all access to 201 files.
- **Auditability:** Every table that holds payroll, attendance, or leave data must have `CreatedAt`, `CreatedBy`, `UpdatedAt`, `UpdatedBy`. Never hard-delete payroll or attendance records — use `IsVoided`/`VoidedReason` soft-delete pattern.
- **Multi-tenancy (optional but recommended):** Add a `CompanyId` column across all business tables so the system can scale to multiple legal entities/branches under one deployment.
- **Time zone:** All timestamps stored in UTC in the DB; converted to `Asia/Manila` at the presentation layer.
- **Mobile-ready:** Every API response paginated, gzip-compressed, and designed for low-bandwidth (avoid over-fetching; support field selection where practical).
- **Localization:** UI in English with Filipino labels as secondary/optional language pack (stretch goal, not blocking).
- **Performance target:** Payroll run for 1,000 employees completes in under 2 minutes; attendance sync API responds in under 500ms per punch.

---

## 3. Database — Global Setup

```sql
-- Run once per environment
IF DB_ID('HRIS') IS NULL
BEGIN
    CREATE DATABASE HRIS;
END
GO
USE HRIS;
GO

-- Schemas per module
IF SCHEMA_ID('hr') IS NULL EXEC('CREATE SCHEMA hr');
IF SCHEMA_ID('attendance') IS NULL EXEC('CREATE SCHEMA attendance');
IF SCHEMA_ID('leave') IS NULL EXEC('CREATE SCHEMA leave');
IF SCHEMA_ID('payroll') IS NULL EXEC('CREATE SCHEMA payroll');
IF SCHEMA_ID('analytics') IS NULL EXEC('CREATE SCHEMA analytics');
IF SCHEMA_ID('security') IS NULL EXEC('CREATE SCHEMA security');
GO
```

---

## 4. Module: Security & Identity (build first — everything depends on it)

### 4.1 Schema

```sql
CREATE TABLE security.Roles (
    RoleId INT IDENTITY PRIMARY KEY,
    RoleName NVARCHAR(50) NOT NULL UNIQUE, -- e.g. SuperAdmin, HRAdmin, PayrollAdmin, Manager, Employee
    Description NVARCHAR(200) NULL
);

CREATE TABLE security.Users (
    UserId INT IDENTITY PRIMARY KEY,
    EmployeeId INT NULL, -- FK to hr.Employees, nullable for system/service accounts
    Username NVARCHAR(100) NOT NULL UNIQUE,
    Email NVARCHAR(150) NOT NULL UNIQUE,
    PasswordHash NVARCHAR(255) NOT NULL,
    PasswordSalt NVARCHAR(255) NOT NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    MfaEnabled BIT NOT NULL DEFAULT 0,
    LastLoginAt DATETIME2 NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CreatedBy INT NULL,
    UpdatedAt DATETIME2 NULL,
    UpdatedBy INT NULL
);

CREATE TABLE security.UserRoles (
    UserId INT NOT NULL FOREIGN KEY REFERENCES security.Users(UserId),
    RoleId INT NOT NULL FOREIGN KEY REFERENCES security.Roles(RoleId),
    PRIMARY KEY (UserId, RoleId)
);

CREATE TABLE security.RefreshTokens (
    TokenId BIGINT IDENTITY PRIMARY KEY,
    UserId INT NOT NULL FOREIGN KEY REFERENCES security.Users(UserId),
    Token NVARCHAR(500) NOT NULL,
    ExpiresAt DATETIME2 NOT NULL,
    Revoked BIT NOT NULL DEFAULT 0,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE security.AuditLog (
    AuditId BIGINT IDENTITY PRIMARY KEY,
    UserId INT NULL,
    Action NVARCHAR(100) NOT NULL,      -- e.g. "VIEW_201_FILE", "RUN_PAYROLL", "APPROVE_LEAVE"
    EntityName NVARCHAR(100) NOT NULL,
    EntityId NVARCHAR(50) NULL,
    Details NVARCHAR(MAX) NULL,
    IPAddress NVARCHAR(45) NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
```

### 4.2 Default Roles (seed data)
`SuperAdmin`, `HRAdmin`, `PayrollAdmin`, `Manager` (approves own team's leave/DTR), `Employee` (self-service only).

### 4.3 API Endpoints

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/login` | Returns JWT + refresh token |
| POST | `/api/auth/refresh` | Rotate access token |
| POST | `/api/auth/logout` | Revoke refresh token |
| POST | `/api/auth/forgot-password` | Email OTP/reset link |
| GET | `/api/users/me` | Current user profile + roles |
| CRUD | `/api/users`, `/api/roles` | Admin-only management |

### 4.4 Acceptance Criteria
- Passwords hashed with bcrypt/PBKDF2, never stored/logged in plain text.
- JWT expires ≤ 60 min; refresh token expires ≤ 30 days and is revocable.
- Every privileged action (payroll run, leave approval, 201 file view) writes to `security.AuditLog`.
- Role-based route guards enforced server-side, not just hidden in UI.

---

## 5. Module: Employee 201 Master Data

### 5.1 Schema

```sql
CREATE TABLE hr.Departments (
    DepartmentId INT IDENTITY PRIMARY KEY,
    DepartmentName NVARCHAR(100) NOT NULL,
    ParentDepartmentId INT NULL FOREIGN KEY REFERENCES hr.Departments(DepartmentId)
);

CREATE TABLE hr.Positions (
    PositionId INT IDENTITY PRIMARY KEY,
    Title NVARCHAR(100) NOT NULL,
    SalaryGradeMin DECIMAL(12,2) NULL,
    SalaryGradeMax DECIMAL(12,2) NULL
);

CREATE TABLE hr.Employees (
    EmployeeId INT IDENTITY PRIMARY KEY,
    EmployeeNumber NVARCHAR(20) NOT NULL UNIQUE,
    FirstName NVARCHAR(100) NOT NULL,
    MiddleName NVARCHAR(100) NULL,
    LastName NVARCHAR(100) NOT NULL,
    Suffix NVARCHAR(10) NULL,
    Gender NVARCHAR(10) NULL,
    BirthDate DATE NULL,
    CivilStatus NVARCHAR(20) NULL,
    Nationality NVARCHAR(50) NULL DEFAULT 'Filipino',
    -- Government IDs (encrypt at column or app layer)
    SSSNumber NVARCHAR(20) NULL,
    PhilHealthNumber NVARCHAR(20) NULL,
    PagIbigNumber NVARCHAR(20) NULL,
    TIN NVARCHAR(20) NULL,
    -- Employment
    DepartmentId INT NULL FOREIGN KEY REFERENCES hr.Departments(DepartmentId),
    PositionId INT NULL FOREIGN KEY REFERENCES hr.Positions(PositionId),
    ManagerId INT NULL FOREIGN KEY REFERENCES hr.Employees(EmployeeId),
    EmploymentType NVARCHAR(30) NOT NULL, -- Regular, Probationary, Contractual, Project-based, Part-time
    EmploymentStatus NVARCHAR(20) NOT NULL DEFAULT 'Active', -- Active, Resigned, Terminated, AWOL, Retired
    DateHired DATE NOT NULL,
    RegularizationDate DATE NULL,
    DateSeparated DATE NULL,
    SeparationReason NVARCHAR(200) NULL,
    -- Pay setup
    BasicMonthlySalary DECIMAL(12,2) NOT NULL,
    PayFrequency NVARCHAR(20) NOT NULL DEFAULT 'Semi-Monthly', -- Semi-Monthly, Monthly, Weekly
    BankName NVARCHAR(100) NULL,
    BankAccountNumber NVARCHAR(50) NULL,
    -- Contact
    Email NVARCHAR(150) NULL,
    MobileNumber NVARCHAR(20) NULL,
    Address NVARCHAR(300) NULL,
    PhotoUrl NVARCHAR(300) NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CreatedBy INT NULL,
    UpdatedAt DATETIME2 NULL,
    UpdatedBy INT NULL
);

CREATE TABLE hr.EmployeeDependents (
    DependentId INT IDENTITY PRIMARY KEY,
    EmployeeId INT NOT NULL FOREIGN KEY REFERENCES hr.Employees(EmployeeId),
    FullName NVARCHAR(150) NOT NULL,
    Relationship NVARCHAR(30) NOT NULL, -- Spouse, Child, etc.
    BirthDate DATE NULL
);

CREATE TABLE hr.EmployeeDocuments (
    DocumentId INT IDENTITY PRIMARY KEY,
    EmployeeId INT NOT NULL FOREIGN KEY REFERENCES hr.Employees(EmployeeId),
    DocumentType NVARCHAR(50) NOT NULL, -- Resume, COE, Government ID, Medical Cert, NBI Clearance
    FileUrl NVARCHAR(300) NOT NULL,
    UploadedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE hr.EmploymentHistory (
    HistoryId INT IDENTITY PRIMARY KEY,
    EmployeeId INT NOT NULL FOREIGN KEY REFERENCES hr.Employees(EmployeeId),
    ChangeType NVARCHAR(30) NOT NULL, -- Promotion, Transfer, Salary Adjustment, Regularization
    OldValue NVARCHAR(200) NULL,
    NewValue NVARCHAR(200) NULL,
    EffectiveDate DATE NOT NULL,
    Remarks NVARCHAR(300) NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
```

### 5.2 API Endpoints
CRUD on `/api/employees`, `/api/departments`, `/api/positions`; sub-resources `/api/employees/{id}/dependents`, `/api/employees/{id}/documents`, `/api/employees/{id}/history`; `/api/employees/{id}/201-file` returns a consolidated packet for printing/export.

### 5.3 Acceptance Criteria
- `EmployeeNumber` auto-generated on create (configurable prefix + zero-padded sequence).
- Government ID fields validated by format (SSS: 10 digits, TIN: 9–12 digits, PhilHealth: 12 digits, Pag-IBIG: 12 digits).
- Changing `BasicMonthlySalary` or `DepartmentId`/`PositionId` writes a row to `EmploymentHistory` automatically (DB trigger or service-layer interceptor — prefer service-layer for testability).
- Soft-delete only: separation sets `EmploymentStatus` + `DateSeparated`, never removes the row.

---

## 6. Module: Attendance Monitoring

### 6.1 Schema

```sql
CREATE TABLE attendance.Shifts (
    ShiftId INT IDENTITY PRIMARY KEY,
    ShiftName NVARCHAR(50) NOT NULL,
    TimeIn TIME NOT NULL,
    TimeOut TIME NOT NULL,
    BreakMinutes INT NOT NULL DEFAULT 60,
    GraceMinutes INT NOT NULL DEFAULT 0,       -- tardiness grace period
    IsNightShift BIT NOT NULL DEFAULT 0
);

CREATE TABLE attendance.EmployeeSchedules (
    ScheduleId INT IDENTITY PRIMARY KEY,
    EmployeeId INT NOT NULL FOREIGN KEY REFERENCES hr.Employees(EmployeeId),
    ShiftId INT NOT NULL FOREIGN KEY REFERENCES attendance.Shifts(ShiftId),
    EffectiveDate DATE NOT NULL,
    EndDate DATE NULL,
    DaysOfWeek NVARCHAR(20) NOT NULL DEFAULT 'MTWTFXX' -- bitmask/string flags for Mon-Sun
);

CREATE TABLE attendance.Holidays (
    HolidayId INT IDENTITY PRIMARY KEY,
    HolidayDate DATE NOT NULL,
    Description NVARCHAR(150) NOT NULL,
    HolidayType NVARCHAR(30) NOT NULL -- Regular, SpecialNonWorking, SpecialWorking, LocalOrdinance
);

CREATE TABLE attendance.TimeLogs (
    TimeLogId BIGINT IDENTITY PRIMARY KEY,
    EmployeeId INT NOT NULL FOREIGN KEY REFERENCES hr.Employees(EmployeeId),
    LogDate DATE NOT NULL,
    TimeInActual DATETIME2 NULL,
    TimeOutActual DATETIME2 NULL,
    Source NVARCHAR(20) NOT NULL DEFAULT 'Mobile', -- Mobile, Biometric, WebKiosk, ManualEntry
    TimeInLat DECIMAL(9,6) NULL,
    TimeInLng DECIMAL(9,6) NULL,
    TimeInPhotoUrl NVARCHAR(300) NULL,
    TimeOutLat DECIMAL(9,6) NULL,
    TimeOutLng DECIMAL(9,6) NULL,
    TimeOutPhotoUrl NVARCHAR(300) NULL,
    IsVoided BIT NOT NULL DEFAULT 0,
    VoidedReason NVARCHAR(200) NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

-- Computed/derived daily attendance summary (populated by nightly job)
CREATE TABLE attendance.DailyAttendance (
    DailyAttendanceId BIGINT IDENTITY PRIMARY KEY,
    EmployeeId INT NOT NULL FOREIGN KEY REFERENCES hr.Employees(EmployeeId),
    AttendanceDate DATE NOT NULL,
    ScheduledTimeIn DATETIME2 NULL,
    ScheduledTimeOut DATETIME2 NULL,
    ActualTimeIn DATETIME2 NULL,
    ActualTimeOut DATETIME2 NULL,
    LateMinutes INT NOT NULL DEFAULT 0,
    UndertimeMinutes INT NOT NULL DEFAULT 0,
    OvertimeMinutes INT NOT NULL DEFAULT 0,
    NightDiffMinutes INT NOT NULL DEFAULT 0,
    Status NVARCHAR(20) NOT NULL, -- Present, Absent, Late, HalfDay, OnLeave, Holiday, RestDay
    IsHolidayWorked BIT NOT NULL DEFAULT 0,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_EmployeeDate UNIQUE (EmployeeId, AttendanceDate)
);

CREATE TABLE attendance.OvertimeRequests (
    OvertimeRequestId INT IDENTITY PRIMARY KEY,
    EmployeeId INT NOT NULL FOREIGN KEY REFERENCES hr.Employees(EmployeeId),
    RequestDate DATE NOT NULL,
    HoursRequested DECIMAL(4,2) NOT NULL,
    Reason NVARCHAR(300) NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Pending', -- Pending, Approved, Rejected
    ApprovedBy INT NULL,
    ApprovedAt DATETIME2 NULL
);
```

### 6.2 Business Rules (Philippine Labor Code aligned)
- Standard work day = 8 hours; work beyond 8 hours = overtime, paid at **125%** of hourly rate on ordinary days.
- **Night shift differential**: work performed between **10:00 PM and 6:00 AM** gets an additional **10%** of hourly rate (Labor Code Art. 86).
- Rest day work = **130%**; rest day + overtime = **130% + 30% of hourly rate on that excess**.
- Regular holiday not worked = **100% of daily rate** (if present/on leave with pay the day before); regular holiday worked = **200%**; regular holiday worked + overtime = **200% + 30%**.
- Special non-working holiday worked = **130%**; not worked = no pay unless company policy/CBA states otherwise.
- Tardiness/undertime computed per-minute against `GraceMinutes` in the assigned `Shift`.
- `attendance.Holidays` table must be seeded yearly from official Malacañang proclamations — treat as configurable data, not code.

### 6.3 API Endpoints

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/attendance/time-in` | Mobile/web punch-in with geo + optional selfie |
| POST | `/api/attendance/time-out` | Punch-out |
| GET | `/api/attendance/my-logs` | Employee's own DTR history |
| GET | `/api/attendance/team` | Manager view of direct reports |
| POST | `/api/attendance/manual-entry` | HR correction with mandatory `Reason` |
| GET | `/api/attendance/daily-summary` | Filterable by date range/department |
| POST/GET | `/api/overtime-requests` | File/approve OT |
| CRUD | `/api/shifts`, `/api/schedules`, `/api/holidays` | Setup |

### 6.4 Acceptance Criteria
- Geo-fencing optional per company setting (radius in meters from a registered work-site lat/lng); reject punches outside fence unless `ManualEntry` by HR.
- Nightly job computes `DailyAttendance` from `TimeLogs` + `EmployeeSchedules` + `Holidays`, is idempotent (safe to re-run), and feeds directly into payroll (Section 7).
- Missing time-out after N hours auto-flags record for HR review (does not auto-fabricate a time-out).
- Mobile app queues punches offline and syncs when connectivity returns, tagging `Source = Mobile` and original device timestamp.

---

## 7. Module: Leave Management

### 7.1 Statutory & Common Leave Types to Seed

| Leave Type | Legal Basis | Default Credits |
|---|---|---|
| Service Incentive Leave (SIL) | Labor Code Art. 95 | 5 days/year (convertible to cash if unused, for employees ≥1 year, if no equivalent VL/SL policy already given) |
| Vacation Leave (VL) | Company policy (commonly used to satisfy SIL) | 15 days/year (configurable) |
| Sick Leave (SL) | Company policy | 15 days/year (configurable) |
| Maternity Leave | RA 11210 (105-Day Expanded Maternity Leave Law) | 105 calendar days (live birth), +15 for solo parent, 60 days for miscarriage/emergency termination |
| Paternity Leave | RA 8187 | 7 calendar days |
| Solo Parent Leave | RA 8972 (Solo Parents' Welfare Act, as amended by RA 11861) | 7 working days/year |
| Special Leave for Women (Gynecological) | RA 9710 (Magna Carta of Women) | Up to 2 months for surgery due to gynecological disorders |
| VAWC Leave | RA 9262 | Up to 10 days |
| Bereavement Leave | Company policy (not statutory) | 3–5 days (configurable) |
| Emergency Leave | Company policy | Configurable |

### 7.2 Schema

```sql
CREATE TABLE leave.LeaveTypes (
    LeaveTypeId INT IDENTITY PRIMARY KEY,
    LeaveTypeName NVARCHAR(50) NOT NULL,
    IsStatutory BIT NOT NULL DEFAULT 0,
    IsPaid BIT NOT NULL DEFAULT 1,
    DefaultCreditsPerYear DECIMAL(5,2) NOT NULL DEFAULT 0,
    IsConvertibleToCash BIT NOT NULL DEFAULT 0,
    RequiresDocument BIT NOT NULL DEFAULT 0, -- e.g. medical cert for extended sick leave
    CarryOverAllowed BIT NOT NULL DEFAULT 0,
    MaxCarryOverDays DECIMAL(5,2) NULL
);

CREATE TABLE leave.LeaveBalances (
    LeaveBalanceId BIGINT IDENTITY PRIMARY KEY,
    EmployeeId INT NOT NULL FOREIGN KEY REFERENCES hr.Employees(EmployeeId),
    LeaveTypeId INT NOT NULL FOREIGN KEY REFERENCES leave.LeaveTypes(LeaveTypeId),
    Year INT NOT NULL,
    CreditsEarned DECIMAL(6,2) NOT NULL DEFAULT 0,
    CreditsUsed DECIMAL(6,2) NOT NULL DEFAULT 0,
    CreditsCarriedOver DECIMAL(6,2) NOT NULL DEFAULT 0,
    CONSTRAINT UQ_EmpLeaveYear UNIQUE (EmployeeId, LeaveTypeId, Year)
);

CREATE TABLE leave.LeaveRequests (
    LeaveRequestId INT IDENTITY PRIMARY KEY,
    EmployeeId INT NOT NULL FOREIGN KEY REFERENCES hr.Employees(EmployeeId),
    LeaveTypeId INT NOT NULL FOREIGN KEY REFERENCES leave.LeaveTypes(LeaveTypeId),
    StartDate DATE NOT NULL,
    EndDate DATE NOT NULL,
    NumberOfDays DECIMAL(5,2) NOT NULL,
    Reason NVARCHAR(300) NULL,
    SupportingDocUrl NVARCHAR(300) NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Pending', -- Pending, Approved, Rejected, Cancelled
    ApprovedBy INT NULL,
    ApprovedAt DATETIME2 NULL,
    RejectionReason NVARCHAR(300) NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE leave.LeaveAccrualLog (
    AccrualLogId BIGINT IDENTITY PRIMARY KEY,
    EmployeeId INT NOT NULL FOREIGN KEY REFERENCES hr.Employees(EmployeeId),
    LeaveTypeId INT NOT NULL FOREIGN KEY REFERENCES leave.LeaveTypes(LeaveTypeId),
    AccrualDate DATE NOT NULL,
    CreditsAdded DECIMAL(5,2) NOT NULL,
    Reason NVARCHAR(100) NOT NULL -- Monthly Accrual, Manual Adjustment, Year-End Carryover
);
```

### 7.3 API Endpoints

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/leave/my-balances` | Employee's current-year balances per type |
| POST | `/api/leave/requests` | File a leave request |
| PUT | `/api/leave/requests/{id}/approve` \| `/reject` | Manager/HR action |
| GET | `/api/leave/requests/team` | Manager approval queue |
| CRUD | `/api/leave/types` | HR configuration |
| GET | `/api/leave/calendar` | Team leave calendar view |

### 7.4 Business Rules
- Approving a `LeaveRequest` deducts `NumberOfDays` from `LeaveBalances.CreditsUsed` **atomically** (single transaction) and creates the corresponding `attendance.DailyAttendance` rows with `Status = 'OnLeave'` so payroll picks it up correctly.
- Monthly accrual job adds `DefaultCreditsPerYear / 12` per employee per applicable leave type (skip statutory leaves like Maternity/Paternity which are event-based, not accrued).
- Leave balance can never go negative unless the company setting `AllowNegativeLeaveBalance = true` (default false).
- Year-end job carries over unused credits up to `MaxCarryOverDays`; excess is forfeited or cash-converted per `IsConvertibleToCash`.

### 7.5 Acceptance Criteria
- Overlapping leave requests for the same employee are rejected at the API layer.
- Leave request date range automatically excludes rest days/holidays from `NumberOfDays` count (configurable per company policy).
- All approvals/rejections logged to `security.AuditLog`.

---

## 8. Module: Payroll (Philippines-Compliant)

> **Critical:** Government contribution rates change periodically by law. Do NOT hardcode percentages/brackets in C#/JS logic. Store them in the rate tables below and load the table version effective for the payroll period being computed.

### 8.1 Rate Configuration Schema

```sql
CREATE TABLE payroll.SSSContributionTable (
    SSSTableId INT IDENTITY PRIMARY KEY,
    EffectiveDate DATE NOT NULL,
    SalaryFrom DECIMAL(12,2) NOT NULL,
    SalaryTo DECIMAL(12,2) NOT NULL,
    MonthlySalaryCredit DECIMAL(12,2) NOT NULL,
    EmployeeShare DECIMAL(12,2) NOT NULL,
    EmployerShare DECIMAL(12,2) NOT NULL,
    ECContribution DECIMAL(12,2) NOT NULL DEFAULT 0,
    MPFEmployeeShare DECIMAL(12,2) NOT NULL DEFAULT 0, -- Mandatory Provident Fund, MSC portion above 20,000
    MPFEmployerShare DECIMAL(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE payroll.PhilHealthTable (
    PhilHealthTableId INT IDENTITY PRIMARY KEY,
    EffectiveDate DATE NOT NULL,
    PremiumRatePercent DECIMAL(5,4) NOT NULL, -- e.g. 0.05 for 5%
    SalaryFloor DECIMAL(12,2) NOT NULL,
    SalaryCeiling DECIMAL(12,2) NOT NULL,
    EmployeeSharePercent DECIMAL(5,4) NOT NULL DEFAULT 0.5, -- split of PremiumRatePercent
    EmployerSharePercent DECIMAL(5,4) NOT NULL DEFAULT 0.5
);

CREATE TABLE payroll.PagIbigTable (
    PagIbigTableId INT IDENTITY PRIMARY KEY,
    EffectiveDate DATE NOT NULL,
    SalaryThreshold DECIMAL(12,2) NOT NULL, -- e.g. 1500 historical breakpoint if still tiered
    EmployeeRatePercent DECIMAL(5,4) NOT NULL,
    EmployerRatePercent DECIMAL(5,4) NOT NULL,
    MonthlyFundSalaryCeiling DECIMAL(12,2) NOT NULL
);

CREATE TABLE payroll.BIRWithholdingTaxTable (
    BIRTableId INT IDENTITY PRIMARY KEY,
    EffectiveDate DATE NOT NULL,
    PayFrequency NVARCHAR(20) NOT NULL, -- Daily, Weekly, Semi-Monthly, Monthly
    BracketFrom DECIMAL(12,2) NOT NULL,
    BracketTo DECIMAL(12,2) NULL, -- NULL = no ceiling (highest bracket)
    BaseTax DECIMAL(12,2) NOT NULL DEFAULT 0,
    ExcessRatePercent DECIMAL(5,4) NOT NULL DEFAULT 0
);
```

**Seed reference (verify against the current BIR Revenue Regulations before go-live; TRAIN Law brackets effective 2023 onward, annualized):**
Annual: 0% up to ₱250,000; 15% of excess over ₱250,000 up to ₱400,000; ₱22,500 + 20% of excess over ₱400,000 up to ₱800,000; ₱102,500 + 25% of excess over ₱800,000 up to ₱2,000,000; ₱402,500 + 30% of excess over ₱2,000,000 up to ₱8,000,000; ₱2,202,500 + 35% of excess over ₱8,000,000. Convert to the applicable pay-frequency table (semi-monthly = annual ÷ 24, monthly = annual ÷ 12) using the BIR's official withholding tax tables — implement a seeding script that derives these automatically from the annual brackets so it self-updates if brackets change.

**SSS 2026 reference** (confirm at run-time from official SSS circular before each payroll year): contribution rate **15% of Monthly Salary Credit (MSC)**, split **5% employee / 10% employer**; MSC floor **₱5,000**, ceiling **₱35,000**; portion of MSC above ₱20,000 routed to the **Mandatory Provident Fund (MPF)**; Employees' Compensation (EC) contribution ₱10 (MSC < ₱15,000) or ₱30 (MSC ≥ ₱15,000), employer-paid.

**PhilHealth 2026 reference:** premium rate **5% of monthly basic salary**, split equally employee/employer (2.5% each); salary floor **₱10,000**, ceiling **₱100,000**.

**Pag-IBIG 2026 reference:** contribution rate **2%** of Monthly Fund Salary, Monthly Fund Salary capped at **₱10,000** (i.e., max employee share ₱200/month unless the employee opts to contribute more).

> ECC note: these figures were current as of mid-2026 per public guidance sources. Build the **rate table seeding script as a standalone, re-runnable admin utility**, not a one-time hardcoded seed, precisely because these values are legally revised. Add a `payroll/scripts/seed-statutory-rates-{year}.sql` file per year and load the row set effective for the payslip's period.

### 8.2 Payroll Processing Schema

```sql
CREATE TABLE payroll.PayrollPeriods (
    PayrollPeriodId INT IDENTITY PRIMARY KEY,
    PeriodStart DATE NOT NULL,
    PeriodEnd DATE NOT NULL,
    PayDate DATE NOT NULL,
    PeriodType NVARCHAR(20) NOT NULL, -- 1st Cutoff, 2nd Cutoff, Monthly
    Status NVARCHAR(20) NOT NULL DEFAULT 'Draft', -- Draft, Computed, Approved, Released, Closed
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE payroll.Payslips (
    PayslipId BIGINT IDENTITY PRIMARY KEY,
    PayrollPeriodId INT NOT NULL FOREIGN KEY REFERENCES payroll.PayrollPeriods(PayrollPeriodId),
    EmployeeId INT NOT NULL FOREIGN KEY REFERENCES hr.Employees(EmployeeId),
    BasicPay DECIMAL(12,2) NOT NULL DEFAULT 0,
    OvertimePay DECIMAL(12,2) NOT NULL DEFAULT 0,
    NightDiffPay DECIMAL(12,2) NOT NULL DEFAULT 0,
    HolidayPay DECIMAL(12,2) NOT NULL DEFAULT 0,
    LeavePay DECIMAL(12,2) NOT NULL DEFAULT 0,
    Allowances DECIMAL(12,2) NOT NULL DEFAULT 0,
    OtherEarnings DECIMAL(12,2) NOT NULL DEFAULT 0,
    GrossPay DECIMAL(12,2) NOT NULL DEFAULT 0,
    SSSEmployeeContribution DECIMAL(12,2) NOT NULL DEFAULT 0,
    PhilHealthEmployeeContribution DECIMAL(12,2) NOT NULL DEFAULT 0,
    PagIbigEmployeeContribution DECIMAL(12,2) NOT NULL DEFAULT 0,
    WithholdingTax DECIMAL(12,2) NOT NULL DEFAULT 0,
    LateUndertimeDeduction DECIMAL(12,2) NOT NULL DEFAULT 0,
    LoanDeductions DECIMAL(12,2) NOT NULL DEFAULT 0,
    OtherDeductions DECIMAL(12,2) NOT NULL DEFAULT 0,
    TotalDeductions DECIMAL(12,2) NOT NULL DEFAULT 0,
    NetPay DECIMAL(12,2) NOT NULL DEFAULT 0,
    IsVoided BIT NOT NULL DEFAULT 0,
    ComputedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    ApprovedBy INT NULL,
    ApprovedAt DATETIME2 NULL
);

CREATE TABLE payroll.PayslipEarningLines (
    LineId BIGINT IDENTITY PRIMARY KEY,
    PayslipId BIGINT NOT NULL FOREIGN KEY REFERENCES payroll.Payslips(PayslipId),
    LineType NVARCHAR(50) NOT NULL, -- Basic, OT, NightDiff, Holiday, Allowance, etc.
    Description NVARCHAR(150) NULL,
    Amount DECIMAL(12,2) NOT NULL
);

CREATE TABLE payroll.PayslipDeductionLines (
    LineId BIGINT IDENTITY PRIMARY KEY,
    PayslipId BIGINT NOT NULL FOREIGN KEY REFERENCES payroll.Payslips(PayslipId),
    LineType NVARCHAR(50) NOT NULL, -- SSS, PhilHealth, PagIbig, WithholdingTax, Loan, Other
    Description NVARCHAR(150) NULL,
    Amount DECIMAL(12,2) NOT NULL
);

CREATE TABLE payroll.LoanTypes (
    LoanTypeId INT IDENTITY PRIMARY KEY,
    LoanTypeName NVARCHAR(50) NOT NULL -- SSS Salary Loan, Pag-IBIG MPL, Company Loan, Cash Advance
);

CREATE TABLE payroll.EmployeeLoans (
    EmployeeLoanId INT IDENTITY PRIMARY KEY,
    EmployeeId INT NOT NULL FOREIGN KEY REFERENCES hr.Employees(EmployeeId),
    LoanTypeId INT NOT NULL FOREIGN KEY REFERENCES payroll.LoanTypes(LoanTypeId),
    PrincipalAmount DECIMAL(12,2) NOT NULL,
    MonthlyAmortization DECIMAL(12,2) NOT NULL,
    RemainingBalance DECIMAL(12,2) NOT NULL,
    StartDate DATE NOT NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Active' -- Active, Completed, Suspended
);

CREATE TABLE payroll.ThirteenthMonthPay (
    ThirteenthMonthId INT IDENTITY PRIMARY KEY,
    EmployeeId INT NOT NULL FOREIGN KEY REFERENCES hr.Employees(EmployeeId),
    Year INT NOT NULL,
    TotalBasicEarnedForYear DECIMAL(12,2) NOT NULL,
    ThirteenthMonthAmount DECIMAL(12,2) NOT NULL, -- = TotalBasicEarnedForYear / 12
    PayoutDate DATE NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Computed'
);
```

### 8.3 Payroll Computation Logic (per employee, per cutoff)

1. Pull `attendance.DailyAttendance` rows for the period.
2. **BasicPay** = (BasicMonthlySalary ÷ working days in period basis, per company's daily-rate divisor policy — commonly ÷ 261 or ÷ 313 days/year for daily rate, configurable) × days actually worked/paid (including paid leave and paid holidays).
3. **OvertimePay** = Σ(OvertimeMinutes ÷ 60) × HourlyRate × applicable multiplier (125%/130%/230% per Section 6.2 rules, based on whether it's ordinary day, rest day, or holiday).
4. **NightDiffPay** = Σ(NightDiffMinutes ÷ 60) × HourlyRate × 10%.
5. **HolidayPay** computed per Section 6.2 matrix.
6. **LeavePay** = paid leave days × daily rate, only for leave types with `IsPaid = 1`.
7. **LateUndertimeDeduction** = Σ(LateMinutes + UndertimeMinutes) ÷ 60 × HourlyRate.
8. **GrossPay** = BasicPay + OvertimePay + NightDiffPay + HolidayPay + LeavePay + Allowances + OtherEarnings.
9. Look up **SSS**, **PhilHealth**, **Pag-IBIG** employee shares from the rate tables using the **monthly-equivalent gross basic salary** (not the semi-monthly slice) per government rules, then split the monthly contribution across the two cutoffs per company convention (commonly SSS/PhilHealth/Pag-IBIG deducted on the 2nd cutoff only, or split — make this a company setting `StatutoryDeductionCutoffMode`).
10. Compute **WithholdingTax** using `payroll.BIRWithholdingTaxTable` filtered by `PayFrequency`, applied to **taxable income** = GrossPay − non-taxable de minimis benefits − SSS/PhilHealth/Pag-IBIG employee contributions.
11. Deduct `EmployeeLoans.MonthlyAmortization` (pro-rated per cutoff) while `RemainingBalance > 0`; decrement `RemainingBalance` and auto-close the loan at zero.
12. **NetPay** = GrossPay − (SSS + PhilHealth + PagIbig + WithholdingTax + LateUndertimeDeduction + LoanDeductions + OtherDeductions).
13. Write `Payslips` + `PayslipEarningLines` + `PayslipDeductionLines` inside a single DB transaction; set `PayrollPeriods.Status = 'Computed'` only after all employees in the batch succeed (all-or-nothing per batch, with a per-employee error log if one record fails validation).

### 8.4 13th Month Pay (PD 851)
- Statutory, must be paid on/before **December 24** each year, mandatory for rank-and-file employees regardless of tenure (pro-rated for employees who didn't work the full year).
- Formula: **Total basic salary actually earned during the calendar year ÷ 12**. Excludes overtime, allowances, and other non-basic pay unless company policy states otherwise.
- Build as a year-end batch job populating `payroll.ThirteenthMonthPay`, editable/recomputable before payout, then feeding a special `Payslips` record for that payout date.

### 8.5 API Endpoints

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/payroll/periods` | Create a payroll period/cutoff |
| POST | `/api/payroll/periods/{id}/compute` | Run computation for all active employees |
| GET | `/api/payroll/periods/{id}/payslips` | Review before approval |
| POST | `/api/payroll/periods/{id}/approve` | Lock and mark Approved |
| POST | `/api/payroll/periods/{id}/release` | Mark Released, trigger payslip PDF generation/notification |
| GET | `/api/payroll/my-payslips` | Employee self-service payslip history/download |
| CRUD | `/api/payroll/loans` | Loan setup and amortization tracking |
| POST | `/api/payroll/thirteenth-month/{year}/compute` | Year-end batch |
| GET | `/api/payroll/reports/sss` \| `/philhealth` \| `/pagibig` \| `/bir-alphalist` | Government remittance/reporting exports (Excel/CSV in the government's prescribed layout) |

### 8.6 Acceptance Criteria
- Recomputing a period before approval must be idempotent (safe to re-run, replaces prior draft payslips, never duplicates).
- Once `Status = Approved`, payslips are immutable except via a formal void-and-reissue flow that preserves audit history.
- All statutory computations must be traceable line-by-line in `PayslipDeductionLines` — no "black box" net figures.
- Unit tests cover at least: minimum-wage earner, MSC-ceiling earner, an employee with unpaid leave, an employee with approved OT on a regular holiday, and an employee with an active loan.

---

## 9. Module: HR Matrix / Analytics Dashboard

### 9.1 Metrics to Support

| Metric | Definition |
|---|---|
| Headcount | Active employees, sliceable by department/position/employment type/location |
| Turnover Rate | Separations in period ÷ average headcount in period |
| Attrition/Retention Rate | 1 − Turnover Rate, trailing 12 months |
| Absenteeism Rate | Unplanned absence days ÷ total working days |
| Tardiness Rate | Late instances ÷ total attendance instances |
| Overtime Utilization | Total OT hours ÷ total regular hours, by department |
| Leave Utilization | Credits used ÷ credits earned, by leave type |
| DTR Compliance | % of expected punches actually logged on time |
| Payroll Cost Trend | Gross/Net payroll cost per period, per department |
| Headcount by Tenure Band | <1yr, 1–3yr, 3–5yr, 5+yr |
| Gender/Age Distribution | For DEI reporting |

### 9.2 Schema (materialized/aggregated for dashboard performance)

```sql
CREATE TABLE analytics.HeadcountSnapshot (
    SnapshotId BIGINT IDENTITY PRIMARY KEY,
    SnapshotDate DATE NOT NULL,
    DepartmentId INT NULL,
    EmploymentType NVARCHAR(30) NULL,
    ActiveCount INT NOT NULL,
    NewHires INT NOT NULL DEFAULT 0,
    Separations INT NOT NULL DEFAULT 0
);

CREATE TABLE analytics.MonthlyHRMetrics (
    MetricId BIGINT IDENTITY PRIMARY KEY,
    MetricMonth DATE NOT NULL, -- first day of month
    DepartmentId INT NULL,
    TurnoverRate DECIMAL(6,4) NULL,
    AbsenteeismRate DECIMAL(6,4) NULL,
    TardinessRate DECIMAL(6,4) NULL,
    AvgOvertimeHours DECIMAL(8,2) NULL,
    LeaveUtilizationRate DECIMAL(6,4) NULL,
    TotalGrossPayroll DECIMAL(14,2) NULL,
    TotalNetPayroll DECIMAL(14,2) NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
```

### 9.3 API Endpoints

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/analytics/dashboard` | Aggregated KPI cards for a date range/department filter |
| GET | `/api/analytics/headcount-trend` | Time-series for charting |
| GET | `/api/analytics/turnover` | Turnover breakdown |
| GET | `/api/analytics/attendance-heatmap` | Tardiness/absence patterns by day/department |
| GET | `/api/analytics/leave-utilization` | By leave type/department |
| GET | `/api/analytics/payroll-cost-trend` | Cost trend by period |
| GET | `/api/analytics/export` | Excel export of any of the above |

### 9.4 Acceptance Criteria
- A nightly/monthly job populates `analytics.*` tables from source-of-truth tables (`hr`, `attendance`, `leave`, `payroll`) — dashboards never compute live aggregates over raw transactional tables at request time (protects performance).
- All dashboard endpoints support `departmentId`, `dateFrom`, `dateTo` query filters and return data ready for direct chart binding (labels + series arrays).

---

## 10. Mobile-Ready Requirements (applies across all modules)

1. **API-first**: every feature above must be reachable via REST with no server-rendered-only pages; the API is the single source of truth for both web and mobile clients.
2. **Time-in/out on mobile** must support: GPS capture, optional selfie capture, offline queue with background sync, and clear success/failure feedback.
3. **Push notifications** (via Firebase Cloud Messaging or OneSignal) for: leave approval/rejection, payslip released, missing time-out reminder, overtime approval needed (for managers).
4. **Responsive web** (React/Vite PWA) must be fully usable down to a 375px viewport for HR staff using tablets/phones in the field.
5. **Payslip download** on mobile must render a PDF in-app (not force an external browser).
6. **Authentication** on mobile persists via secure storage (Keychain/Keystore) with silent refresh-token renewal.
7. **Biometric device integration** (optional, phase 2): expose a `/api/attendance/device-import` endpoint that accepts a batch upload (CSV/API) from third-party biometric machines so the system isn't locked into mobile-only capture.

---

## 11. Build Phases (execute in this order)

| Phase | Scope | Depends on |
|---|---|---|
| 0 | Environment setup: MSSQL instance, base `HRIS` database, schemas (Section 3), CI/CD skeleton, API project scaffold, mobile app scaffold | — |
| 1 | Module 4 — Security & Identity | Phase 0 |
| 2 | Module 5 — Employee 201 Master Data | Phase 1 |
| 3 | Module 6 — Attendance Monitoring (shifts, schedules, time logs, nightly summary job) | Phase 2 |
| 4 | Module 7 — Leave Management (types, balances, requests, accrual job) | Phase 2 (can run parallel to Phase 3) |
| 5 | Module 8 — Payroll (rate tables first, then computation engine, then reporting exports) | Phases 3 and 4 complete (payroll consumes both attendance and leave data) |
| 6 | Module 9 — HR Matrix/Analytics dashboard | Phase 5 |
| 7 | Mobile app feature-complete pass (time-in/out, leave filing, payslip view, push notifications) | Phases 3–6 |
| 8 | Hardening: security audit, load test for payroll batch, DPA compliance review, UAT with sample company data | All prior phases |
| 9 | Deployment & go-live cutover plan (parallel-run payroll against manual computation for at least 1 cycle before fully switching) | Phase 8 |

---

## 12. End-to-End Acceptance Scenario (definition of "it works")

1. HR creates an employee, assigns department/position/shift/salary.
2. Employee logs in on mobile, times in with geo+selfie, times out at end of shift.
3. Employee files a Vacation Leave request for 2 days; manager approves it via mobile push notification link.
4. Nightly job computes `DailyAttendance` correctly reflecting worked days + 2 on-leave days.
5. HR runs a payroll cutoff covering that period; the resulting payslip shows correct BasicPay, LeavePay, any OT/ND pay, correct SSS/PhilHealth/Pag-IBIG/BIR deductions traceable to the active rate tables, and correct NetPay.
6. HR approves and releases the payroll period; employee receives a push notification and can view/download the payslip PDF on mobile.
7. HR Matrix dashboard reflects the updated headcount, attendance, leave utilization, and payroll cost figures for that period without manual recalculation.

If all seven steps complete without manual DB intervention, the build satisfies this specification.

---

## 13. Open Items Requiring Periodic Human Verification (not blocking initial build)

- Annual SSS, PhilHealth, Pag-IBIG contribution table refresh (each January, per official circulars).
- Annual BIR withholding tax bracket refresh (if Congress amends TRAIN law brackets).
- Annual regular/special holiday calendar (per Presidential Proclamation, usually issued the preceding year).
- Minimum wage order updates per region (Regional Tripartite Wages and Productivity Board), if `BasicMonthlySalary` floor validation is enabled.

---

*End of specification.*
