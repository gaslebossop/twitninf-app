/**
 * Contexte pour la gestion des événements fonctionnels
 * Gère l'état global des événements fonctionnels
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { functionalEventService } from '../services/functionalEventService';
import { FunctionalEvent, FunctionalEventFeatures, FunctionalEventContextType } from '../types/functionalEvent';

const FunctionalEventContext = createContext<FunctionalEventContextType | undefined>(undefined);

interface FunctionalEventProviderProps {
  children: ReactNode;
}

export function FunctionalEventProvider({ children }: FunctionalEventProviderProps) {
  const [activeEvents, setActiveEvents] = useState<FunctionalEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasActiveEvents, setHasActiveEvents] = useState(false);

  /**
   * Rafraîchir les événements actifs
   */
  const refreshActiveEvents = async () => {
    try {
      setIsLoading(true);
      const events = await functionalEventService.getActiveEvents();
      setActiveEvents(events);
      setHasActiveEvents(events.length > 0);
    } catch (error) {
      console.error('Erreur lors du rafraîchissement des événements:', error);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Obtenir les événements actifs pour une page
   */
  const getActiveEventsForPage = async (pageName: string): Promise<FunctionalEvent[]> => {
    try {
      return await functionalEventService.getActiveEventsForPage(pageName);
    } catch (error) {
      console.error(`Erreur lors de la récupération des événements pour ${pageName}:`, error);
      return [];
    }
  };

  /**
   * Obtenir les fonctionnalités actives pour une page
   */
  const getActiveFeaturesForPage = async (pageName: string): Promise<FunctionalEventFeatures> => {
    try {
      return await functionalEventService.getActiveFeaturesForPage(pageName);
    } catch (error) {
      console.error(`Erreur lors de la récupération des fonctionnalités pour ${pageName}:`, error);
      return {};
    }
  };

  /**
   * Vérifier si une fonctionnalité est active
   */
  const isFeatureActive = async (featureName: string, pageName: string): Promise<boolean> => {
    try {
      return await functionalEventService.isFeatureActive(featureName, pageName);
    } catch (error) {
      console.error(`Erreur lors de la vérification de la fonctionnalité ${featureName}:`, error);
      return false;
    }
  };

  /**
   * Obtenir la valeur d'une fonctionnalité
   */
  const getFeatureValue = async (featureName: string, pageName: string, defaultValue?: any): Promise<any> => {
    try {
      return await functionalEventService.getFeatureValue(featureName, pageName, defaultValue);
    } catch (error) {
      console.error(`Erreur lors de la récupération de la valeur ${featureName}:`, error);
      return defaultValue;
    }
  };

  /**
   * Activer un événement
   */
  const activateEvent = async (id: string, deactivateOthers: boolean = true): Promise<boolean> => {
    try {
      const success = await functionalEventService.activateEvent(id, deactivateOthers);
      if (success) {
        await refreshActiveEvents();
      }
      return success;
    } catch (error) {
      console.error('Erreur lors de l\'activation de l\'événement:', error);
      return false;
    }
  };

  /**
   * Désactiver un événement
   */
  const deactivateEvent = async (id: string): Promise<boolean> => {
    try {
      const success = await functionalEventService.deactivateEvent(id);
      if (success) {
        await refreshActiveEvents();
      }
      return success;
    } catch (error) {
      console.error('Erreur lors de la désactivation de l\'événement:', error);
      return false;
    }
  };

  /**
   * Créer un nouvel événement
   */
  const createEvent = async (eventData: Partial<FunctionalEvent>): Promise<FunctionalEvent | null> => {
    try {
      const event = await functionalEventService.createEvent(eventData);
      if (event) {
        await refreshActiveEvents();
      }
      return event;
    } catch (error) {
      console.error('Erreur lors de la création de l\'événement:', error);
      return null;
    }
  };

  /**
   * Mettre à jour un événement
   */
  const updateEvent = async (id: string, updateData: Partial<FunctionalEvent>): Promise<FunctionalEvent | null> => {
    try {
      const event = await functionalEventService.updateEvent(id, updateData);
      if (event) {
        await refreshActiveEvents();
      }
      return event;
    } catch (error) {
      console.error('Erreur lors de la mise à jour de l\'événement:', error);
      return null;
    }
  };

  /**
   * Supprimer un événement
   */
  const deleteEvent = async (id: string): Promise<boolean> => {
    try {
      const success = await functionalEventService.deleteEvent(id);
      if (success) {
        await refreshActiveEvents();
      }
      return success;
    } catch (error) {
      console.error('Erreur lors de la suppression de l\'événement:', error);
      return false;
    }
  };

  /**
   * Obtenir tous les événements
   */
  const getAllEvents = async (): Promise<FunctionalEvent[]> => {
    try {
      return await functionalEventService.getAllEvents();
    } catch (error) {
      console.error('Erreur lors de la récupération de tous les événements:', error);
      return [];
    }
  };

  /**
   * Initialiser les événements par défaut
   */
  const initializeDefaultEvents = async (): Promise<FunctionalEvent[]> => {
    try {
      const events = await functionalEventService.initializeDefaultEvents();
      await refreshActiveEvents();
      return events;
    } catch (error) {
      console.error('Erreur lors de l\'initialisation des événements par défaut:', error);
      throw error;
    }
  };

  // Charger les événements au montage du composant
  useEffect(() => {
    refreshActiveEvents();
  }, []);

  // Mémoïsé : contexte racine, voir la même remarque dans EventContext.
  const value: FunctionalEventContextType = React.useMemo(
    () => ({
      activeEvents,
      isLoading,
      hasActiveEvents,
      refreshActiveEvents,
      getActiveEventsForPage,
      getActiveFeaturesForPage,
      isFeatureActive,
      getFeatureValue,
      activateEvent,
      deactivateEvent,
      createEvent,
      updateEvent,
      deleteEvent,
      getAllEvents,
      initializeDefaultEvents,
    }),
    [activeEvents, isLoading, hasActiveEvents]
  );

  return (
    <FunctionalEventContext.Provider value={value}>
      {children}
    </FunctionalEventContext.Provider>
  );
}

export function useFunctionalEvents(): FunctionalEventContextType {
  const context = useContext(FunctionalEventContext);
  if (context === undefined) {
    throw new Error('useFunctionalEvents must be used within a FunctionalEventProvider');
  }
  return context;
}
