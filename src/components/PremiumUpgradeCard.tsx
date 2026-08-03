import { fonts } from '../theme';
import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface PremiumUpgradeCardProps {
  isPremium: boolean;
  onUpgrade?: () => void;
}

const PREMIUM_FEATURES = [
  {
    icon: 'color-palette',
    title: 'Arrière-plans Animés',
    description: '10 arrière-plans exclusifs avec particules, galaxies et effets cyberpunk',
  },
  {
    icon: 'diamond',
    title: 'Badges Premium',
    description: '9 badges animés personnalisables : Diamant, Couronne, Dragon...',
  },
  {
    icon: 'sparkles',
    title: 'Effets de Profil',
    description: '7 effets visuels pour votre photo : Arc-en-ciel, Galaxie, Aurore...',
  },
  {
    icon: 'trending-up',
    title: 'Algorithme TikTok-Level',
    description: 'Recommandations ultra-personnalisées avec 12 modèles IA',
  },
  {
    icon: 'flash',
    title: 'Accès Prioritaire',
    description: 'Fonctionnalités en avant-première et support premium',
  },
  {
    icon: 'infinite',
    title: 'Personnalisation Illimitée',
    description: 'Changez de thème et d\'effet autant que vous voulez',
  },
];

export default function PremiumUpgradeCard({ isPremium, onUpgrade }: PremiumUpgradeCardProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const particleAnims = useRef(
    Array.from({ length: 6 }, () => new Animated.Value(0))
  ).current;

  useEffect(() => {
    if (isPremium) return;

    // Animation de pulsation pour attirer l'attention
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

    // Animation shimmer
    const shimmerAnimation = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 3000,
        useNativeDriver: true,
      })
    );

    // Animations des particules
    const particleAnimations = particleAnims.map((anim, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 300),
          Animated.timing(anim, {
            toValue: 1,
            duration: 2000,
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

    pulseAnimation.start();
    shimmerAnimation.start();
    particleAnimations.forEach(anim => anim.start());

    return () => {
      pulseAnimation.stop();
      shimmerAnimation.stop();
      particleAnimations.forEach(anim => anim.stop());
    };
  }, [isPremium]);

  const handleUpgrade = () => {
    if (onUpgrade) {
      onUpgrade();
    } else {
      Alert.alert(
        '🚀 TwitNin Premium',
        'Transformez votre expérience avec des fonctionnalités exclusives !',
        [
          { text: 'Plus tard', style: 'cancel' },
          { text: 'Découvrir Premium', onPress: () => {/* Navigation vers premium */} }
        ]
      );
    }
  };

  if (isPremium) {
    return (
      <View style={styles.premiumStatusCard}>
        <LinearGradient
          colors={['#ff6b6b', '#ff8e53', '#ffad5a']}
          style={styles.statusGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.statusContent}>
            <Ionicons name="diamond" size={32} color="#ffffff" />
            <Text style={styles.statusTitle}>Premium Actif</Text>
            <Text style={styles.statusDescription}>
              Profitez de toutes les fonctionnalités exclusives !
            </Text>
            
            <View style={styles.premiumStats}>
              <View style={styles.statItem}>
                <Ionicons name="color-palette" size={20} color="#ffffff" />
                <Text style={styles.statText}>10 Arrière-plans</Text>
              </View>
              <View style={styles.statItem}>
                <Ionicons name="diamond" size={20} color="#ffffff" />
                <Text style={styles.statText}>9 Badges</Text>
              </View>
              <View style={styles.statItem}>
                <Ionicons name="sparkles" size={20} color="#ffffff" />
                <Text style={styles.statText}>7 Effets</Text>
              </View>
            </View>
          </View>

          {/* Particules de célébration */}
          {particleAnims.map((anim, index) => (
            <Animated.View
              key={index}
              style={[
                styles.celebrationParticle,
                {
                  left: Math.random() * 250,
                  top: Math.random() * 100,
                  opacity: anim,
                  transform: [
                    {
                      translateY: anim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, -20],
                      }),
                    },
                    {
                      scale: anim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.5, 1.5],
                      }),
                    },
                  ],
                },
              ]}
            />
          ))}
        </LinearGradient>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={styles.upgradeCard}
      onPress={handleUpgrade}
      activeOpacity={0.9}
    >
      <Animated.View
        style={[
          styles.cardContent,
          {
            transform: [{ scale: pulseAnim }],
          },
        ]}
      >
        <LinearGradient
          colors={['#667eea', '#764ba2', '#f093fb']}
          style={styles.upgradeGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          {/* Effet shimmer */}
          <Animated.View
            style={[
              styles.shimmerOverlay,
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
              colors={['transparent', 'rgba(255, 255, 255, 0.3)', 'transparent']}
              style={styles.shimmerGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            />
          </Animated.View>

          <View style={styles.upgradeHeader}>
            <Ionicons name="diamond" size={40} color="#ffffff" />
            <Text style={styles.upgradeTitle}>Passer à Premium</Text>
            <Text style={styles.upgradeSubtitle}>
              Débloquez des fonctionnalités exclusives style Discord Nitro
            </Text>
          </View>

          <View style={styles.featuresContainer}>
            {PREMIUM_FEATURES.map((feature, index) => (
              <View key={index} style={styles.featureItem}>
                <View style={styles.featureIcon}>
                  <Ionicons name={feature.icon as any} size={20} color="#ffffff" />
                </View>
                <View style={styles.featureContent}>
                  <Text style={styles.featureTitle}>{feature.title}</Text>
                  <Text style={styles.featureDescription}>{feature.description}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.ctaContainer}>
            <Text style={styles.ctaPrice}>Seulement 4.99€/mois</Text>
            <View style={styles.ctaButton}>
              <Ionicons name="arrow-forward" size={20} color="#ffffff" />
              <Text style={styles.ctaText}>Découvrir Premium</Text>
            </View>
          </View>

          {/* Particules flottantes */}
          {particleAnims.map((anim, index) => (
            <Animated.View
              key={index}
              style={[
                styles.floatingParticle,
                {
                  left: Math.random() * 280,
                  top: Math.random() * 400,
                  opacity: anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.3, 0.8],
                  }),
                  transform: [
                    {
                      translateY: anim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, -30],
                      }),
                    },
                  ],
                },
              ]}
            />
          ))}
        </LinearGradient>
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  upgradeCard: {
    margin: 20,
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
  },
  cardContent: {
    position: 'relative',
  },
  upgradeGradient: {
    padding: 25,
    position: 'relative',
    overflow: 'hidden',
  },
  shimmerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 100,
  },
  shimmerGradient: {
    width: 100,
    height: '100%',
  },
  upgradeHeader: {
    alignItems: 'center',
    marginBottom: 25,
  },
  upgradeTitle: {
    fontSize: 28,
    fontWeight: '800', fontFamily: fonts.bold,
    color: '#ffffff',
    marginTop: 10,
    textAlign: 'center',
  },
  upgradeSubtitle: {
    fontSize: 16,
    color: '#ffffff',
    opacity: 0.9,
    textAlign: 'center',
    marginTop: 5,
  },
  featuresContainer: {
    gap: 15,
    marginBottom: 25,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '700', fontFamily: fonts.bold,
    color: '#ffffff',
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 14,
    color: '#ffffff',
    opacity: 0.8,
    lineHeight: 18,
  },
  ctaContainer: {
    alignItems: 'center',
    gap: 10,
  },
  ctaPrice: {
    fontSize: 20,
    fontWeight: '700', fontFamily: fonts.bold,
    color: '#ffffff',
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    gap: 8,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: '#ffffff',
  },
  floatingParticle: {
    position: 'absolute',
    width: 6,
    height: 6,
    backgroundColor: '#ffffff',
    borderRadius: 3,
  },
  premiumStatusCard: {
    margin: 20,
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 8,
  },
  statusGradient: {
    padding: 25,
    position: 'relative',
  },
  statusContent: {
    alignItems: 'center',
  },
  statusTitle: {
    fontSize: 24,
    fontWeight: '800', fontFamily: fonts.bold,
    color: '#ffffff',
    marginTop: 10,
  },
  statusDescription: {
    fontSize: 16,
    color: '#ffffff',
    opacity: 0.9,
    textAlign: 'center',
    marginTop: 5,
    marginBottom: 20,
  },
  premiumStats: {
    flexDirection: 'row',
    gap: 20,
  },
  statItem: {
    alignItems: 'center',
    gap: 5,
  },
  statText: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  celebrationParticle: {
    position: 'absolute',
    width: 8,
    height: 8,
    backgroundColor: '#ffffff',
    borderRadius: 4,
  },
});
