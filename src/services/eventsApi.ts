import apiService from './api';
import type {
  ClaimResult,
  EventArtId,
  EventQuest,
  QuestProgress,
  TwEvent,
} from '../types/events';

/**
 * La couche réseau des événements — une seule, désormais.
 *
 * ── Ce qu'elle remplace ───────────────────────────────────────────────────
 * Quatre services se partageaient le sujet (`eventService`,
 * `functionalEventService`, `userChallengeService`, `challengeProgressService`)
 * avec des responsabilités qui se recouvraient et, surtout, aucun cache
 * commun. Le hook de l'événement précédent documentait lui-même le résultat :
 * six composants montaient le même sondage, chacun avec son minuteur de 30 s
 * et deux requêtes par tic — une dizaine d'allers-retours toutes les trente
 * secondes pour une réponse qui change une fois par an.
 *
 * Ici : un cache de module, une requête en vol partagée, et un seul point
 * d'entrée. Le sondage lui-même appartient au contexte, pas au service — une
 * couche réseau qui décide toute seule de se réveiller est une couche réseau
 * qu'on ne peut pas tester.
 *
 * ── Le repli sur l'ancienne API ───────────────────────────────────────────
 * `GET /api/events/current` est la route unifiée (voir `docs/EVENTS_API.md`).
 * Tant qu'elle n'est pas déployée, `fetchCurrent` recompose la même forme à
 * partir des trois anciennes routes. Ce n'est pas de la complaisance : sans ce
 * repli, publier ce build AVANT la mise à jour du VPS éteindrait tout ce qui
 * touche aux événements, y compris l'événement en cours.
 */

/** Ce que l'app a besoin de savoir, en une réponse. */
export interface CurrentEventPayload {
  event: TwEvent;
  progress: QuestProgress[];
}

/** Signal envoyé au serveur quand seul le client peut constater un geste. */
export interface QuestSignal {
  quest_id: string;
  /** Incrément proposé. Le serveur reste libre de le plafonner ou l'ignorer. */
  amount?: number;
  /**
   * Clé de déduplication, obligatoire.
   *
   * Sans elle, un écran remonté deux fois — ou une reprise réseau — compterait
   * deux fois le même geste. C'est le serveur qui la mémorise ; le client se
   * contente de la rendre stable pour un même événement réel.
   */
  idempotency_key: string;
}

const CACHE_MS = 3 * 60 * 1000;

let cache: { payload: CurrentEventPayload | null; at: number } | null = null;
let inFlight: Promise<CurrentEventPayload | null> | null = null;

/** Vide le cache — après une réclamation, ou sur demande explicite. */
export function invalidate(): void {
  cache = null;
}

function isFresh(): boolean {
  return !!cache && Date.now() - cache.at < CACHE_MS;
}

// ─── Normalisation ───────────────────────────────────────────────────────────

/**
 * Une DA inconnue ne doit jamais casser l'écran.
 *
 * Le serveur peut annoncer `art: "halloween"` avant que l'app ne sache la
 * dessiner — c'est même le cas normal, puisque la DA se livre par build. On
 * retombe alors sur l'habillage ordinaire : l'événement existe, ses quêtes
 * marchent, il n'est simplement pas costumé.
 */
const KNOWN_ART: EventArtId[] = ['none', 'birthday'];

function toArt(value: unknown): EventArtId {
  return KNOWN_ART.includes(value as EventArtId) ? (value as EventArtId) : 'none';
}

function toNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Une quête sans `id` ni `goal` exploitable est écartée plutôt que rendue à moitié. */
function toQuest(raw: any): EventQuest | null {
  const id = raw?.id ?? raw?.challenge_id;
  if (!id) return null;

  const goal = Math.max(1, toNumber(raw?.goal ?? raw?.max_progress, 1));
  return {
    id: String(id),
    kind: raw?.kind ?? 'count',
    tier: raw?.tier ?? 'bronze',
    title: raw?.title ?? raw?.metadata?.title ?? String(id),
    description: raw?.description ?? raw?.metadata?.description ?? '',
    icon: raw?.icon ?? raw?.metadata?.icon ?? 'sparkles-outline',
    goal,
    reward: {
      kind: raw?.reward?.kind ?? 'coins',
      label: raw?.reward?.label ?? raw?.metadata?.reward ?? 'Récompense',
      payload: raw?.reward?.payload,
      teaser: raw?.reward?.teaser,
    },
    requires: Array.isArray(raw?.requires) ? raw.requires.map(String) : undefined,
    hidden: !!raw?.hidden,
    window: raw?.window,
  };
}

