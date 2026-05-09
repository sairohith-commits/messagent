// AI Daily Summary screen — Claude-generated digest of recent messages.

import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable,
  StyleSheet, SafeAreaView, ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS }         from '../constants/theme';
import * as api           from '../services/api';

const URGENCY = {
  high:   { color: '#FF5252', bg: '#FF525218', label: 'High'   },
  medium: { color: '#FFA726', bg: '#FFA72618', label: 'Medium' },
  low:    { color: '#4CAF50', bg: '#4CAF5018', label: 'Low'    },
};

function SummaryCard({ item }) {
  const u = URGENCY[item.urgency] ?? URGENCY.low;

  return (
    <View style={[styles.card, { borderLeftColor: u.color }]}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.fromTxt} numberOfLines={1}>{item.from}</Text>
          <Text style={styles.platformTxt}>{item.platform}</Text>
        </View>
        <View style={[styles.urgencyBadge, { backgroundColor: u.bg }]}>
          <Text style={[styles.urgencyTxt, { color: u.color }]}>{u.label}</Text>
        </View>
      </View>

      <Text style={styles.summaryTxt}>{item.summary}</Text>

      {!!item.suggestedReply && (
        <View style={styles.suggestionBox}>
          <Text style={styles.suggestionLabel}>Suggested reply</Text>
          <Text style={styles.suggestionTxt}>"{item.suggestedReply}"</Text>
        </View>
      )}
    </View>
  );
}

function SectionHeader({ urgency, count }) {
  const u = URGENCY[urgency] ?? URGENCY.low;
  return (
    <View style={styles.sectionHeader}>
      <View style={[styles.sectionDot, { backgroundColor: u.color }]} />
      <Text style={[styles.sectionTitle, { color: u.color }]}>{u.label} Priority</Text>
      <Text style={styles.sectionCount}>{count}</Text>
    </View>
  );
}

export default function Summary() {
  const [summaries, setSummaries] = useState([]);
  const [loading,   setLoading]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getDailySummary();
      setSummaries(data.summaries ?? []);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Group summaries by urgency
  const grouped = { high: [], medium: [], low: [] };
  for (const s of summaries) {
    (grouped[s.urgency] ?? grouped.low).push(s);
  }

  // Build a flat list with section headers
  const listData = [];
  for (const urgency of ['high', 'medium', 'low']) {
    if (grouped[urgency].length > 0) {
      listData.push({ type: 'header', urgency, count: grouped[urgency].length });
      grouped[urgency].forEach((item, i) =>
        listData.push({ type: 'item', key: `${urgency}-${i}`, item })
      );
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>

        <View style={styles.header}>
          <View>
            <Text style={styles.pageTitle}>Daily Summary</Text>
            <Text style={styles.pageSubtitle}>AI-generated digest of your messages</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.refreshBtn, pressed && { opacity: 0.7 }]}
            onPress={load}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={COLORS.accent} size="small" />
              : <Text style={styles.refreshIcon}>↻</Text>
            }
          </Pressable>
        </View>

        {loading && listData.length === 0 && (
          <View style={styles.center}>
            <ActivityIndicator color={COLORS.accent} size="large" />
            <Text style={styles.loadingTxt}>Generating AI summary…</Text>
          </View>
        )}

        <FlatList
          data={listData}
          keyExtractor={(item, i) => item.key ?? `${item.type}-${item.urgency}-${i}`}
          contentContainerStyle={styles.list}
          refreshing={loading && listData.length > 0}
          onRefresh={load}
          renderItem={({ item }) => {
            if (item.type === 'header') {
              return <SectionHeader urgency={item.urgency} count={item.count} />;
            }
            return <SummaryCard item={item.item} />;
          }}
          ListEmptyComponent={
            !loading && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>📭</Text>
                <Text style={styles.emptyTitle}>Nothing to summarize</Text>
                <Text style={styles.emptySub}>
                  Once messages arrive, your AI summary will appear here. Refreshed daily at 8 AM UTC.
                </Text>
              </View>
            )
          }
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingTxt: { color: COLORS.textSecondary, fontSize: 14 },

  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
  },
  pageTitle:    { fontSize: 24, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  refreshBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.cardBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  refreshIcon: { fontSize: 20, color: COLORS.accent },

  list: { paddingHorizontal: 20, paddingBottom: 60 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: 4 },
  sectionDot:   { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  sectionCount: {
    fontSize: 12, fontWeight: '700', color: COLORS.textSecondary,
    backgroundColor: COLORS.card, borderRadius: 9999,
    paddingHorizontal: 7, paddingVertical: 1,
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },

  // Card
  card: {
    backgroundColor: COLORS.card, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.cardBorder,
    borderLeftWidth: 4, padding: 14, marginBottom: 10,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  fromTxt: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  platformTxt: { fontSize: 11, color: COLORS.textSecondary, marginTop: 1 },
  urgencyBadge: { borderRadius: 9999, paddingHorizontal: 10, paddingVertical: 3 },
  urgencyTxt:   { fontSize: 11, fontWeight: '700' },
  summaryTxt:   { fontSize: 13.5, color: COLORS.textSecondary, lineHeight: 20 },

  suggestionBox: {
    backgroundColor: COLORS.background, borderRadius: 8,
    padding: 10, marginTop: 10,
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  suggestionLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 },
  suggestionTxt:   { fontSize: 13, color: COLORS.text, fontStyle: 'italic', lineHeight: 19 },

  emptyState: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyEmoji: { fontSize: 52 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  emptySub: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22, maxWidth: 260 },
});
