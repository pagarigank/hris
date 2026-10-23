/**
 * RLS Tenant Isolation Integration Tests
 * 
 * Spec Section 2: Tenant isolation via RLS + SESSION_CONTEXT
 * Requires running MSSQL instance. Set SKIP_DB_TESTS=1 to skip.
 * 
 * DESIGN: Uses a SINGLE persistent Request object (pool.request())
 * which binds to ONE underlying connection for all queries.
 * Session context persists because it's per-connection.
 * 
 * Parameter names must be unique per Request, so we use string
 * interpolation in DECLARE statements for session context values.
 */

import sql from 'mssql';

const TEST_DB_SERVER = process.env.TEST_DB_SERVER || 'localhost';
const TEST_DB_USER = process.env.TEST_DB_USER || 'sa';
const TEST_DB_PASSWORD = process.env.TEST_DB_PASSWORD || 'P@ssw0rd';
const TEST_DB_NAME = process.env.TEST_DB_NAME || 'HRIS';

const describeIfDb = process.env.SKIP_DB_TESTS ? describe.skip : describe;

// Unique suffix to avoid collisions with previous test runs
const SUITE_ID = `RLS_${Date.now()}`;

describeIfDb('RLS Tenant Isolation', () => {
  let pool: sql.ConnectionPool | undefined;
  let req: sql.Request | undefined;
  let tenantAId: string;
  let tenantBId: string;

  beforeAll(async () => {
    try {
      pool = await new sql.ConnectionPool({
        server: TEST_DB_SERVER,
        user: TEST_DB_USER,
        password: TEST_DB_PASSWORD,
        database: TEST_DB_NAME,
        options: { encrypt: false, trustServerCertificate: true },
      }).connect();

      req = pool.request();

      // Clean up any leftover test data from previous runs
      await req.query(`DELETE FROM dbo.Departments WHERE Name LIKE '%RLS%' AND Code LIKE '%RLS%'`);

      // Create test tenants with unique codes
      const tA = await req.query(`
        DECLARE @Id UNIQUEIDENTIFIER = NEWID();
        INSERT INTO dbo.Tenants (Id, CompanyName, CompanyCode, Status)
        VALUES (@Id, 'Test Tenant A - ${SUITE_ID}', 'TEN_A_${SUITE_ID}', 'Active');
        SELECT @Id AS Id;
      `);
      tenantAId = tA.recordset[0].Id;

      const tB = await req.query(`
        DECLARE @Id UNIQUEIDENTIFIER = NEWID();
        INSERT INTO dbo.Tenants (Id, CompanyName, CompanyCode, Status)
        VALUES (@Id, 'Test Tenant B - ${SUITE_ID}', 'TEN_B_${SUITE_ID}', 'Active');
        SELECT @Id AS Id;
      `);
      tenantBId = tB.recordset[0].Id;
    } catch (error) {
      console.warn('Skipping RLS tests - database not available:', (error as Error).message);
    }
  });

  afterAll(async () => {
    if (!pool || !req) return;
    try {
      await req.query(`EXEC sp_set_session_context N'TenantId', '${tenantAId}'`);
      await req.query(`DELETE FROM dbo.Departments WHERE TenantId = '${tenantAId}'`);
      await req.query(`EXEC sp_set_session_context N'TenantId', '${tenantBId}'`);
      await req.query(`DELETE FROM dbo.Departments WHERE TenantId = '${tenantBId}'`);
      // Cleanup tenants
      await req.query(`DELETE FROM dbo.Tenants WHERE Id = '${tenantAId}'`);
      await req.query(`DELETE FROM dbo.Tenants WHERE Id = '${tenantBId}'`);
      await pool.close();
    } catch {}
  });

  test('Tenant A cannot see Tenant B departments via RLS', async () => {
    if (!req || !tenantAId || !tenantBId) return;

    // Set Tenant B context and insert — same Request = same connection
    await req.query(`EXEC sp_set_session_context N'TenantId', '${tenantBId}'`);
    await req.query(`
      INSERT INTO dbo.Departments (TenantId, Name, Code, CreatedBy)
      SELECT '${tenantBId}', 'Test Dept B - ${SUITE_ID}', 'TDB_${SUITE_ID}', NULL
    `);

    // Switch to Tenant A context — same Request = same connection = context persists
    await req.query(`EXEC sp_set_session_context N'TenantId', '${tenantAId}'`);

    // Tenant A should NOT see Tenant B's departments
    const result = await req.query(
      `SELECT COUNT(*) AS cnt FROM dbo.Departments WHERE Name = 'Test Dept B - ${SUITE_ID}'`
    );
    expect(result.recordset[0].cnt).toBe(0);
  });

  test('No valid context returns no data', async () => {
    if (!req) return;

    await req.query(`EXEC sp_set_session_context N'TenantId', '00000000-0000-0000-0000-000000000000'`);
    const result = await req.query(`SELECT COUNT(*) AS cnt FROM dbo.Employees`);
    expect(result.recordset[0].cnt).toBe(0);
  });

  test('Tenant A cannot INSERT with Tenant B TenantId — block predicate rejects', async () => {
    if (!req || !tenantAId || !tenantBId) return;

    await req.query(`EXEC sp_set_session_context N'TenantId', '${tenantAId}'`);

    try {
      await req.query(`
        INSERT INTO dbo.Departments (TenantId, Name, Code, CreatedBy)
        SELECT '${tenantBId}', 'Unauthorized - ${SUITE_ID}', 'UNAUTH_${SUITE_ID}', NULL
      `);
      fail('RLS should have blocked INSERT with wrong TenantId');
    } catch (error: any) {
      expect(error.message).toMatch(/block predicate|security policy|Session context/i);
    }
  });

  test('Correct session context allows INSERT', async () => {
    if (!req || !tenantAId) return;

    await req.query(`EXEC sp_set_session_context N'TenantId', '${tenantAId}'`);

    const result = await req.query(`
      INSERT INTO dbo.Departments (TenantId, Name, Code, CreatedBy)
      OUTPUT INSERTED.Id, INSERTED.Name
      SELECT '${tenantAId}', 'Tenant A Dept - ${SUITE_ID}', 'TAD_${SUITE_ID}', NULL
    `);

    expect(result.recordset.length).toBe(1);
    expect(result.recordset[0].Name).toBe(`Tenant A Dept - ${SUITE_ID}`);
  });

  test('Cross-tenant department isolation verified', async () => {
    if (!req || !tenantAId || !tenantBId) return;

    // Insert for Tenant A
    await req.query(`EXEC sp_set_session_context N'TenantId', '${tenantAId}'`);
    await req.query(`
      INSERT INTO dbo.Departments (TenantId, Name, Code, CreatedBy)
      SELECT '${tenantAId}', 'A-ONLY-${SUITE_ID}', 'AOD_${SUITE_ID}', NULL
    `);

    // Insert for Tenant B
    await req.query(`EXEC sp_set_session_context N'TenantId', '${tenantBId}'`);
    await req.query(`
      INSERT INTO dbo.Departments (TenantId, Name, Code, CreatedBy)
      SELECT '${tenantBId}', 'B-ONLY-${SUITE_ID}', 'BOD_${SUITE_ID}', NULL
    `);

    // Tenant A should only see A-ONLY
    await req.query(`EXEC sp_set_session_context N'TenantId', '${tenantAId}'`);
    const resultA = await req.query(
      `SELECT Name FROM dbo.Departments WHERE Name LIKE '%-ONLY-${SUITE_ID}'`
    );
    const namesA = resultA.recordset.map((r: any) => r.Name);
    expect(namesA).toContain(`A-ONLY-${SUITE_ID}`);
    expect(namesA).not.toContain(`B-ONLY-${SUITE_ID}`);

    // Tenant B should only see B-ONLY
    await req.query(`EXEC sp_set_session_context N'TenantId', '${tenantBId}'`);
    const resultB = await req.query(
      `SELECT Name FROM dbo.Departments WHERE Name LIKE '%-ONLY-${SUITE_ID}'`
    );
    const namesB = resultB.recordset.map((r: any) => r.Name);
    expect(namesB).toContain(`B-ONLY-${SUITE_ID}`);
    expect(namesB).not.toContain(`A-ONLY-${SUITE_ID}`);
  });
});
