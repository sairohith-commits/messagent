// Instagram Direct Messages integration — OAuth, webhook, and reply sending via the Graph API

'use strict';

const https = require('https');
const { query }         = require('../db');
const { saveToken, getToken } = require('../models/platformToken');
const { saveMessage }   = require('../models/message');
const { addMessageJob } = require('../queues/messageQueue');

const IG_API_VERSION = process.env.INSTAGRAM_API_VERSION ?? 'v18.0';
const IG_BASE_URL    = `https://graph.facebook.com/${IG_API_VERSION}`;

// ─── WEBHOOK VERIFICATION ────────────────────────────────────────────────────

/**
 * Respond to Meta's hub.challenge verification request.
 *
 * @param {string} mode       hub.mode — must be 'subscribe'
 * @param {string} token      hub.verify_token — must match INSTAGRAM_VERIFY_TOKEN
 * @param {string} challenge  hub.challenge — echo this back to confirm
 * @returns {{ ok: boolean, challenge?: string }}
 */
function verifyWebhook(mode, token, challenge) {
  if (mode === 'subscribe' && token === process.env.INSTAGRAM_VERIFY_TOKEN) {
    return { ok: true, challenge };
  }
  return { ok: false };
}

// ─── INCOMING MESSAGE PROCESSING ─────────────────────────────────────────────

/**
 * Parse an Instagram Direct Messages webhook payload and enqueue each message.
 *
 * Meta's Instagram messaging payload shape:
 * {
 *   object: 'instagram',
 *   entry: [{
 *     id: 'INSTAGRAM_BUSINESS_ACCOUNT_ID',
 *     messaging: [{
 *       sender:    { id: 'SENDER_IGSID' },
 *       recipient: { id: 'IG_BUSINESS_IGSID' },
 *       message:   { mid: '...', text: '...', is_echo: false }
 *     }]
 *   }]
 * }
 *
 * @param {object} body  Parsed JSON body from the POST webhook
 */
async function processInstagramWebhook(body) {
  if (body?.object !== 'instagram') return;

  for (const entry of (body.entry ?? [])) {
    const instagramAccountId = entry.id; // Instagram Business Account ID

    // Resolve which Messagent user owns this Instagram account
    const userId = await getUserIdByInstagramAccountId(instagramAccountId);
    if (!userId) {
      console.warn(`[instagram] No user found for IG account ${instagramAccountId}`);
      continue;
    }

    for (const messaging of (entry.messaging ?? [])) {
      const msg = messaging.message;
      if (!msg) continue;

      // Skip echo messages (sent by the page itself)
      if (msg.is_echo) continue;

      const senderId = messaging.sender?.id;
      const msgText  = msg.text;
      if (!senderId || !msgText) continue;

      try {
        const savedMsg = await saveMessage(userId, 'instagram', senderId, msgText);

        await addMessageJob({
          messageId:   savedMsg.id,
          userId,
          platform:    'instagram',
          fromContact: senderId,
          body:        msgText,
          threadId:    null,
        });

        console.info(`[instagram] Enqueued message ${msg.mid} from ${senderId} for user ${userId}`);
      } catch (err) {
        console.error(`[instagram] Error processing message ${msg.mid}:`, err.message);
      }
    }
  }
}

// ─── SEND REPLY ──────────────────────────────────────────────────────────────

/**
 * Send an Instagram Direct Message reply via the Graph API Send API.
 *
 * @param {string} userId       Messagent user UUID (to load the page access token)
 * @param {string} recipientId  Instagram-scoped user ID (IGSID) of the recipient
 * @param {string} replyBody    Plain-text reply message
 * @returns {Promise<string>}   The message ID returned by the Graph API
 */
async function sendReply(userId, recipientId, replyBody) {
  const tokenRow = await getToken(userId, 'instagram');
  if (!tokenRow?.access_token) {
    throw new Error(`[instagram] No access token for user ${userId}`);
  }

  const payload = JSON.stringify({
    recipient: { id: recipientId },
    message:   { text: replyBody },
  });

  const data = await graphApiPost(
    '/me/messages',
    payload,
    tokenRow.access_token,
  );

  const messageId = data?.message_id;
  console.info(`[instagram] Sent reply to ${recipientId} — IG msg ID: ${messageId}`);
  return messageId;
}

// ─── OAUTH ───────────────────────────────────────────────────────────────────

/**
 * Generate the Facebook/Instagram OAuth consent URL.
 * Uses Facebook Login because Instagram Business API requires a linked Facebook Page.
 *
 * Required scopes:
 * - instagram_basic                — read the connected IG account
 * - instagram_manage_messages      — read and send DMs
 * - pages_messaging                — send messages via the connected Facebook Page
 * - pages_show_list                — list pages to find the linked Instagram account
 *
 * @param {string} userId  Messagent user UUID — embedded in `state` for post-OAuth lookup
 * @returns {string}       Consent URL
 */
function getConnectUrl(userId) {
  const params = new URLSearchParams({
    client_id:     process.env.INSTAGRAM_APP_ID,
    redirect_uri:  process.env.INSTAGRAM_REDIRECT_URI,
    scope:         'instagram_basic,instagram_manage_messages,pages_messaging,pages_show_list',
    response_type: 'code',
    state:         userId,
  });
  return `https://www.facebook.com/dialog/oauth?${params.toString()}`;
}

