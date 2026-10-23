import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../../middleware/auth';
import { setTenantContext } from '../../middleware/tenantContext';
import { requirePermission } from '../../middleware/permissions';
import { parsePaginationQuery, buildPaginationMeta, addPaginationToQuery } from '../../middleware/pagination';
import { logAuditEvent, extractIp } from '../../middleware/auditLog';
import { blockIfPayrollLocked } from '../../middleware/payrollLock';
import { computeDailyDtr } from '../../services/dtrNightlyJob';
import sql from 'mssql';

const router = Router();

router.use(authMiddleware);
router.use(setTenantContext);

// GET /api/v1/attendance/today - Get today's DTR for current user
router.get('/today', requirePermission('attendance:read:self'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    
    // Get employee ID from user
    const employeeResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('UserId', sql.UniqueIdentifier, userId)
      .query(`
        SELECT e.Id
        FROM dbo.EmployeeUserLink eul
        INNER JOIN dbo.Employees e ON eul.EmployeeId = e.Id
        WHERE eul.UserId = @UserId AND eul.TenantId = @TenantId
      `);
    
    if (employeeResult.recordset.length === 0) {
      res.json(null);
      return;
    }
    
    const employeeId = employeeResult.recordset[0].Id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get today's attendance logs
    const logsResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, employeeId)
      .input('Today', sql.Date, today)
      .query(`
        SELECT LogType, LogTimestampUtc
        FROM dbo.AttendanceLogs
        WHERE TenantId = @TenantId AND EmployeeId = @EmployeeId 
        AND CAST(LogTimestampUtc AS DATE) = @Today
        AND IsDeleted = 0
        ORDER BY LogTimestampUtc
      `);
    
    const logs = logsResult.recordset;
    let clockIn = null;
    let clockOut = null;
    
    for (const log of logs) {
      if (log.LogType === 'TimeIn' && !clockIn) {
        clockIn = log.LogTimestampUtc;
      }
      if (log.LogType === 'TimeOut') {
        clockOut = log.LogTimestampUtc;
      }
    }
    
    let totalHours = 0;
    if (clockIn) {
      const endTime = clockOut || new Date();
      totalHours = Math.round(((endTime.getTime() - new Date(clockIn).getTime()) / (1000 * 60 * 60)) * 100) / 100;
    }
    
    res.json({
      date: today.toISOString(),
      clockIn,
      clockOut,
      totalHours
    });
  } catch (error) {
    console.error('Error getting today DTR:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to retrieve today DTR'
      }
    });
  }
});

// POST /api/v1/attendance/clock-in
router.post('/clock-in', requirePermission('attendance:write:self'), blockIfPayrollLocked, async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { latitude, longitude, deviceId, selfieUrl } = req.body;
    
    // Get employee ID from user
    const employeeResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('UserId', sql.UniqueIdentifier, userId)
      .query(`
        SELECT e.Id, e.ImmediateSupervisorId
        FROM dbo.EmployeeUserLink eul
        INNER JOIN dbo.Employees e ON eul.EmployeeId = e.Id
        WHERE eul.UserId = @UserId AND eul.TenantId = @TenantId
      `);
    
    if (employeeResult.recordset.length === 0) {
      res.status(404).json({
        success: false,
        error: {
          code: 'EMPLOYEE_NOT_FOUND',
          message: 'No employee linked to this user account'
        }
      });
      return;
    }
    
    const employee = employeeResult.recordset[0];
    
    // Check geofence
    let withinGeofence = false;
    if (latitude && longitude) {
      const geofenceResult = await pool.request()
        .input('TenantId', sql.UniqueIdentifier, tenantId)
        .input('Latitude', sql.Decimal(10, 8), latitude)
        .input('Longitude', sql.Decimal(11, 8), longitude)
        .query(`
          SELECT Id, Name, Latitude, Longitude, RadiusMeters
          FROM dbo.Geofences
          WHERE TenantId = @TenantId AND IsDeleted = 0
        `);
      
      for (const geofence of geofenceResult.recordset) {
        const distance = calculateDistance(
          latitude, longitude,
          parseFloat(geofence.Latitude), parseFloat(geofence.Longitude)
        );
        
        if (distance <= geofence.RadiusMeters) {
          withinGeofence = true;
          break;
        }
      }
    }
    
    // Create attendance log
    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, employee.Id)
      .input('LogType', sql.NVarChar, 'TimeIn')
      .input('LogTimestampUtc', sql.DateTime2, new Date())
      .input('SourceLatitude', sql.Decimal(10, 8), latitude || null)
      .input('SourceLongitude', sql.Decimal(11, 8), longitude || null)
      .input('WithinGeofence', sql.Bit, withinGeofence)
      .input('SelfieUrl', sql.NVarChar, selfieUrl || null)
      .input('DeviceId', sql.NVarChar, deviceId || null)
      .input('CreatedBy', sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO dbo.AttendanceLogs (
          TenantId, EmployeeId, LogType, LogTimestampUtc,
          SourceLatitude, SourceLongitude, WithinGeofence,
          SelfieUrl, DeviceId, CreatedBy
        )
        OUTPUT INSERTED.Id
        VALUES (
          @TenantId, @EmployeeId, @LogType, @LogTimestampUtc,
          @SourceLatitude, @SourceLongitude, @WithinGeofence,
          @SelfieUrl, @DeviceId, @CreatedBy
        );
      `);
    
    res.status(201).json({
      success: true,
      data: {
        id: result.recordset[0].Id,
        logType: 'TimeIn',
        timestamp: new Date().toISOString(),
        withinGeofence,
        message: withinGeofence ? 'Clock-in recorded successfully' : 'Clock-in recorded - outside geofence (flagged for review)'
      }
    });
  } catch (error) {
    console.error('Error clocking in:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to record clock-in'
      }
    });
  }
});

// POST /api/v1/attendance/clock-out
router.post('/clock-out', requirePermission('attendance:write:self'), blockIfPayrollLocked, async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { latitude, longitude, deviceId } = req.body;
    
    // Get employee ID from user
    const employeeResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('UserId', sql.UniqueIdentifier, userId)
      .query(`
        SELECT e.Id
        FROM dbo.EmployeeUserLink eul
        INNER JOIN dbo.Employees e ON eul.EmployeeId = e.Id
        WHERE eul.UserId = @UserId AND eul.TenantId = @TenantId
      `);
    
    if (employeeResult.recordset.length === 0) {
      res.status(404).json({
        success: false,
        error: {
          code: 'EMPLOYEE_NOT_FOUND',
          message: 'No employee linked to this user account'
        }
      });
      return;
    }
    
    const employee = employeeResult.recordset[0];
    
    // Check geofence
    let withinGeofence = false;
    if (latitude && longitude) {
      const geofenceResult = await pool.request()
        .input('TenantId', sql.UniqueIdentifier, tenantId)
        .input('Latitude', sql.Decimal(10, 8), latitude)
        .input('Longitude', sql.Decimal(11, 8), longitude)
        .query(`
          SELECT Id, Name, Latitude, Longitude, RadiusMeters
          FROM dbo.Geofences
          WHERE TenantId = @TenantId AND IsDeleted = 0
        `);
      
      for (const geofence of geofenceResult.recordset) {
        const distance = calculateDistance(
          latitude, longitude,
          parseFloat(geofence.Latitude), parseFloat(geofence.Longitude)
        );
        
        if (distance <= geofence.RadiusMeters) {
          withinGeofence = true;
          break;
        }
      }
    }
    
    // Create attendance log
    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, employee.Id)
      .input('LogType', sql.NVarChar, 'TimeOut')
      .input('LogTimestampUtc', sql.DateTime2, new Date())
      .input('SourceLatitude', sql.Decimal(10, 8), latitude || null)
      .input('SourceLongitude', sql.Decimal(11, 8), longitude || null)
      .input('WithinGeofence', sql.Bit, withinGeofence)
      .input('DeviceId', sql.NVarChar, deviceId || null)
      .input('CreatedBy', sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO dbo.AttendanceLogs (
          TenantId, EmployeeId, LogType, LogTimestampUtc,
          SourceLatitude, SourceLongitude, WithinGeofence,
          DeviceId, CreatedBy
        )
        OUTPUT INSERTED.Id
        VALUES (
          @TenantId, @EmployeeId, @LogType, @LogTimestampUtc,
          @SourceLatitude, @SourceLongitude, @WithinGeofence,
          @DeviceId, @CreatedBy
        );
      `);
    
    res.status(201).json({
      success: true,
      data: {
        id: result.recordset[0].Id,
        logType: 'TimeOut',
        timestamp: new Date().toISOString(),
        withinGeofence,
        message: withinGeofence ? 'Clock-out recorded successfully' : 'Clock-out recorded - outside geofence (flagged for review)'
      }
    });
  } catch (error) {
    console.error('Error clocking out:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to record clock-out'
      }
    });
  }
});

