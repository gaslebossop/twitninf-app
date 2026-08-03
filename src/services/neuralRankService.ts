import { apiService } from './api';
import { Tweet } from '../types/api';

export type NeuralRankMode = 'for_you' | 'feed' | 'discover' | 'trending';

export interface NeuralRankResponse {
  success: boolean;
  engine?: string;
  data: {
    recommendations: Tweet[];
    count: number;
    algorithm?: string;
    latency_ms?: number;
    cache_hit?: boolean;
    pagination: {
      limit: number;
      offset: number;
      hasMore: boolean;
      total: number;
    };
  };
  error?: string;
}

export interface NeuralRankTrackRequest {
  tweetId: string;
  interactionType: string;
  dwellMs?: number;
}

class NeuralRankService {
  private baseUrl = '/api/neural-rank';

  async getRecommendations(options: {
    mode?: NeuralRankMode;
    limit?: number;
    offset?: number;
  } = {}): Promise<NeuralRankResponse> {
    const { mode = 'for_you', limit = 50, offset = 0 } = options;

    try {
      const params = new URLSearchParams({
        mode,
        limit: limit.toString(),
        offset: offset.toString(),
      });

      const response = await apiService.request(
        `${this.baseUrl}/recommendations?${params.toString()}`,
        { method: 'GET', requiresAuth: true }
      );

      return response;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erreur NeuralRank';
      console.error('[NeuralRank] getRecommendations error:', msg);
      return {
        success: false,
        error: msg,
        data: {
          recommendations: [],
          count: 0,
          pagination: { limit, offset, hasMore: false, total: 0 },
        },
      };
    }
  }

  async trackInteraction(req: NeuralRankTrackRequest): Promise<void> {
    try {
      await apiService.request(`${this.baseUrl}/track`, {
        method: 'POST',
        body: JSON.stringify(req),
        requiresAuth: true,
      });
    } catch {
      // Tracking errors are non-fatal
    }
  }

  async onPublish(tweetId: string): Promise<void> {
    try {
      await apiService.request(`${this.baseUrl}/on-publish`, {
        method: 'POST',
        body: JSON.stringify({ tweetId }),
        requiresAuth: true,
      });
    } catch {
      // Non-fatal
    }
  }

  async healthCheck(): Promise<{ healthy: boolean }> {
    try {
      const res = await apiService.request(`${this.baseUrl}/health`, {
        method: 'GET',
        requiresAuth: true,
      });
      return { healthy: res?.success && res?.data?.healthy };
    } catch {
      return { healthy: false };
    }
  }
}

export const neuralRankService = new NeuralRankService();
export default neuralRankService;
