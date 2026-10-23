const sql = require('mssql');

const config = {
  server: 'localhost',
  port: 1434,
  database: 'HRIS',
  user: 'sa',
  password: 'P@ssw0rd',
  options: { trustServerCertificate: true }
};

(async () => {
  const pool = await sql.connect(config);
  
  // Get tenant and set session context for RLS
  const tenantResult = await pool.request().query("SELECT Id FROM Tenants WHERE CompanyCode = 'SYSTEM'");
  if (tenantResult.recordset.length === 0) {
    console.error('No SYSTEM tenant found!');
    process.exit(1);
  }
  const tenantId = tenantResult.recordset[0].Id;
  
  await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .query(`EXEC sp_set_session_context N'TenantId', @TenantId`);
  
  console.log('Tenant ID:', tenantId);
  
  // Check tenants
  const tenants = await pool.request().query('SELECT Id, CompanyCode, Status FROM Tenants WHERE IsDeleted = 0');
  console.log('\nTENANTS:', JSON.stringify(tenants.recordset, null, 2));
  
  // Check users
  const users = await pool.request().query('SELECT Id, Email, TenantId, IsActive FROM Users WHERE IsDeleted = 0');
  console.log('\nUSERS:', JSON.stringify(users.recordset, null, 2));
  
  // Check roles
  const roles = await pool.request().query('SELECT Id, Name FROM Roles WHERE IsDeleted = 0');
  console.log('\nROLES:', JSON.stringify(roles.recordset, null, 2));
  
  // Check departments
  const depts = await pool.request().query('SELECT Id, Name, Code FROM Departments WHERE IsDeleted = 0');
  console.log('\nDEPARTMENTS:', JSON.stringify(depts.recordset, null, 2));
  
  // Check positions
  const positions = await pool.request().query('SELECT Id, Title FROM Positions WHERE IsDeleted = 0');
  console.log('\nPOSITIONS:', JSON.stringify(positions.recordset, null, 2));
  
  // Check employees
  const employees = await pool.request().query('SELECT Id, EmployeeNo, FirstName, LastName, Email, DepartmentId, PositionId FROM Employees WHERE IsDeleted = 0');
  console.log('\nEMPLOYEES:', JSON.stringify(employees.recordset, null, 2));
  
  // Check employee-user links
  const links = await pool.request().query('SELECT UserId, EmployeeId FROM EmployeeUserLink');
  console.log('\nEMPLOYEE-USER LINKS:', JSON.stringify(links.recordset, null, 2));
  
  // Check user roles
  const userRoles = await pool.request().query('SELECT UserId, RoleId FROM UserRoles');
  console.log('\nUSER ROLES:', JSON.stringify(userRoles.recordset, null, 2));
  
  await pool.close();
})().catch(e => { console.error(e.message); process.exit(1); });
