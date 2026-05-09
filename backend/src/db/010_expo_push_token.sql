-- Migration 010: Add expo_push_token to users for mobile push notifications

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS expo_push_token TEXT;

CREATE INDEX IF NOT EXISTS idx_users_expo_push_token ON users(expo_push_token)
  WHERE expo_push_token IS NOT NULL;
