import { fonts } from '../theme';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface UltraRecommendationBannerProps {
  isVisible: boolean;
  algorithm: string;
  onDismiss: () => void;
}

const { width } = Dimensions.get('window');

export default function UltraRecommendationBanner({ 
  isVisible, 
  algorithm, 
  onDismiss 
}: UltraRecommendationBannerProps) {
  const [slideAnim] = useState(new Animated.Value(-100));
  const [glowAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    if (isVisible) {
      // Animation d'entrée
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 100,
          friction: 8,
        }),
        Animated.loop(
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
        ),
      ]).start();
    } else {
      // Animation de sortie
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [isVisible]);

  const getAlgorithmInfo = (algo: string) => {
    switch (algo) {
      case 'ultra_power':
        return {
          name: 'Ultra Power',
          description: 'IA Révolutionnaire Activée',
          icon: 'rocket',
          colors: ['#ff6b6b', '#ee5a24'],
          emoji: '🚀'
        };
      case 'ultra_hybrid':
        return {
          name: 'Ultra Hybrid',
          description: 'Fusion Multi-Algorithmique',
          icon: 'flash',
          colors: ['#4834d4', '#3742fa'],
          emoji: '⚡'
        };
      case 'ultra_advanced':
        return {
          name: 'Ultra Advanced',
          description: 'Machine Learning Avancé',
          icon: 'pulse',
          colors: ['#00d2d3', '#0abde3'],
          emoji: '🧠'
        };
      default:
        return {
          name: 'Ultra',
          description: 'Algorithme Avancé',
          icon: 'star',
          colors: ['#4F7CFF', '#0984e3'],
          emoji: '✨'
        };
    }
  };

  if (!isVisible) return null;

  const algorithmInfo = getAlgorithmInfo(algorithm);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <LinearGradient
        colors={algorithmInfo.colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <Animated.View
          style={[
            styles.glowEffect,
            {
              opacity: glowAnim,
            },
          ]}
        />
        
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Text style={styles.emoji}>{algorithmInfo.emoji}</Text>
          </View>
          
          <View style={styles.textContainer}>
            <Text style={styles.title}>{algorithmInfo.name}</Text>
            <Text style={styles.description}>{algorithmInfo.description}</Text>
          </View>
          
          <TouchableOpacity
            style={styles.dismissButton}
            onPress={onDismiss}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={20} color="#ffffff" />
          </TouchableOpacity>
        </View>
        
        <View style={styles.features}>
          <View style={styles.feature}>
            <Ionicons name="checkmark-circle" size={14} color="#ffffff" />
            <Text style={styles.featureText}>8 Phases d'Analyse</Text>
          </View>
          <View style={styles.feature}>
            <Ionicons name="checkmark-circle" size={14} color="#ffffff" />
            <Text style={styles.featureText}>6 Modèles ML</Text>
          </View>
          <View style={styles.feature}>
            <Ionicons name="checkmark-circle" size={14} color="#ffffff" />
            <Text style={styles.featureText}>Prédiction Virale</Text>
          </View>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    elevation: 1000,
  },
  gradient: {
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomLeftRadius: 15,
    borderBottomRightRadius: 15,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  glowEffect: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderBottomLeftRadius: 15,
    borderBottomRightRadius: 15,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  emoji: {
    fontSize: 20,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '800', fontFamily: fonts.bold,
    color: '#ffffff',
    marginBottom: 2,
  },
  description: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '500', fontFamily: fonts.medium,
  },
  dismissButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  features: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 8,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  featureText: {
    fontSize: 10,
    color: '#ffffff',
    fontWeight: '600', fontFamily: fonts.semibold,
    marginLeft: 4,
  },
});
