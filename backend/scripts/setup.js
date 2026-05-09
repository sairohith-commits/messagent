// Pre-flight setup checker — run once before starting local development.
// Usage: node scripts/setup.js   (or: npm run setup)
//
// Checks: Node version, .env file, Docker, PostgreSQL, Redis.
// Prints ✅ / ❌ for each check and a tailored "next steps" list.

'use strict';

const fs            = require('fs');
const path          = require('path');
const { execSync }  = require('child_process');

// ─── ANSI helpers ─────────────────────────────────────────────────────────────
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';

const ok   = (msg) => console.log(`  ${GREEN}✅${RESET}  ${msg}`);
const fail = (msg) => console.log(`  ${RED}❌${RESET}  ${msg}`);
const warn = (msg) => console.log(`  ${YELLOW}⚠️ ${RESET}  ${msg}`);
const info = (msg) => console.log(`  ${CYAN}ℹ️ ${RESET}  ${msg}`);
const hr   = ()    => console.log(`\n${BOLD}${'─'.repeat(52)}${RESET}`);

// ─── RESULTS ACCUMULATOR ──────────────────────────────────────────────────────
const issues = [];
const nexts  = [];

function flag(message, nextStep) {
  issues.push(message);
  if (nextStep) nexts.push(nextStep);
}

// ─── CHECK 1: Node version ────────────────────────────────────────────────────
async function checkNode() {
  hr();
  console.log(`${BOLD}1. Node.js version${RESET}`);
  const [major] = process.versions.node.split('.').map(Number);
  if (major >= 18) {
    ok(`Node.js ${process.versions.node} (>= 18 required)`);
  } else {
    fail(`Node.js ${process.versions.node} — need >= 18`);
    flag('Node version too old', 'Install Node.js 20 LTS from https://nodejs.org');
  }
}

// ─── CHECK 2: .env file ───────────────────────────────────────────────────────
async function checkEnv() {
  hr();
  console.log(`${BOLD}2. Environment file${RESET}`);

  const envPath     = path.join(__dirname, '..', '.env');
  const localEx     = path.join(__dirname, '..', '.env.local.example');
  const fullEx      = path.join(__dirname, '..', '.env.example');

  if (fs.existsSync(envPath)) {
    ok('.env file exists');

    // Spot-check required variables
    const env = fs.readFileSync(envPath, 'utf-8');
    const required = ['DATABASE_URL', 'REDIS_HOST', 'JWT_SECRET'];
    const missing  = required.filter((v) => !env.includes(v + '=') || env.match(new RegExp(`^${v}=$`, 'm')));
    if (missing.length) {
      warn(`These required vars appear empty in .env: ${missing.join(', ')}`);
      flag('Some required env vars are empty', `Edit backend/.env and fill in: ${missing.join(', ')}`);
    } else {
      ok('Required variables (DATABASE_URL, REDIS_HOST, JWT_SECRET) are set');
    }

    const hasAnthropicKey = env.match(/^ANTHROPIC_API_KEY=sk-/m);
    if (!hasAnthropicKey) {
      warn('ANTHROPIC_API_KEY is not set — Pro/Business AI replies will fail');
      flag(
        'ANTHROPIC_API_KEY missing',
        'Get your key from console.anthropic.com and add it to backend/.env',
      );
    } else {
      ok('ANTHROPIC_API_KEY is set');
    }
  } else {
    fail('.env file not found');
    const source = fs.existsSync(localEx) ? '.env.local.example' : '.env.example';
    info(`Copying ${source} → .env`);
    fs.copyFileSync(fs.existsSync(localEx) ? localEx : fullEx, envPath);
    ok(`.env created from ${source}`);
    flag(
      '.env was missing and has been created',
      'Open backend/.env and set ANTHROPIC_API_KEY (and any other keys you need)',
    );
  }
}

