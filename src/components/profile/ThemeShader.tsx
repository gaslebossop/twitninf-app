import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { colors, isDarkTheme, towardWhite } from '../../theme';
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
 * Le fond de thème, en vrai GLSL.
 *
 * ── Pourquoi un shader, alors que la version SVG marche ──────────────────
 *
 * `ThemeMaterial` empile des dégradés `react-native-svg`. Ça donne des formes
 * justes, et ça bute sur quatre choses que seul un calcul par pixel règle :
 *
 *  1. **Le banding.** Un dégradé sombre de 780 px sur 8 bits ne dispose que de
 *     256 niveaux : une marche tous les 5 ou 6 px, parfaitement visible sur un
 *     fond presque noir. C'est LE défaut qui fait « cheap » sur les grands
 *     aplats, et aucun réglage d'opacité ne l'enlève — il faut du **bruit à
 *     ±0,5 LSB**, donc un shader. C'est le gain principal ici.
 *  2. **La composition.** Cinq calques SVG semi-transparents empilés, c'est
 *     cinq `over` successifs faits par le compositeur, chacun arrondi à 8 bits.
 *     Ici les foyers se composent en flottant et n'arrondissent qu'une fois,
 *     tout à la fin.
 *  3. **La finesse des radiaux.** Android rastérise les dégradés SVG avec
 *     nettement moins de pas qu'iOS — le même thème n'a pas la même douceur
 *     des deux côtés. Un shader donne exactement la même image partout.
 *  4. **Le coût.** Un calque SVG animé se re-compose à chaque frame côté vue ;
 *     ici c'est un quad plein écran et une dizaine d'opérations par pixel,
 *     entièrement sur le GPU, sans une seule transformation de vue.
 *
 * ── Pourquoi `expo-gl` et pas Skia ───────────────────────────────────────
 *
 * Skia ferait sortir l'app d'Expo Go et ajouterait une dépendance native.
 * `expo-gl` est **déjà installé et déjà en production** (les rouleaux du
 * Casino), il est dans le SDK Expo — donc disponible en dev build ET en Expo
 * Go — et un fragment shader plein écran n'a besoin d'aucune couche par-dessus.
 * On obtient le vrai shader sans changer le mode de développement de personne.
 *
 * ── Pourquoi le rendu est OPAQUE ─────────────────────────────────────────
 *
 * Une surface GL transparente n'est pas fiable de la même façon des deux
 * côtés — la surface Android est opaque par défaut, et un alpha qui ne
 * traverse pas se voit comme un rectangle noir sur tout le haut du profil.
 * Le champ peint donc lui-même sa couleur de fond (`base`) et compose la
 * lumière par-dessus. Comme cette couleur est exactement celle de la page,
 * la jonction est invisible — et le tramage porte alors sur la couleur
 * FINALE, c'est-à-dire là où le banding se produit réellement.
 *
 * `base` est une prop et non `colors.bg` en dur : l'aperçu de l'écran de
 * personnalisation pose ce champ sur `colors.surface`, pas sur le fond
 * d'écran. Un défaut codé en dur y dessinerait un rectangle plus sombre.
 *
 * ── Le dosage ne vit PAS ici ─────────────────────────────────────────────
 *
 * Toutes les opacités viennent de `themeBudget`, exactement comme pour la
 * version SVG, et sont calculées en JS avant d'être passées en uniformes.
 * `tests/profile-theme-budget` continue donc de garder le couple « assez fort
 * pour se voir / éteint à mi-page », et les deux implémentations ne peuvent
 * pas diverger sur le point qui a coûté quatre sessions.
 */

export interface ThemeShaderProps {
  kind: ThemeMaterialKind;
  accent: string;
  secondary: string;
  /** Multiplicateur d'intensité (Discret / Normal / Intense). */
  factor: number;
  /** Hauteur de la bande bannière, en px. */
  bannerHeight: number;
  /** Hauteur totale du champ, en px. */
  height: number;
  /**
   * Couleur sur laquelle le champ est posé. Le shader la peint lui-même :
   * voir « Pourquoi le rendu est OPAQUE ».
   */
  base?: string;
  /** Remonté quand le contexte GL ne peut pas être créé — on retombe en SVG. */
  onUnavailable?: () => void;
}

