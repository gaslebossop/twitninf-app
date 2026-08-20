import { apiService } from './api';
import { Tweet } from '../types/api';

export type NeuralRankMode = 'for_you' | 'feed' | 'discover' | 'trending';

export interface NeuralRankResponse {
  success: boolean;
  engine?: string;
  data: {
    recommendations: Tweet[];
    count: number;
    algorithm?: string;
    latency_ms?: number;
    cache_hit?: boolean;
    pagination: {
      limit: number;
      offset: number;
      hasMore: boolean;
      total: number;
    };
  };
  error?: string;
}

export interface NeuralRankTrackRequest {
  tweetId: string;
  interactionType: string;
  dwellMs?: number;
  /**
   * Nature du contenu regardé — indispensable pour interpréter `dwellMs`.
   *
   * Un temps brut est confondu avec la LONGUEUR du contenu : un pavé survolé
   * dure plus longtemps qu'un tweet court adoré. Le moteur rapporte donc le
   * temps observé au temps que ce contenu-là demandait (voir
   * `rust-recommender/src/algorithm/dwell.rs`). Sans ces champs il retombe sur
   * l'ancien calcul par paliers bruts.
   */
  dwellMedia?: 'text' | 'image' | 'video';
  contentChars?: number;
  videoDurationMs?: number;
  /**
   * Auteur du tweet — à joindre impérativement à `not_interested`.
   *
   * Sans lui, le refus ne porte que sur le tweet concerné : il en reste mille
   * du même compte, et le geste n'a aucun effet visible. C'est mesuré chez
   * YouTube (Mozilla, 2022) : « pas intéressé » évite 11 % des recommandations
   * non voulues, « ne plus recommander cette chaîne » 43 %.
   */
  authorId?: string;
  /**
   * Version A/B réellement affichée, quand le tweet en portait une.
   *
   * Sans ces deux champs le moteur retombe sur l'affectation stockée en base.
   * Ça marche tant que rien ne bouge, mais une expérience conclue entre le
   * moment où la page a été servie et celui où le geste a lieu attribue alors
   * l'interaction à la variante GAGNANTE plutôt qu'à celle qui était sous les
   * yeux — l'expérience se mesure elle-même à l'envers.
   */
  experimentId?: string;
  variantId?: string;
}

/**
 * Signaux qu'un écran peut joindre gratuitement à une interaction, parce qu'il
 * tient déjà l'objet tweet.
 *
 * Trois mécanismes du moteur ne se déclenchent QUE si l'auteur est connu — le
 * filtrage collaboratif, le boost temps réel de 30 minutes et le bandit
 * d'exploration (voir `rust-recommender/src/handlers/tracking.rs`). L'API sait
 * désormais le retrouver toute seule, mais ça lui coûte une requête : quand
 * l'écran l'a sous la main, autant l'envoyer.
 *
 * **Retweet pur : c'est l'auteur d'ORIGINE.** Créditer le retweeteur ferait
 * apprendre au moteur une affinité pour quelqu'un qui n'a rien écrit. Même
 * règle que `utils/engagementTarget` côté API.
 */
export function signalsFromTweet(tweet: any): Pick<
  NeuralRankTrackRequest,
  'authorId' | 'experimentId' | 'variantId'
> {
  if (!tweet) return {};
  const author = tweet?.originalTweet?.author || tweet?.author;
  const ab = tweet?.ab_test;
  return {
    authorId: author?.id ? String(author.id) : undefined,
    experimentId: ab?.experiment_id ? String(ab.experiment_id) : undefined,
    variantId: ab?.variant_id ? String(ab.variant_id) : undefined,
  };
}

/**
 * État de distribution du compte courant.
 *
 * Le pendant lisible de la restriction de portée : quels avertissements sont
 * actifs, pourquoi, quelles surfaces sont fermées, et à quelle date le compte
 * remonte. Une restriction qu'on ne peut ni voir ni dater ne se corrige pas —
 * c'est le raisonnement qui a conduit TikTok à publier une page « état du
 * compte » plutôt que de laisser deviner.
 */