/**
 * Exchange an OAuth code for tokens, resolve the Instagram Business Account ID,
 * and persist everything to platform_tokens.
 *
 * Flow:
 *  1. Exchange code for short-lived user token
 *  2. Exchange short-lived token for long-lived token (60-day TTL)
 *  3. GET /me/accounts to find the linked Facebook Page
 *  4. GET /page?fields=instagram_business_account to get the IG account ID
 *  5. Save access token + IG account ID to platform_tokens
 *
 * @param {string} code    Authorization code from the redirect URL
 * @param {string} userId  Messagent user UUID from the `state` param
 * @returns {Promise<{ instagramAccountId: string }>}
 */
async function exchangeCodeForTokens(code, userId) {
  // 1. Exchange code → short-lived user access token
  const shortLived = await graphApiGet(
    '/oauth/access_token',
    {
      client_id:     process.env.INSTAGRAM_APP_ID,
      client_secret: process.env.INSTAGRAM_APP_SECRET,
      redirect_uri:  process.env.INSTAGRAM_REDIRECT_URI,
      code,
    },
    null, // no auth token needed for this call
  );

  if (!shortLived.access_token) {
    throw new Error('[instagram] Failed to obtain short-lived token');
  }

  // 2. Exchange short-lived → long-lived token (expires in ~60 days)
  const longLived = await graphApiGet(
    '/oauth/access_token',
    {
      grant_type:    'fb_exchange_token',
      client_id:     process.env.INSTAGRAM_APP_ID,
      client_secret: process.env.INSTAGRAM_APP_SECRET,
      fb_exchange_token: shortLived.access_token,
    },
    null,
  );

  const accessToken = longLived.access_token ?? shortLived.access_token;
  // Long-lived token expires in `longLived.expires_in` seconds from now
  const expiresAt = longLived.expires_in
    ? new Date(Date.now() + longLived.expires_in * 1000)
    : null;

  // 3. Find the Facebook Page linked to this account
  const pagesData = await graphApiGet('/me/accounts', {}, accessToken);
  const page = pagesData.data?.[0];
  if (!page) throw new Error('[instagram] No Facebook Page found for this account');

  const pageAccessToken = page.access_token;

  // 4. Resolve the Instagram Business Account linked to that page
  const igData = await graphApiGet(
    `/${page.id}`,
    { fields: 'instagram_business_account' },
    pageAccessToken,
  );
  const instagramAccountId = igData.instagram_business_account?.id;
  if (!instagramAccountId) {
    throw new Error('[instagram] No Instagram Business Account linked to this Facebook Page');
  }

  // 5. Persist tokens — store the PAGE access token (needed for Send API)
  await saveToken(userId, 'instagram', pageAccessToken, null, expiresAt);

  // Store the Instagram Business Account ID for webhook routing
  await query(
    `UPDATE platform_tokens
     SET    account_email = $3, updated_at = NOW()
     WHERE  user_id = $1 AND platform = $2`,
    [userId, 'instagram', instagramAccountId],
  );

  console.info(`[instagram] Tokens saved for user ${userId} (IG account ${instagramAccountId})`);
  return { instagramAccountId };
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/**
 * Look up the Messagent user UUID whose platform_tokens row has this
 * Instagram Business Account ID stored in `account_email`.
 *
 * @param {string} instagramAccountId
 * @returns {Promise<string|null>}
 */
async function getUserIdByInstagramAccountId(instagramAccountId) {
  const { rows } = await query(
    `SELECT user_id FROM platform_tokens
     WHERE  platform     = 'instagram'
       AND  account_email = $1`,
    [instagramAccountId],
  );
  return rows[0]?.user_id ?? null;
}

/**
 * GET request against the Meta Graph API.
 *
 * @param {string}      path         Relative path (e.g. '/me/accounts')
 * @param {object}      params       Query string parameters
 * @param {string|null} accessToken  Bearer token (null for public endpoints)
 * @returns {Promise<object>}
 */
function graphApiGet(path, params = {}, accessToken) {
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams(params);
    if (accessToken) qs.set('access_token', accessToken);

    // For OAuth endpoints, use graph.facebook.com without version prefix
    const isOAuth = path.startsWith('/oauth');
    const base    = isOAuth ? 'https://graph.facebook.com' : IG_BASE_URL;
    const fullUrl = new URL(`${base}${path}?${qs.toString()}`);

    const req = https.get(fullUrl.toString(), (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          if (res.statusCode >= 400) {
            reject(new Error(`Instagram API ${res.statusCode}: ${parsed?.error?.message ?? raw}`));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error(`Instagram API parse error: ${raw}`));
        }
      });
    });
    req.on('error', reject);
  });
}

/**
 * POST request against the Meta Graph API.
 *
 * @param {string} path        Relative path
 * @param {string} payload     JSON string body
 * @param {string} accessToken Bearer token
 * @returns {Promise<object>}
 */
function graphApiPost(path, payload, accessToken) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${IG_BASE_URL}${path}?access_token=${accessToken}`);
    const options = {
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          if (res.statusCode >= 400) {
            reject(new Error(`Instagram API ${res.statusCode}: ${parsed?.error?.message ?? raw}`));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error(`Instagram API parse error: ${raw}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

module.exports = {
  verifyWebhook,
  processInstagramWebhook,
  sendReply,
  getConnectUrl,
  exchangeCodeForTokens,
};
