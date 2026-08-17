import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { colors, fonts, radius, withAlpha } from '../../theme';
import { AppRefreshControl, EmptyState, ErrorState, Tappable } from '../ui';
import Avatar from '../Avatar';
import TweetSkeleton from './TweetSkeleton';
import feedback from '../../utils/feedback';
import { formatCompactCount } from '../../utils/format';
import { contentSourceOf, displayContentOf, splitTweetMedia } from '../../utils/tweetMedia';
import type { Tweet } from '../../types/api';

/** Repris de `TweetRow` : même fenêtre de double-tap dans tout le fil. */
const DOUBLE_TAP_MS = 280;

/**
 * Grille de découverte (« Explorer ») — le pendant visuel du fil linéaire.
 *
 * ── Pourquoi un vrai masonry, deux colonnes à hauteurs indépendantes ───────
 * Une grille à cases identiques s'aligne parfaitement, ligne par ligne — l'effet
 * recherché ici est l'inverse : chaque carte a sa propre hauteur (ratio d'image
 * variable, boîte de citation dimensionnée à son texte), les deux colonnes
 * défilent comme UNE seule surface, et l'œil ne voit jamais deux cartes de
 * même hauteur alignées côte à côte. La répartition (`splitColumns`) équilibre
 * les deux colonnes par hauteur cumulée estimée, pas par simple alternance —
 * sinon une colonne prend systématiquement du retard si elle hérite de plusieurs
 * grandes cartes d'affilée.
 *
 * Pas de FlatList ici : le numColumns de RN force justement l'alignement en
 * lignes qu'on cherche à casser. On reste en ScrollView (le nombre de tweets
 * chargés à la fois — quelques pages de 20 — reste raisonnable sans
 * virtualisation) avec une détection de bas de page faite à la main.
 *
 * ── Pourquoi rien n'est superposé sur l'image ───────────────────────────────
 * La légende, l'auteur et le compteur de cœurs vivent dans un pied plein
 * (`colors.surface`), jamais en incrustation dégradée sur la photo — c'est la
 * règle « surfaces pleines » du reste de l'app (pas de `BlurView`, pas de
 * dégradé décoratif par carte). Un tweet sans image reçoit une carte de citation
 * à fond plat plutôt qu'un espace vide.
 */

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_PADDING = 12;
const GRID_GAP = 10;
const CARD_WIDTH = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP) / 2;
/** Pied avec légende sur deux lignes. */
const FOOTER_HEIGHT = 78;
/** Pied réduit à la seule ligne d'auteur (carte de citation, ou image sans texte). */
const FOOTER_HEIGHT_BARE = 44;

/**
 * Les tailles de police système peuvent doubler le texte, alors que ces pieds
 * sont à hauteur FIXE (le masonry calcule dessus). Sans plafond, la légende et
 * la ligne d'auteur débordent et se font rogner, et les colonnes se décalent.
 * On laisse un agrandissement lisible, pas illimité.
 */
const MAX_FONT_SCALE = 1.2;

// Quelques ratios plutôt qu'un calcul continu : la variation doit se
// reconnaître d'un coup d'œil (portrait / carré / paysage), pas être un
// dégradé imperceptible d'une carte à l'autre.
const MEDIA_RATIOS = [0.78, 1.05, 1.32, 1.6];

/** Avance de pagination, en hauteurs d'écran (voir `handleScroll`). */
const PREFETCH_SCREENS = 2;

