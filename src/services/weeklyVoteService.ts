import apiService from './api';
import type { Tweet } from '../types/api';

/**
 * Vote hebdomadaire de la communauté pour le meilleur tweet de la semaine
 * (idée retenue sur La Forge). Miroir de `api/src/routes/weeklyVoteRoutes.js`.
 */

export interface WeeklyVoteCandidate extends Tweet {
  weekly_vote: { count: number; is_my_vote: boolean };
}

export interface WeeklyVoteBoard {
  week_start: string;
  week_end: string;
  candidates: WeeklyVoteCandidate[];
  total_votes: number;
  /** ID du tweet voté par le lecteur cette semaine, `null` s'il n'a pas voté. */
  my_vote: string | null;
}

export interface Outcome<T> {
  success: boolean;
  message?: string;
  data?: T;
}

export async function fetchCandidates(): Promise<Outcome<WeeklyVoteBoard>> {
  try {
    const res: any = await apiService.get('/api/weekly-vote/candidates');
    if (!res?.success) return { success: false, message: res?.message };
    return { success: true, data: res.data };
  } catch {
    return { success: false, message: 'Lecture impossible.' };
  }
}

export async function voteForTweet(tweetId: string): Promise<Outcome<{
  week_start: string;
  my_vote: string;
  vote_count: number;
  total_votes: number;
}>> {
  try {
    const res: any = await apiService.post(`/api/weekly-vote/${tweetId}`);
    if (!res?.success) return { success: false, message: res?.message };
    return { success: true, data: res.data };
  } catch (error: any) {
    return {
      success: false,
      message: error?.response?.data?.message || 'Vote impossible.',
    };
  }
}

export default {
  fetchCandidates,
  voteForTweet,
};
