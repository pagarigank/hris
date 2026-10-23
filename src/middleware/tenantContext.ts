import sql from 'mssql';
import { Request, Response, NextFunction } from 'express';
import { getPool } from './connection';

export interface TenantRequest extends Request {
  tenantId?: string;
  userId?: string;
}

export const setTenantContext = async (
  req: TenantRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const tenantId = req.tenantId;

  if (!tenantId) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Tenant context not available'
      }
    });
    return;
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const pool = await getPool();
      (req as any).pool = pool;

      await pool.request()
        .input('TenantId', sql.UniqueIdentifier, tenantId)
        .query(`EXEC sp_set_session_context @key = N'TenantId', @value = @TenantId;`);

      next();
      return;
    } catch (error: any) {
      console.error('Error setting tenant context:', error.message);

      if (attempt === 0) {
        const { closePool } = await import('./connection');
        await closePool();
        await new Promise(r => setTimeout(r, 200));
        continue;
      }

      res.status(500).json({
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to set tenant context'
        }
      });
    }
  }
};
