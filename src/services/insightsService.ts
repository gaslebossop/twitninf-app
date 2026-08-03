import { apiService } from './api';
import {
  InsightsError,
  finiteNumber,
  unwrapInsightsResponse,
} from './insightsContract';

export { InsightsError } from './insightsContract';

/**
 * Renseignements réservés aux abonnés : visiteurs de profil, veille
 * usurpation, radar des comptes qui montent, alertes de décollage.
 *
 * Miroir de `api/src/routes/insightsRoutes.js`. Aucune de ces routes ne prend
 * d'identifiant : elles ne parlent que du compte connecté. Il n'y a donc rien
 * ici qui permette de consulter les visiteurs ou les alertes de quelqu'un
 * d'autre, et c'est délibéré.
 */

const BASE = '/api/insights';

/**
 * Revenus nets du compte, jour par jour.
 *
 * `net` est ce qui arrive vraiment sur le portefeuille, commission déduite —
 * pas le prix affiché. `delta_percent` vaut `null` quand la période
 * précédente est à zéro : « +100 % » sur une première vente serait faux.
 */
export interface EarningsData {
  window_days: number;
  net: number;
  previous_net: number;
  delta_percent: number | null;
  by_source: { content: number; username: number };
  series: Array<{ day: string; net: number }>;
}

export interface VisitorEntry {
  viewed_on: string;
  user: {
    id: string;
    username: string;
    full_name: string;
    avatar: string | null;
    verified: boolean;
    verification_style?: string | null;
    premium?: boolean;
    subscription_tier?: string | null;
  };
}

export interface VisitorsData {
  window_days: number;
  /** Visiteurs uniques, discrets compris. */
  total_visitors: number;
  /** Comptés, jamais nommés — la contrepartie du mode discret. */
  hidden_visitors: number;
  visitors: VisitorEntry[];
}

export type ImpersonationReason =
  | 'username_lookalike'
  | 'username_similar'
  | 'same_avatar'
  | 'same_bio'
  | 'same_display_name';

export const REASON_LABELS: Record<ImpersonationReason, string> = {
  username_lookalike: 'Pseudo imitant le tien',
  username_similar: 'Pseudo très proche',
  same_avatar: 'Même photo de profil',
  same_bio: 'Même bio',
  same_display_name: 'Même nom affiché',
};

export interface ImpersonationAlert {
  id: string;
  score: number;
  reasons: ImpersonationReason[];
  status: 'open' | 'reported' | 'dismissed';
  detected_at: string;
  suspect: {
    id: string;
    username: string;
    full_name: string;
    avatar: string | null;
    verified: boolean;
    account_created_at: string;
    username_at_detection: string | null;
  } | null;
}

export interface RisingAccount {
  user: {
    id: string;
    username: string;
    full_name: string;
    avatar: string | null;
    bio: string | null;
    verified: boolean;
    verification_style?: string | null;
    premium?: boolean;
    subscription_tier?: string | null;
  };
  new_followers: number;
  total_followers: number;
  /** Abonnements en commun : ce qui fait qu'un compte t'est proposé à TOI. */
  common_follows: number;
  growth_rate: number;
  window_days: number;
}

export interface VelocityAlert {
  id: string;
  tweet_id: string;
  tweet: { id: string; content: string; created_at: string } | null;
  engagements: number;
  /** Multiple du rythme habituel de l'auteur. */
  ratio: number;
  detected_at: string;
  tweet_age_minutes: number;
}

export interface NicheTrendingTweet {
  tweet: {
    id: string;
    content: string;
    created_at: string;
    media_urls: string[];
    hashtags: string[];
    author: {
      id: string;
      username: string;
      full_name: string;
      avatar: string | null;
      verified: boolean;
      verification_style?: string | null;
      premium?: boolean;
      subscription_tier?: string | null;
    };
  };
  engagements: number;
  likes: number;
  retweets: number;
  replies: number;
  /** Multiple du rythme normal observé pour ce tweet. */
  velocity_ratio: number;
  /** Affinité avec l'univers du compte connecté, comprise entre 0 et 1. */
  niche_affinity: number;
  reasons: string[];
  window_hours: number;
}

// ── Visiteurs ──────────────────────────────────────────────────────────────

export async function fetchVisitors(days?: number): Promise<VisitorsData> {
  const response = await apiService.get(`${BASE}/visitors`, days ? { days } : undefined);
  return unwrapInsightsResponse(response, 'Visiteurs indisponibles.');
}

export async function fetchVisitorCount(): Promise<{ count: number; window_days: number }> {
  const response = await apiService.get(`${BASE}/visitors/count`);
  return unwrapInsightsResponse(response, 'Compteur indisponible.');
}

export async function fetchEarnings(days = 30): Promise<EarningsData> {
  const response = await apiService.get(`${BASE}/earnings`, { days });
  return unwrapInsightsResponse(response, 'Revenus indisponibles.');
}