function toProgress(raw: any, fallbackGoal = 1): QuestProgress {
  const goal = Math.max(1, toNumber(raw?.goal ?? raw?.max_progress, fallbackGoal));
  const progress = Math.max(0, toNumber(raw?.progress, 0));
  return {
    quest_id: String(raw?.quest_id ?? raw?.challenge_id ?? ''),
    progress,
    goal,
    // On ne fait pas confiance au seul drapeau serveur : un `completed` faux
    // avec une progression pleine laisserait un bouton « Récupérer » éteint
    // sur une quête visiblement finie, ce qui se lit comme un bug.
    completed: !!raw?.completed || progress >= goal,
    claimed: !!raw?.claimed,
    claimed_at: raw?.claimed_at,
    community: raw?.community
      ? {
          progress: toNumber(raw.community.progress, 0),
          goal: Math.max(1, toNumber(raw.community.goal, 1)),
        }
      : undefined,
  };
}

function toEvent(raw: any, quests: EventQuest[]): TwEvent | null {
  const slug = raw?.slug;
  if (!slug) return null;

  return {
    id: String(raw?.id ?? slug),
    slug: String(slug),
    name: raw?.name ?? String(slug),
    description: raw?.description,
    starts_at: raw?.starts_at ?? raw?.start_date ?? '',
    ends_at: raw?.ends_at ?? raw?.end_date ?? '',
    is_active: raw?.is_active !== false,
    priority: toNumber(raw?.priority, 0),
    art: toArt(raw?.art ?? raw?.theme_id),
    features: {
      hub: raw?.features?.hub ?? true,
      banner: raw?.features?.banner ?? true,
      intro: raw?.features?.intro ?? false,
      skinApp: raw?.features?.skinApp ?? false,
      earnMultiplier: raw?.features?.earnMultiplier,
      dailyGift: raw?.features?.dailyGift ?? false,
    },
    quests,
    banner_message: raw?.banner_message,
  };
}

// ─── Lecture ─────────────────────────────────────────────────────────────────

async function fetchUnified(): Promise<CurrentEventPayload | null> {
  const response = await apiService.get('/api/events/current');
  if (!response?.success || !response?.data?.event) return null;

  const quests = (response.data.event.quests ?? [])
    .map(toQuest)
    .filter((q: EventQuest | null): q is EventQuest => !!q);

  const event = toEvent(response.data.event, quests);
  if (!event) return null;

  const byId = new Map<string, number>(quests.map((q: EventQuest) => [q.id, q.goal]));
  const progress = (response.data.progress ?? []).map((p: any) =>
    toProgress(p, byId.get(String(p?.quest_id ?? p?.challenge_id)) ?? 1),
  );

  return { event, progress };
}

/**
 * Repli : recompose la réponse unifiée depuis les trois anciennes routes.
 *
 * Les quêtes y sont mêlées à leur progression (`/api/user-challenges` renvoie
 * les deux dans le même objet), d'où la double extraction.
 */
async function fetchLegacy(): Promise<CurrentEventPayload | null> {
  const active = await apiService.get('/api/events/active');
  const raw = active?.data?.event ?? active?.data;
  if (!raw?.slug) return null;

  let challenges: any[] = [];
  try {
    const res = await apiService.get('/api/user-challenges', { event_slug: raw.slug });
    challenges = res?.data?.challenges ?? res?.data ?? [];
  } catch {
    // Un événement sans quêtes reste un événement : sa DA et son bandeau
    // doivent s'afficher même si la route des défis est en panne.
  }

  const quests = challenges
    .map(toQuest)
    .filter((q: EventQuest | null): q is EventQuest => !!q);
  const progress = challenges.map((c) => toProgress(c));

  const event = toEvent(raw, quests);
  return event ? { event, progress } : null;
}

/**
 * L'événement en cours, ou `null` s'il ne se passe rien — ce qui est le cas
 * le plus fréquent et n'a rien d'une erreur.
 */
