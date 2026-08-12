import { colors } from '../theme';
/**
 * Configuration pour l'interface de trading TwitCoins
 */

// ID de la cryptomonnaie par défaut (TWC)
export const DEFAULT_CURRENCY_ID = '6371769b-57d1-4afd-abad-4001b20df5cc'; // ID NINFI en DB

// Configuration des graphiques
export const CHART_CONFIG = {
  // Couleurs du thème
  colors: {
    background: ['#0B0C0F', '#15171C'],
    cardBackground: ['#15171C', '#1B1E25'],
    primary: '#4F7CFF',
    success: '#10B981',
    danger: '#EF4444',
    warning: '#F59E0B',
    info: '#06B6D4',
    purple: '#8B5CF6',
    text: {
      primary: '#ffffff',
      secondary: colors.textSecondary,
      muted: colors.textMuted
    }
  },
  
  // Configuration des graphiques
  chart: {
    width: 320,
    height: 220,
    backgroundColor: 'transparent',
    backgroundGradientFrom: '#15171C',
    backgroundGradientTo: '#1B1E25',
    color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity * 0.7})`,
    strokeWidth: 3,
    propsForDots: {
      r: "3",
      strokeWidth: "2"
    },
    propsForBackgroundLines: {
      strokeDasharray: "3,3",
      stroke: "rgba(255,255,255,0.1)"
    }
  }
};

// Configuration des indicateurs techniques
export const TECHNICAL_INDICATORS = {
  RSI: {
    period: 14,
    overbought: 70,
    oversold: 30
  },
  SMA: {
    short: 20,
    long: 50
  },
  BOLLINGER_BANDS: {
    period: 20,
    stdDev: 2
  },
  MACD: {
    fast: 12,
    slow: 26,
    signal: 9
  }
};

// Timeframes disponibles
export const TIMEFRAMES = [
  { key: '1H', label: '1H', minutes: 60 },
  { key: '1D', label: '1D', minutes: 1440 },
  { key: '1W', label: '1W', minutes: 10080 },
  { key: '1M', label: '1M', minutes: 43200 }
] as const;

// Types de graphiques
export const CHART_TYPES = [
  { type: 'area', icon: 'trending-up', label: 'Area' },
  { type: 'line', icon: 'analytics', label: 'Line' },
  { type: 'volume', icon: 'bar-chart', label: 'Volume' }
] as const;

// Configuration des catégories de statistiques
export const STATS_CATEGORIES = [
  { key: 'overview', label: 'Vue d\'ensemble', icon: 'analytics' },
  { key: 'metrics', label: 'Métriques', icon: 'bar-chart' },
  { key: 'health', label: 'Santé', icon: 'pulse' }
] as const;

// Messages d'état du marché
export const MARKET_MESSAGES = {
  excellent: {
    text: 'Marché en excellente santé',
    color: '#10B981',
    icon: 'checkmark-circle'
  },
  good: {
    text: 'Marché en bonne santé',
    color: '#F59E0B',
    icon: 'checkmark'
  },
  average: {
    text: 'Marché dans la moyenne',
    color: '#6B7280',
    icon: 'remove'
  },
  poor: {
    text: 'Marché en difficulté',
    color: '#EF4444',
    icon: 'warning'
  }
};

// Configuration des animations
export const ANIMATIONS = {
  duration: {
    fast: 300,
    normal: 600,
    slow: 1000
  },
  easing: {
    default: 'ease-in-out',
    spring: 'spring'
  },
  stagger: 50
};

// Formatage des nombres
export const NUMBER_FORMATS = {
  price: {
    decimals: 4,
    suffix: '€'
  },
  percentage: {
    decimals: 2,
    suffix: '%'
  },
  volume: {
    short: true, // 1.2k au lieu de 1200
    decimals: 1
  },
  marketCap: {
    short: true,
    decimals: 2
  }
};

// Messages d'erreur
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Erreur de connexion. Vérifiez votre réseau.',
  DATA_NOT_FOUND: 'Données non trouvées',
  INVALID_CURRENCY: 'Cryptomonnaie invalide',
  LOADING_FAILED: 'Échec du chargement des données',
  INSUFFICIENT_DATA: 'Données insuffisantes pour l\'analyse'
};

// Configuration des notifications
export const NOTIFICATION_CONFIG = {
  priceAlert: {
    enabled: true,
    threshold: 5 // % de changement pour déclencher une alerte
  },
  volumeAlert: {
    enabled: true,
    threshold: 50 // % de changement pour déclencher une alerte
  },
  updateInterval: 30000 // 30 secondes
};

export default {
  DEFAULT_CURRENCY_ID,
  CHART_CONFIG,
  TECHNICAL_INDICATORS,
  TIMEFRAMES,
  CHART_TYPES,
  STATS_CATEGORIES,
  MARKET_MESSAGES,
  ANIMATIONS,
  NUMBER_FORMATS,
  ERROR_MESSAGES,
  NOTIFICATION_CONFIG
};
