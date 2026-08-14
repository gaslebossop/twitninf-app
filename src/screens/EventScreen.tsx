import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, statusBarStyle, withAlpha } from '../theme';
import { AppRefreshControl, EmptyState } from '../components/ui';
import { toast } from '../components/ui/Toast';
import { celebrateReward } from '../components/ui/RewardBurst';
import feedback from '../utils/feedback';
import { useEvents } from '../contexts/EventsContext';
import QuestCard from '../components/events/QuestCard';
import EventAmbience from '../components/events/EventAmbience';
import type { QuestView } from '../types/events';

/**
 * Le hub d'événement — un seul écran, pour tous les événements.
 *
 * ── Ce qu'il remplace ─────────────────────────────────────────────────────
 * `KosporBirthdayScreen`, 1 305 lignes, dont l'intégralité du contenu était
 * écrite en dur pour UN événement : ses couleurs, ses textes, sa liste de
 * défis, jusqu'au gâteau en emoji. Le suivant aurait exigé un second fichier
 * de 1 300 lignes — c'est d'ailleurs exactement ce qui s'est passé entre
 * `EventBanner` et `FunctionalEventBanner`.
 *
 * Ici, rien n'est écrit en dur. L'écran lit l'événement du contexte et la DA
 * que celui-ci a résolue. Changer d'événement ne demande aucune ligne de code
 * de plus ; livrer une nouvelle DA en demande une : sa clé dans `eventArt`.
 *
 * ── Ce que l'écran doit dire, dans l'ordre ────────────────────────────────
 * 1. Combien de temps il reste. C'est l'information qui décide si on agit
 *    aujourd'hui ou pas, et elle passait auparavant sous trois blocs de
 *    bienvenue.
 * 2. Où j'en suis globalement.
 * 3. Ce que je peux récupérer TOUT DE SUITE (le contexte trie déjà dans cet
 *    ordre — voir `assemble`).
 */

function formatRemaining(ms: number | null): string {
  if (ms == null) return '';
  if (ms <= 0) return 'Terminé';

  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  // On ne descend jamais à trois unités : « 6 j 4 h 12 min » ne se lit pas et
  // ne sert à rien — à six jours de la fin, la minute n'aide personne à
  // décider quoi que ce soit.
  if (days > 0) return `${days} j ${hours} h`;
  if (hours > 0) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}

