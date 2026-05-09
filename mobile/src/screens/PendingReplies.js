// Pending Replies screen — review, edit, approve, or dismiss AI-drafted replies.

import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, Pressable, TextInput,
  StyleSheet, SafeAreaView, Modal, ActivityIndicator,
  Animated, Alert,
} from 'react-native';
import { useFocusEffect }        from '@react-navigation/native';
import { COLORS, PLATFORMS }     from '../constants/theme';
import * as api                  from '../services/api';
import { useHaptics }            from '../utils/haptics';

function timeAgo(iso) {
  if (!iso) return '—';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24)    return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Edit modal ───────────────────────────────────────────────────────────────

function EditModal({ visible, initialText, onSend, onCancel }) {
  const [text, setText] = useState(initialText);

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={styles.modalOverlay}>
        <View style={styles.editModal}>
          <View style={styles.editModalHeader}>
            <Text style={styles.editModalTitle}>Edit reply</Text>
            <Pressable onPress={onCancel} hitSlop={12}>
              <Text style={styles.editModalClose}>✕</Text>
            </Pressable>
          </View>
          <TextInput
            style={styles.editInput}
            value={text}
            onChangeText={setText}
            multiline
            autoFocus
            placeholder="Type your reply…"
            placeholderTextColor={COLORS.textMuted}
          />
          <Pressable
            style={({ pressed }) => [styles.sendBtn, pressed && { opacity: 0.8 }, !text.trim() && styles.sendBtnDisabled]}
            onPress={() => text.trim() && onSend(text.trim())}
            disabled={!text.trim()}
          >
            <Text style={styles.sendBtnTxt}>Send →</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ─── Reply card ───────────────────────────────────────────────────────────────

function ReplyCard({ item, onApprove, onEdit, onReject, actioning }) {
  const haptics = useHaptics();
  const meta    = PLATFORMS[item.platform] ?? { letter: '?', color: '#888', label: item.platform };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.platformBadge, { backgroundColor: meta.color + '22' }]}>
          <Text style={[styles.platformLetter, { color: meta.color }]}>{meta.letter}</Text>
        </View>
        <View style={styles.cardMeta}>
          <Text style={styles.fromTxt} numberOfLines={1}>{item.from_contact}</Text>
          <Text style={styles.timeTxt}>{timeAgo(item.created_at)}</Text>
        </View>
      </View>

      {/* Original message */}
      <View style={styles.originalBox}>
        <Text style={styles.originalLabel}>Message received</Text>
        <Text style={styles.originalBody} numberOfLines={3}>{item.original_body}</Text>
      </View>

      {/* AI suggestion */}
      <View style={styles.suggestionBox}>
        <Text style={styles.suggestionLabel}>AI draft</Text>
        <Text style={styles.suggestionBody}>{item.suggested_reply}</Text>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.approveBtn, pressed && { opacity: 0.8 }, actioning && styles.btnDisabled]}
          onPress={() => { haptics.success(); onApprove(item.id); }}
          disabled={actioning}
        >
          {actioning
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.approveBtnTxt}>Send ✓</Text>
          }
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.8 }, actioning && styles.btnDisabled]}
          onPress={() => onEdit(item)}
          disabled={actioning}
        >
          <Text style={styles.editBtnTxt}>Edit</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.dismissBtn, pressed && { opacity: 0.8 }, actioning && styles.btnDisabled]}
          onPress={() => onReject(item.id)}
          disabled={actioning}
        >
          <Text style={styles.dismissBtnTxt}>Dismiss</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PendingReplies() {
  const [replies,   setReplies]   = useState([]);
  const [total,     setTotal]     = useState(0);
  const [loading,   setLoading]   = useState(false);
  const [editItem,  setEditItem]  = useState(null); // item currently being edited
  const [actioning, setActioning] = useState(null); // id being processed

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getPendingReplies();
      setReplies(data.replies ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleApprove(id) {
    setActioning(id);
    try {
      await api.approveReply(id);
      setReplies((prev) => prev.filter((r) => r.id !== id));
      setTotal((t) => Math.max(0, t - 1));
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setActioning(null);
    }
  }

  async function handleEditSend(text) {
    if (!editItem) return;
    const id = editItem.id;
    setEditItem(null);
    setActioning(id);
    try {
      await api.editReply(id, text);
      setReplies((prev) => prev.filter((r) => r.id !== id));
      setTotal((t) => Math.max(0, t - 1));
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setActioning(null);
    }
  }

  async function handleReject(id) {
    setActioning(id);
    try {
      await api.rejectReply(id);
      setReplies((prev) => prev.filter((r) => r.id !== id));
      setTotal((t) => Math.max(0, t - 1));
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setActioning(null);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>

        <View style={styles.header}>
          <Text style={styles.pageTitle}>Pending</Text>
          {total > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeTxt}>{total}</Text>
            </View>
          )}
        </View>

        <FlatList
          data={replies}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          refreshing={loading}
          onRefresh={load}
          renderItem={({ item }) => (
            <ReplyCard
              item={item}
              onApprove={handleApprove}
              onEdit={setEditItem}
              onReject={handleReject}
              actioning={actioning === item.id}
            />
          )}
          ListEmptyComponent={
            !loading && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>✓</Text>
                <Text style={styles.emptyTitle}>All clear</Text>
                <Text style={styles.emptySub}>
                  No pending replies. Enable "Suggest" mode in Settings to review AI drafts before they send.
                </Text>
              </View>
            )
          }
        />
      </View>

      <EditModal
        visible={!!editItem}
        initialText={editItem?.suggested_reply ?? ''}
        onSend={handleEditSend}
        onCancel={() => setEditItem(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12,
  },
  pageTitle: { fontSize: 24, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  countBadge: {
    backgroundColor: COLORS.error, borderRadius: 999,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  countBadgeTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  list: { paddingHorizontal: 20, paddingBottom: 60 },

  // Card
  card: {
    backgroundColor: COLORS.card, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.cardBorder,
    padding: 16, marginBottom: 14,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  platformBadge: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  platformLetter: { fontSize: 13, fontWeight: '700' },
  cardMeta: { flex: 1 },
  fromTxt: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  timeTxt: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },

  originalBox: { marginBottom: 10 },
  originalLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  originalBody:  { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19, fontStyle: 'italic' },

  suggestionBox: {
    backgroundColor: COLORS.accentDim, borderRadius: 10,
    padding: 12, marginBottom: 14,
    borderWidth: 1, borderColor: COLORS.accent + '33',
  },
  suggestionLabel: { fontSize: 10, fontWeight: '700', color: COLORS.accent, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  suggestionBody:  { fontSize: 14, color: COLORS.text, lineHeight: 21 },

  actions: { flexDirection: 'row', gap: 8 },
  approveBtn: {
    flex: 2, backgroundColor: COLORS.success, borderRadius: 10,
    paddingVertical: 10, alignItems: 'center',
  },
  approveBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  editBtn: {
    flex: 1, backgroundColor: COLORS.card, borderRadius: 10,
    paddingVertical: 10, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  editBtnTxt: { color: COLORS.text, fontWeight: '600', fontSize: 14 },
  dismissBtn: {
    flex: 1, backgroundColor: COLORS.card, borderRadius: 10,
    paddingVertical: 10, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  dismissBtnTxt: { color: COLORS.error, fontWeight: '600', fontSize: 14 },
  btnDisabled: { opacity: 0.4 },

  // Edit modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  editModal: {
    backgroundColor: COLORS.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20,
  },
  editModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  editModalTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  editModalClose: { fontSize: 20, color: COLORS.textSecondary, paddingHorizontal: 4 },
  editInput: {
    backgroundColor: COLORS.background, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.cardBorder,
    color: COLORS.text, fontSize: 15, lineHeight: 22,
    padding: 14, minHeight: 120, marginBottom: 14,
    textAlignVertical: 'top',
  },
  sendBtn: {
    backgroundColor: COLORS.accent, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Empty
  emptyState: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyEmoji: { fontSize: 52, color: COLORS.success },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  emptySub: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22, maxWidth: 260 },
});
