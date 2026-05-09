const BASE_URL = import.meta.env.VITE_API_URL ?? 'https://messagent-backend-production.up.railway.app';

function getToken() {
  return localStorage.getItem('token');
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error ?? `HTTP ${res.status}`);
    err.status = res.status;
    err.data   = data;
    throw err;
  }
  return data;
}

export const api = {
  // ─── Auth ──────────────────────────────────────────────────────────────────
  login:    (email, password)        => request('POST', '/auth/login',    { email, password }),
  register: (email, name, password)  => request('POST', '/auth/register', { email, name, password }),

  // ─── Agent settings ────────────────────────────────────────────────────────
  getSettings:    ()         => request('GET',  '/agent/settings'),
  updateSettings: (settings) => request('PUT',  '/agent/settings', settings),

  // ─── Messages ──────────────────────────────────────────────────────────────
  getMessages: (limit = 50) => request('GET', `/messages/recent?limit=${limit}`),

  // ─── Subscription ──────────────────────────────────────────────────────────
  getSubscriptionStatus: () => request('GET',  '/subscription/status'),
  createCheckout:  (plan) => request('POST', '/subscription/checkout', { plan }),
  cancelSubscription:  () => request('POST', '/subscription/cancel'),

  // ─── Gmail ─────────────────────────────────────────────────────────────────
  getGmailAuthUrl: (redirectUri) => {
    const qs = redirectUri ? `?redirectUri=${encodeURIComponent(redirectUri)}` : '';
    return request('GET', `/gmail/auth-url${qs}`);
  },

  // ─── WhatsApp personal (Baileys) ───────────────────────────────────────────
  waConnect:    ()  => request('POST',   '/whatsapp/personal/connect'),
  waStatus:     ()  => request('GET',    '/whatsapp/personal/status'),
  waDisconnect: ()  => request('DELETE', '/whatsapp/personal/disconnect'),

  // ─── Instagram personal ────────────────────────────────────────────────────
  igPersonalConnect:        (username, password) => request('POST', '/instagram/personal/connect',          { username, password }),
  igPersonalVerifyChallenge:(code)               => request('POST', '/instagram/personal/verify-challenge', { code }),
  igPersonalStatus:         ()                   => request('GET',  '/instagram/personal/status'),
  igPersonalDisconnect:     ()                   => request('DELETE', '/instagram/personal/disconnect'),

  // ─── Summary ───────────────────────────────────────────────────────────────
  getDailySummary: () => request('GET', '/summary/daily'),
  getUnreadMessages: () => request('GET', '/summary/unread'),

  // ─── Suggested replies ─────────────────────────────────────────────────────
  getPendingReplies:   ()               => request('GET',    '/replies/pending'),
  approveReply:        (id)             => request('POST',   `/replies/${id}/approve`),
  editReply:           (id, editedReply) => request('POST',  `/replies/${id}/edit`, { editedReply }),
  rejectReply:         (id)             => request('DELETE', `/replies/${id}`),
};
