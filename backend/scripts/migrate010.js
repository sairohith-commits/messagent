'use strict';

const { Client } = require('pg');
const fs   = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL required'); process.exit(1); }

const sql = fs.readFileSync(path.join(__dirname, '../src/db/010_expo_push_token.sql'), 'utf8');

async function run() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected');
  try {
    await client.query(sql);
    console.log('Migration 010 applied');
  } finally {
    await client.end();
  }
}

run().catch((e) => { console.error(e.message); process.exit(1); });
