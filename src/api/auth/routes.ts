import { Router } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { loginSchema } from '../../utils/schemas';
import { createLogger } from '../../utils/logger';
import sql from 'mssql';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const router = Router();
const log = createLogger('auth');
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is required');
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
const IS_DEV = process.env.NODE_ENV !== 'production';

// Cookie options
const ACCESS_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: !IS_DEV,
  sameSite: 'strict' as const,
  path: '/',
  maxAge: 15 * 60 * 1000 // 15 minutes
};

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: !IS_DEV,
  sameSite: 'strict' as const,
  path: '/api/v1/auth/refresh', // only sent to refresh endpoint
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
};

// In-memory failed login attempt tracker (key: IP, value: {count, firstAttempt})
const loginFailures = new Map<string, { count: number; firstAttempt: number }>();

// Cleanup old entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [key, val] of loginFailures) {
    if (val.firstAttempt < cutoff) loginFailures.delete(key);
  }
}, 5 * 60 * 1000);

// POST /api/v1/auth/login
router.post('/login', validate(loginSchema), async (req: AuthRequest, res) => {
  try {
    const { email, password, tenantCode } = req.body;

    const pool = (req as any).pool;
    
    // Get tenant
    const tenantResult = await pool.request()
      .input('CompanyCode', sql.NVarChar, tenantCode)
      .query('SELECT Id FROM dbo.Tenants WHERE CompanyCode = @CompanyCode AND IsDeleted = 0');
    
    if (tenantResult.recordset.length === 0) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid tenant code'
        }
      });
      return;
    }

    const tenantId = tenantResult.recordset[0].Id;

    // Set SESSION_CONTEXT so RLS filter predicates allow access to tenant data
    await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`EXEC sp_set_session_context N'TenantId', @TenantId`);

    // Get user
    const userResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Email', sql.NVarChar, email)
      .query('SELECT Id, Email, PasswordHash, IsActive FROM dbo.Users WHERE TenantId = @TenantId AND Email = @Email AND IsDeleted = 0');
    
    if (userResult.recordset.length === 0) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password'
        }
      });
      return;
    }

    const user = userResult.recordset[0];
    
    if (!user.IsActive) {
      res.status(401).json({
        success: false,
        error: {
          code: 'ACCOUNT_DISABLED',
          message: 'Account is disabled'
        }
      });
      return;
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.PasswordHash);
    
    if (!isValidPassword) {
      // Track failed attempts per IP
      const ip = req.ip || req.connection?.remoteAddress || 'unknown';
      const failKey = `login_fail:${ip}`;
      const fails = loginFailures.get(failKey) || { count: 0, firstAttempt: Date.now() };
      fails.count++;
      if (fails.count === 1) fails.firstAttempt = Date.now();
      loginFailures.set(failKey, fails);

      // Lock out after 5 failures in 15 minutes
      if (fails.count >= 5 && (Date.now() - fails.firstAttempt) < 15 * 60 * 1000) {
        res.status(429).json({
          success: false,
          error: {
            code: 'ACCOUNT_LOCKED',
            message: 'Too many failed attempts. Try again in 15 minutes.'
          }
        });
        return;
      }

      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password'
        }
      });
      return;
    }

    // Clear failed attempts on successful login
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    loginFailures.delete(`login_fail:${ip}`);

    // Get user roles
    const rolesResult = await pool.request()
      .input('UserId', sql.UniqueIdentifier, user.Id)
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        SELECT r.Name 
        FROM dbo.UserRoles ur
        JOIN dbo.Roles r ON ur.RoleId = r.Id
        WHERE ur.UserId = @UserId AND ur.TenantId = @TenantId AND r.IsDeleted = 0
      `);
    
    const roles = rolesResult.recordset.map((r: any) => r.Name);

    // Generate JWT token
    const tokenPayload = {
      sub: user.Id,
      tenant_id: tenantId,
      roles: roles,
      email: email
    };
    
    const accessToken = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
    
    // Generate refresh token (include tenant_id for session context on refresh)
    const refreshToken = jwt.sign(
      { sub: user.Id, type: 'refresh', tenant_id: tenantId },
      JWT_SECRET,
      { expiresIn: JWT_REFRESH_EXPIRES_IN } as jwt.SignOptions
    );

    // Store refresh token hash
    const tokenHash = await bcrypt.hash(refreshToken, 10);
    await pool.request()
      .input('UserId', sql.UniqueIdentifier, user.Id)
      .input('TokenHash', sql.NVarChar, tokenHash)
      .input('ExpiresAtUtc', sql.DateTime2, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
      .input('DeviceInfo', sql.NVarChar, req.headers['user-agent'] || 'Unknown')
      .query(`
        INSERT INTO dbo.RefreshTokens (UserId, TokenHash, ExpiresAtUtc, DeviceInfo)
        VALUES (@UserId, @TokenHash, @ExpiresAtUtc, @DeviceInfo)
      `);

    // Update last login
    await pool.request()
      .input('UserId', sql.UniqueIdentifier, user.Id)
      .query('UPDATE dbo.Users SET LastLoginAtUtc = GETUTCDATE() WHERE Id = @UserId');

    // Get permissions
    const permsResult = await pool.request()
      .input('UserId', sql.UniqueIdentifier, user.Id)
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        SELECT DISTINCT p.Code
        FROM dbo.UserRoles ur
        JOIN dbo.Roles r ON ur.RoleId = r.Id
        JOIN dbo.RolePermissions rp ON rp.RoleId = r.Id
        JOIN dbo.Permissions p ON rp.PermissionId = p.Id
        WHERE ur.UserId = @UserId AND ur.TenantId = @TenantId AND r.IsDeleted = 0 AND p.IsDeleted = 0
      `);

    const permissions = permsResult.recordset.map((p: any) => p.Code);

    // Set httpOnly cookies
    res.cookie('accessToken', accessToken, ACCESS_COOKIE_OPTIONS);
    res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);

    // Return user data only (no tokens in body)
    res.json({
      success: true,
      data: {
        expiresIn: 900,
        user: {
          id: user.Id,
          email: email,
          firstName: email.split('@')[0],
          lastName: '',
          role: roles[0] || 'User',
          roles: roles,
          permissions: permissions
        }
      }
    });
  } catch (error: any) {
    log.error('Login error', { error: error?.message, stack: error?.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'LOGIN_ERROR',
        message: 'An error occurred during login'
      }
    });
  }
});

