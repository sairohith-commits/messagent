// Gmail integration service — OAuth, Pub/Sub watch, history polling, and sending replies

'use strict';

require('dotenv').config();
const { google }  = require('googleapis');
const { query }   = require('../db');
const { saveToken, getToken } = require('../models/platformToken');
const { saveMessage }         = require('../models/message');
const { addMessageJob }       = require('../queues/messageQueue');
const { recordReply }         = require('./rateLimiter');

// ─── OAUTH2 FACTORY ──────────────────────────────────────────────────────────

/**
 * Create a configured OAuth2 client.
 * A new instance is created per call so concurrent requests don't share state.
 *
 * @param {string} [redirectUri]  Override the default GMAIL_REDIRECT_URI env var.
 *                                Pass the mobile deep-link URI when initiating OAuth from the app.
 */
function createOAuth2Client(redirectUri) {
  return new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    redirectUri ?? process.env.GMAIL_REDIRECT_URI,
  );
}

// ─── TOKEN HELPERS ───────────────────────────────────────────────────────────

/**
 * Return a valid access token for `userId`, refreshing it first if it expires
 * within the next 5 minutes or has already expired.
 *
 * @param {string} userId
 * @returns {Promise<string>} A fresh access token
 */
async function getValidAccessToken(userId) {
  const tokenRow = await getToken(userId, 'gmail');
  if (!tokenRow) throw new Error(`[gmail] No token found for user ${userId}`);

  const expiresAt      = tokenRow.expires_at ? new Date(tokenRow.expires_at) : null;
  const fiveMinutesMs  = 5 * 60 * 1000;
  const isExpiringSoon = expiresAt && (expiresAt - Date.now()) < fiveMinutesMs;

  if (isExpiringSoon || !expiresAt) {
    return refreshAccessToken(userId);
  }
  return tokenRow.access_token;
}

/**
 * Save or update the Gmail history cursor.
 * @param {string} userId
 * @param {string} historyId
 */
async function updateHistoryId(userId, historyId) {
  await query(
    `UPDATE platform_tokens
     SET    gmail_history_id = $2, updated_at = NOW()
     WHERE  user_id = $1 AND platform = 'gmail'`,
    [userId, historyId],
  );
}

// ─── 1. getAuthUrl ────────────────────────────────────────────────────────────

/**
 * Generate the Gmail OAuth2 consent URL.
 * The `state` param carries userId so the callback knows who to associate tokens with.
 *
 * @param {string} userId
 * @param {string} [redirectUri]  Override the redirect URI (e.g. mobile deep link)
 * @returns {string} Consent URL to redirect the user to
 */
function getAuthUrl(userId, redirectUri) {
  const oauth2Client = createOAuth2Client(redirectUri);
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',    // request refresh_token
    prompt:      'consent',    // always show consent screen so refresh_token is returned
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify',
    ],
    state: userId,
  });
}

// ─── 2. exchangeCodeForTokens ─────────────────────────────────────────────────

/**
 * Exchange an OAuth authorisation code for access + refresh tokens and save them.
 * Also fetches and stores the user's Gmail address for Pub/Sub message routing.
 *
 * @param {string} code          The `code` query param from the OAuth callback
 * @param {string} userId        Taken from the `state` query param in the callback
 * @param {string} [redirectUri] Must match the redirect URI used when generating the auth URL
 * @returns {Promise<{ tokenRow: object, email: string }>}
 */
async function exchangeCodeForTokens(code, userId, redirectUri) {
  const oauth2Client = createOAuth2Client(redirectUri);

  // Exchange code → tokens
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  // Fetch the Gmail address so we can route Pub/Sub webhooks to this user
  const gmail       = google.gmail({ version: 'v1', auth: oauth2Client });
  const profileRes  = await gmail.users.getProfile({ userId: 'me' });
  const gmailEmail  = profileRes.data.emailAddress;
  const historyId   = profileRes.data.historyId;

  // Persist — upserts via ON CONFLICT so re-connecting replaces the old tokens
  const tokenRow = await saveToken(
    userId,
    'gmail',
    tokens.access_token,
    tokens.refresh_token ?? null,
    tokens.expiry_date ? new Date(tokens.expiry_date) : null,
  );

  // Store Gmail-specific metadata in the same row
  await query(
    `UPDATE platform_tokens
     SET    account_email    = $3,
            gmail_history_id = $4,
            updated_at       = NOW()
     WHERE  user_id  = $1
       AND  platform = $2`,
    [userId, 'gmail', gmailEmail, historyId],
  );

  console.info(`[gmail] Tokens saved for user ${userId} (${gmailEmail})`);
  return { tokenRow, email: gmailEmail };
}

