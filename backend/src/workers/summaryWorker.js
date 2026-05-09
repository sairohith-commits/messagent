'use strict';

// Daily summary worker — generates a Claude digest of yesterday's messages
// and emails it to each user who has Gmail connected and at least one message.

const { query }           = require('../db');
const { getRecentMessages } = require('../models/message');
const { summarizeMessages } = require('../services/summarizer');
const { sendNewEmail }    = require('../services/gmail');

/**
 * Fetch all users who have an active Gmail token (i.e. have connected Gmail).
 * @returns {Promise<{id: string, name: string, email: string}[]>}
 */
async function getUsersWithGmail() {
  const sql = `
    SELECT u.id, u.name, u.email
    FROM   users u
    JOIN   platform_tokens pt ON pt.user_id = u.id AND pt.platform = 'gmail'
    ORDER  BY u.created_at
  `;
  const { rows } = await query(sql, []);
  return rows;
}

/**
 * Build an HTML daily summary email from the summarized threads.
 *
 * @param {string}   userName
 * @param {object[]} summaries  Array of { from, platform, summary, urgency, suggestedReply }
 * @returns {string}
 */
function buildDigestHtml(userName, summaries) {
  const urgencyColor = { high: '#e53e3e', medium: '#dd6b20', low: '#38a169' };
  const urgencyLabel = { high: 'High', medium: 'Medium', low: 'Low' };

  const rows = summaries.map((s) => {
    const color = urgencyColor[s.urgency] ?? '#718096';
    const label = urgencyLabel[s.urgency] ?? s.urgency;
    return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #e2e8f0">
          <div style="font-weight:600;color:#1a202c">${escHtml(s.from)}</div>
          <div style="font-size:12px;color:#718096;margin-bottom:4px">${escHtml(s.platform)}</div>
          <div style="color:#4a5568;margin-bottom:6px">${escHtml(s.summary)}</div>
          <div style="font-size:12px">
            <span style="background:${color};color:#fff;padding:2px 8px;border-radius:9999px">${label} priority</span>
          </div>
          ${s.suggestedReply ? `<div style="margin-top:8px;padding:8px;background:#f7fafc;border-left:3px solid #4299e1;font-style:italic;color:#4a5568;font-size:13px">${escHtml(s.suggestedReply)}</div>` : ''}
        </td>
      </tr>`;
  }).join('');

  return `
<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a202c">
  <h2 style="color:#1a202c;margin-bottom:4px">Your Daily Message Digest</h2>
  <p style="color:#718096;margin-top:0">Hi ${escHtml(userName)}, here's your AI summary for today.</p>
  <table style="width:100%;border-collapse:collapse">
    ${rows || '<tr><td style="color:#718096;padding:12px 0">No new messages to summarize.</td></tr>'}
  </table>
  <p style="font-size:12px;color:#a0aec0;margin-top:24px">
    Powered by Messagent · <a href="https://messagent.app/dashboard" style="color:#4299e1">Open Dashboard</a>
  </p>
</body>
</html>`;
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Run the daily digest for all Gmail-connected users.
 * Called from the cron job at 08:00 UTC.
 */
async function runDailySummary() {
  console.info('[summaryWorker] Starting daily digest run');

  const users = await getUsersWithGmail();
  console.info(`[summaryWorker] Processing ${users.length} user(s)`);

  for (const user of users) {
    try {
      const messages = await getRecentMessages(user.id, 50);
      if (!messages.length) continue;

      const summaries = await summarizeMessages(messages, user.name);
      const html      = buildDigestHtml(user.name, summaries);

      await sendNewEmail(
        user.id,
        user.email,
        `Messagent Daily Digest — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`,
        html,
      );
      console.info(`[summaryWorker] Digest sent to ${user.email} (${summaries.length} threads)`);
    } catch (err) {
      console.error(`[summaryWorker] Failed for user ${user.id}:`, err.message);
    }
  }

  console.info('[summaryWorker] Daily digest run complete');
}

module.exports = { runDailySummary };
