import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { colors, fonts, radius, withAlpha } from '../../theme';
import Tappable from '../ui/Tappable';
import { compact, fullDate, money, num, percent } from './format';

/**
 * Une semaine close dans l'historique.
 *
 * Deux changements par rapport à l'ancienne liste :
 *
 * - Une barre de proportion sous chaque ligne. Une colonne de montants oblige
 *   à comparer des nombres de tête ; la barre dit tout de suite laquelle des
 *   dix dernières semaines a été la bonne.
 * - Un bouton d'encaissement PAR semaine. L'API accepte `claim(periodKey)`
 *   depuis le début, mais l'écran n'encaissait qu'en bloc — impossible de
 *   prendre une semaine et d'en laisser une autre.
 *
 * Le détail (RPM, multiplicateur, taille du vivier) reste replié : il sert à
 * comprendre un montant surprenant, pas à lire la liste.
 */

interface Props {
  label: string;
  amount: number;
  symbol: string;
  status: string;
  views: number;
  quality: number;
  rpm: number;
  bonusMultiplier: number;
  cohortSize?: number;
  claimedAt?: string | null;
  /** Hauteur relative de la barre dans l'historique affiché, 0–1. */
  ratio: number;
  expanded: boolean;
  onToggle: () => void;
  claiming?: boolean;
  onClaim?: () => void;
}

export default function PayoutRow({
  label,
  amount,
  symbol,
  status,
  views,
  quality,
  rpm,
  bonusMultiplier,
  cohortSize,
  claimedAt,
  ratio,
  expanded,
  onToggle,
  claiming = false,
  onClaim,
}: Props) {
  const claimable = status === 'claimable';
  const fill = Math.max(2, Math.min(1, Math.max(0, num(ratio))) * 100);

  return (
    <Tappable
      onPress={onToggle}
      style={[styles.wrap, claimable && styles.wrapClaimable]}
      scaleTo={0.99}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
    >
      <View style={styles.top}>
        <Text style={styles.period} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.amount, claimable && styles.amountClaimable]}>
          {money(amount)}
          <Text style={styles.symbol}> {symbol}</Text>
        </Text>
      </View>

      <View style={styles.track}>
        <View
          style={[styles.fill, { width: `${fill}%` }, claimable && styles.fillClaimable]}
        />
      </View>

      <View style={styles.meta}>
        <Text style={styles.metaText} numberOfLines={1}>
          {compact(views)} vues · qualité {percent(quality)}
        </Text>

        {claimable ? (
          <Text style={styles.statusPending}>à encaisser</Text>
        ) : (
          <View style={styles.statusDone}>
            <Ionicons name="checkmark" size={11} color={colors.success} />
            <Text style={styles.statusDoneText}>encaissé</Text>
          </View>
        )}
      </View>

      {expanded && (
        <View style={styles.detail}>
          <Detail label="RPM" value={`${money(rpm)} ${symbol} / 1000 vues`} />
          <Detail label="Récompenses" value={`× ${money(bonusMultiplier, 2)}`} />
          {cohortSize !== undefined && (
            <Detail label="Vivier" value={`${compact(cohortSize)} créateurs`} />
          )}
          {!!claimedAt && <Detail label="Encaissé le" value={fullDate(claimedAt)} />}

          {claimable && !!onClaim && (
            <Tappable
              onPress={onClaim}
              disabled={claiming}
              style={[styles.claimButton, claiming && styles.claimButtonBusy]}
              scaleTo={0.97}
              accessibilityRole="button"
            >
              {claiming ? (
                <ActivityIndicator size="small" color={colors.onAccent} />
              ) : (
                <>
                  <Ionicons name="arrow-down-circle-outline" size={15} color={colors.onAccent} />
                  <Text style={styles.claimLabel}>
                    Encaisser cette semaine
                  </Text>
                </>
              )}
            </Tappable>
          )}
        </View>
      )}
    </Tappable>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: 13,
    marginBottom: 8,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  /** Une semaine qui attend porte le bord accent : elle demande une action. */
  wrapClaimable: { borderColor: withAlpha(colors.accent, 0.55) },

  top: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  period: { flex: 1, fontFamily: fonts.medium, fontSize: 13, color: colors.textPrimary },
  amount: { fontFamily: fonts.mono, fontSize: 14, color: colors.textPrimary, letterSpacing: -0.4 },
  amountClaimable: { color: colors.accent },
  symbol: { fontFamily: fonts.regular, fontSize: 10.5, color: colors.textMuted },

  track: {
    height: 3,
    marginTop: 9,
    borderRadius: 2,
    backgroundColor: withAlpha(colors.textMuted, 0.16),
    overflow: 'hidden',
  },
  fill: { height: 3, borderRadius: 2, backgroundColor: withAlpha(colors.accent, 0.4) },
  fillClaimable: { backgroundColor: colors.accent },

  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 7 },
  metaText: { flex: 1, fontFamily: fonts.regular, fontSize: 10.5, color: colors.textMuted },
  statusPending: { fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.3, color: colors.accent },
  statusDone: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statusDoneText: { fontFamily: fonts.regular, fontSize: 10.5, color: colors.success },

  detail: {
    marginTop: 11,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: 7,
  },
  detailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  detailLabel: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.textMuted },
  detailValue: { fontFamily: fonts.mono, fontSize: 11, color: colors.textSecondary },

  claimButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 40,
    marginTop: 4,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  claimButtonBusy: { opacity: 0.75 },
  claimLabel: { fontFamily: fonts.bold, fontSize: 13, color: colors.onAccent },
});
