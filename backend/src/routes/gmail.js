// Gmail OAuth + Pub/Sub webhook routes

'use strict';

const {
  getAuthUrl,
  exchangeCodeForTokens,
  setupGmailWatch,
  processGmailWebhook,
} = require('../services/gmail');

// The Expo deep-link URI the mobile app registered as its OAuth redirect URI
const MOBILE_REDIRECT_URI = 'messagent://gmail/callback';

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
async function gmailRoutes(fastify) {
  const { verifyJWT } = fastify;

  // ─── GET /gmail/auth-url ──────────────────────────────────────────────────
  // Returns the Google OAuth consent URL.
  // ?redirectUri overrides the default (mobile deep-link) — pass the web
  // callback URL for browser testing: ?redirectUri=http://localhost:4000/gmail/callback
  fastify.get('/gmail/auth-url', {
    preHandler: [verifyJWT],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          redirectUri: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const userId      = request.user.id;
    const redirectUri = request.query.redirectUri
      ?? process.env.GMAIL_REDIRECT_URI
      ?? MOBILE_REDIRECT_URI;
    const url = getAuthUrl(userId, redirectUri);
    return reply.send({ url });
  });

  // ─── GET /gmail/callback ──────────────────────────────────────────────────
  // Kept for web / server-side OAuth flows (e.g. curl testing or a future web
  // dashboard). Mobile apps never land here — they use POST /gmail/connect
  // after parsing the code from the deep-link URL themselves.
  fastify.get('/gmail/callback', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          code:  { type: 'string' },
          state: { type: 'string' },
          error: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    if (request.query.error) {
      return reply.redirect(`${MOBILE_REDIRECT_URI}?error=${encodeURIComponent(request.query.error)}`);
    }

    const { code, state: userId } = request.query;
    if (!code || !userId) {
      return reply.redirect(`${MOBILE_REDIRECT_URI}?error=missing_params`);
    }

    try {
      // Web callback uses the server-side redirect URI (GMAIL_REDIRECT_URI env var)
      await exchangeCodeForTokens(code, userId);
      await setupGmailWatch(userId).catch((err) => {
        fastify.log.error(`[gmail] setupGmailWatch failed for user ${userId}: ${err.message}`);
      });
      return reply.redirect(`${MOBILE_REDIRECT_URI}?success=true`);
    } catch (err) {
      fastify.log.error(`[gmail] callback exchange failed: ${err.message}`);
      return reply.redirect(`${MOBILE_REDIRECT_URI}?error=exchange_failed`);
    }
  });

  // ─── POST /gmail/connect ──────────────────────────────────────────────────
  // Mobile-side OAuth completion. After expo-web-browser intercepts the
  // messagent://gmail/callback deep link, the app parses the `code` from the
  // URL and POSTs it here with its JWT. We do the token exchange and watch
  // setup server-side and return the connected Gmail address.
  fastify.post('/gmail/connect', {
    preHandler: [verifyJWT],
    schema: {
      body: {
        type: 'object',
        required: ['code'],
        properties: {
          code: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const userId = request.user.id;
    const { code } = request.body;

    // Exchange using the same mobile redirect URI that was used to generate the consent URL
    const { email } = await exchangeCodeForTokens(code, userId, MOBILE_REDIRECT_URI);

    // Subscribe to inbox push notifications — non-fatal on failure
    await setupGmailWatch(userId).catch((err) => {
      fastify.log.error(`[gmail] setupGmailWatch failed for user ${userId}: ${err.message}`);
    });

    fastify.log.info(`[gmail] Mobile connect complete for user ${userId} (${email})`);
    return reply.send({ success: true, email });
  });

  // ─── POST /gmail/webhook ─────────────────────────────────────────────────
  // Google Pub/Sub push endpoint — called by Google whenever new mail arrives.
  // Verify the shared secret then ack immediately; process asynchronously.
  //
  // Token verification: Pub/Sub push subscriptions do NOT send x-goog-channel-token.
  // Pass the token in the push URL instead:
  //   https://host/gmail/webhook?token=GMAIL_PUBSUB_VERIFY_TOKEN
  // The route checks request.query.token, falling back to x-goog-channel-token
  // for direct Gmail watch channel calls.
  fastify.post('/gmail/webhook', {
    config: { rawBody: true },
    schema: {
      querystring: {
        type: 'object',
        properties: {
          token: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const expectedToken = process.env.GMAIL_PUBSUB_VERIFY_TOKEN;
    const receivedToken = request.query.token ?? request.headers['x-goog-channel-token'];

    if (expectedToken && receivedToken !== expectedToken) {
      fastify.log.warn('[gmail] Webhook received with invalid verify token');
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    reply.code(204).send();

    processGmailWebhook(request.body).catch((err) => {
      fastify.log.error('[gmail] processGmailWebhook error:', err.message);
    });
  });
}

module.exports = gmailRoutes;
