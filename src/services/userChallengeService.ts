/**
 * Service frontend pour la gestion des défis d'utilisateur
 * Permet de suivre la progression des défis d'événements fonctionnels
 */

import { apiService } from './api';

export interface UserChallenge {
  id: string;
  user_id: string;
  challenge_id: string;
  event_slug: string;
  progress: number;
  max_progress: number;
  completed: boolean;
  claimed: boolean;
  claimed_at?: string;
  metadata: {
    title: string;
    description: string;
    reward: string;
    icon: string;
  };
  created_at: string;
  updated_at: string;
}

export interface ChallengeStats {
  total: number;
  completed: number;
  claimed: number;
  in_progress: number;
  total_rewards: number;
}

export interface CreateChallengeData {
  challenge_id: string;
  event_slug: string;
  max_progress: number;
  metadata?: any;
}

export interface UpdateProgressData {
  event_slug: string;
  progress: number;
}

export interface ClaimRewardData {
  event_slug: string;
}

class UserChallengeService {
  /**
   * Récupérer tous les défis d'un utilisateur pour un événement
   */
  async getUserChallenges(eventSlug?: string): Promise<UserChallenge[]> {
    try {
      const url = eventSlug ? `/api/user-challenges?event_slug=${eventSlug}` : '/api/user-challenges';
      const response = await apiService.get(url);
      
      if (response.success) {
        return response.data;
      }
      throw new Error(response.message || 'Erreur lors de la récupération des défis');
    } catch (error) {
      console.error('Erreur lors de la récupération des défis:', error);
      throw error;
    }
  }

  /**
   * Récupérer un défi spécifique
   */
  async getUserChallenge(challengeId: string, eventSlug: string): Promise<UserChallenge> {
    try {
      const response = await apiService.get(`/api/user-challenges/${challengeId}?event_slug=${eventSlug}`);
      
      if (response.success) {
        return response.data;
      }
      throw new Error(response.message || 'Défi non trouvé');
    } catch (error) {
      console.error('Erreur lors de la récupération du défi:', error);
      throw error;
    }
  }

  /**
   * Créer ou mettre à jour un défi
   */
  async createOrUpdateChallenge(data: CreateChallengeData): Promise<UserChallenge> {
    try {
      const response = await apiService.post('/api/user-challenges', data);
      
      if (response.success) {
        return response.data;
      }
      throw new Error(response.message || 'Erreur lors de la création/mise à jour du défi');
    } catch (error) {
      console.error('Erreur lors de la création/mise à jour du défi:', error);
      throw error;
    }
  }

  /**
   * Mettre à jour la progression d'un défi
   */
  async updateChallengeProgress(
    challengeId: string, 
    data: UpdateProgressData
  ): Promise<UserChallenge> {
    try {
      const response = await apiService.put(`/api/user-challenges/${challengeId}/progress`, data);
      
      if (response.success) {
        return response.data;
      }
      throw new Error(response.message || 'Erreur lors de la mise à jour de la progression');
    } catch (error) {
      console.error('Erreur lors de la mise à jour de la progression:', error);
      throw error;
    }
  }

  /**
   * Réclamer la récompense d'un défi
   */
  async claimChallengeReward(
    challengeId: string, 
    data: ClaimRewardData
  ): Promise<UserChallenge> {
    try {
      const response = await apiService.post(`/api/user-challenges/${challengeId}/claim`, data);
      
      if (response.success) {
        return response.data;
      }
      throw new Error(response.message || 'Erreur lors de la réclamation de la récompense');
    } catch (error) {
      console.error('Erreur lors de la réclamation de la récompense:', error);
      throw error;
    }
  }

  /**
   * Récupérer les statistiques des défis pour un événement
   */
  async getChallengeStats(eventSlug: string): Promise<ChallengeStats> {
    try {
      const response = await apiService.get(`/api/user-challenges/stats/${eventSlug}`);
      
      if (response.success) {
        return response.data;
      }
      throw new Error(response.message || 'Erreur lors de la récupération des statistiques');
    } catch (error) {
      console.error('Erreur lors de la récupération des statistiques:', error);
      throw error;
    }
  }

  /**
   * Initialiser les défis par défaut pour un événement
   */
  async initializeChallenges(eventSlug: string): Promise<UserChallenge[]> {
    try {
      const response = await apiService.post(`/api/user-challenges/initialize/${eventSlug}`);
      
      if (response.success) {
        return response.data;
      }
      throw new Error(response.message || 'Erreur lors de l\'initialisation des défis');
    } catch (error) {
      console.error('Erreur lors de l\'initialisation des défis:', error);
      throw error;
    }
  }

  /**
   * Mettre à jour la progression d'un défi spécifique
   */
  async updateSpecificChallengeProgress(
    challengeId: string,
    eventSlug: string,
    progress: number
  ): Promise<UserChallenge> {
    return this.updateChallengeProgress(challengeId, {
      event_slug: eventSlug,
      progress: progress,
    });
  }

  /**
   * Réclamer la récompense d'un défi spécifique
   */
  async claimSpecificChallengeReward(
    challengeId: string,
    eventSlug: string
  ): Promise<UserChallenge> {
    return this.claimChallengeReward(challengeId, {
      event_slug: eventSlug,
    });
  }
}

export default new UserChallengeService();
