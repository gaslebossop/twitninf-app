import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  Image,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgGradient,
  Path,
  RadialGradient as SvgRadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { colors, fonts, towardWhite, withAlpha } from '../theme';
import {
  AvatarDecoration,
  NameEffect,
  ProfileCustomization,
  ProfileEffect,
  certifiedNameColors,
  decorationColors,
  nameEffectOf,
  profileEffectOf,
  profileThemeOf,
  themeIntensityOf,
} from '../services/profileCustomizationService';
import type { VerificationStyle } from '../services/verificationStyleService';
import { litPulse } from '../utils/litPulse';

/* ════════════════════════════════════════════════════════════════════════
   Thème de profil (façon Discord)
   Le thème colore TOUT le profil : il est peint DERRIÈRE le hero entier
   (bannière, avatar, nom, bio, stats) et déborde sous lui. Il ne passe
   jamais par-dessus la bannière : une photo de bannière garde ses couleurs.
   ════════════════════════════════════════════════════════════════════════ */

/** Même hauteur que le calque desktop : la couleur reste vivante jusqu'aux
 * onglets puis s'éteint sans rupture. */
const PROFILE_THEME_HEIGHT = 780;

type RadialStop = { offset: number; color: string; opacity?: number };

function RadialWash({
  id,
  cx,
  cy,
  rx,
  ry,
  stops,
}: {
  id: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  stops: RadialStop[];
}) {
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={StyleSheet.absoluteFill}
    >
      <Defs>
        <SvgRadialGradient
          id={id}
          cx={cx}
          cy={cy}
          fx={cx}
          fy={cy}
          rx={rx}
          ry={ry}
          gradientUnits="userSpaceOnUse"
        >
          {stops.map((stop) => (
            <Stop
              key={`${stop.offset}:${stop.color}`}
              offset={stop.offset}
              stopColor={stop.color}
              stopOpacity={stop.opacity ?? 1}
            />
          ))}
        </SvgRadialGradient>
      </Defs>
      <Rect x={0} y={0} width={100} height={100} fill={`url(#${id})`} />
    </Svg>
  );
}

/**
 * Opacité d'un calque de thème pondérée par l'intensité choisie. Toutes les
 * couches passent par ici : « Discret » et « Intense » ne changent donc pas la
 * FORME du dégradé, seulement sa présence — un même thème reste reconnaissable
 * d'un réglage à l'autre.
 */
const tint = (color: string, alpha: number, factor: number) =>
  withAlpha(color, Math.min(alpha * factor, 0.95));

function ThemeBloom({
  accent,
  secondary,
  factor,
}: {
  accent: string;
  secondary: string;
  factor: number;
}) {
  const pulse = usePingPong(4500);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.themeBloom,
        {
          opacity: pulse.interpolate({
            inputRange: [0, 1],
            outputRange: [Math.min(0.55 * factor, 1), Math.min(0.82 * factor, 1)],
          }),
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }],
        },
      ]}
    >
      <RadialWash
        id="profile-theme-bloom"
        cx={50}
        cy={0}
        rx={72}
        ry={100}
        stops={[
          { offset: 0, color: accent, opacity: Math.min(0.38 * factor, 0.95) },
          { offset: 0.55, color: secondary, opacity: Math.min(0.18 * factor, 0.9) },
          { offset: 0.74, color: secondary, opacity: 0 },
        ]}
      />
    </Animated.View>
  );
}