export interface AccountStatus {
  user_id: string;
  /** 'Clean' | 'Monitoring' | 'Suppressed' | 'Ghosted' (capitale initiale). */
  level: string;
  /** Même valeur en minuscules — à préférer pour un test d'égalité. */
  level_label: 'clean' | 'monitoring' | 'suppressed' | 'ghosted';
  /** Phrase prête à afficher, déjà rédigée côté moteur. */
  summary: string;
  /** Vrai si l'état vient d'une décision humaine et non du calcul automatique. */
  manual: boolean;
  active_strikes: number;
  strike_ttl_days: number;
  /** Surfaces actuellement fermées : 'trending', 'discover', 'for_you'. */
  restricted_surfaces: string[];
  /** ISO 8601 — date à laquelle la restriction s'allège si rien ne s'ajoute. */
  recovers_at: string | null;
  nearing_permanent_ban: {
    policy: string;
    reason: string;
    active_strikes: number;
    limit: number;
  } | null;
  per_policy: Array<{
    policy: string;
    label: string;
    reason: string;
    active_strikes: number;
    permanent_limit: number;
    next_expiry: string | null;
  }>;
  /**
   * Frein temporaire (1h, score ×0.5) posé automatiquement après une
   * suppression de tweet, un changement d'avatar/bio, ou une rafale de
   * publication (10 tweets en 10 min) — voir `rust-recommender/src/velocity.rs`.
   *
   * Entièrement séparé du registre d'avertissements ci-dessus : `level` peut
   * rester `Clean` pendant que `velocity_throttled` est vrai. Pas de motif,
   * pas de date de retour exposée — il s'agit d'une heure, pas d'une sanction.
   */
  velocity_throttled: boolean;
}

class NeuralRankService {
  private baseUrl = '/api/neural-rank';

  async getRecommendations(options: {
    mode?: NeuralRankMode;
    limit?: number;
    offset?: number;
    /** Ignore le cache serveur (jusqu'à 60s pour `trending`) et recalcule le classement. */
    forceRefresh?: boolean;
    /**
     * Écarte les tweets déjà vus par ce lecteur dans les dernières 24 h.
     *
     * Le serveur renonce au filtrage s'il ne reste pas de quoi remplir la page :
     * une page déjà vue vaut mieux qu'une page vide.
     */
    excludeSeen?: boolean;
  } = {}): Promise<NeuralRankResponse> {
    const { mode = 'for_you', limit = 50, offset = 0, forceRefresh = false, excludeSeen = false } = options;

    try {
      const params = new URLSearchParams({
        mode,
        limit: limit.toString(),
        offset: offset.toString(),
      });
      if (forceRefresh) params.append('force_refresh', 'true');
      if (excludeSeen) params.append('exclude_seen', 'true');

      const response = await apiService.request(
        `${this.baseUrl}/recommendations?${params.toString()}`,
        { method: 'GET', requiresAuth: true }
      );

      return response;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erreur NeuralRank';
      console.error('[NeuralRank] getRecommendations error:', msg);
      return {
        success: false,
        error: msg,
        data: {
          recommendations: [],
          count: 0,
          pagination: { limit, offset, hasMore: false, total: 0 },
        },
      };
    }
  }

  async trackInteraction(req: NeuralRankTrackRequest): Promise<void> {
    try {
      await apiService.request(`${this.baseUrl}/track`, {
        method: 'POST',
        // `apiService.request` stringifie déjà le corps (voir `executeRequest`
        // dans `api.ts`) : le stringifier ici double l'encodage et le serveur
        // reçoit une CHAÎNE JSON au lieu d'un objet — rejet immédiat avec
        // « is not valid JSON ». C'était le cas ici : chaque interaction
        // suivie (like, dwell, pas intéressé…) échouait en silence, avalée
        // par le `catch` ci-dessous, sans jamais atteindre le moteur.
        body: req,
        requiresAuth: true,
      });
    } catch {
      // Tracking errors are non-fatal
    }
  }

