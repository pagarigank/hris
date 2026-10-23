import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { logger } from './utils/logger';
import { connectionMiddleware, closePool, getPool } from './middleware/connection';
import { runMigrations } from './migrations/runner';
import { startNightlyDtrJob } from './services/dtrNightlyJob';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Health check endpoint (no DB needed)
app.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    }
  });
});

// API info endpoint (no DB needed)
app.get('/api/v1', (req, res) => {
  res.json({
    success: true,
    data: {
      name: 'Philippine HRIS API',
      version: '1.0.0',
      description: 'Multi-tenant HRIS for Philippine companies',
      documentation: '/api/v1/docs'
    }
  });
});

// Import routes
import authRoutes from './api/auth/routes';
import employeeRoutes from './api/employees/routes';
import attendanceRoutes from './api/attendance/routes';
import leaveRoutes from './api/leave/routes';
import payrollRoutes from './api/payroll/routes';
import hrMatrixRoutes from './api/hr-matrix/routes';
import mobileRoutes from './api/mobile/routes';
import docsRouter from './api/docs/routes';
import adminRoutes from './api/admin/routes';
import onboardingRoutes from './api/onboarding/routes';
import fileRoutes from './api/files/routes';
import kpiRoutes from './api/kpis/routes';
import promotionRoutes from './api/promotions/routes';

// Import middleware
import { tenantRateLimit, userRateLimit, authRateLimit, refreshRateLimit } from './middleware/rateLimit';
import { offlineSyncMiddleware } from './middleware/offlineSync';

// Apply rate limiting
app.use('/api/v1', tenantRateLimit);
app.use('/api/v1', userRateLimit);

// Database connection middleware for API routes only
app.use('/api/v1', connectionMiddleware);

// API routes
// Order matters: specific paths before wildcard mounts
app.use('/api/v1/auth/refresh', refreshRateLimit);  // 20 per min — generous
app.use('/api/v1/auth/login', authRateLimit);        // 10 per 15min — strict
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/employees', employeeRoutes);
app.use('/api/v1/attendance', offlineSyncMiddleware, attendanceRoutes);
app.use('/api/v1/leave', leaveRoutes);
app.use('/api/v1/payroll', payrollRoutes);
app.use('/api/v1/hr-matrix', hrMatrixRoutes);
app.use('/api/v1/mobile', mobileRoutes);
app.use('/api/v1/docs', docsRouter);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/onboarding', onboardingRoutes);
app.use('/api/v1/files', fileRoutes);
app.use('/api/v1/kpis', kpiRoutes);
app.use('/api/v1/promotions', promotionRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`
    }
  });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack, path: req.path, method: req.method });
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred'
    }
  });
});

// Start server
async function start() {
  try {
    // Run migrations
    logger.info('Running database migrations...');
    await runMigrations();
    logger.info('Migrations completed successfully');
    
    // Start server
    app.listen(PORT, () => {
      logger.info(`HRIS API server running on port ${PORT}`);
      logger.info(`Health check: http://localhost:${PORT}/health`);
      logger.info(`API docs: http://localhost:${PORT}/api/v1/docs`);
      
      // Start nightly DTR computation job
      startNightlyDtrJob(async () => getPool());
    });
  } catch (error) {
    logger.error('Failed to start server', { error: (error as Error).message });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await closePool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await closePool();
  process.exit(0);
});

start();

export default app;
