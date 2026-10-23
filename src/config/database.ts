import sql from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

function parseConnectionString(): sql.config {
  const url = process.env.DATABASE_URL;
  if (url) {
    const serverMatch = url.match(/server=([^;:]+)/i) || url.match(/\/\/([^:/;]+)/);
    const portMatch = url.match(/:(\d+)[\/;]/) || url.match(/:(\d+)$/) || url.match(/port=(\d+)/i);
    const dbMatch = url.match(/database=([^;]+)/i);
    const userMatch = url.match(/user=([^;]+)/i);
    const passMatch = url.match(/password=([^;]+)/i);
    const trustMatch = url.match(/trustServerCertificate=(true|false)/i);

    return {
      server: serverMatch?.[1] || 'localhost',
      port: parseInt(portMatch?.[1] || '1433'),
      database: dbMatch?.[1] || 'HRIS',
      user: userMatch?.[1] || 'sa',
      password: passMatch?.[1] || '',
      options: {
        encrypt: false,
        trustServerCertificate: trustMatch?.[1] !== 'false',
        enableArithAbort: true,
        requestTimeout: 60000,
        connectionRetryInterval: 2000,
        maxRetriesOnTransientErrors: 5,
        connectTimeout: 30000,
        cancelTimeout: 5000
      },
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
      }
    };
  }

  return {
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || 'P@ssw0rd',
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME || 'HRIS',
    port: parseInt(process.env.DB_PORT || '1433'),
    options: {
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true,
      requestTimeout: 30000,
      connectTimeout: 15000
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000
    }
  };
}

export const config: sql.config = parseConnectionString();

export async function getConnection(): Promise<sql.ConnectionPool> {
  return sql.connect(config);
}
