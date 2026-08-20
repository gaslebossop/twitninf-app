/**
 * Primitives « relevé » de l'écran Monétisation.
 *
 * ── Pourquoi elles existent ─────────────────────────────────────────────────
 * L'écran était bâti en huit sections identiques (un titre + une carte), plus
 * un anneau de score, des barres de progression et une grille de tuiles.
 * Quand chaque bloc porte le même poids visuel, aucun n'en a : c'est le
 * gabarit « tableau de bord » que tout générateur produit par défaut, et il a
 * été rejeté comme tel.
 *
 * Le sujet de cette page n'est pas de l'analytique, c'est de l'ARGENT — plus
 * précisément une part hebdomadaire d'un pot partagé. Le vocabulaire de ce
 * monde-là est celui du relevé : des chiffres à chasse fixe alignés sur la
 * virgule, des filets qui séparent des lignes plutôt que des cartes qui
 * flottent, un total énorme et tout le reste petit.
 *
 * D'où ces primitives, et la règle qu'elles imposent :
 *   * AUCUNE carte. La structure vient des filets (`Rule`) et du rythme
 *     vertical, jamais d'un conteneur posé sur le fond.
 *   * TOUT chiffre passe par `fonts.mono`. `1 111,00` doit occuper exactement
 *     la même largeur que `8 888,00`, sinon les virgules ne s'alignent pas et
 *     une colonne de montants devient illisible.
 *   * Une seule couleur par rôle : l'or pour la monnaie, le magenta pour
 *     l'action et pour TA part. Pas de teinte par section — c'est exactement
 *     le tic qui fait « généré par IA ».
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { colors, fonts } from '../../theme';
import { duration, easing } from '../../theme/motion';
import { motionDuration } from '../../hooks/useReduceMotion';

/* ------------------------------------------------------------------ */
/* Filet                                                               */
/* ------------------------------------------------------------------ */

/**
 * Le séparateur de l'écran. Remplace le bord d'une carte : un filet dit
 * « ce qui suit est autre chose » sans fabriquer un objet flottant de plus.
 */
export function Rule({ style }: { style?: ViewStyle }) {
  return <View style={[styles.rule, style]} />;
}

/* ------------------------------------------------------------------ */
/* Sur-titre                                                           */
/* ------------------------------------------------------------------ */

/**
 * L'étiquette d'un bloc : petites capitales espacées, jamais un titre de
 * paragraphe. Elle nomme la colonne d'un relevé, elle n'annonce pas un
 * chapitre.
 */
export function Eyebrow({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <Text style={[styles.eyebrow, style]} numberOfLines={1}>
      {children}
    </Text>
  );
}

/* ------------------------------------------------------------------ */
/* Le chiffre                                                          */
/* ------------------------------------------------------------------ */

interface FigureProps {
  /** Déjà formaté : cette primitive ne décide pas des décimales. */
  value: string;
  unit: string;
  /** `muted` pour une projection : ce n'est pas encore de l'argent acquis. */
  tone?: 'money' | 'muted';
}

/**
 * Le montant, et rien d'autre. C'est l'élément le plus fort de l'écran :
 * la question que le créateur vient poser est « combien », elle doit trouver
 * sa réponse avant même la lecture d'un mot.
 *
 * `adjustsFontSizeToFit` plutôt qu'une taille conditionnelle : un montant à
 * six chiffres doit rétrécir, pas déborder ni passer à la ligne.
 */
