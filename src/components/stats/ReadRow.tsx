/**
 * Une publication, dans l'unité de cette page : le temps qu'on a passé dessus.
 *
 * ── Honnêteté de la mesure ─────────────────────────────────────────────────
 * Le temps lu n'est agrégé par AUTEUR qu'à la clôture d'une semaine du pot,
 * jamais par publication. Ce qui est affiché ici est donc une estimation — les
 * vues de la publication multipliées par la durée de lecture moyenne de la
 * période — et le signe « ≈ » le dit. Sans lui, ce serait une mesure inventée
 * présentée comme un fait, ce qui est pire que de ne rien afficher.
 *
 * Conséquence assumée : comme le multiplicateur est constant, ce classement est
 * exactement celui des vues. Il n'invente pas un ordre, il le RELIT dans
 * l'unité du reste de l'écran — c'est tout ce qu'il prétend faire.
 *
 * ── Pas de badge de rang ───────────────────────────────────────────────────
 * La liste est triée : la position DIT déjà le rang. Un « 01 / 02 / 03 » en
 * pastille ne serait que de la décoration.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../../theme';
import { NBSP, compact, durationInline } from './format';

interface Props {
  content: string;
  views: number;
  /** Durée de lecture moyenne de la période, en millisecondes par vue. */
  msPerView: number;
  interactions: number;
  first?: boolean;
}

export default function ReadRow({ content, views, msPerView, interactions, first }: Props) {
  const estimatedMs = views * msPerView;
  const excerpt = (content || '').replace(/\s+/g, ' ').trim() || 'Publication sans texte';

  return (
    <View
      style={[styles.row, !first && styles.rowDivided]}
      accessible
      accessibilityLabel={`${excerpt}. Environ ${durationInline(estimatedMs)} de lecture, ${compact(views)} vues.`}
    >
      <Text style={styles.excerpt} numberOfLines={2}>
        {excerpt}
      </Text>

      <View style={styles.meta}>
        <Text style={styles.time}>
          {msPerView > 0 ? `≈${NBSP}${durationInline(estimatedMs)}` : '—'}
        </Text>
        <Text style={styles.secondary}>
          {compact(views)} vues · {compact(interactions)} interactions
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 44,
    paddingVertical: 12,
    gap: 6,
  },
  rowDivided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  excerpt: {
    fontSize: 15,
    lineHeight: 21,
    fontFamily: fonts.regular,
    color: colors.textPrimary,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: 10,
  },
  time: {
    fontSize: 15,
    fontFamily: fonts.mono,
    color: colors.accent,
    letterSpacing: -0.2,
  },
  secondary: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.textMuted,
  },
});
