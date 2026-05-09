-- Messagent database schema
-- Run once against a fresh PostgreSQL database.
-- All timestamps are stored in UTC.

-- ─── USERS ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        UNIQUE NOT NULL,
  name          TEXT        NOT NULL,
  password_hash TEXT        NOT NULL,
  tier          TEXT        NOT NULL DEFAULT 'free'
                            CHECK (tier IN ('free', 'pro', 'business')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── PLATFORM TOKENS ──────────────────────────────────────────────────────────
-- Stores OAuth access/refresh tokens per user per platform.
CREATE TABLE IF NOT EXISTS platform_tokens (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform      TEXT        NOT NULL
                            CHECK (platform IN ('gmail', 'whatsapp', 'instagram', 'telegram')),
  access_token  TEXT        NOT NULL,
  refresh_token TEXT,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, platform)
);

-- ─── PLATFORM CONFIGS ─────────────────────────────────────────────────────────
-- Per-user, per-platform agent settings (toggled by the mobile app).
CREATE TABLE IF NOT EXISTS platform_configs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform          TEXT        NOT NULL
                                CHECK (platform IN ('gmail', 'whatsapp', 'instagram', 'telegram')),
  enabled           BOOLEAN     NOT NULL DEFAULT FALSE,
  mode              TEXT        NOT NULL DEFAULT 'assistant'
                                CHECK (mode IN ('owner', 'assistant')),
  -- "HH:MM" in UTC, NULL means 24/7
  schedule_start    TIME,
  schedule_end      TIME,
  -- Optional freeform instructions the AI follows when replying
  user_instructions TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, platform)
);

-- ─── MESSAGES ─────────────────────────────────────────────────────────────────
-- Incoming messages captured by platform webhooks.
CREATE TABLE IF NOT EXISTS messages (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform     TEXT        NOT NULL
               CHECK (platform IN ('gmail', 'whatsapp', 'instagram', 'telegram')),
  from_contact TEXT        NOT NULL,  -- email address, phone number, or username
  body         TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'replied', 'skipped', 'failed')),
  received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_status  ON messages(status);

-- ─── REPLY LOGS ───────────────────────────────────────────────────────────────
-- One row per reply the agent sends or drafts.
CREATE TABLE IF NOT EXISTS reply_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  UUID        NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reply_body  TEXT        NOT NULL,
  model_used  TEXT        NOT NULL,  -- 'claude' | 'gemma'
  sent_at     TIMESTAMPTZ,           -- NULL until actually dispatched
  -- 1 = thumbs up, -1 = thumbs down, NULL = unrated
  rating      SMALLINT    CHECK (rating IN (1, -1)),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reply_logs_user_id    ON reply_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_reply_logs_message_id ON reply_logs(message_id);

-- ─── GMAIL-SPECIFIC ADDITIONS ─────────────────────────────────────────────────
-- Safe to run on existing databases — ADD COLUMN IF NOT EXISTS is idempotent.

-- platform_tokens: Gmail-specific metadata
ALTER TABLE platform_tokens
  ADD COLUMN IF NOT EXISTS account_email      TEXT,         -- Gmail address for Pub/Sub routing
  ADD COLUMN IF NOT EXISTS gmail_history_id   TEXT,         -- last processed Gmail history cursor
  ADD COLUMN IF NOT EXISTS gmail_watch_expiry TIMESTAMPTZ;  -- when the Pub/Sub watch expires (7-day TTL)

-- messages: platform thread identifier and subject line
-- thread_id is NULL for platforms that don't have threaded conversations
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS thread_id TEXT,
  ADD COLUMN IF NOT EXISTS subject   TEXT;
