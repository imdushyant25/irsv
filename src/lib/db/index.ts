// File: src/lib/db/index.ts
import { Pool, QueryResult, QueryResultRow } from 'pg';

// Validate required environment variables
const requiredEnvVars = [
  'DB_USER',
  'DB_PASSWORD',
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_SCHEMA'
];

requiredEnvVars.forEach(envVar => {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
  }
});

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  // Add schema to search path if specified
  ...(process.env.DB_SCHEMA && {
    options: `-c search_path=${process.env.DB_SCHEMA}`
  }),
  // Connection pool settings
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: {
    rejectUnauthorized: false // Required for AWS RDS connections
  }
};

const pool = new Pool(config);

// Connection event handlers
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle database client', err);
  process.exit(-1);
});

// Add connection testing function
export async function checkConnection(): Promise<boolean> {
  let client;
  try {
    client = await pool.connect();
    // Set schema for this connection
    if (process.env.DB_SCHEMA) {
      await client.query(`SET search_path TO ${process.env.DB_SCHEMA}`);
    }
    await client.query('SELECT NOW()');
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  } finally {
    if (client) client.release();
  }
}

// Improved query function with better error handling and schema setting
export async function query<T extends QueryResultRow>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const client = await pool.connect();
  try {
    // Set schema for this connection
    if (process.env.DB_SCHEMA) {
      await client.query(`SET search_path TO ${process.env.DB_SCHEMA}`);
    }

    const start = Date.now();
    const result = await client.query<T>(text, params);
    const duration = Date.now() - start;
    
    // Log slow queries
    if (duration > 1000) {
      console.warn('Slow query:', { text, duration, rows: result.rowCount });
    }
    
    return result;
  } catch (error) {
    if (error instanceof Error) {
      console.error('Database query error:', {
        error: error.message,
        query: text,
        params
      });
    }
    throw error;
  } finally {
    client.release();
  }
}

// Health check function with more detailed diagnostics
export async function healthCheck(): Promise<{ 
  isHealthy: boolean; 
  details: string;
  config?: any;
}> {
  try {
    const result = await query('SELECT version(), current_database(), current_schema();');
    return {
      isHealthy: true,
      details: `Connected to ${result.rows[0].current_database} using schema ${result.rows[0].current_schema}`,
      config: {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        schema: process.env.DB_SCHEMA,
        user: process.env.DB_USER
      }
    };
  } catch (error) {
    return {
      isHealthy: false,
      details: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export { pool };
export type { QueryResult, QueryResultRow };