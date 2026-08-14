import { colors, withAlpha } from './colors';
import { fonts, displayNameFonts } from './fonts';
import type { EventArtId, QuestTier } from '../types/events';

/**
 * Les directions artistiques d'événement.
 *
 * ── Pourquoi ce n'est plus du JSON ────────────────────────────────────────
 * `themes/eventThemes.ts` décrivait une DA par douze codes hexadécimaux, sept
 * dégradés et neuf booléens du genre `floatingHearts: true`. Deux
 * conséquences, toutes deux visibles dans l'app :
 *
 *  1. Ces valeurs étaient saisies dans un formulaire d'admin. Personne ne
 *     dessinait — on tapait des couleurs, et on découvrait le résultat en
 *     production. C'est ainsi qu'on obtient un fond violet sous un texte gris
 *     à 2,8:1 de contraste.
 *  2. Une DA n'est pas une palette. C'est aussi une typographie, une densité,
 *     un mouvement, et des RÈGLES — ce qui reste de la marque, ce qui prend
 *     les couleurs de la fête, ce qui ne bouge jamais. Rien de tout cela ne
 *     tient dans un `Record<string, string>`.
 *
 * Le serveur garde donc la main sur le QUAND et le QUEL (`art: "birthday"`),
 * et l'app sur le COMMENT. Une DA inconnue retombe sur `none` : l'événement
 * existe, il n'est simplement pas costumé.
 *
 * ── La règle qui tient tout ───────────────────────────────────────────────
 * Une DA d'événement HABILLE l'app, elle ne la remplace pas. Le rouge de
 * twitninf reste le rouge de twitninf : c'est lui qui dit « aimer »,
 * « supprimer », « c'est ici qu'on appuie ». L'or de l'anniversaire est
 * au-DESSUS, sur ce qui appartient à la fête. Une DA qui repeint les
 * affordances oblige à réapprendre l'app pendant une semaine.
 */

export interface EventArt {
  id: EventArtId;
  /** Nom montré dans les réglages et l'admin. */
  name: string;
  colors: {
    /** Fond de la page d'événement. Jamais appliqué au fil. */
    ink: string;
    /** La couleur de la fête. Sert aux titres, aux paliers, aux bordures. */
    festive: string;
    festiveBright: string;
    festiveSoft: string;
    /** Seconde couleur chaude, pour les dégradés et les particules. */
    ember: string;
    /** Texte sur un aplat festif. */
    onFestive: string;
    /** Reste la marque, quoi qu'il arrive. Voir l'en-tête. */
    brand: string;
  };
  gradients: {
    /** Bandeau et en-tête de la page d'événement. */
    header: [string, string];
    /** Carte de quête au repos. */
    card: [string, string];
    /** Aplat festif : bouton de réclamation, palier légendaire. */
    festive: [string, string, string];
  };
  fonts: {
    /** Chiffres et titres de l'événement. Une police d'affiche, pas l'UI. */
    display: string;
    /** Corps : celui de l'app. Un événement ne change pas la lisibilité. */
    body: string;
  };
  /** Habillage par palier de quête. */
  tier: Record<QuestTier, { label: string; color: string; glow: string }>;
  /** Ambiance de fond de la page d'événement. */
  particles: 'none' | 'embers';
}

/**
 * Aucune DA — l'habillage ordinaire de l'app.
 *
 * Ce n'est pas un cas d'erreur mais le cas NORMAL : la plupart du temps il ne
 * se passe rien, et un événement livré côté serveur avant que sa DA n'existe
 * dans le build doit s'afficher proprement.
 */
const NONE: EventArt = {
  id: 'none',
  name: 'Standard',
  colors: {
    ink: colors.bg,
    festive: colors.accent,
    festiveBright: colors.accentBright,
    festiveSoft: colors.accentSoft,
    ember: colors.accentHover,
    onFestive: colors.white,
    brand: colors.accent,
  },
  gradients: {
    header: [colors.surface, colors.bg],
    card: [colors.surface, colors.surfaceAlt],
    festive: [colors.accentBright, colors.accent, colors.accentHover],
  },
  fonts: { display: fonts.displayHeavy, body: fonts.regular },
  tier: {
    bronze: { label: 'Bronze', color: '#C08552', glow: withAlpha('#C08552', 0.3) },
    silver: { label: 'Argent', color: '#C8CDD6', glow: withAlpha('#C8CDD6', 0.3) },
    gold: { label: 'Or', color: colors.gold, glow: withAlpha(colors.gold, 0.34) },
    legendary: { label: 'Légendaire', color: colors.accent, glow: colors.accentGlow },
  },
  particles: 'none',
};

