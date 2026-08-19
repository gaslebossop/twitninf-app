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

/**
 * Compte les conversations non lues.
 *
 * ── Pourquoi `meId` est un PARAMÈTRE ──
 * Cette fonction faisait elle-même un `getCurrentUser()` — un aller-retour
 * réseau complet, EN SÉRIE après le premier, toutes les 30 secondes, sur tous
 * les écrans — uniquement pour obtenir l'identifiant de l'utilisateur courant
 * et exclure les messages qu'il a lui-même envoyés. Cet identifiant est déjà
 * dans `AuthContext`, dont la barre d'onglets est un descendant : il suffit de
 * le passer. Un aller-retour sur deux disparaît, sans rien attendre du serveur.
 *
 * ── Ce qui reste à faire ──
 * Le vrai correctif est une route dédiée qui renvoie un entier, sur le modèle
 * de `getNotificationsUnreadCount` dix lignes plus bas : ici on télécharge
 * TOUTE la liste des conversations pour produire un seul nombre. La route
 * n'existe pas encore côté API.
 */
async function getMessagesUnreadCount(currentUserId?: string | null): Promise<number> {
  try {
    const res = await apiService.get('/api/messages/conversations');
    const list: any[] = res?.success ? res.conversations || [] : [];
    const meId = currentUserId ? String(currentUserId) : null;

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
