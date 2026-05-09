// Singleton HTTP client — all requests go through here so auth headers and
// 401 handling are handled in one place with no circular imports.

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://messagent-backend-production.up.railway.app';

// In-memory token — set by authStore on login/restore, cleared on logout
let _token = null;
let _onUnauthorized = null;

/** Called by authStore immediately after login or token restore */
export function setToken(token) {
  _token = token;
}

/** Called by authStore to register the logout callback */
export function setOnUnauthorized(fn) {
  _onUnauthorized = fn;
}

/** Called by authStore on logout */
export function clearToken() {
  _token = null;
}

/**
 * Core fetch wrapper.
 *
 * @param {'GET'|'POST'|'PUT'|'DELETE'} method
 * @param {string} path    e.g. '/auth/login'
 * @param {object|null} body
 * @returns {Promise<any>} Parsed JSON response body
 */
async function request(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (_token) headers['Authorization'] = `Bearer ${_token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });

  // Auto-logout on 401 — token expired or revoked
  if (res.status === 401) {
    _onUnauthorized?.();
    throw new Error('Session expired. Please log in again.');
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Request failed (HTTP ${res.status})`);
  }

  if (res.status === 204) return null;

  return res.json();
}

export const get    = (path)        => request('GET',    path);
export const post   = (path, body)  => request('POST',   path, body);
export const put    = (path, body)  => request('PUT',    path, body);
export const del    = (path)        => request('DELETE', path);

// ─── Agent settings ───────────────────────────────────────────────────────────
export const getSettings    = ()         => get('/agent/settings');
export const updateSettings = (settings) => put('/agent/settings', settings);

// ─── Messages ────────────────────────────────────────────────────────────────
export const getRecentMessages = (limit = 50) => get(`/messages/recent?limit=${limit}`);

// ─── Logs ────────────────────────────────────────────────────────────────────
export const getLogs    = (limit = 50, offset = 0) => get(`/logs?limit=${limit}&offset=${offset}`);
export const rateLog    = (id, rating)              => post(`/logs/${id}/rate`, { rating });

// ─── WhatsApp personal ───────────────────────────────────────────────────────
export const waConnect    = ()  => post('/whatsapp/personal/connect');
export const waStatus     = ()  => get('/whatsapp/personal/status');
export const waDisconnect = ()  => del('/whatsapp/personal/disconnect');

// ─── Instagram personal ───────────────────────────────────────────────────────
export const igConnect    = (username, password) => post('/instagram/personal/connect', { username, password });
export const igVerify     = (code)               => post('/instagram/personal/verify-challenge', { code });
export const igStatus     = ()                   => get('/instagram/personal/status');
export const igDisconnect = ()                   => del('/instagram/personal/disconnect');

// ─── Pending suggested replies ────────────────────────────────────────────────
export const getPendingReplies = ()              => get('/replies/pending');
export const approveReply      = (id)            => post(`/replies/${id}/approve`);
export const editReply         = (id, text)      => post(`/replies/${id}/edit`, { editedReply: text });
export const rejectReply       = (id)            => del(`/replies/${id}`);

// ─── Daily summary ────────────────────────────────────────────────────────────
export const getDailySummary  = () => get('/summary/daily');
export const getUnreadSummary = () => get('/summary/unread');

// ─── Subscription ─────────────────────────────────────────────────────────────
export const getSubscriptionStatus = () => get('/subscription/status');
export const createCheckout        = (plan) => post('/subscription/checkout', { plan });
export const cancelSubscription    = () => post('/subscription/cancel');

// ─── Notifications ────────────────────────────────────────────────────────────
export const registerPushToken    = (expoPushToken) => post('/notifications/register', { expoPushToken });
export const unregisterPushToken  = ()              => del('/notifications/register');
