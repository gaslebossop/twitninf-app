import React, { memo, useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type WithTimingConfig,
} from 'react-native-reanimated';

import { colors } from '../theme';
import {
  LOGO_CENTER,
  LOGO_PATH,
  LOGO_SIZE,
  NEEDLE_TIP,
  SYRINGE_PATHS,
  SYRINGE_SIZE,
} from '../assets/injectionArt';

/**
 * L'animation de marque de Kospor Injection : la seringue entre, pique, et la
 * marque jaillit du point d'injection avant de s'y résorber.
 *
 * ## Pourquoi elle déroge au vocabulaire de mouvement de l'app
 *
 * `theme/motion` interdit les animations au montage et plafonne les durées à
 * 340 ms — ces règles visent l'INTERFACE : ce qui bouge doit répondre à un
 * geste. Ici, l'animation *est* le contenu : une illustration de marque, dans
 * un écran qui n'a rien d'autre à montrer pendant qu'on lit trois lignes de
 * consignes. Elle ne s'applique à aucun élément d'interface et ne retarde
 * aucune action : le bouton est utilisable dès la première frame.
 *
 * ## Le cycle est FERMÉ
 *
 * L'état à 3000 ms est exactement l'état à 0 ms (scène vide) : la boucle ne
 * produit donc aucune coupure. C'est ce qui permet de la laisser tourner en
 * continu pendant toute la durée d'une injection, sans jamais montrer de
 * raccord.
 *
 * ## Comment c'est animé
 *
 * Une seule valeur partagée par élément, qui parcourt ses images clés
 * (`withSequence` de `withTiming`, une courbe par segment), et des styles qui
 * n'en dérivent que des interpolations. Tout reste sur le thread UI : aucune
 * fonction JS n'est appelée depuis un worklet — un appel de ce genre tue
 * l'application sans le moindre log.
 *
 * La somme des durées de chaque élément vaut exactement `CYCLE`, sinon les
 * éléments se déphaseraient tour après tour.
 */

/** Durée du cycle complet, entrée comprise. */
const CYCLE = 3000;
/** Instant où l'aiguille touche : tout le reste se cale dessus. */
const IMPACT = 720;
/** Début de la résorption. */
const OUTRO = 2340;

/** Le produit injecté — les couleurs sont celles de la seringue. */
const FLUID = ['#16F8EF', '#31BEFB', '#5496FB', '#7768FA', '#9544FB'] as const;

/** Les trois ondes de choc, du cyan au violet. */
const RING_COLORS = [FLUID[1], FLUID[4], FLUID[0]] as const;

const EASE = {
  out: Easing.bezier(0.16, 0.9, 0.3, 1),
  outSoft: Easing.bezier(0.25, 0.8, 0.35, 1),
  in: Easing.bezier(0.55, 0.06, 0.85, 0.32),
  back: Easing.bezier(0.34, 1.56, 0.5, 1),
  burst: Easing.bezier(0.07, 0.75, 0.22, 1),
  linear: Easing.linear,
};

/** Nombre d'éclats à l'impact — assez pour une éclaboussure, pas une nuée. */
const RAY_COUNT = 8;
const PARTICLE_COUNT = 12;

/** Une image clé : la valeur à atteindre, en combien de temps, avec quelle courbe. */
type Step = { to: number; dur: number; ease?: WithTimingConfig['easing']; delay?: number };

/**
 * Fait parcourir à une valeur partagée la suite d'images clés, en boucle, en
 * complétant jusqu'à `CYCLE` puis en revenant à zéro. La valeur vaut « numéro
 * d'image clé » : les styles interpolent dessus, ce qui donne une courbe propre
 * par segment sans multiplier les valeurs partagées.
 */
