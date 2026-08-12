import { TextStyle } from 'react-native';
import { displayNameFonts } from '../theme/fonts';
import { canUseFeature, effectiveSubscriptionTier, type SubscriptionTier } from './subscriptionTier';

export const DISPLAY_NAME_FONT_KEY = 'proDisplayNameFont';
export const DISPLAY_NAME_EFFECT_KEY = 'proDisplayNameEffect';

export type DisplayNameFontId =
  | 'system'
  | 'serif'
  | 'mono'
  | 'display'
  | 'editorial'
  | 'compact'
  // Dix familles ajoutees, toutes en Bold reel (voir theme/fonts).
  | 'geometric'
  | 'rounded'
  | 'elegant'
  | 'soft'
  | 'friendly'
  | 'classic'
  | 'grotesque'
  | 'techno'
  | 'handwritten'
  | 'roman';
export type DisplayNameEffectId = 'none' | 'neon_cyan' | 'neon_magenta' | 'neon_lime' | 'neon_gold' | 'chrome';

export const DISPLAY_NAME_FONT_OPTIONS: {
  id: DisplayNameFontId;
  label: string;
  description: string;
}[] = [
  { id: 'system', label: 'Classique', description: 'Police par défaut de l’app' },
  { id: 'display', label: 'Affic.', description: 'Style poster / titrage' },
  { id: 'editorial', label: 'Éditorial', description: 'Serif élégant' },
  { id: 'serif', label: 'Serif', description: 'Classique lisible' },
  { id: 'mono', label: 'Mono', description: 'Style code / tech' },
  { id: 'compact', label: 'Compact', description: 'Géométrique serré' },
  { id: 'geometric', label: 'Montserrat', description: 'Géométrique, large' },
  { id: 'rounded', label: 'Poppins', description: 'Rond et géométrique' },
  { id: 'elegant', label: 'Raleway', description: 'Élancée, élégante' },
  { id: 'soft', label: 'Nunito', description: 'Terminaisons arrondies' },
  { id: 'friendly', label: 'Rubik', description: 'Angles adoucis' },
  { id: 'classic', label: 'Merriweather', description: 'Serif robuste' },
  { id: 'grotesque', label: 'Archivo', description: 'Grotesque compacte' },
  { id: 'techno', label: 'Orbitron', description: 'Futuriste, technique' },
  { id: 'handwritten', label: 'Caveat', description: 'Manuscrite' },
  { id: 'roman', label: 'Cinzel', description: 'Capitales romaines' },
];

export const DISPLAY_NAME_EFFECT_OPTIONS: {
  id: DisplayNameEffectId;
  label: string;
  description: string;
}[] = [
  { id: 'none', label: 'Aucun', description: 'Nom standard' },
  { id: 'neon_cyan', label: 'Néon cyan', description: 'Tube LED bleu-vert' },
  { id: 'neon_magenta', label: 'Néon rose', description: 'Tube LED magenta' },
  { id: 'neon_lime', label: 'Néon lime', description: 'Tube LED vert' },
  { id: 'neon_gold', label: 'Néon or', description: 'Tube LED ambre' },
  { id: 'chrome', label: 'Chrome', description: 'Dégradé métallique' },
];

/**
 * Familles EMBARQUÉES (voir `theme/fonts`), volontairement pas des noms de
 * polices système : ces derniers donnaient un rendu différent par plateforme et
 * s'effondraient sur Android, où « Éditorial » et « Serif » pointaient la même
 * famille `serif` et où les variantes sans-serif retombaient sur Roboto. Les
 * cinq options se ressemblaient alors toutes.
 */
function fontFamilyFor(id: DisplayNameFontId): string | undefined {
  if (id === 'system') return undefined;
  const map: Record<Exclude<DisplayNameFontId, 'system'>, string> = {
    display: displayNameFonts.poster,
    editorial: displayNameFonts.editorial,
    serif: displayNameFonts.serif,
    mono: displayNameFonts.mono,
    compact: displayNameFonts.condensed,
    geometric: displayNameFonts.geometric,
    rounded: displayNameFonts.rounded,
    elegant: displayNameFonts.elegant,
    soft: displayNameFonts.soft,
    friendly: displayNameFonts.friendly,
    classic: displayNameFonts.classic,
    grotesque: displayNameFonts.grotesque,
    techno: displayNameFonts.techno,
    handwritten: displayNameFonts.handwritten,
    roman: displayNameFonts.roman,
  };
  return map[id as Exclude<DisplayNameFontId, 'system'>];
}

/** Couches du néon : du halo large au cœur brillant (ordre = dessin du fond vers l’avant). */
export type NeonLayerSpec = { fill: string; shadowColor: string; shadowRadius: number };

