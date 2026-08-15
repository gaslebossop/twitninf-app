/**
 * Palette « Pulse » — identité visuelle twitninf, en sombre et en clair.
 *
 * ## Pourquoi `colors` est un objet MUTABLE
 *
 * 178 fichiers appellent `StyleSheet.create({ … colors.x … })` au niveau
 * module : ces styles sont figés au chargement du bundle, une fois pour
 * toutes. Réaffecter `colors` plus tard ne les changerait donc pas, et les
 * rendre réactifs demanderait de réécrire les 3221 usages en styles calculés
 * à chaque rendu.
 *
 * À la place, `colors` garde la même identité d'objet pour toujours et son
 * CONTENU est remplacé par `applyThemePalette()` — appelé au démarrage AVANT
 * que le moindre écran ne soit importé (voir `index.ts`). Tous les fichiers
 * existants marchent alors sans être touchés.
 *
 * Conséquence assumée : changer de thème demande un rechargement de l'app.
 * C'est le prix d'un thème qui couvre TOUS les écrans plutôt qu'une poignée.
 *
 * Source de vérité unique : ne PAS écrire de couleurs en dur ailleurs.
 */

export type ThemeName = 'dark' | 'light';

const DARK = {
  // Surfaces (du plus sombre au plus clair) — noir neutre, pas de teinte bleutée
  bg: '#0A0A0A',
  bgElevated: '#121212',
  surface: '#161616',
  surfaceAlt: '#1E1E1E',
  surfaceElevated: '#242424',
  surfaceHover: 'rgba(255,255,255,0.06)',

  // Bordures
  border: '#2A2A2A',
  borderStrong: '#3A3A3A',
  borderSubtle: 'rgba(255,255,255,0.08)',

  /**
   * Voiles posés SUR le fond. Ils remplacent les `rgba(255,255,255,0.0X)`
   * écrits en dur un peu partout : en clair il faut voiler vers le NOIR, sinon
   * du blanc sur du blanc disparaît purement et simplement.
   *
   * ⚠️ Ces valeurs sont la DÉFINITION de la palette : elles doivent rester des
   * littéraux. Les remplacer par `colors.x` créerait une auto-référence — la
   * palette se lirait elle-même avant d'exister.
   */
  overlaySoft: 'rgba(255,255,255,0.06)',
  overlayMedium: 'rgba(255,255,255,0.09)',
  overlayStrong: 'rgba(255,255,255,0.16)',
  hairline: 'rgba(255,255,255,0.10)',

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
  like: '#FE2C55',
  red: '#F5372B',
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
  overlay: 'rgba(0,0,0,0.82)',
  scrim: 'rgba(0,0,0,0.6)',
  shadow: '#000000',
};

/**
 * Clair. Ce n'est pas le sombre « inversé » : les accents sont assombris pour
 * rester lisibles sur blanc. Le magenta de marque `#FE2C55` tombe à 3,9:1 sur
 * blanc — sous le seuil de 4,5:1 pour du texte — donc l'accent passe à une
 * nuance plus profonde, alors que la version vive reste disponible pour les
 * aplats où le texte est blanc par-dessus.
 */
const LIGHT: typeof DARK = {
  bg: '#FFFFFF',
  bgElevated: '#F7F7F9',
  surface: '#F2F2F5',
  surfaceAlt: '#EAEAEF',
  surfaceElevated: '#E2E2E9',
  surfaceHover: 'rgba(0,0,0,0.05)',

  border: '#E4E4EA',
  borderStrong: '#CFCFD8',
  borderSubtle: 'rgba(0,0,0,0.08)',

  overlaySoft: 'rgba(0,0,0,0.04)',
  overlayMedium: 'rgba(0,0,0,0.06)',
  overlayStrong: 'rgba(0,0,0,0.12)',
  hairline: 'rgba(0,0,0,0.10)',

  accent: '#E11D48',
  accentBright: '#F43F5E',
  accentHover: '#BE123C',
  accentPressed: '#9F1239',
  accentMuted: 'rgba(225,29,72,0.12)',
  accentSoft: 'rgba(225,29,72,0.06)',
  accentGlow: 'rgba(225,29,72,0.28)',
  onAccent: '#FFFFFF',

  cyan: '#0891B2',
  cyanMuted: 'rgba(8,145,178,0.14)',
  cyanSoft: 'rgba(8,145,178,0.07)',
  violet: '#0891B2',

  textPrimary: '#0B0B0C',
  textSecondary: '#55555F',
  textMuted: '#84848F',
  textDisabled: 'rgba(85,85,95,0.4)',

  like: '#E11D48',
  red: '#DC2626',
  redMuted: 'rgba(220,38,38,0.10)',
  retweet: '#16A34A',
  success: '#16A34A',
  successMuted: 'rgba(22,163,74,0.12)',
  warning: '#B45309',
  warningMuted: 'rgba(180,83,9,0.12)',
  gold: '#B45309',
  info: '#0891B2',

  white: '#FFFFFF',
  black: '#000000',
  // Le voile derrière une modale reste sombre : c'est ce qui la détache.
  overlay: 'rgba(0,0,0,0.45)',
  scrim: 'rgba(0,0,0,0.32)',
  shadow: '#000000',
};

