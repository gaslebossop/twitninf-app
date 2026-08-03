import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import type { Tweet } from '../types/api';

/**
 * Mode hors ligne — avantage Pro.
 *
 * Deux mécanismes distincts, à ne pas confondre :
 *
 *  - le CACHE DU FIL : une copie des derniers tweets reçus, servie quand le
 *    réseau manque. En lecture seule, jamais réécrite par l'utilisateur ;
 *  - la FILE D'ATTENTE : les tweets composés sans réseau, qui partent dès
 *    qu'il revient. En écriture, et c'est elle qui porte le risque.
 *
 * Le cache tolère d'être perdu (on rechargera), la file non : un tweet écrit
 * par l'utilisateur et jamais publié serait une perte de son travail. D'où le
 * traitement asymétrique — le cache est plafonné et écrasé sans état d'âme, la
 * file n'est vidée d'une entrée qu'après confirmation de publication.
 */

/** Au-delà, le cache ne sert plus à rien : personne ne remonte si loin hors ligne. */
const MAX_CACHED_TWEETS = 60;

/** Une entrée qui échoue indéfiniment finirait par bloquer la file. */
const MAX_SEND_ATTEMPTS = 5;

export interface QueuedTweet {
  id: string;
  content: string;
  isPrivate: boolean;
  isSensitive: boolean;
  /** « Traduction (bêta) », option Pro — absent sur les entrées antérieures. */
  translationEnabled?: boolean;
  parentTweetId?: string | null;
  quoteTweetId?: string | null;
  createdAt: number;
  attempts: number;
  /** Dernière erreur rencontrée — affichée si l'entrée finit par abandonner. */
  lastError?: string | null;
}

/**
 * Interactions faites sans réseau.
 *
 * `like` et `retweet` sont des BASCULES, pas des incréments : la file ne
 * retient donc que l'état visé (`value`), et un aller-retour like/unlike
 * s'annule au lieu d'envoyer deux requêtes contradictoires au retour du
 * réseau. Une réponse, elle, crée du contenu — chacune est une entrée.
 */
export type QueuedActionType = 'like' | 'retweet' | 'reply';

export interface QueuedAction {
  id: string;
  type: QueuedActionType;
  tweetId: string;
  /** État visé pour les bascules (`true` = liké/retweeté). Ignoré pour `reply`. */
  value?: boolean;
  /** Texte de la réponse. */
  content?: string;
  createdAt: number;
  attempts: number;
  lastError?: string | null;
}

const feedKey = (userId: string) => `@twitninf_offline_feed:${userId}`;
const outboxKey = (userId: string) => `@twitninf_outbox:${userId}`;
const actionsKey = (userId: string) => `@twitninf_action_outbox:${userId}`;

/* ------------------------------------------------------------------ */
/* Réseau                                                              */
/* ------------------------------------------------------------------ */

/**
 * Y a-t-il vraiment Internet ?
 *
 * `isConnected` ne dit que « une interface est active » — un wifi capté sans
 * accès au réseau (portail captif, box débranchée) reste « connecté ».
 * `isInternetReachable` est la vraie réponse, mais il n'est pas renseigné sur
 * toutes les plateformes : on ne le prend en compte que s'il existe.
 */
export async function isOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    if (state.isInternetReachable === false) return false;
    return !!state.isConnected;
  } catch {
    // Impossible de savoir : on suppose connecté plutôt que de basculer toute
    // l'app en mode dégradé sur une lecture ratée.
    return true;
  }
}

/* ------------------------------------------------------------------ */
/* Cache du fil                                                        */
/* ------------------------------------------------------------------ */

export async function cacheFeed(userId: string, tweets: Tweet[]): Promise<void> {
  if (!userId || !Array.isArray(tweets) || tweets.length === 0) return;
  try {
    const trimmed = tweets.slice(0, MAX_CACHED_TWEETS);
    await AsyncStorage.setItem(
      feedKey(userId),
      JSON.stringify({ savedAt: Date.now(), tweets: trimmed }),
    );
  } catch {
    // Le cache est un confort : échouer à l'écrire ne doit rien casser.
  }
}

