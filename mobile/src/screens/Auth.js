// Login / Register screen — toggled by the `mode` route param from Onboarding.

import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  SafeAreaView, KeyboardAvoidingView, Platform,
  ActivityIndicator, ScrollView,
} from 'react-native';
import { COLORS } from '../constants/theme';
import { useAuthStore } from '../store/authStore';

export default function Auth({ route }) {
  // Allow Onboarding to pre-select which form to show
  const initialMode = route?.params?.mode ?? 'login';
  const [mode, setMode] = useState(initialMode); // 'login' | 'register'

  const [email,    setEmail]    = useState('');
  const [name,     setName]     = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const login    = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);

  const isLogin = mode === 'login';

  const handleSubmit = async () => {
    setError('');
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }
    if (!isLogin && !name.trim()) {
      setError('Name is required.');
      return;
    }
    setLoading(true);
    try {
      if (isLogin) {
        await login(email.trim(), password);
      } else {
        await register(email.trim(), name.trim(), password);
      }
      // Navigation happens automatically because AppNavigator watches token
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── Heading ──────────────────────────────────────────────────── */}
          <View style={styles.header}>
            <Text style={styles.title}>{isLogin ? 'Welcome back' : 'Create account'}</Text>
            <Text style={styles.subtitle}>
              {isLogin
                ? 'Log in to manage your agent'
                : 'Set up your AI message agent'}
            </Text>
          </View>

          {/* ── Form ─────────────────────────────────────────────────────── */}
          <View style={styles.form}>
            {!isLogin && (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Your name"
                  placeholderTextColor={COLORS.textMuted}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
            )}

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={COLORS.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Min. 8 characters"
                placeholderTextColor={COLORS.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
            </View>

            {/* Error banner */}
            {!!error && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorTxt}>{error}</Text>
              </View>
            )}

            {/* Submit */}
            <Pressable
              style={({ pressed }) => [styles.submitBtn, pressed && { opacity: 0.85 }, loading && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#FFF" />
                : <Text style={styles.submitTxt}>{isLogin ? 'Log In' : 'Create Account'}</Text>
              }
            </Pressable>
          </View>

          {/* ── Mode toggle ──────────────────────────────────────────────── */}
          <Pressable
            style={styles.modeToggle}
            onPress={() => { setMode(isLogin ? 'register' : 'login'); setError(''); }}
          >
            <Text style={styles.modeToggleTxt}>
              {isLogin ? "Don't have an account? " : 'Already have an account? '}
              <Text style={styles.modeToggleLink}>
                {isLogin ? 'Register' : 'Log In'}
              </Text>
            </Text>
          </Pressable>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex:            1,
    backgroundColor: COLORS.background,
  },
  container: {
    flexGrow:          1,
    paddingHorizontal: 24,
    paddingTop:        48,
    paddingBottom:     32,
    justifyContent:    'space-between',
  },
  header: {
    marginBottom: 36,
  },
  title: {
    fontSize:   30,
    fontWeight: '800',
    color:      COLORS.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize:  16,
    color:     COLORS.textSecondary,
    marginTop: 8,
  },
  form: {
    gap: 16,
  },
  field: {
    gap: 8,
  },
  fieldLabel: {
    fontSize:   13,
    fontWeight: '600',
    color:      COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor:   COLORS.card,
    borderWidth:       1,
    borderColor:       COLORS.cardBorder,
    borderRadius:      12,
    paddingHorizontal: 16,
    paddingVertical:   14,
    fontSize:          16,
    color:             COLORS.text,
  },
  errorBanner: {
    backgroundColor: COLORS.error + '22',
    borderWidth:     1,
    borderColor:     COLORS.error + '55',
    borderRadius:    10,
    padding:         12,
  },
  errorTxt: {
    color:    COLORS.error,
    fontSize: 14,
  },
  submitBtn: {
    backgroundColor: COLORS.accent,
    borderRadius:    13,
    paddingVertical: 16,
    alignItems:      'center',
    marginTop:       4,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitTxt: {
    color:      '#FFF',
    fontSize:   17,
    fontWeight: '700',
  },
  modeToggle: {
    alignItems:  'center',
    paddingTop:  24,
  },
  modeToggleTxt: {
    color:    COLORS.textSecondary,
    fontSize: 15,
  },
  modeToggleLink: {
    color:      COLORS.accent,
    fontWeight: '600',
  },
});
