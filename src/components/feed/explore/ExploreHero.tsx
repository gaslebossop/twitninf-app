import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing as REasing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { colors, duration, easing, radius, withAlpha } from '../../../theme';
// `displayNameFonts` n'est pas réexporté par le barrel `../../../theme` (seul
// `fonts` l'est) : import direct depuis `theme/fonts`, comme le fait déjà
// `ExploreCard.tsx`.
import { displayNameFonts } from '../../../theme/fonts';
import { displayContentOf, splitTweetMedia } from '../../../utils/tweetMedia';
import { declarationType, type CardMeta } from './cardFormat';
import type { CardRect } from './ExploreCard';

/** Nombre de tweets consommés par la bande — le mur commence après. */
export const HERO_COUNT = 5;

/** Durée d'affichage d'un tweet avant enchaînement automatique. */
const DWELL_MS = 4500;

interface ExploreHeroProps {
  metas: CardMeta[];
  onOpen: (tweet: CardMeta['tweet'], from: CardRect | null) => void;
}

/**
 * La bande qui joue seule à l'ouverture d'Explorer.
 *
 * ── Pourquoi elle existe ───────────────────────────────────────────────────
 * Une grille froide oblige à CHOISIR quoi toucher avant que quoi que ce soit
 * n'arrive. Ici quelque chose se passe dès la première frame, sans décision.
 * Elle consomme les 5 premiers tweets du tirage — ceux que le moteur
 * échantillonne déjà à basse température dans le haut du classement, donc les
 * plus forts : ils méritent mieux que d'être noyés dans le mur.
 *
 * ── Pourquoi la progression est une valeur partagée, pas un setInterval ────
 * Il faut pouvoir l'interrompre AU DOIGT et la REPRENDRE là où elle en était.
 * Un `setInterval` ne sait faire ni l'un ni l'autre : il faudrait le tuer et
 * recalculer le reliquat à la main. Ici `cancelAnimation` fige la valeur, et la
 * reprise relance un `withTiming` sur la durée restante.
 */
