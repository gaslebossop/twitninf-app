/**
 * 🧪 Palette et typographie du fil « 2B — Gouttière ».
 *
 * Test sous drapeau `fil.refonte2b`. Vit à côté de la palette « Pulse » sans
 * la toucher : seuls les écrans clonés du test importent ce fichier, et le
 * jour où l'essai est tranché, il part avec eux.
 *
 * ── Pourquoi une palette à part plutôt que des jetons ajoutés à `colors` ──
 * 2B n'est pas une variation de Pulse, c'est une autre proposition : fond
 * papier, un seul accent, aucun aplat de couleur hors du concours. Poser ces
 * valeurs dans `colors` les rendrait disponibles partout et elles finiraient
 * mélangées à Pulse dans des écrans qui ne participent pas au test.
 *
 * ── Clair ET sombre ──
 * Le clair est le dessin littéral. Le sombre n'est pas un simple inversement
 * mécanique : c'est la MÊME idée, l'encre passant du texte au fond. Deux
 * valeurs ne se retournent pas et sont recalculées :
 *   - l'accent `#E8384F` tombe à 4,3:1 sur l'encre, sous le seuil du petit
 *     texte : il est remonté à `#FF5468` (5,7:1) ;
 *   - la pilule de navigation est encre sur papier en clair. En sombre, encre
 *     sur encre disparaîtrait — elle passe à une surface relevée.
 * L'ambre du concours, lui, est un aplat auto-suffisant (texte brun foncé
 * dessus) : il ne bouge pas d'un thème à l'autre, sinon le bloc perdrait ce
 * qui en fait un bloc.
 *
 * ⚠️ Résolu UNE FOIS au chargement du module, comme `colors` : changer de
 * thème demande un rechargement de l'app (voir `theme/colors.ts`).
 */

import { Dimensions, PixelRatio } from 'react-native';

import { colors, isDarkTheme } from './colors';

/**
 * Largeur pour laquelle la maquette 2B a été dessinée. Toutes les valeurs
 * écrites dans les styles du test sont dans CE repère.
 */
const DESIGN_WIDTH = 402;

/**
 * Facteur d'échelle de l'écran courant.
 *
 * ── Pourquoi pas `normalize()` de `utils/responsive` ──
 * Celui-là part d'un iPhone 11 (414 pt) et retranche 2 px sur Android quelle
 * que soit la taille : une méta de 11 px y tombe à 8, illisible. 2B a en plus
 * été dessiné à 402 pt, pas 414 — partir de 414 rétrécissait tout de 3 % sur
 * l'appareil qui a servi de référence.
 *
 * ── Pourquoi c'est BORNÉ ──
 * Sans borne, une tablette de 768 pt doublerait le corps du texte. Or ce qui
 * doit grandir sur un écran large, c'est la longueur de ligne, pas la taille
 * des lettres. On accompagne donc l'écart entre téléphones (±20 %) et on
 * s'arrête là.
 *
 * Lu UNE FOIS au chargement : l'app est verrouillée en portrait
 * (`app.config.js`), la valeur ne peut pas changer en cours de session.
 */
const SCALE = Math.min(Math.max(Dimensions.get('window').width / DESIGN_WIDTH, 0.88), 1.2);

/**
 * Met une valeur de la maquette à l'échelle de l'écran.
 *
 * À utiliser pour TOUT ce qui a une dimension dans le fil 2B — corps de texte,
 * interlignes, icônes, avatars, rembourrages, largeur de la gouttière. Mettre
 * les polices à l'échelle sans les espacements donne un texte grand tassé dans
 * une grille étroite, ce qui est pire que de ne rien mettre à l'échelle.
 */
export const ps = (size: number): number => PixelRatio.roundToNearestPixel(size * SCALE);

/** Échelle appliquée — exposée pour les rares calculs qui en ont besoin. */
export const paperScale = SCALE;

/**
 * ── La grille du fil 2B ──
 *
 * Trois pièces se posent dans le MÊME repère : la ligne de tweet
 * (`TweetRowGutter`), la question de réglage (`AlgoCheckGutter`) et la bande
 * du post du jour (`SpotlightBand`). Elles partagent donc ces valeurs au lieu
 * de les réécrire chacune — trois copies de `ps(52)` finissent toujours par
 * diverger, et il suffit d'un pixel pour que la colonne des compteurs cesse
 * d'être une colonne.
 */

/** Largeur de la gouttière : la colonne tactile de gauche. */
export const GUTTER_W = ps(52);

/** Retrait latéral d'une ligne du fil, bord d'écran compris. */
export const ROW_PAD_X = ps(20);

/** Espace entre la gouttière et la colonne de contenu. */
export const ROW_GAP = ps(12);