// POST /api/v1/attendance/break-out - Start a break/lunch
router.post('/break-out', requirePermission('attendance:write:self'), blockIfPayrollLocked, async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;

    const employeeResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('UserId', sql.UniqueIdentifier, userId)
      .query(`
        SELECT e.Id FROM dbo.EmployeeUserLink eul
        INNER JOIN dbo.Employees e ON eul.EmployeeId = e.Id
        WHERE eul.UserId = @UserId AND eul.TenantId = @TenantId
      `);

    if (employeeResult.recordset.length === 0) {
      res.status(404).json({ success: false, error: { code: 'EMPLOYEE_NOT_FOUND', message: 'No employee linked to this user account' } });
      return;
    }

    const employeeId = employeeResult.recordset[0].Id;

    // Prevent duplicate break-out if already on break
    const lastLog = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT TOP 1 LogType FROM dbo.AttendanceLogs
        WHERE TenantId = @TenantId AND EmployeeId = @EmployeeId AND IsDeleted = 0
        ORDER BY LogTimestampUtc DESC
      `);

    if (lastLog.recordset.length > 0 && lastLog.recordset[0].LogType === 'BreakOut') {
      res.status(409).json({ success: false, error: { code: 'ALREADY_ON_BREAK', message: 'Already on break. Use break-in first.' } });
      return;
    }

    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, employeeId)
      .input('LogType', sql.NVarChar, 'BreakOut')
      .query(`
        INSERT INTO dbo.AttendanceLogs (TenantId, EmployeeId, LogType, LogTimestampUtc, CreatedBy)
        OUTPUT INSERTED.Id
        VALUES (@TenantId, @EmployeeId, @LogType, @LogTimestampUtc, @CreatedBy);
      `);

    res.status(201).json({
      success: true,
      data: { id: result.recordset[0].Id, logType: 'BreakOut', timestamp: new Date().toISOString(), message: 'Break started' }
    });
  } catch (error) {
    console.error('Error starting break:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to record break-out' } });
  }
});

// POST /api/v1/attendance/break-in - End a break/lunch
router.post('/break-in', requirePermission('attendance:write:self'), blockIfPayrollLocked, async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;

    const employeeResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('UserId', sql.UniqueIdentifier, userId)
      .query(`
        SELECT e.Id FROM dbo.EmployeeUserLink eul
        INNER JOIN dbo.Employees e ON eul.EmployeeId = e.Id
        WHERE eul.UserId = @UserId AND eul.TenantId = @TenantId
      `);

    if (employeeResult.recordset.length === 0) {
      res.status(404).json({ success: false, error: { code: 'EMPLOYEE_NOT_FOUND', message: 'No employee linked to this user account' } });
      return;
    }

    const employeeId = employeeResult.recordset[0].Id;

    const lastLog = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT TOP 1 LogType FROM dbo.AttendanceLogs
        WHERE TenantId = @TenantId AND EmployeeId = @EmployeeId AND IsDeleted = 0
        ORDER BY LogTimestampUtc DESC
      `);

    if (lastLog.recordset.length === 0 || lastLog.recordset[0].LogType !== 'BreakOut') {
      res.status(409).json({ success: false, error: { code: 'NOT_ON_BREAK', message: 'Not currently on break. Use break-out first.' } });
      return;
    }

    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, employeeId)
      .input('LogType', sql.NVarChar, 'BreakIn')
      .query(`
        INSERT INTO dbo.AttendanceLogs (TenantId, EmployeeId, LogType, LogTimestampUtc, CreatedBy)
        OUTPUT INSERTED.Id
        VALUES (@TenantId, @EmployeeId, @LogType, @LogTimestampUtc, @CreatedBy);
      `);

    res.status(201).json({
      success: true,
      data: { id: result.recordset[0].Id, logType: 'BreakIn', timestamp: new Date().toISOString(), message: 'Break ended' }
    });
  } catch (error) {
    console.error('Error ending break:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to record break-in' } });
  }
});

// GET /api/v1/attendance/logs - Get attendance logs
router.get('/logs', requirePermission('attendance:read:self'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { startDate, endDate, employeeId } = req.query;
    const pagination = parsePaginationQuery(req.query);
    
    // Get employee ID from user (if not admin)
    let targetEmployeeId = employeeId;
    if (!targetEmployeeId) {
      const employeeResult = await pool.request()
        .input('TenantId', sql.UniqueIdentifier, tenantId)
        .input('UserId', sql.UniqueIdentifier, userId)
        .query(`
          SELECT e.Id
          FROM dbo.EmployeeUserLink eul
          INNER JOIN dbo.Employees e ON eul.EmployeeId = e.Id
          WHERE eul.UserId = @UserId AND eul.TenantId = @TenantId
        `);
      
      if (employeeResult.recordset.length > 0) {
        targetEmployeeId = employeeResult.recordset[0].Id;
      }
    }
    
    let whereClause = 'WHERE al.TenantId = @TenantId AND al.IsDeleted = 0';
    const request = pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId);
    
    if (targetEmployeeId) {
      whereClause += ' AND al.EmployeeId = @EmployeeId';
      request.input('EmployeeId', sql.UniqueIdentifier, targetEmployeeId);
    }
    
    if (startDate) {
      whereClause += ' AND al.LogTimestampUtc >= @StartDate';
      request.input('StartDate', sql.DateTime2, new Date(startDate as string));
    }
    
    if (endDate) {
      whereClause += ' AND al.LogTimestampUtc <= @EndDate';
      request.input('EndDate', sql.DateTime2, new Date(endDate as string));
    }
    
    // Count total
    const countResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`SELECT COUNT(*) AS total FROM dbo.AttendanceLogs al ${whereClause}`);
    const total = countResult.recordset[0]?.total || 0;
    
    // Fetch page
    const selectQuery = `SELECT al.Id, al.LogType, al.LogTimestampUtc, al.SourceLatitude, al.SourceLongitude, al.WithinGeofence, al.SelfieUrl, al.DeviceId, al.SyncedFromOfflineQueue, e.EmployeeNo, e.FirstName, e.LastName FROM dbo.AttendanceLogs al INNER JOIN dbo.Employees e ON al.EmployeeId = e.Id`;
    const fullQuery = addPaginationToQuery(selectQuery, whereClause, 'ORDER BY al.LogTimestampUtc DESC', pagination);
    const result = await request.query(fullQuery);
    
    res.json({
      success: true,
      data: {
        logs: result.recordset,
        pagination: buildPaginationMeta(pagination.page, pagination.pageSize, total)
      }
    });
  } catch (error) {
    console.error('Error getting attendance logs:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to retrieve attendance logs'
      }
    });
  }
});

