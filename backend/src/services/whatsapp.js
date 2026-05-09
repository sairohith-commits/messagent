// WhatsApp Business Cloud API integration — webhook verification, message processing, and sending

'use strict';

const https = require('https');
const { saveMessage }   = require('../models/message');
const { addMessageJob } = require('../queues/messageQueue');

const WA_API_VERSION = process.env.WHATSAPP_API_VERSION ?? 'v18.0';
const WA_BASE_URL    = `https://graph.facebook.com/${WA_API_VERSION}`;

// ─── WEBHOOK VERIFICATION ────────────────────────────────────────────────────

/**
 * Handle the GET hub.challenge request Meta sends to verify the webhook URL.
 *
 * @param {string} mode       hub.mode — must be 'subscribe'
 * @param {string} token      hub.verify_token — must match WHATSAPP_VERIFY_TOKEN
 * @param {string} challenge  hub.challenge — echo this back to confirm
 * @returns {{ ok: boolean, challenge?: string, status?: number }}
 */
function verifyWebhook(mode, token, challenge) {
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return { ok: true, challenge };
  }
  return { ok: false, status: 403 };
}

// ─── INCOMING MESSAGE PROCESSING ────────────────────────────────────────────

/**
 * Parse a Meta Cloud API webhook payload, save each incoming message to the DB,
 * and enqueue it for agent processing.
 *
 * Meta's payload shape:
 * {
 *   object: 'whatsapp_business_account',
 *   entry: [{
 *     changes: [{
 *       value: {
 *         messages: [{ id, from, timestamp, type, text: { body } }],
 *         statuses: [...],   // delivery/read receipts — ignored here
 *         metadata: { phone_number_id, display_phone_number }
 *       }
 *     }]
 *   }]
 * }
 *
 * @param {object} body  Parsed JSON body from the POST webhook
 */
async function processWhatsAppWebhook(body) {
  if (body?.object !== 'whatsapp_business_account') return;

  for (const entry of (body.entry ?? [])) {
    for (const change of (entry.changes ?? [])) {
      const value    = change.value ?? {};
      const messages = value.messages ?? [];

      for (const msg of messages) {
        // Only process inbound text messages — skip status updates, reactions, etc.
        if (msg.type !== 'text') continue;

        const fromPhone = msg.from;          // E.164 format, e.g. "15551234567"
        const msgBody   = msg.text?.body;
        if (!msgBody) continue;

        // Look up which Messagent user owns this WhatsApp phone number ID
        const phoneNumberId = value.metadata?.phone_number_id;
        const userId        = await getUserIdByPhoneNumberId(phoneNumberId);
        if (!userId) {
          console.warn(`[whatsapp] No user found for phone_number_id ${phoneNumberId}`);
          continue;
        }

        try {
          // Mark as read so the sender sees double blue ticks
          await markMessageRead(phoneNumberId, msg.id);

          const savedMsg = await saveMessage(userId, 'whatsapp', fromPhone, msgBody);

          await addMessageJob({
            messageId:   savedMsg.id,
            userId,
            platform:    'whatsapp',
            fromContact: fromPhone,
            body:        msgBody,
            threadId:    null,
          });

          console.info(`[whatsapp] Enqueued message ${msg.id} from ${fromPhone} for user ${userId}`);
        } catch (err) {
          console.error(`[whatsapp] Error processing message ${msg.id}:`, err.message);
        }
      }
    }
  }
}

// ─── SEND REPLY ──────────────────────────────────────────────────────────────

/**
 * Send a WhatsApp reply — routes to Baileys personal connection if active,
 * otherwise falls back to the Meta Business Cloud API.
 *
 * @param {string}      userId    Messagent user UUID
 * @param {string}      toPhone   Phone number (E.164) or bare number — for Business API
 * @param {string}      replyBody Plain-text message
 * @param {string|null} threadId  WhatsApp JID (e.g. "15551234567@s.whatsapp.net") when
 *                                routing via a Baileys personal session
 * @returns {Promise<string|undefined>} Message ID (Business API) or undefined (Baileys)
 */
async function sendReply(userId, toPhone, replyBody, threadId) {
  // Prefer the personal Baileys session when one is active
  const baileys = require('./whatsappBaileys');
  if (baileys.hasBaileysSession(userId) && threadId) {
    await baileys.sendWhatsAppPersonalReply(userId, threadId, replyBody);
    return;
  }

  const phoneNumberId = await getPhoneNumberId(userId);

  const payload = JSON.stringify({
    messaging_product: 'whatsapp',
    recipient_type:    'individual',
    to:                toPhone,
    type:              'text',
    text:              { body: replyBody },
  });

  const data = await graphApiPost(`/${phoneNumberId}/messages`, payload);

  const messageId = data?.messages?.[0]?.id;
  console.info(`[whatsapp] Sent reply to ${toPhone} — WA msg ID: ${messageId}`);
  return messageId;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/**
 * Resolve a WhatsApp phone_number_id to a Messagent user UUID.
 * Currently reads from env; extend this to a DB lookup when multi-user
 * WhatsApp accounts are supported.
 *
 * @param {string} phoneNumberId
 * @returns {Promise<string|null>}
 */
async function getUserIdByPhoneNumberId(phoneNumberId) {
  if (phoneNumberId === process.env.WHATSAPP_PHONE_NUMBER_ID) {
    return process.env.WHATSAPP_OWNER_USER_ID ?? null;
  }
  return null;
}

/**
 * Return the WhatsApp phone_number_id for a given user.
 * Currently reads from env; extend for multi-user support.
 *
 * @param {string} _userId
 * @returns {Promise<string>}
 */
async function getPhoneNumberId(_userId) {
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!id) throw new Error('[whatsapp] WHATSAPP_PHONE_NUMBER_ID env var is not set');
  return id;
}

/**
 * Mark an incoming WhatsApp message as read.
 *
 * @param {string} phoneNumberId
 * @param {string} messageId
 */
async function markMessageRead(phoneNumberId, messageId) {
  const payload = JSON.stringify({
    messaging_product: 'whatsapp',
    status:            'read',
    message_id:        messageId,
  });
  await graphApiPost(`/${phoneNumberId}/messages`, payload).catch((err) => {
    console.warn(`[whatsapp] markMessageRead failed for ${messageId}:`, err.message);
  });
}

/**
 * POST to the Meta Graph API with the system access token.
 *
 * @param {string} path     Path relative to the versioned base URL (e.g. /123456/messages)
 * @param {string} payload  JSON string body
 * @returns {Promise<object>} Parsed response JSON
 */
function graphApiPost(path, payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${WA_BASE_URL}${path}`);
    const options = {
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Authorization':  `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          if (res.statusCode >= 400) {
            reject(new Error(`WhatsApp API ${res.statusCode}: ${parsed?.error?.message ?? raw}`));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error(`WhatsApp API parse error: ${raw}`));
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
  processWhatsAppWebhook,
  sendReply,
  getPhoneNumberId,
};
