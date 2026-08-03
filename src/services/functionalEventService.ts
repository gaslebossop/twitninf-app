/**
 * Service pour la gestion des événements fonctionnels côté client
 */

import { apiService } from './api';
import { FunctionalEvent, FunctionalEventFeatures } from '../types/functionalEvent';

class FunctionalEventService {
  private baseUrl = '/api/functional-events';

  /**
   * Obtenir tous les événements
   */
  async getAllEvents(): Promise<FunctionalEvent[]> {
    try {
      const response = await apiService.get(`${this.baseUrl}/events`);
      return response.data || [];
    } catch (error) {
      console.error('Erreur lors de la récupération des événements:', error);
      return [];
    }
  }

  /**
   * Obtenir les événements actifs
   */
  async getActiveEvents(): Promise<FunctionalEvent[]> {
    try {
      const response = await apiService.get(`${this.baseUrl}/events/active`);
      return response.data || [];
    } catch (error) {
      console.error('Erreur lors de la récupération des événements actifs:', error);
      return [];
    }
  }

  /**
   * Obtenir les événements actifs pour une page
   */
  async getActiveEventsForPage(pageName: string): Promise<FunctionalEvent[]> {
    try {
      const response = await apiService.get(`${this.baseUrl}/events/active/${pageName}`);
      return response.data || [];
    } catch (error) {
      console.error(`Erreur lors de la récupération des événements pour ${pageName}:`, error);
      return [];
    }
  }

  /**
   * Obtenir les fonctionnalités actives pour une page
   */
  async getActiveFeaturesForPage(pageName: string): Promise<FunctionalEventFeatures> {
    try {
      const response = await apiService.get(`${this.baseUrl}/events/features/${pageName}`);
      return response.data || {};
    } catch (error) {
      console.error(`Erreur lors de la récupération des fonctionnalités pour ${pageName}:`, error);
      return {};
    }
  }

  /**
   * Vérifier si une fonctionnalité est active
   */
  async isFeatureActive(featureName: string, pageName: string): Promise<boolean> {
    try {
      const response = await apiService.get(`${this.baseUrl}/events/check/${pageName}/${featureName}`);
      return response.data?.isActive || false;
    } catch (error) {
      console.error(`Erreur lors de la vérification de la fonctionnalité ${featureName}:`, error);
      return false;
    }
  }

  /**
   * Obtenir la valeur d'une fonctionnalité
   */
  async getFeatureValue(featureName: string, pageName: string, defaultValue?: any): Promise<any> {
    try {
      const params = defaultValue !== undefined ? `?defaultValue=${encodeURIComponent(JSON.stringify(defaultValue))}` : '';
      const response = await apiService.get(`${this.baseUrl}/events/value/${pageName}/${featureName}${params}`);
      return response.data?.value !== undefined ? response.data.value : defaultValue;
    } catch (error) {
      console.error(`Erreur lors de la récupération de la valeur ${featureName}:`, error);
      return defaultValue;
    }
  }

  /**
   * Obtenir un événement par ID
   */
  async getEventById(id: string): Promise<FunctionalEvent | null> {
    try {
      const response = await apiService.get(`${this.baseUrl}/events/${id}`);
      return response.data || null;
    } catch (error) {
      console.error('Erreur lors de la récupération de l\'événement:', error);
      return null;
    }
  }

  /**
   * Créer un nouvel événement
   */
  async createEvent(eventData: Partial<FunctionalEvent>): Promise<FunctionalEvent | null> {
    try {
      const response = await apiService.post(`${this.baseUrl}/events`, eventData);
      return response.data || null;
    } catch (error) {
      console.error('Erreur lors de la création de l\'événement:', error);
      throw error;
    }
  }

  /**
   * Mettre à jour un événement
   */
  async updateEvent(id: string, updateData: Partial<FunctionalEvent>): Promise<FunctionalEvent | null> {
    try {
      const response = await apiService.put(`${this.baseUrl}/events/${id}`, updateData);
      return response.data || null;
    } catch (error) {
      console.error('Erreur lors de la mise à jour de l\'événement:', error);
      throw error;
    }
  }

  /**
   * Activer un événement
   */
  async activateEvent(id: string, deactivateOthers: boolean = true): Promise<boolean> {
    try {
      await apiService.post(`${this.baseUrl}/events/${id}/activate`, { deactivateOthers });
      return true;
    } catch (error) {
      console.error('Erreur lors de l\'activation de l\'événement:', error);
      return false;
    }
  }

  /**
   * Désactiver un événement
   */
  async deactivateEvent(id: string): Promise<boolean> {
    try {
      await apiService.post(`${this.baseUrl}/events/${id}/deactivate`);
      return true;
    } catch (error) {
      console.error('Erreur lors de la désactivation de l\'événement:', error);
      return false;
    }
  }

  /**
   * Supprimer un événement
   */
  async deleteEvent(id: string): Promise<boolean> {
    try {
      await apiService.delete(`${this.baseUrl}/events/${id}`);
      return true;
    } catch (error) {
      console.error('Erreur lors de la suppression de l\'événement:', error);
      return false;
    }
  }

  /**
   * Initialiser les événements par défaut
   */
  async initializeDefaultEvents(): Promise<FunctionalEvent[]> {
    try {
      const response = await apiService.post(`${this.baseUrl}/events/initialize-defaults`);
      return response.data || [];
    } catch (error) {
      console.error('Erreur lors de l\'initialisation des événements par défaut:', error);
      throw error;
    }
  }
}

export const functionalEventService = new FunctionalEventService();
