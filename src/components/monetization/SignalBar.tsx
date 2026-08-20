import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, withAlpha } from '../../theme';
import { num, percent } from './format';

/**
 * Une composante de qualité, avec le rang dans le vivier.
 *
 * La barre montre le RANG (0 = dernier, 100 % = premier), jamais la valeur
 * brute : « 1,2 s de lecture moyenne » ne dit rien à personne, « devant 78 %
 * des créateurs » dit tout. La valeur brute reste en légende pour qui veut
 * vérifier — c'est le seul endroit où elle a sa place.
 *
 * Version compacte de ce que faisait l'ancienne page en trois lignes et
 * seize pixels de plus par signal : les quatre signaux tiennent maintenant
 * dans la hauteur qu'un seul occupait.
 */

interface Props {
  label: string;
  /** Rang dans le vivier, 0–1. */
  percentile: number;
  /** Poids du signal dans le score, 0–1. */
  weight: number;
  /** La mesure derrière le rang, en clair. */
  raw: string;
  /** Un signal qui se retranche : le rang haut est une mauvaise nouvelle. */
  negative?: boolean;
}

export default function SignalBar({ label, percentile, weight, raw, negative = false }: Props) {
  const pct = Math.max(0, Math.min(1, num(percentile)));
  const tint = negative ? colors.warning : colors.accent;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.weight, negative && styles.weightNegative]}>
          {negative ? '−' : ''}
          {percent(weight)}
        </Text>
      </View>

      <View style={styles.track}>
        {/* Plancher de 2 % : un rang nul doit rester une barre qu'on voit,
            sinon la ligne paraît ne pas avoir été mesurée. */}
        <View style={[styles.fill, { width: `${Math.max(2, pct * 100)}%`, backgroundColor: tint }]} />
      </View>

      <View style={styles.foot}>
        <Text style={styles.rank} numberOfLines={1}>
          {negative ? 'plus signalé que ' : 'devant '}
          <Text style={[styles.rankValue, { color: tint }]}>{percent(pct)}</Text>
          {' du vivier'}
        </Text>
        <Text style={styles.raw} numberOfLines={1}>
          {raw}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },

  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 },
  label: { flex: 1, fontFamily: fonts.medium, fontSize: 12.5, color: colors.textPrimary },
  weight: { fontFamily: fonts.mono, fontSize: 10.5, color: colors.textMuted },
  weightNegative: { color: colors.warning },

  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: withAlpha(colors.textMuted, 0.18),
    overflow: 'hidden',
  },
  fill: { height: 4, borderRadius: 2 },

  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 5 },
  rank: { flex: 1, fontFamily: fonts.regular, fontSize: 10.5, color: colors.textMuted },
  rankValue: { fontFamily: fonts.mono, fontSize: 10.5 },
  raw: { fontFamily: fonts.regular, fontSize: 10.5, color: colors.textMuted, opacity: 0.85 },
});
