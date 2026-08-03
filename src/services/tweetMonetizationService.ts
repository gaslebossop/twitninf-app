/**
 * Service de monétisation des tweets côté frontend
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG } from '../config/api';
import tokenStore from './tokenStore';

class TweetMonetizationService {
  private static async makeRequest(endpoint: string, options: RequestInit = {}) {
    try {
      const token = await tokenStore.getAccessToken();
      
      if (!token) {
        throw new Error('Token d\'authentification non trouvé');
      }

      const response = await fetch(`${API_CONFIG.BASE_URL}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Erreur HTTP: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Erreur API:', error);
      throw error;
    }
  }

  /**
   * Vérifier l'éligibilité d'un tweet
   */
  static async checkTweetEligibility(tweetId: string) {
    try {
      const response = await this.makeRequest(`/api/tweet-monetization/eligibility/${tweetId}`);
      return response.data;
    } catch (error) {
      console.error('Erreur lors de la vérification de l\'éligibilité:', error);
      throw error;
    }
  }

  /**
   * Calculer la récompense d'un tweet
   */
  static async calculateTweetReward(tweetId: string) {
    try {
      const response = await this.makeRequest(`/api/tweet-monetization/reward/${tweetId}`);
      return response.data;
    } catch (error) {
      console.error('Erreur lors du calcul de la récompense:', error);
      throw error;
    }
  }

  /**
   * Distribuer une récompense
   */
  static async distributeReward(tweetId: string, userId: string) {
    try {
      const response = await this.makeRequest(`/api/tweet-monetization/distribute/${tweetId}`, {
        method: 'POST',
        body: JSON.stringify({ userId })
      });
      return response.data;
    } catch (error) {
      console.error('Erreur lors de la distribution de la récompense:', error);
      throw error;
    }
  }

  /**
   * Obtenir les tweets éligibles d'un utilisateur
   */
  static async getUserEligibleTweets(userId: string, page: number = 1, limit: number = 20) {
    try {
      const response = await this.makeRequest(`/api/tweet-monetization/user/${userId}/eligible?page=${page}&limit=${limit}`);
      return response.data;
    } catch (error) {
      console.error('Erreur lors de la récupération des tweets éligibles:', error);
      throw error;
    }
  }

  /**
   * Obtenir les statistiques de monétisation
   */
  static async getMonetizationStats() {
    try {
      const response = await this.makeRequest('/api/tweet-monetization/stats');
      return response.data;
    } catch (error) {
      console.error('Erreur lors de la récupération des statistiques:', error);
      throw error;
    }
  }

  /**
   * Prévisualiser les gains sans les distribuer
   */
  static async previewEarnings() {
    try {
      const response = await this.makeRequest('/api/tweet-monetization/preview');
      return response.data;
    } catch (error) {
      console.error('Erreur lors de la prévisualisation des gains:', error);
      throw error;
    }
  }

  /**
   * Traiter tous les tweets éligibles
   */
  static async processEligibleTweets() {
    try {
      const response = await this.makeRequest('/api/tweet-monetization/process-all', {
        method: 'POST'
      });
      return response.data;
    } catch (error) {
      console.error('Erreur lors du traitement des tweets éligibles:', error);
      throw error;
    }
  }
}

export default TweetMonetizationService;
