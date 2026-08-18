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

import { colors, duration, radius, withAlpha } from '../../../theme';
// `displayNameFonts` n'est pas réexporté par le barrel `../../../theme` (seul
// `fonts` l'est) : import direct depuis `theme/fonts`, comme le fait déjà
// `ExploreCard.tsx`.
import { displayNameFonts } from '../../../theme/fonts';
// ⚠️ Courbes REANIMATED (worklets) — un easing de `theme/motion` fait lever
// `ReanimatedError: The easing function is not a worklet`.
import { ease, timing } from '../../../utils/gesture';
import { displayContentOf, splitTweetMedia } from '../../../utils/tweetMedia';
import { CITATION_MAX, declarationType, type CardMeta } from './cardFormat';
import type { CardRect } from './ExploreCard';

/** Nombre de tweets consommés par la bande — le mur commence après. */
export const HERO_COUNT = 5;

/** Durée d'affichage d'un tweet avant enchaînement automatique. */
const DWELL_MS = 4500;

/**
 * `declarationType` n'a que trois paliers, tous pensés pour la borne
 * `DECLARATION_MAX` (46 caractères) du mur — jamais dépassée là-bas, car
 * `formatOf` a déjà écarté tout tweet plus long vers un autre format. La
 * bande héro n'a pas ce garde-fou : elle affiche le contenu de N'IMPORTE
 * QUEL tweet du tirage, donc un texte de plusieurs phrases atterrissait
 * quand même dans le palier le plus généreux de `declarationType`, agrandi
 * ×1,35 — un paragraphe entier écrasé dans une police affiche à 38px,
 * tronqué à 5 lignes en plein milieu d'un mot. Au-delà du seuil Citation, on
 * renonce au traitement affiche et on retombe sur une taille de lecture
 * confortable, quitte à perdre l'effet poster pour ces tirages-là.
 */
function heroDisplayType(length: number): { fontSize: number; lineHeight: number; lines: number } {
  if (length <= CITATION_MAX) {
    const base = declarationType(length);
    return {
      fontSize: Math.min(44, base.fontSize * 1.35),
      lineHeight: Math.min(42, base.lineHeight * 1.35),
      lines: 5,
    };
  }
  return { fontSize: 22, lineHeight: 27, lines: 8 };
}

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
    fade.value = withTiming(0, { duration: duration.instant, easing: ease.in }, (done) => {
      'worklet';
      if (done) {
        scheduleOnRN(setIndex, wrapped);
        drift.value = 24;
        fade.value = withTiming(1, timing.base);
        drift.value = withTiming(0, timing.base);
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
  }, [index, count, runProgress]);

  // Séparé de l'effet ci-dessus À DESSEIN : `progress`/`fade`/`drift` sont des
  // valeurs partagées stables, donc ce cleanup ne s'exécute qu'au VRAI
  // démontage. Si on le fusionne avec l'effet indexé par `index`, son cleanup
  // se redéclenche à CHAQUE changement de slide — souvent moins de 260 ms
  // après que `goTo` a relancé le fondu entrant — et fige `fade`/`drift` près
  // de 0 pour toute la durée du dwell suivant (bande quasi invisible).
  useEffect(() => () => {
    cancelAnimation(progress);
    cancelAnimation(fade);
    cancelAnimation(drift);
  }, [progress, fade, drift]);

  /**
   * ⚠️ `measureInWindow` rend son résultat par CALLBACK ASYNCHRONE. Lire une
   * variable juste après l'appel renvoie toujours `null` — l'appel à `onOpen`
   * doit donc se faire DEPUIS le callback, pas juste après l'avoir déclenché.
   */
  const handlePress = useCallback(() => {
    // `index` peut survivre à un tirage plus court que le précédent : on le
    // ramène dans les bornes plutôt que de lire `undefined`.
    const current = slides[Math.min(index, count - 1)];
    if (!current) return;
    const node = frameRef.current;
    if (!node) { onOpen(current.tweet, null); return; }
    node.measureInWindow((x, y, w, h) => {
      onOpen(current.tweet, w > 0 && h > 0 ? { x, y, width: w, height: h } : null);
    });
  }, [count, index, onOpen, slides]);

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

  // `index` peut survivre à un tirage plus court que le précédent : on le
  // ramène dans les bornes plutôt que de lire `undefined`.
  const boundedIndex = Math.min(index, count - 1);
  const current = slides[boundedIndex];
  const content = displayContentOf(current.tweet);
  const media = splitTweetMedia(current.tweet);
  const type = heroDisplayType(content.length);

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
              fontSize: type.fontSize,
              lineHeight: type.lineHeight,
            }]}
            numberOfLines={type.lines}
            maxFontSizeMultiplier={1.2}
          >
            {content}
          </Text>
        </Animated.View>

        <View style={styles.track} pointerEvents="none">
          {slides.map((meta, i) => (
            <View key={meta.tweet.id} style={styles.segment}>
              {i < boundedIndex && <View style={styles.segmentFull} />}
              {i === boundedIndex && <Animated.View style={[styles.segmentFull, barStyle]} />}
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
    // -0.6 collait les diacritiques (à, é) au glyphe précédent à cette
    // taille — voir la même correction dans ExploreCard.tsx.
    letterSpacing: -0.3,
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