export default function EventScreen() {
  const { event, quests, art, isLive, endsIn, loading, refresh, claim } = useEvents();
  const [refreshing, setRefreshing] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const stats = useMemo(() => {
    const done = quests.filter((q) => q.state.completed).length;
    const claimable = quests.filter(
      (q) => q.state.completed && !q.state.claimed && !q.locked,
    ).length;
    return { done, total: quests.length, claimable };
  }, [quests]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh(true);
    setRefreshing(false);
  }, [refresh]);

  const onClaim = useCallback(
    async (questId: string) => {
      if (claimingId) return;
      setClaimingId(questId);

      const result = await claim(questId);

      if (!result.ok) {
        feedback.refuse();
        toast.error('Récompense indisponible', { description: result.message });
        setClaimingId(null);
        return;
      }

      // Ce que le serveur a RÉELLEMENT donné, pas ce que la quête annonçait :
      // sur un paquet surprise, les deux sont différents par construction, et
      // c'est tout l'intérêt du paquet.
      const granted = result.granted;
      const amount = Number(granted?.payload?.amount ?? 0);

      if (granted?.kind === 'coins' && amount > 0) {
        celebrateReward({ amount, unit: 'NF', label: granted.label });
      } else {
        feedback.reward();
        toast.success('Récompense débloquée', { description: granted?.label });
      }

      setClaimingId(null);
    },
    [claim, claimingId],
  );

  const renderQuest = useCallback(
    ({ item }: { item: QuestView }) => (
      <QuestCard
        quest={item}
        art={art}
        claiming={claimingId === item.id}
        onClaim={onClaim}
      />
    ),
    [art, claimingId, onClaim],
  );

  const keyExtractor = useCallback((item: QuestView) => item.id, []);

  const header = useMemo(
    () => (
      <View style={S.headerWrap}>
        <LinearGradient
          colors={art.gradients.header}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <EventAmbience art={art} height={260} />

        <View style={S.headerBody}>
          <Text style={[S.eyebrow, { color: art.colors.festive }]}>
            {isLive ? 'EN COURS' : 'BIENTÔT'}
          </Text>

          {/* La police d'affiche est réservée à ce titre et au compte à
              rebours. L'employer partout la banaliserait en une journée. */}
          <Text style={[S.title, { fontFamily: art.fonts.display }]} numberOfLines={2}>
            {event?.name ?? 'Événement'}
          </Text>

          {!!event?.description && <Text style={S.subtitle}>{event.description}</Text>}

          <View style={S.metrics}>
            <View style={S.metric}>
              <Text style={[S.metricValue, { fontFamily: art.fonts.display, color: art.colors.festive }]}>
                {formatRemaining(endsIn)}
              </Text>
              <Text style={S.metricLabel}>restant</Text>
            </View>
            <View style={S.metricDivider} />
            <View style={S.metric}>
              <Text style={[S.metricValue, { fontFamily: art.fonts.display, color: art.colors.festive }]}>
                {stats.done}/{stats.total}
              </Text>
              <Text style={S.metricLabel}>quêtes</Text>
            </View>
          </View>

          {/* Le rappel n'apparaît QUE s'il y a quelque chose à faire. Un
              bandeau permanent qui dit « rien à récupérer » est du bruit. */}
          {stats.claimable > 0 && (
            <View style={[S.claimable, { backgroundColor: withAlpha(art.colors.festive, 0.14) }]}>
              <Ionicons name="gift" size={15} color={art.colors.festive} />
              <Text style={[S.claimableText, { color: art.colors.festive }]}>
                {stats.claimable === 1
                  ? '1 récompense t\'attend'
                  : `${stats.claimable} récompenses t'attendent`}
              </Text>
            </View>
          )}
        </View>
      </View>
    ),
    [art, event, endsIn, isLive, stats],
  );

  return (
    <View style={[S.root, { backgroundColor: art.colors.ink }]}>
      <StatusBar barStyle={statusBarStyle()} translucent backgroundColor="transparent" />
      <SafeAreaView style={S.safe} edges={['top']}>
        <FlatList
          data={quests}
          renderItem={renderQuest}
          keyExtractor={keyExtractor}
          ListHeaderComponent={header}
          contentContainerStyle={S.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            loading ? null : (
              <View style={S.empty}>
                <EmptyState
                  icon="calendar-outline"
                  title={event ? 'Aucune quête' : 'Rien en ce moment'}
                  message={
                    event
                      ? 'Cet événement n\'a pas de quête à afficher.'
                      : 'Le prochain événement s\'affichera ici dès qu\'il commencera.'
                  }
                  tint={art.colors.festive}
                />
              </View>
            )
          }
          ListFooterComponent={<View style={{ height: 120 }} />}
        />
      </SafeAreaView>
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  content: { paddingHorizontal: 16 },

  headerWrap: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 22,
    marginBottom: 18,
    overflow: 'hidden',
  },
  headerBody: { gap: 6 },
  eyebrow: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.6 },
  title: {
    color: colors.white,
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: 0.2,
  },
  subtitle: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 13.5,
    lineHeight: 19,
    marginTop: 2,
  },

  metrics: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  metric: { alignItems: 'flex-start' },
  metricValue: { fontSize: 22, letterSpacing: 0.3 },
  metricLabel: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 11,
    letterSpacing: 0.4,
    marginTop: 1,
  },
  metricDivider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
    backgroundColor: colors.borderStrong,
    marginHorizontal: 18,
  },

  claimable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    alignSelf: 'flex-start',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: radius.md,
    marginTop: 14,
  },
  claimableText: { fontFamily: fonts.semibold, fontSize: 12.5 },

  empty: { paddingTop: 40 },
});
