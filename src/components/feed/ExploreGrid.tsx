import React, { memo, useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppRefreshControl, EmptyState, ErrorState } from '../ui';
import TweetSkeleton from './TweetSkeleton';
import { CommentSheet } from '../CommentSheet';
import { contentSourceOf } from '../../utils/tweetMedia';
import ExploreWall from './explore/ExploreWall';
import ExploreActionSheet from './explore/ExploreActionSheet';
import type { CardRect } from './explore/ExploreCard';
import type { Tweet } from '../../types/api';

/**
 * Point d'entrée de l'onglet « Explorer ».
 *
 * Ce fichier ne fait plus QUE deux choses : choisir l'état à montrer
 * (chargement / erreur / vide / mur) et tenir l'état du panneau d'appui long.
 * Toute la mise en page vit dans `explore/` — la version précédente mélangeait
 * ici la carte, le masonry, la pagination et les états sur 598 lignes.
 *
 * `CardRect` est réexporté : `TweetsScreen` et `ExploreImmersive` l'importent
 * depuis ce module depuis la 6ᵉ passe, et rien ne justifie de les toucher.
 */
export type { CardRect };

export interface ExploreGridProps {
  tweets: Tweet[];
  loading: boolean;
  loadingMore: boolean;
  refreshing: boolean;
  hasMore: boolean;
  error: string | null;
  onRefresh: () => void;
  onEndReached: () => void;
  onOpenTweet: (tweet: Tweet, from: CardRect | null) => void;
  onLikeTweet: (tweet: Tweet) => void;
  onRetry: () => void;
  onDrawMore: () => void;
  /** Date de la dernière visite de l'onglet, en millisecondes. */
  lastVisitAt: number | null;
  isFollowing: (tweet: Tweet) => boolean;
  onFollow: (tweet: Tweet) => void;
  /** Signature imposée par `handleShare` existant : un ID, pas un tweet. */
  onShare: (tweetId: string) => void;
  onInterest: (tweet: Tweet, interested: boolean) => void;
  ListHeaderComponent?: React.ReactElement | null;
}

function ExploreGrid({
  tweets, loading, loadingMore, refreshing, hasMore, error,
  onRefresh, onEndReached, onOpenTweet, onLikeTweet, onRetry, onDrawMore,
  lastVisitAt, isFollowing, onFollow, onShare, onInterest,
  ListHeaderComponent,
}: ExploreGridProps) {
  const [sheetTweet, setSheetTweet] = useState<Tweet | null>(null);
  const [sheetOrigin, setSheetOrigin] = useState<CardRect | null>(null);
  const [commentTarget, setCommentTarget] = useState<Tweet | null>(null);

  const handleLongPress = useCallback((tweet: Tweet, from: CardRect | null) => {
    setSheetOrigin(from);
    setSheetTweet(tweet);
  }, []);

  const closeSheet = useCallback(() => setSheetTweet(null), []);

  const handleNotInterested = useCallback(
    (tweet: Tweet) => onInterest(tweet, false),
    [onInterest],
  );

  /**
   * Répondre reste DANS la grille. Le seul chemin existant vers les réponses
   * (`handleOpenExploreThread`) navigue vers `TweetDetail`, ce qui est
   * exactement l'aller-retour qu'on supprime. `CommentSheet` n'est pas une
   * `<Modal>` : elle se superpose ici sans empiler de fenêtre native, et la
   * position de défilement du mur est conservée.
   */
  const handleReply = useCallback((tweet: Tweet) => setCommentTarget(tweet), []);

  const handleShareTweet = useCallback(
    (tweet: Tweet) => onShare(String(tweet.id)),
    [onShare],
  );

  if (loading && tweets.length === 0) {
    return (
      <ScrollView contentContainerStyle={styles.stateContent} showsVerticalScrollIndicator={false}>
        {ListHeaderComponent}
        <TweetSkeleton count={4} />
      </ScrollView>
    );
  }

  if (error && tweets.length === 0) {
    return (
      <ScrollView contentContainerStyle={styles.stateContent} showsVerticalScrollIndicator={false}>
        {ListHeaderComponent}
        <ErrorState detail={error} onRetry={onRetry} />
      </ScrollView>
    );
  }

  if (tweets.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={styles.stateContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {ListHeaderComponent}
        <EmptyState
          icon="compass-outline"
          title="Rien à explorer pour l’instant"
          message="Les tweets qui prennent de l’ampleur en ce moment apparaîtront ici."
          secondaryAction={{ label: 'Actualiser', onPress: onRetry }}
        />
      </ScrollView>
    );
  }

  return (
    <View style={styles.fill}>
      <ExploreWall
        tweets={tweets}
        refreshing={refreshing}
        loadingMore={loadingMore}
        hasMore={hasMore}
        lastVisitAt={lastVisitAt}
        onRefresh={onRefresh}
        onEndReached={onEndReached}
        onOpenTweet={onOpenTweet}
        onLikeTweet={onLikeTweet}
        onLongPressTweet={handleLongPress}
        onDrawMore={onDrawMore}
        ListHeaderComponent={ListHeaderComponent}
      />

      <ExploreActionSheet
        tweet={sheetTweet}
        origin={sheetOrigin}
        isFollowing={sheetTweet ? isFollowing(sheetTweet) : false}
        onClose={closeSheet}
        onLike={onLikeTweet}
        onFollow={onFollow}
        onReply={handleReply}
        onShare={handleShareTweet}
        onNotInterested={handleNotInterested}
      />

      {commentTarget && (
        <CommentSheet
          visible
          tweetId={String(commentTarget.id)}
          totalCount={commentTarget.stats?.replies ?? 0}
          tweetAuthorUsername={contentSourceOf(commentTarget)?.author?.username}
          onClose={() => setCommentTarget(null)}
        />
      )}
    </View>
  );
}

export default memo(ExploreGrid);

const styles = StyleSheet.create({
  fill: { flex: 1 },
  stateContent: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 96 },
});
