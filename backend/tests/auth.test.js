// Auth route tests — register, login, and JWT verification

'use strict';

const supertest  = require('supertest');
const { build }  = require('../src/index');
const { query }  = require('../src/db');

// The db module is mocked in setup.js — we just control what query() returns per test.

let app;

beforeAll(async () => {
  app = await build();
});

afterAll(async () => {
  await app.close();
});

// ─── POST /auth/register ──────────────────────────────────────────────────────

describe('POST /auth/register', () => {
  const validBody = { email: 'alice@example.com', name: 'Alice', password: 'secret123' };

  it('creates a user and returns a JWT', async () => {
    // First call: getUserByEmail → not found
    // Second call: createUser → returns new user row
    query
      .mockResolvedValueOnce({ rows: [] })                              // getUserByEmail
      .mockResolvedValueOnce({ rows: [{                                 // createUser
        id: 'uuid-1', email: validBody.email,
        name: validBody.name, tier: 'free', created_at: new Date(),
      }] });

    const res = await supertest(app.server)
      .post('/auth/register')
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.email).toBe(validBody.email);
    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  it('returns 409 when email is already registered', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'uuid-1', email: validBody.email }] });

    const res = await supertest(app.server)
      .post('/auth/register')
      .send(validBody);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it('returns 400 when password is too short', async () => {
    const res = await supertest(app.server)
      .post('/auth/register')
      .send({ ...validBody, password: 'short' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when email is malformed', async () => {
    const res = await supertest(app.server)
      .post('/auth/register')
      .send({ ...validBody, email: 'not-an-email' });

    expect(res.status).toBe(400);
  });
});

// ─── POST /auth/login ─────────────────────────────────────────────────────────

describe('POST /auth/login', () => {
  // bcrypt hash of "secret123" with 12 rounds (pre-computed to avoid slow hashing in tests)
  const HASH = '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeHzZPpCqiRKX8OiS';

  const dbUser = {
    id: 'uuid-1', email: 'alice@example.com', name: 'Alice',
    tier: 'free', password_hash: HASH, created_at: new Date(),
  };

  it('returns a JWT for valid credentials', async () => {
    query.mockResolvedValueOnce({ rows: [dbUser] });

    const res = await supertest(app.server)
      .post('/auth/login')
      .send({ email: dbUser.email, password: 'secret123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  it('returns 401 for unknown email', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await supertest(app.server)
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'secret123' });

    expect(res.status).toBe(401);
  });

  it('returns 401 for wrong password', async () => {
    query.mockResolvedValueOnce({ rows: [dbUser] });

    const res = await supertest(app.server)
      .post('/auth/login')
      .send({ email: dbUser.email, password: 'wrongpass' });

    expect(res.status).toBe(401);
  });
});

// ─── JWT verification ─────────────────────────────────────────────────────────

describe('JWT protected routes', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const res = await supertest(app.server).get('/agent/settings');
    expect(res.status).toBe(401);
  });

  it('returns 401 for a malformed token', async () => {
    const res = await supertest(app.server)
      .get('/agent/settings')
      .set('Authorization', 'Bearer not.a.valid.jwt');

    expect(res.status).toBe(401);
  });
});
