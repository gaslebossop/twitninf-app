import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { colors, fonts, withAlpha } from '../../theme';
import { num } from './format';

/**
 * Le score de qualité, en anneau.
 *
 * Un pourcentage écrit seul ne dit pas s'il est bon : « 68 % » peut être un
 * plafond comme un plancher. L'anneau donne la réponse sans une ligne de
 * texte — la part remplie se compare instantanément au tour complet.
 *
 * L'arc démarre à midi (`rotation={-90}`) : un arc qui commence à 3 h se lit
 * comme une portion de camembert, pas comme une jauge.
 *
 * Rendu statique, sans animation de remplissage : ce n'est pas un chargement,
 * et faire tourner l'aiguille au montage rejouerait le « diaporama » que le
 * design system refuse.
 */

interface Props {
  /** Ratio 0–1. */
  value: number;
  size?: number;
  thickness?: number;
  label?: string;
  tint?: string;
  style?: StyleProp<ViewStyle>;
}

export default function QualityRing({
  value,
  size = 88,
  thickness = 7,
  label,
  tint = colors.accent,
  style,
}: Props) {
  const ratio = Math.max(0, Math.min(1, num(value)));
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  // Un score très bas laisserait l'anneau vide au point de paraître cassé :
  // 1,5 % de tour reste visible comme « presque rien », ce qui est exact.
  const filled = ratio > 0 ? Math.max(circumference * 0.015, circumference * ratio) : 0;

  return (
    <View style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={withAlpha(colors.textMuted, 0.22)}
          strokeWidth={thickness}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={tint}
          strokeWidth={thickness}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${filled} ${circumference}`}
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>

      <View style={styles.center} pointerEvents="none">
        <Text style={[styles.value, { color: tint, fontSize: size * 0.27 }]}>
          {Math.round(ratio * 100)}
        </Text>
        {!!label && <Text style={styles.label}>{label}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  value: { fontFamily: fonts.mono, letterSpacing: -1 },
  label: {
    marginTop: 1,
    fontFamily: fonts.bold,
    fontSize: 8.5,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
});
