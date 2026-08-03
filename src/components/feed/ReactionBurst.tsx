import React, { memo, useCallback } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withSequence,
  withDelay,
  interpolate,
  Extrapolation,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import { colors } from '../../theme';

/**
 * Éclat de réaction — le « pop » du cœur et du retweet.
 *
 * Tout est piloté par une seule valeur partagée 0 → 1 et n'utilise que
 * `opacity` et `transform` : aucune propriété de layout n'est animée, donc
 * aucun passage par le shadow tree et aucun rendu React. Une ligne du fil peut
 * donc jouer l'animation sans que la FlatList ne bouge — ce qui compte
 * d'autant plus que les lignes sont recyclées.
 *
 * Trois couches, dans l'ordre de peinture :
 *   1. le disque plein qui gonfle sous l'icône (les premières ~30 %) ;
 *   2. l'anneau qui prend le relais, s'étend et s'efface ;
 *   3. huit particules qui partent en étoile sur la fin.
 */

/** Nombre de particules — constant : les hooks des enfants en dépendent. */
const PARTICLE_COUNT = 8;

export interface ReactionPalette {
  /** Disque + anneau. */
  ring: string;
  /** Les particules alternent entre ces deux teintes. */
  particles: readonly [string, string];
}

export const LIKE_PALETTE: ReactionPalette = {
  ring: colors.like,
  particles: [colors.like, '#B14CF0'],
};

export const RETWEET_PALETTE: ReactionPalette = {
  ring: colors.success,
  particles: [colors.success, '#4CD8F0'],
};

interface ParticleProps {
  progress: SharedValue<number>;
  index: number;
  color: string;
  /** Distance parcourue depuis le centre, en px. */
  distance: number;
  dotSize: number;
}

const Particle = memo(function Particle({
  progress,
  index,
  color,
  distance,
  dotSize,
}: ParticleProps) {
  // Étoile régulière, départ vers le haut. Les particules impaires partent
  // très légèrement plus loin : sans ce décalage l'ensemble ressemble à une
  // roue dentée parfaite, ce qui fait tout de suite « figure géométrique ».
  const angle = (index / PARTICLE_COUNT) * Math.PI * 2 - Math.PI / 2;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const reach = distance * (index % 2 === 0 ? 1 : 0.82);

  const style = useAnimatedStyle(() => {
    // Les particules n'entrent qu'une fois l'anneau lancé.
    const t = interpolate(progress.value, [0.28, 1], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: interpolate(t, [0, 0.12, 0.7, 1], [0, 1, 0.9, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: dx * interpolate(t, [0, 1], [0, reach], Extrapolation.CLAMP) },
        { translateY: dy * interpolate(t, [0, 1], [0, reach], Extrapolation.CLAMP) },
        { scale: interpolate(t, [0, 0.3, 1], [0.2, 1, 0.35], Extrapolation.CLAMP) },
      ] as const,
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        S.particle,
        {
          width: dotSize,
          height: dotSize,
          borderRadius: dotSize / 2,
          marginLeft: -dotSize / 2,
          marginTop: -dotSize / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
});

export interface ReactionBurstProps {
  progress: SharedValue<number>;
  palette: ReactionPalette;
  /** Diamètre de l'icône visée — tout le reste s'échelonne dessus. */
  iconSize?: number;
}

/**
 * À poser en frère de l'icône, dans un conteneur `position: relative`. Le
 * composant se centre tout seul sur l'icône et ne capte aucun toucher.
 */
function ReactionBurst({ progress, palette, iconSize = 16 }: ReactionBurstProps) {
  const ringSize = iconSize * 2.1;
  const distance = iconSize * 1.15;
  const dotSize = Math.max(3, iconSize * 0.22);

  const discStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.06, 0.26, 0.4], [0, 0.85, 0.55, 0], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(progress.value, [0, 0.3, 0.45], [0, 1, 1.15], Extrapolation.CLAMP) },
    ],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.16, 0.3, 0.62, 0.82], [0, 1, 0.65, 0], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(progress.value, [0.16, 0.82], [0.45, 1.5], Extrapolation.CLAMP) },
    ],
  }));

  const box = {
    width: ringSize,
    height: ringSize,
    borderRadius: ringSize / 2,
    marginLeft: -ringSize / 2,
    marginTop: -ringSize / 2,
  };

  return (
    <Animated.View pointerEvents="none" style={[S.anchor, { top: iconSize / 2, left: iconSize / 2 }]}>
      <Animated.View
        pointerEvents="none"
        style={[S.layer, box, { backgroundColor: palette.ring }, discStyle]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          S.layer,
          box,
          { borderWidth: Math.max(2, iconSize * 0.16), borderColor: palette.ring },
          ringStyle,
        ]}
      />
      {Array.from({ length: PARTICLE_COUNT }, (_, i) => (
        <Particle
          key={i}
          index={i}
          progress={progress}
          color={palette.particles[i % 2]}
          distance={distance}
          dotSize={dotSize}
        />
      ))}
    </Animated.View>
  );
}

