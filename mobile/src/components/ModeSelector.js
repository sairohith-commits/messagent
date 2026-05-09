// Two-button segmented selector for choosing between Owner and Assistant mode.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { COLORS } from '../constants/theme';

const OPTIONS = [
  {
    value: 'owner',
    label: 'Owner',
    // Replies naturally as the user — sounds like you wrote it yourself
    sublabel: 'Replies as you',
  },
  {
    value: 'assistant',
    label: 'Assistant',
    // Transparent — lets sender know the owner is unavailable
    sublabel: 'Replies on your behalf',
  },
];

/**
 * @param {{
 *   value:    'owner' | 'assistant',
 *   onChange: (mode: 'owner' | 'assistant') => void,
 *   disabled?: boolean,
 * }} props
 */
export default function ModeSelector({ value, onChange, disabled = false }) {
  return (
    <View style={styles.container}>
      {OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            style={[styles.option, active && styles.optionActive]}
            onPress={() => !disabled && onChange(opt.value)}
            disabled={disabled}
          >
            <Text style={[styles.label, active && styles.labelActive]}>
              {opt.label}
            </Text>
            <Text style={[styles.sublabel, active && styles.sublabelActive]}>
              {opt.sublabel}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: COLORS.background,
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     COLORS.cardBorder,
    overflow:        'hidden',
  },
  option: {
    flex:            1,
    paddingVertical: 12,
    alignItems:      'center',
    backgroundColor: 'transparent',
  },
  optionActive: {
    backgroundColor: COLORS.accentDim,
    borderRadius:    11,
    margin:          2,
  },
  label: {
    fontSize:   14,
    fontWeight: '600',
    color:      COLORS.textSecondary,
  },
  labelActive: {
    color: COLORS.accent,
  },
  sublabel: {
    fontSize:   11,
    color:      COLORS.textMuted,
    marginTop:  2,
  },
  sublabelActive: {
    color: COLORS.accent,
    opacity: 0.7,
  },
});
