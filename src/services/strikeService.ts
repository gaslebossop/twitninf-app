import apiService from './api';

/**
 * Strikes Ultra — bloque la diffusion d'un tweet, jamais sa suppression ni
 * sa monétisation. Miroir de `api/src/routes/strikeRoutes.js`.
 */

export interface Strike {
  id: string;
  tweet_id: string;
  striker_id: string;
  author_id: string;
  reason: string;
  status: 'active' | 'contested' | 'upheld' | 'reversed';
  previous_moderation_status: string | null;
  created_at: string;
  updated_at: string;
}

export interface Outcome<T> {
  success: boolean;
  message?: string;
  data?: T;
}

export async function createStrike(tweetId: string, reason: string): Promise<Outcome<Strike>> {
  try {
    const res: any = await apiService.post('/api/strikes', { tweet_id: tweetId, reason });
    if (!res?.success) return { success: false, message: res?.message };
    return { success: true, data: res.data?.strike };
  } catch (error: any) {
    const message = error?.response?.data?.message;
    return { success: false, message: message || 'Strike impossible pour le moment.' };
  }
}

export async function contestStrike(strikeId: string): Promise<Outcome<{ strike: Strike; moderation_status: string }>> {
  try {
    const res: any = await apiService.post(`/api/strikes/${strikeId}/contest`);
    if (!res?.success) return { success: false, message: res?.message };
    return { success: true, data: res.data };
  } catch (error: any) {
    const message = error?.response?.data?.message;
    return { success: false, message: message || 'Contestation impossible pour le moment.' };
  }
}

export default { createStrike, contestStrike };
