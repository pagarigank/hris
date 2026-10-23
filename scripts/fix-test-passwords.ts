import sql from 'mssql';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

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

async function fixPasswords() {
  const pool = await sql.connect(config);
  const newPassword = 'Admin123!';
  const hash = await bcrypt.hash(newPassword, 10);
  
  console.log('New password hash:', hash);
  
  // Update all test accounts
  const emails = [
    'admin@system.com',
    'tenantadmin@system.com',
    'hradmin@system.com',
    'employee@system.com'
  ];
  
  for (const email of emails) {
    const result = await pool.request()
      .input('Email', sql.NVarChar, email)
      .input('PasswordHash', sql.NVarChar, hash)
      .query(`
        UPDATE dbo.Users 
        SET PasswordHash = @PasswordHash, UpdatedAtUtc = GETUTCDATE()
        WHERE Email = @Email AND IsDeleted = 0
      `);
    
    console.log(`Updated ${email}: ${result.rowsAffected[0]} rows affected`);
  }
  
  console.log('\nDone! All test accounts now have password: Admin123!');
  await pool.close();
}

fixPasswords().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
