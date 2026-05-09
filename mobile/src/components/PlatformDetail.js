// Full-screen modal for configuring a single platform — toggling, mode, schedule, and OAuth connect.

import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, ScrollView, TextInput,
  Pressable, StyleSheet, Alert,
} from 'react-native';
import { COLORS, PLATFORMS }       from '../constants/theme';
import Toggle                      from './Toggle';
import ModeSelector                from './ModeSelector';
import { connectPlatform }         from '../services/platformAuth';

/**
 * @param {{
 *   visible:  boolean,
 *   platform: string,
 *   config:   object,           PlatformConfig
 *   onClose:  () => void,
 *   onSave:   (updates: object) => void,
 *   onConnected?: () => void,   optional callback after successful OAuth
 * }} props
 */
export default function PlatformDetail({ visible, platform, config, onClose, onSave, onConnected }) {
  const meta = PLATFORMS[platform] ?? { label: platform, emoji: '📡', color: '#888' };

  // Local draft — committed only when the user taps Save
  const [enabled,       setEnabled]       = useState(config?.enabled       ?? false);
  const [mode,          setMode]           = useState(config?.mode          ?? 'assistant');
  const [scheduleOn,    setScheduleOn]     = useState(!!(config?.scheduleStart));
  const [scheduleStart, setScheduleStart]  = useState(config?.scheduleStart ?? '09:00');
  const [scheduleEnd,   setScheduleEnd]    = useState(config?.scheduleEnd   ?? '18:00');

  // Connection state
  const [connectStatus, setConnectStatus] = useState('idle'); // 'idle' | 'connecting' | 'connected' | 'error'
  const [connectError,  setConnectError]  = useState('');

  // Sync local state when the modal opens for a different platform
  useEffect(() => {
    if (visible) {
      setEnabled(config?.enabled ?? false);
      setMode(config?.mode ?? 'assistant');
      setScheduleOn(!!(config?.scheduleStart));
      setScheduleStart(config?.scheduleStart ?? '09:00');
      setScheduleEnd(config?.scheduleEnd   ?? '18:00');
      setConnectStatus('idle');
      setConnectError('');
    }
  }, [visible, config]);

  const handleSave = () => {
    onSave({
      platform,
      enabled,
      mode,
      scheduleStart: scheduleOn ? scheduleStart : null,
      scheduleEnd:   scheduleOn ? scheduleEnd   : null,
    });
    onClose();
  };

  // Launch the platform-specific OAuth flow via platformAuth.js
  const handleConnect = async () => {
    setConnectStatus('connecting');
    setConnectError('');
    try {
      const result = await connectPlatform(platform);
      if (result.success) {
        setConnectStatus('connected');
        // Automatically enable this platform after a successful connection
        setEnabled(true);
        onConnected?.();
      } else {
        // Non-throw failure (e.g. user cancelled)
        setConnectStatus(result.error ? 'error' : 'idle');
        if (result.error && result.error !== 'OAuth cancelled') {
          setConnectError(result.error);
        } else {
          setConnectStatus('idle');
        }
      }
    } catch (err) {
      setConnectStatus('error');
      setConnectError(err.message ?? 'Connection failed');
    }
  };

  // Button label and style reflect the current connection state
  const connectLabel = {
    idle:       `Connect ${meta.label} Account`,
    connecting: 'Opening browser…',
    connected:  `✓ ${meta.label} Connected`,
    error:      'Retry Connection',
  }[connectStatus];

  const connectBtnStyle = connectStatus === 'connected'
    ? [styles.connectBtn, styles.connectBtnSuccess]
    : styles.connectBtn;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.root}>

        {/* ── Header ───────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeTxt}>✕</Text>
          </Pressable>
          <View style={[styles.platformIcon, { backgroundColor: meta.color + '22' }]}>
            <Text style={{ fontSize: 26 }}>{meta.emoji}</Text>
          </View>
          <Text style={styles.title}>{meta.label}</Text>
        </View>

        <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 40 }}>

          {/* ── Enable / Disable ─────────────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.row}>
              <View>
                <Text style={styles.label}>Enable {meta.label}</Text>
                <Text style={styles.sublabel}>AI will monitor and reply to messages</Text>
              </View>
              <Toggle value={enabled} onChange={setEnabled} />
            </View>
          </View>

          {/* ── Mode selector ────────────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Reply Style</Text>
            <ModeSelector value={mode} onChange={setMode} disabled={!enabled} />
          </View>

          {/* ── Schedule ─────────────────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Active Hours</Text>
            <View style={styles.row}>
              <View>
                <Text style={styles.label}>Restrict to certain hours</Text>
                <Text style={styles.sublabel}>Only reply during these times (UTC)</Text>
              </View>
              <Toggle value={scheduleOn} onChange={setScheduleOn} disabled={!enabled} />
            </View>

            {scheduleOn && (
              <View style={styles.timeRow}>
                <View style={styles.timeField}>
                  <Text style={styles.timeLabel}>From</Text>
                  <TextInput
                    style={styles.timeInput}
                    value={scheduleStart}
                    onChangeText={setScheduleStart}
                    placeholder="09:00"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                  />
                </View>
                <Text style={styles.timeSeparator}>→</Text>
                <View style={styles.timeField}>
                  <Text style={styles.timeLabel}>To</Text>
                  <TextInput
                    style={styles.timeInput}
                    value={scheduleEnd}
                    onChangeText={setScheduleEnd}
                    placeholder="18:00"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                  />
                </View>
              </View>
            )}
          </View>

          {/* ── Connect account ──────────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Account</Text>

            {/* Error banner */}
            {connectStatus === 'error' && !!connectError && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorTxt}>{connectError}</Text>
              </View>
            )}

            <Pressable
              style={({ pressed }) => [connectBtnStyle, pressed && { opacity: 0.75 }]}
              onPress={handleConnect}
              disabled={connectStatus === 'connecting' || connectStatus === 'connected'}
            >
              <Text style={connectStatus === 'connected' ? styles.connectBtnTxtSuccess : styles.connectBtnTxt}>
                {connectLabel}
              </Text>
            </Pressable>
          </View>
        </ScrollView>

        {/* ── Save button ──────────────────────────────────────────────── */}
        <View style={styles.footer}>
          <Pressable
            style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }]}
            onPress={handleSave}
          >
            <Text style={styles.saveBtnTxt}>Save Changes</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: COLORS.background,
  },
  header: {
    alignItems:        'center',
    paddingTop:        24,
    paddingBottom:     20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
  },
  closeBtn: {
    position: 'absolute',
    top:       20,
    right:     20,
    padding:   8,
  },
  closeTxt: {
    color:    COLORS.textSecondary,
    fontSize: 18,
  },
  platformIcon: {
    width:          64,
    height:         64,
    borderRadius:   20,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   12,
  },
  title: {
    fontSize:   22,
    fontWeight: '700',
    color:      COLORS.text,
  },
  body: {
    flex: 1,
  },
  section: {
    marginHorizontal: 20,
    marginTop:        24,
  },
  sectionTitle: {
    fontSize:      12,
    fontWeight:    '600',
    color:         COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom:  12,
  },
  row: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize:   15,
    fontWeight: '500',
    color:      COLORS.text,
  },
  sublabel: {
    fontSize:  12,
    color:     COLORS.textSecondary,
    marginTop: 2,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems:    'center',
    marginTop:     16,
    gap:           12,
  },
  timeField: {
    flex: 1,
  },
  timeLabel: {
    fontSize:     11,
    color:        COLORS.textSecondary,
    marginBottom: 6,
  },
  timeInput: {
    backgroundColor:   COLORS.card,
    borderWidth:       1,
    borderColor:       COLORS.cardBorder,
    borderRadius:      10,
    paddingHorizontal: 14,
    paddingVertical:   12,
    color:             COLORS.text,
    fontSize:          16,
    fontWeight:        '600',
    textAlign:         'center',
  },
  timeSeparator: {
    color:     COLORS.textSecondary,
    fontSize:  18,
    marginTop: 20,
  },
  errorBanner: {
    backgroundColor: COLORS.error + '22',
    borderWidth:     1,
    borderColor:     COLORS.error + '55',
    borderRadius:    10,
    padding:         12,
    marginBottom:    12,
  },
  errorTxt: {
    color:    COLORS.error,
    fontSize: 14,
  },
  connectBtn: {
    backgroundColor: COLORS.card,
    borderWidth:     1,
    borderColor:     COLORS.accent,
    borderRadius:    12,
    paddingVertical: 14,
    alignItems:      'center',
  },
  connectBtnSuccess: {
    borderColor:     COLORS.success,
    backgroundColor: COLORS.success + '18',
  },
  connectBtnTxt: {
    color:      COLORS.accent,
    fontSize:   15,
    fontWeight: '600',
  },
  connectBtnTxtSuccess: {
    color:      COLORS.success,
    fontSize:   15,
    fontWeight: '600',
  },
  footer: {
    padding:          20,
    borderTopWidth:   1,
    borderTopColor:   COLORS.cardBorder,
  },
  saveBtn: {
    backgroundColor: COLORS.accent,
    borderRadius:    14,
    paddingVertical: 16,
    alignItems:      'center',
  },
  saveBtnTxt: {
    color:      '#FFFFFF',
    fontSize:   16,
    fontWeight: '700',
  },
});
