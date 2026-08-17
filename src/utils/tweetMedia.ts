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
