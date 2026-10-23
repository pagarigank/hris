/**
 * Push Notification Service — FCM HTTP v1 API
 *
 * Implements spec §8.8: "Push notification hooks (leave approval, payslip
 * released, DTR exception) via FCM/APNs token registered per device in
 * DeviceRegistry."
 *
 * Uses FCM HTTP v1 API (POST https://fcm.googleapis.com/v1/projects/{project_id}/messages:send)
 * with a service account for authentication. Falls back to console logging when
 * no FCM credentials are configured (development mode).
 *
 * Device tokens are read from the DeviceRegistry table (not in-memory)
 * per spec §2.7: "File storage is partitioned by /{TenantId}/... path prefix"
 * — similarly, device tokens are tenant-scoped.
 */

import sql from 'mssql'

// ── FCM HTTP v1 Types ──────────────────────────────────────

interface FcmMessage {
  message: {
    token: string
    notification?: { title: string; body: string; imageUrl?: string }
    data?: Record<string, string>
    android?: { priority: 'high' | 'normal'; ttl?: string }
    apns?: { headers?: Record<string, string>; payload?: any }
    webpush?: { headers?: Record<string, string>; notification?: any }
  }
}

interface FcmResponse {
  name?: string
  error?: { code: number; message: string; status: string }
}

// ── Service Account Token Management ────────────────────────

let cachedAccessToken: string | null = null
let tokenExpiresAt = 0

/**
 * Obtain a Google OAuth2 access token for FCM v1 API using the service account.
 * Caches the token until 5 minutes before expiry.
 */
async function getAccessToken(): Promise<string | null> {
  const saEmail = process.env.FCM_SERVICE_ACCOUNT_EMAIL
  const saPrivateKey = process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!saEmail || !saPrivateKey) return null

  // Return cached token if still valid (with 5 min buffer)
  if (cachedAccessToken && Date.now() < tokenExpiresAt - 300_000) {
    return cachedAccessToken
  }

  try {
    const crypto = await import('crypto')

    const now = Math.floor(Date.now() / 1000)
    const issuer = saEmail
    const scope = 'https://www.googleapis.com/auth/firebase.messaging'

    // Build JWT header and payload
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({
      iss: issuer,
      scope,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
      jti: crypto.randomUUID(),
    })).toString('base64url')

    // Sign with RSA private key
    const sign = crypto.createSign('RSA-SHA256')
    sign.update(`${header}.${payload}`)
    sign.end()
    const signature = sign.sign(saPrivateKey, 'base64url')

    const jwt = `${header}.${payload}.${signature}`

    // Exchange JWT for access token
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    })

    const data = await response.json() as any
    if (data.access_token) {
      cachedAccessToken = data.access_token
      tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000
      return cachedAccessToken
    }

    console.error('FCM token exchange failed:', data)
    return null
  } catch (error) {
    console.error('Failed to obtain FCM access token:', error)
    return null
  }
}

// ── Device Token Resolution ─────────────────────────────────

interface DeviceTokenRow {
  DeviceId: string
  DeviceToken: string
  Platform: string
}

/**
 * Fetch device tokens for an employee from the DeviceRegistry table.
 * Only returns trusted devices with non-empty tokens.
 */
