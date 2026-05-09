// End-to-end Gmail pipeline test — runs against the PRODUCTION backend.
// Tests: register → get OAuth URL → enable agent settings → print next steps.
//
// Usage: node scripts/testEndToEnd.js
//        BACKEND_URL=https://... node scripts/testEndToEnd.js

'use strict';

const https = require('https');
const http  = require('http');

const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';

const PROD_URL  = process.env.BACKEND_URL ?? 'https://messagent-backend-production.up.railway.app';
const PROD_REDIRECT = `${PROD_URL}/gmail/callback`;

function pass(label, detail) {
  console.log(`  ${GREEN}✅ PASS${RESET}  ${BOLD}${label}${RESET}${detail ? `  — ${detail}` : ''}`);
}
function fail(label, detail) {
  console.log(`  ${RED}❌ FAIL${RESET}  ${BOLD}${label}${RESET}${detail ? `\n         ${RED}${detail}${RESET}` : ''}`);
}
function step(n, label) {
  console.log(`\n${BOLD}${CYAN}── Step ${n}: ${label}${RESET}`);
}

// ─── HTTP helper (handles both http and https) ────────────────────────────────
function request(method, urlStr, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const url     = new URL(urlStr);
    const payload = body ? JSON.stringify(body) : undefined;
    const lib     = url.protocol === 'https:' ? https : http;

    const options = {
      hostname: url.hostname,
      port:     url.port || (url.protocol === 'https:' ? 443 : 80),
      path:     url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...extraHeaders,
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ─── Step 1: health check ────────────────────────────────────────────────────
async function checkHealth() {
  step(1, 'Health check');
  const res = await request('GET', `${PROD_URL}/health`);
  if (res.status === 200 && res.body.status === 'ok') {
    pass('Health', `${PROD_URL}/health → 200  uptime=${res.body.uptime}s`);
    return true;
  }
  fail('Health', `status=${res.status}  body=${JSON.stringify(res.body)}`);
  return false;
}

// ─── Step 2: register a test user ────────────────────────────────────────────
async function registerUser() {
  step(2, 'Register test user on production');
  const email    = `e2e-test-${Date.now()}@example.com`;
  const password = 'E2eTestPass123!';

  const res = await request('POST', `${PROD_URL}/auth/register`, {
    email,
    name: 'E2E Test User',
    password,
  });

  if (res.status === 201 && res.body.token) {
    pass('Register', `user=${email}  id=${res.body.user?.id}`);
    return { token: res.body.token, email, userId: res.body.user?.id };
  }

  fail('Register', `status=${res.status}  body=${JSON.stringify(res.body)}`);
  return null;
}

// ─── Step 3: get Gmail OAuth URL (production redirect) ───────────────────────
async function getAuthUrl(token) {
  step(3, 'Get Gmail OAuth URL (production redirect_uri)');
  const url = `${PROD_URL}/gmail/auth-url?redirectUri=${encodeURIComponent(PROD_REDIRECT)}`;
  const res = await request('GET', url, null, { Authorization: `Bearer ${token}` });

  if (res.status === 200 && res.body.url) {
    pass('GET /gmail/auth-url', `redirect_uri=${PROD_REDIRECT}`);
    return res.body.url;
  }

  fail('GET /gmail/auth-url', `status=${res.status}  body=${JSON.stringify(res.body)}`);
  return null;
}

// ─── Step 4: enable Gmail agent settings ─────────────────────────────────────
async function enableGmailAgent(token) {
  step(4, 'Enable Gmail agent (PUT /agent/settings)');
  const res = await request(
    'PUT',
    `${PROD_URL}/agent/settings`,
    {
      platforms: [{
        platform: 'gmail',
        enabled:  true,
        mode:     'owner',
      }],
    },
    { Authorization: `Bearer ${token}` },
  );

  if (res.status === 200) {
    const gmail = (res.body.platforms ?? []).find((p) => p.platform === 'gmail');
    pass('PUT /agent/settings', `gmail enabled=${gmail?.enabled}  mode=${gmail?.mode}`);
    return true;
  }

  fail('PUT /agent/settings', `status=${res.status}  body=${JSON.stringify(res.body)}`);
  return false;
}

// ─── Step 5: verify settings were saved ──────────────────────────────────────
async function getAgentSettings(token) {
  step(5, 'Verify agent settings saved (GET /agent/settings)');
  const res = await request('GET', `${PROD_URL}/agent/settings`, null, {
    Authorization: `Bearer ${token}`,
  });

  if (res.status === 200) {
    const gmail = (res.body.platforms ?? []).find((p) => p.platform === 'gmail');
    if (gmail?.enabled) {
      pass('GET /agent/settings', `gmail enabled=${gmail.enabled}  mode=${gmail.mode}`);
    } else {
      fail('GET /agent/settings', `gmail platform not found or not enabled: ${JSON.stringify(res.body)}`);
    }
    return res.body;
  }

  fail('GET /agent/settings', `status=${res.status}  body=${JSON.stringify(res.body)}`);
  return null;
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
(async () => {
  console.log(`\n${BOLD}${CYAN}Messagent — End-to-End Production Test${RESET}`);
  console.log(`${CYAN}Target: ${PROD_URL}${RESET}\n`);

  // 1. Health
  const healthy = await checkHealth();
  if (!healthy) {
    console.log(`\n  ${RED}Backend not reachable — aborting.${RESET}\n`);
    process.exit(1);
  }

  // 2. Register
  const auth = await registerUser();
  if (!auth) {
    console.log(`\n  ${RED}Registration failed — aborting.${RESET}\n`);
    process.exit(1);
  }

  // 3. OAuth URL
  const oauthUrl = await getAuthUrl(auth.token);

  // 4. Enable agent
  await enableGmailAgent(auth.token);

  // 5. Verify settings
  await getAgentSettings(auth.token);

  // ─── Print OAuth instructions ──────────────────────────────────────────────
  console.log(`\n${BOLD}${'─'.repeat(64)}${RESET}`);

  if (oauthUrl) {
    console.log(`\n  ${GREEN}${BOLD}OAuth URL ready — open this in your browser:${RESET}\n`);
    console.log(`  ${CYAN}${oauthUrl}${RESET}\n`);
    console.log(`  ${BOLD}After authorizing Google will redirect to:${RESET}`);
    console.log(`  ${YELLOW}${PROD_REDIRECT}${RESET}`);
    console.log(`  The backend will exchange the code, save tokens, and set up Pub/Sub watch.\n`);
    console.log(`  ${BOLD}Next steps:${RESET}`);
    console.log(`  1. Open the URL above in your browser`);
    console.log(`  2. Sign in with the Gmail account you want to connect`);
    console.log(`  3. Click Allow`);
    console.log(`  4. Browser shows { "success": true } (or redirects to the app)`);
    console.log(`  5. Send yourself a test email from another account`);
    console.log(`  6. The agent should auto-reply within ~30 seconds\n`);
  } else {
    console.log(`\n  ${RED}Could not get OAuth URL — check GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET on Railway.${RESET}\n`);
    console.log(`  Run: railway service messagent-backend && railway variables\n`);
  }

  console.log(`  ${BOLD}JWT for manual API calls (valid 30 days):${RESET}`);
  console.log(`  ${YELLOW}${auth.token}${RESET}\n`);
  console.log(`  ${BOLD}User ID:${RESET} ${auth.userId}`);
  console.log(`  ${BOLD}Email:${RESET}   ${auth.email}\n`);
})();
