// Instagram personal DM integration via instagram-private-api.
// Uses username/password login (unofficial API) — session persisted to Redis.
// Polls inbox every POLL_INTERVAL_MS for new threads; processes unseen messages.
//
// NOTE: Unofficial API. Instagram may require 2FA or challenge completion on first
// login. If a challenge is required, the connect flow returns { needsChallenge, challengeType }
// and the frontend must call /instagram/personal/verify-challenge with the code.

'use strict';

const { IgApiClient, IgCheckpointError, IgLoginRequiredError } = require('instagram-private-api');
const { query }         = require('../db');
const { saveMessage }   = require('../models/message');
const { addMessageJob } = require('../queues/messageQueue');

const POLL_INTERVAL_MS = 30_000; // check for new DMs every 30 s

// userId → { client, status, phoneNumber/username, pollTimer, seenMsgIds }
const sessions = new Map();

// ─── SESSION PERSISTENCE (Redis) ─────────────────────────────────────────────
// We store the serialised session state in Redis so it survives server restarts.

let _redis = null;

function setRedis(redis) {
  _redis = redis;
}

async function saveSession(userId, state) {
  if (!_redis) return;
  await _redis.set(`ig:session:${userId}`, JSON.stringify(state), 'EX', 60 * 60 * 24 * 30); // 30 days
}

async function loadSession(userId) {
  if (!_redis) return null;
  const raw = await _redis.get(`ig:session:${userId}`);
  return raw ? JSON.parse(raw) : null;
}

async function deleteSession(userId) {
  if (!_redis) return;
  await _redis.del(`ig:session:${userId}`);
}

// ─── PUBLIC: state ────────────────────────────────────────────────────────────

function getPersonalState(userId) {
  const s = sessions.get(userId);
  if (!s) return { status: 'disconnected', username: null };
  return { status: s.status, username: s.username };
}

// ─── PRIVATE: build client ────────────────────────────────────────────────────

function createClient() {
  const ig = new IgApiClient();
  ig.state.generateDevice(String(Date.now())); // stable device fingerprint
  return ig;
}

// ─── PUBLIC: connect (start login flow) ──────────────────────────────────────

async function connectInstagram(userId, username, password) {
  // Tear down any existing session
  await disconnectInstagram(userId);

  const ig = createClient();
  ig.state.generateDevice(username); // device tied to username for consistency

  const session = {
    status:     'connecting',
    username,
    client:     ig,
    pollTimer:  null,
    seenMsgIds: new Set(),
    // Stored for challenge resolution
    _pendingChallenge: null,
  };
  sessions.set(userId, session);

  try {
    await ig.simulate.preLoginFlow();
    await ig.account.login(username, password);
    await ig.simulate.postLoginFlow();

    // Persist session state to Redis
    const serialized = await ig.state.serialize();
    delete serialized.constants; // not needed
    await saveSession(userId, { username, state: serialized });

    session.status = 'connected';
    startPolling(userId);

    console.info(`[instagram-personal] Connected for user ${userId} (@${username})`);
    return { success: true };
  } catch (err) {
    if (err instanceof IgCheckpointError) {
      // Instagram requires a challenge (email/SMS code)
      session.status             = 'challenge_required';
      session._pendingChallenge  = ig.challenge;

      await ig.challenge.auto(true); // request the challenge code
      const challengeType = ig.challenge.checkpointResponse?.step_name ?? 'unknown';

      console.info(`[instagram-personal] Challenge required for ${userId} — type: ${challengeType}`);
      return { needsChallenge: true, challengeType };
    }
    sessions.delete(userId);
    throw err;
  }
}

// ─── PUBLIC: resolve 2FA / challenge ─────────────────────────────────────────

async function verifyChallenge(userId, code) {
  const session = sessions.get(userId);
  if (!session || session.status !== 'challenge_required') {
    throw new Error('[instagram-personal] No pending challenge for this user');
  }

  await session._pendingChallenge.sendSecurityCode(code);
  session._pendingChallenge = null;
  session.status = 'connected';

  const serialized = await session.client.state.serialize();
  delete serialized.constants;
  await saveSession(userId, { username: session.username, state: serialized });

  startPolling(userId);
  console.info(`[instagram-personal] Challenge verified for user ${userId}`);
  return { success: true };
}

