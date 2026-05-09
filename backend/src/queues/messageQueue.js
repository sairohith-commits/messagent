// BullMQ queue for incoming messages — jobs are added here by the webhook route
// and consumed by messageWorker.js

'use strict';

require('dotenv').config();
const { Queue } = require('bullmq');

// Shared Redis connection options — workers reuse the same config
const redisConnection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD ?? undefined,
};

const messageQueue = new Queue('incoming-messages', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 500, // keep last 500 completed jobs for debugging
    removeOnFail: 1000,
  },
});

/**
 * Enqueue a new incoming message for agent processing.
 *
 * @param {{
 *   messageId: string,
 *   userId:    string,
 *   platform:  string,
 *   fromContact: string,
 *   body:      string,
 * }} data
 * @returns {Promise<import('bullmq').Job>}
 */
async function addMessageJob(data) {
  return messageQueue.add('process-message', data);
}

module.exports = { messageQueue, addMessageJob, redisConnection };