// ─── 3. refreshAccessToken ────────────────────────────────────────────────────

/**
 * Use the stored refresh token to obtain a new access token and persist it.
 *
 * @param {string} userId
 * @returns {Promise<string>} The new access token
 */
async function refreshAccessToken(userId) {
  const tokenRow = await getToken(userId, 'gmail');
  if (!tokenRow?.refresh_token) {
    throw new Error(`[gmail] No refresh token for user ${userId} — re-auth required`);
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: tokenRow.refresh_token });

  const { credentials } = await oauth2Client.refreshAccessToken();

  // Persist the new access token; keep the existing refresh token if Google didn't rotate it
  await saveToken(
    userId,
    'gmail',
    credentials.access_token,
    credentials.refresh_token ?? tokenRow.refresh_token,
    credentials.expiry_date ? new Date(credentials.expiry_date) : null,
  );

  console.info(`[gmail] Access token refreshed for user ${userId}`);
  return credentials.access_token;
}

// ─── 4. setupGmailWatch ───────────────────────────────────────────────────────

/**
 * Subscribe to Gmail push notifications via Google Pub/Sub.
 * Google calls our webhook whenever a new message arrives in the inbox.
 *
 * IMPORTANT: Gmail watch subscriptions expire after exactly 7 days.
 * You must call this function again before expiry (e.g. via a daily cron job)
 * to keep the push subscription alive. The expiry timestamp is stored in
 * `platform_tokens.gmail_watch_expiry` for scheduling purposes.
 *
 * @param {string} userId
 * @returns {Promise<{ historyId: string, expiration: string }>}
 */
async function setupGmailWatch(userId) {
  const accessToken  = await getValidAccessToken(userId);
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  // watch() tells Google to push Pub/Sub notifications to our topic
  const watchRes = await gmail.users.watch({
    userId: 'me',
    requestBody: {
      // The Pub/Sub topic Google will publish to (must grant gmail-api-push@system.gserviceaccount.com publisher rights)
      topicName: process.env.GMAIL_PUBSUB_TOPIC,
      labelIds:  ['INBOX'],            // only notify for inbox messages
      labelFilterAction: 'include',
    },
  });

  const { historyId, expiration } = watchRes.data;
  const expiryDate = new Date(Number(expiration));

  // Persist both the historyId (the "cursor" for history API) and watch expiry
  await query(
    `UPDATE platform_tokens
     SET    gmail_history_id   = $3,
            gmail_watch_expiry = $4,
            updated_at         = NOW()
     WHERE  user_id  = $1
       AND  platform = $2`,
    [userId, 'gmail', historyId, expiryDate],
  );

  console.info(`[gmail] Watch set up for user ${userId} — expires ${expiryDate.toISOString()}`);
  return { historyId, expiration };
}

// ─── AUTOMATED EMAIL FILTER ──────────────────────────────────────────────────

const SKIP_FROM_PATTERNS = [
  'noreply', 'no-reply', 'donotreply', 'do-not-reply',
  'mailer-daemon', 'postmaster', 'automated', 'auto-confirm',
  'notifications', 'bounce', 'support+', 'alert@', 'alerts@',
  'no.reply', 'do.not.reply',
];

const SKIP_DOMAINS = [
  'mailchimp.com', 'sendgrid.net', 'amazonses.com', 'exacttarget.com',
  'marketo.com', 'hubspot.com', 'klaviyo.com', 'constantcontact.com',
  'mailgun.org', 'sparkpost.com', 'postmarkapp.com', 'mandrill.com',
];

const SKIP_SUBJECT_PREFIXES = [
  'auto:', 'auto-reply', 'automated reply', 'automated response',
  '[automated]', 'out of office', 'delivery status', 'delivery failure',
  'mail delivery', 'returned mail', 'undeliverable', 'undelivered mail',
  'mailer-daemon', 'failure notice', 'delivery notification',
];

