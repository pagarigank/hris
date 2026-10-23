import sql from 'mssql';
import { sendDTRExceptionNotification } from './pushNotification';

interface DtrComputation {
  tenantId: string;
  employeeId: string;
  workDate: Date;
  scheduledTimeIn: string; // "09:00"
  scheduledTimeOut: string; // "18:00"
  actualTimeIn: Date | null;
  actualTimeOut: Date | null;
  lateMinutes: number;
  undertimeMinutes: number;
  overtimeMinutes: number;
  nightDiffMinutes: number;
  status: string;
}

function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [h, m] = timeStr.split(':').map(Number);
  return { hours: h, minutes: m };
}

function timeToMinutes(timeStr: string): number {
  const { hours, minutes } = parseTime(timeStr);
  return hours * 60 + minutes;
}

function computeLateMinutes(actualIn: Date, scheduledIn: string): number {
  const schedMinutes = timeToMinutes(scheduledIn);
  const actualMinutes = actualIn.getHours() * 60 + actualIn.getMinutes();
  return Math.max(0, actualMinutes - schedMinutes);
}

function computeUndertimeMinutes(actualOut: Date | null, scheduledOut: string): number {
  if (!actualOut) return 0;
  const schedMinutes = timeToMinutes(scheduledOut);
  const actualMinutes = actualOut.getHours() * 60 + actualOut.getMinutes();
  return Math.max(0, schedMinutes - actualMinutes);
}

function computeNightDiffMinutes(actualIn: Date | null, actualOut: Date | null): number {
  if (!actualIn || !actualOut) return 0;
  
  let totalMinutes = 0;
  const start = new Date(actualIn);
  const end = new Date(actualOut);
  
  // Night diff: 10PM (22:00) to 6AM (06:00)
  const current = new Date(start);
  while (current < end) {
    const hour = current.getHours();
    if (hour >= 22 || hour < 6) {
      totalMinutes += 1;
    }
    current.setMinutes(current.getMinutes() + 1);
  }
  
  return totalMinutes;
}

function getStatus(lateMinutes: number, undertimeMinutes: number, hasTimeIn: boolean, hasLeave: boolean): string {
  if (hasLeave) return 'Leave';
  if (!hasTimeIn) return 'Absent';
  if (lateMinutes > 240 || undertimeMinutes > 240) return 'HalfDay';
  return 'Present';
}

