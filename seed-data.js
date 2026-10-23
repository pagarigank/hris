const sql = require('mssql');
const bcrypt = require('bcryptjs');

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
  
  // Get system tenant
  const tenantResult = await pool.request().query("SELECT Id FROM Tenants WHERE CompanyCode = 'SYSTEM' AND IsDeleted = 0");
  if (tenantResult.recordset.length === 0) {
    console.error('No SYSTEM tenant found!');
    process.exit(1);
  }
  const tenantId = tenantResult.recordset[0].Id;
  console.log('Tenant ID:', tenantId);
  
  // Set SESSION_CONTEXT for RLS
  await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .query(`EXEC sp_set_session_context N'TenantId', @TenantId`);
  
  // Create Admin role if not exists
  const roleCheck = await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .query("SELECT Id FROM Roles WHERE Name = 'Admin' AND TenantId = @TenantId AND IsDeleted = 0");
  
  let roleId;
  if (roleCheck.recordset.length === 0) {
    roleId = 'A0000000-0000-0000-0000-000000000001';
    await pool.request()
      .input('Id', sql.UniqueIdentifier, roleId)
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Name', sql.NVarChar, 'Admin')
      .input('Description', sql.NVarChar, 'System Administrator')
      .query(`INSERT INTO Roles (Id, TenantId, Name, Description) VALUES (@Id, @TenantId, @Name, @Description)`);
    console.log('Created Admin role');
  } else {
    roleId = roleCheck.recordset[0].Id;
    console.log('Admin role exists:', roleId);
  }
  
  // Create User if not exists
  const userCheck = await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .input('Email', sql.NVarChar, 'admin@system.com')
    .query("SELECT Id FROM Users WHERE TenantId = @TenantId AND Email = @Email AND IsDeleted = 0");
  
  let userId;
  if (userCheck.recordset.length === 0) {
    userId = 'B0000000-0000-0000-0000-000000000001';
    const passwordHash = await bcrypt.hash('Admin123!', 10);
    await pool.request()
      .input('Id', sql.UniqueIdentifier, userId)
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Email', sql.NVarChar, 'admin@system.com')
      .input('PasswordHash', sql.NVarChar, passwordHash)
      .input('IsActive', sql.Bit, 1)
      .query(`INSERT INTO Users (Id, TenantId, Email, PasswordHash, IsActive) VALUES (@Id, @TenantId, @Email, @PasswordHash, @IsActive)`);
    console.log('Created user admin@system.com');
  } else {
    userId = userCheck.recordset[0].Id;
    console.log('User exists:', userId);
  }
  
  // Assign Admin role to user
  const urCheck = await pool.request()
    .input('UserId', sql.UniqueIdentifier, userId)
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .input('RoleId', sql.UniqueIdentifier, roleId)
    .query("SELECT UserId FROM UserRoles WHERE UserId = @UserId AND TenantId = @TenantId AND RoleId = @RoleId");
  
  if (urCheck.recordset.length === 0) {
    await pool.request()
      .input('UserId', sql.UniqueIdentifier, userId)
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('RoleId', sql.UniqueIdentifier, roleId)
      .query(`INSERT INTO UserRoles (UserId, TenantId, RoleId) VALUES (@UserId, @TenantId, @RoleId)`);
    console.log('Assigned Admin role to user');
  } else {
    console.log('User already has Admin role');
  }
  
  // Create Department if not exists
  const deptCheck = await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .query("SELECT Id FROM Departments WHERE TenantId = @TenantId AND IsDeleted = 0");
  
  let deptId;
  if (deptCheck.recordset.length === 0) {
    deptId = 'C0000000-0000-0000-0000-000000000001';
    await pool.request()
      .input('Id', sql.UniqueIdentifier, deptId)
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Name', sql.NVarChar, 'Administration')
      .input('Code', sql.NVarChar, 'ADMIN')
      .query(`INSERT INTO Departments (Id, TenantId, Name, Code) VALUES (@Id, @TenantId, @Name, @Code)`);
    console.log('Created Administration department');
  } else {
    deptId = deptCheck.recordset[0].Id;
    console.log('Department exists:', deptId);
  }
  
  // Create Position if not exists
  const posCheck = await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .query("SELECT Id FROM Positions WHERE TenantId = @TenantId AND IsDeleted = 0");
  
  let posId;
  if (posCheck.recordset.length === 0) {
    posId = 'D0000000-0000-0000-0000-000000000001';
    await pool.request()
      .input('Id', sql.UniqueIdentifier, posId)
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Title', sql.NVarChar, 'System Administrator')
      .input('DepartmentId', sql.UniqueIdentifier, deptId)
      .query(`INSERT INTO Positions (Id, TenantId, Title, DepartmentId) VALUES (@Id, @TenantId, @Title, @DepartmentId)`);
    console.log('Created System Administrator position');
  } else {
    posId = posCheck.recordset[0].Id;
    console.log('Position exists:', posId);
  }
  
  // Create Employee if not exists
  const empCheck = await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .query("SELECT Id FROM Employees WHERE TenantId = @TenantId AND IsDeleted = 0");
  
  let empId;
  if (empCheck.recordset.length === 0) {
    empId = 'E0000000-0000-0000-0000-000000000001';
    await pool.request()
      .input('Id', sql.UniqueIdentifier, empId)
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeNo', sql.NVarChar, 'EMP001')
      .input('FirstName', sql.NVarChar, 'Admin')
      .input('LastName', sql.NVarChar, 'User')
      .input('Email', sql.NVarChar, 'admin@system.com')
      .input('DepartmentId', sql.UniqueIdentifier, deptId)
      .input('PositionId', sql.UniqueIdentifier, posId)
      .input('EmploymentStatus', sql.NVarChar, 'Regular')
      .input('DateHired', sql.Date, '2024-01-01')
      .input('BasicSalary', sql.Decimal(18,4), 50000)
      .query(`INSERT INTO Employees (Id, TenantId, EmployeeNo, FirstName, LastName, Email, DepartmentId, PositionId, EmploymentStatus, DateHired, BasicSalary) 
              VALUES (@Id, @TenantId, @EmployeeNo, @FirstName, @LastName, @Email, @DepartmentId, @PositionId, @EmploymentStatus, @DateHired, @BasicSalary)`);
    console.log('Created employee');
  } else {
    empId = empCheck.recordset[0].Id;
    console.log('Employee exists:', empId);
  }
  
  // Create EmployeeUserLink if not exists
  const linkCheck = await pool.request()
    .input('UserId', sql.UniqueIdentifier, userId)
    .query("SELECT EmployeeId FROM EmployeeUserLink WHERE UserId = @UserId");
  
  if (linkCheck.recordset.length === 0) {
    await pool.request()
      .input('UserId', sql.UniqueIdentifier, userId)
      .input('EmployeeId', sql.UniqueIdentifier, empId)
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`INSERT INTO EmployeeUserLink (UserId, EmployeeId, TenantId) VALUES (@UserId, @EmployeeId, @TenantId)`);
    console.log('Created employee-user link');
  } else {
    console.log('Employee-user link exists');
  }
  
  // Create a LeaveCredit for the user
  const lcCheck = await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .query("SELECT Id FROM LeaveCredits WHERE TenantId = @TenantId");
  
  if (lcCheck.recordset.length === 0) {
    // Get VL leave type
    const vlType = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query("SELECT Id FROM LeaveTypes WHERE Code = 'VL' AND TenantId = @TenantId");
    
    if (vlType.recordset.length > 0) {
      await pool.request()
        .input('TenantId', sql.UniqueIdentifier, tenantId)
        .input('EmployeeId', sql.UniqueIdentifier, empId)
        .input('LeaveTypeId', sql.UniqueIdentifier, vlType.recordset[0].Id)
        .input('Year', sql.Int, 2026)
        .input('EarnedDays', sql.Decimal(5,2), 15)
        .input('UsedDays', sql.Decimal(5,2), 0)
        .input('BalanceDays', sql.Decimal(5,2), 15)
        .query(`INSERT INTO LeaveCredits (TenantId, EmployeeId, LeaveTypeId, Year, EarnedDays, UsedDays, BalanceDays) 
                VALUES (@TenantId, @EmployeeId, @LeaveTypeId, @Year, @EarnedDays, @UsedDays, @BalanceDays)`);
      console.log('Created Vacation Leave credit');
    }
  }
  
  console.log('\nSeed complete!');
  console.log('Test credentials: admin@system.com / Admin123!');
  await pool.close();
})().catch(e => { console.error('SEED ERROR:', e.message); process.exit(1); });
