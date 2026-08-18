import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { colors, fonts, radius, withAlpha } from '../../../theme';
// `displayNameFonts` n'est pas réexporté par le barrel `../../../theme` (seul
// `fonts` l'est) : import direct depuis `theme/fonts`, comme le fait déjà le
// reste du repo (NavbarOnboardingModal, ReportBugScreen, VideoEditorScreen…).
import { displayNameFonts } from '../../../theme/fonts';
import { Tappable } from '../../ui';
import feedback from '../../../utils/feedback';
import { formatCompactCount } from '../../../utils/format';
import { contentSourceOf, displayContentOf, splitTweetMedia } from '../../../utils/tweetMedia';
import { declarationType, quoteType, shouldShowCount, type CardMeta } from './cardFormat';

/** Même fenêtre de double-tap que dans tout le fil. */
const DOUBLE_TAP_MS = 280;
/** Attente avant d'ouvrir, pour laisser passer un éventuel second appui. */
const OPEN_DELAY_MS = 260;
const MAX_FONT_SCALE = 1.2;

/** Position à l'écran d'une carte, pour ouvrir la lecture DEPUIS elle. */
export interface CardRect { x: number; y: number; width: number; height: number }

interface ExploreCardProps {
  meta: CardMeta;
  cardWidth: number;
  /** Carte de rupture : pleine largeur, ouvre un bloc. */
  wide?: boolean;
  /** Publié depuis la dernière visite — point cyan. */
  isNew?: boolean;
  onPress: (tweet: CardMeta['tweet'], from: CardRect | null) => void;
  onLike: (tweet: CardMeta['tweet']) => void;
  onLongPress: (tweet: CardMeta['tweet'], from: CardRect | null) => void;
}

/** Résout le token de fond en couleurs concrètes (fond + texte). */
function paletteFor(fill: CardMeta['fill']): { background: string; text: string; dim: string } {
  switch (fill) {
    case 'accent':
      return { background: colors.accent, text: colors.onAccent, dim: withAlpha(colors.onAccent, 0.72) };
    case 'contrast':
      return { background: colors.blockContrast, text: colors.onBlockContrast, dim: withAlpha(colors.onBlockContrast, 0.6) };
    case 'surfaceAlt':
      return { background: colors.surfaceAlt, text: colors.textPrimary, dim: colors.textSecondary };
    default:
      return { background: colors.surface, text: colors.textPrimary, dim: colors.textSecondary };
  }
}

/**
 * Une carte du mur Explorer.
 *
 * Quatre formats, un seul composant : ils partagent la mesure, le double-tap
 * et l'appui long, et ne diffèrent que par leur corps. Les séparer en quatre
 * composants dupliquerait trois fois cette mécanique de geste, qui est
 * précisément la partie fragile.
 *
 * ⚠️ Pas d'animation d'apparition : le rythme vient de la mise en page.
 */
