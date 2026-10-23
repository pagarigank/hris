import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import sql from 'mssql';

// Wildcard roles that have all permissions (fast path, no DB query)
const WILDCARD_ROLES = new Set(['Admin', 'Super Admin', 'Tenant Admin', 'SuperAdmin', 'TenantAdmin']);

// Cache user permissions per request to avoid repeated DB queries
const PERMISSIONS_CACHE = new WeakMap<AuthRequest, Set<string>>();

async function getUserPermissions(req: AuthRequest): Promise<Set<string>> {
  // Return cached permissions if already fetched this request
  const cached = PERMISSIONS_CACHE.get(req);
  if (cached) return cached;

  const pool = (req as any).pool;
  const userId = req.userId;
  const tenantId = req.tenantId;

  if (!pool || !userId || !tenantId) {
    return new Set();
  }

  const result = await pool.request()
    .input('UserId', sql.UniqueIdentifier, userId)
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .query(`
      SELECT DISTINCT p.Code
      FROM dbo.UserRoles ur
      INNER JOIN dbo.Roles r ON ur.RoleId = r.Id
      INNER JOIN dbo.RolePermissions rp ON rp.RoleId = r.Id
      INNER JOIN dbo.Permissions p ON rp.PermissionId = p.Id
      WHERE ur.UserId = @UserId
        AND ur.TenantId = @TenantId
        AND r.IsDeleted = 0
        AND p.IsDeleted = 0
    `);

  const permissions = new Set<string>(result.recordset.map((r: any) => r.Code));
  PERMISSIONS_CACHE.set(req, permissions);
  return permissions;
}

export const requirePermission = (permissionCode: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User not authenticated'
          }
        });
        return;
      }

      const userRoles = req.user.roles || [];

      // Fast path: wildcard roles bypass permission check
      if (userRoles.some(role => WILDCARD_ROLES.has(role))) {
        next();
        return;
      }

      // DB path: query RolePermissions table
      getUserPermissions(req)
        .then(permissions => {
          if (permissions.has(permissionCode)) {
            next();
          } else {
            res.status(403).json({
              success: false,
              error: {
                code: 'FORBIDDEN',
                message: 'Insufficient permissions'
              }
            });
          }
        })
        .catch(error => {
          console.error('Permission check error:', error);
          res.status(500).json({
            success: false,
            error: {
              code: 'PERMISSION_ERROR',
              message: 'Error checking permissions'
            }
          });
        });
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'PERMISSION_ERROR',
          message: 'Error checking permissions'
        }
      });
    }
  };
};