/**
 * Returns true if the email should be skipped (automated / bulk sender / loop risk).
 *
 * @param {string} fromEmail   Bare email address extracted from the From header
 * @param {string} subject     Subject header value
 * @param {object[]} headers   Full Gmail header array for checking automation headers
 * @param {string} userEmail   The Messagent user's own Gmail address (loop prevention)
 * @returns {boolean}
 */
function shouldSkipEmail(fromEmail, subject, headers, userEmail) {
  const emailLower   = fromEmail.toLowerCase();
  const subjectLower = (subject ?? '').toLowerCase();

  // 1. From address contains a known automated-sender keyword
  if (SKIP_FROM_PATTERNS.some((p) => emailLower.includes(p))) return true;

  // 2. Sending domain is a known bulk-mail provider
  const domain = emailLower.split('@')[1] ?? '';
  if (SKIP_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) return true;

  // 3. Subject line starts with an automated-message prefix
  if (SKIP_SUBJECT_PREFIXES.some((p) => subjectLower.startsWith(p))) return true;

  // 4. Automation headers — check both canonical and X- prefixed variants
  const autoSubmitted  = getHeader(headers, 'Auto-Submitted').toLowerCase();
  const xAutoSubmitted = getHeader(headers, 'X-Auto-Submitted').toLowerCase();
  const autoReply      = getHeader(headers, 'X-Autoreply').toLowerCase();
  const xAutorespond   = getHeader(headers, 'X-Autorespond').toLowerCase();
  const precedence     = getHeader(headers, 'Precedence').toLowerCase();

  if (autoSubmitted && autoSubmitted !== 'no') return true;   // RFC 3834: any non-"no" value = automated
  if (xAutoSubmitted && xAutoSubmitted !== 'no') return true;
  if (autoReply === 'yes') return true;
  if (xAutorespond) return true;                              // presence alone indicates auto-response
  if (['bulk', 'list', 'junk', 'auto_reply'].includes(precedence)) return true;

  // 5. Loop prevention — never reply to our own Gmail address
  if (userEmail && emailLower.includes(userEmail.toLowerCase())) return true;

  return false;
}

// ─── PRIVATE: MIME helpers ────────────────────────────────────────────────────

/**
 * Recursively extract the first text/plain part from a MIME message payload.
 * Gmail encodes body data as base64url strings.
 *
 * @param {object} payload  Gmail message payload object
 * @returns {string}        Decoded plain text (empty string if not found)
 */
function extractPlainText(payload) {
  if (!payload) return '';

  // Inline body — single-part message
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
  }

  // Multi-part — recurse into parts
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractPlainText(part);
      if (text) return text;
    }
  }

  return '';
}

/**
 * Get a specific header value from a Gmail message's header list.
 *
 * @param {object[]} headers
 * @param {string}   name     Case-insensitive header name
 * @returns {string}
 */
