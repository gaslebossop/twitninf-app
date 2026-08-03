/**
 * Service frontend pour gérer les styles de vérification
 */

import { apiService } from './api';

export type VerificationStyle = 'default' | 'rose' | 'gray' | 'gold';

class VerificationStyleService {
  /**
   * Récupère le style de vérification d'un utilisateur
   */
  static async getUserVerificationStyle(userId: string): Promise<VerificationStyle> {
    try {
      const response = await apiService.get(`/api/verification-style/user/${userId}`);
      if (response.success && response.data) {
        return response.data.style;
      }
      return 'default';
    } catch (error) {
      console.error('Erreur lors de la récupération du style de vérification:', error);
      return 'default';
    }
  }

  /**
   * Change le style de vérification d'un utilisateur
   */
  static async changeUserVerificationStyle(userId: string, style: VerificationStyle): Promise<boolean> {
    try {
      const response = await apiService.post(`/api/verification-style/user/${userId}/change`, {
        style
      });
      return response.success;
    } catch (error) {
      console.error('Erreur lors du changement de style de vérification:', error);
      return false;
    }
  }

  /**
   * Vérifie si un utilisateur peut utiliser un style
   */
  static async canUseStyle(userId: string, style: VerificationStyle): Promise<boolean> {
    try {
      const response = await apiService.get(`/api/verification-style/user/${userId}/can-use/${style}`);
      return response.success && response.data?.canUse;
    } catch (error) {
      console.error('Erreur lors de la vérification de permission:', error);
      return false;
    }
  }

  /**
   * Récupère les couleurs pour un style
   */
  static getStyleColors(style: VerificationStyle) {
    switch (style) {
      case 'rose':
        return {
          color: '#FF69B4',
          gradient: ['#FF69B4', '#FF1493'],
          glowColor: '#FF69B4'
        };
      case 'gray':
        return {
          color: '#808080',
          gradient: ['#808080', '#696969'],
          glowColor: '#808080'
        };
      case 'gold':
        return {
          color: '#FFD700',
          gradient: ['#FFD700', '#FFA500'],
          glowColor: '#FFD700'
        };
      case 'default':
      default:
        return {
          color: '#3897F0',
          gradient: ['#3897F0', '#1877F2'],
          glowColor: '#3897F0'
        };
    }
  }
}

export default VerificationStyleService;