export async function fetchCurrent(force = false): Promise<CurrentEventPayload | null> {
  if (!force && isFresh()) return cache!.payload;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      let payload: CurrentEventPayload | null = null;
      try {
        payload = await fetchUnified();
      } catch {
        payload = null;
      }
      if (!payload) payload = await fetchLegacy();

      cache = { payload, at: Date.now() };
      return payload;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

// ─── Écriture ────────────────────────────────────────────────────────────────

/**
 * Réclame la récompense d'une quête terminée.
 *
 * Le client ne s'accorde jamais rien : il demande, et c'est la réponse du
 * serveur qui dit ce qui a réellement été donné. C'est indispensable pour les
 * lots à tirage, dont le contenu n'existe qu'au moment de la remise.
 */
export async function claimQuest(eventSlug: string, questId: string): Promise<ClaimResult> {
  try {
    const response = await apiService.post(
      `/api/events/${encodeURIComponent(eventSlug)}/quests/${encodeURIComponent(questId)}/claim`,
    );
    if (!response?.success) {
      return { ok: false, message: response?.message ?? 'Récompense indisponible' };
    }
    // Le solde et l'état des quêtes viennent de changer côté serveur.
    invalidate();
    return { ok: true, granted: response?.data?.granted, message: response?.message };
  } catch (error: any) {
    return { ok: false, message: error?.message ?? 'Réseau indisponible' };
  }
}

/**
 * Signale un geste que seul le client peut constater.
 *
 * La plupart des quêtes se mesurent côté serveur — il voit passer les tweets,
 * les likes, les follows. Restent celles qui portent sur la NAVIGATION (ouvrir
 * la carte, essayer le studio), invisibles depuis l'API. Le client les
 * signale ; le serveur reste seul juge de ce qu'il en fait, et la clé
 * d'idempotence garantit qu'un écran remonté deux fois ne compte qu'une.
 */
export async function reportSignal(eventSlug: string, signal: QuestSignal): Promise<boolean> {
  try {
    const response = await apiService.post(
      `/api/events/${encodeURIComponent(eventSlug)}/quests/${encodeURIComponent(signal.quest_id)}/report`,
      { amount: signal.amount ?? 1, idempotency_key: signal.idempotency_key },
    );
    if (response?.success) invalidate();
    return !!response?.success;
  } catch {
    // Un signal perdu n'est pas une erreur visible : la quête avancera au
    // prochain geste. Faire remonter une alerte pour ça apprendrait à
    // l'utilisateur que l'app est cassée alors qu'il ne s'est rien passé.
    return false;
  }
}

// ─── Livre d'or ──────────────────────────────────────────────────────────────

export interface GuestbookPost {
  id: string;
  message: string;
  created_at: string;
  author: { id: string; username: string; avatar?: string; verified?: boolean } | null;
}

/**
 * Le livre d'or est la seule partie de l'événement qui soit du CONTENU.
 *
 * Une page qui ne contient qu'une liste de quêtes est une liste de corvées :
 * on la remplit une fois et on n'y revient pas. Ici, ce que les gens écrivent
 * change à chaque visite — c'est ce qui fait de la page un lieu.
 */
export async function fetchGuestbook(
  eventSlug: string,
): Promise<{ posts: GuestbookPost[]; mine: GuestbookPost | null }> {
  try {
    const response = await apiService.get(
      `/api/events/${encodeURIComponent(eventSlug)}/guestbook`,
      { limit: 40 },
    );
    return {
      posts: response?.data?.posts ?? [],
      mine: response?.data?.mine ?? null,
    };
  } catch {
    return { posts: [], mine: null };
  }
}

/** Laisse un mot. Un seul par compte : le serveur refuse le second. */
export async function postGuestbook(
  eventSlug: string,
  message: string,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const response = await apiService.post(
      `/api/events/${encodeURIComponent(eventSlug)}/guestbook`,
      { message },
    );
    // Écrire valide la quête du livre d'or côté serveur : l'état des quêtes
    // vient donc de changer.
    if (response?.success) invalidate();
    return { ok: !!response?.success, message: response?.message };
  } catch (error: any) {
    return { ok: false, message: error?.message ?? 'Réseau indisponible' };
  }
}

export default { fetchCurrent, claimQuest, reportSignal, invalidate, fetchGuestbook, postGuestbook };
