// Platform token model — stores and retrieves OAuth tokens per user per platform

'use strict';

const { query } = require('../db');

/**
 * Upsert an OAuth token for a user + platform pair.
 * Updates the row if one already exists (e.g. after a token refresh).
 *
 * @param {string}      userId
 * @param {string}      platform       'gmail' | 'whatsapp' | 'instagram' | 'telegram'
 * @param {string}      accessToken
 * @param {string|null} refreshToken
 * @param {Date|null}   expiresAt
 * @returns {Promise<object>} Saved row
 */
async function saveToken(userId, platform, accessToken, refreshToken, expiresAt) {
  const sql = `
    INSERT INTO platform_tokens (user_id, platform, access_token, refresh_token, expires_at)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (user_id, platform) DO UPDATE
      SET access_token  = EXCLUDED.access_token,
          refresh_token = EXCLUDED.refresh_token,
          expires_at    = EXCLUDED.expires_at,
          updated_at    = NOW()
    RETURNING id, user_id, platform, expires_at, updated_at
  `;
  const { rows } = await query(sql, [userId, platform, accessToken, refreshToken, expiresAt]);
  return rows[0];
}

/**
 * Retrieve the token record for a user + platform.
 * Returns null if no token has been saved yet.
 *
 * @param {string} userId
 * @param {string} platform
 * @returns {Promise<object|null>}
 */
async function getToken(userId, platform) {
  const sql = `
    SELECT id, user_id, platform, access_token, refresh_token, expires_at, updated_at
    FROM   platform_tokens
    WHERE  user_id  = $1
      AND  platform = $2
  `;
  const { rows } = await query(sql, [userId, platform]);
  return rows[0] ?? null;
}

/**
 * Remove a stored token (e.g. when the user disconnects a platform).
 *
 * @param {string} userId
 * @param {string} platform
 * @returns {Promise<void>}
 */
async function deleteToken(userId, platform) {
  const sql = `
    DELETE FROM platform_tokens
    WHERE  user_id  = $1
      AND  platform = $2
  `;
  await query(sql, [userId, platform]);
}

module.exports = { saveToken, getToken, deleteToken };