async function getDeviceTokens(
  pool: sql.ConnectionPool,
  tenantId: string,
  employeeId: string
): Promise<DeviceTokenRow[]> {
  try {
    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT DeviceId, DeviceToken, DeviceType AS Platform
        FROM dbo.DeviceRegistry
        WHERE TenantId = @TenantId
          AND EmployeeId = @EmployeeId
          AND IsDeleted = 0
          AND IsTrusted = 1
          AND DeviceToken IS NOT NULL
          AND LEN(DeviceToken) > 0
      `)
    return result.recordset
  } catch (error) {
    console.error('Failed to fetch device tokens:', error)
    return []
  }
}

/**
 * Remove an invalid device token from the registry.
 * FCM returns UNREGISTERED when a token is no longer valid
 * (app uninstalled, token refreshed, etc.)
 */
async function removeInvalidToken(
  pool: sql.ConnectionPool,
  tenantId: string,
  employeeId: string,
  deviceId: string
): Promise<void> {
  try {
    await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, employeeId)
      .input('DeviceId', sql.NVarChar, deviceId)
      .query(`
        UPDATE dbo.DeviceRegistry
        SET IsDeleted = 1, UpdatedAtUtc = GETUTCDATE()
        WHERE TenantId = @TenantId AND EmployeeId = @EmployeeId AND DeviceId = @DeviceId
      `)
  } catch (error) {
    console.error('Failed to remove invalid token:', error)
  }
}

// ── Core Send Function ──────────────────────────────────────

export interface PushNotification {
  title: string
  body: string
  data?: Record<string, string>
  imageUrl?: string
}

/**
 * Send a push notification to all registered devices of an employee.
 *
 * - If FCM credentials are configured → sends via FCM HTTP v1 API
 * - If no credentials → logs to console (development mode)
 * - Invalid tokens (UNREGISTERED) are automatically removed from the registry
 * - Failures never throw — always returns true/false
 */
export async function sendPushNotification(
  pool: sql.ConnectionPool,
  tenantId: string,
  employeeId: string,
  notification: PushNotification
): Promise<boolean> {
  const tokens = await getDeviceTokens(pool, tenantId, employeeId)

  if (tokens.length === 0) {
    console.log(`[PushNotification] No devices for employee ${employeeId}`)
    return false
  }

  // Try FCM HTTP v1
  const accessToken = await getAccessToken()
  const fcmProjectId = process.env.FCM_PROJECT_ID

  if (!accessToken || !fcmProjectId) {
    // Development mode — just log
    console.log(`[PushNotification] Dev mode — logging notification:`, {
      employeeId,
      title: notification.title,
      body: notification.body,
      devices: tokens.length,
      platforms: tokens.map(t => t.Platform),
    })
    return true
  }

  // Send to each device via FCM HTTP v1
  let anySuccess = false
  const projectId = fcmProjectId

  for (const device of tokens) {
    const isIos = device.Platform.toLowerCase() === 'ios'
    const message: FcmMessage = {
      message: {
        token: device.DeviceToken,
        notification: {
          title: notification.title,
          body: notification.body,
          imageUrl: notification.imageUrl,
        },
        data: notification.data || {},
        android: { priority: 'high', ttl: '86400s' },
        apns: {
          headers: { 'apns-priority': '10' },
          payload: {
            aps: {
              alert: { title: notification.title, body: notification.body },
              badge: 1,
              sound: 'default',
            },
          },
        },
      },
    }

    try {
      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(message),
        }
      )

      const result = await response.json() as FcmResponse

      if (result.error) {
        console.error(`[PushNotification] FCM error for device ${device.DeviceId}:`, result.error)

        // Remove invalid tokens automatically
        if (result.error.code === 404 || result.error.status === 'UNREGISTERED') {
          await removeInvalidToken(pool, tenantId, employeeId, device.DeviceId)
        }
      } else {
        anySuccess = true
      }
    } catch (error) {
      console.error(`[PushNotification] Failed to send to device ${device.DeviceId}:`, error)
    }
  }

  return anySuccess
}

// ── High-Level Notification Helpers ─────────────────────────

/**
 * Send leave approval/rejection notification to the employee.
 * Spec §8.8: "Push notification hooks (leave approval, payslip released, DTR exception)"
 */
export async function sendLeaveNotification(
  pool: sql.ConnectionPool,
  tenantId: string,
  employeeId: string,
  status: 'approved' | 'rejected',
  leaveType: string
): Promise<boolean> {
  const title = status === 'approved' ? '✅ Leave Approved' : '❌ Leave Rejected'
  const body = status === 'approved'
    ? `Your ${leaveType} request has been approved.`
    : `Your ${leaveType} request has been rejected.`

  return sendPushNotification(pool, tenantId, employeeId, {
    title,
    body,
    data: { type: 'leave_approval', status, leaveType },
  })
}

/**
 * Send payslip release notification to all employees in a payroll run.
 * Spec §8.8: "Push notification hooks (leave approval, payslip released, DTR exception)"
 */
export async function sendPayslipNotification(
  pool: sql.ConnectionPool,
  tenantId: string,
  employeeId: string,
  payDate: string
): Promise<boolean> {
  return sendPushNotification(pool, tenantId, employeeId, {
    title: '💰 Payslip Available',
    body: `Your payslip for ${payDate} is now available. Tap to view.`,
    data: { type: 'payslip_release', payDate },
  })
}

/**
 * Send DTR exception notification to an employee.
 * Spec §8.8: "Push notification hooks (leave approval, payslip released, DTR exception)"
 */
export async function sendDTRExceptionNotification(
  pool: sql.ConnectionPool,
  tenantId: string,
  employeeId: string,
  exceptionType: string,
  date: string
): Promise<boolean> {
  return sendPushNotification(pool, tenantId, employeeId, {
    title: '⚠️ DTR Exception',
    body: `You have a ${exceptionType} on ${date}. Please review and submit a correction if needed.`,
    data: { type: 'dtr_exception', exceptionType, date },
  })
}

/**
 * Send overtime approval/rejection notification to the employee.
 */
export async function sendOvertimeNotification(
  pool: sql.ConnectionPool,
  tenantId: string,
  employeeId: string,
  status: 'approved' | 'rejected'
): Promise<boolean> {
  const title = status === 'approved' ? '✅ Overtime Approved' : '❌ Overtime Rejected'
  const body = status === 'approved'
    ? 'Your overtime request has been approved.'
    : 'Your overtime request has been rejected.'

  return sendPushNotification(pool, tenantId, employeeId, {
    title,
    body,
    data: { type: 'overtime_approval', status },
  })
}

/**
 * Batch-send payslip notifications to multiple employees.
 * Used after a payroll run is approved/released.
 */
export async function sendBulkPayslipNotifications(
  pool: sql.ConnectionPool,
  tenantId: string,
  employeeIds: string[],
  payDate: string
): Promise<{ sent: number; failed: number }> {
  let sent = 0
  let failed = 0

  for (const empId of employeeIds) {
    try {
      const success = await sendPayslipNotification(pool, tenantId, empId, payDate)
      if (success) sent++
      else failed++
    } catch {
      failed++
    }
  }

  return { sent, failed }
}
