/**
 * Service pour gérer les styles de badges vérifiés
 * Synchronisé avec le serveur
 */

import { apiService } from './api';

export interface VerifiedBadgeStyle {
  id: string;
  name: string;
  color: string;
  gradient: string[];
  glowColor: string;
  animationType: 'pulse' | 'glow' | 'sparkle';
  rarity: 'DEFAULT' | 'ULTRA_RARE';
  isActive: boolean;
}

export interface UserBadgeStyle {
  userId: string;
  styleId: string;
  isActive: boolean;
}

class VerifiedBadgeService {
  /**
   * Récupère le style de badge actuel d'un utilisateur
   */
  static async getUserBadgeStyle(userId: string): Promise<VerifiedBadgeStyle | null> {
    try {
      const response = await apiService.get(`/api/verified-badges/user/${userId}/style`);
      if (response.success && response.data) {
        return response.data;
      }
      return null;
    } catch (error) {
      console.error('Erreur lors de la récupération du style de badge:', error);
      return null;
    }
  }

  /**
   * Change le style de badge d'un utilisateur
   */
  static async changeUserBadgeStyle(userId: string, styleId: string): Promise<boolean> {
    try {
      const response = await apiService.post(`/api/verified-badges/user/${userId}/change-style`, {
        styleId
      });
      return response.success;
    } catch (error) {
      console.error('Erreur lors du changement de style de badge:', error);
      return false;
    }
  }

  /**
   * Récupère tous les styles de badges disponibles
   */
  static async getAvailableBadgeStyles(): Promise<VerifiedBadgeStyle[]> {
    try {
      const response = await apiService.get('/api/verified-badges/styles');
      if (response.success && response.data) {
        return response.data;
      }
      return [];
    } catch (error) {
      console.error('Erreur lors de la récupération des styles de badges:', error);
      return [];
    }
  }

  /**
   * Vérifie si un utilisateur peut utiliser un style de badge
   */
  static async canUseBadgeStyle(userId: string, styleId: string): Promise<boolean> {
    try {
      const response = await apiService.get(`/api/verified-badges/user/${userId}/can-use/${styleId}`);
      return response.success && response.data?.canUse;
    } catch (error) {
      console.error('Erreur lors de la vérification du style de badge:', error);
      return false;
    }
  }
}

export default VerifiedBadgeService;
