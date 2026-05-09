// Subscription service — wraps the backend subscription API and handles Stripe Checkout

import * as WebBrowser from 'expo-web-browser';
import { get, post } from './api';

/**
 * Fetch the current subscription status for the authenticated user.
 *
 * @returns {Promise<{
 *   tier:           'free' | 'pro' | 'business',
 *   renewalDate:    string | null,   ISO 8601 date string
 *   subscriptionId: string | null,
 * }>}
 */
export async function getStatus() {
  return get('/subscription/status');
}

/**
 * Create a Stripe Checkout session for the given plan and open the
 * hosted payment page in the in-app browser.
 *
 * The browser is dismissed automatically when Stripe redirects back to
 * the `messagent://` deep link on success or cancel.
 *
 * @param {'pro' | 'business'} plan
 * @returns {Promise<{ type: 'success' | 'cancel' | 'error' }>}
 */
export async function startCheckout(plan) {
  const { url } = await post('/subscription/checkout', { plan });

  const result = await WebBrowser.openBrowserAsync(url, {
    dismissButtonStyle:    'cancel',
    enableBarCollapsing:   true,
    showInRecents:         false,
  });

  // The browser result type is 'dismiss' when the user closes it manually,
  // or 'opened' if it opened but we don't track the Stripe redirect outcome.
  // Actual upgrade confirmation comes from the Stripe webhook → backend → next poll.
  return result;
}
