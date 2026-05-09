// Settings screen — user profile, AI behaviour, model updates, subscription, and account management.

import React, { useEffect, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet,
  SafeAreaView, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { COLORS }        from '../constants/theme';
import { useAuthStore }  from '../store/authStore';
import { useAgentStore } from '../store/agentStore';
import ModeSelector      from '../components/ModeSelector';
import { getStatus, startCheckout } from '../services/subscriptionService';

const APP_VERSION = '1.0.0';

const TIER_COLORS = {
  free:     { bg: '#333',    fg: '#AAA',        label: 'Free'     },
  pro:      { bg: '#3D3878', fg: COLORS.accent,  label: 'Pro'      },
  business: { bg: '#1a3a2a', fg: COLORS.success, label: 'Business' },
};

export default function Settings({ navigation }) {
  const user   = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const platforms             = useAgentStore((s) => s.platforms);
  const setMode               = useAgentStore((s) => s.setMode);
  const modelVersion          = useAgentStore((s) => s.modelVersion);
  const modelUpdateAvailable  = useAgentStore((s) => s.modelUpdateAvailable);
  const modelDownloading      = useAgentStore((s) => s.modelDownloading);
  const modelProgress         = useAgentStore((s) => s.modelProgress);
  const checkAndUpdateModel   = useAgentStore((s) => s.checkAndUpdateModel);
  const downloadModel         = useAgentStore((s) => s.downloadModel);

  const tier  = user?.tier ?? 'free';
  const badge = TIER_COLORS[tier] ?? TIER_COLORS.free;

  // Subscription status (renewal date from backend)
  const [subStatus,     setSubStatus]     = useState(null);
  const [subLoading,    setSubLoading]    = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState(null); // plan id being loaded

  // Global mode = mode shared by all platforms; 'assistant' if mixed
  const globalMode = platforms.every((p) => p.mode === 'owner') ? 'owner' : 'assistant';

  function handleGlobalModeChange(mode) {
    platforms.forEach((p) => setMode(p.platform, mode).catch(() => {}));
  }

  function handleLogout() {
    Alert.alert(
      'Log out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log Out', style: 'destructive', onPress: logout },
      ],
    );
  }

  async function handleDownload() {
    try {
      await downloadModel();
    } catch {
      Alert.alert('Download failed', 'Could not download the model. Please try again.');
    }
  }

  async function handleUpgrade(plan) {
    setUpgradeLoading(plan);
    try {
      await startCheckout(plan);
      // Subscription updates asynchronously via Stripe webhook — refresh status
      await fetchSubStatus();
      Alert.alert(
        'Payment started',
        'Complete checkout in the browser. Your plan updates automatically on success.',
        [{ text: 'OK' }],
      );
    } catch (err) {
      Alert.alert('Error', err.message ?? 'Could not start checkout. Please try again.');
    } finally {
      setUpgradeLoading(null);
    }
  }

  async function fetchSubStatus() {
    setSubLoading(true);
    try {
      const status = await getStatus();
      setSubStatus(status);
    } catch {
      // Non-fatal — just show the tier from the JWT
    } finally {
      setSubLoading(false);
    }
  }

  useEffect(() => {
    fetchSubStatus();
    if (tier === 'free') checkAndUpdateModel();
  }, []);

  const renewalDate = subStatus?.renewalDate
    ? new Date(subStatus.renewalDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>

        <Text style={styles.pageTitle}>Settings</Text>

        {/* ── Profile card ─────────────────────────────────────────────── */}
        <View style={styles.profileCard}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarInitial}>
              {(user?.name ?? 'U')[0].toUpperCase()}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.name ?? 'User'}</Text>
            <Text style={styles.profileEmail}>{user?.email ?? ''}</Text>
            {renewalDate && tier !== 'free' && (
              <Text style={styles.renewalTxt}>Renews {renewalDate}</Text>
            )}
          </View>
          <View style={[styles.tierBadge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.tierTxt, { color: badge.fg }]}>{badge.label}</Text>
          </View>
        </View>

        {/* ── AI Behaviour ─────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AI Behaviour</Text>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Global reply style</Text>
            <Text style={styles.cardSublabel}>
              Applies to all connected platforms. Override per-platform in the Dashboard.
            </Text>
            <View style={{ marginTop: 14 }}>
              <ModeSelector value={globalMode} onChange={handleGlobalModeChange} />
            </View>
          </View>
        </View>

        {/* ── AI Model (free users only) ───────────────────────────────── */}
        {tier === 'free' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>AI Model</Text>
            <View style={styles.card}>

              <View style={styles.modelRow}>
                <Text style={styles.cardLabel}>Gemma (on-device)</Text>
                {modelVersion
                  ? <Text style={styles.versionBadge}>{modelVersion}</Text>
                  : <Text style={styles.cardSublabel}>Not downloaded</Text>
                }
              </View>

              {modelUpdateAvailable && !modelDownloading && (
                <View style={styles.updateBanner}>
                  <View style={styles.updateBannerText}>
                    <Text style={styles.updateTitle}>Update available</Text>
                    <Text style={styles.updateSub}>A newer Gemma model is ready to download</Text>
                  </View>
                  <Pressable
                    style={({ pressed }) => [styles.downloadBtn, pressed && { opacity: 0.8 }]}
                    onPress={handleDownload}
                  >
                    <Text style={styles.downloadBtnTxt}>Update</Text>
                  </Pressable>
                </View>
              )}

              {modelDownloading && (
                <View style={styles.progressContainer}>
                  <View style={styles.progressRow}>
                    <ActivityIndicator color={COLORS.accent} size="small" />
                    <Text style={styles.progressLabel}>
                      Downloading… {modelProgress}%
                    </Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${modelProgress}%` }]} />
                  </View>
                </View>
              )}

              {!modelUpdateAvailable && !modelDownloading && modelVersion && (
                <Text style={styles.upToDate}>✓ Up to date</Text>
              )}
            </View>
          </View>
        )}

        {/* ── Subscription ─────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subscription</Text>

          {/* Free → Pro upgrade card */}
          {tier === 'free' && (
            <Pressable
              style={({ pressed }) => [styles.upgradeCard, pressed && { opacity: 0.9 }]}
              onPress={() => navigation?.navigate('Upgrade', { currentTier: 'free' })}
            >
              <View style={styles.upgradeCardHeader}>
                <Text style={styles.upgradeEmoji}>⚡</Text>
                <View style={styles.upgradeCardInfo}>
                  <Text style={styles.upgradeCardTitle}>Upgrade to Pro — $9/mo</Text>
                  <Text style={styles.upgradeCardSub}>Smarter AI · All platforms · Auto-send</Text>
                </View>
              </View>
              <View style={styles.upgradeFeatures}>
                {['Claude Sonnet AI replies', 'Unlimited platforms', 'Auto-send replies'].map((f) => (
                  <Text key={f} style={styles.upgradeFeatureTxt}>✓ {f}</Text>
                ))}
              </View>
              <Pressable
                style={({ pressed }) => [styles.upgradeBtn, pressed && { opacity: 0.85 }]}
                onPress={() => handleUpgrade('pro')}
                disabled={upgradeLoading === 'pro'}
              >
                {upgradeLoading === 'pro'
                  ? <ActivityIndicator color="#FFF" size="small" />
                  : <Text style={styles.upgradeBtnTxt}>Get Pro</Text>
                }
              </Pressable>
            </Pressable>
          )}

          {/* Pro → Business upgrade card */}
          {tier === 'pro' && (
            <Pressable
              style={({ pressed }) => [styles.upgradeCard, styles.upgradeCardBusiness, pressed && { opacity: 0.9 }]}
              onPress={() => navigation?.navigate('Upgrade', { currentTier: 'pro' })}
            >
              <View style={styles.upgradeCardHeader}>
                <Text style={styles.upgradeEmoji}>🚀</Text>
                <View style={styles.upgradeCardInfo}>
                  <Text style={[styles.upgradeCardTitle, { color: COLORS.success }]}>
                    Upgrade to Business — $29/mo
                  </Text>
                  <Text style={styles.upgradeCardSub}>CRM sync · Multi-user · Analytics</Text>
                </View>
              </View>
              <View style={styles.upgradeFeatures}>
                {['CRM sync', 'Multi-user workspace', 'Analytics dashboard'].map((f) => (
                  <Text key={f} style={[styles.upgradeFeatureTxt, { color: COLORS.success }]}>✓ {f}</Text>
                ))}
              </View>
              <Pressable
                style={({ pressed }) => [styles.upgradeBtn, styles.upgradeBtnBusiness, pressed && { opacity: 0.85 }]}
                onPress={() => handleUpgrade('business')}
                disabled={upgradeLoading === 'business'}
              >
                {upgradeLoading === 'business'
                  ? <ActivityIndicator color="#FFF" size="small" />
                  : <Text style={styles.upgradeBtnTxt}>Get Business</Text>
                }
              </Pressable>
            </Pressable>
          )}

          {/* Compare all plans link */}
          <Pressable
            style={({ pressed }) => [styles.comparePlansBtn, pressed && { opacity: 0.7 }]}
            onPress={() => navigation?.navigate('Upgrade', { currentTier: tier })}
          >
            <Text style={styles.comparePlansTxt}>Compare all plans →</Text>
          </Pressable>
        </View>

        {/* ── Platforms ────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Platforms</Text>
          <Pressable
            style={({ pressed }) => [styles.navRow, pressed && { opacity: 0.7 }]}
            onPress={() => navigation?.navigate('PlatformConnect')}
          >
            <Text style={styles.navRowTxt}>Connect WhatsApp & Instagram →</Text>
          </Pressable>
        </View>

        {/* ── Account ──────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>

          <Pressable
            style={({ pressed }) => [styles.dangerRow, pressed && { opacity: 0.7 }]}
            onPress={handleLogout}
          >
            <Text style={styles.dangerTxt}>Log Out</Text>
          </Pressable>
        </View>

        {/* ── About ────────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.card}>
            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>App Version</Text>
              <Text style={styles.aboutValue}>{APP_VERSION}</Text>
            </View>
            <View style={[styles.aboutRow, { borderTopWidth: 1, borderTopColor: COLORS.cardBorder }]}>
              <Text style={styles.aboutLabel}>Model (Pro)</Text>
              <Text style={styles.aboutValue}>Claude Sonnet</Text>
            </View>
            <View style={[styles.aboutRow, { borderTopWidth: 1, borderTopColor: COLORS.cardBorder }]}>
              <Text style={styles.aboutLabel}>Model (Free)</Text>
              <Text style={styles.aboutValue}>Gemma (on-device)</Text>
            </View>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  container: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 48 },
  pageTitle: {
    fontSize: 24, fontWeight: '800', color: COLORS.text,
    marginBottom: 24, letterSpacing: -0.5,
  },
  // Profile
  profileCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.cardBorder,
    padding: 16, marginBottom: 28, gap: 14,
  },
  avatarCircle: {
    width: 48, height: 48, borderRadius: 16,
    backgroundColor: COLORS.accentDim,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { fontSize: 20, fontWeight: '700', color: COLORS.accent },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  profileEmail: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  renewalTxt: { fontSize: 11, color: COLORS.textSecondary, marginTop: 3 },
  tierBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  tierTxt: { fontSize: 12, fontWeight: '700' },
  // Sections
  section: { marginBottom: 28 },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: COLORS.textSecondary,
    textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 12,
  },
  card: {
    backgroundColor: COLORS.card, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.cardBorder, padding: 16,
  },
  cardLabel: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  cardSublabel: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4, lineHeight: 18 },
  // Model section
  modelRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 12,
  },
  versionBadge: {
    fontSize: 12, fontWeight: '600', color: COLORS.textSecondary,
    backgroundColor: COLORS.background, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  updateBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.accentDim, borderRadius: 10,
    padding: 12, marginTop: 4, gap: 12,
    borderWidth: 1, borderColor: COLORS.accent + '44',
  },
  updateBannerText: { flex: 1 },
  updateTitle: { fontSize: 14, fontWeight: '700', color: COLORS.accent },
  updateSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  downloadBtn: {
    backgroundColor: COLORS.accent, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  downloadBtnTxt: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  progressContainer: { marginTop: 12, gap: 8 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressLabel: { fontSize: 13, color: COLORS.textSecondary },
  progressTrack: {
    height: 6, backgroundColor: COLORS.background, borderRadius: 3,
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  progressFill: { height: '100%', backgroundColor: COLORS.accent, borderRadius: 3 },
  upToDate: { fontSize: 13, color: COLORS.success, marginTop: 8 },
  // Upgrade cards
  upgradeCard: {
    backgroundColor: COLORS.accentDim, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.accent + '55',
    padding: 16, marginBottom: 12,
  },
  upgradeCardBusiness: {
    backgroundColor: COLORS.success + '12',
    borderColor: COLORS.success + '55',
  },
  upgradeCardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  upgradeEmoji: { fontSize: 28 },
  upgradeCardInfo: { flex: 1 },
  upgradeCardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.accent },
  upgradeCardSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  upgradeFeatures: { gap: 5, marginBottom: 14 },
  upgradeFeatureTxt: { fontSize: 13, color: COLORS.accent },
  upgradeBtn: {
    backgroundColor: COLORS.accent, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  upgradeBtnBusiness: { backgroundColor: COLORS.success },
  upgradeBtnTxt: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  comparePlansBtn: { alignItems: 'center', paddingVertical: 8 },
  comparePlansTxt: { fontSize: 13, color: COLORS.accent },
  // Account
  dangerRow: {
    backgroundColor: COLORS.card, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.cardBorder,
    padding: 16, alignItems: 'center',
  },
  dangerTxt: { fontSize: 15, fontWeight: '600', color: COLORS.error },
  navRow: {
    backgroundColor: COLORS.card, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.cardBorder,
    padding: 16,
  },
  navRowTxt: { fontSize: 15, fontWeight: '600', color: COLORS.accent },
  // About
  aboutRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10,
  },
  aboutLabel: { fontSize: 15, color: COLORS.textSecondary },
  aboutValue: { fontSize: 15, fontWeight: '600', color: COLORS.text },
});
