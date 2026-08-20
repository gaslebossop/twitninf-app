import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { colors, fonts, withAlpha } from '../../theme';
import { num } from './format';

/**
 * Un critère d'entrée dans le programme, et où on en est.
 *
 * La barre s'arrête au seuil : dépasser de 300 % ne remplit pas trois fois la
 * barre, ce qui écraserait visuellement les critères encore en cours. Ce qui
 * compte est « est-ce franchi », pas « de combien ».
 *
 * Le reste à parcourir est écrit en clair sous la barre quand le critère n'est
 * pas atteint — « il te manque 4 200 vues » est actionnable, « 58 % » ne l'est
 * pas.
 */

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  /** Valeur actuelle, déjà formatée. */
  current: string;
  /** Seuil à franchir, déjà formaté. */
  target: string;
  /** Progression 0–1, bornée à 1 par le composant. */
  ratio: number;
  done: boolean;
  /** Ce qu'il reste à faire, en clair. Ignoré si le critère est atteint. */
  remaining?: string;
}

export default function CriterionRow({ icon, label, current, target, ratio, done, remaining }: Props) {
  const pct = Math.max(0, Math.min(1, num(ratio))) * 100;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <View style={[styles.icon, done && styles.iconDone]}>
          <Ionicons
            name={done ? 'checkmark' : icon}
            size={12}
            color={done ? colors.onAccent : colors.textMuted}
          />
        </View>

        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>

        <Text style={styles.values}>
          <Text style={[styles.current, done && styles.currentDone]}>{current}</Text>
          <Text style={styles.target}> / {target}</Text>
        </Text>
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.max(1.5, pct)}%` }, done && styles.fillDone]} />
      </View>

      {!done && !!remaining && <Text style={styles.remaining}>{remaining}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 13 },

  head: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 7 },
  icon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  iconDone: { backgroundColor: colors.success },

  label: { flex: 1, fontFamily: fonts.medium, fontSize: 12.5, color: colors.textPrimary },
  values: { fontFamily: fonts.mono, fontSize: 11 },
  current: { color: colors.textSecondary },
  currentDone: { color: colors.success },
  target: { fontFamily: fonts.regular, fontSize: 10, color: colors.textMuted },

  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: withAlpha(colors.textMuted, 0.18),
    overflow: 'hidden',
  },
  fill: { height: 4, borderRadius: 2, backgroundColor: colors.accent },
  fillDone: { backgroundColor: colors.success },

  remaining: { marginTop: 5, fontFamily: fonts.regular, fontSize: 10.5, color: colors.textMuted },
});
