import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radius, statusBarStyle } from '../theme';
import { AppHeader, Card, EmptyState, ErrorState, ScreenBackground, ScreenSkeleton } from '../components/ui';
import neuralRankService, { type AccountStatus } from '../services/neuralRankService';

/**
 * État du compte — le pendant lisible de la restriction de portée.
 *
 * Miroir de la page « état du compte » de TikTok : un compte restreint sans
 * savoir pourquoi ni jusqu'à quand ne corrige rien, il devine. Cet écran lit
 * `GET /api/neural-rank/account-status`, jamais un identifiant fourni par le
 * client — l'API ne sert que le compte authentifié (voir la route côté API).
 */

const SURFACE_LABELS: Record<string, string> = {
  for_you: 'Pour toi',
  discover: 'Découverte',
  trending: 'Tendances',
  follower_feed: 'Fil d’abonnement',
};

const LEVEL_ICON: Record<AccountStatus['level_label'], keyof typeof Ionicons.glyphMap> = {
  clean: 'checkmark-circle',
  monitoring: 'alert-circle-outline',
  suppressed: 'eye-off-outline',
  ghosted: 'eye-off',
};

const LEVEL_TINT: Record<AccountStatus['level_label'], string> = {
  clean: colors.success,
  monitoring: colors.warning,
  suppressed: colors.like,
  ghosted: colors.like,
};

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function AccountStatusScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
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

  useEffect(() => { load(); }, [load]);

  const tint = status ? LEVEL_TINT[status.level_label] : colors.success;
  const icon = status ? LEVEL_ICON[status.level_label] : 'checkmark-circle';
  const recoversAt = status ? formatDate(status.recovers_at) : null;

  const body = () => {
    if (loading && !status) return <ScreenSkeleton variant="list" />;
    if (error && !status) return <ErrorState detail={error} onRetry={() => load()} />;
    if (!status) return null;

    return (
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.accent} />}
      >
        <Card style={styles.headline} highlight={status.level_label !== 'clean'}>
          <View style={styles.headlineTop}>
            <Ionicons name={icon} size={28} color={tint} />
            <View style={styles.headlineTextWrap}>
              <Text style={[styles.headlineLevel, { color: tint }]}>{status.level}</Text>
              {status.manual && <Text style={styles.manualTag}>Décision d’équipe</Text>}
            </View>
          </View>
          <Text style={styles.summary}>{status.summary}</Text>
          {recoversAt && (
            <View style={styles.recoverRow}>
              <Ionicons name="time-outline" size={14} color={colors.textMuted} />
              <Text style={styles.recoverText}>
                Restriction allégée le {recoversAt} si rien ne s’ajoute
              </Text>
            </View>
          )}
        </Card>

        {status.velocity_throttled && (
          <Card style={styles.section}>
            <View style={styles.recoverRow}>
              <Ionicons name="hourglass-outline" size={16} color={colors.warning} />
              <Text style={styles.sectionTitle}>Ralenti pendant une heure</Text>
            </View>
            <Text style={styles.sectionNote}>
              Une action récente (suppression d’un post, changement d’avatar ou de bio,
              plusieurs publications rapprochées) a temporairement réduit ta portée de
              moitié. Ce n’est pas une sanction — ça s’efface tout seul.
            </Text>
          </Card>
        )}

        {status.restricted_surfaces.length > 0 && (
          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Surfaces actuellement fermées</Text>
            <View style={styles.chipRow}>
              {status.restricted_surfaces.map((s) => (
                <View key={s} style={styles.chip}>
                  <Text style={styles.chipText}>{SURFACE_LABELS[s] || s}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.sectionNote}>
              Tes posts restent visibles sur ton profil et pour tes abonnés — ils ne sont
              simplement plus mis en avant sur ces surfaces.
            </Text>
          </Card>
        )}

        {status.nearing_permanent_ban && (
          <Card style={[styles.section, styles.banWarning]}>
            <View style={styles.warnRow}>
              <Ionicons name="warning-outline" size={18} color={colors.like} />
              <Text style={styles.banWarningTitle}>Proche d’un bannissement définitif</Text>
            </View>
            <Text style={styles.sectionNote}>
              {status.nearing_permanent_ban.reason} — {status.nearing_permanent_ban.active_strikes}
              {' '}avertissement{status.nearing_permanent_ban.active_strikes > 1 ? 's' : ''} actif
              {status.nearing_permanent_ban.active_strikes > 1 ? 's' : ''} sur {status.nearing_permanent_ban.limit}.
            </Text>
          </Card>
        )}

        {status.per_policy.length > 0 && (
          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Avertissements actifs</Text>
            {status.per_policy.map((p) => (
              <View key={p.policy} style={styles.policyRow}>
                <View style={styles.policyTextWrap}>
                  <Text style={styles.policyReason}>{p.reason}</Text>
                  {p.next_expiry && (
                    <Text style={styles.policyExpiry}>
                      Le plus ancien expire le {formatDate(p.next_expiry)}
                    </Text>
                  )}
                </View>
                <View style={styles.policyCount}>
                  <Text style={styles.policyCountText}>{p.active_strikes}</Text>
                </View>
              </View>
            ))}
          </Card>
        )}

        {status.level_label === 'clean' && status.per_policy.length === 0 && (
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
  scroll: { paddingHorizontal: 20, paddingTop: 4, gap: 14 },

  headline: { padding: 18 },
  headlineTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headlineTextWrap: { flex: 1 },
  headlineLevel: { fontSize: 20, fontFamily: fonts.bold },
  manualTag: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.medium, marginTop: 2 },
  summary: { color: colors.textSecondary, fontSize: 14.5, lineHeight: 21, marginTop: 12, fontFamily: fonts.regular },
  recoverRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  recoverText: { color: colors.textMuted, fontSize: 12.5, fontFamily: fonts.medium },

  section: { padding: 16, gap: 4 },
  sectionTitle: { color: colors.textPrimary, fontSize: 15, fontFamily: fonts.semibold, marginBottom: 8 },
  sectionNote: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, fontFamily: fonts.regular, marginTop: 8 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: { color: colors.textSecondary, fontSize: 12.5, fontFamily: fonts.medium },

  banWarning: { borderColor: colors.like, borderWidth: 1 },
  warnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  banWarningTitle: { color: colors.like, fontSize: 14.5, fontFamily: fonts.semibold },

  policyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  policyTextWrap: { flex: 1, paddingRight: 10 },
  policyReason: { color: colors.textPrimary, fontSize: 13.5, fontFamily: fonts.medium },
  policyExpiry: { color: colors.textMuted, fontSize: 11.5, fontFamily: fonts.regular, marginTop: 2 },
  policyCount: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  policyCountText: { color: colors.textPrimary, fontSize: 13, fontFamily: fonts.bold },
});
