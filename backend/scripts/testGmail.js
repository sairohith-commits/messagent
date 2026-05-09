// Gmail OAuth tester — gets an auth URL from the running backend and prints it for you to visit.
// The backend must be running (npm run dev) before you run this script.
//
// Usage: node scripts/testGmail.js   (or: npm run test:gmail)

'use strict';

require('dotenv').config();

const http = require('http');

const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';

const BACKEND_URL = `http://localhost:${process.env.PORT ?? 4000}`;

// ─── helpers ─────────────────────────────────────────────────────────────────

function pass(label, detail) {
  console.log(`  ${GREEN}✅ PASS${RESET}  ${BOLD}${label}${RESET}${detail ? `  — ${detail}` : ''}`);
}
function fail(label, detail) {
  console.log(`  ${RED}❌ FAIL${RESET}  ${BOLD}${label}${RESET}${detail ? `\n         ${RED}${detail}${RESET}` : ''}`);
}
function info(msg) {
  console.log(`  ${CYAN}ℹ${RESET}  ${msg}`);
}

// Minimal JSON HTTP helper — avoids pulling in node-fetch / axios
function jsonRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const url     = new URL(path, BACKEND_URL);

    const options = {
      hostname: url.hostname,
      port:     url.port,
      path:     url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ─── Step 1: ping the backend ─────────────────────────────────────────────────
async function pingBackend() {
  try {
    const res = await jsonRequest('GET', '/health');
    if (res.status === 200) {
      pass('Backend reachable', `${BACKEND_URL}/health → ${res.status}`);
      return true;
    }
    fail('Backend reachable', `Unexpected status ${res.status}`);
    return false;
  } catch (err) {
    fail('Backend reachable', err.message);
    console.log(`\n         ${CYAN}Troubleshoot:${RESET}`);
    console.log('         • Start the backend first:  npm run dev');
    console.log(`         • Expected on:  ${BACKEND_URL}`);
    return false;
  }
}

// ─── Step 2: register a temporary test user and get a JWT ────────────────────
async function getTestJwt() {
  const email    = `gmail-test-${Date.now()}@example.com`;
  const password = 'TestPassword123!';

  try {
    const res = await jsonRequest('POST', '/auth/register', {
      email,
      name: 'Gmail Test User',
      password,
    });

    if (res.status === 201 && res.body.token) {
      pass('Auth register', `Created temporary test user: ${email}`);
      return { token: res.body.token, email };
    }

    // If register already exists (shouldn't happen with timestamp), try login
    if (res.status === 409) {
      const login = await jsonRequest('POST', '/auth/login', { email, password });
      if (login.status === 200 && login.body.token) {
        pass('Auth login', `Logged in as: ${email}`);
        return { token: login.body.token, email };
      }
    }

    fail('Auth', `Status ${res.status}: ${JSON.stringify(res.body)}`);
    return null;
  } catch (err) {
    fail('Auth', err.message);
    return null;
  }
}

const WEB_REDIRECT_URI = 'http://localhost:3000/gmail/callback';

// ─── Step 3: call GET /gmail/auth-url with the JWT ────────────────────────────
async function getGmailAuthUrl(token) {
  try {
    const options = {
      hostname: 'localhost',
      port:     process.env.PORT ?? 4000,
      path:     `/gmail/auth-url?redirectUri=${encodeURIComponent(WEB_REDIRECT_URI)}`,
      method:   'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    };

    const res = await new Promise((resolve, reject) => {
      const req = http.request(options, (r) => {
        let data = '';
        r.on('data', (chunk) => { data += chunk; });
        r.on('end', () => {
          try { resolve({ status: r.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: r.statusCode, body: data }); }
        });
      });
      req.on('error', reject);
      req.end();
    });

    if (res.status === 200 && res.body.url) {
      pass('GET /gmail/auth-url', 'OAuth URL generated successfully');
      return res.body.url;
    }

    fail('GET /gmail/auth-url', `Status ${res.status}: ${JSON.stringify(res.body)}`);

    if (res.status === 500) {
      console.log(`\n         ${CYAN}Troubleshoot:${RESET}`);
      console.log('         • Check GMAIL_CLIENT_ID in backend/.env');
      console.log('         • Check GMAIL_CLIENT_SECRET in backend/.env');
      console.log('         • Check GMAIL_REDIRECT_URI in backend/.env');
      console.log('         • Run Step 4 in GMAIL_SETUP.md to create OAuth credentials');
    }
    return null;
  } catch (err) {
    fail('GET /gmail/auth-url', err.message);
    return null;
  }
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
(async () => {
  console.log(`\n${BOLD}${CYAN}Messagent — Gmail OAuth Test${RESET}\n`);

  // 1. Backend must be up
  const backendOk = await pingBackend();
  if (!backendOk) {
    process.exit(1);
  }

  // 2. Get a JWT
  const auth = await getTestJwt();
  if (!auth) {
    console.log(`\n  ${RED}Cannot get JWT — aborting.${RESET}\n`);
    process.exit(1);
  }

  // 3. Get the Gmail OAuth URL
  const url = await getGmailAuthUrl(auth.token);
  if (!url) {
    console.log(`\n  ${RED}Cannot get Gmail auth URL — aborting.${RESET}\n`);
    process.exit(1);
  }

  // Print the URL and instructions
  console.log(`\n${BOLD}${'─'.repeat(60)}${RESET}`);
  console.log(`\n  ${GREEN}${BOLD}Gmail OAuth URL ready!${RESET}`);
  console.log(`\n  ${BOLD}Next steps:${RESET}`);
  console.log(`\n  1. Copy the URL below and open it in your browser:`);
  console.log(`\n     ${CYAN}${url}${RESET}`);
  console.log(`\n  2. Sign in with the Gmail account you added as a test user`);
  console.log(`     in Google Cloud Console → OAuth consent screen → Test users`);
  console.log(`\n  3. Click ${BOLD}Allow${RESET} to grant Messagent access to Gmail`);
  console.log(`\n  4. Google will redirect to:`);
  console.log(`     ${YELLOW}${WEB_REDIRECT_URI}${RESET}`);
  console.log(`     The backend will exchange the code for tokens and save them.`);
  console.log(`\n  5. If you see ${BOLD}{ "success": true }${RESET} in the browser — you're connected!`);
  console.log(`\n  ${YELLOW}Note:${RESET} Test user email used for JWT: ${BOLD}${auth.email}${RESET}`);
  console.log(`  In production users connect their own Gmail accounts via the mobile app.\n`);
})();
