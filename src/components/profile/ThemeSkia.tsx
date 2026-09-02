import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
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
 * ── Ce qu'il fait que les deux autres NE PEUVENT PAS ─────────────────────
 *
 * Le repli SVG empile des dégradés ; le repli `expo-gl` calcule les mêmes
 * ellipses par pixel et les trame. Les deux dessinent des FORMES. Il leur
 * manque la seule chose qui distingue un ciel d'un dégradé :
 *
 *  • **Du bruit fractal.** `fbm()` module le rayon de chaque foyer, donc son
 *    contour n'est plus une ellipse mais une frontière irrégulière qui se
 *    déforme lentement. C'est ça, une nébuleuse — pas deux ovales croisés.
 *    Un dégradé, aussi doux soit-il, se lit comme un dégradé ; une frontière
 *    bruitée se lit comme de la matière.
 *  • **Du grain.** Pas le tramage anti-banding (qui doit rester invisible),
 *    mais une vraie texture de film, très faible, qui empêche les grandes
 *    surfaces de paraître plastique. C'est le « pas de grain » du plafond
 *    assumé d'août qui tombe ici.
 *  • **Un balayage conique**, impossible en SVG et coûteux à écrire à la main.
 *
 * ── Ce qui NE change pas ─────────────────────────────────────────────────
 *
 * Le dosage. Toutes les opacités viennent de `themeBudget`, comme pour les
 * deux autres moteurs, et `tests/profile-theme-budget` continue de garder le
 * couple « assez fort pour se voir / éteint à mi-page ». Le grain et le bruit
 * modulent la GÉOMÉTRIE, jamais l'intensité : c'est l'emprise qui fait la
 * page coloriée, et cette leçon-là a coûté quatre sessions.
 *
 * ── Typage ───────────────────────────────────────────────────────────────
 *
 * Skia est chargé à l'exécution (voir `skiaRuntime`), donc ses symboles sont
 * `any` ici. C'est le prix d'un module natif optionnel : le typer demanderait
 * un import statique, et un import statique fait planter Expo Go au
 * chargement du module.
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

const MAX_SOURCES = 3;

