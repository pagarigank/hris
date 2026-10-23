import { Request, Response, NextFunction } from 'express';
import sql from 'mssql';

export interface OfflineSyncRequest extends Request {
  offlineQueue?: any[];
}

// Middleware to handle offline sync queue
export const offlineSyncMiddleware = async (
  req: OfflineSyncRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Check if request contains offline queue items
    if (req.body && req.body.offlineQueue && Array.isArray(req.body.offlineQueue)) {
      req.offlineQueue = req.body.offlineQueue;
      
      // Process offline queue items
      const pool = (req as any).pool;
      const tenantId = (req as any).tenantId;
      const userId = (req as any).userId;
      
      if (!pool || !tenantId) {
        next();
        return;
      }
      
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
        next();
        return;
      }
      
      const employeeId = employeeResult.recordset[0].Id;
      const syncResults: any[] = [];
      
      // Process each offline item
      for (const item of req.offlineQueue || []) {
        try {
          // Check for duplicate (idempotency)
          const duplicateCheck = await pool.request()
            .input('TenantId', sql.UniqueIdentifier, tenantId)
            .input('EmployeeId', sql.UniqueIdentifier, employeeId)
            .input('LogType', sql.NVarChar, item.logType)
            .input('ClientTimestamp', sql.DateTime2, new Date(item.timestamp))
            .query(`
              SELECT Id FROM dbo.AttendanceLogs
              WHERE TenantId = @TenantId AND EmployeeId = @EmployeeId
                    AND LogType = @LogType AND LogTimestampUtc = @ClientTimestamp
            `);
          
          if (duplicateCheck.recordset.length > 0) {
            syncResults.push({
              clientTimestamp: item.timestamp,
              status: 'duplicate',
              serverId: duplicateCheck.recordset[0].Id
            });
            continue;
          }
          
          // Check clock drift (if device clock is more than 5 minutes off)
          const clientTime = new Date(item.timestamp);
          const serverTime = new Date();
          const driftMinutes = Math.abs(clientTime.getTime() - serverTime.getTime()) / (1000 * 60);
          
          let flaggedForReview = false;
          if (driftMinutes > 5) {
            flaggedForReview = true;
          }
          
          // Insert attendance log
          const result = await pool.request()
            .input('TenantId', sql.UniqueIdentifier, tenantId)
            .input('EmployeeId', sql.UniqueIdentifier, employeeId)
            .input('LogType', sql.NVarChar, item.logType)
            .input('LogTimestampUtc', sql.DateTime2, clientTime)
            .input('SourceLatitude', sql.Decimal(10, 8), item.latitude || null)
            .input('SourceLongitude', sql.Decimal(11, 8), item.longitude || null)
            .input('WithinGeofence', sql.Bit, item.withinGeofence || false)
            .input('SelfieUrl', sql.NVarChar, item.selfieUrl || null)
            .input('DeviceId', sql.NVarChar, item.deviceId || null)
            .input('SyncedFromOfflineQueue', sql.Bit, true)
            .input('CreatedBy', sql.UniqueIdentifier, userId)
            .query(`
              INSERT INTO dbo.AttendanceLogs (
                TenantId, EmployeeId, LogType, LogTimestampUtc,
                SourceLatitude, SourceLongitude, WithinGeofence,
                SelfieUrl, DeviceId, SyncedFromOfflineQueue, CreatedBy
              )
              OUTPUT INSERTED.Id
              VALUES (
                @TenantId, @EmployeeId, @LogType, @LogTimestampUtc,
                @SourceLatitude, @SourceLongitude, @WithinGeofence,
                @SelfieUrl, @DeviceId, @SyncedFromOfflineQueue, @CreatedBy
              );
            `);
          
          syncResults.push({
            clientTimestamp: item.timestamp,
            status: 'synced',
            serverId: result.recordset[0].Id,
            flaggedForReview
          });
        } catch (error) {
          console.error('Error syncing offline item:', error);
          syncResults.push({
            clientTimestamp: item.timestamp,
            status: 'error',
            error: 'Failed to sync'
          });
        }
      }
      
      // Attach sync results to response
      req.body.syncResults = syncResults;
    }
    
    next();
  } catch (error) {
    console.error('Offline sync middleware error:', error);
    next();
  }
};

// Helper function to validate offline queue item
export const validateOfflineItem = (item: any): boolean => {
  if (!item.logType || !item.timestamp) {
    return false;
  }
  
  const validLogTypes = ['TimeIn', 'BreakOut', 'BreakIn', 'TimeOut'];
  if (!validLogTypes.includes(item.logType)) {
    return false;
  }
  
  // Validate timestamp is a valid date
  const timestamp = new Date(item.timestamp);
  if (isNaN(timestamp.getTime())) {
    return false;
  }
  
  // Validate coordinates if provided
  if (item.latitude !== undefined && item.longitude !== undefined) {
    const lat = parseFloat(item.latitude);
    const lng = parseFloat(item.longitude);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return false;
    }
  }
  
  return true;
};
