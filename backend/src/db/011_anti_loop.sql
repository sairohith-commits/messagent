-- Migration 011: Anti-loop infrastructure + cost tracking
-- Safe to run on a live database — all operations are idempotent (IF NOT EXISTS / IF EXISTS).

-- ─── messages: platform-native message ID for deduplication ──────────────────
-- Stores the platform's own message ID (e.g. Gmail message ID) so we can detect
-- and discard duplicate webhook deliveries without processing the same message twice.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS platform_message_id TEXT;

-- Unique index: one row per (user, platform, platform message ID).
-- Partial index (WHERE NOT NULL) so rows without a platform_message_id don't conflict.
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_platform_msg_id
  ON messages (user_id, platform, platform_message_id)
  WHERE platform_message_id IS NOT NULL;

-- ─── reply_logs: token usage tracking ────────────────────────────────────────
-- Track Claude API token consumption per reply for cost monitoring.
ALTER TABLE reply_logs
  ADD COLUMN IF NOT EXISTS input_tokens  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS output_tokens INTEGER NOT NULL DEFAULT 0;

-- ─── reply_logs: platform-native message ID of the reply we sent ──────────────
-- Storing the sent Gmail message ID lets the Gmail webhook detect when an incoming
-- message is a reply-to-our-reply (via In-Reply-To header) and skip it,
-- preventing the classic auto-responder infinite loop.
ALTER TABLE reply_logs
  ADD COLUMN IF NOT EXISTS platform_message_id TEXT;

CREATE INDEX IF NOT EXISTS idx_reply_logs_platform_msg_id
  ON reply_logs (user_id, platform_message_id)
  WHERE platform_message_id IS NOT NULL;

-- ─── Index to speed up stale pending_approval cleanup ─────────────────────────
-- The hourly cron queries (status = 'pending_approval' AND received_at < NOW() - 48h).
CREATE INDEX IF NOT EXISTS idx_messages_pending_approval_age
  ON messages (received_at)
  WHERE status = 'pending_approval';