// GET /api/v1/attendance/dtr - Get Daily Time Records (computed from AttendanceLogs)
router.get('/dtr', requirePermission('attendance:read:self'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { days } = req.query;
    
    // Get employee ID from user
    const employeeResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('UserId', sql.UniqueIdentifier, userId)
      .query(`
        SELECT e.Id
        FROM dbo.EmployeeUserLink eul
        INNER JOIN dbo.Employees e ON eul.EmployeeId = e.Id
        WHERE eul.UserId = @UserId AND eul.TenantId = @TenantId
      `);
    
    if (employeeResult.recordset.length === 0) {
      res.json({ success: true, data: { records: [] } });
      return;
    }
    
    const employeeId = employeeResult.recordset[0].Id;
    const numDays = parseInt(days as string) || 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - numDays);
    
    // Get attendance logs grouped by date
    const logsResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, employeeId)
      .input('StartDate', sql.Date, startDate)
      .query(`
        SELECT CAST(LogTimestampUtc AS DATE) AS LogDate, LogType, LogTimestampUtc
        FROM dbo.AttendanceLogs
        WHERE TenantId = @TenantId AND EmployeeId = @EmployeeId 
        AND LogTimestampUtc >= @StartDate
        AND IsDeleted = 0
        ORDER BY LogTimestampUtc
      `);
    
    // Group by date and compute DTR
    const dtrMap = new Map<string, { clockIn: string | null; clockOut: string | null }>();
    
    for (const log of logsResult.recordset) {
      const dateKey = new Date(log.LogDate).toISOString().split('T')[0];
      if (!dtrMap.has(dateKey)) {
        dtrMap.set(dateKey, { clockIn: null, clockOut: null });
      }
      const entry = dtrMap.get(dateKey)!;
      if (log.LogType === 'TimeIn' && !entry.clockIn) {
        entry.clockIn = log.LogTimestampUtc;
      }
      if (log.LogType === 'TimeOut') {
        entry.clockOut = log.LogTimestampUtc;
      }
    }
    
    const records = Array.from(dtrMap.entries()).map(([date, data]) => {
      let totalHours = 0;
      if (data.clockIn) {
        const endTime = data.clockOut ? new Date(data.clockOut) : new Date();
        totalHours = Math.round(((endTime.getTime() - new Date(data.clockIn).getTime()) / (1000 * 60 * 60)) * 100) / 100;
      }
      return {
        date,
        clockIn: data.clockIn,
        clockOut: data.clockOut,
        totalHours
      };
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    res.json({
      success: true,
      data: {
        records
      }
    });
  } catch (error) {
    console.error('Error getting DTR:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to retrieve Daily Time Records'
      }
    });
  }
});

// Helper function to calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth's radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// GET /api/v1/attendance/dtr-records - Daily Time Records from computed DailyTimeRecords
router.get('/dtr-records', requirePermission('attendance:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { startDate, endDate, employeeId, status } = req.query;
    const pagination = parsePaginationQuery(req.query);

    let whereClause = 'WHERE dtr.TenantId = @TenantId AND dtr.IsDeleted = 0';
    const countReq = pool.request().input('TenantId', sql.UniqueIdentifier, tenantId);
    const dataReq = pool.request().input('TenantId', sql.UniqueIdentifier, tenantId);

    // If user is not admin/manager, restrict to self
    const hasFullAccess = (req as any).user?.roles?.includes('Admin') ||
      (req as any).user?.roles?.includes('HR Admin') ||
      (req as any).user?.roles?.includes('Payroll Officer') ||
      (req as any).user?.roles?.includes('Department Manager');

    if (!hasFullAccess && !employeeId) {
      const empResult = await pool.request()
        .input('TenantId', sql.UniqueIdentifier, tenantId)
        .input('UserId', sql.UniqueIdentifier, userId)
        .query(`
          SELECT e.Id FROM dbo.EmployeeUserLink eul
          INNER JOIN dbo.Employees e ON eul.EmployeeId = e.Id
          WHERE eul.UserId = @UserId AND eul.TenantId = @TenantId
        `);
      if (empResult.recordset.length > 0) {
        whereClause += ' AND dtr.EmployeeId = @SelfEmployeeId';
        dataReq.input('SelfEmployeeId', sql.UniqueIdentifier, empResult.recordset[0].Id);
        countReq.input('SelfEmployeeId', sql.UniqueIdentifier, empResult.recordset[0].Id);
      }
    } else if (employeeId) {
      whereClause += ' AND dtr.EmployeeId = @EmployeeId';
      dataReq.input('EmployeeId', sql.UniqueIdentifier, employeeId as string);
      countReq.input('EmployeeId', sql.UniqueIdentifier, employeeId as string);
    }

    if (startDate) {
      whereClause += ' AND dtr.WorkDate >= @StartDate';
      dataReq.input('StartDate', sql.Date, new Date(startDate as string));
      countReq.input('StartDate', sql.Date, new Date(startDate as string));
    }
    if (endDate) {
      whereClause += ' AND dtr.WorkDate <= @EndDate';
      dataReq.input('EndDate', sql.Date, new Date(endDate as string));
      countReq.input('EndDate', sql.Date, new Date(endDate as string));
    }
    if (status) {
      whereClause += ' AND dtr.Status = @Status';
      dataReq.input('Status', sql.NVarChar, status as string);
      countReq.input('Status', sql.NVarChar, status as string);
    }

    const countResult = await countReq
      .query(`SELECT COUNT(*) AS total FROM dbo.DailyTimeRecords dtr ${whereClause}`);
    const total = countResult.recordset[0]?.total || 0;

    const result = await dataReq.query(addPaginationToQuery(
      `SELECT dtr.Id, dtr.WorkDate, dtr.ScheduledTimeIn, dtr.ScheduledTimeOut,
              dtr.ActualTimeIn, dtr.ActualTimeOut,
              dtr.LateMinutes, dtr.UndertimeMinutes, dtr.OvertimeMinutes, dtr.NightDiffMinutes,
              dtr.Status, dtr.IsManualEntry, dtr.RemarkNote,
              e.EmployeeNo, e.FirstName, e.LastName, e.DepartmentId,
              d.Name AS DepartmentName
       FROM dbo.DailyTimeRecords dtr
       INNER JOIN dbo.Employees e ON dtr.EmployeeId = e.Id
       LEFT JOIN dbo.Departments d ON e.DepartmentId = d.Id`,
      whereClause,
      'ORDER BY dtr.WorkDate DESC, e.EmployeeNo',
      pagination
    ));

    res.json({
      success: true,
      data: {
        records: result.recordset,
        pagination: buildPaginationMeta(pagination.page, pagination.pageSize, total)
      }
    });
  } catch (error) {
    console.error('Error getting DTR records:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve Daily Time Records' }
    });
  }
});

// GET /api/v1/attendance/dtr-records/pdf - Download DTR PDF report
router.get('/dtr-records/pdf', requirePermission('attendance:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { month, year, employeeId } = req.query;

    const targetMonth = parseInt(month as string) || (new Date().getMonth() + 1);
    const targetYear = parseInt(year as string) || new Date().getFullYear();
    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0);

    let whereClause = 'WHERE dtr.TenantId = @TenantId AND dtr.WorkDate >= @StartDate AND dtr.WorkDate <= @EndDate AND dtr.IsDeleted = 0';
    const request = pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('StartDate', sql.Date, startDate)
      .input('EndDate', sql.Date, endDate);

    if (employeeId) {
      whereClause += ' AND dtr.EmployeeId = @EmployeeId';
      request.input('EmployeeId', sql.UniqueIdentifier, employeeId as string);
    }

    // Get tenant info for the report header
    const tenantResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query('SELECT CompanyName, CompanyCode FROM dbo.Tenants WHERE Id = @TenantId');
    const tenant = tenantResult.recordset[0];

    const result = await request.query(`
      SELECT dtr.WorkDate, dtr.ScheduledTimeIn, dtr.ScheduledTimeOut,
             dtr.ActualTimeIn, dtr.ActualTimeOut,
             dtr.LateMinutes, dtr.UndertimeMinutes, dtr.OvertimeMinutes, dtr.NightDiffMinutes,
             dtr.Status,
             e.EmployeeNo, e.FirstName, e.LastName
      FROM dbo.DailyTimeRecords dtr
      INNER JOIN dbo.Employees e ON dtr.EmployeeId = e.Id
      ${whereClause}
      ORDER BY e.EmployeeNo, dtr.WorkDate
    `);

    res.json({
      success: true,
      data: {
        records: result.recordset,
        meta: {
          companyName: tenant?.CompanyName || '',
          period: `${targetMonth.toString().padStart(2, '0')}/${targetYear}`
        }
      }
    });
  } catch (error) {
    console.error('Error getting DTR PDF data:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve DTR data for PDF' }
    });
  }
});

