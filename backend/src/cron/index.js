// Cron job scheduler — registers all recurring background tasks using node-cron

'use strict';

const cron = require('node-cron');
const { renewAllGmailWatches } = require('./gmailWatchRenewer');
const { runDailySummary }      = require('../workers/summaryWorker');

/**
 * Start all cron jobs.
 * Called once during server startup after the DB and Redis connections are established.
 */
function startCronJobs() {
  // ─── Gmail watch renewer ────────────────────────────────────────────────────
  // Gmail Pub/Sub watch subscriptions expire every 7 days.
  // Run every 6 days at 03:00 UTC to renew before expiry.
  // Cron syntax: minute hour day-of-month month day-of-week
  cron.schedule('0 3 */6 * *', async () => {
    console.info('[cron] Starting Gmail watch renewal job…');
    try {
      await renewAllGmailWatches();
    } catch (err) {
      console.error('[cron] Gmail watch renewal job failed:', err.message);
    }
  }, {
    timezone: 'UTC',
  });

  // ─── Daily message digest ───────────────────────────────────────────────────
  // Send each user an AI-generated summary of yesterday's messages at 08:00 UTC.
  cron.schedule('0 8 * * *', async () => {
    console.info('[cron] Starting daily summary job…');
    try {
      await runDailySummary();
    } catch (err) {
      console.error('[cron] Daily summary job failed:', err.message);
    }
  }, {
    timezone: 'UTC',
  });

  console.info('[cron] All cron jobs scheduled');
}

module.exports = { startCronJobs };
