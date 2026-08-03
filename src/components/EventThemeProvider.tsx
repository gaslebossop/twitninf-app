/**
 * Fournisseur de thème d'événement avec effets visuels avancés
 */

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { StyleSheet, View, Animated, Dimensions } from 'react-native';
import { EventThemeConfig, getEventTheme } from '../themes/eventThemes';
import { useEvents } from '../contexts/EventContext';

interface EventThemeContextType {
  currentTheme: EventThemeConfig | null;
  isEventActive: boolean;
  applyTheme: (theme: EventThemeConfig | null) => void;
}

const EventThemeContext = createContext<EventThemeContextType | undefined>(undefined);

export const useEventTheme = () => {
  const context = useContext(EventThemeContext);
  if (!context) {
    throw new Error('useEventTheme must be used within an EventThemeProvider');
  }
  return context;
};

interface EventThemeProviderProps {
  children: ReactNode;
}

// Composant pour les cœurs flottants (Saint-Valentin)
const FloatingHearts: React.FC<{ theme: EventThemeConfig }> = ({ theme }) => {
  const [hearts, setHearts] = useState<Array<{ id: number; x: number; y: number; scale: Animated.Value }>>([]);

  useEffect(() => {
    if (!theme.effects.floatingHearts) return;

    const createHeart = () => {
      const id = Date.now() + Math.random();
      const x = Math.random() * Dimensions.get('window').width;
      const y = Dimensions.get('window').height + 50;
      const scale = new Animated.Value(0);

      return { id, x, y, scale };
    };

    const interval = setInterval(() => {
      setHearts(prev => {
        const newHeart = createHeart();
        const updated = [...prev, newHeart].slice(-10); // Garder seulement 10 cœurs

        // Animation du cœur
        Animated.sequence([
          Animated.timing(newHeart.scale, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(newHeart.scale, {
            toValue: 0,
            duration: 2000,
            useNativeDriver: true,
          }),
        ]).start();

        return updated;
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [theme.effects.floatingHearts]);

  if (!theme.effects.floatingHearts) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {hearts.map(heart => (
        <Animated.View
          key={heart.id}
          style={[
            styles.floatingHeart,
            {
              left: heart.x,
              top: heart.y,
              transform: [{ scale: heart.scale }],
            },
          ]}
        >
          <View style={[styles.heart, { backgroundColor: theme.colors.primary }]} />
        </Animated.View>
      ))}
    </View>
  );
};

// Composant pour les particules (Halloween, Noël, etc.)
const Particles: React.FC<{ theme: EventThemeConfig }> = ({ theme }) => {
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; opacity: Animated.Value }>>([]);

  useEffect(() => {
    if (!theme.effects.particles) return;

    const createParticle = () => {
      const id = Date.now() + Math.random();
      const x = Math.random() * Dimensions.get('window').width;
      const y = -20;
      const opacity = new Animated.Value(0);

      return { id, x, y, opacity };
    };

    const interval = setInterval(() => {
      setParticles(prev => {
        const newParticle = createParticle();
        const updated = [...prev, newParticle].slice(-20); // Garder seulement 20 particules

        // Animation de la particule
        Animated.sequence([
          Animated.timing(newParticle.opacity, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(newParticle.opacity, {
            toValue: 0,
            duration: 3000,
            useNativeDriver: true,
          }),
        ]).start();

        return updated;
      });
    }, 500);

    return () => clearInterval(interval);
  }, [theme.effects.particles]);

  if (!theme.effects.particles) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map(particle => (
        <Animated.View
          key={particle.id}
          style={[
            styles.particle,
            {
              left: particle.x,
              top: particle.y,
              opacity: particle.opacity,
              backgroundColor: theme.colors.accent,
            },
          ]}
        />
      ))}
    </View>
  );
};

// Composant pour les confettis (Nouvel An, etc.)
const Confetti: React.FC<{ theme: EventThemeConfig }> = ({ theme }) => {
  const [confetti, setConfetti] = useState<Array<{ id: number; x: number; y: number; rotation: Animated.Value; scale: Animated.Value }>>([]);

  useEffect(() => {
    if (!theme.effects.confetti) return;

    const createConfetti = () => {
      const id = Date.now() + Math.random();
      const x = Math.random() * Dimensions.get('window').width;
      const y = -20;
      const rotation = new Animated.Value(0);
      const scale = new Animated.Value(0);

      return { id, x, y, rotation, scale };
    };

    const interval = setInterval(() => {
      setConfetti(prev => {
        const newConfetti = createConfetti();
        const updated = [...prev, newConfetti].slice(-15); // Garder seulement 15 confettis

        // Animation du confetti
        Animated.parallel([
          Animated.timing(newConfetti.scale, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(newConfetti.rotation, {
            toValue: 360,
            duration: 2000,
            useNativeDriver: true,
          }),
        ]).start();

        return updated;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [theme.effects.confetti]);

  if (!theme.effects.confetti) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {confetti.map(confetti => (
        <Animated.View
          key={confetti.id}
          style={[
            styles.confetti,
            {
              left: confetti.x,
              top: confetti.y,
              transform: [
                { rotate: confetti.rotation },
                { scale: confetti.scale },
              ],
              backgroundColor: theme.colors.accent,
            },
          ]}
        />
      ))}
    </View>
  );
};

// Composant pour la neige (Noël)
const Snow: React.FC<{ theme: EventThemeConfig }> = ({ theme }) => {
  const [snowflakes, setSnowflakes] = useState<Array<{ id: number; x: number; y: number; opacity: Animated.Value; rotation: Animated.Value }>>([]);

  useEffect(() => {
    if (!theme.effects.snow) return;

    const createSnowflake = () => {
      const id = Date.now() + Math.random();
      const x = Math.random() * Dimensions.get('window').width;
      const y = -20;
      const opacity = new Animated.Value(0);
      const rotation = new Animated.Value(0);

      return { id, x, y, opacity, rotation };
    };

    const interval = setInterval(() => {
      setSnowflakes(prev => {
        const newSnowflake = createSnowflake();
        const updated = [...prev, newSnowflake].slice(-25); // Garder seulement 25 flocons

        // Animation du flocon
        Animated.parallel([
          Animated.timing(newSnowflake.opacity, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(newSnowflake.rotation, {
            toValue: 360,
            duration: 3000,
            useNativeDriver: true,
          }),
        ]).start();

        return updated;
      });
    }, 300);

    return () => clearInterval(interval);
  }, [theme.effects.snow]);

  if (!theme.effects.snow) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {snowflakes.map(snowflake => (
        <Animated.View
          key={snowflake.id}
          style={[
            styles.snowflake,
            {
              left: snowflake.x,
              top: snowflake.y,
              opacity: snowflake.opacity,
              transform: [{ rotate: snowflake.rotation }],
            },
          ]}
        >
          <View style={[styles.snowflakeShape, { backgroundColor: theme.colors.surface }]} />
        </Animated.View>
      ))}
    </View>
  );
};

export const EventThemeProvider: React.FC<EventThemeProviderProps> = ({ children }) => {
  const { activeEvent, hasActiveEvent } = useEvents();
  const [currentTheme, setCurrentTheme] = useState<EventThemeConfig | null>(null);

  useEffect(() => {
    if (hasActiveEvent && activeEvent) {
      const theme = getEventTheme(activeEvent.theme_id);
      setCurrentTheme(theme);
    } else {
      setCurrentTheme(null);
    }
  }, [activeEvent, hasActiveEvent]);

  const applyTheme = React.useCallback((theme: EventThemeConfig | null) => {
    setCurrentTheme(theme);
  }, []);

  // Mémoïsé : contexte racine. L'objet littéral inline était une nouvelle
  // référence à chaque rendu, invalidant tous les consommateurs pour rien.
  const value = React.useMemo(
    () => ({ currentTheme, isEventActive: hasActiveEvent, applyTheme }),
    [currentTheme, hasActiveEvent, applyTheme]
  );

  return (
    <EventThemeContext.Provider value={value}>
      {children}
      
      {/* Effets visuels d'événement */}
      {currentTheme && (
        <>
          <FloatingHearts theme={currentTheme} />
          <Particles theme={currentTheme} />
          <Confetti theme={currentTheme} />
          <Snow theme={currentTheme} />
        </>
      )}
    </EventThemeContext.Provider>
  );
};

const styles = StyleSheet.create({
  floatingHeart: {
    position: 'absolute',
    width: 20,
    height: 20,
  },
  heart: {
    width: 20,
    height: 20,
    borderRadius: 10,
    transform: [{ rotate: '45deg' }],
  },
  particle: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  confetti: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 1,
  },
  snowflake: {
    position: 'absolute',
    width: 12,
    height: 12,
  },
  snowflakeShape: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
});
