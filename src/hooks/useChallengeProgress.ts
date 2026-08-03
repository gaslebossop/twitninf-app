/**
 * Hook pour gérer la progression des défis
 */

import { useState, useCallback } from 'react';
import ChallengeProgressService from '../services/challengeProgressService';

export function useChallengeProgress() {
  const [isUpdating, setIsUpdating] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  /**
   * Met à jour la progression de tous les défis
   */
  const updateAllProgress = useCallback(async (eventSlug: string = 'kosporbirthday') => {
    setIsUpdating(true);
    try {
      const result = await ChallengeProgressService.updateAllChallengesProgress(eventSlug);
      setLastUpdate(new Date());
      return result;
    } catch (error) {
      console.error('Erreur lors de la mise à jour de la progression:', error);
      throw error;
    } finally {
      setIsUpdating(false);
    }
  }, []);

  /**
   * Met à jour spécifiquement la progression des likes
   */
  const updateLikesProgress = useCallback(async (eventSlug: string = 'kosporbirthday') => {
    setIsUpdating(true);
    try {
      const result = await ChallengeProgressService.updateLikesProgress(eventSlug);
      setLastUpdate(new Date());
      return result;
    } catch (error) {
      console.error('Erreur lors de la mise à jour de la progression des likes:', error);
      throw error;
    } finally {
      setIsUpdating(false);
    }
  }, []);

  /**
   * Met à jour la progression en arrière-plan (sans loading)
   */
  const refreshProgressSilently = useCallback(async (eventSlug: string = 'kosporbirthday') => {
    try {
      await ChallengeProgressService.refreshAllProgress(eventSlug);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Erreur lors de la mise à jour silencieuse:', error);
    }
  }, []);

  /**
   * Met à jour la progression des likes en arrière-plan
   */
  const refreshLikesProgressSilently = useCallback(async (eventSlug: string = 'kosporbirthday') => {
    try {
      await ChallengeProgressService.refreshLikesProgress(eventSlug);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Erreur lors de la mise à jour silencieuse des likes:', error);
    }
  }, []);

  /**
   * Met à jour la progression des tweets
   */
  const updateTweetProgress = useCallback(async (eventSlug: string = 'kosporbirthday') => {
    setIsUpdating(true);
    try {
      const result = await ChallengeProgressService.updateTweetsProgress(eventSlug);
      setLastUpdate(new Date());
      return result;
    } catch (error) {
      console.error('Erreur lors de la mise à jour de la progression des tweets:', error);
      throw error;
    } finally {
      setIsUpdating(false);
    }
  }, []);

  return {
    isUpdating,
    lastUpdate,
    updateAllProgress,
    updateLikesProgress,
    updateTweetProgress,
    refreshProgressSilently,
    refreshLikesProgressSilently,
  };
}