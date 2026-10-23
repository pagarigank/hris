import { Request, Response, NextFunction } from 'express';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

interface RateLimitOptions {
  windowMs: number;  // Time window in milliseconds
  maxRequests: number;  // Maximum requests per window
  keyGenerator?: (req: Request) => string;  // Custom key generator
  message?: string;  // Error message
}

export const rateLimit = (options: RateLimitOptions) => {
  const {
    windowMs = 15 * 60 * 1000,  // 15 minutes default
    maxRequests = 100,
    keyGenerator = (req: Request) => {
      // Default: use tenant ID + user ID or IP
      const tenantId = (req as any).tenantId || 'unknown';
      const userId = (req as any).userId || req.ip;
      return `${tenantId}:${userId}`;
    },
    message = 'Too many requests, please try again later'
  } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip rate limiting in test mode
    if (process.env.NODE_ENV === 'test' || process.env.DISABLE_RATE_LIMIT === '1') {
      next();
      return;
    }

    const key = keyGenerator(req);
    const now = Date.now();
    
    // Initialize or reset if window expired
    if (!store[key] || now > store[key].resetTime) {
      store[key] = {
        count: 1,
        resetTime: now + windowMs
      };
      next();
      return;
    }
    
    // Increment count
    store[key].count++;
    
    // Check if limit exceeded
    if (store[key].count > maxRequests) {
      const retryAfter = Math.ceil((store[key].resetTime - now) / 1000);
      
      res.set({
        'X-RateLimit-Limit': maxRequests.toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': Math.ceil(store[key].resetTime / 1000).toString(),
        'Retry-After': retryAfter.toString()
      });
      
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message,
          retryAfter
        }
      });
      return;
    }
    
    // Set rate limit headers
    res.set({
      'X-RateLimit-Limit': maxRequests.toString(),
      'X-RateLimit-Remaining': (maxRequests - store[key].count).toString(),
      'X-RateLimit-Reset': Math.ceil(store[key].resetTime / 1000).toString()
    });
    
    next();
  };
};

// Pre-configured rate limiters
export const tenantRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000,  // 1 minute
  maxRequests: 200,  // 200 requests per minute per tenant
  keyGenerator: (req: Request) => `tenant:${(req as any).tenantId || 'unknown'}`,
  message: 'Tenant rate limit exceeded'
});

export const userRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000,  // 1 minute
  maxRequests: 100,  // 100 requests per minute per user
  keyGenerator: (req: Request) => `user:${(req as any).userId || req.ip}`,
  message: 'User rate limit exceeded'
});

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  maxRequests: 10,  // 10 login attempts per 15 minutes per IP
  keyGenerator: (req: Request) => `auth:${req.ip}`,
  message: 'Too many authentication attempts. Try again in 15 minutes.'
});

export const refreshRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000,  // 1 minute
  maxRequests: 20,  // 20 refresh attempts per minute per IP
  keyGenerator: (req: Request) => `refresh:${req.ip}`,
  message: 'Too many refresh attempts. Try again later.'
});

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const key in store) {
    if (now > store[key].resetTime) {
      delete store[key];
    }
  }
}, 60 * 1000);  // Cleanup every minute
