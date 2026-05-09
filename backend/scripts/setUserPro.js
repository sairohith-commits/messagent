'use strict';
const { Pool } = require('pg');

const DATABASE_URL = 'postgresql://postgres:eHOPSUzkucxEtHzglTIoBaxjSNvvfKfe@turntable.proxy.rlwy.net:10009/railway';
const USER_ID = '404ef8d8-9f72-45e3-8fe9-c6140006ee45';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  const res = await pool.query(
    `UPDATE users SET tier = 'pro', updated_at = NOW()
     WHERE id = $1
     RETURNING id, email, tier`,
    [USER_ID]
  );
  console.log('Updated:', JSON.stringify(res.rows[0], null, 2));
  await pool.end();
  process.exit(0);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
