import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { colors, fonts, radius } from '../../theme';
import Tappable from '../ui/Tappable';
import { compact, fullDate, money, percent } from './format';

/**
 * Une semaine close dans l'historique.
 *
 * Deux partis pris, hérités de la refonte précédente et tenus ici :
 *
 * - Une barre de proportion sous chaque ligne. Une colonne de montants oblige
 *   à comparer des nombres de tête ; la barre dit tout de suite laquelle des
 *   dix dernières semaines a été la bonne.
 * - Un bouton d'encaissement PAR semaine. L'API accepte `claim(periodKey)`
 *   depuis le début, et l'écran n'encaissait qu'en bloc — impossible de
 *   prendre une semaine et d'en laisser une autre.
 *
 * La refonte graphique marque le statut par un ESTALEMENT, pas par un effet :
 * une semaine à encaisser pose un bord accent, une légère nappe accent et une
 * pastille « à encaisser » ; une semaine encaissée redevient une ligne posée,
 * grise, close. L'historique se lit alors d'un regard — les lignes colorées
 * sont exactement celles qui demandent une action.
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
  expanded,
  onToggle,
  claiming = false,
  onClaim,
}: Props) {
  const claimable = status === 'claimable';

  return (
    <Tappable
      onPress={onToggle}
      style={styles.wrap}
      scaleTo={0.995}
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

      <View style={styles.meta}>
        <Text style={styles.metaText} numberOfLines={1}>
          {compact(views)} vues · qualité {percent(quality)}
        </Text>

        {claimable ? (
          <Text style={styles.statusPendingText}>à encaisser</Text>
        ) : (
          <View style={styles.statusDone}>
            <Ionicons name="checkmark" size={13} color={colors.success} />
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

/* Même langue que le reste de l'écran : pas de carte, un filet entre les
   lignes, échelle native (body 17, footnote 13). La barre de progression a
   sauté — la liste est déjà triée par date et le montant est écrit, la jauge
   ne faisait que redire un chiffre lisible. */
const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },

  top: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 },
  period: { flex: 1, fontFamily: fonts.regular, fontSize: 17, lineHeight: 23, color: colors.textPrimary },
  amount: {
    fontFamily: fonts.mono,
    fontSize: 17,
    lineHeight: 23,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  amountClaimable: { color: colors.gold },
  symbol: { fontFamily: fonts.mono, fontSize: 13, color: colors.textMuted },

  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 8 },
  metaText: { flex: 1, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.textMuted },

  /* Le statut est du texte, pas une pastille : sur une liste sans cartes, une
     pastille redeviendrait le seul objet flottant de la page. */
  statusPendingText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    letterSpacing: 0.4,
    color: colors.accent,
  },
  statusDone: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusDoneText: { fontFamily: fonts.regular, fontSize: 13, color: colors.success },

  detail: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
    gap: 12,
  },
  detailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  detailLabel: { fontFamily: fonts.regular, fontSize: 15, color: colors.textMuted },
  detailValue: { fontFamily: fonts.mono, fontSize: 15, color: colors.textPrimary },

  claimButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    marginTop: 4,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  claimButtonBusy: { opacity: 0.75 },
  claimLabel: { fontFamily: fonts.bold, fontSize: 16, color: colors.onAccent },
});