// POST /api/v1/attendance/biometric-ingest - Webhook for biometric devices
router.post('/biometric-ingest', async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const { employeeNo, biometricId, timestamp, deviceId, logType } = req.body;
    
    if (!employeeNo && !biometricId) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'employeeNo or biometricId is required'
        }
      });
      return;
    }
    
    if (!timestamp) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'timestamp is required'
        }
      });
      return;
    }
    
    // Tenant is resolved from device key (auth middleware) or JWT
    let tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Tenant context not available' }
      });
      return;
    }
    
    // Set tenant context for RLS
    await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`EXEC sp_set_session_context @key = N'TenantId', @value = @TenantId;`);
    
    // Find employee by EmployeeNo or biometric device ID
    let employeeId: string | null = null;
    
    if (employeeNo) {
      const empResult = await pool.request()
        .input('TenantId', sql.UniqueIdentifier, tenantId)
        .input('EmployeeNo', sql.NVarChar, employeeNo)
        .query(`
          SELECT Id FROM dbo.Employees
          WHERE TenantId = @TenantId AND EmployeeNo = @EmployeeNo AND IsActive = 1 AND IsDeleted = 0
        `);
      if (empResult.recordset.length > 0) {
        employeeId = empResult.recordset[0].Id;
      }
    }
    
    if (!employeeId && biometricId) {
      const empResult = await pool.request()
        .input('TenantId', sql.UniqueIdentifier, tenantId)
        .input('BiometricId', sql.NVarChar, biometricId)
        .query(`
          SELECT e.Id FROM dbo.Employees e
          WHERE e.TenantId = @TenantId AND e.EmployeeNo = @BiometricId AND e.IsActive = 1 AND e.IsDeleted = 0
        `);
      if (empResult.recordset.length > 0) {
        employeeId = empResult.recordset[0].Id;
      }
    }
    
    if (!employeeId) {
      res.status(404).json({
        success: false,
        error: {
          code: 'EMPLOYEE_NOT_FOUND',
          message: 'No active employee found for the given identifier'
        }
      });
      return;
    }
    
    // Determine log type (IN/OUT) - default to IN if not specified
    const resolvedLogType = logType === 'OUT' ? 'OUT' : 'IN';
    
    // Insert attendance log
    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, employeeId)
      .input('LogType', sql.NVarChar, resolvedLogType)
      .input('LogTimestampUtc', sql.DateTime2, new Date(timestamp))
      .input('DeviceId', sql.NVarChar, deviceId || null)
      .input('RawBiometricPayload', sql.NVarChar(sql.MAX), JSON.stringify(req.body))
      .query(`
        INSERT INTO dbo.AttendanceLogs (
          TenantId, EmployeeId, LogType, LogTimestampUtc,
          DeviceId, RawBiometricPayload
        )
        OUTPUT INSERTED.Id
        VALUES (
          @TenantId, @EmployeeId, @LogType, @LogTimestampUtc,
          @DeviceId, @RawBiometricPayload
        );
      `);
    
    await logAuditEvent(pool, {
      tenantId: tenantId!,
      action: 'BIOMETRIC_INGEST',
      entityName: 'AttendanceLog',
      entityId: result.recordset[0].Id,
      afterJson: { employeeId, logType: resolvedLogType, timestamp, deviceId },
      ipAddress: extractIp(req)
    });
    
    res.status(201).json({
      success: true,
      data: {
        id: result.recordset[0].Id,
        message: 'Biometric attendance recorded'
      }
    });
  } catch (error) {
    console.error('Error processing biometric ingest:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to process biometric attendance'
      }
    });
  }
});

// POST /api/v1/attendance/compute-dtr - Manual DTR computation trigger (admin only)
router.post('/compute-dtr', requirePermission('attendance:read'), blockIfPayrollLocked, async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { date } = req.body;
    
    const targetDate = date ? new Date(date) : new Date();
    targetDate.setDate(targetDate.getDate() - 1); // Default: yesterday
    
    const count = await computeDailyDtr(pool, tenantId!, targetDate);
    
    res.json({
      success: true,
      data: {
        message: `DTR computed for ${count} employees`,
        date: targetDate.toISOString().split('T')[0],
        employeesProcessed: count
      }
    });
  } catch (error) {
    console.error('Error computing DTR:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'COMPUTATION_ERROR',
        message: 'Failed to compute DTR'
      }
    });
  }
});

// ─── Shifts CRUD ────────────────────────────────────────────────

router.get('/shifts', requirePermission('attendance:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const pagination = parsePaginationQuery(req.query);

    const countResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`SELECT COUNT(*) AS total FROM dbo.Shifts WHERE TenantId = @TenantId AND IsDeleted = 0`);
    const total = countResult.recordset[0]?.total || 0;

    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(addPaginationToQuery(
        `SELECT Id, Name, TimeIn, TimeOut, BreakMinutes, GraceMinutesLate, IsNightShift FROM dbo.Shifts`,
        `WHERE TenantId = @TenantId AND IsDeleted = 0`,
        'ORDER BY Name',
        pagination
      ));

    res.json({ success: true, data: { shifts: result.recordset, pagination: buildPaginationMeta(pagination.page, pagination.pageSize, total) } });
  } catch (error) {
    console.error('Error getting shifts:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve shifts' } });
  }
});

router.post('/shifts', requirePermission('attendance:manage'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { name, timeIn, timeOut, breakMinutes, graceMinutesLate, isNightShift } = req.body;

    if (!name || !timeIn || !timeOut) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'name, timeIn, timeOut are required' } });
      return;
    }

    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Name', sql.NVarChar, name)
      .input('TimeIn', sql.NVarChar, timeIn)
      .input('TimeOut', sql.NVarChar, timeOut)
      .input('BreakMinutes', sql.Int, breakMinutes || 0)
      .input('GraceMinutesLate', sql.Int, graceMinutesLate || 0)
      .input('IsNightShift', sql.Bit, isNightShift || false)
      .input('CreatedBy', sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO dbo.Shifts (TenantId, Name, TimeIn, TimeOut, BreakMinutes, GraceMinutesLate, IsNightShift, CreatedBy)
        OUTPUT INSERTED.Id
        VALUES (@TenantId, @Name, @TimeIn, @TimeOut, @BreakMinutes, @GraceMinutesLate, @IsNightShift, @CreatedBy);
      `);

    res.status(201).json({ success: true, data: { id: result.recordset[0].Id, name, timeIn, timeOut } });
  } catch (error) {
    console.error('Error creating shift:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to create shift' } });
  }
});

router.put('/shifts/:id', requirePermission('attendance:manage'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { id } = req.params;
    const { name, timeIn, timeOut, breakMinutes, graceMinutesLate, isNightShift } = req.body;

    const result = await pool.request()
      .input('Id', sql.UniqueIdentifier, id as string)
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Name', sql.NVarChar, name)
      .input('TimeIn', sql.NVarChar, timeIn)
      .input('TimeOut', sql.NVarChar, timeOut)
      .input('BreakMinutes', sql.Int, breakMinutes)
      .input('GraceMinutesLate', sql.Int, graceMinutesLate)
      .input('IsNightShift', sql.Bit, isNightShift)
      .query(`
        UPDATE dbo.Shifts SET Name = @Name, TimeIn = @TimeIn, TimeOut = @TimeOut,
          BreakMinutes = @BreakMinutes, GraceMinutesLate = @GraceMinutesLate, IsNightShift = @IsNightShift
        WHERE Id = @Id AND TenantId = @TenantId AND IsDeleted = 0;
        SELECT @@ROWCOUNT AS affected;
      `);

    if (result.recordset[0].affected === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Shift not found' } });
      return;
    }
    res.json({ success: true, data: { message: 'Shift updated' } });
  } catch (error) {
    console.error('Error updating shift:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to update shift' } });
  }
});

router.delete('/shifts/:id', requirePermission('attendance:manage'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { id } = req.params;

    const result = await pool.request()
      .input('Id', sql.UniqueIdentifier, id as string)
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`UPDATE dbo.Shifts SET IsDeleted = 1 WHERE Id = @Id AND TenantId = @TenantId AND IsDeleted = 0; SELECT @@ROWCOUNT AS affected;`);

    if (result.recordset[0].affected === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Shift not found' } });
      return;
    }
    res.json({ success: true, data: { message: 'Shift deleted' } });
  } catch (error) {
    console.error('Error deleting shift:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to delete shift' } });
  }
});

// ─── Employee Schedules CRUD ─────────────────────────────────────

router.get('/schedules', requirePermission('attendance:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { employeeId, shiftId } = req.query;
    const pagination = parsePaginationQuery(req.query);

    let whereClause = 'WHERE es.TenantId = @TenantId AND es.IsDeleted = 0';

    const countReq = pool.request().input('TenantId', sql.UniqueIdentifier, tenantId);
    const dataReq = pool.request().input('TenantId', sql.UniqueIdentifier, tenantId);

    if (employeeId) {
      whereClause += ' AND es.EmployeeId = @EmployeeId';
      countReq.input('EmployeeId', sql.UniqueIdentifier, employeeId as string);
      dataReq.input('EmployeeId', sql.UniqueIdentifier, employeeId as string);
    }
    if (shiftId) {
      whereClause += ' AND es.ShiftId = @ShiftId';
      countReq.input('ShiftId', sql.UniqueIdentifier, shiftId as string);
      dataReq.input('ShiftId', sql.UniqueIdentifier, shiftId as string);
    }

    const countResult = await countReq
      .query(`SELECT COUNT(*) AS total FROM dbo.EmployeeSchedules es ${whereClause}`);
    const total = countResult.recordset[0]?.total || 0;

    const result = await dataReq.query(addPaginationToQuery(
      `SELECT es.Id, es.EmployeeId, es.ShiftId, es.EffectiveDate, es.DayOfWeekPattern, es.ExpiryDate,
              e.EmployeeNo, e.FirstName, e.LastName, s.Name AS ShiftName
       FROM dbo.EmployeeSchedules es
       INNER JOIN dbo.Employees e ON es.EmployeeId = e.Id
       INNER JOIN dbo.Shifts s ON es.ShiftId = s.Id`,
      whereClause,
      'ORDER BY es.EffectiveDate DESC',
      pagination
    ));

    res.json({ success: true, data: { schedules: result.recordset, pagination: buildPaginationMeta(pagination.page, pagination.pageSize, total) } });
  } catch (error) {
    console.error('Error getting schedules:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve schedules' } });
  }
});

router.post('/schedules', requirePermission('attendance:manage'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { employeeId, shiftId, effectiveDate, dayOfWeekPattern, expiryDate } = req.body;

    if (!employeeId || !shiftId || !effectiveDate) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'employeeId, shiftId, effectiveDate are required' } });
      return;
    }

    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, employeeId)
      .input('ShiftId', sql.UniqueIdentifier, shiftId)
      .input('EffectiveDate', sql.Date, new Date(effectiveDate))
      .input('DayOfWeekPattern', sql.NVarChar, dayOfWeekPattern || null)
      .input('ExpiryDate', sql.Date, expiryDate ? new Date(expiryDate) : null)
      .input('CreatedBy', sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO dbo.EmployeeSchedules (TenantId, EmployeeId, ShiftId, EffectiveDate, DayOfWeekPattern, ExpiryDate, CreatedBy)
        OUTPUT INSERTED.Id
        VALUES (@TenantId, @EmployeeId, @ShiftId, @EffectiveDate, @DayOfWeekPattern, @ExpiryDate, @CreatedBy);
      `);

    res.status(201).json({ success: true, data: { id: result.recordset[0].Id } });
  } catch (error) {
    console.error('Error creating schedule:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to create schedule' } });
  }
});

