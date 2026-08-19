/**
 * 🪝 Hook React pour le Tracking Comportemental
 * 
 * Simplifie l'utilisation du tracking dans les composants React
 */

import { useEffect, useRef, useCallback } from 'react';
import { behaviorTracker } from '../services/behaviorTracker';
import { useAuth } from '../contexts/AuthContext';

interface UseBehaviorTrackingOptions {
  autoTrackScreenView?: boolean;
  screenName?: string;
  trackScrolling?: boolean;
  trackTimeSpent?: boolean;
}

export function useBehaviorTracking(options: UseBehaviorTrackingOptions = {}) {
  const { user } = useAuth();
  const screenStartTime = useRef<number>(0);
  const scrollPosition = useRef<number>(0);
  const maxScrollDepth = useRef<number>(0);
  const interactionCount = useRef<number>(0);

  const {
    autoTrackScreenView = true,
    screenName = 'Unknown',
    trackScrolling = false,
    trackTimeSpent = true
  } = options;

  // 📱 Tracking automatique de l'écran
  useEffect(() => {
    if (!user || !autoTrackScreenView) return;

    screenStartTime.current = Date.now();
    
    // Track screen view
    behaviorTracker.trackAction('screen_view', screenName, 'screen', {
      user_id: user.id,
      timestamp: new Date().toISOString()
    });

    // Démarrer le tracking du contenu
    if (trackTimeSpent) {
      behaviorTracker.startContentEngagement(screenName, 'screen');
    }

    // Cleanup au démontage
    return () => {
      if (trackTimeSpent) {
        const timeSpent = Date.now() - screenStartTime.current;
        behaviorTracker.endContentEngagement({
          scroll_depth: maxScrollDepth.current,
          interactions_count: interactionCount.current
        });
      }
    };
  }, [user, screenName, autoTrackScreenView, trackTimeSpent]);

  // 🐦 Fonctions de tracking pour les tweets
  const trackTweetInteraction = useCallback((
    tweetId: string | number,
    interactionType: 'view' | 'like' | 'unlike' | 'retweet' | 'unretweet' | 'reply' | 'share' | 'bookmark' | 'click',
    contextData: any = {}
  ) => {
    if (!user) return;

    interactionCount.current += 1;

    const enrichedContext = {
      ...contextData,
      screen: screenName,
      user_id: user.id,
      interaction_index: interactionCount.current
    };

    switch (interactionType) {
      case 'view':
        behaviorTracker.trackTweetView(tweetId, enrichedContext);
        break;
      case 'like':
        behaviorTracker.trackTweetLike(tweetId, true, enrichedContext);
        break;
      case 'unlike':
        behaviorTracker.trackTweetLike(tweetId, false, enrichedContext);
        break;
      case 'retweet':
        behaviorTracker.trackTweetRetweet(tweetId, true, enrichedContext);
        break;
      case 'unretweet':
        behaviorTracker.trackTweetRetweet(tweetId, false, enrichedContext);
        break;
      case 'reply':
        behaviorTracker.trackTweetReply(tweetId, enrichedContext);
        break;
      case 'share':
        behaviorTracker.trackTweetShare(tweetId, enrichedContext);
        break;
      case 'bookmark':
        behaviorTracker.trackTweetBookmark(tweetId, true, enrichedContext);
        break;
      case 'click':
        behaviorTracker.trackTweetClick(tweetId, enrichedContext);
        break;
    }
  }, [user, screenName]);

  // 👤 Fonctions de tracking pour les profils
  const trackProfileInteraction = useCallback((
    userId: string | number,
    interactionType: 'view' | 'follow' | 'unfollow',
    contextData: any = {}
  ) => {
    if (!user) return;

    interactionCount.current += 1;

    const enrichedContext = {
      ...contextData,
      screen: screenName,
      current_user_id: user.id
    };

    switch (interactionType) {
      case 'view':
        behaviorTracker.trackProfileView(userId, enrichedContext);
        break;
      case 'follow':
        behaviorTracker.trackUserFollow(userId, true, enrichedContext);
        break;
      case 'unfollow':
        behaviorTracker.trackUserFollow(userId, false, enrichedContext);
        break;
    }
  }, [user, screenName]);

  // 🔍 Fonction de tracking pour les recherches
  const trackSearch = useCallback((
    query: string,
    resultsCount: number,
    contextData: any = {}
  ) => {
    if (!user) return;

    behaviorTracker.trackSearch(query, resultsCount, {
      ...contextData,
      screen: screenName,
      user_id: user.id
    });
  }, [user, screenName]);

  // 📊 Fonction de tracking pour le scroll
  const trackScroll = useCallback((scrollDepth: number) => {
    if (!trackScrolling) return;

    scrollPosition.current = scrollDepth;
    if (scrollDepth > maxScrollDepth.current) {
      maxScrollDepth.current = scrollDepth;
    }

    // Tracker les étapes importantes de scroll
    if (scrollDepth > 0.25 && maxScrollDepth.current <= 0.25) {
      behaviorTracker.trackAction('scroll_25', screenName, 'screen', {
        scroll_depth: scrollDepth,
        user_id: user?.id
      });
    } else if (scrollDepth > 0.5 && maxScrollDepth.current <= 0.5) {
      behaviorTracker.trackAction('scroll_50', screenName, 'screen', {
        scroll_depth: scrollDepth,
        user_id: user?.id
      });
    } else if (scrollDepth > 0.75 && maxScrollDepth.current <= 0.75) {
      behaviorTracker.trackAction('scroll_75', screenName, 'screen', {
        scroll_depth: scrollDepth,
        user_id: user?.id
      });
    } else if (scrollDepth > 0.9 && maxScrollDepth.current <= 0.9) {
      behaviorTracker.trackAction('scroll_100', screenName, 'screen', {
        scroll_depth: scrollDepth,
        user_id: user?.id
      });
    }
  }, [trackScrolling, screenName, user]);

  // ⚙️ Fonction de tracking pour les changements de paramètres
  const trackSettingChange = useCallback((
    settingType: string,
    newValue: any,
    previousValue: any,
    contextData: any = {}
  ) => {
    if (!user) return;

    if (settingType === 'algorithm') {
      behaviorTracker.trackAlgorithmChange(newValue, previousValue);
    } else {
      behaviorTracker.trackPreferenceChange(settingType, newValue, previousValue);
    }
  }, [user]);

  // 🎯 Fonction générique de tracking
  const trackCustomAction = useCallback((
    actionType: string,
    targetId?: string | number,
    targetType?: string,
    contextData: any = {}
  ) => {
    if (!user) return;

    interactionCount.current += 1;

    behaviorTracker.trackAction(actionType, targetId, targetType, {
      ...contextData,
      screen: screenName,
      user_id: user.id,
      interaction_index: interactionCount.current
    });
  }, [user, screenName]);

  // 📈 Fonction pour récupérer les statistiques
  const getBehaviorStats = useCallback(async (days: number = 30) => {
    if (!user) return null;
    return await behaviorTracker.getMyBehaviorStats(days);
  }, [user]);

  // 🔧 Fonctions utilitaires
  const getTrackingInfo = useCallback(() => ({
    isEnabled: behaviorTracker.isEnabled(),
    queueSize: behaviorTracker.getQueueSize(),
    screenName,
    timeSpent: Date.now() - screenStartTime.current,
    maxScrollDepth: maxScrollDepth.current,
    interactionCount: interactionCount.current
  }), [screenName]);

  const flushTracking = useCallback(async () => {
    await behaviorTracker.forceFlush();
  }, []);

  // 🎯 Fonctions anti-bot V5
  const trackTapGesture = useCallback((duration: number, x?: number, y?: number) => {
    behaviorTracker.trackTapGesture(duration, x, y);
  }, []);

  const trackKeyboardRhythm = useCallback((delays: number[]) => {
    behaviorTracker.trackKeyboardRhythm(delays);
  }, []);

  const trackScrollJitter = useCallback((jitter: number) => {
    behaviorTracker.trackScrollJitter(jitter);
  }, []);

  return {
    // Fonctions de tracking
    trackTweetInteraction,
    trackProfileInteraction,
    trackSearch,
    trackScroll,
    trackSettingChange,
    trackCustomAction,
    trackTapGesture,
    trackKeyboardRhythm,
    trackScrollJitter,
    
    // Fonctions utilitaires
    getBehaviorStats,
    getTrackingInfo,
    flushTracking,
    
    // État
    isTrackingEnabled: behaviorTracker.isEnabled(),
    screenName,
    interactionCount: interactionCount.current
  };
}

