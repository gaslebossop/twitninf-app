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

import { colors, fonts, isDarkTheme, radius, withAlpha } from '../../../theme';
import Avatar from '../../Avatar';
import { Tappable } from '../../ui';
import feedback from '../../../utils/feedback';
import { formatCompactCount } from '../../../utils/format';
import { contentSourceOf, displayContentOf, splitTweetMedia } from '../../../utils/tweetMedia';
import {
  MEDIA_RATIO,
  shouldShowCount,
  TEXT_FONT_SIZE,
  TEXT_LINE_HEIGHT,
  TEXT_MAX_LINES,
  type CardMeta,
} from './cardFormat';

/**
 * Fond de carte, et il DOIT être décidé par thème.
 *
 * En clair, la page est blanche et `colors.surface` vaut `#F2F2F5` : une carte
 * grise posée sur du blanc, c'est le dessin exact d'un squelette de
 * chargement, et c'est ce qui rendait la grille « pas finie ». On inverse le
 * rapport — carte BLANCHE sur une page légèrement grisée (voir `ExploreWall`),
 * qui est la façon dont une carte se lit comme un objet posé.
 *
 * En sombre, le rapport naturel est déjà le bon : `surface` (`#161616`) est
 * plus clair que le fond (`#0A0A0A`), donc on n'y touche pas.
 *
 * Lu une seule fois au chargement du module, comme tout le reste du dépôt :
 * `colors` est un objet muté au démarrage et changer de thème demande de
 * toute façon un rechargement de l'app (voir `theme/colors.ts`).
 */
const CARD_BACKGROUND = isDarkTheme() ? colors.surface : colors.white;

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
  /** Publié depuis la dernière visite — point cyan. */
  isNew?: boolean;
  onPress: (tweet: CardMeta['tweet'], from: CardRect | null) => void;
  onLike: (tweet: CardMeta['tweet']) => void;
  onLongPress: (tweet: CardMeta['tweet'], from: CardRect | null) => void;
}

/**
 * Une carte du mur Explorer.
 *
 * ── Une seule forme, pour toutes les cartes ────────────────────────────────
 * Même fond, même police, même taille, même interlignage, même signature. Les
 * quatre traitements de la version précédente (police affiche, serif à filet,
 * pavé dense, vignette) et la cadence de fonds colorés donnaient un mur sans
 * trame, où chaque carte semblait venir d'une autre maquette. Ce qui distingue
 * une carte d'une autre est désormais son CONTENU, pas son habillage.
 *
 * Le seul embranchement restant est « visuel ou texte », et il ne change que
 * l'intérieur du cadre.
 *
 * ⚠️ Pas d'animation d'apparition : le rythme vient de la mise en page.
 */
