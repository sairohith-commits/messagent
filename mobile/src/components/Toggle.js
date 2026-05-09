// Custom animated toggle switch — no third-party UI library, uses Animated API.
// Fires a light haptic tap on every toggle for tactile feedback.

import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { COLORS }    from '../constants/theme';
import { lightTap }  from '../utils/haptics';

const TRACK_W      = 48;
const TRACK_H      = 28;
const THUMB_SZ     = 22;
const THUMB_TRAVEL = TRACK_W - THUMB_SZ - 4; // 4px total padding (2px each side)

/**
 * @param {{
 *   value:    boolean,
 *   onChange: (newValue: boolean) => void,
 *   disabled?: boolean,
 * }} props
 */
export default function Toggle({ value, onChange, disabled = false }) {
  // Drive both thumb position and track colour from a single Animated.Value
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue:         value ? 1 : 0,
      duration:        180,
      useNativeDriver: false, // colour interpolation requires JS driver
    }).start();
  }, [value]);

  const thumbX = anim.interpolate({
    inputRange:  [0, 1],
    outputRange: [2, THUMB_TRAVEL + 2],
  });

  const trackColor = anim.interpolate({
    inputRange:  [0, 1],
    outputRange: [COLORS.toggleOff, COLORS.accent],
  });

  function handlePress() {
    if (disabled) return;
    lightTap(); // tactile feedback before the state change
    onChange(!value);
  }

  return (
    <Pressable
      onPress={handlePress}
      style={[styles.hitArea, disabled && styles.disabled]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
    >
      <Animated.View style={[styles.track, { backgroundColor: trackColor }]}>
        <Animated.View style={[styles.thumb, { transform: [{ translateX: thumbX }] }]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hitArea:  { padding: 4 },
  disabled: { opacity: 0.4 },
  track: {
    width:          TRACK_W,
    height:         TRACK_H,
    borderRadius:   TRACK_H / 2,
    justifyContent: 'center',
  },
  thumb: {
    position:        'absolute',
    width:           THUMB_SZ,
    height:          THUMB_SZ,
    borderRadius:    THUMB_SZ / 2,
    backgroundColor: '#FFFFFF',
    shadowColor:     '#000',
    shadowOpacity:   0.25,
    shadowRadius:    3,
    shadowOffset:    { width: 0, height: 1 },
    elevation:       3,
  },
});
