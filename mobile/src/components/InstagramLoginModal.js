// Instagram personal connection modal — username/password + 2FA challenge.

import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, ActivityIndicator,
  StyleSheet, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { COLORS } from '../constants/theme';
import * as api   from '../services/api';

export default function InstagramLoginModal({ visible, onConnected, onClose }) {
  const [step,     setStep]     = useState('form');   // 'form' | 'challenge' | 'connected'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code,     setCode]     = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  function reset() {
    setStep('form');
    setUsername('');
    setPassword('');
    setCode('');
    setError('');
  }

  function handleClose() {
    reset();
    onClose?.();
  }

  async function handleLogin() {
    if (!username.trim() || !password.trim()) {
      setError('Username and password are required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.igConnect(username.trim(), password.trim());
      if (res.needsChallenge) {
        setStep('challenge');
      } else if (res.success) {
        setStep('connected');
        setTimeout(() => { reset(); onConnected?.(username.trim()); }, 1200);
      }
    } catch (err) {
      setError(err.message ?? 'Login failed. Check your credentials and try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    if (!code.trim()) { setError('Enter the verification code.'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await api.igVerify(code.trim());
      if (res.success) {
        setStep('connected');
        setTimeout(() => { reset(); onConnected?.(username.trim()); }, 1200);
      } else {
        setError('Incorrect code. Please try again.');
      }
    } catch (err) {
      setError(err.message ?? 'Verification failed. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={styles.title}>Connect Instagram</Text>
            <Pressable onPress={handleClose} hitSlop={12}>
              <Text style={styles.closeBtn}>✕</Text>
            </Pressable>
          </View>

          {step === 'form' && (
            <View style={styles.body}>
              <Text style={styles.label}>Username</Text>
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                placeholder="@username"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={[styles.label, { marginTop: 14 }]}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor={COLORS.textMuted}
                secureTextEntry
                autoCapitalize="none"
              />
              {!!error && <Text style={styles.error}>{error}</Text>}
              <Text style={styles.disclaimer}>
                Credentials are sent directly to Instagram's API and are never stored by Messagent.
              </Text>
              <Pressable
                style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }, loading && styles.btnDisabled]}
                onPress={handleLogin}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.primaryBtnTxt}>Sign In</Text>
                }
              </Pressable>
            </View>
          )}

          {step === 'challenge' && (
            <View style={styles.body}>
              <Text style={styles.challengeTitle}>2FA Verification</Text>
              <Text style={styles.challengeSub}>
                Instagram sent a verification code to your email or phone. Enter it below.
              </Text>
              <TextInput
                style={[styles.input, { textAlign: 'center', letterSpacing: 6, fontSize: 22 }]}
                value={code}
                onChangeText={setCode}
                placeholder="000000"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="number-pad"
                maxLength={8}
                autoFocus
              />
              {!!error && <Text style={styles.error}>{error}</Text>}
              <Pressable
                style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }, loading && styles.btnDisabled]}
                onPress={handleVerify}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.primaryBtnTxt}>Verify</Text>
                }
              </Pressable>
            </View>
          )}

          {step === 'connected' && (
            <View style={[styles.body, styles.center]}>
              <Text style={styles.successEmoji}>✓</Text>
              <Text style={styles.successTxt}>Instagram Connected</Text>
              <Text style={styles.successUser}>@{username}</Text>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20,
  },
  handle: {
    width: 36, height: 4, backgroundColor: COLORS.cardBorder,
    borderRadius: 2, alignSelf: 'center', marginBottom: 16,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title:    { fontSize: 18, fontWeight: '700', color: COLORS.text },
  closeBtn: { fontSize: 20, color: COLORS.textSecondary, paddingHorizontal: 4 },
  body: { gap: 0 },
  center: { alignItems: 'center', gap: 12, paddingVertical: 32 },

  label: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 6 },
  input: {
    backgroundColor: COLORS.background, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.cardBorder,
    color: COLORS.text, fontSize: 15, padding: 14,
  },
  disclaimer: { fontSize: 11, color: COLORS.textMuted, marginTop: 10, marginBottom: 16, lineHeight: 16 },
  error: { fontSize: 13, color: COLORS.error, marginTop: 8 },

  primaryBtn: {
    backgroundColor: '#E1306C', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 4,
  },
  btnDisabled: { opacity: 0.5 },
  primaryBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },

  challengeTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  challengeSub:   { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19, marginBottom: 16 },

  successEmoji: { fontSize: 52, color: '#E1306C' },
  successTxt:   { fontSize: 18, fontWeight: '700', color: COLORS.text },
  successUser:  { fontSize: 15, color: COLORS.textSecondary },
});
