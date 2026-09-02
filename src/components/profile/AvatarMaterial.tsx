import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Stop } from 'react-native-svg';
import { withAlpha, towardBlack, towardWhite } from '../../theme';
import { isReduceMotionEnabled } from '../../hooks/useReduceMotion';

/**
 * La matière des parures d'avatar.
 *
 * ── Le problème qu'on résout ─────────────────────────────────────────────
 * Une parure premium ratée, c'est toujours la même chose : un dégradé posé à
 * plat derrière une photo ronde. L'œil lit « une couleur », pas « un objet ».
 * Et une couleur, tout le monde sait en faire une — d'où l'impression de
 * contrefaçon dès qu'on la met à côté de ce que fait Discord.
 *
 * Ce que l'œil lit comme un OBJET, c'est un empilement de quatre choses que la
 * physique impose et qu'aucun aplat ne donne :
 *
 *  1. **Le bloom** — la lumière que l'objet dépose autour de lui. Sans lui, la
 *     parure est découpée au cutter sur le fond.
 *  2. **Le corps irisé** — la teinte ne va pas d'une couleur à l'autre : elle
 *     passe par du presque-blanc là où la lumière frappe, et se referme sur la
 *     couleur profonde à l'opposé. C'est ce virage par le blanc qui fait la
 *     différence entre du métal et du plastique.
 *  3. **Le spéculaire** — une bande étroite et vive qui balaie la surface plus
 *     vite que le corps. C'est LE signal « c'est poli ». Une surface mate n'en
 *     a pas, et c'est exactement pour ça qu'elle a l'air bon marché.
 *  4. **L'occlusion** — un liseré sombre entre la parure et la photo. Sans
 *     lui, la parure flotte au lieu d'être posée. C'est le détail le moins
 *     spectaculaire et celui qui manque le plus souvent.
 *
 * Le rim light, lui, ne tourne PAS : il marque d'où vient la lumière de la
 * pièce. Si tout tourne ensemble, on ne voit qu'un moulin ; c'est le contraste
 * entre ce qui tourne et ce qui reste fixe qui donne le relief.
 *
 * ── Pourquoi pas de shader ───────────────────────────────────────────────
 * Un vrai dégradé conique, du grain et un bloom gaussien demanderaient Skia,
 * qui ferait sortir l'app d'Expo Go. Tout ici tient donc en `react-native-svg`
 * + Reanimated : chaque couche est un anneau tracé au trait, et le balayage
 * vient de la ROTATION de la couche, pas d'un calcul par pixel. Les
 * transformations restent sur le thread UI.
 *
 * Le plafond assumé : pas de grain, et le spéculaire est un dégradé linéaire
 * masqué en anneau plutôt qu'un vrai reflet calculé.
 */

/** Caractère du mouvement. La matière est commune, le mouvement fait le preset. */
export type MaterialCharacter =
  /** Rotation régulière, sans à-coup. Le comportement par défaut. */
  | 'orbit'
  /** Deux vitesses opposées : la surface paraît instable, vivante. */
  | 'turbulent'
  /** Très lent, presque immobile. Pour ce qui doit paraître lourd, précieux. */
  | 'still';

interface Props {
  /** Diamètre du canvas, marge comprise. */
  outer: number;
  /** Diamètre de la photo. */
  size: number;
  accent: string;
  secondary: string;
  character?: MaterialCharacter;
  /** Épaisseur de l'anneau, en fraction du diamètre de la photo. */
  weight?: number;
}

/** Durées de base, en ms. Longues : une matière qui s'agite fait nerveux. */
const BODY_MS = 11000;
const BLOOM_MS = 3400;

/**
 * Période du reflet, et part de cette période où il PASSE.
 *
 * Avant, le spéculaire tournait en continu, à vitesse constante. C'est le
 * défaut qui fait « bannière » : une brillance qui repasse sans arrêt cesse
 * d'être un accident de lumière et devient une décoration. Un objet réel
 * n'accroche la lumière que par instants — le reste du temps, il ne fait que
 * la contenir.
 *
 * Donc : une traversée rapide (0,9 s) puis une longue plage morte. À 6 s de
 * période, le rapport actif/mort vaut 1:5,7. Pendant la plage morte le reflet
 * ne disparaît pas complètement (`GLINT_FLOOR`) : il redescend au niveau d'un
 * simple point brillant, posé au même endroit que le rim light, ce qui le
 * renforce au lieu de laisser l'anneau tomber à plat.
 */
