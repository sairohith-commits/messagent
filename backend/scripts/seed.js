// Development seed script — creates a test user and default platform configs.
// FOR DEVELOPMENT ONLY — do not run against production databases.
//
// Usage: node scripts/seed.js

'use strict';

require('dotenv').config();

const bcrypt   = require('bcryptjs');
const { Pool } = require('pg');

const TEST_USER = {
  email:    'test@messagent.app',
  name:     'Test User',
  password: 'testpass123',
};

const PLATFORMS = ['gmail', 'whatsapp', 'instagram', 'telegram'];

async function seed() {
  if (process.env.NODE_ENV === 'production') {
    console.error('[seed] Refusing to run against NODE_ENV=production');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  console.log('[seed] Connected — seeding development data…');

  const passwordHash = await bcrypt.hash(TEST_USER.password, 10);

  const { rows: existing } = await pool.query(
    'SELECT id FROM users WHERE email = $1',
    [TEST_USER.email],
  );

  let userId;
  if (existing.length) {
    userId = existing[0].id;
    console.log(`[seed] Test user already exists (id: ${userId})`);
  } else {
    const { rows } = await pool.query(
      `INSERT INTO users (email, name, password_hash)
       VALUES ($1, $2, $3) RETURNING id`,
      [TEST_USER.email, TEST_USER.name, passwordHash],
    );
    userId = rows[0].id;
    console.log(`[seed] Created test user (id: ${userId})`);
  }

  for (const platform of PLATFORMS) {
    await pool.query(
      `INSERT INTO platform_configs (user_id, platform, enabled, mode)
       VALUES ($1, $2, false, 'assistant')
       ON CONFLICT (user_id, platform) DO NOTHING`,
      [userId, platform],
    );
  }

  console.log('[seed] Platform configs ready');
  console.log('');
  console.log('─────────────────────────────────────────');
  console.log('  Test account credentials:');
  console.log(`  Email:    ${TEST_USER.email}`);
  console.log(`  Password: ${TEST_USER.password}`);
  console.log('─────────────────────────────────────────');

  await pool.end();
}

seed().catch((err) => {
  console.error('[seed] Fatal error:', err.message);
  process.exit(1);
});
