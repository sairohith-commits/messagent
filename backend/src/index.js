// Fastify server entry point — registers plugins, DB/Redis connections, routes, and BullMQ workers

'use strict';

require('dotenv').config();

const Fastify  = require('fastify');
const cors     = require('@fastify/cors');
const jwt      = require('@fastify/jwt');
const ioredis  = require('ioredis');

const { connect: connectDB } = require('./db');
const authPlugin             = require('./middleware/auth');
const rateLimitPlugin        = require('./middleware/rateLimit');
const checkSubscriptionPlugin = require('./middleware/checkSubscription');

const pkg                = require('../package.json');
const requestLogger      = require('./middleware/requestLogger');

const authRoutes         = require('./routes/auth');
const agentRoutes        = require('./routes/agent');
const messageRoutes      = require('./routes/messages');
const logRoutes          = require('./routes/logs');
const gmailRoutes        = require('./routes/gmail');
const whatsappRoutes     = require('./routes/whatsapp');
const instagramRoutes    = require('./routes/instagram');
const subscriptionRoutes = require('./routes/subscription');
const modelRoutes        = require('./routes/model');
const summaryRoutes       = require('./routes/summary');
const repliesRoutes       = require('./routes/replies');
const notificationRoutes  = require('./routes/notifications');

const { startCronJobs }      = require('./cron');
const { autoReconnectSessions: waReconnect }  = require('./services/whatsappBaileys');
const igPersonal                              = require('./services/instagramPersonal');

const PORT = Number(process.env.PORT ?? 4000);

async function build() {
  const fastify = Fastify({ logger: true });

  // ─── CORS ────────────────────────────────────────────────────────────────────
  await fastify.register(cors, {
    origin:  process.env.ALLOWED_ORIGINS?.split(',') ?? [
      'http://localhost:3000',
      'http://localhost:5173', // Vite dev server
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });

  // ─── JWT ─────────────────────────────────────────────────────────────────────
  await fastify.register(jwt, {
    secret: process.env.JWT_SECRET,
  });

  // ─── REDIS (shared ioredis instance for rate limiting + BullMQ) ──────────────
  const redis = new ioredis({
    host:        process.env.REDIS_HOST ?? 'localhost',
    port:        Number(process.env.REDIS_PORT ?? 6379),
    password:    process.env.REDIS_PASSWORD ?? undefined,
    lazyConnect: true,
  });
  await redis.connect();
  fastify.decorate('redis', redis);
  fastify.log.info('[redis] Connected');

  // Give instagramPersonal service access to Redis for session persistence
  igPersonal.setRedis(redis);

  // ─── CUSTOM PLUGINS ──────────────────────────────────────────────────────────
  await fastify.register(requestLogger);
  await fastify.register(authPlugin);
  await fastify.register(rateLimitPlugin);
  await fastify.register(checkSubscriptionPlugin);

  // ─── DATABASE ────────────────────────────────────────────────────────────────
  // Retry up to 5 times with 3 s backoff — Railway Postgres can be slow to accept
  // connections on cold starts or immediately after a deploy.
  {
    const MAX_ATTEMPTS = 5;
    const DELAY_MS     = 3000;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await connectDB();
        break;
      } catch (err) {
        if (attempt === MAX_ATTEMPTS) throw err;
        fastify.log.warn(`[db] Connection attempt ${attempt}/${MAX_ATTEMPTS} failed (${err.message}) — retrying in ${DELAY_MS / 1000}s`);
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }
    }
  }

  // ─── ROUTES ──────────────────────────────────────────────────────────────────
  await fastify.register(authRoutes,         { prefix: '/auth'         });
  await fastify.register(agentRoutes,        { prefix: ''              });
  await fastify.register(messageRoutes,      { prefix: '/messages'     });
  await fastify.register(logRoutes,          { prefix: '/logs'         });
  await fastify.register(gmailRoutes,        { prefix: ''              }); // /gmail/*
  await fastify.register(whatsappRoutes,     { prefix: ''              }); // /whatsapp/*
  await fastify.register(instagramRoutes,    { prefix: ''              }); // /instagram/*
  await fastify.register(subscriptionRoutes, { prefix: '/subscription' });
  await fastify.register(modelRoutes,        { prefix: ''              }); // /model/version
  await fastify.register(summaryRoutes,      { prefix: '/summary'       });
  await fastify.register(repliesRoutes,      { prefix: '/replies'       });
  await fastify.register(notificationRoutes, { prefix: '/notifications' });

  // Health check — no auth required; used by Railway, Docker, and the CI pipeline
  fastify.get('/health', async () => ({
    status:    'ok',
    version:   pkg.version,
    uptime:    Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  }));

  // ─── GLOBAL ERROR HANDLER ────────────────────────────────────────────────────
  fastify.setErrorHandler((err, request, reply) => {
    fastify.log.error(err);
    const status = err.statusCode ?? 500;
    reply.code(status).send({ error: err.message ?? 'Internal server error' });
  });

  return fastify;
}

async function start() {
  // Start BullMQ workers — importing them registers the workers with the queue
  require('./workers/messageWorker');
  require('./workers/replyWorker');

  // Start cron jobs (Gmail watch renewal, etc.)
  startCronJobs();

  // Restore persistent WhatsApp + Instagram personal sessions from previous run
  waReconnect().catch((e) => console.error('[startup] WA reconnect error:', e.message));
  igPersonal.autoReconnectSessions().catch((e) => console.error('[startup] IG reconnect error:', e.message));

  const fastify = await build();

  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    fastify.log.info(`[server] Listening on port ${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

// Export build() so test files can create the Fastify instance without starting the server
module.exports = { build };

// Only call start() when this file is the entry point (not when required by tests)
if (require.main === module) {
  start();
}
