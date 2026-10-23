/**
 * Payroll Lock Middleware
 * 
 * Prevents attendance edits, manual DTR corrections, and leave credit adjustments
 * once a payroll period reaches "Processing" or later status.
 * 
 * Spec Section 4.10: "Locking behavior prevents attendance edits on a period once 
 * its PayrollRun.Status is Processing or later."
 * Spec Section 4.10: "Any edit to Approved or later payroll requires a 
 * reversal/adjustment run, never an in-place edit (audit integrity)."
 * 
 * Implementation: Checks PayrollPeriods.Status before allowing:
 * - Attendance log creation/modification
 * - Manual DTR edits
 * - Leave credit balance modifications (beyond normal approval flow)
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import sql from 'mssql';
import { getPool } from './connection';

/**
 * Payroll period statuses that lock attendance/leave edits.
 * Once a period reaches Processing or later, no modifications allowed.
 */
const LOCKED_STATUSES = ['Processing', 'Approved', 'Paid', 'Closed'];

/**
 * Middleware that blocks the request if the current date falls within 
 * any payroll period that is in a locked status.
 * 
 * Usage: Apply to attendance edit and manual DTR correction routes.
 */
export const blockIfPayrollLocked = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    const pool = (req as any).pool || await getPool();

    // Check if current date falls within any locked payroll period
    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Today', sql.Date, new Date())
      .query(`
        SELECT pp.Id, pp.PeriodStart, pp.PeriodEnd, pp.Status
        FROM dbo.PayrollPeriods pp
        WHERE pp.TenantId = @TenantId
          AND pp.IsDeleted = 0
          AND pp.PeriodStart <= @Today
          AND pp.PeriodEnd >= @Today
          AND pp.Status IN ('Processing', 'Approved', 'Paid', 'Closed')
      `);

    if (result.recordset.length > 0) {
      const lockedPeriod = result.recordset[0];
      res.status(409).json({
        success: false,
        error: {
          code: 'PAYROLL_PERIOD_LOCKED',
          message: `Cannot modify attendance: payroll period ${lockedPeriod.PeriodStart} to ${lockedPeriod.PeriodEnd} is in "${lockedPeriod.Status}" status. Contact your payroll officer.`,
          lockedPeriod: {
            id: lockedPeriod.Id,
            periodStart: lockedPeriod.PeriodStart,
            periodEnd: lockedPeriod.PeriodEnd,
            status: lockedPeriod.Status,
          },
        },
      });
      return;
    }

    next();
  } catch (error) {
    console.error('[PayrollLock] Error checking payroll lock:', error);
    // Fail open — don't block attendance if check fails
    next();
  }
};

/**
 * Check if a specific date range overlaps any locked payroll period.
 * Used by service-level code (e.g., leave approval, manual DTR).
 */
export async function isDateRangePayrollLocked(
  pool: sql.ConnectionPool,
  tenantId: string,
  dateFrom: Date,
  dateTo: Date
): Promise<{ locked: boolean; period?: { id: string; status: string; periodStart: Date; periodEnd: Date } }> {
  const result = await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .input('DateFrom', sql.Date, dateFrom)
    .input('DateTo', sql.Date, dateTo)
    .query(`
      SELECT TOP 1 pp.Id, pp.PeriodStart, pp.PeriodEnd, pp.Status
      FROM dbo.PayrollPeriods pp
      WHERE pp.TenantId = @TenantId
        AND pp.IsDeleted = 0
        AND pp.Status IN ('Processing', 'Approved', 'Paid', 'Closed')
        AND (
          (pp.PeriodStart <= @DateFrom AND pp.PeriodEnd >= @DateFrom)
          OR (pp.PeriodStart <= @DateTo AND pp.PeriodEnd >= @DateTo)
          OR (pp.PeriodStart >= @DateFrom AND pp.PeriodEnd <= @DateTo)
        )
    `);

  if (result.recordset.length > 0) {
    return {
      locked: true,
      period: result.recordset[0],
    };
  }

  return { locked: false };
}

/**
 * Validate that a payroll period status transition is allowed.
 * State machine: Open → Processing → Approved → Paid → Closed
 * 
 * Allowed transitions:
 * - Open → Processing (start payroll run)
 * - Processing → Approved (payroll approver reviews)
 * - Approved → Paid (bank file generated / payslip released)
 * - Paid → Closed (immutable archive)
 * 
 * Reversals:
 * - Any status → Open (reversal run required, creates adjustment record)
 */
export function isValidPayrollTransition(
  currentStatus: string,
  newStatus: string
): { valid: boolean; reason?: string } {
  const transitions: Record<string, string[]> = {
    'Open': ['Processing'],
    'Processing': ['Approved', 'Open'],  // Open = reversal
    'Approved': ['Paid', 'Open'],        // Open = reversal
    'Paid': ['Closed', 'Open'],          // Open = reversal
    'Closed': [],                        // Immutable — only via special admin override
  };

  const allowed = transitions[currentStatus];
  if (!allowed) {
    return { valid: false, reason: `Unknown current status: ${currentStatus}` };
  }

  if (!allowed.includes(newStatus)) {
    return {
      valid: false,
      reason: `Cannot transition from "${currentStatus}" to "${newStatus}". Allowed: ${allowed.join(', ')}`,
    };
  }

  return { valid: true };
}
