import { Dimensions, PixelRatio, Platform } from 'react-native';

// Dimensions de base (iPhone 11 comme référence)
const BASE_WIDTH = 414;
const BASE_HEIGHT = 896;

// Obtenir les dimensions de l'écran
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * Normalise la largeur en fonction de la taille de l'écran
 * @param size - Taille de base
 * @returns Taille normalisée
 */
export const wp = (size: number): number => {
  return (SCREEN_WIDTH / BASE_WIDTH) * size;
};

/**
 * Normalise la hauteur en fonction de la taille de l'écran
 * @param size - Taille de base
 * @returns Taille normalisée
 */
export const hp = (size: number): number => {
  return (SCREEN_HEIGHT / BASE_HEIGHT) * size;
};

/**
 * Normalise la taille de police
 * @param size - Taille de police de base
 * @returns Taille de police normalisée
 */
export const normalize = (size: number): number => {
  const scale = SCREEN_WIDTH / BASE_WIDTH;
  const newSize = size * scale;
  
  if (Platform.OS === 'ios') {
    return Math.round(PixelRatio.roundToNearestPixel(newSize));
  } else {
    return Math.round(PixelRatio.roundToNearestPixel(newSize)) - 2;
  }
};

/**
 * Détecte le type d'appareil
 */
export const deviceSize = (): 'small' | 'medium' | 'large' => {
  if (SCREEN_WIDTH < 375) {
    return 'small'; // Petits téléphones
  } else if (SCREEN_WIDTH < 414) {
    return 'medium'; // Téléphones moyens
  } else {
    return 'large'; // Grands téléphones et tablettes
  }
};

/**
 * Vérifie si c'est un petit appareil
 */
export const isSmallDevice = (): boolean => {
  return SCREEN_WIDTH < 375;
};

/**
 * Vérifie si c'est une tablette
 */
export const isTablet = (): boolean => {
  return SCREEN_WIDTH >= 768;
};

/**
 * Espacement responsive
 */
export const spacing = {
  xs: wp(4),
  sm: wp(8),
  md: wp(12),
  lg: wp(16),
  xl: wp(20),
  xxl: wp(24),
  xxxl: wp(32),
};

/**
 * Tailles de police responsive
 */
export const fontSize = {
  xs: normalize(10),
  sm: normalize(12),
  base: normalize(14),
  md: normalize(16),
  lg: normalize(18),
  xl: normalize(20),
  xxl: normalize(24),
  xxxl: normalize(32),
  giant: normalize(40),
};

/**
 * Border radius responsive
 */
export const borderRadius = {
  xs: wp(2),
  sm: wp(4),
  md: wp(8),
  lg: wp(12),
  xl: wp(16),
  xxl: wp(20),
  round: wp(50),
};

/**
 * Icon sizes responsive
 */
export const iconSize = {
  xs: wp(12),
  sm: wp(16),
  md: wp(20),
  lg: wp(24),
  xl: wp(28),
  xxl: wp(32),
};

/**
 * Dimensions de l'écran
 */
export const screenDimensions = {
  width: SCREEN_WIDTH,
  height: SCREEN_HEIGHT,
};

/**
 * Retourne un objet avec les dimensions de l'écran qui se met à jour
 */
export const useScreenDimensions = () => {
  const window = Dimensions.get('window');
  const screen = Dimensions.get('screen');
  
  return {
    window: {
      width: window.width,
      height: window.height,
    },
    screen: {
      width: screen.width,
      height: screen.height,
    },
    isSmall: window.width < 375,
    isMedium: window.width >= 375 && window.width < 414,
    isLarge: window.width >= 414,
    isTablet: window.width >= 768,
  };
};

/**
 * Mixin pour les ombres responsive
 */
export const shadow = (elevation: number = 4) => {
  if (Platform.OS === 'ios') {
    return {
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: elevation / 2,
      },
      shadowOpacity: 0.25,
      shadowRadius: elevation,
    };
  } else {
    return {
      elevation: elevation,
    };
  }
};

export default {
  wp,
  hp,
  normalize,
  deviceSize,
  isSmallDevice,
  isTablet,
  spacing,
  fontSize,
  borderRadius,
  iconSize,
  screenDimensions,
  shadow,
};


