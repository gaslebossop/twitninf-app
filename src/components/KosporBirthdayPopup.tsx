import { fonts , colors} from '../theme';
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
  Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useKosporBirthdayEvent } from '../hooks/useKosporBirthdayEvent';
import MaskedView from '@react-native-masked-view/masked-view';
import { navigationRef } from '../navigation/NavigationService';

const { width, height } = Dimensions.get('window');

interface KosporBirthdayPopupProps {
  visible: boolean;
  onClose: () => void;
  onNavigateToKosporBirthday?: () => void;
}

export default function KosporBirthdayPopup({ visible, onClose, onNavigateToKosporBirthday }: KosporBirthdayPopupProps) {
  const { isEventActive, events } = useKosporBirthdayEvent();
  
  // Animations principales
  const [fadeAnim] = useState(new Animated.Value(0));
  const [scaleAnim] = useState(new Animated.Value(0.3));
  const [rotateAnim] = useState(new Animated.Value(0));
  const [pulseAnim] = useState(new Animated.Value(1));
  const [slideAnim] = useState(new Animated.Value(50));
  
  // Animations des particules
  const particleAnims = useRef(
    [...Array(20)].map(() => ({
      translateY: new Animated.Value(0),
      translateX: new Animated.Value(0),
      opacity: new Animated.Value(0),
      scale: new Animated.Value(0),
    }))
  ).current;

  // Animation du confetti
  const confettiAnims = useRef(
    [...Array(30)].map(() => ({
      translateY: new Animated.Value(-100),
      translateX: new Animated.Value(0),
      rotate: new Animated.Value(0),
      opacity: new Animated.Value(1),
    }))
  ).current;

  useEffect(() => {
    if (visible) {
      // Animation d'entrée orchestrée
      Animated.sequence([
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.spring(scaleAnim, {
            toValue: 1,
            tension: 65,
            friction: 8,
            useNativeDriver: true,
          }),
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 500,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ]).start(() => {
        startContinuousAnimations();
        startParticleAnimation();
        startConfettiAnimation();
      });
    }
  }, [visible]);

  const startContinuousAnimations = () => {
    // Rotation continue de l'icône
    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 8000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    // Pulsation du bouton principal
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const startParticleAnimation = () => {
    particleAnims.forEach((anim, index) => {
      const delay = index * 100;
      const duration = 2000 + Math.random() * 1000;
      
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(anim.translateY, {
              toValue: -height,
              duration,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(anim.translateX, {
              toValue: (Math.random() - 0.5) * 100,
              duration,
              useNativeDriver: true,
            }),
            Animated.sequence([
              Animated.timing(anim.opacity, {
                toValue: 1,
                duration: duration * 0.3,
                useNativeDriver: true,
              }),
              Animated.timing(anim.opacity, {
                toValue: 0,
                duration: duration * 0.7,
                useNativeDriver: true,
              }),
            ]),
            Animated.timing(anim.scale, {
              toValue: 1 + Math.random() * 0.5,
              duration,
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(anim.translateY, {
              toValue: 0,
              duration: 0,
              useNativeDriver: true,
            }),
            Animated.timing(anim.translateX, {
              toValue: 0,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
        ])
      ).start();
    });
  };

  const startConfettiAnimation = () => {
    confettiAnims.forEach((anim, index) => {
      const delay = Math.random() * 2000;
      const duration = 3000 + Math.random() * 2000;
      
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(anim.translateY, {
              toValue: height + 100,
              duration,
              easing: Easing.quad,
              useNativeDriver: true,
            }),
            Animated.timing(anim.translateX, {
              toValue: (Math.random() - 0.5) * 200,
              duration,
              useNativeDriver: true,
            }),
            Animated.timing(anim.rotate, {
              toValue: Math.random() * 10,
              duration,
              useNativeDriver: true,
            }),
          ]),
          Animated.timing(anim.translateY, {
            toValue: -100,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      ).start();
    });
  };

  const handleWishHappyBirthday = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1.2,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
      if (onNavigateToKosporBirthday) {
        onNavigateToKosporBirthday();
      } else if (navigationRef.isReady()) {
        navigationRef.navigate('KosporBirthday');
      }
    });
  };

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.3,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  };

  if (!isEventActive || !events.length) {
    return null;
  }

  const event = events[0];
  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Page plein écran plutôt que `<Modal>` : ce composant est monté au-dessus du
  // navigateur, une vue absolue le recouvre donc déjà. La fête garde toutes ses
  // animations, elle cesse juste d'être une fenêtre native posée par-dessus.
  if (!visible) return null;

  return (
    <View style={styles.page}>
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <LinearGradient
          colors={['rgba(15,10,30,0.95)', 'rgba(30,15,50,0.98)']}
          style={styles.gradient}
        />
        
        {/* Confettis en arrière-plan */}
        <View style={styles.confettiContainer}>
          {confettiAnims.map((anim, i) => (
            <Animated.View
              key={`confetti-${i}`}
              style={[
                styles.confetti,
                {
                  backgroundColor: ['#FFD700', '#FF69B4', '#00CED1', '#FF6347', '#9370DB'][i % 5],
                  left: Math.random() * width,
                  transform: [
                    { translateY: anim.translateY },
                    { translateX: anim.translateX },
                    { rotate: anim.rotate.interpolate({
                      inputRange: [0, 10],
                      outputRange: ['0deg', '360deg'],
                    }) },
                  ],
                  opacity: anim.opacity,
                },
              ]}
            />
          ))}
        </View>
        
        <Animated.View 
          style={[
            styles.popup,
            {
              transform: [
                { scale: scaleAnim },
                { translateY: slideAnim },
              ],
            }
          ]}
        >
          {/* Fond glassmorphism */}
          <View style={styles.glassBackground}>
            <LinearGradient
              colors={[colors.overlayStrong, colors.overlayMedium]}
              style={styles.glassGradient}
            />
          </View>

          <LinearGradient
            colors={['#FF1744', '#FF6B9D', '#C44569']}
            style={styles.popupGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            {/* Header avec effet de lumière */}
            <LinearGradient
              colors={[colors.textMuted, 'transparent']}
              style={styles.headerGlow}
            />
            
            {/* Bouton de fermeture élégant */}
            <TouchableOpacity 
              style={styles.closeButton} 
              onPress={handleClose}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[colors.overlayStrong, colors.overlayMedium]}
                style={styles.closeButtonGradient}
              >
                <Ionicons name="close" size={20} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>

            {/* Contenu principal */}
            <View style={styles.content}>
              {/* Icône animée centrale */}
              <View style={styles.iconWrapper}>
                <Animated.View 
                  style={[
                    styles.iconContainer,
                    { transform: [{ rotate: spin }] }
                  ]}
                >
                  <LinearGradient
                    colors={['#FFD700', '#FFA500', '#FF8C00']}
                    style={styles.iconGradient}
                  >
                    <MaterialCommunityIcons name="party-popper" size={50} color="#fff" />
                  </LinearGradient>
                </Animated.View>
                <View style={styles.emojiContainer}>
                  <Text style={styles.emoji}>🎂</Text>
                </View>
              </View>

              {/* Badge "LIMITED TIME" */}
              <View style={styles.badge}>
                <LinearGradient
                  colors={['#FFD700', '#FFA500']}
                  style={styles.badgeGradient}
                >
                  <Text style={styles.badgeText}>ÉVÉNEMENT LIMITÉ</Text>
                </LinearGradient>
              </View>

              {/* Titre avec effet de gradient */}
              <MaskedView
                maskElement={
                  <Text style={styles.title}>
                    C'est l'anniversaire{'\n'}de Kospor ! 🎉
                  </Text>
                }
              >
                <LinearGradient
                  colors={['#FFFFFF', '#FFE5B4', '#FFD700']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Text style={[styles.title, styles.titleMask]}>
                    C'est l'anniversaire{'\n'}de Kospor ! 🎉
                  </Text>
                </LinearGradient>
              </MaskedView>
              
              {/* Message avec style premium */}
              <View style={styles.messageContainer}>
                <Text style={styles.message}>
                  Célébrez avec nous et débloquez des récompenses exclusives disponibles uniquement aujourd'hui !
                </Text>
              </View>

              {/* Récompenses preview */}
              <View style={styles.rewardsPreview}>
                <View style={styles.rewardItem}>
                  <View style={styles.rewardIcon}>
                    <Ionicons name="trophy" size={24} color="#FFD700" />
                  </View>
                  <Text style={styles.rewardText}>500 Points</Text>
                </View>
                <View style={styles.rewardItem}>
                  <View style={styles.rewardIcon}>
                    <Ionicons name="star" size={24} color="#FFD700" />
                  </View>
                  <Text style={styles.rewardText}>Badge Exclusif</Text>
                </View>
                <View style={styles.rewardItem}>
                  <View style={styles.rewardIcon}>
                    <Ionicons name="gift" size={24} color="#FFD700" />
                  </View>
                  <Text style={styles.rewardText}>Surprises</Text>
                </View>
              </View>

              {/* Boutons d'action */}
              <View style={styles.buttonContainer}>
                <Animated.View 
                  style={[
                    styles.wishButtonWrapper,
                    { transform: [{ scale: pulseAnim }] }
                  ]}
                >
                  <TouchableOpacity 
                    style={styles.wishButton}
                    onPress={handleWishHappyBirthday}
                    activeOpacity={0.9}
                  >
                    <LinearGradient
                      colors={['#4CAF50', '#45a049', '#3d8b40']}
                      style={styles.wishButtonGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      <View style={styles.buttonShine} />
                      <Ionicons name="heart" size={22} color="#fff" />
                      <Text style={styles.wishButtonText}>Souhaiter un bon anniversaire</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>

                <TouchableOpacity 
                  style={styles.laterButton}
                  onPress={handleClose}
                  activeOpacity={0.7}
                >
                  <Text style={styles.laterButtonText}>Peut-être plus tard</Text>
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>

          {/* Particules flottantes */}
          <View style={styles.particlesContainer}>
            {particleAnims.map((anim, i) => (
              <Animated.View
                key={`particle-${i}`}
                style={[
                  styles.particle,
                  {
                    left: Math.random() * width * 0.8,
                    bottom: -10,
                    transform: [
                      { translateY: anim.translateY },
                      { translateX: anim.translateX },
                      { scale: anim.scale },
                    ],
                    opacity: anim.opacity,
                  },
                ]}
              >
                <LinearGradient
                  colors={['#FFD700', '#FFA500', '#FF69B4']}
                  style={styles.particleGradient}
                />
              </Animated.View>
            ))}
          </View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  confettiContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
  },
  confetti: {
    position: 'absolute',
    width: 8,
    height: 16,
    borderRadius: 2,
  },
  popup: {
    width: width * 0.92,
    maxWidth: 420,
    borderRadius: 30,
    overflow: 'hidden',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 15 },
    shadowOpacity: 0.4,
    shadowRadius: 30,
  },
  glassBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  glassGradient: {
    flex: 1,
  },
  popupGradient: {
    padding: 0,
  },
  headerGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 150,
  },
  closeButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    zIndex: 10,
  },
  closeButtonGradient: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.textMuted,
  },
  content: {
    paddingTop: 40,
    paddingHorizontal: 30,
    paddingBottom: 35,
    alignItems: 'center',
  },
  iconWrapper: {
    marginBottom: 25,
    alignItems: 'center',
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
  },
  iconGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiContainer: {
    position: 'absolute',
    top: -15,
    right: -10,
    backgroundColor: '#fff',
    borderRadius: 25,
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
  },
  emoji: {
    fontSize: 35,
  },
  badge: {
    marginBottom: 20,
  },
  badgeGradient: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '900', fontFamily: fonts.bold,
    color: '#8B4513',
    letterSpacing: 1.5,
  },
  title: {
    fontSize: 28,
    fontWeight: '900', fontFamily: fonts.bold,
    textAlign: 'center',
    lineHeight: 36,
    marginBottom: 15,
  },
  titleMask: {
    opacity: 0,
  },
  messageContainer: {
    backgroundColor: colors.overlayStrong,
    borderRadius: 16,
    padding: 16,
    marginBottom: 25,
    borderWidth: 1,
    borderColor: colors.overlayStrong,
  },
  message: {
    fontSize: 15,
    color: '#fff',
    textAlign: 'center',
    lineHeight: 22,
    fontWeight: '500', fontFamily: fonts.medium,
  },
  rewardsPreview: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 30,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 20,
    padding: 15,
  },
  rewardItem: {
    alignItems: 'center',
    flex: 1,
  },
  rewardIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.overlayStrong,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.textMuted,
  },
  rewardText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600', fontFamily: fonts.semibold,
    textAlign: 'center',
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
  },
  wishButtonWrapper: {
    borderRadius: 28,
    overflow: 'hidden',
  },
  wishButton: {
    borderRadius: 28,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  wishButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 30,
    gap: 10,
    position: 'relative',
    overflow: 'hidden',
  },
  buttonShine: {
    position: 'absolute',
    top: 0,
    left: -100,
    width: 100,
    height: '100%',
    backgroundColor: colors.textMuted,
    transform: [{ skewX: '-20deg' }],
  },
  wishButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800', fontFamily: fonts.bold,
    letterSpacing: 0.5,
  },
  laterButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  laterButtonText: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '500', fontFamily: fonts.medium,
  },
  particlesContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
  },
  particle: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  particleGradient: {
    flex: 1,
  },
});