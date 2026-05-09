// Jest configuration for Messagent backend tests

'use strict';

module.exports = {
  testEnvironment: 'node',
  setupFilesAfterFramework: [],
  setupFiles: ['./tests/setup.js'],
  testMatch: ['**/tests/**/*.test.js'],
  clearMocks: true,
  resetMocks: false,
  // Collect coverage from all source files
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js',    // entry point — tested via supertest
    '!src/db/schema.sql',
  ],
  coverageReporters: ['text', 'lcov'],
};
