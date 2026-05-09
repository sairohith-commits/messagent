// Agent settings routes — read and update per-platform config for the authenticated user

'use strict';

const { query } = require('../db');

/**
 * Upsert a single platform config row.
 * Called once per platform entry in the PUT body.
 */
async function upsertPlatformConfig(userId, cfg) {
  const sql = `
    INSERT INTO platform_configs
      (user_id, platform, enabled, mode, reply_mode, schedule_start, schedule_end, user_instructions)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (user_id, platform) DO UPDATE
      SET enabled           = EXCLUDED.enabled,
          mode              = EXCLUDED.mode,
          reply_mode        = EXCLUDED.reply_mode,
          schedule_start    = EXCLUDED.schedule_start,
          schedule_end      = EXCLUDED.schedule_end,
          user_instructions = EXCLUDED.user_instructions,
          updated_at        = NOW()
    RETURNING *
  `;
  const { rows } = await query(sql, [
    userId,
    cfg.platform,
    cfg.enabled  ?? false,
    cfg.mode     ?? 'assistant',
    cfg.replyMode ?? 'auto',
    cfg.scheduleStart ?? null,
    cfg.scheduleEnd   ?? null,
    cfg.userInstructions ?? null,
  ]);
  return rows[0];
}

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
async function agentRoutes(fastify) {
  const { verifyJWT, rateLimit } = fastify;

  // ─── GET /agent/settings ────────────────────────────────────────────────────
  fastify.get('/agent/settings', {
    preHandler: [verifyJWT, rateLimit],
  }, async (request, reply) => {
    const userId = request.user.id;

    const { rows } = await query(
      `SELECT platform, enabled, mode, reply_mode, schedule_start, schedule_end, user_instructions
       FROM   platform_configs
       WHERE  user_id = $1
       ORDER  BY platform`,
      [userId]
    );

    // Map snake_case DB columns to camelCase for the mobile client
    const platforms = rows.map((r) => ({
      platform:         r.platform,
      enabled:          r.enabled,
      mode:             r.mode,
      replyMode:        r.reply_mode ?? 'auto',
      scheduleStart:    r.schedule_start,
      scheduleEnd:      r.schedule_end,
      userInstructions: r.user_instructions,
    }));

    return reply.send({ platforms });
  });

  // ─── PUT /agent/settings ────────────────────────────────────────────────────
  fastify.put('/agent/settings', {
    preHandler: [verifyJWT, rateLimit],
    schema: {
      body: {
        type: 'object',
        required: ['platforms'],
        properties: {
          platforms: {
            type: 'array',
            items: {
              type: 'object',
              required: ['platform'],
              properties: {
                platform:         { type: 'string', enum: ['gmail', 'whatsapp', 'instagram', 'telegram'] },
                enabled:          { type: 'boolean' },
                mode:             { type: 'string', enum: ['owner', 'assistant'] },
                replyMode:        { type: 'string', enum: ['auto', 'suggest'] },
                scheduleStart:    { type: ['string', 'null'] },
                scheduleEnd:      { type: ['string', 'null'] },
                userInstructions: { type: ['string', 'null'] },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const userId = request.user.id;
    const { platforms } = request.body;

    const updated = await Promise.all(
      platforms.map((cfg) => upsertPlatformConfig(userId, cfg))
    );

    return reply.send({ platforms: updated });
  });
}

module.exports = agentRoutes;
