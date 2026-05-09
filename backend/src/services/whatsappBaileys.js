// WhatsApp personal connection manager via Baileys (WhatsApp Web protocol).
// Each user gets their own long-lived WebSocket authenticated by QR scan.
//
// Session files are stored in .wa-sessions/{userId}/ — these are ephemeral on
// Railway unless you mount a Volume at /app/.wa-sessions. On restart users
// simply re-scan the QR code (~30 seconds).

'use strict';

const path   = require('path');
const fs     = require('fs');
const QRCode = require('qrcode');
const pino   = require('pino');

const {
  default:              makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
} = require('@whiskeysockets/baileys');

const { saveMessage }   = require('../models/message');
const { addMessageJob } = require('../queues/messageQueue');

const SESSION_DIR = path.join(process.cwd(), '.wa-sessions');
fs.mkdirSync(SESSION_DIR, { recursive: true });

// userId → { status, qrCode, phoneNumber, socket }
const sessions = new Map();

const silentLogger = pino({ level: 'silent' });

function sessionDir(userId) {
  // Sanitise userId so it's safe as a directory name
  return path.join(SESSION_DIR, String(userId).replace(/[^a-z0-9-]/gi, '_'));
}

// ─── PUBLIC: read session state ───────────────────────────────────────────────

function getSessionState(userId) {
  const s = sessions.get(userId);
  if (!s) return { status: 'disconnected', qrCode: null, phoneNumber: null };
  return { status: s.status, qrCode: s.qrCode, phoneNumber: s.phoneNumber };
}

function hasBaileysSession(userId) {
  return sessions.get(userId)?.status === 'connected';
}

// ─── PUBLIC: connect ──────────────────────────────────────────────────────────

async function connectWhatsApp(userId) {
  const existing = sessions.get(userId);
  if (existing?.status === 'connected') return { status: 'already_connected' };

  // Tear down stale session if present
  if (existing?.socket) {
    try { existing.socket.end(); } catch {}
    sessions.delete(userId);
  }

  const dir = sessionDir(userId);
  fs.mkdirSync(dir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(dir);

  const session = { status: 'connecting', qrCode: null, phoneNumber: null, socket: null };
  sessions.set(userId, session);

  const sock = makeWASocket({
    auth:               state,
    printQRInTerminal:  false,
    logger:             silentLogger,
  });
  session.socket = sock;

  // ── QR + connection lifecycle ──────────────────────────────────────────────
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      session.status = 'qr_pending';
      session.qrCode = await QRCode.toDataURL(qr);
      console.info(`[whatsapp-baileys] QR ready for user ${userId}`);
    }

    if (connection === 'open') {
      session.status      = 'connected';
      session.qrCode      = null;
      session.phoneNumber = sock.user?.id?.split(':')[0] ?? null;
      console.info(`[whatsapp-baileys] Connected for user ${userId} (+${session.phoneNumber})`);
    }

    if (connection === 'close') {
      const code  = lastDisconnect?.error?.output?.statusCode;
      const retry = code !== DisconnectReason.loggedOut;
      session.status = 'disconnected';
      console.info(`[whatsapp-baileys] Closed for user ${userId} — code=${code} retry=${retry}`);

      if (retry) {
        // Back-off and reconnect
        setTimeout(() => connectWhatsApp(userId).catch(console.error), 5_000);
      } else {
        // Logged out — wipe session
        sessions.delete(userId);
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // ── Incoming messages ──────────────────────────────────────────────────────
  sock.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
    if (type !== 'notify') return; // 'notify' = truly new; ignore history load

    for (const msg of msgs) {
      if (msg.key.fromMe) continue;

      const text =
        msg.message?.conversation ??
        msg.message?.extendedTextMessage?.text ??
        '';
      if (!text.trim()) continue;

      // jid format: "15551234567@s.whatsapp.net" or "group-id@g.us"
      const jid         = msg.key.remoteJid;
      const fromContact = jid.replace(/@.+$/, '');

      try {
        const savedMsg = await saveMessage(userId, 'whatsapp', fromContact, text, {
          whatsappJid: jid,
          messageId:   msg.key.id,
        });

        await addMessageJob({
          messageId:   savedMsg.id,
          userId,
          platform:    'whatsapp',
          fromContact,
          body:        text,
          threadId:    jid,  // JID used by sendWhatsAppPersonalReply to send back
        });

        console.info(`[whatsapp-baileys] Enqueued msg from ${fromContact} for user ${userId}`);
      } catch (err) {
        console.error(`[whatsapp-baileys] Error processing msg from ${fromContact}:`, err.message);
      }
    }
  });

  return { status: 'connecting' };
}

// ─── PUBLIC: disconnect ───────────────────────────────────────────────────────

async function disconnectWhatsApp(userId) {
  const s = sessions.get(userId);
  if (!s) return;
  try { s.socket?.end(); } catch {}
  sessions.delete(userId);
  fs.rmSync(sessionDir(userId), { recursive: true, force: true });
  console.info(`[whatsapp-baileys] Disconnected user ${userId}`);
}

// ─── PUBLIC: send ─────────────────────────────────────────────────────────────

async function sendWhatsAppPersonalReply(userId, toJid, text) {
  const s = sessions.get(userId);
  if (!s || s.status !== 'connected') {
    throw new Error(`[whatsapp-baileys] No active connection for user ${userId}`);
  }
  await s.socket.sendMessage(toJid, { text });
  console.info(`[whatsapp-baileys] Sent reply to ${toJid} for user ${userId}`);
}

// ─── PUBLIC: auto-reconnect on startup ───────────────────────────────────────

async function autoReconnectSessions() {
  if (!fs.existsSync(SESSION_DIR)) return;
  for (const name of fs.readdirSync(SESSION_DIR)) {
    const creds = path.join(SESSION_DIR, name, 'creds.json');
    if (fs.existsSync(creds)) {
      console.info(`[whatsapp-baileys] Auto-reconnecting session: ${name}`);
      connectWhatsApp(name).catch((e) =>
        console.error(`[whatsapp-baileys] Auto-reconnect failed for ${name}:`, e.message),
      );
    }
  }
}

module.exports = {
  connectWhatsApp,
  disconnectWhatsApp,
  sendWhatsAppPersonalReply,
  getSessionState,
  hasBaileysSession,
  autoReconnectSessions,
};
