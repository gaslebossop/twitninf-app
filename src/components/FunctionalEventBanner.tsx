import { fonts } from '../theme';
/**
 * Bannière pour afficher les événements fonctionnels actifs
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { FunctionalEvent } from '../types/functionalEvent';

const { width: screenWidth } = Dimensions.get('window');

interface FunctionalEventBannerProps {
  events: FunctionalEvent[];
  onPress?: () => void;
  style?: any;
}

export function FunctionalEventBanner({ events, onPress, style }: FunctionalEventBannerProps) {
  const [currentEventIndex, setCurrentEventIndex] = React.useState(0);
  const fadeAnim = React.useRef(new Animated.Value(1)).current;

  // Rotation automatique des événements
  React.useEffect(() => {
    if (events.length <= 1) return;

    const interval = setInterval(() => {
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      setCurrentEventIndex((prev) => (prev + 1) % events.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [events.length, fadeAnim]);

  if (events.length === 0) return null;

  const currentEvent = events[currentEventIndex];

  const getEventColors = (event: FunctionalEvent) => {
    // Couleurs par défaut selon le type d'événement
    const colorMap: { [key: string]: string[] } = {
      'double-xp': ['#ff6b6b', '#ff8e53'],
      'unlimited-messages': ['#4ecdc4', '#44a08d'],
      'premium-tweets': ['#667eea', '#764ba2'],
      'profile-boost': ['#f093fb', '#f5576c'],
    };

    const slug = event.slug.split('-')[0];
    return colorMap[slug] || ['#667eea', '#764ba2'];
  };

  const getEventIcon = (event: FunctionalEvent) => {
    const iconMap: { [key: string]: string } = {
      'double-xp': 'flash',
      'unlimited-messages': 'chatbubbles',
      'premium-tweets': 'diamond',
      'profile-boost': 'trending-up',
    };

    const slug = event.slug.split('-')[0];
    return iconMap[slug] || 'star';
  };

  const colors = getEventColors(currentEvent);
  const icon = getEventIcon(currentEvent);

  return (
    <Animated.View style={[styles.container, style, { opacity: fadeAnim }]}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
        <LinearGradient
          colors={colors as any}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.banner}
        >
          <View style={styles.content}>
            <View style={styles.iconContainer}>
              <Ionicons name={icon as any} size={24} color="white" />
            </View>
            
            <View style={styles.textContainer}>
              <Text style={styles.title}>{currentEvent.name}</Text>
              <Text style={styles.message}>
                {currentEvent.banner_message || currentEvent.description}
              </Text>
            </View>

            {events.length > 1 && (
              <View style={styles.indicatorContainer}>
                {events.map((_, index) => (
                  <View
                    key={index}
                    style={[
                      styles.indicator,
                      index === currentEventIndex && styles.activeIndicator,
                    ]}
                  />
                ))}
              </View>
            )}

            <Ionicons name="chevron-forward" size={20} color="white" style={styles.chevron} />
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  banner: {
    padding: 16,
    minHeight: 60,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold', fontFamily: fonts.bold,
    color: 'white',
    marginBottom: 2,
  },
  message: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.9)',
    lineHeight: 16,
  },
  indicatorContainer: {
    flexDirection: 'row',
    marginRight: 8,
  },
  indicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    marginHorizontal: 2,
  },
  activeIndicator: {
    backgroundColor: 'white',
  },
  chevron: {
    marginLeft: 4,
  },
});
