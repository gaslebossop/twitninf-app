import { fonts } from '../theme';
import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';

interface PremiumBadgesProps {
  badgeType: 'none' | 'diamond' | 'crown' | 'fire' | 'lightning' | 'star' | 'rocket' | 'gem' | 'trophy' | 'dragon';
  isPremium: boolean;
  animated?: boolean;
  size?: 'small' | 'medium' | 'large';
  onPress?: () => void;
}

export default function PremiumBadges({ 
  badgeType, 
  isPremium, 
  animated = true, 
  size = 'medium',
  onPress 
}: PremiumBadgesProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isPremium || !animated || badgeType === 'none') return;

    // Animation de pulsation
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    );

    // Animation de rotation (pour certains badges)
    const rotateAnimation = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 3000,
        useNativeDriver: true,
      })
    );

    // Animation de lueur
    const glowAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    );

    pulseAnimation.start();
    if (['crown', 'trophy', 'dragon'].includes(badgeType)) {
      rotateAnimation.start();
    }
    glowAnimation.start();

    return () => {
      pulseAnimation.stop();
      rotateAnimation.stop();
      glowAnimation.stop();
    };
  }, [badgeType, isPremium, animated]);

  if (!isPremium || badgeType === 'none') {
    return null;
  }

  const getBadgeConfig = () => {
    switch (badgeType) {
      case 'diamond':
        return {
          icon: 'diamond' as const,
          colors: ['#b3d9ff', '#0080ff', '#0066cc'],
          shadowColor: '#0080ff',
          text: 'Diamant',
        };
      case 'crown':
        return {
          icon: 'crown' as const,
          colors: ['#ffd700', '#ffb347', '#ff8c00'],
          shadowColor: '#ffd700',
          text: 'Royauté',
        };
      case 'fire':
        return {
          icon: 'flame' as const,
          colors: ['#ff4500', '#ff6b00', '#ff8c00'],
          shadowColor: '#ff4500',
          text: 'Flamme',
        };
      case 'lightning':
        return {
          icon: 'flash' as const,
          colors: ['#ffff00', '#ffcc00', '#ff9900'],
          shadowColor: '#ffff00',
          text: 'Éclair',
        };
      case 'star':
        return {
          icon: 'star' as const,
          colors: ['#ff69b4', '#ff1493', '#dc143c'],
          shadowColor: '#ff69b4',
          text: 'Étoile',
        };
      case 'rocket':
        return {
          icon: 'rocket' as const,
          colors: ['#00ff00', '#32cd32', '#228b22'],
          shadowColor: '#00ff00',
          text: 'Fusée',
        };
      case 'gem':
        return {
          icon: 'diamond-outline' as const,
          colors: ['#9370db', '#8a2be2', '#6a0dad'],
          shadowColor: '#9370db',
          text: 'Gemme',
        };
      case 'trophy':
        return {
          icon: 'trophy' as const,
          colors: ['#ffd700', '#daa520', '#b8860b'],
          shadowColor: '#ffd700',
          text: 'Trophée',
        };
      case 'dragon':
        return {
          icon: 'sparkles' as const,
          colors: ['#ff0000', '#ff4500', '#ff6b00'],
          shadowColor: '#ff0000',
          text: 'Dragon',
        };
      default:
        return {
          icon: 'diamond' as const,
          colors: ['#ffffff', '#cccccc', '#999999'],
          shadowColor: '#ffffff',
          text: 'Premium',
        };
    }
  };

  const config = getBadgeConfig();
  const sizeConfig = {
    small: { size: 20, fontSize: 10, padding: 4 },
    medium: { size: 24, fontSize: 12, padding: 6 },
    large: { size: 32, fontSize: 14, padding: 8 },
  }[size];

  const rotateInterpolate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const BadgeContent = () => (
    <Animated.View
      style={[
        styles.badge,
        {
          transform: [
            { scale: pulseAnim },
            { rotate: ['crown', 'trophy', 'dragon'].includes(badgeType) ? rotateInterpolate : '0deg' },
          ],
          padding: sizeConfig.padding,
        },
      ]}
    >
      <LinearGradient
        colors={config.colors as any}
        style={[styles.badgeGradient, { borderRadius: sizeConfig.size }]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Animated.View
          style={[
            styles.badgeContent,
            {
              shadowColor: config.shadowColor,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: glowAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.3, 0.8],
              }),
              shadowRadius: glowAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [5, 15],
              }),
            },
          ]}
        >
          <Ionicons 
            name={config.icon as keyof typeof Ionicons.glyphMap}
            size={sizeConfig.size} 
            color="#ffffff"
            style={styles.badgeIcon}
          />
          {size === 'large' && (
            <Text style={[styles.badgeText, { fontSize: sizeConfig.fontSize }]}>
              {config.text}
            </Text>
          )}
        </Animated.View>
      </LinearGradient>

      {/* Particules flottantes pour certains badges */}
      {['star', 'gem', 'dragon'].includes(badgeType) && (
        <View style={styles.particlesContainer}>
          {[...Array(3)].map((_, index) => (
            <Animated.View
              key={index}
              style={[
                styles.floatingParticle,
                {
                  left: Math.random() * 40,
                  top: Math.random() * 40,
                  opacity: glowAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.2, 0.8],
                  }),
                  transform: [
                    {
                      translateY: glowAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, -10],
                      }),
                    },
                    {
                      scale: glowAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.5, 1.5],
                      }),
                    },
                  ],
                },
              ]}
            />
          ))}
        </View>
      )}
    </Animated.View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
        <BadgeContent />
      </TouchableOpacity>
    );
  }

  return <BadgeContent />;
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badgeGradient: {
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
  },
  badgeContent: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  badgeIcon: {
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  badgeText: {
    color: '#ffffff',
    fontWeight: 'bold', fontFamily: fonts.bold,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  particlesContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
  },
  floatingParticle: {
    position: 'absolute',
    width: 4,
    height: 4,
    backgroundColor: '#ffffff',
    borderRadius: 2,
  },
});
