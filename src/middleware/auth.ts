import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import sql from 'mssql';
import { getPool } from './connection';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is required');
}

export interface AuthPayload {
  sub: string;
  tenant_id: string;
  roles: string[];
  email: string;
}

export interface AuthRequest extends Request {
  user?: AuthPayload;
  tenantId?: string;
  userId?: string;
}

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Read token from cookie first, fallback to Authorization header
    const token = req.cookies?.accessToken || req.headers.authorization?.substring(7);
    const deviceKey = req.headers['x-device-key'] as string | undefined;

    // Device API key auth — used by biometric devices
    if (deviceKey && !token) {
      try {
        const pool = await getPool();
        const result = await pool.request()
          .input('DeviceKey', sql.NVarChar, deviceKey)
          .query(`
            SELECT TenantId, EmployeeId, IsTrusted
            FROM dbo.DeviceRegistry
            WHERE DeviceId = @DeviceKey AND IsDeleted = 0
          `);

        if (result.recordset.length === 0 || !result.recordset[0].IsTrusted) {
          res.status(401).json({
            success: false,
            error: { code: 'INVALID_DEVICE_KEY', message: 'Invalid or untrusted device key' }
          });
          return;
        }

        req.tenantId = result.recordset[0].TenantId;
        (req as any).deviceEmployeeId = result.recordset[0].EmployeeId;
        (req as any).authMethod = 'device-key';
        next();
      } catch (err) {
        res.status(500).json({
          success: false,
          error: { code: 'AUTH_ERROR', message: 'Device authentication failed' }
        });
      }
      return;
    }

    if (!token) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid authorization header'
        }
      });
      return;
    }
    
    const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;
    
    req.user = decoded;
    req.tenantId = decoded.tenant_id;
    req.userId = decoded.sub;
    
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Access token has expired'
        }
      });
      return;
    }
    
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid access token'
        }
      });
      return;
    }
    
    res.status(500).json({
      success: false,
      error: {
        code: 'AUTH_ERROR',
        message: 'Authentication error'
      }
    });
  }
};