router.put('/schedules/:id', requirePermission('attendance:manage'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { id } = req.params;
    const { employeeId, shiftId, effectiveDate, dayOfWeekPattern, expiryDate } = req.body;

    const result = await pool.request()
      .input('Id', sql.UniqueIdentifier, id as string)
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, employeeId)
      .input('ShiftId', sql.UniqueIdentifier, shiftId)
      .input('EffectiveDate', sql.Date, new Date(effectiveDate))
      .input('DayOfWeekPattern', sql.NVarChar, dayOfWeekPattern || null)
      .input('ExpiryDate', sql.Date, expiryDate ? new Date(expiryDate) : null)
      .query(`
        UPDATE dbo.EmployeeSchedules SET EmployeeId = @EmployeeId, ShiftId = @ShiftId,
          EffectiveDate = @EffectiveDate, DayOfWeekPattern = @DayOfWeekPattern, ExpiryDate = @ExpiryDate
        WHERE Id = @Id AND TenantId = @TenantId AND IsDeleted = 0;
        SELECT @@ROWCOUNT AS affected;
      `);

    if (result.recordset[0].affected === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Schedule not found' } });
      return;
    }
    res.json({ success: true, data: { message: 'Schedule updated' } });
  } catch (error) {
    console.error('Error updating schedule:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to update schedule' } });
  }
});

router.delete('/schedules/:id', requirePermission('attendance:manage'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { id } = req.params;

    const result = await pool.request()
      .input('Id', sql.UniqueIdentifier, id as string)
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`UPDATE dbo.EmployeeSchedules SET IsDeleted = 1 WHERE Id = @Id AND TenantId = @TenantId AND IsDeleted = 0; SELECT @@ROWCOUNT AS affected;`);

    if (result.recordset[0].affected === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Schedule not found' } });
      return;
    }
    res.json({ success: true, data: { message: 'Schedule deleted' } });
  } catch (error) {
    console.error('Error deleting schedule:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to delete schedule' } });
  }
});

// ─── Geofences CRUD ──────────────────────────────────────────────

router.get('/geofences', requirePermission('attendance:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const pagination = parsePaginationQuery(req.query);

    const countResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`SELECT COUNT(*) AS total FROM dbo.Geofences WHERE TenantId = @TenantId AND IsDeleted = 0`);
    const total = countResult.recordset[0]?.total || 0;

    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(addPaginationToQuery(
        `SELECT Id, Name, Latitude, Longitude, RadiusMeters FROM dbo.Geofences`,
        `WHERE TenantId = @TenantId AND IsDeleted = 0`,
        'ORDER BY Name',
        pagination
      ));

    res.json({ success: true, data: { geofences: result.recordset, pagination: buildPaginationMeta(pagination.page, pagination.pageSize, total) } });
  } catch (error) {
    console.error('Error getting geofences:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve geofences' } });
  }
});

