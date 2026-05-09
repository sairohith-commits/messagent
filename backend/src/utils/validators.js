// Runtime validation utilities — used in services and scripts where Fastify's JSON Schema
// isn't available. All functions return { valid: boolean, error?: string }.

'use strict';

const VALID_PLATFORMS  = ['gmail', 'whatsapp', 'instagram', 'telegram'];
const VALID_MODES      = ['owner', 'assistant'];
const TIME_REGEX       = /^([01]\d|2[0-3]):([0-5]\d)$/; // HH:MM 24-hour
const EMAIL_REGEX      = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @param {string} email
 * @returns {{ valid: boolean, error?: string }}
 */
function validateEmail(email) {
  if (!email || typeof email !== 'string') return { valid: false, error: 'Email is required' };
  if (!EMAIL_REGEX.test(email.trim())) return { valid: false, error: 'Invalid email format' };
  return { valid: true };
}

/**
 * @param {string} password
 * @returns {{ valid: boolean, error?: string }}
 */
function validatePassword(password) {
  if (!password || typeof password !== 'string') return { valid: false, error: 'Password is required' };
  if (password.length < 8) return { valid: false, error: 'Password must be at least 8 characters' };
  if (password.length > 128) return { valid: false, error: 'Password is too long (max 128 chars)' };
  return { valid: true };
}

/**
 * @param {string} platform
 * @returns {{ valid: boolean, error?: string }}
 */
function validatePlatform(platform) {
  if (!VALID_PLATFORMS.includes(platform)) {
    return { valid: false, error: `Platform must be one of: ${VALID_PLATFORMS.join(', ')}` };
  }
  return { valid: true };
}

/**
 * @param {string} mode
 * @returns {{ valid: boolean, error?: string }}
 */
function validateAgentMode(mode) {
  if (!VALID_MODES.includes(mode)) {
    return { valid: false, error: `Mode must be one of: ${VALID_MODES.join(', ')}` };
  }
  return { valid: true };
}

/**
 * Validate a schedule time string in HH:MM 24-hour format.
 * @param {string} time
 * @returns {{ valid: boolean, error?: string }}
 */
function validateScheduleTime(time) {
  if (time === null || time === undefined) return { valid: true }; // null means disabled
  if (typeof time !== 'string' || !TIME_REGEX.test(time)) {
    return { valid: false, error: 'Schedule time must be in HH:MM format (24-hour UTC)' };
  }
  return { valid: true };
}

module.exports = {
  validateEmail,
  validatePassword,
  validatePlatform,
  validateAgentMode,
  validateScheduleTime,
};
