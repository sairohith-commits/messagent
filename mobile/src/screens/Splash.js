// Splash screen — shown while the auth session is being restored from AsyncStorage.
// Fades into the main app once loading completes.

import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { COLORS } from '../constants/theme';

export default function Splash() {
  // Subtle pulse: scale 1.0 → 1.06 → 1.0, repeats until component unmounts
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue:         1.06,
          duration:        900,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue:         1,
          duration:        900,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.logoWrap, { transform: [{ scale: pulse }] }]}>
        {/* Replace with <Image source={require('../../assets/icon.png')} style={styles.logo} /> when asset is ready */}
        <View style={styles.logoPlaeholder}>
          <Text style={styles.logoEmoji}>🤖</Text>
        </View>
      </Animated.View>
      <Text style={styles.appName}>Messagent</Text>
      <Text style={styles.tagline}>Your AI message agent</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: COLORS.background,
    alignItems:      'center',
    justifyContent:  'center',
    gap:             16,
  },
  logoWrap: {
    alignItems:     'center',
    justifyContent: 'center',
  },
  logoPlaeholder: {
    width:           96,
    height:          96,
    borderRadius:    28,
    backgroundColor: COLORS.accentDim,
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
    borderColor:     COLORS.accent + '44',
  },
  logoEmoji: { fontSize: 48 },
  appName: {
    fontSize:      28,
    fontWeight:    '800',
    color:         COLORS.text,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 14,
    color:    COLORS.textSecondary,
  },
});