export function ProfileThemeBackdrop({
  customization,
  bannerHeight,
  style,
}: {
  customization?: ProfileCustomization | null;
  /** Hauteur de la bande bannière : elle fixe où le dégradé bascule vers sa
      descente, donc où le raccord avec la photo se joue. */
  bannerHeight: number;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = profileThemeOf(customization);
  // Le thème se DÉPOSE : il n'apparaît qu'une fois la personnalisation
  // connue (les écrans ne montent ce calque qu'à ce moment-là), et il entre
  // en fondu descendant plutôt que d'apparaître d'un coup.
  const entrance = useEntrance(900);
  const [accent, secondary] = decorationColors(customization);
  const factor = themeIntensityOf(customization);

  // L'ambiance est un habillage à part entière : elle vit même sans thème, sur
  // le fond noir de l'app. La couper avec le dégradé rendait le réglage
  // invisible pour qui préfère un profil sobre.
  if (theme === 'none') {
    return <ProfileAmbience customization={customization} height={bannerHeight + 520} style={style} />;
  }

  const total = Math.max(PROFILE_THEME_HEIGHT, bannerHeight + 520);

  return (
    <Animated.View
      style={[
        { position: 'absolute', top: 0, left: 0, right: 0, height: total },
        entrance as any,
        style,
      ]}
      pointerEvents="none"
    >
      {theme === 'gradient' && (
        <LinearGradient
          colors={[
            tint(accent, 0.46, factor),
            tint(accent, 0.46, factor),
            tint(secondary, 0.42, factor),
            tint(secondary, 0.22, factor),
            tint(secondary, 0.08, factor),
            'transparent',
            'transparent',
          ]}
          locations={[0, 0.23, 0.33, 0.44, 0.58, 0.74, 1]}
          start={{ x: 0.48, y: 0 }}
          end={{ x: 0.52, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}

      {theme === 'glow' && (
        <>
          <LinearGradient
            colors={[
              tint(accent, 0.62, factor),
              tint(accent, 0.58, factor),
              tint(secondary, 0.3, factor),
              tint(secondary, 0.1, factor),
              'transparent',
              'transparent',
            ]}
            locations={[0, 0.23, 0.38, 0.54, 0.72, 1]}
            style={StyleSheet.absoluteFill}
          />
          <RadialWash
            id="profile-theme-glow"
            cx={50}
            cy={6}
            rx={82}
            ry={34}
            stops={[
              { offset: 0, color: accent, opacity: Math.min(0.32 * factor, 0.95) },
              { offset: 0.76, color: accent, opacity: 0 },
            ]}
          />
        </>
      )}

      {theme === 'mesh' && (
        <>
          <LinearGradient
            colors={[
              tint(secondary, 0.48, factor),
              tint(accent, 0.28, factor),
              'transparent',
              'transparent',
            ]}
            locations={[0, 0.46, 0.86, 1]}
            style={StyleSheet.absoluteFill}
          />
          <RadialWash
            id="profile-theme-mesh-center"
            cx={50}
            cy={40}
            rx={58}
            ry={34}
            stops={[
              { offset: 0, color: accent, opacity: Math.min(0.36 * factor, 0.95) },
              { offset: 0.74, color: accent, opacity: 0 },
            ]}
          />
          <RadialWash
            id="profile-theme-mesh-right"
            cx={100}
            cy={10}
            rx={58}
            ry={38}
            stops={[
              { offset: 0, color: secondary, opacity: Math.min(0.55 * factor, 0.95) },
              { offset: 0.66, color: secondary, opacity: 0 },
            ]}
          />
          <RadialWash
            id="profile-theme-mesh-left"
            cx={4}
            cy={2}
            rx={60}
            ry={40}
            stops={[
              { offset: 0, color: accent, opacity: Math.min(0.55 * factor, 0.95) },
              { offset: 0.68, color: accent, opacity: 0 },
            ]}
          />
        </>
      )}

      <ThemeBloom accent={accent} secondary={secondary} factor={factor} />
      <ProfileAmbience customization={customization} height={total} />
    </Animated.View>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   Ambiance de profil — une pluie de particules peinte EN FOND, derrière
   tout le profil, jamais par-dessus. Elle ne dépend pas du thème : un
   profil sans dégradé peut porter une ambiance seule.

   Un seul moteur pour les quatre ambiances : même champ de particules,
   seuls la forme, le sens de dérive et les tailles changent. Tout passe
   par `useNativeDriver` (translate/opacity/scale), donc rien ne coûte au
   scroll.
   ════════════════════════════════════════════════════════════════════════ */

/** Assez pour remplir l'écran, assez peu pour ne rien coûter. */
const AMBIENCE_PARTICLES = 16;

type AmbienceSpec = {
  /** Sens de dérive : les braises montent, la neige tombe. */
  rise: boolean;
  min: number;
  max: number;
  /** Amplitude du balancement latéral, en px. */
  sway: number;
  duration: [number, number];
};

const AMBIENCE: Record<Exclude<ProfileEffect, 'none'>, AmbienceSpec> = {
  sparkles: { rise: true, min: 7, max: 14, sway: 10, duration: [5200, 9000] },
  embers: { rise: true, min: 3, max: 7, sway: 14, duration: [4200, 7600] },
  bubbles: { rise: true, min: 9, max: 20, sway: 18, duration: [6800, 12000] },
  snow: { rise: false, min: 3, max: 7, sway: 16, duration: [7200, 13000] },
};

/**
 * Suite déterministe dérivée de l'index : deux montages du même profil
 * donnent le même champ. `Math.random()` ferait sauter les particules d'une
 * position à l'autre à chaque re-render.
 */
function scatter(index: number, salt: number) {
  const x = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Dérive linéaire bouclée, 0 → 1. Sans reset visible : les extrémités sont à
 * opacité nulle.
 *
 * `enabled` existe parce qu'un hook ne peut pas être appelé conditionnellement :
 * `AnimatedNameFill` doit l'appeler avant de savoir si l'effet en a besoin.
 * Sans ce garde-fou, un nom sans effet lançait quand même sa boucle — une par
 * ligne de fil, pour rien.
 */
function useDrift(duration: number, delay: number, enabled: boolean = true) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!enabled) return;
    const anim = Animated.loop(
      Animated.timing(value, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    const timer = setTimeout(() => anim.start(), delay);
    return () => {
      clearTimeout(timer);
      anim.stop();
    };
  }, [duration, delay, value, enabled]);
  return value;
}

/** Fondu d'arrivée seul (sans glissement) : l'ambiance se révèle, elle n'entre pas. */
function useFadeIn(duration: number, delay = 0) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.timing(value, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [duration, delay, value]);
  return value;
}

function AmbienceParticle({
  effect,
  spec,
  index,
  height,
  color,
}: {
  effect: Exclude<ProfileEffect, 'none'>;
  spec: AmbienceSpec;
  index: number;
  height: number;
  color: string;
}) {
  const rx = scatter(index, 1);
  const rs = scatter(index, 2);
  const rd = scatter(index, 3);
  const size = spec.min + rs * (spec.max - spec.min);
  const duration = spec.duration[0] + rd * (spec.duration[1] - spec.duration[0]);
  const travel = height * (0.72 + scatter(index, 4) * 0.28);
  const drift = useDrift(duration, Math.round(rd * duration));
  const sway = spec.sway * (rx > 0.5 ? 1 : -1);

  const shape =
    effect === 'sparkles' ? (
      <Svg viewBox="0 0 24 24" width="100%" height="100%">
        <Path d={STAR_PATH} fill={color} />
      </Svg>
    ) : effect === 'bubbles' ? (
      <View
        style={{
          width: '100%',
          height: '100%',
          borderRadius: size / 2,
          borderWidth: 1.5,
          borderColor: withAlpha(color, 0.75),
        }}
      />
    ) : (
      <View
        style={{
          width: '100%',
          height: '100%',
          borderRadius: size / 2,
          backgroundColor: color,
        }}
      />
    );

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: `${rx * 96}%`,
        // Point de départ : en bas pour ce qui monte, au-dessus du cadre pour
        // ce qui tombe.
        top: spec.rise ? travel : -size,
        width: size,
        height: size,
        opacity: drift.interpolate({
          inputRange: [0, 0.12, 0.72, 1],
          outputRange: [0, 0.85, 0.7, 0],
        }),
        transform: [
          {
            translateY: drift.interpolate({
              inputRange: [0, 1],
              outputRange: [0, spec.rise ? -travel : travel],
            }),
          },
          {
            translateX: drift.interpolate({
              inputRange: [0, 0.25, 0.5, 0.75, 1],
              outputRange: [0, sway, 0, -sway, 0],
            }),
          },
          {
            scale: drift.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: effect === 'embers' ? [1, 0.6, 0.3] : [0.85, 1.1, 0.9],
            }),
          },
        ],
      }}
    >
      {shape}
    </Animated.View>
  );
}

