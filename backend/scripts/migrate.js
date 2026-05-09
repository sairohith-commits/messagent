// Migration runner — applies all SQL files in backend/src/db/ in filename order.
// Safe to run multiple times because every statement uses IF NOT EXISTS / ON CONFLICT.
//
// Usage: node scripts/migrate.js

'use strict';

require('dotenv').config();

const fs   = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DB_DIR = path.join(__dirname, '..', 'src', 'db');

async function migrate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log('[migrate] Connected to database');

  // Collect .sql files sorted lexicographically (001_..., 008_..., etc.)
  const sqlFiles = fs
    .readdirSync(DB_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (!sqlFiles.length) {
    console.log('[migrate] No SQL files found — nothing to run');
    await pool.end();
    return;
  }

  for (const file of sqlFiles) {
    const filePath = path.join(DB_DIR, file);
    const sql      = fs.readFileSync(filePath, 'utf-8');

    console.log(`[migrate] Running ${file}…`);
    try {
      await pool.query(sql);
      console.log(`[migrate] ✓ ${file}`);
    } catch (err) {
      console.error(`[migrate] ✗ ${file}: ${err.message}`);
      await pool.end();
      process.exit(1);
    }
  }

  console.log(`[migrate] All ${sqlFiles.length} migration(s) applied successfully`);
  await pool.end();
}

migrate().catch((err) => {
  console.error('[migrate] Fatal error:', err.message);
  process.exit(1);
});