/**
 * « Minuit » — la DA de l'anniversaire de twitninf.
 *
 * ── L'idée ───────────────────────────────────────────────────────────────
 * Pas des confettis. Des confettis, c'est ce qu'on met quand on n'a pas
 * d'idée : bruyant pendant deux secondes, puis insupportable pendant huit
 * jours. Ici, la scène est celle de la seconde où l'on allume les bougies —
 * la pièce est sombre, et une lumière chaude tombe d'en haut.
 *
 * Concrètement : le noir de l'app se teinte imperceptiblement de violet
 * (`#0B0710` contre `#0A0A0A` — assez pour qu'on le sente, pas assez pour
 * qu'on le remarque), et tout ce qui appartient à la fête est doré. Des
 * braises montent lentement en fond, à très faible opacité.
 *
 * ── Ce qui NE change pas ─────────────────────────────────────────────────
 * Le rouge. `brand` reste `colors.accent` : le cœur des likes, le bouton de
 * publication et le rouge des actions destructrices sont exactement ceux
 * d'hier. On habille la fête, on ne réapprend pas l'app.
 *
 * ── Contraste ────────────────────────────────────────────────────────────
 * `onFestive` est un brun très sombre et non du blanc : du blanc sur `#F5C24B`
 * tombe à 1,9:1, illisible. Le brun tient 9:1. C'est le genre de vérification
 * qu'un formulaire d'admin ne fait jamais.
 */
const BIRTHDAY: EventArt = {
  id: 'birthday',
  name: 'Minuit — anniversaire twitninf',
  colors: {
    ink: '#0B0710',
    festive: '#F5C24B',
    festiveBright: '#FFD980',
    festiveSoft: 'rgba(245,194,75,0.12)',
    ember: '#FF7A3D',
    onFestive: '#2A1C05',
    brand: colors.accent,
  },
  gradients: {
    // Le ciel de la pièce : violet profond en haut, noir en bas.
    header: ['#1C1026', '#0B0710'],
    // Une carte de quête n'est pas dorée — seulement effleurée par la lumière.
    // Un aplat d'or sur chacune des dix cartes rendrait l'or insignifiant.
    card: ['rgba(245,194,75,0.07)', 'rgba(254,44,85,0.04)'],
    festive: ['#FFD980', '#F5C24B', '#E09A2B'],
  },
  fonts: {
    // Anton : une police d'affiche, condensée et lourde. Réservée aux chiffres
    // de l'événement (le compte à rebours, « 10 quêtes », les paliers). Le
    // corps de texte reste Inter — une police d'affiche à 14 px ne se lit pas.
    display: displayNameFonts.poster,
    body: fonts.regular,
  },
  tier: {
    bronze: { label: 'Bronze', color: '#C08552', glow: 'rgba(192,133,82,0.30)' },
    silver: { label: 'Argent', color: '#D6DBE4', glow: 'rgba(214,219,228,0.30)' },
    gold: { label: 'Or', color: '#F5C24B', glow: 'rgba(245,194,75,0.36)' },
    // Le légendaire est la SEULE chose qui mêle le rouge de la marque et l'or
    // de la fête. C'est ce qui en fait un sommet : la couleur ne se voit nulle
    // part ailleurs, ni dans l'app ordinaire, ni dans le reste de l'événement.
    legendary: { label: 'Légendaire', color: '#FF6B8A', glow: 'rgba(255,107,138,0.42)' },
  },
  particles: 'embers',
};

const REGISTRY: Record<EventArtId, EventArt> = {
  none: NONE,
  birthday: BIRTHDAY,
};

/** Résout une DA. Une clé inconnue rend l'habillage ordinaire. */
export function artOf(id: EventArtId | undefined | null): EventArt {
  return (id && REGISTRY[id]) || NONE;
}

export { NONE as defaultEventArt, BIRTHDAY as birthdayArt };
export default REGISTRY;