const GLINT_MS: Record<MaterialCharacter, number> = {
  orbit: 6000,
  // Une surface instable accroche la lumière plus souvent.
  turbulent: 4600,
  // Ce qui doit paraître lourd et précieux brille rarement.
  still: 8200,
};
const GLINT_SWEEP = 0.15;
const GLINT_FLOOR = 0.1;

/**
 * Un tour de boucle couvre plusieurs révolutions.
 *
 * `withRepeat` remet la valeur à zéro entre deux itérations, et ce saut se
 * voit — la parure se téléporte. En enchaînant douze tours par itération, la
 * reprise devient rare, et comme elle tombe sur un multiple exact de 360° elle
 * ne se voit plus du tout. Même raisonnement que le `TURNS` de
 * `ProfileDecoration`, gardé identique pour que les deux systèmes tournent en
 * phase tant qu'ils cohabitent.
 */
const TURNS = 12;

function useSpin(ms: number, reverse = false) {
  const value = useSharedValue(0);

  useEffect(() => {
    if (isReduceMotionEnabled()) {
      // Pas de rotation, mais on ne fige pas à 0 : un angle mort donnerait la
      // même image à tout le monde. On pose un angle arbitraire et on s'arrête.
      value.value = 0.08;
      return;
    }
    value.value = 0;
    value.value = withRepeat(
      withTiming(1, { duration: ms * TURNS, easing: Easing.linear }),
      -1,
      false,
    );
  }, [ms, value]);

  const direction = reverse ? -1 : 1;
  return useAnimatedStyle(() => ({
    transform: [{ rotate: `${value.value * 360 * TURNS * direction}deg` }],
  }));
}

/**
 * Le reflet : un tour complet en `GLINT_SWEEP` de la période, puis rien.
 *
 * Une seule valeur partagée pilote l'angle ET l'opacité — les deux doivent
 * être d'accord à la frame près, et deux boucles séparées se déphaseraient.
 * La reprise à zéro ne se voit pas : à cet instant l'arc est revenu à son
 * point de départ (360° ≡ 0°) et son opacité est au plancher.
 *
 * ⚠ La courbe est écrite à la main. `Easing.out` de `theme/motion` est une
 * fonction JS ordinaire : appelée depuis un worklet, elle tue l'app sans
 * laisser une seule ligne de log.
 */
function useGlint(ms: number, reverse = false) {
  const value = useSharedValue(0);

  useEffect(() => {
    if (isReduceMotionEnabled()) {
      // Au milieu de la traversée : un point brillant fixe, ce qui est
      // exactement ce qu'on veut voir d'un objet poli qui ne bouge pas.
      value.value = GLINT_SWEEP * 0.45;
      return;
    }
    value.value = 0;
    value.value = withRepeat(
      withTiming(1, { duration: ms, easing: Easing.linear }),
      -1,
      false,
    );
  }, [ms, value]);

  const direction = reverse ? -1 : 1;
  return useAnimatedStyle(() => {
    const raw = Math.min(1, value.value / GLINT_SWEEP);
    // Sortie en douceur : le reflet ralentit en fin de course au lieu de
    // s'arrêter net, comme une lumière qui glisse hors de l'arête.
    const eased = 1 - Math.pow(1 - raw, 3);
    const passing = value.value < GLINT_SWEEP;
    return {
      opacity: passing
        ? GLINT_FLOOR + (1 - GLINT_FLOOR) * Math.sin(Math.PI * raw)
        : GLINT_FLOOR,
      transform: [{ rotate: `${eased * 360 * direction}deg` }],
    };
  });
}

/** Respiration du bloom. Sinusoïde échantillonnée : la boucle se referme sur
    son point de départ, donc aucune reprise visible. */
function useBreath(ms: number, from: number, to: number) {
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

  return useAnimatedStyle(() => ({ opacity: from + (to - from) * value.value }));
}

