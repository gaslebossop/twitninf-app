/**
 * 🧪 La barre de progression scrutable des lecteurs vidéo du fil « 2B ».
 *
 * Partagée par le lecteur en place (`TweetVideoPaper`) et le plein écran
 * (`VideoViewerPaper`) : une seule barre, deux tailles. Deux copies auraient
 * fini par diverger, et c'est la pièce la plus délicate des deux — celle qui
 * suit le doigt.
 *
 * ── Pourquoi la progression est une valeur partagée ─────────────────────
 * `onPlaybackStatusUpdate` parle toutes les 200 ms. Repeindre la barre par
 * `setState` à cette cadence, c'est cinq rendus React par seconde pendant
 * toute la lecture, dans un fil qui défile. La position vit donc en
 * `SharedValue` et la barre est peinte sur le thread UI ; React n'apprend
 * jamais qu'elle bouge.
 *
 * Entre deux rapports, un `withTiming` LINÉAIRE de la durée du rapport comble
 * l'écart : sans lui la barre avancerait par à-coups de 200 ms, ce qui se voit
 * parfaitement. Linéaire et pas `easing.out` — une progression qui décélère
 * avant chaque rapport patine (voir `theme/motion.ts`).
 *
 * ── Pourquoi ces seuils de geste ────────────────────────────────────────
 * La barre en place est posée dans une `FlatList`. Sans `failOffsetY`, un
 * défilement vertical commencé sur les trois pixels de la barre serait capté
 * par le scrub et la liste ne bougerait pas — le pire des bugs tactiles, celui
 * qui n'arrive qu'une fois sur dix. `activeOffsetX` fait l'inverse : le
 * glissement horizontal est à nous sans discussion.
 *
 * ── Règle des worklets ──────────────────────────────────────────────────
 * Tout ce qui tourne dans un geste tourne sur le thread UI. Y appeler une
 * fonction JS ordinaire tue l'application sans le moindre log : les retours
 * vers React passent tous par `scheduleOnRN`.
 */

import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { paper, ps } from '../../../theme/paper2b';
import { clamp } from '../../../utils/gesture';

/** Épaisseur de la piste au repos, puis pendant le scrub. */
const TRACK_IDLE = { compact: 3, full: 4 } as const;
const TRACK_HELD = { compact: 6, full: 7 } as const;

interface VideoScrubBarProps {
  /** Avancée 0..1, peinte sur le thread UI. */
  progress: SharedValue<number>;
  /** 1 pendant que le doigt tient la barre — le lecteur cesse alors de la piloter. */
  scrubbing: SharedValue<number>;
  /** Appelé au relâchement, avec la position visée (0..1). */
  onSeek: (ratio: number) => void;
  /** Appelé à la prise en main — sert à garder les contrôles à l'écran. */
  onScrubStart?: () => void;
  /** `false` en place dans le fil, `true` en plein écran (piste plus épaisse, pastille). */
  expanded?: boolean;
}

export default function VideoScrubBar({
  progress,
  scrubbing,
  onSeek,
  onScrubStart,
  expanded = false,
}: VideoScrubBarProps) {
  const trackWidth = useSharedValue(0);
  const held = useSharedValue(0);

  const idleHeight = expanded ? TRACK_IDLE.full : TRACK_IDLE.compact;
  const heldHeight = expanded ? TRACK_HELD.full : TRACK_HELD.compact;
  const knobSize = expanded ? ps(14) : ps(10);

  const gesture = useMemo(() => {
    const grab = (x: number) => {
      'worklet';
      // Sans cette coupure, le `withTiming` du dernier rapport de lecture
      // continuerait de tirer la barre PENDANT que le doigt la tient.
      cancelAnimation(progress);
      held.value = withTiming(1, { duration: 120 });
      scrubbing.value = 1;
      progress.value = trackWidth.value > 0 ? clamp(x / trackWidth.value, 0, 1) : 0;
      if (onScrubStart) scheduleOnRN(onScrubStart);
    };

    const release = () => {
      'worklet';
      held.value = withTiming(0, { duration: 160 });
      scrubbing.value = 0;
      scheduleOnRN(onSeek, progress.value);
    };

    const pan = Gesture.Pan()
      .activeOffsetX([-6, 6])
      .failOffsetY([-10, 10])
      .shouldCancelWhenOutside(false)
      .onBegin((e) => {
        'worklet';
        grab(e.x);
      })
      .onUpdate((e) => {
        'worklet';
        if (trackWidth.value <= 0) return;
        progress.value = clamp(e.x / trackWidth.value, 0, 1);
      })
      .onFinalize(() => {
        'worklet';
        // `onFinalize` et pas `onEnd` : un geste annulé par la liste doit lui
        // aussi rendre la barre au lecteur, sinon elle reste figée pour de bon.
        if (scrubbing.value === 0) return;
        release();
      });

    // Appui simple = saut direct à l'endroit touché. Le `Pan` ne s'active
    // qu'au-delà de 6 px : sans ce `Tap`, un appui net ne ferait rien.
    const tap = Gesture.Tap()
      .maxDuration(260)
      .onEnd((e) => {
        'worklet';
        if (trackWidth.value <= 0) return;
        progress.value = clamp(e.x / trackWidth.value, 0, 1);
        scheduleOnRN(onSeek, progress.value);
        if (onScrubStart) scheduleOnRN(onScrubStart);
      });

    return Gesture.Exclusive(pan, tap);
  }, [held, onScrubStart, onSeek, progress, scrubbing, trackWidth]);

  const trackStyle = useAnimatedStyle(() => ({
    height: idleHeight + (heldHeight - idleHeight) * held.value,
  }));

  const fillStyle = useAnimatedStyle(() => ({
    width: progress.value * trackWidth.value,
  }));

  const knobStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: progress.value * trackWidth.value - knobSize / 2 },
      // La pastille n'existe qu'en plein écran… sauf sous le doigt, où elle
      // dit où l'on est en train de poser la lecture.
      { scale: expanded ? 1 + held.value * 0.25 : held.value },
    ] as const,
    opacity: expanded ? 1 : held.value,
  }));

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={[S.hit, { paddingVertical: expanded ? ps(14) : ps(10) }]}
        onLayout={(e) => {
          trackWidth.value = e.nativeEvent.layout.width;
        }}
      >
        <Animated.View style={[S.track, trackStyle]}>
          <Animated.View style={[S.fill, fillStyle]} />
        </Animated.View>
        <Animated.View
          style={[
            S.knob,
            { width: knobSize, height: knobSize, borderRadius: knobSize / 2, marginTop: -knobSize / 2 },
            knobStyle,
          ]}
          pointerEvents="none"
        />
      </View>
    </GestureDetector>
  );
}

/**
 * Les couleurs ne suivent PAS le thème.
 *
 * Cet habillage est toujours posé sur une image vidéo, donc sur un fond
 * quelconque et souvent sombre. Une piste « encre » du thème clair y
 * disparaîtrait sur une vidéo tournée de nuit. C'est la même raison qui garde
 * la visionneuse d'images noire dans les deux thèmes.
 */
const S = StyleSheet.create({
  hit: {
    width: '100%',
    justifyContent: 'center',
  },
  track: {
    width: '100%',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.28)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: paper.accent,
  },
  knob: {
    position: 'absolute',
    top: '50%',
    left: 0,
    backgroundColor: paper.accent,
  },
});
