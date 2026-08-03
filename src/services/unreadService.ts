/**
 * Source unique de vérité pour les compteurs "non lu" (messages + notifications)
 * affichés dans la navbar. Permet aux écrans (Messages, Notifications, Thread)
 * de déclencher un rafraîchissement immédiat après un mark-as-read, au lieu
 * d'attendre le prochain polling.
 */
import apiService from './api';

type Listener = () => void;

const listeners = new Set<Listener>();

function notifyChanged() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function getMessagesUnreadCount(): Promise<number> {
  try {
    const res = await apiService.get('/api/messages/conversations');
    const list: any[] = res?.success ? res.conversations || [] : [];
    const me = await apiService.getCurrentUser();
    const meId = me?.id ? String(me.id) : null;

    return list.reduce((count, conv: any) => {
      const last = conv?.last_message;
      if (!last) return count;
      const lastSenderId = String(last?.sender?.id || '');
      const lastMessageFromMe = !!meId && lastSenderId === meId;
      if (lastMessageFromMe) return count;

      const lastTsRaw = last?.created_at || last?.createdAt || conv?.updated_at || conv?.updatedAt || conv?.created_at || conv?.createdAt;
      if (!lastTsRaw) return count; // pas de timestamp fiable : on ne compte pas en non lu par défaut
      const parsedTs = new Date(lastTsRaw).getTime();
      if (!Number.isFinite(parsedTs)) return count;
      const myLastReadAt = conv?.last_read_at ? new Date(conv.last_read_at).getTime() : 0;
      const unread = !myLastReadAt || parsedTs > myLastReadAt;
      return unread ? count + 1 : count;
    }, 0);
  } catch {
    return 0;
  }
}

async function getNotificationsUnreadCount(): Promise<number> {
  try {
    const res = await apiService.getUnreadNotificationsCount();
    if (!res?.success) return 0;
    return Number(res.data?.unread_count ?? (res as any)?.unread_count ?? 0) || 0;
  } catch {
    return 0;
  }
}

/** Réessaie une requête réseau qui peut échouer sur un accroc temporaire. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 2, delayMs = 800): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}

export default {
  subscribe,
  notifyChanged,
  getMessagesUnreadCount,
  getNotificationsUnreadCount,
  withRetry,
};