function ExploreCard({
  meta, cardWidth, isNew = false, onPress, onLike, onLongPress,
}: ExploreCardProps) {
  const { tweet, format } = meta;
  const content = useMemo(() => displayContentOf(tweet), [tweet]);
  const media = useMemo(() => splitTweetMedia(tweet), [tweet]);
  const author = useMemo(() => contentSourceOf(tweet)?.author, [tweet]);

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

  const showViews = shouldShowCount(views);
  const mediaHeight = Math.round(cardWidth * MEDIA_RATIO);

  return (
    <Tappable
      style={[styles.card, { width: cardWidth }]}
      onPress={handlePress}
      onLongPress={handleLongPress}
      scaleTo={0.97}
      accessibilityLabel={content || 'Tweet'}
    >
      {/* Ombre et coins arrondis séparés en deux couches : `overflow:'hidden'`
          (nécessaire pour rogner l'image aux coins ronds) rogne aussi toute
          ombre posée sur la MÊME vue côté iOS — l'ombre doit donc vivre sur
          `Tappable` (non rogné) et le rognage sur ce conteneur interne. */}
      <View style={styles.cardInner}>
        {/* `collapsable={false}` : sans lui, Android fusionne cette vue avec
            son parent et `measureInWindow` n'a plus rien à mesurer. */}
        <View ref={frameRef} collapsable={false}>
          {format === 'photo' ? (
            <View>
              {media.coverUrl ? (
                <Image
                  source={{ uri: media.coverUrl }}
                  style={{ width: '100%', height: mediaHeight, backgroundColor: colors.surfaceAlt }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={140}
                  recyclingKey={media.coverUrl}
                />
              ) : (
                <View style={{ width: '100%', height: mediaHeight, backgroundColor: colors.surfaceAlt }} />
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
          ) : (
            <View style={styles.textBox}>
              <Text
                style={styles.text}
                numberOfLines={TEXT_MAX_LINES}
                maxFontSizeMultiplier={MAX_FONT_SCALE}
              >
                {content}
              </Text>
            </View>
          )}

          {isNew && <View style={styles.newDot} pointerEvents="none" />}

          <Animated.View pointerEvents="none" style={[styles.bigHeart, bigHeartStyle]}>
            <Ionicons name="heart" size={56} color={colors.white} />
          </Animated.View>
        </View>

        {/* Signature sur TOUTES les cartes — c'est ce qui donne au mur sa ligne
            de base commune : vignette, nom, compteur à droite.
            Le nom d'AFFICHAGE, pas le `@handle` : c'est un nom de personne qui
            se lit, et `Avatar` retombe sur son initiale en dégradé quand le
            compte n'a pas de photo, donc jamais de rond vide. */}
        <View style={styles.byline}>
          <Avatar size={22} username={author?.username} uri={author?.avatar} />
          <Text
            style={styles.bylineText}
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
          >
            {author?.full_name || author?.username || ''}
          </Text>
          {/* Compteur sur TOUTES les cartes, y compris à zéro. Le plancher qui
              le masquait en dessous de 5 laissait une carte sur deux sans rien
              à droite, et c'est cette alternance — une carte avec chiffre, la
              suivante sans — qui donnait à la ligne de signature son air
              inachevé. Un « 0 » assumé vaut mieux qu'un trou. */}
          <View style={styles.likeChip}>
            {/* Cœur PLEIN uniquement si j'ai aimé — sinon un contour discret.
                Un cœur magenta plein partout peignait la grille en rouge. */}
            <Ionicons
              name={isLiked ? 'heart' : 'heart-outline'}
              size={13}
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
}

export default memo(ExploreCard);

const styles = StyleSheet.create({
  /**
   * Ombre volontairement TRÈS discrète (`elevation.card` du thème monte à 25 %
   * d'opacité) : sur une carte gris clair posée sur fond blanc, une ombre
   * marquée fait une auréole sale au lieu d'un relief. Ce qui donne son arête
   * à la carte ici, ce n'est pas l'ombre, c'est le filet ci-dessous.
   */
  card: {
    borderRadius: radius.lg,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  /**
   * Filet d'un cheveu en plus de l'ombre : l'ombre seule ne suffit pas à poser
   * une arête sur Android, où elle est rendue par `elevation` et disparaît
   * presque sur une surface claire.
   */
  cardInner: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: CARD_BACKGROUND,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },

  textBox: { paddingHorizontal: 13, paddingTop: 14, paddingBottom: 12 },
  text: {
    color: colors.textPrimary,
    fontFamily: fonts.medium,
    fontSize: TEXT_FONT_SIZE,
    lineHeight: TEXT_LINE_HEIGHT,
  },

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

  /**
   * Signature en retrait : elle doit se lire APRÈS le contenu, jamais avant.
   * En `semibold` à 11,5 px avec un cœur plein magenta, la ligne d'auteur
   * pesait plus lourd que le tweet lui-même sur une carte courte.
   */
  byline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingBottom: 9,
    paddingTop: 3,
  },
  bylineText: {
    flex: 1,
    fontSize: 12.5,
    fontFamily: fonts.medium,
    color: colors.textMuted,
  },
  likeChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  likeText: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
});
