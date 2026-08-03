/**
 * Thèmes d'événements avancés avec couleurs, effets et animations
 */

export interface EventThemeConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  emoji: string;
  
  // Couleurs principales
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
    shadow: string;
    success: string;
    warning: string;
    error: string;
  };
  
  // Dégradés
  gradients: {
    primary: string[];
    secondary: string[];
    background: string[];
    card: string[];
    button: string[];
    header: string[];
    footer: string[];
  };
  
  // Effets spéciaux
  effects: {
    floatingHearts?: boolean;
    sparkles?: boolean;
    glow?: boolean;
    particles?: boolean;
    shimmer?: boolean;
    pulse?: boolean;
    confetti?: boolean;
    snow?: boolean;
    rain?: boolean;
  };
  
  // Animations
  animations: {
    fadeIn: string;
    slideIn: string;
    bounce: string;
    rotate: string;
    scale: string;
    pulse: string;
    shimmer: string;
  };
  
  // Sons (optionnel)
  sounds?: {
    background?: string;
    click?: string;
    notification?: string;
  };
}

// Thème Saint-Valentin
export const valentineTheme: EventThemeConfig = {
  id: 'valentine',
  name: 'Saint-Valentin',
  description: 'Thème romantique avec cœurs et roses',
  icon: 'heart',
  emoji: '💕',
  
  colors: {
    primary: '#ff6b9d',
    secondary: '#ff8fab',
    accent: '#ffb3d1',
    background: '#fff0f5',
    surface: '#ffffff',
    text: '#8b1538',
    textSecondary: '#c2185b',
    border: '#ffb3d1',
    shadow: '#ff6b9d40',
    success: '#4caf50',
    warning: '#ff9800',
    error: '#f44336',
  },
  
  gradients: {
    primary: ['#ff6b9d', '#ff8fab'],
    secondary: ['#ffb3d1', '#ffc1d6'],
    background: ['#fff0f5', '#ffe8f0'],
    card: ['#ffffff', '#fff8fa'],
    button: ['#ff6b9d', '#ff8fab'],
    header: ['#ff6b9d', '#ff8fab', '#ffb3d1'],
    footer: ['#ffb3d1', '#ffc1d6', '#ffd1e0'],
  },
  
  effects: {
    floatingHearts: true,
    sparkles: true,
    glow: true,
    particles: true,
    shimmer: true,
    pulse: true,
  },
  
  animations: {
    fadeIn: 'fadeIn 0.5s ease-in-out',
    slideIn: 'slideInUp 0.6s ease-out',
    bounce: 'bounce 1s infinite',
    rotate: 'rotate 2s linear infinite',
    scale: 'scale 0.3s ease-in-out',
    pulse: 'pulse 2s infinite',
    shimmer: 'shimmer 2s infinite',
  },
  
  sounds: {
    background: 'romantic_music.mp3',
    click: 'heart_click.wav',
    notification: 'love_notification.wav',
  },
};

// Thème Halloween
export const halloweenTheme: EventThemeConfig = {
  id: 'halloween',
  name: 'Halloween',
  description: 'Thème effrayant avec citrouilles et fantômes',
  icon: 'skull',
  emoji: '🎃',
  
  colors: {
    primary: '#ff6b35',
    secondary: '#8b0000',
    accent: '#ffd700',
    background: '#1a1a1a',
    surface: '#2d2d2d',
    text: '#ffffff',
    textSecondary: '#ffd700',
    border: '#ff6b35',
    shadow: '#00000080',
    success: '#4caf50',
    warning: '#ff9800',
    error: '#f44336',
  },
  
  gradients: {
    primary: ['#ff6b35', '#8b0000'],
    secondary: ['#8b0000', '#4a0000'],
    background: ['#1a1a1a', '#0d0d0d'],
    card: ['#2d2d2d', '#1a1a1a'],
    button: ['#ff6b35', '#ff8c42'],
    header: ['#8b0000', '#ff6b35', '#ffd700'],
    footer: ['#1a1a1a', '#2d2d2d'],
  },
  
  effects: {
    particles: true,
    glow: true,
    shimmer: true,
    pulse: true,
    confetti: true,
  },
  
  animations: {
    fadeIn: 'fadeIn 0.8s ease-in-out',
    slideIn: 'slideInDown 0.6s ease-out',
    bounce: 'bounce 1.5s infinite',
    rotate: 'rotate 3s linear infinite',
    scale: 'scale 0.4s ease-in-out',
    pulse: 'pulse 2.5s infinite',
    shimmer: 'shimmer 3s infinite',
  },
  
  sounds: {
    background: 'spooky_music.mp3',
    click: 'ghost_click.wav',
    notification: 'scary_notification.wav',
  },
};

