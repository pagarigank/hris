import sql from 'mssql';
import fs from 'fs';
import path from 'path';
import { config } from '../config/database';

const MIGRATIONS_DIR = path.join(__dirname);

interface Migration {
  version: string;
  filename: string;
  executedAt?: Date;
}

export async function runMigrations(): Promise<void> {
  let pool: sql.ConnectionPool | null = null;
  
  try {
    pool = await sql.connect(config);
    
    // Create migrations tracking table if it doesn't exist
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Migrations')
      BEGIN
        CREATE TABLE dbo.Migrations (
          Id INT IDENTITY(1,1) PRIMARY KEY,
          Version NVARCHAR(10) NOT NULL UNIQUE,
          Filename NVARCHAR(255) NOT NULL,
          ExecutedAtUtc DATETIME2 DEFAULT GETUTCDATE()
        );
      END
    `);
    
    // Get list of executed migrations
    const executedResult = await pool.request().query(`
      SELECT Version, Filename, ExecutedAtUtc 
      FROM dbo.Migrations 
      ORDER BY Version
    `);
    
    const executedMigrations = new Map<string, Migration>();
    for (const record of executedResult.recordset) {
      executedMigrations.set(record.Version, {
        version: record.Version,
        filename: record.Filename,
        executedAt: record.ExecutedAtUtc
      });
    }
    
    // Get all migration files
    const migrationFiles = fs.readdirSync(MIGRATIONS_DIR)
      .filter(file => file.endsWith('.sql') && /^\d{3}_/.test(file))
      .sort();
    
    console.log(`Found ${migrationFiles.length} migration files`);
    console.log(`Already executed: ${executedMigrations.size} migrations`);
    
    // Execute pending migrations
    for (const filename of migrationFiles) {
      const version = filename.substring(0, 3);
      
      if (executedMigrations.has(version)) {
        console.log(`Migration ${version} already executed, skipping...`);
        continue;
      }
      
      console.log(`Executing migration ${version}: ${filename}`);
      
      const filePath = path.join(MIGRATIONS_DIR, filename);
      const sqlContent = fs.readFileSync(filePath, 'utf-8');
      
      // Split by GO statements for SQL Server batches
      const batches = sqlContent.split(/\bGO\b/i).filter(batch => batch.trim());
      
      for (const batch of batches) {
        if (batch.trim()) {
          await pool!.request().query(batch);
        }
      }
      
      // Record migration as executed
      await pool!.request()
        .input('Version', sql.NVarChar, version)
        .input('Filename', sql.NVarChar, filename)
        .query(`
          INSERT INTO dbo.Migrations (Version, Filename)
          VALUES (@Version, @Filename)
        `);
      
      console.log(`Migration ${version} executed successfully`);
    }
    
    console.log('All migrations completed successfully');
    
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    if (pool) {
      await pool.close();
    }
  }
}

// Run if called directly
if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('Migrations completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migrations failed:', error);
      process.exit(1);
    });
}
