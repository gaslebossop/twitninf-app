import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { colors, elevation, fonts, radius, withAlpha } from '../../../theme';
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
  /** Dernière position mesurée (voir `startMeasure` : la mesure est asynchrone). */
  const rectRef = useRef<CardRect | null>(null);
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

  /**
   * ⚠️ `measureInWindow` rend son résultat par CALLBACK ASYNCHRONE. Lire la
   * valeur juste après l'appel renvoie donc TOUJOURS `null` — c'est le piège
   * qui rendait `CardRect` inutilisable. On lance la mesure au plus tôt (le
   * doigt est encore posé, la grille n'a pas bougé) en écrivant dans un ref,
   * et on la LIT plus tard, au moment de s'en servir.
   */
  const startMeasure = useCallback(() => {
    rectRef.current = null;
    frameRef.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) rectRef.current = { x, y, width, height };
    });
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

    // La mesure part MAINTENANT et sera lue dans 260 ms — largement le temps
    // que son callback ait écrit dans le ref. Le timer, lui, est créé tout de
    // suite : différé, un second appui n'aurait rien à annuler.
    startMeasure();
    openTimerRef.current = setTimeout(() => {
      openTimerRef.current = null;
      onPress(tweet, rectRef.current);
    }, OPEN_DELAY_MS);
  }, [bigHeart, isLiked, onLike, onPress, startMeasure, tweet]);

  /**
   * `Tappable` compose DÉJÀ `Gesture.Exclusive(long, tap)` en interne : le
   * maintien l'emporte, le tap ne part que si le doigt s'est relevé à temps.
   * Emboîter un second `GestureDetector` par-dessus rouvrirait la question de
   * la relation entre deux détecteurs imbriqués — inutile, et jamais éprouvée
   * dans ce dépôt.
   *
   * Ici la mesure passe par le CALLBACK de `measureInWindow` plutôt que par le
   * ref : il n'y a aucune course avec un second appui à gérer, donc autant
   * lire la position à la source.
   */
  const handleLongPress = useCallback(() => {
    if (openTimerRef.current) { clearTimeout(openTimerRef.current); openTimerRef.current = null; }
    feedback.tap();
    const node = frameRef.current;
    if (!node) { onLongPress(tweet, null); return; }
    node.measureInWindow((x, y, width, height) => {
      onLongPress(tweet, width > 0 && height > 0 ? { x, y, width, height } : null);
    });
  }, [onLongPress, tweet]);

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

  // Puce de compteur : un voile à 12 % de la couleur de TEXTE de la carte,
  // pas une teinte fixe du thème — `palette.text` change avec `fill`
  // (blanc sur `accent`, quasi-noir sur `contrast`, texte normal ailleurs),
  // donc ce calcul reste lisible sur n'importe lequel des quatre fonds sans
  // avoir besoin d'un cas par fond.
  const likeChipBg = useMemo(() => withAlpha(palette.text, 0.12), [palette.text]);

  return (
    <Tappable
      style={[
        styles.card,
        { width: wide ? '100%' : cardWidth, backgroundColor: palette.background },
      ]}
      onPress={handlePress}
      onLongPress={handleLongPress}
      scaleTo={0.97}
      accessibilityLabel={content || 'Tweet'}
    >
      {/* Ombre et coins arrondis séparés en deux couches : `overflow:'hidden'`
          (nécessaire pour rogner l'image d'une carte Photo aux coins ronds)
          rogne aussi toute ombre posée sur la MÊME vue côté iOS — l'ombre
          doit donc vivre sur `Tappable` (non rogné) et le rognage sur ce
          conteneur interne. */}
      <View style={styles.cardInner}>
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
              <View style={[styles.likeChip, { backgroundColor: likeChipBg }]}>
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
      </View>
    </Tappable>
  );
}

export default memo(ExploreCard);

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    ...elevation.card,
  },
  cardInner: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  declarationBox: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 18 },
  declarationBoxWide: { paddingHorizontal: 24, paddingTop: 34, paddingBottom: 32 },
  declarationText: {
    fontFamily: displayNameFonts.poster,
    // -0.4 collait les diacritiques (à, é) au glyphe précédent dans une
    // police déjà très condensée à cette taille — -0.2 garde le pincement
    // « affiche » sans ce risque de collision.
    letterSpacing: -0.2,
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
    backgroundColor: withAlpha(colors.black, 0.55),
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
  likeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.md,
  },
  likeText: { fontSize: 11, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] },
});
