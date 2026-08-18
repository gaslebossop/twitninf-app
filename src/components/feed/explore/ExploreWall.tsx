import React, { memo, useCallback, useContext, useMemo, useRef } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';

import { colors, fonts, radius } from '../../../theme';
import { AppRefreshControl, Tappable } from '../../ui';
import { describeCards, NEW_SINCE_FLOOR } from './cardFormat';
import { buildWall } from './wallLayout';
import ExploreCard, { type CardRect } from './ExploreCard';
import ExploreHero, { HERO_COUNT } from './ExploreHero';
import type { Tweet } from '../../../types/api';

const GRID_PADDING = 12;
const GRID_GAP = 10;
/** Respiration autour d'une rupture — plus large que l'écart de grille. */
const FEATURE_GAP = 16;
/**
 * La tab bar est absolue et recouvre le bas de l'écran. Sa hauteur se LIT,
 * elle ne se code pas en dur (83 iOS / 85 Android, plus l'inset système) —
 * voir `CLAUDE.md`. `BottomTabBarHeightContext` via `useContext` rend
 * `undefined` hors d'un tab navigator, contrairement à `useBottomTabBarHeight`
 * qui lève une erreur : c'est la forme sûre.
 */
const FALLBACK_TAB_BAR_HEIGHT = 85;
/** Avance de pagination, en hauteurs d'écran. */
const PREFETCH_SCREENS = 2;

interface ExploreWallProps {
  tweets: Tweet[];
  refreshing: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  /** Date de la dernière visite, en millisecondes. `null` = première visite. */
  lastVisitAt: number | null;
  onRefresh: () => void;
  onEndReached: () => void;
  onOpenTweet: (tweet: Tweet, from: CardRect | null) => void;
  onLikeTweet: (tweet: Tweet) => void;
  onLongPressTweet: (tweet: Tweet, from: CardRect | null) => void;
  onDrawMore: () => void;
  ListHeaderComponent?: React.ReactElement | null;
}

function ExploreWall({
  tweets, refreshing, loadingMore, hasMore, lastVisitAt,
  onRefresh, onEndReached, onOpenTweet, onLikeTweet, onLongPressTweet, onDrawMore,
  ListHeaderComponent,
}: ExploreWallProps) {
  const { width } = useWindowDimensions();
  const endReachedFiredRef = useRef(false);
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? FALLBACK_TAB_BAR_HEIGHT;

  // `useWindowDimensions` et non `Dimensions.get()` : la largeur doit suivre
  // une rotation ou un écran partagé, sinon toutes les hauteurs estimées sont
  // fausses et les colonnes partent en dents de scie.
  const cardWidth = (width - GRID_PADDING * 2 - GRID_GAP) / 2;

  const metas = useMemo(() => describeCards(tweets, cardWidth), [tweets, cardWidth]);
  const heroMetas = useMemo(() => metas.slice(0, HERO_COUNT), [metas]);
  const blocks = useMemo(() => buildWall(metas.slice(HERO_COUNT)), [metas]);

  const isNew = useCallback((tweet: Tweet) => {
    if (!lastVisitAt || !tweet.created_at) return false;
    return new Date(tweet.created_at).getTime() > lastVisitAt;
  }, [lastVisitAt]);

  const newCount = useMemo(
    () => (lastVisitAt ? tweets.filter(isNew).length : 0),
    [tweets, lastVisitAt, isNew],
  );

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distance = contentSize.height - layoutMeasurement.height - contentOffset.y;
    if (distance < layoutMeasurement.height * PREFETCH_SCREENS) {
      if (!endReachedFiredRef.current) {
        endReachedFiredRef.current = true;
        onEndReached();
      }
    } else {
      endReachedFiredRef.current = false;
    }
  }, [onEndReached]);

  const renderCard = (meta: (typeof metas)[number], wide: boolean) => (
    <ExploreCard
      key={meta.tweet.id}
      meta={meta}
      cardWidth={cardWidth}
      wide={wide}
      isNew={isNew(meta.tweet)}
      onPress={onOpenTweet}
      onLike={onLikeTweet}
      onLongPress={onLongPressTweet}
    />
  );

  return (
    <ScrollView
      style={styles.list}
      contentContainerStyle={[styles.listContent, { paddingBottom: tabBarHeight + 24 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      onScroll={handleScroll}
      scrollEventThrottle={100}
    >
      {ListHeaderComponent}

      <ExploreHero metas={heroMetas} onOpen={onOpenTweet} />

      {/* En dessous du plancher, aucune ligne : mieux vaut rien qu'un
          « 2 nouveaux », qui fait paraître le produit vide. */}
      {newCount >= NEW_SINCE_FLOOR && (
        <Text style={styles.newSince} maxFontSizeMultiplier={1.2}>
          {newCount} nouveaux depuis ta dernière visite
        </Text>
      )}

      {blocks.map((block) => (
        <View key={block.feature.tweet.id}>
          <View style={styles.feature}>{renderCard(block.feature, true)}</View>
          <View style={styles.columns}>
            <View style={styles.column}>
              {block.columns[0].map((meta) => (
                <View key={meta.tweet.id} style={styles.cell}>{renderCard(meta, false)}</View>
              ))}
            </View>
            <View style={styles.column}>
              {block.columns[1].map((meta) => (
                <View key={meta.tweet.id} style={styles.cell}>{renderCard(meta, false)}</View>
              ))}
            </View>
          </View>
        </View>
      ))}

      {loadingMore && (
        <View style={styles.loadingRow}>
          <View style={[styles.loadingCard, { width: cardWidth }]} />
          <View style={[styles.loadingCard, { width: cardWidth }]} />
        </View>
      )}

      {/* Fin de vivier : « Vous êtes à jour » est un point final, et le seul
          geste qu'il laisse est de quitter la page. Le classement est retiré à
          chaque recalcul, donc un nouveau tirage remonte réellement des tweets
          restés sous la coupure. */}
      {!hasMore && !loadingMore && (
        <Tappable style={styles.drawMore} onPress={onDrawMore} scaleTo={0.98}>
          <Ionicons name="sparkles-outline" size={15} color={colors.accent} />
          <Text style={styles.drawMoreText} maxFontSizeMultiplier={1.2}>Nouveau tirage</Text>
        </Tappable>
      )}
    </ScrollView>
  );
}

export default memo(ExploreWall);

const styles = StyleSheet.create({
  list: { flex: 1 },
  listContent: {
    paddingHorizontal: GRID_PADDING,
    paddingTop: 4,
  },
  feature: { marginBottom: FEATURE_GAP },
  columns: { flexDirection: 'row', gap: GRID_GAP },
  column: { flex: 1 },
  cell: { marginBottom: GRID_GAP },

  newSince: {
    color: colors.cyan,
    fontSize: 12.5,
    fontFamily: fonts.semibold,
    marginBottom: 12,
    marginLeft: 2,
  },

  loadingRow: { flexDirection: 'row', gap: GRID_GAP, marginTop: 2 },
  loadingCard: {
    height: 160,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
  },
  drawMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 14,
    paddingVertical: 13,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  drawMoreText: { color: colors.textPrimary, fontSize: 13.5, fontFamily: fonts.semibold },
});
