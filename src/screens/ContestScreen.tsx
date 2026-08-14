import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, statusBarStyle } from '../theme';
import {
  ScreenBackground,
  BackButton,
  ScreenSkeleton,
  ErrorState,
  Button,
  Card,
  Tappable,
  toast,
  confirmAsync,
} from '../components/ui';
import Avatar from '../components/Avatar';
import { invalidateContestCache } from '../components/ContestCard';
import {
  Contest,
  ContestError,
  cancelContest,
  describeConditions,
  fetchContest,
  formatAmount,
  formatPrize,
  formatTimeLeft,
  participate,
  withdraw,
} from '../services/contestService';

/**
 * Page de participation à un concours.
 *
 * ── Ce que l'écran doit rendre évident ───────────────────────────────────
 * 1. **Ce qu'on gagne** et **combien de temps il reste** — en haut, en gros.
 * 2. **Ce qu'il reste à faire** pour être éligible. Le serveur renvoie la
 *    liste exacte (`missing_conditions`) : elle est affichée telle quelle,
 *    cochée/décochée. Un bouton grisé sans explication serait le pire cas.
 * 3. **Que l'argent est déjà bloqué.** La cagnotte a quitté le portefeuille de
 *    l'organisateur à la création et attend le tirage ; les gagnants sont
 *    crédités automatiquement. C'est la différence entre un concours et une
 *    promesse, elle doit se voir.
 *
 * ── Pourquoi les conditions sont rechargées après chaque action ──────────
 * Aimer le tweet ou suivre l'organisateur se fait ailleurs dans l'app. Au
 * retour sur cet écran, l'état affiché doit être le vrai : d'où le
 * rafraîchissement au montage ET après chaque tentative de participation.
 */
