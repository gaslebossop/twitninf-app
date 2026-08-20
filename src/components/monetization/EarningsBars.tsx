import React, { useMemo } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { colors, fonts, withAlpha } from '../../theme';
import Tappable from '../ui/Tappable';
import { money, num } from './format';

/**
 * Histogramme des dernières semaines.
 *
 * Il répond à la seule question qu'on se pose en ouvrant l'écran — « est-ce
 * que ça monte ? » — et l'ancienne page n'y répondait pas : elle listait des
 * montants en colonne, ce qui oblige à comparer des nombres de tête.
 *
 * Trois partis pris :
 *
 * - Des `View` empilées, pas du SVG. Huit rectangles pleins n'ont pas besoin
 *   d'un moteur vectoriel, et une `View` reste tapable sans surcouche.
 * - Aucune animation d'entrée. Des barres qui poussent au montage, c'est le
 *   « diaporama » explicitement rejeté par le design system : l'écran doit
 *   être lisible à l'instant où il s'affiche. Seule la sélection anime.
 * - Une semaine à zéro garde un trait de 3 px. Une colonne absente se lit
 *   comme une donnée manquante ; un trait au ras du sol se lit comme un zéro,
 *   ce qui est l'information exacte.
 */

export type BarKind = 'claimed' | 'claimable' | 'projected';

export interface EarningsBar {
  key: string;
  /** Sous la barre, très court : « 11/08 ». */
  short: string;
  amount: number;
  kind: BarKind;
}

interface Props {
  bars: EarningsBar[];
  symbol: string;
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
  height?: number;
  style?: StyleProp<ViewStyle>;
}

const TRACK_MIN = 3;

export default function EarningsBars({
  bars,
  symbol,
  selectedKey,
  onSelect,
  height = 76,
  style,
}: Props) {
  const max = useMemo(
    () => bars.reduce((acc, b) => Math.max(acc, num(b.amount)), 0),
    [bars],
  );

  if (!bars.length) return null;

  return (
    <View style={[styles.wrap, style]}>
      <View style={[styles.row, { height }]}>
        {bars.map((bar) => {
          const amount = num(bar.amount);
          // Proportion sur le max de la série, pas sur un plafond fixe : une
          // semaine faible reste visible quand la série entière est faible.
          const ratio = max > 0 ? amount / max : 0;
          const barHeight = Math.max(TRACK_MIN, Math.round(ratio * (height - 4)));
          const selected = selectedKey === bar.key;

          return (
            <Tappable
              key={bar.key}
              style={styles.column}
              onPress={onSelect ? () => onSelect(bar.key) : undefined}
              disabled={!onSelect}
              scaleTo={0.94}
              haptic="select"
              accessibilityRole="button"
              accessibilityLabel={`${bar.short} : ${money(amount)} ${symbol}`}
            >
              <View style={styles.columnInner}>
                <View
                  style={[
                    styles.bar,
                    { height: barHeight },
                    bar.kind === 'claimed' && styles.barClaimed,
                    bar.kind === 'claimable' && styles.barClaimable,
                    bar.kind === 'projected' && styles.barProjected,
                    selected && styles.barSelected,
                  ]}
                />
              </View>
              <Text style={[styles.tick, selected && styles.tickSelected]} numberOfLines={1}>
                {bar.short}
              </Text>
            </Tappable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 5 },

  column: { flex: 1, minWidth: 0, height: '100%' },
  // La barre pousse depuis le bas ; sans `justifyContent: flex-end`, une
  // barre courte se collerait en haut de sa colonne.
  columnInner: { flex: 1, justifyContent: 'flex-end' },

  bar: { width: '100%', borderRadius: 3, backgroundColor: colors.surfaceElevated },
  /** Déjà encaissé : présent, mais ce n'est plus de l'argent en attente. */
  barClaimed: { backgroundColor: withAlpha(colors.accent, 0.34) },
  /** À encaisser : c'est là que l'œil doit tomber. */
  barClaimable: { backgroundColor: colors.accent },
  /**
   * Semaine en cours : creux et pointillé, parce que ce n'est pas un fait.
   * Une projection pleine au milieu de montants figés se lirait comme acquise.
   */
  barProjected: {
    backgroundColor: withAlpha(colors.accent, 0.1),
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: withAlpha(colors.accent, 0.55),
  },
  barSelected: { backgroundColor: colors.accentBright },

  tick: {
    marginTop: 6,
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: 9,
    color: colors.textMuted,
  },
  tickSelected: { fontFamily: fonts.bold, color: colors.textSecondary },
});
