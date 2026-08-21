/**
 * Lecture du média d'un tweet — séparation vidéo / photos / miniature.
 *
 * Le backend range `media_urls` d'un tweet vidéo comme `[url_vidéo,
 * url_miniature]` (voir `POST /api/tweets/video` côté API). Une surface qui
 * prend naïvement `media_urls[0]` pour une photo affiche donc un `.mp4` dans
 * une balise image : un rectangle vide, sans indice de vidéo ni moyen de la
 * lire. C'est exactement ce que faisait la grille Explorer — tous les tweets
 * vidéo, le contenu le plus regardé de l'app, y étaient des cases grises.
 *
 * La règle est la même partout : on cherche d'abord une URL vidéo, et ce qui
 * reste devient la miniature. `TweetRow` porte historiquement sa propre copie
 * de cette logique ; ce module est le point de reprise pour les surfaces
 * suivantes.
 */
import type { Tweet } from '../types/api';

export const VIDEO_URL_RE = /\.(mp4|mov|m3u8|webm)(\?|$)/i;

export interface TweetMedia {
  /** Photos affichables (vide si le tweet porte une vidéo). */
  images: string[];
  /** URL de lecture, si le tweet porte une vidéo. */
  videoUrl: string | null;
  /** Image fixe de la vidéo, à afficher tant qu'elle n'est pas prête. */
  posterUrl: string | null;
  /** Première image montrable, vidéo ou photo — ce qu'une vignette doit utiliser. */
  coverUrl: string | null;
  /** Vrai si le tweet a quoi que ce soit à montrer en image. */
  hasVisual: boolean;
}

const EMPTY: TweetMedia = {
  images: [],
  videoUrl: null,
  posterUrl: null,
  coverUrl: null,
  hasVisual: false,
};

/**
 * Tweet qui porte réellement le contenu.
 *
 * Un retweet pur n'a ni texte ni média propres : tout est sur l'original. Viser
 * la ligne du retweet renverrait une carte vide alors que le tweet repartagé a
 * bien une photo.
 */
export function contentSourceOf<T extends Tweet | null | undefined>(tweet: T): T {
  if (!tweet) return tweet;
  const original = (tweet as any).originalTweet;
  const isRetweet = Boolean(tweet.is_retweet) || tweet.tweet_type === 'retweet';
  return (isRetweet && original ? original : tweet) as T;
}

export function splitTweetMedia(tweet: Tweet | null | undefined): TweetMedia {
  const source = contentSourceOf(tweet);
  if (!source) return EMPTY;

  const raw = Array.isArray((source as any).media_urls) ? (source as any).media_urls : [];
  const urls: string[] = raw.filter((url: unknown): url is string => typeof url === 'string' && !!url);
  if (urls.length === 0) return EMPTY;

  const videoUrl = urls.find((url) => VIDEO_URL_RE.test(url)) || null;
  if (!videoUrl) {
    return {
      images: urls,
      videoUrl: null,
      posterUrl: null,
      coverUrl: urls[0],
      hasVisual: true,
    };
  }

  // Tout ce qui n'est pas la vidéo est sa miniature. Une vidéo sans miniature
  // reste jouable : `coverUrl` est simplement nul et l'appelant affiche son
  // propre fond en attendant la première image décodée.
  const posterUrl = urls.find((url) => url !== videoUrl) || null;
  return {
    images: [],
    videoUrl,
    posterUrl,
    coverUrl: posterUrl,
    hasVisual: true,
  };
}

/** Texte réellement affichable d'un tweet (celui de l'original pour un retweet). */
export function displayContentOf(tweet: Tweet | null | undefined): string {
  const source = contentSourceOf(tweet);
  return String(source?.content || '').trim();
}

/**
 * Ce tweet a-t-il quelque chose à montrer ?
 *
 * ── Le bug que cette fonction remplace ───────────────────────────────────
 * Les deux fils filtraient sur `tweet.content` truthy, et les deux lignes
 * (`TweetRow`, `TweetRowGutter`) refusaient de se rendre sur le même test.
 * Or `content` est VIDE dans trois cas parfaitement légitimes :
 *
 *  1. un RETWEET PUR — son texte et son média sont sur `originalTweet`, la
 *     ligne du retweet ne porte qu'un lien vers lui ;
 *  2. un tweet publié EN IMAGE (ou en vidéo) SEULE, sans légende ;
 *  3. un COMPTE PROMU (`promoted_account`), qui n'est pas un tweet du tout et
 *     dont l'écran a sa propre carte.
 *
 * Ces trois familles étaient donc jetées en silence, entre le moment où le
 * recommandeur les servait et celui où la liste les affichait. Personne ne
 * voyait d'erreur : le fil était juste plus court que la page reçue.
 *
 * ── Pourquoi ça compte au-delà de l'affichage ────────────────────────────
 * Le moteur mémorise le vecteur de features de CHAQUE tweet qu'il sert
 * (`record_impressions`), et son balayeur d'attribution convertit en exemple
 * NÉGATIF toute impression restée sans interaction au bout de 30 minutes. Un
 * tweet jeté par le client n'est jamais affiché, ne reçoit donc jamais rien,
 * et devient automatiquement un « montré, ignoré ».
 *
 * Autrement dit le modèle de clic a appris que les retweets et les tweets en
 * image seule ne s'engagent pas — sur des impressions que personne n'a jamais
 * vues. Et l'auto-réglage des poids de dimension repart de ces mêmes poids
 * appris : la contamination remontait jusqu'au classement de tout le monde.
 *
 * ── La règle ─────────────────────────────────────────────────────────────
 * Celle que l'API applique déjà de son côté (`hasRenderableContent`), et que
 * la grille Explorer applique depuis son propre correctif : du texte OU du
 * média, sur le tweet ou sur sa source. `contentSourceOf` ci-dessus fait déjà la bascule vers l'original d'un retweet.
 */
export function hasRenderableContent(tweet: Tweet | null | undefined): boolean {
  if (!tweet?.id) return false;

  // Un compte promu n'a ni contenu ni média propres : c'est un profil à
  // montrer, et l'écran lui rend une carte dédiée (`PromotedAccountCard`).
  if ((tweet as any).promoted_account) return true;

  // Une citation porte son sens dans le tweet cité : elle reste lisible même
  // sans commentaire au-dessus. `contentSourceOf` ne bascule que pour les
  // retweets, d'où ce cas à part.
  if ((tweet as any).is_quote || (tweet as any).tweet_type === 'quote') {
    if ((tweet as any).originalTweet) return true;
  }

  if (displayContentOf(tweet).length > 0) return true;

  return splitTweetMedia(tweet).hasVisual;
}
