// User model — raw SQL CRUD helpers for the `users` table

'use strict';

const { query } = require('../db');

/**
 * Insert a new user row.
 * @param {string} email
 * @param {string} name
 * @param {string} passwordHash  bcrypt hash of the plain-text password
 * @returns {Promise<object>} The created user row (without password_hash)
 */
async function createUser(email, name, passwordHash) {
  const sql = `
    INSERT INTO users (email, name, password_hash)
    VALUES ($1, $2, $3)
    RETURNING id, email, name, tier, created_at
  `;
  const { rows } = await query(sql, [email, name, passwordHash]);
  return rows[0];
}

/**
 * Fetch a user by their primary key.
 * @param {string} id  UUID
 * @returns {Promise<object|null>}
 */
async function getUserById(id) {
  const sql = `
    SELECT id, email, name, tier, created_at
    FROM   users
    WHERE  id = $1
  `;
  const { rows } = await query(sql, [id]);
  return rows[0] ?? null;
}

/**
 * Fetch a user by email — includes password_hash for login comparison.
 * @param {string} email
 * @returns {Promise<object|null>}
 */
async function getUserByEmail(email) {
  const sql = `
    SELECT id, email, name, tier, password_hash, created_at
    FROM   users
    WHERE  email = $1
  `;
  const { rows } = await query(sql, [email]);
  return rows[0] ?? null;
}

/**
 * Upgrade or downgrade the user's subscription tier.
 * @param {string} id   UUID
 * @param {'free'|'pro'|'business'} tier
 * @returns {Promise<object>} Updated user row
 */
async function updateUserTier(id, tier) {
  const sql = `
    UPDATE users
    SET    tier = $2, updated_at = NOW()
    WHERE  id   = $1
    RETURNING id, email, name, tier, created_at
  `;
  const { rows } = await query(sql, [id, tier]);
  return rows[0];
}

module.exports = { createUser, getUserById, getUserByEmail, updateUserTier };
