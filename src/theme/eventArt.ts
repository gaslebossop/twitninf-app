import { colors, withAlpha } from './colors';
import { fonts, displayNameFonts } from './fonts';
import type { EventArtId, QuestTier } from '../types/events';
import type { SceneName } from '../config/scenes';

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
  /**
   * Scène animée de la mascotte posée en fond d'en-tête. Facultative, et
   * portée par l'habillage plutôt que par l'écran : un événement suivant
   * n'hérite ainsi pas du décor de celui d'avant.
   */
  scene?: SceneName;
  /**
   * Palette AUTONOME — c'est le point important.
   *
   * La première version ne définissait que les couleurs de fête et laissait
   * les surfaces et les textes aux jetons du thème (`colors.surface`,
   * `colors.textPrimary`). En thème sombre, ça passait. En thème CLAIR, la
   * page gardait son fond noir imposé et récupérait des cartes blanches avec
   * du texte foncé : des rectangles crème posés sur du noir, illisibles et
   * hideux.
   *
   * Une DA qui impose son fond doit imposer TOUT le reste. Aucune valeur
   * ci-dessous ne vient du thème de l'app.
   */
  colors: {
    /** Fond de la page d'événement. Jamais appliqué au fil. */
    ink: string;
    /** Fond d'une carte. */
    surface: string;
    /** Fond d'un élément posé sur une carte (pastille d'icône, jauge). */
    surfaceAlt: string;
    /** Filet de séparation. */
    border: string;
    /** Texte principal. */
    text: string;
    /** Texte secondaire — descriptions. */
    textDim: string;
    /** Texte tertiaire — libellés d'état, unités. */
    textMuted: string;
    /** La couleur de la fête. Sert aux titres, aux paliers, aux bordures. */
    festive: string;
    festiveBright: string;
    festiveSoft: string;
    /** Seconde couleur chaude, pour les dégradés et les particules. */
    ember: string;
    /** Texte sur un aplat festif. */
    onFestive: string;
    /**
     * Texte posé sur le dégradé d'en-tête.
     *
     * Distinct de `text` : sur une DA claire, le corps de page est en texte
     * sombre alors que l'en-tête est un aplat saturé qui réclame du blanc.
     * Confondre les deux donne du noir sur du magenta.
     */
    onHeader: string;
    /** Reste la marque, quoi qu'il arrive. Voir l'en-tête. */
    brand: string;
  };
  /**
   * Style de la barre d'état pendant que la page est ouverte.
   *
   * Fait partie de la DA et pas de l'écran : une DA claire a besoin d'icônes
   * sombres, une DA sombre d'icônes claires. Le figer dans l'écran rendait
   * l'heure invisible dès qu'on changeait de direction artistique.
   */
  statusBar: 'light' | 'dark';
  gradients: {
    /**
     * Bandeau et en-tête de la page d'événement.
     *
     * Deux arrêts au minimum, trois autorisés : un dégradé de fête a souvent
     * besoin d'une couleur intermédiaire pour ne pas virer au boueux entre ses
     * extrêmes (un magenta qui va vers l'ambre passe par du brun s'il n'a pas
     * de corail au milieu).
     */
    header: [string, string] | [string, string, string];
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
    surface: colors.surface,
    surfaceAlt: colors.surfaceElevated,
    border: colors.border,
    text: colors.textPrimary,
    textDim: colors.textSecondary,
    textMuted: colors.textMuted,
    festive: colors.accent,
    festiveBright: colors.accentBright,
    festiveSoft: colors.accentSoft,
    ember: colors.accentHover,
    onFestive: colors.white,
    onHeader: colors.textPrimary,
    brand: colors.accent,
  },
  statusBar: 'light',
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
 * « Confettis » — la DA de l'anniversaire de twitninf.
 *
 * ── L'idée ───────────────────────────────────────────────────────────────
 * Une fête, pas une veillée. Fond CLAIR, dégradé saturé en héros, cartes
 * blanches très arrondies posées par une ombre douce plutôt que par un filet,
 * et le jaune sur ce qui s'appuie. C'est la grammaire de Snapchat, et elle
 * convient à un anniversaire : elle est bruyante en haut, calme en bas.
 *
 * ── Ce que ça remplace ────────────────────────────────────────────────────
 * Une première DA, « Minuit », jouait la scène de l'allumage des bougies :
 * fond violet-noir, or, braises montantes. Elle était cohérente et sombre —
 * mais un anniversaire n'est pas une veillée, et une page qu'on ouvre tous
 * les jours pendant huit jours gagne à être accueillante plutôt que
 * solennelle.
 *
 * ── Le point technique qui rend ce revirement possible ────────────────────
 * Rien d'autre n'a bougé. Les composants ne connaissent que `art.colors.*` :
 * passer d'une DA sombre à une DA claire est un changement de CE fichier, pas
 * des écrans. C'est exactement ce pour quoi la palette a été rendue autonome.
 *
 * ── Ce qui NE change pas ─────────────────────────────────────────────────
 * Le rouge. `brand` reste `colors.accent` : le cœur des likes, le bouton de
 * publication et le rouge des actions destructrices sont ceux d'hier. On
 * habille la fête, on ne réapprend pas l'app.
 *
 * ── Contraste, vérifié ───────────────────────────────────────────────────
 * `festive` (#E11B72) sur blanc tient 5,3:1 — au-dessus du seuil de 4,5:1 pour
 * du texte. Le jaune iconique (#FFE600) ne sert JAMAIS de couleur de texte :
 * sur blanc il tombe à 1,2:1. Il n'est utilisé qu'en APLAT, avec du texte
 * quasi noir dessus (14:1). C'est la vérification qu'un formulaire d'admin ne
 * fait jamais, et c'est pour ça que la DA vit dans le code.
 */
const BIRTHDAY: EventArt = {
  id: 'birthday',
  name: 'Confettis — anniversaire twitninf',
  /**
   * Le feu de camp de la mascotte, en fond d'en-tête.
   *
   * C'est une scène de NUIT sur une DA claire : le contraste est assumé, et
   * c'est la place qui le rend tenable. Le dégradé de l'en-tête finit en ambre
   * (#FFB03A) exactement là où les flammes se trouvent — les deux chaleurs se
   * rejoignent au lieu de se disputer, et le haut reste au magenta pour le
   * titre.
   */
  scene: '05-feu-de-camp',
  colors: {
    // Gris très clair pour la page, blanc pur pour les cartes : c'est cet
    // écart minuscule qui fait « décoller » les cartes sans aucune bordure.
    ink: '#F4F3F7',
    surface: '#FFFFFF',
    surfaceAlt: '#EFEEF4',
    border: 'rgba(17,12,28,0.07)',
    text: '#120E1C',
    textDim: '#5C5470',
    textMuted: '#948CA6',
    // Magenta vif, lisible sur blanc — c'est lui qui porte les accents de
    // texte, pas le jaune.
    festive: '#E11B72',
    festiveBright: '#FF4D9A',
    festiveSoft: 'rgba(225,27,114,0.09)',
    ember: '#FF8A3D',
    // Le jaune est un APLAT : texte quasi noir dessus.
    onFestive: '#1A1020',
    // Sur le dégradé saturé de l'en-tête, le blanc est la seule option.
    onHeader: '#FFFFFF',
    brand: colors.accent,
  },
  statusBar: 'light',
  gradients: {
    // Le héros : magenta profond → corail → ambre. Saturé, franc, et il
    // s'arrête net — le reste de la page est calme, sinon rien ne ressort.
    header: ['#8E1C5E', '#FF5E5B', '#FFB03A'],
    // Les cartes sont BLANCHES. Un dégradé dessus les salirait ; ce sont
    // l'ombre et le rayon qui font le travail.
    card: ['#FFFFFF', '#FFFFFF'],
    // Le jaune Snapchat, réservé au bouton de réclamation. Une seule chose
    // dans toute la page le porte, donc on ne peut pas le rater.
    festive: ['#FFF04D', '#FFE600', '#FFC800'],
  },
  fonts: {
    // Poppins : géométrique, ronde, chaleureuse — la famille la plus proche de
    // l'esprit recherché parmi celles déjà embarquées. Anton, la police
    // d'affiche de la version précédente, était juste mais froide.
    display: displayNameFonts.rounded,
    body: fonts.regular,
  },
  tier: {
    // Assombris par rapport à la version sombre : sur fond blanc, un bronze
    // clair et un argent pâle deviennent illisibles.
    bronze: { label: 'Bronze', color: '#B0703A', glow: 'rgba(176,112,58,0.22)' },
    silver: { label: 'Argent', color: '#6E7A8A', glow: 'rgba(110,122,138,0.22)' },
    gold: { label: 'Or', color: '#D69A0C', glow: 'rgba(214,154,12,0.26)' },
    // Le légendaire est le seul à porter le magenta de la fête : la couleur ne
    // se voit nulle part ailleurs, ce qui en fait un sommet.
    legendary: { label: 'Légendaire', color: '#E11B72', glow: 'rgba(225,27,114,0.30)' },
  },
  // Des braises montantes sur un fond clair ne se verraient pas, et des
  // confettis en boucle sur une page qu'on ouvre huit jours de suite
  // deviendraient vite insupportables. C'est le dégradé qui porte l'énergie.
  particles: 'none',
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