/**
 * Champ de particules d'un profil premium. `height` borne la zone habillée :
 * au-delà, on est dans la liste de tweets et l'ambiance n'a plus rien à y
 * faire.
 */
export function ProfileAmbience({
  customization,
  height,
  style,
}: {
  customization?: ProfileCustomization | null;
  height: number;
  style?: StyleProp<ViewStyle>;
}) {
  const effect = profileEffectOf(customization);
  const [accent, secondary] = decorationColors(customization);
  const fade = useFadeIn(1100, 220);

  if (effect === 'none') return null;
  const spec = AMBIENCE[effect];

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', top: 0, left: 0, right: 0, height, overflow: 'hidden' },
        { opacity: fade },
        style,
      ]}
    >
      {Array.from({ length: AMBIENCE_PARTICLES }, (_, index) => (
        <AmbienceParticle
          key={index}
          effect={effect}
          spec={spec}
          index={index}
          height={height}
          color={index % 2 === 0 ? accent : secondary}
        />
      ))}
    </Animated.View>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   Nom affiché — traitement animé réservé au palier Pro.
   Le nom reste du VRAI texte : le dégradé et le reflet passent par un
   masque (`MaskedView`), donc la police, la taille et le retour à la ligne
   restent ceux de l'écran appelant.
   ════════════════════════════════════════════════════════════════════════ */

/**
 * Période du motif de couleur sous le nom, en px. Large devant un nom
 * d'affichage : la nappe doit toujours déborder de part et d'autre du texte,
 * quelle que soit sa longueur.
 */
const SWEEP_SPAN = 220;

/**
 * Couches du halo de l'effet « Néon », du plus large au plus serré.
 * Transposition des rayons CSS de `name-glow` (feuille Windows) : c'est la
 * DENSITÉ qui fait le néon, pas le texte. Une couche unique à 14 px laissait
 * une brume grise autour d'un nom délavé. Peintes de la plus large à la plus
 * serrée pour que le cœur reste au-dessus.
 *
 * Chaque couche peint son glyphe en PLEIN, pas en transparent : sur iOS l'ombre
 * est dérivée de ce qui est effectivement dessiné, donc un remplissage à alpha 0
 * ne rayonne pas du tout. Les corps de glyphes empilés restent invisibles — le
 * cœur opaque, dessiné en dernier, les recouvre exactement.
 *
 * `min`/`max` : l'amplitude de respiration de la couche. `textShadowRadius`
 * n'étant pas animable, c'est l'opacité qui fait vivre le néon, et les couches
 * larges respirent plus que le cœur pour éviter un clignotement uniforme.
 */
/**
 * Rayons exprimés en RATIO du corps de texte, jamais en pixels fixes : le même
 * halo sert un nom de 21 px sur le profil et de 13 px dans un fil.
 *
 * Les rayons précédents (28/16/7 px) valaient jusqu'à 1,33× le corps du texte.
 * À cette échelle, les ombres de lettres voisines se recouvrent et saturent :
 * au lieu d'un tube néon on obtient un aplat qui remplit toute la boîte du
 * texte — le « rectangle » derrière le nom. C'est d'autant plus visible que la
 * couleur choisie est claire (un accent quasi blanc sature bien avant un rouge).
 * Un vrai halo tient sous ~0,75× le corps, et seule la couche de cœur reste
 * dense ; les couches larges doivent rester discrètes.
 */
const NAME_GLOW_HALO_RATIOS: ReadonlyArray<{ ratio: number; min: number; max: number }> = [
  { ratio: 0.72, min: 0.22, max: 0.4 },
  { ratio: 0.42, min: 0.38, max: 0.58 },
  { ratio: 0.2, min: 0.62, max: 0.85 },
];

const DEFAULT_NAME_FONT_SIZE = 21;

/**
 * Plafond du rayon le plus large, en px. `textShadowRadius` n'est pas rogné
 * par le conteneur (`nameWrap` n'a pas d'`overflow: hidden` — un halo doit
 * pouvoir déborder un peu du texte) : sans plafond, un nom en taille
 * « Géant » (×2, voir `NAME_SIZE_SCALE`) posé sur un gros libellé d'écran
 * repoussait le rayon largement au-delà de 40 px, et iOS restitue un rayon
 * aussi large comme un nuage diffus qui déborde sur toute la largeur de
 * l'écran plutôt qu'un tube net autour des lettres.
 */
const NAME_GLOW_MAX_RADIUS = 22;

function nameGlowHaloFor(style?: StyleProp<TextStyle>) {
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  const fontSize = typeof flat?.fontSize === 'number' ? flat.fontSize : DEFAULT_NAME_FONT_SIZE;
  return NAME_GLOW_HALO_RATIOS.map((layer) => ({
    radius: Math.min(layer.ratio * fontSize, NAME_GLOW_MAX_RADIUS * layer.ratio / NAME_GLOW_HALO_RATIOS[0].ratio),
    min: layer.min,
    max: layer.max,
  }));
}

