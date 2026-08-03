/**
 * Palette « Pulse » — identité visuelle twitninf.
 *
 * Noir plat et neutre + magenta électrique (signature de marque) + cyan
 * en accent secondaire rare. Blocs de couleur pleins, pas de verre, pas
 * de dégradés décoratifs multiples. Source de vérité unique : ne PAS
 * écrire de couleurs en dur ailleurs, importer depuis `src/theme`.
 */

export const colors = {
  // Surfaces (du plus sombre au plus clair) — noir neutre, pas de teinte bleutée
  bg: '#0A0A0A', // fond de l'application
  bgElevated: '#121212', // sections légèrement surélevées
  surface: '#161616', // cartes, champs, lignes
  surfaceAlt: '#1E1E1E', // modales, feuilles, éléments survolés
  surfaceElevated: '#242424', // cartes empilées / éléments actifs
  surfaceHover: 'rgba(255,255,255,0.06)',

  // Bordures
  border: '#2A2A2A', // hairline par défaut
  borderStrong: '#3A3A3A', // séparateur appuyé
  borderSubtle: 'rgba(255,255,255,0.08)',

  // Accent principal — magenta électrique (signature de marque)
  accent: '#FE2C55',
  accentBright: '#FF4E73',
  accentHover: '#E0234A',
  accentPressed: '#C71F40',
  accentMuted: 'rgba(254,44,85,0.16)',
  accentSoft: 'rgba(254,44,85,0.09)',
  accentGlow: 'rgba(254,44,85,0.38)',
  onAccent: '#FFFFFF',

  // Accent secondaire — cyan électrique (rare : live, liens, highlight)
  cyan: '#25F4EE',
  cyanMuted: 'rgba(37,244,238,0.16)',
  cyanSoft: 'rgba(37,244,238,0.09)',
  violet: '#25F4EE', // alias legacy → cyan (compat descendante)

  // Texte
  textPrimary: '#FFFFFF',
  textSecondary: '#A8A8A8',
  textMuted: '#6B6B6B',
  textDisabled: 'rgba(168,168,168,0.4)',

  // Sémantique
  like: '#FE2C55', // cœur — couleur de marque
  red: '#F5372B', // danger, distinct du magenta de marque
  redMuted: 'rgba(245,55,43,0.14)',
  retweet: '#22C55E',
  success: '#22C55E',
  successMuted: 'rgba(34,197,94,0.14)',
  warning: '#FFD24D',
  warningMuted: 'rgba(255,210,77,0.14)',
  gold: '#FFD24D',
  info: '#25F4EE',

  // Utilitaires
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(0,0,0,0.82)', // voile derrière les modales
  scrim: 'rgba(0,0,0,0.6)',
  shadow: '#000000',
} as const;

export type ColorToken = keyof typeof colors;

/**
 * Applique une opacité à une couleur hex (#RGB / #RRGGBB).
 * Renvoie une chaîne rgba(). Pour les couleurs déjà en rgba, renvoie tel quel.
 */
export const withAlpha = (hex: string, alpha: number): string => {
  if (!hex || hex[0] !== '#') return hex;
  let h = hex.slice(1);
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const num = parseInt(h, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

/**
 * Éclaircit une couleur vers le blanc — l'équivalent de
 * `color-mix(in srgb, <hex> <keep>%, #fff)` côté CSS, pour que les deux apps
 * puissent partager une même recette lisible des deux côtés.
 * `keep` est la part de la couleur d'origine (1 = intacte, 0 = blanc).
 */
export const towardWhite = (hex: string, keep: number): string => {
  if (!hex || hex[0] !== '#') return hex;
  let h = hex.slice(1);
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const num = parseInt(h, 16);
  const k = Math.max(0, Math.min(1, keep));
  const mix = (channel: number) => Math.round(channel * k + 255 * (1 - k));
  const r = mix((num >> 16) & 255);
  const g = mix((num >> 8) & 255);
  const b = mix(num & 255);
  return `rgb(${r}, ${g}, ${b})`;
};

/**
 * Dégradés — usage volontairement rare dans la DA « Pulse » (blocs pleins
 * par défaut). Réservés aux éléments de marque ponctuels (avatar de repli).
 */
export const gradients = {
  accent: ['#FF4E73', '#FE2C55', '#E0234A'] as [string, string, string],
  brand: ['#FE2C55', '#25F4EE'] as [string, string],
  surface: ['#1E1E1E', '#141414'] as [string, string],
  intro: ['#0A0A0A', '#121212', '#0A0A0A'] as [string, string, string],
  fade: ['rgba(10,10,10,0)', '#0A0A0A'] as [string, string],
  glow: ['rgba(254,44,85,0.22)', 'rgba(254,44,85,0)'] as [string, string],
};

export default colors;
