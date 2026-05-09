// WhatsApp routes — Meta Business Cloud API webhooks + Baileys personal connection

'use strict';

const {
  verifyWebhook,
  processWhatsAppWebhook,
} = require('../services/whatsapp');

const {
  connectWhatsApp,
  disconnectWhatsApp,
  getSessionState,
} = require('../services/whatsappBaileys');

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
async function whatsappRoutes(fastify) {
  const { verifyJWT } = fastify;

  // ─── Personal (Baileys) routes ────────────────────────────────────────────

  // POST /whatsapp/personal/connect — start QR-scan session for this user
  fastify.post('/whatsapp/personal/connect', {
    preHandler: [verifyJWT],
  }, async (request, reply) => {
    const result = await connectWhatsApp(request.user.id);
    return reply.send(result);
  });

  // GET /whatsapp/personal/status — current connection state + QR code (base64)
  fastify.get('/whatsapp/personal/status', {
    preHandler: [verifyJWT],
  }, async (request, reply) => {
    return reply.send(getSessionState(request.user.id));
  });

  // DELETE /whatsapp/personal/disconnect — log out and delete saved session
  fastify.delete('/whatsapp/personal/disconnect', {
    preHandler: [verifyJWT],
  }, async (request, reply) => {
    await disconnectWhatsApp(request.user.id);
    return reply.send({ success: true });
  });
  // ─── GET /whatsapp/webhook ────────────────────────────────────────────────
  // Meta sends a GET request to verify the webhook URL when you first configure it
  // in the Meta Developer Portal. Respond with the hub.challenge to confirm.
  fastify.get('/whatsapp/webhook', {
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
    if (!result.ok) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
    // Must respond with the raw challenge string (not JSON)
    return reply.type('text/plain').send(challenge);
  });

  // ─── POST /whatsapp/webhook ───────────────────────────────────────────────
  // Meta delivers incoming messages and status updates here.
  // Ack with 200 immediately — Meta retries on non-2xx responses.
  fastify.post('/whatsapp/webhook', async (request, reply) => {
    // Acknowledge before processing so Meta doesn't time out
    reply.code(200).send({ status: 'ok' });

    processWhatsAppWebhook(request.body).catch((err) => {
      fastify.log.error('[whatsapp] processWhatsAppWebhook error:', err.message);
    });
  });
}

module.exports = whatsappRoutes;