export async function computeDailyDtr(pool: any, tenantId: string, targetDate: Date): Promise<number> {
  const dateOnly = new Date(targetDate);
  dateOnly.setHours(0, 0, 0, 0);
  
  const nextDate = new Date(dateOnly);
  nextDate.setDate(nextDate.getDate() + 1);
  
  // Get all active employees with their schedules (join through EmployeeSchedules → Shifts)
  const employeesResult = await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .input('WorkDate', sql.Date, dateOnly)
    .query(`
      SELECT e.Id AS EmployeeId,
             ISNULL(s.TimeIn, '09:00') AS ScheduledTimeIn,
             ISNULL(s.TimeOut, '18:00') AS ScheduledTimeOut
      FROM dbo.Employees e
      LEFT JOIN dbo.EmployeeSchedules es ON es.EmployeeId = e.Id AND es.TenantId = e.TenantId
        AND es.EffectiveDate <= @WorkDate AND (es.ExpiryDate IS NULL OR es.ExpiryDate >= @WorkDate)
        AND es.IsDeleted = 0
      LEFT JOIN dbo.Shifts s ON es.ShiftId = s.Id AND s.IsDeleted = 0
      WHERE e.TenantId = @TenantId AND e.IsActive = 1 AND e.IsDeleted = 0
    `);
  
  const employees = employeesResult.recordset;
  let computedCount = 0;
  
  for (const emp of employees) {
    // Get attendance logs for this employee on the target date
    const logsResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, emp.EmployeeId)
      .input('WorkDate', sql.Date, dateOnly)
      .query(`
        SELECT LogType, LogTimestampUtc
        FROM dbo.AttendanceLogs
        WHERE TenantId = @TenantId AND EmployeeId = @EmployeeId
              AND CAST(LogTimestampUtc AS DATE) = @WorkDate
              AND IsDeleted = 0
        ORDER BY LogTimestampUtc
      `);
    
    const logs = logsResult.recordset;
    let actualTimeIn: Date | null = null;
    let actualTimeOut: Date | null = null;
    
    for (const log of logs) {
      if (log.LogType === 'TimeIn' && !actualTimeIn) {
        actualTimeIn = log.LogTimestampUtc;
      }
      if (log.LogType === 'TimeOut') {
        actualTimeOut = log.LogTimestampUtc;
      }
    }
    
    // Check for approved leave on this date
    const leaveResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, emp.EmployeeId)
      .input('WorkDate', sql.Date, dateOnly)
      .query(`
        SELECT Id FROM dbo.LeaveRequests
        WHERE TenantId = @TenantId AND EmployeeId = @EmployeeId
              AND Status = 'Approved' AND @WorkDate BETWEEN DateFrom AND DateTo
              AND IsDeleted = 0
      `);
    
    const hasLeave = leaveResult.recordset.length > 0;
    
    // Check for approved overtime on this date
    const otResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, emp.EmployeeId)
      .input('WorkDate', sql.Date, dateOnly)
      .query(`
        SELECT ISNULL(SUM(RequestedHours * 60), 0) AS OvertimeMinutes
        FROM dbo.OvertimeRequests
        WHERE TenantId = @TenantId AND EmployeeId = @EmployeeId
              AND Status = 'Approved' AND WorkDate = @WorkDate
              AND IsDeleted = 0
      `);
    
    const overtimeMinutes = otResult.recordset[0]?.OvertimeMinutes || 0;
    
    // Compute DTR fields
    const lateMinutes = actualTimeIn ? computeLateMinutes(actualTimeIn, emp.ScheduledTimeIn) : 0;
    const undertimeMinutes = computeUndertimeMinutes(actualTimeOut, emp.ScheduledTimeOut);
    const nightDiffMinutes = computeNightDiffMinutes(actualTimeIn, actualTimeOut);
    const status = getStatus(lateMinutes, undertimeMinutes, !!actualTimeIn, hasLeave);
    
    // Upsert DailyTimeRecord
    await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, emp.EmployeeId)
      .input('WorkDate', sql.Date, dateOnly)
      .input('ScheduledTimeIn', sql.NVarChar, emp.ScheduledTimeIn)
      .input('ScheduledTimeOut', sql.NVarChar, emp.ScheduledTimeOut)
      .input('ActualTimeIn', sql.DateTime2, actualTimeIn)
      .input('ActualTimeOut', sql.DateTime2, actualTimeOut)
      .input('LateMinutes', sql.Int, lateMinutes)
      .input('UndertimeMinutes', sql.Int, undertimeMinutes)
      .input('OvertimeMinutes', sql.Int, overtimeMinutes)
      .input('NightDiffMinutes', sql.Int, nightDiffMinutes)
      .input('Status', sql.NVarChar, status)
      .query(`
        MERGE dbo.DailyTimeRecords AS target
        USING (SELECT @TenantId AS TenantId, @EmployeeId AS EmployeeId, @WorkDate AS WorkDate) AS source
        ON target.TenantId = source.TenantId AND target.EmployeeId = source.EmployeeId 
            AND target.WorkDate = source.WorkDate
        WHEN MATCHED THEN
          UPDATE SET 
            ScheduledTimeIn = @ScheduledTimeIn, ScheduledTimeOut = @ScheduledTimeOut,
            ActualTimeIn = @ActualTimeIn, ActualTimeOut = @ActualTimeOut,
            LateMinutes = @LateMinutes, UndertimeMinutes = @UndertimeMinutes,
            OvertimeMinutes = @OvertimeMinutes, NightDiffMinutes = @NightDiffMinutes,
            Status = @Status, UpdatedAtUtc = GETUTCDATE()
        WHEN NOT MATCHED THEN
          INSERT (TenantId, EmployeeId, WorkDate, ScheduledTimeIn, ScheduledTimeOut,
                  ActualTimeIn, ActualTimeOut, LateMinutes, UndertimeMinutes,
                  OvertimeMinutes, NightDiffMinutes, Status)
          VALUES (@TenantId, @EmployeeId, @WorkDate, @ScheduledTimeIn, @ScheduledTimeOut,
                  @ActualTimeIn, @ActualTimeOut, @LateMinutes, @UndertimeMinutes,
                  @OvertimeMinutes, @NightDiffMinutes, @Status);
      `);
    
    // Spec §8.8: Push notification for DTR exceptions
    const workDateStr = dateOnly.toISOString().split('T')[0];
    if (!actualTimeIn && !hasLeave) {
      // Absent — no clock-in and no approved leave
      sendDTRExceptionNotification(pool, tenantId, emp.EmployeeId, 'Absent', workDateStr).catch(() => {});
    } else if (lateMinutes > 60) {
      // Excessive lateness (>1 hour)
      sendDTRExceptionNotification(pool, tenantId, emp.EmployeeId, `Excessive Lateness (${lateMinutes} min)`, workDateStr).catch(() => {});
    } else if (actualTimeIn && !actualTimeOut) {
      // Missing clock-out
      sendDTRExceptionNotification(pool, tenantId, emp.EmployeeId, 'Missing Clock-Out', workDateStr).catch(() => {});
    }

    computedCount++;
  }
  
  return computedCount;
}

// Nightly job scheduler
let nightlyJobTimer: ReturnType<typeof setInterval> | null = null;

export function startNightlyDtrJob(poolFactory: () => Promise<any>) {
  // Run at 1:00 AM daily (Philippine time = 5:00 PM UTC)
  const now = new Date();
  const target = new Date(now);
  target.setUTCHours(17, 0, 0, 0); // 1:00 AM PHT = 5:00 PM UTC
  
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }
  
  const delay = target.getTime() - now.getTime();
  
  console.log(`[DTR Nightly Job] Scheduled for ${target.toISOString()} (${Math.round(delay / 1000 / 60)} minutes from now)`);
  
  setTimeout(async () => {
    console.log('[DTR Nightly Job] Running daily DTR computation...');
    try {
      const pool = await poolFactory();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      // Get all active tenants
      const tenantsResult = await pool.request()
        .query('SELECT Id FROM dbo.Tenants WHERE IsDeleted = 0');
      
      for (const tenant of tenantsResult.recordset) {
        const count = await computeDailyDtr(pool, tenant.Id, yesterday);
        console.log(`[DTR Nightly Job] Computed ${count} DTR records for tenant ${tenant.Id}`);
      }
      
      console.log('[DTR Nightly Job] Completed successfully');
    } catch (error) {
      console.error('[DTR Nightly Job] Error:', error);
    }
    
    // Schedule next run
    startNightlyDtrJob(poolFactory);
  }, delay);
}

export function stopNightlyDtrJob() {
  if (nightlyJobTimer) {
    clearTimeout(nightlyJobTimer);
    nightlyJobTimer = null;
  }
}
