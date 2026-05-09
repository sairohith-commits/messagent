-- Migration 008 — Add Stripe subscription columns to the users table
-- Safe to run on existing databases; ADD COLUMN IF NOT EXISTS is idempotent.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stripe_customer_id      TEXT,        -- Stripe Customer ID (cus_xxx)
  ADD COLUMN IF NOT EXISTS stripe_subscription_id  TEXT,        -- Active Stripe Subscription ID (sub_xxx)
  ADD COLUMN IF NOT EXISTS subscription_period_end TIMESTAMPTZ; -- When the current billing period ends

-- Index for looking up a user by their Stripe customer ID (used in webhook handlers)
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
