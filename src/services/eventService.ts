/**
 * Service pour la gestion des événements thématiques côté frontend
 * Gère la récupération des événements et l'application des thèmes
 */

import apiService from './api';

export interface EventTheme {
  id: string;
  name: string;
  description: string;
  colors: string[];
  icon: string;
}

export interface EventEffect {
  particles?: string;
  animations?: string[];
  sounds?: boolean;
}

export interface Event {
  id: string;
  name: string;
  slug: string;
  description?: string;
  is_active: boolean;
  priority: number;
  theme_id?: string;
  theme_config: EventTheme;
  start_date?: string;
  end_date?: string;
  auto_activate: boolean;
  icon?: string;
  colors: string[];
  effects: EventEffect;
  created_by?: string;
  updated_by?: string;
  created_at: string;
  updated_at: string;
  creator?: {
    id: string;
    username: string;
    full_name: string;
  };
}

export interface EventConfig {
  event: {
    id: string;
    name: string;
    slug: string;
  };
  theme: EventTheme;
  colors: string[];
  effects: EventEffect;
  icon?: string;
}

class EventService {
  private activeEvent: Event | null = null;
  private lastFetch: number = 0;
  private cacheTimeout: number = 5 * 60 * 1000; // 5 minutes

  /**
   * Récupérer tous les événements
   */
  async getEvents(params?: {
    page?: number;
    limit?: number;
    active_only?: boolean;
    include_inactive?: boolean;
  }): Promise<{ events: Event[]; pagination: any } | null> {
    try {
      // S'assurer que le token est à jour
      await apiService.refreshToken();
      const response = await apiService.get('/api/events', params);
      return response?.data || null;
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des événements:', error);
      return null;
    }
  }

  /**
   * Récupérer l'événement actuellement actif
   */
  async getActiveEvent(forceRefresh = false): Promise<Event | null> {
    try {
      const now = Date.now();
      
      // Utiliser le cache si disponible et récent
      if (!forceRefresh && this.activeEvent && (now - this.lastFetch < this.cacheTimeout)) {
        return this.activeEvent;
      }

      // S'assurer que le token est à jour
      await apiService.refreshToken();
      const response = await apiService.get('/api/events/active');
      const activeEvent = response?.data || null;

      // Mettre à jour le cache
      this.activeEvent = activeEvent;
      this.lastFetch = now;

      return activeEvent;
    } catch (error) {
      console.error('❌ Erreur lors de la récupération de l\'événement actif:', error);
      return null;
    }
  }

  /**
   * Récupérer un événement par ID ou slug
   */
  async getEvent(id: string): Promise<Event | null> {
    try {
      const response = await apiService.get(`/api/events/${id}`);
      return response?.data || null;
    } catch (error) {
      console.error('❌ Erreur lors de la récupération de l\'événement:', error);
      return null;
    }
  }

  /**
   * Récupérer la configuration de thème de l'événement actif
   */
  async getActiveThemeConfig(): Promise<EventConfig | null> {
    try {
      const activeEvent = await this.getActiveEvent();
      
      if (!activeEvent || !activeEvent.theme_config) {
        return null;
      }

      return {
        event: {
          id: activeEvent.id,
          name: activeEvent.name,
          slug: activeEvent.slug,
        },
        theme: activeEvent.theme_config,
        colors: activeEvent.colors || [],
        effects: activeEvent.effects || {},
        icon: activeEvent.icon,
      };
    } catch (error) {
      console.error('❌ Erreur lors de la récupération de la configuration de thème:', error);
      return null;
    }
  }

  /**
   * Vérifier s'il y a un événement actif
   */
  async hasActiveEvent(): Promise<boolean> {
    try {
      const activeEvent = await this.getActiveEvent();
      return activeEvent !== null;
    } catch (error) {
      console.error('❌ Erreur lors de la vérification d\'événement actif:', error);
      return false;
    }
  }

  /**
   * Obtenir le thème à appliquer (événement ou par défaut)
   */
  async getCurrentTheme(): Promise<EventTheme | null> {
    try {
      const config = await this.getActiveThemeConfig();
      return config?.theme || null;
    } catch (error) {
      console.error('❌ Erreur lors de la récupération du thème actuel:', error);
      return null;
    }
  }

