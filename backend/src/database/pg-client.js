import { Pool } from 'pg';

let pool = null;

function toBool(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return String(value).toLowerCase() === 'true';
}

export function isPostgresEnabled() {
  return (process.env.DB_CLIENT || 'sqlite') === 'postgres';
}

export function getDatabaseRuntimeInfo() {
  return {
    dbClient: process.env.DB_CLIENT || 'sqlite',
    databasePath: process.env.DATABASE_PATH || '',
    postgresHost: process.env.POSTGRES_HOST || '127.0.0.1',
    postgresPort: Number(process.env.POSTGRES_PORT || 5432),
    postgresDb: process.env.POSTGRES_DB || 'mingri_lvtu',
    postgresUser: process.env.POSTGRES_USER || 'postgres'
  };
}

export function getPgPool() {
  if (!isPostgresEnabled()) {
    throw new Error('DB_CLIENT is not postgres');
  }

  if (pool) return pool;

  pool = new Pool({
    host: process.env.POSTGRES_HOST || '127.0.0.1',
    port: Number(process.env.POSTGRES_PORT || 5432),
    database: process.env.POSTGRES_DB || 'mingri_lvtu',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
    ssl: toBool(process.env.POSTGRES_SSL, false) ? { rejectUnauthorized: false } : false,
    max: Number(process.env.POSTGRES_MAX_POOL || 10),
    idleTimeoutMillis: 30000
  });

  pool.on('error', (error) => {
    console.error('❌ PostgreSQL Pool Error:', error.message);
  });

  return pool;
}

export async function pgQuery(text, params = []) {
  const pg = getPgPool();
  return pg.query(text, params);
}

export async function closePgPool() {
  if (!pool) return;
  await pool.end();
  pool = null;
}
