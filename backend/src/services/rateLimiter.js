// Redis-backed rate limiter — prevents replying to the same sender more than once per 24 h.
// Fail-open: if Redis is unavailable, processing continues rather than blocking all replies.

'use strict';

const Redis = require('ioredis');

let _client = null;

function getClient() {
  if (!_client) {
    _client = new Redis({
      host:             process.env.REDIS_HOST ?? 'localhost',
      port:             Number(process.env.REDIS_PORT ?? 6379),
      password:         process.env.REDIS_PASSWORD || undefined,
      lazyConnect:      true,
      enableReadyCheck: false,
      maxRetriesPerRequest: 1,
    });
    _client.on('error', (err) => console.error('[rateLimiter] Redis error:', err.message));
  }
  return _client;
}

const WINDOW_SECONDS = 24 * 60 * 60; // 24 h

/**
 * Build a Redis key that uniquely identifies a sender within a platform for a given user.
 * The contact is lowercased and sanitised so special characters don't break the key.
 */
function makeKey(userId, platform, fromContact) {
  const safe = (fromContact ?? '').toLowerCase().replace(/\s+/g, '').replace(/[^\w@._+:-]/g, '');
  return `reply_limit:${userId}:${platform}:${safe}`;
}

/**
 * Returns true if we have already replied to this sender in the last 24 h.
 * On Redis failure returns false (fail-open — do not block processing).
 *
 * @param {string} userId
 * @param {string} platform
 * @param {string} fromContact
 * @returns {Promise<boolean>}
 */
async function isRateLimited(userId, platform, fromContact) {
  try {
    const val = await getClient().get(makeKey(userId, platform, fromContact));
    return val !== null;
  } catch (err) {
    console.warn('[rateLimiter] Check failed — allowing through:', err.message);
    return false;
  }
}

/**
 * Record that we replied to this sender.
 * The key expires automatically after 24 h so no manual cleanup is needed.
 *
 * @param {string} userId
 * @param {string} platform
 * @param {string} fromContact
 */
async function recordReply(userId, platform, fromContact) {
  try {
    await getClient().set(makeKey(userId, platform, fromContact), '1', 'EX', WINDOW_SECONDS);
  } catch (err) {
    console.warn('[rateLimiter] Record failed:', err.message);
  }
}

module.exports = { isRateLimited, recordReply };
