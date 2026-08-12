import { fonts , colors} from '../theme';
/**
 * Composant pour afficher les informations d'événement actif
 * Affiche une bannière ou notification quand un événement est en cours
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useEvents } from '../contexts/EventContext';
import useEventTheme from '../hooks/useEventTheme';

const { width } = Dimensions.get('window');

interface EventThemeDisplayProps {
  style?: any;
  showMinimal?: boolean;
  onPress?: () => void;
}

const EventThemeDisplay: React.FC<EventThemeDisplayProps> = ({
  style,
  showMinimal = false,
  onPress,
}) => {
  const { activeEvent, hasActiveEvent } = useEvents();
  const { getCurrentColors, isEventThemeActive } = useEventTheme();
  const [isVisible, setIsVisible] = useState(true);
  const [fadeAnim] = useState(new Animated.Value(1));

  const colors = getCurrentColors();

  // Ne rien afficher si pas d'événement actif
  if (!hasActiveEvent || !activeEvent || !isEventThemeActive) {
    return null;
  }

  const handleDismiss = () => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setIsVisible(false);
    });
  };

  const handlePress = () => {
    if (onPress) {
      onPress();
    }
  };

  if (!isVisible) {
    return null;
  }

  // Version minimale (pour la navbar par exemple)
  if (showMinimal) {
    return (
      <TouchableOpacity
        style={[styles.minimalContainer, style]}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        <View style={[styles.minimalIndicator, { backgroundColor: colors.primary }]} />
        <Text style={[styles.minimalText, { color: colors.text }]}>
          {activeEvent.name}
        </Text>
        <Ionicons
          name={activeEvent.icon as any || 'star'}
          size={16}
          color={colors.primary}
        />
      </TouchableOpacity>
    );
  }

  // Version complète (bannière)
  return (
    <Animated.View style={[styles.container, style, { opacity: fadeAnim }]}>
      <LinearGradient
        colors={(activeEvent.colors || [colors.background, colors.primary]) as any}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <BlurView intensity={20} style={styles.blurContainer}>
          <TouchableOpacity
            style={styles.content}
            onPress={handlePress}
            activeOpacity={0.9}
          >
            <View style={styles.iconContainer}>
              <Ionicons
                name={activeEvent.icon as any || 'star'}
                size={24}
                color={colors.text}
              />
            </View>

            <View style={styles.textContainer}>
              <Text style={[styles.eventName, { color: colors.text }]}>
                🎉 {activeEvent.name}
              </Text>
              {activeEvent.description && (
                <Text style={[styles.eventDescription, { color: colors.textSecondary }]}>
                  {activeEvent.description}
                </Text>
              )}
            </View>

            <TouchableOpacity
              style={styles.dismissButton}
              onPress={handleDismiss}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </TouchableOpacity>
        </BlurView>
      </LinearGradient>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: width - 32,
    alignSelf: 'center',
    marginVertical: 8,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  gradient: {
    flex: 1,
  },
  blurContainer: {
    flex: 1,
    borderRadius: 16,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.overlayStrong,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  eventName: {
    fontSize: 16,
    fontWeight: '700', fontFamily: fonts.bold,
    marginBottom: 4,
  },
  eventDescription: {
    fontSize: 14,
    fontWeight: '400', fontFamily: fonts.regular,
    opacity: 0.9,
  },
  dismissButton: {
    padding: 4,
  },
  
  // Styles pour la version minimale
  minimalContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: colors.overlayMedium,
  },
  minimalIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  minimalText: {
    fontSize: 12,
    fontWeight: '600', fontFamily: fonts.semibold,
    marginRight: 4,
  },
});

export default EventThemeDisplay;
