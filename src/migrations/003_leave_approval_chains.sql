-- LeaveApprovalChains table - configurable per-department approval chains
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'LeaveApprovalChains')
BEGIN
    CREATE TABLE dbo.LeaveApprovalChains (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        DepartmentId UNIQUEIDENTIFIER NULL,          -- NULL = default for all departments
        LeaveTypeId UNIQUEIDENTIFIER NULL,            -- NULL = applies to all leave types
        SequenceNo INT NOT NULL,
        ApproverId UNIQUEIDENTIFIER NOT NULL,         -- Employee who approves at this level
        IsActive BIT DEFAULT 1,
        CreatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAtUtc DATETIME2 DEFAULT GETUTCDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        IsDeleted BIT DEFAULT 0,
        CONSTRAINT FK_LeaveApprovalChains_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
        CONSTRAINT FK_LeaveApprovalChains_Department FOREIGN KEY (DepartmentId) REFERENCES dbo.Departments(Id),
        CONSTRAINT FK_LeaveApprovalChains_LeaveType FOREIGN KEY (LeaveTypeId) REFERENCES dbo.LeaveTypes(Id),
        CONSTRAINT FK_LeaveApprovalChains_Approver FOREIGN KEY (ApproverId) REFERENCES dbo.Employees(Id)
    );
    CREATE INDEX idx_leaveapprovalchains_tenant ON dbo.LeaveApprovalChains(TenantId);
    CREATE INDEX idx_leaveapprovalchains_dept ON dbo.LeaveApprovalChains(TenantId, DepartmentId);
    CREATE INDEX idx_leaveapprovalchains_dept_leavetype ON dbo.LeaveApprovalChains(TenantId, DepartmentId, LeaveTypeId);
END
GO
