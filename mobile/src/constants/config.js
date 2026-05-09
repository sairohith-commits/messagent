// App-wide configuration constants.
// API_URL comes from the EXPO_PUBLIC_API_URL environment variable so it can differ
// between local dev, staging, and production without a code change.

import Constants from 'expo-constants';

// App version from app.json — single source of truth for display and analytics
export const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

// Backend API base URL — set EXPO_PUBLIC_API_URL in .env for local dev
// e.g. EXPO_PUBLIC_API_URL=http://localhost:4000
// Expo strips EXPO_PUBLIC_ and exposes the remainder to the JS bundle at build time.
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.messagent.app';

export const SUPPORT_EMAIL     = 'support@messagent.app';
export const PRIVACY_POLICY_URL = 'https://messagent.app/privacy';
export const TERMS_URL          = 'https://messagent.app/terms';