const DARK_GRADIENTS = {
  accent: ['#FF4E73', '#FE2C55', '#E0234A'] as [string, string, string],
  brand: ['#FE2C55', '#25F4EE'] as [string, string],
  surface: ['#1E1E1E', '#141414'] as [string, string],
  intro: ['#0A0A0A', '#121212', '#0A0A0A'] as [string, string, string],
  fade: ['rgba(10,10,10,0)', '#0A0A0A'] as [string, string],
  glow: ['rgba(254,44,85,0.22)', 'rgba(254,44,85,0)'] as [string, string],
};

const LIGHT_GRADIENTS: typeof DARK_GRADIENTS = {
  accent: ['#F43F5E', '#E11D48', '#BE123C'] as [string, string, string],
  brand: ['#E11D48', '#0891B2'] as [string, string],
  surface: ['#FFFFFF', '#F2F2F5'] as [string, string],
  intro: ['#FFFFFF', '#F5F5F7', '#FFFFFF'] as [string, string, string],
  fade: ['rgba(255,255,255,0)', '#FFFFFF'] as [string, string],
  glow: ['rgba(225,29,72,0.16)', 'rgba(225,29,72,0)'] as [string, string],
};

/**
 * L'objet importé partout. Son identité ne change JAMAIS — seul son contenu
 * est remplacé. C'est ce qui permet aux 178 fichiers de styles de suivre.
 */
export const colors = { ...DARK };
export const gradients = { ...DARK_GRADIENTS };

/** Thème réellement appliqué. Lu par `statusBarStyle()` et l'écran de réglage. */
export const themeState: { name: ThemeName } = { name: 'dark' };

/**
 * Remplace le contenu des palettes. À appeler AVANT le premier import d'écran
 * (voir `index.ts`) : appelé plus tard, les styles déjà figés ne bougeraient
 * pas et l'app se retrouverait à moitié dans chaque thème.
 */
export function applyThemePalette(name: ThemeName): void {
  Object.assign(colors, name === 'light' ? LIGHT : DARK);
  Object.assign(gradients, name === 'light' ? LIGHT_GRADIENTS : DARK_GRADIENTS);
  themeState.name = name;
}

export const isDarkTheme = (): boolean => themeState.name === 'dark';

/**
 * Style de la barre d'état. En clair, `light-content` rend l'heure et la
 * batterie blanches sur fond blanc — donc invisibles.
 */
export const statusBarStyle = (): 'light-content' | 'dark-content' =>
  themeState.name === 'dark' ? 'light-content' : 'dark-content';

/** Aperçus des deux thèmes, pour l'écran de comparaison. */
export const themePreviews = {
  dark: DARK,
  light: LIGHT,
} as const;

export type ColorToken = keyof typeof DARK;

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
 *
 * Renvoie du HEX, et pas du `rgb()`, pour rester composable avec `withAlpha` :
 * celui-ci laisse passer tel quel tout ce qui ne commence pas par `#`, donc un
 * `withAlpha(towardWhite(c, .5), .06)` rendait la couleur PLEINE au lieu de la
 * rendre à 6 %. Silencieux, et faux. Une nappe censée être un reflet est
 * ressortie en dalle opaque sur le profil.
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
  const pair = (channel: number) => channel.toString(16).padStart(2, '0');
  return `#${pair(r)}${pair(g)}${pair(b)}`;
};

export default colors;