router.post('/geofences', requirePermission('attendance:manage'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { name, latitude, longitude, radiusMeters } = req.body;

    if (!name || latitude == null || longitude == null) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'name, latitude, longitude are required' } });
      return;
    }

    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Name', sql.NVarChar, name)
      .input('Latitude', sql.Decimal(10, 8), latitude)
      .input('Longitude', sql.Decimal(11, 8), longitude)
      .input('RadiusMeters', sql.Int, radiusMeters || 100)
      .input('CreatedBy', sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO dbo.Geofences (TenantId, Name, Latitude, Longitude, RadiusMeters, CreatedBy)
        OUTPUT INSERTED.Id
        VALUES (@TenantId, @Name, @Latitude, @Longitude, @RadiusMeters, @CreatedBy);
      `);

    res.status(201).json({ success: true, data: { id: result.recordset[0].Id, name, latitude, longitude } });
  } catch (error) {
    console.error('Error creating geofence:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to create geofence' } });
  }
});

router.put('/geofences/:id', requirePermission('attendance:manage'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { id } = req.params;
    const { name, latitude, longitude, radiusMeters } = req.body;

    const result = await pool.request()
      .input('Id', sql.UniqueIdentifier, id as string)
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Name', sql.NVarChar, name)
      .input('Latitude', sql.Decimal(10, 8), latitude)
      .input('Longitude', sql.Decimal(11, 8), longitude)
      .input('RadiusMeters', sql.Int, radiusMeters)
      .query(`
        UPDATE dbo.Geofences SET Name = @Name, Latitude = @Latitude, Longitude = @Longitude, RadiusMeters = @RadiusMeters
        WHERE Id = @Id AND TenantId = @TenantId AND IsDeleted = 0;
        SELECT @@ROWCOUNT AS affected;
      `);

    if (result.recordset[0].affected === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Geofence not found' } });
      return;
    }
    res.json({ success: true, data: { message: 'Geofence updated' } });
  } catch (error) {
    console.error('Error updating geofence:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to update geofence' } });
  }
});

router.delete('/geofences/:id', requirePermission('attendance:manage'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { id } = req.params;

    const result = await pool.request()
      .input('Id', sql.UniqueIdentifier, id as string)
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`UPDATE dbo.Geofences SET IsDeleted = 1 WHERE Id = @Id AND TenantId = @TenantId AND IsDeleted = 0; SELECT @@ROWCOUNT AS affected;`);

    if (result.recordset[0].affected === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Geofence not found' } });
      return;
    }
    res.json({ success: true, data: { message: 'Geofence deleted' } });
  } catch (error) {
    console.error('Error deleting geofence:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to delete geofence' } });
  }
});

// ─── Holidays CRUD ───────────────────────────────────────────────

router.get('/holidays', requirePermission('attendance:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { year, type } = req.query;
    const pagination = parsePaginationQuery(req.query);

    let whereClause = 'WHERE TenantId = @TenantId AND IsDeleted = 0';

    const countReq = pool.request().input('TenantId', sql.UniqueIdentifier, tenantId);
    const dataReq = pool.request().input('TenantId', sql.UniqueIdentifier, tenantId);

    if (year) {
      whereClause += ' AND YEAR(HolidayDate) = @Year';
      countReq.input('Year', sql.Int, parseInt(year as string));
      dataReq.input('Year', sql.Int, parseInt(year as string));
    }
    if (type) {
      whereClause += ' AND Type = @Type';
      countReq.input('Type', sql.NVarChar, type as string);
      dataReq.input('Type', sql.NVarChar, type as string);
    }

    const countResult = await countReq
      .query(`SELECT COUNT(*) AS total FROM dbo.Holidays ${whereClause}`);
    const total = countResult.recordset[0]?.total || 0;

    const result = await dataReq.query(addPaginationToQuery(
      `SELECT Id, HolidayDate, Name, Type FROM dbo.Holidays`,
      whereClause,
      'ORDER BY HolidayDate',
      pagination
    ));

    res.json({ success: true, data: { holidays: result.recordset, pagination: buildPaginationMeta(pagination.page, pagination.pageSize, total) } });
  } catch (error) {
    console.error('Error getting holidays:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve holidays' } });
  }
});

router.post('/holidays', requirePermission('attendance:manage'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { holidayDate, name, type } = req.body;

    if (!holidayDate || !name || !type) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'holidayDate, name, type are required' } });
      return;
    }

    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('HolidayDate', sql.Date, new Date(holidayDate))
      .input('Name', sql.NVarChar, name)
      .input('Type', sql.NVarChar, type)
      .input('CreatedBy', sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO dbo.Holidays (TenantId, HolidayDate, Name, Type, CreatedBy)
        OUTPUT INSERTED.Id
        VALUES (@TenantId, @HolidayDate, @Name, @Type, @CreatedBy);
      `);

    res.status(201).json({ success: true, data: { id: result.recordset[0].Id, holidayDate, name, type } });
  } catch (error) {
    console.error('Error creating holiday:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to create holiday' } });
  }
});

router.put('/holidays/:id', requirePermission('attendance:manage'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { id } = req.params;
    const { holidayDate, name, type } = req.body;

    const result = await pool.request()
      .input('Id', sql.UniqueIdentifier, id as string)
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('HolidayDate', sql.Date, new Date(holidayDate))
      .input('Name', sql.NVarChar, name)
      .input('Type', sql.NVarChar, type)
      .query(`
        UPDATE dbo.Holidays SET HolidayDate = @HolidayDate, Name = @Name, Type = @Type
        WHERE Id = @Id AND TenantId = @TenantId AND IsDeleted = 0;
        SELECT @@ROWCOUNT AS affected;
      `);

    if (result.recordset[0].affected === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Holiday not found' } });
      return;
    }
    res.json({ success: true, data: { message: 'Holiday updated' } });
  } catch (error) {
    console.error('Error updating holiday:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to update holiday' } });
  }
});

router.delete('/holidays/:id', requirePermission('attendance:manage'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { id } = req.params;

    const result = await pool.request()
      .input('Id', sql.UniqueIdentifier, id as string)
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`UPDATE dbo.Holidays SET IsDeleted = 1 WHERE Id = @Id AND TenantId = @TenantId AND IsDeleted = 0; SELECT @@ROWCOUNT AS affected;`);

    if (result.recordset[0].affected === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Holiday not found' } });
      return;
    }
    res.json({ success: true, data: { message: 'Holiday deleted' } });
  } catch (error) {
    console.error('Error deleting holiday:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to delete holiday' } });
  }
});

// ─── Device Registry ─────────────────────────────────────────────

router.get('/devices', requirePermission('attendance:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const pagination = parsePaginationQuery(req.query);

    const countResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`SELECT COUNT(*) AS total FROM dbo.DeviceRegistry WHERE TenantId = @TenantId AND IsDeleted = 0`);
    const total = countResult.recordset[0]?.total || 0;

    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(addPaginationToQuery(
        `SELECT dr.Id, dr.DeviceId, dr.DeviceType, dr.RegisteredAtUtc, dr.IsTrusted,
                e.EmployeeNo, e.FirstName, e.LastName
         FROM dbo.DeviceRegistry dr
         INNER JOIN dbo.Employees e ON dr.EmployeeId = e.Id`,
        `WHERE dr.TenantId = @TenantId AND dr.IsDeleted = 0`,
        'ORDER BY dr.RegisteredAtUtc DESC',
        pagination
      ));

    res.json({ success: true, data: { devices: result.recordset, pagination: buildPaginationMeta(pagination.page, pagination.pageSize, total) } });
  } catch (error) {
    console.error('Error getting devices:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve devices' } });
  }
});