export default function AvatarMaterial({
  outer,
  size,
  accent,
  secondary,
  character = 'orbit',
  weight = 0.05,
}: Props) {
  /**
   * Géométrie. L'anneau est tracé au TRAIT sur un cercle : son rayon est donc
   * la ligne médiane de la bande, et l'épaisseur déborde de part et d'autre.
   * On le pose juste à l'extérieur de la photo pour ne pas mordre le visage.
   */
  const ringW = Math.max(3, size * weight);
  const radius = size / 2 + ringW / 2;
  const center = outer / 2;

  /**
   * Les teintes de la matière.
   *
   * `towardWhite` est ce qui fait le métal : le point de lumière n'est pas
   * l'accent en plus clair, c'est l'accent presque effacé vers le blanc. Un
   * dégradé qui reste dans la même famille de saturation rend du plastique.
   */
  const tint = useMemo(
    () => ({
      /** Le point de lumière : presque blanc, mais TEINTÉ. */
      light: towardWhite(accent, 0.25),
      /** Le second point, plus bas : un métal a deux reflets, pas un. */
      light2: towardWhite(accent, 0.52),
      core: accent,
      deep: withAlpha(secondary, 0.95),
      /**
       * Le reflet spéculaire. `#FFFFFF` pur a été remplacé par du presque-blanc
       * teinté, pour deux raisons : un highlight écrêté à 255 perd toute
       * structure interne et devient une tache plutôt qu'un reflet, et surtout
       * un métal renvoie une lumière DE SA COULEUR — un or dont le point haut
       * est blanc pur se lit « jaune brillant », pas « or ».
       */
      glint: towardWhite(accent, 0.06),
      /**
       * L'ombre de contact. Elle valait `withAlpha(secondary, 0.12)` : la
       * couleur de la parure à 12 %, c'est-à-dire un halo coloré, pas une
       * ombre. Une ombre de contact est SOMBRE et SERRÉE — c'est elle, et
       * elle seule, qui dit « posé sur » plutôt que « flottant au-dessus ».
       */
      shadow: withAlpha(towardBlack(secondary, 0.22), 0.34),
    }),
    [accent, secondary],
  );

  const bodyMs = character === 'still' ? BODY_MS * 2.2 : BODY_MS;
  const bodyStyle = useSpin(bodyMs);
  // « turbulent » fait tourner le spéculaire à contresens du corps : les deux
  // balayages se croisent, et la surface paraît instable au lieu de défiler.
  const specularStyle = useGlint(GLINT_MS[character], character === 'turbulent');
  const bloomStyle = useBreath(BLOOM_MS, 0.34, 0.62);

  const ids = useMemo(() => {
    // Les identifiants de dégradé sont GLOBAUX au document SVG. Deux avatars
    // à l'écran avec le même id, et le second repeint le premier.
    const salt = Math.random().toString(36).slice(2, 8);
    return {
      body: `m-body-${salt}`,
      spec: `m-spec-${salt}`,
      bloom: `m-bloom-${salt}`,
      rim: `m-rim-${salt}`,
    };
  }, []);

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.root]}>
      {/* 1 — Le bloom. Il ne tourne pas : une lumière déposée ne tourne pas
          avec l'objet qui l'émet. */}
      <Animated.View style={[StyleSheet.absoluteFill, bloomStyle]}>
        <Svg width={outer} height={outer}>
          <Defs>
            <RadialGradient id={ids.bloom} cx="50%" cy="50%" r="50%">
              <Stop offset="0.62" stopColor={accent} stopOpacity={0} />
              <Stop offset="0.82" stopColor={accent} stopOpacity={0.5} />
              <Stop offset="1" stopColor={accent} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={center} cy={center} r={center} fill={`url(#${ids.bloom})`} />
        </Svg>
      </Animated.View>

      {/* 2 — Le corps irisé. */}
      <Animated.View style={[StyleSheet.absoluteFill, bodyStyle]}>
        <Svg width={outer} height={outer}>
          <Defs>
            {/*
              La rampe du métal, et c'est ici que se joue le plus gros écart
              avec un dégradé ordinaire.

              L'ancienne version montait vers un point clair puis redescendait :
              UNE inversion de luminance, symétrique. C'est la définition d'un
              dégradé, et l'œil y lit du plastique. Un métal réfléchit son
              environnement, donc sa luminance change de sens au moins DEUX
              fois : ciel clair en haut, bande sombre au milieu (le « sol » qui
              se reflète), second reflet plus bas, arête sombre pour finir.

              C'est la bande sombre à 0,58 qui manquait — sans elle, aucune
              quantité de blanc ne fait du métal.

              L'axe ne fait pas 45° non plus : un axe strictement vertical se
              lit comme un fond, un axe à 45° comme un gabarit. Autour de 108°,
              il se lit comme un objet éclairé.
            */}
            <LinearGradient id={ids.body} x1="0.16" y1="0" x2="0.84" y2="1">
              <Stop offset="0" stopColor={tint.deep} />
              <Stop offset="0.16" stopColor={tint.core} />
              <Stop offset="0.30" stopColor={tint.light} />
              <Stop offset="0.44" stopColor={tint.core} />
              <Stop offset="0.58" stopColor={tint.deep} />
              <Stop offset="0.76" stopColor={tint.light2} />
              <Stop offset="1" stopColor={tint.deep} />
            </LinearGradient>
          </Defs>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={`url(#${ids.body})`}
            strokeWidth={ringW}
            fill="none"
          />
        </Svg>
      </Animated.View>

      {/* 3 — Le spéculaire. Court et vif : c'est une bande de lumière qui
          passe, pas une deuxième couleur. Le tiret vaut un quart du tour. */}
      <Animated.View style={[StyleSheet.absoluteFill, specularStyle]}>
        <Svg width={outer} height={outer}>
          <Defs>
            <LinearGradient id={ids.spec} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={tint.glint} stopOpacity={0} />
              <Stop offset="0.5" stopColor={tint.glint} stopOpacity={0.9} />
              <Stop offset="1" stopColor={tint.glint} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={`url(#${ids.spec})`}
            strokeWidth={ringW * 0.62}
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * radius * 0.16} ${2 * Math.PI * radius}`}
            fill="none"
          />
        </Svg>
      </Animated.View>

      {/* 4 — Le rim light, FIXE. Il dit d'où vient la lumière de la pièce ;
          c'est le repère immobile qui donne du relief à tout ce qui tourne. */}
      <View style={StyleSheet.absoluteFill}>
        <Svg width={outer} height={outer}>
          <Defs>
            {/*
              Le rim, et il est ASYMÉTRIQUE. Un contour d'intensité constante
              se lit comme un trait ; c'est le rapport entre les bords qui se
              lit comme une ÉPAISSEUR. Rapport haut/flancs : 0,30 / 0,11, soit
              2,7:1.

              La moitié basse ne s'éteint pas — elle passe au NOIR. C'est la
              partie que presque personne ne met, et c'est elle qui donne le
              volume : un objet éclairé par le haut a un dessous plus sombre
              que son fond, jamais un liseré clair. Le passage par l'alpha zéro
              au milieu évite que blanc et noir se mélangent en gris sale.
            */}
            <LinearGradient id={ids.rim} x1="0.5" y1="0" x2="0.5" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.3} />
              <Stop offset="0.3" stopColor="#FFFFFF" stopOpacity={0.11} />
              <Stop offset="0.52" stopColor="#FFFFFF" stopOpacity={0} />
              <Stop offset="0.62" stopColor="#000000" stopOpacity={0} />
              <Stop offset="1" stopColor="#000000" stopOpacity={0.24} />
            </LinearGradient>
          </Defs>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={`url(#${ids.rim})`}
            strokeWidth={Math.max(1, ringW * 0.34)}
            fill="none"
          />
          {/* 5 — L'occlusion : le liseré sombre qui pose la parure sur la
              photo au lieu de la laisser flotter au-dessus. */}
          <Circle
            cx={center}
            cy={center}
            r={size / 2}
            stroke={tint.shadow}
            // Resserrée de moitié : une ombre de contact large devient un
            // second anneau, et deux anneaux empilés autour d'une photo ont
            // déjà été refusés. Le contact doit se deviner, pas se compter.
            strokeWidth={Math.max(1, ringW * 0.34)}
            fill="none"
          />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center' },
});