type Source = {
  cx: number; cy: number; rx: number; ry: number;
  color: string; gain: number; lane: number; period: number; scaleTo: number;
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
 * Combien la frontière des foyers est déformée par le bruit, par thème.
 *
 * « Halo » est une lampe braquée : une lampe a un bord net, la bruiter la
 * ferait vaciller comme une flamme. « Nébuleuse » est tout l'inverse — c'est
 * là que le bruit fait tout le travail. « Dégradé » prend une dose médiane :
 * assez pour ne pas lire comme une ellipse, pas assez pour faire un nuage.
 */
const TURBULENCE: Record<ThemeMaterialKind, number> = {
  glow: 0.1,
  gradient: 0.26,
  mesh: 0.52,
};

const SKSL = `
uniform float  u_time;
uniform float2 u_res;
uniform half3  u_base;
uniform float  u_turb;
uniform float  u_grain;

uniform float4 u_src[${MAX_SOURCES}];
uniform half3  u_srcCol[${MAX_SOURCES}];
uniform half3  u_srcCore[${MAX_SOURCES}];
uniform float4 u_srcMove[${MAX_SOURCES}];

uniform float4 u_band;
uniform half3  u_bandTop;
uniform half3  u_bandBottom;

uniform float4 u_rim;
uniform half3  u_rimCol;
uniform half3  u_rimCore;
uniform float  u_rimGain;

uniform float4 u_sheen;
uniform half3  u_sheenCol;
uniform float3 u_sheenMove;

uniform float2 u_falloff[4];

const float TAU = 6.28318530718;

// Chute convexe, exactement la polyligne de themeBudget. Une chute lineaire
// se lit comme un aplat degrade ; une chute raide puis longue se lit comme
// une SOURCE. C'est la difference entre une peinture et une lumiere.
float falloff(float t) {
  if (t <= u_falloff[0].x) { return u_falloff[0].y; }
  for (int i = 1; i < 4; i++) {
    float2 a = u_falloff[i - 1];
    float2 b = u_falloff[i];
    if (t <= b.x) {
      float k = (t - a.x) / max(b.x - a.x, 0.00001);
      return mix(a.y, b.y, k);
    }
  }
  return 0.0;
}

float hash(float2 p) {
  return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453);
}

float vnoise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  float2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + float2(1.0, 0.0)), u.x),
             mix(hash(i + float2(0.0, 1.0)), hash(i + float2(1.0, 1.0)), u.x), u.y);
}

// Quatre octaves : au-dela on ajoute du detail qu'un fond flou avale, et on
// paie quand meme le cout par pixel.
float fbm(float2 p) {
  float amp = 0.5;
  float sum = 0.0;
  for (int i = 0; i < 4; i++) {
    sum += amp * vnoise(p);
    p = p * 2.02;
    amp = amp * 0.5;
  }
  return sum;
}

// Bruit a gradient entrelace (Jimenez) : le tramage anti-banding. Il doit
// rester INVISIBLE — c'est du +/- 0,5 niveau, pas de la texture.
float ign(float2 p) {
  return fract(52.9829189 * fract(0.06711056 * p.x + 0.00583715 * p.y));
}

half3 over(half3 dst, half3 src, float a) {
  return dst * (1.0 - half(a)) + src * half(a);
}

half4 main(float2 xy) {
  float2 uv = xy / u_res;
  float t = u_time;

  // La frontiere bruitee, commune a tous les foyers : un seul champ de bruit,
  // sinon chaque foyer se deforme dans son coin et le fond se decoud.
  float cloud = fbm(uv * float2(2.6, 1.5) + float2(t * 0.014, t * 0.008)) - 0.5;

  half3 c = u_base;

  // ── LA BANDE ────────────────────────────────────────────────────────────
  // Pleine largeur, ancree sous la couture, eteinte avant la mi-page. C'est
  // la FORME de Discord : un degrade vertical qui part du bas de la banniere
  // et descend — donc rien de rond, rien qui se lise comme une tache.
  //
  // Peinte AVANT les foyers : elle porte la masse de couleur, les foyers ne
  // font plus que la matiere par-dessus.
  {
    float bt = clamp((uv.y - u_band.x) / max(u_band.y, 0.0001), 0.0, 1.0);
    // Chute convexe : lineaire, on lirait un aplat degrade ; raide puis
    // longue, on lit une source.
    c = over(c, mix(u_bandTop, u_bandBottom, half(bt)), u_band.w * pow(1.0 - bt, u_band.z));
  }

  for (int i = 0; i < ${MAX_SOURCES}; i++) {
    float gain = u_srcMove[i].x;
    if (gain > 0.0) {
      float lane = u_srcMove[i].y;
      float period = max(u_srcMove[i].z, 0.001);
      float scaleTo = u_srcMove[i].w;

      float ph = sin(TAU * t / period);
      float sc = 1.0 + (scaleTo - 1.0) * (0.5 + 0.5 * ph);

      // La composante verticale est plus courte : un foyer qui monte et
      // descend autant qu'il glisse se lit comme un flottement.
      float2 ctr = u_src[i].xy + float2(0.045 * lane * ph, 0.019 * lane * ph);
      float2 d = (uv - ctr) / max(u_src[i].zw * sc, float2(0.0001));
      float r = length(d);

      // LE point de ce moteur : le rayon est module par le bruit, donc le
      // contour n'est plus une ellipse. C'est la seule chose qui separe une
      // matiere d'un degrade.
      r = r * (1.0 + u_turb * cloud);

      float a = falloff(r) * gain;
      if (a > 0.0) {
        half3 tone = mix(u_srcCol[i], u_srcCore[i], half(1.0 - smoothstep(0.0, 0.10, r)));
        c = over(c, tone, a);
      }
    }
  }

  // La nappe speculaire : elle traverse, lentement. Volontairement lente et
  // non un eclat bref — ce champ est derriere du texte qu'on lit.
  {
    float period = max(u_sheenMove.y, 0.001);
    float swing = sin(TAU * t / period) * u_sheenMove.z;
    float2 d = (uv - float2(u_sheen.x + swing, u_sheen.y)) / max(u_sheen.zw, float2(0.0001));
    c = over(c, u_sheenCol, falloff(length(d)) * u_sheenMove.x);
  }

  // Le repere IMMOBILE. La profondeur nait du contraste entre ce qui derive
  // et ce qui reste plante.
  {
    float2 d = (uv - u_rim.xy) / max(u_rim.zw, float2(0.0001));
    float r = length(d);
    c = over(c, mix(u_rimCol, u_rimCore, half(1.0 - smoothstep(0.0, 0.10, r))), falloff(r) * u_rimGain);
  }

  // Grain de film. Tres faible, et proportionnel a la LUMIERE presente : du
  // grain sur une zone eteinte serait de la salissure sur le fond de l'app.
  float lit = clamp(length(float3(c - u_base)) * 6.0, 0.0, 1.0);
  float g = (vnoise(xy * 1.7) - 0.5) * u_grain * lit;
  c = c + half3(g);

  // Tramage anti-banding, en dernier, sur la couleur finale.
  c = c + half3(float((1.0 / 255.0) * ign(xy) - (0.5 / 255.0)));

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
}

export default function ThemeSkia({
  kind, accent, secondary, factor, bannerHeight, height, base,
}: ThemeSkiaProps) {
  if (!K) return null;

  const effect = useMemo(() => K.Skia.RuntimeEffect.Make(SKSL) ?? null, []);
  // La taille reelle de la surface, remontee par Skia. Sans elle, `xy / u_res`
  // diviserait par une constante et le champ serait cadre au hasard.
  const size = useSharedValue({ width: 1, height: 1 });
  const clock = K.useClock();
  const tone = isDarkTheme() ? TONE.dark : TONE.light;

  const constants = useMemo(() => {
    const seam = Math.min(0.46, Math.max(0.06, bannerHeight / Math.max(height, 1)));
    const sources = fieldOf(kind, accent, secondary, seam);

    const src: number[] = [];
    const srcCol: number[] = [];
    const srcCore: number[] = [];
    const srcMove: number[] = [];

    for (let i = 0; i < MAX_SOURCES; i += 1) {
      const s = sources[i];
      if (!s) {
        // Foyer absent : gain nul plutôt que sortie de boucle. SkSL ne
        // garantit pas les bornes non constantes, et trois tours ne coûtent
        // rien face à un `fbm` à quatre octaves.
        src.push(0, 0, 1, 1);
        srcCol.push(0, 0, 0);
        srcCore.push(0, 0, 0);
        srcMove.push(0, 0, 1, 1);
        continue;
      }
      src.push(s.cx, s.cy, s.rx, s.ry);
      srcCol.push(...rgb(s.color));
      srcCore.push(...rgb(towardWhite(s.color, tone.core)));
      srcMove.push(cap(s.gain * tone.gain * factor), s.lane, s.period, s.scaleTo);
    }

    return {
      u_base: rgb(base || colors.bg),
      u_turb: TURBULENCE[kind],
      // Le grain suit l'intensité choisie : un thème « Discret » qui grainerait
      // autant qu'un « Intense » ne serait plus discret.
      u_grain: 0.012 * factor,
      u_src: src,
      u_srcCol: srcCol,
      u_srcCore: srcCore,
      u_srcMove: srcMove,
      u_band: [seam, BAND_HEIGHT, BAND_CURVE, cap(LAYER.band * tone.gain * factor)],
      u_bandTop: rgb(accent),
      u_bandBottom: rgb(secondary),
      u_rim: [0.5, seam, 0.34, 0.12],
      u_rimCol: rgb(accent),
      u_rimCore: rgb(towardWhite(accent, tone.rimKeep)),
      u_rimGain: cap(LAYER.rim * tone.rim * factor),
      u_sheen: [0.5, seam + 0.1, 0.4, 0.2],
      u_sheenCol: rgb(towardWhite(accent, tone.sheenKeep)),
      u_sheenMove: [cap(LAYER.sheen * tone.sheen * factor), kind === 'mesh' ? 9.5 : 16, 0.34],
      u_falloff: FALLOFF.flatMap(([x, y]) => [x, y]),
    };
  }, [kind, accent, secondary, factor, bannerHeight, height, base, tone]);

  /**
   * « Réduire les animations » fige l'horloge — mais pas à zéro : à zéro,
   * tous les profils auraient exactement la même image, et le bruit se
   * lirait comme un motif figé identique partout.
   */
  const still = isReduceMotionEnabled();

  const uniforms = useDerivedValue(
    () => ({
      ...constants,
      u_time: still ? 4.2 : clock.value / 1000,
      u_res: [Math.max(1, size.value.width), Math.max(1, size.value.height)],
    }),
    [constants, still],
  );

  if (!effect || !Canvas) return null;

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none" onSize={size} opaque>
      <Fill>
        <Shader source={effect} uniforms={uniforms} />
      </Fill>
    </Canvas>
  );
}
