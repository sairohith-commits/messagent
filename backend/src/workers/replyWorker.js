// BullMQ worker — consumes 'outgoing-replies' queue, calls the agent service,
// dispatches the reply via the correct platform service, and writes a reply_log row

'use strict';

const { Worker } = require('bullmq');
const { redisConnection } = require('../queues/messageQueue');
const { generateReply } = require('../services/agentService');
const { updateMessageStatus } = require('../models/message');
const { saveSuggestedReply } = require('../models/suggestedReply');
const { notifyPendingReply } = require('../services/pushService');
const { query } = require('../db');

const gmail              = require('../services/gmail');
const whatsapp           = require('../services/whatsapp');
const instagram          = require('../services/instagram');
const instagramPersonal  = require('../services/instagramPersonal');

/**
 * Persist a reply log entry and return its id.
 *
 * @param {string}    userId
 * @param {string}    messageId
 * @param {string}    replyBody
 * @param {string}    modelUsed
 * @param {Date|null} sentAt
 * @returns {Promise<string>} New reply_log id
 */
async function saveReplyLog(userId, messageId, replyBody, modelUsed, sentAt) {
  const sql = `
    INSERT INTO reply_logs (user_id, message_id, reply_body, model_used, sent_at)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id
  `;
  const { rows } = await query(sql, [userId, messageId, replyBody, modelUsed, sentAt]);
  return rows[0].id;
}

/**
 * Dispatch the generated reply via the correct platform service.
 * Returns the sent timestamp on success, or null if the platform isn't integrated yet.
 *
 * @param {string}      platform
 * @param {string}      userId
 * @param {string}      fromContact   Sender to reply to
 * @param {string}      replyBody     Generated reply text
 * @param {string|null} threadId      Gmail thread ID (null for non-Gmail platforms)
 * @returns {Promise<Date|null>}
 */
async function dispatchReply(platform, userId, fromContact, replyBody, threadId) {
  switch (platform) {
    case 'gmail':
      if (!threadId) {
        console.error('[replyWorker] Gmail reply missing threadId — cannot send');
        return null;
      }
      // gmail.sendReply handles token refresh internally
      await gmail.sendReply(userId, threadId, fromContact, replyBody);
      return new Date();

    case 'whatsapp':
      // threadId is the WhatsApp JID when using Baileys personal; null for Business API
      await whatsapp.sendReply(userId, fromContact, replyBody, threadId);
      return new Date();

    case 'instagram': {
      // Route to personal (polling) if an active session exists, else Business API
      const igPersonalState = instagramPersonal.getPersonalState(userId);
      if (igPersonalState.status === 'connected' && threadId) {
        await instagramPersonal.sendInstagramReply(userId, threadId, replyBody);
      } else {
        await instagram.sendReply(userId, fromContact, replyBody);
      }
      return new Date();
    }

    default:
      // instagram, telegram — placeholder until their services are integrated
      console.warn(`[replyWorker] No send implementation for platform: ${platform}`);
      return null;
  }
}

const worker = new Worker(
  'outgoing-replies',
  async (job) => {
    const {
      messageId, userId, platform, fromContact,
      body, threadId, mode, replyMode = 'auto', tier, userInstructions, userName,
    } = job.data;

    // 1. Choose model based on tier
    const model = (tier === 'free') ? 'gemma' : 'claude';

    // 2. Generate the reply text
    const replyBody = await generateReply({
      message:          body,
      mode,
      model,
      userName,
      userInstructions,
    });

    // 3. Suggest mode — save for human review, do not dispatch
    if (replyMode === 'suggest') {
      await saveSuggestedReply({
        userId,
        messageId,
        platform,
        threadId: threadId ?? null,
        fromContact,
        originalBody: body,
        suggestedReply: replyBody,
      });
      await updateMessageStatus(messageId, 'pending_approval');

      // Fire push notification if the user has a registered device
      const { rows: userRows } = await query('SELECT expo_push_token FROM users WHERE id = $1', [userId]);
      const pushToken = userRows[0]?.expo_push_token;
      if (pushToken) {
        notifyPendingReply(pushToken, platform, fromContact).catch(() => {});
      }

      console.info(`[replyWorker] Saved suggested reply for msg ${messageId} (awaiting human approval)`);
      return;
    }

    // 4. Auto mode — dispatch immediately
    const sentAt = await dispatchReply(platform, userId, fromContact, replyBody, threadId);
    await updateMessageStatus(messageId, 'replied');

    // 5. Persist reply log
    await saveReplyLog(userId, messageId, replyBody, model, sentAt);

    console.info(
      `[replyWorker] Processed msg ${messageId} via ${model} on ${platform}` +
      (sentAt ? '' : ' (draft only — platform not yet integrated)'),
    );
  },
  { connection: redisConnection, concurrency: 3 }
);

worker.on('failed', async (job, err) => {
  console.error(`[replyWorker] Job ${job?.id} failed:`, err.message);
  if (job?.data?.messageId) {
    await updateMessageStatus(job.data.messageId, 'failed').catch(() => {});
  }
});

module.exports = worker;
