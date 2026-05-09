// WhatsApp personal connection modal — shows QR code to scan in WhatsApp.

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, Image, Pressable, ActivityIndicator,
  StyleSheet, Modal,
} from 'react-native';
import { COLORS } from '../constants/theme';
import * as api   from '../services/api';

const POLL_MS = 3000;

export default function WhatsAppQRModal({ visible, onConnected, onClose }) {
  const [status,   setStatus]   = useState('loading'); // loading | qr | connected | error
  const [qrCode,   setQrCode]   = useState(null);
  const [phone,    setPhone]     = useState(null);
  const pollerRef = useRef(null);

  useEffect(() => {
    if (!visible) {
      clearInterval(pollerRef.current);
      return;
    }
    startConnect();
    return () => clearInterval(pollerRef.current);
  }, [visible]);

  async function startConnect() {
    setStatus('loading');
    setQrCode(null);
    try {
      await api.waConnect();
      poll();
      pollerRef.current = setInterval(poll, POLL_MS);
    } catch (err) {
      setStatus('error');
    }
  }

  async function poll() {
    try {
      const data = await api.waStatus();
      if (data.status === 'connected') {
        clearInterval(pollerRef.current);
        setPhone(data.phoneNumber);
        setStatus('connected');
        setTimeout(() => onConnected?.(data.phoneNumber), 1000);
      } else if (data.qrCode) {
        setQrCode(data.qrCode);
        setStatus('qr');
      }
    } catch {
      // Keep polling
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={styles.title}>Connect WhatsApp</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.closeBtn}>✕</Text>
            </Pressable>
          </View>

          {status === 'loading' && (
            <View style={styles.center}>
              <ActivityIndicator color={COLORS.accent} size="large" />
              <Text style={styles.hint}>Generating QR code…</Text>
            </View>
          )}

          {status === 'qr' && qrCode && (
            <View style={styles.center}>
              <View style={styles.qrContainer}>
                <Image
                  source={{ uri: `data:image/png;base64,${qrCode}` }}
                  style={styles.qrImage}
                  resizeMode="contain"
                />
              </View>
              <Text style={styles.hint}>Open WhatsApp → Linked Devices → Link a Device</Text>
              <Text style={styles.subHint}>Scan the QR code above</Text>
            </View>
          )}

          {status === 'connected' && (
            <View style={styles.center}>
              <Text style={styles.successEmoji}>✓</Text>
              <Text style={styles.successTxt}>WhatsApp Connected</Text>
              {phone && <Text style={styles.phoneTxt}>+{phone}</Text>}
            </View>
          )}

          {status === 'error' && (
            <View style={styles.center}>
              <Text style={styles.errorEmoji}>⚠</Text>
              <Text style={styles.errorTxt}>Connection failed</Text>
              <Pressable style={styles.retryBtn} onPress={startConnect}>
                <Text style={styles.retryBtnTxt}>Try Again</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, minHeight: 420,
  },
  handle: {
    width: 36, height: 4, backgroundColor: COLORS.cardBorder,
    borderRadius: 2, alignSelf: 'center', marginBottom: 16,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24,
  },
  title:    { fontSize: 18, fontWeight: '700', color: COLORS.text },
  closeBtn: { fontSize: 20, color: COLORS.textSecondary, paddingHorizontal: 4 },
  center: { alignItems: 'center', gap: 14, paddingVertical: 20 },

  qrContainer: {
    backgroundColor: '#fff', borderRadius: 16, padding: 12,
    width: 220, height: 220,
    alignItems: 'center', justifyContent: 'center',
  },
  qrImage: { width: 196, height: 196 },
  hint:    { fontSize: 14, color: COLORS.text, fontWeight: '500', textAlign: 'center', maxWidth: 260 },
  subHint: { fontSize: 12, color: COLORS.textSecondary, textAlign: 'center' },

  successEmoji: { fontSize: 52, color: COLORS.success },
  successTxt:   { fontSize: 18, fontWeight: '700', color: COLORS.success },
  phoneTxt:     { fontSize: 15, color: COLORS.textSecondary },

  errorEmoji: { fontSize: 52 },
  errorTxt:   { fontSize: 16, fontWeight: '600', color: COLORS.error },
  retryBtn: {
    backgroundColor: COLORS.accent, borderRadius: 10,
    paddingHorizontal: 24, paddingVertical: 12, marginTop: 4,
  },
  retryBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