/**
 * Halo empilé, partagé par « Néon » et « Certifié » : une seule recette, donc
 * les deux ne peuvent pas diverger. Seule la couleur change — l'accent du
 * profil pour l'un, la palette du badge pour l'autre.
 */
function NameHalo({
  color,
  name,
  style,
  numberOfLines,
  pulse,
}: {
  color: string;
  name: string;
  style?: StyleProp<TextStyle>;
  numberOfLines: number;
  pulse: Animated.AnimatedInterpolation<number>;
}) {
  return (
    <>
      {nameGlowHaloFor(style).map((layer) => (
        <Animated.Text
          key={layer.radius}
          numberOfLines={numberOfLines}
          style={[
            style,
            styles.nameGlowLayer,
            {
              color,
              textShadowColor: color,
              textShadowRadius: layer.radius,
              opacity: pulse.interpolate({
                inputRange: [0, 1],
                outputRange: [layer.min, layer.max],
              }),
            },
          ]}
        >
          {name}
        </Animated.Text>
      ))}
    </>
  );
}

export function AnimatedNameFill({
  customization,
  name,
  style,
  numberOfLines = 2,
  verified = false,
  verificationStyle,
}: {
  customization?: ProfileCustomization | null;
  name: string;
  /** Style du texte de l'écran appelant — repris tel quel. */
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  /** Compte certifié : seul droit d'accès à l'effet « Certifié ». */
  verified?: boolean;
  verificationStyle?: VerificationStyle | null;
}) {
  const requested: NameEffect = nameEffectOf(customization);
  // Une certification retirée doit éteindre l'effet immédiatement, sans
  // attendre une réécriture de la personnalisation stockée.
  const effect: NameEffect =
    requested === 'certified' && !verified ? 'none' : requested;
  const certif = certifiedNameColors(verificationStyle, customization);
  const [accentBase, secondaryBase] = decorationColors(customization);
  // En « Certifié », la couleur vient du badge et non de la palette d'accent.
  const accent = effect === 'certified' ? certif.from : accentBase;
  const secondary = effect === 'certified' ? certif.to : secondaryBase;
  // Un nom sans effet — le cas courant dans le fil — n'a rien à animer : la
  // boucle ne démarre plus pour rien, une par ligne montée.
  const sweep = useDrift(2600, 0, effect !== 'none');
  // Horloge PARTAGÉE avec la pastille de certif : côte à côte et de même
  // couleur, les deux doivent respirer ensemble (voir utils/litPulse).
  const pulse = litPulse();
  const label = (
    <Text style={style} numberOfLines={numberOfLines}>
      {name}
    </Text>
  );

  if (effect === 'none') return label;

  if (effect === 'glow') {
    // Le halo est EMPILÉ, comme la recette Windows et comme les presets néon
    // de `PremiumDisplayName` : une seule couche ne donne qu'une brume plate,
    // jamais un tube. Chaque couche ne peint que son ombre (remplissage
    // transparent) — un glyphe plein à chaque passe empâterait le contour.
    // `textShadowRadius` n'est pas animable : c'est l'opacité des couches qui
    // fait respirer le néon.
    return (
      <View style={styles.nameWrap}>
        <NameHalo
          color={accent}
          name={name}
          style={style}
          numberOfLines={numberOfLines}
          pulse={pulse}
        />
        {/* Le cœur porte la teinte : laissé à la couleur de texte de l'écran,
            il restait blanc et l'accent ne se lisait que dans la brume — un
            nom délavé, pas un néon. Éclairci vers le blanc comme un vrai tube,
            mais assez saturé pour rester reconnaissable. */}
        <Text style={[style, { color: towardWhite(accent, 0.55) }]} numberOfLines={numberOfLines}>
          {name}
        </Text>
      </View>
    );
  }

  // `gradient`, `shimmer` et `certified` partagent le même masque : dessous, une
  // nappe de couleur toujours présente (sinon le nom disparaîtrait entre deux
  // passes), et une bande de lumière qui la traverse pour `shimmer`.
  //
  // « Certifié » ajoute par-dessous un halo à la couleur du badge — c'est la
  // combinaison demandée : le nom prend la couleur de la certif ET rayonne.
  const lit = effect === 'shimmer' || effect === 'certified';
  return (
    <View style={styles.nameWrap}>
      {/* Même halo empilé que « Néon » : une couche unique à 14 px, plafonnée à
          0,95 d'opacité, se perdait dès que le profil portait un thème clair —
          la certif n'avait alors aucune lueur visible. */}
      {effect === 'certified' && (
        <NameHalo
          color={certif.glow}
          name={name}
          style={style}
          numberOfLines={numberOfLines}
          pulse={pulse}
        />
      )}
      <MaskedView
        maskElement={
          <Text style={[style, styles.nameMask]} numberOfLines={numberOfLines}>
            {name}
          </Text>
        }
      >
        {/* Le texte transparent impose sa taille : sans lui, la MaskedView
            n'aurait aucune dimension propre. */}
        <Text style={[style, styles.nameGhost]} numberOfLines={numberOfLines}>
          {name}
        </Text>

        {/* Nappe de fond : le motif se répète tous les SWEEP_SPAN px, la
            translation d'exactement une période reboucle sans couture.
            `Animated.loop` remet la valeur à 0 d'un coup : si la translation ne
            vaut pas EXACTEMENT une période du dégradé, le motif saute à chaque
            rebouclage. C'était le cas — 5 arrêts sur 4×SWEEP_SPAN donnent une
            période de 2×SWEEP_SPAN pour une translation d'un seul, donc un saut
            d'une demi-période. 9 arrêts ramènent la période à SWEEP_SPAN. */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.nameWash,
            {
              transform: [
                {
                  translateX: sweep.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -SWEEP_SPAN],
                  }),
                },
              ],
            },
          ]}
        >
          <LinearGradient
            colors={[
              accent, secondary, accent, secondary,
              accent, secondary, accent, secondary, accent,
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        {/* Le reflet part de bien avant le texte et sort bien après : le saut de
            `Animated.loop` doit tomber pendant qu'il est hors cadre, sinon on le
            voit se replacer. L'ancienne course s'arrêtait à SWEEP_SPAN, soit
            dans le texte dès qu'un nom dépassait 220 px. */}
        {lit && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.shimmerBand,
              {
                transform: [
                  {
                    translateX: sweep.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-SWEEP_SPAN, SWEEP_SPAN * 3],
                    }),
                  },
                ],
              },
            ]}
          >
            <LinearGradient
              colors={['transparent', withAlpha('#ffffff', 0.85), 'transparent']}
              locations={[0, 0.5, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        )}
      </MaskedView>
    </View>
  );
}

