import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TextStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface PremiumUsernameGlowProps {
  children: React.ReactNode;
  isPremium: boolean;
  style?: TextStyle;
  glowColor?: string;
}

export default function PremiumUsernameGlow({ 
  children, 
  isPremium, 
  style,
  glowColor = '#ff6b6b'
}: PremiumUsernameGlowProps) {
  const glowAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isPremium) return;

    // Animation de lueur continue
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

    // Animation de pulsation subtile
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        }),
      ])
    );

    glowAnimation.start();
    pulseAnimation.start();

    return () => {
      glowAnimation.stop();
      pulseAnimation.stop();
    };
  }, [isPremium]);

  if (!isPremium) {
    return (
      <Text style={style}>
        {children}
      </Text>
    );
  }

  return (
    <View style={styles.container}>
      {/* Effet de lueur subtile derrière le texte */}
      <Animated.View
        style={[
          styles.subtleGlow,
          {
            opacity: glowAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0.1, 0.3],
            }),
          },
        ]}
      >
        <LinearGradient
          colors={[
            'transparent',
            `${glowColor}20`,
            `${glowColor}30`,
            `${glowColor}20`,
            'transparent',
          ]}
          style={styles.subtleGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        />
      </Animated.View>

      {/* Texte principal avec effet de lueur intégré */}
      <Text style={[style, styles.premiumText, { 
        textShadowColor: `${glowColor}80`,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 8,
      }]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtleGlow: {
    position: 'absolute',
    width: '120%',
    height: '150%',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtleGradient: {
    flex: 1,
    borderRadius: 8,
  },
  premiumText: {
    zIndex: 10,
    position: 'relative',
  },
});
