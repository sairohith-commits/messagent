// Subscription gate — adds fastify.requirePro preHandler decorator
// Usage: preHandler: [fastify.verifyJWT, fastify.requirePro]

'use strict';

const fp       = require('fastify-plugin');
const { query } = require('../db');

async function checkSubscriptionPlugin(fastify) {
  fastify.decorate('requirePro', async function requirePro(request, reply) {
    const userId = request.user?.id;
    if (!userId) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const { rows } = await query(
      'SELECT tier FROM users WHERE id = $1',
      [userId],
    );

    const tier = rows[0]?.tier ?? 'free';
    if (tier === 'free') {
      return reply.code(403).send({
        error: 'Pro subscription required to use this feature',
        upgradeUrl: '/subscription/checkout',
      });
    }
  });
}

module.exports = fp(checkSubscriptionPlugin, { name: 'checkSubscription' });
