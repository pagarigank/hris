-- Migration 002: Implement Row-Level Security (RLS)
-- Version: 002
-- Date: 2024-01-01
-- Description: Create RLS security policy for tenant data isolation

-- Create security schema
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'security')
BEGIN
    EXEC('CREATE SCHEMA security');
END
GO

-- Create tenant access predicate function
IF NOT EXISTS (SELECT * FROM sys.objects WHERE name = 'fn_TenantAccessPredicate' AND schema_id = SCHEMA_ID('security'))
BEGIN
    EXEC('
    CREATE FUNCTION security.fn_TenantAccessPredicate(@TenantId UNIQUEIDENTIFIER)
    RETURNS TABLE
    WITH SCHEMABINDING
    AS
    RETURN SELECT 1 AS fn_result
    WHERE @TenantId = CAST(SESSION_CONTEXT(N''TenantId'') AS UNIQUEIDENTIFIER)
    ');
END
GO

-- Create security policy
-- Note: We need to drop and recreate the policy if it exists to add new predicates
IF EXISTS (SELECT * FROM sys.security_policies WHERE name = 'TenantFilter' AND schema_id = SCHEMA_ID('security'))
BEGIN
    DROP SECURITY POLICY security.TenantFilter;
END
GO

CREATE SECURITY POLICY security.TenantFilter
ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.Users,
ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.Users AFTER INSERT,
ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.Roles,
ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.Roles AFTER INSERT,
ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.UserRoles,
ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.UserRoles AFTER INSERT,
ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.EmployeeUserLink,
ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.EmployeeUserLink AFTER INSERT,
ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.AuditLogs,
ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.AuditLogs AFTER INSERT,
ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.Departments,
ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.Departments AFTER INSERT,
ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.Positions,
ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.Positions AFTER INSERT,
ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.Employees,
ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.Employees AFTER INSERT,
ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.EmployeeDependents,
ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.EmployeeDependents AFTER INSERT,
ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.EmployeeEmploymentHistory,
ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.EmployeeEmploymentHistory AFTER INSERT,
ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.EmployeeDocuments,
ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.EmployeeDocuments AFTER INSERT,
ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.Shifts,
ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.Shifts AFTER INSERT,
ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.EmployeeSchedules,
ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.EmployeeSchedules AFTER INSERT,
ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.Geofences,
ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.Geofences AFTER INSERT,
ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.DeviceRegistry,
ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.DeviceRegistry AFTER INSERT,
ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.AttendanceLogs,
ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.AttendanceLogs AFTER INSERT,
ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.DailyTimeRecords,
ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.DailyTimeRecords AFTER INSERT,
ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.OvertimeRequests,
ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.OvertimeRequests AFTER INSERT,
ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.Holidays,
ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.Holidays AFTER INSERT,
ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.LeaveTypes,
ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.LeaveTypes AFTER INSERT,
ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.LeaveCredits,
ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.LeaveCredits AFTER INSERT,
ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.LeaveRequests,
ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.LeaveRequests AFTER INSERT,
ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.LeaveApprovalSteps,
ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.LeaveApprovalSteps AFTER INSERT,
ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.LeaveCreditLedger,
ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.LeaveCreditLedger AFTER INSERT,
ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.PayrollPeriods,
ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.PayrollPeriods AFTER INSERT,
ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.PayrollRuns,
ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.PayrollRuns AFTER INSERT,
ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.Payslips,
ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.Payslips AFTER INSERT,
ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.PayslipLineItems,
ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.PayslipLineItems AFTER INSERT,
ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.EmployeeLoans,
ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.EmployeeLoans AFTER INSERT,
ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.ThirteenthMonthPay,
ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.ThirteenthMonthPay AFTER INSERT,
ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.GovernmentReportExports,
ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.GovernmentReportExports AFTER INSERT,
ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.OrgChartSnapshots,
ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.OrgChartSnapshots AFTER INSERT,
ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.CompetencyMatrix,
ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.CompetencyMatrix AFTER INSERT,
ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.PerformanceReviews,
ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.PerformanceReviews AFTER INSERT,
ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.DisciplinaryRecords,
ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.DisciplinaryRecords AFTER INSERT,
ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.HeadcountSnapshots,
ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.HeadcountSnapshots AFTER INSERT,
ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.AttritionMetrics,
ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.AttritionMetrics AFTER INSERT,
ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.LeaveApprovalChains,
ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON dbo.LeaveApprovalChains AFTER INSERT
WITH (STATE = ON);
GO

PRINT 'Migration 002 completed successfully - RLS policies created';
GO