/**
 * 🎹 Hook pour le tracking du rythme de frappe clavier
 */
export function useKeyboardTracking() {
  const lastKeyTime = useRef<number>(0);
  const delays = useRef<number[]>([]);

  const onKeyPress = useCallback(() => {
    const now = Date.now();
    if (lastKeyTime.current !== 0) {
      delays.current.push(now - lastKeyTime.current);
    }
    lastKeyTime.current = now;
    
    // Analyser par blocs de 10 touches pour l'entropie
    if (delays.current.length >= 10) {
      behaviorTracker.trackKeyboardRhythm([...delays.current]);
      delays.current = [];
    }
  }, []);

  const resetKeyboardTracking = useCallback(() => {
    lastKeyTime.current = 0;
    delays.current = [];
  }, []);

  return { onKeyPress, resetKeyboardTracking };
}

/**
 * 🤏 Hook pour le tracking de la durée des pressions (Taps)
 */
export function useTapTracking() {
  const pressStartTime = useRef<number>(0);

  const onPressIn = useCallback((event: any) => {
    pressStartTime.current = Date.now();
  }, []);

  const onPressOut = useCallback((event: any) => {
    if (pressStartTime.current === 0) return;
    const duration = Date.now() - pressStartTime.current;
    
    // Extraire coordonnes si possible (selon l'event)
    const x = event?.nativeEvent?.locationX;
    const y = event?.nativeEvent?.locationY;
    
    behaviorTracker.trackTapGesture(duration, x, y);
    pressStartTime.current = 0;
  }, []);

  return { onPressIn, onPressOut };
}

// Hook spécialisé pour les écrans de tweets
export function useTweetScreenTracking(screenName: string = 'TweetsScreen') {
  const tracking = useBehaviorTracking({
    autoTrackScreenView: true,
    screenName,
    trackScrolling: true,
    trackTimeSpent: true
  });

  return tracking;
}

// Hook spécialisé pour les profils
export function useProfileScreenTracking(userId?: string | number) {
  const screenName = `ProfileScreen${userId ? `_${userId}` : ''}`;
  
  const tracking = useBehaviorTracking({
    autoTrackScreenView: true,
    screenName,
    trackTimeSpent: true
  });

  return tracking;
}

// Hook spécialisé pour les recherches
export function useSearchScreenTracking() {
  const tracking = useBehaviorTracking({
    autoTrackScreenView: true,
    screenName: 'SearchScreen',
    trackScrolling: true,
    trackTimeSpent: true
  });

  return tracking;
}