/* ── Couleurs ───────────────────────────────────────────────────────────── */

/**
 * Hex → RGB 0..1. Ne gère QUE l'hexadécimal, et c'est volontaire : tout ce
 * qui entre ici passe par `towardWhite` ou par la palette, qui rendent du hex
 * depuis la correction d'août (une version antérieure rendait du `rgb(…)`, et
 * c'est ce qui avait fait sortir une nappe à 6 % en dalle opaque). Un format
 * inattendu retombe sur du gris moyen plutôt que de faire planter le shader.
 */
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

const cap = (a: number) => Math.min(Math.max(a, 0), BUDGET);

/* ── Géométrie des foyers ───────────────────────────────────────────────── */

type Source = {
  /** Centre et rayons, en fraction du champ (0..1). */
  cx: number; cy: number; rx: number; ry: number;
  color: string;
  gain: number;
  /** Sens de dérive. `0` ne dérive pas, il ne fait que respirer. */
  lane: number;
  /** Période, en secondes. */
  period: number;
  scaleTo: number;
};

const MAX_SOURCES = 3;

/**
 * Les mêmes trois géométries que `ThemeMaterial`, exprimées en fraction du
 * champ plutôt qu'en unités de `viewBox`. Le catalogue est gelé : « Dégradé »,
 * « Halo » et « Nébuleuse » ne diffèrent que par la disposition de leurs
 * foyers et leur mouvement.
 *
 * `seam` est la couture bannière / avatar. Elle compte : au-dessus d'elle une
 * photo de bannière opaque masque tout, donc la lumière posée là est dépensée
 * derrière une image.
 */
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

/* ── Le shader ──────────────────────────────────────────────────────────── */

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;

varying vec2 v_uv;

uniform float u_time;
uniform vec3  u_base;

// Foyers : centre + rayons, couleur, coeur eclairci, et le mouvement.
uniform vec4 u_src[${MAX_SOURCES}];       // cx, cy, rx, ry
uniform vec3 u_srcCol[${MAX_SOURCES}];
uniform vec3 u_srcCore[${MAX_SOURCES}];
uniform vec4 u_srcMove[${MAX_SOURCES}];   // gain, lane, period, scaleTo

// Le repere IMMOBILE, et la nappe speculaire.
uniform vec4 u_rim;
uniform vec3 u_rimCol;
uniform vec3 u_rimCore;
uniform float u_rimGain;

uniform vec4 u_sheen;
uniform vec3 u_sheenCol;
uniform vec3 u_sheenMove;                 // gain, period, course

// Le profil de chute, tel quel depuis themeBudget.
uniform vec2 u_falloff[4];

const float TAU = 6.28318530718;

/*
 * La chute, point par point — exactement la meme polyligne que les <Stop> du
 * chemin SVG. C'est ce qui garantit que les deux implementations ne peuvent
 * pas deriver : le profil vit dans themeBudget, et le test l'y verifie.
 *
 * Elle est CONVEXE, et ce n'est pas un detail de gout : une chute lineaire se
 * lit comme un aplat degrade, une chute raide puis longue se lit comme une
 * SOURCE. C'est la difference entre une peinture et une lumiere.
 */
float falloff(float t) {
  if (t <= u_falloff[0].x) return u_falloff[0].y;
  for (int i = 1; i < 4; i++) {
    vec2 a = u_falloff[i - 1];
    vec2 b = u_falloff[i];
    if (t <= b.x) {
      float k = (t - a.x) / max(b.x - a.x, 1e-5);
      return mix(a.y, b.y, k);
    }
  }
  return 0.0;
}

