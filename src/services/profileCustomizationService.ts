import apiService from './api';
import VerificationStyleService, { VerificationStyle } from './verificationStyleService';

export type BannerStyle = 'none' | 'gradient' | 'glow' | 'mesh' | 'stripes';
export type AvatarDecoration = 'none' | 'ring' | 'crown' | 'petals' | 'circuit' | 'flames' | 'stars';
export type ThemeIntensity = 'soft' | 'normal' | 'vivid';
export type NameEffect = 'none' | 'gradient' | 'shimmer' | 'glow' | 'certified';
// Doit rester aligne mot pour mot sur `DisplayNameFontId`
// (utils/profileDisplayNamePrefs) : la valeur choisie ici y est passee telle
// quelle a `clampDisplayNamePrefs`, qui retombe sur 'system' si elle n'y
// figure pas.
export type NameFont =
  | 'system'
  | 'display'
  | 'editorial'
  | 'serif'
  | 'mono'
  | 'compact'
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
export type ProfileEffect = 'none' | 'sparkles' | 'embers' | 'bubbles' | 'snow';
/** Taille du pseudo affiché sur le profil (Pro). */
export type NameSize = 'normal' | 'large' | 'xlarge' | 'huge' | 'giant';

/** Personnalisation de profil premium (façon Discord). */
export interface ProfileCustomization {
  accent_color?: string;
  secondary_color?: string;
  banner_style?: BannerStyle;
  /** Force du thème : le même dégradé, plus ou moins poussé. */
  theme_intensity?: ThemeIntensity;
  avatar_decoration?: AvatarDecoration;
  /** Police du nom affiché (Pro). */
  name_font?: NameFont;
  /** Traitement animé du nom affiché (Pro). */
  name_effect?: NameEffect;
  /** Taille du pseudo affiché sur le profil (Pro). */
  name_size?: NameSize;
  /** Ambiance animée peinte en fond du profil (Pro). */
  profile_effect?: ProfileEffect;
  /** Titre court affiché sous le pseudo. */
  profile_title?: string;
  about_me?: string;
}

/** Longueur max du titre — alignée sur la validation de l'API. */
export const PROFILE_TITLE_MAX = 40;

export interface CustomizationState {
  customization: ProfileCustomization;
  tier: 'free' | 'plus' | 'pro';
  can_customize: boolean;
  can_use_decorations: boolean;
  /** Droit adossé à la certification, pas à l'abonnement. */
  can_use_certified_name: boolean;
  verification_style: VerificationStyle;
}

const EMPTY_STATE: CustomizationState = {
  customization: {},
  tier: 'free',
  can_customize: false,
  can_use_decorations: false,
  can_use_certified_name: false,
  verification_style: 'default',
};

/** Palette proposée dans l'éditeur — l'API n'accepte que des hex validés. */
export const ACCENT_PRESETS = [
  '#fe2c55', '#ff7a00', '#ffd24d', '#22c55e',
  '#25f4ee', '#3b82f6', '#8b5cf6', '#ec4899',
  '#f43f5e', '#14b8a6', '#a3e635', '#e5e7eb',
] as const;

/**
 * Thèmes de profil : le dégradé habille TOUT le profil (fond de page, façon
 * Discord), il ne se pose jamais par-dessus la bannière. `stripes` était un
 * effet de bannière — plus proposé, il retombe sur le dégradé plein.
 */
export const PROFILE_THEMES: Array<{ key: BannerStyle; label: string }> = [
  { key: 'none', label: 'Aucun' },
  { key: 'gradient', label: 'Dégradé' },
  { key: 'glow', label: 'Halo' },
  { key: 'mesh', label: 'Nébuleuse' },
];

export function profileThemeOf(customization?: ProfileCustomization | null): BannerStyle {
  const theme = customization?.banner_style || 'none';
  return theme === 'stripes' ? 'gradient' : theme;
}

/**
 * Intensité du thème : un simple facteur appliqué à TOUTES les opacités du
 * dégradé. `normal` vaut 1 — un profil déjà personnalisé garde donc exactement
 * le rendu qu'il avait avant l'arrivée de ce réglage.
 */
export const THEME_INTENSITIES: Array<{ key: ThemeIntensity; label: string }> = [
  { key: 'soft', label: 'Discret' },
  { key: 'normal', label: 'Normal' },
  { key: 'vivid', label: 'Intense' },
];

const INTENSITY_FACTORS: Record<ThemeIntensity, number> = {
  soft: 0.62,
  normal: 1,
  vivid: 1.32,
};

export function themeIntensityOf(customization?: ProfileCustomization | null): number {
  return INTENSITY_FACTORS[customization?.theme_intensity || 'normal'] ?? 1;
}

