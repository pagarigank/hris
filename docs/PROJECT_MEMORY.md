# Philippine HRIS - Project Memory

## Project Overview
- **Type**: Multi-tenant SaaS HRIS for Philippine companies
- **Stack**: Node.js + TypeScript + Express + MSSQL
- **Location**: D:\hris
- **Database**: MSSQL Server (sa/P@ssw0rd)

## Completed Phases (1-10)
1. **Database**: 43 tables with RLS, migrations, seeded gov't contribution tables
2. **Auth**: JWT with refresh token rotation, tenant context middleware
3. **Employees**: Full CRUD with department/position management
4. **Attendance**: Clock-in/out with GPS/geofence, DTR viewing
5. **Leave**: Leave types, request workflow, credits with ledger
6. **Payroll**: Period management, payroll run, payslip generation
7. **HR Matrix**: Org chart, headcount, competency matrix, performance reviews, disciplinary records, attrition analytics
8. **Mobile Hardening**: Rate limiting, offline sync with idempotency keys, push notification service, device registration
9. **Frontend PWA**: React + Vite + TailwindCSS with responsive mobile-ready UI
10. **Testing**: E2E test suite 29/29 passing, frontend build verified

## Pending Work
- Security hardening (CSRF, rate limiting on auth)
- Unit and integration tests
- Database indexing optimization
- Deployment configuration

## Key Files
- `src/migrations/` - SQL migration files (001-004)
- `src/api/` - REST API routes (auth, employees, attendance, leave, payroll, hr-matrix, mobile)
- `src/middleware/` - auth, tenantContext, permissions, connection, rateLimit, offlineSync
- `src/services/pushNotification.ts` - Push notification service
- `frontend/` - React PWA (Vite + TailwindCSS)
- `docs/CHANGELOG.md` - Development history
- `docs/ASSUMPTIONS.md` - Project assumptions

## API Endpoints
- Auth: /api/v1/auth/* (login, refresh, logout)
- Employees: /api/v1/employees/*
- Attendance: /api/v1/attendance/* (clock-in, clock-out, logs, dtr)
- Leave: /api/v1/leave/* (types, credits, requests, approve/reject)
- Payroll: /api/v1/payroll/* (periods, run, payslips)
- HR Matrix: /api/v1/hr-matrix/* (org-chart, headcount, competency, performance, disciplinary, attrition, dashboard)
- Mobile: /api/v1/mobile/* (device, sync)

## Government Rates (2024)
- SSS: Employee/Employer share based on MSC brackets
- PhilHealth: 5% (2.5% EE + 2.5% ER), floor 10K, ceiling 100K
- Pag-IBIG: 2% EE / 2% ER, cap 5K
- BIR: TRAIN Law graduated rates

## Statutory Leaves
- Vacation Leave: 15 days/year (1.25/month accrual)
- Sick Leave: 15 days/year
- Maternity: 105 days (RA 11210)
- Paternity: 7 days (RA 8187)
- Solo Parent: 7 days (RA 8972)
- Special Leave Women: 60 days (RA 9710)
- SIL: 5 days/year (Labor Code)
