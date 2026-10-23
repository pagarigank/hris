import sql from 'mssql';

export interface AuditLogEntry {
  tenantId: string;
  userId?: string;
  action: string;
  entityName: string;
  entityId?: string;
  beforeJson?: any;
  afterJson?: any;
  ipAddress?: string;
}

export async function logAuditEvent(
  pool: sql.ConnectionPool,
  entry: AuditLogEntry
): Promise<void> {
  try {
    await pool.request()
      .input('TenantId', sql.UniqueIdentifier, entry.tenantId)
      .input('UserId', sql.UniqueIdentifier, entry.userId || null)
      .input('Action', sql.NVarChar(50), entry.action)
      .input('EntityName', sql.NVarChar(100), entry.entityName)
      .input('EntityId', sql.NVarChar(100), entry.entityId || null)
      .input('BeforeJson', sql.NVarChar(sql.MAX), entry.beforeJson ? JSON.stringify(entry.beforeJson) : null)
      .input('AfterJson', sql.NVarChar(sql.MAX), entry.afterJson ? JSON.stringify(entry.afterJson) : null)
      .input('IpAddress', sql.NVarChar(50), entry.ipAddress || null)
      .query(`
        INSERT INTO dbo.AuditLogs (TenantId, UserId, Action, EntityName, EntityId, BeforeJson, AfterJson, IpAddress)
        VALUES (@TenantId, @UserId, @Action, @EntityName, @EntityId, @BeforeJson, @AfterJson, @IpAddress)
      `);
  } catch (error) {
    // Audit logging should never break the main flow
    console.error('Audit log write failed:', error);
  }
}

export function extractIp(req: any): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  if (Array.isArray(forwarded)) return forwarded[0];
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string') return realIp;
  return req.connection?.remoteAddress || '';
}
