// Push notification service — structured for Expo Push Notifications.
// Currently logs notifications instead of sending them.
// Replace the placeholder with expo-server-sdk when push tokens are collected from the mobile app.

'use strict';

const logger = require('./logger');

// TODO: install `expo-server-sdk` and store Expo push tokens in the users table.
// const { Expo } = require('expo-server-sdk');
// const expo = new Expo();

/**
 * Send a push notification to a specific user.
 * Currently a structured placeholder — all arguments are validated and logged.
 *
 * @param {string} userId  Messagent user UUID
 * @param {string} title   Notification title (short, shown in the lock screen)
 * @param {string} body    Notification body text
 * @param {object} [data]  Optional key-value data passed to the app's notification handler
 * @returns {Promise<void>}
 */
async function sendPushNotification(userId, title, body, data = {}) {
  // TODO: look up the user's Expo push token from the DB
  // const { rows } = await query('SELECT expo_push_token FROM users WHERE id = $1', [userId]);
  // const pushToken = rows[0]?.expo_push_token;

  // TODO: validate token and send via Expo SDK
  // if (Expo.isExpoPushToken(pushToken)) {
  //   await expo.sendPushNotificationsAsync([{
  //     to: pushToken, title, body, data, sound: 'default',
  //   }]);
  // }

  logger.info(
    { userId, title, body, data },
    '[notificationService] push notification queued (placeholder — not yet sent)',
  );
}

/**
 * Notify the user that the AI replied on their behalf.
 *
 * @param {string} userId
 * @param {string} platform   e.g. 'gmail', 'whatsapp'
 * @param {string} contact    Sender the AI replied to
 */
async function notifyAiReplied(userId, platform, contact) {
  await sendPushNotification(
    userId,
    'AI replied for you',
    `Replied to ${contact} on ${platform}`,
    { type: 'ai_reply', platform, contact },
  );
}

/**
 * Notify the user that a message needs manual review.
 *
 * @param {string} userId
 * @param {string} platform
 * @param {string} contact
 */
async function notifyReviewNeeded(userId, platform, contact) {
  await sendPushNotification(
    userId,
    'Message needs your attention',
    `New message from ${contact} on ${platform}`,
    { type: 'review_needed', platform, contact },
  );
}

/**
 * Notify the user that a model update is available.
 *
 * @param {string} userId
 * @param {string} newVersion  e.g. "gemma-2b-it-q4-v1.3"
 */
async function notifyModelUpdateAvailable(userId, newVersion) {
  await sendPushNotification(
    userId,
    'AI model update available',
    `Version ${newVersion} is ready to download`,
    { type: 'model_update', version: newVersion },
  );
}

module.exports = {
  sendPushNotification,
  notifyAiReplied,
  notifyReviewNeeded,
  notifyModelUpdateAvailable,
};
