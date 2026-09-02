import React, { useEffect, useMemo } from 'react';
import { PixelRatio, StyleSheet } from 'react-native';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { colors, isDarkTheme, towardWhite } from '../../theme';
import { isReduceMotionEnabled } from '../../hooks/useReduceMotion';
import { skia } from './skiaRuntime';
import {
  BAND_CURVE,
  BAND_HEIGHT,
  BUDGET,
  FALLOFF,
  LAYER,
  SOURCE_GAINS,
  SOURCE_RADII,
  TONE,
  type ThemeMaterialKind,
} from './themeBudget';

/**
 * Le fond de thème en SkSL — le meilleur des trois moteurs.
 *
 * ── CE QUI FAIT LA DIFFÉRENCE : LE DOMAIN WARPING ────────────────────────
 *
 * La première version bruitait le RAYON des foyers. C'était propre, et ça
 * restait un dégradé : des ellipses aux bords irréguliers. La technique qui
 * change la nature de l'image, et pas seulement son détail, c'est de déformer
 * les COORDONNÉES avant de peindre quoi que ce soit.
 *
 * Le résultat de `f(p + g(p))` ne ressemble à aucune de ses deux entrées : le
 * même dégradé, déformé, cesse d'être un dégradé et devient de la matière —
 * des veines, un mouvement d'encre dans l'eau.
 *
 * On n'utilise PAS le warping fbm canonique (`fbm(p + fbm(p))`) : trois fbm de
 * trois octaves, c'est environ 510 opérations par pixel, intenable en plein
 * écran sur un mobile milieu de gamme. La **turbulence sinusoïdale** donne le
 * même type de déformation pour ~110 opérations : au lieu de sommer du bruit,
 * on déplace itérativement la coordonnée le long d'une direction qui tourne,
 * par une sinusoïde dont la fréquence monte et l'amplitude descend.
 *
 * ── LES CHIFFRES, ET POURQUOI CEUX-LÀ ────────────────────────────────────
 *
 *  • Amplitude 0,5 — au-delà de 0,7 le champ se replie sur lui-même et crée
 *    des singularités sombres.
 *  • Facteur de fréquence 1,4 et non 2,0. Une lacunarité de 2 aligne
 *    visuellement les octaves ; 1,4 casse la répétition.
 *  • `+ float(i)` dans la phase : sans lui toutes les octaves pulsent
 *    ensemble et on voit un battement.
 *  • Vitesse 0,07, et pas 0,3 comme dans les démos. Un fond doit **changer,
 *    pas bouger** : au-delà d'environ 15 pt/s le mouvement est détecté par la
 *    vision périphérique, qui déclenche une saccade — c'est ça qui rend un
 *    fond animé épuisant. En dessous, on le perçoit comme un changement
 *    d'état. Si quelqu'un qui lit la bio remarque qu'il se passe quelque
 *    chose, c'est raté ; s'il revient dix secondes plus tard et que ce n'est
 *    plus la même image, c'est réussi.
 *  • L'amplitude décroît en `1/freq` : les dernières octaves déplacent de
 *    moins d'un pixel, donc elles ne peuvent pas créer de détail qui vienne
 *    concurrencer les glyphes. La lisibilité est garantie par construction,
 *    pas par réglage.
 *
 * ── CE QUI NE CHANGE PAS ─────────────────────────────────────────────────
 *
 * Le dosage. Toutes les opacités viennent de `themeBudget`, comme pour les
 * deux autres moteurs. Le warping ne touche QU'AUX COORDONNÉES : la palette
 * reste exactement celle de l'utilisateur, et aucun couple de couleurs ne peut
 * produire un résultat illisible. C'est ce qui le distingue des caustiques
 * (qui écrasent tout en blanc) ou de l'iridescence (qui invente des teintes).
 *
 * ── PIÈGES SkSL, TOUS RENCONTRÉS ICI ─────────────────────────────────────
 *
 *  1. **`RuntimeEffect.Make` rend `null`, il ne lève pas.** La version
 *     précédente rendait alors un composant vide : plus aucun thème, en
 *     silence, et sans repli puisque `ThemeField` avait déjà choisi ce
 *     moteur. On remonte désormais l'échec (`onUnavailable`).
 *  2. **Indexer un tableau d'uniformes par une variable de boucle est
 *     refusé** (« index expression must be constant »). Les trois foyers et
 *     le profil de chute sont donc déroulés à la main.
 *  3. **Skia déroule tout le programme** et le refuse au-delà d'une certaine
 *     taille (« Program too large »). D'où : une seule boucle dans tout le
 *     shader, sans rien d'imbriqué dedans.
 *  4. **`fragCoord` est en POINTS, pas en pixels physiques.** Sur un écran
 *     ×3, un tramage calculé dessus a un motif trois fois trop gros et
 *     redevient visible. D'où `u_px`.
 *  5. **Le temps doit être replié côté JS.** `useClock` rend des
 *     millisecondes depuis la première frame ; au bout de quelques minutes la
 *     précision flottante fige les sinusoïdes.
 */

