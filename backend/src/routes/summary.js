'use strict';

// Summary routes — provide Claude-generated digests of recent messages

const { getRecentMessages } = require('../models/message');
const { summarizeMessages }  = require('../services/summarizer');
const { getUserById }        = require('../models/user');

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
async function summaryRoutes(fastify) {
  const { verifyJWT, rateLimit } = fastify;

  // ─── GET /summary/daily ─────────────────────────────────────────────────────
  // Returns an AI-generated summary of the last 50 messages for the current user.
  fastify.get('/daily', {
    preHandler: [verifyJWT, rateLimit],
  }, async (request, reply) => {
    const userId = request.user.id;

    const [messages, user] = await Promise.all([
      getRecentMessages(userId, 50),
      getUserById(userId),
    ]);

    if (!messages.length) {
      return reply.send({ summaries: [], total: 0 });
    }

    const summaries = await summarizeMessages(messages, user?.name ?? 'User');
    return reply.send({ summaries, total: summaries.length });
  });

  // ─── GET /summary/unread ────────────────────────────────────────────────────
  // Returns the last 20 pending/unread messages (raw, not summarised) for quick review.
  fastify.get('/unread', {
    preHandler: [verifyJWT, rateLimit],
  }, async (request, reply) => {
    const userId = request.user.id;
    const messages = await getRecentMessages(userId, 20);
    const unread   = messages.filter((m) => m.status === 'pending');
    return reply.send({ messages: unread, total: unread.length });
  });
}

module.exports = summaryRoutes;