export async function getCachedFeed(
  userId: string,
): Promise<{ tweets: Tweet[]; savedAt: number } | null> {
  if (!userId) return null;
  try {
    const raw = await AsyncStorage.getItem(feedKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.tweets) || parsed.tweets.length === 0) return null;
    return { tweets: parsed.tweets as Tweet[], savedAt: Number(parsed.savedAt) || 0 };
  } catch {
    return null;
  }
}

export async function clearCachedFeed(userId: string): Promise<void> {
  if (!userId) return;
  await AsyncStorage.removeItem(feedKey(userId));
}

/* ------------------------------------------------------------------ */
/* File d'attente de publication                                       */
/* ------------------------------------------------------------------ */

export async function getOutbox(userId: string): Promise<QueuedTweet[]> {
  if (!userId) return [];
  try {
    const raw = await AsyncStorage.getItem(outboxKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Ordre d'écriture conservé : publier dans le désordre casserait un fil
    // de plusieurs tweets écrit d'affilée hors ligne.
    return parsed.filter((t) => t && typeof t.content === 'string');
  } catch {
    return [];
  }
}

async function writeOutbox(userId: string, entries: QueuedTweet[]): Promise<void> {
  await AsyncStorage.setItem(outboxKey(userId), JSON.stringify(entries));
}

export async function enqueueTweet(
  userId: string,
  payload: Omit<QueuedTweet, 'id' | 'createdAt' | 'attempts'>,
): Promise<QueuedTweet | null> {
  if (!userId || !payload.content.trim()) return null;
  const entry: QueuedTweet = {
    id: `queued_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    content: payload.content,
    isPrivate: !!payload.isPrivate,
    isSensitive: !!payload.isSensitive,
    translationEnabled: !!payload.translationEnabled,
    parentTweetId: payload.parentTweetId ?? null,
    quoteTweetId: payload.quoteTweetId ?? null,
    createdAt: Date.now(),
    attempts: 0,
    lastError: null,
  };
  const outbox = await getOutbox(userId);
  await writeOutbox(userId, [...outbox, entry]);
  return entry;
}

export async function removeFromOutbox(userId: string, entryId: string): Promise<void> {
  if (!userId) return;
  const outbox = await getOutbox(userId);
  await writeOutbox(userId, outbox.filter((e) => e.id !== entryId));
}

/* ------------------------------------------------------------------ */
/* File d'attente des interactions                                     */
/* ------------------------------------------------------------------ */

export async function getActionOutbox(userId: string): Promise<QueuedAction[]> {
  if (!userId) return [];
  try {
    const raw = await AsyncStorage.getItem(actionsKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((a) => a && a.tweetId && a.type) : [];
  } catch {
    return [];
  }
}

async function writeActionOutbox(userId: string, entries: QueuedAction[]): Promise<void> {
  await AsyncStorage.setItem(actionsKey(userId), JSON.stringify(entries));
}

/**
 * Met une interaction en file.
 *
 * Pour une bascule, une entrée existante sur le même tweet est REMPLACÉE, et
 * si le nouvel état correspond à celui d'origine (like puis unlike), l'entrée
 * disparaît complètement : rien à envoyer. Sans ça, chaque hésitation de
 * l'utilisateur hors ligne produirait une requête inutile au retour du réseau.
 */
export async function enqueueAction(
  userId: string,
  action: { type: QueuedActionType; tweetId: string; value?: boolean; content?: string },
): Promise<boolean> {
  if (!userId || !action.tweetId) return false;

  const outbox = await getActionOutbox(userId);

  if (action.type === 'reply') {
    if (!action.content?.trim()) return false;
    outbox.push({
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: 'reply',
      tweetId: action.tweetId,
      content: action.content,
      createdAt: Date.now(),
      attempts: 0,
      lastError: null,
    });
    await writeActionOutbox(userId, outbox);
    return true;
  }

  const others = outbox.filter(
    (a) => !(a.type === action.type && a.tweetId === action.tweetId),
  );
  const hadPending = others.length !== outbox.length;

  // Revenu à l'état initial : la bascule s'annule, on ne garde rien.
  if (hadPending) {
    await writeActionOutbox(userId, others);
    return true;
  }

  others.push({
    id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: action.type,
    tweetId: action.tweetId,
    value: action.value !== false,
    createdAt: Date.now(),
    attempts: 0,
    lastError: null,
  });
  await writeActionOutbox(userId, others);
  return true;
}

/**
 * Vide la file d'interactions. Même contrat que `flushOutbox` : `send` est
 * injecté, et une entrée ne part de la file que sur succès confirmé.
 */
export async function flushActionOutbox(
  userId: string,
  send: (action: QueuedAction) => Promise<{ success: boolean; message?: string }>,
): Promise<FlushResult> {
  if (!userId) return { sent: 0, failed: 0, remaining: 0 };

  const outbox = await getActionOutbox(userId);
  if (outbox.length === 0) return { sent: 0, failed: 0, remaining: 0 };

  const kept: QueuedAction[] = [];
  let sent = 0;
  let failed = 0;

  for (const action of outbox) {
    if (!(await isOnline())) {
      kept.push(action);
      continue;
    }
    try {
      const result = await send(action);
      if (result.success) {
        sent += 1;
        continue;
      }
      const attempts = action.attempts + 1;
      if (attempts >= MAX_SEND_ATTEMPTS) {
        failed += 1;
        continue;
      }
      kept.push({ ...action, attempts, lastError: result.message || 'Action refusée' });
    } catch (error: any) {
      const attempts = action.attempts + 1;
      if (attempts >= MAX_SEND_ATTEMPTS) {
        failed += 1;
        continue;
      }
      kept.push({ ...action, attempts, lastError: error?.message || 'Erreur réseau' });
    }
  }

  await writeActionOutbox(userId, kept);
  return { sent, failed, remaining: kept.length };
}

export interface FlushResult {
  sent: number;
  failed: number;
  remaining: number;
}

/**
 * Vide la file en publiant chaque entrée dans l'ordre.
 *
 * `send` est injecté plutôt qu'importé : ce service ne doit rien savoir de
 * l'API, sinon il devient impossible de le tester sans réseau — ce qui serait
 * ironique pour du code hors ligne.
 *
 * Une entrée n'est retirée QUE sur succès confirmé. En cas d'échec elle reste,
 * son compteur monte, et au-delà de `MAX_SEND_ATTEMPTS` elle est abandonnée :
 * un contenu refusé par la modération réessaierait sinon à chaque retour du
 * réseau, indéfiniment.
 */
export async function flushOutbox(
  userId: string,
  send: (entry: QueuedTweet) => Promise<{ success: boolean; message?: string }>,
): Promise<FlushResult> {
  if (!userId) return { sent: 0, failed: 0, remaining: 0 };

  const outbox = await getOutbox(userId);
  if (outbox.length === 0) return { sent: 0, failed: 0, remaining: 0 };

  const kept: QueuedTweet[] = [];
  let sent = 0;
  let failed = 0;

  for (const entry of outbox) {
    // Le réseau peut retomber au milieu du vidage : on s'arrête et on garde
    // tout le reste intact plutôt que d'accumuler des échecs artificiels.
    if (!(await isOnline())) {
      kept.push(entry);
      continue;
    }

    try {
      const result = await send(entry);
      if (result.success) {
        sent += 1;
        continue;
      }
      const attempts = entry.attempts + 1;
      if (attempts >= MAX_SEND_ATTEMPTS) {
        failed += 1;
        continue;
      }
      kept.push({ ...entry, attempts, lastError: result.message || 'Publication refusée' });
    } catch (error: any) {
      const attempts = entry.attempts + 1;
      if (attempts >= MAX_SEND_ATTEMPTS) {
        failed += 1;
        continue;
      }
      kept.push({ ...entry, attempts, lastError: error?.message || 'Erreur réseau' });
    }
  }

  await writeOutbox(userId, kept);
  return { sent, failed, remaining: kept.length };
}
