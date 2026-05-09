// Auth Zustand store — manages JWT token and user identity across the app

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as api from '../services/api';
import { post } from '../services/api';
import { registerForPushNotifications } from '../services/notifications';

const TOKEN_KEY = '@messagent/token';
const USER_KEY  = '@messagent/user';

export const useAuthStore = create((set, get) => {
  // Register 401 handler so the API client can trigger logout without importing this store
  api.setOnUnauthorized(() => get().logout());

  return {
    user:      null,
    token:     null,
    isLoading: true,   // true until loadFromStorage finishes — blocks navigation render

    // ── login ──────────────────────────────────────────────────────────────────
    login: async (email, password) => {
      const data = await post('/auth/login', { email, password });
      // Persist to AsyncStorage for next app launch
      await AsyncStorage.multiSet([
        [TOKEN_KEY, data.token],
        [USER_KEY,  JSON.stringify(data.user)],
      ]);
      // Give the API client the new token
      api.setToken(data.token);
      set({ token: data.token, user: data.user });
      // Register push token in the background — non-blocking
      registerForPushNotifications().catch(() => {});
    },

    // ── register ───────────────────────────────────────────────────────────────
    register: async (email, name, password) => {
      const data = await post('/auth/register', { email, name, password });
      await AsyncStorage.multiSet([
        [TOKEN_KEY, data.token],
        [USER_KEY,  JSON.stringify(data.user)],
      ]);
      api.setToken(data.token);
      set({ token: data.token, user: data.user });
      registerForPushNotifications().catch(() => {});
    },

    // ── logout ─────────────────────────────────────────────────────────────────
    logout: async () => {
      await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
      api.clearToken();
      set({ token: null, user: null });
    },

    // ── loadFromStorage ────────────────────────────────────────────────────────
    // Called once on app launch (App.js useEffect). Restores session silently.
    loadFromStorage: async () => {
      try {
        const [[, token], [, userJson]] = await AsyncStorage.multiGet([TOKEN_KEY, USER_KEY]);
        if (token && userJson) {
          api.setToken(token);
          set({ token, user: JSON.parse(userJson) });
        }
      } catch (err) {
        // Storage read failure — start fresh (user will need to log in again)
        console.warn('[authStore] Failed to restore session:', err.message);
      } finally {
        set({ isLoading: false });
      }
    },
  };
});
