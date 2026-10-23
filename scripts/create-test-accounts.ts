import sql from 'mssql';
import bcrypt from 'bcryptjs';

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

async function createTestAccounts() {
  const pool = await sql.connect(config);
  const password = 'Admin123!';
  const hash = await bcrypt.hash(password, 10);
  
  // Get SYSTEM tenant
  const tenantResult = await pool.request()
    .query("SELECT Id FROM dbo.Tenants WHERE CompanyCode = 'SYSTEM' AND IsDeleted = 0");
  
  if (tenantResult.recordset.length === 0) {
    console.error('SYSTEM tenant not found!');
    await pool.close();
    return;
  }
  
  const tenantId = tenantResult.recordset[0].Id;
  console.log('Tenant ID:', tenantId);
  
  // Set RLS session context
  await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .query(`EXEC sp_set_session_context N'TenantId', @TenantId`);
  console.log('Set RLS session context');
  
  // Get roles
  const rolesResult = await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .query("SELECT Id, Name FROM dbo.Roles WHERE TenantId = @TenantId AND IsDeleted = 0");
  
  const roles: Record<string, string> = {};
  for (const role of rolesResult.recordset) {
    roles[role.Name] = role.Id;
  }
  console.log('Roles:', Object.keys(roles));
  
  // Create test accounts
  const accounts = [
    { email: 'admin@system.com', role: 'Super Admin' },
    { email: 'tenantadmin@system.com', role: 'Tenant Admin' },
    { email: 'hradmin@system.com', role: 'HR Admin' },
    { email: 'employee@system.com', role: 'Employee' },
  ];
  
  for (const account of accounts) {
    // Check if user exists
    const userCheck = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Email', sql.NVarChar, account.email)
      .query('SELECT Id FROM dbo.Users WHERE TenantId = @TenantId AND Email = @Email');
    
    let userId: string;
    
    if (userCheck.recordset.length > 0) {
      // User exists, update password
      userId = userCheck.recordset[0].Id;
      await pool.request()
        .input('UserId', sql.UniqueIdentifier, userId)
        .input('PasswordHash', sql.NVarChar, hash)
        .query('UPDATE dbo.Users SET PasswordHash = @PasswordHash WHERE Id = @UserId');
      console.log(`Updated password for ${account.email}`);
    } else {
      // Create user
      const userResult = await pool.request()
        .input('TenantId', sql.UniqueIdentifier, tenantId)
        .input('Email', sql.NVarChar, account.email)
        .input('PasswordHash', sql.NVarChar, hash)
        .query(`
          INSERT INTO dbo.Users (TenantId, Email, PasswordHash, IsActive)
          VALUES (@TenantId, @Email, @PasswordHash, 1);
          SELECT SCOPE_IDENTITY() AS Id;
        `);
      userId = userResult.recordset[0].Id;
      console.log(`Created ${account.email}`);
    }
    
    // Assign role if not already assigned
    if (roles[account.role]) {
      const roleCheck = await pool.request()
        .input('UserId', sql.UniqueIdentifier, userId)
        .input('RoleId', sql.UniqueIdentifier, roles[account.role])
        .query('SELECT 1 FROM dbo.UserRoles WHERE UserId = @UserId AND RoleId = @RoleId');
      
      if (roleCheck.recordset.length === 0) {
        await pool.request()
          .input('UserId', sql.UniqueIdentifier, userId)
          .input('RoleId', sql.UniqueIdentifier, roles[account.role])
          .input('TenantId', sql.UniqueIdentifier, tenantId)
          .query(`
            INSERT INTO dbo.UserRoles (UserId, RoleId, TenantId)
            VALUES (@UserId, @RoleId, @TenantId)
          `);
        console.log(`Assigned ${account.role} to ${account.email}`);
      }
    }
  }
  
  console.log('\nAll test accounts ready!');
  console.log('Password for all accounts: Admin123!');
  await pool.close();
}

createTestAccounts().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
