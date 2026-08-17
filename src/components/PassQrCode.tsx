import React, { useMemo } from 'react';
import { View, ViewStyle } from 'react-native';
import Svg, { G, Path, Rect } from 'react-native-svg';

import { LOGO_PATH } from '../assets/injectionArt';
import type { QrMatrix } from '../services/eventPassService';

/**
 * Le code QR d'une place, dessiné à partir de la matrice reçue du serveur.
 *
 * ── Ce que ce fichier ne fait PAS ─────────────────────────────────────────
 * Il n'encode rien. La matrice arrive déjà faite (`pass.qr`), produite par
 * l'encodeur de l'API — le seul que des specs relisent avec un vrai décodeur.
 * Une seconde implémentation ici serait la même erreur de polynôme
 * Reed-Solomon à repayer, en silence : un code QR faux se dessine exactement
 * comme un code QR juste.
 *
 * ── Trois règles de lisibilité, non négociables ───────────────────────────
 *   • les modules restent SOMBRES sur fond CLAIR — l'inverse fait échouer une
 *     bonne partie des lecteurs ;
 *   • la zone de silence de quatre modules est intégrale ;
 *   • aucune couleur claire ne rentre dans le code. Le palier habille la
 *     CARTE, jamais le code : posé en or sur les pupilles de repérage, le
 *     motif que le lecteur cherche en premier disparaît, et la place cesse
 *     d'être scannable sans que rien ne se voie à l'œil. `safeCodeColor`
 *     rabat toute couleur trop claire sur le magenta.
 *
 * La géométrie (modules arrondis, anneaux de repérage, fenêtre du logo) reprend
 * `api/src/services/eventPass/passArt.js` : la place affichée dans l'app et la
 * place imprimée doivent être la même image.
 */

const INK = '#0E0E10';
const PAPER = '#FFFFFF';
const MAGENTA = '#FE2C55';

/** Boîte réelle de la silhouette dans son carré de 1600 (voir injectionArt). */
const LOGO_BOX = { x: 207, y: 56, width: 1189.15, height: 1415.99 };

const QUIET = 4;

interface Corners {
  tl: number;
  tr: number;
  br: number;
  bl: number;
}

