import { apiService } from './api';

/**
 * Édition d'un tweet publié — avantage abonné.
 *
 * Miroir de `api/src/services/tweetEditService.js`. Trois règles, toutes
 * tenues par le serveur : abonnement actif, fenêtre de 30 minutes après la
 * publication, historique public.
 *
 * L'historique public n'est pas un détail d'implémentation : c'est ce qui
 * distingue une correction d'une réécriture. L'app doit donc TOUJOURS montrer
 * la mention « modifié » et rendre l'historique atteignable — le masquer
 * transformerait la fonctionnalité en outil de révisionnisme.
 */

export interface EditRevision {
  revision: number;
  previous_content: string;
  new_content: string;
  edited_at: string;
  edited_by: { id: string; username: string } | null;
}

/** Joint à un tweet par la route de détail (`tweet.edit_info`), `null` si jamais modifié. */
export interface EditInfo {
  edited: boolean;
  revisions: number;
  last_edited_at: string | null;
}

export type EditBlockReason = 'subscription_required' | 'window_closed' | 'max_revisions' | null;

export interface Editability {
  can_edit: boolean;
  reason: EditBlockReason;
  remaining_ms: number;
  revisions_used: number;
  max_revisions: number;
  window_ms: number;
}

export const BLOCK_LABELS: Record<Exclude<EditBlockReason, null>, string> = {
  subscription_required: 'La modification est réservée aux abonnés.',
  window_closed: 'La fenêtre de 30 minutes est passée.',
  max_revisions: 'Ce tweet a atteint sa limite de modifications.',
};

export class TweetEditError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

export async function fetchEditability(tweetId: string): Promise<Editability> {
  const response = await apiService.get(`/api/tweets/${tweetId}/editability`);
  if (!response?.success) {
    throw new TweetEditError(response?.message || 'État d\'édition indisponible.', response?.code);
  }
  return response.data;
}

export async function fetchHistory(tweetId: string): Promise<EditRevision[]> {
  const response = await apiService.get(`/api/tweets/${tweetId}/edit-history`);
  if (!response?.success) {
    throw new TweetEditError(response?.message || 'Historique indisponible.');
  }
  return response.data?.revisions || [];
}

/**
 * Applique la modification.
 *
 * Passe par `PUT /api/tweets/:id`, la route historique — c'est elle que le
 * serveur fait désormais transiter par le service d'édition. Une seconde
 * route pour la même écriture aurait laissé la première ouverte.
 */
export async function editTweet(tweetId: string, content: string): Promise<void> {
  const response = await apiService.put(`/api/tweets/${tweetId}`, { content });
  if (!response?.success) {
    throw new TweetEditError(response?.message || 'Modification impossible.', response?.code);
  }
}

/** « 12 min restantes » — un compte à rebours vaut mieux qu'un bouton qui échoue. */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return 'terminé';
  const minutes = Math.floor(ms / 60000);
  if (minutes >= 1) return `${minutes} min restantes`;
  return `${Math.max(1, Math.floor(ms / 1000))} s restantes`;
}
