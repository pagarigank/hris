# Philippine HRIS - Changelog

## Version 1.0.0 (2024-01-01)

### Phase 1: Database Schema & Migrations
- Created MSSQL database schema with all required tables
- Implemented Row-Level Security (RLS) for multi-tenant data isolation
- Seeded government contribution tables (SSS, PhilHealth, Pag-IBIG, BIR)
- Seeded default Philippine statutory leave types

### Phase 2: Authentication & Tenancy API
- Implemented JWT-based authentication with access and refresh tokens
- Created login/logout/refresh endpoints
- Implemented tenant context middleware for RLS

### Phase 3: Employee Master API
- Created CRUD endpoints for employees
- Implemented department and position management
- Added employee search and filtering

### Phase 4: Attendance API
- Implemented clock-in/out with GPS and geofence checking
- Created attendance log retrieval endpoints
- Added Daily Time Record (DTR) viewing

### Phase 5: Leave API
- Created leave type management
- Implemented leave request submission and approval workflow
- Added leave credits management with ledger tracking

### Phase 6: Payroll API
- Implemented payroll period management
- Created payroll run processing with government contributions
- Added payslip generation

### Phase 7: HR Matrix Dashboards/Reporting API
- Org chart endpoint with employee hierarchy tree
- Headcount report by department, status, and month
- Competency matrix CRUD by department
- Performance review CRUD and department summary
- Disciplinary record CRUD and stats
- Attrition metrics CRUD and monthly trend analysis
- Dashboard endpoint combining key metrics

### Phase 8: Mobile API Hardening
- Rate limiting middleware (tenant-based and user-based)
- Offline sync with idempotency keys for clock-in/clock-out
- Push notification service with placeholder integration
- Device registration and management endpoints
- Sync endpoint for offline queue processing

### Phase 9: Frontend PWA
- React + Vite + TypeScript + TailwindCSS setup
- Responsive layout with sidebar and mobile bottom navigation
- Login page with JWT authentication
- Dashboard with stats cards and quick actions
- Employee list with search and status badges
- Attendance page with live clock and DTR table
- Leave management with credits and request form
- Payroll periods and payslip viewing
- PWA manifest for mobile installation

### Phase 10: End-to-End Testing
- E2E test suite: 29/29 tests passing
- Frontend build verified (TypeScript + Vite)
- Fixed 6 bugs discovered during testing:
  - SQL Server port mismatch (1434 vs 1433)
  - RLS block predicates on seed migrations
  - Login SESSION_CONTEXT not set
  - Tenant context @read_only conflict
  - Admin role missing from permissions
  - Missing EmployeeUserLink for test user
- Created test report documentation

### Tables Created:
1. Tenants
2. Users
3. Roles
4. Permissions
5. RolePermissions
6. UserRoles
7. EmployeeUserLink
8. RefreshTokens
9. AuditLogs
10. Departments
11. Positions
12. Employees
13. EmployeeDependents
14. EmployeeEmploymentHistory
15. EmployeeDocuments
16. Shifts
17. EmployeeSchedules
18. Geofences
19. DeviceRegistry
20. AttendanceLogs
21. DailyTimeRecords
22. OvertimeRequests
23. Holidays
24. LeaveTypes
25. LeaveCredits
26. LeaveRequests
27. LeaveApprovalSteps
28. LeaveCreditLedger
29. PayrollPeriods
30. GovContributionTables
31. PayrollRuns
32. Payslips
33. PayslipLineItems
34. EmployeeLoans
35. ThirteenthMonthPay
36. GovernmentReportExports
37. OrgChartSnapshots
38. CompetencyMatrix
39. PerformanceReviews
40. DisciplinaryRecords
41. HeadcountSnapshots
42. AttritionMetrics
43. Migrations (tracking table)
