import sql from 'mssql';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config/database';

let pool: sql.ConnectionPool | null = null;
let connecting: Promise<sql.ConnectionPool> | null = null;
let lastFailedAt = 0;
const COOLDOWN_MS = 3000;

async function createConnectedPool(): Promise<sql.ConnectionPool> {
  const p = new sql.ConnectionPool(config);

  p.on('error', (err: any) => {
    console.error('[Connection] Pool error:', err.message);
    pool = null;
  });

  await p.connect();
  return p;
}

export const getPool = async (): Promise<sql.ConnectionPool> => {
  if (pool && pool.connected) return pool;

  if (pool && !pool.connected) {
    try { await pool.close(); } catch {}
    pool = null;
  }

  const now = Date.now();
  if (now - lastFailedAt < COOLDOWN_MS) {
    throw new Error('Database in cooldown after recent failure');
  }

  if (connecting) return connecting;

  connecting = createConnectedPool()
    .then((p) => {
      pool = p;
      connecting = null;
      lastFailedAt = 0;
      return p;
    })
    .catch((err) => {
      connecting = null;
      lastFailedAt = Date.now();
      throw err;
    });

  return connecting;
};

export const connectionMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const dbPool = await getPool();
    (req as any).pool = dbPool;
    next();
  } catch (error: any) {
    console.error('[Connection] Middleware error:', error.message);
    res.status(503).json({
      success: false,
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'Database temporarily unavailable. Please try again.'
      }
    });
  }
};

export const closePool = async (): Promise<void> => {
  const p = pool;
  pool = null;
  if (p) {
    try { await p.close(); } catch {}
  }
};