export async function fetchIncognito(): Promise<boolean> {
  const response = await apiService.get(`${BASE}/visitors/incognito`);
  return Boolean(unwrapInsightsResponse<any>(response, 'Réglage indisponible.').enabled);
}

/** Voir sans être vu — la contrepartie, pas une option secondaire. */
export async function setIncognito(enabled: boolean): Promise<boolean> {
  const response = await apiService.put(`${BASE}/visitors/incognito`, { enabled });
  return Boolean(unwrapInsightsResponse<any>(response, 'Réglage impossible.').enabled);
}

// ── Usurpation ─────────────────────────────────────────────────────────────

export async function fetchImpersonationAlerts(
  status: 'open' | 'reported' | 'dismissed' | 'all' = 'open',
): Promise<ImpersonationAlert[]> {
  const response = await apiService.get(`${BASE}/impersonation`, { status });
  return unwrapInsightsResponse(response, 'Alertes indisponibles.', 'array');
}

/** Relance le scan — utile juste après un changement d'avatar ou de pseudo. */
export async function rescanImpersonation(): Promise<ImpersonationAlert[]> {
  const response = await apiService.post(`${BASE}/impersonation/scan`);
  return unwrapInsightsResponse(response, 'Scan impossible.', 'array');
}

/** Écartée une fois, une alerte ne revient jamais. */
export async function dismissAlert(alertId: string): Promise<void> {
  const response = await apiService.post(`${BASE}/impersonation/${alertId}/dismiss`);
  unwrapInsightsResponse(response, 'Action impossible.');
}

export async function reportAlert(alertId: string, details?: string): Promise<{ report_id: string }> {
  const response = await apiService.post(`${BASE}/impersonation/${alertId}/report`, { details });
  return unwrapInsightsResponse(response, 'Signalement impossible.');
}

// ── Radar et décollage ─────────────────────────────────────────────────────

export async function fetchRisingAccounts(params?: {
  days?: number;
  limit?: number;
}): Promise<RisingAccount[]> {
  const response = await apiService.get(`${BASE}/rising`, params);
  return unwrapInsightsResponse(response, 'Radar indisponible.', 'array');
}

export async function fetchVelocityAlerts(limit?: number): Promise<VelocityAlert[]> {
  const response = await apiService.get(`${BASE}/velocity`, limit ? { limit } : undefined);
  return unwrapInsightsResponse(response, 'Historique indisponible.', 'array');
}

/** Tweets qui accélèrent dans l'univers du compte connecté, pas ses propres tweets. */
export async function fetchNicheTrendingTweets(params?: {
  days?: number;
  limit?: number;
}): Promise<NicheTrendingTweet[]> {
  const response = await apiService.get(`${BASE}/niche-trending`, params);
  const data = unwrapInsightsResponse<any[]>(
    response,
    'Tweets de ta niche indisponibles.',
    'array',
  );

  // PostgreSQL peut sérialiser certains agrégats numériques en chaînes.
  // Les convertir ici évite des ratios « NaN » ou des additions textuelles
  // dans les cartes, tout en conservant un contrat unique pour les écrans.
  return data.map((entry) => {
    if (!entry?.tweet?.id || !entry?.tweet?.author?.id || !entry?.tweet?.author?.username) {
      throw new InsightsError(
        'Le serveur a renvoyé un tweet incomplet. Réessaie après la prochaine mise à jour.',
        'invalid_response',
      );
    }

    return {
      ...entry,
      tweet: {
        ...entry.tweet,
        content: String(entry.tweet.content || ''),
        media_urls: Array.isArray(entry.tweet.media_urls) ? entry.tweet.media_urls.map(String) : [],
        hashtags: Array.isArray(entry.tweet.hashtags) ? entry.tweet.hashtags.map(String) : [],
        author: {
          ...entry.tweet.author,
          full_name: String(entry.tweet.author.full_name || entry.tweet.author.username),
          avatar: entry.tweet.author.avatar || null,
          verified: Boolean(entry.tweet.author.verified),
        },
      },
      engagements: finiteNumber(entry.engagements),
      likes: finiteNumber(entry.likes),
      retweets: finiteNumber(entry.retweets),
      replies: finiteNumber(entry.replies),
      velocity_ratio: finiteNumber(entry.velocity_ratio),
      niche_affinity: Math.max(0, Math.min(1, finiteNumber(entry.niche_affinity))),
      reasons: Array.isArray(entry.reasons) ? entry.reasons.map(String) : [],
      window_hours: finiteNumber(entry.window_hours, 24),
    };
  });
}

/** « il y a 3 j » — les listes de renseignements sont lues en diagonale. */
export function relativeDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return 'hier';
  if (days < 7) return `il y a ${days} j`;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
