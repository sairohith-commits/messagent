// Reply log routes — fetch the agent's reply history and submit thumbs-up / thumbs-down ratings

'use strict';

const { query } = require('../db');

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
async function logRoutes(fastify) {
  const { verifyJWT, rateLimit } = fastify;

  // ─── GET /logs ───────────────────────────────────────────────────────────────
  fastify.get('/', {
    preHandler: [verifyJWT, rateLimit],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit:  { type: 'integer', minimum: 1, maximum: 200, default: 50 },
          offset: { type: 'integer', minimum: 0, default: 0 },
        },
      },
    },
  }, async (request, reply) => {
    const userId = request.user.id;
    const { limit = 50, offset = 0 } = request.query;

    const sql = `
      SELECT rl.id,
             rl.message_id,
             rl.reply_body,
             rl.model_used,
             rl.sent_at,
             rl.rating,
             rl.created_at,
             m.platform,
             m.from_contact,
             m.body AS original_message
      FROM   reply_logs rl
      JOIN   messages   m  ON m.id = rl.message_id
      WHERE  rl.user_id = $1
      ORDER  BY rl.created_at DESC
      LIMIT  $2 OFFSET $3
    `;
    const { rows } = await query(sql, [userId, limit, offset]);

    // Total count for pagination
    const { rows: countRows } = await query(
      'SELECT COUNT(*) AS total FROM reply_logs WHERE user_id = $1',
      [userId]
    );

    return reply.send({ logs: rows, total: Number(countRows[0].total) });
  });

  // ─── PUT /logs/:id/rating ────────────────────────────────────────────────────
  fastify.put('/:id/rating', {
    preHandler: [verifyJWT, rateLimit],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
      body: {
        type: 'object',
        required: ['rating'],
        properties: {
          // 1 = thumbs up, -1 = thumbs down
          rating: { type: 'integer', enum: [1, -1] },
        },
      },
    },
  }, async (request, reply) => {
    const userId  = request.user.id;
    const logId   = request.params.id;
    const { rating } = request.body;

    // Ensure the log belongs to the requesting user
    const sql = `
      UPDATE reply_logs
      SET    rating = $3
      WHERE  id      = $1
        AND  user_id = $2
      RETURNING id, rating
    `;
    const { rows } = await query(sql, [logId, userId, rating]);

    if (rows.length === 0) {
      return reply.code(404).send({ error: 'Reply log not found' });
    }

    return reply.send({ log: rows[0] });
  });
}

module.exports = logRoutes;
