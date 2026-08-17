import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radius, statusBarStyle } from '../theme';
import {
  AppHeader,
  Card,
  EmptyState,
  ScreenBackground,
  Tappable,
  showActionSheet,
  promptAsync,
  confirmAsync,
  toast,
} from '../components/ui';
import Avatar from '../components/Avatar';
import { moderationService, type User } from '../services/moderationService';
import shadowbanAdminService, {
  STRIKE_POLICIES,
  STRIKE_POLICY_LABELS,
  type StrikePolicy,
} from '../services/shadowbanAdminService';
import type { AccountStatus } from '../services/neuralRankService';

/**
 * Panneau admin du registre d'avertissements.
 *
 * Distinct de « Gestion des utilisateurs » (bannir/suspendre l'accès) : ici on
 * agit sur la DISTRIBUTION algorithmique d'un compte, pas sur son accès à
 * l'app. Les deux mécanismes coexistent côté serveur, voir
 * `api/src/routes/shadowbanAdminRoutes.js`.
 */

const SURFACE_LABELS: Record<string, string> = {
  for_you: 'Pour toi',
  discover: 'Découverte',
  trending: 'Tendances',
  follower_feed: 'Fil d’abonnement',
};

const LEVEL_TINT: Record<string, string> = {
  clean: colors.success,
  monitoring: colors.warning,
  suppressed: colors.like,
  ghosted: colors.like,
};

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ShadowbanAdminScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const searchSeq = useRef(0);

  const [selected, setSelected] = useState<User | null>(null);
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const seq = ++searchSeq.current;
    setSearching(true);
    const t = setTimeout(async () => {
      const found = await moderationService.searchUsers(q, 12);
      // Une recherche plus lente qu'une plus récente ne doit pas écraser son résultat.
      if (seq === searchSeq.current) {
        setResults(found);
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const loadStatus = useCallback(async (userId: string) => {
    setLoadingStatus(true);
    const res = await shadowbanAdminService.getAccountStatus(userId);
    if (res.success && res.data) {
      setStatus(res.data);
    } else {
      toast.error(res.message || 'État du compte indisponible');
      setStatus(null);
    }
    setLoadingStatus(false);
  }, []);

  const selectUser = useCallback((user: User) => {
    setSelected(user);
    setResults([]);
    setQuery('');
    loadStatus(user.id);
  }, [loadStatus]);

  const backToSearch = useCallback(() => {
    setSelected(null);
    setStatus(null);
  }, []);

  const handleIssueStrike = useCallback(() => {
    if (!selected) return;
    showActionSheet({
      title: 'Poser un avertissement',
      message: `Domaine de règle enfreint par @${selected.username}`,
      items: STRIKE_POLICIES.map((policy: StrikePolicy) => ({
        label: STRIKE_POLICY_LABELS[policy],
        icon: policy === 'violent_threat' || policy === 'hateful_conduct' ? 'warning-outline' : 'flag-outline',
        destructive: policy === 'violent_threat',
        onPress: async () => {
          const reason = await promptAsync({
            title: 'Motif (facultatif)',
            placeholder: 'Contexte pour l’équipe, visible en interne',
            required: false,
            multiline: true,
            maxLength: 300,
          });
          setBusy(true);
          const res = await shadowbanAdminService.issueStrike(selected.id, policy, null, reason || null);
          setBusy(false);
          if (res.success && res.data) {
            setStatus(res.data);
            toast.success('Avertissement posé');
          } else {
            toast.error(res.message || 'Échec de la pose de l’avertissement');
          }
        },
      })),
    });
  }, [selected]);

  const handleRevoke = useCallback(async () => {
    if (!selected) return;
    const ok = await confirmAsync({
      title: 'Lever tous les avertissements ?',
      message: `Le registre de @${selected.username} sera vidé et son niveau redescendra immédiatement.`,
      confirmLabel: 'Lever',
    });
    if (!ok) return;
    setBusy(true);
    const res = await shadowbanAdminService.revokeStrikes(selected.id);
    setBusy(false);
    if (res.success && res.data) {
      setStatus(res.data);
      toast.success('Avertissements levés');
    } else {
      toast.error(res.message || 'Échec de la levée');
    }
  }, [selected]);

  const handleManualLevel = useCallback(() => {
    if (!selected) return;
    showActionSheet({
      title: 'Décision manuelle',
      message: 'Prime sur le calcul automatique, dans les deux sens.',
      items: [
        { label: 'Blanchir (Clean)', icon: 'checkmark-circle-outline', onPress: () => applyLevel('clean') },
        { label: 'Surveillance (Monitoring)', icon: 'alert-circle-outline', onPress: () => applyLevel('monitoring') },
        { label: 'Suppression (Suppressed)', icon: 'eye-off-outline', onPress: () => applyLevel('suppressed') },
        { label: 'Fantôme (Ghosted)', icon: 'eye-off', destructive: true, onPress: () => applyLevel('ghosted') },
      ],
    });

    async function applyLevel(level: 'clean' | 'monitoring' | 'suppressed' | 'ghosted') {
      const reason = await promptAsync({
        title: 'Motif',
        placeholder: 'Pourquoi cette décision manuelle',
        required: true,
        multiline: true,
        maxLength: 300,
      });
      if (reason === null) return;
      setBusy(true);
      const res = await shadowbanAdminService.setLevel(selected!.id, level, reason);
      setBusy(false);
      if (res.success) {
        toast.success('Décision appliquée');
        loadStatus(selected!.id);
      } else {
        toast.error(res.message || 'Échec de la décision manuelle');
      }
    }
  }, [selected, loadStatus]);

  return (
    <ScreenBackground>
      <View style={styles.container}>
        <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
        <AppHeader
          navigation={navigation}
          title="Avertissements"
          subtitle="Registre de distribution algorithmique, par compte"
        />

        {!selected ? (
          <View style={styles.searchWrap}>
            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={17} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Chercher un compte par pseudo"
                placeholderTextColor={colors.textMuted}
                value={query}
                onChangeText={setQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searching && <ActivityIndicator size="small" color={colors.accent} />}
            </View>

            <ScrollView
              contentContainerStyle={[styles.resultsInner, { paddingBottom: insets.bottom + 24 }]}
              keyboardShouldPersistTaps="handled"
            >
              {results.map((u) => (
                <Tappable key={u.id} style={styles.resultRow} onPress={() => selectUser(u)}>
                  <Avatar size={38} username={u.username} uri={u.avatar} />
                  <View style={styles.resultText}>
                    <Text style={styles.resultUsername}>@{u.username}</Text>
                    {!!u.fullName && <Text style={styles.resultFullName}>{u.fullName}</Text>}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Tappable>
              ))}
              {query.trim().length >= 2 && !searching && results.length === 0 && (
                <EmptyState
                  icon="person-outline"
                  title="Aucun compte"
                  message="Aucun pseudo ne correspond à cette recherche."
                />
              )}
            </ScrollView>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
            showsVerticalScrollIndicator={false}
          >
            <Tappable style={styles.backRow} onPress={backToSearch}>
              <Ionicons name="chevron-back" size={16} color={colors.textSecondary} />
              <Text style={styles.backText}>Nouvelle recherche</Text>
            </Tappable>

            <Card style={styles.userCard}>
              <Avatar size={44} username={selected.username} uri={selected.avatar} />
              <View style={styles.userText}>
                <Text style={styles.userUsername}>@{selected.username}</Text>
                {!!selected.fullName && <Text style={styles.userFullName}>{selected.fullName}</Text>}
              </View>
            </Card>

            {loadingStatus ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator color={colors.accent} />
              </View>
            ) : status ? (
              <>
                <Card style={styles.statusCard} highlight={status.level_label !== 'clean'}>
                  <Text style={[styles.statusLevel, { color: LEVEL_TINT[status.level_label] || colors.textPrimary }]}>
                    {status.level}
                  </Text>
                  <Text style={styles.statusSummary}>{status.summary}</Text>
                  {status.manual && <Text style={styles.statusManualTag}>Décision d’équipe active</Text>}
                  {status.velocity_throttled && (
                    <Text style={styles.statusManualTag}>
                      Frein de vélocité actif (×0.5, 1h) — hors registre d’avertissements
                    </Text>
                  )}
                  {!!status.recovers_at && (
                    <Text style={styles.statusRecover}>
                      Retour à la normale le {formatDate(status.recovers_at)} si rien ne s’ajoute
                    </Text>
                  )}
                  {status.restricted_surfaces.length > 0 && (
                    <View style={styles.chipRow}>
                      {status.restricted_surfaces.map((s) => (
                        <View key={s} style={styles.chip}>
                          <Text style={styles.chipText}>{SURFACE_LABELS[s] || s}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </Card>

                {status.per_policy.length > 0 && (
                  <Card style={styles.section}>
                    <Text style={styles.sectionTitle}>Avertissements actifs</Text>
                    {status.per_policy.map((p) => (
                      <View key={p.policy} style={styles.policyRow}>
                        <Text style={styles.policyReason}>{p.reason}</Text>
                        <View style={styles.policyCount}>
                          <Text style={styles.policyCountText}>{p.active_strikes}</Text>
                        </View>
                      </View>
                    ))}
                  </Card>
                )}

                <View style={styles.actions}>
                  <Tappable style={[styles.actionBtn, styles.actionPrimary]} onPress={handleIssueStrike} disabled={busy}>
                    <Ionicons name="flag-outline" size={16} color={colors.white} />
                    <Text style={styles.actionPrimaryText}>Poser un avertissement</Text>
                  </Tappable>
                  <Tappable style={styles.actionBtn} onPress={handleManualLevel} disabled={busy}>
                    <Ionicons name="options-outline" size={16} color={colors.textPrimary} />
                    <Text style={styles.actionText}>Décision manuelle</Text>
                  </Tappable>
                  {status.active_strikes > 0 && (
                    <Tappable style={styles.actionBtn} onPress={handleRevoke} disabled={busy}>
                      <Ionicons name="refresh-outline" size={16} color={colors.textPrimary} />
                      <Text style={styles.actionText}>Lever tous les avertissements</Text>
                    </Tappable>
                  )}
                </View>
              </>
            ) : null}
          </ScrollView>
        )}
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },

  searchWrap: { flex: 1 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 4,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: 14.5, fontFamily: fonts.medium },

  resultsInner: { paddingHorizontal: 20, paddingTop: 10, gap: 4 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  resultText: { flex: 1 },
  resultUsername: { color: colors.textPrimary, fontSize: 14.5, fontFamily: fonts.semibold },
  resultFullName: { color: colors.textMuted, fontSize: 12.5, fontFamily: fonts.regular, marginTop: 1 },

  scroll: { paddingHorizontal: 20, paddingTop: 4, gap: 14 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4 },
  backText: { color: colors.textSecondary, fontSize: 13, fontFamily: fonts.medium },

  userCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  userText: { flex: 1 },
  userUsername: { color: colors.textPrimary, fontSize: 15.5, fontFamily: fonts.bold },
  userFullName: { color: colors.textMuted, fontSize: 12.5, fontFamily: fonts.medium, marginTop: 1 },

  loadingBox: { paddingVertical: 40, alignItems: 'center' },

  statusCard: { padding: 16 },
  statusLevel: { fontSize: 19, fontFamily: fonts.bold },
  statusSummary: { color: colors.textSecondary, fontSize: 13.5, lineHeight: 19, marginTop: 8, fontFamily: fonts.regular },
  statusManualTag: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.medium, marginTop: 8 },
  statusRecover: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.medium, marginTop: 8 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: { color: colors.textSecondary, fontSize: 12, fontFamily: fonts.medium },

  section: { padding: 16 },
  sectionTitle: { color: colors.textPrimary, fontSize: 14.5, fontFamily: fonts.semibold, marginBottom: 8 },
  policyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  policyReason: { flex: 1, color: colors.textPrimary, fontSize: 13, fontFamily: fonts.medium, paddingRight: 10 },
  policyCount: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  policyCountText: { color: colors.textPrimary, fontSize: 12.5, fontFamily: fonts.bold },

  actions: { gap: 10, marginTop: 4 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  actionPrimaryText: { color: colors.white, fontSize: 14, fontFamily: fonts.semibold },
  actionText: { color: colors.textPrimary, fontSize: 14, fontFamily: fonts.semibold },
});
