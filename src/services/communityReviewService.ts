import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG } from '../config/api';
import tokenStore from './tokenStore';
import { buildClientHeaders } from './clientIdentity';

/**
 * Revue communautaire — client mobile.
 *
 * Un contenu signalé est réécrit par un modèle (prénoms, pseudos, lieux et
 * coordonnées remplacés) puis confié à un jury de trois personnes tirées au
 * sort. Le juré tranche conforme / non conforme ; le palier de sanction est
 * décidé côté serveur, après coup, par un modèle arbitre.
 *
 * ⚠ Le serveur ne renvoie VOLONTAIREMENT ni les motifs de signalement, ni le
 * décompte des voix, ni la sanction qui a suivi. Savoir que deux personnes ont
 * déjà tranché, ou qu'un bannissement est au bout, déplace un vote. Ne pas
 * chercher à reconstituer ces informations ici : elles n'existent pas dans la
 * réponse, et c'est le cœur de la fonctionnalité.
 */

/** Un contenu à juger — volontairement pauvre, voir l'avertissement ci-dessus. */
export interface ReviewItem {
  id: string;
  /** Texte réécrit par le modèle — l'original n'est jamais transmis au juré. */
  content: string;
  /** Nombre de passages identifiants remplacés. */
  redactions: number;
  /** Le tweet portait des médias : ils ne sont pas montrés (non anonymisables). */
  had_media: boolean;
}

export interface ReviewStats {
  /** Contenus en attente de jury — ne dit rien de celui affiché. */
  open: number;
  my_votes: number;
}

/** Pourquoi ce compte n'a pas le droit de siéger, quand c'est le cas. */
export type ReviewIneligibility = 'compte_trop_recent' | 'compte_inactif' | 'compte_introuvable';

export interface ReviewQueue {
  item: ReviewItem | null;
  stats: ReviewStats | null;
  ineligible: ReviewIneligibility | null;
  /** Renseigné quand l'appel a échoué — à distinguer d'une file vide. */
  error?: string;
}

export type ReviewVerdict = 'compliant' | 'violation';

export interface ReviewVoteResult {
  ok: boolean;
  /**
   * Le contenu a bougé sous nos pieds (jury conclu sans nous, place expirée).
   * Ce n'est pas une panne : l'app enchaîne sur le suivant sans rien signaler.
   */
  stale?: boolean;
  message?: string;
}

class CommunityReviewService {
  private baseUrl = `${API_CONFIG.BASE_URL}/api/community-moderation`;

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await tokenStore.getAccessToken();
    return {
      ...(await buildClientHeaders({ 'Content-Type': 'application/json' })),
      ...(token && { Authorization: `Bearer ${token}` }),
    };
  }

  /**
   * Le contenu confié à cette personne.
   *
   * Idempotent côté serveur : tant qu'elle n'a pas voté, le même appel renvoie
   * le même contenu. Rafraîchir ne consomme donc pas un item de plus et ne
   * permet pas de « passer » un contenu gênant en relançant l'écran.
   */
  async next(): Promise<ReviewQueue> {
    try {
      const response = await fetch(`${this.baseUrl}/next`, {
        method: 'GET',
        headers: await this.getAuthHeaders(),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        return {
          item: null,
          stats: null,
          ineligible: null,
          error: body?.message || 'Revue indisponible pour le moment.',
        };
      }

      const data = body?.data ?? body;
      return {
        item: data?.item ?? null,
        stats: data?.stats ?? null,
        ineligible: data?.ineligible ?? null,
      };
    } catch {
      return { item: null, stats: null, ineligible: null, error: 'Pas de connexion.' };
    }
  }

  /**
   * Enregistre le verdict. Aucun questionnaire à joindre, et rien n'est
   * renvoyé : l'app n'a pas à savoir ce que le vote a déclenché.
   *
   * Un 409 signifie que l'item n'est plus à nous — traité comme `stale`, pas
   * comme une erreur à afficher.
   */
  async vote(itemId: string, verdict: ReviewVerdict): Promise<ReviewVoteResult> {
    try {
      const response = await fetch(`${this.baseUrl}/${itemId}/vote`, {
        method: 'POST',
        headers: await this.getAuthHeaders(),
        body: JSON.stringify({ verdict }),
      });

      if (response.status === 409) return { ok: false, stale: true };
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        return { ok: false, message: body?.message || 'Vote impossible.' };
      }
      return { ok: true };
    } catch {
      return { ok: false, message: 'Pas de connexion.' };
    }
  }
}

export const communityReviewService = new CommunityReviewService();
