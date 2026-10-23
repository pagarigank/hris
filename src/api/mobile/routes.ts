import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../../middleware/auth';
import { setTenantContext } from '../../middleware/tenantContext';
// DB-backed device tokens — no in-memory service needed
import sql from 'mssql';

const router = Router();

router.use(authMiddleware);
router.use(setTenantContext);

// POST /api/v1/mobile/device - Register device for push notifications
router.post('/device', async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { deviceToken, platform, deviceId } = req.body;
    
    if (!deviceToken || !platform) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Device token and platform are required'
        }
      });
      return;
    }
    
    if (!['ios', 'android'].includes(platform)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Platform must be ios or android'
        }
      });
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
      res.status(404).json({
        success: false,
        error: {
          code: 'EMPLOYEE_NOT_FOUND',
          message: 'No employee linked to this user account'
        }
      });
      return;
    }
    
    const employeeId = employeeResult.recordset[0].Id;
    
    // Store device in registry with FCM/APNs token
    await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, employeeId)
      .input('DeviceId', sql.NVarChar, deviceId || deviceToken.substring(0, 20))
      .input('DeviceType', sql.NVarChar, platform === 'ios' ? 'Mobile' : 'Mobile')
      .input('DeviceToken', sql.NVarChar, deviceToken)
      .query(`
        MERGE dbo.DeviceRegistry AS target
        USING (SELECT @TenantId AS TenantId, @EmployeeId AS EmployeeId, @DeviceId AS DeviceId) AS source
        ON target.TenantId = source.TenantId AND target.EmployeeId = source.EmployeeId 
            AND target.DeviceId = source.DeviceId
        WHEN MATCHED THEN
          UPDATE SET IsTrusted = 1, DeviceToken = @DeviceToken, UpdatedAtUtc = GETUTCDATE()
        WHEN NOT MATCHED THEN
          INSERT (TenantId, EmployeeId, DeviceId, DeviceType, IsTrusted, DeviceToken)
          VALUES (@TenantId, @EmployeeId, @DeviceId, @DeviceType, 1, @DeviceToken);
      `);
    
    res.json({
      success: true,
      data: {
        message: 'Device registered successfully'
      }
    });
  } catch (error) {
    console.error('Error registering device:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to register device'
      }
    });
  }
});

// DELETE /api/v1/mobile/device - Unregister device
router.delete('/device', async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { deviceToken } = req.body;
    
    if (!deviceToken) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Device token is required'
        }
      });
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
      res.status(404).json({
        success: false,
        error: {
          code: 'EMPLOYEE_NOT_FOUND',
          message: 'No employee linked to this user account'
        }
      });
      return;
    }
    
    const employeeId = employeeResult.recordset[0].Id;
    
    // Remove from device registry
    await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, employeeId)
      .input('DeviceId', sql.NVarChar, deviceToken.substring(0, 20))
      .query(`
        UPDATE dbo.DeviceRegistry
        SET IsTrusted = 0, UpdatedAtUtc = GETUTCDATE()
        WHERE TenantId = @TenantId AND EmployeeId = @EmployeeId AND DeviceId = @DeviceId
      `);
    
    // Token removed from DeviceRegistry via IsTrusted=0
    
    res.json({
      success: true,
      data: {
        message: 'Device unregistered successfully'
      }
    });
  } catch (error) {
    console.error('Error unregistering device:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to unregister device'
      }
    });
  }
});

// POST /api/v1/mobile/sync - Sync offline queue
router.post('/sync', async (req: AuthRequest, res) => {
  try {
    const { syncResults } = req.body;
    
    res.json({
      success: true,
      data: {
        message: 'Offline queue synced successfully',
        results: syncResults || []
      }
    });
  } catch (error) {
    console.error('Error syncing offline queue:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SYNC_ERROR',
        message: 'Failed to sync offline queue'
      }
    });
  }
});

export default router;
