// BullMQ worker — consumes 'incoming-messages' queue, checks platform config + schedule,
// then either enqueues a reply or marks the message as skipped

'use strict';

const { Worker } = require('bullmq');
const { redisConnection } = require('../queues/messageQueue');
const { addReplyJob } = require('../queues/replyQueue');
const { updateMessageStatus } = require('../models/message');
const { getUserById }         = require('../models/user');
const { query }               = require('../db');
const { isRateLimited }       = require('../services/rateLimiter');

// ─── AUTOMATED EMAIL FILTER (second-pass safety check) ───────────────────────
// Primary filtering happens in gmail.js; this catches anything that slipped through.

// Keep in sync with gmail.js — this second-pass filter catches anything that slipped through
const SKIP_FROM_PATTERNS = [
  'noreply', 'no-reply', 'donotreply', 'do-not-reply',
  'mailer-daemon', 'postmaster', 'automated', 'auto-confirm',
  'notifications', 'bounce', 'no.reply', 'do.not.reply',
];

const SKIP_DOMAINS = [
  'mailchimp.com', 'sendgrid.net', 'amazonses.com', 'exacttarget.com',
  'marketo.com', 'hubspot.com', 'klaviyo.com', 'constantcontact.com',
  'mailgun.org', 'sparkpost.com', 'postmarkapp.com', 'mandrill.com',
];

const SKIP_SUBJECT_PREFIXES = [
  'auto:', 'auto-reply', 'automated reply', 'automated response',
  '[automated]', 'out of office', 'delivery status', 'delivery failure',
  'mail delivery', 'returned mail', 'undeliverable', 'undelivered mail',
  'mailer-daemon', 'failure notice', 'delivery notification',
];

/**
 * Returns true if the job should be skipped (automated / bulk sender).
 * Mirrors the logic in gmail.js#shouldSkipEmail but operates on queued job data.
 */
function isAutomatedSender(fromContact, subject) {
  const emailLower   = (fromContact ?? '').toLowerCase();
  const subjectLower = (subject ?? '').toLowerCase();

  if (SKIP_FROM_PATTERNS.some((p) => emailLower.includes(p))) return true;

  const domain = emailLower.split('@')[1] ?? '';
  if (SKIP_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) return true;

  if (SKIP_SUBJECT_PREFIXES.some((p) => subjectLower.startsWith(p))) return true;

  return false;
}

/**
 * Fetch the platform config row for a specific user + platform.
 * Returns null if none exists (treat as disabled).
 *
 * @param {string} userId
 * @param {string} platform
 * @returns {Promise<object|null>}
 */
async function getPlatformConfig(userId, platform) {
  const sql = `
    SELECT enabled, mode, reply_mode, schedule_start, schedule_end, user_instructions
    FROM   platform_configs
    WHERE  user_id  = $1
      AND  platform = $2
  `;
  const { rows } = await query(sql, [userId, platform]);
  return rows[0] ?? null;
}

/**
 * Returns true if the current UTC time falls within [start, end].
 * If either boundary is null the platform is always active.
 *
 * @param {string|null} start  "HH:MM" e.g. "09:00"
 * @param {string|null} end    "HH:MM" e.g. "18:00"
 */
function isWithinSchedule(start, end) {
  if (!start || !end) return true;

  const now = new Date();
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);

  const nowMinutes   = now.getUTCHours() * 60 + now.getUTCMinutes();
  const startMinutes = sh * 60 + sm;
  const endMinutes   = eh * 60 + em;

  // Handle schedules that wrap midnight (e.g. 22:00 → 06:00)
  if (startMinutes <= endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
  }
  return nowMinutes >= startMinutes || nowMinutes <= endMinutes;
}

const worker = new Worker(
  'incoming-messages',
  async (job) => {
    // threadId is present for Gmail jobs — passed through to the reply worker
    // so it can call gmail.sendReply() with the correct thread context
    const { messageId, userId, platform, fromContact, body, threadId = null, subject = null } = job.data;

    // 1. Second-pass automated-sender filter (primary filter is in gmail.js)
    if (isAutomatedSender(fromContact, subject)) {
      await updateMessageStatus(messageId, 'skipped');
      console.info(`[messageWorker] Skipped automated sender: ${fromContact}`);
      return;
    }

    // 2. Rate-limit check — skip if we already replied to this sender in the last 24h
    //    (catches auto-responder loops on WhatsApp/Instagram where In-Reply-To isn't available)
    if (await isRateLimited(userId, platform, fromContact)) {
      await updateMessageStatus(messageId, 'skipped');
      console.info(`[messageWorker] Rate-limited: already replied to ${fromContact} within 24h`);
      return;
    }

    // 3. Load platform config
    const config = await getPlatformConfig(userId, platform);

    if (!config || !config.enabled) {
      await updateMessageStatus(messageId, 'skipped');
      console.info(`[messageWorker] Skipped msg ${messageId} — platform ${platform} disabled`);
      return;
    }

    // 4. Check schedule window
    if (!isWithinSchedule(config.schedule_start, config.schedule_end)) {
      await updateMessageStatus(messageId, 'skipped');
      console.info(`[messageWorker] Skipped msg ${messageId} — outside schedule`);
      return;
    }

    // 4. Load user for tier + name
    const user = await getUserById(userId);
    if (!user) {
      await updateMessageStatus(messageId, 'failed');
      return;
    }

    // 5. Hand off to the reply queue
    await addReplyJob({
      messageId,
      userId,
      platform,
      fromContact,
      body,
      threadId,         // null for non-Gmail platforms; required by gmail.sendReply()
      mode:             config.mode,
      replyMode:        config.reply_mode ?? 'auto',
      tier:             user.tier,
      userInstructions: config.user_instructions ?? null,
      userName:         user.name,
    });

    console.info(`[messageWorker] Enqueued reply job for msg ${messageId}`);
  },
  { connection: redisConnection, concurrency: 5 }
);

worker.on('failed', (job, err) => {
  console.error(`[messageWorker] Job ${job?.id} failed:`, err.message);
});

module.exports = worker;
