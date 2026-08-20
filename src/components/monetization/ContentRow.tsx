import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../../theme';
import Tappable from '../ui/Tappable';
import { compact, money, num, percent } from './format';

/**
 * Une publication et la part qu'elle a portée.
 *
 * ── Ce que cette ligne était, et pourquoi ça ne marchait pas ────────────────
 * Une carte grise arrondie, un badge de rang en pastille, une barre de
 * progression, et du texte à 10,5 px. C'est-à-dire, à elle seule, tout le
 * vocabulaire « tableau de bord généré » que le reste de l'écran a justement
 * abandonné — et ça se voyait : la liste tranchait avec la page.
 *
 * Trois retraits, chacun pour une raison précise :
 *
 * - **La carte.** Le reste de l'écran n'en a aucune ; la structure vient des
 *   filets. Une carte par ligne fabriquait N îlots là où il faut une liste.
 * - **Le badge de rang.** La liste est déjà triée par montant décroissant :
 *   la position DIT le rang. Le numéroter en plus, c'est encoder deux fois la
 *   même information — le tic « 01 / 02 / 03 » qui n'a de sens que si l'ordre
 *   porte une information que la position ne donne pas.
 * - **La barre.** Le pourcentage est écrit juste à côté, en toutes lettres.
 *   Une jauge par ligne ajoutait un quatrième graphique à l'écran pour
 *   redire un nombre déjà lisible.
 *
 * Ce qui reste : le texte de la publication à la taille où on le lit vraiment
 * (17 px, l'échelle native), le montant à chasse fixe aligné à droite, et une
 * ligne de mesure dessous. Le `≈` ne bouge pas : le pot ne paie pas au tweet,
 * cette ligne est une répartition au prorata des vues (voir
 * `services/contentEarningsSplit.ts`), et le signe interdit de la confondre
 * avec un versement.
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
  /** Sans filet : la première ligne suit déjà le sur-titre du bloc. */
  first?: boolean;
}

export default function ContentRow({
  content,
  views,
  amount,
  share,
  symbol,
  onPress,
  first,
}: Props) {
  const pct = Math.max(0, Math.min(1, num(share)));

  return (
    <Tappable
      onPress={onPress}
      disabled={!onPress}
      style={[styles.row, !first && styles.rowDivided]}
      scaleTo={0.995}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      <View style={styles.top}>
        <Text style={styles.content} numberOfLines={2}>
          {content || 'Publication sans texte'}
        </Text>
        <Text style={styles.amount} numberOfLines={1}>
          ≈ {money(amount)}
          <Text style={styles.symbol}> {symbol}</Text>
        </Text>
      </View>

      <Text style={styles.meta} numberOfLines={1}>
        {compact(views)} vues · {percent(pct)} de tes vues
      </Text>
    </Tappable>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 16 },
  rowDivided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },

  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  content: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 17,
    lineHeight: 23,
    color: colors.textPrimary,
  },
  amount: {
    fontFamily: fonts.mono,
    fontSize: 17,
    lineHeight: 23,
    color: colors.gold,
    fontVariant: ['tabular-nums'],
  },
  symbol: { fontFamily: fonts.mono, fontSize: 13, color: colors.textMuted },

  meta: {
    marginTop: 8,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textMuted,
  },
});
