// Welcome / landing screen shown to users who are not logged in yet.

import React from 'react';
import {
  View, Text, Pressable, StyleSheet, SafeAreaView,
} from 'react-native';
import { COLORS } from '../constants/theme';

export default function Onboarding({ navigation }) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>

        {/* ── Hero section ────────────────────────────────────────────────── */}
        <View style={styles.hero}>
          {/* App icon — coloured circle with emoji (no image asset required) */}
          <View style={styles.iconCircle}>
            <Text style={styles.iconEmoji}>🤖</Text>
          </View>

          <Text style={styles.appName}>Messagent</Text>
          <Text style={styles.tagline}>
            Your AI agent that manages{'\n'}messages while you're busy
          </Text>
        </View>

        {/* ── Feature bullets ─────────────────────────────────────────────── */}
        <View style={styles.features}>
          {[
            { emoji: '📧', text: 'Connects to Gmail, WhatsApp & more' },
            { emoji: '✍️', text: 'Replies in your voice automatically' },
            { emoji: '🕐', text: 'Works on your schedule, not 24/7' },
          ].map((f) => (
            <View key={f.emoji} style={styles.featureRow}>
              <Text style={styles.featureEmoji}>{f.emoji}</Text>
              <Text style={styles.featureText}>{f.text}</Text>
            </View>
          ))}
        </View>

        {/* ── CTA buttons ─────────────────────────────────────────────────── */}
        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.85 }]}
            onPress={() => navigation.navigate('Auth', { mode: 'register' })}
          >
            <Text style={styles.btnPrimaryTxt}>Get Started</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.btnSecondary, pressed && { opacity: 0.7 }]}
            onPress={() => navigation.navigate('Auth', { mode: 'login' })}
          >
            <Text style={styles.btnSecondaryTxt}>I already have an account</Text>
          </Pressable>
        </View>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex:            1,
    backgroundColor: COLORS.background,
  },
  container: {
    flex:            1,
    paddingHorizontal: 28,
    justifyContent:  'space-between',
    paddingBottom:   32,
    paddingTop:      48,
  },
  hero: {
    alignItems: 'center',
    marginTop:  16,
  },
  iconCircle: {
    width:         96,
    height:        96,
    borderRadius:  28,
    backgroundColor: COLORS.accentDim,
    alignItems:    'center',
    justifyContent: 'center',
    marginBottom:  24,
  },
  iconEmoji: {
    fontSize: 44,
  },
  appName: {
    fontSize:   36,
    fontWeight: '800',
    color:      COLORS.text,
    letterSpacing: -1,
  },
  tagline: {
    fontSize:   17,
    color:      COLORS.textSecondary,
    textAlign:  'center',
    marginTop:  12,
    lineHeight: 26,
  },
  features: {
    gap: 16,
  },
  featureRow: {
    flexDirection:  'row',
    alignItems:     'center',
    backgroundColor: COLORS.card,
    borderRadius:   14,
    padding:        16,
    borderWidth:    1,
    borderColor:    COLORS.cardBorder,
  },
  featureEmoji: {
    fontSize:    22,
    marginRight: 14,
  },
  featureText: {
    fontSize:   15,
    color:      COLORS.text,
    fontWeight: '500',
    flex:       1,
  },
  actions: {
    gap: 12,
  },
  btnPrimary: {
    backgroundColor: COLORS.accent,
    borderRadius:    14,
    paddingVertical: 17,
    alignItems:      'center',
  },
  btnPrimaryTxt: {
    color:      '#FFFFFF',
    fontSize:   17,
    fontWeight: '700',
  },
  btnSecondary: {
    paddingVertical: 14,
    alignItems:      'center',
  },
  btnSecondaryTxt: {
    color:      COLORS.textSecondary,
    fontSize:   15,
    fontWeight: '500',
  },
});
