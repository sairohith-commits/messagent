// Jest global setup — mock infrastructure dependencies before any test file runs

'use strict';

// ─── PostgreSQL mock ─────────────────────────────────────────────────────────
// Tests import db directly and control query() responses per test.
jest.mock('../src/db', () => ({
  query:   jest.fn(),
  connect: jest.fn().mockResolvedValue(undefined),
}));

// ─── ioredis mock ─────────────────────────────────────────────────────────────
// BullMQ and the rate-limit plugin both use ioredis.
jest.mock('ioredis', () => {
  const mockPipeline = {
    zadd:              jest.fn().mockReturnThis(),
    zremrangebyscore:  jest.fn().mockReturnThis(),
    zcard:             jest.fn().mockReturnThis(),
    pexpire:           jest.fn().mockReturnThis(),
    // pipeline().exec() returns an array of [error, result] pairs
    exec: jest.fn().mockResolvedValue([[null, 1], [null, 0], [null, 1], [null, 1]]),
  };

  const MockRedis = jest.fn().mockImplementation(() => ({
    connect:   jest.fn().mockResolvedValue(undefined),
    pipeline:  jest.fn().mockReturnValue(mockPipeline),
    quit:      jest.fn().mockResolvedValue(undefined),
    // BullMQ uses these directly
    zadd:      jest.fn().mockResolvedValue(1),
    zcard:     jest.fn().mockResolvedValue(0),
    duplicate: jest.fn().mockReturnThis(),
  }));

  return MockRedis;
});

// ─── BullMQ mock ──────────────────────────────────────────────────────────────
jest.mock('bullmq', () => ({
  Queue:  jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
  })),
}));

// ─── googleapis mock ──────────────────────────────────────────────────────────
jest.mock('googleapis', () => {
  const mockHistory = {
    list: jest.fn().mockResolvedValue({ data: { history: [] } }),
  };
  const mockMessages = {
    get:  jest.fn().mockResolvedValue({ data: { payload: { headers: [], parts: [] } } }),
    send: jest.fn().mockResolvedValue({ data: { id: 'mock-gmail-msg-id' } }),
  };
  const mockThreads = {
    get: jest.fn().mockResolvedValue({ data: { messages: [] } }),
  };
  const mockUsers = {
    getProfile: jest.fn().mockResolvedValue({
      data: { emailAddress: 'test@gmail.com', historyId: '12345' },
    }),
    history:  { list: mockHistory.list },
    messages: mockMessages,
    threads:  mockThreads,
  };
  const mockWatch = jest.fn().mockResolvedValue({
    data: { historyId: '99999', expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000) },
  });

  return {
    google: {
      auth: {
        OAuth2: jest.fn().mockImplementation(() => ({
          generateAuthUrl:    jest.fn().mockReturnValue('https://accounts.google.com/mock-consent'),
          getToken:           jest.fn().mockResolvedValue({ tokens: { access_token: 'mock-access', refresh_token: 'mock-refresh', expiry_date: Date.now() + 3600000 } }),
          setCredentials:     jest.fn(),
          refreshAccessToken: jest.fn().mockResolvedValue({ credentials: { access_token: 'mock-refreshed', expiry_date: Date.now() + 3600000 } }),
        })),
      },
      gmail: jest.fn().mockReturnValue({
        users: { ...mockUsers, watch: mockWatch },
      }),
    },
  };
});

// Silence console output during tests to keep the output clean
global.console = {
  ...console,
  info:  jest.fn(),
  warn:  jest.fn(),
  error: jest.fn(),
};