function ExploreHero({ metas, onOpen }: ExploreHeroProps) {
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const progress = useSharedValue(0);
  const drift = useSharedValue(0);
  const fade = useSharedValue(1);
  const frameRef = useRef<View>(null);

  const slides = useMemo(() => metas.slice(0, HERO_COUNT), [metas]);
  const count = slides.length;
  const bandHeight = Math.round(height * 0.38);

  const goTo = useCallback((next: number) => {
    if (count === 0) return;
    const wrapped = ((next % count) + count) % count;
    // Fondu croisé court + dérive latérale : l'œil suit le mouvement au lieu
    // de subir un remplacement sec.
    fade.value = withTiming(0, { duration: 110, easing: easing.in }, (done) => {
      'worklet';
      if (done) {
        scheduleOnRN(setIndex, wrapped);
        drift.value = 24;
        fade.value = withTiming(1, { duration: duration.base, easing: easing.out });
        drift.value = withTiming(0, { duration: duration.base, easing: easing.out });
      }
    });
  }, [count, drift, fade]);

  /** Relance la barre depuis sa position courante, sur la durée restante. */
  const runProgress = useCallback((from: number, nextIndex: number) => {
    progress.value = from;
    progress.value = withTiming(
      1,
      // Linéaire : elle MESURE du temps. Une courbe la ferait patiner puis
      // accélérer, et l'attente paraîtrait irrégulière.
      { duration: Math.max(0, DWELL_MS * (1 - from)), easing: REasing.linear },
      (done) => {
        'worklet';
        if (done) scheduleOnRN(goTo, nextIndex);
      },
    );
  }, [goTo, progress]);

  useEffect(() => {
    if (count === 0) return;
    runProgress(0, index + 1);
    return () => cancelAnimation(progress);
  }, [index, count, runProgress, progress]);

  /**
   * ⚠️ `measureInWindow` rend son résultat par CALLBACK ASYNCHRONE. Lire une
   * variable juste après l'appel renvoie toujours `null` — l'appel à `onOpen`
   * doit donc se faire DEPUIS le callback, pas juste après l'avoir déclenché.
   */
  const handlePress = useCallback(() => {
    const current = slides[index];
    if (!current) return;
    const node = frameRef.current;
    if (!node) { onOpen(current.tweet, null); return; }
    node.measureInWindow((x, y, w, h) => {
      onOpen(current.tweet, w > 0 && h > 0 ? { x, y, width: w, height: h } : null);
    });
  }, [index, onOpen, slides]);

  /**
   * UN SEUL geste sur la bande : un `Tap`.
   *
   * ⚠️ Surtout PAS de `Gesture.Pan` horizontal ici. `TweetsScreen.tsx:411`
   * enveloppe tout le fil — Explorer compris — dans un Pan horizontal
   * (`activeOffsetX([-24, 24])`) qui change d'onglet. Un Pan imbriqué sans
   * relation déclarée laisse les deux s'activer : on changerait d'onglet ET de
   * tweet. Ce geste d'onglet est le code le plus délicat de l'écran et il n'a
   * jamais été essayé à la main — on ne le met pas en risque pour un balayage
   * manuel qui n'est qu'un bonus. La bande avance toute seule ; c'est sa
   * promesse.
   *
   * Et pas d'`onTouchEnd` sur la vue non plus : un glissé se termine aussi par
   * un « touch end », donc le moindre balayage ouvrirait la lecture.
   *
   * `onTouchesDown` se déclenche que le tap s'active ou non — poser le doigt
   * met donc la barre en pause même si le geste finit par échouer. Et
   * `onFinalize` reçoit `success` : on ne reprend la barre que si le tap n'a
   * PAS abouti (sinon la lecture s'ouvre par-dessus, rien à reprendre).
   */
  const tap = useMemo(
    () => Gesture.Tap()
      .maxDistance(10)
      .onTouchesDown(() => {
        'worklet';
        // Pause nette : la valeur reste où elle est, jamais remise à 0.
        cancelAnimation(progress);
      })
      .onEnd(() => {
        'worklet';
        scheduleOnRN(handlePress);
      })
      .onFinalize((_event, success) => {
        'worklet';
        // Reprise sur la durée RESTANTE — d'où le passage de `progress.value`.
        if (!success) scheduleOnRN(runProgress, progress.value, index + 1);
      }),
    [handlePress, index, progress, runProgress],
  );

  const bodyStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateX: drift.value }],
  }));

  const barStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  if (count === 0) return null;

  const current = slides[index];
  const content = displayContentOf(current.tweet);
  const media = splitTweetMedia(current.tweet);
  const type = declarationType(content.length);

  return (
    <GestureDetector gesture={tap}>
      <View
        ref={frameRef}
        collapsable={false}
        style={[styles.band, { height: bandHeight, width: width - 24 }]}
      >
        <Animated.View style={[styles.body, bodyStyle]}>
          {media.hasVisual && media.coverUrl ? (
            <>
              <Image
                source={{ uri: media.coverUrl }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={140}
              />
              <View style={styles.scrim} pointerEvents="none" />
            </>
          ) : null}
          <Text
            style={[styles.text, {
              fontSize: Math.min(44, type.fontSize * 1.35),
              lineHeight: Math.min(42, type.lineHeight * 1.35),
            }]}
            numberOfLines={5}
            maxFontSizeMultiplier={1.2}
          >
            {content}
          </Text>
        </Animated.View>

        <View style={styles.track} pointerEvents="none">
          {slides.map((meta, i) => (
            <View key={meta.tweet.id} style={styles.segment}>
              {i < index && <View style={styles.segmentFull} />}
              {i === index && <Animated.View style={[styles.segmentFull, barStyle]} />}
            </View>
          ))}
        </View>
      </View>
    </GestureDetector>
  );
}

export default memo(ExploreHero);

const styles = StyleSheet.create({
  band: {
    alignSelf: 'center',
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.accent,
    marginBottom: 14,
  },
  body: { flex: 1, justifyContent: 'flex-end', padding: 20 },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: withAlpha(colors.black, 0.42) },
  text: {
    color: colors.onAccent,
    fontFamily: displayNameFonts.poster,
    letterSpacing: -0.6,
  },
  track: {
    position: 'absolute',
    top: 12,
    left: 14,
    right: 14,
    flexDirection: 'row',
    gap: 4,
  },
  segment: {
    flex: 1,
    height: 2.5,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: withAlpha(colors.white, 0.28),
  },
  segmentFull: { height: '100%', width: '100%', backgroundColor: colors.white },
});
