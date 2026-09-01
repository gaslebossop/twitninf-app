import { apiService } from './api';

/**
 * Résultats des tests A/B de l'auteur connecté.
 *
 * Miroir de `listAuthorExperiments` (`api/src/services/tweetAbTestService.js`)
 * et de `GET /api/tweets/ab-tests/mine`.
 *
 * ── La portée se compte en PERSONNES ─────────────────────────────────────
 *
 * `reach` — le nombre de personnes réellement servies — est la seule mesure
 * d'audience à utiliser. `impressions` compte les événements `View` sans
 * déduplication : une variante affichait en production **129 impressions pour
 * 8 personnes**, parce que le même lecteur recompte à chaque fois que le tweet
 * repasse dans son fil.
 *
 * `impressions` compte une EXPOSITION par événement reçu (correction du
 * 2026-09-01 dans le moteur Rust). Avant, seul un `View` l'incrémentait et
 * tout le reste allait dans `interactions` : les deux étaient disjoints, leur
 * rapport n'était pas un taux, et l'écran affichait « 1 vue · 5 interactions ».
 *
 * **Ne jamais appeler `impressions` des « vues ».** Ce sont des expositions :
 * une même personne en produit plusieurs en faisant défiler son fil.
 *
 * ── Ce que le serveur refuse de calculer, et pourquoi ────────────────────
 *
 * `engagement_rate` vaut `null` tant que la variante n'a pas atteint le seuil
 * de son expérience. Ce n'est pas une donnée manquante : c'est le serveur qui
 * refuse de produire un chiffre trompeur.
 *
 * Sur vingt personnes, un écart « B : 12 % · A : 8 % » est du bruit — une
 * seule interaction de plus fait basculer le classement. Mais un pourcentage
 * affiché se lit comme un résultat, et l'auteur écrirait ses tweets suivants
 * en suivant du hasard.
 *
 * **Ne jamais remplacer un `null` par `0` ni recalculer le taux côté client.**
 * Les comptes bruts, eux, sont vrais à n'importe quel volume et s'affichent
 * toujours.
 */

const BASE = '/api/tweets/ab-tests/mine';

export type AbExperimentStatus = 'pending' | 'active' | 'completed' | 'cancelled';

export interface AbVariantResult {
  id: string;
  position: number;
  /** « A », « B »… tel qu'affiché à l'auteur au moment de la création. */
  label: string;
  content: string;
  /** La formulation d'origine du tweet — celle à battre. */
  is_control: boolean;
  moderation_status: 'pending' | 'approved' | 'rejected';
  /** Personnes réellement servies. LA mesure d'audience. */
  reach: number;
  /** Expositions : une par événement reçu. Non dédupliquées par personne. */
  impressions: number;
  interactions: number;
  /** `interactions / impressions`, ou `null` tant que le seuil n'est pas atteint. */
  engagement_rate: number | null;
  /** Assez de monde pour qu'un taux veuille dire quelque chose ? */
  sufficient: boolean;
}

export interface AbExperimentResult {
  id: string;
  tweet_id: string;
  status: AbExperimentStatus;
  strategy: string;
  platform_scope: string;
  min_impressions_per_variant: number;
  winner_variant_id: string | null;
  cancellation_reason: string | null;
  activated_at: string | null;
  completed_at: string | null;
  created_at: string;
  variants: AbVariantResult[];
  /** Vrai seulement si TOUTES les variantes ont franchi le seuil. */
  comparable: boolean;
  total_reach: number;
  total_impressions: number;
  total_interactions: number;
}

export async function fetchMyAbTests(limit = 20): Promise<AbExperimentResult[]> {
  try {
    const res = await apiService.request(`${BASE}?limit=${limit}`, { requiresAuth: true });
    if (!res?.success) return [];
    return Array.isArray(res?.data?.experiments) ? res.data.experiments : [];
  } catch {
    // Le Studio charge une dizaine de sources en parallèle : une seule qui
    // échoue ne doit pas vider l'écran.
    return [];
  }
}

/**
 * La variante qui mène, ou `null` si on ne peut pas encore le dire.
 *
 * Rend `null` dès que l'expérience n'est pas `comparable`, **et** en cas
 * d'égalité stricte : annoncer un gagnant sur une égalité serait le pire
 * des trois cas, puisque rien à l'écran ne dirait que c'est arbitraire.
 */
export function leadingVariant(exp: AbExperimentResult): AbVariantResult | null {
  if (!exp.comparable) return null;
  const rated = exp.variants.filter((v) => v.engagement_rate !== null);
  if (rated.length < 2) return null;

  const sorted = [...rated].sort(
    (a, b) => (b.engagement_rate as number) - (a.engagement_rate as number),
  );
  if (sorted[0].engagement_rate === sorted[1].engagement_rate) return null;
  return sorted[0];
}

/** « 12,4 % ». Rend `null` quand le taux n'existe pas — jamais « 0 % ». */
export function formatRate(rate: number | null): string | null {
  if (rate === null || !Number.isFinite(rate)) return null;
  return `${(rate * 100).toFixed(1).replace('.', ',')} %`;
}

export default { fetchMyAbTests, leadingVariant, formatRate };
