import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Brouillons de tweets — avantage abonné (Plus / Pro).
 *
 * Stockage LOCAL, volontairement : un brouillon est un texte pas encore
 * publié, et le faire transiter par le serveur en ferait une donnée hébergée
 * qu'il faudrait modérer, sauvegarder et purger. Tant qu'il n'est pas publié,
 * il ne quitte pas l'appareil.
 *
 * Conséquence assumée : les brouillons ne suivent pas d'un appareil à l'autre.
 * C'est le compromis inverse de la file d'attente hors ligne, qui elle vise la
 * publication et doit donc partir dès que le réseau revient.
 */

export interface TweetDraft {
  id: string;
  content: string;
  isPrivate: boolean;
  isSensitive: boolean;
  /** « Traduction (bêta) », option Pro — absent sur les brouillons antérieurs. */
  translationEnabled?: boolean;
  /** Réponse à un tweet : le brouillon garde son contexte. */
  parentTweetId?: string | null;
  quoteTweetId?: string | null;
  /** Millisecondes epoch — sert au tri (plus récent en tête). */
  updatedAt: number;
}

/** Au-delà, les plus anciens sautent : un brouillon jamais repris est mort. */
export const MAX_DRAFTS = 50;

const keyFor = (userId: string) => `@twitninf_drafts:${userId}`;

function sortByRecent(drafts: TweetDraft[]): TweetDraft[] {
  return [...drafts].sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getDrafts(userId: string): Promise<TweetDraft[]> {
  if (!userId) return [];
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return sortByRecent(parsed.filter((d) => d && typeof d.content === 'string'));
  } catch {
    return [];
  }
}

/**
 * Crée ou met à jour un brouillon.
 *
 * Passer un `id` existant ÉCRASE ce brouillon au lieu d'en empiler un
 * nouveau : sans ça, reprendre un brouillon puis le resauvegarder en laissait
 * deux versions dans la liste, et l'utilisateur ne pouvait plus dire laquelle
 * était la bonne.
 */
export async function saveDraft(
  userId: string,
  draft: Omit<TweetDraft, 'id' | 'updatedAt'> & { id?: string },
): Promise<TweetDraft | null> {
  if (!userId) return null;
  if (!draft.content.trim()) return null;

  const drafts = await getDrafts(userId);
  const id = draft.id || `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const entry: TweetDraft = {
    id,
    content: draft.content,
    isPrivate: !!draft.isPrivate,
    isSensitive: !!draft.isSensitive,
    translationEnabled: !!draft.translationEnabled,
    parentTweetId: draft.parentTweetId ?? null,
    quoteTweetId: draft.quoteTweetId ?? null,
    updatedAt: Date.now(),
  };

  const next = sortByRecent([entry, ...drafts.filter((d) => d.id !== id)]).slice(0, MAX_DRAFTS);
  await AsyncStorage.setItem(keyFor(userId), JSON.stringify(next));
  return entry;
}

export async function deleteDraft(userId: string, draftId: string): Promise<void> {
  if (!userId) return;
  const drafts = await getDrafts(userId);
  const next = drafts.filter((d) => d.id !== draftId);
  await AsyncStorage.setItem(keyFor(userId), JSON.stringify(next));
}

export async function countDrafts(userId: string): Promise<number> {
  return (await getDrafts(userId)).length;
}
