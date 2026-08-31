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
  Stop,
} from 'react-native-svg';
import { colors, fonts, isDarkTheme, towardBlack, towardWhite, withAlpha } from '../theme';
import AvatarMaterial, { type MaterialCharacter } from './profile/AvatarMaterial';
import ThemeMaterial from './profile/ThemeMaterial';
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
      {/* Toute la matière du thème tient dans une seule couche : « Dégradé »,
          « Halo » et « Nébuleuse » ne diffèrent plus que par la géométrie de
          leurs foyers et leur mouvement. Voir `profile/ThemeMaterial`. */}
      <ThemeMaterial
        kind={theme === 'glow' || theme === 'mesh' ? theme : 'gradient'}
        accent={accent}
        secondary={secondary}
        factor={factor}
        bannerHeight={bannerHeight}
        height={total}
      />
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
  /**
   * Part de la couleur gardée au cœur de la particule (1 = intacte, 0 = blanc).
   *
   * C'est le même virage par le blanc que la parure, et à cette échelle il se
   * dose comme la parure — franc. Une particule de 6 px en couleur pleine est
   * un point de peinture ; la même avec un cœur presque blanc est une source
   * de lumière. C'est toute la différence entre du confetti et une braise.
   *
   * (À l'opposé exact du fond de page, où le même réglage poussé aussi loin
   * délave tout — voir `ThemeMaterial`. Même intention, dose inverse, et c'est
   * l'échelle qui décide.)
   */
  keep: number;
  /** Opacité du bloom déposé autour. Ce qui brûle rayonne plus que ce qui flotte. */
  bloom: number;
};

const AMBIENCE: Record<Exclude<ProfileEffect, 'none'>, AmbienceSpec> = {
  sparkles: { rise: true, min: 7, max: 14, sway: 10, duration: [5200, 9000], keep: 0.3, bloom: 0.36 },
  embers: { rise: true, min: 3, max: 7, sway: 14, duration: [4200, 7600], keep: 0.42, bloom: 0.5 },
  bubbles: { rise: true, min: 9, max: 20, sway: 18, duration: [6800, 12000], keep: 0.62, bloom: 0.16 },
  snow: { rise: false, min: 3, max: 7, sway: 16, duration: [7200, 13000], keep: 0.16, bloom: 0.24 },
};

/**
 * Diamètre du canvas d'une particule, en multiples de sa taille.
 *
 * Le bloom a besoin de place autour du cœur : sans marge, la lumière déposée
 * serait coupée au ras du grain et on retomberait sur un point découpé au
 * cutter — le défaut que le bloom existe précisément pour corriger.
 */
