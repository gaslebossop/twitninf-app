/**
 * Hook pour utiliser les fonctionnalités des événements fonctionnels
 */

import { useState, useEffect } from 'react';
import { useFunctionalEvents } from '../contexts/FunctionalEventContext';

interface UseFunctionalEventFeaturesOptions {
  pageName: string;
  refreshInterval?: number;
}

export function useFunctionalEventFeatures({ 
  pageName, 
  refreshInterval = 30000 
}: UseFunctionalEventFeaturesOptions) {
  const { getActiveEventsForPage, getActiveFeaturesForPage, isFeatureActive, getFeatureValue } = useFunctionalEvents();
  
  const [events, setEvents] = useState<any[]>([]);
  const [features, setFeatures] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(true);

  const refreshFeatures = async () => {
    try {
      setIsLoading(true);
      const [activeEvents, activeFeatures] = await Promise.all([
        getActiveEventsForPage(pageName),
        getActiveFeaturesForPage(pageName),
      ]);
      
      setEvents(activeEvents);
      setFeatures(activeFeatures);
    } catch (error) {
      console.error(`Erreur lors du rafraîchissement des fonctionnalités pour ${pageName}:`, error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshFeatures();

    if (refreshInterval > 0) {
      const interval = setInterval(refreshFeatures, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [pageName, refreshInterval]);

  const checkFeature = async (featureName: string): Promise<boolean> => {
    try {
      return await isFeatureActive(featureName, pageName);
    } catch (error) {
      console.error(`Erreur lors de la vérification de la fonctionnalité ${featureName}:`, error);
      return false;
    }
  };

  const getFeature = async (featureName: string, defaultValue?: any): Promise<any> => {
    try {
      return await getFeatureValue(featureName, pageName, defaultValue);
    } catch (error) {
      console.error(`Erreur lors de la récupération de la fonctionnalité ${featureName}:`, error);
      return defaultValue;
    }
  };

  return {
    events,
    features,
    isLoading,
    refreshFeatures,
    checkFeature,
    getFeature,
    hasActiveEvents: events.length > 0,
  };
}

/**
 * Hook pour vérifier une fonctionnalité spécifique
 */
export function useFeatureCheck(featureName: string, pageName: string) {
  const { isFeatureActive } = useFunctionalEvents();
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkFeature = async () => {
      try {
        setIsLoading(true);
        const active = await isFeatureActive(featureName, pageName);
        setIsActive(active);
      } catch (error) {
        console.error(`Erreur lors de la vérification de ${featureName}:`, error);
        setIsActive(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkFeature();
  }, [featureName, pageName, isFeatureActive]);

  return { isActive, isLoading };
}

/**
 * Hook pour obtenir la valeur d'une fonctionnalité
 */
export function useFeatureValue(featureName: string, pageName: string, defaultValue?: any) {
  const { getFeatureValue } = useFunctionalEvents();
  const [value, setValue] = useState(defaultValue);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const getValue = async () => {
      try {
        setIsLoading(true);
        const featureValue = await getFeatureValue(featureName, pageName, defaultValue);
        setValue(featureValue);
      } catch (error) {
        console.error(`Erreur lors de la récupération de ${featureName}:`, error);
        setValue(defaultValue);
      } finally {
        setIsLoading(false);
      }
    };

    getValue();
  }, [featureName, pageName, defaultValue, getFeatureValue]);

  return { value, isLoading };
}