  async onPublish(tweetId: string): Promise<void> {
    try {
      await apiService.request(`${this.baseUrl}/on-publish`, {
        method: 'POST',
        body: { tweetId },
        requiresAuth: true,
      });
    } catch {
      // Non-fatal
    }
  }

  /**
   * État de distribution du compte connecté — voir `AccountStatus`.
   *
   * `success: false` couvre deux cas distincts que l'écran doit distinguer :
   * le moteur a répondu que tout va bien (auquel cas `data` porte
   * `level_label: 'clean'`), ou le moteur était injoignable (auquel cas
   * `data` est absent). Ne jamais confondre les deux en affichant "compte
   * propre" par défaut sur une panne réseau.
   */
  async getAccountStatus(): Promise<{ success: boolean; data?: AccountStatus; message?: string }> {
    try {
      const response = await apiService.request(`${this.baseUrl}/account-status`, {
        method: 'GET',
        requiresAuth: true,
      });
      if (!response?.success) {
        return { success: false, message: response?.error || 'État du compte indisponible' };
      }
      return { success: true, data: response.data as AccountStatus };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'État du compte indisponible';
      console.error('[NeuralRank] getAccountStatus error:', msg);
      return { success: false, message: msg };
    }
  }

  /**
   * Un tour de la page « Recalibrer l'algorithme » (Paramètres, jamais
   * proposée automatiquement) — voir `CalibrationSession` pour la boucle
   * complète côté écran.
   *
   * `likedTweetIds`/`skippedTweetIds` sont CUMULÉS depuis le tour 1 de cette
   * session, pas seulement le tour précédent : le moteur en a besoin pour ne
   * jamais reproposer un tweet déjà vu.
   */
  async getCalibrationRound(
    round: number,
    likedTweetIds: string[],
    skippedTweetIds: string[],
  ): Promise<{ success: boolean; tweets: Tweet[]; message?: string }> {
    try {
      const response = await apiService.request(`${this.baseUrl}/calibration/round`, {
        method: 'POST',
        body: { round, likedTweetIds, skippedTweetIds },
        requiresAuth: true,
      });
      if (!response?.success) {
        return { success: false, tweets: [], message: response?.error || 'Tour indisponible' };
      }
      return { success: true, tweets: (response.data?.tweets as Tweet[]) || [] };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Tour de recalibration indisponible';
      console.error('[NeuralRank] getCalibrationRound error:', msg);
      return { success: false, tweets: [], message: msg };
    }
  }

  /**
   * Termine une session de recalibration. `likedTweetIds` = tous les choix
   * "ça m'intéresse", tous tours confondus — voir `rust-recommender/src/
   * calibration.rs` pour ce que ça déclenche : jamais un like public, un
   * signal algorithmique seulement (boost temps réel par auteur,
   * cooccurrence, vecteur de goût dédié).
   */
  async finishCalibration(likedTweetIds: string[]): Promise<{ success: boolean; applied: number }> {
    try {
      const response = await apiService.request(`${this.baseUrl}/calibration/finish`, {
        method: 'POST',
        body: { likedTweetIds },
        requiresAuth: true,
      });
      return { success: !!response?.success, applied: response?.data?.applied || 0 };
    } catch (error) {
      console.error('[NeuralRank] finishCalibration error:', error);
      return { success: false, applied: 0 };
    }
  }

  async healthCheck(): Promise<{ healthy: boolean }> {
    try {
      const res = await apiService.request(`${this.baseUrl}/health`, {
        method: 'GET',
        requiresAuth: true,
      });
      return { healthy: res?.success && res?.data?.healthy };
    } catch {
      return { healthy: false };
    }
  }
}

export const neuralRankService = new NeuralRankService();
export default neuralRankService;
