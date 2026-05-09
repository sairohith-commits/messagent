// Display formatting utilities — dates, platform names, tiers, and text truncation.

/**
 * Convert a Date (or ISO string) to a human-readable relative time string.
 * e.g. "just now", "2 min ago", "3 hours ago", "yesterday", "Mar 5"
 *
 * @param {Date | string | number} date
 * @returns {string}
 */
export function formatTime(date) {
  const d     = new Date(date);
  const now   = Date.now();
  const diffS = Math.floor((now - d.getTime()) / 1000);

  if (diffS < 10)  return 'just now';
  if (diffS < 60)  return `${diffS}s ago`;

  const diffM = Math.floor(diffS / 60);
  if (diffM < 60)  return `${diffM} min ago`;

  const diffH = Math.floor(diffM / 60);
  if (diffH < 24)  return `${diffH} hour${diffH === 1 ? '' : 's'} ago`;

  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return 'yesterday';
  if (diffD < 7)   return `${diffD} days ago`;

  // Older — show a short date
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Convert a platform key to a display name.
 *
 * @param {string} platform  'gmail' | 'whatsapp' | 'instagram' | 'telegram'
 * @returns {string}
 */
export function formatPlatformName(platform) {
  const names = {
    gmail:     'Gmail',
    whatsapp:  'WhatsApp',
    instagram: 'Instagram',
    telegram:  'Telegram',
  };
  return names[platform] ?? platform.charAt(0).toUpperCase() + platform.slice(1);
}

/**
 * Convert a tier key to a display string with an emoji badge.
 *
 * @param {'free' | 'pro' | 'business'} tier
 * @returns {string}
 */
export function formatTier(tier) {
  const labels = {
    free:     'Free',
    pro:      'Pro ⚡',
    business: 'Business 🏢',
  };
  return labels[tier] ?? tier;
}

/**
 * Truncate a message body to a maximum length, appending "…" if cut.
 *
 * @param {string} text
 * @param {number} [maxLength=120]
 * @returns {string}
 */
export function truncateMessage(text, maxLength = 120) {
  if (!text) return '';
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength).trimEnd()}…`;
}
