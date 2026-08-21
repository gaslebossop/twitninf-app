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
import { DeferredDispatcher } from '../utils/trackQueue';

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

/**
 * ── Le rang du tweet n'est PAS envoyé d'ici, et c'est délibéré ──────────────
 * La correction du biais de position (à qualité égale, un tweet en tête est
 * bien plus cliqué qu'un tweet en quarantième place) est faite côté moteur,
 * qui sait lui-même à quelle place il a servi chaque tweet et l'écrit au
 * moment où il mémorise l'impression, offset de pagination compris. Le client
 * n'a rien à remonter — À UNE CONDITION : qu'il n'écarte pas des tweets que
 * le moteur a servis, sans quoi le rang serveur et le rang affiché divergent.
 * C'est ce que garantit `hasRenderableContent` (`utils/tweetMedia`).
 */

type TrackBody = {
  tweet_id: string;
  action: TrackableAction;
  dwell_ms: number | null;
  author_id: string | null;
  experiment_id: string | null;
  variant_id: string | null;
  dwell_media: string | null;
  content_chars: number | null;
  video_duration_ms: number | null;
};

function bodyFor(
  tweetId: string,
  action: TrackableAction,
  dwellMs?: number,
  options: TrackOptions = {},
): TrackBody {
  return {
    tweet_id: tweetId,
    action,
    dwell_ms: dwellMs ?? null,
    author_id: options.authorId ?? null,
    experiment_id: options.experimentId ?? null,
    variant_id: options.variantId ?? null,
    dwell_media: options.dwellMedia ?? null,
    content_chars: options.contentChars ?? null,
    video_duration_ms: options.videoDurationMs ?? null,
  };
}

const postTrack = (body: TrackBody) => apiService.post('/api/track', body);

/**
 * ── Pourquoi les impressions ne partent PAS comme les gestes ─────────────
 * Une impression est émise par `onViewableItemsChanged`, que
 * `VirtualizedList._onScroll` appelle sur le thread JS À CHAQUE ÉVÉNEMENT DE
 * DÉFILEMENT. Traverser vingt tweets d'un coup lançait donc vingt
 * `apiService.post` simultanés depuis l'intérieur d'une image de défilement —
 * vingt `buildClientHeaders()` (chacun un `Intl.DateTimeFormat()`), vingt
 * `JSON.stringify`, vingt `fetch`, vingt analyses de réponse, en concurrence
 * avec le fenêtrage de la liste et le rendu des lignes.
 *
 * La file ne perd rien et ne change ni la route ni le corps ni l'ordre : elle
 * fait seulement partir l'envoi au tour de boucle SUIVANT, et plafonne le
 * nombre de requêtes simultanées. Voir `utils/trackQueue.ts`.
 *
 * Réservée aux impressions : un geste délibéré (like, repost, signalement,
 * skip) est rare, n'arrive jamais en rafale, et peut bloquer un écran qui
 * l'attend — il continue de partir immédiatement.
 */
const impressionQueue = new DeferredDispatcher<TrackBody>(postTrack, { maxInFlight: 3 });

async function trackAction(
  tweetId: string,
  action: TrackableAction,
  dwellMs?: number,
  options: TrackOptions = {},
) {
  try {
    await postTrack(bodyFor(tweetId, action, dwellMs, options));
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

  /**
   * L'impression. Le SEUL signal qui parte en rafale pendant le défilement,
   * donc le seul à passer par la file différée (voir `impressionQueue`).
   *
   * Ne rend volontairement pas de promesse d'envoi : personne n'attend une
   * impression, et en rendre une inviterait un appelant à s'y accrocher depuis
   * le chemin chaud du défilement.
   */
  trackView: (tweetId: string, dwellMs?: number, o?: TrackOptions) => {
    impressionQueue.enqueue(bodyFor(tweetId, 'view', dwellMs, o));
  },

  /** Ce qui reste en file d'impressions — diagnostic uniquement. */
  pendingImpressions: () => impressionQueue.pending,
};

export default trackingService;
