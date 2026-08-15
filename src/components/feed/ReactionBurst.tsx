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
import { STORY_GRADIENT } from '../StoryRing';

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
  /** Les particules alternent entre ces deux teintes, sauf si `rainbowParticles` est fourni. */
  particles: readonly [string, string];
  /**
   * Super Cœur uniquement : les particules parcourent cette palette au lieu
   * d'alterner entre deux teintes — c'est le « arc-en-ciel » demandé. Un
   * dégradé vrai sur l'anneau demanderait un masque (MaskedView, absent de
   * ce repo) ; les particules multicolores portent l'effet à elles seules.
   */
  rainbowParticles?: readonly string[];
}

export const LIKE_PALETTE: ReactionPalette = {
  ring: colors.like,
  particles: [colors.like, '#B14CF0'],
};

export const RETWEET_PALETTE: ReactionPalette = {
  ring: colors.success,
  particles: [colors.success, '#4CD8F0'],
};

/** Super Cœur — pression longue sur le like, réservé au palier Pro. */
export const SUPER_HEART_PALETTE: ReactionPalette = {
  ring: colors.gold,
  particles: [colors.gold, STORY_GRADIENT[2]],
  rainbowParticles: STORY_GRADIENT,
};

interface ParticleProps {
  progress: SharedValue<number>;
  index: number;
  /** Nombre total de particules de cet appel — répartit le cercle. */
  count: number;
  color: string;
  /** Distance parcourue depuis le centre, en px. */
  distance: number;
  dotSize: number;
}

const Particle = memo(function Particle({
  progress,
  index,
  count,
  color,
  distance,
  dotSize,
}: ParticleProps) {
  // Étoile régulière, départ vers le haut. Les particules impaires partent
  // très légèrement plus loin : sans ce décalage l'ensemble ressemble à une
  // roue dentée parfaite, ce qui fait tout de suite « figure géométrique ».
  const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
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
  /**
   * Nombre de particules. Reste un nombre FIXE pour un usage donné (les hooks
   * des enfants en dépendent) — deux appels distincts de `ReactionBurst` (like
   * normal, Super Cœur) peuvent chacun avoir le leur, mais un seul appel ne
   * doit jamais faire varier cette valeur d'un rendu à l'autre.
   */
  particleCount?: number;
  /**
   * Halo doux derrière l'anneau, réservé aux moments qui doivent se sentir
   * au-dessus d'un like ordinaire (Super Cœur) — même idée que le halo de
   * `RewardBurst`, à l'échelle de l'icône plutôt que de l'écran entier.
   */
  halo?: boolean;
}

/**
 * À poser en frère de l'icône, dans un conteneur `position: relative`. Le
 * composant se centre tout seul sur l'icône et ne capte aucun toucher.
 */
function ReactionBurst({ progress, palette, iconSize = 16, particleCount = PARTICLE_COUNT, halo = false }: ReactionBurstProps) {
  const ringSize = iconSize * 2.1;
  const distance = iconSize * 1.15;
  const dotSize = Math.max(3, iconSize * 0.22);

  // Trois anneaux CONTOUR (jamais remplis) à trois teintes franches et
  // écartées de la palette — trois disques pleins qui se recouvrent, même à
  // faible opacité, se moyennent optiquement en une tache brune : un contour
  // fin garde chaque couleur lisible pour elle-même. C'est ce qui fait
  // vraiment « arc-en-ciel » à grande échelle, pas les particules seules
  // (trop petites, trop loin du centre, pour porter l'effet à elles seules).
  const rainbowRing = (size: number) => ({
    width: size,
    height: size,
    borderRadius: size / 2,
    marginLeft: -size / 2,
    marginTop: -size / 2,
  });

  const auraOuterStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.16, 0.5, 0.85], [0, 0.9, 0.55, 0], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(progress.value, [0, 0.85], [0.4, 1.9], Extrapolation.CLAMP) },
    ],
  }));

  const auraMidStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.08, 0.26, 0.62, 0.95], [0, 0.9, 0.5, 0], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(progress.value, [0.08, 0.95], [0.4, 1.55], Extrapolation.CLAMP) },
    ],
  }));

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

  // Second anneau, décalé dans le temps : sur le Super Cœur (halo=true) ça lit
  // comme deux ondes qui se suivent au lieu d'une seule — le reste du temps il
  // est confondu avec le premier, donc invisible, coût nul à l'oeil.
  const echoRingStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.3, 0.44, 0.78, 1], [0, 0.8, 0.4, 0], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(progress.value, [0.3, 1], [0.5, 1.75], Extrapolation.CLAMP) },
    ],
  }));

  const box = {
    width: ringSize,
    height: ringSize,
    borderRadius: ringSize / 2,
    marginLeft: -ringSize / 2,
    marginTop: -ringSize / 2,
  };

  // Deux teintes franches, écartées dans la palette (index 0 et 4 d'un
  // dégradé à 5 tons) pour que les deux anneaux se distinguent nettement
  // l'un de l'autre plutôt que de dégrader vers un ton voisin.
  const auraColorA = palette.rainbowParticles?.[0] ?? palette.ring;
  const auraColorB = palette.rainbowParticles?.[palette.rainbowParticles.length - 1] ?? palette.ring;
  const auraColorC = palette.rainbowParticles?.[Math.floor((palette.rainbowParticles.length - 1) / 2)] ?? palette.ring;

  return (
    <Animated.View pointerEvents="none" style={[S.anchor, { top: iconSize / 2, left: iconSize / 2 }]}>
      {halo && (
        <Animated.View
          pointerEvents="none"
          style={[
            S.layer,
            rainbowRing(iconSize * 3.2),
            { borderWidth: Math.max(3, iconSize * 0.13), borderColor: auraColorA },
            auraOuterStyle,
          ]}
        />
      )}
      {halo && (
        <Animated.View
          pointerEvents="none"
          style={[
            S.layer,
            rainbowRing(iconSize * 2.6),
            { borderWidth: Math.max(3, iconSize * 0.15), borderColor: auraColorB },
            auraMidStyle,
          ]}
        />
      )}
      <Animated.View
        pointerEvents="none"
        style={[S.layer, box, { backgroundColor: palette.ring }, discStyle]}
      />
      {halo && (
        <Animated.View
          pointerEvents="none"
          style={[
            S.layer,
            box,
            { borderWidth: Math.max(2, iconSize * 0.16), borderColor: auraColorC },
            echoRingStyle,
          ]}
        />
      )}
      <Animated.View
        pointerEvents="none"
        style={[
          S.layer,
          box,
          { borderWidth: Math.max(2, iconSize * 0.16), borderColor: palette.ring },
          ringStyle,
        ]}
      />
      {Array.from({ length: particleCount }, (_, i) => (
        <Particle
          key={i}
          index={i}
          count={particleCount}
          progress={progress}
          color={palette.rainbowParticles ? palette.rainbowParticles[i % palette.rainbowParticles.length] : palette.particles[i % 2]}
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
 * @param burstMs durée de l'éclat. Plus long réservé à un moment qui doit se
 *   sentir au-dessus d'un appui ordinaire (Super Cœur) — reste une durée
 *   fixe qui se joue une fois, jamais une boucle ni un rebond répété.
 */
export function useReactionAnimation(spin = false, burstMs = 620): ReactionAnimation {
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
        withTiming(1, { duration: burstMs, easing: Easing.out(Easing.cubic) }),
      );
    },
    [progress, rotation, scale, spin, burstMs],
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
