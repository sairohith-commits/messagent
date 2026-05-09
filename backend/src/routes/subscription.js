// Subscription management routes — Stripe checkout, webhook, status, and cancellation

'use strict';

const Stripe = require('stripe');
const {
  createCheckoutSession,
  handleWebhook,
  getSubscriptionStatus,
  cancelSubscription,
} = require('../services/subscriptionService');

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
async function subscriptionRoutes(fastify) {
  const { verifyJWT } = fastify;

  // ─── GET /subscription/status ─────────────────────────────────────────────
  fastify.get('/status', {
    preHandler: [verifyJWT],
  }, async (request, reply) => {
    const status = await getSubscriptionStatus(request.user.id);
    return reply.send(status);
  });

  // ─── POST /subscription/checkout ─────────────────────────────────────────
  // Creates a Stripe Checkout session and returns the hosted payment page URL.
  // The mobile app opens this URL in expo-web-browser.
  fastify.post('/checkout', {
    preHandler: [verifyJWT],
    schema: {
      body: {
        type: 'object',
        required: ['plan'],
        properties: {
          plan: { type: 'string', enum: ['pro', 'business'] },
        },
      },
    },
  }, async (request, reply) => {
    const { plan } = request.body;
    const { id: userId, email: userEmail } = request.user;
    const { url } = await createCheckoutSession(userId, userEmail, plan);
    return reply.send({ url });
  });

  // ─── POST /subscription/webhook ──────────────────────────────────────────
  // Stripe sends events here after payment, cancellation, or renewal.
  // Signature is verified using the raw request body + STRIPE_WEBHOOK_SECRET.
  //
  // IMPORTANT: this route must receive the raw (unparsed) body bytes.
  // Register @fastify/raw-body and use `request.rawBody` for production deployments.
  fastify.post('/webhook', {
    // Tell Fastify to skip JSON parsing on this route — we need the raw bytes
    config: { rawBody: true },
  }, async (request, reply) => {
    const sig = request.headers['stripe-signature'];

    let event;
    try {
      // `request.rawBody` is populated by @fastify/raw-body (must be registered in index.js)
      const rawBody = request.rawBody ?? JSON.stringify(request.body);
      event = Stripe(process.env.STRIPE_SECRET_KEY).webhooks.constructEvent(
        rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (err) {
      fastify.log.warn(`[subscription] Webhook signature verification failed: ${err.message}`);
      return reply.code(400).send({ error: `Webhook Error: ${err.message}` });
    }

    // Ack immediately; processing is fast (DB updates only, no outbound calls for most events)
    reply.code(200).send({ received: true });

    handleWebhook(event).catch((err) => {
      fastify.log.error('[subscription] handleWebhook error:', err.message);
    });
  });

  // ─── POST /subscription/cancel ────────────────────────────────────────────
  fastify.post('/cancel', {
    preHandler: [verifyJWT],
  }, async (request, reply) => {
    await cancelSubscription(request.user.id);
    return reply.send({ success: true, message: 'Subscription will cancel at period end' });
  });
}

module.exports = subscriptionRoutes;
