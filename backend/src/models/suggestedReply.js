'use strict';

const { query } = require('../db');

/**
 * Persist a new AI-suggested reply for human review.
 *
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.messageId
 * @param {string} opts.platform
 * @param {string|null} opts.threadId
 * @param {string} opts.fromContact
 * @param {string} opts.originalBody
 * @param {string} opts.suggestedReply
 * @returns {Promise<object>} The created row
 */
async function saveSuggestedReply({ userId, messageId, platform, threadId, fromContact, originalBody, suggestedReply }) {
  const sql = `
    INSERT INTO suggested_replies
      (user_id, message_id, platform, thread_id, from_contact, original_body, suggested_reply)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `;
  const { rows } = await query(sql, [
    userId, messageId, platform, threadId ?? null,
    fromContact, originalBody, suggestedReply,
  ]);
  return rows[0];
}

/**
 * Return all pending suggested replies for a user, newest first.
 *
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
async function getPendingReplies(userId) {
  const sql = `
    SELECT id, message_id, platform, thread_id, from_contact,
           original_body, suggested_reply, status, edited_reply,
           sent_at, created_at
    FROM   suggested_replies
    WHERE  user_id = $1
      AND  status  = 'pending'
    ORDER  BY created_at DESC
  `;
  const { rows } = await query(sql, [userId]);
  return rows;
}

/**
 * Fetch a single suggested reply by id, verifying user ownership.
 *
 * @param {string} id
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
async function getSuggestedReplyById(id, userId) {
  const { rows } = await query(
    'SELECT * FROM suggested_replies WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  return rows[0] ?? null;
}

/**
 * Update the status (and optionally the edited reply + sent_at) of a suggested reply.
 *
 * @param {string} id
 * @param {string} userId
 * @param {'approved'|'rejected'|'edited'} status
 * @param {object} [opts]
 * @param {string|null} [opts.editedReply]
 * @param {Date|null}   [opts.sentAt]
 * @returns {Promise<object|null>}
 */
async function updateSuggestedReplyStatus(id, userId, status, { editedReply = null, sentAt = null } = {}) {
  const sql = `
    UPDATE suggested_replies
       SET status       = $3,
           edited_reply = COALESCE($4, edited_reply),
           sent_at      = COALESCE($5, sent_at),
           updated_at   = NOW()
     WHERE id      = $1
       AND user_id = $2
    RETURNING *
  `;
  const { rows } = await query(sql, [id, userId, status, editedReply, sentAt]);
  return rows[0] ?? null;
}

/**
 * Count of pending suggested replies for a user — used for dashboard badge.
 *
 * @param {string} userId
 * @returns {Promise<number>}
 */
async function countPendingReplies(userId) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS count FROM suggested_replies WHERE user_id = $1 AND status = 'pending'`,
    [userId]
  );
  return rows[0].count;
}

module.exports = {
  saveSuggestedReply,
  getPendingReplies,
  getSuggestedReplyById,
  updateSuggestedReplyStatus,
  countPendingReplies,
};