export function Figure({ value, unit, tone = 'money' }: FigureProps) {
  return (
    <View style={styles.figureRow}>
      <Text
        style={[styles.figure, tone === 'muted' && styles.figureMuted]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.5}
      >
        {value}
      </Text>
      <Text style={[styles.figureUnit, tone === 'muted' && styles.figureUnitMuted]}>{unit}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Ligne de registre                                                   */
/* ------------------------------------------------------------------ */

interface LedgerRowProps {
  label: string;
  value: string;
  /** Suffixe discret collé au chiffre — une unité, jamais une phrase. */
  unit?: string;
  /** Précision sous le libellé, pour ce qui ne se devine pas. */
  hint?: string;
  tone?: 'default' | 'money' | 'accent' | 'success' | 'muted';
  /** Sans filet : pour la première ligne d'un groupe. */
  first?: boolean;
}

/**
 * Libellé à gauche, chiffre à droite, filet entre deux. La forme d'un
 * relevé — et la raison pour laquelle six mesures tiennent ici sans
 * fabriquer six îlots gris.
 */
export function LedgerRow({ label, value, unit, hint, tone = 'default', first }: LedgerRowProps) {
  return (
    <View style={[styles.ledgerRow, !first && styles.ledgerRowDivided]}>
      <View style={styles.ledgerLabelBox}>
        <Text style={styles.ledgerLabel} numberOfLines={1}>
          {label}
        </Text>
        {!!hint && (
          <Text style={styles.ledgerHint} numberOfLines={1}>
            {hint}
          </Text>
        )}
      </View>

      <View style={styles.ledgerValueBox}>
        <Text style={[styles.ledgerValue, TONE[tone]]} numberOfLines={1}>
          {value}
        </Text>
        {!!unit && <Text style={styles.ledgerUnit}>{unit}</Text>}
      </View>
    </View>
  );
}

const TONE: Record<string, ViewStyle | any> = {
  default: null,
  money: { color: colors.gold },
  accent: { color: colors.accent },
  success: { color: colors.success },
  muted: { color: colors.textMuted },
};

/* ------------------------------------------------------------------ */
/* La signature — ta part du pot                                       */
/* ------------------------------------------------------------------ */

/** Nombre de crans. Chacun vaut donc 2,5 % du pot. */
const TICKS = 40;

interface ShareBarProps {
  /** Part dans `[0, 1]`. */
  share: number;
  /** Nombre de créateurs qui se partagent le pot cette semaine. */
  cohortSize?: number;
}

/**
 * L'élément dont on se souvient.
 *
 * Presque tous les écrans de gains disent « tu as gagné X ». Ici l'argent est
 * une PART d'un pot que d'autres créateurs découpent en même temps — c'est la
 * chose la plus caractéristique de ce produit, et elle n'était visible nulle
 * part. Elle le devient, sous la forme qui la décrit le mieux : un pot
 * découpé en crans, dont les tiens sont allumés.
 *
 * Volontairement PAS un anneau ni une barre pleine : le donut de score et la
 * barre de progression sont les deux tics du tableau de bord générique. Des
 * crans disent « parts discrètes partagées », ce qu'une jauge continue ne dit
 * pas.
 *
 * Une seule animation sur tout l'écran, et elle est ici : les crans
 * s'allument d'un balayage unique quand la donnée arrive — le moment
 * « c'est arrivé », pas un fondu d'entrée de plus. Rejouée seulement si la
 * part CHANGE, jamais au simple remontage.
 */
export function ShareBar({ share, cohortSize }: ShareBarProps) {
  const safe = Math.max(0, Math.min(1, Number.isFinite(share) ? share : 0));
  const [width, setWidth] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;
  const lastShare = useRef<number | null>(null);

  const onLayout = useCallback((e: any) => setWidth(e.nativeEvent.layout.width), []);

  useEffect(() => {
    if (!width) return;
    // Ne rejoue pas si la part n'a pas bougé : sans ce garde-fou, revenir sur
    // l'écran relancerait le balayage, ce qui est exactement le « diaporama »
    // rejeté ailleurs dans l'app.
    if (lastShare.current === safe) return;
    lastShare.current = safe;

    const ms = motionDuration(duration.slow);
    if (!ms) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: ms,
      easing: easing.out,
      // La largeur n'est pas animable sur le thread natif. Un seul nœud, une
      // seule fois : le coût est négligeable, et `scaleX` déformerait les
      // crans au lieu de les révéler.
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [safe, width, progress]);

  const lit = Math.round(safe * TICKS);
  const fillWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, Math.max(0, width * safe)],
  });

  return (
    <View>
      <View style={styles.tickTrack} onLayout={onLayout}>
        {/* Le pot entier, éteint. */}
        <View style={styles.tickRow} pointerEvents="none">
          {Array.from({ length: TICKS }, (_, i) => (
            <View key={i} style={styles.tick} />
          ))}
        </View>

        {/* Ta part, allumée, révélée par un volet qui s'ouvre. */}
        {width > 0 && (
          <Animated.View style={[styles.tickClip, { width: fillWidth }]} pointerEvents="none">
            <View style={[styles.tickRow, { width }]}>
              {Array.from({ length: TICKS }, (_, i) => (
                <View key={i} style={[styles.tick, i < lit && styles.tickLit]} />
              ))}
            </View>
          </Animated.View>
        )}
      </View>

      {!!cohortSize && (
        <Text style={styles.tickFoot}>
          {cohortSize} créateur{cohortSize > 1 ? 's' : ''} se partagent le pot cette semaine
        </Text>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairline,
  },

  /* Échelle de type native (iOS) : footnote 13/18, body 17/22, title 22+.
     Rien en dessous de 13 sur cet écran — un relevé se lit, il ne se
     déchiffre pas. */
  eyebrow: {
    fontFamily: fonts.bold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.textSecondary,
  },

  // ── Le chiffre ────────────────────────────────────────────────────
  figureRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    marginTop: 6,
  },
  figure: {
    flexShrink: 1,
    fontFamily: fonts.mono,
    fontSize: 64,
    lineHeight: 70,
    letterSpacing: -2.5,
    color: colors.gold,
    fontVariant: ['tabular-nums'],
  },
  figureMuted: { color: colors.textPrimary },
  figureUnit: {
    fontFamily: fonts.mono,
    fontSize: 22,
    lineHeight: 30,
    color: colors.gold,
    opacity: 0.75,
    paddingBottom: 8,
  },
  figureUnitMuted: { color: colors.textMuted, opacity: 1 },

  // ── Registre ──────────────────────────────────────────────────────
  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 60,
    paddingVertical: 14,
    gap: 16,
  },
  ledgerRowDivided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  ledgerLabelBox: { flexShrink: 1, gap: 3 },
  ledgerLabel: {
    fontFamily: fonts.regular,
    fontSize: 17,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  ledgerHint: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textMuted,
  },
  ledgerValueBox: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  ledgerValue: {
    fontFamily: fonts.mono,
    fontSize: 17,
    lineHeight: 22,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  ledgerUnit: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: colors.textMuted,
  },

  // ── Crans du pot ──────────────────────────────────────────────────
  tickTrack: {
    height: 30,
    justifyContent: 'center',
  },
  tickClip: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tickRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  /* `flex: 1` répartit les 40 crans sur toute la largeur quelle que soit la
     taille de l'écran — la gouttière fixe de 2 px est la seule constante. */
  tick: {
    flex: 1,
    height: 26,
    marginRight: 3,
    borderRadius: 1.5,
    backgroundColor: colors.surfaceAlt,
  },
  tickLit: { backgroundColor: colors.accent },
  tickFoot: {
    marginTop: 14,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textMuted,
  },
});
