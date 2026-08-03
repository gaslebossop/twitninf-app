/**
 * Service de tracking CTR pour l'algorithme Rust
 * Toutes les interactions passent par /api/track → Rust recommender
 */

import { apiService } from './api';

type TrackableAction =
  | 'like' | 'unlike'
  | 'retweet' | 'unretweet'
  | 'comment'
  | 'view' | 'bookmark' | 'share' | 'skip' | 'report' | 'block'
  | 'profile_view';

async function trackAction(
  tweetId: string,
  action: TrackableAction,
  dwellMs?: number
) {
  try {
    await apiService.post('/api/track', {
      tweet_id: tweetId,
      action,
      dwell_ms: dwellMs ?? null,
    });
  } catch {
    // Non-blocking
  }
}

export const trackingService = {
  trackLike:      (tweetId: string) => trackAction(tweetId, 'like'),
  trackUnlike:    (tweetId: string) => trackAction(tweetId, 'unlike'),
  trackRetweet:   (tweetId: string) => trackAction(tweetId, 'retweet'),
  trackUnretweet: (tweetId: string) => trackAction(tweetId, 'unretweet'),
  trackComment:   (tweetId: string) => trackAction(tweetId, 'comment'),
  trackShare:     (tweetId: string) => trackAction(tweetId, 'share'),
  trackBookmark:  (tweetId: string) => trackAction(tweetId, 'bookmark'),
  trackSkip:      (tweetId: string) => trackAction(tweetId, 'skip'),
  trackReport:    (tweetId: string) => trackAction(tweetId, 'report'),
  trackBlock:     (tweetId: string) => trackAction(tweetId, 'block'),
  trackProfileView: (tweetId: string) => trackAction(tweetId, 'profile_view'),

  trackView: (tweetId: string, dwellMs?: number) =>
    trackAction(tweetId, 'view', dwellMs),
};

export default trackingService;