/**
 * Titre libre affiché sous le pseudo. Le liseré parcourt la pastille en
 * continu : posé mat, ce serait une étiquette de plus, pas un signe premium.
 */
export function ProfileTitleChip({
  customization,
  style,
}: {
  customization?: ProfileCustomization | null;
  style?: StyleProp<ViewStyle>;
}) {
  const title = customization?.profile_title?.trim();
  const [accent, secondary] = decorationColors(customization);
  // Sans titre, la puce ne s'affiche pas : sa boucle n'a pas à tourner.
  const sweep = useDrift(4200, 0, !!title);
  const entrance = useFadeIn(700, 160);

  if (!title) return null;

  return (
    <Animated.View
      style={[styles.titleChip, { borderColor: withAlpha(accent, 0.55) }, { opacity: entrance }, style]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.titleSweep,
          {
            transform: [
              { translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-130, 280] }) },
            ],
          },
        ]}
      >
        <LinearGradient
          colors={['transparent', withAlpha(accent, 0.34), withAlpha(secondary, 0.34), 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Text style={[styles.titleText, { color: accent }]} numberOfLines={1}>
        {title}
      </Text>
    </Animated.View>
  );
}

/**
 * Même raccord de bannière que le profil PC : la photo n'est jamais teintée,
 * elle se fond seulement par alpha sur le thème et arrive avec lui.
 */
export function ProfileBannerImage({ uri, themed }: { uri: string; themed: boolean }) {
  if (!themed) {
    return <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />;
  }
  return <ThemedProfileBannerImage uri={uri} />;
}

function ThemedProfileBannerImage({ uri }: { uri: string }) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.timing(value, {
      toValue: 1,
      duration: 900,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [uri, value]);

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        {
          opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
          transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [1.035, 1] }) }],
        },
      ]}
    >
      <MaskedView
        style={StyleSheet.absoluteFill}
        maskElement={
          <LinearGradient
            colors={['transparent', '#000', '#000', 'transparent']}
            locations={[0, 0.07, 0.84, 1]}
            style={StyleSheet.absoluteFill}
          />
        }
      >
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      </MaskedView>
    </Animated.View>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   Décorations d'avatar — toutes animées en continu.
   Chaque motif vit AUTOUR du disque de l'avatar, jamais devant le visage.
   Tout est piloté par `useNativeDriver` (rotation, opacité, échelle) : les
   boucles tournent sur le thread UI et ne coûtent rien au scroll.
   ════════════════════════════════════════════════════════════════════════ */

/**
 * Marge du canvas autour de l'avatar, proportionnelle à sa taille. Elle fixe
 * l'épaisseur de la bande visible d'Aurore (l'avatar recouvre le centre) et
 * la place que la parure prend sous la photo — au-delà, elle déborde sur le
 * nom et le pseudo, qu'elle recouvre puisqu'elle est au-dessus d'eux.
 */
const PAD_RATIO = 0.16;

/**
 * Écart entre le bord de la photo et les motifs posés autour. Serré : au
 * delà, les motifs descendent sur le nom et le pseudo, qu'ils recouvrent
 * puisque la parure est rendue au-dessus du bloc texte.
 */
const ORBIT_GAP = 5;

const STAR_PATH = 'M12 0c1 7 4.9 10.9 12 12-7.1 1.1-11 5-12 12-1-7-4.9-10.9-12-12C7.1 10.9 11 7 12 0Z';
const PETAL_PATH = 'M12 1c6.4 5.2 8.4 12.2 0 22C3.6 13.2 5.6 6.2 12 1Z';
const FLAME_PATH = 'M12 0c2.4 5.6 8.6 7.4 6.9 14.2C17.9 20 14.4 24 12 24s-5.9-4-6.9-9.8C3.4 7.4 9.6 5.6 12 0Z';
const CROWN_PATH = 'M2.6 20.4 3.4 5.6l6 5.4L12 1.6l2.6 9.4 6-5.4.8 14.8Z';

/**
 * Entrée d'un habillage premium : fondu + glissement, joué une seule fois au
 * montage. Les écrans ne montent ces calques qu'une fois la personnalisation
 * connue, donc « monté » = « arrivé ».
 */
function useEntrance(duration: number, delay = 0, rise = 18) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.timing(value, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [duration, delay, value]);
  return {
    opacity: value,
    transform: [
      { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [-rise, 0] }) },
      { scaleY: value.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
    ],
  };
}

