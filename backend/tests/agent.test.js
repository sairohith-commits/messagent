// Agent settings route tests — GET/PUT platform configs

'use strict';

const supertest = require('supertest');
const { build } = require('../src/index');
const { query } = require('../src/db');

let app;
let authToken; // signed JWT for use in test requests

beforeAll(async () => {
  app = await build();

  // Mint a test JWT directly via the fastify instance
  authToken = app.jwt.sign(
    { id: 'uuid-test', email: 'test@example.com', tier: 'free' },
    { expiresIn: '1h' },
  );
});

afterAll(async () => {
  await app.close();
});

// ─── GET /agent/settings ─────────────────────────────────────────────────────

describe('GET /agent/settings', () => {
  it('returns platform configs for the authenticated user', async () => {
    const mockRows = [
      { platform: 'gmail', enabled: true, mode: 'assistant',
        schedule_start: null, schedule_end: null, user_instructions: null },
    ];
    query.mockResolvedValueOnce({ rows: mockRows });

    const res = await supertest(app.server)
      .get('/agent/settings')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.platforms).toHaveLength(1);
    expect(res.body.platforms[0].platform).toBe('gmail');
    expect(res.body.platforms[0]).toHaveProperty('scheduleStart');
    expect(res.body.platforms[0]).not.toHaveProperty('schedule_start');
  });

  it('returns an empty array when no configs exist yet', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await supertest(app.server)
      .get('/agent/settings')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.platforms).toEqual([]);
  });
});

// ─── PUT /agent/settings ─────────────────────────────────────────────────────

describe('PUT /agent/settings', () => {
  const validPlatforms = [
    { platform: 'gmail',     enabled: true,  mode: 'owner' },
    { platform: 'whatsapp',  enabled: false, mode: 'assistant' },
  ];

  it('upserts all platform configs and returns them', async () => {
    const mockRow = { platform: 'gmail', enabled: true, mode: 'owner',
      schedule_start: null, schedule_end: null, user_instructions: null };

    // upsertPlatformConfig is called once per platform entry
    query
      .mockResolvedValueOnce({ rows: [mockRow] })
      .mockResolvedValueOnce({ rows: [{ ...mockRow, platform: 'whatsapp', enabled: false, mode: 'assistant' }] });

    const res = await supertest(app.server)
      .put('/agent/settings')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ platforms: validPlatforms });

    expect(res.status).toBe(200);
    expect(res.body.platforms).toHaveLength(2);
  });

  it('enables a platform toggle', async () => {
    const row = { platform: 'instagram', enabled: true, mode: 'assistant',
      schedule_start: null, schedule_end: null, user_instructions: null };
    query.mockResolvedValueOnce({ rows: [row] });

    const res = await supertest(app.server)
      .put('/agent/settings')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ platforms: [{ platform: 'instagram', enabled: true, mode: 'assistant' }] });

    expect(res.status).toBe(200);
    expect(res.body.platforms[0].enabled).toBe(true);
  });

  it('rejects an unknown platform name', async () => {
    const res = await supertest(app.server)
      .put('/agent/settings')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ platforms: [{ platform: 'tiktok', enabled: true, mode: 'assistant' }] });

    expect(res.status).toBe(400);
  });

  it('rejects an invalid mode value', async () => {
    const res = await supertest(app.server)
      .put('/agent/settings')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ platforms: [{ platform: 'gmail', enabled: true, mode: 'robot' }] });

    expect(res.status).toBe(400);
  });

  it('accepts a schedule with start and end times', async () => {
    const row = { platform: 'gmail', enabled: true, mode: 'assistant',
      schedule_start: '09:00', schedule_end: '18:00', user_instructions: null };
    query.mockResolvedValueOnce({ rows: [row] });

    const res = await supertest(app.server)
      .put('/agent/settings')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ platforms: [{ platform: 'gmail', enabled: true, mode: 'assistant',
        scheduleStart: '09:00', scheduleEnd: '18:00' }] });

    expect(res.status).toBe(200);
  });
});
