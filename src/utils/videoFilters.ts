import { FilterType } from 'react-native-video';

/**
 * Catalogue des filtres vidéo — source unique côté app.
 *
 * Chaque entrée existe en DEUX exemplaires : un CIFilter appliqué en aperçu
 * par `react-native-video` (iOS), et une chaîne ffmpeg appliquée au rendu par
 * l'API (`videoEditService.js`). Les clés sont volontairement identiques des
 * deux côtés : c'est la clé qui voyage dans la requête, jamais la chaîne.
 *
 * ⚠️ Toute modification ici doit être répercutée dans `FILTERS` côté API.
 * Deux listes qui divergent donneraient un aperçu mensonger — l'utilisateur
 * choisirait un rendu et en recevrait un autre, ce qui est pire que de ne pas
 * proposer de filtre.
 *
 * L'aperçu n'est pas une approximation : `filter` passe un vrai CIFilter à la
 * couche de lecture. Un calque de couleur translucide, la solution habituelle
 * en React Native, n'aurait jamais pu rendre un noir et blanc.
 */
export interface VideoFilter {
  /** Identifiant transmis à l'API. */
  id: string;
  label: string;
  /** `undefined` = image d'origine. */
  preview?: FilterType;
}

export const VIDEO_FILTERS: VideoFilter[] = [
  { id: 'none', label: 'Original' },
  { id: 'chrome', label: 'Vif', preview: FilterType.CHROME },
  { id: 'transfer', label: 'Chaud', preview: FilterType.TRANSFER },
  { id: 'process', label: 'Froid', preview: FilterType.PROCESS },
  { id: 'fade', label: 'Fané', preview: FilterType.FADE },
  { id: 'instant', label: 'Instant', preview: FilterType.INSTANT },
  { id: 'mono', label: 'N&B', preview: FilterType.MONO },
  { id: 'noir', label: 'Noir', preview: FilterType.NOIR },
  { id: 'tonal', label: 'Tonal', preview: FilterType.TONAL },
  { id: 'sepia', label: 'Sépia', preview: FilterType.SEPIA },
];

export function filterById(id: string): VideoFilter {
  return VIDEO_FILTERS.find((entry) => entry.id === id) || VIDEO_FILTERS[0];
}

// ─── Textes incrustés ────────────────────────────────────────────────────────

/**
 * Un texte posé sur la vidéo.
 *
 * Position et taille sont des FRACTIONS du cadre (0..1), jamais des pixels :
 * l'aperçu s'affiche dans un cadre à la taille de l'écran, le rendu se fait en
 * 720×1280. Seules des fractions survivent à ce changement d'échelle.
 */
export type TextAlign = 'left' | 'center' | 'right';

export interface VideoOverlay {
  id: string;
  text: string;
  x: number;
  y: number;
  /** Hauteur de police, en fraction de la hauteur du cadre. */
  size: number;
  color: string;
  /** `null` = pas de pavé derrière le texte. */
  background: string | null;
  /** Alignement des lignes entre elles, pas position du bloc. */
  align: TextAlign;
}

/** Palette de TikTok — blanc en tête, puis les teintes vives. */
export const TEXT_COLORS = [
  '#FFFFFF', '#000000', '#FE2C55', '#FF8A00', '#FFE600',
  '#25F4EE', '#00C853', '#2979FF', '#AA00FF', '#FF4081',
];

/** Tailles proposées, en fraction de la hauteur du cadre. */
export const TEXT_SIZES = [0.035, 0.05, 0.07, 0.095];

/**
 * Bornes du pincement à deux doigts.
 *
 * Identiques au `clamp` de `sanitizeOverlays` côté API : pincer au-delà
 * donnerait un aperçu que le rendu ramènerait silencieusement dans ces bornes.
 */
export const TEXT_SIZE_MIN = 0.02;
export const TEXT_SIZE_MAX = 0.2;

/** Cadre de rendu côté serveur — sert à convertir fractions ↔ pixels. */
export const FRAME_WIDTH = 720;
export const FRAME_HEIGHT = 1280;

/**
 * Mêmes constantes que l'API : la largeur moyenne d'un caractère de Montserrat
 * ExtraBold, et la marge latérale conservée. Elles servent au repli des lignes,
 * qui doit produire EXACTEMENT les mêmes coupures des deux côtés.
 */
const GLYPH_WIDTH_RATIO = 0.58;
export const SIDE_MARGIN = 0.06;

/**
 * Marge du pavé de fond autour du texte, en fraction de la taille de police.
 *
 * C'est la valeur passée à `boxborderw` par l'API. Elle vit ici parce que
 * l'aperçu doit dessiner EXACTEMENT le même pavé : c'est tout l'intérêt d'un
 * aperçu, et une divergence se voit immédiatement sur un fond blanc.
 */
export const BOX_PADDING_RATIO = 0.22;

/**
 * Réplique de `wrapText` côté API — voir la note là-bas.
 *
 * Dupliquer une fonction est un coût assumé : la seule alternative serait que
 * le téléphone demande au serveur de calculer le repli avant chaque frappe.
 */
export function wrapOverlayText(text: string, fontSizePx: number): string[] {
  const usableWidth = FRAME_WIDTH * (1 - 2 * SIDE_MARGIN);
  const maxChars = Math.max(6, Math.floor(usableWidth / (fontSizePx * GLYPH_WIDTH_RATIO)));

  const lines: string[] = [];
  let current = '';

  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (word.length > maxChars) {
      let rest = word;
      while (rest.length > maxChars) {
        lines.push(rest.slice(0, maxChars));
        rest = rest.slice(maxChars);
      }
      current = rest;
    } else {
      current = word;
    }
  }
  if (current) lines.push(current);

  return lines.slice(0, 6);
}

/** Ce que l'API attend : pas d'`id`, il ne lui sert à rien. */
export function serializeOverlays(overlays: VideoOverlay[]): string {
  return JSON.stringify(
    overlays
      .filter((overlay) => overlay.text.trim().length > 0)
      .map(({ text, x, y, size, color, background, align }) => ({
        text: text.trim(), x, y, size, color, background, align,
      })),
  );
}
