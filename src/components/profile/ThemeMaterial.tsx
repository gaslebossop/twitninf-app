import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { isDarkTheme, towardWhite } from '../../theme';
import { isReduceMotionEnabled } from '../../hooks/useReduceMotion';
import {
  BUDGET,
  FALLOFF,
  LAYER,
  SOURCE_GAINS,
  SOURCE_RADII,
  TONE,
  type ThemeMaterialKind,
} from './themeBudget';

/**
 * La matière des thèmes de profil — le pendant, à l'échelle de la page, de
 * `AvatarMaterial`.
 *
 * ── Le problème qu'on résout ─────────────────────────────────────────────
 * Un thème raté, c'est un dégradé POSÉ : deux teintes qui se croisent, la même
 * image à la seconde zéro et à la seconde trente. L'œil lit « on a colorié le
 * fond ». Ce qui manque n'est pas de la couleur, c'est la lumière — et une
 * lumière, ça vient de quelque part, ça se déplace, et ça blanchit en son
 * cœur.
 *
 * Mêmes cinq couches que la parure, transposées d'un anneau à un champ :
 *
 *  1. **L'assise** — la masse colorée qui descend et meurt. Elle ne bouge pas :
 *     c'est elle qui garantit que le thème HABILLE toute la page, jusque sous
 *     les onglets, au lieu de se limiter à une bande décorative en haut.
 *  2. **Les sources** — les foyers de lumière. Chacun passe par du
 *     presque-blanc en son centre (`towardWhite`) avant de se refermer sur sa
 *     couleur. **C'est ce virage par le blanc qui sépare la lumière de la
 *     peinture**, exactement comme il sépare le métal du plastique sur la
 *     parure. Un radial qui va de l'accent au transparent restera un aplat.
 *  3. **Le spéculaire** — une nappe claire, large et molle, qui traverse
 *     lentement. C'est le seul signal qui dit que la surface renvoie la
 *     lumière plutôt que de l'absorber.
 *  4. **La source FIXE** — un foyer serré en haut au centre, qui ne bouge
 *     jamais. Si tout dérive ensemble, on ne voit qu'un fond qui glisse ; la
 *     profondeur naît du contraste entre ce qui dérive et ce qui reste
 *     planté. Même raisonnement que le rim light de la parure.
 *  5. **L'occlusion** — un plancher sombre là où le champ s'éteint, pour que
 *     la masse repose sur la page au lieu de s'évaporer. Discrète en thème
 *     sombre (le fond est déjà `#0A0A0A`, il reste peu de marge), franche en
 *     thème clair. Assumé : c'est la couche qui rend le moins ici.
 *
 * ── Ce qui distingue les trois thèmes ────────────────────────────────────
 * La matière est commune, le catalogue est gelé. Un thème n'est donc que
 * deux choses : **la géométrie de ses foyers** (un large / un serré / trois
 * qui s'opposent) et **la façon dont ils bougent**. « Dégradé », « Halo » et
 * « Nébuleuse » restent honnêtes sous ces noms.
 *
 * ── Pourquoi pas de shader ───────────────────────────────────────────────
 * Un vrai bruit de nuage et un bloom gaussien demanderaient Skia, qui ferait
 * sortir l'app d'Expo Go. Tout tient donc en dégradés `react-native-svg` /
 * `expo-linear-gradient` déplacés par Reanimated : le mouvement vient de la
 * TRANSFORMATION des calques, jamais d'un calcul par pixel — donc tout reste
 * sur le thread UI et ne coûte rien au défilement.
 */

/** Caractère du mouvement. La matière est commune, le mouvement fait le thème. */
export type ThemeCharacter =
  /** Dérive lente et solidaire. Le champ respire, il ne s'agite pas. */
  | 'drift'
  /** Presque pas de dérive, beaucoup de respiration : un foyer qui pulse. */
  | 'halo'
  /** Foyers à contresens : le champ se brasse au lieu de défiler. */
  | 'turbulent';

export type { ThemeMaterialKind };

/**
 * Un foyer de lumière. `cx/cy/rx/ry` sont exprimés dans le repère 0–100 du
 * `viewBox`, étiré sans conservation du ratio : le champ est bien plus haut
 * que large, donc les rayons horizontaux et verticaux ne se comparent pas.
 */
