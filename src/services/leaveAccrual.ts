import sql from 'mssql';

export interface AccrualResult {
  tenantId: string;
  employeeId: string;
  leaveTypeId: string;
  leaveTypeCode: string;
  accrualDays: number;
  newBalance: number;
  action: 'accrued' | 'already_maxed' | 'no_accrual';
}

export async function runLeaveAccrual(
  pool: sql.ConnectionPool,
  tenantId: string
): Promise<AccrualResult[]> {
  const results: AccrualResult[] = [];
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  // Set tenant context for RLS
  await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .query(`EXEC sp_set_session_context @key = N'TenantId', @value = @TenantId;`);

  // Get all active employees
  const employeesResult = await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .query(`
      SELECT Id FROM dbo.Employees
      WHERE TenantId = @TenantId AND IsActive = 1 AND IsDeleted = 0
    `);

  // Get all leave types with accrual > 0
  const leaveTypesResult = await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .query(`
      SELECT Id, Code, AccrualRatePerMonth
      FROM dbo.LeaveTypes
      WHERE TenantId = @TenantId AND AccrualRatePerMonth > 0 AND IsDeleted = 0
    `);

  const employees = employeesResult.recordset;
  const leaveTypes = leaveTypesResult.recordset;

  for (const employee of employees) {
    for (const leaveType of leaveTypes) {
      const accrualDays = Number(leaveType.AccrualRatePerMonth);

      // Upsert LeaveCredits for this employee/type/year
      const existingResult = await pool.request()
        .input('TenantId', sql.UniqueIdentifier, tenantId)
        .input('EmployeeId', sql.UniqueIdentifier, employee.Id)
        .input('LeaveTypeId', sql.UniqueIdentifier, leaveType.Id)
        .input('Year', sql.Int, currentYear)
        .query(`
          SELECT Id, EarnedDays, BalanceDays
          FROM dbo.LeaveCredits
          WHERE TenantId = @TenantId AND EmployeeId = @EmployeeId
                AND LeaveTypeId = @LeaveTypeId AND Year = @Year AND IsDeleted = 0
        `);

      if (existingResult.recordset.length > 0) {
        // Already has credits this year — add accrual
        const existing = existingResult.recordset[0];
        const newEarned = Number(existing.EarnedDays) + accrualDays;
        const newBalance = Number(existing.BalanceDays) + accrualDays;

        await pool.request()
          .input('Id', sql.UniqueIdentifier, existing.Id)
          .input('EarnedDays', sql.Decimal(5, 2), newEarned)
          .input('BalanceDays', sql.Decimal(5, 2), newBalance)
          .query(`
            UPDATE dbo.LeaveCredits
            SET EarnedDays = @EarnedDays, BalanceDays = @BalanceDays, UpdatedAtUtc = GETUTCDATE()
            WHERE Id = @Id
          `);

        // Write ledger entry for this accrual
        await pool.request()
          .input('TenantId', sql.UniqueIdentifier, tenantId)
          .input('EmployeeId', sql.UniqueIdentifier, employee.Id)
          .input('LeaveTypeId', sql.UniqueIdentifier, leaveType.Id)
          .input('TransactionType', sql.NVarChar, 'Accrual')
          .input('Days', sql.Decimal(5, 2), accrualDays)
          .input('ReferenceId', sql.NVarChar, `ACCRUAL-${currentYear}-${currentMonth}`)
          .query(`
            INSERT INTO dbo.LeaveCreditLedger (
              TenantId, EmployeeId, LeaveTypeId, TransactionType, Days, ReferenceId
            )
            VALUES (
              @TenantId, @EmployeeId, @LeaveTypeId, @TransactionType, @Days, @ReferenceId
            )
          `);

        results.push({
          tenantId,
          employeeId: employee.Id,
          leaveTypeId: leaveType.Id,
          leaveTypeCode: leaveType.Code,
          accrualDays,
          newBalance,
          action: 'accrued'
        });
      } else {
        // First accrual for this employee/type/year
        await pool.request()
          .input('TenantId', sql.UniqueIdentifier, tenantId)
          .input('EmployeeId', sql.UniqueIdentifier, employee.Id)
          .input('LeaveTypeId', sql.UniqueIdentifier, leaveType.Id)
          .input('Year', sql.Int, currentYear)
          .input('EarnedDays', sql.Decimal(5, 2), accrualDays)
          .input('BalanceDays', sql.Decimal(5, 2), accrualDays)
          .query(`
            INSERT INTO dbo.LeaveCredits (
              TenantId, EmployeeId, LeaveTypeId, Year, EarnedDays, BalanceDays
            )
            VALUES (
              @TenantId, @EmployeeId, @LeaveTypeId, @Year, @EarnedDays, @BalanceDays
            )
          `);

        // Write ledger entry for this first accrual
        await pool.request()
          .input('TenantId', sql.UniqueIdentifier, tenantId)
          .input('EmployeeId', sql.UniqueIdentifier, employee.Id)
          .input('LeaveTypeId', sql.UniqueIdentifier, leaveType.Id)
          .input('TransactionType', sql.NVarChar, 'Accrual')
          .input('Days', sql.Decimal(5, 2), accrualDays)
          .input('ReferenceId', sql.NVarChar, `ACCRUAL-${currentYear}-${currentMonth}`)
          .query(`
            INSERT INTO dbo.LeaveCreditLedger (
              TenantId, EmployeeId, LeaveTypeId, TransactionType, Days, ReferenceId
            )
            VALUES (
              @TenantId, @EmployeeId, @LeaveTypeId, @TransactionType, @Days, @ReferenceId
            )
          `);

        results.push({
          tenantId,
          employeeId: employee.Id,
          leaveTypeId: leaveType.Id,
          leaveTypeCode: leaveType.Code,
          accrualDays,
          newBalance: accrualDays,
          action: 'accrued'
        });
      }
    }
  }

  return results;
}
