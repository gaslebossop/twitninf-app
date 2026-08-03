import { fonts } from '../theme';
/**
 * Bannière d'événement avec effets visuels avancés
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEventStyles } from '../hooks/useEventStyles';
import { useEvents } from '../contexts/EventContext';

interface EventBannerProps {
  onPress?: () => void;
  showCloseButton?: boolean;
  onClose?: () => void;
}

export const EventBanner: React.FC<EventBannerProps> = ({
  onPress,
  showCloseButton = false,
  onClose,
}) => {
  const { activeEvent, hasActiveEvent } = useEvents();
  const { styles: eventStyles, theme, hasEffect } = useEventStyles();
  
  // Vérification de la disponibilité des hooks
  if (!eventStyles || !theme) {
    console.warn('⚠️ EventBanner: Styles or theme is undefined');
    return null;
  }
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(-50)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (hasActiveEvent && activeEvent) {
      // Animation d'entrée
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ]).start();

      // Animation de pulse si activée
      if (hasEffect('pulse')) {
        const pulseAnimation = Animated.loop(
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 1.1,
              duration: 1000,
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 1000,
              useNativeDriver: true,
            }),
          ])
        );
        pulseAnimation.start();
      }

      // Animation de shimmer si activée
      if (hasEffect('shimmer')) {
        const shimmerAnimation = Animated.loop(
          Animated.sequence([
            Animated.timing(shimmerAnim, {
              toValue: 1,
              duration: 2000,
              useNativeDriver: true,
            }),
            Animated.timing(shimmerAnim, {
              toValue: 0,
              duration: 2000,
              useNativeDriver: true,
            }),
          ])
        );
        shimmerAnimation.start();
      }
    } else {
      // Animation de sortie
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: -50,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [hasActiveEvent, activeEvent, hasEffect, pulseAnim, shimmerAnim]);

  if (!hasActiveEvent || !activeEvent || !theme) {
    return null;
  }

  const getEventIcon = () => {
    switch (theme.id) {
      case 'valentine':
        return 'heart';
      case 'halloween':
        return 'skull';
      case 'christmas':
        return 'tree';
      case 'newyear':
        return 'sparkles';
      case 'easter':
        return 'egg';
      default:
        return 'calendar';
    }
  };

  const getEventEmoji = () => {
    return theme.emoji || '🎉';
  };

  return (
    <Animated.View
      style={[
        styles.eventBanner,
        eventStyles.eventBanner,
        {
          opacity: fadeAnim,
          transform: [
            { translateY: slideAnim },
            { scale: pulseAnim },
          ],
        },
      ]}
    >
      <TouchableOpacity
        onPress={onPress}
        style={[
          styles.touchable,
          hasEffect('glow') && eventStyles.glow,
          hasEffect('shimmer') && eventStyles.shimmer,
        ]}
        activeOpacity={0.8}
      >
        <View style={styles.eventBannerContent}>
          <View style={styles.eventBannerLeft}>
            <Text style={styles.eventIcon}>{getEventEmoji()}</Text>
            <Ionicons
              name={getEventIcon() as any}
              size={20}
              color={theme.colors.primary}
              style={styles.eventIcon}
            />
          </View>
          
          <View style={styles.eventBannerCenter}>
            <Text style={styles.eventBannerText}>
              {activeEvent.name}
            </Text>
            {activeEvent.description && (
              <Text style={[styles.eventBannerText, { fontSize: 12, opacity: 0.8 }]}>
                {activeEvent.description}
              </Text>
            )}
          </View>

          {showCloseButton && (
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons
                name="close"
                size={16}
                color={theme.colors.text}
              />
            </TouchableOpacity>
          )}
        </View>

        {/* Effet de shimmer */}
        {hasEffect('shimmer') && (
          <Animated.View
            style={[
              styles.shimmerOverlay,
              {
                opacity: shimmerAnim,
                backgroundColor: theme.colors.accent,
              },
            ]}
          />
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  eventBanner: {
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    overflow: 'hidden',
  },
  touchable: {
    overflow: 'hidden',
  },
  eventBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  eventBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  eventBannerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  eventBannerText: {
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
    textAlign: 'center',
  },
  eventIcon: {
    fontSize: 20,
    marginRight: 4,
  },
  closeButton: {
    padding: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  shimmerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.3,
  },
  glow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 8,
  },
  shimmer: {
    opacity: 0.8,
  },
});