/** Même arrivée, mais en échelle : pour la parure, qui se pose sur l'avatar. */
function useEntranceScale(duration: number, delay = 0) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.timing(value, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [duration, delay, value]);
  return {
    opacity: value,
    transform: [
      {
        scale: value.interpolate({
          inputRange: [0, 0.62, 1],
          outputRange: [0.9, 1.035, 1],
        }),
      },
    ],
  };
}

/**
 * Nombre de tours parcourus par UNE itération de boucle.
 * `Animated.loop` repasse par le JS entre deux itérations pour remettre la
 * valeur à zéro, et ce reset se voit comme un à-coup — la parure « se
 * téléporte » en fin de cycle. En enchaînant plusieurs tours par itération
 * l'à-coup devient rare, et comme il tombe sur un multiple exact de 360° il
 * ne se voit plus du tout.
 */
const TURNS = 12;

/** Boucle linéaire de rotation. */
function useLoop(duration: number, delay = 0) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(value, {
        toValue: 1,
        duration: duration * TURNS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    const timer = setTimeout(() => anim.start(), delay);
    return () => {
      clearTimeout(timer);
      anim.stop();
    };
  }, [duration, delay, value]);
  return value;
}

/**
 * Sinusoïde échantillonnée : c'est l'interpolation qui fait l'aller-retour,
 * pas une séquence de deux timings. La valeur pilote reste monotone, donc
 * l'itération se referme exactement sur son point de départ — aucune
 * reprise visible, contrairement à un `Animated.sequence` bouclé.
 */
const PING_PONG = {
  inputRange: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1],
  outputRange: [0, 0.146, 0.5, 0.854, 1, 0.854, 0.5, 0.146, 0],
};

/** Aller-retour 0 → 1 → 0 (respiration, scintillement, flicker). */
function usePingPong(duration: number, delay = 0) {
  const driver = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(driver, {
        toValue: 1,
        duration: duration * 2,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    const timer = setTimeout(() => anim.start(), delay);
    return () => {
      clearTimeout(timer);
      anim.stop();
    };
  }, [duration, delay, driver]);
  return driver.interpolate(PING_PONG);
}

function spinStyle(value: Animated.Value, reverse = false) {
  const full = `${360 * TURNS}deg`;
  return {
    transform: [
      {
        rotate: value.interpolate({
          inputRange: [0, 1],
          outputRange: reverse ? [full, '0deg'] : ['0deg', full],
        }),
      },
    ],
  };
}

/** Position sur le cercle : 0° = haut, sens horaire, comme en CSS. */
function polar(center: number, angleDeg: number, radius: number, size: number) {
  const angle = ((angleDeg - 90) * Math.PI) / 180;
  return {
    position: 'absolute' as const,
    left: center + radius * Math.cos(angle) - size / 2,
    top: center + radius * Math.sin(angle) - size / 2,
    width: size,
    height: size,
  };
}

type DecoProps = { outer: number; size: number; accent: string; secondary: string };

/**
 * Halo qui respire — socle commun de plusieurs parures. Volontairement fin :
 * l'avatar porte déjà sa bordure, un halo épais faisait un deuxième contour
 * massif autour de la photo.
 */
function Halo({ outer, size, accent, strength = 1 }: Omit<DecoProps, 'secondary'> & { strength?: number }) {
  const pulse = usePingPong(1800);
  const inset = (outer - size) / 2 - 3;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          top: inset,
          left: inset,
          right: inset,
          bottom: inset,
          borderRadius: outer / 2,
          borderWidth: 2 * strength,
          borderColor: withAlpha(accent, 0.2 * strength),
        },
        {
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.85] }),
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] }) }],
        },
      ]}
    />
  );
}

/**
 * Aurore : deux comètes tournent en sens contraire derrière l'avatar, qui
 * n'en laisse voir que la couronne extérieure. Les disques sont calés sur la
 * photo + quelques pixels, PAS sur le canvas : c'est la seule façon d'avoir
 * un liseré qui tourne plutôt qu'un bandeau large autour de la tête.
 */
function AuroraDeco({ size, outer, accent, secondary }: DecoProps) {
  const fast = useLoop(4600);
  const slow = useLoop(9500);

  const disc = (diameter: number) => ({
    position: 'absolute' as const,
    top: (outer - diameter) / 2,
    left: (outer - diameter) / 2,
    width: diameter,
    height: diameter,
    borderRadius: diameter / 2,
    overflow: 'hidden' as const,
  });

  return (
    <>
      <Animated.View style={[disc(size + 11), spinStyle(slow, true), { opacity: 0.55 }]}>
        <LinearGradient
          colors={['transparent', 'transparent', withAlpha(secondary, 0.9), 'transparent']}
          locations={[0, 0.42, 0.78, 1]}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View style={[disc(size + 18), spinStyle(fast)]}>
        <LinearGradient
          colors={['transparent', 'transparent', withAlpha(secondary, 0.75), accent, 'transparent']}
          locations={[0, 0.3, 0.62, 0.9, 1]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </>
  );
}

/** Couronne : posée sur le haut de l'anneau, elle oscille et scintille. */
function CrownDeco({ outer, size, accent, secondary }: DecoProps) {
  const bob = usePingPong(1900);
  const crown = Math.max(26, size * 0.46);
  const pad = (outer - size) / 2;

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            left: (outer - crown) / 2,
            top: pad - crown * 0.72,
            width: crown,
            height: crown,
          },
          {
            transform: [
              { translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) },
              { rotate: bob.interpolate({ inputRange: [0, 1], outputRange: ['-4deg', '4deg'] }) },
            ],
          },
        ]}
      >
        <Svg viewBox="0 0 24 24" width="100%" height="100%">
          <Defs>
            <SvgGradient id="crown" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={accent} />
              <Stop offset="1" stopColor={secondary} />
            </SvgGradient>
          </Defs>
          <Path d={CROWN_PATH} fill="url(#crown)" />
          <Circle cx="12" cy="8" r="1.5" fill="#fff" opacity={0.85} />
          <Circle cx="4.6" cy="14" r="1" fill="#fff" opacity={0.6} />
          <Circle cx="19.4" cy="14" r="1" fill="#fff" opacity={0.6} />
        </Svg>
      </Animated.View>

      {[
        { angle: -38, radius: outer * 0.44, size: 11, delay: 0 },
        { angle: 34, radius: outer * 0.46, size: 9, delay: 620 },
        { angle: 62, radius: outer * 0.42, size: 8, delay: 1240 },
      ].map((spark) => (
        <Twinkle
          key={`${spark.angle}`}
          style={polar(outer / 2, spark.angle, spark.radius, spark.size)}
          delay={spark.delay}
          color={secondary}
          path={STAR_PATH}
        />
      ))}
    </>
  );
}

