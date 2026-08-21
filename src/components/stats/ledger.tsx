/**
 * Primitives du relevé d'écoute.
 *
 * ── Pourquoi elles ne sont pas dans `components/ui` ─────────────────────────
 * Même raison que pour les primitives de `components/monetization` : elles
 * connaissent le vocabulaire d'un relevé — un total énorme, une colonne de
 * valeurs alignées, un filet plutôt qu'un bord de carte. Les mettre dans le
 * barrel partagé inviterait à poser un « gros chiffre » sur un écran qui
 * n'est pas un relevé, et le geste perdrait son sens.
 *
 * ── La règle qu'elles imposent ─────────────────────────────────────────────
 *   * AUCUNE carte. La séparation vient de `Rule` et du rythme vertical. Une
 *     grille de tuiles grises, c'est six îlots sans hiérarchie ; six lignes
 *     séparées par des filets se balaient d'un regard.
 *   * TOUT chiffre passe par `fonts.mono`. `12,4 s` et `128,0 s` doivent
 *     occuper la même largeur, sinon la colonne de droite ondule.
 *   * Une couleur par rôle : le magenta pour l'attention (le sujet de la
 *     page), l'or pour la monnaie, rien d'autre. Pas de teinte par section.
 *   * Plancher de taille : 15 px pour un libellé, 17 pour une valeur. Le seul
 *     texte sous 13 px est le sur-titre en capitales espacées.
 */

import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { colors, fonts } from '../../theme';

/* ------------------------------------------------------------------ */
/* Filet                                                               */
/* ------------------------------------------------------------------ */

/** Le séparateur de l'écran — il remplace le bord d'une carte. */
export function Rule({ style }: { style?: ViewStyle }) {
  return <View style={[styles.rule, style]} />;
}

/* ------------------------------------------------------------------ */
/* Sur-titre                                                           */
/* ------------------------------------------------------------------ */

/**
 * L'étiquette d'un bloc. Elle nomme une colonne de relevé, elle n'annonce pas
 * un chapitre : petites capitales espacées, jamais un titre de paragraphe.
 */
export function Eyebrow({
  children,
  trailing,
}: {
  children: React.ReactNode;
  /** Précision alignée à droite : une période, un compte de semaines. */
  trailing?: string | null;
}) {
  return (
    <View style={styles.eyebrowRow}>
      <Text style={styles.eyebrow} numberOfLines={1}>
        {children}
      </Text>
      {!!trailing && (
        <Text style={styles.eyebrowTrailing} numberOfLines={1}>
          {trailing}
        </Text>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Le chiffre                                                          */
/* ------------------------------------------------------------------ */

interface BigFigureProps {
  /** Déjà formaté : cette primitive ne décide pas des décimales. */
  value: string;
  /** Vide quand la valeur porte déjà son unité (« 4 h 12 »). */
  unit?: string;
  /** `estimated` pour une mesure non chronométrée — elle ne se lit pas pareil. */
  tone?: 'measured' | 'estimated';
}

/**
 * Le total lu, et rien d'autre. C'est l'élément le plus fort de l'écran :
 * posé sur le fond, sans conteneur, à une taille qui ne se discute pas.
 *
 * `adjustsFontSizeToFit` plutôt qu'une taille conditionnelle — « 128 h 40 »
 * doit rétrécir, pas déborder ni passer à la ligne.
 */
export function BigFigure({ value, unit, tone = 'measured' }: BigFigureProps) {
  return (
    <View style={styles.figureRow}>
      <Text
        style={[styles.figure, tone === 'estimated' && styles.figureEstimated]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.45}
      >
        {value}
      </Text>
      {!!unit && <Text style={styles.figureUnit}>{unit}</Text>}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Ligne de registre                                                   */
/* ------------------------------------------------------------------ */

export type RowTone = 'default' | 'attention' | 'money' | 'muted' | 'positive' | 'negative';

interface LedgerRowProps {
  label: string;
  value: string;
  /** Suffixe discret collé au chiffre — une unité, jamais une phrase. */
  unit?: string;
  /** Précision sous le libellé, pour ce qui ne se devine pas. */
  hint?: string;
  tone?: RowTone;
  /** Sans filet : la première ligne d'un groupe. */
  first?: boolean;
}

/**
 * Libellé à gauche, valeur à droite, filet entre deux. La forme d'un relevé —
 * et la raison pour laquelle sept mesures tiennent ici sans fabriquer sept
 * tuiles grises.
 */
export function LedgerRow({ label, value, unit, hint, tone = 'default', first }: LedgerRowProps) {
  return (
    <View
      style={[styles.row, !first && styles.rowDivided]}
      accessible
      accessibilityLabel={`${label} : ${value}${unit ? ` ${unit}` : ''}`}
    >
      <View style={styles.rowLabelBox}>
        <Text style={styles.rowLabel} numberOfLines={1}>
          {label}
        </Text>
        {!!hint && (
          <Text style={styles.rowHint} numberOfLines={2}>
            {hint}
          </Text>
        )}
      </View>

      <View style={styles.rowValueBox}>
        <Text style={[styles.rowValue, TONE[tone]]} numberOfLines={1}>
          {value}
        </Text>
        {!!unit && <Text style={styles.rowUnit}>{unit}</Text>}
      </View>
    </View>
  );
}

const TONE: Record<RowTone, { color: string } | null> = {
  default: null,
  attention: { color: colors.accent },
  money: { color: colors.gold },
  muted: { color: colors.textMuted },
  positive: { color: colors.success },
  negative: { color: colors.red },
};

/* ------------------------------------------------------------------ */
/* Note                                                                */
/* ------------------------------------------------------------------ */

/**
 * La phrase qui explique un bloc, sous le bloc. Une seule par bloc — quatre
 * accordéons « en savoir plus » n'en font ouvrir aucun.
 */
export function Note({ children, tone }: { children: React.ReactNode; tone?: 'warning' }) {
  return <Text style={[styles.note, tone === 'warning' && styles.noteWarning]}>{children}</Text>;
}

const styles = StyleSheet.create({
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairline,
  },

  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  eyebrow: {
    flexShrink: 1,
    fontSize: 12,
    fontFamily: fonts.medium,
    color: colors.textSecondary,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  eyebrowTrailing: {
    fontSize: 12,
    fontFamily: fonts.mono,
    color: colors.textMuted,
    letterSpacing: 0.4,
  },

  figureRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  figure: {
    flexShrink: 1,
    fontSize: 56,
    lineHeight: 64,
    fontFamily: fonts.mono,
    color: colors.textPrimary,
    letterSpacing: -1.5,
  },
  figureEstimated: {
    color: colors.textSecondary,
  },
  figureUnit: {
    paddingBottom: 12,
    fontSize: 20,
    fontFamily: fonts.mono,
    color: colors.textMuted,
  },

  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 8,
  },
  rowDivided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  rowLabelBox: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: fonts.regular,
    color: colors.textPrimary,
  },
  rowHint: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.regular,
    color: colors.textMuted,
  },
  rowValueBox: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  rowValue: {
    fontSize: 17,
    fontFamily: fonts.mono,
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  rowUnit: {
    fontSize: 13,
    fontFamily: fonts.mono,
    color: colors.textMuted,
  },

  note: {
    fontSize: 15,
    lineHeight: 21,
    fontFamily: fonts.regular,
    color: colors.textMuted,
  },
  noteWarning: {
    color: colors.warning,
  },
});