// GET /api/v1/auth/me
router.get('/me', async (req: AuthRequest, res) => {
  try {
    // Read token from cookie first, fallback to Authorization header
    const token = req.cookies?.accessToken || req.headers.authorization?.split(' ')[1];
    if (!token) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'No token provided' }
      });
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;

    const pool = (req as any).pool;
    
    // Set session context for RLS - required for all queries
    await pool.request()
      .input('TenantId', sql.UniqueIdentifier, decoded.tenant_id)
      .query(`EXEC sp_set_session_context N'TenantId', @TenantId`);
    
    const result = await pool.request()
      .input('UserId', sql.UniqueIdentifier, decoded.sub)
      .query(`
        SELECT u.Id, u.Email
        FROM dbo.Users u
        WHERE u.Id = @UserId AND u.IsDeleted = 0
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' }
      });
      return;
    }

    const user = result.recordset[0];

    const rolesResult = await pool.request()
      .input('UserId', sql.UniqueIdentifier, user.Id)
      .input('TenantId', sql.UniqueIdentifier, decoded.tenant_id)
      .query(`
        SELECT r.Name 
        FROM dbo.UserRoles ur
        JOIN dbo.Roles r ON ur.RoleId = r.Id
        WHERE ur.UserId = @UserId AND ur.TenantId = @TenantId AND r.IsDeleted = 0
      `);

    const roles = rolesResult.recordset.map((r: any) => r.Name);

    // Get permissions
    const permsResult = await pool.request()
      .input('UserId', sql.UniqueIdentifier, user.Id)
      .input('TenantId', sql.UniqueIdentifier, decoded.tenant_id)
      .query(`
        SELECT DISTINCT p.Code
        FROM dbo.UserRoles ur
        JOIN dbo.Roles r ON ur.RoleId = r.Id
        JOIN dbo.RolePermissions rp ON rp.RoleId = r.Id
        JOIN dbo.Permissions p ON rp.PermissionId = p.Id
        WHERE ur.UserId = @UserId AND ur.TenantId = @TenantId AND r.IsDeleted = 0 AND p.IsDeleted = 0
      `);

    const permissions = permsResult.recordset.map((p: any) => p.Code);

    res.json({
      success: true,
      data: {
        user: {
          id: user.Id,
          email: user.Email,
          firstName: user.Email.split('@')[0],
          lastName: '',
          role: roles[0] || 'User',
          roles: roles,
          permissions: permissions
        }
      }
    });
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        error: { code: 'TOKEN_EXPIRED', message: 'Token has expired' }
      });
      return;
    }
    log.error('Auth/me error', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: { code: 'AUTH_ERROR', message: 'Failed to get user info' }
    });
  }
});

// POST /api/v1/auth/refresh
router.post('/refresh', async (req: AuthRequest, res) => {
  try {
    // Read refresh token from cookie first, fallback to body
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!refreshToken) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'No refresh token provided'
        }
      });
      return;
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, JWT_SECRET) as any;
    
    if (decoded.type !== 'refresh') {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid refresh token'
        }
      });
      return;
    }

    const pool = (req as any).pool;
    
    // Set session context for RLS using tenant_id from refresh token
    if (decoded.tenant_id) {
      await pool.request()
        .input('TenantId', sql.UniqueIdentifier, decoded.tenant_id)
        .query(`EXEC sp_set_session_context N'TenantId', @TenantId`);
    }
    
    // Check if refresh token exists and is not revoked
    const tokenResult = await pool.request()
      .input('UserId', sql.UniqueIdentifier, decoded.sub)
      .query(`
        SELECT Id, TokenHash, ExpiresAtUtc, RevokedAtUtc
        FROM dbo.RefreshTokens
        WHERE UserId = @UserId AND ExpiresAtUtc > GETUTCDATE() AND RevokedAtUtc IS NULL
        ORDER BY CreatedAtUtc DESC
      `);
    
    if (tokenResult.recordset.length === 0) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Refresh token is invalid or has been revoked'
        }
      });
      return;
    }

    // Verify token hash
    const storedToken = tokenResult.recordset[0];
    const isValidToken = await bcrypt.compare(refreshToken, storedToken.TokenHash);
    
    if (!isValidToken) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid refresh token'
        }
      });
      return;
    }

    // Get user and tenant info
    const userResult = await pool.request()
      .input('UserId', sql.UniqueIdentifier, decoded.sub)
      .query(`
        SELECT u.Id, u.Email, u.TenantId
        FROM dbo.Users u
        WHERE u.Id = @UserId AND u.IsDeleted = 0
      `);
    
    if (userResult.recordset.length === 0) {
      res.status(401).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found'
        }
      });
      return;
    }

    const user = userResult.recordset[0];

    // Get user roles
    const rolesResult = await pool.request()
      .input('UserId', sql.UniqueIdentifier, user.Id)
      .input('TenantId', sql.UniqueIdentifier, user.TenantId)
      .query(`
        SELECT r.Name 
        FROM dbo.UserRoles ur
        JOIN dbo.Roles r ON ur.RoleId = r.Id
        WHERE ur.UserId = @UserId AND ur.TenantId = @TenantId AND r.IsDeleted = 0
      `);
    
    const roles = rolesResult.recordset.map((r: any) => r.Name);

    // Generate new access token
    const tokenPayload = {
      sub: user.Id,
      tenant_id: user.TenantId,
      roles: roles,
      email: user.Email
    };
    
    const newAccessToken = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);

    // Generate new refresh token (rotation - preserve tenant_id for RLS)
    const newRefreshToken = jwt.sign(
      { sub: user.Id, type: 'refresh', tenant_id: user.TenantId },
      JWT_SECRET,
      { expiresIn: JWT_REFRESH_EXPIRES_IN } as jwt.SignOptions
    );

    // Revoke old refresh token
    await pool.request()
      .input('TokenId', sql.UniqueIdentifier, storedToken.Id)
      .query('UPDATE dbo.RefreshTokens SET RevokedAtUtc = GETUTCDATE() WHERE Id = @TokenId');

    // Store new refresh token hash
    const newTokenHash = await bcrypt.hash(newRefreshToken, 10);
    await pool.request()
      .input('UserId', sql.UniqueIdentifier, user.Id)
      .input('TokenHash', sql.NVarChar, newTokenHash)
      .input('ExpiresAtUtc', sql.DateTime2, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
      .input('DeviceInfo', sql.NVarChar, req.headers['user-agent'] || 'Unknown')
      .query(`
        INSERT INTO dbo.RefreshTokens (UserId, TokenHash, ExpiresAtUtc, DeviceInfo)
        VALUES (@UserId, @TokenHash, @ExpiresAtUtc, @DeviceInfo)
      `);

    // Set new httpOnly cookies
    res.cookie('accessToken', newAccessToken, ACCESS_COOKIE_OPTIONS);
    res.cookie('refreshToken', newRefreshToken, REFRESH_COOKIE_OPTIONS);

    // Return success only (no tokens in body)
    res.json({
      success: true,
      data: {
        expiresIn: 900
      }
    });
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      // Clear expired cookies
      res.clearCookie('accessToken', { path: '/' });
      res.clearCookie('refreshToken', { path: '/api/v1/auth/refresh' });
      res.status(401).json({
        success: false,
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Refresh token has expired'
        }
      });
      return;
    }
    
    log.error('Refresh token error', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: {
        code: 'REFRESH_ERROR',
        message: 'An error occurred during token refresh'
      }
    });
  }
});

// POST /api/v1/auth/logout
router.post('/logout', async (req: AuthRequest, res) => {
  try {
    // Read refresh token from cookie or body to revoke it
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    
    if (refreshToken) {
      const pool = (req as any).pool;
      
      // Revoke the refresh token
      const decoded = jwt.verify(refreshToken, JWT_SECRET) as any;
      
      if (decoded.type === 'refresh') {
        await pool.request()
          .input('UserId', sql.UniqueIdentifier, decoded.sub)
          .query(`
            UPDATE dbo.RefreshTokens 
            SET RevokedAtUtc = GETUTCDATE() 
            WHERE UserId = @UserId AND RevokedAtUtc IS NULL
          `);
      }
    }

    // Clear cookies
    res.clearCookie('accessToken', { path: '/' });
    res.clearCookie('refreshToken', { path: '/api/v1/auth/refresh' });

    res.json({
      success: true,
      data: {
        message: 'Logged out successfully'
      }
    });
  } catch (error) {
    // Even if token verification fails, clear cookies
    res.clearCookie('accessToken', { path: '/' });
    res.clearCookie('refreshToken', { path: '/api/v1/auth/refresh' });
    
    log.error('Logout error', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: {
        code: 'LOGOUT_ERROR',
        message: 'An error occurred during logout'
      }
    });
  }
});

export default router;
