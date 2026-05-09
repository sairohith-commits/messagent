// Redis sliding-window rate limiter — 100 requests per minute per authenticated user (or IP)

'use strict';

const fp = require('fastify-plugin');

const WINDOW_MS  = 60_000; // 1 minute
const MAX_CALLS  = 100;

/**
 * Fastify plugin that adds a `rateLimit` preHandler decorator.
 *
 * Usage on a route:
 *   preHandler: [fastify.verifyJWT, fastify.rateLimit]
 *
 * The key is `user:<userId>` for authenticated requests, or `ip:<address>` as fallback.
 */
async function rateLimitPlugin(fastify) {
  fastify.decorate('rateLimit', async function (request, reply) {
    const redis = fastify.redis; // ioredis instance registered in index.js
    const userId = request.user?.id;
    const key = userId
      ? `rl:user:${userId}`
      : `rl:ip:${request.ip}`;

    const now      = Date.now();
    const windowStart = now - WINDOW_MS;

    // Sliding window with sorted set: score = timestamp, member = unique request id
    const member = `${now}-${Math.random()}`;

    const pipeline = redis.pipeline();
    pipeline.zadd(key, now, member);                // record this request
    pipeline.zremrangebyscore(key, '-inf', windowStart); // purge expired entries
    pipeline.zcard(key);                             // count requests in window
    pipeline.pexpire(key, WINDOW_MS);               // auto-cleanup
    const results = await pipeline.exec();

    // zcard result is at index 2 of the pipeline results
    const count = results[2][1];

    reply.header('X-RateLimit-Limit',     MAX_CALLS);
    reply.header('X-RateLimit-Remaining', Math.max(0, MAX_CALLS - count));

    if (count > MAX_CALLS) {
      reply.header('Retry-After', Math.ceil(WINDOW_MS / 1000));
      reply.code(429).send({ error: 'Too many requests — please slow down' });
    }
  });
}

module.exports = fp(rateLimitPlugin, { name: 'rateLimit' });