// ─── CHECK 3: Docker ──────────────────────────────────────────────────────────
async function checkDocker() {
  hr();
  console.log(`${BOLD}3. Docker${RESET}`);
  try {
    execSync('docker info', { stdio: 'pipe' });
    ok('Docker daemon is running');

    // Check if our compose services are already up
    try {
      const ps = execSync('docker compose ps --format json', {
        cwd: path.join(__dirname, '..'),
        stdio: 'pipe',
      }).toString();
      const running = (ps.match(/"State":"running"/g) || []).length;
      if (running >= 2) {
        ok(`Docker Compose services are running (${running} service(s) up)`);
      } else {
        warn('Docker Compose services are not running yet');
        nexts.push('cd backend && docker compose up -d');
      }
    } catch {
      warn('Could not query compose status (compose not started yet)');
      nexts.push('cd backend && docker compose up -d');
    }
  } catch {
    fail('Docker daemon is not running (or Docker is not installed)');
    flag(
      'Docker not running',
      'Start Docker Desktop, then run: cd backend && docker compose up -d',
    );
  }
}

// ─── CHECK 4: PostgreSQL ──────────────────────────────────────────────────────
async function checkPostgres() {
  hr();
  console.log(`${BOLD}4. PostgreSQL${RESET}`);

  // Load .env so we have DATABASE_URL
  try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch {}

  const url = process.env.DATABASE_URL;
  if (!url) {
    fail('DATABASE_URL is not set in .env — skipping connection test');
    flag('DATABASE_URL missing', 'Add DATABASE_URL to backend/.env');
    return;
  }

  let pg;
  try { pg = require('pg'); } catch {
    warn('pg package not installed yet — run npm install first');
    return;
  }

  const pool = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 3000 });
  try {
    const { rows } = await pool.query('SELECT version()');
    ok(`PostgreSQL connected — ${rows[0].version.split(' ').slice(0, 2).join(' ')}`);

    // Check if tables exist
    const { rows: tables } = await pool.query(
      `SELECT COUNT(*) AS n FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'users'`,
    );
    if (Number(tables[0].n) > 0) {
      ok('Schema is applied (users table found)');
    } else {
      warn('Database is empty — migrations have not been run');
      nexts.push('cd backend && npm run migrate');
    }
  } catch (err) {
    fail(`PostgreSQL connection failed: ${err.message}`);
    flag('PostgreSQL unreachable', 'Start containers: cd backend && docker compose up -d');
  } finally {
    await pool.end().catch(() => {});
  }
}

// ─── CHECK 5: Redis ───────────────────────────────────────────────────────────
async function checkRedis() {
  hr();
  console.log(`${BOLD}5. Redis${RESET}`);

  let ioredis;
  try { ioredis = require('ioredis'); } catch {
    warn('ioredis not installed yet — run npm install first');
    return;
  }

  const client = new ioredis({
    host:                  process.env.REDIS_HOST ?? 'localhost',
    port:                  Number(process.env.REDIS_PORT ?? 6379),
    password:              process.env.REDIS_PASSWORD || undefined,
    lazyConnect:           true,
    connectTimeout:        3000,
    maxRetriesPerRequest:  0,
    enableOfflineQueue:    false,
  });

  try {
    await client.connect();
    const pong = await client.ping();
    ok(`Redis connected — PING → ${pong}`);
  } catch (err) {
    fail(`Redis connection failed: ${err.message}`);
    flag('Redis unreachable', 'Start containers: cd backend && docker compose up -d');
  } finally {
    client.disconnect();
  }
}

// ─── SUMMARY ─────────────────────────────────────────────────────────────────
function printSummary() {
  hr();
  console.log(`${BOLD}Summary${RESET}\n`);

  if (issues.length === 0) {
    console.log(`  ${GREEN}${BOLD}All checks passed — you're ready to develop! 🚀${RESET}`);
    console.log('');
    console.log('  Next: npm run migrate && npm run seed && npm run dev');
  } else {
    console.log(`  ${RED}${issues.length} issue(s) need attention:${RESET}\n`);
    issues.forEach((iss, i) => console.log(`  ${i + 1}. ${iss}`));
    if (nexts.length) {
      console.log(`\n  ${BOLD}Suggested next steps:${RESET}`);
      nexts.forEach((n, i) => console.log(`  ${i + 1}. ${n}`));
    }
  }
  console.log('');
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
(async () => {
  console.log(`\n${BOLD}${CYAN}Messagent — Local Dev Setup Checker${RESET}`);
  try {
    await checkNode();
    await checkEnv();
    await checkDocker();
    await checkPostgres();
    await checkRedis();
  } catch (err) {
    console.error('\n[setup] Unexpected error:', err.message);
  }
  printSummary();
})();