function ExploreCard({
  meta, cardWidth, wide = false, isNew = false, onPress, onLike, onLongPress,
}: ExploreCardProps) {
  const { tweet, format } = meta;
  const content = useMemo(() => displayContentOf(tweet), [tweet]);
  const media = useMemo(() => splitTweetMedia(tweet), [tweet]);
  const author = useMemo(() => contentSourceOf(tweet)?.author, [tweet]);
  const palette = useMemo(() => paletteFor(meta.fill), [meta.fill]);

  const likes = tweet.stats?.likes ?? 0;
  const views = tweet.stats?.views ?? 0;
  const isLiked = !!tweet.user_interaction?.is_liked;

  const lastTapRef = useRef(0);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameRef = useRef<View>(null);
  const bigHeart = useSharedValue(0);

  useEffect(() => () => {
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
  }, []);

  const bigHeartStyle = useAnimatedStyle(() => ({
    opacity: interpolate(bigHeart.value, [0, 0.12, 0.7, 1], [0, 0.95, 0.9, 0], Extrapolation.CLAMP),
    transform: [{
      scale: interpolate(bigHeart.value, [0, 0.15, 0.3, 0.6, 1], [0.2, 1.2, 0.95, 1, 0.75], Extrapolation.CLAMP),
    }],
  }));

  /** Mesure synchrone : le doigt est encore posé, la grille n'a pas bougé. */
  const measure = useCallback((then: (rect: CardRect | null) => void) => {
    let measured: CardRect | null = null;
    frameRef.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) measured = { x, y, width, height };
    });
    then(measured);
  }, []);

  const handlePress = useCallback(() => {
    const now = Date.now();
    const isDoubleTap = now - lastTapRef.current < DOUBLE_TAP_MS;
    lastTapRef.current = now;

    if (isDoubleTap) {
      if (openTimerRef.current) { clearTimeout(openTimerRef.current); openTimerRef.current = null; }
      bigHeart.value = 0;
      bigHeart.value = withTiming(1, { duration: 700 });
      // Ne jamais RETIRER un like : `apiService.likeTweet` bascule côté serveur,
      // un appel de trop annulerait le like au lieu d'en ajouter un.
      if (!isLiked) { feedback.select(); onLike(tweet); }
      return;
    }

    measure((rect) => {
      openTimerRef.current = setTimeout(() => {
        openTimerRef.current = null;
        onPress(tweet, rect);
      }, OPEN_DELAY_MS);
    });
  }, [bigHeart, isLiked, measure, onLike, onPress, tweet]);

  /**
   * `Gesture.LongPress` plutôt que la prop `onLongPress` de Tappable : il faut
   * la même horloge que le double-tap pour qu'un appui maintenu n'ouvre jamais
   * la lecture en plus du panneau.
   *
   * ⚠️ `scheduleOnRN`, pas `runOnJS` : appeler une fonction JS ordinaire
   * directement depuis un worklet tue l'app SANS AUCUN LOG.
   */
  const longPress = useMemo(
    () => Gesture.LongPress().minDuration(350).onStart(() => {
      'worklet';
      scheduleOnRN(() => {
        if (openTimerRef.current) { clearTimeout(openTimerRef.current); openTimerRef.current = null; }
        feedback.tap();
        measure((rect) => onLongPress(tweet, rect));
      });
    }),
    [measure, onLongPress, tweet],
  );

  const showLikes = shouldShowCount(likes);
  const showViews = shouldShowCount(views);

  let body: React.ReactNode = null;

  if (format === 'photo') {
    const ratio = wide ? 0.62 : 1.05;
    body = (
      <View>
        {media.coverUrl ? (
          <Image
            source={{ uri: media.coverUrl }}
            style={{ width: '100%', height: Math.round(cardWidth * ratio), backgroundColor: colors.surfaceAlt }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={140}
            recyclingKey={media.coverUrl}
          />
        ) : (
          <View style={{ width: '100%', height: Math.round(cardWidth * ratio), backgroundColor: colors.surfaceAlt }} />
        )}
        {!!media.videoUrl && (
          <View style={styles.videoBadge} pointerEvents="none">
            <Ionicons name="play" size={11} color={colors.white} />
            {showViews && (
              <Text style={styles.videoBadgeText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {formatCompactCount(views)}
              </Text>
            )}
          </View>
        )}
      </View>
    );
  } else if (format === 'declaration') {
    const type = declarationType(content.length);
    body = (
      <View style={[styles.declarationBox, wide && styles.declarationBoxWide]}>
        <Text
          style={[styles.declarationText, {
            color: palette.text,
            fontSize: wide ? type.fontSize * 1.25 : type.fontSize,
            lineHeight: wide ? type.lineHeight * 1.25 : type.lineHeight,
          }]}
          numberOfLines={type.lines}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
        >
          {content}
        </Text>
      </View>
    );
  } else {
    const type = quoteType(content.length);
    const isCitation = format === 'citation';
    body = (
      <View style={[styles.quoteBox, isCitation && styles.citationBox]}>
        <Text
          style={[
            isCitation ? styles.citationText : styles.blocText,
            { color: palette.text, fontSize: type.fontSize, lineHeight: type.lineHeight },
          ]}
          numberOfLines={type.lines}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
        >
          {content}
        </Text>
      </View>
    );
  }

  // Signature textuelle SANS avatar, et seulement là où elle apporte quelque
  // chose : une Déclaration ou une Citation est l'objet lui-même.
  const showByline = format === 'photo' || format === 'bloc';

  return (
    <GestureDetector gesture={longPress}>
      <Tappable
        style={[
          styles.card,
          { width: wide ? '100%' : cardWidth, backgroundColor: palette.background },
        ]}
        onPress={handlePress}
        scaleTo={0.97}
        accessibilityLabel={content || 'Tweet'}
      >
        {/* `collapsable={false}` : sans lui, Android fusionne cette vue avec
            son parent et `measureInWindow` n'a plus rien à mesurer. */}
        <View ref={frameRef} collapsable={false}>
          {body}

          {isNew && <View style={styles.newDot} pointerEvents="none" />}

          <Animated.View pointerEvents="none" style={[styles.bigHeart, bigHeartStyle]}>
            <Ionicons name="heart" size={wide ? 84 : 56} color={colors.white} />
          </Animated.View>
        </View>

        {(showByline || showLikes) && (
          <View style={styles.byline}>
            {showByline && (
              <Text
                style={[styles.bylineText, { color: palette.dim }]}
                numberOfLines={1}
                maxFontSizeMultiplier={MAX_FONT_SCALE}
              >
                {author?.username ? `@${author.username}` : ''}
              </Text>
            )}
            {showLikes && (
              <View style={styles.likeChip}>
                <Ionicons
                  name={isLiked ? 'heart' : 'heart-outline'}
                  size={12}
                  color={isLiked ? colors.like : palette.dim}
                />
                <Text
                  style={[styles.likeText, { color: palette.dim }]}
                  maxFontSizeMultiplier={MAX_FONT_SCALE}
                >
                  {formatCompactCount(likes)}
                </Text>
              </View>
            )}
          </View>
        )}
      </Tappable>
    </GestureDetector>
  );
}

export default memo(ExploreCard);

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  declarationBox: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 18 },
  declarationBoxWide: { paddingHorizontal: 24, paddingTop: 34, paddingBottom: 32 },
  declarationText: {
    fontFamily: displayNameFonts.poster,
    letterSpacing: -0.4,
  },
  quoteBox: { paddingHorizontal: 15, paddingTop: 16, paddingBottom: 14 },
  citationBox: {
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  citationText: { fontFamily: displayNameFonts.editorial },
  blocText: { fontFamily: fonts.medium },

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
  videoBadgeText: {
    color: colors.white,
    fontSize: 10.5,
    fontFamily: fonts.semibold,
    fontVariant: ['tabular-nums'],
  },

  newDot: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.cyan,
  },

  bigHeart: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },

  byline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: 2,
  },
  bylineText: { flex: 1, fontSize: 11.5, fontFamily: fonts.semibold },
  likeChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  likeText: { fontSize: 11, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] },
});
