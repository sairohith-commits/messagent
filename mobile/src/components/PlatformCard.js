// Compact card shown in the Dashboard list for each platform.
// Tapping the card opens the PlatformDetail modal.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { COLORS, PLATFORMS } from '../constants/theme';
import Toggle from './Toggle';

/**
 * @param {{
 *   platform:    string,
 *   enabled:     boolean,
 *   mode:        string,
 *   connected:   boolean,
 *   onToggle:    (enabled: boolean) => void,
 *   onPress:     () => void,
 * }} props
 */
export default function PlatformCard({ platform, enabled, mode, connected, onToggle, onPress }) {
  const meta = PLATFORMS[platform] ?? { label: platform, emoji: '📡', color: '#888', letter: '?' };

  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.cardPressed]} onPress={onPress}>
      {/* Left: coloured platform avatar */}
      <View style={[styles.avatar, { backgroundColor: meta.color + '22' }]}>
        <Text style={[styles.avatarText, { color: meta.color }]}>{meta.letter}</Text>
      </View>

      {/* Centre: name + mode badge */}
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{meta.label}</Text>
          {/* Green dot signals the agent is actively monitoring this platform */}
          {enabled && <View style={styles.activeDot} />}
        </View>
        {connected ? (
          <Text style={styles.modeBadge}>
            {mode === 'owner' ? '👤 Owner mode' : '🤖 Assistant mode'}
          </Text>
        ) : (
          <Text style={styles.connectHint}>Tap to connect</Text>
        )}
      </View>

      {/* Right: toggle — tapping the toggle doesn't open the detail modal */}
      <Pressable onPress={() => onToggle(!enabled)} hitSlop={8}>
        <Toggle value={enabled} onChange={onToggle} disabled={!connected} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection:  'row',
    alignItems:     'center',
    backgroundColor: COLORS.card,
    borderRadius:   16,
    borderWidth:    1,
    borderColor:    COLORS.cardBorder,
    padding:        16,
    marginBottom:   12,
  },
  cardPressed: {
    opacity: 0.85,
  },
  avatar: {
    width:         44,
    height:        44,
    borderRadius:  12,
    alignItems:    'center',
    justifyContent: 'center',
    marginRight:   14,
  },
  avatarText: {
    fontSize:   16,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  info: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
  },
  name: {
    fontSize:   16,
    fontWeight: '600',
    color:      COLORS.text,
  },
  activeDot: {
    width:         8,
    height:        8,
    borderRadius:  4,
    backgroundColor: COLORS.success,
  },
  modeBadge: {
    fontSize:  12,
    color:     COLORS.textSecondary,
    marginTop: 3,
  },
  connectHint: {
    fontSize:  12,
    color:     COLORS.accent,
    marginTop: 3,
  },
});