type LightSource = {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  color: string;
  /** Opacité du cœur avant application de l'intensité. */
  gain: number;
  /** Sens de dérive : `0` ne dérive pas, il ne fait que respirer. */
  lane: -1 | 0 | 1;
  ms: number;
  scaleTo: number;
};

/**
 * Débordement des calques qui dérivent, en px.
 *
 * Un foyer qui se déplace de 34 px découvrirait 34 px de vide sur le bord
 * opposé. On dessine donc plus grand que le champ et on laisse le parent
 * rogner.
 */
const DRIFT = 34;
const DRIFT_MARGIN = DRIFT + 12;

/** Course de la nappe spéculaire, en px. Large : elle doit traverser. */
const SWEEP = 300;

/**
 * Période du reflet, par caractère. C'est le second endroit — avec la
 * géométrie des foyers — où les trois thèmes se séparent : un champ qui se
 * brasse renvoie la lumière plus vite qu'un champ qui dérive.
 */
const SWEEP_MS: Record<ThemeCharacter, number> = {
  drift: 16000,
  halo: 19000,
  turbulent: 9500,
};

/**
 * Le dosage vit dans `themeBudget` — ce fichier ne garde que la GÉOMÉTRIE.
 *
 * La séparation n'est pas cosmétique. Les opacités étaient dispersées ici
 * (une dans le tableau des foyers, une dans un JSX, deux dans des `<Stop>`),
 * multipliées par des facteurs de thème déclarés ailleurs. Personne ne
 * pouvait les additionner sans les chercher une par une — et personne ne l'a
 * fait pendant quatre sessions, jusqu'à ce qu'une capture montre un profil
 * entièrement rose : les cinq couches composaient à 0,93 d'accent plein.
 *
 * Regroupées, elles sont additionnables, et `tests/profile-theme-budget`
 * les additionne à chaque `npm test`.
 */

/**
 * Plafond d'opacite d'UNE couche. Valait 0,95 : chaque couche pouvait monter
 * seule jusqu'au quasi-opaque, ce qui n'a aucun sens pour un fond. Ramene au
 * budget total, qu'aucune couche seule n'a de raison d'atteindre.
 */
const cap = (alpha: number) => Math.min(Math.max(alpha, 0), BUDGET);

const toneOf = () => (isDarkTheme() ? TONE.dark : TONE.light);

/**
 * Les foyers du champ.
 *
 * `seam` est la couture bannière / avatar, en unités du `viewBox` (0–100).
 * Elle compte : au-dessus d'elle, une photo de bannière opaque masque tout ce
 * qu'on dessine. Un foyer posé à `cy = 0`, c'est de la lumière dépensée
 * derrière une photo — c'est joli dans le code et invisible à l'écran. Les
 * foyers principaux sont donc ancrés sur la couture, d'où leur halo déborde
 * vers le bas, dans la zone réellement vue (avatar, nom, bio).
 */