/** Hash simple et déterministe — la même carte doit garder la même forme d'un rendu à l'autre. */
function hashId(id: string | number): number {
  const s = String(id);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function mediaHeightFor(tweetId: string | number): number {
  const ratio = MEDIA_RATIOS[hashId(tweetId) % MEDIA_RATIOS.length];
  return Math.round(CARD_WIDTH * ratio);
}

/**
 * Taille ET hauteur de la citation selon sa longueur — un tweet court REMPLIT
 * une carte plus compacte en gros caractères, un tweet long reçoit une carte
 * plus haute plutôt qu'un texte tassé. C'est cette variation-là, en plus du
 * ratio d'image, qui casse l'alignement en grille.
 */
function quoteScale(length: number): { fontSize: number; lineHeight: number; lines: number; boxHeight: number } {
  if (length <= 46) return { fontSize: 21, lineHeight: 26, lines: 4, boxHeight: Math.round(CARD_WIDTH * 0.72) };
  if (length <= 100) return { fontSize: 17, lineHeight: 22, lines: 6, boxHeight: Math.round(CARD_WIDTH * 1.02) };
  return { fontSize: 14.5, lineHeight: 19, lines: 8, boxHeight: Math.round(CARD_WIDTH * 1.32) };
}

/**
 * Hauteur du pied — la légende n'existe pas toujours.
 *
 * Le pied valait 78 px dès qu'il y avait un visuel, alors que la légende n'est
 * rendue que s'il y a du texte : une carte publiée en image seule portait donc
 * ~34 px de vide sous sa ligne d'auteur. Le cas était rare tant que les tweets
 * sans texte étaient filtrés en amont ; il devient courant maintenant qu'ils
 * entrent (voir `fetchExplore`).
 *
 * Une seule fonction sert au rendu ET à l'estimation du masonry : c'est ce qui
 * garantit que les colonnes s'équilibrent sur les hauteurs réelles.
 */
function footerHeightFor(tweet: Tweet): number {
  if (!splitTweetMedia(tweet).hasVisual) return FOOTER_HEIGHT_BARE;
  return displayContentOf(tweet) ? FOOTER_HEIGHT : FOOTER_HEIGHT_BARE;
}

function estimateCardHeight(tweet: Tweet): number {
  // `hasVisual` et pas `media_urls[0]` : un tweet vidéo range son `.mp4` en
  // premier et sa miniature ensuite. Mesurer sur l'index 0 traitait donc toute
  // vidéo comme une image ordinaire — et l'affichait comme telle, c'est-à-dire
  // pas du tout (voir `splitTweetMedia`).
  const body = splitTweetMedia(tweet).hasVisual
    ? mediaHeightFor(tweet.id)
    : quoteScale(displayContentOf(tweet).length).boxHeight;
  return body + footerHeightFor(tweet);
}

/** Répartit les tweets entre deux colonnes en équilibrant la hauteur cumulée, pas juste en alternant. */
function splitColumns(tweets: Tweet[]): [Tweet[], Tweet[]] {
  const left: Tweet[] = [];
  const right: Tweet[] = [];
  let leftHeight = 0;
  let rightHeight = 0;
  for (const tweet of tweets) {
    const h = estimateCardHeight(tweet);
    if (leftHeight <= rightHeight) {
      left.push(tweet);
      leftHeight += h + GRID_GAP;
    } else {
      right.push(tweet);
      rightHeight += h + GRID_GAP;
    }
  }
  return [left, right];
}

/** Position à l'écran d'une carte, pour ouvrir la lecture DEPUIS elle. */
export interface CardRect { x: number; y: number; width: number; height: number }

interface ExploreCardProps {
  tweet: Tweet;
  onPress: (tweet: Tweet, from: CardRect | null) => void;
  onLike: (tweet: Tweet) => void;
}

/**
 * Double-tap pour aimer, sur le modèle exact de `TweetRow` (mêmes délais, même
 * cœur plein écran) : la grille se contentait jusqu'ici d'ouvrir le détail au
 * tap, sans aucune interaction directe — la seule des surfaces de tweets de
 * l'app à ne pas l'avoir. Un tap simple ouvre la lecture (attente de 260 ms
 * pour laisser passer un second tap) ; un double-tap aime SANS jamais retirer
 * un like existant, comme Instagram/TikTok.
 *
 * La carte se MESURE avant d'ouvrir : la lecture s'agrandit depuis l'endroit
 * exact où le doigt s'est posé, au lieu d'arriver comme une page par-dessus.
 */
const ExploreCard = memo(function ExploreCard({ tweet, onPress, onLike }: ExploreCardProps) {
  const media = useMemo(() => splitTweetMedia(tweet), [tweet]);
  const content = useMemo(() => displayContentOf(tweet), [tweet]);
  const author = useMemo(() => contentSourceOf(tweet)?.author, [tweet]);
  const thumbnail = media.coverUrl;
  const isVideo = !!media.videoUrl;
  const likes = tweet.stats?.likes ?? 0;
  const views = tweet.stats?.views ?? 0;
  const isLiked = !!tweet.user_interaction?.is_liked;
  const scale = useMemo(() => quoteScale(content.length), [content]);
  const mediaHeight = useMemo(() => mediaHeightFor(tweet.id), [tweet.id]);

  const lastTapRef = useRef(0);
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameRef = useRef<View>(null);
  const bigHeart = useSharedValue(0);

  useEffect(() => () => {
    if (navTimerRef.current) clearTimeout(navTimerRef.current);
  }, []);

  const playBigHeart = useCallback(() => {
    bigHeart.value = 0;
    bigHeart.value = withTiming(1, { duration: 700 });
  }, [bigHeart]);

  const bigHeartStyle = useAnimatedStyle(() => ({
    opacity: interpolate(bigHeart.value, [0, 0.12, 0.7, 1], [0, 0.95, 0.9, 0], Extrapolation.CLAMP),
    transform: [
      {
        scale: interpolate(
          bigHeart.value,
          [0, 0.15, 0.3, 0.6, 1],
          [0.2, 1.2, 0.95, 1.0, 0.75],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  const handlePress = useCallback(() => {
    const now = Date.now();
    const isDoubleTap = now - lastTapRef.current < DOUBLE_TAP_MS;
    lastTapRef.current = now;

    if (isDoubleTap) {
      if (navTimerRef.current) { clearTimeout(navTimerRef.current); navTimerRef.current = null; }
      playBigHeart();
      if (!isLiked) {
        feedback.select();
        onLike(tweet);
      }
      return;
    }

    // La mesure part MAINTENANT, pas après l'attente : le doigt est encore
    // posé, la grille n'a pas bougé, donc le rectangle est celui que
    // l'utilisateur vient de toucher.
    let measured: CardRect | null = null;
    frameRef.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) measured = { x, y, width, height };
    });

    navTimerRef.current = setTimeout(() => {
      navTimerRef.current = null;
      onPress(tweet, measured);
    }, 260);
  }, [isLiked, onLike, onPress, playBigHeart, tweet]);

  return (
    <Tappable
      style={[styles.card, !media.hasVisual && styles.cardQuote]}
      onPress={handlePress}
      scaleTo={0.97}
    >
      {/* `collapsable={false}` : sans lui, Android fusionne cette vue avec son
          parent et `measureInWindow` n'a plus rien à mesurer. */}
      <View ref={frameRef} collapsable={false} style={styles.mediaWrap}>
        {media.hasVisual ? (
          thumbnail ? (
            <Image
              source={{ uri: thumbnail }}
              style={[styles.media, { height: mediaHeight }]}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={140}
              recyclingKey={thumbnail}
            />
          ) : (
            // Vidéo publiée sans miniature : on garde la case à la bonne taille
            // plutôt que de la faire disparaître de la grille.
            <View style={[styles.media, styles.mediaFallback, { height: mediaHeight }]} />
          )
        ) : (
          // Sans image, le tweet EST la carte : un grand guillemet de marque
          // (magenta, plein, aucun dégradé) ancre le regard en haut, le texte le
          // suit tout de suite après — pas de centrage vertical qui laisserait un
          // vide entre un texte court et son pied.
          <View style={[styles.quoteMedia, { height: scale.boxHeight }]}>
            <Text style={styles.quoteMark}>“</Text>
            <Text
              style={[styles.quoteText, { fontSize: scale.fontSize, lineHeight: scale.lineHeight }]}
              numberOfLines={scale.lines}
            >
              {content}
            </Text>
          </View>
        )}

        {/* Marqueur vidéo : sans lui, une vignette de vidéo est indiscernable
            d'une photo et personne ne sait qu'il y a quelque chose à regarder.
            Le nombre de vues avec — c'est la preuve sociale qui décide de
            l'appui, et une vidéo est ce qui retient le plus longtemps. */}
        {isVideo && (
          <View style={styles.videoBadge} pointerEvents="none">
            <Ionicons name="play" size={11} color={colors.white} />
            {views > 0 && <Text style={styles.videoBadgeText}>{formatCompactCount(views)}</Text>}
          </View>
        )}

        <Animated.View pointerEvents="none" style={[styles.bigHeartOverlay, bigHeartStyle]}>
          <Ionicons name="heart" size={56} color={colors.white} />
        </Animated.View>
      </View>

      <View style={[styles.footer, { height: footerHeightFor(tweet) }]}>
        {media.hasVisual && !!content && (
          <Text style={styles.caption} numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {content}
          </Text>
        )}
        <View style={styles.authorRow}>
          <Avatar size={20} username={author?.username} uri={author?.avatar} />
          <Text style={styles.username} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {author?.username ? `@${author.username}` : ''}
          </Text>
          <View style={styles.likeChip}>
            <Ionicons
              name={isLiked ? 'heart' : 'heart-outline'}
              size={12}
              color={isLiked ? colors.like : colors.textMuted}
            />
            <Text style={styles.likeText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {formatCompactCount(likes)}
            </Text>
          </View>
        </View>
      </View>
    </Tappable>
  );
});

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
  /** Tirage supplémentaire quand le vivier est épuisé — ajoute, ne remplace pas. */
  onDrawMore: () => void;
  /** Rendu au-dessus de la grille (bandeau hors-ligne, bannière d'erreur du fil…). */
  ListHeaderComponent?: React.ReactElement | null;
}

function ExploreGrid({
  tweets,
  loading,
  loadingMore,
  refreshing,
  hasMore,
  error,
  onRefresh,
  onEndReached,
  onOpenTweet,
  onLikeTweet,
  onRetry,
  onDrawMore,
  ListHeaderComponent,
}: ExploreGridProps) {
  const [leftColumn, rightColumn] = useMemo(() => splitColumns(tweets), [tweets]);
  const endReachedFiredRef = useRef(false);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
      // Un seuil fixe de 400 px, c'est un demi-écran : sur un défilement rapide
      // on arrivait en bas AVANT la fin de la requête, et la grille montrait ses
      // cases d'attente. Le seuil est maintenant proportionnel — deux écrans
      // d'avance — pour que la page suivante soit déjà là quand on l'atteint.
      if (distanceFromBottom < layoutMeasurement.height * PREFETCH_SCREENS) {
        if (!endReachedFiredRef.current) {
          endReachedFiredRef.current = true;
          onEndReached();
        }
      } else {
        endReachedFiredRef.current = false;
      }
    },
    [onEndReached],
  );

  const isInitialLoading = loading && tweets.length === 0;

  if (isInitialLoading) {
    return (
      <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {ListHeaderComponent}
        <View style={styles.skeletonRow}>
          <TweetSkeleton count={4} />
        </View>
      </ScrollView>
    );
  }

  if (error && tweets.length === 0) {
    return (
      <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {ListHeaderComponent}
        <ErrorState detail={error} onRetry={onRetry} />
      </ScrollView>
    );
  }

  if (tweets.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={styles.listContent}
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
    <ScrollView
      style={styles.list}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      onScroll={handleScroll}
      scrollEventThrottle={100}
    >
      {ListHeaderComponent}
      <View style={styles.columns}>
        <View style={styles.column}>
          {leftColumn.map((tweet) => (
            <ExploreCard key={tweet.id} tweet={tweet} onPress={onOpenTweet} onLike={onLikeTweet} />
          ))}
        </View>
        <View style={styles.column}>
          {rightColumn.map((tweet) => (
            <ExploreCard key={tweet.id} tweet={tweet} onPress={onOpenTweet} onLike={onLikeTweet} />
          ))}
        </View>
      </View>

      {loadingMore && (
        <View style={styles.loadingMoreRow}>
          <View style={styles.loadingMoreCard} />
          <View style={styles.loadingMoreCard} />
        </View>
      )}
      {/* Fin de vivier : « Vous êtes à jour » est un point final, et le seul
          geste qu'il laisse est de quitter la page. Le classement `trending`
          est retiré à chaque recalcul (mélange pondéré côté Rust), donc un
          nouveau tirage remonte réellement des tweets restés sous la coupure —
          on propose ce geste-là plutôt qu'une porte fermée. */}
      {!hasMore && !loadingMore && (
        <Tappable style={styles.drawMore} onPress={onDrawMore} scaleTo={0.98}>
          <Ionicons name="sparkles-outline" size={15} color={colors.accent} />
          <Text style={styles.drawMoreText}>Nouveau tirage</Text>
        </Tappable>
      )}
      {hasMore && !loadingMore && <View style={{ height: 40 }} />}
    </ScrollView>
  );
}

export default memo(ExploreGrid);

const styles = StyleSheet.create({
  list: { flex: 1 },
  listContent: { paddingHorizontal: GRID_PADDING, paddingTop: 4, paddingBottom: 24 },
  skeletonRow: { paddingHorizontal: 4 },

  columns: { flexDirection: 'row', gap: GRID_GAP },
  column: { flex: 1 },

  card: {
    width: CARD_WIDTH,
    marginBottom: GRID_GAP,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  // Un tweet sans image reçoit un liseré de marque à gauche : la carte se
  // distingue d'une carte-photo d'un coup d'œil, sans dégradé ni fond coloré
  // en aplat — juste un trait plein, comme une pastille ou un badge ailleurs
  // dans l'app.
  cardQuote: {
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  // Contexte de positionnement du cœur de double-tap : l'incrustation couvre la
  // vignette (ou la carte de citation) et s'arrête au pied, qui reste lisible.
  // Seule superposition tolérée sur l'image — transitoire, jouée en réponse à
  // un appui, jamais un habillage permanent.
  mediaWrap: { position: 'relative' },
  bigHeartOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  media: { width: CARD_WIDTH, backgroundColor: colors.surfaceAlt },
  mediaFallback: { alignItems: 'center', justifyContent: 'center' },

  videoBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.md,
    backgroundColor: withAlpha('#000000', 0.55),
  },
  videoBadgeText: { color: colors.white, fontSize: 10.5, fontFamily: fonts.semibold },

  quoteMedia: {
    width: CARD_WIDTH,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 14,
  },
  quoteMark: {
    color: colors.accent,
    fontFamily: fonts.bold,
    fontSize: 46,
    lineHeight: 46,
    marginBottom: -6,
  },
  quoteText: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
  },

  // La hauteur vient de `footerHeightFor` : elle doit rester identique à celle
  // qu'estime le masonry.
  footer: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    justifyContent: 'center',
  },
  caption: {
    color: colors.textSecondary,
    fontSize: 12.5,
    lineHeight: 17,
    fontFamily: fonts.medium,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  username: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 12,
    fontFamily: fonts.semibold,
  },
  likeChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  likeText: { color: colors.textMuted, fontSize: 11, fontFamily: fonts.medium },

  loadingMoreRow: { flexDirection: 'row', gap: GRID_GAP, marginTop: 2 },
  loadingMoreCard: {
    width: CARD_WIDTH,
    height: 160,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
  },
  drawMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 10,
    marginBottom: 14,
    paddingVertical: 13,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  drawMoreText: { color: colors.textPrimary, fontSize: 13.5, fontFamily: fonts.semibold },
});
