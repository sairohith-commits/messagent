// PostgreSQL connection pool — import { query } from './db/index.js' everywhere you need DB access

'use strict';

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Railway Postgres uses SSL — rejectUnauthorized false accepts self-signed certs.
  // Locally (NODE_ENV !== 'production') SSL is disabled so Docker works without certs.
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000,
});

pool.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err.message);
});

/**
 * Run a parameterised SQL query against the pool.
 * @param {string} text   SQL string with $1, $2 … placeholders
 * @param {any[]}  params Parameter values
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

/**
 * Verify the connection on startup — throws if the DB is unreachable.
 */
async function connect() {
  const res = await query('SELECT NOW() AS now', []);
  console.info(`[db] Connected — server time: ${res.rows[0].now}`);
}

module.exports = { query, connect, pool };