export const NEON_PRESETS: Partial<Record<DisplayNameEffectId, NeonLayerSpec[]>> = {
  neon_cyan: [
    { fill: 'rgba(0,0,0,0)', shadowColor: 'rgba(34, 211, 238, 0.58)', shadowRadius: 22 },
    { fill: 'rgba(0,0,0,0)', shadowColor: 'rgba(103, 232, 249, 0.55)', shadowRadius: 13 },
    { fill: 'rgba(0,0,0,0)', shadowColor: 'rgba(34, 211, 238, 0.35)', shadowRadius: 6 },
    { fill: '#ecfeff', shadowColor: 'rgba(6, 182, 212, 0.32)', shadowRadius: 3 },
  ],
  neon_magenta: [
    { fill: 'rgba(0,0,0,0)', shadowColor: 'rgba(232, 121, 249, 0.52)', shadowRadius: 22 },
    { fill: 'rgba(0,0,0,0)', shadowColor: 'rgba(240, 171, 252, 0.5)', shadowRadius: 13 },
    { fill: 'rgba(0,0,0,0)', shadowColor: 'rgba(217, 70, 239, 0.32)', shadowRadius: 6 },
    { fill: '#fdf4ff', shadowColor: 'rgba(217, 70, 239, 0.28)', shadowRadius: 3 },
  ],
  neon_lime: [
    { fill: 'rgba(0,0,0,0)', shadowColor: 'rgba(163, 230, 53, 0.52)', shadowRadius: 22 },
    { fill: 'rgba(0,0,0,0)', shadowColor: 'rgba(190, 242, 100, 0.48)', shadowRadius: 13 },
    { fill: 'rgba(0,0,0,0)', shadowColor: 'rgba(132, 204, 22, 0.32)', shadowRadius: 6 },
    { fill: '#f7fee7', shadowColor: 'rgba(101, 163, 13, 0.28)', shadowRadius: 3 },
  ],
  neon_gold: [
    { fill: 'rgba(0,0,0,0)', shadowColor: 'rgba(251, 191, 36, 0.55)', shadowRadius: 24 },
    { fill: 'rgba(0,0,0,0)', shadowColor: 'rgba(253, 224, 71, 0.5)', shadowRadius: 14 },
    { fill: 'rgba(0,0,0,0)', shadowColor: 'rgba(245, 158, 11, 0.32)', shadowRadius: 6 },
    { fill: '#fffbeb', shadowColor: 'rgba(217, 119, 6, 0.28)', shadowRadius: 3 },
  ],
};

/** Couleur de secours pour le cœur (hors stack). */
export function displayNameTextStyles(
  effectId: DisplayNameEffectId,
  fontId: DisplayNameFontId
): TextStyle {
  // Une police EMBARQUÉE porte sa graisse dans le fichier : lui adjoindre un
  // `fontWeight` ne l'épaissit pas, et sur Android fait carrément retomber le
  // rendu sur Roboto — la famille choisie disparaît. Seule la police système
  // (qui, elle, a de vraies variantes) garde une graisse explicite.
  const base: TextStyle = fontId === 'system' ? { fontWeight: '800' } : {};

  switch (effectId) {
    case 'neon_cyan':
      return { ...base, color: '#ecfeff' };
    case 'neon_magenta':
      return { ...base, color: '#fdf4ff' };
    case 'neon_lime':
      return { ...base, color: '#f7fee7' };
    case 'neon_gold':
      return { ...base, color: '#fffbeb' };
    case 'chrome':
      return { ...base, color: '#ffffff' };
    default:
      // Pas de couleur ici : le rendu par défaut (voir PremiumDisplayName,
      // cas `ev === 'none'`) doit hériter la couleur thémée de `baseStyle`
      // (`colors.textPrimary`). Un hex figé ici passait en dernier dans le
      // tableau de styles et écrasait le thème — quasi invisible en clair.
      return { ...base };
  }
}

export function resolveDisplayNameFontFamily(fontId: DisplayNameFontId): string | undefined {
  return fontFamilyFor(fontId);
}

export function clampDisplayNamePrefs(
  rawFont: string | null | undefined,
  rawEffect: string | null | undefined,
  isPremium: boolean,
  subscriptionTier?: string | null
): { fontId: DisplayNameFontId; effectId: DisplayNameEffectId } {
  const tier = effectiveSubscriptionTier(!!isPremium, subscriptionTier);
  if (!canUseFeature(tier, 'pro')) {
    return { fontId: 'system', effectId: 'none' };
  }
  const fontOk = DISPLAY_NAME_FONT_OPTIONS.some((f) => f.id === rawFont);
  const effectOk = DISPLAY_NAME_EFFECT_OPTIONS.some((e) => e.id === rawEffect);
  return {
    fontId: (fontOk ? rawFont : 'system') as DisplayNameFontId,
    effectId: (effectOk ? rawEffect : 'none') as DisplayNameEffectId,
  };
}

export function isProDisplayNameTier(tier: SubscriptionTier): boolean {
  return canUseFeature(tier, 'pro');
}
