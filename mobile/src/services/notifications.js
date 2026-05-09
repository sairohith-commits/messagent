// Push notification service — register device token and handle incoming notifications.
// Uses expo-notifications for token registration and foreground handler.

import * as Notifications from 'expo-notifications';
import * as Device        from 'expo-device';
import Constants          from 'expo-constants';
import { Platform }       from 'react-native';
import { registerPushToken } from './api';

// Configure how notifications appear when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
  }),
});

/**
 * Request notification permissions and register the Expo push token with the backend.
 * Should be called once after a successful login.
 *
 * @returns {Promise<string|null>} The Expo push token, or null if unavailable
 */
export async function registerForPushNotifications() {
  // Push notifications only work on real devices
  if (!Device.isDevice) {
    console.warn('[notifications] Push notifications require a physical device');
    return null;
  }

  // Request or check permission
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('[notifications] Push notification permission denied');
    return null;
  }

  // Android requires a notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name:        'Messagent',
      importance:  Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor:  '#6C63FF',
    });
  }

  // Get the Expo push token
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  const tokenData = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  const token = tokenData.data;

  // Register with the backend
  try {
    await registerPushToken(token);
    console.info('[notifications] Push token registered:', token.slice(0, 30), '…');
  } catch (err) {
    console.warn('[notifications] Failed to register push token:', err.message);
  }

  return token;
}

/**
 * Add a listener for notifications received while the app is in the foreground.
 * Returns a subscription that should be removed on cleanup.
 *
 * @param {(notification: Notifications.Notification) => void} handler
 * @returns {Notifications.Subscription}
 */
export function addForegroundListener(handler) {
  return Notifications.addNotificationReceivedListener(handler);
}

/**
 * Add a listener for when the user taps a notification (background/killed state).
 *
 * @param {(response: Notifications.NotificationResponse) => void} handler
 * @returns {Notifications.Subscription}
 */
export function addResponseListener(handler) {
  return Notifications.addNotificationResponseReceivedListener(handler);
}

/**
 * Clear the app badge count.
 */
export async function clearBadge() {
  await Notifications.setBadgeCountAsync(0);
}
