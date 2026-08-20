import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { colors, fonts, radius } from '../../theme';
import Tappable from '../ui/Tappable';

/**
 * La tuile chiffrée du tableau de bord.
 *
 * Trois niveaux typographiques, toujours dans le même ordre : l'étiquette en
 * petites capitales (on la lit une fois, puis on l'ignore), la valeur en gros
 * (c'est elle qu'on vient chercher), la précision en dessous (elle ne se lit
 * que si la valeur surprend). L'ancienne page mettait les trois à la même
 * taille, ce qui obligeait à tout lire pour trouver le chiffre.
 *
 * La valeur et son unité sont sur la même ligne de base : « 412,00 NF » doit
 * se lire comme un montant, pas comme deux informations empilées.
 */

export type MetricTone = 'default' | 'accent' | 'success' | 'warning';

interface Props {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: MetricTone;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

const TONE_COLOR: Record<MetricTone, string> = {
  default: colors.textPrimary,
  accent: colors.accent,
  success: colors.success,
  warning: colors.warning,
};

export default function MetricTile({
  label,
  value,
  unit,
  hint,
  icon,
  tone = 'default',
  onPress,
  style,
}: Props) {
  const tint = TONE_COLOR[tone];

  const body = (
    <>
      <View style={styles.head}>
        {!!icon && <Ionicons name={icon} size={12} color={colors.textMuted} />}
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        {!!onPress && (
          <Ionicons name="chevron-forward" size={12} color={colors.textMuted} style={styles.chevron} />
        )}
      </View>

      <View style={styles.valueRow}>
        <Text style={[styles.value, { color: tint }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {value}
        </Text>
        {!!unit && <Text style={styles.unit}>{unit}</Text>}
      </View>

      {!!hint && (
        <Text style={styles.hint} numberOfLines={1}>
          {hint}
        </Text>
      )}
    </>
  );

  if (onPress) {
    return (
      <Tappable onPress={onPress} style={[styles.tile, style]} scaleTo={0.98}>
        {body}
      </Tappable>
    );
  }

  return <View style={[styles.tile, style]}>{body}</View>;
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },

  head: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  label: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 9.5,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  chevron: { marginRight: -2 },

  // `baseline` plutôt que `center` : sans ça, l'unité flotte au milieu de la
  // hauteur du chiffre au lieu de s'asseoir dessus.
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 5 },
  // `fonts.mono` (Space Mono) et non `fonts.bold` : en chasse fixe, les
  // chiffres d'une tuile s'alignent verticalement avec ceux de la tuile du
  // dessous. C'est ce qui distingue une grille de mesures d'une liste de mots.
  value: { fontFamily: fonts.mono, fontSize: 17, letterSpacing: -0.6 },
  unit: { fontFamily: fonts.medium, fontSize: 11, color: colors.textSecondary },

  hint: { marginTop: 2, fontFamily: fonts.regular, fontSize: 10.5, color: colors.textMuted },
});
