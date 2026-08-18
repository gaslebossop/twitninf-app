import { splitTweetMedia, displayContentOf } from '../../../utils/tweetMedia';
import type { Tweet } from '../../../types/api';

/**
 * Toutes les décisions de forme du mur Explorer, en un seul module PUR.
 *
 * ── Une seule grammaire de carte ───────────────────────────────────────────
 * La version précédente donnait quatre traitements selon la longueur du texte
 * (Déclaration en police affiche, Citation en serif à filet, Bloc dense,
 * Photo), posait par-dessus une cadence de fonds colorés (magenta un tweet
 * sur cinq, bloc clair un sur cinq) et promouvait une carte pleine largeur
 * tous les sept tweets. Vu sur appareil, le mur n'avait plus de trame :
 * chaque carte changeait de police, de taille et de fond, ce qui se lit comme
 * une planche d'essais, pas comme un flux.
 *
 * Ici toutes les cartes partagent la MÊME grammaire — même fond, même police,
 * même taille, même interlignage, même signature dessous. Ce qui varie est le
 * contenu, et la hauteur, qui suit le nombre de lignes réellement occupées.
 * C'est la trame des grilles d'exploration : la régularité vient du cadre, le
 * rythme vient du contenu.
 *
 * ── Pourquoi la largeur est un paramètre ───────────────────────────────────
 * Figer la largeur au chargement via `Dimensions.get()` rend toutes les
 * hauteurs estimées fausses après une rotation ou en écran partagé, et les
 * colonnes partent en dents de scie. La largeur traverse chaque fonction.
 *
 * ⚠️ INVARIANT : `estimatedHeightOf` doit rester la SEULE source de vérité de
 * la hauteur, utilisée par le rendu ET par l'équilibrage des colonnes. Deux
 * estimations divergentes remettent le bas de page en dents de scie.
 */

/**
 * Deux formats seulement, et ce n'est pas une différence de TRAITEMENT : les
 * deux cartes ont le même cadre, la même signature et le même fond. Le format
 * dit juste ce qu'il y a à l'intérieur — un visuel ou du texte.
 */
export type CardFormat = 'text' | 'photo';

export interface CardMeta {
  tweet: Tweet;
  format: CardFormat;
  /** Hauteur estimée, pour l'équilibrage des colonnes. */
  height: number;
}

/**
 * Corps de carte — identique pour TOUTES les cartes texte.
 *
 * 13,5 px et non 15 : à 15, un tweet court remplissait la carte d'un bord à
 * l'autre et la grille lisait comme une maquette non finie, chaque bloc de
 * texte réclamant l'attention au même volume. Une légende de grille se lit
 * en un coup d'œil, elle ne se lit pas « en grand » — la taille du texte doit
 * rester sous celle du corps de lecture du fil.
 */
export const TEXT_FONT_SIZE = 13.5;
export const TEXT_LINE_HEIGHT = 18.5;
/**
 * 6 lignes et non 7 : au-delà, une carte texte devient plus haute que deux
 * cartes voisines réunies et creuse un trou dans la colonne d'en face.
 */
export const TEXT_MAX_LINES = 6;

/**
 * Ratio unique des vignettes, en portrait 4:5.
 *
 * L'ancien module tirait le ratio d'une liste de quatre valeurs par hash de
 * l'id : la forme ne disait donc rien du contenu et deux photos voisines
 * pouvaient avoir des hauteurs très différentes sans raison. Un ratio unique
 * suffit — et 5 tweets vivants sur 977 portent réellement une image.
 */
export const MEDIA_RATIO = 1.25;

/**
 * En dessous de ce plancher, aucun compteur n'est affiché.
 * Mesuré en prod : 350 tweets sur 977 ont ≥ 1 like, 21 en ont ≥ 5, 3 en ont
 * ≥ 10. Afficher « 1 ♥ » partout est le signal le plus sûr d'un produit vide ;
 * au-dessus du plancher, le chiffre redevient une distinction rare.
 */
export const COUNTER_FLOOR = 5;

/** Même raisonnement pour « N nouveaux depuis ta dernière visite ». */
export const NEW_SINCE_FLOOR = 5;

/**
 * Marges verticales du corps texte (haut + bas) et hauteur de la signature.
 *
 * `BYLINE_HEIGHT` suit la vignette d'auteur, qui est l'élément le plus haut de
 * la ligne : 16 px d'avatar + 3 en haut + 9 en bas (voir les styles `byline`
 * d'`ExploreCard`). Ces deux constantes doivent bouger AVEC ces styles —
 * c'est la seule dépendance de l'estimation de hauteur au rendu.
 */
const TEXT_PADDING_V = 24;
const BYLINE_HEIGHT = 28;

export function formatOf(tweet: Tweet): CardFormat {
  // `hasVisual` gère le cas des vidéos, dont `media_urls` vaut
  // [url_vidéo, url_miniature] — mesurer l'index 0 traitait toute vidéo comme
  // une image et l'affichait comme une case vide.
  return splitTweetMedia(tweet).hasVisual ? 'photo' : 'text';
}

export function shouldShowCount(n: number): boolean {
  return n >= COUNTER_FLOOR;
}

/**
 * Nombre de lignes qu'occupera le texte, borné à `TEXT_MAX_LINES` — la même
 * borne que le `numberOfLines` du rendu, sans quoi l'estimation dépasserait la
 * carte réelle sur les tweets longs.
 *
 * `0,52 em` par caractère est la largeur moyenne observée pour une sans-serif
 * à cette taille : une estimation, assumée comme telle. Elle n'a pas besoin
 * d'être exacte, seulement cohérente entre les deux colonnes.
 */
export function estimatedLines(length: number, cardWidth: number): number {
  const charsPerLine = Math.max(8, Math.round(cardWidth / (TEXT_FONT_SIZE * 0.52)));
  return Math.max(1, Math.min(TEXT_MAX_LINES, Math.ceil(length / charsPerLine)));
}

export function estimatedHeightOf(tweet: Tweet, cardWidth: number): number {
  if (formatOf(tweet) === 'photo') {
    return Math.round(cardWidth * MEDIA_RATIO) + BYLINE_HEIGHT;
  }
  const lines = estimatedLines(displayContentOf(tweet).length, cardWidth);
  return Math.round(lines * TEXT_LINE_HEIGHT + TEXT_PADDING_V + BYLINE_HEIGHT);
}

/**
 * Décrit chaque tweet en un seul passage : format et hauteur estimée. C'est
 * l'entrée unique du mur — `wallLayout` ne manipule que des `CardMeta`, jamais
 * des `Tweet` bruts.
 */
export function describeCards(tweets: Tweet[], cardWidth: number): CardMeta[] {
  return tweets.map((tweet) => ({
    tweet,
    format: formatOf(tweet),
    height: estimatedHeightOf(tweet, cardWidth),
  }));
}
