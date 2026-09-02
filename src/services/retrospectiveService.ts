/**
 * Rétrospective annuelle du compte connecté.
 *
 * La route est volontairement limitée à `me` côté serveur : on ne consulte pas
 * la rétrospective de quelqu'un d'autre en ouvrant son profil. Elle est aussi
 * fermée par le drapeau `profil.retrospective`, et répond 404 hors allowlist —
 * d'où le `null` silencieux ici plutôt qu'une erreur remontée à l'écran.
 */
import apiService from './api';

export const RETROSPECTIVE_FLAG = 'profil.retrospective';

export interface RetroTweet {
  text: string;
  date: string;
}

export interface RetroTopTweet extends RetroTweet {
  views: number;
  likes: number;
}

export interface Retrospective {
  year: number;
  handle: string;
  displayName: string;
  avatar: string | null;
  /** Video pre-rendue, servie par /static. `null` si elle n'existe pas encore. */
  video: { url: string } | null;

  tweets: number;
  views: number;
  likesReceived: number;
  newFollowers: number;
  followersTotal: number;

  firstTweet: RetroTweet | null;
  topTweet: RetroTopTweet | null;

  monthly: number[];
  bestMonth: number;
  hourHistogram: number[];
  peakHour: number;
  bestDay: { label: string; count: number } | null;

  word: string | null;
  wordCount: number;

  topReaders: { handle: string; interactions: number }[];
  given: { likes: number; replies: number; retweets: number };

  rankPercent: number | null;
}

export const MONTHS_SHORT = [
  'jan',
  'fév',
  'mar',
  'avr',
  'mai',
  'juin',
  'juil',
  'août',
  'sep',
  'oct',
  'nov',
  'déc',
];

export const MONTHS_LONG = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

/** Sépare les milliers par une espace, façon française. */
export const groupFr = (n: number): string =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/**
 * L'année couverte par la rétrospective : l'année qui vient de s'écouler dès
 * qu'on est passé en janvier, l'année en cours le reste du temps.
 */
export function retrospectiveYear(now: Date = new Date()): number {
  return now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
}

export async function fetchRetrospective(
  year: number = retrospectiveYear()
): Promise<Retrospective | null> {
  try {
    const response = await apiService.get(
      `/api/user-stats/me/retrospective?year=${year}`
    );
    if (!response?.success || !response.data) return null;
    return response.data as Retrospective;
  } catch {
    return null;
  }
}
