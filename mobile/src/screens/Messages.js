// Messages screen — all incoming messages with platform filter and status.

import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable,
  StyleSheet, SafeAreaView, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, PLATFORMS } from '../constants/theme';
import * as api              from '../services/api';

const FILTERS = ['all', 'replied', 'pending_approval', 'skipped', 'failed'];
const FILTER_LABELS = {
  all:             'All',
  replied:         'Replied',
  pending_approval: 'Pending',
  skipped:         'Skipped',
  failed:          'Failed',
};

const STATUS_COLOR = {
  replied:          COLORS.success,
  pending_approval: COLORS.warning,
  pending:          COLORS.textSecondary,
  skipped:          COLORS.textMuted,
  failed:           COLORS.error,
};

function timeAgo(iso) {
  if (!iso) return '—';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24)    return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function MessageItem({ item }) {
  const meta = PLATFORMS[item.platform] ?? { letter: '?', color: '#888' };
  const statusColor = STATUS_COLOR[item.status] ?? COLORS.textSecondary;

  return (
    <View style={styles.msgCard}>
      <View style={styles.msgHeader}>
        <View style={[styles.platformBadge, { backgroundColor: meta.color + '22' }]}>
          <Text style={[styles.platformLetter, { color: meta.color }]}>{meta.letter}</Text>
        </View>
        <View style={styles.msgMeta}>
          <Text style={styles.fromTxt} numberOfLines={1}>{item.from_contact}</Text>
          {item.subject && (
            <Text style={styles.subjectTxt} numberOfLines={1}>{item.subject}</Text>
          )}
        </View>
        <View style={styles.msgRight}>
          <Text style={styles.timeTxt}>{timeAgo(item.received_at)}</Text>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        </View>
      </View>

      <Text style={styles.bodyTxt} numberOfLines={2}>{item.body}</Text>

      <View style={styles.statusRow}>
        <Text style={[styles.statusTxt, { color: statusColor }]}>
          {(item.status ?? '').replace('_', ' ')}
        </Text>
      </View>
    </View>
  );
}

export default function Messages() {
  const [messages, setMessages] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [filter,   setFilter]   = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getRecentMessages(100);
      setMessages(data.messages ?? []);
    } catch {
      // Non-fatal — leave previous list
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const visible = filter === 'all'
    ? messages
    : messages.filter((m) => m.status === filter);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>

        <View style={styles.header}>
          <Text style={styles.pageTitle}>Messages</Text>
          <Text style={styles.countTxt}>{visible.length}</Text>
        </View>

        {/* Filter chips */}
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={FILTERS}
          keyExtractor={(k) => k}
          contentContainerStyle={styles.filterList}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.chip, filter === item && styles.chipActive]}
              onPress={() => setFilter(item)}
            >
              <Text style={[styles.chipTxt, filter === item && styles.chipTxtActive]}>
                {FILTER_LABELS[item]}
              </Text>
            </Pressable>
          )}
          style={styles.filterRow}
        />

        <FlatList
          data={visible}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          refreshing={loading}
          onRefresh={load}
          renderItem={({ item }) => <MessageItem item={item} />}
          ListEmptyComponent={
            !loading && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>📭</Text>
                <Text style={styles.emptyTitle}>No messages</Text>
                <Text style={styles.emptySub}>
                  {filter === 'all'
                    ? 'Connect a platform to start receiving messages.'
                    : `No ${FILTER_LABELS[filter].toLowerCase()} messages.`}
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
  header: {
    flexDirection: 'row', alignItems: 'baseline', gap: 10,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8,
  },
  pageTitle: { fontSize: 24, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  countTxt:  { fontSize: 14, color: COLORS.textSecondary },

  filterRow: { flexGrow: 0, marginBottom: 8 },
  filterList: { paddingHorizontal: 20, gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  chipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  chipTxt: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  chipTxtActive: { color: '#fff' },

  list: { paddingHorizontal: 20, paddingBottom: 60 },

  msgCard: {
    backgroundColor: COLORS.card, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.cardBorder,
    padding: 14, marginBottom: 10,
  },
  msgHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  platformBadge: {
    width: 34, height: 34, borderRadius: 9, flexShrink: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  platformLetter: { fontSize: 12, fontWeight: '700' },
  msgMeta: { flex: 1 },
  fromTxt: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  subjectTxt: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },
  msgRight: { alignItems: 'flex-end', gap: 6 },
  timeTxt: { fontSize: 11, color: COLORS.textMuted },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  bodyTxt: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19, marginBottom: 8 },
  statusRow: { flexDirection: 'row' },
  statusTxt: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },

  emptyState: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyEmoji: { fontSize: 52 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  emptySub:   { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22, maxWidth: 260 },
});
