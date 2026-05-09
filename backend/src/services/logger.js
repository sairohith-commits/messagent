// Structured JSON logger — wraps pino with sensible defaults.
// Import this instead of using console.log anywhere in services.

'use strict';

const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',

  // ISO timestamps in every log line
  timestamp: pino.stdTimeFunctions.isoTime,

  // Tag every log line with the service name for log aggregation (Datadog, Logtail, etc.)
  base: { service: 'messagent-backend' },

  // In development, pretty-print logs. In production, output raw JSON for the log shipper.
  ...(process.env.NODE_ENV === 'development' && {
    transport: {
      target:  'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname,service' },
    },
  }),
});

module.exports = logger;
