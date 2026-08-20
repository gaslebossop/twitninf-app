import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { colors, fonts } from '../../theme';

/**
 * Le titre de section du tableau de bord de monétisation.
 *
 * Contraire au `SectionLabel` partagé (une étiquette seule, flottante), le
 * titre est ici porté par une ligne : le libellé à gauche, un filet qui court
 * jusqu'au bord droit, et éventuellement une précision calée au bout du filet.
 *
 * C'est ce filet qui fait « document financier » : il ancre chaque section sur
 * l'axe horizontal du tableau de bord et sépare les blocs sans empiler des
 * marges vides. Un libellé seul, lui, flotte entre deux cartes sans qu'on sache
 * s'il annonce celle du dessus ou commente celle du dessous.
 */

interface Props {
  children: React.ReactNode;
  /** Précision alignée à droite, sur le filet : compte à rebours, compteur… */
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default function SectionHeading({ children, right, style }: Props) {
  return (
    <View style={[styles.row, style]}>
      <Text style={styles.label} numberOfLines={1}>
        {children}
      </Text>
      <View style={styles.rule} />
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    marginBottom: 10,
  },
  label: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors.textSecondary,
  },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
});
