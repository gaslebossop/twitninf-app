/**
 * Override automatique de StyleSheet pour appliquer les thèmes d'événements
 */

import { StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { getEventTheme } from './eventThemes';

// Cache pour les styles override
let overrideCache: Map<string, any> = new Map();
let currentThemeId: string | null = null;

// Fonction pour créer des styles override
const createOverrideStyles = (theme: any) => {
  return {
    // Override de tous les styles de conteneur
    container: {
      backgroundColor: theme.colors.background,
    } as ViewStyle,

    safeArea: {
      backgroundColor: theme.colors.background,
    } as ViewStyle,

    // Override de tous les styles de texte
    text: {
      color: theme.colors.text,
    } as TextStyle,

    textSecondary: {
      color: theme.colors.textSecondary,
    } as TextStyle,

    title: {
      color: theme.colors.text,
      fontSize: 24,
      fontWeight: 'bold',
    } as TextStyle,

    subtitle: {
      color: theme.colors.textSecondary,
      fontSize: 18,
      fontWeight: '500',
    } as TextStyle,

    caption: {
      color: theme.colors.textSecondary,
      fontSize: 12,
    } as TextStyle,

    // Override de tous les styles de bouton
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

    buttonSecondary: {
      backgroundColor: 'transparent',
      borderColor: theme.colors.primary,
      borderWidth: 1,
      borderRadius: 8,
      paddingVertical: 12,
      paddingHorizontal: 24,
    } as ViewStyle,

    buttonSecondaryText: {
      color: theme.colors.primary,
      fontSize: 16,
      fontWeight: '600',
      textAlign: 'center',
    } as TextStyle,

    // Override de tous les styles de carte
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

    // Override de tous les styles d'en-tête
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

    // Override de tous les styles de pied de page
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

    // Override de tous les styles d'input
    input: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 12,
      color: theme.colors.text,
      fontSize: 16,
    } as TextStyle,

    inputContainer: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 12,
    } as ViewStyle,

    // Override de tous les styles d'onglet
    tab: {
      backgroundColor: 'transparent',
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
    } as ViewStyle,

    tabActive: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    } as ViewStyle,

    tabText: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: '500',
    } as TextStyle,

    tabTextActive: {
      color: theme.colors.surface,
      fontWeight: '600',
    } as TextStyle,

    // Override de tous les styles d'avatar
    avatar: {
      borderColor: theme.colors.accent,
      borderWidth: 2,
    } as ViewStyle,

    // Override de tous les styles de badge
    badge: {
      backgroundColor: theme.colors.accent,
      borderRadius: 12,
      paddingHorizontal: 8,
      paddingVertical: 4,
    } as ViewStyle,

    badgeText: {
      color: theme.colors.text,
      fontSize: 12,
      fontWeight: '600',
    } as TextStyle,

    // Override de tous les styles de modal
    modal: {
      backgroundColor: theme.colors.background,
    } as ViewStyle,

    modalContent: {
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      padding: 20,
      margin: 20,
      shadowColor: theme.colors.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 8,
    } as ViewStyle,

    // Override de tous les styles de liste
    listItem: {
      backgroundColor: theme.colors.surface,
      borderBottomColor: theme.colors.border,
      borderBottomWidth: 1,
      paddingVertical: 12,
      paddingHorizontal: 16,
    } as ViewStyle,

    // Override de tous les styles d'icône
    icon: {
      color: theme.colors.primary,
    } as TextStyle,

    // Override de tous les styles de séparateur
    separator: {
      backgroundColor: theme.colors.border,
      height: 1,
      marginVertical: 8,
    } as ViewStyle,

    // Override de tous les styles de gradient
    gradient: {
      colors: theme.gradients.primary,
    } as any,

    // Override de tous les styles d'effets spéciaux
    glow: theme.effects.glow ? {
      shadowColor: theme.colors.primary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.8,
      shadowRadius: 10,
      elevation: 8,
    } as ViewStyle : {},

    shimmer: theme.effects.shimmer ? {
      opacity: 0.8,
    } as ViewStyle : {},

    pulse: theme.effects.pulse ? {
      opacity: 0.9,
    } as ViewStyle : {},

    // Override de tous les styles de navigation
    tabBar: {
      backgroundColor: theme.colors.surface,
      borderTopColor: theme.colors.border,
      borderTopWidth: 1,
    } as ViewStyle,

    tabBarItem: {
      color: theme.colors.text,
    } as TextStyle,

    tabBarItemActive: {
      color: theme.colors.primary,
    } as TextStyle,

    // Override de tous les styles de statut
    statusBar: {
      backgroundColor: theme.colors.primary,
    } as ViewStyle,

    // Override de tous les styles de scroll
    scrollView: {
      backgroundColor: theme.colors.background,
    } as ViewStyle,

    // Override de tous les styles de flatlist
    flatList: {
      backgroundColor: theme.colors.background,
    } as ViewStyle,

    // Override de tous les styles de refresh
    refreshControl: {
      tintColor: theme.colors.primary,
    } as any,

    // Override de tous les styles de loading
    loading: {
      color: theme.colors.primary,
    } as TextStyle,

    // Override de tous les styles d'erreur
    error: {
      color: theme.colors.error,
    } as TextStyle,

    errorContainer: {
      backgroundColor: theme.colors.error,
      opacity: 0.1,
      borderRadius: 8,
      padding: 12,
      marginVertical: 8,
    } as ViewStyle,

    // Override de tous les styles de succès
    success: {
      color: theme.colors.success,
    } as TextStyle,

    successContainer: {
      backgroundColor: theme.colors.success,
      opacity: 0.1,
      borderRadius: 8,
      padding: 12,
      marginVertical: 8,
    } as ViewStyle,

    // Override de tous les styles d'avertissement
    warning: {
      color: theme.colors.warning,
    } as TextStyle,

    warningContainer: {
      backgroundColor: theme.colors.warning,
      opacity: 0.1,
      borderRadius: 8,
      padding: 12,
      marginVertical: 8,
    } as ViewStyle,
  };
};

