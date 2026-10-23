import { Router, Response } from 'express'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { AuthRequest } from '../../middleware/auth'
import { requirePermission } from '../../middleware/permissions'
import {
  generateSignedUrl,
  verifySignedUrl,
  getStoragePath,
  ensureStorageDir,
  isAllowedFileType,
} from '../../utils/signedUrls'

const router = Router()



// ──────────────────────────────────────────────────────────────
// POST /api/v1/files/upload-url
// Spec §8.7: "File uploads via pre-signed upload URLs, not multipart
// through the API server, to keep mobile clients lightweight on flaky connections."
// Spec §2.7: "File storage is partitioned by /{TenantId}/... path prefix."
// ──────────────────────────────────────────────────────────────
router.post('/upload-url', requirePermission('employee:write'), async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId
    if (!tenantId) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing tenant context' } })
      return
    }

    const { context, fileName, contentType } = req.body
    if (!context || !fileName) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'context and fileName are required' } })
      return
    }

    const validContexts = ['selfie', 'document', 'payslip', 'report']
    if (!validContexts.includes(context)) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: `Invalid context. Must be one of: ${validContexts.join(', ')}` } })
      return
    }

    const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100)
    const uniqueId = crypto.randomUUID().substring(0, 8)
    const filePath = `${context}/${uniqueId}-${safeFileName}`

    if (!isAllowedFileType(filePath, context)) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: `File type not allowed for context '${context}'` } })
      return
    }

    ensureStorageDir(tenantId, filePath)
    const signed = generateSignedUrl(tenantId, filePath, 'upload')

    res.json({
      success: true,
      data: {
        uploadUrl: signed.url,
        filePath: signed.filePath,
        expiresAt: signed.expiresAt,
        method: 'PUT',
        headers: { 'Content-Type': contentType || 'application/octet-stream' },
      }
    })
  } catch (error) {
    console.error('Error generating upload URL:', error)
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to generate upload URL' } })
  }
})

// ──────────────────────────────────────────────────────────────
// PUT /api/v1/files/upload/:tenantId/*
// Handle the actual file upload via pre-signed URL.
// ──────────────────────────────────────────────────────────────
router.put('/upload/:tenantId/*', async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = String(req.params.tenantId || '')
    const filePath = String((req.params as Record<string, string>)[0] || '')
    const expiresAt = parseInt(req.query.expires as string)
    const signature = req.query.sig as string

    if (!expiresAt || !signature) {
      res.status(400).json({ success: false, error: { code: 'MISSING_PARAMS', message: 'expires and sig query params required' } })
      return
    }

    const payload = verifySignedUrl(tenantId, filePath, 'upload', expiresAt, signature)
    if (!payload) {
      res.status(403).json({ success: false, error: { code: 'INVALID_SIGNATURE', message: 'Upload URL is invalid or expired' } })
      return
    }

    if (req.tenantId && req.tenantId !== tenantId) {
      res.status(403).json({ success: false, error: { code: 'TENANT_MISMATCH', message: 'Cannot upload to another tenant' } })
      return
    }

    const fullPath = ensureStorageDir(tenantId, payload.filePath)
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      const buffer = Buffer.concat(chunks)
      fs.writeFileSync(fullPath, buffer)
      const downloadSigned = generateSignedUrl(tenantId, payload.filePath, 'download', 60 * 60 * 24)
      res.json({
        success: true,
        data: {
          filePath: payload.filePath,
          downloadUrl: downloadSigned.url,
          fileSize: buffer.length,
          expiresAt: downloadSigned.expiresAt,
        }
      })
    })
    req.on('error', (err) => {
      console.error('Upload stream error:', err)
      res.status(500).json({ success: false, error: { code: 'UPLOAD_ERROR', message: 'Failed to receive file data' } })
    })
  } catch (error) {
    console.error('Error handling upload:', error)
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to process upload' } })
  }
})

// ──────────────────────────────────────────────────────────────
// POST /api/v1/files/download-url
// ──────────────────────────────────────────────────────────────
router.post('/download-url', requirePermission('employee:read'), async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId
    if (!tenantId) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing tenant context' } })
      return
    }

    const { filePath } = req.body
    if (!filePath) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'filePath is required' } })
      return
    }

    const fullPath = getStoragePath(tenantId, filePath)
    if (!fs.existsSync(fullPath)) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'File not found' } })
      return
    }

    const signed = generateSignedUrl(tenantId, filePath, 'download')
    res.json({
      success: true,
      data: {
        downloadUrl: signed.url,
        filePath: signed.filePath,
        expiresAt: signed.expiresAt,
        fileSize: fs.statSync(fullPath).size,
      }
    })
  } catch (error) {
    console.error('Error generating download URL:', error)
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to generate download URL' } })
  }
})

// ──────────────────────────────────────────────────────────────
// GET /api/v1/files/download/:tenantId/*
// ──────────────────────────────────────────────────────────────
router.get('/download/:tenantId/*', async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = String(req.params.tenantId || '')
    const filePath = String((req.params as Record<string, string>)[0] || '')
    const expiresAt = parseInt(req.query.expires as string)
    const signature = req.query.sig as string

    if (!expiresAt || !signature) {
      res.status(400).json({ success: false, error: { code: 'MISSING_PARAMS', message: 'expires and sig query params required' } })
      return
    }

    const payload = verifySignedUrl(tenantId, filePath, 'download', expiresAt, signature)
    if (!payload) {
      res.status(403).json({ success: false, error: { code: 'INVALID_SIGNATURE', message: 'Download URL is invalid or expired' } })
      return
    }

    const fullPath = getStoragePath(tenantId, payload.filePath)
    if (!fs.existsSync(fullPath)) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'File not found' } })
      return
    }

    const ext = path.extname(fullPath).toLowerCase()
    const contentTypes: Record<string, string> = {
      '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.png': 'image/png', '.csv': 'text/csv',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }

    res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream')
    res.setHeader('Content-Length', fs.statSync(fullPath).size)
    res.setHeader('Cache-Control', 'private, no-cache')
    fs.createReadStream(fullPath).pipe(res)
  } catch (error) {
    console.error('Error serving file:', error)
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to serve file' } })
  }
})

// ──────────────────────────────────────────────────────────────
// DELETE /api/v1/files/:tenantId/*
// ──────────────────────────────────────────────────────────────
router.delete('/:tenantId/*', requirePermission('employee:delete'), async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = String(req.params.tenantId || '')
    const filePath = String((req.params as Record<string, string>)[0] || '')

    if (req.tenantId !== tenantId) {
      res.status(403).json({ success: false, error: { code: 'TENANT_MISMATCH', message: 'Cannot delete files for another tenant' } })
      return
    }

    const fullPath = getStoragePath(tenantId, filePath)
    if (!fs.existsSync(fullPath)) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'File not found' } })
      return
    }

    fs.unlinkSync(fullPath)
    res.json({ success: true, data: { message: 'File deleted successfully' } })
  } catch (error) {
    console.error('Error deleting file:', error)
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete file' } })
  }
})

export default router
