# Local Development Setup

## Environment variable audit

### Required now — app will not start without these

| Variable | Description | Where to get it |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | Use `postgresql://messagent:messagent_dev@localhost:5432/messagent` locally (matches docker-compose) |
| `REDIS_HOST` | Redis hostname | `localhost` for local dev |
| `REDIS_PORT` | Redis port | `6379` (default) |
| `JWT_SECRET` | Signing secret for JWTs | Any string locally; use `openssl rand -hex 32` in production |
| `NODE_ENV` | Runtime environment | `development` locally |
| `PORT` | HTTP port | `4000` (default) |

### Required for AI replies (Pro/Business tier)

| Variable | Description | Where to get it |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude API key | [console.anthropic.com](https://console.anthropic.com) → API Keys. **Can skip initially** — free tier uses on-device Gemma |

### Required for Gmail (skip until you test Gmail)

| Variable | Where to get it |
|---|---|
| `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` | [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials → OAuth 2.0 Client IDs |
| `GMAIL_REDIRECT_URI` | `http://localhost:4000/gmail/callback` for local dev |
| `GMAIL_PUBSUB_TOPIC` | Google Cloud Console → Pub/Sub → Topics |
| `GMAIL_PUBSUB_VERIFY_TOKEN` | Any random string |
| `GOOGLE_CLOUD_PROJECT_ID` | Your Google Cloud project ID |

### Required for WhatsApp (can skip for now)

| Variable | Where to get it |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | [developers.facebook.com](https://developers.facebook.com) → Your App → WhatsApp → API Setup |
| `WHATSAPP_PHONE_NUMBER_ID` | Same page — Phone Number ID |
| `WHATSAPP_VERIFY_TOKEN` | Any string you set in Meta webhook config |
| `WHATSAPP_OWNER_USER_ID` | Your Messagent user UUID (from the `users` table after registering) |

### Required for Instagram (can skip for now)

| Variable | Where to get it |
|---|---|
| `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` | [developers.facebook.com](https://developers.facebook.com) → Create App → Business |
| `INSTAGRAM_VERIFY_TOKEN` | Any string you set in Meta webhook config |

### Required for Stripe (can skip for now)

| Variable | Where to get it |
|---|---|
| `STRIPE_SECRET_KEY` | [dashboard.stripe.com](https://dashboard.stripe.com) → Developers → API Keys |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Developers → Webhooks → your endpoint |
| `STRIPE_PRO_PRICE_ID` / `STRIPE_BUSINESS_PRICE_ID` | Stripe Dashboard → Products → Price IDs |

---

## Prerequisites checklist

- [ ] **Node.js 20+** — `node --version` should print `v20.x.x` or higher. Download: [nodejs.org](https://nodejs.org)
- [ ] **Docker Desktop** — running with at least 2 GB RAM allocated. Download: [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop)
- [ ] **Expo Go** app on your phone — iOS: App Store, Android: Play Store (search "Expo Go")
- [ ] **Anthropic API key** — free to create at [console.anthropic.com](https://console.anthropic.com) (optional for initial smoke test)

---

## Step-by-step setup

### 1. Clone and install dependencies

```bash
# Clone the repo
git clone <repo-url> messagent
cd messagent

# Install backend dependencies
cd backend
npm install

# Install mobile dependencies
cd ../mobile
npm install

# Return to repo root
cd ..
```

### 2. Set up environment variables

```bash
cd backend

# Option A — minimal local config (recommended for first setup)
cp .env.local.example .env

# Option B — full config template
# cp .env.example .env
```

Open `backend/.env` and set these two values — everything else has working defaults:

```
JWT_SECRET=any_random_string_you_choose
ANTHROPIC_API_KEY=sk-ant-...   # optional but needed for Pro/Business AI replies
```

Run the pre-flight checker to confirm everything looks right:

```bash
# From backend/
npm run setup
```

Expected output: `✅` for Node version and `.env` file. Docker/Postgres/Redis will show `❌` until Step 3.

### 3. Start Docker services (PostgreSQL + Redis)

```bash
# From backend/
docker compose up -d
```

This starts:
- **PostgreSQL 16** on `localhost:5432` (user: `messagent`, password: `messagent_dev`, database: `messagent`)
- **Redis 7** on `localhost:6379` (no password)

Wait ~10 seconds for the health checks to pass, then verify:

```bash
docker compose ps
# Both postgres and redis should show "healthy"
```

Re-run the pre-flight checker to confirm all green:

```bash
npm run setup
# All 5 checks should now show ✅
```

### 4. Run database migrations

```bash
# From backend/
npm run migrate
```

Expected output:
```
[migrate] Connected to database
[migrate] Running schema.sql…
[migrate] ✓ schema.sql
[migrate] Running 008_subscriptions.sql…
[migrate] ✓ 008_subscriptions.sql
[migrate] All 2 migration(s) applied successfully
```

### 5. Seed test data

```bash
# From backend/
npm run seed
```

This creates a test account you can log in with immediately:

```
─────────────────────────────────────────
  Test account credentials:
  Email:    test@messagent.app
  Password: testpass123
─────────────────────────────────────────
```

### 6. Start the backend server

```bash
# From backend/
npm run dev
```

You should see Fastify's startup output ending with:

```
[server] Listening on port 4000
```

The `nodemon` watcher will automatically restart the server whenever you save a file.

### 7. Test the backend is working

Open a new terminal and run these curl commands:

**Health check:**
```bash
curl http://localhost:4000/health
```
Expected:
```json
{"status":"ok","version":"1.0.0","uptime":3,"timestamp":"2026-05-08T..."}
```

**Register a new account:**
```bash
curl -s -X POST http://localhost:4000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","name":"Your Name","password":"mypassword123"}' | jq .
```
Expected:
```json
{
  "token": "eyJhbGciOiJ...",
  "user": { "id": "...", "email": "you@example.com", "name": "Your Name", "tier": "free" }
}
```

**Login with the seeded test account:**
```bash
curl -s -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@messagent.app","password":"testpass123"}' | jq .
```

**Test a protected route (use the token from login):**
```bash
curl -s http://localhost:4000/agent/settings \
  -H "Authorization: Bearer <your-token-here>" | jq .
```

**Run full connection test:**
```bash
npm run test:connections
```

### 8. Start the mobile app

```bash
# From mobile/ (in a separate terminal)
cd mobile

# Create the mobile env file
echo "EXPO_PUBLIC_API_URL=http://localhost:4000" > .env

# Start Expo
npm start
```

Expo will print a QR code in the terminal and open the Expo DevTools in your browser.

### 9. Connect Expo Go on your phone

1. Make sure your phone is on the **same Wi-Fi network** as your development machine.
2. Open the **Expo Go** app on your phone.
3. Tap **"Scan QR code"** and scan the QR code shown in the terminal.
4. The Messagent app will bundle and open on your phone (takes ~30 seconds first time).

> **Android tip:** If scanning doesn't work, enter the URL manually — it looks like `exp://192.168.x.x:8081`.

> **iOS Simulator:** Press `i` in the Expo terminal to open the iOS Simulator instead (requires Xcode).

> **Android Emulator:** Press `a` to open an Android Emulator (requires Android Studio).

### 10. First login with the seeded test account

In the app:
1. Tap **"Sign In"** on the Auth screen.
2. Enter: `test@messagent.app` / `testpass123`
3. You'll land on the Dashboard — all four platforms (Gmail, WhatsApp, Instagram, Telegram) are shown as disabled.
4. Tap any platform card to see its settings.
5. Toggle a platform on — the toggle should animate and the change should persist after re-opening the app.

---

## Troubleshooting

### Port already in use

```
Error: listen EADDRINUSE: address already in use 0.0.0.0:4000
```

Find and kill the process using port 4000:
```bash
# macOS / Linux
lsof -ti:4000 | xargs kill -9

# Windows PowerShell
Get-Process -Id (Get-NetTCPConnection -LocalPort 4000).OwningProcess | Stop-Process -Force
```

To use a different port, set `PORT=4001` in `backend/.env`.

### Docker not starting / containers crash

```bash
# See container logs
docker compose logs postgres
docker compose logs redis

# Full reset — destroys all local data and re-creates everything
docker compose down -v
docker compose up -d
```

After a full reset you need to re-run migrations: `npm run migrate && npm run seed`.

### Migration fails

```
[migrate] ✗ schema.sql: connection refused
```
PostgreSQL isn't ready yet. Wait 10 more seconds after `docker compose up -d` and retry.

```
[migrate] ✗ schema.sql: role "messagent" does not exist
```
The Postgres container didn't initialize correctly. Run `docker compose down -v && docker compose up -d` to force a clean start.

### Redis connection refused

```
Redis connection failed: connect ECONNREFUSED 127.0.0.1:6379
```

1. Confirm Redis is running: `docker compose ps` — it should say `healthy`.
2. Confirm `REDIS_HOST=localhost` and `REDIS_PORT=6379` in `backend/.env`.
3. If using Redis outside Docker, make sure it is started: `redis-server`.

### JWT errors on protected routes

```json
{"error": "Unauthorized"}
```

- Make sure you're sending the header exactly as: `Authorization: Bearer <token>` (with a space before the token).
- Tokens expire after the default `@fastify/jwt` window. Log in again to get a fresh token.
- If `JWT_SECRET` changed in `.env` after you logged in, all existing tokens are invalidated — log in again.

### Mobile app can't reach the backend

```
Network request failed
```

- Your phone must be on the **same Wi-Fi network** as your laptop.
- Use your machine's **local IP address**, not `localhost`, in the mobile `.env`:
  ```bash
  # Find your local IP
  # macOS:    ipconfig getifaddr en0
  # Windows:  ipconfig | findstr "IPv4"
  # Linux:    hostname -I
  ```
  Then set: `EXPO_PUBLIC_API_URL=http://192.168.x.x:4000`
- Make sure the backend is running (`npm run dev` in `backend/`).

### `pino-pretty` not found in production

`pino-pretty` is only used in development (it's a dev transport). Never install it as a production dependency. If you see this in a prod deploy, confirm `NODE_ENV=production`.

---

## Verify everything works — final checklist

- [ ] `curl http://localhost:4000/health` returns `{"status":"ok",...}`
- [ ] `POST /auth/register` returns a JWT token
- [ ] `POST /auth/login` with seeded credentials (`test@messagent.app` / `testpass123`) returns a token
- [ ] `GET /agent/settings` with a valid `Authorization: Bearer <token>` header returns platform configs
- [ ] `npm run test:connections` shows all green (Postgres + Redis)
- [ ] `npm test` passes all Jest tests in `backend/`
- [ ] Mobile app loads the Splash screen then the Auth screen on your phone
- [ ] Login succeeds and you see the Dashboard with four platform cards
- [ ] Toggling a platform on/off in the app persists after closing and re-opening
