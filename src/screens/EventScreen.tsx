import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { fonts, withAlpha } from '../theme';
import { icon as iconSize, round, space, touch, type } from '../theme/eventScale';
import { AppRefreshControl } from '../components/ui';
import { toast } from '../components/ui/Toast';
import { celebrateReward } from '../components/ui/RewardBurst';
import feedback from '../utils/feedback';
import Tappable from '../components/ui/Tappable';
import { useEvents } from '../contexts/EventsContext';
import QuestCard from '../components/events/QuestCard';
import EventAmbience from '../components/events/EventAmbience';
import EventCelebration from '../components/events/EventCelebration';
import EventRewards from '../components/events/EventRewards';
import type { QuestView } from '../types/events';

/**
 * Le hub d'événement.
 *
 * ── Les deux versions précédentes, et ce qui n'allait pas ─────────────────
 * La première était une liste plate de onze cartes identiques. La deuxième
 * était la même liste, mieux habillée. Le verdict était le même : « ça
 * n'apporte rien ». Il était juste — le problème n'était pas l'habillage, mais
 * le fait que la page NE CONTIENT RIEN. Une liste de quêtes est une liste de
 * corvées : on la parcourt une fois, on comprend qu'il faut cocher onze cases,
 * et on n'y revient plus.
 *
 * ── Ce qui manque à une liste pour devenir une fête ───────────────────────
 * Une raison de revenir. Trois onglets, et un seul contient des quêtes :
 *
 *  - **Fête** : l'objectif commun, qui bouge tout seul parce que d'AUTRES gens
 *    publient, et le livre d'or, écrit par eux. C'est la seule partie qui est
 *    différente à chaque visite.
 *  - **Quêtes** : la mécanique, groupée par état — ce qu'on peut récupérer
 *    tout de suite d'abord.
 *  - **Récompenses** : la vitrine. La question qu'on se pose AVANT de
 *    commencer, et celle qui décide si on s'y met.
 *
 * Toutes les couleurs viennent de `art.colors` : la page impose son fond, donc
 * elle impose aussi ses surfaces et ses textes. Les mélanger avec les jetons
 * du thème donnait des cartes blanches sur fond noir en thème clair.
 */

type Tab = 'party' | 'quests' | 'rewards';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'party', label: 'Fête', icon: 'sparkles' },
  { key: 'quests', label: 'Quêtes', icon: 'flag' },
  { key: 'rewards', label: 'Récompenses', icon: 'gift' },
];

function formatRemaining(ms: number | null): string {
  if (ms == null) return '—';
  if (ms <= 0) return 'Terminé';

  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  // Jamais trois unités : « 6 j 4 h 12 min » ne se lit pas, et à six jours de
  // la fin la minute n'aide personne à décider quoi que ce soit.
  if (days > 0) return `${days} j ${hours} h`;
  if (hours > 0) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}

