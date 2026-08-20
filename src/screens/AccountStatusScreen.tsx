/**
 * État du compte — le pendant lisible de la restriction de portée.
 *
 * Miroir de la page « état du compte » de TikTok : un compte restreint sans
 * savoir pourquoi ni jusqu'à quand ne corrige rien, il devine. L'écran lit
 * `GET /api/neural-rank/account-status`, jamais un identifiant fourni par le
 * client — l'API ne sert que le compte authentifié.
 *
 * Un second appel, `GET /api/creator-pool/account-status`, apporte ce que le
 * moteur ne sait pas : les publications retirées ou écartées des
 * recommandations, et surtout CE QUE COÛTERAIT LA PROCHAINE. Le moteur dit où
 * en est la portée aujourd'hui ; seul ce registre-là dit comment on y est
 * arrivé et comment ne pas y retourner.
 *
 * Les deux appels sont indépendants : une panne de l'un laisse l'autre
 * s'afficher, plutôt que de rendre la page entièrement muette.
 *
 * Refonte du 2026-08-20 : aligné sur le tableau de bord de monétisation —
 * même échelle typographique, chiffres en `fonts.mono`, explications repliées
 * derrière un `Disclosure` au lieu d'être posées entre les faits. L'ajout
 * principal est l'échelle de quatre crans en tête : « Suppressed » ne dit rien
 * à personne tant qu'on ne voit pas où ça tombe entre « rien » et « le pire ».
 */

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radius, withAlpha, statusBarStyle } from '../theme';
import {
  AppHeader,
  EmptyState,
  ErrorState,
  GlassCard,
  ScreenBackground,
  ScreenSkeleton,
} from '../components/ui';
import {
  Disclosure,
  DisclosureLine,
  MetricTile,
  compact,
  fullDate,
  num,
} from '../components/monetization';
import neuralRankService, { type AccountStatus } from '../services/neuralRankService';
import CreatorPoolService, { type AccountStatus as ContentQualityStatus } from '../services/creatorPoolService';

const SURFACE_LABELS: Record<string, string> = {
  for_you: 'Pour toi',
  discover: 'Découverte',
  trending: 'Tendances',
  follower_feed: 'Fil d’abonnement',
};

type Level = AccountStatus['level_label'];

/**
 * Les quatre crans, du meilleur au pire.
 *
 * L'ordre est celui du moteur ; le rendre visible est tout l'intérêt de
 * l'échelle : on lit sa position d'un coup d'œil, sans avoir à savoir ce que
 * « Suppressed » veut dire.
 */
const LADDER: { key: Level; short: string }[] = [
  { key: 'clean', short: 'Normal' },
  { key: 'monitoring', short: 'Surveillé' },
  { key: 'suppressed', short: 'Réduit' },
  { key: 'ghosted', short: 'Masqué' },
];

const LEVEL_TINT: Record<Level, string> = {
  clean: colors.success,
  monitoring: colors.warning,
  suppressed: colors.like,
  ghosted: colors.like,
};

const LEVEL_ICON: Record<Level, keyof typeof Ionicons.glyphMap> = {
  clean: 'checkmark-circle',
  monitoring: 'alert-circle-outline',
  suppressed: 'eye-off-outline',
  ghosted: 'eye-off',
};