router.post('/devices', requirePermission('attendance:manage'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { employeeId, deviceId, deviceType, isTrusted } = req.body;

    if (!employeeId || !deviceId) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'employeeId, deviceId are required' } });
      return;
    }

    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, employeeId)
      .input('DeviceId', sql.NVarChar, deviceId)
      .input('DeviceType', sql.NVarChar, deviceType || 'Web')
      .input('RegisteredAtUtc', sql.DateTime2, new Date())
      .input('IsTrusted', sql.Bit, isTrusted || false)
      .input('CreatedBy', sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO dbo.DeviceRegistry (TenantId, EmployeeId, DeviceId, DeviceType, RegisteredAtUtc, IsTrusted, CreatedBy)
        OUTPUT INSERTED.Id
        VALUES (@TenantId, @EmployeeId, @DeviceId, @DeviceType, @RegisteredAtUtc, @IsTrusted, @CreatedBy);
      `);

    res.status(201).json({ success: true, data: { id: result.recordset[0].Id, deviceId, deviceType } });
  } catch (error) {
    console.error('Error registering device:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to register device' } });
  }
});

router.delete('/devices/:id', requirePermission('attendance:manage'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { id } = req.params;

    const result = await pool.request()
      .input('Id', sql.UniqueIdentifier, id as string)
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`UPDATE dbo.DeviceRegistry SET IsDeleted = 1 WHERE Id = @Id AND TenantId = @TenantId AND IsDeleted = 0; SELECT @@ROWCOUNT AS affected;`);

    if (result.recordset[0].affected === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Device not found' } });
      return;
    }
    res.json({ success: true, data: { message: 'Device removed' } });
  } catch (error) {
    console.error('Error removing device:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to remove device' } });
  }
});

// ─── Overtime Requests ───────────────────────────────────────────

router.get('/overtime', requirePermission('attendance:read:self'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { status, employeeId, startDate, endDate } = req.query;
    const pagination = parsePaginationQuery(req.query);

    let whereClause = 'WHERE o.TenantId = @TenantId AND o.IsDeleted = 0';

    // If not admin-level, restrict to own records
    const hasFullAccess = await hasAttendanceAccess(pool, tenantId!, userId!);
    const countReq = pool.request().input('TenantId', sql.UniqueIdentifier, tenantId);
    const dataReq = pool.request().input('TenantId', sql.UniqueIdentifier, tenantId);

    if (!hasFullAccess && !employeeId) {
      const empId = await getEmployeeId(pool, tenantId!, userId!);
      if (empId) {
        whereClause += ' AND o.EmployeeId = @OwnEmployeeId';
        countReq.input('OwnEmployeeId', sql.UniqueIdentifier, empId);
        dataReq.input('OwnEmployeeId', sql.UniqueIdentifier, empId);
      }
    } else if (employeeId) {
      whereClause += ' AND o.EmployeeId = @EmployeeId';
      countReq.input('EmployeeId', sql.UniqueIdentifier, employeeId as string);
      dataReq.input('EmployeeId', sql.UniqueIdentifier, employeeId as string);
    }

    if (status) {
      whereClause += ' AND o.Status = @Status';
      countReq.input('Status', sql.NVarChar, status as string);
      dataReq.input('Status', sql.NVarChar, status as string);
    }
    if (startDate) {
      whereClause += ' AND o.WorkDate >= @StartDate';
      countReq.input('StartDate', sql.Date, new Date(startDate as string));
      dataReq.input('StartDate', sql.Date, new Date(startDate as string));
    }
    if (endDate) {
      whereClause += ' AND o.WorkDate <= @EndDate';
      countReq.input('EndDate', sql.Date, new Date(endDate as string));
      dataReq.input('EndDate', sql.Date, new Date(endDate as string));
    }

    const countResult = await countReq
      .query(`SELECT COUNT(*) AS total FROM dbo.OvertimeRequests o ${whereClause}`);
    const total = countResult.recordset[0]?.total || 0;

    const result = await dataReq.query(addPaginationToQuery(
      `SELECT o.Id, o.WorkDate, o.RequestedHours, o.Reason, o.Status, o.ApproverId, o.ApprovedAtUtc,
              e.EmployeeNo, e.FirstName, e.LastName
       FROM dbo.OvertimeRequests o
       INNER JOIN dbo.Employees e ON o.EmployeeId = e.Id`,
      whereClause,
      'ORDER BY o.WorkDate DESC',
      pagination
    ));

    res.json({ success: true, data: { requests: result.recordset, pagination: buildPaginationMeta(pagination.page, pagination.pageSize, total) } });
  } catch (error) {
    console.error('Error getting overtime requests:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve overtime requests' } });
  }
});

router.get('/overtime/:id', requirePermission('attendance:read:self'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { id } = req.params;

    const result = await pool.request()
      .input('Id', sql.UniqueIdentifier, id as string)
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        SELECT o.Id, o.WorkDate, o.RequestedHours, o.Reason, o.Status, o.ApproverId, o.ApprovedAtUtc,
               e.EmployeeNo, e.FirstName, e.LastName
        FROM dbo.OvertimeRequests o
        INNER JOIN dbo.Employees e ON o.EmployeeId = e.Id
        WHERE o.Id = @Id AND o.TenantId = @TenantId AND o.IsDeleted = 0
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Overtime request not found' } });
      return;
    }
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    console.error('Error getting overtime request:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve overtime request' } });
  }
});

router.post('/overtime', requirePermission('attendance:write:self'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { workDate, requestedHours, reason } = req.body;

    if (!workDate || !requestedHours) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'workDate, requestedHours are required' } });
      return;
    }

    const employeeId = await getEmployeeId(pool, tenantId!, userId!);
    if (!employeeId) {
      res.status(404).json({ success: false, error: { code: 'EMPLOYEE_NOT_FOUND', message: 'No employee linked to this user' } });
      return;
    }

    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, employeeId)
      .input('WorkDate', sql.Date, new Date(workDate))
      .input('RequestedHours', sql.Decimal(5, 2), requestedHours)
      .input('Reason', sql.NVarChar, reason || null)
      .input('CreatedBy', sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO dbo.OvertimeRequests (TenantId, EmployeeId, WorkDate, RequestedHours, Reason, Status, CreatedBy)
        OUTPUT INSERTED.Id
        VALUES (@TenantId, @EmployeeId, @WorkDate, @RequestedHours, @Reason, 'Pending', @CreatedBy);
      `);

    res.status(201).json({ success: true, data: { id: result.recordset[0].Id, status: 'Pending' } });
  } catch (error) {
    console.error('Error creating overtime request:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to create overtime request' } });
  }
});

router.put('/overtime/:id/cancel', requirePermission('attendance:write:self'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { id } = req.params;

    const employeeId = await getEmployeeId(pool, tenantId!, userId!);
    if (!employeeId) {
      res.status(404).json({ success: false, error: { code: 'EMPLOYEE_NOT_FOUND', message: 'No employee linked to this user' } });
      return;
    }

    const result = await pool.request()
      .input('Id', sql.UniqueIdentifier, id as string)
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, employeeId)
      .query(`
        UPDATE dbo.OvertimeRequests SET Status = 'Cancelled'
        WHERE Id = @Id AND TenantId = @TenantId AND EmployeeId = @EmployeeId AND Status = 'Pending' AND IsDeleted = 0;
        SELECT @@ROWCOUNT AS affected;
      `);

    if (result.recordset[0].affected === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Pending overtime request not found' } });
      return;
    }
    res.json({ success: true, data: { message: 'Overtime request cancelled' } });
  } catch (error) {
    console.error('Error cancelling overtime request:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to cancel overtime request' } });
  }
});

router.put('/overtime/:id/approve', requirePermission('attendance:approve'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { id } = req.params;

    const result = await pool.request()
      .input('Id', sql.UniqueIdentifier, id as string)
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('ApproverId', sql.UniqueIdentifier, userId)
      .query(`
        UPDATE dbo.OvertimeRequests SET Status = 'Approved', ApproverId = @ApproverId, ApprovedAtUtc = GETUTCDATE()
        WHERE Id = @Id AND TenantId = @TenantId AND Status = 'Pending' AND IsDeleted = 0;
        SELECT @@ROWCOUNT AS affected;
      `);

    if (result.recordset[0].affected === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Pending overtime request not found' } });
      return;
    }
    res.json({ success: true, data: { message: 'Overtime request approved' } });
  } catch (error) {
    console.error('Error approving overtime request:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to approve overtime request' } });
  }
});

router.put('/overtime/:id/reject', requirePermission('attendance:approve'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { id } = req.params;

    const result = await pool.request()
      .input('Id', sql.UniqueIdentifier, id as string)
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('ApproverId', sql.UniqueIdentifier, userId)
      .query(`
        UPDATE dbo.OvertimeRequests SET Status = 'Rejected', ApproverId = @ApproverId, ApprovedAtUtc = GETUTCDATE()
        WHERE Id = @Id AND TenantId = @TenantId AND Status = 'Pending' AND IsDeleted = 0;
        SELECT @@ROWCOUNT AS affected;
      `);

    if (result.recordset[0].affected === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Pending overtime request not found' } });
      return;
    }
    res.json({ success: true, data: { message: 'Overtime request rejected' } });
  } catch (error) {
    console.error('Error rejecting overtime request:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to reject overtime request' } });
  }
});

// ─── DTR Admin View & Manual Correction ──────────────────────────

// Helper: check if user has attendance:approve or attendance:manage
async function hasAttendanceAccess(pool: any, tenantId: string, userId: string): Promise<boolean> {
  const result = await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .input('UserId', sql.UniqueIdentifier, userId)
    .query(`
      SELECT 1 FROM dbo.UserRoles ur
      INNER JOIN dbo.RolePermissions rp ON ur.RoleId = rp.RoleId AND ur.TenantId = rp.TenantId
      INNER JOIN dbo.Permissions p ON rp.PermissionId = p.Id
      WHERE ur.UserId = @UserId AND ur.TenantId = @TenantId
        AND (p.Code IN ('attendance:approve', 'attendance:manage', 'attendance:read'))
      AND ur.IsDeleted = 0 AND rp.IsDeleted = 0 AND p.IsDeleted = 0
    `);
  return result.recordset.length > 0;
}

async function getEmployeeId(pool: any, tenantId: string, userId: string): Promise<string | null> {
  const result = await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .input('UserId', sql.UniqueIdentifier, userId)
    .query(`
      SELECT e.Id FROM dbo.EmployeeUserLink eul
      INNER JOIN dbo.Employees e ON eul.EmployeeId = e.Id
      WHERE eul.UserId = @UserId AND eul.TenantId = @TenantId
    `);
  return result.recordset.length > 0 ? result.recordset[0].Id : null;
}