/**
 * Polices du nom affiché. Le vocabulaire (et le mapping vers les familles
 * réelles) vient de `utils/profileDisplayNamePrefs` : ce réglage était déjà
 * écrit mais restait local à l'appareil, il passe ici en personnalisation
 * publique — c'est le profil des autres qui doit en profiter.
 */
export const NAME_FONTS: Array<{ key: NameFont; label: string }> = [
  { key: 'system', label: 'Classique' },
  { key: 'display', label: 'Affiche' },
  { key: 'editorial', label: 'Éditorial' },
  { key: 'serif', label: 'Serif' },
  { key: 'mono', label: 'Mono' },
  { key: 'compact', label: 'Compact' },
  { key: 'geometric', label: 'Montserrat' },
  { key: 'rounded', label: 'Poppins' },
  { key: 'elegant', label: 'Raleway' },
  { key: 'soft', label: 'Nunito' },
  { key: 'friendly', label: 'Rubik' },
  { key: 'classic', label: 'Merriweather' },
  { key: 'grotesque', label: 'Archivo' },
  { key: 'techno', label: 'Orbitron' },
  { key: 'handwritten', label: 'Caveat' },
  { key: 'roman', label: 'Cinzel' },
];

export function nameFontOf(customization?: ProfileCustomization | null): NameFont {
  return customization?.name_font || 'system';
}

export const NAME_EFFECTS: Array<{ key: NameEffect; label: string; icon: string }> = [
  { key: 'none', label: 'Aucun', icon: 'close-circle-outline' },
  { key: 'gradient', label: 'Dégradé', icon: 'color-fill-outline' },
  { key: 'shimmer', label: 'Reflet', icon: 'flash-outline' },
  { key: 'glow', label: 'Néon', icon: 'bulb-outline' },
  { key: 'certified', label: 'Certifié', icon: 'shield-checkmark' },
];

export function nameEffectOf(customization?: ProfileCustomization | null): NameEffect {
  return customization?.name_effect || 'none';
}

export const NAME_SIZES: Array<{ key: NameSize; label: string }> = [
  { key: 'normal', label: 'Normal' },
  { key: 'large', label: 'Grand' },
  { key: 'xlarge', label: 'Très grand' },
  { key: 'huge', label: 'Énorme' },
  { key: 'giant', label: 'Géant' },
];

/** Facteur appliqué au corps du pseudo affiché sur SON PROPRE profil. */
const NAME_SIZE_SCALE: Record<NameSize, number> = {
  normal: 1,
  large: 1.18,
  xlarge: 1.38,
  huge: 1.65,
  giant: 2,
};

export function nameSizeOf(customization?: ProfileCustomization | null): NameSize {
  return customization?.name_size || 'normal';
}

export function nameSizeScale(customization?: ProfileCustomization | null): number {
  return NAME_SIZE_SCALE[nameSizeOf(customization)];
}

/**
 * Diamètre des pastilles posées à côté du pseudo (certification, premium).
 *
 * Elles valaient 18 en dur : à la taille « Géant » le nom double (21 → 42 px)
 * et les pastilles restaient minuscules à côté ; à la taille normale elles
 * paraissaient au contraire trop lourdes. Le rapport 0,72 les cale sur la
 * hauteur des capitales plutôt que sur la boîte du texte, et les bornes
 * évitent qu'elles deviennent illisibles ou envahissantes.
 *
 * Partagé entre le profil personnel et celui vu par les autres : la formule
 * n'existait que dans le premier, si bien qu'un visiteur voyait un nom géant
 * flanqué de pastilles restées petites.
 */
export function nameBadgeSize(
  customization: ProfileCustomization | null | undefined,
  baseFontSize: number,
): number {
  return Math.round(
    Math.min(30, Math.max(14, baseFontSize * nameSizeScale(customization) * 0.72)),
  );
}

/**
 * Le nom rayonne-t-il ? La pastille de certification s'allume avec lui : un nom
 * au néon à côté d'une pastille éteinte, les deux se contredisent.
 */
export function nameIsLit(customization?: ProfileCustomization | null): boolean {
  const effect = nameEffectOf(customization);
  return effect === 'glow' || effect === 'certified';
}

/**
 * Palette de la certification d'un profil — source UNIQUE de la pastille de
 * vérification et de l'effet de nom « Certifié ». Les deux passent par ici,
 * donc ils ne peuvent pas diverger.
 *
 * Règle d'accord : sur un profil habillé, la pastille NEUTRE adopte les
 * couleurs du profil — tout ce qui est à l'écran appartient alors au même
 * nuancier. Les pastilles rose / argent / or gardent la leur : c'est une
 * distinction attribuée au compte, la repeindre l'effacerait.
 */
