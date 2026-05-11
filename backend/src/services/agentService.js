// Agent service — generates reply text using Claude (pro/business) or a placeholder (free/gemma)

'use strict';

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic.default({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Build the system prompt based on agent mode.
 *
 * @param {'owner'|'assistant'} mode
 * @param {string}              userName          The owner's display name
 * @param {string|null}         userInstructions  Optional freeform guidance
 * @returns {string}
 */
const CONCISENESS_RULE =
  'Be concise. Keep your reply to 2-3 sentences maximum. ' +
  'Do not over-explain, do not add unnecessary pleasantries, ' +
  'and do not pad the response. Get to the point immediately.';

function buildSystemPrompt(mode, userName, userInstructions) {
  const base =
    mode === 'owner'
      ? `You are ${userName}. Reply to the following message naturally and conversationally, ` +
        `exactly as ${userName} would. Be warm, direct, and human. Never reveal you are an AI. ` +
        CONCISENESS_RULE
      : `You are a polite AI assistant managing messages on behalf of ${userName}. ` +
        `${userName} is currently unavailable. Acknowledge the message and let the sender know ` +
        `${userName} will follow up soon. ` +
        CONCISENESS_RULE;

  return userInstructions
    ? `${base}\n\nAdditional instructions from ${userName}:\n${userInstructions}`
    : base;
}

/**
 * Generate a reply to an incoming message.
 *
 * @param {{
 *   message:          string,
 *   mode:             'owner' | 'assistant',
 *   model:            'claude' | 'gemma',
 *   userName:         string,
 *   userInstructions: string | null,
 * }} params
 * @returns {Promise<string>} The generated reply text
 */
async function generateReply({ message, mode, model, userName, userInstructions }) {
  if (model === 'gemma') {
    // Free tier placeholder — swap for real Gemma API call when integrating
    return { reply: 'GEMMA_RESPONSE', inputTokens: 0, outputTokens: 0 };
  }

  // Pro / Business — call Anthropic Claude
  const systemPrompt = buildSystemPrompt(mode, userName, userInstructions);

  const response = await anthropic.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 300,
    system:     systemPrompt,
    messages:   [{ role: 'user', content: message }],
  });

  // Extract the text block from the response
  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock) throw new Error('[agentService] Claude returned no text content');

  const inputTokens  = response.usage?.input_tokens  ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;

  console.info(
    `[agentService] Tokens used — input: ${inputTokens}, output: ${outputTokens}, ` +
    `total: ${inputTokens + outputTokens}`,
  );

  return { reply: textBlock.text.trim(), inputTokens, outputTokens };
}

module.exports = { generateReply };
