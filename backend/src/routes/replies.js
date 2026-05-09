'use strict';

// Suggested-reply management routes — approve, edit, reject pending AI suggestions.

const {
  getPendingReplies,
  getSuggestedReplyById,
  updateSuggestedReplyStatus,
  countPendingReplies,
} = require('../models/suggestedReply');
const { updateMessageStatus } = require('../models/message');

const gmail             = require('../services/gmail');
const whatsapp          = require('../services/whatsapp');
const instagram         = require('../services/instagram');
const instagramPersonal = require('../services/instagramPersonal');

/**
 * Dispatch an already-reviewed reply via the correct platform.
 */
async function dispatchApprovedReply(platform, userId, fromContact, replyBody, threadId) {
  switch (platform) {
    case 'gmail':
      if (threadId) await gmail.sendReply(userId, threadId, fromContact, replyBody);
      break;
    case 'whatsapp':
      await whatsapp.sendReply(userId, fromContact, replyBody, threadId);
      break;
    case 'instagram': {
      const igState = instagramPersonal.getPersonalState(userId);
      if (igState.status === 'connected' && threadId) {
        await instagramPersonal.sendInstagramReply(userId, threadId, replyBody);
      } else {
        await instagram.sendReply(userId, fromContact, replyBody);
      }
      break;
    }
    default:
      console.warn(`[replies] No send impl for platform: ${platform}`);
  }
}

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
async function repliesRoutes(fastify) {
  const { verifyJWT, rateLimit } = fastify;

  // ─── GET /replies/pending ────────────────────────────────────────────────────
  fastify.get('/pending', {
    preHandler: [verifyJWT, rateLimit],
  }, async (request, reply) => {
    const userId  = request.user.id;
    const pending = await getPendingReplies(userId);
    const count   = await countPendingReplies(userId);
    return reply.send({ replies: pending, total: count });
  });

  // ─── POST /replies/:id/approve ───────────────────────────────────────────────
  // Approve and dispatch the suggested reply as-is.
  fastify.post('/:id/approve', {
    preHandler: [verifyJWT, rateLimit],
  }, async (request, reply) => {
    const userId = request.user.id;
    const { id } = request.params;

    const suggestion = await getSuggestedReplyById(id, userId);
    if (!suggestion) return reply.code(404).send({ error: 'Suggestion not found' });
    if (suggestion.status !== 'pending') return reply.code(409).send({ error: 'Already actioned' });

    await dispatchApprovedReply(
      suggestion.platform,
      userId,
      suggestion.from_contact,
      suggestion.suggested_reply,
      suggestion.thread_id,
    );

    const sentAt = new Date();
    const updated = await updateSuggestedReplyStatus(id, userId, 'approved', { sentAt });
    await updateMessageStatus(suggestion.message_id, 'replied');

    return reply.send({ reply: updated });
  });

  // ─── POST /replies/:id/edit ──────────────────────────────────────────────────
  // Edit the suggested reply and dispatch the edited version.
  fastify.post('/:id/edit', {
    preHandler: [verifyJWT, rateLimit],
    schema: {
      body: {
        type: 'object',
        required: ['editedReply'],
        properties: {
          editedReply: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const userId = request.user.id;
    const { id } = request.params;
    const { editedReply } = request.body;

    const suggestion = await getSuggestedReplyById(id, userId);
    if (!suggestion) return reply.code(404).send({ error: 'Suggestion not found' });
    if (suggestion.status !== 'pending') return reply.code(409).send({ error: 'Already actioned' });

    await dispatchApprovedReply(
      suggestion.platform,
      userId,
      suggestion.from_contact,
      editedReply,
      suggestion.thread_id,
    );

    const sentAt  = new Date();
    const updated = await updateSuggestedReplyStatus(id, userId, 'edited', { editedReply, sentAt });
    await updateMessageStatus(suggestion.message_id, 'replied');

    return reply.send({ reply: updated });
  });

  // ─── DELETE /replies/:id ─────────────────────────────────────────────────────
  // Reject / dismiss the suggestion without sending anything.
  fastify.delete('/:id', {
    preHandler: [verifyJWT, rateLimit],
  }, async (request, reply) => {
    const userId = request.user.id;
    const { id } = request.params;

    const suggestion = await getSuggestedReplyById(id, userId);
    if (!suggestion) return reply.code(404).send({ error: 'Suggestion not found' });
    if (suggestion.status !== 'pending') return reply.code(409).send({ error: 'Already actioned' });

    const updated = await updateSuggestedReplyStatus(id, userId, 'rejected');
    await updateMessageStatus(suggestion.message_id, 'skipped');

    return reply.send({ reply: updated });
  });
}

module.exports = repliesRoutes;