// Thème Noël
export const christmasTheme: EventThemeConfig = {
  id: 'christmas',
  name: 'Noël',
  description: 'Thème festif avec sapins et cadeaux',
  icon: 'tree',
  emoji: '🎄',
  
  colors: {
    primary: '#d32f2f',
    secondary: '#388e3c',
    accent: '#ffd700',
    background: '#f3e5f5',
    surface: '#ffffff',
    text: '#1b5e20',
    textSecondary: '#d32f2f',
    border: '#4caf50',
    shadow: '#4caf5040',
    success: '#4caf50',
    warning: '#ff9800',
    error: '#f44336',
  },
  
  gradients: {
    primary: ['#d32f2f', '#f44336'],
    secondary: ['#388e3c', '#4caf50'],
    background: ['#f3e5f5', '#e8f5e8'],
    card: ['#ffffff', '#f8fff8'],
    button: ['#d32f2f', '#f44336'],
    header: ['#d32f2f', '#388e3c', '#ffd700'],
    footer: ['#388e3c', '#4caf50', '#66bb6a'],
  },
  
  effects: {
    snow: true,
    sparkles: true,
    glow: true,
    particles: true,
    shimmer: true,
    pulse: true,
  },
  
  animations: {
    fadeIn: 'fadeIn 0.6s ease-in-out',
    slideIn: 'slideInLeft 0.7s ease-out',
    bounce: 'bounce 1.2s infinite',
    rotate: 'rotate 4s linear infinite',
    scale: 'scale 0.3s ease-in-out',
    pulse: 'pulse 2s infinite',
    shimmer: 'shimmer 2.5s infinite',
  },
  
  sounds: {
    background: 'christmas_music.mp3',
    click: 'bell_click.wav',
    notification: 'jingle_notification.wav',
  },
};

// Thème Nouvel An
export const newYearTheme: EventThemeConfig = {
  id: 'newyear',
  name: 'Nouvel An',
  description: 'Thème festif avec confettis et paillettes',
  icon: 'sparkles',
  emoji: '🎊',
  
  colors: {
    primary: '#9c27b0',
    secondary: '#673ab7',
    accent: '#ffd700',
    background: '#f3e5f5',
    surface: '#ffffff',
    text: '#4a148c',
    textSecondary: '#7b1fa2',
    border: '#9c27b0',
    shadow: '#9c27b040',
    success: '#4caf50',
    warning: '#ff9800',
    error: '#f44336',
  },
  
  gradients: {
    primary: ['#9c27b0', '#e91e63'],
    secondary: ['#673ab7', '#9c27b0'],
    background: ['#f3e5f5', '#e1bee7'],
    card: ['#ffffff', '#fce4ec'],
    button: ['#9c27b0', '#e91e63'],
    header: ['#9c27b0', '#e91e63', '#ffd700'],
    footer: ['#673ab7', '#9c27b0', '#e91e63'],
  },
  
  effects: {
    confetti: true,
    sparkles: true,
    glow: true,
    particles: true,
    shimmer: true,
    pulse: true,
  },
  
  animations: {
    fadeIn: 'fadeIn 0.4s ease-in-out',
    slideIn: 'slideInRight 0.5s ease-out',
    bounce: 'bounce 1s infinite',
    rotate: 'rotate 2s linear infinite',
    scale: 'scale 0.2s ease-in-out',
    pulse: 'pulse 1.5s infinite',
    shimmer: 'shimmer 2s infinite',
  },
  
  sounds: {
    background: 'party_music.mp3',
    click: 'sparkle_click.wav',
    notification: 'celebration_notification.wav',
  },
};

// Thème Pâques
export const easterTheme: EventThemeConfig = {
  id: 'easter',
  name: 'Pâques',
  description: 'Thème printanier avec œufs et lapins',
  icon: 'egg',
  emoji: '🐰',
  
  colors: {
    primary: '#ff9800',
    secondary: '#4caf50',
    accent: '#ffeb3b',
    background: '#f1f8e9',
    surface: '#ffffff',
    text: '#2e7d32',
    textSecondary: '#ff9800',
    border: '#4caf50',
    shadow: '#4caf5040',
    success: '#4caf50',
    warning: '#ff9800',
    error: '#f44336',
  },
  
  gradients: {
    primary: ['#ff9800', '#ffc107'],
    secondary: ['#4caf50', '#8bc34a'],
    background: ['#f1f8e9', '#e8f5e8'],
    card: ['#ffffff', '#f9fbe7'],
    button: ['#ff9800', '#ffc107'],
    header: ['#ff9800', '#4caf50', '#ffeb3b'],
    footer: ['#4caf50', '#8bc34a', '#aed581'],
  },
  
  effects: {
    particles: true,
    sparkles: true,
    glow: true,
    shimmer: true,
    pulse: true,
  },
  
  animations: {
    fadeIn: 'fadeIn 0.5s ease-in-out',
    slideIn: 'slideInUp 0.6s ease-out',
    bounce: 'bounce 1.3s infinite',
    rotate: 'rotate 2.5s linear infinite',
    scale: 'scale 0.3s ease-in-out',
    pulse: 'pulse 2.2s infinite',
    shimmer: 'shimmer 2.3s infinite',
  },
  
  sounds: {
    background: 'spring_music.mp3',
    click: 'bunny_click.wav',
    notification: 'easter_notification.wav',
  },
};

// Export de tous les thèmes
export const eventThemes: Record<string, EventThemeConfig> = {
  valentine: valentineTheme,
  halloween: halloweenTheme,
  christmas: christmasTheme,
  newyear: newYearTheme,
  easter: easterTheme,
};

// Fonction pour obtenir un thème par ID
export const getEventTheme = (themeId: string): EventThemeConfig | null => {
  return eventThemes[themeId] || null;
};

// Fonction pour obtenir tous les thèmes disponibles
export const getAllEventThemes = (): EventThemeConfig[] => {
  return Object.values(eventThemes);
};
