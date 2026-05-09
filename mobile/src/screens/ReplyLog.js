// Reply log screen — paginated list of AI replies with thumbs rating.

import React, { useEffect } from 'react';
import {
  View, Text, FlatList, Pressable,
  StyleSheet, SafeAreaView, ActivityIndicator,
} from 'react-native';
import { COLORS, PLATFORMS } from '../constants/theme';
import { useReplyLog }       from '../hooks/useReplyLog';

/**
 * Format a timestamp into a short human-readable string.
 * e.g. "3h ago", "2d ago", "Just now"
 */
function timeAgo(isoString) {
  if (!isoString) return '—';
  const diffMs  = Date.now() - new Date(isoString).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1)  return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)   return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

function LogItem({ log, onRate }) {
  const meta    = PLATFORMS[log.platform] ?? { letter: '?', color: '#888', label: log.platform };
  const rated   = log.rating;

  return (
    <View style={styles.logCard}>
      {/* Platform badge + contact */}
      <View style={styles.logHeader}>
        <View style={[styles.platformBadge, { backgroundColor: meta.color + '22' }]}>
          <Text style={[styles.platformLetter, { color: meta.color }]}>{meta.letter}</Text>
        </View>
        <View style={styles.logMeta}>
          <Text style={styles.contact} numberOfLines={1}>
            {log.from_contact ?? 'Unknown sender'}
          </Text>
          <Text style={styles.time}>{timeAgo(log.sent_at)}</Text>
        </View>
        {/* Model badge — shows whether Claude or Gemma generated this reply */}
        <View style={styles.modelBadge}>
          <Text style={styles.modelTxt}>{log.model_used}</Text>
        </View>
      </View>

      {/* Original message preview */}
      {log.original_message ? (
        <Text style={styles.originalMsg} numberOfLines={2}>
          ↩ {log.original_message}
        </Text>
      ) : null}

      {/* AI reply body */}
      <Text style={styles.replyBody} numberOfLines={3}>
        {log.reply_body}
      </Text>

      {/* Rating buttons */}
      <View style={styles.ratingRow}>
        <Pressable
          style={[styles.ratingBtn, rated === 1 && styles.ratingActive]}
          onPress={() => onRate(log.id, 1)}
        >
          <Text style={styles.ratingEmoji}>👍</Text>
        </Pressable>
        <Pressable
          style={[styles.ratingBtn, rated === -1 && styles.ratingActive]}
          onPress={() => onRate(log.id, -1)}
        >
          <Text style={styles.ratingEmoji}>👎</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function ReplyLog() {
  const { logs, total, isLoading, refresh, loadMore, rateReply } = useReplyLog();

  // Load first page on mount
  useEffect(() => {
    refresh();
  }, []);

  if (isLoading && logs.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.accent} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>

        {/* ── Header ───────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={styles.pageTitle}>Replies</Text>
          {total > 0 && (
            <Text style={styles.totalTxt}>{total} total</Text>
          )}
        </View>

        {/* ── Log list ─────────────────────────────────────────────────── */}
        <FlatList
          data={logs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          onRefresh={refresh}
          refreshing={isLoading && logs.length > 0}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          renderItem={({ item }) => (
            <LogItem log={item} onRate={rateReply} />
          )}
          ListFooterComponent={
            isLoading && logs.length > 0
              ? <ActivityIndicator color={COLORS.accent} style={{ marginVertical: 16 }} />
              : null
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>🤫</Text>
              <Text style={styles.emptyTitle}>No replies yet</Text>
              <Text style={styles.emptySub}>
                Enable a platform on the Dashboard to get started
              </Text>
            </View>
          }
        />
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
    flex: 1,
  },
  center: {
    flex:           1,
    justifyContent: 'center',
    alignItems:     'center',
  },
  header: {
    flexDirection:     'row',
    alignItems:        'baseline',
    gap:               10,
    paddingHorizontal: 20,
    paddingTop:        20,
    paddingBottom:     12,
  },
  pageTitle: {
    fontSize:   24,
    fontWeight: '800',
    color:      COLORS.text,
    letterSpacing: -0.5,
  },
  totalTxt: {
    fontSize: 14,
    color:    COLORS.textSecondary,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom:     40,
  },
  // Log card
  logCard: {
    backgroundColor: COLORS.card,
    borderRadius:    16,
    borderWidth:     1,
    borderColor:     COLORS.cardBorder,
    padding:         16,
    marginBottom:    12,
  },
  logHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    marginBottom:   10,
    gap:            10,
  },
  platformBadge: {
    width:         36,
    height:        36,
    borderRadius:  10,
    alignItems:    'center',
    justifyContent: 'center',
  },
  platformLetter: {
    fontSize:   13,
    fontWeight: '700',
  },
  logMeta: {
    flex: 1,
  },
  contact: {
    fontSize:   14,
    fontWeight: '600',
    color:      COLORS.text,
  },
  time: {
    fontSize:  12,
    color:     COLORS.textSecondary,
    marginTop: 1,
  },
  modelBadge: {
    backgroundColor: COLORS.background,
    borderRadius:    6,
    paddingHorizontal: 7,
    paddingVertical:   3,
    borderWidth:     1,
    borderColor:     COLORS.cardBorder,
  },
  modelTxt: {
    fontSize:   10,
    color:      COLORS.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  originalMsg: {
    fontSize:         13,
    color:            COLORS.textMuted,
    fontStyle:        'italic',
    marginBottom:     8,
    lineHeight:       18,
  },
  replyBody: {
    fontSize:  14,
    color:     COLORS.text,
    lineHeight: 21,
  },
  ratingRow: {
    flexDirection:  'row',
    gap:            8,
    marginTop:      12,
  },
  ratingBtn: {
    paddingHorizontal: 12,
    paddingVertical:    6,
    borderRadius:      8,
    borderWidth:       1,
    borderColor:       COLORS.cardBorder,
    backgroundColor:   COLORS.background,
  },
  ratingActive: {
    borderColor:     COLORS.accent,
    backgroundColor: COLORS.accentDim,
  },
  ratingEmoji: {
    fontSize: 16,
  },
  // Empty state
  emptyState: {
    alignItems:  'center',
    paddingTop:  80,
    gap:         12,
  },
  emptyEmoji: {
    fontSize: 52,
  },
  emptyTitle: {
    fontSize:   20,
    fontWeight: '700',
    color:      COLORS.text,
  },
  emptySub: {
    fontSize:  14,
    color:     COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth:  260,
  },
});
