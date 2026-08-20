import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, Share, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, statusBarStyle } from '../theme';
import { ScreenBackground, BackButton, ScreenSkeleton, EmptyState } from '../components/ui';
import apiService from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Tweet } from '../types/api';
import TweetRow, { type TweetRowAction } from '../components/feed/TweetRow';
import ReportSheet from '../components/ReportSheet';
import { toast } from '../components/ui/Toast';
import { confirmAsync } from '../components/ui/ConfirmSheet';

/**
 * Mes favoris. Jamais ceux d'un autre — `GET /api/tweets/bookmarks` ne
 * connaît que le lecteur authentifié, contrairement à l'onglet « J'aime »
 * d'un profil.
 */
export default function BookmarksScreen() {
  const navigation = useNavigation();
  const { user: currentUser } = useAuth();

  const [tweets, setTweets] = useState<Tweet[]>([]);
  const tweetsRef = useRef<Tweet[]>([]);
  tweetsRef.current = tweets;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ id: string; label?: string } | null>(null);

  const load = useCallback(async () => {
    const res = await apiService.getBookmarks({ limit: 50 });
    setTweets(res.success ? (res.data?.tweets as any) || [] : []);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleLike = useCallback(async (tweetId: string) => {
    const tweet = tweetsRef.current.find((t) => t.id === tweetId);
    const wasLiked = !!(tweet as any)?.user_interaction?.is_liked;
    setTweets((prev) => prev.map((t) => t.id !== tweetId ? t : {
      ...t,
      stats: { ...t.stats, likes: Math.max(0, (t.stats?.likes || 0) + (wasLiked ? -1 : 1)) },
      user_interaction: { ...(t as any).user_interaction, is_liked: !wasLiked },
    } as Tweet));
    const response = await apiService.likeTweet(tweetId);
    if (!response?.success) {
      setTweets((prev) => prev.map((t) => t.id !== tweetId ? t : {
        ...t,
        stats: { ...t.stats, likes: Math.max(0, (t.stats?.likes || 0) + (wasLiked ? 1 : -1)) },
        user_interaction: { ...(t as any).user_interaction, is_liked: wasLiked },
      } as Tweet));
    }
  }, []);

  const handleRetweet = useCallback(async (tweetId: string) => {
    const tweet = tweetsRef.current.find((t) => t.id === tweetId);
    const wasRetweeted = !!(tweet as any)?.user_interaction?.is_retweeted;
    setTweets((prev) => prev.map((t) => t.id !== tweetId ? t : {
      ...t,
      stats: { ...t.stats, retweets: Math.max(0, (t.stats?.retweets || 0) + (wasRetweeted ? -1 : 1)) },
      user_interaction: { ...(t as any).user_interaction, is_retweeted: !wasRetweeted },
    } as Tweet));
    const response = await apiService.retweet(tweetId);
    if (!response?.success) {
      setTweets((prev) => prev.map((t) => t.id !== tweetId ? t : {
        ...t,
        stats: { ...t.stats, retweets: Math.max(0, (t.stats?.retweets || 0) + (wasRetweeted ? 1 : -1)) },
        user_interaction: { ...(t as any).user_interaction, is_retweeted: wasRetweeted },
      } as Tweet));
    }
  }, []);

  const handleShare = useCallback(async (tweetId: string) => {
    const response = await apiService.shareTweet(tweetId);
    if (!response.success || !response.data?.share_link) {
      toast.error(response.message || 'Impossible de partager ce tweet');
      return;
    }
    try {
      await Share.share({ message: response.data.share_link, url: response.data.share_link });
    } catch {
      // Feuille de partage annulée — rien à signaler.
    }
  }, []);

  // Retirer un favori depuis cette liste retire toujours la ligne : il n'y a
  // pas d'ambiguïté ajout/retrait ici comme sur le fil, la carte n'a de sens
  // que tant qu'elle reste un favori.
  const bookmarkInFlightRef = useRef<Set<string>>(new Set());
  const handleBookmark = useCallback(async (tweetId: string) => {
    if (bookmarkInFlightRef.current.has(tweetId)) return;
    bookmarkInFlightRef.current.add(tweetId);
    try {
      const response = await apiService.bookmarkTweet(tweetId);
      if (response.success) {
        setTweets((prev) => prev.filter((t) => t.id !== tweetId));
        toast.success('Retiré des favoris');
      } else {
        toast.error(response.message || 'Impossible de retirer ce favori');
      }
    } finally {
      bookmarkInFlightRef.current.delete(tweetId);
    }
  }, []);

  const handleBlock = useCallback(async (tweetId: string) => {
    const tweet = tweetsRef.current.find((t) => t.id === tweetId);
    const author = tweet?.author;
    if (!author?.id) return;
    const confirmed = await confirmAsync({
      title: `Bloquer @${author.username} ?`,
      message: 'Il ne pourra plus vous contacter ni voir votre profil, et ses tweets disparaîtront de votre fil.',
      destructive: true,
    });
    if (!confirmed) return;
    const response = await apiService.blockUser(author.id);
    if (response.success) {
      toast.success(`@${author.username} a été bloqué`);
      setTweets((prev) => prev.filter((t) => String(t.author?.id) !== String(author.id)));
    } else {
      toast.error(response.message || 'Impossible de bloquer ce compte');
    }
  }, []);

  const handleReport = useCallback((tweetId: string) => {
    const tweet = tweetsRef.current.find((t) => t.id === tweetId);
    setReportTarget({
      id: tweetId,
      label: tweet?.author?.username ? `@${tweet.author.username}` : undefined,
    });
  }, []);

  const rowContext = React.useMemo(() => ({ tab: 'bookmarks', algorithm: 'none' }), []);

  const handleRowAction = useCallback((action: TweetRowAction) => {
    const { type, tweetId, payload } = action;
    switch (type) {
      case 'like': handleLike(tweetId); break;
      case 'retweet': handleRetweet(tweetId); break;
      case 'share': handleShare(tweetId); break;
      case 'report': handleReport(tweetId); break;
      case 'reply':
        (navigation as any).navigate('TweetDetail', { tweetId, focusReply: true });
        break;
      case 'openQuote':
        (navigation as any).navigate('TweetDetail', { tweetId });
        break;
      case 'openContest':
        if (payload?.contestId) (navigation as any).navigate('Contest', { contestId: payload.contestId });
        break;
      case 'profile': {
        const author = payload?.author;
        if (!author?.id) return;
        (navigation as any).navigate('UserProfile', { userId: author.id, username: author.username });
        break;
      }
      case 'open':
        (navigation as any).navigate('TweetDetail', {
          tweetId,
          isThread: !!(tweetsRef.current.find((t) => t.id === tweetId) as any)?.parent_tweet_id,
        });
        break;
      case 'options': {
        const tweet = tweetsRef.current.find((t) => t.id === tweetId);
        const isOwnTweet = !!(currentUser?.id && tweet?.author?.id === currentUser.id);
        const { showActionSheet } = require('../components/ui/ActionSheet');
        showActionSheet({
          items: isOwnTweet
            ? [{ label: 'Partager', icon: 'share-outline', onPress: () => handleShare(tweetId) }]
            : [
                { label: 'Retirer des favoris', icon: 'bookmark', onPress: () => handleBookmark(tweetId) },
                { label: 'Partager', icon: 'share-outline', onPress: () => handleShare(tweetId) },
                { label: 'Signaler', icon: 'flag-outline', onPress: () => handleReport(tweetId) },
                {
                  label: 'Bloquer cet utilisateur',
                  icon: 'ban-outline',
                  onPress: () => handleBlock(tweetId),
                  destructive: true,
                },
              ],
        });
        break;
      }
      // 'videoDuration' : pure télémétrie du lecteur, rien à faire ici.
      default:
        break;
    }
  }, [navigation, currentUser?.id, handleLike, handleRetweet, handleShare, handleBookmark, handleBlock, handleReport]);

  const renderItem = useCallback(({ item, index }: { item: Tweet; index: number }) => (
    <TweetRow
      tweet={item}
      index={index}
      isThreadParent={false}
      isThreadChild={false}
      onAction={handleRowAction}
      contextData={rowContext}
    />
  ), [handleRowAction, rowContext]);

  const keyExtractor = useCallback((item: Tweet) => item.id, []);

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />

        <View style={styles.header}>
          <BackButton navigation={navigation} />
          <Text style={styles.headerTitle}>Favoris</Text>
          <View style={{ width: 36 }} />
        </View>

        {loading ? (
          <ScreenSkeleton variant="list" />
        ) : (
          <Animated.FlatList
            data={tweets}
            keyExtractor={keyExtractor}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textSecondary} />}
            contentContainerStyle={tweets.length === 0 ? styles.emptyContent : styles.listContent}
            ListEmptyComponent={
              <EmptyState
                icon="bookmark-outline"
                title="Aucun favori"
                message="Les tweets que vous mettez en favori apparaîtront ici."
              />
            }
            renderItem={renderItem as any}
          />
        )}

        <ReportSheet
          visible={!!reportTarget}
          onClose={() => setReportTarget(null)}
          targetId={reportTarget?.id || ''}
          targetType="tweet"
          targetLabel={reportTarget?.label}
        />
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
  emptyContent: { flexGrow: 1 },
  listContent: { paddingBottom: 24 },
});
