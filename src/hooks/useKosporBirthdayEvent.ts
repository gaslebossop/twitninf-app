/**
 * Hook spécialisé pour l'événement Kospor Birthday
 * Vérifie si l'événement est actif et gère l'affichage de la page et de l'onglet
 */

import { useState, useEffect } from 'react';
import { useFunctionalEvents } from '../contexts/FunctionalEventContext';

export function useKosporBirthdayEvent() {
  const { getActiveEventsForPage, isFeatureActive } = useFunctionalEvents();
  
  const [isEventActive, setIsEventActive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [events, setEvents] = useState<any[]>([]);

  const checkKosporEvent = async () => {
    try {
      setIsLoading(true);
      
      // Vérifier si l'événement Kospor Birthday est actif
      const isActive = await isFeatureActive('kosporbirthday', 'kosporbirthday');
      setIsEventActive(isActive);
      
      // Récupérer les événements actifs pour la page
      const activeEvents = await getActiveEventsForPage('kosporbirthday');
      setEvents(activeEvents);
      
    } catch (error) {
      console.error('Erreur lors de la vérification de l\'événement Kospor Birthday:', error);
      setIsEventActive(false);
      setEvents([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkKosporEvent();
    
    // Vérifier périodiquement si l'événement est toujours actif
    const interval = setInterval(checkKosporEvent, 30000); // Toutes les 30 secondes
    
    return () => clearInterval(interval);
  }, []);

  return {
    isEventActive,
    isLoading,
    events,
    refreshEvent: checkKosporEvent,
  };
}