function usePhase(steps: Step[], active: boolean) {
  const phase = useSharedValue(0);

  useEffect(() => {
    if (!active) {
      cancelAnimation(phase);
      phase.value = 0;
      return;
    }

    const spent = steps.reduce((sum, s) => sum + (s.delay ?? 0) + s.dur, 0);
    // Le maintien final ramène l'élément au bord du cycle ; la dernière image
    // (1 ms) remet la valeur à zéro pour que la répétition reparte du début et
    // non de la dernière image clé atteinte.
    const hold = Math.max(1, CYCLE - spent - 1);
    const last = steps[steps.length - 1].to;

    const timeline: number[] = [
      ...steps.map((s) => {
        const anim = withTiming(s.to, { duration: s.dur, easing: s.ease ?? EASE.linear });
        return s.delay ? withDelay(s.delay, anim) : anim;
      }),
      withTiming(last, { duration: hold, easing: EASE.linear }),
      withTiming(0, { duration: 1 }),
    ];

    phase.value = 0;
    phase.value = withRepeat(withSequence(...timeline), -1, false);

    // Une boucle infinie survit au démontage : il faut l'arrêter explicitement.
    return () => cancelAnimation(phase);
    // `steps` est reconstruit à chaque rendu ; seules la taille et l'activité
    // changent réellement la chorégraphie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, steps.length]);

  return phase;
}

/* ------------------------------------------------------------------ */
/* Éclats de l'impact                                                  */
/* ------------------------------------------------------------------ */

const Ring = memo(function Ring({
  size,
  index,
  active,
  color,
}: {
  size: number;
  index: number;
  active: boolean;
  color: string;
}) {
  const base = size * 0.22;
  const steps = useMemo<Step[]>(
    () => [{ to: 1, dur: 620 + index * 140, ease: EASE.burst, delay: IMPACT + index * 80 }],
    [index],
  );
  const phase = usePhase(steps, active);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(phase.value, [0, 0.02, 1], [0, 0.95, 0], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(phase.value, [0, 1], [0.18, 3.2 + index * 0.7], Extrapolation.CLAMP) },
    ] as const,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: (size - base) / 2,
          top: (size - base) / 2,
          width: base,
          height: base,
          borderRadius: base / 2,
          borderWidth: Math.max(2, size * 0.012 - index * 0.6),
          borderColor: color,
        },
        style,
      ]}
    />
  );
});

const Ray = memo(function Ray({
  size,
  index,
  count,
  active,
  color,
}: {
  size: number;
  index: number;
  count: number;
  active: boolean;
  color: string;
}) {
  const len = size * 0.26;
  const thick = Math.max(2, size * 0.016);
  const angle = (index / count) * 360;

  const steps = useMemo<Step[]>(
    () => [
      { to: 1, dur: 80, ease: EASE.burst, delay: IMPACT - 10 + index * 4 },
      { to: 2, dur: 400, ease: EASE.outSoft },
    ],
    [index],
  );
  const phase = usePhase(steps, active);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(phase.value, [0, 0.05, 1, 2], [0, 0.9, 0.9, 0], Extrapolation.CLAMP),
    transform: [
      { rotate: `${angle}deg` },
      {
        translateX: interpolate(
          phase.value,
          [0, 1, 2],
          [size * 0.02, size * 0.09, size * 0.34],
          Extrapolation.CLAMP,
        ),
      },
      { scaleX: interpolate(phase.value, [0, 1, 2], [0.12, 0.9, 0.3], Extrapolation.CLAMP) },
      { scaleY: interpolate(phase.value, [0, 1, 2], [1, 1, 0.3], Extrapolation.CLAMP) },
    ] as const,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: size / 2,
          top: size / 2 - thick / 2,
          width: len,
          height: thick,
          borderRadius: thick,
          backgroundColor: color,
          transformOrigin: '0% 50%',
        },
        style,
      ]}
    />
  );
});

