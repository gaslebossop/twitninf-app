import { useRef, useCallback, useEffect } from 'react';
import { apiService } from '../services';

interface ViewTrackingOptions {
  debounceMs?: number;
  minViewTime?: number;
  batchSize?: number;
  enableBackgroundSync?: boolean;
}

interface ViewEvent {
  tweetId: string;
  timestamp: number;
  viewTime: number;
  isVisible: boolean;
}

class OptimizedViewTracker {
  private viewedTweets = new Set<string>();
  private pendingViews = new Map<string, ViewEvent>();
  private viewTimers = new Map<string, NodeJS.Timeout>();
  private batchTimer: NodeJS.Timeout | null = null;
  private isOnline = true;
  
  private options: Required<ViewTrackingOptions>;

  constructor(options: ViewTrackingOptions = {}) {
    this.options = {
      debounceMs: options.debounceMs ?? 1000,
      minViewTime: options.minViewTime ?? 2000,
      batchSize: options.batchSize ?? 10,
      enableBackgroundSync: options.enableBackgroundSync ?? true
    };
  }

  /**
   * Track a tweet view with optimized logic
   */
  trackView(tweetId: string, isVisible: boolean = true) {
    if (this.viewedTweets.has(tweetId)) return;

    const existingTimer = this.viewTimers.get(tweetId);

    // Une sortie du viewport annule une impression qui n'a pas encore atteint
    // son temps minimum. L'ancien code ignorait `false`, donc un tweet pouvait
    // être compté après avoir déjà disparu de l'écran.
    if (!isVisible) {
      if (existingTimer) {
        clearTimeout(existingTimer);
        this.viewTimers.delete(tweetId);
      }
      return;
    }

    // Ne pas relancer le chrono à chaque callback FlatList : quand un autre
    // item changeait de visibilité, le même tweet visible repartait de zéro.
    if (existingTimer) return;

    if (this.options.minViewTime === 0) {
      this.markAsViewed(tweetId);
      return;
    }

    const timer = setTimeout(() => {
      this.viewTimers.delete(tweetId);
      this.markAsViewed(tweetId);
    }, this.options.minViewTime);

    this.viewTimers.set(tweetId, timer);
  }

  /**
   * Mark tweet as viewed and add to batch
   */
  private markAsViewed(tweetId: string) {
    if (this.viewedTweets.has(tweetId)) return;

    this.viewedTweets.add(tweetId);
    
    const viewEvent: ViewEvent = {
      tweetId,
      timestamp: Date.now(),
      viewTime: this.options.minViewTime,
      isVisible: true
    };

    this.pendingViews.set(tweetId, viewEvent);
    this.scheduleBatchUpdate();
  }

  /**
   * Schedule batch update to server
   */
  private scheduleBatchUpdate() {
    if (this.batchTimer) return;

    this.batchTimer = setTimeout(() => {
      this.flushPendingViews();
    }, this.options.debounceMs);
  }

  /**
   * Flush pending views to server
   */
  private async flushPendingViews() {
    if (this.pendingViews.size === 0) return;

    const views = Array.from(this.pendingViews.values());
    this.pendingViews.clear();
    this.batchTimer = null;

    if (!this.isOnline) {
      // Store for later sync
      this.storeOfflineViews(views);
      return;
    }

    try {
      // Send views in batches
      const batches = this.chunkArray(views, this.options.batchSize);
      
      for (const batch of batches) {
        await this.sendViewBatch(batch);
      }
    } catch (error) {
      console.error('❌ Error sending view batch:', error);
      // Store for retry
      this.storeOfflineViews(views);
    }
  }

  /**
   * Send a batch of views to server
   */
  private async sendViewBatch(views: ViewEvent[]) {
    const tweetIds = views.map(v => v.tweetId);
    
    try {
      const response = await apiService.incrementTweetViews(tweetIds);
      if (!response?.success) {
        throw new Error(response?.message || 'Le serveur a refusé le batch de vues');
      }
      console.log(`✅ Views updated for ${tweetIds.length} tweets`);
    } catch (error) {
      console.error('❌ Error updating views:', error);
      throw error;
    }
  }

  /**
   * Store views for offline sync
   */
  private storeOfflineViews(views: ViewEvent[]) {
    // Implementation for offline storage
    console.log(`📱 Stored ${views.length} views for offline sync`);
  }

  /**
   * Utility to chunk array
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Clean up timers
   */
  cleanup() {
    this.viewTimers.forEach(timer => clearTimeout(timer));
    this.viewTimers.clear();
    
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    // Les impressions déjà qualifiées ne doivent pas être perdues si
    // l'utilisateur ouvre un tweet avant la fin du debounce du batch.
    if (this.pendingViews.size > 0) {
      void this.flushPendingViews();
    }
  }

  /**
   * Reset for new session
   */
  reset() {
    this.cleanup();
    this.viewedTweets.clear();
    this.pendingViews.clear();
  }
}

/**
 * Hook for optimized view tracking
 */
export function useOptimizedViewTracking(options: ViewTrackingOptions = {}) {
  const trackerRef = useRef<OptimizedViewTracker | null>(null);

  // Initialize tracker
  useEffect(() => {
    trackerRef.current = new OptimizedViewTracker(options);
    
    return () => {
      trackerRef.current?.cleanup();
    };
  }, []);

  // Track view with optimization
  const trackView = useCallback((tweetId: string, isVisible: boolean = true) => {
    if (trackerRef.current) {
      trackerRef.current.trackView(tweetId, isVisible);
    }
  }, []);

  // Reset tracker
  const resetTracker = useCallback(() => {
    if (trackerRef.current) {
      trackerRef.current.reset();
    }
  }, []);

  return {
    trackView,
    resetTracker
  };
}
