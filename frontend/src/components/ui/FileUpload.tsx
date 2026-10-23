import { useState, useRef } from 'react'
import api from '../../lib/api'

interface FileUploadProps {
  /** Upload context: selfie, document, payslip, report */
  context: 'selfie' | 'document' | 'payslip' | 'report'
  /** Label to display */
  label?: string
  /** Accepted file types (e.g., ".pdf,.jpg,.png") */
  accept?: string
  /** Called after successful upload with the file path */
  onUploaded: (filePath: string, downloadUrl: string) => void
  /** Called on error */
  onError?: (message: string) => void
  /** Whether upload is in progress */
  disabled?: boolean
  /** Additional CSS classes */
  className?: string
}

/**
 * File upload component using pre-signed URLs.
 *
 * Implements spec §8.7:
 * "File uploads via pre-signed upload URLs, not multipart through the
 * API server, to keep mobile clients lightweight on flaky connections."
 *
 * Flow:
 * 1. Request pre-signed upload URL from server
 * 2. PUT file directly to the signed URL
 * 3. Server verifies signature and stores file
 * 4. Return download URL for the stored file
 */
export default function FileUpload({
  context,
  label = 'Upload File',
  accept = '.pdf,.jpg,.jpeg,.png,.doc,.docx',
  onUploaded,
  onError,
  disabled = false,
  className = '',
}: FileUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    if (disabled || uploading) return

    setUploading(true)
    setProgress(0)

    try {
      // Step 1: Get pre-signed upload URL
      const { data: urlResponse } = await api.post('/files/upload-url', {
        context,
        fileName: file.name,
        contentType: file.type,
      })

      if (!urlResponse.success) {
        throw new Error(urlResponse.error?.message || 'Failed to get upload URL')
      }

      const { uploadUrl } = urlResponse.data

      // Step 2: PUT file to signed URL
      // The upload URL is a server endpoint — we PUT with the file data
      setProgress(30)

      const formData = new FormData()
      formData.append('file', file)

      // Use XMLHttpRequest for progress tracking
      const uploadResult = await new Promise<{ filePath: string; downloadUrl: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', uploadUrl)
        xhr.withCredentials = true

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setProgress(30 + Math.round((e.loaded / e.total) * 60))
          }
        }

        xhr.onload = () => {
          try {
            const response = JSON.parse(xhr.responseText)
            if (response.success) {
              resolve(response.data)
            } else {
              reject(new Error(response.error?.message || 'Upload failed'))
            }
          } catch {
            reject(new Error('Invalid upload response'))
          }
        }

        xhr.onerror = () => reject(new Error('Network error during upload'))
        xhr.send(file)
      })

      setProgress(100)
      onUploaded(uploadResult.filePath, uploadResult.downloadUrl)
    } catch (error: any) {
      const message = error.response?.data?.error?.message || error.message || 'Upload failed'
      onError?.(message)
    } finally {
      setUploading(false)
      setProgress(0)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <div className={`relative ${className}`}>
      <div
        className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer ${
          dragOver
            ? 'border-primary-400 bg-primary-50'
            : uploading
            ? 'border-primary-300 bg-primary-50/50'
            : 'border-gray-200 hover:border-primary-300 hover:bg-gray-50'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
      >
        {uploading ? (
          <div className="space-y-2">
            <div className="text-sm text-primary-600 font-medium">Uploading...</div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-primary-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="text-xs text-gray-500">{progress}%</div>
          </div>
        ) : (
          <div className="space-y-1">
            <svg className="w-8 h-8 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <p className="text-sm text-gray-600">{label}</p>
            <p className="text-xs text-gray-400">Click or drag &amp; drop</p>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleInputChange}
        className="hidden"
        disabled={disabled || uploading}
      />
    </div>
  )
}

/**
 * Hook to generate a download URL for a stored file.
 */
export function useFileDownload() {
  const getDownloadUrl = async (filePath: string): Promise<string> => {
    try {
      const { data } = await api.post('/files/download-url', { filePath })
      if (data.success) {
        return data.data.downloadUrl
      }
      throw new Error(data.error?.message || 'Failed to get download URL')
    } catch {
      return '#'
    }
  }

  return { getDownloadUrl }
}