function fieldOf(
  kind: ThemeMaterialKind,
  accent: string,
  secondary: string,
  seam: number,
): { sources: LightSource[]; character: ThemeCharacter } {
  switch (kind) {
    /**
     * Halo : un seul foyer, serré, posé sur la couture, qui respire sans
     * dériver. C'est le thème le plus proche d'une lampe braquée sur le
     * profil — donc celui où la dérive nuirait : elle ferait « projecteur mal
     * fixé » au lieu de « lumière braquée ».
     */
    case 'glow':
      return {
        character: 'halo',
        sources: [
          { cx: 50, cy: seam, rx: SOURCE_RADII.glow[0][0], ry: SOURCE_RADII.glow[0][1], color: accent, gain: SOURCE_GAINS.glow[0], lane: 0, ms: 6800, scaleTo: 1.14 },
          { cx: 50, cy: seam + 12, rx: SOURCE_RADII.glow[1][0], ry: SOURCE_RADII.glow[1][1], color: secondary, gain: SOURCE_GAINS.glow[1], lane: 0, ms: 9200, scaleTo: 1.07 },
        ],
      };

    /**
     * Nébuleuse : trois foyers dont deux à contresens. Ce sont les croisements
     * qui font le nuage — deux foyers qui dérivent ensemble ne feraient qu'un
     * seul foyer plus large.
     */
    case 'mesh':
      return {
        character: 'turbulent',
        sources: [
          { cx: 12, cy: seam * 0.6, rx: SOURCE_RADII.mesh[0][0], ry: SOURCE_RADII.mesh[0][1], color: accent, gain: SOURCE_GAINS.mesh[0], lane: 1, ms: 12000, scaleTo: 1.08 },
          { cx: 88, cy: seam, rx: SOURCE_RADII.mesh[1][0], ry: SOURCE_RADII.mesh[1][1], color: secondary, gain: SOURCE_GAINS.mesh[1], lane: -1, ms: 9400, scaleTo: 1.1 },
          { cx: 50, cy: seam + 12, rx: SOURCE_RADII.mesh[2][0], ry: SOURCE_RADII.mesh[2][1], color: accent, gain: SOURCE_GAINS.mesh[2], lane: 1, ms: 15500, scaleTo: 1.06 },
        ],
      };

    /**
     * Dégradé : un foyer large et haut, un second plus bas en couleur
     * secondaire. Les deux dérivent dans le même sens et très lentement — la
     * page paraît éclairée par une fenêtre, pas animée.
     */
    default:
      return {
        character: 'drift',
        sources: [
          { cx: 50, cy: seam * 0.8, rx: SOURCE_RADII.gradient[0][0], ry: SOURCE_RADII.gradient[0][1], color: accent, gain: SOURCE_GAINS.gradient[0], lane: 1, ms: 21000, scaleTo: 1.05 },
          { cx: 50, cy: seam + 12, rx: SOURCE_RADII.gradient[1][0], ry: SOURCE_RADII.gradient[1][1], color: secondary, gain: SOURCE_GAINS.gradient[1], lane: -1, ms: 26000, scaleTo: 1.04 },
        ],
      };
  }
}

/**
 * Dérive + respiration d'un foyer.
 *
 * `withRepeat(..., true)` fait l'aller-retour, et l'easing sinusoïdal referme
 * l'itération exactement sur son point de départ : aucune reprise visible,
 * contrairement à une boucle qui reviendrait à zéro d'un coup.
 */
