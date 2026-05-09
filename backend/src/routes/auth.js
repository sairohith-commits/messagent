// Auth routes — POST /auth/register and POST /auth/login, returns a signed JWT

'use strict';

const bcrypt = require('bcryptjs');
const { createUser, getUserByEmail } = require('../models/user');

const SALT_ROUNDS = 12;

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
async function authRoutes(fastify) {
  // ─── POST /auth/register ────────────────────────────────────────────────────
  fastify.post('/register', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'name', 'password'],
        properties: {
          email:    { type: 'string', format: 'email' },
          name:     { type: 'string', minLength: 1 },
          password: { type: 'string', minLength: 8 },
        },
      },
    },
  }, async (request, reply) => {
    const { email, name, password } = request.body;

    // Reject duplicate emails with a clear message
    const existing = await getUserByEmail(email);
    if (existing) {
      return reply.code(409).send({ error: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await createUser(email, name, passwordHash);

    const token = fastify.jwt.sign(
      { id: user.id, email: user.email, tier: user.tier },
      { expiresIn: '30d' }
    );

    return reply.code(201).send({ token, user });
  });

  // ─── POST /auth/login ───────────────────────────────────────────────────────
  fastify.post('/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email:    { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password } = request.body;

    const user = await getUserByEmail(email);
    if (!user) {
      // Generic message — avoids leaking which emails are registered
      return reply.code(401).send({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid email or password' });
    }

    const token = fastify.jwt.sign(
      { id: user.id, email: user.email, tier: user.tier },
      { expiresIn: '30d' }
    );

    // Strip password_hash before sending
    const { password_hash, ...safeUser } = user;
    return reply.send({ token, user: safeUser });
  });
}

module.exports = authRoutes;