export default function ContestScreen({ route, navigation }: any) {
  const contestId: string = route?.params?.contestId;

  const [contest, setContest] = useState<Contest | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    try {
      const data = await fetchContest(contestId);
      setContest(data);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [contestId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  // Le compte à rebours n'a besoin de la minute que tant que le concours court.
  const running = contest?.status === 'open';
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(timer);
  }, [running]);

  const onParticipate = async () => {
    if (!contest || busy) return;
    setBusy(true);
    try {
      await participate(contest.id);
      invalidateContestCache(contest.tweet_id);
      await load();
      toast.success('Participation enregistrée', {
        description: 'Tu es dans le tirage. Garde les conditions remplies jusqu’à la fin.',
      });
    } catch (error) {
      const e = error as ContestError;
      // Le refus le plus fréquent n'est pas une panne : il manque une
      // condition. On recharge pour que la liste affichée soit à jour, et le
      // message dit précisément quoi faire.
      if (e.missing?.length) {
        await load();
        toast.error('Il te manque une condition', {
          description: e.missing.map((m) => m.label).join(' · '),
        });
      } else {
        toast.error(e.message || 'Participation impossible.');
      }
    } finally {
      setBusy(false);
    }
  };

  const onWithdraw = async () => {
    if (!contest || busy) return;
    const confirmed = await confirmAsync({
      title: 'Te retirer du concours ?',
      message: 'Tu ne seras plus dans le tirage. Tu pourras revenir tant qu’il est ouvert.',
      destructive: true,
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      await withdraw(contest.id);
      invalidateContestCache(contest.tweet_id);
      await load();
      toast.info('Tu t’es retiré du concours.');
    } catch (error) {
      toast.error((error as Error).message || 'Retrait impossible.');
    } finally {
      setBusy(false);
    }
  };

  const onCancel = async () => {
    if (!contest || busy) return;
    const confirmed = await confirmAsync({
      title: 'Annuler ce concours ?',
      message: 'Aucun tirage n’aura lieu. Le tweet reste en ligne, marqué comme annulé.',
      destructive: true,
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      await cancelContest(contest.id);
      invalidateContestCache(contest.tweet_id);
      await load();
      toast.info('Concours annulé.');
    } catch (error) {
      toast.error((error as Error).message || 'Annulation impossible.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <ScreenBackground>
        <ScreenSkeleton variant="list" />
      </ScreenBackground>
    );
  }

  if (failed || !contest) {
    return (
      <ScreenBackground>
        <SafeAreaView style={S.flex}>
          <View style={S.header}>
            <BackButton navigation={navigation} />
            <Text style={S.headerTitle}>Concours</Text>
            <View style={S.headerSpacer} />
          </View>
          <ErrorState
            title="Ce concours est introuvable."
            detail="Il a peut-être été supprimé, ou le tweet qui le portait n'existe plus."
            onRetry={() => {
              setLoading(true);
              load().finally(() => setLoading(false));
            }}
          />
        </SafeAreaView>
      </ScreenBackground>
    );
  }

  const timeLeft = formatTimeLeft(contest.ends_at);
  const escrow = describeEscrow(contest);
  const allConditions = describeConditions(contest.conditions);
  const missingLabels = new Set(contest.viewer.missing_conditions.map((m) => m.label));
  const closed = contest.status === 'closed';
  const cancelled = contest.status === 'cancelled';

  return (
    <ScreenBackground>
      <StatusBar barStyle={statusBarStyle()} />
      <SafeAreaView style={S.flex}>
        <View style={S.header}>
          <BackButton navigation={navigation} />
          <Text style={S.headerTitle}>Concours</Text>
          <View style={S.headerSpacer} />
        </View>

        <ScrollView contentContainerStyle={S.scroll} showsVerticalScrollIndicator={false}>
          {/* --- Cagnotte + échéance --- */}
          <Card style={S.hero}>
            <Text style={S.heroLabel}>À GAGNER</Text>
            <Text style={S.heroPrize}>{formatPrize(contest)}</Text>
            {!!contest.prize_note && <Text style={S.heroNote}>{contest.prize_note}</Text>}
            {contest.winners_count > 1 && <Text style={S.heroNote}>par gagnant</Text>}

            {/* L'état du séquestre est ce qui distingue un concours financé
                d'une simple annonce. Il ne se déduit d'aucun autre champ. */}
            {!!escrow && (
              <View style={[S.escrow, escrow.tone === 'ok' && S.escrowOk]}>
                <Ionicons
                  name={escrow.icon}
                  size={13}
                  color={escrow.tone === 'ok' ? colors.success : colors.textMuted}
                />
                <Text style={[S.escrowText, escrow.tone === 'ok' && S.escrowTextOk]}>
                  {escrow.label}
                </Text>
              </View>
            )}
            {!!contest.title && <Text style={S.heroTitle}>{contest.title}</Text>}

            <View style={S.heroMeta}>
              <Meta
                icon="people-outline"
                value={String(contest.entries_count)}
                label={contest.entries_count > 1 ? 'participants' : 'participant'}
              />
              <Meta
                icon="trophy-outline"
                value={String(contest.winners_count)}
                label={contest.winners_count > 1 ? 'gagnants' : 'gagnant'}
              />
              <Meta
                icon="time-outline"
                value={cancelled ? '—' : closed ? 'Fini' : timeLeft ?? 'Tirage'}
                label={cancelled ? 'annulé' : closed ? '' : timeLeft ? 'restant' : 'en cours'}
              />
            </View>
          </Card>

          {/* --- Organisateur --- */}
          {!!contest.creator && (
            <Tappable
              style={S.creatorRow}
              onPress={() =>
                navigation.navigate('UserProfile', { userId: contest.creator!.id })
              }
            >
              <Avatar size={38} username={contest.creator.username} uri={contest.creator.avatar} />
              <View style={S.creatorText}>
                <Text style={S.creatorName}>
                  {contest.creator.full_name || contest.creator.username}
                </Text>
                <Text style={S.creatorHandle}>@{contest.creator.username} · organisateur</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Tappable>
          )}

          {/* --- Conditions --- */}
          {allConditions.length > 0 && (
            <View style={S.section}>
              <Text style={S.sectionTitle}>Conditions de participation</Text>
              {allConditions.map((label) => {
                // Une condition n'est « à faire » que si le serveur l'a
                // listée comme manquante. Pour l'organisateur et pour un
                // participant déjà inscrit, la liste est vide : tout s'affiche
                // alors comme rempli, ce qui est exact.
                const todo = missingLabels.has(label);
                return (
                  <View key={label} style={S.conditionRow}>
                    <Ionicons
                      name={todo ? 'ellipse-outline' : 'checkmark-circle'}
                      size={18}
                      color={todo ? colors.textMuted : colors.success}
                    />
                    <Text style={[S.conditionLabel, todo && S.conditionTodo]}>{label}</Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* --- Résultat --- */}
          {closed && (
            <View style={S.section}>
              <Text style={S.sectionTitle}>
                {contest.winners.length > 0 ? 'Gagnants' : 'Aucun gagnant'}
              </Text>
              {contest.winners.length === 0 && (
                <Text style={S.help}>
                  Aucun participant ne remplissait les conditions au moment du tirage.
                </Text>
              )}
              {contest.winners.map((entry) => (
                <View key={entry.id} style={S.winnerRow}>
                  <Text style={S.winnerRank}>#{entry.rank}</Text>
                  <Avatar
                    size={32}
                    username={entry.user?.username || '?'}
                    uri={entry.user?.avatar}
                  />
                  <Text style={S.winnerName}>@{entry.user?.username}</Text>
                  {entry.user_id === contest.creator_id && <View style={S.flex} />}
                </View>
              ))}

              {/* Le tirage est reproductible : la graine est publiée une fois
                  utilisée, avec l'empreinte annoncée dès la création. */}
              {!!contest.draw_seed && (
                <View style={S.proof}>
                  <Text style={S.proofTitle}>Tirage vérifiable</Text>
                  <Text style={S.proofText}>
                    Ordre = sha256(graine + « : » + identifiant du participant), du plus petit au
                    plus grand.
                  </Text>
                  <Text style={S.proofMono} selectable>
                    graine : {contest.draw_seed}
                  </Text>
                  <Text style={S.proofMono} selectable>
                    empreinte annoncée : {contest.seed_commitment}
                  </Text>
                </View>
              )}
            </View>
          )}

          {contest.viewer.entry_status === 'rejected' && !!contest.viewer.rejected_reason && (
            <View style={S.warn}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.warning} />
              <Text style={S.warnText}>
                Tu n’étais pas éligible au tirage : {contest.viewer.rejected_reason}.
              </Text>
            </View>
          )}

          <Text style={S.disclaimer}>
            {contest.escrow?.is_funded
              ? 'La cagnotte a été prélevée sur le portefeuille de l’organisateur dès la création. Les gagnants sont crédités automatiquement au tirage ; une part sans gagnant lui est rendue.'
              : 'Ce concours a été annoncé sans cagnotte bloquée : le versement dépend uniquement de son organisateur.'}
          </Text>
        </ScrollView>

        {/* --- Action principale --- */}
        <View style={S.footer}>
          {busy ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <PrimaryAction
              contest={contest}
              onParticipate={onParticipate}
              onWithdraw={onWithdraw}
              onCancel={onCancel}
            />
          )}
        </View>
      </SafeAreaView>
    </ScreenBackground>
  );
}

/**
 * Ce qu'on dit de l'argent, selon l'état réel du séquestre. `none` couvre les
 * concours créés avant le prélèvement : annoncer une cagnotte bloquée qui ne
 * l'a jamais été serait faux.
 */
function describeEscrow(contest: Contest) {
  const status = contest.escrow?.status ?? 'none';
  const total = contest.escrow?.total;
  switch (status) {
    case 'held':
      return {
        tone: 'ok' as const,
        icon: 'lock-closed' as const,
        label: `Cagnotte bloquée : ${formatAmount(total ?? 0)} ${contest.prize_currency}`,
      };
    case 'paid':
      return {
        tone: 'ok' as const,
        icon: 'checkmark-done' as const,
        label: 'Gagnants crédités automatiquement',
      };
    case 'refunded':
      return {
        tone: 'muted' as const,
        icon: 'return-down-back' as const,
        label: "Cagnotte rendue à l'organisateur",
      };
    default:
      return {
        tone: 'muted' as const,
        icon: 'information-circle-outline' as const,
        label: 'Concours annoncé sans cagnotte bloquée',
      };
  }
}

/**
 * Un seul endroit décide du bouton du bas. Éclaté dans le JSX, cette logique
 * finissait par proposer « Participer » sur un concours clos.
 */
function PrimaryAction({
  contest,
  onParticipate,
  onWithdraw,
  onCancel,
}: {
  contest: Contest;
  onParticipate: () => void;
  onWithdraw: () => void;
  onCancel: () => void;
}) {
  if (contest.status === 'cancelled') {
    return <Text style={S.footerNote}>Ce concours a été annulé par l’organisateur.</Text>;
  }
  if (contest.status === 'closed') {
    return (
      <Text style={S.footerNote}>
        {contest.viewer.is_winner
          ? contest.escrow?.status === 'paid'
            ? 'Tu as gagné : le montant est déjà sur ton portefeuille.'
            : 'Tu as gagné. L’organisateur doit te verser la cagnotte.'
          : 'Le tirage a eu lieu.'}
      </Text>
    );
  }
  if (contest.status === 'drawing' || !formatTimeLeft(contest.ends_at)) {
    return <Text style={S.footerNote}>Participations closes, tirage imminent.</Text>;
  }
  if (contest.viewer.is_owner) {
    return <Button label="Annuler le concours" variant="ghost" onPress={onCancel} />;
  }
  if (contest.viewer.is_participating) {
    return <Button label="Me retirer du concours" variant="ghost" onPress={onWithdraw} />;
  }
  // Le bouton reste actif même quand il manque une condition : l'appui
  // déclenche un message qui dit laquelle. Un bouton grisé n'explique rien.
  return (
    <Button
      label={
        contest.viewer.missing_conditions.length > 0
          ? 'Vérifier et participer'
          : 'Participer au concours'
      }
      onPress={onParticipate}
    />
  );
}

function Meta({ icon, value, label }: { icon: any; value: string; label: string }) {
  return (
    <View style={S.metaItem}>
      <Ionicons name={icon} size={14} color={colors.textMuted} />
      <Text style={S.metaValue}>{value}</Text>
      {!!label && <Text style={S.metaLabel}>{label}</Text>}
    </View>
  );
}

const S = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerSpacer: { width: 40 },

  scroll: { paddingHorizontal: 16, paddingBottom: 40 },

  hero: { padding: 18, alignItems: 'center' },
  heroLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: colors.accent,
  },
  heroPrize: {
    marginTop: 6,
    fontSize: 38,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -1,
  },
  heroNote: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textMuted,
  },
  heroTitle: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    color: colors.textSecondary,
  },
  escrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.overlaySoft,
  },
  escrowOk: { backgroundColor: 'rgba(34,197,94,0.12)' },
  escrowText: { fontSize: 11.5, fontWeight: '600', color: colors.textMuted },
  escrowTextOk: { color: colors.success },

  heroMeta: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignSelf: 'stretch',
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  metaItem: { alignItems: 'center', gap: 3 },
  metaValue: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  metaLabel: { fontSize: 10.5, color: colors.textMuted },

  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginTop: 14,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.overlaySoft,
  },
  creatorText: { flex: 1 },
  creatorName: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  creatorHandle: { fontSize: 12, color: colors.textMuted },

  section: { marginTop: 22 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  conditionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
  },
  conditionLabel: { flex: 1, fontSize: 14, color: colors.textPrimary },
  conditionTodo: { color: colors.textSecondary },

  help: { fontSize: 13, lineHeight: 19, color: colors.textMuted },

  winnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  winnerRank: {
    width: 26,
    fontSize: 13,
    fontWeight: '800',
    color: colors.accent,
  },
  winnerName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },

  proof: {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.overlaySoft,
  },
  proofTitle: { fontSize: 12, fontWeight: '700', color: colors.textPrimary },
  proofText: { marginTop: 4, fontSize: 11.5, lineHeight: 16, color: colors.textMuted },
  proofMono: {
    marginTop: 6,
    fontSize: 10,
    lineHeight: 14,
    color: colors.textMuted,
    fontFamily: 'monospace',
  },

  warn: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 18,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.overlaySoft,
  },
  warnText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: colors.textSecondary },

  disclaimer: {
    marginTop: 24,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textMuted,
  },

  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    // La tab bar est en position absolue par-dessus les écrans : sans cette
    // marge, le bouton finit dessous et devient intapable.
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.bgElevated,
  },
  footerNote: {
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
  },
});
