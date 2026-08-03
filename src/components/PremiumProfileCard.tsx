import { fonts } from '../theme';
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import PremiumBadge from './PremiumBadge';

interface PremiumProfileCardProps {
  isPremium: boolean;
  onUpgrade?: () => void;
  style?: any;
}

export default function PremiumProfileCard({ 
  isPremium, 
  onUpgrade,
  style 
}: PremiumProfileCardProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isPremium) {
      // Animation pour encourager l'upgrade
      const pulseAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
        ])
      );

      const shimmerAnimation = Animated.loop(
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        })
      );

      pulseAnimation.start();
      shimmerAnimation.start();

      return () => {
        pulseAnimation.stop();
        shimmerAnimation.stop();
      };
    } else {
      // Animation de célébration pour les premium
      const floatAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(floatAnim, {
            toValue: 1,
            duration: 3000,
            useNativeDriver: true,
          }),
          Animated.timing(floatAnim, {
            toValue: 0,
            duration: 3000,
            useNativeDriver: true,
          }),
        ])
      );

      floatAnimation.start();

      return () => {
        floatAnimation.stop();
      };
    }
  }, [isPremium]);

  if (isPremium) {
    return (
      <Animated.View
        style={[
          styles.premiumCard,
          {
            transform: [
              {
                translateY: floatAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -5],
                }),
              },
            ],
          },
          style,
        ]}
      >
        <LinearGradient
          colors={['#ff6b6b', '#ff8e53', '#ffad5a']}
          style={styles.premiumGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.premiumContent}>
            <View style={styles.premiumHeader}>
              <Ionicons name="diamond" size={24} color="#ffffff" />
              <Text style={styles.premiumTitle}>Membre Premium</Text>
            </View>
            
            <Text style={styles.premiumDescription}>
              Bannière perso, contour animé sur la photo, avantages timeline.
            </Text>

            <View style={styles.premiumFeatures}>
              <View style={styles.feature}>
                <Ionicons name="image-outline" size={16} color="#ffffff" />
                <Text style={styles.featureText}>Bannière de profil à toi</Text>
              </View>
              <View style={styles.feature}>
                <Ionicons name="sparkles" size={16} color="#ffffff" />
                <Text style={styles.featureText}>Contour photo animé (Plus/Pro)</Text>
              </View>
              <View style={styles.feature}>
                <Ionicons name="trending-up" size={16} color="#ffffff" />
                <Text style={styles.featureText}>Algorithmes avancés</Text>
              </View>
              <View style={styles.feature}>
                <Ionicons name="flash" size={16} color="#ffffff" />
                <Text style={styles.featureText}>Accès prioritaire</Text>
              </View>
            </View>
          </View>

          {/* Particules flottantes */}
          {[...Array(8)].map((_, index) => (
            <Animated.View
              key={index}
              style={[
                styles.particle,
                {
                  left: Math.random() * 250,
                  top: Math.random() * 120,
                  opacity: floatAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.3, 0.8],
                  }),
                  transform: [
                    {
                      scale: floatAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.5, 1],
                      }),
                    },
                  ],
                },
              ]}
            />
          ))}
        </LinearGradient>
      </Animated.View>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.upgradeCard, style]}
      onPress={onUpgrade}
      activeOpacity={0.8}
    >
      <Animated.View
        style={[
          styles.upgradeContent,
          {
            transform: [{ scale: pulseAnim }],
          },
        ]}
      >
        <LinearGradient
          colors={['rgba(255, 107, 107, 0.2)', 'rgba(255, 142, 83, 0.2)']}
          style={styles.upgradeGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.upgradeHeader}>
            <Ionicons name="diamond-outline" size={28} color="#ff6b6b" />
            <Text style={styles.upgradeTitle}>Passer à Premium</Text>
          </View>
          
          <Text style={styles.upgradeDescription}>
            Bannière personnalisable, contour animé autour de la photo, et bien plus encore.
          </Text>

          <View style={styles.upgradeFeatures}>
            <View style={styles.upgradeFeature}>
              <Ionicons name="checkmark-circle" size={16} color="#00ff80" />
              <Text style={styles.upgradeFeatureText}>Bannière + contour animé premium</Text>
            </View>
            <View style={styles.upgradeFeature}>
              <Ionicons name="checkmark-circle" size={16} color="#00ff80" />
              <Text style={styles.upgradeFeatureText}>Algorithmes TikTok-Level</Text>
            </View>
            <View style={styles.upgradeFeature}>
              <Ionicons name="checkmark-circle" size={16} color="#00ff80" />
              <Text style={styles.upgradeFeatureText}>Badge premium animé</Text>
            </View>
          </View>

          <View style={styles.upgradeButton}>
            <PremiumBadge type="large" animated={true} />
          </View>

          {/* Effet shimmer */}
          <Animated.View
            style={[
              styles.shimmer,
              {
                transform: [
                  {
                    translateX: shimmerAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-300, 300],
                    }),
                  },
                ],
              },
            ]}
          >
            <LinearGradient
              colors={['transparent', 'rgba(255, 255, 255, 0.2)', 'transparent']}
              style={{ width: 100, height: '100%' }}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            />
          </Animated.View>
        </LinearGradient>
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  premiumCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginVertical: 15,
  },
  premiumGradient: {
    padding: 20,
    position: 'relative',
  },
  premiumContent: {
    position: 'relative',
    zIndex: 10,
  },
  premiumHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  premiumTitle: {
    fontSize: 20,
    fontWeight: '800', fontFamily: fonts.bold,
    color: '#ffffff',
    marginLeft: 10,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  premiumDescription: {
    fontSize: 16,
    color: '#ffffff',
    marginBottom: 15,
    opacity: 0.9,
  },
  premiumFeatures: {
    gap: 8,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  particle: {
    position: 'absolute',
    width: 4,
    height: 4,
    backgroundColor: '#ffffff',
    borderRadius: 2,
  },
  upgradeCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginVertical: 15,
    borderWidth: 2,
    borderColor: 'rgba(255, 107, 107, 0.3)',
  },
  upgradeContent: {
    position: 'relative',
  },
  upgradeGradient: {
    padding: 20,
  },
  upgradeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  upgradeTitle: {
    fontSize: 18,
    fontWeight: '700', fontFamily: fonts.bold,
    color: '#ffffff',
    marginLeft: 10,
  },
  upgradeDescription: {
    fontSize: 14,
    color: '#9BA1AC',
    marginBottom: 15,
    lineHeight: 20,
  },
  upgradeFeatures: {
    gap: 8,
    marginBottom: 20,
  },
  upgradeFeature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  upgradeFeatureText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '500', fontFamily: fonts.medium,
  },
  upgradeButton: {
    alignItems: 'center',
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
});