/** Petit motif qui apparaît/disparaît sur place. */
function Twinkle({
  style,
  delay,
  color,
  path,
}: {
  style: ViewStyle;
  delay: number;
  color: string;
  path: string;
}) {
  const pulse = usePingPong(1100, delay);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        style,
        {
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.15, 1] }),
          transform: [
            { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
            { rotate: pulse.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] }) },
          ],
        },
      ]}
    >
      <Svg viewBox="0 0 24 24" width="100%" height="100%">
        <Path d={path} fill={color} />
      </Svg>
    </Animated.View>
  );
}

/** Étoiles : deux orbites contrarotatives, chaque étoile scintille. */
function StarsDeco({ size, outer, accent, secondary }: DecoProps) {
  const outerSpin = useLoop(11000);
  const innerSpin = useLoop(17000);
  const center = outer / 2;
  // Rayon calé sur le bord de la PHOTO, pas sur le canvas : les motifs
  // frôlent l'avatar au lieu de dessiner un large anneau autour de lui.
  const radius = size / 2 + ORBIT_GAP;

  return (
    <>
      <Animated.View style={[styles.center, { width: outer, height: outer }, spinStyle(outerSpin)]}>
        {[
          { angle: 0, r: radius, s: 14, d: 0, c: accent },
          { angle: 140, r: radius * 1.1, s: 11, d: 520, c: secondary },
          { angle: 250, r: radius * 0.94, s: 12, d: 1040, c: accent },
        ].map((star) => (
          <Twinkle
            key={star.angle}
            style={polar(center, star.angle, star.r, star.s)}
            delay={star.d}
            color={star.c}
            path={STAR_PATH}
          />
        ))}
      </Animated.View>
      <Animated.View style={[styles.center, { width: outer, height: outer }, spinStyle(innerSpin, true)]}>
        {[
          { angle: 70, r: radius * 1.16, s: 9, d: 260, c: secondary },
          { angle: 205, r: radius * 1.2, s: 8, d: 780, c: accent },
        ].map((star) => (
          <Twinkle
            key={star.angle}
            style={polar(center, star.angle, star.r, star.s)}
            delay={star.d}
            color={star.c}
            path={STAR_PATH}
          />
        ))}
      </Animated.View>
    </>
  );
}

/** Pétales : six pétales en orbite lente, orientés vers l'extérieur. */
function PetalsDeco({ size, outer, accent, secondary }: DecoProps) {
  const orbit = useLoop(19000);
  const breathe = usePingPong(1600);
  const center = outer / 2;
  const radius = size / 2 + ORBIT_GAP;

  return (
    <Animated.View style={[styles.center, { width: outer, height: outer }, spinStyle(orbit)]}>
      {[0, 60, 120, 180, 240, 300].map((angle, index) => (
        <Animated.View
          key={angle}
          pointerEvents="none"
          style={[
            polar(center, angle, radius, 16),
            {
              opacity: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.62, 1] }),
              transform: [
                { rotate: `${angle}deg` },
                { scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1.08] }) },
              ],
            },
          ]}
        >
          <Svg viewBox="0 0 24 24" width="100%" height="100%">
            <Path d={PETAL_PATH} fill={index % 2 === 0 ? accent : secondary} />
          </Svg>
        </Animated.View>
      ))}
    </Animated.View>
  );
}

/** Circuit : anneaux pointillés contrarotatifs + nœuds qui pulsent. */
function CircuitRings({ outer, accent, secondary }: DecoProps) {
  const ring = useLoop(13000);
  const inner = useLoop(8000);

  return (
    <>
      <Animated.View style={[styles.center, { width: outer, height: outer }, spinStyle(ring)]}>
        <Svg viewBox="0 0 100 100" width="100%" height="100%">
          <Circle cx="50" cy="50" r="47" fill="none" stroke={withAlpha(accent, 0.2)} strokeWidth={2} />
          <Circle
            cx="50"
            cy="50"
            r="47"
            fill="none"
            stroke={accent}
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeDasharray="13 11"
          />
        </Svg>
      </Animated.View>
      <Animated.View style={[styles.center, { width: outer, height: outer }, spinStyle(inner, true)]}>
        <Svg viewBox="0 0 100 100" width="100%" height="100%">
          <Circle
            cx="50"
            cy="50"
            r="41"
            fill="none"
            stroke={secondary}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeDasharray="3 9"
          />
        </Svg>
      </Animated.View>
    </>
  );
}

function CircuitNodes({ size, outer, accent }: DecoProps) {
  const center = outer / 2;
  const radius = size / 2 + ORBIT_GAP;
  return (
    <>
      {[0, 90, 180, 270].map((angle, index) => (
        <PulsingDot
          key={angle}
          style={polar(center, angle, radius, 7)}
          delay={index * 420}
          color={accent}
        />
      ))}
    </>
  );
}

