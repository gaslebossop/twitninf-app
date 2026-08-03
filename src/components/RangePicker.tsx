import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, fonts } from '../theme';
import type { ChartRange } from '../services/newEconomyService';

const RANGE_LABELS: Record<ChartRange, string> = { '1h': '1H', '24h': '24H', '7d': '7J', '30d': '30J' };
const RANGE_OPTIONS: ChartRange[] = ['1h', '24h', '7d', '30d'];

/** Sélecteur d'intervalle partagé par les graphiques de cours (NF et monnaies communautaires) — équivalent du RangePicker de l'app Windows. */
export default function RangePicker({ value, onChange }: { value: ChartRange; onChange: (range: ChartRange) => void }) {
  return (
    <View style={styles.track}>
      {RANGE_OPTIONS.map((r) => (
        <TouchableOpacity
          key={r}
          style={[styles.button, value === r && styles.buttonActive]}
          onPress={() => onChange(r)}
        >
          <Text style={[styles.text, value === r && styles.textActive]}>{RANGE_LABELS[r]}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    gap: 4,
    padding: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: 'flex-start',
  },
  button: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999 },
  buttonActive: { backgroundColor: colors.accent },
  text: { fontSize: 10.5, fontWeight: '600', fontFamily: fonts.semibold, color: colors.textSecondary },
  textActive: { color: colors.onAccent },
});
