// Stripe subscription service — checkout, webhook handling, and status queries

'use strict';

const Stripe = require('stripe');
const { query }          = require('../db');
const { updateUserTier } = require('../models/user');

// Lazy-init stripe so tests can import this file without a real key set
let _stripe;
function stripe() {
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
  return _stripe;
}

// Price IDs map to tiers — set these in the .env
const PRICE_TO_TIER = {
  [process.env.STRIPE_PRO_PRICE_ID]:      'pro',
  [process.env.STRIPE_BUSINESS_PRICE_ID]: 'business',
};

// ─── CREATE CHECKOUT SESSION ──────────────────────────────────────────────────

/**
 * Create a Stripe Checkout session for a subscription upgrade.
 *
 * @param {string} userId            Messagent user UUID
 * @param {string} userEmail         Used to pre-fill the checkout form
 * @param {'pro'|'business'} plan    Target plan
 * @returns {Promise<{ url: string }>} Stripe-hosted checkout URL
 */
async function createCheckoutSession(userId, userEmail, plan) {
  const priceId = plan === 'pro'
    ? process.env.STRIPE_PRO_PRICE_ID
    : process.env.STRIPE_BUSINESS_PRICE_ID;

  if (!priceId) throw new Error(`No Stripe price ID configured for plan: ${plan}`);

  // Reuse an existing Stripe customer if the user has one
  const { rows } = await query(
    'SELECT stripe_customer_id FROM users WHERE id = $1',
    [userId],
  );
  const existingCustomerId = rows[0]?.stripe_customer_id;

  const sessionParams = {
    mode:                 'subscription',
    line_items:           [{ price: priceId, quantity: 1 }],
    client_reference_id:  userId,             // lets us identify the user in the webhook
    customer_email:       existingCustomerId ? undefined : userEmail,
    customer:             existingCustomerId  ?? undefined,
    success_url:          `${process.env.FRONTEND_URL ?? 'messagent://'}?checkout=success`,
    cancel_url:           `${process.env.FRONTEND_URL ?? 'messagent://'}?checkout=cancel`,
    subscription_data: {
      metadata: { userId },
    },
  };

  const session = await stripe().checkout.sessions.create(sessionParams);
  return { url: session.url };
}

// ─── HANDLE STRIPE WEBHOOK ────────────────────────────────────────────────────

/**
 * Process a verified Stripe webhook event.
 * Construct the event upstream using `stripe.webhooks.constructEvent()`.
 *
 * @param {import('stripe').Stripe.Event} event
 */
async function handleWebhook(event) {
  switch (event.type) {

    case 'checkout.session.completed': {
      const session   = event.data.object;
      const userId    = session.client_reference_id;
      if (!userId) break;

      // Persist the Stripe customer ID so future sessions reuse it
      const customerId     = session.customer;
      const subscriptionId = session.subscription;

      await query(
        `UPDATE users
         SET    stripe_customer_id      = $2,
                stripe_subscription_id  = $3,
                updated_at              = NOW()
         WHERE  id = $1`,
        [userId, customerId, subscriptionId],
      );

      // Determine the new tier from the price in the subscription
      const subscription = await stripe().subscriptions.retrieve(subscriptionId);
      const priceId      = subscription.items.data[0]?.price.id;
      const newTier      = PRICE_TO_TIER[priceId] ?? 'pro';
      const periodEnd    = new Date(subscription.current_period_end * 1000);

      await updateUserTier(userId, newTier);
      await updateSubscriptionPeriodEnd(userId, periodEnd);

      console.info(`[subscription] User ${userId} upgraded to ${newTier}`);
      break;
    }

    case 'customer.subscription.updated': {
      const sub      = event.data.object;
      const userId   = sub.metadata?.userId;
      if (!userId) break;

      const priceId  = sub.items.data[0]?.price.id;
      const newTier  = PRICE_TO_TIER[priceId] ?? 'pro';
      const periodEnd = new Date(sub.current_period_end * 1000);

      await updateUserTier(userId, newTier);
      await updateSubscriptionPeriodEnd(userId, periodEnd);
      console.info(`[subscription] User ${userId} subscription updated to ${newTier}`);
      break;
    }

    case 'customer.subscription.deleted': {
      const sub    = event.data.object;
      const userId = sub.metadata?.userId;
      if (!userId) break;

      await updateUserTier(userId, 'free');
      await query(
        `UPDATE users
         SET    stripe_subscription_id   = NULL,
                subscription_period_end  = NULL,
                updated_at               = NOW()
         WHERE  id = $1`,
        [userId],
      );
      console.info(`[subscription] User ${userId} downgraded to free (subscription cancelled)`);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice    = event.data.object;
      const customerId = invoice.customer;
      // Resolve userId from customer ID
      const { rows } = await query(
        'SELECT id FROM users WHERE stripe_customer_id = $1',
        [customerId],
      );
      const userId = rows[0]?.id;
      console.warn(`[subscription] Payment failed for customer ${customerId} (user ${userId ?? 'unknown'})`);
      // TODO: send push notification or email to the user
      break;
    }

    default:
      // Ignore all other Stripe event types
      break;
  }
}

// ─── GET SUBSCRIPTION STATUS ──────────────────────────────────────────────────

/**
 * Return the current subscription tier and renewal date for a user.
 *
 * @param {string} userId
 * @returns {Promise<{
 *   tier:             string,
 *   renewalDate:      string|null,
 *   subscriptionId:   string|null,
 * }>}
 */
async function getSubscriptionStatus(userId) {
  const { rows } = await query(
    `SELECT tier, stripe_subscription_id, subscription_period_end
     FROM   users
     WHERE  id = $1`,
    [userId],
  );

  if (!rows[0]) throw new Error(`User ${userId} not found`);

  const { tier, stripe_subscription_id, subscription_period_end } = rows[0];

  return {
    tier,
    renewalDate:    subscription_period_end?.toISOString() ?? null,
    subscriptionId: stripe_subscription_id ?? null,
  };
}

// ─── CANCEL SUBSCRIPTION ─────────────────────────────────────────────────────

/**
 * Cancel the user's active Stripe subscription at period end (no proration).
 * The user keeps access until `subscription_period_end`.
 *
 * @param {string} userId
 */
async function cancelSubscription(userId) {
  const { rows } = await query(
    'SELECT stripe_subscription_id FROM users WHERE id = $1',
    [userId],
  );
  const subscriptionId = rows[0]?.stripe_subscription_id;
  if (!subscriptionId) throw new Error('No active subscription to cancel');

  // cancel_at_period_end: true means the user keeps access until the period ends
  await stripe().subscriptions.update(subscriptionId, { cancel_at_period_end: true });
  console.info(`[subscription] User ${userId} subscription set to cancel at period end`);
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

async function updateSubscriptionPeriodEnd(userId, periodEnd) {
  await query(
    `UPDATE users SET subscription_period_end = $2, updated_at = NOW() WHERE id = $1`,
    [userId, periodEnd],
  );
}

module.exports = {
  createCheckoutSession,
  handleWebhook,
  getSubscriptionStatus,
  cancelSubscription,
};
