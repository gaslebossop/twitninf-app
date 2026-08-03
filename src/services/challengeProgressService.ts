/**
 * Service frontend pour gérer la progression des défis
 */

import { apiService } from './api';

export interface ChallengeProgressUpdate {
  successful: number;
  failed: number;
  results: any[];
}

class ChallengeProgressService {
  /**
   * Met à jour la progression de tous les défis d'un utilisateur
   */
  static async updateAllChallengesProgress(eventSlug: string): Promise<ChallengeProgressUpdate> {
    try {
      const response = await apiService.post(`/api/user-challenges/update-progress/${eventSlug}`);
      return response.data;
    } catch (error) {
      console.error('Erreur lors de la mise à jour de la progression des défis:', error);
      throw error;
    }
  }

  /**
   * Met à jour spécifiquement la progression du défi des likes
   */
  static async updateLikesProgress(eventSlug: string): Promise<any> {
    try {
      const response = await apiService.post(`/api/user-challenges/update-likes-progress/${eventSlug}`);
      return response.data;
    } catch (error) {
      console.error('Erreur lors de la mise à jour de la progression des likes:', error);
      throw error;
    }
  }

  /**
   * Met à jour la progression des tweets
   */
  static async updateTweetsProgress(eventSlug: string): Promise<any> {
    try {
      const response = await apiService.post(`/api/user-challenges/update-tweets-progress/${eventSlug}`);
      return response.data;
    } catch (error) {
      console.error('Erreur lors de la mise à jour de la progression des tweets:', error);
      throw error;
    }
  }

  /**
   * Met à jour la progression des likes en temps réel
   * Cette fonction peut être appelée après chaque like/unlike
   */
  static async refreshLikesProgress(eventSlug: string = 'kosporbirthday'): Promise<void> {
    try {
      await this.updateLikesProgress(eventSlug);
      console.log('✅ Progression des likes mise à jour');
    } catch (error) {
      console.error('❌ Erreur lors de la mise à jour de la progression des likes:', error);
    }
  }

  /**
   * Met à jour tous les défis en temps réel
   * Cette fonction peut être appelée périodiquement ou après des actions importantes
   */
  static async refreshAllProgress(eventSlug: string = 'kosporbirthday'): Promise<void> {
    try {
      await this.updateAllChallengesProgress(eventSlug);
      console.log('✅ Progression de tous les défis mise à jour');
    } catch (error) {
      console.error('❌ Erreur lors de la mise à jour de la progression des défis:', error);
    }
  }

  /**
   * Marque le défi "souhaiter bon anniversaire" comme complété
   */
  static async completeBirthdayWishChallenge(userId: string, eventSlug: string = 'kosporbirthday'): Promise<any> {
    try {
      const response = await apiService.post(`/api/user-challenges/complete-birthday-wish/${eventSlug}`, {
        userId
      });
      console.log('✅ Défi "souhaiter bon anniversaire" marqué comme complété');
      return response.data;
    } catch (error) {
      console.error('❌ Erreur lors de la complétion du défi "souhaiter bon anniversaire":', error);
      throw error;
    }
  }
}

export default ChallengeProgressService;