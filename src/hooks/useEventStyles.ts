/**
 * Hook pour appliquer les styles d'événement aux composants
 */

import { useMemo } from 'react';
import { StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { useEventTheme } from '../components/EventThemeProvider';
import { EventThemeConfig } from '../themes/eventThemes';

export const useEventStyles = () => {
  const { currentTheme, isEventActive } = useEventTheme();

  const styles = useMemo(() => {
    if (!currentTheme || !isEventActive) {
      return {
        // Styles par défaut
        container: {},
        text: {},
        button: {},
        card: {},
        header: {},
        footer: {},
      };
    }

    const theme = currentTheme;
    
    // Vérification de la structure du thème
    if (!theme || !theme.colors || !theme.gradients || !theme.effects) {
      console.warn('⚠️ useEventStyles: Theme structure is incomplete', theme);
      return {
        container: {},
        text: {},
        button: {},
        card: {},
        header: {},
        footer: {},
      };
    }

    return {
      // Styles de conteneur
      container: {
        backgroundColor: theme.colors.background,
      } as ViewStyle,

      // Styles de texte
      text: {
        color: theme.colors.text,
      } as TextStyle,

      textSecondary: {
        color: theme.colors.textSecondary,
      } as TextStyle,

      // Styles de bouton
      button: {
        backgroundColor: theme.colors.primary,
        borderRadius: 8,
        paddingVertical: 12,
        paddingHorizontal: 24,
        shadowColor: theme.colors.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 3,
      } as ViewStyle,

      buttonText: {
        color: theme.colors.surface,
        fontSize: 16,
        fontWeight: '600',
        textAlign: 'center',
      } as TextStyle,

      // Styles de carte
      card: {
        backgroundColor: theme.colors.surface,
        borderRadius: 12,
        padding: 16,
        marginVertical: 8,
        shadowColor: theme.colors.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 2,
        borderWidth: 1,
        borderColor: theme.colors.border,
      } as ViewStyle,

      // Styles d'en-tête
      header: {
        backgroundColor: theme.colors.primary,
        paddingVertical: 16,
        paddingHorizontal: 20,
        shadowColor: theme.colors.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 4,
      } as ViewStyle,

      headerText: {
        color: theme.colors.surface,
        fontSize: 20,
        fontWeight: 'bold',
        textAlign: 'center',
      } as TextStyle,

      // Styles de pied de page
      footer: {
        backgroundColor: theme.colors.secondary,
        paddingVertical: 12,
        paddingHorizontal: 20,
      } as ViewStyle,

      footerText: {
        color: theme.colors.surface,
        fontSize: 14,
        textAlign: 'center',
      } as TextStyle,

      // Styles spéciaux pour les événements
      eventBanner: {
        backgroundColor: theme.colors.accent,
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        marginVertical: 4,
        shadowColor: theme.colors.shadow,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.3,
        shadowRadius: 2,
        elevation: 2,
      } as ViewStyle,

      eventBannerText: {
        color: theme.colors.text,
        fontSize: 14,
        fontWeight: '600',
        textAlign: 'center',
      } as TextStyle,

      // Styles d'icône d'événement
      eventIcon: {
        fontSize: 24,
        color: theme.colors.primary,
        marginRight: 8,
      } as TextStyle,

      // Styles de dégradé (simulés avec des couleurs)
      gradientPrimary: {
        backgroundColor: theme.colors.primary,
      } as ViewStyle,

      gradientSecondary: {
        backgroundColor: theme.colors.secondary,
      } as ViewStyle,

      // Styles d'effets spéciaux
      glow: theme.effects.glow ? {
        shadowColor: theme.colors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 10,
        elevation: 8,
      } as ViewStyle : {},

      shimmer: theme.effects.shimmer ? {
        // Le shimmer sera géré par des animations
        opacity: 0.8,
      } as ViewStyle : {},

      pulse: theme.effects.pulse ? {
        // Le pulse sera géré par des animations
        opacity: 0.9,
      } as ViewStyle : {},
    };
  }, [currentTheme, isEventActive]);

  // Fonction pour obtenir une couleur spécifique
  const getColor = (colorKey: keyof EventThemeConfig['colors']) => {
    if (!currentTheme || !isEventActive || !currentTheme.colors) return '#000000';
    return currentTheme.colors[colorKey] || '#000000';
  };

  // Fonction pour obtenir un dégradé
  const getGradient = (gradientKey: keyof EventThemeConfig['gradients']) => {
    if (!currentTheme || !isEventActive || !currentTheme.gradients) return ['#000000', '#ffffff'];
    return currentTheme.gradients[gradientKey] || ['#000000', '#ffffff'];
  };

  // Fonction pour vérifier si un effet est actif
  const hasEffect = (effectKey: keyof EventThemeConfig['effects']) => {
    if (!currentTheme || !isEventActive || !currentTheme.effects) return false;
    return currentTheme.effects[effectKey] || false;
  };

  // Fonction pour obtenir une animation
  const getAnimation = (animationKey: keyof EventThemeConfig['animations']) => {
    if (!currentTheme || !isEventActive || !currentTheme.animations) return 'none';
    return currentTheme.animations[animationKey] || 'none';
  };

  return {
    styles,
    theme: currentTheme,
    isEventActive,
    getColor,
    getGradient,
    hasEffect,
    getAnimation,
  };
};
