-- Migration 009: Suggest mode + suggested_replies table
-- Adds reply_mode to platform_configs, pending_approval status to messages,
-- and creates the suggested_replies table for human-in-the-loop review.

-- ─── 1. Add reply_mode to platform_configs ────────────────────────────────────
ALTER TABLE platform_configs
  ADD COLUMN IF NOT EXISTS reply_mode TEXT NOT NULL DEFAULT 'auto'
    CHECK (reply_mode IN ('auto', 'suggest'));

-- ─── 2. Extend messages.status CHECK to include pending_approval ──────────────
-- PostgreSQL doesn't support ALTER CONSTRAINT, so drop + re-add.
ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_status_check;

ALTER TABLE messages
  ADD CONSTRAINT messages_status_check
    CHECK (status IN ('pending', 'replied', 'skipped', 'failed', 'pending_approval'));

-- ─── 3. Create suggested_replies table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS suggested_replies (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id      UUID        NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  platform        TEXT        NOT NULL
                              CHECK (platform IN ('gmail', 'whatsapp', 'instagram', 'telegram')),
  thread_id       TEXT,                -- platform thread/conversation identifier
  from_contact    TEXT        NOT NULL, -- email address, phone number, or username
  original_body   TEXT        NOT NULL, -- the incoming message text
  suggested_reply TEXT        NOT NULL, -- AI-generated reply text
  -- pending → user hasn't acted; approved → sent; rejected → dismissed; edited → edited & sent
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'approved', 'rejected', 'edited')),
  edited_reply    TEXT,                -- non-null when the user edited before sending
  sent_at         TIMESTAMPTZ,         -- when the reply was actually dispatched
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suggested_replies_user_id   ON suggested_replies(user_id);
CREATE INDEX IF NOT EXISTS idx_suggested_replies_status    ON suggested_replies(status);
CREATE INDEX IF NOT EXISTS idx_suggested_replies_message_id ON suggested_replies(message_id);