  /**
   * Créer un nouvel événement (admin)
   */
  async createEvent(eventData: Partial<Event>): Promise<Event | null> {
    try {
      const response = await apiService.post('/api/events', eventData);
      
      if (response?.success) {
        // Invalider le cache
        this.invalidateCache();
        return response.data;
      }
      
      return null;
    } catch (error) {
      console.error('❌ Erreur lors de la création de l\'événement:', error);
      throw error;
    }
  }

  /**
   * Modifier un événement (admin)
   */
  async updateEvent(id: string, updateData: Partial<Event>): Promise<Event | null> {
    try {
      const response = await apiService.put(`/api/events/${id}`, updateData);
      
      if (response?.success) {
        // Invalider le cache
        this.invalidateCache();
        return response.data;
      }
      
      return null;
    } catch (error) {
      console.error('❌ Erreur lors de la mise à jour de l\'événement:', error);
      throw error;
    }
  }

  /**
   * Activer un événement (admin)
   */
  async activateEvent(id: string, deactivateOthers = true): Promise<boolean> {
    try {
      const response = await apiService.post(`/api/events/${id}/activate`, {
        deactivate_others: deactivateOthers,
      });

      if (response?.success) {
        // Invalider le cache
        this.invalidateCache();
        return true;
      }

      return false;
    } catch (error) {
      console.error('❌ Erreur lors de l\'activation de l\'événement:', error);
      throw error;
    }
  }

  /**
   * Désactiver un événement (admin)
   */
  async deactivateEvent(id: string): Promise<boolean> {
    try {
      const response = await apiService.post(`/api/events/${id}/deactivate`);

      if (response?.success) {
        // Invalider le cache
        this.invalidateCache();
        return true;
      }

      return false;
    } catch (error) {
      console.error('❌ Erreur lors de la désactivation de l\'événement:', error);
      throw error;
    }
  }

  /**
   * Supprimer un événement (admin)
   */
  async deleteEvent(id: string): Promise<boolean> {
    try {
      const response = await apiService.delete(`/api/events/${id}`);

      if (response?.success) {
        // Invalider le cache
        this.invalidateCache();
        return true;
      }

      return false;
    } catch (error) {
      console.error('❌ Erreur lors de la suppression de l\'événement:', error);
      throw error;
    }
  }

  /**
   * Initialiser les événements par défaut (admin)
   */
  async initializeDefaultEvents(): Promise<boolean> {
    try {
      const response = await apiService.post('/api/events/initialize-defaults');

      if (response?.success) {
        // Invalider le cache
        this.invalidateCache();
        return true;
      }

      return false;
    } catch (error) {
      console.error('❌ Erreur lors de l\'initialisation des événements par défaut:', error);
      throw error;
    }
  }

  /**
   * Invalider le cache
   */
  invalidateCache(): void {
    this.activeEvent = null;
    this.lastFetch = 0;
  }

  /**
   * Obtenir les thèmes d'événements predéfinis pour l'interface
   */
  getEventThemes(): EventTheme[] {
    return [
      {
        id: 'halloween',
        name: 'Halloween',
        description: 'Thème Halloween effrayant',
        colors: ['#1a0a00', '#ff4500', '#ff6b00', '#8b0000'],
        icon: 'skull',
      },
      {
        id: 'christmas',
        name: 'Noël',
        description: 'Thème de Noël festif',
        colors: ['#0d4f3c', '#c41e3a', '#ffd700', '#228b22'],
        icon: 'gift',
      },
      {
        id: 'new-year',
        name: 'Nouvel An',
        description: 'Thème du Nouvel An éclatant',
        colors: ['#000015', '#ffd700', '#ff6b6b', '#4ecdc4'],
        icon: 'star',
      },
      {
        id: 'valentine',
        name: 'Saint-Valentin',
        description: 'Thème romantique de la Saint-Valentin',
        colors: ['#2d1b29', '#ff69b4', '#ff1493', '#dc143c'],
        icon: 'heart',
      },
    ];
  }
}

export default new EventService();
