// Platform connection screen — connect/disconnect WhatsApp and Instagram.

import React, { useState, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet,
  SafeAreaView, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS }             from '../constants/theme';
import * as api               from '../services/api';
import WhatsAppQRModal        from '../components/WhatsAppQRModal';
import InstagramLoginModal    from '../components/InstagramLoginModal';

function ConnectionCard({ platform, connected, label, accountLabel, onConnect, onDisconnect, loading }) {
  const meta = {
    whatsapp:  { color: '#25D366', emoji: '💬' },
    instagram: { color: '#E1306C', emoji: '📷' },
  }[platform] ?? { color: COLORS.accent, emoji: '🔗' };

  return (
    <View style={styles.card}>
      <View style={styles.cardLeft}>
        <View style={[styles.icon, { backgroundColor: meta.color + '22' }]}>
          <Text style={styles.iconEmoji}>{meta.emoji}</Text>
        </View>
        <View>
          <Text style={styles.platformName}>{label}</Text>
          {connected && accountLabel
            ? <Text style={styles.accountLabel}>{accountLabel}</Text>
            : <Text style={styles.notConnected}>Not connected</Text>
          }
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.accent} size="small" />
      ) : connected ? (
        <Pressable
          style={({ pressed }) => [styles.disconnectBtn, pressed && { opacity: 0.7 }]}
          onPress={onDisconnect}
        >
          <Text style={styles.disconnectBtnTxt}>Disconnect</Text>
        </Pressable>
      ) : (
        <Pressable
          style={({ pressed }) => [styles.connectBtn, { backgroundColor: meta.color }, pressed && { opacity: 0.85 }]}
          onPress={onConnect}
        >
          <Text style={styles.connectBtnTxt}>Connect</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function PlatformConnect() {
  const [waStatus,  setWaStatus]  = useState(null);
  const [igStatus,  setIgStatus]  = useState(null);
  const [showWA,    setShowWA]    = useState(false);
  const [showIG,    setShowIG]    = useState(false);
  const [loading,   setLoading]   = useState({ wa: false, ig: false });

  async function fetchStatuses() {
    const [wa, ig] = await Promise.allSettled([api.waStatus(), api.igStatus()]);
    setWaStatus(wa.status === 'fulfilled' ? wa.value : { status: 'disconnected' });
    setIgStatus(ig.status === 'fulfilled' ? ig.value : { status: 'disconnected' });
  }

  useFocusEffect(useCallback(() => { fetchStatuses(); }, []));

  async function disconnectWA() {
    Alert.alert('Disconnect WhatsApp', 'This will stop AI replies via WhatsApp.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect', style: 'destructive',
        onPress: async () => {
          setLoading((l) => ({ ...l, wa: true }));
          try {
            await api.waDisconnect();
            await fetchStatuses();
          } catch (err) {
            Alert.alert('Error', err.message);
          } finally {
            setLoading((l) => ({ ...l, wa: false }));
          }
        },
      },
    ]);
  }

  async function disconnectIG() {
    Alert.alert('Disconnect Instagram', 'This will stop AI replies via Instagram.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect', style: 'destructive',
        onPress: async () => {
          setLoading((l) => ({ ...l, ig: true }));
          try {
            await api.igDisconnect();
            await fetchStatuses();
          } catch (err) {
            Alert.alert('Error', err.message);
          } finally {
            setLoading((l) => ({ ...l, ig: false }));
          }
        },
      },
    ]);
  }

  const waConnected = waStatus?.status === 'connected';
  const igConnected = igStatus?.status === 'connected';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.pageTitle}>Connect Platforms</Text>
        <Text style={styles.subtitle}>
          Connect your personal accounts so Messagent can reply on your behalf.
        </Text>

        <Text style={styles.sectionTitle}>Personal Accounts</Text>

        <ConnectionCard
          platform="whatsapp"
          label="WhatsApp"
          connected={waConnected}
          accountLabel={waConnected ? `+${waStatus?.phoneNumber}` : null}
          loading={loading.wa}
          onConnect={() => setShowWA(true)}
          onDisconnect={disconnectWA}
        />

        <ConnectionCard
          platform="instagram"
          label="Instagram"
          connected={igConnected}
          accountLabel={igConnected ? `@${igStatus?.username}` : null}
          loading={loading.ig}
          onConnect={() => setShowIG(true)}
          onDisconnect={disconnectIG}
        />

        <View style={styles.gmailNote}>
          <Text style={styles.gmailNoteTxt}>
            Gmail is connected via OAuth from the Dashboard Settings page.
          </Text>
        </View>
      </ScrollView>

      <WhatsAppQRModal
        visible={showWA}
        onConnected={() => { setShowWA(false); fetchStatuses(); }}
        onClose={() => setShowWA(false)}
      />
      <InstagramLoginModal
        visible={showIG}
        onConnected={() => { setShowIG(false); fetchStatuses(); }}
        onClose={() => setShowIG(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  container: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 48 },
  pageTitle: { fontSize: 24, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5, marginBottom: 6 },
  subtitle: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19, marginBottom: 28 },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: COLORS.textSecondary,
    textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 12,
  },
  card: {
    backgroundColor: COLORS.card, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.cardBorder,
    padding: 16, marginBottom: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  icon: {
    width: 42, height: 42, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  iconEmoji: { fontSize: 22 },
  platformName:  { fontSize: 15, fontWeight: '600', color: COLORS.text },
  accountLabel:  { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  notConnected:  { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  connectBtn: {
    borderRadius: 9, paddingHorizontal: 14, paddingVertical: 8,
  },
  connectBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  disconnectBtn: {
    borderRadius: 9, paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: COLORS.background,
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  disconnectBtnTxt: { color: COLORS.error, fontWeight: '600', fontSize: 13 },
  gmailNote: {
    backgroundColor: COLORS.card, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.cardBorder,
    padding: 14, marginTop: 8,
  },
  gmailNoteTxt: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19 },
});