export default function AccountStatusScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [quality, setQuality] = useState<ContentQualityStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    // Volontairement non bloquant : le registre qualité est un complément,
    // son absence ne doit pas empêcher d'afficher le niveau de distribution.
    CreatorPoolService.getAccountStatus()
      .then(setQuality)
      .catch(() => setQuality(null));

    const res = await neuralRankService.getAccountStatus();
    if (res.success && res.data) {
      setStatus(res.data);
      setError(null);
    } else {
      // Une panne réseau n'est pas un compte propre — on ne l'affiche jamais
      // comme tel, seulement si on a déjà une réponse valide en mémoire.
      setError(res.message || 'État du compte indisponible');
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const body = () => {
    if (loading && !status) return <ScreenSkeleton variant="list" />;
    if (error && !status) return <ErrorState detail={error} onRetry={() => load()} />;
    if (!status) return null;

    const level = status.level_label;
    const tint = LEVEL_TINT[level] || colors.success;
    const currentIndex = LADDER.findIndex((l) => l.key === level);
    const recoversAt = fullDate(status.recovers_at);
    const clean = level === 'clean';

    return (
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={colors.accent}
          />
        }
      >
        {/* --- Où j'en suis sur l'échelle ---------------------------- */}
        <GlassCard style={styles.card} highlight={!clean} contentStyle={styles.headlineBody}>
          <View style={styles.headlineTop}>
            <View style={[styles.levelIcon, { backgroundColor: withAlpha(tint, 0.14) }]}>
              <Ionicons name={LEVEL_ICON[level] || 'checkmark-circle'} size={18} color={tint} />
            </View>
            <View style={styles.headlineText}>
              <Text style={[styles.level, { color: tint }]}>{status.level}</Text>
              {status.manual && <Text style={styles.manualTag}>Décision d’équipe</Text>}
            </View>
          </View>

          <View style={styles.ladder}>
            {LADDER.map((step, index) => (
              <View key={step.key} style={styles.ladderStep}>
                <View
                  style={[
                    styles.ladderBar,
                    // Tous les crans jusqu'au niveau courant sont teintés : la
                    // gravité se lit à la longueur remplie, pas à une couleur
                    // isolée qu'il faudrait interpréter.
                    index <= currentIndex && { backgroundColor: tint },
                  ]}
                />
                <Text
                  style={[styles.ladderLabel, index === currentIndex && { color: tint, fontFamily: fonts.bold }]}
                  numberOfLines={1}
                >
                  {step.short}
                </Text>
              </View>
            ))}
          </View>

          <Text style={styles.summary}>{status.summary}</Text>

          {!!recoversAt && (
            <View style={styles.recoverRow}>
              <Ionicons name="time-outline" size={13} color={colors.textMuted} />
              <Text style={styles.recoverText}>
                Restriction allégée le {recoversAt} si rien ne s’ajoute
              </Text>
            </View>
          )}
        </GlassCard>

        {/* --- Les faits, en chiffres --------------------------------- */}
        <View style={styles.grid}>
          <MetricTile
            label="Avertissements"
            value={String(num(status.active_strikes))}
            hint={`expirent en ${num(status.strike_ttl_days)} j`}
            tone={num(status.active_strikes) > 0 ? 'warning' : 'default'}
          />
          <MetricTile
            label="Surfaces fermées"
            value={String(status.restricted_surfaces.length)}
            hint={status.restricted_surfaces.length ? 'voir ci-dessous' : 'aucune'}
            tone={status.restricted_surfaces.length ? 'warning' : 'default'}
          />
          {!!quality?.window && (
            <MetricTile
              label={`Écartées / ${quality.window.days} j`}
              value={compact(quality.window.count)}
              hint="publications"
              tone={num(quality.window.count) > 0 ? 'warning' : 'default'}
            />
          )}
        </View>

        {/* --- Ce que coûterait la prochaine -------------------------- */}
        {!!quality?.window && (
          <GlassCard style={styles.card} contentStyle={styles.cardBody}>
            <Text style={styles.sectionTitle}>La prochaine marche</Text>
            <View style={[styles.nextStep, quality.window.nextIsStrike && styles.nextStepSevere]}>
              <Ionicons
                name={quality.window.nextIsStrike ? 'alert-circle' : 'information-circle-outline'}
                size={16}
                color={quality.window.nextIsStrike ? colors.like : colors.textMuted}
              />
              <Text style={styles.nextStepText}>
                {quality.window.count === 0
                  ? 'Un premier cas ne coûte rien de plus qu’un avis — c’est la répétition rapprochée qui compte.'
                  : quality.window.nextIsStrike
                    ? 'Un cas de plus inscrit un avertissement daté à ton dossier ; il expire seul au bout de 90 jours.'
                    : `Un cas de plus réduirait ta portée pendant ${
                        quality.window.nextPenaltyDays === 1
                          ? '24 heures'
                          : `${quality.window.nextPenaltyDays} jours`
                      }.`}
              </Text>
            </View>
          </GlassCard>
        )}

        {status.velocity_throttled && (
          <GlassCard style={styles.card} contentStyle={styles.cardBody}>
            <View style={styles.rowHead}>
              <Ionicons name="hourglass-outline" size={15} color={colors.warning} />
              <Text style={styles.sectionTitle}>Ralenti pendant une heure</Text>
            </View>
            <Text style={styles.note}>
              Une action récente (suppression d’un post, changement d’avatar ou de bio, plusieurs
              publications rapprochées) a temporairement réduit ta portée de moitié. Ce n’est pas
              une sanction — ça s’efface tout seul.
            </Text>
          </GlassCard>
        )}

        {status.restricted_surfaces.length > 0 && (
          <GlassCard style={styles.card} contentStyle={styles.cardBody}>
            <Text style={styles.sectionTitle}>Surfaces actuellement fermées</Text>
            <View style={styles.chipRow}>
              {status.restricted_surfaces.map((s) => (
                <View key={s} style={styles.chip}>
                  <Ionicons name="close" size={11} color={colors.like} />
                  <Text style={styles.chipText}>{SURFACE_LABELS[s] || s}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.note}>
              Tes posts restent visibles sur ton profil et pour tes abonnés — ils ne sont
              simplement plus mis en avant sur ces surfaces.
            </Text>
          </GlassCard>
        )}

        {status.nearing_permanent_ban && (
          <GlassCard style={[styles.card, styles.banCard]} contentStyle={styles.cardBody}>
            <View style={styles.rowHead}>
              <Ionicons name="warning" size={16} color={colors.like} />
              <Text style={[styles.sectionTitle, { color: colors.like }]}>
                Proche d’un bannissement définitif
              </Text>
            </View>
            <Text style={styles.note}>{status.nearing_permanent_ban.reason}</Text>
            <View style={styles.banCount}>
              <Text style={styles.banCountValue}>
                {num(status.nearing_permanent_ban.active_strikes)}
                <Text style={styles.banCountLimit}> / {num(status.nearing_permanent_ban.limit)}</Text>
              </Text>
              <Text style={styles.banCountLabel}>avertissements actifs sur cette règle</Text>
            </View>
          </GlassCard>
        )}

        {status.per_policy.length > 0 && (
          <GlassCard style={styles.card} contentStyle={styles.cardBody}>
            <Text style={styles.sectionTitle}>Avertissements actifs</Text>
            {status.per_policy.map((p) => (
              <View key={p.policy} style={styles.policyRow}>
                <View style={styles.policyText}>
                  <Text style={styles.policyReason} numberOfLines={2}>
                    {p.reason}
                  </Text>
                  {!!p.next_expiry && (
                    <Text style={styles.policyExpiry}>
                      Le plus ancien expire le {fullDate(p.next_expiry)}
                    </Text>
                  )}
                </View>
                <View style={styles.policyCount}>
                  <Text style={styles.policyCountText}>{num(p.active_strikes)}</Text>
                </View>
              </View>
            ))}
          </GlassCard>
        )}

        {!!quality?.events?.length && (
          <GlassCard style={styles.card} contentStyle={styles.cardBody}>
            <Text style={styles.sectionTitle}>Journal</Text>
            {quality.events.slice(0, 8).map((event) => (
              <View key={event.id} style={styles.event}>
                <View style={styles.eventDot} />
                <View style={styles.eventBody}>
                  <Text style={styles.eventLabel}>{event.label}</Text>
                  {!!event.reason && (
                    <Text style={styles.eventReason} numberOfLines={2}>
                      {event.reason}
                    </Text>
                  )}
                </View>
                <Text style={styles.eventDate}>
                  {new Date(event.occurredAt).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </Text>
              </View>
            ))}

            <Disclosure label="Ce qu’une publication écartée change vraiment">
              <DisclosureLine>
                Elle reste en ligne, sur ton profil et dans le fil de tes abonnés. Ce n’est pas
                une sanction — seule la répétition rapprochée touche le compte.
              </DisclosureLine>
              <DisclosureLine>
                Un avertissement expire seul au bout de {num(status.strike_ttl_days)} jours. Rien
                n’est à faire pour qu’il tombe : il suffit qu’il ne s’en ajoute pas.
              </DisclosureLine>
            </Disclosure>
          </GlassCard>
        )}

        {clean && status.per_policy.length === 0 && (
          <EmptyState
            icon="shield-checkmark-outline"
            title="Aucun avertissement"
            message="Ton compte est distribué normalement sur toutes les surfaces."
          />
        )}
      </ScrollView>
    );
  };

  return (
    <ScreenBackground>
      <View style={styles.container}>
        <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
        <AppHeader
          navigation={navigation}
          title="État du compte"
          subtitle="Distribution, avertissements et date de retour"
        />
        {body()}
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  scroll: { paddingHorizontal: 16, paddingTop: 4 },

  card: { marginBottom: 12 },
  cardBody: { padding: 14 },

  /* En-tête */
  headlineBody: { padding: 16 },
  headlineTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  levelIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  headlineText: { flex: 1 },
  level: { fontFamily: fonts.bold, fontSize: 18, letterSpacing: -0.3 },
  manualTag: { marginTop: 1, fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted },

  ladder: { flexDirection: 'row', gap: 6, marginTop: 16 },
  ladderStep: { flex: 1 },
  ladderBar: { height: 4, borderRadius: 2, backgroundColor: colors.surfaceElevated },
  ladderLabel: {
    marginTop: 6,
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: 9.5,
    color: colors.textMuted,
  },

  summary: {
    marginTop: 14,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  recoverRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 11 },
  recoverText: { flex: 1, fontFamily: fonts.regular, fontSize: 11.5, color: colors.textMuted },

  grid: { flexDirection: 'row', gap: 8, marginBottom: 12 },

  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  sectionTitle: { fontFamily: fonts.bold, fontSize: 13.5, color: colors.textPrimary, marginBottom: 9 },
  note: {
    marginTop: 8,
    fontFamily: fonts.regular,
    fontSize: 11.5,
    lineHeight: 17,
    color: colors.textMuted,
  },

  nextStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    padding: 11,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  nextStepSevere: { borderWidth: 1, borderColor: withAlpha(colors.like, 0.5) },
  nextStepText: { flex: 1, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: colors.textSecondary },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  chipText: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.textSecondary },

  banCard: { borderWidth: 1, borderColor: withAlpha(colors.like, 0.55) },
  banCount: { flexDirection: 'row', alignItems: 'baseline', gap: 9, marginTop: 11 },
  banCountValue: { fontFamily: fonts.mono, fontSize: 20, color: colors.like },
  banCountLimit: { fontSize: 13, color: colors.textMuted },
  banCountLabel: { flex: 1, fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted },

  policyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  policyText: { flex: 1 },
  policyReason: { fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 17, color: colors.textPrimary },
  policyExpiry: { marginTop: 2, fontFamily: fonts.regular, fontSize: 10.5, color: colors.textMuted },
  policyCount: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  policyCountText: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.textPrimary },

  event: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  eventDot: { width: 5, height: 5, borderRadius: 3, marginTop: 6, backgroundColor: colors.warning },
  eventBody: { flex: 1 },
  eventLabel: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.textPrimary },
  eventReason: { marginTop: 2, fontFamily: fonts.regular, fontSize: 11, lineHeight: 15, color: colors.textMuted },
  eventDate: { fontFamily: fonts.regular, fontSize: 10.5, color: colors.textMuted, marginTop: 1 },
});
