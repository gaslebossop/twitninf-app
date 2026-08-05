import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import * as Network from 'expo-network';
import { useAuth } from './AuthContext';
import { apiService } from '../services/api';
import {
  enqueueAction,
  enqueueTweet,
  flushActionOutbox,
  flushOutbox,
  getActionOutbox,
  getOutbox,
  isOnline as probeOnline,
  QueuedAction,
  QueuedActionType,
  QueuedTweet,
} from '../services/offlineService';
import { canUseFeature, effectiveSubscriptionTier } from '../utils/subscriptionTier';
import { syncBestTimeReminder, disableBestTimeReminder } from './../services/bestTimeService';

/**
 * État réseau et file d'attente de publication — réservés au palier Pro.
 *
 * Le contexte est monté pour tout le monde (il ne coûte qu'un écouteur), mais
 * `enabled` ne passe à vrai que pour un Pro : c'est lui qui décide si l'app
 * garde un fil consultable hors connexion et accepte de publier en différé.
 */

interface OfflineContextValue {
  /** Le mode hors ligne est-il ouvert à ce compte ? (Pro uniquement) */
  enabled: boolean;
  /** Faux dès que le réseau manque — vrai par défaut tant qu'on ne sait pas. */
  online: boolean;
  /** Tweets en attente de publication. */
  pending: QueuedTweet[];
  /** Likes, retweets et réponses en attente d'envoi. */
  pendingActions: QueuedAction[];
  /** Met un tweet en file. Renvoie faux si le mode n'est pas ouvert au compte. */
  queue: (payload: Omit<QueuedTweet, 'id' | 'createdAt' | 'attempts'>) => Promise<boolean>;
  /** Met une interaction en file (like / retweet / réponse). */
  queueAction: (action: {
    type: QueuedActionType;
    tweetId: string;
    value?: boolean;
    content?: string;
  }) => Promise<boolean>;
  /** Force une tentative de vidage (retour de réseau, geste manuel). */
  flush: () => Promise<void>;
}

const OfflineContext = createContext<OfflineContextValue>({
  enabled: false,
  online: true,
  pending: [],
  pendingActions: [],
  queue: async () => false,
  queueAction: async () => false,
  flush: async () => {},
});

export function OfflineProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth() as any;
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState<QueuedTweet[]>([]);
  const [pendingActions, setPendingActions] = useState<QueuedAction[]>([]);
  /** Empêche deux vidages concurrents de publier deux fois la même entrée. */
  const flushing = useRef(false);

  const tier = effectiveSubscriptionTier(!!user?.premium, user?.subscription_tier);
  const enabled = canUseFeature(tier, 'pro');
  const userId = user?.id ? String(user.id) : '';

  const refreshPending = useCallback(async () => {
    if (!userId) return;
    const [tweets, actions] = await Promise.all([getOutbox(userId), getActionOutbox(userId)]);
    setPending(tweets);
    setPendingActions(actions);
  }, [userId]);

  const flush = useCallback(async () => {
    if (!enabled || !userId || flushing.current) return;
    flushing.current = true;
    try {
      await flushOutbox(userId, async (entry) => {
        // Une citation ne passe pas par la même route qu'un tweet simple —
        // même aiguillage que la publication en direct.
        const response = entry.quoteTweetId
          ? await apiService.retweet(entry.quoteTweetId, entry.content.trim())
          : await apiService.createTweet({
              content: entry.content.trim(),
              parent_tweet_id: entry.parentTweetId || undefined,
              is_private: entry.isPrivate,
              is_sensitive: entry.isSensitive,
              translation_enabled: entry.translationEnabled,
              language: 'fr',
            } as any);
        return { success: !!response?.success, message: (response as any)?.message };
      });

      // Les interactions partent APRÈS les tweets : une réponse en file peut
      // viser un tweet lui-même en attente, l'ordre inverse la ferait échouer.
      await flushActionOutbox(userId, async (action) => {
        if (action.type === 'like') {
          const response = await apiService.likeTweet(action.tweetId);
          return { success: !!response?.success, message: (response as any)?.message };
        }
        if (action.type === 'retweet') {
          const response = await apiService.retweet(action.tweetId);
          return { success: !!response?.success, message: (response as any)?.message };
        }
        const response = await apiService.createTweet({
          content: (action.content || '').trim(),
          parent_tweet_id: action.tweetId,
          language: 'fr',
        } as any);
        return { success: !!response?.success, message: (response as any)?.message };
      });

      await refreshPending();
    } finally {
      flushing.current = false;
    }
  }, [enabled, userId, refreshPending]);

  // État réseau initial + écoute des changements.
  useEffect(() => {
    let active = true;

    probeOnline().then((state) => {
      if (active) setOnline(state);
    });

    const subscription = Network.addNetworkStateListener((event) => {
      if (!active) return;
      // Même règle que `probeOnline` : une interface active sans Internet
      // (portail captif) ne compte pas comme une connexion.
      const reachable = event.isInternetReachable !== false && !!event.isConnected;
      setOnline(reachable);
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    refreshPending();
  }, [refreshPending]);

  /**
   * Rappel « meilleur moment pour publier » — avantage Plus/Pro, donc évalué
   * sur `tier` et non sur `enabled` (qui, lui, est réservé au Pro).
   *
   * Le service s'auto-limite à une synchronisation par 24 h ; l'appeler à
   * chaque montage ne déclenche donc pas une requête à chaque ouverture. Perdre
   * l'abonnement annule le rappel : un avantage payant ne doit pas survivre à
   * l'abonnement qui le finance.
   */
  useEffect(() => {
    if (!userId) return;
    if (canUseFeature(tier, 'plus')) {
      syncBestTimeReminder(userId);
    } else {
      disableBestTimeReminder(userId);
    }
  }, [userId, tier]);

  // Le retour du réseau déclenche le vidage — c'est tout l'intérêt de la file.
  useEffect(() => {
    if (online && enabled && (pending.length > 0 || pendingActions.length > 0)) {
      flush();
    }
    // `pending` est volontairement hors dépendances : `flush` le met à jour,
    // le réintroduire ici relancerait un vidage à chaque changement de file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, enabled]);

  const queue = useCallback(
    async (payload: Omit<QueuedTweet, 'id' | 'createdAt' | 'attempts'>) => {
      if (!enabled || !userId) return false;
      const entry = await enqueueTweet(userId, payload);
      if (!entry) return false;
      await refreshPending();
      return true;
    },
    [enabled, userId, refreshPending],
  );

  const queueAction = useCallback(
    async (action: {
      type: QueuedActionType;
      tweetId: string;
      value?: boolean;
      content?: string;
    }) => {
      if (!enabled || !userId) return false;
      const ok = await enqueueAction(userId, action);
      if (ok) await refreshPending();
      return ok;
    },
    [enabled, userId, refreshPending],
  );

  // Le fil consomme ce contexte : sans mémoïsation, chaque rendu du provider
  // (un changement d'état réseau, une action mise en file) donnait une valeur
  // neuve et re-rendait tous les consommateurs.
  const value = useMemo(
    () => ({ enabled, online, pending, pendingActions, queue, queueAction, flush }),
    [enabled, online, pending, pendingActions, queue, queueAction, flush],
  );

  return (
    <OfflineContext.Provider value={value}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  return useContext(OfflineContext);
}