export function certifiedNameColors(
  style?: VerificationStyle | null,
  customization?: ProfileCustomization | null,
): { from: string; to: string; glow: string } {
  const resolved = style || 'default';
  // Le déclencheur est la COULEUR choisie, pas le thème : l'accent est déjà
  // visible sans dégradé (bordure « À propos », onglets, titre, parure).
  if (resolved === 'default' && !!customization?.accent_color) {
    const [from, to] = decorationColors(customization);
    return { from, to, glow: from };
  }
  const palette = VerificationStyleService.getStyleColors(resolved);
  const [from, to] = palette.gradient;
  return { from, to, glow: palette.glowColor };
}

export const PROFILE_EFFECTS: Array<{ key: ProfileEffect; label: string; icon: string }> = [
  { key: 'none', label: 'Aucune', icon: 'close-circle-outline' },
  { key: 'sparkles', label: 'Éclats', icon: 'sparkles-outline' },
  { key: 'embers', label: 'Braises', icon: 'flame-outline' },
  { key: 'bubbles', label: 'Bulles', icon: 'water-outline' },
  { key: 'snow', label: 'Neige', icon: 'snow-outline' },
];

export function profileEffectOf(customization?: ProfileCustomization | null): ProfileEffect {
  return customization?.profile_effect || 'none';
}

/**
 * Le profil est-il HABILLÉ ? C'est ce qui déclenche la mise en scène d'arrivée
 * (voir `components/PremiumProfileEntrance`).
 *
 * On teste le rendu, pas le palier : un abonné Pro qui n'a rien réglé a un
 * profil identique à celui d'un compte gratuit, une entrée en fanfare sur une
 * page nue ne récompenserait rien. Inversement, chaque champ listé ici est
 * réservé à Plus/Pro côté API — en trouver un seul suffit à savoir qu'on est
 * sur un profil payant.
 *
 * Doit rester aligné sur `isPremiumProfile` de l'app Windows
 * (twitninf-windows/src/components/ProfileCustomization.tsx) : les deux apps
 * doivent s'accorder sur ce qu'est un profil « habillé ».
 */
export function isPremiumProfile(customization?: ProfileCustomization | null): boolean {
  if (!customization) return false;
  return (
    profileThemeOf(customization) !== 'none' ||
    (customization.avatar_decoration || 'none') !== 'none' ||
    profileEffectOf(customization) !== 'none' ||
    nameEffectOf(customization) !== 'none' ||
    nameFontOf(customization) !== 'system' ||
    nameSizeOf(customization) !== 'normal' ||
    !!customization.accent_color ||
    !!customization.secondary_color ||
    !!customization.profile_title?.trim() ||
    !!customization.about_me?.trim()
  );
}

export const AVATAR_DECORATIONS: Array<{ key: AvatarDecoration; label: string; icon: string }> = [
  { key: 'none', label: 'Aucune', icon: 'close-circle-outline' },
  { key: 'ring', label: 'Aurore', icon: 'ellipse-outline' },
  { key: 'crown', label: 'Couronne', icon: 'diamond-outline' },
  { key: 'stars', label: 'Étoiles', icon: 'sparkles-outline' },
  { key: 'petals', label: 'Pétales', icon: 'flower-outline' },
  { key: 'circuit', label: 'Circuit', icon: 'hardware-chip-outline' },
  { key: 'flames', label: 'Flammes', icon: 'flame-outline' },
];

/** Couleurs de l'habillage dérivées de la personnalisation d'un profil. */
export function decorationColors(customization?: ProfileCustomization | null): [string, string] {
  const accent = customization?.accent_color || '#fe2c55';
  const secondary = customization?.secondary_color || accent;
  return [accent, secondary];
}

export const profileCustomizationService = {
  async get(): Promise<CustomizationState> {
    try {
      const res = await apiService.get('/api/users/me/profile-customization');
      if (!res?.success) return EMPTY_STATE;
      return {
        customization: res?.data?.customization || {},
        tier: res?.data?.tier || 'free',
        can_customize: !!res?.data?.can_customize,
        can_use_decorations: !!res?.data?.can_use_decorations,
        can_use_certified_name: !!res?.data?.can_use_certified_name,
        verification_style: res?.data?.verification_style || 'default',
      };
    } catch {
      return EMPTY_STATE;
    }
  },

  async save(customization: ProfileCustomization): Promise<{ success: boolean; message?: string }> {
    try {
      const res = await apiService.put('/api/users/me/profile-customization', { customization });
      return { success: !!res?.success, message: res?.message };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Enregistrement impossible',
      };
    }
  },
};

export default profileCustomizationService;
