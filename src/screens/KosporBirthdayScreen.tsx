import { fonts } from '../theme';
/**
 * Écran spécial pour l'événement Kospor Birthday
 * Interface Premium avec animations et design moderne
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Animated,
  StatusBar,
  ImageBackground,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKosporBirthdayEvent } from '../hooks/useKosporBirthdayEvent';
import { useAuth } from '../contexts/AuthContext';
import { useUserChallenges } from '../hooks/useUserChallenges';
import { useUltraRareRewards } from '../hooks/useUltraRareRewards';
import VerifiedBadge from '../components/VerifiedBadge';
import { useChallengeProgress } from '../hooks/useChallengeProgress';
import { BackButton, ScreenSkeleton } from '../components/ui';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const COLORS = {
  // Palette moderne et premium
  primary: '#6366f1',
  primaryLight: '#8b5cf6',
  secondary: '#ec4899',
  accent: '#f59e0b',
  gold: '#fbbf24',
  
  // Dégradés background sophistiqués
  bgPrimary: '#0B0C0F',
  bgSecondary: '#1a1a3a',
  bgTertiary: '#2d1b69',
  
  // Textes avec meilleur contraste
  textPrimary: '#ffffff',
  textSecondary: '#e2e8f0',
  textMuted: '#94a3b8',
  textAccent: '#fbbf24',
  
  // États
  success: '#10b981',
  successLight: '#34d399',
  error: '#ef4444',
  warning: '#f59e0b',
  
  // Glass morphism
  glassBorder: 'rgba(255, 255, 255, 0.2)',
  glassBackground: 'rgba(255, 255, 255, 0.08)',
  glassBackgroundStrong: 'rgba(255, 255, 255, 0.12)',
  
  // Ombres et effets
  shadowDark: 'rgba(0, 0, 0, 0.4)',
  shadowLight: 'rgba(255, 255, 255, 0.1)',
};

// Composant de particules animées pour l'arrière-plan
const FloatingParticles = () => {
  const particles = Array.from({ length: 15 }, (_, i) => {
    const animValue = useRef(new Animated.Value(0)).current;
    const [randomDelay] = useState(Math.random() * 5000);
    const [randomSize] = useState(Math.random() * 4 + 2);
    const [randomOpacity] = useState(Math.random() * 0.6 + 0.2);

    useEffect(() => {
      const animate = () => {
        Animated.loop(
          Animated.sequence([
            Animated.timing(animValue, {
              toValue: 1,
              duration: 8000 + Math.random() * 4000,
              useNativeDriver: true,
            }),
            Animated.timing(animValue, {
              toValue: 0,
              duration: 0,
              useNativeDriver: true,
            }),
          ])
        ).start();
      };
      
      setTimeout(animate, randomDelay);
    }, []);

    return (
      <Animated.View
        key={i}
        style={[
          styles.particle,
          {
            left: `${Math.random() * 100}%`,
            width: randomSize,
            height: randomSize,
            opacity: randomOpacity,
            transform: [
              {
                translateY: animValue.interpolate({
                  inputRange: [0, 1],
                  outputRange: [screenHeight + 50, -50],
                }),
              },
              {
                translateX: animValue.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [0, Math.random() * 100 - 50, 0],
                }),
              },
            ],
          },
        ]}
      />
    );
  });

  return <View style={styles.particlesContainer}>{particles}</View>;
};

// Composant de carte challenge premium
const PremiumChallengeCard = ({ challenge, onClaim, index }) => {
  const [scaleAnim] = useState(new Animated.Value(0.95));
  const progress = (challenge.progress / challenge.max_progress) * 100;
  
  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      delay: index * 100,
      tension: 50,
      friction: 8,
      useNativeDriver: true,
    }).start();
  }, []);

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.96, duration: 100, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
  };

  return (
    <Animated.View style={[styles.challengeCard, { transform: [{ scale: scaleAnim }] }]}>
      <TouchableOpacity activeOpacity={0.9} onPress={handlePress}>
        <BlurView intensity={20} tint="dark" style={styles.challengeBlur}>
          <LinearGradient
            colors={
              challenge.completed
                ? ['rgba(16, 185, 129, 0.3)', 'rgba(16, 185, 129, 0.1)']
                : ['rgba(99, 102, 241, 0.3)', 'rgba(139, 92, 246, 0.2)']
            }
            style={styles.challengeGradientOverlay}
          >
            {/* Badge de statut */}
            <View style={styles.challengeStatusBadge}>
              {challenge.completed && challenge.claimed ? (
                <LinearGradient colors={[COLORS.success, COLORS.successLight]} style={styles.statusBadgeGradient}>
                  <Ionicons name="trophy" size={12} color="white" />
                  <Text style={styles.statusBadgeText}>Complété</Text>
                </LinearGradient>
              ) : challenge.completed ? (
                <LinearGradient colors={[COLORS.gold, COLORS.accent]} style={styles.statusBadgeGradient}>
                  <Ionicons name="gift" size={12} color="white" />
                  <Text style={styles.statusBadgeText}>À réclamer</Text>
                </LinearGradient>
              ) : (
                <View style={styles.statusBadgeInProgress}>
                  <Text style={styles.statusBadgeTextMuted}>En cours</Text>
                </View>
              )}
            </View>

            <View style={styles.challengeMainContent}>
              {/* Icône avec effet glow */}
              <View style={styles.challengeIconContainer}>
                <LinearGradient
                  colors={challenge.completed ? [COLORS.success, COLORS.successLight] : [COLORS.primary, COLORS.primaryLight]}
                  style={styles.challengeIconGradient}
                >
                  <Ionicons
                    name={challenge.metadata?.icon || 'trophy-outline'}
                    size={24}
                    color="white"
                  />
                </LinearGradient>
                {challenge.completed && (
                  <View style={styles.completedGlow} />
                )}
              </View>

              <View style={styles.challengeContent}>
                <Text style={styles.challengeTitle}>
                  {challenge.metadata?.title || challenge.challenge_id}
                </Text>
                <Text style={styles.challengeDescription}>
                  {challenge.metadata?.description || 'Défi en cours'}
                </Text>
                
                {/* Barre de progression premium */}
                <View style={styles.progressSection}>
                  <View style={styles.progressBarContainer}>
                    <View style={styles.progressBarBackground}>
                      <LinearGradient
                        colors={
                          challenge.completed
                            ? [COLORS.success, COLORS.successLight]
                            : [COLORS.primary, COLORS.primaryLight]
                        }
                        style={[styles.progressBarFill, { width: `${progress}%` }]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                      />
                    </View>
                  </View>
                  <Text style={styles.progressText}>
                    {challenge.progress}/{challenge.max_progress}
                  </Text>
                </View>
              </View>
            </View>

            {/* Section récompense */}
            <View style={styles.rewardSection}>
              <View style={styles.rewardInfo}>
                <Ionicons name="diamond" size={16} color={COLORS.gold} />
                <Text style={styles.rewardText}>
                  {challenge.metadata?.reward || '5 TWC'}
                </Text>
              </View>

              {challenge.completed && !challenge.claimed ? (
                <TouchableOpacity
                  style={styles.claimButton}
                  onPress={() => onClaim(challenge.challenge_id)}
                >
                  <LinearGradient
                    colors={[COLORS.gold, COLORS.accent]}
                    style={styles.claimButtonGradient}
                  >
                    <Ionicons name="gift" size={16} color="white" />
                    <Text style={styles.claimButtonText}>Réclamer</Text>
                  </LinearGradient>
                </TouchableOpacity>
              ) : challenge.claimed ? (
                <View style={styles.claimedIndicator}>
                  <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
                  <Text style={styles.claimedText}>Réclamé</Text>
                </View>
              ) : (
                <View style={styles.lockedIndicator}>
                  <Ionicons name="time-outline" size={16} color={COLORS.textMuted} />
                  <Text style={styles.lockedText}>En attente</Text>
                </View>
              )}
            </View>
          </LinearGradient>
        </BlurView>
      </TouchableOpacity>
    </Animated.View>
  );
};

