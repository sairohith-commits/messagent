'use strict';
const { Pool } = require('pg');

// Use public Railway Postgres proxy (internal URL is only accessible from within Railway)
const DATABASE_URL = process.env.EXTERNAL_DATABASE_URL
  || 'postgresql://postgres:eHOPSUzkucxEtHzglTIoBaxjSNvvfKfe@turntable.proxy.rlwy.net:10009/railway';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  const res = await pool.query(
    `SELECT u.id, u.email, u.tier, pt.account_email
     FROM users u
     JOIN platform_tokens pt ON pt.user_id = u.id
     WHERE pt.platform = 'gmail'`
  );
  console.log(JSON.stringify(res.rows, null, 2));
  await pool.end();
  process.exit(0);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
