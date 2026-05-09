// Platform OAuth flows — Gmail uses Expo WebBrowser; other platforms are placeholders.

import * as WebBrowser from 'expo-web-browser';
import * as Linking    from 'expo-linking';
import { Alert }       from 'react-native';
import { get, post }   from './api';
import { useAgentStore } from '../store/agentStore';

// The deep-link URI Google (and our backend) will redirect back to.
// Must be registered in the Google Cloud Console as an authorized redirect URI.
// Expo intercepts this scheme and hands the URL back to openAuthSessionAsync().
const GMAIL_REDIRECT_URI = 'messagent://gmail/callback';

/**
 * Full Gmail OAuth flow:
 *  1. Fetch the consent URL from the backend (which embeds the redirect URI).
 *  2. Open it in an in-app browser via expo-web-browser.
 *  3. Wait for the browser to redirect to messagent://gmail/callback?code=...
 *  4. Parse the authorization code from the redirect URL.
 *  5. POST the code to the backend for token exchange + watch setup.
 *  6. Mark Gmail as connected in the local agentStore.
 *
 * @returns {Promise<{ success: boolean, email?: string, error?: string }>}
 */
export async function connectGmail() {
  // 1. Get the consent URL — backend embeds our redirect URI and the user's ID in `state`
  const { url } = await get('/gmail/auth-url');

  // 2. Open consent page; expo-web-browser dismisses as soon as the redirect
  //    scheme "messagent://" is detected, giving us the full redirect URL back.
  const result = await WebBrowser.openAuthSessionAsync(url, GMAIL_REDIRECT_URI);

  if (result.type !== 'success') {
    // User cancelled or browser was dismissed without completing OAuth
    return { success: false, error: 'OAuth cancelled' };
  }

  // 3. Parse the redirect URL — Google appends code, state (userId), and scope
  //    e.g. messagent://gmail/callback?code=4/0Axx...&state=user-uuid
  const parsed = Linking.parse(result.url);
  const code   = parsed.queryParams?.code;

  if (!code) {
    const errorDesc = parsed.queryParams?.error ?? 'No auth code returned';
    return { success: false, error: errorDesc };
  }

  // 4. Exchange the code on the backend — it saves tokens and sets up Pub/Sub watch
  const data = await post('/gmail/connect', { code });

  // 5. Reflect the connection in local state so the UI updates immediately
  //    without waiting for a full fetchSettings() round-trip
  const { platforms, togglePlatform } = useAgentStore.getState();
  const gmailConfig = platforms.find((p) => p.platform === 'gmail');
  if (gmailConfig && !gmailConfig.enabled) {
    await togglePlatform('gmail', true).catch(() => {});
  }

  return { success: true, email: data.email };
}

/**
 * WhatsApp Business connection — placeholder for the upcoming Meta OAuth flow.
 * Shows an informational alert for now.
 *
 * @returns {Promise<{ success: boolean }>}
 */
export async function connectWhatsApp() {
  Alert.alert(
    'WhatsApp — Coming Soon',
    'WhatsApp Business integration is under development. You will be able to connect your WhatsApp Business account in the next release.',
    [{ text: 'OK' }],
  );
  return { success: false };
}

/**
 * Generic dispatcher — routes to the correct connect function by platform name.
 *
 * @param {string} platform  'gmail' | 'whatsapp' | 'instagram' | 'telegram'
 * @returns {Promise<{ success: boolean, email?: string, error?: string }>}
 */
export async function connectPlatform(platform) {
  switch (platform) {
    case 'gmail':     return connectGmail();
    case 'whatsapp':  return connectWhatsApp();
    default:
      Alert.alert('Coming Soon', `${platform} integration is coming in a future release.`);
      return { success: false };
  }
}
