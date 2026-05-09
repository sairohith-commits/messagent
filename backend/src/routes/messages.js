// Message routes — webhook intake for all platforms + recent message list for the mobile app

'use strict';

const { saveMessage, getRecentMessages } = require('../models/message');
const { addMessageJob } = require('../queues/messageQueue');

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
async function messageRoutes(fastify) {
  const { verifyJWT, rateLimit } = fastify;

  // ─── POST /messages/incoming ─────────────────────────────────────────────────
  // Webhook endpoint called by platform integrations (or a proxy) when a message arrives.
  // In production each platform has a separate webhook path; this unified endpoint
  // accepts a `userId` in the body to route the message to the correct agent config.
  fastify.post('/incoming', {
    schema: {
      body: {
        type: 'object',
        required: ['userId', 'platform', 'fromContact', 'body'],
        properties: {
          userId:      { type: 'string', format: 'uuid' },
          platform:    { type: 'string', enum: ['gmail', 'whatsapp', 'instagram', 'telegram'] },
          fromContact: { type: 'string' },
          body:        { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const { userId, platform, fromContact, body } = request.body;

    // Persist the raw message first so we always have a record
    const message = await saveMessage(userId, platform, fromContact, body);

    // Enqueue for agent processing — non-blocking, worker handles the rest
    await addMessageJob({
      messageId:   message.id,
      userId,
      platform,
      fromContact,
      body,
    });

    return reply.code(202).send({ messageId: message.id, status: 'queued' });
  });

  // ─── GET /messages/recent ────────────────────────────────────────────────────
  fastify.get('/recent', {
    preHandler: [verifyJWT, rateLimit],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
        },
      },
    },
  }, async (request, reply) => {
    const userId = request.user.id;
    const limit  = request.query.limit ?? 50;

    const messages = await getRecentMessages(userId, limit);
    return reply.send({ messages });
  });
}

module.exports = messageRoutes;
