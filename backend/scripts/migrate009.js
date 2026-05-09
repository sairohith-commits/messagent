'use strict';

// Run migration 009 against the production Railway Postgres.
// Usage: node scripts/migrate009.js

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL env var is required');
  process.exit(1);
}

const sql = fs.readFileSync(
  path.join(__dirname, '../src/db/009_suggested_replies.sql'),
  'utf8'
);

async function run() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('Connected to database');

  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('Migration 009 applied successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed — rolled back:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