function PulsingDot({ style, delay, color }: { style: ViewStyle; delay: number; color: string }) {
  const pulse = usePingPong(1000, delay);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        style,
        {
          borderRadius: 6,
          backgroundColor: color,
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.3] }) }],
        },
      ]}
    />
  );
}

/** Flammes : langues ancrées sur l'arc bas, chacune son propre flicker. */
function FlamesDeco({ size, outer, accent, secondary }: DecoProps) {
  const center = outer / 2;
  // Les flammes lèchent le bord de la photo : elles doivent le toucher.
  const radius = size / 2 + 3;

  return (
    <>
      {[126, 148, 170, 192, 214, 236].map((angle, index) => (
        <Flame
          key={angle}
          style={polar(center, angle, radius, index % 2 === 0 ? 23 : 17)}
          delay={index * 170}
          color={index % 2 === 0 ? accent : secondary}
        />
      ))}
    </>
  );
}

function Flame({ style, delay, color }: { style: ViewStyle; delay: number; color: string }) {
  const flicker = usePingPong(560, delay);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        style,
        {
          opacity: flicker.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }),
          transform: [
            { scaleY: flicker.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1.18] }) },
            { scaleX: flicker.interpolate({ inputRange: [0, 1], outputRange: [1.04, 0.92] }) },
          ],
        },
      ]}
    >
      <Svg viewBox="0 0 24 24" width="100%" height="100%">
        <Path d={FLAME_PATH} fill={color} />
      </Svg>
    </Animated.View>
  );
}

/**
 * Calque DERRIÈRE l'avatar : anneaux, comètes, halo. En React Native l'ordre
 * de rendu fait la profondeur — à rendre AVANT l'avatar, qui recouvre alors
 * le centre et ne laisse voir que la couronne extérieure du motif.
 */
export function AvatarDecorationLayer({
  customization,
  size,
  style,
}: {
  customization?: ProfileCustomization | null;
  /** Diamètre du bloc avatar, bordure comprise. */
  size: number;
  style?: StyleProp<ViewStyle>;
}) {
  const decoration: AvatarDecoration = customization?.avatar_decoration || 'none';
  const [accent, secondary] = decorationColors(customization);
  const outer = useMemo(() => Math.round(size * (1 + PAD_RATIO * 2)), [size]);
  const entrance = useEntranceScale(820);

  if (decoration === 'none') return null;
  const props: DecoProps = { outer, size, accent, secondary };
  const offset = -(outer - size) / 2;

  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', top: offset, left: offset, width: outer, height: outer }, entrance, style]}
    >
      {decoration === 'ring' && <AuroraDeco {...props} />}
      {decoration === 'circuit' && <CircuitRings {...props} />}
      {(decoration === 'ring' || decoration === 'crown' || decoration === 'stars') && (
        <Halo outer={outer} size={size} accent={accent} />
      )}
      {decoration === 'flames' && <Halo outer={outer} size={size} accent={accent} strength={1.4} />}
      {decoration === 'petals' && (
        <View
          style={{
            position: 'absolute',
            top: (outer - size) / 2 - 4,
            left: (outer - size) / 2 - 4,
            right: (outer - size) / 2 - 4,
            bottom: (outer - size) / 2 - 4,
            borderRadius: outer / 2,
            borderWidth: 2,
            borderColor: withAlpha(secondary, 0.32),
          }}
        />
      )}
    </Animated.View>
  );
}

/**
 * Calque DEVANT l'avatar : tout ce qui doit passer au-dessus (couronne,
 * étoiles en orbite, flammes). Chaque motif reste hors du disque du visage.
 */
export function AvatarDecorationOrnament({
  customization,
  size,
  style,
}: {
  customization?: ProfileCustomization | null;
  size: number;
  style?: StyleProp<ViewStyle>;
}) {
  const decoration: AvatarDecoration = customization?.avatar_decoration || 'none';
  const [accent, secondary] = decorationColors(customization);
  const outer = useMemo(() => Math.round(size * (1 + PAD_RATIO * 2)), [size]);
  const entrance = useEntranceScale(760, 140);

  if (decoration === 'none' || decoration === 'ring') return null;
  const props: DecoProps = { outer, size, accent, secondary };
  const offset = -(outer - size) / 2;

  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', top: offset, left: offset, width: outer, height: outer }, entrance, style]}
    >
      {decoration === 'crown' && <CrownDeco {...props} />}
      {decoration === 'stars' && <StarsDeco {...props} />}
      {decoration === 'petals' && <PetalsDeco {...props} />}
      {decoration === 'circuit' && <CircuitNodes {...props} />}
      {decoration === 'flames' && <FlamesDeco {...props} />}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { position: 'absolute', top: 0, left: 0 },
  themeBloom: {
    position: 'absolute',
    top: '-12%',
    left: '-18%',
    width: '136%',
    height: '52%',
  },

  /** `flex-start` : le bloc doit se serrer sur le texte, pas sur la colonne. */
  nameWrap: { alignSelf: 'flex-start', position: 'relative' },
  /** Seule l'alpha du masque compte — la couleur est arbitraire mais opaque. */
  nameMask: { color: '#000', backgroundColor: 'transparent' },
  nameGhost: { opacity: 0 },
  nameWash: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: -SWEEP_SPAN,
    width: SWEEP_SPAN * 4,
  },
  shimmerBand: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: SWEEP_SPAN * 0.6,
  },
  nameGlowLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 14,
  },

  titleChip: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: withAlpha(colors.surface, 0.7),
    overflow: 'hidden',
  },
  titleSweep: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 130 },
  titleText: { fontSize: 11.5, letterSpacing: 0.6, fontFamily: fonts.bold },
});
