// Main home screen — platform cards, weekly stats, and AI model status banner.

import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, ActivityIndicator,
  StyleSheet, SafeAreaView, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, PLATFORMS } from '../constants/theme';
import { useAuthStore }      from '../store/authStore';
import { useAgentStore }     from '../store/agentStore';
import { useAgent }          from '../hooks/useAgent';
import PlatformCard          from '../components/PlatformCard';
import PlatformDetail        from '../components/PlatformDetail';
import { get }               from '../services/api';

export default function Dashboard({ navigation }) {
  const { platforms, isLoading, fetchSettings, togglePlatform, setMode, setSchedule } = useAgent();

  const user       = useAuthStore((s) => s.user);
  const gemmaState = useAgentStore((s) => s.gemmaState);
  const initializeGemma = useAgentStore((s) => s.initializeGemma);
  const tier       = user?.tier ?? 'free';

  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const [weeklyCount,      setWeeklyCount]       = useState(null);

  useFocusEffect(useCallback(() => {
    fetchSettings();
    fetchWeeklyCount();
    // Initialise Gemma on focus for free-tier users (idempotent — no-ops if already ready)
    if (tier === 'free') initializeGemma();
  }, []));

  async function fetchWeeklyCount() {
    try {
      const data  = await get('/logs?limit=200&offset=0');
      const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const count = (data.logs ?? []).filter(
        (l) => l.sent_at && new Date(l.sent_at).getTime() > since,
      ).length;
      setWeeklyCount(count);
    } catch {
      // Non-critical
    }
  }

  const selectedConfig = platforms.find((p) => p.platform === selectedPlatform);

  function handleSaveConfig(updates) {
    if (!updates.platform) return;
    setMode(updates.platform, updates.mode);
    setSchedule(updates.platform, updates.scheduleStart, updates.scheduleEnd);
    if (updates.enabled !== selectedConfig?.enabled) {
      togglePlatform(updates.platform, updates.enabled);
    }
  }

  const PLATFORM_KEYS = Object.keys(PLATFORMS);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>

        {/* ── Header ───────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.appTitle}>Messagent</Text>
            <Text style={styles.subtitle}>AI is managing your messages</Text>
          </View>
          <Pressable
            onPress={() => navigation.navigate('Settings')}
            style={({ pressed }) => [styles.settingsBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.settingsIcon}>⚙</Text>
          </Pressable>
        </View>

        {/* ── AI status banner (free tier only) ───────────────────────── */}
        {tier === 'free' && <AiStatusBanner gemmaState={gemmaState} onRetry={initializeGemma} />}

        {/* ── Platform list ────────────────────────────────────────────── */}
        <FlatList
          data={PLATFORM_KEYS}
          keyExtractor={(k) => k}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={fetchSettings}
              tintColor={COLORS.accent}
            />
          }
          renderItem={({ item: key }) => {
            const config  = platforms.find((p) => p.platform === key);
            const enabled = config?.enabled ?? false;
            const mode    = config?.mode    ?? 'assistant';
            return (
              <PlatformCard
                platform={key}
                enabled={enabled}
                mode={mode}
                connected={enabled}
                onToggle={(val) => togglePlatform(key, val).catch(() => {})}
                onPress={() => setSelectedPlatform(key)}
              />
            );
          }}
          ListFooterComponent={
            weeklyCount !== null ? (
              <View style={styles.statsBanner}>
                <Text style={styles.statsEmoji}>📊</Text>
                <Text style={styles.statsTxt}>
                  <Text style={styles.statsCount}>{weeklyCount}</Text>
                  {'  replies sent this week'}
                </Text>
              </View>
            ) : null
          }
        />

        {selectedPlatform && (
          <PlatformDetail
            visible={!!selectedPlatform}
            platform={selectedPlatform}
            config={selectedConfig}
            onClose={() => setSelectedPlatform(null)}
            onSave={handleSaveConfig}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

// ─── AI status banner ──────────────────────────────────────────────────────────

function AiStatusBanner({ gemmaState, onRetry }) {
  const { status, version, progress } = gemmaState;

  if (status === 'ready') {
    return (
      <View style={[styles.aiBanner, styles.aiBannerReady]}>
        <Text style={styles.aiBannerEmoji}>✓</Text>
        <Text style={[styles.aiBannerTxt, { color: COLORS.success }]}>
          Local AI ready{version ? ` · ${version}` : ''}
        </Text>
      </View>
    );
  }

  if (status === 'downloading') {
    return (
      <View style={[styles.aiBanner, styles.aiBannerDownloading]}>
        <ActivityIndicator color={COLORS.accent} size="small" />
        <View style={styles.aiBannerBody}>
          <Text style={styles.aiBannerTxt}>Downloading AI model… {progress}%</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
        </View>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <Pressable
        style={[styles.aiBanner, styles.aiBannerError]}
        onPress={onRetry}
      >
        <Text style={styles.aiBannerEmoji}>⚠</Text>
        <Text style={[styles.aiBannerTxt, { color: COLORS.error, flex: 1 }]}>
          AI unavailable — tap to retry
        </Text>
      </Pressable>
    );
  }

  if (status === 'not_downloaded') {
    return (
      <Pressable
        style={[styles.aiBanner, styles.aiBannerNotDownloaded]}
        onPress={onRetry}
      >
        <Text style={styles.aiBannerEmoji}>🤖</Text>
        <View style={styles.aiBannerBody}>
          <Text style={styles.aiBannerTxt}>Download AI model to get started</Text>
          <Text style={styles.aiBannerSub}>Tap to download (~1.4 GB)</Text>
        </View>
      </Pressable>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1 },
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 20,
    paddingTop:        16,
    paddingBottom:     20,
  },
  appTitle: {
    fontSize: 24, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5,
  },
  subtitle: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  settingsBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.cardBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  settingsIcon: { fontSize: 18, color: COLORS.textSecondary },
  // AI status banner
  aiBanner: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 20, marginBottom: 12,
    borderRadius: 12, padding: 12, gap: 10,
    borderWidth: 1,
  },
  aiBannerReady: {
    backgroundColor: COLORS.success + '12', borderColor: COLORS.success + '40',
  },
  aiBannerDownloading: {
    backgroundColor: COLORS.accentDim, borderColor: COLORS.accent + '44',
  },
  aiBannerError: {
    backgroundColor: COLORS.error + '12', borderColor: COLORS.error + '40',
  },
  aiBannerNotDownloaded: {
    backgroundColor: COLORS.card, borderColor: COLORS.cardBorder,
  },
  aiBannerEmoji: { fontSize: 18 },
  aiBannerBody:  { flex: 1 },
  aiBannerTxt:   { fontSize: 13, fontWeight: '600', color: COLORS.text },
  aiBannerSub:   { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  progressTrack: {
    height: 4, backgroundColor: COLORS.background,
    borderRadius: 2, marginTop: 6, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: COLORS.accent, borderRadius: 2 },
  // List
  listContent:  { paddingHorizontal: 20, paddingBottom: 120 },
  statsBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.accentDim, borderRadius: 14,
    padding: 16, marginTop: 8,
    borderWidth: 1, borderColor: COLORS.accent + '44', gap: 12,
  },
  statsEmoji: { fontSize: 20 },
  statsTxt:   { fontSize: 15, color: COLORS.textSecondary },
  statsCount: { fontSize: 20, fontWeight: '800', color: COLORS.accent },
});
