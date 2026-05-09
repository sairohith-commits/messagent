# Messagent

![Status: MVP Complete](https://img.shields.io/badge/Status-MVP%20Complete-brightgreen)
![Node 20](https://img.shields.io/badge/Node-20-green)
![React Native](https://img.shields.io/badge/React%20Native-0.74-blue)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow)

An AI-powered message agent that monitors Gmail, WhatsApp, and Instagram inboxes and
auto-replies (or stages drafts) using Claude Sonnet (Pro/Business) or an on-device
Gemma model (Free tier).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Mobile App (React Native + Expo)                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────┐  │
│  │Dashboard │  │ReplyLog  │  │Settings  │  │Upgrade Screen  │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───────┬────────┘  │
│       └─────────────┴─────────────┴────────────────┘           │
│                  Zustand stores + API client (JWT)              │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS
┌──────────────────────────▼──────────────────────────────────────┐
│  Fastify Backend (Node.js 20)                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Routes: /auth  /agent  /gmail  /whatsapp  /instagram   │   │
│  │          /subscription  /model  /messages  /logs        │   │
│  └─────────────────────────┬───────────────────────────────┘   │
│  ┌────────────┐  ┌─────────▼──────────────────────────────┐   │
│  │ PostgreSQL │◄─│  BullMQ Queues (ioredis / Redis)       │   │
│  └────────────┘  │  incoming-messages → messageWorker     │   │
│                  │  outgoing-replies  → replyWorker       │   │
│                  └──────────────┬─────────────────────────┘   │
│  ┌───────────────────────────────▼──────────────────────────┐  │
│  │  Agent Service                                           │  │
│  │  Free  → on-device Gemma (localInference.js bridge)     │  │
│  │  Pro+  → Anthropic Claude Sonnet API                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Cron: Gmail watch renewer (every 6 days)                │  │
│  └───────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
         │ Webhooks                      │ Webhooks
┌────────▼────────┐            ┌─────────▼──────────┐
│  Gmail Pub/Sub  │            │  Meta (WA + IG)     │
│  Watch → Push   │            │  Webhook callbacks  │
└─────────────────┘            └─────────────────────┘
```

---

## Project Structure

```
messagent/
├── backend/
│   ├── src/
│   │   ├── index.js              — server entry point + route registration
│   │   ├── db/
│   │   │   ├── schema.sql        — base schema (tables, indexes, RLS)
│   │   │   └── 008_subscriptions.sql
│   │   ├── models/               — user, platformToken, message (raw SQL)
│   │   ├── middleware/           — auth (verifyJWT), rateLimit, requestLogger
│   │   ├── routes/               — auth, agent, gmail, whatsapp, instagram,
│   │   │                           subscription, model, messages, logs
│   │   ├── services/             — gmail, whatsapp, instagram, agentService,
│   │   │                           subscriptionService, modelService,
│   │   │                           notificationService, logger
│   │   ├── queues/               — messageQueue, replyQueue
│   │   ├── workers/              — messageWorker, replyWorker
│   │   ├── cron/                 — gmailWatchRenewer, index
│   │   └── utils/                — validators
│   ├── scripts/
│   │   ├── migrate.js            — runs all SQL files in src/db/ in order
│   │   └── seed.js               — creates a test user (dev only)
│   ├── tests/                    — Jest test suite (auth, agent, gmail, queue)
│   ├── Dockerfile
│   ├── docker-compose.yml        — local dev stack
│   ├── railway.json              — Railway deployment config
│   └── package.json
│
├── mobile/
│   ├── App.js                    — root component with Splash + AppNavigator
│   ├── app.json                  — Expo config (scheme, permissions, deep links)
│   ├── eas.json                  — EAS Build profiles
│   └── src/
│       ├── constants/            — theme, config
│       ├── store/                — authStore, agentStore (Zustand)
│       ├── services/             — api, platformAuth, modelUpdater,
│       │                           subscriptionService, gemmaService,
│       │                           localInference
│       ├── navigation/           — AppNavigator
│       ├── screens/              — Splash, Onboarding, Auth, Dashboard,
│       │                           ReplyLog, Settings, Upgrade
│       ├── components/           — PlatformCard, PlatformDetail, Toggle, ModeSelector
│       ├── hooks/                — useAgent, useReplyLog
│       └── utils/                — formatters, haptics
│
├── shared/
│   └── types/index.ts
│
├── .github/
│   └── workflows/test.yml        — CI: Jest on push + PR
│
└── README.md
```

---

## Setup Checklist

### Prerequisites
- [ ] Node.js 20+
- [ ] PostgreSQL 15+
- [ ] Redis 7+
- [ ] Expo CLI (`npm install -g expo-cli`)

### Backend
- [ ] `cp backend/.env.example backend/.env` — fill in all values
- [ ] `cd backend && npm install`
- [ ] `npm run migrate` — apply all SQL files
- [ ] `npm run seed` — create test account (dev only)
- [ ] `npm run dev` — starts on port 4000

### Mobile
- [ ] `cd mobile && npm install`
- [ ] Create `.env` with `EXPO_PUBLIC_API_URL=http://localhost:4000`
- [ ] `npx expo start` — choose iOS simulator or Android device

### With Docker (backend only)
```bash
cd backend
cp .env.example .env    # fill in OAuth/Stripe keys
docker compose up --build
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_HOST` / `REDIS_PORT` | Redis connection |
| `JWT_SECRET` | Random secret (≥32 bytes) for signing JWTs |
| `ANTHROPIC_API_KEY` | Claude API key (Pro/Business replies) |
| `GMAIL_CLIENT_ID` | Google OAuth app client ID |
| `GMAIL_CLIENT_SECRET` | Google OAuth app client secret |
| `GMAIL_REDIRECT_URI` | Server-side OAuth redirect URI |
| `GMAIL_PUBSUB_TOPIC` | Google Pub/Sub topic for push notifications |
| `GMAIL_PUBSUB_VERIFY_TOKEN` | Shared secret for webhook validation |
| `WHATSAPP_ACCESS_TOKEN` | Meta system user access token |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Business phone number ID |
| `WHATSAPP_VERIFY_TOKEN` | Meta webhook verification secret |
| `INSTAGRAM_APP_ID` | Facebook/Instagram app ID |
| `INSTAGRAM_APP_SECRET` | Facebook/Instagram app secret |
| `INSTAGRAM_VERIFY_TOKEN` | Meta webhook verification secret |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_PRO_PRICE_ID` | Stripe price ID for the Pro plan |
| `STRIPE_BUSINESS_PRICE_ID` | Stripe price ID for the Business plan |
| `MODEL_VERSION` | Current Gemma model version string |
| `MODEL_URL` | CDN URL for the Gemma model weights file |

---

## API Reference

### Auth
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | — | Create account, receive JWT |
| POST | `/auth/login` | — | Log in, receive JWT |

### Agent Settings
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/agent/settings` | JWT | Per-platform AI configs |
| PUT | `/agent/settings` | JWT | Update configs |

### Gmail
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/gmail/auth-url` | JWT | OAuth consent URL (mobile redirect) |
| POST | `/gmail/connect` | JWT | Exchange OAuth code from mobile |
| GET | `/gmail/callback` | — | OAuth callback (web/testing) |
| POST | `/gmail/webhook` | — | Google Pub/Sub push endpoint |

### WhatsApp
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/whatsapp/webhook` | — | Meta hub verification |
| POST | `/whatsapp/webhook` | — | Incoming messages |

### Instagram
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/instagram/webhook` | — | Meta hub verification |
| POST | `/instagram/webhook` | — | Incoming DMs |
| GET | `/instagram/auth-url` | JWT | OAuth consent URL |
| POST | `/instagram/connect` | JWT | Exchange OAuth code |

### Subscription
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/subscription/status` | JWT | Current plan + renewal date |
| POST | `/subscription/checkout` | JWT | Create Stripe Checkout session |
| POST | `/subscription/webhook` | — | Stripe events |
| POST | `/subscription/cancel` | JWT | Cancel at period end |

### Other
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/model/version` | — | Current Gemma model metadata |
| GET | `/messages/recent` | JWT | Recent messages |
| GET | `/logs` | JWT | Reply log (paginated) |
| PUT | `/logs/:id/rating` | JWT | Rate a reply |
| GET | `/health` | — | `{ status, version, uptime, timestamp }` |

---

## Running Tests

```bash
cd backend
npm test              # all tests (mocked DB + Redis + Google APIs)
npm run test:coverage # with lcov coverage report
```

---

## Deployment (Railway)

1. Create a Railway project with three services: **backend**, **PostgreSQL**, **Redis**.
2. Set all env vars from `backend/.env.example` in the Railway dashboard.
3. The `railway.json` config handles the build + start commands automatically.
4. Apply migrations after first deploy:
   ```bash
   railway run node scripts/migrate.js
   ```
5. Register webhook URLs in:
   - Google Cloud Console (Gmail Pub/Sub)
   - Meta Developer Portal (WhatsApp + Instagram)
   - Stripe Dashboard (subscription events)

### Production checklist
- [ ] `JWT_SECRET` is a long random string
- [ ] `GMAIL_REDIRECT_URI` registered in Google Cloud Console
- [ ] Gmail Pub/Sub topic grants Publisher access to `gmail-api-push@system.gserviceaccount.com`
- [ ] Stripe webhook secret set and endpoint registered
- [ ] `MODEL_URL` points to a CDN-hosted model file
- [ ] `pino-pretty` is NOT in production dependencies (only used in dev transport)

---

## Contributing

1. Fork the repo and create a feature branch: `git checkout -b feat/my-feature`
2. Make changes — keep commits focused (one logical change per commit)
3. Run `npm test` in `backend/` — all tests must pass before opening a PR
4. Open a pull request against `main` — the CI pipeline runs tests automatically
5. Request a review; PRs with failing tests will not be merged

### Code style
- Backend: CommonJS (`require`/`module.exports`), async/await, pino for logging
- Mobile: ES Modules (`import`/`export`), functional React components, Zustand for state
- No `console.log` in production code — use `logger.info/warn/error` (backend) or structured logging stubs (mobile)
- Monetary values: always integers in cents, never floats
- Never commit `.env` files or API keys
