// Gmail watch renewer — re-subscribes all Gmail-connected users to Pub/Sub push notifications.
// Gmail watch subscriptions expire after exactly 7 days; this job runs every 6 days.

'use strict';

const { query }          = require('../db');
const { setupGmailWatch } = require('../services/gmail');

/**
 * Renew Gmail Pub/Sub watch for every user whose Gmail token is still present.
 * Each user is renewed independently — one failure doesn't block the rest.
 */
async function renewAllGmailWatches() {
  const { rows } = await query(
    `SELECT DISTINCT user_id
     FROM   platform_tokens
     WHERE  platform     = 'gmail'
       AND  access_token IS NOT NULL`,
  );

  if (!rows.length) {
    console.info('[gmailWatchRenewer] No Gmail-connected users — nothing to renew');
    return;
  }

  console.info(`[gmailWatchRenewer] Renewing watch for ${rows.length} user(s)…`);

  const results = await Promise.allSettled(
    rows.map(({ user_id }) =>
      setupGmailWatch(user_id).then(() => ({ userId: user_id, ok: true })),
    ),
  );

  let success = 0;
  let failure = 0;
  for (const r of results) {
    if (r.status === 'fulfilled') {
      success++;
    } else {
      failure++;
      console.error(`[gmailWatchRenewer] Watch renewal failed:`, r.reason?.message ?? r.reason);
    }
  }

  console.info(`[gmailWatchRenewer] Done — ${success} renewed, ${failure} failed`);
}

module.exports = { renewAllGmailWatches };
