// Message model — persists incoming messages and exposes status + retrieval helpers

'use strict';

const { query } = require('../db');

/**
 * Insert a new incoming message record.
 *
 * @param {string} userId
 * @param {string} platform      'gmail' | 'whatsapp' | 'instagram' | 'telegram'
 * @param {string} fromContact   Sender identifier (email, phone, username…)
 * @param {string} body          Raw message text
 * @param {{ threadId?: string, subject?: string }} [meta]
 *   Optional platform-specific metadata:
 *   - threadId — Gmail thread ID (used when sending the reply back)
 *   - subject  — Email subject line
 * @returns {Promise<object>} The created message row
 */
/**
 * Insert a new incoming message record.
 * Returns null (instead of throwing) if the platform_message_id is already in the DB,
 * allowing callers to detect and skip duplicate webhook deliveries.
 *
 * @param {string} userId
 * @param {string} platform
 * @param {string} fromContact
 * @param {string} body
 * @param {{ threadId?: string, subject?: string, platformMessageId?: string }} [meta]
 * @returns {Promise<object|null>} The created row, or null on duplicate
 */
async function saveMessage(userId, platform, fromContact, body, meta = {}) {
  const { threadId = null, subject = null, platformMessageId = null } = meta;

  // Deduplication: if a platform-native message ID is provided, check for an existing row
  // before inserting. This prevents double-processing when the webhook is delivered twice.
  if (platformMessageId) {
    const { rows: existing } = await query(
      `SELECT id FROM messages
       WHERE user_id = $1 AND platform = $2 AND platform_message_id = $3
       LIMIT 1`,
      [userId, platform, platformMessageId],
    );
    if (existing.length) return null;
  }

  const sql = `
    INSERT INTO messages (user_id, platform, from_contact, body, thread_id, subject, platform_message_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, user_id, platform, from_contact, body, thread_id, subject, status, received_at
  `;
  const { rows } = await query(sql, [userId, platform, fromContact, body, threadId, subject, platformMessageId]);
  return rows[0];
}

/**
 * Update the processing status of a message.
 *
 * @param {string} messageId  UUID
 * @param {'pending'|'replied'|'skipped'|'failed'} status
 * @returns {Promise<object>} Updated row
 */
async function updateMessageStatus(messageId, status) {
  const sql = `
    UPDATE messages
    SET    status = $2
    WHERE  id     = $1
    RETURNING id, status, received_at
  `;
  const { rows } = await query(sql, [messageId, status]);
  return rows[0];
}

/**
 * Fetch the most recent messages for a user, newest first.
 *
 * @param {string} userId
 * @param {number} [limit=50]
 * @returns {Promise<object[]>}
 */
async function getRecentMessages(userId, limit = 50) {
  const sql = `
    SELECT id, platform, from_contact, body, subject, thread_id, status, received_at
    FROM   messages
    WHERE  user_id = $1
    ORDER  BY received_at DESC
    LIMIT  $2
  `;
  const { rows } = await query(sql, [userId, limit]);
  return rows;
}

module.exports = { saveMessage, updateMessageStatus, getRecentMessages };