export default function KosporBirthdayScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { isEventActive, isLoading, events } = useKosporBirthdayEvent();
  const { user } = useAuth();
  
  // Animations
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(50));
  const [headerScaleAnim] = useState(new Animated.Value(0.9));
  const pulseAnim = useRef(new Animated.Value(1)).current;
  
  // Hook pour gérer les défis
  const {
    challenges: userChallenges,
    stats,
    isLoading: challengesLoading,
    error: challengesError,
    refreshChallenges,
    updateChallengeProgress,
    claimChallengeReward,
    initializeChallenges,
    getChallengeById,
  } = useUserChallenges({
    eventSlug: 'kosporbirthday',
    autoRefresh: true,
    refreshInterval: 30000,
  });

  // Vérifier si tous les défis sont complétés
  const allChallengesCompleted = userChallenges.length > 0 && 
    userChallenges.every(challenge => challenge.completed);

  // Hook pour gérer les récompenses ultra rares
  const {
    ultraRareReward,
    canClaimReward,
    isClaiming,
    claimError,
    availableBadgeStyles,
    currentBadgeStyle,
    claimUltraRareReward,
    changeBadgeStyle,
  } = useUltraRareRewards({
    eventSlug: 'kosporbirthday',
    allChallengesCompleted,
  });

  // Hook pour gérer la progression des défis
  const {
    updateAllProgress,
    updateLikesProgress,
    refreshProgressSilently,
    refreshLikesProgressSilently,
  } = useChallengeProgress();

  // Animation de pulsation pour les éléments importants
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 2000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // Initialiser les défis
  useEffect(() => {
    if (isEventActive && userChallenges.length === 0 && !challengesLoading) {
      initializeChallenges();
    }
  }, [isEventActive, userChallenges.length, challengesLoading, initializeChallenges]);

  // Mettre à jour la progression des défis quand l'écran se charge
  useEffect(() => {
    if (isEventActive && user) {
      // Mettre à jour la progression en arrière-plan
      refreshProgressSilently('kosporbirthday');
    }
  }, [isEventActive, user, refreshProgressSilently]);

  // Animation d'entrée
  useEffect(() => {
    if (isEventActive) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.spring(headerScaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isEventActive]);

  const claimReward = async (challengeId: string) => {
    try {
      await claimChallengeReward(challengeId);
    } catch (error) {
      console.error('Erreur lors de la réclamation:', error);
    }
  };

  const goToKosporProfile = () => {
    (navigation as any).navigate('UserProfile', { username: 'g' });
  };

  const handleRefresh = async () => {
    await refreshChallenges();
    // Mettre à jour la progression des défis après le rafraîchissement
    await refreshProgressSilently('kosporbirthday');
  };

  if (!isEventActive) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.bgPrimary} />
        <LinearGradient colors={[COLORS.bgPrimary, COLORS.bgSecondary]} style={styles.inactiveGradient}>
          <BlurView intensity={20} tint="dark" style={styles.inactiveBlur}>
            <Ionicons name="lock-closed-outline" size={64} color={COLORS.primary} />
            <Text style={styles.inactiveTitle}>Événement Temporairement Fermé</Text>
            <Text style={styles.inactiveText}>
              La célébration Kospor Birthday reprendra bientôt !
            </Text>
          </BlurView>
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      
      {/* Background avec gradient premium */}
      <LinearGradient
        colors={[COLORS.bgPrimary, COLORS.bgTertiary, COLORS.bgSecondary]}
        style={styles.backgroundGradient}
      >
        <FloatingParticles />
        
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header premium avec effet glassmorphism */}
          <Animated.View
            style={[
              styles.headerContainer,
              {
                opacity: fadeAnim,
                transform: [
                  { scale: headerScaleAnim },
                  { translateY: slideAnim },
                ],
              },
            ]}
          >
            <BlurView intensity={30} tint="dark" style={styles.headerBlur}>
              <BackButton navigation={navigation} />

              <View style={styles.headerContent}>
                <Animated.View style={[styles.giftIconContainer, { transform: [{ scale: pulseAnim }] }]}>
                  <LinearGradient colors={[COLORS.gold, COLORS.accent]} style={styles.giftIconGradient}>
                    <Ionicons name="gift" size={32} color="white" />
                  </LinearGradient>
                  <View style={styles.giftIconGlow} />
                </Animated.View>
                
                <Text style={styles.headerTitle}>Anniversaire kospor!</Text>
                <Text style={styles.headerSubtitle}>🎉 Événement Exclusif 🎉</Text>
              </View>
            </BlurView>
          </Animated.View>

          {/* Contenu principal */}
          <Animated.View
            style={[
              styles.mainContent,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            {/* Carte de bienvenue premium */}
            <View style={styles.welcomeCard}>
              <BlurView intensity={25} tint="dark" style={styles.welcomeBlur}>
                <LinearGradient
                  colors={['rgba(99, 102, 241, 0.4)', 'rgba(139, 92, 246, 0.3)']}
                  style={styles.welcomeGradient}
                >
                  <View style={styles.welcomeHeader}>
                    <Text style={styles.welcomeTitle}>🎂 Célébration Exceptionnelle ! 🎂</Text>
                    <Text style={styles.welcomeSubtitle}>
                      Rejoignez la fête d'anniversaire de Kospor et débloquez des récompenses exclusives
                    </Text>
                  </View>
                </LinearGradient>
              </BlurView>
            </View>

            {/* Section défis premium */}
            <View style={styles.challengesSection}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleContainer}>
                  <LinearGradient colors={[COLORS.primary, COLORS.primaryLight]} style={styles.sectionIconGradient}>
                    <Ionicons name="trophy" size={20} color="white" />
                  </LinearGradient>
                  <Text style={styles.sectionTitle}>Défis Exclusifs</Text>
                </View>
                
                <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh}>
                  <BlurView intensity={20} tint="dark" style={styles.refreshBlur}>
                    <Ionicons name="refresh" size={18} color={COLORS.primary} />
                  </BlurView>
                </TouchableOpacity>
              </View>

              {challengesLoading ? (
                <ScreenSkeleton variant="list" count={4} />
              ) : challengesError ? (
                <BlurView intensity={20} tint="dark" style={styles.errorContainer}>
                  <Ionicons name="warning-outline" size={24} color={COLORS.error} />
                  <Text style={styles.errorText}>Une erreur s'est produite</Text>
                  <TouchableOpacity style={styles.retryButton} onPress={handleRefresh}>
                    <Text style={styles.retryButtonText}>Réessayer</Text>
                  </TouchableOpacity>
                </BlurView>
              ) : userChallenges.length === 0 ? (
                <BlurView intensity={20} tint="dark" style={styles.emptyContainer}>
                  <Ionicons name="sparkles-outline" size={32} color={COLORS.accent} />
                  <Text style={styles.emptyTitle}>Défis en préparation</Text>
                  <TouchableOpacity style={styles.initializeButton} onPress={initializeChallenges}>
                    <LinearGradient colors={[COLORS.primary, COLORS.primaryLight]} style={styles.initializeGradient}>
                      <Text style={styles.initializeButtonText}>Initialiser</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </BlurView>
              ) : (
                userChallenges.map((challenge, index) => (
                  <PremiumChallengeCard
                    key={challenge.id}
                    challenge={challenge}
                    onClaim={claimReward}
                    index={index}
                  />
                ))
              )}
            </View>

            {/* Section récompense ultra rare */}
            {ultraRareReward && (
              <View style={styles.ultraRareSection}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitleContainer}>
                    <LinearGradient colors={[COLORS.gold, COLORS.accent]} style={styles.sectionIconGradient}>
                      <Ionicons name="diamond" size={20} color="white" />
                    </LinearGradient>
                    <Text style={styles.sectionTitle}>Récompense Ultra Rare</Text>
                  </View>
                </View>

                <View style={styles.ultraRareCard}>
                  <BlurView intensity={25} tint="dark" style={styles.ultraRareBlur}>
                    <LinearGradient
                      colors={['rgba(255, 105, 180, 0.4)', 'rgba(255, 20, 147, 0.3)']}
                      style={styles.ultraRareGradient}
                    >
                      <View style={styles.ultraRareHeader}>
                        <View style={styles.ultraRareIconContainer}>
                          <VerifiedBadge 
                            verificationStyle="rose"
                            size={32} 
                            animated={true}
                          />
                          <View style={styles.ultraRareGlow} />
                        </View>
                        
                        <View style={styles.ultraRareContent}>
                          <Text style={styles.ultraRareTitle}>Badge Vérifié Rose Kospor</Text>
                          <Text style={styles.ultraRareDescription}>
                            Style de badge vérifié ultra rare en rose, disponible uniquement pour les participants ayant complété tous les défis
                          </Text>
                          
                          <View style={styles.ultraRareStats}>
                            <View style={styles.ultraRareStat}>
                              <Ionicons name="trophy" size={16} color={COLORS.gold} />
                              <Text style={styles.ultraRareStatText}>Ultra Rare</Text>
                            </View>
                            <View style={styles.ultraRareStat}>
                              <Ionicons name="people" size={16} color={COLORS.gold} />
                              <Text style={styles.ultraRareStatText}>1 exemplaire</Text>
                            </View>
                          </View>
                        </View>
                      </View>

                      {canClaimReward ? (
                        <TouchableOpacity 
                          style={styles.claimUltraRareButton}
                          onPress={claimUltraRareReward}
                          disabled={isClaiming}
                        >
                          <LinearGradient
                            colors={[COLORS.gold, COLORS.accent]}
                            style={styles.claimUltraRareGradient}
                          >
                            <Ionicons name="gift" size={20} color="white" />
                            <Text style={styles.claimUltraRareText}>
                              {isClaiming ? 'Réclamation...' : 'Réclamer la Récompense'}
                            </Text>
                          </LinearGradient>
                        </TouchableOpacity>
                      ) : (
                        <View style={styles.ultraRareStatus}>
                          <Ionicons 
                            name={allChallengesCompleted ? "checkmark-circle" : "lock-closed"} 
                            size={20} 
                            color={allChallengesCompleted ? COLORS.success : COLORS.textMuted} 
                          />
                          <Text style={[
                            styles.ultraRareStatusText,
                            { color: allChallengesCompleted ? COLORS.success : COLORS.textMuted }
                          ]}>
                            {allChallengesCompleted 
                              ? 'Tous les défis complétés !' 
                              : 'Complétez tous les défis pour débloquer'
                            }
                          </Text>
                        </View>
                      )}

                      {claimError && (
                        <Text style={styles.ultraRareError}>{claimError}</Text>
                      )}
                    </LinearGradient>
                  </BlurView>
                </View>
              </View>
            )}

            {/* Bouton profil Kospor premium */}
            <View style={styles.kosporSection}>
              <TouchableOpacity style={styles.kosporButton} onPress={goToKosporProfile}>
                <BlurView intensity={25} tint="dark" style={styles.kosporBlur}>
                  <LinearGradient
                    colors={[COLORS.secondary, '#f97316']}
                    style={styles.kosporGradient}
                  >
                    <View style={styles.kosporContent}>
                      <View style={styles.kosporIcon}>
                        <Ionicons name="person-circle" size={24} color="white" />
                      </View>
                      <View style={styles.kosporTextContainer}>
                        <Text style={styles.kosporTitle}>Profil de Kospor</Text>
                        <Text style={styles.kosporSubtitle}>Découvrir le créateur</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color="white" />
                    </View>
                  </LinearGradient>
                </BlurView>
              </TouchableOpacity>
            </View>

            {/* Message de fin premium */}
            <View style={styles.footerCard}>
              <BlurView intensity={20} tint="dark" style={styles.footerBlur}>
                <LinearGradient
                  colors={['rgba(251, 191, 36, 0.3)', 'rgba(245, 158, 11, 0.2)']}
                  style={styles.footerGradient}
                >
                  <Text style={styles.footerTitle}>✨ Merci de célébrer avec nous ! ✨</Text>
                  <Text style={styles.footerText}>
                    Cette expérience exclusive ne durera pas éternellement
                  </Text>
                </LinearGradient>
              </BlurView>
            </View>
          </Animated.View>
        </ScrollView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
  },
  backgroundGradient: {
    flex: 1,
  },
  particlesContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  particle: {
    position: 'absolute',
    backgroundColor: COLORS.primary,
    borderRadius: 2,
    opacity: 0.3,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  
  // Header premium
  headerContainer: {
    marginTop: Platform.OS === 'ios' ? 60 : StatusBar.currentHeight + 20,
    marginHorizontal: 20,
    marginBottom: 30,
  },
  headerBlur: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  backButton: {
    position: 'absolute',
    top: 20,
    left: 20,
    zIndex: 2,
  },
  backButtonGradient: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  headerContent: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  giftIconContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  giftIconGradient: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  giftIconGlow: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.gold,
    opacity: 0.2,
    top: -4,
    left: -4,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800', fontFamily: fonts.bold,
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    fontWeight: '500', fontFamily: fonts.medium,
  },

  // Contenu principal
  mainContent: {
    paddingHorizontal: 20,
  },

  // Carte de bienvenue
  welcomeCard: {
    marginBottom: 32,
  },
  welcomeBlur: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  welcomeGradient: {
    padding: 24,
  },
  welcomeHeader: {
    alignItems: 'center',
  },
  welcomeTitle: {
    fontSize: 22,
    fontWeight: '700', fontFamily: fonts.bold,
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  welcomeSubtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '400', fontFamily: fonts.regular,
  },

  // Section défis
  challengesSection: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionIconGradient: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '700', fontFamily: fonts.bold,
    color: COLORS.textPrimary,
  },
  refreshButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  refreshBlur: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },

  // Cartes de défis premium
  challengeCard: {
    marginBottom: 16,
  },
  challengeBlur: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  challengeGradientOverlay: {
    padding: 20,
  },
  challengeStatusBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 1,
  },
  statusBadgeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  statusBadgeInProgress: {
    backgroundColor: COLORS.glassBackground,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  statusBadgeText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  statusBadgeTextMuted: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '500', fontFamily: fonts.medium,
  },
  challengeMainContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    marginTop: 20,
  },
  challengeIconContainer: {
    position: 'relative',
    marginRight: 16,
  },
  challengeIconGradient: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  completedGlow: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.success,
    opacity: 0.3,
    top: -4,
    left: -4,
  },
  challengeContent: {
    flex: 1,
  },
  challengeTitle: {
    fontSize: 18,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: COLORS.textPrimary,
    marginBottom: 6,
  },
  challengeDescription: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 12,
    lineHeight: 20,
  },
  progressSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressBarContainer: {
    flex: 1,
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: COLORS.glassBackground,
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 13,
    color: COLORS.textAccent,
    fontWeight: '600', fontFamily: fonts.semibold,
    minWidth: 50,
    textAlign: 'right',
  },

  // Section récompense
  rewardSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.glassBorder,
  },
  rewardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rewardText: {
    fontSize: 15,
    color: COLORS.gold,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  claimButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  claimButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
  },
  claimButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  claimedIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.glassBackground,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  claimedText: {
    fontSize: 13,
    color: COLORS.success,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  lockedIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  lockedText: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: '500', fontFamily: fonts.medium,
  },

  // États des défis
  loadingContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 16,
    fontWeight: '500', fontFamily: fonts.medium,
    marginTop: 12,
    textAlign: 'center',
  },
  errorContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 16,
    fontWeight: '500', fontFamily: fonts.medium,
    marginTop: 12,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  emptyContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyTitle: {
    color: COLORS.textSecondary,
    fontSize: 18,
    fontWeight: '600', fontFamily: fonts.semibold,
    marginTop: 12,
    marginBottom: 16,
  },
  initializeButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  initializeGradient: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  initializeButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600', fontFamily: fonts.semibold,
  },

  // Section récompense ultra rare
  ultraRareSection: {
    marginBottom: 32,
  },
  ultraRareCard: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  ultraRareBlur: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 105, 180, 0.3)',
  },
  ultraRareGradient: {
    padding: 24,
  },
  ultraRareHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  ultraRareIconContainer: {
    position: 'relative',
    marginRight: 16,
  },
  ultraRareGlow: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ff69b4',
    opacity: 0.3,
    top: -4,
    left: -4,
  },
  ultraRareContent: {
    flex: 1,
  },
  ultraRareTitle: {
    fontSize: 20,
    fontWeight: '700', fontFamily: fonts.bold,
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  ultraRareDescription: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  ultraRareStats: {
    flexDirection: 'row',
    gap: 16,
  },
  ultraRareStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ultraRareStatText: {
    fontSize: 12,
    color: COLORS.gold,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  claimUltraRareButton: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 16,
  },
  claimUltraRareGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 8,
  },
  claimUltraRareText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700', fontFamily: fonts.bold,
  },
  ultraRareStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  ultraRareStatusText: {
    fontSize: 14,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  ultraRareError: {
    color: COLORS.error,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },

  // Section Kospor
  kosporSection: {
    marginBottom: 32,
  },
  kosporButton: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  kosporBlur: {
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  kosporGradient: {
    padding: 4,
  },
  kosporContent: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.glassBackground,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  kosporIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.glassBackground,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  kosporTextContainer: {
    flex: 1,
  },
  kosporTitle: {
    fontSize: 18,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  kosporSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '400', fontFamily: fonts.regular,
  },

  // Footer premium
  footerCard: {
    marginBottom: 20,
  },
  footerBlur: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  footerGradient: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 24,
  },
  footerTitle: {
    fontSize: 20,
    fontWeight: '700', fontFamily: fonts.bold,
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  footerText: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    fontWeight: '400', fontFamily: fonts.regular,
  },

  // État inactif premium
  inactiveGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  inactiveBlur: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 32,
    backgroundColor: COLORS.glassBackground,
  },
  inactiveTitle: {
    fontSize: 24,
    fontWeight: '700', fontFamily: fonts.bold,
    color: COLORS.textPrimary,
    marginTop: 20,
    marginBottom: 12,
    textAlign: 'center',
  },
  inactiveText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '400', fontFamily: fonts.regular,
  },
});