/** Luminance relative (WCAG) d'une couleur `#rrggbb`. */
function relativeLuminance(hex: string): number {
  const value = String(hex).replace('#', '');
  if (value.length !== 6) return 0;
  const channel = (part: string) => {
    const c = Number.parseInt(part, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(value.slice(0, 2))
    + 0.7152 * channel(value.slice(2, 4))
    + 0.0722 * channel(value.slice(4, 6));
}

/** Même seuil que le serveur : au-delà, un lecteur ne lit plus « sombre ». */
function safeCodeColor(color: string, fallback: string): string {
  return relativeLuminance(color) <= 0.22 ? color : fallback;
}

/**
 * Rayons des quatre coins d'un module, selon ses voisins : un module isolé est
 * une pastille, deux modules côte à côte se soudent. C'est ce qui donne l'aspect
 * « gouttes » sans jamais séparer deux modules qui doivent se toucher.
 */
function moduleCorners(
  isDark: (row: number, col: number) => boolean,
  row: number,
  col: number,
  radius: number,
): Corners {
  const top = isDark(row - 1, col);
  const bottom = isDark(row + 1, col);
  const left = isDark(row, col - 1);
  const right = isDark(row, col + 1);
  return {
    tl: !top && !left ? radius : 0,
    tr: !top && !right ? radius : 0,
    br: !bottom && !right ? radius : 0,
    bl: !bottom && !left ? radius : 0,
  };
}

function roundedRectPath(x: number, y: number, w: number, h: number, corners: Corners): string {
  const { tl, tr, br, bl } = corners;
  return [
    `M${x + tl},${y}`,
    `H${x + w - tr}`,
    tr ? `A${tr},${tr} 0 0 1 ${x + w},${y + tr}` : '',
    `V${y + h - br}`,
    br ? `A${br},${br} 0 0 1 ${x + w - br},${y + h}` : '',
    `H${x + bl}`,
    bl ? `A${bl},${bl} 0 0 1 ${x},${y + h - bl}` : '',
    `V${y + tl}`,
    tl ? `A${tl},${tl} 0 0 1 ${x + tl},${y}` : '',
    'Z',
  ].filter(Boolean).join(' ');
}

/** Anneau de repérage : un carré arrondi évidé, dessiné en une seule passe. */
function finderRing(x: number, y: number, unit: number): string {
  const outer = unit * 7;
  const r = unit * 2.1;
  const inset = unit;
  const innerSize = outer - inset * 2;
  const innerR = Math.max(0, r - inset * 0.8);
  return [
    `M${x + r},${y}`,
    `H${x + outer - r}`,
    `A${r},${r} 0 0 1 ${x + outer},${y + r}`,
    `V${y + outer - r}`,
    `A${r},${r} 0 0 1 ${x + outer - r},${y + outer}`,
    `H${x + r}`,
    `A${r},${r} 0 0 1 ${x},${y + outer - r}`,
    `V${y + r}`,
    `A${r},${r} 0 0 1 ${x + r},${y}`,
    'Z',
    `M${x + inset + innerR},${y + inset}`,
    `A${innerR},${innerR} 0 0 0 ${x + inset},${y + inset + innerR}`,
    `V${y + inset + innerSize - innerR}`,
    `A${innerR},${innerR} 0 0 0 ${x + inset + innerR},${y + inset + innerSize}`,
    `H${x + inset + innerSize - innerR}`,
    `A${innerR},${innerR} 0 0 0 ${x + inset + innerSize},${y + inset + innerSize - innerR}`,
    `V${y + inset + innerR}`,
    `A${innerR},${innerR} 0 0 0 ${x + inset + innerSize - innerR},${y + inset}`,
    'Z',
  ].join(' ');
}

function isFinderZone(row: number, col: number, size: number): boolean {
  const inBox = (r0: number, c0: number) => row >= r0 && row < r0 + 7 && col >= c0 && col < c0 + 7;
  return inBox(0, 0) || inBox(0, size - 7) || inBox(size - 7, 0);
}

interface Geometry {
  modules: string;
  rings: string;
  pupils: string;
  logo: { x: number; y: number; size: number; pad: number } | null;
}

/**
 * Tous les tracés du code, dans un carré de `side` unités — zone de silence
 * comprise. Tout est concaténé en trois chemins et non en un élément par
 * module : une version 5 compte 1369 modules, et autant de vues natives
 * suffisent à faire ramer l'écran d'une place.
 */
function buildGeometry(matrix: QrMatrix, side: number, withLogo: boolean): Geometry {
  const { size, rows } = matrix;
  const unit = side / (size + QUIET * 2);
  const originX = unit * QUIET;
  const originY = unit * QUIET;

  // Fenêtre du logo, en modules : impaire pour rester centrée sur la grille.
  // Même calcul que le serveur — c'est cette proportion-là que les specs de
  // l'API relisent dans un décodeur, correction H comprise.
  let hole: { start: number; end: number; span: number } | null = null;
  if (withLogo) {
    let span = Math.round(size * 0.19);
    if (span % 2 !== size % 2) span += 1;
    const start = Math.floor((size - span) / 2);
    hole = { start, end: start + span - 1, span };
  }

  const inHole = (row: number, col: number) => !!hole
    && row >= hole.start && row <= hole.end
    && col >= hole.start && col <= hole.end;

  const rawDark = (row: number, col: number) => (
    row >= 0 && col >= 0 && row < size && col < size && rows[row][col] === '1'
  );
  // Les voisins qui comptent pour l'arrondi : un module de repérage ou masqué
  // par le logo n'est pas dessiné ici, il ne doit donc pas souder son voisin.
  const drawnDark = (row: number, col: number) => (
    rawDark(row, col) && !isFinderZone(row, col, size) && !inHole(row, col)
  );

  const radius = unit * 0.46;
  const paths: string[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (!drawnDark(row, col)) continue;
      paths.push(roundedRectPath(
        originX + col * unit,
        originY + row * unit,
        unit,
        unit,
        moduleCorners(drawnDark, row, col, radius),
      ));
    }
  }

  const finders = [
    { row: 0, col: 0 },
    { row: 0, col: size - 7 },
    { row: size - 7, col: 0 },
  ];

  const rings = finders
    .map((f) => finderRing(originX + f.col * unit, originY + f.row * unit, unit))
    .join(' ');

  const pupils = finders
    .map((f) => roundedRectPath(
      originX + (f.col + 2) * unit,
      originY + (f.row + 2) * unit,
      unit * 3,
      unit * 3,
      { tl: unit * 0.9, tr: unit * 0.9, br: unit * 0.9, bl: unit * 0.9 },
    ))
    .join(' ');

  let logo: Geometry['logo'] = null;
  if (hole) {
    const holeSize = hole.span * unit;
    logo = {
      x: originX + hole.start * unit,
      y: originY + hole.start * unit,
      size: holeSize,
      pad: holeSize * 0.16,
    };
  }

  return { modules: paths.join(' '), rings, pupils, logo };
}

interface Props {
  matrix: QrMatrix;
  /** Côté du carré rendu, en points. */
  size: number;
  /** Teinte des pupilles et de la marque. Rabattue si elle est trop claire. */
  accent?: string;
  /** Réserve le centre pour la silhouette de la marque. */
  logo?: boolean;
  /** Fond du panneau. Clair, toujours — voir l'en-tête du fichier. */
  background?: string;
  style?: ViewStyle;
}

function PassQrCode({
  matrix,
  size,
  accent = MAGENTA,
  logo = true,
  background = PAPER,
  style,
}: Props) {
  const safeAccent = safeCodeColor(accent, MAGENTA);

  // Le calcul parcourt la matrice module par module : il ne se refait qu'au
  // changement de place ou de taille, pas à chaque rendu de l'écran.
  const geometry = useMemo(
    () => buildGeometry(matrix, 1000, logo),
    [matrix, logo],
  );

  const logoScale = geometry.logo
    ? Math.min(geometry.logo.size / LOGO_BOX.width, geometry.logo.size / LOGO_BOX.height)
    : 0;

  return (
    <View style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox="0 0 1000 1000">
        <Rect x={0} y={0} width={1000} height={1000} rx={60} fill={background} />
        <Path d={geometry.modules} fill={INK} />
        <Path d={geometry.rings} fill={INK} fillRule="evenodd" />
        <Path d={geometry.pupils} fill={safeAccent} />

        {geometry.logo ? (
          <>
            <Rect
              x={geometry.logo.x - geometry.logo.pad}
              y={geometry.logo.y - geometry.logo.pad}
              width={geometry.logo.size + geometry.logo.pad * 2}
              height={geometry.logo.size + geometry.logo.pad * 2}
              rx={geometry.logo.size * 0.3}
              fill={background}
            />
            <G
              transform={
                `translate(${geometry.logo.x + (geometry.logo.size - LOGO_BOX.width * logoScale) / 2 - LOGO_BOX.x * logoScale},`
                + `${geometry.logo.y + (geometry.logo.size - LOGO_BOX.height * logoScale) / 2 - LOGO_BOX.y * logoScale}) `
                + `scale(${logoScale})`
              }
            >
              <Path d={LOGO_PATH} fill={safeAccent} />
            </G>
          </>
        ) : null}
      </Svg>
    </View>
  );
}

export default React.memo(PassQrCode);