const Particle = memo(function Particle({
  size,
  index,
  count,
  active,
  color,
}: {
  size: number;
  index: number;
  count: number;
  active: boolean;
  color: string;
}) {
  // Dispersion régulière, légèrement brouillée : un cercle parfait de gouttes
  // se lit comme un motif, pas comme une éclaboussure.
  const jitter = ((index * 2654435761) % 1000) / 1000;
  const angle = (index / count) * Math.PI * 2 + (jitter - 0.5) * 0.5;
  const dist = size * (0.2 + jitter * 0.16);
  const dot = size * (0.018 + jitter * 0.026);
  const dx = Math.cos(angle) * dist;
  const dy = Math.sin(angle) * dist;

  const steps = useMemo<Step[]>(
    () => [
      { to: 1, dur: 180, ease: EASE.burst, delay: IMPACT + jitter * 90 },
      { to: 2, dur: 460 + jitter * 320, ease: EASE.outSoft },
    ],
    [jitter],
  );
  const phase = usePhase(steps, active);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(phase.value, [0, 0.05, 1.4, 2], [0, 1, 1, 0], Extrapolation.CLAMP),
    transform: [
      { translateX: interpolate(phase.value, [0, 1, 2], [0, dx * 0.6, dx], Extrapolation.CLAMP) },
      {
        translateY: interpolate(
          phase.value,
          [0, 1, 2],
          [0, dy * 0.6, dy + size * 0.09],
          Extrapolation.CLAMP,
        ),
      },
      { scale: interpolate(phase.value, [0, 1, 2], [0.15, 1.1, 0.15], Extrapolation.CLAMP) },
    ] as const,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: size / 2 - dot / 2,
          top: size / 2 - dot / 2,
          width: dot,
          height: dot,
          borderRadius: dot / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
});

/* ------------------------------------------------------------------ */

interface Props {
  /** Côté de la scène carrée. */
  size?: number;
  /** Couleur de la marque. Par défaut celle du texte : elle suit le thème. */
  tint?: string;
  /** Coupe l'animation (écran masqué, préférence d'accessibilité…). */
  active?: boolean;
}

/** Deux instances montées en même temps ne doivent pas partager d'identifiant SVG. */
let gradientSeq = 0;

