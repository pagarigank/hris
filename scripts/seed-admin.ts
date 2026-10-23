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

async function seedAccounts() {
  const pool = await sql.connect(config);
  const hash = await bcrypt.hash('Admin123!', 10);
  
  console.log('Password hash:', hash);
  
  // Get SYSTEM tenant
  const tenantResult = await pool.request()
    .query("SELECT Id FROM dbo.Tenants WHERE CompanyCode = 'SYSTEM'");
  
  if (tenantResult.recordset.length === 0) {
    console.log('No SYSTEM tenant found. Creating one...');
    const createTenant = await pool.request()
      .query(`
        INSERT INTO dbo.Tenants (CompanyName, CompanyCode, Status, SubscriptionPlan)
        VALUES ('System Admin', 'SYSTEM', 'Active', 'Enterprise');
        SELECT SCOPE_IDENTITY() AS Id;
      `);
    var tenantId = createTenant.recordset[0].Id;
    console.log('Created SYSTEM tenant:', tenantId);
  } else {
    var tenantId = tenantResult.recordset[0].Id;
    console.log('Found SYSTEM tenant:', tenantId);
  }
  
  // Set RLS context
  await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .query(`EXEC sp_set_session_context N'TenantId', @TenantId`);
  
  // Check existing users
  const existing = await pool.request()
    .query("SELECT Email FROM dbo.Users");
  console.log('\nExisting users:', existing.recordset.map((r: any) => r.Email));
  
  // Get or create Super Admin role
  let superAdminRoleId: string;
  const roleResult = await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .query("SELECT Id FROM dbo.Roles WHERE Name = 'Super Admin' AND IsDeleted = 0");
  
  if (roleResult.recordset.length === 0) {
    const createRole = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        INSERT INTO dbo.Roles (TenantId, Name, IsSystemRole)
        VALUES (@TenantId, 'Super Admin', 1);
        SELECT SCOPE_IDENTITY() AS Id;
      `);
    superAdminRoleId = createRole.recordset[0].Id;
    console.log('Created Super Admin role:', superAdminRoleId);
  } else {
    superAdminRoleId = roleResult.recordset[0].Id;
    console.log('Found Super Admin role:', superAdminRoleId);
  }
  
  // Create admin user
  const email = 'admin@system.com';
  const userCheck = await pool.request()
    .input('Email', sql.NVarChar, email)
    .query("SELECT Id FROM dbo.Users WHERE Email = @Email");
  
  if (userCheck.recordset.length === 0) {
    const userResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Email', sql.NVarChar, email)
      .input('PasswordHash', sql.NVarChar, hash)
      .query(`
        INSERT INTO dbo.Users (TenantId, Email, PasswordHash, IsActive)
        VALUES (@TenantId, @Email, @PasswordHash, 1);
        SELECT SCOPE_IDENTITY() AS Id;
      `);
    
    const userId = userResult.recordset[0].Id;
    console.log('Created user:', userId);
    
    // Assign role
    await pool.request()
      .input('UserId', sql.UniqueIdentifier, userId)
      .input('RoleId', sql.UniqueIdentifier, superAdminRoleId)
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        INSERT INTO dbo.UserRoles (UserId, RoleId, TenantId)
        VALUES (@UserId, @RoleId, @TenantId)
      `);
    console.log('Assigned Super Admin role');
  } else {
    console.log('User already exists:', userCheck.recordset[0].Id);
    
    // Update password
    await pool.request()
      .input('Email', sql.NVarChar, email)
      .input('PasswordHash', sql.NVarChar, hash)
      .query("UPDATE dbo.Users SET PasswordHash = @PasswordHash WHERE Email = @Email");
    console.log('Updated password');
  }
  
  // Verify
  const verify = await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .query(`
      SELECT u.Email, u.PasswordHash,
             (SELECT r.Name FROM dbo.UserRoles ur JOIN dbo.Roles r ON ur.RoleId = r.Id WHERE ur.UserId = u.Id) AS Role
      FROM dbo.Users u
      WHERE u.TenantId = @TenantId
    `);
  
  console.log('\nVerification:');
  for (const row of verify.recordset) {
    console.log(`${row.Email} | Role: ${row.Role}`);
  }
  
  await pool.close();
  console.log('\nDone!');
}

seedAccounts().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