export default function EventScreen() {
  const { event, quests, art, isLive, endsIn, loading, refresh, claim } = useEvents();
  const [tab, setTab] = useState<Tab>('party');
  const [refreshing, setRefreshing] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const doneCount = useMemo(
    () => quests.filter((q) => q.state.completed).length,
    [quests],
  );
  const claimableCount = useMemo(
    () => quests.filter((q) => q.state.completed && !q.state.claimed && !q.locked).length,
    [quests],
  );

  /** L'objectif commun vit dans l'onglet Fête : il sort de la liste. */
  const questList = useMemo(() => quests.filter((q) => q.kind !== 'collective'), [quests]);

  const grouped = useMemo(() => {
    const claimable: QuestView[] = [];
    const running: QuestView[] = [];
    const todo: QuestView[] = [];
    const finished: QuestView[] = [];

    for (const quest of questList) {
      if (quest.state.claimed) finished.push(quest);
      else if (quest.state.completed && !quest.locked) claimable.push(quest);
      else if (quest.state.progress > 0) running.push(quest);
      else todo.push(quest);
    }
    return [
      { title: 'À récupérer', data: claimable },
      { title: 'En cours', data: running },
      { title: 'À découvrir', data: todo },
      { title: 'Terminées', data: finished },
    ].filter((s) => s.data.length > 0);
  }, [questList]);

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
      // sur un paquet surprise les deux diffèrent, et c'est tout l'intérêt.
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

  return (
    <View style={[S.root, { backgroundColor: art.colors.ink }]}>
      <StatusBar
        barStyle={art.statusBar === 'dark' ? 'dark-content' : 'light-content'}
        translucent
        backgroundColor="transparent"
      />
      <SafeAreaView style={S.safe} edges={['top']}>
        <ScrollView
          contentContainerStyle={S.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* ── En-tête ── */}
          <View style={S.headerWrap}>
            <LinearGradient
              colors={art.gradients.header}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <EventAmbience art={art} height={210} />

            <View style={S.headerBody}>
              <Text style={[S.eyebrow, { color: withAlpha(art.colors.onHeader, 0.85) }]}>
                {isLive ? 'EN COURS' : 'BIENTÔT'}
              </Text>

              {/* La police d'affiche est réservée au titre et aux chiffres.
                  L'employer partout la banaliserait en une journée. */}
              <Text
                style={[S.title, { fontFamily: art.fonts.display, color: art.colors.onHeader }]}
                numberOfLines={2}
              >
                {event?.name ?? 'Événement'}
              </Text>

              {/* Jauge segmentée : un segment par quête. On lit « combien il y
                  en a » et « combien sont faites » sans avoir à compter. */}
              {quests.length > 0 && (
                <View style={S.segments}>
                  {quests.map((quest) => (
                    <View
                      key={quest.id}
                      style={[
                        S.segment,
                        {
                          backgroundColor: quest.state.completed
                            ? art.colors.onHeader
                            : withAlpha(art.colors.onHeader, 0.28),
                        },
                      ]}
                    />
                  ))}
                </View>
              )}

              <View style={S.metrics}>
                <Text
                  style={[S.metricValue, { fontFamily: art.fonts.display, color: art.colors.onHeader }]}
                >
                  {doneCount}/{quests.length}
                </Text>
                <Text style={[S.metricLabel, { color: withAlpha(art.colors.onHeader, 0.75) }]}>quêtes</Text>
                <View style={[S.dot, { backgroundColor: withAlpha(art.colors.onHeader, 0.5) }]} />
                <Ionicons name="time-outline" size={13} color={withAlpha(art.colors.onHeader, 0.75)} />
                <Text style={[S.metricLabel, { color: withAlpha(art.colors.onHeader, 0.75) }]}>
                  {formatRemaining(endsIn)}
                </Text>
              </View>
            </View>
          </View>

          {/* ── Onglets ── */}
          <View style={[S.tabs, { backgroundColor: art.colors.surfaceAlt }]}>
            {TABS.map((item) => {
              const active = tab === item.key;
              // La pastille ne s'affiche que sur l'onglet qu'on ne regarde pas :
              // signaler « il y a 2 récompenses » sur l'onglet ouvert, où elles
              // sont déjà visibles, est du bruit.
              const badge = item.key === 'quests' && !active ? claimableCount : 0;

              return (
                <Tappable
                  key={item.key}
                  style={[S.tab, active && { backgroundColor: art.colors.festive }]}
                  scaleTo={0.97}
                  haptic="select"
                  onPress={() => setTab(item.key)}
                  accessibilityLabel={item.label}
                >
                  <Ionicons
                    name={item.icon as any}
                    size={iconSize.sm}
                    color={active ? art.colors.onFestive : art.colors.textDim}
                  />
                  <Text
                    style={[
                      S.tabLabel,
                      { color: active ? art.colors.onFestive : art.colors.textDim },
                    ]}
                  >
                    {item.label}
                  </Text>
                  {badge > 0 && (
                    <View style={[S.badge, { backgroundColor: art.colors.festive }]}>
                      <Text style={[S.badgeText, { color: art.colors.onFestive }]}>{badge}</Text>
                    </View>
                  )}
                </Tappable>
              );
            })}
          </View>

          {/* ── Contenu ── */}
          {!event && !loading ? (
            <View style={S.empty}>
              <Ionicons name="calendar-outline" size={34} color={art.colors.textMuted} />
              <Text style={[S.emptyTitle, { color: art.colors.text }]}>Rien en ce moment</Text>
              <Text style={[S.emptyText, { color: art.colors.textDim }]}>
                Le prochain événement s'affichera ici dès qu'il commencera.
              </Text>
            </View>
          ) : tab === 'party' && event ? (
            <EventCelebration
              event={event}
              art={art}
              quests={quests}
              onQuestsChanged={() => refresh(true)}
            />
          ) : tab === 'rewards' ? (
            <EventRewards art={art} quests={questList} />
          ) : (
            grouped.map((section) => (
              <View key={section.title}>
                <View style={S.sectionHeader}>
                  <Text style={[S.sectionTitle, { color: art.colors.text }]}>{section.title}</Text>
                  <View style={[S.sectionCount, { backgroundColor: art.colors.surfaceAlt }]}>
                    <Text style={[S.sectionCountText, { color: art.colors.textDim }]}>
                      {section.data.length}
                    </Text>
                  </View>
                </View>
                {section.data.map((quest) => (
                  <QuestCard
                    key={quest.id}
                    quest={quest}
                    art={art}
                    claiming={claimingId === quest.id}
                    onClaim={onClaim}
                  />
                ))}
              </View>
            ))
          )}

          <View style={{ height: 120 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  // Marge d'ecran a 16 : la valeur de reference de la grille 8pt sur mobile.
  content: { paddingHorizontal: space.md },

  headerWrap: {
    marginHorizontal: -space.md,
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.lg,
    overflow: 'hidden',
    borderBottomLeftRadius: round.xxl,
    borderBottomRightRadius: round.xxl,
  },
  headerBody: { gap: space.xxs },
  eyebrow: { fontFamily: fonts.bold, ...type.caption, letterSpacing: 1.5 },
  title: { ...type.display },

  segments: { flexDirection: 'row', gap: 3, marginTop: space.md },
  segment: { flex: 1, height: 4, borderRadius: 2 },

  metrics: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.sm },
  metricValue: { ...type.h1 },
  metricLabel: { fontFamily: fonts.medium, ...type.bodySm },
  dot: { width: 3, height: 3, borderRadius: 2, marginHorizontal: space.xxs },

  tabs: {
    flexDirection: 'row',
    borderRadius: round.pill,
    padding: space.xxs,
    gap: space.xxs,
    marginTop: space.md,
    marginBottom: space.lg,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xxs,
    // 44 pt : minimum Apple pour une cible tactile. La version precedente
    // etait a 38, sous la norme — et les onglets sont ce qu'on touche le plus.
    height: touch.min,
    borderRadius: round.pill,
  },
  tabLabel: { fontFamily: fonts.semibold, ...type.label },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: space.xxs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: fonts.bold, ...type.caption },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginTop: space.xxs,
    marginBottom: space.sm,
  },
  sectionTitle: { fontFamily: fonts.display, ...type.h1 },
  sectionCount: {
    minWidth: 24,
    paddingHorizontal: space.xs,
    paddingVertical: 2,
    borderRadius: round.pill,
    alignItems: 'center',
  },
  sectionCountText: { fontFamily: fonts.bold, ...type.caption },

  empty: { alignItems: 'center', paddingTop: space.xxl, gap: space.xs },
  emptyTitle: { fontFamily: fonts.display, ...type.h1 },
  emptyText: {
    fontFamily: fonts.regular,
    ...type.bodySm,
    textAlign: 'center',
    paddingHorizontal: space.xl,
  },
});
