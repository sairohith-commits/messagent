// Haptic feedback utilities — wraps expo-haptics for consistent tactile feedback.
// All functions are no-ops if the device doesn't support haptics.

import * as Haptics from 'expo-haptics';

/**
 * Light tap — use for toggle switches and small interactive elements.
 * Maps to UIImpactFeedbackStyle.Light on iOS, VIEW_CLICK on Android.
 */
export async function lightTap() {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // Haptics not supported on this device — silently ignore
  }
}

/**
 * Success pulse — use after completing an action (connect platform, save settings).
 * Maps to UINotificationFeedbackType.Success on iOS.
 */
export async function successPulse() {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // ignore
  }
}

/**
 * Error shake — use when an action fails (download error, connection failure).
 * Maps to UINotificationFeedbackType.Error on iOS.
 */
export async function errorShake() {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } catch {
    // ignore
  }
}
