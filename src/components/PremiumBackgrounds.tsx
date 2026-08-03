import React, { useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  Dimensions,
  ImageBackground,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface PremiumBackgroundsProps {
  backgroundType: 'none' | 'gradient' | 'animated' | 'particles' | 'waves' | 'galaxy' | 'matrix' | 'neon' | 'cyberpunk' | 'aurora';
  children: React.ReactNode;
  isPremium: boolean;
  intensity?: number;
}

export default function PremiumBackgrounds({ 
  backgroundType, 
  children, 
  isPremium,
  intensity = 1 
}: PremiumBackgroundsProps) {
  const animatedValue = useRef(new Animated.Value(0)).current;
  const particleAnims = useRef(
    Array.from({ length: 20 }, () => new Animated.Value(0))
  ).current;
  const waveAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isPremium || backgroundType === 'none') return;

    // Animation continue pour les effets dynamiques
    const mainAnimation = Animated.loop(
      Animated.timing(animatedValue, {
        toValue: 1,
        duration: 8000,
        useNativeDriver: true,
      })
    );

    // Animation des particules
    const particleAnimations = particleAnims.map((anim, index) => 
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 200),
          Animated.timing(anim, {
            toValue: 1,
            duration: 3000 + Math.random() * 2000,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      )
    );

    // Animation des vagues
    const waveAnimation = Animated.loop(
      Animated.timing(waveAnim, {
        toValue: 1,
        duration: 4000,
        useNativeDriver: true,
      })
    );

    mainAnimation.start();
    particleAnimations.forEach(anim => anim.start());
    waveAnimation.start();

    return () => {
      mainAnimation.stop();
      particleAnimations.forEach(anim => anim.stop());
      waveAnimation.stop();
    };
  }, [backgroundType, isPremium]);

  if (!isPremium || backgroundType === 'none') {
    return <View style={styles.container}>{children}</View>;
  }

  const renderBackground = () => {
    switch (backgroundType) {
      case 'gradient':
        return (
          <LinearGradient
            colors={['#15171C', '#1B1E25', '#0f3460']}
            style={StyleSheet.absoluteFillObject}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        );

      case 'animated':
        return (
          <Animated.View style={[
            StyleSheet.absoluteFillObject,
            {
              opacity: animatedValue.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [0.3, 0.8, 0.3],
              }),
            }
          ]}>
            <LinearGradient
              colors={['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4']}
              style={StyleSheet.absoluteFillObject}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
          </Animated.View>
        );

      case 'particles':
        return (
          <View style={StyleSheet.absoluteFillObject}>
            <LinearGradient
              colors={['#0c0c0c', '#15171C', '#1B1E25']}
              style={StyleSheet.absoluteFillObject}
            />
            {particleAnims.map((anim, index) => (
              <Animated.View
                key={index}
                style={[
                  styles.particle,
                  {
                    left: Math.random() * screenWidth,
                    top: Math.random() * screenHeight,
                    opacity: anim.interpolate({
                      inputRange: [0, 0.5, 1],
                      outputRange: [0, 1, 0],
                    }),
                    transform: [
                      {
                        scale: anim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.5, 2],
                        }),
                      },
                      {
                        translateY: anim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, -100],
                        }),
                      },
                    ],
                  },
                ]}
              />
            ))}
          </View>
        );

      case 'waves':
        return (
          <View style={StyleSheet.absoluteFillObject}>
            <LinearGradient
              colors={['#667eea', '#764ba2']}
              style={StyleSheet.absoluteFillObject}
            />
            {[...Array(3)].map((_, index) => (
              <Animated.View
                key={index}
                style={[
                  styles.wave,
                  {
                    bottom: -50 + index * 30,
                    transform: [
                      {
                        translateX: waveAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [-screenWidth, screenWidth],
                        }),
                      },
                    ],
                    opacity: 0.3 - index * 0.1,
                  },
                ]}
              >
                <LinearGradient
                  colors={['transparent', '#ffffff40', 'transparent']}
                  style={styles.waveGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                />
              </Animated.View>
            ))}
          </View>
        );

      case 'galaxy':
        return (
          <View style={StyleSheet.absoluteFillObject}>
            <LinearGradient
              colors={['#000000', '#1a0033', '#330066', '#660099']}
              style={StyleSheet.absoluteFillObject}
            />
            <Animated.View
              style={[
                StyleSheet.absoluteFillObject,
                {
                  transform: [
                    {
                      rotate: animatedValue.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0deg', '360deg'],
                      }),
                    },
                  ],
                },
              ]}
            >
              {[...Array(50)].map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.star,
                    {
                      left: Math.random() * screenWidth,
                      top: Math.random() * screenHeight,
                      opacity: Math.random() * 0.8 + 0.2,
                    },
                  ]}
                />
              ))}
            </Animated.View>
          </View>
        );

      case 'matrix':
        return (
          <View style={StyleSheet.absoluteFillObject}>
            <LinearGradient
              colors={['#000000', '#001100', '#002200']}
              style={StyleSheet.absoluteFillObject}
            />
            {[...Array(15)].map((_, index) => (
              <Animated.View
                key={index}
                style={[
                  styles.matrixLine,
                  {
                    left: (index * screenWidth) / 15,
                    transform: [
                      {
                        translateY: animatedValue.interpolate({
                          inputRange: [0, 1],
                          outputRange: [-screenHeight, screenHeight],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <LinearGradient
                  colors={['transparent', '#00ff00', 'transparent']}
                  style={styles.matrixGradient}
                />
              </Animated.View>
            ))}
          </View>
        );

      case 'neon':
        return (
          <View style={StyleSheet.absoluteFillObject}>
            <LinearGradient
              colors={['#0a0a0a', '#1a0a1a', '#2a0a2a']}
              style={StyleSheet.absoluteFillObject}
            />
            <Animated.View
              style={[
                StyleSheet.absoluteFillObject,
                {
                  opacity: animatedValue.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0.2, 1, 0.2],
                  }),
                },
              ]}
            >
              <View style={styles.neonGrid} />
            </Animated.View>
          </View>
        );

      case 'cyberpunk':
        return (
          <View style={StyleSheet.absoluteFillObject}>
            <LinearGradient
              colors={['#0a0a0a', '#ff006e', '#8338ec', '#3a86ff']}
              style={StyleSheet.absoluteFillObject}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            <BlurView intensity={20} style={StyleSheet.absoluteFillObject} />
            <Animated.View
              style={[
                styles.cyberpunkOverlay,
                {
                  opacity: animatedValue.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.1, 0.3],
                  }),
                },
              ]}
            />
          </View>
        );

      case 'aurora':
        return (
          <View style={StyleSheet.absoluteFillObject}>
            <LinearGradient
              colors={['#000428', '#004e92']}
              style={StyleSheet.absoluteFillObject}
            />
            <Animated.View
              style={[
                StyleSheet.absoluteFillObject,
                {
                  transform: [
                    {
                      translateX: animatedValue.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-50, 50],
                      }),
                    },
                  ],
                },
              ]}
            >
              <LinearGradient
                colors={['transparent', '#00ff88', '#0088ff', '#ff0088', 'transparent']}
                style={StyleSheet.absoluteFillObject}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              />
            </Animated.View>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      {renderBackground()}
      <View style={styles.content}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    zIndex: 10,
  },
  particle: {
    position: 'absolute',
    width: 4,
    height: 4,
    backgroundColor: '#ffffff',
    borderRadius: 2,
  },
  wave: {
    position: 'absolute',
    width: screenWidth * 2,
    height: 60,
  },
  waveGradient: {
    flex: 1,
    borderRadius: 30,
  },
  star: {
    position: 'absolute',
    width: 2,
    height: 2,
    backgroundColor: '#ffffff',
    borderRadius: 1,
  },
  matrixLine: {
    position: 'absolute',
    width: 2,
    height: screenHeight,
  },
  matrixGradient: {
    flex: 1,
  },
  neonGrid: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 1,
    borderColor: '#00ffff',
    shadowColor: '#00ffff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
  },
  cyberpunkOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#ff006e',
  },
});
