// BullMQ worker — consumes 'outgoing-replies' queue, calls the agent service,
// dispatches the reply via the correct platform service, and writes a reply_log row

'use strict';

const { Worker } = require('bullmq');
const { redisConnection } = require('../queues/messageQueue');
const { generateReply } = require('../services/agentService');
const { updateMessageStatus } = require('../models/message');
const { saveSuggestedReply } = require('../models/suggestedReply');
const { notifyPendingReply } = require('../services/pushService');
const { recordReply }        = require('../services/rateLimiter');
const { query }              = require('../db');

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
/**
 * Truncate reply text at the last sentence boundary before maxChars.
 * Prevents runaway replies from exceeding the cost budget.
 */
function truncateAtSentence(text, maxChars = 500) {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const lastBoundary = Math.max(
    cut.lastIndexOf('. '),
    cut.lastIndexOf('! '),
    cut.lastIndexOf('? '),
    cut.lastIndexOf('.\n'),
  );
  // Only truncate at a sentence boundary if it's in the second half of the window
  if (lastBoundary > maxChars * 0.5) {
    return cut.slice(0, lastBoundary + 1).trim();
  }
  return cut.trimEnd() + '…'; // ellipsis if no good boundary found
}

/**
 * Persist a reply log entry.
 */
async function saveReplyLog(userId, messageId, replyBody, modelUsed, sentAt, inputTokens, outputTokens, platformMessageId) {
  const sql = `
    INSERT INTO reply_logs
      (user_id, message_id, reply_body, model_used, sent_at, input_tokens, output_tokens, platform_message_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id
  `;
  const { rows } = await query(sql, [
    userId, messageId, replyBody, modelUsed, sentAt,
    inputTokens ?? 0, outputTokens ?? 0, platformMessageId ?? null,
  ]);
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
/**
 * Dispatch the generated reply via the correct platform service.
 * Returns { sentAt, platformMessageId } on success; sentAt is null if platform not integrated.
 */
async function dispatchReply(platform, userId, fromContact, replyBody, threadId) {
  switch (platform) {
    case 'gmail': {
      if (!threadId) {
        console.error('[replyWorker] Gmail reply missing threadId — cannot send');
        return { sentAt: null, platformMessageId: null };
      }
      const gmailMsgId = await gmail.sendReply(userId, threadId, fromContact, replyBody);
      return { sentAt: new Date(), platformMessageId: gmailMsgId };
    }

    case 'whatsapp':
      await whatsapp.sendReply(userId, fromContact, replyBody, threadId);
      return { sentAt: new Date(), platformMessageId: null };

    case 'instagram': {
      const igPersonalState = instagramPersonal.getPersonalState(userId);
      if (igPersonalState.status === 'connected' && threadId) {
        await instagramPersonal.sendInstagramReply(userId, threadId, replyBody);
      } else {
        await instagram.sendReply(userId, fromContact, replyBody);
      }
      return { sentAt: new Date(), platformMessageId: null };
    }

    default:
      console.warn(`[replyWorker] No send implementation for platform: ${platform}`);
      return { sentAt: null, platformMessageId: null };
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

    // 2. Generate the reply text (returns { reply, inputTokens, outputTokens })
    const { reply: rawReply, inputTokens, outputTokens } = await generateReply({
      message:          body,
      mode,
      model,
      userName,
      userInstructions,
    });

    // 2a. Enforce 500-char hard cap — truncate at last sentence boundary
    const replyBody = truncateAtSentence(rawReply, 500);
    if (replyBody.length < rawReply.length) {
      console.info(`[replyWorker] Reply truncated from ${rawReply.length} to ${replyBody.length} chars`);
    }

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
    const { sentAt, platformMessageId } = await dispatchReply(platform, userId, fromContact, replyBody, threadId);
    await updateMessageStatus(messageId, 'replied');

    // 5. Record rate limit so this sender is blocked for 24h (cross-platform safety net)
    await recordReply(userId, platform, fromContact);

    // 6. Persist reply log with token usage and platform message ID
    await saveReplyLog(userId, messageId, replyBody, model, sentAt, inputTokens, outputTokens, platformMessageId);

    console.info(
      `[replyWorker] Processed msg ${messageId} via ${model} on ${platform} ` +
      `(in: ${inputTokens} out: ${outputTokens} tokens)` +
      (sentAt ? '' : ' — draft only, platform not yet integrated'),
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
