import { splitTweetMedia, displayContentOf } from '../../../utils/tweetMedia';
import type { Tweet } from '../../../types/api';

/**
 * Toutes les décisions de forme du mur Explorer, en un seul module PUR.
 *
 * ── Pourquoi la forme n'est jamais tirée au sort ───────────────────────────
 * La version précédente choisissait le ratio d'une carte par hash de son id :
 * déterministe, mais arbitraire — la forme ne disait rien du tweet. Ici la
 * forme DÉCOULE de la longueur du texte, donc un tweet court REMPLIT une
 * grande typo et un tweet long reçoit une carte dense. C'est ce qui sépare une
 * mise en page dessinée d'une mise en page générée.
 *
 * ── Pourquoi la largeur est un paramètre ───────────────────────────────────
 * L'ancien module figeait `CARD_WIDTH` au chargement via `Dimensions.get()` :
 * après une rotation ou en écran partagé, toutes les hauteurs estimées étaient
 * fausses et les colonnes partaient en dents de scie. La largeur traverse
 * désormais chaque fonction.
 *
 * ⚠️ INVARIANT : `estimatedHeightOf` doit rester la SEULE source de vérité de
 * la hauteur, utilisée par le rendu ET par l'équilibrage des colonnes. Deux
 * estimations divergentes remettent le bas de page en dents de scie.
 */

export type CardFormat = 'declaration' | 'citation' | 'bloc' | 'photo';
export type CardFill = 'surface' | 'surfaceAlt' | 'accent' | 'contrast';

export interface CardMeta {
  tweet: Tweet;
  format: CardFormat;
  fill: CardFill;
  /** Hauteur estimée, pour l'équilibrage des colonnes. */
  height: number;
}

/** Bornes de longueur. 55 % du corpus réel tient sous `DECLARATION_MAX`. */
export const DECLARATION_MAX = 46;
export const CITATION_MAX = 100;

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
 * Cadence des fonds pleins, indexée sur le RANG DE LA DÉCLARATION (pas sur sa
 * position dans la liste) : deux déclarations séparées par des cartes d'un
 * autre format doivent se suivre dans la cadence, sinon la densité de magenta
 * dépend du hasard du mélange `trending`.
 *
 * Cinq crans, dont un accent et un contraste : le magenta touche 1 déclaration
 * sur 5, soit ~11 % de toutes les cartes. Il ponctue, il n'habille pas.
 */
export const FILL_CADENCE: CardFill[] = [
  'surface',
  'surface',
  'accent',
  'surface',
  'contrast',
];

export function formatOf(tweet: Tweet): CardFormat {
  // Le média l'emporte toujours : `hasVisual` gère le cas des vidéos, dont
  // `media_urls` vaut [url_vidéo, url_miniature] — mesurer l'index 0 traitait
  // toute vidéo comme une image et l'affichait comme une case vide.
  if (splitTweetMedia(tweet).hasVisual) return 'photo';
  const length = displayContentOf(tweet).length;
  if (length <= DECLARATION_MAX) return 'declaration';
  if (length <= CITATION_MAX) return 'citation';
  return 'bloc';
}

export function shouldShowCount(n: number): boolean {
  return n >= COUNTER_FLOOR;
}

/**
 * Corps de la Déclaration : plus le tweet est court, plus il est grand.
 * Interlignage serré (0,95 × la taille) — c'est ce qui donne le bloc compact
 * d'une affiche plutôt qu'un paragraphe aéré.
 */
export function declarationType(length: number): {
  fontSize: number;
  lineHeight: number;
  lines: number;
} {
  if (length <= 20) return { fontSize: 36, lineHeight: 34, lines: 4 };
  if (length <= 32) return { fontSize: 32, lineHeight: 30, lines: 5 };
  return { fontSize: 28, lineHeight: 27, lines: 5 };
}

/** Corps des formats Citation et Bloc. */
export function quoteType(length: number): {
  fontSize: number;
  lineHeight: number;
  lines: number;
  boxHeight: (cardWidth: number) => number;
} {
  if (length <= CITATION_MAX) {
    return {
      fontSize: 17,
      lineHeight: 23,
      lines: 6,
      boxHeight: (w) => Math.round(w * 1.02),
    };
  }
  return {
    fontSize: 14.5,
    lineHeight: 19,
    lines: 9,
    boxHeight: (w) => Math.round(w * 1.34),
  };
}

/** Ratio de la vignette photo, choisi par hash stable de l'id. */
const MEDIA_RATIOS = [0.78, 1.05, 1.32, 1.6];

function hashId(id: string | number): number {
  const s = String(id);
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Signature textuelle sous une carte Photo ou Bloc — une seule ligne, sans
 * avatar. Les Déclarations et Citations n'en ont pas du tout : avec 3 comptes
 * pour 88 % du volume, une ligne d'auteur partout affiche les mêmes trois
 * visages en boucle, ce qui lit « désert ».
 */
const BYLINE_HEIGHT = 26;

export function estimatedHeightOf(tweet: Tweet, cardWidth: number): number {
  const format = formatOf(tweet);
  const content = displayContentOf(tweet);

  if (format === 'photo') {
    const ratio = MEDIA_RATIOS[hashId(tweet.id) % MEDIA_RATIOS.length];
    return Math.round(cardWidth * ratio) + BYLINE_HEIGHT;
  }
  if (format === 'declaration') {
    const type = declarationType(content.length);
    // Le bloc plein se dimensionne sur son texte, avec une marge fixe
    // généreuse — c'est une affiche, pas un paragraphe.
    const lines = Math.min(
      type.lines,
      Math.max(1, Math.ceil(content.length / Math.max(8, cardWidth / (type.fontSize * 0.52)))),
    );
    return Math.round(lines * type.lineHeight + 56);
  }
  const type = quoteType(content.length);
  return type.boxHeight(cardWidth) + (format === 'bloc' ? BYLINE_HEIGHT : 0);
}

/**
 * Décrit chaque tweet en un seul passage : format, place dans la cadence de
 * couleur, hauteur estimée. C'est l'entrée unique du mur — `wallLayout` ne
 * manipule que des `CardMeta`, jamais des `Tweet` bruts.
 */
export function describeCards(tweets: Tweet[], cardWidth: number): CardMeta[] {
  let declarationRank = 0;
  return tweets.map((tweet) => {
    const format = formatOf(tweet);
    let fill: CardFill = 'surface';
    if (format === 'declaration') {
      fill = FILL_CADENCE[declarationRank % FILL_CADENCE.length];
      declarationRank += 1;
    } else if (format === 'bloc') {
      // Léger contraste de fond pour distinguer un pavé de texte d'une
      // citation, sans introduire une couleur de plus.
      fill = 'surfaceAlt';
    }
    return { tweet, format, fill, height: estimatedHeightOf(tweet, cardWidth) };
  });
}
