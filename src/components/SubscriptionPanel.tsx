import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Defs, LinearGradient, Polygon, Rect, Stop } from 'react-native-svg';

import { colors, fonts, radius, spacing } from '../theme';
import {
  SUBSCRIPTION_FEATURES,
  ULTRA_ONLY_FEATURES,
} from '../utils/subscriptionFeatures';
import {
  subscriptionRemainingLabel,
  tierRank,
  type SubscriptionTier,
} from '../utils/subscriptionTier';
import { Tappable } from './ui';

/**
 * Le panneau d'abonnement des réglages.
 *
 * ── Ce qu'il répond ──
 * Trois questions, dans cet ordre : quel palier j'ai, jusqu'à quand, et
 * combien d'avantages ça me donne. Avant lui, les réglages affichaient un
 * simple « Premium » booléen — un compte Ultra à 300 NF y était présenté
 * exactement comme un compte Plus.
 *
 * ── Ce qu'il ne fait PAS ──
 * Il ne vend rien et ne détaille rien : c'est un état, avec une porte vers
 * l'écran d'abonnement. Recopier ici le catalogue des avantages en ferait une
 * seconde vitrine à maintenir, qui divergerait de la première.
 */

const CX = 32;
const CY = 38;
const R = 21;

/** Les oreilles, en coordonnées absolues — voir `Mark.tsx` côté page. */
const EARS: number[][][] = [
  [
    [13, 29],
    [13, 4],
    [24, 19],
  ],
  [
    [51, 29],
    [51, 4],
    [40, 19],
  ],
];

const METAL: Record<string, [string, string, string]> = {
  ultra: ['#FFE08A', '#F0B429', '#B07A12'],
  pro: ['#FFFFFF', '#C9CDD4', '#7C838C'],
};

function points(ear: number[][], scale: number): string {
  return ear
    .map(([x, y]) => `${CX + (x - CX) * scale},${CY + (y - CY) * scale}`)
    .join(' ');
}

/**
 * La marque du palier, en natif.
 *
 * ⚠ Même géométrie que `twitninf-subscription/src/Mark.tsx`. Les deux doivent
 * rester alignées : c'est la même marque, vue à deux endroits de l'app, et un
 * écart se verrait au premier coup d'oeil.
 */
function TierMark({ tier, size = 44 }: { tier: SubscriptionTier; size?: number }) {
  const metal = METAL[tier];
  const fill = metal ? `url(#grad-${tier})` : colors.border;
  const faceScale = tier === 'ultra' ? 0.9 : 0.92;

  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      {metal ? (
        <Defs>
          <LinearGradient id={`grad-${tier}`} x1="0" y1="0" x2="0.6" y2="1">
            <Stop offset="0" stopColor={metal[0]} />
            <Stop offset="0.45" stopColor={metal[1]} />
            <Stop offset="1" stopColor={metal[2]} />
          </LinearGradient>
        </Defs>
      ) : null}

      {/* La monture : la silhouette en grand, dans le métal. */}
      <Circle cx={CX} cy={CY} r={R} fill={fill} />
      {EARS.map((ear, i) => (
        <Polygon key={`o${i}`} points={points(ear, 1)} fill={fill} />
      ))}

      {/* La tête : la même forme, plus petite. L'anneau naît de la différence. */}
      <Circle cx={CX} cy={CY} r={R * faceScale} fill="#0A0A0A" />
      {EARS.map((ear, i) => (
        <Polygon key={`i${i}`} points={points(ear, faceScale)} fill="#0A0A0A" />
      ))}

      {tier === 'ultra' ? (
        <>
          <Polygon points="32,2 36,11 28,11" fill={fill} />
          <Polygon points="23,6 27,13 19,13" fill={fill} />
          <Polygon points="41,6 45,13 37,13" fill={fill} />
          <Rect x="19" y="12" width="26" height="4" rx="1.4" fill={fill} />
        </>
      ) : null}
    </Svg>
  );
}

const TIER_NAMES: Record<SubscriptionTier, string> = {
  free: 'Gratuit',
  plus: 'Plus',
  pro: 'Pro',
  ultra: 'Ultra',
};

export default function SubscriptionPanel({
  tier,
  expiresAt,
  onOpen,
}: {
  tier: SubscriptionTier;
  expiresAt?: string | Date | null;
  onOpen: () => void;
}) {
  /**
   * Nombre d'avantages réellement actifs.
   *
   * Compté depuis le catalogue, jamais écrit en dur : c'est ce chiffre qui
   * donne sa valeur au palier, et une constante recopiée finirait par mentir
   * au premier avantage ajouté.
   */
  const activeCount = useMemo(() => {
    if (tier === 'free') return 0;
    const base = SUBSCRIPTION_FEATURES.filter((feature) =>
      tierRank(tier) >= tierRank(feature.minTier),
    ).length;
    return tier === 'ultra' ? base + ULTRA_ONLY_FEATURES.length : base;
  }, [tier]);

  const isPaid = tier !== 'free';

  return (
    <Tappable onPress={onOpen} style={styles.card}>
      <View style={styles.row}>
        {isPaid ? (
          <TierMark tier={tier} />
        ) : (
          <View style={styles.freeMark}>
            <Ionicons name="lock-open-outline" size={20} color={colors.textMuted} />
          </View>
        )}

        <View style={styles.body}>
          <Text style={styles.label}>Abonnement</Text>
          <Text style={styles.tier}>{TIER_NAMES[tier]}</Text>
          <Text style={styles.detail} numberOfLines={1}>
            {isPaid
              ? subscriptionRemainingLabel(expiresAt)
              : 'Aucun abonnement actif'}
          </Text>
        </View>

        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {isPaid
            ? `${activeCount} avantages actifs sur ton compte`
            : 'Découvre ce que Plus, Pro et Ultra débloquent'}
        </Text>
        <Text style={styles.footerAction}>
          {isPaid ? 'Gérer' : 'Voir les paliers'}
        </Text>
      </View>
    </Tappable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  freeMark: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0 },
  label: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: fonts.bold,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  tier: { color: colors.textPrimary, fontSize: 18, fontFamily: fonts.bold },
  detail: { color: colors.textSecondary, fontSize: 13, fontFamily: fonts.regular, marginTop: 2 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
    gap: spacing.sm,
  },
  footerText: { flex: 1, color: colors.textSecondary, fontSize: 13, fontFamily: fonts.regular },
  footerAction: { color: colors.accent, fontSize: 13, fontFamily: fonts.bold },
});
