import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, withAlpha } from '../../theme';
import Tappable from '../ui/Tappable';
import { compact, money, num, percent } from './format';

/**
 * Une publication et la part qu'elle a portée.
 *
 * Le montant est précédé d'un `≈` et jamais présenté autrement : le pot ne
 * paie pas au tweet, cette ligne est une répartition au prorata des vues (voir
 * `services/contentEarningsSplit.ts`). Le signe est là pour qu'on ne puisse
 * pas confondre cette estimation avec un versement — c'était précisément le
 * défaut de l'ancienne page, qui affichait comme acquis un chiffre recalculé.
 *
 * Le rang à gauche n'est pas décoratif : il donne le classement sans avoir à
 * comparer les barres entre elles.
 */

interface Props {
  rank: number;
  content: string;
  views: number;
  amount: number;
  /** Part des vues de la fenêtre, 0–1. */
  share: number;
  symbol: string;
  onPress?: () => void;
}

export default function ContentRow({ rank, content, views, amount, share, symbol, onPress }: Props) {
  const pct = Math.max(0, Math.min(1, num(share)));

  return (
    <Tappable
      onPress={onPress}
      disabled={!onPress}
      style={styles.wrap}
      scaleTo={0.99}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      <View style={styles.head}>
        <View style={[styles.rank, rank === 1 && styles.rankFirst]}>
          <Text style={[styles.rankText, rank === 1 && styles.rankTextFirst]}>{rank}</Text>
        </View>

        <Text style={styles.content} numberOfLines={2}>
          {content || 'Publication sans texte'}
        </Text>
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.max(2, pct * 100)}%` }]} />
      </View>

      <View style={styles.foot}>
        <Text style={styles.meta} numberOfLines={1}>
          {compact(views)} vues · {percent(pct)} de tes vues
        </Text>
        <Text style={styles.amount}>
          ≈ {money(amount)}
          <Text style={styles.symbol}> {symbol}</Text>
        </Text>
      </View>
    </Tappable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: 12,
    marginBottom: 8,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },

  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  rank: {
    width: 20,
    height: 20,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  rankFirst: { backgroundColor: colors.accentMuted },
  rankText: { fontFamily: fonts.mono, fontSize: 10, color: colors.textMuted },
  rankTextFirst: { color: colors.accent },

  content: { flex: 1, fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 17, color: colors.textPrimary },

  track: {
    height: 3,
    marginTop: 10,
    borderRadius: 2,
    backgroundColor: withAlpha(colors.textMuted, 0.16),
    overflow: 'hidden',
  },
  fill: { height: 3, borderRadius: 2, backgroundColor: colors.accent },

  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 7 },
  meta: { flex: 1, fontFamily: fonts.regular, fontSize: 10.5, color: colors.textMuted },
  amount: { fontFamily: fonts.mono, fontSize: 12, color: colors.textSecondary },
  symbol: { fontFamily: fonts.regular, fontSize: 10, color: colors.textMuted },
});
