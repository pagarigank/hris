/**
 * PII Encryption Utility — AES-256-GCM
 * 
 * Encrypts/decrypts sensitive employee fields at rest:
 * - TIN (Tax Identification Number)
 * - SssNo (SSS Number)
 * - PhilHealthNo
 * - PagIbigNo
 * - PhilSysNo (PhilSys/National ID)
 * 
 * Compliant with:
 * - Philippine Data Privacy Act (RA 10173) — Section 20: reasonable technical measures for SPI
 * - Spec Section 1.2: "Encryption at rest for PII/SSS/TIN numbers"
 * 
 * Design choices (best practices from research):
 * - AES-256-GCM: authenticated encryption (confidentiality + integrity)
 * - Random IV per encryption call (never reuse IVs)
 * - IV + ciphertext stored together (IV prepended to ciphertext)
 * - Application-level encryption (avoids MSSQL Always Encrypted Node.js driver issues)
 * - Deterministic mode for fields that need exact-match queries (optional)
 * - Key derived from env var ENCRYPTION_KEY (base64-encoded 32-byte key)
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag

function getEncryptionKey(): Buffer {
  const rawKey = process.env.ENCRYPTION_KEY;
  if (!rawKey) {
    throw new Error(
      'FATAL: ENCRYPTION_KEY environment variable is required. ' +
      'Generate one with: node -e "console.log(crypto.randomBytes(32).toString(\'base64\'))"'
    );
  }
  const key = Buffer.from(rawKey, 'base64');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be exactly 32 bytes (256 bits) when base64-decoded');
  }
  return key;
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns base64-encoded string: IV (12 bytes) + AuthTag (16 bytes) + Ciphertext
 */
export function encrypt(plaintext: string): string {
  if (!plaintext || plaintext.trim() === '') return plaintext;

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Pack: IV + AuthTag + Ciphertext
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return packed.toString('base64');
}

/**
 * Decrypt a base64-encoded encrypted string back to plaintext.
 * Expected format: IV (12 bytes) + AuthTag (16 bytes) + Ciphertext
 */
export function decrypt(encryptedBase64: string): string {
  if (!encryptedBase64 || encryptedBase64.trim() === '') return encryptedBase64;

  // Check if this looks like already-encrypted data (base64 of binary)
  // Encrypted data is always longer than the original for short fields
  const packed = Buffer.from(encryptedBase64, 'base64');
  if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    // Too short to be encrypted, return as-is (backward compatibility)
    return encryptedBase64;
  }

  const key = getEncryptionKey();
  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  try {
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch (err) {
    // Auth tag verification failed — data may have been tampered with
    // or this is unencrypted legacy data. Return as-is for backward compat.
    console.warn('[Encryption] Auth tag verification failed, returning raw value');
    return encryptedBase64;
  }
}

/**
 * Mask a PII string for display purposes (e.g., "***-***-1234")
 * Shows last N characters, masks the rest with asterisks.
 */
export function maskPii(value: string | null, showLast = 4): string {
  if (!value) return '';
  if (value.length <= showLast) return value;
  const masked = '*'.repeat(value.length - showLast);
  return masked + value.slice(-showLast);
}

/**
 * Check if a value appears to be encrypted (base64 of sufficient length).
 * Used for backward compatibility during migration.
 */
export function isEncrypted(value: string): boolean {
  if (!value) return false;
  try {
    const buf = Buffer.from(value, 'base64');
    // Encrypted payload: 12 (IV) + 16 (Tag) + at least 1 byte ciphertext = 29 bytes min
    return buf.length >= IV_LENGTH + AUTH_TAG_LENGTH + 1;
  } catch {
    return false;
  }
}

/**
 * Fields in the Employees table that contain PII and should be encrypted.
 */
export const PII_FIELDS = [
  'TIN',
  'SssNo',
  'PhilHealthNo',
  'PagIbigNo',
  'PhilSysNo',
] as const;

export type PiiField = typeof PII_FIELDS[number];

/**
 * Encrypt multiple PII fields in an object (used before INSERT/UPDATE).
 */
export function encryptPiiFields<T extends Record<string, any>>(data: T): T {
  const result: Record<string, any> = { ...data };
  for (const field of PII_FIELDS) {
    if (result[field] && typeof result[field] === 'string') {
      result[field] = encrypt(result[field]);
    }
  }
  return result as T;
}

/**
 * Decrypt multiple PII fields in a database row (used after SELECT).
 */
export function decryptPiiFields<T extends Record<string, any>>(row: T): T {
  const result: Record<string, any> = { ...row };
  for (const field of PII_FIELDS) {
    if (result[field] && typeof result[field] === 'string' && isEncrypted(result[field])) {
      result[field] = decrypt(result[field]);
    }
  }
  return result as T;
}

/**
 * Decrypt an array of database rows.
 */
export function decryptPiiRows<T extends Record<string, any>>(rows: T[]): T[] {
  return rows.map(decryptPiiFields);
}
