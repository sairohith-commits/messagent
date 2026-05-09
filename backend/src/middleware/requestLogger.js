// Request logger Fastify plugin — attaches a requestId and logs every request/response.

'use strict';

const { randomUUID }   = require('crypto');
const fp               = require('fastify-plugin');
const logger           = require('../services/logger');

/**
 * Adds two lifecycle hooks:
 *  - onRequest:  generates a requestId, records start time
 *  - onResponse: logs method, url, statusCode, and response time
 *
 * The requestId is attached to `request.requestId` so route handlers can
 * include it in their own log lines for correlation.
 */
async function requestLoggerPlugin(fastify) {
  fastify.addHook('onRequest', async (request) => {
    request.requestId = randomUUID();
    request.startTime = Date.now();

    logger.info(
      {
        requestId: request.requestId,
        method:    request.method,
        url:       request.url,
        ip:        request.ip,
      },
      'incoming request',
    );
  });

  fastify.addHook('onResponse', async (request, reply) => {
    const responseTime = Date.now() - (request.startTime ?? Date.now());

    logger.info(
      {
        requestId:    request.requestId,
        method:       request.method,
        url:          request.url,
        statusCode:   reply.statusCode,
        responseTime: `${responseTime}ms`,
        userId:       request.user?.id ?? null,
      },
      'request completed',
    );
  });

  // Surface requestId in every error response so clients can reference it in support requests
  fastify.addHook('onError', async (request, reply, error) => {
    logger.error(
      {
        requestId: request.requestId,
        method:    request.method,
        url:       request.url,
        error:     error.message,
        stack:     error.stack,
        userId:    request.user?.id ?? null,
      },
      'request error',
    );
  });
}

module.exports = fp(requestLoggerPlugin);
