// Connection tester — verify PostgreSQL, Redis, and Anthropic API are reachable.
// Run this after `npm run setup` and `docker compose up -d` to confirm everything works.
//
// Usage: node scripts/testConnections.js   (or: npm run test:connections)

'use strict';

require('dotenv').config();

const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';

const pass = (label, detail) =>
  console.log(`  ${GREEN}✅ PASS${RESET}  ${BOLD}${label}${RESET}${detail ? `  — ${detail}` : ''}`);
const fail = (label, detail) =>
  console.log(`  ${RED}❌ FAIL${RESET}  ${BOLD}${label}${RESET}${detail ? `\n         ${RED}${detail}${RESET}` : ''}`);
const skip = (label, reason) =>
  console.log(`  ${YELLOW}⏭  SKIP${RESET}  ${BOLD}${label}${RESET}  — ${reason}`);

// ─── 1. PostgreSQL ────────────────────────────────────────────────────────────
async function testPostgres() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    fail('PostgreSQL', 'DATABASE_URL is not set in .env');
    return false;
  }

  let pool;
  try {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: url, connectionTimeoutMillis: 10000 });
    const { rows } = await pool.query('SELECT NOW() AS ts, current_database() AS db');
    const { rows: tables } = await pool.query(
      `SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    pass(
      'PostgreSQL',
      `db=${rows[0].db}  tables=${tables[0].n}  server_time=${rows[0].ts.toISOString()}`,
    );
    return true;
  } catch (err) {
    fail('PostgreSQL', err.message);
    console.log(`\n         ${CYAN}Troubleshoot:${RESET}`);
    if (err.message.includes('connect ECONNREFUSED')) {
      console.log('         • Is Docker running?  →  docker compose up -d');
      console.log('         • Is the port correct?  Default: 5432');
    } else if (err.message.includes('password')) {
      console.log('         • Check POSTGRES_USER / POSTGRES_PASSWORD in docker-compose.yml');
      console.log('         • And DATABASE_URL credentials in backend/.env');
    } else if (err.message.includes('database') && err.message.includes('not exist')) {
      console.log('         • The database was not created — re-run: docker compose down -v && docker compose up -d');
    }
    return false;
  } finally {
    await pool?.end().catch(() => {});
  }
}

// ─── 2. Redis ─────────────────────────────────────────────────────────────────
async function testRedis() {
  let client;
  try {
    const ioredis = require('ioredis');
    client = new ioredis({
      host:                 process.env.REDIS_HOST ?? 'localhost',
      port:                 Number(process.env.REDIS_PORT ?? 6379),
      password:             process.env.REDIS_PASSWORD || undefined,
      lazyConnect:          true,
      connectTimeout:       5000,
      maxRetriesPerRequest: 0,
      enableOfflineQueue:   false,
    });
    await client.connect();

    // Round-trip: set → get → del
    const key = `messagent:test:${Date.now()}`;
    await client.set(key, 'ok', 'EX', 5);
    const val = await client.get(key);
    await client.del(key);

    const info     = await client.info('server');
    const version  = (info.match(/redis_version:(.+)/) ?? [])[1]?.trim() ?? 'unknown';

    if (val === 'ok') {
      pass('Redis', `version=${version}  SET/GET/DEL round-trip succeeded`);
      return true;
    } else {
      fail('Redis', `Unexpected GET value: ${val}`);
      return false;
    }
  } catch (err) {
    fail('Redis', err.message);
    console.log(`\n         ${CYAN}Troubleshoot:${RESET}`);
    if (err.message.includes('ECONNREFUSED')) {
      console.log('         • Is Docker running?  →  docker compose up -d');
      console.log('         • Default port: 6379');
    } else if (err.message.includes('WRONGPASS') || err.message.includes('NOAUTH')) {
      console.log('         • Check REDIS_PASSWORD in backend/.env');
      console.log('         • Local dev Redis has no password — leave REDIS_PASSWORD empty');
    }
    return false;
  } finally {
    client?.disconnect();
  }
}

// ─── 3. Gmail OAuth ───────────────────────────────────────────────────────────
async function testGmailOAuth() {
  const clientId     = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const redirectUri  = process.env.GMAIL_REDIRECT_URI;

  if (!clientId || !clientSecret) {
    skip('Gmail OAuth', 'GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET not set — see GMAIL_SETUP.md');
    return null;
  }

  try {
    const { google } = require('googleapis');
    const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    // Verify the client initialised and can generate an auth URL — no network call needed
    const url = client.generateAuthUrl({
      access_type: 'offline',
      scope:       ['https://www.googleapis.com/auth/gmail.readonly'],
    });

    if (!url.startsWith('https://accounts.google.com/')) {
      fail('Gmail OAuth', `Unexpected auth URL: ${url}`);
      return false;
    }

    const shortId = clientId.length > 20 ? clientId.slice(0, 20) + '...' : clientId;
    pass('Gmail OAuth', `client initialised  client_id=${shortId}`);
    return true;
  } catch (err) {
    fail('Gmail OAuth', err.message);
    console.log(`\n         ${CYAN}Troubleshoot:${RESET}`);
    if (err.message.includes('Cannot find module')) {
      console.log('         • googleapis is not installed:  npm install googleapis');
    } else {
      console.log('         • Check GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in backend/.env');
      console.log('         • Follow GMAIL_SETUP.md Step 4 to create OAuth credentials');
    }
    return false;
  }
}

// ─── 4. Anthropic API ─────────────────────────────────────────────────────────
async function testAnthropic() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !apiKey.startsWith('sk-')) {
    skip('Anthropic API', 'ANTHROPIC_API_KEY not set — free-tier Gemma still works without it');
    return null;
  }

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client    = new Anthropic.default({ apiKey });

    const msg = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 16,
      messages:   [{ role: 'user', content: 'Reply with: PONG' }],
    });

    const reply = msg.content?.[0]?.text?.trim() ?? '(empty)';
    pass('Anthropic API', `claude-haiku responded: "${reply}"`);
    return true;
  } catch (err) {
    fail('Anthropic API', err.message);
    console.log(`\n         ${CYAN}Troubleshoot:${RESET}`);
    if (err.status === 401 || err.message.includes('auth')) {
      console.log('         • Invalid API key — check ANTHROPIC_API_KEY in backend/.env');
      console.log('         • Keys start with "sk-ant-..."');
    } else if (err.status === 429) {
      console.log('         • Rate limited — wait a minute and try again');
    } else if (err.message.includes('ENOTFOUND') || err.message.includes('network')) {
      console.log('         • No internet connection');
    }
    return false;
  }
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
(async () => {
  console.log(`\n${BOLD}${CYAN}Messagent — Connection Tests${RESET}\n`);

  const [pg, redis, gmail, anthropic] = await Promise.allSettled([
    testPostgres(),
    testRedis(),
    testGmailOAuth(),
    testAnthropic(),
  ]).then((r) => r.map((x) => (x.status === 'fulfilled' ? x.value : false)));

  console.log(`\n${BOLD}${'─'.repeat(52)}${RESET}`);

  const failed = [
    pg        === false && 'PostgreSQL',
    redis     === false && 'Redis',
    gmail     === false && 'Gmail OAuth',
    anthropic === false && 'Anthropic API',
  ].filter(Boolean);

  if (failed.length === 0) {
    console.log(`\n  ${GREEN}${BOLD}All connections healthy — ready to start the server.${RESET}`);
    console.log(`\n  Run:  ${CYAN}npm run dev${RESET}\n`);
  } else {
    console.log(`\n  ${RED}${failed.length} connection(s) failed: ${failed.join(', ')}${RESET}`);
    console.log(`\n  Fix the issues above, then run:  ${CYAN}node scripts/testConnections.js${RESET}\n`);
    process.exit(1);
  }
})();
