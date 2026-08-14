import React, { memo, useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { withAlpha } from '../../theme';
import type { EventArt } from '../../theme/eventArt';
import { useReduceMotion } from '../../hooks/useReduceMotion';

/**
 * L'ambiance de fond de la page d'événement.
 *
 * ── Pourquoi des braises et pas des confettis ─────────────────────────────
 * Un confetti tombe vite, il est saturé, il coupe la lecture. Passé la
 * première seconde, on ne voit plus que lui — et on revient sur cette page
 * tous les jours pendant une semaine. Une braise monte lentement, à 6 % à 14 %
 * d'opacité, et sort du champ. On la remarque au premier écran, plus jamais
 * après ; c'est exactement ce qu'on demande à un décor.
 *
 * ── Le coût ───────────────────────────────────────────────────────────────
 * Douze vues, aucune image, et pas une seule ligne de JavaScript par image :
 * chaque braise est une boucle Reanimated posée une fois pour toutes sur le
 * thread UI. La page peut donc rester ouverte sans que le décor ne dispute
 * quoi que ce soit au défilement de la liste de quêtes.
 *
 * ── « Réduire les animations » ────────────────────────────────────────────
 * Coupé net. Un fond qui bouge en permanence est précisément le motif que ce
 * réglage existe pour supprimer, et une page d'événement n'est pas un endroit
 * où l'on peut se permettre de rendre quelqu'un malade.
 */

const COUNT = 12;
/** Bornes de durée d'ascension. Toutes différentes : un décor synchronisé se
 *  lit comme une animation, pas comme une ambiance. */
const RISE_MIN_MS = 9000;
const RISE_MAX_MS = 16000;

interface Props {
  art: EventArt;
  /** Hauteur de la zone décorée. Les braises sortent par le haut. */
  height: number;
}

function Ember({
  index,
  color,
  width,
  height,
}: {
  index: number;
  color: string;
  width: number;
  height: number;
}) {
  const t = useSharedValue(0);

  // Semis déterministe : les braises doivent être dispersées, pas aléatoires
  // à chaque rendu — sinon elles sautent d'un endroit à l'autre dès que le
  // parent se re-rend.
  const seed = (index * 2654435761) % 1000 / 1000;
  const startX = width * (0.06 + seed * 0.88);
  const drift = (seed - 0.5) * 46;
  const size = 2 + Math.round(seed * 3);
  const duration = RISE_MIN_MS + seed * (RISE_MAX_MS - RISE_MIN_MS);
  const delay = Math.round(seed * duration);

  useEffect(() => {
    t.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false),
    );
    return () => cancelAnimation(t);
  }, [t, delay, duration]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(t.value, [0, 1], [height, -20]) },
      { translateX: interpolate(t.value, [0, 0.5, 1], [0, drift, 0]) },
    ] as const,
    // Apparaît et s'éteint dans la course : une braise qui surgit ou se coupe
    // net trahit le truc.
    opacity: interpolate(t.value, [0, 0.15, 0.7, 1], [0, 0.14, 0.1, 0]),
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: startX,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

function EventAmbienceBase({ art, height }: Props) {
  const { width } = useWindowDimensions();
  const reduceMotion = useReduceMotion();

  if (art.particles === 'none' || reduceMotion || height <= 0) return null;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      {Array.from({ length: COUNT }, (_, i) => (
        <Ember
          key={i}
          index={i}
          // Une braise sur trois tire vers l'orange : le dégradé de
          // température est ce qui empêche le champ de paraître plat.
          color={withAlpha(i % 3 === 0 ? art.colors.ember : art.colors.festive, 0.9)}
          width={width}
          height={height}
        />
      ))}
    </View>
  );
}

export default memo(EventAmbienceBase);