const PARTICLE_CANVAS = 2.6;

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
  bloomId,
}: {
  effect: Exclude<ProfileEffect, 'none'>;
  spec: AmbienceSpec;
  index: number;
  height: number;
  color: string;
  /** Identifiant du dégradé de bloom — global au document, donc unique par
      particule ET par champ (deux profils peuvent être montés ensemble). */
  bloomId: string;
}) {
  const rx = scatter(index, 1);
  const rs = scatter(index, 2);
  const rd = scatter(index, 3);
  const size = spec.min + rs * (spec.max - spec.min);
  const canvas = size * PARTICLE_CANVAS;
  const duration = spec.duration[0] + rd * (spec.duration[1] - spec.duration[0]);
  const travel = height * (0.72 + scatter(index, 4) * 0.28);
  const drift = useDrift(duration, Math.round(rd * duration));
  const sway = spec.sway * (rx > 0.5 ? 1 : -1);

  // Le cœur : la couleur virée vers le blanc, dosée par l'ambiance.
  const core = towardWhite(color, spec.keep);

  const shape =
    effect === 'sparkles' ? (
      <Svg viewBox="0 0 24 24" width="100%" height="100%">
        <Path d={STAR_PATH} fill={core} />
      </Svg>
    ) : effect === 'bubbles' ? (
      <View
        style={{
          width: '100%',
          height: '100%',
          borderRadius: size / 2,
          borderWidth: 1.5,
          borderColor: withAlpha(core, 0.8),
        }}
      >
        {/* Le point spéculaire. Une bulle sans reflet n'est qu'un rond vide ;
            c'est ce point unique, décentré vers la source de lumière, qui la
            fait lire comme du verre. */}
        <View
          style={{
            position: 'absolute',
            top: size * 0.16,
            left: size * 0.2,
            width: Math.max(1.5, size * 0.2),
            height: Math.max(1.5, size * 0.2),
            borderRadius: size,
            backgroundColor: withAlpha('#FFFFFF', 0.9),
          }}
        />
      </View>
    ) : (
      <View
        style={{
          width: '100%',
          height: '100%',
          borderRadius: size / 2,
          backgroundColor: core,
        }}
      />
    );

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        // 86 % et non 96 % : depuis que le grain porte un bloom, sa boîte fait
        // 2,6 fois sa taille. Collée au bord, elle se ferait trancher par
        // l'`overflow: hidden` du champ — et un bloom coupé, c'est une arête
        // franche en pleine lueur. On garde la marge nécessaire.
        left: `${rx * 86}%`,
        // Point de départ : en bas pour ce qui monte, au-dessus du cadre pour
        // ce qui tombe.
        top: spec.rise ? travel : -canvas,
        width: canvas,
        height: canvas,
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
      {/* Le bloom : la lumière déposée autour du grain. C'est lui qui fait la
          différence entre une particule POSÉE sur le fond et une particule qui
          éclaire le fond. Il ne porte jamais le cœur — sinon on retombe sur
          une tache floue au lieu d'un grain net dans une lueur. */}
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgRadialGradient id={bloomId} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={spec.bloom} />
            <Stop offset="0.45" stopColor={color} stopOpacity={spec.bloom * 0.42} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </SvgRadialGradient>
        </Defs>
        <Circle cx={canvas / 2} cy={canvas / 2} r={canvas / 2} fill={`url(#${bloomId})`} />
      </Svg>

      {/* Le grain lui-même, centré dans son canvas. */}
      <View
        style={{
          position: 'absolute',
          top: (canvas - size) / 2,
          left: (canvas - size) / 2,
          width: size,
          height: size,
        }}
      >
        {shape}
      </View>
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
  // Sel par champ : les identifiants de dégradé SVG sont globaux au document,
  // et deux ambiances peuvent être montées ensemble (l'aperçu de l'écran de
  // personnalisation par-dessus le profil). Sans lui, la seconde repeint la
  // première.
  const salt = useMemo(() => Math.random().toString(36).slice(2, 8), []);

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
          bloomId={`amb-${salt}-${index}`}
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
 * Nombre de périodes du motif sous le nom. La nappe fait `SWEEP_SPAN * 4` de
 * large, donc quatre périodes font une période par `SWEEP_SPAN` — soit
 * exactement la distance dont la nappe est translatée.
 */
const NAME_WASH_PERIODS = 4;

/**
 * Le motif de couleur du nom.
 *
 * Une période vaut `secondary → accent → presque-blanc → accent` : la recette
 * du corps irisé de la parure. Deux teintes saturées qui alternent restent une
 * alternance de couleurs ; c'est le POINT DE LUMIÈRE au sommet qui fait lire
 * du métal plutôt que du plastique.
 *
 * Le compte d'arrêts n'est pas décoratif : 4 par période × 4 périodes + 1
 * arrêt de fermeture = 17, donc 16 intervalles répartis sur 4 périodes. La
 * période retombe pile sur `SWEEP_SPAN`. Ajouter ou retirer un arrêt sans
 * refaire ce calcul fait sauter le motif à chaque rebouclage de la boucle.
 */
function nameWashColors(accent: string, secondary: string): [string, string, ...string[]] {
  const light = towardWhite(accent, 0.42);
  const out: string[] = [];
  for (let i = 0; i < NAME_WASH_PERIODS; i += 1) {
    out.push(secondary, accent, light, accent);
  }
  // Fermeture : le dernier arrêt doit répéter le premier, sinon la dernière
  // période est tronquée et la couture se voit.
  out.push(secondary);
  return out as [string, string, ...string[]];
}

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
 * Le plafond a été serré à 22 px après un premier essai à 28/16/7 : les ombres
 * de lettres voisines se recouvraient et saturaient, et au lieu d'un tube on
 * obtenait un aplat remplissant toute la boîte du texte.
 *
 * **Le diagnostic était juste, le remède non.** Le recouvrement ne vient pas
 * du rayon, il vient de l'absence d'air entre les lettres — c'est
 * `neonSpacing` qui le corrige. Serrer le rayon corrigeait le symptôme en
 * supprimant la lueur, c'est-à-dire en supprimant le néon. Une fois les
 * lettres espacées, la couche atmosphérique peut de nouveau être large, ce
 * qu'un néon exige.
 *
 * Le plafond reste nécessaire pour les tailles « Géant » (×2) : iOS restitue
 * un rayon très large comme un nuage diffus qui déborde de l'écran plutôt que
 * comme un tube.
 */
/**
 * La pile du néon, de la plus large à la plus serrée.
 *
 * Recette classique du néon en CSS, transposée : **un cœur blanc-chaud en flou
 * très serré, la couleur en flou moyen, la couleur en flou large, et une
 * TEINTE DIFFÉRENTE sur la couche atmosphérique.** Cette dernière est ce qui
 * imite l'aberration chromatique d'un vrai tube — un tube ne rayonne pas
 * exactement la même couleur au centre et en périphérie. Trois couches de la
 * même teinte, comme ici avant, donnent une brume plate : il n'y a rien à
 * distinguer, donc rien qui fasse relief.
 *
 * La lueur s'éteint par l'OPACITÉ (`min`/`max`), jamais en s'éclaircissant.
 * Une rampe continue du saturé vers le blanc a été essayée et annulée : le gaz
 * d'un tube s'allume en couleur pure dès la paroi du verre, et c'est la MARCHE
 * entre le filament clair et la lueur saturée qui fait tout l'effet.
 */
type GlowHue = 'edge' | 'core' | 'hot';

const NAME_GLOW_HALO_RATIOS: ReadonlyArray<{
  ratio: number;
  min: number;
  max: number;
  hue: GlowHue;
}> = [
  { ratio: 1.15, min: 0.16, max: 0.3, hue: 'edge' },
  { ratio: 0.62, min: 0.3, max: 0.48, hue: 'core' },
  { ratio: 0.3, min: 0.52, max: 0.72, hue: 'core' },
  { ratio: 0.12, min: 0.7, max: 0.92, hue: 'hot' },
];

/**
 * Part de couleur gardée par le cœur du glyphe — et elle dépend du THÈME.
 *
 * En sombre : le cœur est blanc-chaud (0,22), la lueur colorée l'entoure, on
 * a un vrai tube.
 *
 * En clair : **un cœur blanc sur une page blanche n'est rien.** Le nom
 * disparaîtrait et il ne resterait que la brume — c'est le « nom délavé »
 * qu'une session précédente avait constaté puis corrigé en remontant le cœur,
 * sans voir que le problème n'était pas la valeur mais le thème. Le cœur
 * reste donc saturé (0,9) et c'est la lueur qui fait le travail autour.
 */
const nameGlowCoreKeep = () => (isDarkTheme() ? 0.22 : 0.9);

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
const NAME_GLOW_MAX_RADIUS = 36;

/**
 * Marge ouverte autour du nom pour que sa lueur ne soit pas rognée.
 *
 * Calée sur le rayon le plus large réellement produit (~24 px sur un nom de
 * 21), avec un peu de rab. Voir `styles.nameWrap` pour le mécanisme.
 */
const NAME_GLOW_BLEED = 28;

function nameGlowHaloFor(style?: StyleProp<TextStyle>) {
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  const fontSize = typeof flat?.fontSize === 'number' ? flat.fontSize : DEFAULT_NAME_FONT_SIZE;
  return NAME_GLOW_HALO_RATIOS.map((layer) => ({
    radius: Math.min(layer.ratio * fontSize, NAME_GLOW_MAX_RADIUS * layer.ratio / NAME_GLOW_HALO_RATIOS[0].ratio),
    min: layer.min,
    max: layer.max,
    hue: layer.hue,
  }));
}

/**
 * Halo empilé, partagé par « Néon » et « Certifié » : une seule recette, donc
 * les deux ne peuvent pas diverger. Seule la couleur change — l'accent du
 * profil pour l'un, la palette du badge pour l'autre.
 */
function NameHalo({
  color,
  edge,
  name,
  style,
  extraStyle,
  numberOfLines,
  pulse,
}: {
  color: string;
  /** Teinte de la couche atmosphérique. Différente de `color`, c'est elle qui
      donne la profondeur ; à défaut on retombe sur une brume plate. */
  edge?: string;
  name: string;
  style?: StyleProp<TextStyle>;
  /** Appliqué APRÈS `style`, et identiquement au glyphe de cœur : la pile est
      en absolu, le moindre écart de crénage la décalerait du texte. */
  extraStyle?: StyleProp<TextStyle>;
  numberOfLines: number;
  pulse: Animated.AnimatedInterpolation<number>;
}) {
  // Le filament. En clair, un blanc-chaud sur une page blanche ne rayonne
  // pas : on garde alors bien plus de couleur pour qu'il reste quelque chose.
  const hot = towardWhite(color, isDarkTheme() ? 0.25 : 0.6);
  /**
   * La teinte de la couche atmosphérique.
   *
   * `edge` vaut la couleur SECONDAIRE du profil — et `decorationColors`
   * retombe sur la principale quand aucune secondaire n'est choisie, ce qui
   * est le cas par défaut de tous les comptes. Les trois couches recevaient
   * donc la même teinte, et ce fichier dit lui-même deux paragraphes plus
   * haut que « trois couches de la même teinte donnent une brume plate ».
   * C'est exactement ce qu'on voyait à l'écran : du rose sur du rose.
   *
   * À défaut de seconde couleur, on en fabrique une en assombrissant : c'est
   * l'ÉCART entre le cœur clair et la périphérie profonde qui fait le tube,
   * pas la teinte elle-même.
   */
  const atmosphere = edge && edge !== color ? edge : towardBlack(color, 0.62);
  const hueOf = (hue: GlowHue) =>
    hue === 'hot' ? hot : hue === 'edge' ? atmosphere : color;

  return (
    <>
      {nameGlowHaloFor(style).map((layer) => (
        <Animated.Text
          key={layer.radius}
          numberOfLines={numberOfLines}
          style={[
            style,
            styles.nameGlowLayer,
            extraStyle,
            {
              /**
               * Le corps du glyphe est TRANSPARENT : la couche ne peint que
               * son ombre.
               *
               * Il était peint en plein, sur l'idée qu'une ombre iOS dérive
               * de ce qui est dessiné et qu'un alpha 0 ne rayonnerait donc
               * pas. Les anciens presets (`NEON_PRESETS`, toujours dans le
               * dépôt) prouvent le contraire : ils tournent avec
               * `fill: 'rgba(0,0,0,0)'` depuis toujours.
               *
               * Ce que coûtait le plein : quatre corps de lettres opaques et
               * saturés empilés sous le cœur, donc un contour dur et plat au
               * ras des glyphes au lieu d'une lueur qui s'éteint. C'est ce
               * qui faisait lire « texte cerné de rose » plutôt que « tube ».
               */
              color: 'transparent',
              textShadowColor: hueOf(layer.hue),
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
          edge={secondary}
          name={name}
          style={style}
          extraStyle={styles.neonSpacing}
          numberOfLines={numberOfLines}
          pulse={pulse}
        />
        {/* Le cœur porte la teinte : laissé à la couleur de texte de l'écran,
            il restait blanc et l'accent ne se lisait que dans la brume — un
            nom délavé, pas un néon. Éclairci vers le blanc comme un vrai tube,
            mais assez saturé pour rester reconnaissable. */}
        <Text
          style={[style, styles.neonSpacing, { color: towardWhite(accent, nameGlowCoreKeep()) }]}
          numberOfLines={numberOfLines}
        >
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
          edge={certif.to}
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
            colors={nameWashColors(accent, secondary)}
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
        {/* Même correction que la nappe du nom : le liseré passait d'un accent
            à un secondaire à opacité égale, donc il traversait sans jamais
            briller. Il a maintenant un sommet — presque blanc, et plus opaque
            que ses flancs. C'est ce sommet qu'on lit comme un reflet qui
            parcourt la pastille, plutôt qu'une bande colorée qui glisse. */}
        <LinearGradient
          colors={[
            'transparent',
            withAlpha(accent, 0.22),
            withAlpha(towardWhite(accent, 0.4), 0.5),
            withAlpha(secondary, 0.22),
            'transparent',
          ]}
          locations={[0, 0.32, 0.5, 0.68, 1]}
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
 * Le mouvement propre à chaque parure.
 *
 * La couronne est « still » à dessein : ce qui doit paraître lourd et précieux
 * ne tourne pas vite. Le circuit et les flammes sont « turbulent » — corps et
 * reflet à contresens, la surface paraît instable. Le reste orbite.
 */
const MATERIAL_CHARACTER: Record<Exclude<AvatarDecoration, 'none'>, MaterialCharacter> = {
  ring: 'orbit',
  crown: 'still',
  petals: 'orbit',
  circuit: 'turbulent',
  flames: 'turbulent',
  stars: 'orbit',
};

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
      {/*
        La matière est COMMUNE aux six parures : c'est elle la signature, et
        c'est ce qui les empêche de ressembler à six thèmes de couleur sans
        rapport entre eux. Chaque parure ne se distingue que par la façon dont
        cette matière bouge, puis par ses motifs propres, posés au-dessus par
        `AvatarDecorationOrnament`.

        Elle remplace l'ancien empilement anneau coloré + halo + liseré : le
        bloom et l'occlusion de la matière font ce travail, en une seule couche
        au lieu de trois qui se marchaient dessus.
      */}
      <AvatarMaterial
        outer={outer}
        size={size}
        accent={accent}
        secondary={secondary}
        character={MATERIAL_CHARACTER[decoration]}
        weight={decoration === 'crown' ? 0.062 : 0.05}
      />
      {decoration === 'circuit' && <CircuitRings {...props} />}
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

  /**
   * `flex-start` : le bloc doit se serrer sur le texte, pas sur la colonne.
   *
   * Le couple `padding` / `margin` négatif donne à la lueur de la place pour
   * déborder SANS bouger le nom d'un pixel. C'est nécessaire parce qu'une
   * ombre de texte ne se comporte pas comme en CSS : `text-shadow` peint
   * librement hors de l'élément, alors qu'Android la rasterise dans les
   * bornes de la vue de texte et la coupe net au-delà. Sans marge, la lueur
   * la plus large — 24 px sur un nom de 21 — était tranchée en rectangle
   * autour du nom.
   *
   * Les deux valeurs doivent rester opposées : le padding ouvre le cadre, le
   * margin le remet en place. En changer une seule décale le pseudo.
   */
  nameWrap: {
    alignSelf: 'flex-start',
    position: 'relative',
    padding: NAME_GLOW_BLEED,
    margin: -NAME_GLOW_BLEED,
  },
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

  /**
   * L'air entre les lettres du néon.
   *
   * Sans lui, les lueurs de deux lettres voisines se recouvrent et saturent :
   * au lieu de tubes distincts on obtient un pâté qui remplit la boîte du
   * texte. C'est le défaut le plus visible du néon, et il ne se corrige pas en
   * baissant la lueur — baisser la lueur, c'est supprimer le néon. Il faut de
   * l'espace.
   *
   * Appliqué à la pile ET au glyphe de cœur, sinon les deux se décalent.
   */
  neonSpacing: { letterSpacing: 1.2 },

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
