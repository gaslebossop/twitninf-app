/**
 * Service de tracking CTR pour l'algorithme Rust
 * Toutes les interactions passent par /api/track → Rust recommender
 *
 * ── Ce que l'appelant DEVRAIT joindre ───────────────────────────────────────
 * `tweetId` seul suffit à enregistrer le geste, mais trois mécanismes du
 * moteur ne se déclenchent QUE si l'auteur est connu : le filtrage
 * collaboratif (« les fans de ce compte aiment souvent ça aussi »), le boost
 * temps réel de 30 minutes, et le bandit d'exploration. Pendant longtemps
 * aucun appelant ne le transmettait — et l'API ne l'acceptait même pas — donc
 * aucun des trois n'a jamais tourné.
 *
 * L'API sait désormais retrouver l'auteur toute seule à partir du tweet, ce
 * qui répare le parc déjà installé. Mais ça lui coûte une requête par geste :
 * quand l'écran tient déjà l'objet tweet, `signalsFromTweet()` (dans
 * `neuralRankService`) rend les trois champs d'un coup, et c'est gratuit.
 */

import { apiService } from './api';

type TrackableAction =
  | 'like' | 'unlike'
  | 'retweet' | 'unretweet'
  | 'comment'
  | 'view' | 'bookmark' | 'share' | 'skip' | 'report' | 'block'
  | 'profile_view';

export interface TrackOptions {
  /** Auteur à créditer. Pour un retweet pur, l'auteur d'ORIGINE. */
  authorId?: string;
  /** Version A/B réellement affichée, si le tweet en portait une. */
  experimentId?: string;
  variantId?: string;
  /**
   * Nature du contenu, pour que `dwellMs` soit rapporté au temps que CE
   * contenu demandait au lieu d'être jugé sur sa valeur brute.
   */
  dwellMedia?: 'text' | 'image' | 'video';
  contentChars?: number;
  videoDurationMs?: number;
}

async function trackAction(
  tweetId: string,
  action: TrackableAction,
  dwellMs?: number,
  options: TrackOptions = {},
) {
  try {
    await apiService.post('/api/track', {
      tweet_id: tweetId,
      action,
      dwell_ms: dwellMs ?? null,
      author_id: options.authorId ?? null,
      experiment_id: options.experimentId ?? null,
      variant_id: options.variantId ?? null,
      dwell_media: options.dwellMedia ?? null,
      content_chars: options.contentChars ?? null,
      video_duration_ms: options.videoDurationMs ?? null,
    });
  } catch {
    // Non-blocking
  }
}

export const trackingService = {
  trackLike:      (tweetId: string, o?: TrackOptions) => trackAction(tweetId, 'like', undefined, o),
  trackUnlike:    (tweetId: string, o?: TrackOptions) => trackAction(tweetId, 'unlike', undefined, o),
  trackRetweet:   (tweetId: string, o?: TrackOptions) => trackAction(tweetId, 'retweet', undefined, o),
  trackUnretweet: (tweetId: string, o?: TrackOptions) => trackAction(tweetId, 'unretweet', undefined, o),
  trackComment:   (tweetId: string, o?: TrackOptions) => trackAction(tweetId, 'comment', undefined, o),
  trackShare:     (tweetId: string, o?: TrackOptions) => trackAction(tweetId, 'share', undefined, o),
  trackBookmark:  (tweetId: string, o?: TrackOptions) => trackAction(tweetId, 'bookmark', undefined, o),
  trackSkip:      (tweetId: string, o?: TrackOptions) => trackAction(tweetId, 'skip', undefined, o),
  trackReport:    (tweetId: string, o?: TrackOptions) => trackAction(tweetId, 'report', undefined, o),
  trackBlock:     (tweetId: string, o?: TrackOptions) => trackAction(tweetId, 'block', undefined, o),

  /**
   * Consultation d'un profil depuis un tweet.
   *
   * `tweetId` reste le tweet qui a mené au profil, et `authorId` le compte
   * consulté : c'est ce couple qui donne son sens au geste (« ce lecteur est
   * allé voir QUI avait écrit ça »). Envoyer l'identifiant du profil à la
   * place du tweet — ce que faisait l'ancienne signature — glissait un id
   * d'utilisateur dans l'ensemble des tweets déjà vus côté moteur.
   */
  trackProfileView: (tweetId: string, o?: TrackOptions) =>
    trackAction(tweetId, 'profile_view', undefined, o),

  trackView: (tweetId: string, dwellMs?: number, o?: TrackOptions) =>
    trackAction(tweetId, 'view', dwellMs, o),
};

export default trackingService;