export interface Paper2BPalette {
  /**
   * Fond de page.
   *
   * C'est celui de l'app (`colors.bg`), PAS un blanc cassé propre au test : un
   * fil d'une teinte et un profil d'une autre se voient à chaque aller-retour
   * entre les deux. La refonte porte sur la structure du fil, pas sur la
   * couleur du papier.
   */
  bg: string;
  /** Bande du « post du jour » — un cran de fond, pas une carte. */
  bgBand: string;
  /** Texte principal. */
  ink: string;
  /** Texte secondaire (libellés de compteur, sous-titres). */
  inkSoft: string;
  /** Méta en chasse fixe (horodatage, nombre de réponses). */
  inkMeta: string;
  /** Onglet inactif, texte désactivé. */
  inkIdle: string;
  /** Filet de séparation entre les lignes du fil. */
  hairline: string;
  /** Filet vertical de la gouttière, qui rattache une ligne à la suivante. */
  gutterLine: string;
  /** Contour de la pilule « Répondre ». */
  outline: string;
  /** Accent unique — réservé à ce qui est propre à Twitninf. */
  accent: string;
  /** Texte posé SUR l'accent. */
  onAccent: string;
  /** Aplat du concours. */
  amber: string;
  onAmber: string;
  /**
   * Voile de la pastille active de la barre de navigation.
   *
   * Un voile posé sur le FOND DE PAGE, pas une couleur à part : la barre est
   * de la couleur de la page (voir `BottomTabNavigator2B`), donc la pastille
   * doit être une nuance de cette page, sinon elle y flotte comme une vignette
   * collée.
   */
  pillWash: string;
  /** Ombre portée du bouton « Publier ». */
  navShadow: string;
  /** Vert du repost posé (seul écart à la règle « un seul accent » : sans
   *  lui, repost posé et cœur posé se confondent dans la gouttière). */
  reposted: string;
}

// `colors` est déjà résolu au thème courant quand ce module est chargé (voir
// `theme/colors.ts`), donc les deux palettes lisent la même source pour leurs
// surfaces : c'est `isDarkTheme()` plus bas qui choisit laquelle sert.
const LIGHT: Paper2BPalette = {
  bg: colors.bg,
  bgBand: colors.surface,
  ink: '#17161A',
  inkSoft: '#6E6C75',
  inkMeta: '#77747E',
  inkIdle: '#B0ADB6',
  hairline: 'rgba(23,22,26,0.12)',
  gutterLine: 'rgba(23,22,26,0.14)',
  outline: 'rgba(23,22,26,0.20)',
  accent: '#E8384F',
  onAccent: '#FFFFFF',
  amber: '#F0B429',
  onAmber: '#2A1F04',
  pillWash: 'rgba(23,22,26,0.07)',
  navShadow: 'rgba(23,22,26,0.28)',
  reposted: '#1F8A57',
};

const DARK: Paper2BPalette = {
  bg: colors.bg,
  bgBand: colors.surface,
  ink: '#F4F2ED',
  inkSoft: '#A3A0AA',
  inkMeta: '#918E99',
  inkIdle: '#5E5B66',
  hairline: 'rgba(244,242,237,0.13)',
  gutterLine: 'rgba(244,242,237,0.15)',
  outline: 'rgba(244,242,237,0.22)',
  accent: '#FF5468',
  // Encre foncée sur le corail, pas du blanc : blanc sur `#FF5468` ne tient
  // que 3,1:1, illisible sur une capitale de 9,5 px.
  onAccent: '#1A0207',
  amber: '#F0B429',
  onAmber: '#2A1F04',
  pillWash: 'rgba(244,242,237,0.10)',
  navShadow: 'rgba(0,0,0,0.5)',
  reposted: '#3FBE84',
};

/** Palette du test, figée pour la session. */
export const paper: Paper2BPalette = isDarkTheme() ? DARK : LIGHT;

export const isPaperDark = isDarkTheme();

/**
 * Les trois voix typographiques du design.
 *
 * Le dessin appelle Archivo / Public Sans / JetBrains Mono. Archivo est déjà
 * embarquée (personnalisation du nom de profil) et on lui ajoute son 600.
 * Les deux autres sont remplacées par leurs équivalentes de rôle déjà dans
 * le bundle — embarquer deux familles Google de plus pour 1 % des comptes
 * coûterait à 100 % d'entre eux :
 *   - Public Sans → TwitNinf Sans, la grotesque de marque, même office ;
 *   - JetBrains Mono → Space Mono, déjà la police des chiffres de l'app.
 */
export const paperFonts = {
  /** Archivo 700 — logo, titres, montants, gros compteurs. */
  display: 'Archivo-Bold',
  /** Archivo 600 — noms d'auteur, onglets, compteurs de ligne. */
  strong: 'Archivo-SemiBold',
  /** Corps du tweet. */
  body: 'TwitninfSans-Book',
  bodyStrong: 'TwitninfSans-Medium',
  /** Méta et capitales espacées. */
  mono: 'SpaceMono-Regular',
  monoStrong: 'SpaceMono-Bold',
} as const;

export default paper;
