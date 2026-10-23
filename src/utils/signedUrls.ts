import crypto from 'crypto'
import path from 'path'
import fs from 'fs'

/**
 * Pre-signed URL utility for file uploads and downloads.
 *
 * Implements HMAC-SHA256 signed URLs per spec §8.7:
 * "File uploads (selfies, documents) via pre-signed upload URLs, not multipart
 * through the API server, to keep mobile clients lightweight on flaky connections."
 *
 * Also implements spec §2.7:
 * "File storage (payslips, IDs, selfies) is partitioned by /{TenantId}/... path
 * prefix in blob storage; access URLs are short-lived signed URLs scoped to tenant."
 *
 * Since this project uses local file storage (no cloud blob), we generate
 * HMAC-signed URLs that the server verifies before serving/uploading files.
 */

// Signing secret — in production, load from env var
const SIGNING_SECRET = process.env.FILE_SIGNING_SECRET || crypto.randomBytes(32).toString('hex')
const UPLOAD_URL_TTL_SECONDS = 15 * 60   // 15 minutes for upload
const DOWNLOAD_URL_TTL_SECONDS = 60 * 60  // 1 hour for download
const BASE_UPLOAD_DIR = process.env.FILE_STORAGE_DIR || path.join(process.cwd(), 'storage')

// Allowed file extensions per upload context
const ALLOWED_EXTENSIONS: Record<string, string[]> = {
  selfie: ['.jpg', '.jpeg', '.png'],
  document: ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'],
  payslip: ['.pdf'],
  report: ['.csv', '.pdf', '.xlsx'],
}

export interface SignedUrlPayload {
  tenantId: string
  filePath: string
  expiresAt: number  // Unix timestamp in seconds
  action: 'upload' | 'download'
}

export interface SignedUrlResult {
  url: string
  expiresAt: string  // ISO string
  filePath: string
}

/**
 * Generate a pre-signed URL for file upload or download.
 *
 * @param tenantId - Tenant UUID (from JWT)
 * @param filePath - Relative path within tenant storage (e.g., "selfies/abc.jpg")
 * @param action - 'upload' or 'download'
 * @param ttlSeconds - Override default TTL
 * @returns Signed URL and metadata
 */
export function generateSignedUrl(
  tenantId: string,
  filePath: string,
  action: 'upload' | 'download',
  ttlSeconds?: number
): SignedUrlResult {
  const ttl = ttlSeconds || (action === 'upload' ? UPLOAD_URL_TTL_SECONDS : DOWNLOAD_URL_TTL_SECONDS)
  const expiresAt = Math.floor(Date.now() / 1000) + ttl

  // Sanitize path — prevent directory traversal
  const sanitizedPath = sanitizeFilePath(filePath)

  const payload: SignedUrlPayload = {
    tenantId,
    filePath: sanitizedPath,
    expiresAt,
    action,
  }

  const signature = signPayload(payload)

  // URL format: /api/v1/files/{action}/{tenantId}/{path}?expires={ts}&sig={sig}
  const url = `/api/v1/files/${action}/${tenantId}/${sanitizedPath}?expires=${expiresAt}&sig=${signature}`

  return {
    url,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
    filePath: sanitizedPath,
  }
}

/**
 * Verify a signed URL payload.
 * Returns the verified payload or null if invalid/expired.
 */
export function verifySignedUrl(
  tenantId: string,
  filePath: string,
  action: 'upload' | 'download',
  expiresAt: number,
  signature: string
): SignedUrlPayload | null {
  // Check expiry
  if (Math.floor(Date.now() / 1000) > expiresAt) {
    return null
  }

  const payload: SignedUrlPayload = {
    tenantId,
    filePath: sanitizeFilePath(filePath),
    expiresAt,
    action,
  }

  const expectedSignature = signPayload(payload)
  if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'))) {
    return null
  }

  return payload
}

/**
 * Get the full filesystem path for a tenant-scoped file.
 */
export function getStoragePath(tenantId: string, filePath: string): string {
  return path.join(BASE_UPLOAD_DIR, tenantId, sanitizeFilePath(filePath))
}

/**
 * Validate file extension against allowed list.
 */
export function isAllowedFileType(filePath: string, context: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  const allowed = ALLOWED_EXTENSIONS[context] || ALLOWED_EXTENSIONS.document
  return allowed.includes(ext)
}

/**
 * Ensure directory exists for file storage.
 */
export function ensureStorageDir(tenantId: string, filePath: string): string {
  const fullPath = getStoragePath(tenantId, filePath)
  const dir = path.dirname(fullPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return fullPath
}

// ── Internal helpers ─────────────────────────────────────────

function signPayload(payload: SignedUrlPayload): string {
  const data = `${payload.tenantId}:${payload.filePath}:${payload.expiresAt}:${payload.action}`
  return crypto.createHmac('sha256', SIGNING_SECRET).update(data).digest('hex')
}

function sanitizeFilePath(filePath: string): string {
  // Remove leading slashes, normalize separators, prevent traversal
  return filePath
    .replace(/^[/\\]+/, '')
    .replace(/[/\\]+/g, '/')
    .replace(/\.\./g, '')
    .replace(/[^a-zA-Z0-9._/\-]/g, '_')
}
