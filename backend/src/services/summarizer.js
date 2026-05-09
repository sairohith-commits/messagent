'use strict';

// Claude-powered message summarization service.
// Groups recent messages by sender/thread and returns structured summaries
// with urgency scores and suggested reply starters.

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Summarize a batch of messages for a user's daily digest.
 * Messages are grouped by fromContact and passed to Claude in a single prompt.
 *
 * @param {object[]} messages   Array of message rows from getRecentMessages()
 * @param {string}   userName   User's display name for context
 * @returns {Promise<object[]>} Array of { from, platform, threadId, summary, urgency, suggestedReply }
 */
async function summarizeMessages(messages, userName) {
  if (!messages || messages.length === 0) return [];

  // Group by fromContact so one summary covers a full conversation thread
  const grouped = groupByContact(messages);

  const systemPrompt = `You are a concise AI assistant helping ${userName} manage their messages.
You will receive a list of conversation threads. For each thread, provide:
- A 1–2 sentence summary of what the sender wants or is discussing
- An urgency level: "high" (needs response today), "medium" (within a few days), or "low" (no rush)
- A suggested reply starter (1 sentence) that ${userName} can send or edit

Respond ONLY with a JSON array. No prose, no markdown fences. Example:
[
  {
    "from": "alice@example.com",
    "platform": "gmail",
    "threadId": "thread_123",
    "summary": "Alice is following up on the project proposal and asking for a decision by Friday.",
    "urgency": "high",
    "suggestedReply": "Hi Alice, thanks for following up — I'll review the proposal today and get back to you."
  }
]`;

  const userContent = JSON.stringify(
    grouped.map(({ fromContact, platform, threadId, bodies }) => ({
      from: fromContact,
      platform,
      threadId,
      messages: bodies.slice(0, 5), // cap at 5 messages per thread to keep tokens low
    }))
  );

  const response = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 2048,
    system:     systemPrompt,
    messages:   [{ role: 'user', content: userContent }],
  });

  const raw = response.content[0]?.text ?? '[]';

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.error('[summarizer] Failed to parse Claude response as JSON:', raw.slice(0, 200));
    return [];
  }
}

/**
 * Generate a single suggested reply for one message — used by suggest mode.
 * Mirrors agentService.generateReply but returns the raw text for human review.
 *
 * @param {object} opts
 * @param {string} opts.message          Incoming message body
 * @param {string} opts.mode             'owner' | 'assistant'
 * @param {string} opts.userName         Agent owner's name
 * @param {string|null} opts.userInstructions
 * @returns {Promise<string>} Suggested reply text
 */
async function generateSuggestedReply({ message, mode, userName, userInstructions }) {
  const agentService = require('./agentService');
  return agentService.generateReply({
    message,
    mode,
    model: 'claude',
    userName,
    userInstructions,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function groupByContact(messages) {
  const map = new Map();
  for (const msg of messages) {
    const key = `${msg.from_contact}::${msg.platform}`;
    if (!map.has(key)) {
      map.set(key, {
        fromContact: msg.from_contact,
        platform:    msg.platform,
        threadId:    msg.thread_id ?? null,
        bodies:      [],
      });
    }
    map.get(key).bodies.push(msg.body);
  }
  return Array.from(map.values());
}

module.exports = { summarizeMessages, generateSuggestedReply };
