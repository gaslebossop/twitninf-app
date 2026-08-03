/**
 * Hook personnalisé pour gérer les défis d'utilisateur
 * Permet de suivre la progression des défis d'événements fonctionnels
 */

import { useState, useEffect, useCallback } from 'react';
import userChallengeService, { UserChallenge, ChallengeStats } from '../services/userChallengeService';

interface UseUserChallengesOptions {
  eventSlug?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

interface UseUserChallengesReturn {
  challenges: UserChallenge[];
  stats: ChallengeStats | null;
  isLoading: boolean;
  error: string | null;
  refreshChallenges: () => Promise<void>;
  updateChallengeProgress: (challengeId: string, progress: number) => Promise<void>;
  claimChallengeReward: (challengeId: string) => Promise<void>;
  initializeChallenges: () => Promise<void>;
  getChallengeById: (challengeId: string) => UserChallenge | undefined;
}

export const useUserChallenges = (options: UseUserChallengesOptions = {}): UseUserChallengesReturn => {
  const { eventSlug, autoRefresh = true, refreshInterval = 30000 } = options;
  
  const [challenges, setChallenges] = useState<UserChallenge[]>([]);
  const [stats, setStats] = useState<ChallengeStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Charger les défis
  const loadChallenges = useCallback(async () => {
    if (!eventSlug) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const [challengesData, statsData] = await Promise.all([
        userChallengeService.getUserChallenges(eventSlug),
        userChallengeService.getChallengeStats(eventSlug),
      ]);
      
      setChallenges(challengesData);
      setStats(statsData);
    } catch (err) {
      console.error('Erreur lors du chargement des défis:', err);
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setIsLoading(false);
    }
  }, [eventSlug]);

  // Rafraîchir les défis
  const refreshChallenges = useCallback(async () => {
    await loadChallenges();
  }, [loadChallenges]);

  // Mettre à jour la progression d'un défi
  const updateChallengeProgress = useCallback(async (challengeId: string, progress: number) => {
    if (!eventSlug) return;
    
    try {
      const updatedChallenge = await userChallengeService.updateSpecificChallengeProgress(
        challengeId,
        eventSlug,
        progress
      );
      
      setChallenges(prev => 
        prev.map(challenge => 
          challenge.id === updatedChallenge.id ? updatedChallenge : challenge
        )
      );
      
      // Recharger les statistiques
      const statsData = await userChallengeService.getChallengeStats(eventSlug);
      setStats(statsData);
    } catch (err) {
      console.error('Erreur lors de la mise à jour de la progression:', err);
      setError(err instanceof Error ? err.message : 'Erreur lors de la mise à jour');
    }
  }, [eventSlug]);

  // Réclamer la récompense d'un défi
  const claimChallengeReward = useCallback(async (challengeId: string) => {
    if (!eventSlug) return;
    
    try {
      const updatedChallenge = await userChallengeService.claimSpecificChallengeReward(
        challengeId,
        eventSlug
      );
      
      setChallenges(prev => 
        prev.map(challenge => 
          challenge.id === updatedChallenge.id ? updatedChallenge : challenge
        )
      );
      
      // Recharger les statistiques
      const statsData = await userChallengeService.getChallengeStats(eventSlug);
      setStats(statsData);
    } catch (err) {
      console.error('Erreur lors de la réclamation de la récompense:', err);
      setError(err instanceof Error ? err.message : 'Erreur lors de la réclamation');
    }
  }, [eventSlug]);

  // Initialiser les défis
  const initializeChallenges = useCallback(async () => {
    if (!eventSlug) return;
    
    try {
      const newChallenges = await userChallengeService.initializeChallenges(eventSlug);
      setChallenges(newChallenges);
      
      // Recharger les statistiques
      const statsData = await userChallengeService.getChallengeStats(eventSlug);
      setStats(statsData);
    } catch (err) {
      console.error('Erreur lors de l\'initialisation des défis:', err);
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'initialisation');
    }
  }, [eventSlug]);

  // Obtenir un défi par ID
  const getChallengeById = useCallback((challengeId: string): UserChallenge | undefined => {
    return challenges.find(challenge => challenge.challenge_id === challengeId);
  }, [challenges]);

  // Charger les défis au montage
  useEffect(() => {
    loadChallenges();
  }, [loadChallenges]);

  // Auto-refresh si activé
  useEffect(() => {
    if (!autoRefresh || !eventSlug) return;
    
    const interval = setInterval(() => {
      loadChallenges();
    }, refreshInterval);
    
    return () => clearInterval(interval);
  }, [autoRefresh, eventSlug, refreshInterval, loadChallenges]);

  return {
    challenges,
    stats,
    isLoading,
    error,
    refreshChallenges,
    updateChallengeProgress,
    claimChallengeReward,
    initializeChallenges,
    getChallengeById,
  };
};