function useFloat(ms: number, lane: number, scaleTo: number) {
  const value = useSharedValue(0);

  useEffect(() => {
    if (isReduceMotionEnabled()) {
      // On se pose au milieu de la course plutôt qu'à zéro : c'est l'état le
      // plus proche de ce que voient les autres, et il n'y a plus qu'une
      // seule branche de rendu à maintenir.
      value.value = 0.5;
      return;
    }
    value.value = withRepeat(
      withTiming(1, { duration: ms, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [ms, value]);

  return useAnimatedStyle(() => {
    const swing = (value.value - 0.5) * 2;
    return {
      transform: [
        { translateX: swing * DRIFT * lane },
        // La composante verticale est volontairement plus courte : un foyer
        // qui monte et descend autant qu'il glisse se lit comme un flottement.
        { translateY: swing * DRIFT * 0.42 * lane },
        { scale: 1 + (scaleTo - 1) * value.value },
      ] as const,
    };
  });
}

/**
 * Un foyer, dans son propre composant.
 *
 * Le nombre de foyers change avec le thème, et l'aperçu de l'écran de
 * personnalisation change de thème à chaud. Appeler `useFloat` dans un `.map`
 * ferait varier le nombre de hooks d'un rendu à l'autre — donc planter. Un
 * composant par foyer, avec une clé qui contient le thème, remonte proprement.
 */
function Source({
  source,
  factor,
  id,
  height,
}: {
  source: LightSource;
  factor: number;
  id: string;
  /** Hauteur du champ, en px — sans le débordement. */
  height: number;
}) {
  const style = useFloat(source.ms, source.lane, source.scaleTo);
  /**
   * 0,7 = on garde 70 % de la couleur, on n'en éclaircit que 30 %.
   *
   * `AvatarMaterial` va bien plus loin (0,25) et il a raison : sur un anneau
   * de 5 px, le presque-blanc est un reflet, il fait le métal. Sur un champ
   * de 780 px, le même réglage désature toute la page — c'est ce qui a donné
   * le « lait rose » de la première version. Même intention, dose opposée.
   */
  const tone = toneOf();
  const core = useMemo(() => towardWhite(source.color, tone.core), [source.color, tone.core]);
  const gain = source.gain * tone.gain;

  /**
   * Le calque est dessiné plus grand que le champ, et le `viewBox` 0–100
   * s'étire sur ce cadre agrandi : un `cy` exprimé en pourcentage du CHAMP y
   * tomberait trop haut d'un `DRIFT_MARGIN`. On le reprojette.
   *
   * Rien d'équivalent sur `cx` : la largeur du champ n'est pas connue ici, et
   * ça n'a pas d'importance — les foyers sont soit centrés (la reprojection
   * serait l'identité), soit volontairement collés à un bord.
   */
  const span = height + 2 * DRIFT_MARGIN;
  const cy = span > 0 ? (((source.cy / 100) * height + DRIFT_MARGIN) / span) * 100 : source.cy;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          top: -DRIFT_MARGIN,
          left: -DRIFT_MARGIN,
          right: -DRIFT_MARGIN,
          bottom: -DRIFT_MARGIN,
        },
        style,
      ]}
    >
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={StyleSheet.absoluteFill}
      >
        <Defs>
          <RadialGradient
            id={id}
            cx={source.cx}
            cy={cy}
            fx={source.cx}
            fy={cy}
            rx={source.rx}
            ry={source.ry}
            gradientUnits="userSpaceOnUse"
          >
            {/* Le cœur éclairci — et il est COURT.
                Un point de lumière est un point. Étalé sur le quart d'un
                rayon de 600 px, ce n'est plus un reflet, c'est du brouillard :
                le champ vire au lait et toute la gradation disparaît. La
                couleur pleine doit avoir repris la main à 10 %. */}
            {FALLOFF.map(([offset, keep], i) => (
              <Stop
                key={offset}
                offset={offset}
                // Seul le tout premier arret porte le coeur eclairci : un
                // point de lumiere est un POINT. Etale, il vire au lait et
                // toute la gradation disparait.
                stopColor={i === 0 ? core : source.color}
                stopOpacity={keep === 0 ? 0 : cap(gain * keep * factor)}
              />
            ))}
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={100} height={100} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

/**
 * La nappe spéculaire : elle traverse, elle ne stationne pas.
 *
 * C'est une ELLIPSE, pas une bande. Une bande a quatre arêtes, et une arête
 * qui tombe en plein milieu de la couleur fait une ligne nette en travers du
 * profil — c'est exactement le défaut qu'on cherche à éliminer. Une ellipse
 * s'éteint dans toutes les directions : quelle que soit son opacité, quelle
 * que soit sa position, elle ne peut pas produire de bord.
 *
 * L'opacité passe par `stopOpacity`, un NOMBRE. Elle ne transite jamais par
 * une chaîne de couleur : c'est cette composition-là qui avait silencieusement
 * rendu la nappe opaque (voir `towardWhite` dans `theme/colors`).
 */
function Specular({
  accent,
  factor,
  seam,
  ms,
  id,
}: {
  accent: string;
  factor: number;
  seam: number;
  ms: number;
  id: string;
}) {
  const value = useSharedValue(0);

  useEffect(() => {
    if (isReduceMotionEnabled()) {
      value.value = 0.5;
      return;
    }
    value.value = withRepeat(
      withTiming(1, { duration: ms, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [ms, value]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: (value.value - 0.5) * 2 * SWEEP }],
  }));

  // Le reflet garde une bonne part de sa couleur : sur une page en thème
  // clair, une nappe blanche ne se lit pas comme un reflet, elle délave.
  const tone = toneOf();
  const sheen = towardWhite(accent, tone.sheenKeep);

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={StyleSheet.absoluteFill}
      >
        <Defs>
          <RadialGradient
            id={id}
            cx={50}
            cy={seam + 10}
            fx={50}
            fy={seam + 10}
            rx={40}
            ry={20}
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset={0} stopColor={sheen} stopOpacity={cap(LAYER.sheen * tone.sheen * factor)} />
            <Stop offset={0.55} stopColor={sheen} stopOpacity={cap(LAYER.sheen * 0.34 * tone.sheen * factor)} />
            <Stop offset={1} stopColor={sheen} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={100} height={100} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

interface Props {
  kind: ThemeMaterialKind;
  accent: string;
  secondary: string;
  /** Multiplicateur d'intensité (Discret / Normal / Intense). */
  factor: number;
  /** Hauteur de la bande bannière, en px. */
  bannerHeight: number;
  /** Hauteur totale du champ, en px. */
  height: number;
}

export default function ThemeMaterial({
  kind,
  accent,
  secondary,
  factor,
  bannerHeight,
  height,
}: Props) {
  // La couture, ramenée dans le repère 0–100 du `viewBox`. Bornée : une
  // bannière anormalement haute pousserait tous les foyers hors du champ.
  const seam = Math.min(46, Math.max(6, (bannerHeight / Math.max(height, 1)) * 100));
  const tone = toneOf();

  const { sources, character } = useMemo(
    () => fieldOf(kind, accent, secondary, seam),
    [kind, accent, secondary, seam],
  );

  // Les identifiants de dégradé SVG sont GLOBAUX au document. Deux profils
  // montés en même temps (l'aperçu de l'écran de personnalisation et le
  // profil derrière lui) avec les mêmes identifiants, et le second repeint
  // le premier.
  const salt = useMemo(() => Math.random().toString(36).slice(2, 8), []);

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.root]}>
      {/* 1 — L'assise a ete SUPPRIMEE le 2026-08-31.

          C'etait la seule couche a couvrir la page uniformement, et c'est
          elle, seule, qui produisait le « fond colorie ». Une couche
          uniforme ne peut pas se lire comme une lumiere : une lumiere vient
          de quelque part. Elle a ete essayee a 0,30 (criard, profil
          entierement rose) puis a 0,03 (delave, « 0 sur 20 ») — les deux
          refuses a l'ecran, parce que le defaut n'etait pas sa valeur mais
          son existence.

          Le thema ne descend donc plus jusqu'aux onglets, et c'est voulu :
          le bas du profil doit revenir au fond d'app neutre. C'est le
          contraste entre un haut eclaire et un bas neutre qui fait exister
          la lumiere — un degrade qui couvre tout n'eclaire rien. */}

      {/* 2 — Les foyers. */}
      {sources.map((source, index) => (
        <Source
          key={`${kind}-${index}`}
          id={`tm-${salt}-${index}`}
          source={source}
          factor={factor}
          height={height}
        />
      ))}

      {/* 3 — Le spéculaire. */}
      <Specular
        accent={accent}
        factor={factor}
        seam={seam}
        ms={SWEEP_MS[character]}
        id={`tm-${salt}-spec`}
      />

      {/* 4 — La source FIXE. Serrée, posée sur la couture, jamais animée :
          c'est le repère immobile qui donne du relief à tout ce qui dérive. */}
      <View style={StyleSheet.absoluteFill}>
        <Svg
          width="100%"
          height="100%"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={StyleSheet.absoluteFill}
        >
          <Defs>
            <RadialGradient
              id={`tm-${salt}-rim`}
              cx={50}
              cy={seam}
              fx={50}
              fy={seam}
              rx={34}
              ry={12}
              gradientUnits="userSpaceOnUse"
            >
              {/* Serré et peu éclairci, pour la même raison que les foyers :
                  large et blanc, ce repère deviendrait le brouillard qu'il
                  est censé trancher. */}
              <Stop
                offset={0}
                stopColor={towardWhite(accent, tone.rimKeep)}
                stopOpacity={cap(LAYER.rim * tone.rim * factor)}
              />
              <Stop offset={1} stopColor={accent} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={100} height={100} fill={`url(#tm-${salt}-rim)`} />
        </Svg>
      </View>

    </View>
  );
}

/*
 * Pas de plancher d'occlusion, et ce n'est pas un oubli.
 *
 * Sur la parure, le liseré sombre entre le métal et la photo est ce qui pose
 * l'objet. Transposé au fond de page, il ne marche dans aucun des deux
 * thèmes : en sombre le fond est déjà `#0A0A0A`, il ne reste pas de marge
 * pour assombrir ; en clair, un noir à 0,2 sur du blanc ne fait pas une
 * ombre, il fait une bande grise sale — une démarcation, exactement ce que le
 * champ doit éviter. Essayé, vu à l'écran, retiré.
 */

const styles = StyleSheet.create({
  root: { overflow: 'hidden' },
});
