// Model version route — no auth required, polled by free-tier mobile clients

'use strict';

const { getCurrentModelVersion } = require('../services/modelService');

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
async function modelRoutes(fastify) {
  // ─── GET /model/version ───────────────────────────────────────────────────
  // Returns the current published Gemma model metadata.
  // Mobile clients compare `version` against the locally stored version string
  // and trigger a download if they differ.
  fastify.get('/model/version', async (_request, reply) => {
    return reply.send(getCurrentModelVersion());
  });
}

module.exports = modelRoutes;