// Fonction pour obtenir les styles override
export const getOverrideStyles = (themeId?: string) => {
  if (!themeId) return {};

  // Si le thème a changé, recréer les styles
  if (currentThemeId !== themeId || !overrideCache.has(themeId)) {
    const theme = getEventTheme(themeId);
    if (theme) {
      const overrideStyles = createOverrideStyles(theme);
      overrideCache.set(themeId, overrideStyles);
      currentThemeId = themeId;
    }
  }

  return overrideCache.get(themeId) || {};
};

// Fonction pour override un style existant
export const overrideStyle = (originalStyle: any, themeId?: string, componentType?: string) => {
  if (!themeId) return originalStyle;

  const overrideStyles = getOverrideStyles(themeId);
  if (!overrideStyles) return originalStyle;

  // Obtenir le style override pour ce type de composant
  let overrideStyle = {};
  if (componentType && overrideStyles[componentType]) {
    overrideStyle = overrideStyles[componentType];
  }

  // Fusionner avec le style original
  if (Array.isArray(originalStyle)) {
    return [...originalStyle, overrideStyle];
  } else if (typeof originalStyle === 'object') {
    return { ...originalStyle, ...overrideStyle };
  } else {
    return [originalStyle, overrideStyle];
  }
};

// Fonction pour créer des styles avec thème
export const createThemedStyle = (baseStyle: any, themeId?: string, componentType?: string) => {
  if (!themeId) return baseStyle;
  return overrideStyle(baseStyle, themeId, componentType);
};

// Fonction pour obtenir une couleur spécifique
export const getThemeColor = (themeId: string, colorKey: string) => {
  const theme = getEventTheme(themeId);
  if (!theme) return '#000000';
  return theme.colors[colorKey as keyof typeof theme.colors] || '#000000';
};

// Fonction pour obtenir un dégradé
export const getThemeGradient = (themeId: string, gradientKey: string) => {
  const theme = getEventTheme(themeId);
  if (!theme) return ['#000000', '#ffffff'];
  return theme.gradients[gradientKey as keyof typeof theme.gradients] || ['#000000', '#ffffff'];
};

// Fonction pour vérifier si un effet est actif
export const hasThemeEffect = (themeId: string, effectKey: string) => {
  const theme = getEventTheme(themeId);
  if (!theme) return false;
  return theme.effects[effectKey as keyof typeof theme.effects] || false;
};

// Fonction pour obtenir une animation
export const getThemeAnimation = (themeId: string, animationKey: string) => {
  const theme = getEventTheme(themeId);
  if (!theme) return 'none';
  return theme.animations[animationKey as keyof typeof theme.animations] || 'none';
};

export default {
  getOverrideStyles,
  overrideStyle,
  createThemedStyle,
  getThemeColor,
  getThemeGradient,
  hasThemeEffect,
  getThemeAnimation,
};
