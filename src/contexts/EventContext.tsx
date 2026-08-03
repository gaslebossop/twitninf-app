/**
 * Contexte pour la gestion des événements dans l'application
 * Permet de gérer l'état global des événements et des thèmes
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import eventService, { Event, EventConfig, EventTheme } from '../services/eventService';
import { getEventTheme } from '../themes/eventThemes';

interface EventContextType {
  // État des événements
  activeEvent: Event | null;
  eventTheme: EventTheme | null;
  eventConfig: EventConfig | null;
  isLoading: boolean;
  hasActiveEvent: boolean;

  // Actions
  refreshActiveEvent: () => Promise<void>;
  checkForEvents: () => Promise<void>;
  applyEventTheme: (theme: EventTheme | null) => void;
  
  // Pour les admins
  activateEvent: (id: string, deactivateOthers?: boolean) => Promise<boolean>;
  deactivateEvent: (id: string) => Promise<boolean>;
  createEvent: (eventData: Partial<Event>) => Promise<Event | null>;
  updateEvent: (id: string, updateData: Partial<Event>) => Promise<Event | null>;
  deleteEvent: (id: string) => Promise<boolean>;
}

const EventContext = createContext<EventContextType | undefined>(undefined);

interface EventProviderProps {
  children: ReactNode;
}

export const EventProvider: React.FC<EventProviderProps> = ({ children }) => {
  const [activeEvent, setActiveEvent] = useState<Event | null>(null);
  const [eventTheme, setEventTheme] = useState<EventTheme | null>(null);
  const [eventConfig, setEventConfig] = useState<EventConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasActiveEvent, setHasActiveEvent] = useState(false);

  /**
   * Rafraîchir l'événement actif
   */
  const refreshActiveEvent = async (forceRefresh = false): Promise<void> => {
    try {
      setIsLoading(true);
      
      // Récupérer l'événement actif
      const event = await eventService.getActiveEvent(forceRefresh);
      console.log('🔍 EventContext - Événement récupéré:', event ? {
        id: event.id,
        name: event.name,
        theme_id: event.theme_id,
        is_active: event.is_active
      } : null);
      
      setActiveEvent(event);
      setHasActiveEvent(event !== null);

      // Récupérer le thème basé sur le theme_id
      if (event && event.theme_id) {
        const theme = getEventTheme(event.theme_id);
        setEventTheme(theme);
        setEventConfig(null); // Plus besoin de l'ancien système
        
        console.log('🎉 Événement actif détecté:', {
          name: event.name,
          theme_id: event.theme_id,
          theme: theme ? theme.name : 'Aucun thème trouvé'
        });
      } else {
        setEventConfig(null);
        setEventTheme(null);
        console.log('🎉 Aucun événement actif ou pas de theme_id');
      }
    } catch (error) {
      console.error('❌ Erreur lors du rafraîchissement de l\'événement:', error);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Vérifier s'il y a des événements (utilisé périodiquement)
   */
  const checkForEvents = async (): Promise<void> => {
    try {
      // Vérifier sans charger
      const hasEvent = await eventService.hasActiveEvent();
      
      // Si l'état a changé, rafraîchir complètement
      if (hasEvent !== hasActiveEvent) {
        await refreshActiveEvent(true);
      }
    } catch (error) {
      console.error('❌ Erreur lors de la vérification d\'événements:', error);
    }
  };

  /**
   * Appliquer manuellement un thème d'événement
   */
  const applyEventTheme = (theme: EventTheme | null): void => {
    setEventTheme(theme);
  };

  /**
   * Activer un événement (admin)
   */
  const activateEvent = async (id: string, deactivateOthers = true): Promise<boolean> => {
    try {
      const success = await eventService.activateEvent(id, deactivateOthers);
      
      if (success) {
        // Rafraîchir l'événement actif
        await refreshActiveEvent(true);
      }
      
      return success;
    } catch (error) {
      console.error('❌ Erreur lors de l\'activation de l\'événement:', error);
      return false;
    }
  };

  /**
   * Désactiver un événement (admin)
   */
  const deactivateEvent = async (id: string): Promise<boolean> => {
    try {
      const success = await eventService.deactivateEvent(id);
      
      if (success) {
        // Rafraîchir l'événement actif
        await refreshActiveEvent(true);
      }
      
      return success;
    } catch (error) {
      console.error('❌ Erreur lors de la désactivation de l\'événement:', error);
      return false;
    }
  };

  /**
   * Créer un événement (admin)
   */
  const createEvent = async (eventData: Partial<Event>): Promise<Event | null> => {
    try {
      const event = await eventService.createEvent(eventData);
      
      if (event) {
        // Rafraîchir si c'est un événement actif
        if (event.is_active) {
          await refreshActiveEvent(true);
        }
      }
      
      return event;
    } catch (error) {
      console.error('❌ Erreur lors de la création de l\'événement:', error);
      throw error;
    }
  };

  /**
   * Modifier un événement (admin)
   */
  const updateEvent = async (id: string, updateData: Partial<Event>): Promise<Event | null> => {
    try {
      const event = await eventService.updateEvent(id, updateData);
      
      if (event) {
        // Rafraîchir si c'est l'événement actif ou s'il devient actif
        if (event.is_active || (activeEvent && activeEvent.id === id)) {
          await refreshActiveEvent(true);
        }
      }
      
      return event;
    } catch (error) {
      console.error('❌ Erreur lors de la mise à jour de l\'événement:', error);
      throw error;
    }
  };

  /**
   * Supprimer un événement (admin)
   */
  const deleteEvent = async (id: string): Promise<boolean> => {
    try {
      const success = await eventService.deleteEvent(id);
      
      if (success) {
        // Rafraîchir si c'était l'événement actif
        if (activeEvent && activeEvent.id === id) {
          await refreshActiveEvent(true);
        }
      }
      
      return success;
    } catch (error) {
      console.error('❌ Erreur lors de la suppression de l\'événement:', error);
      return false;
    }
  };

  // Charger l'événement actif au démarrage
  useEffect(() => {
    refreshActiveEvent();
  }, []);

  // Vérifier périodiquement s'il y a de nouveaux événements
  useEffect(() => {
    const interval = setInterval(checkForEvents, 5 * 60 * 1000); // 5 minutes
    return () => clearInterval(interval);
  }, [hasActiveEvent]);

  // Mémoïsé : ce contexte est monté à la racine de l'application. Recréer
  // l'objet à chaque rendu forçait un nouveau rendu de tout l'arbre — y compris
  // le fil — à chaque tick du minuteur de 5 minutes.
  const value: EventContextType = React.useMemo(
    () => ({
      activeEvent,
      eventTheme,
      eventConfig,
      isLoading,
      hasActiveEvent,
      refreshActiveEvent,
      checkForEvents,
      applyEventTheme,
      activateEvent,
      deactivateEvent,
      createEvent,
      updateEvent,
      deleteEvent,
    }),
    [activeEvent, eventTheme, eventConfig, isLoading, hasActiveEvent]
  );

  return (
    <EventContext.Provider value={value}>
      {children}
    </EventContext.Provider>
  );
};

// Hook pour utiliser le contexte d'événements
export const useEvents = (): EventContextType => {
  const context = useContext(EventContext);
  if (context === undefined) {
    throw new Error('useEvents doit être utilisé dans un EventProvider');
  }
  return context;
};

export default EventContext;
