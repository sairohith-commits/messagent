'use strict';

// Notification routes — register device push tokens from the mobile app

const { query } = require('../db');

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
async function notificationRoutes(fastify) {
  const { verifyJWT, rateLimit } = fastify;

  // ─── POST /notifications/register ─────────────────────────────────────────
  // Save (or update) the Expo push token for the authenticated user.
  fastify.post('/register', {
    preHandler: [verifyJWT, rateLimit],
    schema: {
      body: {
        type: 'object',
        required: ['expoPushToken'],
        properties: {
          expoPushToken: { type: 'string', minLength: 10 },
        },
      },
    },
  }, async (request, reply) => {
    const userId       = request.user.id;
    const { expoPushToken } = request.body;

    await query(
      'UPDATE users SET expo_push_token = $2 WHERE id = $1',
      [userId, expoPushToken],
    );

    return reply.send({ ok: true });
  });

  // ─── DELETE /notifications/register ─────────────────────────────────────────
  // Unregister the push token on logout.
  fastify.delete('/register', {
    preHandler: [verifyJWT, rateLimit],
  }, async (request, reply) => {
    await query(
      'UPDATE users SET expo_push_token = NULL WHERE id = $1',
      [request.user.id],
    );
    return reply.send({ ok: true });
  });
}

module.exports = notificationRoutes;
