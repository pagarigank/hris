import sql from 'mssql';

const config = {
  server: 'localhost',
  port: 1433,
  database: 'HRIS',
  user: 'sa',
  password: 'P@ssw0rd',
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

async function checkAccounts() {
  const pool = await sql.connect(config);
  
  // Get SYSTEM tenant
  const tenantResult = await pool.request()
    .query("SELECT Id FROM dbo.Tenants WHERE CompanyCode = 'SYSTEM' AND IsDeleted = 0");
  
  const tenantId = tenantResult.recordset[0].Id;
  
  // Set RLS context
  await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .query(`EXEC sp_set_session_context N'TenantId', @TenantId`);
  
  // Check users and their roles
  const result = await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .query(`
      SELECT u.Id, u.Email, u.IsActive,
             STUFF((
               SELECT ', ' + r.Name
               FROM dbo.UserRoles ur2
               INNER JOIN dbo.Roles r ON ur2.RoleId = r.Id
               WHERE ur2.UserId = u.Id
               FOR XML PATH('')
             ), 1, 2, '') AS Roles
      FROM dbo.Users u
      WHERE u.TenantId = @TenantId AND u.IsDeleted = 0
    `);
  
  console.log('\nTest Accounts:');
  console.log('='.repeat(60));
  for (const user of result.recordset) {
    console.log(`${user.Email} | Active: ${user.IsActive} | Roles: ${user.Roles || 'NONE'}`);
  }
  
  await pool.close();
}

checkAccounts().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
