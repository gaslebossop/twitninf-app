/**
 * Hook pour gérer les thèmes d'événements
 * Intègre les thèmes d'événements avec le système de thèmes existant
 */

import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEvents } from '../contexts/EventContext';
import type { EventThemeConfig as EventDefinition } from '../themes/eventThemes';

interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  border: string;
}

interface EventThemeConfig {
  isEventTheme: boolean;
  eventName: string | null;
  colors: ThemeColors;
  originalTheme: string | null;
}

const useEventTheme = () => {
  const { eventTheme, activeEvent, hasActiveEvent } = useEvents();
  const [currentTheme, setCurrentTheme] = useState<string>('default');
  const [eventThemeConfig, setEventThemeConfig] = useState<EventThemeConfig | null>(null);
  const [originalUserTheme, setOriginalUserTheme] = useState<string | null>(null);

  /**
   * Convertir un thème d'événement en configuration de couleurs
   */
  const convertEventThemeToColors = (theme: EventDefinition): ThemeColors => {
    const colors = theme.colors || [];
    
    // Définir des couleurs par défaut basées sur le slug du thème
    switch (theme.id) {
      case 'halloween':
        return {
          primary: colors[1] || '#ff4500',
          secondary: colors[2] || '#ff6b00',
          accent: colors[3] || '#8b0000',
          background: colors[0] || '#1a0a00',
          surface: '#2a1a10',
          text: '#ffffff',
          textSecondary: '#ffcc99',
          border: colors[1] || '#ff4500',
        };

      case 'christmas':
        return {
          primary: colors[1] || '#c41e3a',
          secondary: colors[2] || '#ffd700',
          accent: colors[3] || '#228b22',
          background: colors[0] || '#0d4f3c',
          surface: '#1a5a4a',
          text: '#ffffff',
          textSecondary: '#f0f8ff',
          border: colors[2] || '#ffd700',
        };

      case 'new-year':
        return {
          primary: colors[1] || '#ffd700',
          secondary: colors[2] || '#ff6b6b',
          accent: colors[3] || '#4ecdc4',
          background: colors[0] || '#000015',
          surface: '#15171C',
          text: '#ffffff',
          textSecondary: '#f0f0f0',
          border: colors[1] || '#ffd700',
        };

      case 'valentine':
        return {
          primary: colors[1] || '#ff69b4',
          secondary: colors[2] || '#ff1493',
          accent: colors[3] || '#dc143c',
          background: colors[0] || '#2d1b29',
          surface: '#3d2b39',
          text: '#ffffff',
          textSecondary: '#ffb3d6',
          border: colors[1] || '#ff69b4',
        };

      default:
        return {
          primary: colors[0] || '#4F7CFF',
          secondary: colors[1] || '#3D63D9',
          accent: colors[2] || '#3354C4',
          background: colors[3] || '#0B0C0F',
          surface: '#15171C',
          text: '#ffffff',
          textSecondary: '#cbd5e0',
          border: colors[0] || '#4F7CFF',
        };
    }
  };

  /**
   * Sauvegarder le thème utilisateur original
   */
  const saveOriginalTheme = async (theme: string) => {
    try {
      await AsyncStorage.setItem('originalUserTheme', theme);
      setOriginalUserTheme(theme);
    } catch (error) {
      console.error('❌ Erreur lors de la sauvegarde du thème original:', error);
    }
  };

  /**
   * Récupérer le thème utilisateur original
   */
  const getOriginalTheme = async (): Promise<string> => {
    try {
      const stored = await AsyncStorage.getItem('originalUserTheme');
      return stored || 'default';
    } catch (error) {
      console.error('❌ Erreur lors de la récupération du thème original:', error);
      return 'default';
    }
  };

  /**
   * Appliquer un thème d'événement
   */
  const applyEventTheme = async (theme: EventDefinition) => {
    try {
      // Sauvegarder le thème actuel de l'utilisateur s'il n'est pas déjà sauvé
      if (!originalUserTheme) {
        const current = await AsyncStorage.getItem('selectedTheme') || 'default';
        await saveOriginalTheme(current);
      }

      // Convertir le thème d'événement en configuration
      const colors = convertEventThemeToColors(theme);
      const config: EventThemeConfig = {
        isEventTheme: true,
        eventName: theme.name,
        colors,
        originalTheme: originalUserTheme,
      };

      setEventThemeConfig(config);
      setCurrentTheme(`event_${theme.id}`);

      // Sauvegarder dans AsyncStorage pour la persistance
      await AsyncStorage.setItem('eventThemeConfig', JSON.stringify(config));
      await AsyncStorage.setItem('selectedTheme', `event_${theme.id}`);

      console.log('🎨 Thème d\'événement appliqué:', theme.name);
    } catch (error) {
      console.error('❌ Erreur lors de l\'application du thème d\'événement:', error);
    }
  };

  /**
   * Restaurer le thème utilisateur original
   */
  const restoreOriginalTheme = async () => {
    try {
      const original = await getOriginalTheme();
      
      setEventThemeConfig(null);
      setCurrentTheme(original);

      // Nettoyer AsyncStorage
      await AsyncStorage.removeItem('eventThemeConfig');
      await AsyncStorage.setItem('selectedTheme', original);
      await AsyncStorage.removeItem('originalUserTheme');
      
      setOriginalUserTheme(null);

      console.log('🎨 Thème utilisateur restauré:', original);
    } catch (error) {
      console.error('❌ Erreur lors de la restauration du thème:', error);
    }
  };

  /**
   * Charger la configuration de thème d'événement sauvegardée
   */
  const loadEventThemeConfig = async () => {
    try {
      const configString = await AsyncStorage.getItem('eventThemeConfig');
      if (configString) {
        const config: EventThemeConfig = JSON.parse(configString);
        setEventThemeConfig(config);
      }

      const original = await AsyncStorage.getItem('originalUserTheme');
      if (original) {
        setOriginalUserTheme(original);
      }

      const selectedTheme = await AsyncStorage.getItem('selectedTheme') || 'default';
      setCurrentTheme(selectedTheme);
    } catch (error) {
      console.error('❌ Erreur lors du chargement de la configuration de thème:', error);
    }
  };

  /**
   * Obtenir les couleurs actuelles (événement ou thème normal)
   */
  const getCurrentColors = (): ThemeColors => {
    if (eventThemeConfig && eventThemeConfig.isEventTheme) {
      return eventThemeConfig.colors;
    }

    // Retourner les couleurs du thème par défaut si pas d'événement
    return {
      primary: '#4F7CFF',
      secondary: '#3D63D9',
      accent: '#3354C4',
      background: '#0B0C0F',
      surface: '#15171C',
      text: '#ffffff',
      textSecondary: '#cbd5e0',
      border: '#4F7CFF',
    };
  };

  /**
   * Vérifier si un thème d'événement est actuellement appliqué
   */
  const isEventThemeActive = (): boolean => {
    return eventThemeConfig?.isEventTheme || false;
  };

  // Effet pour gérer automatiquement les thèmes d'événements
  useEffect(() => {
    const handleEventTheme = async () => {
      if (hasActiveEvent && eventTheme) {
        // Appliquer automatiquement le thème d'événement
        await applyEventTheme(eventTheme);
      } else if (!hasActiveEvent && isEventThemeActive()) {
        // Restaurer le thème original quand l'événement se termine
        await restoreOriginalTheme();
      }
    };

    handleEventTheme();
  }, [hasActiveEvent, eventTheme]);

  // Charger la configuration au démarrage
  useEffect(() => {
    loadEventThemeConfig();
  }, []);

  return {
    currentTheme,
    eventThemeConfig,
    isEventThemeActive: isEventThemeActive(),
    getCurrentColors,
    applyEventTheme,
    restoreOriginalTheme,
    originalUserTheme,
    activeEventName: activeEvent?.name || null,
  };
};

export default useEventTheme;