function LogoInjectionAnimation({ size = 200, tint, active = true }: Props) {
  const ids = useMemo(() => {
    const n = ++gradientSeq;
    return { fluid: `inj-fluid-${n}`, flash: `inj-flash-${n}`, halo: `inj-halo-${n}` };
  }, []);

  const mark = tint ?? colors.textPrimary;

  const LOGO_BOX = size * 0.55;
  const SYR_BOX = size * 0.6;
  const OUT = size * 0.95; // distance parcourue hors cadre, sur l'axe

  /* ---- seringue : entrée, anticipation, piqûre, retrait ---- */
  const syringeSteps = useMemo<Step[]>(
    () => [
      { to: 1, dur: 430, ease: EASE.out }, // entre dans le cadre
      { to: 2, dur: 130, ease: EASE.outSoft }, // se ramasse
      { to: 3, dur: 160, ease: EASE.in }, // pique
      { to: 4, dur: 70, ease: EASE.outSoft }, // le piston s'enfonce
      { to: 5, dur: 90, ease: EASE.out }, // relâche
      { to: 6, dur: 120, ease: EASE.in }, // recule
      { to: 7, dur: 440, ease: EASE.in }, // sort du cadre
    ],
    [],
  );
  const syringe = usePhase(syringeSteps, active);

  const syringeStyle = useAnimatedStyle(() => {
    const d = interpolate(
      syringe.value,
      [0, 1, 2, 3, 4, 5, 6, 7],
      [OUT, size * 0.065, size * 0.15, 0, -size * 0.012, size * 0.004, size * 0.12, OUT],
      Extrapolation.CLAMP,
    );
    return {
      opacity: interpolate(syringe.value, [0, 0.25, 6.4, 7], [0, 1, 1, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: d },
        { translateY: -d },
        {
          rotate: `${interpolate(
            syringe.value,
            [0, 1, 2, 3, 4, 5, 6, 7],
            [-8, 2, 4.5, 0, -1.5, 0.5, -2, -10],
            Extrapolation.CLAMP,
          )}deg`,
        },
        {
          scaleY: interpolate(
            syringe.value,
            [3, 4, 5, 6],
            [1, 0.93, 0.97, 1],
            Extrapolation.CLAMP,
          ),
        },
      ] as const,
    };
  });

  /* ---- la marque : jaillissement, respiration, résorption ---- */
  const logoSteps = useMemo<Step[]>(
    () => [
      { to: 1, dur: 130, ease: EASE.outSoft, delay: IMPACT + 10 }, // écrasement
      { to: 2, dur: 130, ease: EASE.outSoft }, // étirement
      { to: 3, dur: 140, ease: EASE.outSoft },
      { to: 4, dur: 300, ease: EASE.outSoft }, // se pose
      { to: 5, dur: OUTRO - 1430, ease: EASE.outSoft }, // respire
      { to: 6, dur: 110, ease: EASE.in }, // appel
      { to: 7, dur: 290, ease: EASE.in }, // se résorbe
    ],
    [],
  );
  const logo = usePhase(logoSteps, active);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: interpolate(logo.value, [0, 0.25, 6.5, 7], [0, 1, 1, 0], Extrapolation.CLAMP),
    transform: [
      {
        scaleX: interpolate(
          logo.value,
          [0, 1, 2, 3, 4, 5, 6, 7],
          [0.12, 1.3, 0.88, 1.06, 1, 1.015, 1.14, 0.02],
          Extrapolation.CLAMP,
        ),
      },
      {
        scaleY: interpolate(
          logo.value,
          [0, 1, 2, 3, 4, 5, 6, 7],
          [0.12, 0.72, 1.14, 0.96, 1, 1.015, 0.86, 0.02],
          Extrapolation.CLAMP,
        ),
      },
      {
        rotate: `${interpolate(
          logo.value,
          [0, 1, 2, 3, 4, 7],
          [-14, 4, -3, 1.2, 0, 14],
          Extrapolation.CLAMP,
        )}deg`,
      },
    ] as const,
  }));

  /* ---- le produit diffuse dans la marque ---- */
  const fluidSteps = useMemo<Step[]>(
    () => [{ to: 1, dur: 1180, ease: EASE.outSoft, delay: IMPACT + 40 }],
    [],
  );
  const fluid = usePhase(fluidSteps, active);
  const fluidStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      fluid.value,
      [0, 0.08, 0.4, 0.75, 1],
      [0, 1, 0.92, 0.45, 0],
      Extrapolation.CLAMP,
    ),
    transform: [
      { scale: interpolate(fluid.value, [0, 0.08, 0.4, 1], [0.05, 0.4, 1.02, 1.5], Extrapolation.CLAMP) },
    ] as const,
  }));

  /* ---- éclair d'impact ---- */
  const flashSteps = useMemo<Step[]>(
    () => [{ to: 1, dur: 430, ease: EASE.burst, delay: IMPACT - 20 }],
    [],
  );
  const flash = usePhase(flashSteps, active);
  const flashStyle = useAnimatedStyle(() => ({
    opacity: interpolate(flash.value, [0, 0.2, 1], [0, 1, 0], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(flash.value, [0, 0.2, 1], [0.3, 1, 1.9], Extrapolation.CLAMP) }],
  }));

  /* ---- halo d'énergie, présent tant que la marque l'est ---- */
  const haloSteps = useMemo<Step[]>(
    () => [
      { to: 1, dur: 180, ease: EASE.burst, delay: IMPACT + 20 },
      { to: 2, dur: 1400, ease: EASE.outSoft },
      { to: 3, dur: 260, ease: EASE.in, delay: OUTRO - 2300 },
    ],
    [],
  );
  const halo = usePhase(haloSteps, active);
  const haloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(halo.value, [0, 1, 2, 3], [0, 0.85, 0.45, 0], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(halo.value, [0, 1, 2, 3], [0.3, 1, 0.95, 0.4], Extrapolation.CLAMP) }],
  }));

  const haloBox = size * 0.92;
  const flashBox = size * 0.6;

  return (
    <View style={[styles.stage, { width: size, height: size }]} pointerEvents="none">
      {/* halo */}
      <Animated.View
        style={[
          { position: 'absolute', left: (size - haloBox) / 2, top: (size - haloBox) / 2 },
          haloStyle,
        ]}
      >
        <Svg width={haloBox} height={haloBox} viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id={ids.halo} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={FLUID[1]} stopOpacity={0.5} />
              <Stop offset="0.42" stopColor={FLUID[3]} stopOpacity={0.28} />
              <Stop offset="0.72" stopColor={FLUID[4]} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx="50" cy="50" r="50" fill={`url(#${ids.halo})`} />
        </Svg>
      </Animated.View>

      {RING_COLORS.map((color, i) => (
        <Ring key={i} size={size} index={i} active={active} color={color} />
      ))}

      {Array.from({ length: RAY_COUNT }, (_, i) => (
        <Ray
          key={i}
          size={size}
          index={i}
          count={RAY_COUNT}
          active={active}
          color={FLUID[i % FLUID.length]}
        />
      ))}

      {/* la marque, et le produit qui la remplit */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: (size - LOGO_BOX) / 2,
            top: size / 2 - LOGO_BOX * LOGO_CENTER.y,
            width: LOGO_BOX,
            height: LOGO_BOX,
            transformOrigin: `50% ${LOGO_CENTER.y * 100}%`,
          },
          logoStyle,
        ]}
      >
        <Svg width={LOGO_BOX} height={LOGO_BOX} viewBox={`0 0 ${LOGO_SIZE} ${LOGO_SIZE}`}>
          <Path d={LOGO_PATH} fill={mark} />
        </Svg>

        <Animated.View style={[StyleSheet.absoluteFill, fluidStyle]}>
          <Svg width={LOGO_BOX} height={LOGO_BOX} viewBox={`0 0 ${LOGO_SIZE} ${LOGO_SIZE}`}>
            <Defs>
              <RadialGradient id={ids.fluid} cx="50%" cy="52.8%" r="62%">
                <Stop offset="0" stopColor="#FFFFFF" />
                <Stop offset="0.18" stopColor={FLUID[0]} />
                <Stop offset="0.45" stopColor={FLUID[1]} />
                <Stop offset="0.72" stopColor={FLUID[3]} />
                <Stop offset="1" stopColor={FLUID[4]} />
              </RadialGradient>
            </Defs>
            <Path d={LOGO_PATH} fill={`url(#${ids.fluid})`} />
          </Svg>
        </Animated.View>
      </Animated.View>

      {Array.from({ length: PARTICLE_COUNT }, (_, i) => (
        <Particle
          key={i}
          size={size}
          index={i}
          count={PARTICLE_COUNT}
          active={active}
          color={FLUID[i % FLUID.length]}
        />
      ))}

      {/* éclair, sous la seringue pour ne pas la délaver */}
      <Animated.View
        style={[
          { position: 'absolute', left: (size - flashBox) / 2, top: (size - flashBox) / 2 },
          flashStyle,
        ]}
      >
        <Svg width={flashBox} height={flashBox} viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id={ids.flash} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.98} />
              <Stop offset="0.34" stopColor="#FFFFFF" stopOpacity={0.55} />
              <Stop offset="0.72" stopColor="#FFFFFF" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx="50" cy="50" r="50" fill={`url(#${ids.flash})`} />
        </Svg>
      </Animated.View>

      {/* seringue */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: size / 2 - SYR_BOX * NEEDLE_TIP.x,
            top: size / 2 - SYR_BOX * NEEDLE_TIP.y,
            width: SYR_BOX,
            height: SYR_BOX,
            transformOrigin: `${NEEDLE_TIP.x * 100}% ${NEEDLE_TIP.y * 100}%`,
          },
          syringeStyle,
        ]}
      >
        <Svg width={SYR_BOX} height={SYR_BOX} viewBox={`0 0 ${SYRINGE_SIZE} ${SYRINGE_SIZE}`}>
          {SYRINGE_PATHS.map((p, i) => (
            <Path key={i} d={p.d} fill={p.fill} />
          ))}
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    // La seringue arrive de hors-champ : le débordement doit être coupé, sinon
    // elle passe par-dessus le titre de la page. L'alignement, lui, revient à
    // l'écran qui pose l'illustration.
    overflow: 'hidden',
  },
});

export default memo(LogoInjectionAnimation);