const K = skia();

const Canvas = K?.Canvas;
const Fill = K?.Fill;
const Shader = K?.Shader;

const cap = (a: number) => Math.min(Math.max(a, 0), BUDGET);

function rgb(hex: string): [number, number, number] {
  const value = String(hex || '').trim();
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (!m) return [0.5, 0.5, 0.5];
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

type Source = {
  cx: number; cy: number; rx: number; ry: number;
  color: string; gain: number; lane: number; period: number; scaleTo: number;
};

/** Foyer absent : gain nul. Le shader le saute, mais l'uniforme doit exister. */
const EMPTY: Source = {
  cx: 0, cy: 0, rx: 1, ry: 1, color: '#000000', gain: 0, lane: 0, period: 1, scaleTo: 1,
};

/** Mêmes trois géométries que les deux autres moteurs. Le catalogue est gelé. */
function fieldOf(kind: ThemeMaterialKind, accent: string, secondary: string, seam: number): Source[] {
  const r = SOURCE_RADII[kind];
  const g = SOURCE_GAINS[kind];
  const rx = (i: number) => r[i][0] / 100;
  const ry = (i: number) => r[i][1] / 100;

  if (kind === 'glow') {
    return [
      { cx: 0.5, cy: seam, rx: rx(0), ry: ry(0), color: accent, gain: g[0], lane: 0, period: 6.8, scaleTo: 1.14 },
      { cx: 0.5, cy: seam + 0.12, rx: rx(1), ry: ry(1), color: secondary, gain: g[1], lane: 0, period: 9.2, scaleTo: 1.07 },
    ];
  }
  if (kind === 'mesh') {
    return [
      { cx: 0.12, cy: seam * 0.6, rx: rx(0), ry: ry(0), color: accent, gain: g[0], lane: 1, period: 12, scaleTo: 1.08 },
      { cx: 0.88, cy: seam, rx: rx(1), ry: ry(1), color: secondary, gain: g[1], lane: -1, period: 9.4, scaleTo: 1.1 },
      { cx: 0.5, cy: seam + 0.12, rx: rx(2), ry: ry(2), color: accent, gain: g[2], lane: 1, period: 15.5, scaleTo: 1.06 },
    ];
  }
  return [
    { cx: 0.5, cy: seam * 0.8, rx: rx(0), ry: ry(0), color: accent, gain: g[0], lane: 1, period: 21, scaleTo: 1.05 },
    { cx: 0.5, cy: seam + 0.12, rx: rx(1), ry: ry(1), color: secondary, gain: g[1], lane: -1, period: 26, scaleTo: 1.04 },
  ];
}

/**
 * Force de la déformation, par thème.
 *
 * « Halo » est une lampe braquée : une lampe a un bord net, la déformer la
 * ferait vaciller comme une flamme. « Nébuleuse » est tout l'inverse — c'est
 * là que le warping fait tout le travail. « Dégradé » prend une dose médiane.
 */
const WARP: Record<ThemeMaterialKind, number> = {
  glow: 0.16,
  gradient: 0.42,
  mesh: 0.78,
};

/**
 * Repliement du temps, en secondes : 100 × 2π. Un multiple exact de 2π fait
 * que les sinusoïdes de fréquence entière se raccordent sans saut, et dix
 * minutes suffisent à rendre le raccord des autres imperceptible.
 */
const TIME_FOLD = 628.3185307;

const SKSL = `
uniform float  u_time;
uniform float2 u_res;
uniform float  u_px;
uniform half3  u_base;
uniform float  u_warp;
uniform float  u_grain;

uniform float4 u_band;
uniform half3  u_bandTop;
uniform half3  u_bandBottom;

uniform float4 u_s0; uniform half3 u_c0; uniform half3 u_k0; uniform float4 u_m0;
uniform float4 u_s1; uniform half3 u_c1; uniform half3 u_k1; uniform float4 u_m1;
uniform float4 u_s2; uniform half3 u_c2; uniform half3 u_k2; uniform float4 u_m2;

uniform float4 u_rim;
uniform half3  u_rimCol;
uniform half3  u_rimCore;
uniform float  u_rimGain;

uniform float4 u_sheen;
uniform half3  u_sheenCol;
uniform float3 u_sheenMove;

uniform float4 u_fx;
uniform float4 u_fy;

const float TAU = 6.28318530718;

// Chute convexe, exactement la polyligne de themeBudget. DEROULEE : SkSL
// refuse d'indexer un tableau d'uniformes par une variable de boucle.
float falloff(float t) {
  if (t <= u_fx.x) { return u_fy.x; }
  if (t <= u_fx.y) { return mix(u_fy.x, u_fy.y, (t - u_fx.x) / max(u_fx.y - u_fx.x, 0.00001)); }
  if (t <= u_fx.z) { return mix(u_fy.y, u_fy.z, (t - u_fx.y) / max(u_fx.z - u_fx.y, 0.00001)); }
  if (t <= u_fx.w) { return mix(u_fy.z, u_fy.w, (t - u_fx.z) / max(u_fx.w - u_fx.z, 0.00001)); }
  return 0.0;
}

/*
 * Turbulence sinusoidale — le coeur de ce shader.
 *
 * Huit deplacements successifs le long d'une direction qui tourne, de
 * frequence croissante et d'amplitude decroissante.
 *
 * Une SEULE boucle dans tout le shader, et rien d'imbrique dedans : Skia
 * deroule le programme entier et le refuse au-dela d'une certaine taille.
 */
float2 turbulence(float2 p, float t, float amp) {
  float freq = 2.0;
  float2x2 rot = float2x2(0.6, -0.8, 0.8, 0.6);
  for (int i = 0; i < 8; i++) {
    float2 pr = p * rot;
    p += amp * rot[0] * sin(freq * pr.y + 0.07 * t + float(i)) / freq;
    rot *= float2x2(0.6, -0.8, 0.8, 0.6);
    freq *= 1.4;
  }
  return p;
}

// Bruit a gradient entrelace (Jimenez) : tramage anti-banding et grain.
float ign(float2 p) {
  return fract(52.9829189 * fract(dot(p, float2(0.06711056, 0.00583715))));
}

half3 over(half3 dst, half3 src, float a) {
  return dst * (1.0 - half(a)) + src * half(a);
}

/*
 * Un foyer. Le coeur eclairci est COURT — un point de lumiere est un point.
 * Etale, ce n'est plus un reflet, c'est du brouillard.
 */
half3 light(half3 dst, float2 uv, float4 geom, half3 col, half3 core, float4 move, float t) {
  float gain = move.x;
  if (gain <= 0.0) { return dst; }
  float ph = sin(TAU * t / max(move.z, 0.001));
  float sc = 1.0 + (move.w - 1.0) * (0.5 + 0.5 * ph);
  // La composante verticale est plus courte : un foyer qui monte et descend
  // autant qu'il glisse se lit comme un flottement.
  float2 ctr = geom.xy + float2(0.045 * move.y * ph, 0.019 * move.y * ph);
  float2 d = (uv - ctr) / max(geom.zw * sc, float2(0.0001));
  float r = length(d);
  float a = falloff(r) * gain;
  if (a <= 0.0) { return dst; }
  return over(dst, mix(col, core, half(1.0 - smoothstep(0.0, 0.10, r))), a);
}

half4 main(float2 xy) {
  float2 uv = xy / u_res;
  float t = u_time;

  /*
   * LE WARPING. Tout ce qui suit est peint dans des coordonnees deformees.
   * L'ecart entre les deux reperes est borne par u_warp : la geometrie
   * generale — bande sous la couture, foyers a leur place — ne peut pas
   * partir, elle ondule.
   */
  float2 src = (uv - 0.5) * float2(1.6, 1.05);
  float2 w = turbulence(src, t, 0.5);
  float2 quv = uv + (w - src) * u_warp * 0.1;
  // Scalaire de veine, tire du meme champ : module la densite et le melange.
  float vein = 0.5 + 0.5 * sin(w.x * 2.1 + w.y * 1.6);

  half3 c = u_base;

  // ── LA BANDE ──────────────────────────────────────────────────────────
  // Pleine largeur, ancree sous la couture, eteinte avant la mi-page : la
  // forme de Discord. Sa position dans le degrade est perturbee par la veine,
  // donc les deux teintes s'interpenetrent au lieu de se succeder en ligne
  // droite — c'est ce qui la sort du « degrade a deux arrets ».
  //
  // La CHUTE, elle, reste sur la coordonnee non deformee : c'est elle qui
  // garantit que la teinte est eteinte avant le contenu, et le budget est
  // verifie dessus.
  {
    float bt = clamp((uv.y - u_band.x) / max(u_band.y, 0.0001), 0.0, 1.0);
    float bw = clamp((quv.y - u_band.x) / max(u_band.y, 0.0001), 0.0, 1.0);
    float mixT = clamp(bw + 0.42 * (vein - 0.5), 0.0, 1.0);
    float a = u_band.w * pow(1.0 - bt, u_band.z) * (0.78 + 0.44 * vein);
    c = over(c, mix(u_bandTop, u_bandBottom, half(mixT)), a);
  }

  // ── LES FOYERS ────────────────────────────────────────────────────────
  c = light(c, quv, u_s0, u_c0, u_k0, u_m0, t);
  c = light(c, quv, u_s1, u_c1, u_k1, u_m1, t);
  c = light(c, quv, u_s2, u_c2, u_k2, u_m2, t);

  // ── LA NAPPE SPECULAIRE ───────────────────────────────────────────────
  {
    float swing = sin(TAU * t / max(u_sheenMove.y, 0.001)) * u_sheenMove.z;
    float2 d = (quv - float2(u_sheen.x + swing, u_sheen.y)) / max(u_sheen.zw, float2(0.0001));
    c = over(c, u_sheenCol, falloff(length(d)) * u_sheenMove.x);
  }

  // ── LE REPERE IMMOBILE ────────────────────────────────────────────────
  // Sur les coordonnees NON deformees, et c'est tout l'interet : la
  // profondeur nait du contraste entre ce qui ondule et ce qui reste plante.
  {
    float2 d = (uv - u_rim.xy) / max(u_rim.zw, float2(0.0001));
    float r = length(d);
    c = over(c, mix(u_rimCol, u_rimCore, half(1.0 - smoothstep(0.0, 0.10, r))), falloff(r) * u_rimGain);
  }

  // ── FINITION ──────────────────────────────────────────────────────────
  // u_px : fragCoord arrive en POINTS. Sans lui le motif est trois fois
  // trop gros sur un ecran x3, et le tramage redevient visible.
  float2 px = xy * u_px;

  // Grain de film, STATIQUE. Un grain anime derriere une bio qu'on lit, c'est
  // du scintillement permanent — le piege classique des portages Shadertoy.
  // Proportionnel a la lumiere presente : du grain sur une zone eteinte
  // serait de la salissure sur le fond de l'app.
  float lit = clamp(length(float3(c - u_base)) * 6.0, 0.0, 1.0);
  c = c + half3(half((ign(px) - 0.5) * u_grain * lit));

  // Tramage anti-banding : exactement un niveau, centre. Il doit rester
  // imperceptible — s'il se voit, il est trop fort.
  c = c + half3(half((ign(px * 1.7 + 13.0) - 0.5) / 255.0));

  return half4(c, 1.0);
}
`;

export interface ThemeSkiaProps {
  kind: ThemeMaterialKind;
  accent: string;
  secondary: string;
  factor: number;
  bannerHeight: number;
  height: number;
  base?: string;
  /** Remonté quand le shader ne compile pas — on retombe alors sur le GLSL. */
  onUnavailable?: () => void;
}

export default function ThemeSkia({
  kind, accent, secondary, factor, bannerHeight, height, base, onUnavailable,
}: ThemeSkiaProps) {
  if (!K) return null;

  const effect = useMemo(() => K.Skia.RuntimeEffect.Make(SKSL) ?? null, []);
  const size = useSharedValue({ width: 1, height: 1 });
  const clock = K.useClock();
  const tone = isDarkTheme() ? TONE.dark : TONE.light;

  const constants = useMemo(() => {
    const seam = Math.min(0.46, Math.max(0.06, bannerHeight / Math.max(height, 1)));
    const sources = fieldOf(kind, accent, secondary, seam);
    const at = (i: number) => sources[i] ?? EMPTY;
    const geom = (s: Source) => [s.cx, s.cy, s.rx, s.ry];
    const move = (s: Source) => [cap(s.gain * tone.gain * factor), s.lane, s.period, s.scaleTo];

    return {
      u_base: rgb(base || colors.bg),
      u_px: PixelRatio.get(),
      u_warp: WARP[kind],
      // Le grain suit l'intensité choisie : un thème « Discret » qui grainerait
      // autant qu'un « Intense » ne serait plus discret.
      u_grain: 0.014 * factor,

      u_band: [seam, BAND_HEIGHT, BAND_CURVE, cap(LAYER.band * tone.gain * factor)],
      u_bandTop: rgb(accent),
      u_bandBottom: rgb(secondary),

      u_s0: geom(at(0)), u_c0: rgb(at(0).color), u_k0: rgb(towardWhite(at(0).color, tone.core)), u_m0: move(at(0)),
      u_s1: geom(at(1)), u_c1: rgb(at(1).color), u_k1: rgb(towardWhite(at(1).color, tone.core)), u_m1: move(at(1)),
      u_s2: geom(at(2)), u_c2: rgb(at(2).color), u_k2: rgb(towardWhite(at(2).color, tone.core)), u_m2: move(at(2)),

      u_rim: [0.5, seam, 0.34, 0.12],
      u_rimCol: rgb(accent),
      u_rimCore: rgb(towardWhite(accent, tone.rimKeep)),
      u_rimGain: cap(LAYER.rim * tone.rim * factor),

      u_sheen: [0.5, seam + 0.1, 0.4, 0.2],
      u_sheenCol: rgb(towardWhite(accent, tone.sheenKeep)),
      u_sheenMove: [cap(LAYER.sheen * tone.sheen * factor), kind === 'mesh' ? 9.5 : 16, 0.34],

      u_fx: FALLOFF.map(([x]) => x),
      u_fy: FALLOFF.map(([, y]) => y),
    };
  }, [kind, accent, secondary, factor, bannerHeight, height, base, tone]);

  /**
   * « Réduire les animations » fige l'horloge — mais pas à zéro : à zéro, tous
   * les profils auraient exactement la même image, et le champ de turbulence
   * se lirait comme un motif figé identique partout.
   */
  const still = isReduceMotionEnabled();

  const uniforms = useDerivedValue(
    () => ({
      ...constants,
      // Le temps est REPLIÉ : `useClock` rend des millisecondes depuis la
      // première frame, et au bout de quelques minutes la précision flottante
      // fige les sinusoïdes. Le modulo tombe sur un multiple exact de 2π.
      u_time: still ? 41.2 : (clock.value / 1000) % TIME_FOLD,
      u_res: [Math.max(1, size.value.width), Math.max(1, size.value.height)],
    }),
    [constants, still],
  );

  /**
   * Prévenir l'appelant depuis un effet, pas depuis le rendu : remonter un
   * état au parent pendant qu'on rend, c'est le « Cannot update a component
   * while rendering a different component » de React.
   */
  const failed = !effect || !Canvas;
  useEffect(() => { if (failed) onUnavailable?.(); }, [failed, onUnavailable]);
  if (failed) return null;

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none" onSize={size} opaque>
      <Fill>
        <Shader source={effect} uniforms={uniforms} />
      </Fill>
    </Canvas>
  );
}
