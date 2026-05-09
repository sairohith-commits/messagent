'use strict';

// Expo Push Notification service.
// Sends push messages to registered mobile devices via the Expo push API.
// No SDK needed — Expo accepts plain HTTPS POST requests.

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Send a single push notification to an Expo device token.
 *
 * @param {string} expoPushToken  e.g. "ExponentPushToken[xxxxxx]"
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.body
 * @param {object} [opts.data]    Extra payload (accessible in the app)
 * @returns {Promise<void>}
 */
async function sendPushNotification(expoPushToken, { title, body, data = {} }) {
  if (!expoPushToken) return;

  // Expo validates the token format — ignore obviously invalid tokens
  if (!expoPushToken.startsWith('ExponentPushToken[') && !expoPushToken.startsWith('ExpoPushToken[')) {
    console.warn('[pushService] Invalid push token format:', expoPushToken.slice(0, 30));
    return;
  }

  const payload = {
    to:    expoPushToken,
    sound: 'default',
    title,
    body,
    data,
  };

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body:    JSON.stringify(payload),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.data?.status === 'error') {
      console.error('[pushService] Push failed:', json?.data?.message ?? `HTTP ${res.status}`);
    } else {
      console.info(`[pushService] Push sent to ${expoPushToken.slice(0, 30)}…`);
    }
  } catch (err) {
    console.error('[pushService] Network error sending push:', err.message);
  }
}

/**
 * Notify a user that a new suggested reply is waiting for review.
 *
 * @param {string} expoPushToken
 * @param {string} platform        'gmail' | 'whatsapp' | 'instagram'
 * @param {string} fromContact     Sender identifier
 */
async function notifyPendingReply(expoPushToken, platform, fromContact) {
  const platformLabel = { gmail: 'Gmail', whatsapp: 'WhatsApp', instagram: 'Instagram' }[platform] ?? platform;
  await sendPushNotification(expoPushToken, {
    title: `New reply ready — ${platformLabel}`,
    body:  `AI drafted a reply to ${fromContact}. Tap to review.`,
    data:  { screen: 'PendingReplies', platform },
  });
}

/**
 * Notify a user that their daily digest email has been sent.
 *
 * @param {string} expoPushToken
 * @param {number} count  Number of conversations summarized
 */
async function notifyDailyDigest(expoPushToken, count) {
  await sendPushNotification(expoPushToken, {
    title: 'Your daily digest is ready',
    body:  `${count} conversation${count !== 1 ? 's' : ''} summarized. Check your inbox.`,
    data:  { screen: 'Summary' },
  });
}

module.exports = { sendPushNotification, notifyPendingReply, notifyDailyDigest };
