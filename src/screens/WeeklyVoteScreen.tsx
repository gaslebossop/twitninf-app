import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, RefreshControl, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, fonts, radius, spacing, statusBarStyle } from '../theme';
import { ScreenBackground, BackButton, ScreenSkeleton, EmptyState, GlassCard, GlassButton, Tappable } from '../components/ui';
import Avatar from '../components/Avatar';
import ClickableMentions from '../components/ClickableMentions';
import VerifiedBadge from '../components/VerifiedBadge';
import { toast } from '../components/ui/Toast';
import weeklyVoteService, { type WeeklyVoteCandidate } from '../services/weeklyVoteService';
import { LIST_TUNING } from '../utils/listTuning';

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`;
  return String(n || 0);
}

function fmtWeekRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  const startLabel = new Date(start).toLocaleDateString('fr-FR', opts);
  // `week_end` est le lundi suivant (borne exclusive) — le dimanche affiché
  // est donc la veille, pas la date brute renvoyée par l'API.
  const lastDay = new Date(end);
  lastDay.setUTCDate(lastDay.getUTCDate() - 1);
  const endLabel = lastDay.toLocaleDateString('fr-FR', opts);
  return `Du ${startLabel} au ${endLabel}`;
}

/**
 * Vote de la communauté pour le meilleur tweet de la semaine (idée retenue
 * sur La Forge). Classement en direct des tweets originaux de la semaine ISO
 * en cours, triés par nombre de likes ; un vote par compte et par semaine,
 * qui peut changer d'avis jusqu'à la fin de la semaine.
 */
export default function WeeklyVoteScreen() {
  const navigation = useNavigation();

  const [board, setBoard] = useState<{
    weekStart: string;
    weekEnd: string;
    totalVotes: number;
    myVote: string | null;
  } | null>(null);
  const [candidates, setCandidates] = useState<WeeklyVoteCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const votingRef = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    const res = await weeklyVoteService.fetchCandidates();
    if (!res.success || !res.data) {
      toast.error(res.message || 'Classement indisponible pour le moment.');
      return;
    }
    setCandidates(res.data.candidates);
    setBoard({
      weekStart: res.data.week_start,
      weekEnd: res.data.week_end,
      totalVotes: res.data.total_votes,
      myVote: res.data.my_vote,
    });
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleVote = useCallback(async (tweetId: string) => {
    if (votingRef.current.has(tweetId)) return;
    votingRef.current.add(tweetId);

    const previousVote = board?.myVote ?? null;
    if (previousVote === tweetId) {
      votingRef.current.delete(tweetId);
      return;
    }

    // Optimiste : déplace le vote du candidat précédent (s'il fait partie du
    // classement affiché) vers le nouveau, sans attendre le réseau.
    setCandidates((prev) => prev.map((c) => {
      if (c.id === tweetId) {
        return { ...c, weekly_vote: { count: c.weekly_vote.count + 1, is_my_vote: true } };
      }
      if (c.id === previousVote) {
        return { ...c, weekly_vote: { count: Math.max(0, c.weekly_vote.count - 1), is_my_vote: false } };
      }
      return c;
    }));
    setBoard((prev) => (prev ? { ...prev, myVote: tweetId } : prev));

    const res = await weeklyVoteService.voteForTweet(tweetId);
    votingRef.current.delete(tweetId);

    if (!res.success) {
      // Retour à l'état d'avant — le vote n'a pas été enregistré côté serveur.
      setCandidates((prev) => prev.map((c) => {
        if (c.id === tweetId) {
          return { ...c, weekly_vote: { count: Math.max(0, c.weekly_vote.count - 1), is_my_vote: false } };
        }
        if (c.id === previousVote) {
          return { ...c, weekly_vote: { count: c.weekly_vote.count + 1, is_my_vote: true } };
        }
        return c;
      }));
      setBoard((prev) => (prev ? { ...prev, myVote: previousVote } : prev));
      toast.error(res.message || 'Vote impossible pour le moment.');
      return;
    }

    toast.success('Vote enregistré');
  }, [board?.myVote]);

  const renderItem = useCallback(({ item, index }: { item: WeeklyVoteCandidate; index: number }) => {
    const author = item.author;
    const isMyVote = item.weekly_vote.is_my_vote;
    return (
      <GlassCard style={styles.card} highlight={isMyVote}>
        <Tappable
          style={styles.cardBody}
          scaleTo={0.99}
          haptic="tap"
          onPress={() => (navigation as any).navigate('TweetDetail', { tweetId: item.id })}
          accessibilityLabel={`Ouvrir le tweet de @${author?.username}`}
        >
          <Text style={styles.rank}>#{index + 1}</Text>
          <Avatar size={40} username={author?.username} uri={author?.avatar} />
          <View style={styles.body}>
            <View style={styles.authorRow}>
              <Text style={styles.authorName} numberOfLines={1}>{author?.full_name || author?.username}</Text>
              {author?.verified ? <VerifiedBadge size={13} verificationStyle={author?.verification_style as any} /> : null}
              <Text style={styles.handle} numberOfLines={1}>@{author?.username}</Text>
            </View>
            <ClickableMentions
              text={item.content}
              mentions={item.mentions}
              style={styles.content}
              numberOfLines={3}
              tweetId={item.id}
            />
            <View style={styles.statsRow}>
              <Ionicons name="heart" size={13} color={colors.like} />
              <Text style={styles.statText}>{fmtCount(item.stats?.likes || 0)}</Text>
              <Ionicons name="trophy" size={13} color={colors.gold} style={{ marginLeft: spacing.sm }} />
              <Text style={styles.statText}>
                {item.weekly_vote.count === 1 ? '1 vote' : `${fmtCount(item.weekly_vote.count)} votes`}
              </Text>
            </View>
          </View>
        </Tappable>
        <GlassButton
          label={isMyVote ? 'Voté' : 'Voter'}
          icon={isMyVote ? 'checkmark-circle' : 'trophy-outline'}
          variant={isMyVote ? 'secondary' : 'primary'}
          onPress={() => handleVote(item.id)}
          disabled={isMyVote}
          fullWidth
          style={styles.voteButton}
        />
      </GlassCard>
    );
  }, [navigation, handleVote]);

  const keyExtractor = useCallback((item: WeeklyVoteCandidate) => item.id, []);

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />

        <View style={styles.header}>
          <BackButton navigation={navigation} />
          <Text style={styles.headerTitle}>Tweet de la semaine</Text>
          <View style={{ width: 36 }} />
        </View>

        {board ? (
          <View style={styles.subheader}>
            <Text style={styles.subheaderText}>{fmtWeekRange(board.weekStart, board.weekEnd)}</Text>
            <Text style={styles.subheaderText}>
              {board.totalVotes === 1 ? '1 vote' : `${fmtCount(board.totalVotes)} votes`}
            </Text>
          </View>
        ) : null}

        {loading ? (
          <ScreenSkeleton variant="list" />
        ) : (
          <FlatList
            data={candidates}
            {...LIST_TUNING}
            keyExtractor={keyExtractor}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textSecondary} />}
            contentContainerStyle={candidates.length === 0 ? styles.emptyContent : styles.listContent}
            ListEmptyComponent={
              <EmptyState
                icon="trophy-outline"
                title="Rien à voter pour l'instant"
                message="Dès qu'un tweet original est publié cette semaine, il apparaît ici."
              />
            }
            renderItem={renderItem as any}
          />
        )}
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: { fontFamily: fonts.bold, fontSize: 17, color: colors.textPrimary },
  subheader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: spacing.sm,
  },
  subheaderText: { fontFamily: fonts.medium, fontSize: 13, color: colors.textSecondary },
  emptyContent: { flexGrow: 1 },
  listContent: { paddingBottom: 24, paddingHorizontal: spacing.md },
  card: { marginBottom: spacing.sm },
  cardBody: { flexDirection: 'row', gap: spacing.sm },
  rank: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.textMuted,
    width: 24,
    textAlign: 'center',
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  body: { flex: 1, gap: 2 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  authorName: { fontFamily: fonts.semibold, fontSize: 14, color: colors.textPrimary, flexShrink: 1 },
  handle: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted, flexShrink: 1 },
  content: { fontFamily: fonts.regular, fontSize: 14, color: colors.textPrimary, marginTop: 2 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  statText: { fontFamily: fonts.medium, fontSize: 12, color: colors.textSecondary },
  voteButton: { marginTop: spacing.sm, borderRadius: radius.md },
});
