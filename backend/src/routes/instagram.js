// Instagram routes — Meta Business API (OAuth + webhooks) + personal API (instagram-private-api)

'use strict';

const {
  verifyWebhook,
  processInstagramWebhook,
  getConnectUrl,
  exchangeCodeForTokens,
} = require('../services/instagram');

const {
  connectInstagram,
  verifyChallenge,
  disconnectInstagram,
  getPersonalState,
} = require('../services/instagramPersonal');

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
async function instagramRoutes(fastify) {
  const { verifyJWT } = fastify;

  // ─── GET /instagram/webhook ───────────────────────────────────────────────
  // Meta sends a one-time GET to verify the webhook URL. Echo back the challenge.
  fastify.get('/instagram/webhook', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          'hub.mode':         { type: 'string' },
          'hub.verify_token': { type: 'string' },
          'hub.challenge':    { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const mode      = request.query['hub.mode'];
    const token     = request.query['hub.verify_token'];
    const challenge = request.query['hub.challenge'];

    const result = verifyWebhook(mode, token, challenge);
    if (!result.ok) return reply.code(403).send({ error: 'Forbidden' });

    return reply.type('text/plain').send(challenge);
  });

  // ─── POST /instagram/webhook ──────────────────────────────────────────────
  // Meta delivers incoming Instagram DMs here. Ack 200 immediately.
  fastify.post('/instagram/webhook', async (request, reply) => {
    reply.code(200).send({ status: 'ok' });

    processInstagramWebhook(request.body).catch((err) => {
      fastify.log.error('[instagram] processInstagramWebhook error:', err.message);
    });
  });

  // ─── GET /instagram/auth-url ──────────────────────────────────────────────
  // Returns the Facebook/Instagram OAuth consent URL for the mobile app.
  fastify.get('/instagram/auth-url', {
    preHandler: [verifyJWT],
  }, async (request, reply) => {
    const url = getConnectUrl(request.user.id);
    return reply.send({ url });
  });

  // ─── POST /instagram/connect ──────────────────────────────────────────────
  // Mobile calls this after parsing the `code` from the OAuth redirect.
  fastify.post('/instagram/connect', {
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

    const { instagramAccountId } = await exchangeCodeForTokens(code, userId);
    return reply.send({ success: true, instagramAccountId });
  });

  // ─── Personal (instagram-private-api) routes ───────────────────────────────

  // POST /instagram/personal/connect — login with username + password
  fastify.post('/instagram/personal/connect', {
    preHandler: [verifyJWT],
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string' },
          password: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { username, password } = request.body;
    const result = await connectInstagram(request.user.id, username, password);
    return reply.send(result);
  });

  // POST /instagram/personal/verify-challenge — submit 2FA / checkpoint code
  fastify.post('/instagram/personal/verify-challenge', {
    preHandler: [verifyJWT],
    schema: {
      body: {
        type: 'object',
        required: ['code'],
        properties: { code: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const result = await verifyChallenge(request.user.id, request.body.code);
    return reply.send(result);
  });

  // GET /instagram/personal/status — connection state + username
  fastify.get('/instagram/personal/status', {
    preHandler: [verifyJWT],
  }, async (request, reply) => {
    return reply.send(getPersonalState(request.user.id));
  });

  // DELETE /instagram/personal/disconnect — log out and clear session
  fastify.delete('/instagram/personal/disconnect', {
    preHandler: [verifyJWT],
  }, async (request, reply) => {
    await disconnectInstagram(request.user.id);
    return reply.send({ success: true });
  });
}

module.exports = instagramRoutes;