function getHeader(headers = [], name) {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

// ─── 5. processGmailWebhook ───────────────────────────────────────────────────

/**
 * Handle a Google Pub/Sub push notification for Gmail.
 *
 * Google sends:
 * {
 *   message: { data: "<base64 encoded JSON>", messageId: "...", publishTime: "..." },
 *   subscription: "projects/.../subscriptions/..."
 * }
 *
 * The decoded `data` JSON contains:
 * { emailAddress: "user@gmail.com", historyId: "12345" }
 *
 * @param {object} pubsubPayload  The parsed JSON body from Google
 */
async function processGmailWebhook(pubsubPayload) {
  // 1. Decode Pub/Sub envelope
  const rawData = pubsubPayload?.message?.data;
  if (!rawData) {
    console.warn('[gmail] Webhook received with no message data');
    return;
  }

  let notification;
  try {
    notification = JSON.parse(Buffer.from(rawData, 'base64').toString('utf-8'));
  } catch {
    console.warn('[gmail] Failed to parse Pub/Sub message data');
    return;
  }

  const { emailAddress, historyId: newHistoryId } = notification;
  if (!emailAddress) {
    console.warn('[gmail] Pub/Sub notification missing emailAddress');
    return;
  }

  // 2. Look up which user owns this Gmail address
  const { rows } = await query(
    `SELECT user_id, gmail_history_id
     FROM   platform_tokens
     WHERE  platform     = 'gmail'
       AND  account_email = $1`,
    [emailAddress],
  );

  if (!rows.length) {
    console.warn(`[gmail] No user found for Gmail address ${emailAddress}`);
    return;
  }

  const { user_id: userId, gmail_history_id: lastHistoryId } = rows[0];

  if (!lastHistoryId) {
    // First notification — just save the cursor and wait for the next one
    await updateHistoryId(userId, newHistoryId);
    return;
  }

  // 3. Fetch Gmail history since last cursor
  const accessToken  = await getValidAccessToken(userId).catch((err) => {
    console.error(`[gmail] Could not get access token for ${userId}:`, err.message);
    return null;
  });
  if (!accessToken) return;

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  let historyRes;
  try {
    historyRes = await gmail.users.history.list({
      userId:         'me',
      startHistoryId: lastHistoryId,
      historyTypes:   ['messageAdded'],
      labelId:        'INBOX',
    });
  } catch (err) {
    console.error(`[gmail] history.list failed for user ${userId}:`, err.message);
    return;
  }

  const historyItems = historyRes.data.history ?? [];

  // 4. Process each newly added message — errors are caught per-message so one
  //    bad email doesn't abort processing of the rest
  for (const historyItem of historyItems) {
    for (const { message: msg } of (historyItem.messagesAdded ?? [])) {
      try {
        await processIncomingGmailMessage(gmail, userId, emailAddress, msg.id, msg.threadId);
      } catch (err) {
        console.error(`[gmail] Error processing message ${msg.id}:`, err.message);
      }
    }
  }

  // 5. Advance the cursor to the latest historyId from this notification
  await updateHistoryId(userId, newHistoryId);
}

/**
 * Fetch, filter, and enqueue a single incoming Gmail message.
 * Skipped if sent by the user or if the user started the thread.
 *
 * @param {object} gmail         Authenticated Gmail API client
 * @param {string} userId        Messagent user UUID
 * @param {string} userEmail     User's Gmail address (for self-send detection)
 * @param {string} gmailMsgId    Gmail message ID
 * @param {string} threadId      Gmail thread ID
 */
async function processIncomingGmailMessage(gmail, userId, userEmail, gmailMsgId, threadId) {
  // Fetch the full message content
  const msgRes = await gmail.users.messages.get({
    userId:  'me',
    id:      gmailMsgId,
    format:  'full',
  });
  const msgData = msgRes.data;
  const headers = msgData.payload?.headers ?? [];

  const from      = getHeader(headers, 'From');
  const subject   = getHeader(headers, 'Subject');
  const inReplyTo = getHeader(headers, 'In-Reply-To').trim();

  // Skip messages sent by the user themselves (e.g. Sent folder spillover)
  if (from.includes(userEmail)) {
    console.info(`[gmail] Skipping self-sent message ${gmailMsgId}`);
    return;
  }

  // Normalise the From address to a bare email early so the filter can use it
  const fromContact = (from.match(/<(.+?)>/) ?? [null, from])[1].trim();

  // Skip automated / bulk / no-reply emails and loop-risk senders
  if (shouldSkipEmail(fromContact, subject, headers, userEmail)) {
    console.info(`[gmail] Skipped automated email from ${fromContact}`);
    return;
  }

  // Loop detection — if In-Reply-To points to a message we sent, this is an
  // auto-response to our reply (the classic infinite-loop trigger). Skip it.
  if (inReplyTo) {
    const { rows: sentRows } = await query(
      `SELECT id FROM reply_logs
       WHERE  user_id             = $1
         AND  platform_message_id = $2
       LIMIT  1`,
      [userId, inReplyTo],
    );
    if (sentRows.length) {
      console.info(`[gmail] Skipping reply-to-our-reply: In-Reply-To ${inReplyTo}`);
      return;
    }
  }

  // Skip if the user started this thread (fetch thread's first message)
  const threadRes = await gmail.users.threads.get({
    userId:          'me',
    id:              threadId,
    format:          'metadata',
    metadataHeaders: ['From'],
  });
  const firstMessage = threadRes.data.messages?.[0];
  const firstFrom    = getHeader(firstMessage?.payload?.headers ?? [], 'From');
  if (firstFrom.includes(userEmail)) {
    console.info(`[gmail] Skipping reply in user-started thread ${threadId}`);
    return;
  }

  // Extract plain-text body
  const body = extractPlainText(msgData.payload).trim();
  if (!body) {
    console.info(`[gmail] Skipping message ${gmailMsgId} — no plain text body`);
    return;
  }

  // Deduplication — save returns null if this platform message ID was already processed
  const savedMsg = await saveMessage(userId, 'gmail', fromContact, body, {
    threadId,
    subject,
    platformMessageId: gmailMsgId,
  });
  if (!savedMsg) {
    console.info(`[gmail] Duplicate message ${gmailMsgId} — already processed`);
    return;
  }

  await addMessageJob({
    messageId:   savedMsg.id,
    userId,
    platform:    'gmail',
    fromContact,
    body,
    threadId,
    subject,
  });

  // Record the reply rate-limit key for this sender now that we've queued a reply.
  // This prevents auto-responder loops: if this sender replies again within 24h,
  // messageWorker will drop it via isRateLimited().
  await recordReply(userId, 'gmail', fromContact);

  console.info(`[gmail] Enqueued message ${gmailMsgId} (thread ${threadId}) for user ${userId}`);
}

// ─── 6. sendReply ─────────────────────────────────────────────────────────────

/**
 * Send a reply to a Gmail thread via the Gmail API.
 *
 * Constructs a proper RFC 2822 email with In-Reply-To and References headers
 * so Gmail threads the reply correctly.
 *
 * @param {string} userId     Messagent user UUID (used to load tokens)
 * @param {string} threadId   Gmail thread ID to reply within
 * @param {string} toEmail    Recipient email address
 * @param {string} replyBody  Plain-text reply body
 * @returns {Promise<string>} The Gmail message ID of the sent reply
 */
async function sendReply(userId, threadId, toEmail, replyBody) {
  const accessToken  = await getValidAccessToken(userId);
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  // Fetch thread metadata to build proper reply headers
  const threadRes = await gmail.users.threads.get({
    userId:          'me',
    id:              threadId,
    format:          'metadata',
    metadataHeaders: ['Subject', 'Message-ID'],
  });

  const messages    = threadRes.data.messages ?? [];
  const firstMsg    = messages[0];
  const lastMsg     = messages[messages.length - 1];

  const subject         = getHeader(firstMsg?.payload?.headers ?? [], 'Subject');
  const lastMessageId   = getHeader(lastMsg?.payload?.headers  ?? [], 'Message-ID');

  // Prefix "Re:" once — avoid "Re: Re: Re:" chains
  const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;

  // Build the RFC 2822 message
  const emailLines = [
    `To: ${toEmail}`,
    `Subject: ${replySubject}`,
    ...(lastMessageId ? [`In-Reply-To: ${lastMessageId}`, `References: ${lastMessageId}`] : []),
    'Content-Type: text/plain; charset="UTF-8"',
    '',                // blank line separates headers from body (RFC 2822 §2.1)
    replyBody,
  ];

  // Gmail expects base64url-encoded raw RFC 2822 bytes
  const raw = Buffer.from(emailLines.join('\r\n')).toString('base64url');

  const sentRes = await gmail.users.messages.send({
    userId:      'me',
    requestBody: { raw, threadId },
  });

  console.info(`[gmail] Sent reply to thread ${threadId} — Gmail msg ID: ${sentRes.data.id}`);
  return sentRes.data.id;
}

// ─── 7. sendNewEmail ──────────────────────────────────────────────────────────

/**
 * Send a brand-new email (not a reply to a thread).
 * Used for the daily summary digest sent to the user's own Gmail address.
 *
 * @param {string} userId     Messagent user UUID (used to load tokens)
 * @param {string} toEmail    Recipient address
 * @param {string} subject    Email subject line
 * @param {string} htmlBody   HTML body content
 * @returns {Promise<string>} Gmail message ID
 */
async function sendNewEmail(userId, toEmail, subject, htmlBody) {
  const accessToken  = await getValidAccessToken(userId);
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const emailLines = [
    `To: ${toEmail}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    '',
    htmlBody,
  ];

  const raw = Buffer.from(emailLines.join('\r\n')).toString('base64url');

  const sentRes = await gmail.users.messages.send({
    userId:      'me',
    requestBody: { raw },
  });

  console.info(`[gmail] Sent new email to ${toEmail} — Gmail msg ID: ${sentRes.data.id}`);
  return sentRes.data.id;
}

module.exports = {
  getAuthUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  setupGmailWatch,
  processGmailWebhook,
  sendReply,
  sendNewEmail,
};
