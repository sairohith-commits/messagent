// JWT auth middleware — verifies the Bearer token and attaches the decoded user payload to request

'use strict';

const fp = require('fastify-plugin');

/**
 * Fastify plugin that adds a `verifyJWT` decorator.
 * Register this plugin once in index.js, then use `preHandler: [fastify.verifyJWT]`
 * on any route that requires authentication.
 */
async function authPlugin(fastify) {
  fastify.decorate('verifyJWT', async function (request, reply) {
    try {
      // @fastify/jwt attaches jwtVerify to the request object
      await request.jwtVerify();
      // request.user is now populated with the decoded token payload
    } catch (err) {
      reply.code(401).send({ error: 'Unauthorized — invalid or missing token' });
    }
  });
}

module.exports = fp(authPlugin, { name: 'auth' });