/*
 * Bruit a gradient entrelace (Jorge Jimenez). Une ligne, aucune texture, et
 * c'est le seul remede au banding : on decale chaque pixel d'un demi-niveau
 * au plus, ce qui casse les marches sans jamais devenir du grain visible.
 * Amplitude 1/255 centree, donc +/- 0,5 LSB.
 */
float ign(vec2 p) {
  return fract(52.9829189 * fract(0.06711056 * p.x + 0.00583715 * p.y));
}

/* Composition « source over », en flottant : une seule quantification, a la fin. */
vec3 over(vec3 dst, vec3 src, float a) {
  return dst * (1.0 - a) + src * a;
}

/*
 * Un foyer. Le coeur eclairci est COURT — un point de lumiere est un point.
 * Etale sur le quart du rayon, ce n'est plus un reflet, c'est du brouillard :
 * le champ vire au lait et toute la gradation disparait. La couleur pleine a
 * repris la main a 10 % du rayon.
 */
vec3 light(vec3 dst, vec2 uv, vec4 geom, vec3 col, vec3 core, vec4 move, float t) {
  float gain = move.x;
  if (gain <= 0.0) return dst;

  float lane = move.y;
  float period = max(move.z, 0.001);
  float scaleTo = move.w;

  float ph = sin(TAU * t / period);
  float sc = 1.0 + (scaleTo - 1.0) * (0.5 + 0.5 * ph);

  // La composante verticale est plus courte que l'horizontale : un foyer qui
  // monte et descend autant qu'il glisse se lit comme un flottement.
  vec2 c = geom.xy + vec2(0.045 * lane * ph, 0.019 * lane * ph);
  vec2 d = (uv - c) / max(geom.zw * sc, vec2(1e-4));
  float r = length(d);

  float a = falloff(r) * gain;
  if (a <= 0.0) return dst;

  vec3 tone = mix(col, core, 1.0 - smoothstep(0.0, 0.10, r));
  return over(dst, tone, a);
}