router.get('/dtr/admin', requirePermission('attendance:approve'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { employeeId, startDate, endDate, status } = req.query;
    const pagination = parsePaginationQuery(req.query);

    let whereClause = 'WHERE dtr.TenantId = @TenantId AND dtr.IsDeleted = 0';

    const countReq = pool.request().input('TenantId', sql.UniqueIdentifier, tenantId);
    const dataReq = pool.request().input('TenantId', sql.UniqueIdentifier, tenantId);

    if (employeeId) {
      whereClause += ' AND dtr.EmployeeId = @EmployeeId';
      countReq.input('EmployeeId', sql.UniqueIdentifier, employeeId as string);
      dataReq.input('EmployeeId', sql.UniqueIdentifier, employeeId as string);
    }
    if (startDate) {
      whereClause += ' AND dtr.WorkDate >= @StartDate';
      countReq.input('StartDate', sql.Date, new Date(startDate as string));
      dataReq.input('StartDate', sql.Date, new Date(startDate as string));
    }
    if (endDate) {
      whereClause += ' AND dtr.WorkDate <= @EndDate';
      countReq.input('EndDate', sql.Date, new Date(endDate as string));
      dataReq.input('EndDate', sql.Date, new Date(endDate as string));
    }
    if (status) {
      whereClause += ' AND dtr.Status = @Status';
      countReq.input('Status', sql.NVarChar, status as string);
      dataReq.input('Status', sql.NVarChar, status as string);
    }

    const countResult = await countReq
      .query(`SELECT COUNT(*) AS total FROM dbo.DailyTimeRecords dtr ${whereClause}`);
    const total = countResult.recordset[0]?.total || 0;

    const result = await dataReq.query(addPaginationToQuery(
      `SELECT dtr.Id, dtr.EmployeeId, dtr.WorkDate, dtr.ScheduledTimeIn, dtr.ScheduledTimeOut,
              dtr.ActualTimeIn, dtr.ActualTimeOut, dtr.LateMinutes, dtr.UndertimeMinutes,
              dtr.OvertimeMinutes, dtr.NightDiffMinutes, dtr.Status, dtr.IsManualEntry, dtr.RemarkNote,
              e.EmployeeNo, e.FirstName, e.LastName
       FROM dbo.DailyTimeRecords dtr
       INNER JOIN dbo.Employees e ON dtr.EmployeeId = e.Id`,
      whereClause,
      'ORDER BY dtr.WorkDate DESC',
      pagination
    ));

    res.json({ success: true, data: { records: result.recordset, pagination: buildPaginationMeta(pagination.page, pagination.pageSize, total) } });
  } catch (error) {
    console.error('Error getting admin DTR:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve DTR records' } });
  }
});

router.put('/dtr/:id/correct', requirePermission('attendance:approve'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { id } = req.params;
    const { actualTimeIn, actualTimeOut, lateMinutes, undertimeMinutes, overtimeMinutes, nightDiffMinutes, status, remarkNote } = req.body;

    // Get existing record for audit
    const existingResult = await pool.request()
      .input('Id', sql.UniqueIdentifier, id as string)
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`SELECT * FROM dbo.DailyTimeRecords WHERE Id = @Id AND TenantId = @TenantId AND IsDeleted = 0`);

    if (existingResult.recordset.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'DTR record not found' } });
      return;
    }

    const existing = existingResult.recordset[0];

    // Lock attendance edits when payroll period is >= Processing
    const lockedCheck = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('WorkDate', sql.Date, existing.WorkDate)
      .query(`
        SELECT TOP 1 pp.Status
        FROM dbo.PayrollPeriods pp
        WHERE pp.TenantId = @TenantId AND pp.IsDeleted = 0
          AND pp.PeriodStart <= @WorkDate AND pp.PeriodEnd >= @WorkDate
          AND pp.Status IN ('Processing','Approved','Paid','Closed')
      `);

    if (lockedCheck.recordset.length > 0) {
      res.status(403).json({
        success: false,
        error: {
          code: 'PAYROLL_LOCKED',
          message: `Cannot edit DTR: payroll period is in '${lockedCheck.recordset[0].Status}' status`
        }
      });
      return;
    }

    await pool.request()
      .input('Id', sql.UniqueIdentifier, id as string)
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('ActualTimeIn', sql.DateTime2, actualTimeIn ? new Date(actualTimeIn) : existing.ActualTimeIn)
      .input('ActualTimeOut', sql.DateTime2, actualTimeOut ? new Date(actualTimeOut) : existing.ActualTimeOut)
      .input('LateMinutes', sql.Int, lateMinutes ?? existing.LateMinutes)
      .input('UndertimeMinutes', sql.Int, undertimeMinutes ?? existing.UndertimeMinutes)
      .input('OvertimeMinutes', sql.Int, overtimeMinutes ?? existing.OvertimeMinutes)
      .input('NightDiffMinutes', sql.Int, nightDiffMinutes ?? existing.NightDiffMinutes)
      .input('Status', sql.NVarChar, status || existing.Status)
      .input('RemarkNote', sql.NVarChar, remarkNote || existing.RemarkNote)
      .input('ApprovedBy', sql.UniqueIdentifier, userId)
      .query(`
        UPDATE dbo.DailyTimeRecords SET
          ActualTimeIn = @ActualTimeIn, ActualTimeOut = @ActualTimeOut,
          LateMinutes = @LateMinutes, UndertimeMinutes = @UndertimeMinutes,
          OvertimeMinutes = @OvertimeMinutes, NightDiffMinutes = @NightDiffMinutes,
          Status = @Status, IsManualEntry = 1, ApprovedBy = @ApprovedBy,
          RemarkNote = @RemarkNote, UpdatedAtUtc = GETUTCDATE()
        WHERE Id = @Id AND TenantId = @TenantId AND IsDeleted = 0;
      `);

    await logAuditEvent(pool, {
      tenantId: tenantId!,
      action: 'DTR_MANUAL_CORRECTION',
      entityName: 'DailyTimeRecord',
      entityId: id as string,
      beforeJson: { actualTimeIn: existing.ActualTimeIn, actualTimeOut: existing.ActualTimeOut, status: existing.Status },
      afterJson: { actualTimeIn, actualTimeOut, status, remarkNote, correctedBy: userId },
      ipAddress: extractIp(req)
    });

    res.json({ success: true, data: { message: 'DTR corrected successfully' } });
  } catch (error) {
    console.error('Error correcting DTR:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to correct DTR' } });
  }
});

// GET /api/v1/attendance/dtr/pdf - Generate DTR PDF for current user (MUST be before /dtr/:id)
router.get('/dtr/pdf', requirePermission('attendance:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { month, year } = req.query;

    const targetMonth = parseInt(month as string, 10) || new Date().getMonth() + 1;
    const targetYear = parseInt(year as string, 10) || new Date().getFullYear();

    const employeeResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('UserId', sql.UniqueIdentifier, userId)
      .query(`
        SELECT e.Id FROM dbo.EmployeeUserLink eul
        INNER JOIN dbo.Employees e ON eul.EmployeeId = e.Id
        WHERE eul.UserId = @UserId AND eul.TenantId = @TenantId
      `);

    if (!employeeResult.recordset.length) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'No employee linked to this user' } });
      return;
    }

    const employeeId = employeeResult.recordset[0].Id;
    const { generateDtrPdf } = await import('../../services/pdf');
    const pdfBuffer = await generateDtrPdf(pool, tenantId!, employeeId, targetMonth, targetYear);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="dtr-${targetMonth}-${targetYear}.pdf"`);
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error('Error generating DTR PDF:', error);
    res.status(500).json({ success: false, error: { code: 'PDF_ERROR', message: error.message || 'Failed to generate DTR PDF' } });
  }
});

router.get('/dtr/:id', requirePermission('attendance:read:self'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { id } = req.params;

    const result = await pool.request()
      .input('Id', sql.UniqueIdentifier, id as string)
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        SELECT dtr.Id, dtr.EmployeeId, dtr.WorkDate, dtr.ScheduledTimeIn, dtr.ScheduledTimeOut,
               dtr.ActualTimeIn, dtr.ActualTimeOut, dtr.LateMinutes, dtr.UndertimeMinutes,
               dtr.OvertimeMinutes, dtr.NightDiffMinutes, dtr.Status, dtr.IsManualEntry,
               dtr.ApprovedBy, dtr.RemarkNote, e.EmployeeNo, e.FirstName, e.LastName
        FROM dbo.DailyTimeRecords dtr
        INNER JOIN dbo.Employees e ON dtr.EmployeeId = e.Id
        WHERE dtr.Id = @Id AND dtr.TenantId = @TenantId AND dtr.IsDeleted = 0
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'DTR record not found' } });
      return;
    }
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    console.error('Error getting DTR record:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve DTR record' } });
  }
});

export default router;
