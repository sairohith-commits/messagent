// BullMQ queue for outgoing replies — jobs are added by messageWorker and consumed by replyWorker

'use strict';

const { Queue } = require('bullmq');
const { redisConnection } = require('./messageQueue');

const replyQueue = new Queue('outgoing-replies', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: 500,
    removeOnFail: 1000,
  },
});

/**
 * Enqueue a reply job for the agent to generate and dispatch.
 *
 * @param {{
 *   messageId:        string,
 *   userId:           string,
 *   platform:         string,
 *   fromContact:      string,
 *   body:             string,
 *   mode:             'owner' | 'assistant',
 *   tier:             'free' | 'pro' | 'business',
 *   userInstructions: string | null,
 *   userName:         string,
 * }} data
 * @returns {Promise<import('bullmq').Job>}
 */
async function addReplyJob(data) {
  return replyQueue.add('send-reply', data);
}

module.exports = { replyQueue, addReplyJob };