void main() {
  vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);
  float t = u_time;

  vec3 c = u_base;

  for (int i = 0; i < ${MAX_SOURCES}; i++) {
    c = light(c, uv, u_src[i], u_srcCol[i], u_srcCore[i], u_srcMove[i], t);
  }

  // La nappe speculaire : elle TRAVERSE, lentement. Volontairement lente et
  // non un eclat rapide : ce champ est derriere du texte qu'on lit, et un
  // mouvement bref et net y volerait le regard a chaque passage.
  {
    float period = max(u_sheenMove.y, 0.001);
    float swing = sin(TAU * t / period) * u_sheenMove.z;
    vec2 d = (uv - vec2(u_sheen.x + swing, u_sheen.y)) / max(u_sheen.zw, vec2(1e-4));
    float r = length(d);
    float a = falloff(r) * u_sheenMove.x;
    c = over(c, u_sheenCol, a);
  }

  // Le repere IMMOBILE. Si tout derive ensemble on ne voit qu'un fond qui
  // glisse ; la profondeur nait du contraste entre ce qui bouge et ce qui
  // reste plante.
  {
    vec2 d = (uv - u_rim.xy) / max(u_rim.zw, vec2(1e-4));
    float r = length(d);
    float a = falloff(r) * u_rimGain;
    c = over(c, mix(u_rimCol, u_rimCore, 1.0 - smoothstep(0.0, 0.10, r)), a);
  }

  c += (1.0 / 255.0) * ign(gl_FragCoord.xy) - (0.5 / 255.0);

  gl_FragColor = vec4(c, 1.0);
}
`;

/* ── Le contexte GL, typé à la main ─────────────────────────────────────── */

/**
 * `ExpoWebGLRenderingContext` étend `WebGL2RenderingContext`, qui vit dans la
 * bibliothèque `dom` — et le `tsconfig` de ce projet ne charge que `es2017`.
 * Ajouter `dom` rendrait `window`, `document` et `localStorage` visibles dans
 * tout le code d'une app React Native : la porte ouverte à des appels qui
 * compilent et plantent à l'exécution.
 *
 * On déclare donc, ici seulement, le sous-ensemble réellement appelé. C'est
 * plus long qu'un `as any`, et c'est ce qui fait qu'une faute de frappe dans
 * un nom de méthode se voit à la compilation plutôt qu'à l'écran — sur un
 * fichier qu'aucun test ne peut exécuter.
 */
interface GL {
  drawingBufferWidth: number;
  drawingBufferHeight: number;
  VERTEX_SHADER: number;
  FRAGMENT_SHADER: number;
  COMPILE_STATUS: number;
  LINK_STATUS: number;
  ARRAY_BUFFER: number;
  STATIC_DRAW: number;
  FLOAT: number;
  TRIANGLES: number;
  createShader(type: number): unknown;
  shaderSource(shader: unknown, source: string): void;
  compileShader(shader: unknown): void;
  getShaderParameter(shader: unknown, pname: number): boolean;
  getShaderInfoLog(shader: unknown): string | null;
  createProgram(): unknown;
  attachShader(program: unknown, shader: unknown): void;
  linkProgram(program: unknown): void;
  getProgramParameter(program: unknown, pname: number): boolean;
  getProgramInfoLog(program: unknown): string | null;
  useProgram(program: unknown): void;
  createBuffer(): unknown;
  bindBuffer(target: number, buffer: unknown): void;
  bufferData(target: number, data: Float32Array, usage: number): void;
  getAttribLocation(program: unknown, name: string): number;
  enableVertexAttribArray(index: number): void;
  vertexAttribPointer(i: number, size: number, type: number, norm: boolean, stride: number, offset: number): void;
  getUniformLocation(program: unknown, name: string): unknown;
  uniform1f(loc: unknown, x: number): void;
  uniform2fv(loc: unknown, v: number[]): void;
  uniform3fv(loc: unknown, v: number[]): void;
  uniform4fv(loc: unknown, v: number[]): void;
  viewport(x: number, y: number, w: number, h: number): void;
  drawArrays(mode: number, first: number, count: number): void;
  flush(): void;
  endFrameEXP(): void;
}

/* ── Le composant ───────────────────────────────────────────────────────── */

export default function ThemeShader({
  kind,
  accent,
  secondary,
  factor,
  bannerHeight,
  height,
  base,
  onUnavailable,
}: ThemeShaderProps) {
  const tone = isDarkTheme() ? TONE.dark : TONE.light;

  /**
   * Tout ce qui décrit l'image, prêt à être poussé en uniformes. Le rendu lit
   * cette ref plutôt que ses props : le contexte GL est créé UNE fois, et une
   * boucle qui capturerait les props par fermeture continuerait de peindre
   * l'ancien thème après un changement de couleur.
   */
  const scene = useRef({ uniforms: null as null | Record<string, number[]> });

  scene.current.uniforms = useMemo(() => {
    const seam = Math.min(0.46, Math.max(0.06, bannerHeight / Math.max(height, 1)));
    const sources = fieldOf(kind, accent, secondary, seam);

    const src: number[] = [];
    const srcCol: number[] = [];
    const srcCore: number[] = [];
    const srcMove: number[] = [];

    for (let i = 0; i < MAX_SOURCES; i += 1) {
      const s = sources[i];
      if (!s) {
        // Un foyer absent n'est pas retiré de la boucle : on lui donne un gain
        // nul. Sortir d'une boucle sur une condition non constante n'est pas
        // garanti en GLSL ES 1.00, et trois itérations ne coûtent rien.
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
      u_src: src,
      u_srcCol: srcCol,
      u_srcCore: srcCore,
      u_srcMove: srcMove,
      u_rim: [0.5, seam, 0.34, 0.12],
      u_rimCol: rgb(accent),
      u_rimCore: rgb(towardWhite(accent, tone.rimKeep)),
      u_rimGain: [cap(LAYER.rim * tone.rim * factor)],
      u_sheen: [0.5, seam + 0.1, 0.4, 0.2],
      u_sheenCol: rgb(towardWhite(accent, tone.sheenKeep)),
      // Période longue et course large : elle traverse, elle ne clignote pas.
      u_sheenMove: [cap(LAYER.sheen * tone.sheen * factor), kind === 'mesh' ? 9.5 : 16, 0.34],
      u_falloff: FALLOFF.flatMap(([x, y]) => [x, y]),
    };
  }, [kind, accent, secondary, factor, bannerHeight, height, base, tone]);

  const frame = useRef<number | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);

  const onContextCreate = useCallback((context: ExpoWebGLRenderingContext) => {
    const gl = context as unknown as GL;
    try {
      const compile = (type: number, source: string) => {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, source);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
          throw new Error(gl.getShaderInfoLog(sh) || 'compilation du shader');
        }
        return sh;
      };

      const program = gl.createProgram();
      gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || 'édition de liens');
      }
      gl.useProgram(program);

      // Un seul quad plein écran, deux triangles, envoyé une fois pour toutes.
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW,
      );
      const aPos = gl.getAttribLocation(program, 'a_pos');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      const loc = (name: string) => gl.getUniformLocation(program, name);
      const uTime = loc('u_time');

      const setters: Record<string, (v: number[]) => void> = {
        u_base: (v) => gl.uniform3fv(loc('u_base'), v),
        u_src: (v) => gl.uniform4fv(loc('u_src'), v),
        u_srcCol: (v) => gl.uniform3fv(loc('u_srcCol'), v),
        u_srcCore: (v) => gl.uniform3fv(loc('u_srcCore'), v),
        u_srcMove: (v) => gl.uniform4fv(loc('u_srcMove'), v),
        u_rim: (v) => gl.uniform4fv(loc('u_rim'), v),
        u_rimCol: (v) => gl.uniform3fv(loc('u_rimCol'), v),
        u_rimCore: (v) => gl.uniform3fv(loc('u_rimCore'), v),
        u_rimGain: (v) => gl.uniform1f(loc('u_rimGain'), v[0]),
        u_sheen: (v) => gl.uniform4fv(loc('u_sheen'), v),
        u_sheenCol: (v) => gl.uniform3fv(loc('u_sheenCol'), v),
        u_sheenMove: (v) => gl.uniform3fv(loc('u_sheenMove'), v),
        u_falloff: (v) => gl.uniform2fv(loc('u_falloff'), v),
      };

      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

      /**
       * « Réduire les animations » ne coupe PAS le tramage : une marche
       * d'escalier dans un dégradé n'est pas du mouvement, et elle ne devient
       * pas confortable parce qu'on a désactivé les animations. Ce qui est
       * coupé, c'est la BOUCLE — on peint une image, à un instant arbitraire
       * plutôt qu'à zéro pour que tout le monde n'ait pas exactement la même,
       * et on s'arrête.
       */
      const still = isReduceMotionEnabled();

      const draw = (seconds: number) => {
        const u = scene.current.uniforms;
        if (u) Object.keys(setters).forEach((k) => u[k] && setters[k](u[k]));
        gl.uniform1f(uTime, seconds);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.flush();
        gl.endFrameEXP();
      };

      if (still) {
        draw(4.2);
        return;
      }

      const t0 = Date.now();
      const loop = () => {
        if (!alive.current) return;
        draw((Date.now() - t0) / 1000);
        frame.current = requestAnimationFrame(loop);
      };
      loop();
    } catch {
      // Pas de contexte, pas de shader : l'appelant retombe sur la version
      // SVG plutôt que d'afficher un rectangle noir en haut du profil.
      onUnavailable?.();
    }
  }, [onUnavailable]);

  return (
    <GLView
      style={StyleSheet.absoluteFill}
      onContextCreate={onContextCreate}
      pointerEvents="none"
    />
  );
}