// ─── PUBLIC: disconnect ───────────────────────────────────────────────────────

async function disconnectInstagram(userId) {
  const s = sessions.get(userId);
  if (!s) return;

  if (s.pollTimer) clearInterval(s.pollTimer);
  sessions.delete(userId);
  await deleteSession(userId);

  console.info(`[instagram-personal] Disconnected user ${userId}`);
}

// ─── PUBLIC: send DM ─────────────────────────────────────────────────────────

async function sendInstagramReply(userId, threadId, text) {
  const s = sessions.get(userId);
  if (!s || s.status !== 'connected') {
    throw new Error(`[instagram-personal] No active connection for user ${userId}`);
  }
  const thread = s.client.entity.directThread(threadId);
  await thread.broadcastText(text);
  console.info(`[instagram-personal] Sent reply to thread ${threadId} for user ${userId}`);
}

// ─── PRIVATE: polling loop ────────────────────────────────────────────────────

function startPolling(userId) {
  const s = sessions.get(userId);
  if (!s) return;
  if (s.pollTimer) clearInterval(s.pollTimer);

  // Run once immediately, then on interval
  pollInbox(userId).catch(console.error);
  s.pollTimer = setInterval(() => pollInbox(userId).catch(console.error), POLL_INTERVAL_MS);
}

async function pollInbox(userId) {
  const s = sessions.get(userId);
  if (!s || s.status !== 'connected') return;

  try {
    const inboxFeed = s.client.feed.directInbox();
    const threads   = await inboxFeed.items();

    for (const thread of threads) {
      const lastMsg = thread.items?.[0];
      if (!lastMsg) continue;

      // Skip messages we sent ourselves
      if (lastMsg.user_id === s.client.state.cookieUserId) continue;

      const msgId = lastMsg.item_id;
      if (s.seenMsgIds.has(msgId)) continue;
      s.seenMsgIds.add(msgId);

      const text = lastMsg.text ?? lastMsg.like ?? '';
      if (!text) continue;

      const fromContact = String(lastMsg.user_id);
      const threadId    = thread.thread_id;

      try {
        const savedMsg = await saveMessage(userId, 'instagram', fromContact, text, {
          instagramThreadId: threadId,
          instagramMsgId:    msgId,
        });

        await addMessageJob({
          messageId:   savedMsg.id,
          userId,
          platform:    'instagram',
          fromContact,
          body:        text,
          threadId,    // thread_id used by sendInstagramReply
        });

        console.info(`[instagram-personal] Enqueued DM from ${fromContact} for user ${userId}`);
      } catch (err) {
        console.error(`[instagram-personal] Error processing DM ${msgId}:`, err.message);
      }
    }
  } catch (err) {
    if (err instanceof IgLoginRequiredError) {
      console.warn(`[instagram-personal] Session expired for user ${userId} — disconnecting`);
      await disconnectInstagram(userId);
    } else {
      console.error(`[instagram-personal] Poll error for user ${userId}:`, err.message);
    }
  }
}

// ─── PUBLIC: restore sessions on startup ─────────────────────────────────────

async function autoReconnectSessions() {
  if (!_redis) return;

  // Scan for all ig:session:* keys
  const keys = await _redis.keys('ig:session:*');
  for (const key of keys) {
    const userId = key.replace('ig:session:', '');
    const saved  = await loadSession(userId);
    if (!saved) continue;

    const ig = createClient();
    ig.state.generateDevice(saved.username);
    try {
      await ig.state.deserialize(saved.state);
      const session = {
        status:     'connected',
        username:   saved.username,
        client:     ig,
        pollTimer:  null,
        seenMsgIds: new Set(),
        _pendingChallenge: null,
      };
      sessions.set(userId, session);
      startPolling(userId);
      console.info(`[instagram-personal] Restored session for user ${userId} (@${saved.username})`);
    } catch (err) {
      console.error(`[instagram-personal] Failed to restore session for ${userId}:`, err.message);
      await deleteSession(userId);
    }
  }
}

module.exports = {
  setRedis,
  connectInstagram,
  verifyChallenge,
  disconnectInstagram,
  sendInstagramReply,
  getPersonalState,
  autoReconnectSessions,
};