export default memo(ReactionBurst);

export interface ReactionAnimation {
  /** À passer à `<ReactionBurst progress={…} />`. */
  progress: SharedValue<number>;
  /** À appliquer à la vue qui porte l'icône. */
  iconStyle: ReturnType<typeof useAnimatedStyle>;
  /**
   * @param nowActive état APRÈS le geste. L'éclat complet n'est joué qu'à
   *   l'activation ; retirer un like ne fait qu'un petit rebond, comme sur
   *   Twitter.
   */
  play: (nowActive: boolean) => void;
}

/**
 * Anime l'icône elle-même et pilote l'éclat.
 *
 * L'icône se contracte d'abord (elle ne disparaît pas : le passage de
 * `heart-outline` à `heart` vient d'un state React qui arrive une frame plus
 * tard, et un scale 0 laisserait voir le contour vide se substituer au plein),
 * puis dépasse et se pose sur un ressort.
 *
 * @param spin fait pivoter l'icône d'un tour — utilisé pour le retweet.
 */
export function useReactionAnimation(spin = false): ReactionAnimation {
  const progress = useSharedValue(0);
  const scale = useSharedValue(1);
  const rotation = useSharedValue(0);

  // La rotation est toujours dans la liste : elle reste à 0° quand `spin` est
  // faux, ce qui évite une transformation conditionnelle (donc un style de
  // forme variable) pour un coût nul.
  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { rotate: `${rotation.value}deg` },
    ] as const,
  }));

  const play = useCallback(
    (nowActive: boolean) => {
      scale.value = withSequence(
        withTiming(nowActive ? 0.7 : 0.85, { duration: 110, easing: Easing.out(Easing.quad) }),
        withSpring(1, { damping: 7, stiffness: 260, mass: 0.5 }),
      );

      if (!nowActive) {
        // Retrait : pas d'éclat, et on coupe celui qui serait encore en vol.
        progress.value = 0;
        if (spin) rotation.value = 0;
        return;
      }

      if (spin) {
        rotation.value = 0;
        rotation.value = withTiming(360, { duration: 520, easing: Easing.out(Easing.cubic) });
      }

      progress.value = 0;
      progress.value = withDelay(
        30,
        withTiming(1, { duration: 620, easing: Easing.out(Easing.cubic) }),
      );
    },
    [progress, rotation, scale, spin],
  );

  return { progress, iconStyle, play };
}

const S = StyleSheet.create({
  // Point d'ancrage sans surface : c'est l'ordre de peinture qui met l'éclat
  // sous l'icône (le monter avant elle suffit). Un `zIndex` négatif le ferait
  // passer derrière le fond de la pastille active sur Android.
  anchor: {
    position: 'absolute',
    width: 0,
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  layer: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  particle: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});
