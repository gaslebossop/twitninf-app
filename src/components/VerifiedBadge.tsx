/**
 * Composant pour afficher le badge vérifié avec différents styles
 * Version améliorée avec effet néon réfléchissant ultra professionnel pour le style rose
 */

import React, { useEffect, useId, useRef } from 'react';
import { View, StyleSheet, Animated, Platform, StyleProp } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import MaskedView from '@react-native-masked-view/masked-view';
import Svg, { Defs, RadialGradient, Stop, Circle, Filter, FeGaussianBlur, FeMerge, FeMergeNode } from 'react-native-svg';
import VerificationStyleService, { VerificationStyle } from '../services/verificationStyleService';
import { litPulse } from '../utils/litPulse';
import { colors } from '../theme';

interface VerifiedBadgeProps {
  verificationStyle?: VerificationStyle;
  size?: number;
  animated?: boolean;
  showRing?: boolean;
  premium?: boolean;
  /**
   * Couleur imposée par le profil habillé (voir `certifiedNameColors`).
   * N'agit QUE sur la pastille neutre : les styles rose / argent / or portent
   * une distinction attribuée au compte, on ne la repeint pas.
   */
  tint?: string | null;
  style?: StyleProp<any>;
}

function VerifiedBadge({
  verificationStyle = 'default',
  size = 20,
  animated = true,
  showRing = false,
  premium = false,
  tint,
  style,
}: VerifiedBadgeProps) {
  /**
   * Identifiant unique du dégradé du halo.
   *
   * Un id SVG fixe serait partagé par toutes les pastilles montées en même
   * temps : dans le fil, la première définition gagnerait et tous les halos
   * prendraient sa couleur, quel que soit l'auteur. `useId` produit des
   * caractères interdits dans une référence `url(#…)`, d'où le nettoyage.
   */
  const glowGradientId = `badge-glow-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  // Animations multiples pour effet néon complexe
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0.6)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const pulseRingAnim = useRef(new Animated.Value(1)).current;
  
  // Animation de pulsation douce
  useEffect(() => {
    if (!animated) return;

    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.08,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    );
    
    pulseAnimation.start();
    return () => pulseAnimation.stop();
  }, [animated, scaleAnim]);

  /**
   * Halo de la pastille neutre accordée à un nom allumé.
   *
   * Piloté par l'horloge PARTAGÉE avec le halo du nom, pas par une boucle
   * locale : deux boucles de même durée lancées au montage de composants
   * différents dérivent l'une par rapport à l'autre, et comme le nom et la
   * pastille sont côte à côte et de même couleur, le déphasage se lisait comme
   * un à-coup. Ici il n'y a plus qu'une horloge, donc plus rien à synchroniser.
   */
  const litPulseValue = litPulse();

  // Animation glow pour style gris
  useEffect(() => {
    if (!animated || verificationStyle !== 'gray') return;

    // Animation glow pulsation pour le style gris
    const glowAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.6,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    );

    glowAnimation.start();
    return () => glowAnimation.stop();
  }, [animated, verificationStyle, glowAnim]);

  // Animation sparkle pour style or
  useEffect(() => {
    if (!animated || verificationStyle !== 'gold') return;

    // Animation sparkle pour le style or
    const sparkleAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );

    const glowAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.7,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    );

    sparkleAnimation.start();
    glowAnimation.start();
    return () => {
      sparkleAnimation.stop();
      glowAnimation.stop();
    };
  }, [animated, verificationStyle, shimmerAnim, glowAnim]);

  // Animation néon complexe pour style rose
  useEffect(() => {
    if (!animated || verificationStyle !== 'rose') return;

    // Animation shimmer
    const shimmerAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    );

    // Animation glow pulsation
    const glowAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.6,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    );

    // Rotation subtile pour effet réfléchissant
    const rotateAnimation = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 20000,
        useNativeDriver: true,
      })
    );

    // Animation du ring externe
    const ringAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseRingAnim, {
          toValue: 1.3,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseRingAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    );
    
    shimmerAnimation.start();
    glowAnimation.start();
    rotateAnimation.start();
    ringAnimation.start();

    return () => {
      shimmerAnimation.stop();
      glowAnimation.stop();
      rotateAnimation.stop();
      ringAnimation.stop();
    };
  }, [animated, verificationStyle, shimmerAnim, glowAnim, rotateAnim, pulseRingAnim]);

  const styleColors = VerificationStyleService.getStyleColors(verificationStyle);
  
  // Interpolations pour les animations
  const shimmerOpacity = shimmerAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0.6, 0],
  });

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0.6, 1],
    outputRange: [0.4, 0.8],
  });

  const rotateValue = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const ringOpacity = pulseRingAnim.interpolate({
    inputRange: [1, 1.3],
    outputRange: [0.3, 0],
  });

  // Style par défaut : bleu façon Instagram (jamais l'accent de marque), sauf
  // sur un profil habillé, où `tint` l'accorde à la palette de la page.
  // Style par défaut : bleu façon Instagram (jamais l'accent de marque), sauf
  // sur un profil habillé, où `tint` l'accorde à la palette de la page.
  //
  // Plus de halo derrière la coche : il était censé accorder la pastille à un
  // nom allumé, mais il ajoutait une auréole colorée qui faisait décoration
  // plutôt qu'identité. La pastille est une coche, rien de plus.
  if (verificationStyle === 'default') {
    return <Ionicons name="checkmark-circle" size={size} color={tint || '#3897F0'} style={style} />;
  }

  // Pour le style rose avec effet néon ultra professionnel
  if (verificationStyle === 'rose') {
    return (
      <View style={[styles.neonWrapper, { width: size * 2, height: size * 2 }, style]}>
        {/* Couche 1: Ring externe animé */}
        <Animated.View 
          style={[
            styles.pulseRing,
            {
              width: size * 1.8,
              height: size * 1.8,
              borderRadius: size * 0.9,
              transform: [{ scale: pulseRingAnim }],
              opacity: ringOpacity,
              borderColor: '#FF69B4',
            }
          ]}
        />

        {/* Couche 2: Glow de base */}
        <Animated.View 
          style={[
            styles.baseGlow,
            {
              width: size * 1.6,
              height: size * 1.6,
              borderRadius: size * 0.8,
              opacity: glowOpacity,
            }
          ]}
        >
          <LinearGradient
            colors={['rgba(255, 105, 180, 0.8)', 'rgba(255, 20, 147, 0.4)', 'rgba(255, 105, 180, 0.1)']}
            style={[styles.gradientGlow, { borderRadius: size * 0.8 }]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        </Animated.View>

        {/* Couche 3: Effet de réflection tournant */}
        <Animated.View 
          style={[
            styles.reflectionLayer,
            {
              width: size * 1.4,
              height: size * 1.4,
              transform: [{ rotate: rotateValue }],
            }
          ]}
        >
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.3)', 'transparent', 'rgba(255, 105, 180, 0.2)', 'transparent']}
            style={styles.reflectionGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            locations={[0, 0.3, 0.6, 1]}
          />
        </Animated.View>

        {/* Couche 4: Badge principal avec effet verre */}
        <Animated.View 
          style={[
            styles.neonBadgeContainer,
            { 
              width: size * 1.2, 
              height: size * 1.2,
              transform: [{ scale: scaleAnim }],
            }
          ]}
        >
          {/* Fond glassmorphism */}
          <View style={[styles.glassBackground, { borderRadius: size * 0.6 }]}>
            <LinearGradient
              colors={['rgba(255, 105, 180, 0.15)', 'rgba(255, 20, 147, 0.25)', 'rgba(219, 112, 147, 0.15)']}
              style={[styles.glassFill, { borderRadius: size * 0.6 }]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
          </View>

          {/* Bordure néon */}
          <View style={[
            styles.neonBorder,
            {
              width: size * 1.15,
              height: size * 1.15,
              borderRadius: size * 0.575,
              borderWidth: 2,
              borderColor: '#FF1493',
              ...Platform.select({
                ios: {
                  shadowColor: '#FF1493',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.9,
                  shadowRadius: 10,
                },
                android: {
                  elevation: 10,
                },
              }),
            }
          ]} />

          {/* Icône principale */}
          <View style={styles.iconWrapper}>
            <Ionicons 
              name="checkmark-circle" 
              size={size} 
              color="#FFFFFF"
              style={[
                styles.mainIcon,
                {
                  ...Platform.select({
                    ios: {
                      shadowColor: '#FF69B4',
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 1,
                      shadowRadius: 15,
                    },
                    android: {
                      elevation: 15,
                    },
                  }),
                }
              ]}
            />
            
            {/* Overlay shimmer animé */}
            <Animated.View 
              style={[
                styles.shimmerOverlay,
                {
                  opacity: shimmerOpacity,
                }
              ]}
            >
              <LinearGradient
                colors={['transparent', 'rgba(255, 255, 255, 0.8)', 'transparent']}
                style={styles.shimmerGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              />
            </Animated.View>
          </View>

          {/* Points de lumière réfléchissants */}
          <View style={[styles.lightPoint, { top: size * 0.15, left: size * 0.25 }]} />
          <View style={[styles.lightPoint, { bottom: size * 0.2, right: size * 0.2 }]} />
        </Animated.View>

        {/* Couche 5: Particules flottantes (optionnel) */}
        {animated && (
          <>
            <Animated.View 
              style={[
                styles.floatingParticle,
                {
                  width: 3,
                  height: 3,
                  top: size * 0.2,
                  left: size * 0.7,
                  opacity: shimmerOpacity,
                }
              ]}
            />
            <Animated.View 
              style={[
                styles.floatingParticle,
                {
                  width: 2,
                  height: 2,
                  bottom: size * 0.3,
                  right: size * 0.6,
                  opacity: glowOpacity,
                }
              ]}
            />
          </>
        )}
      </View>
    );
  }

  // Pour le style gris avec effet glow
  if (verificationStyle === 'gray') {
    return (
      <View style={[styles.neonWrapper, { width: size * 1.5, height: size * 1.5 }, style]}>
        {/* Couche 1: Glow de base */}
        <Animated.View 
          style={[
            styles.baseGlow,
            {
              width: size * 1.4,
              height: size * 1.4,
              borderRadius: size * 0.7,
              opacity: glowOpacity,
            }
          ]}
        >
          <LinearGradient
            colors={['rgba(128, 128, 128, 0.6)', 'rgba(105, 105, 105, 0.3)', 'rgba(128, 128, 128, 0.1)']}
            style={[styles.gradientGlow, { borderRadius: size * 0.7 }]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        </Animated.View>

        {/* Couche 2: Badge principal */}
        <Animated.View 
          style={[
            styles.neonBadgeContainer,
            { 
              width: size * 1.1, 
              height: size * 1.1,
              transform: [{ scale: scaleAnim }],
            }
          ]}
        >
          {/* Fond glassmorphism gris */}
          <View style={[styles.glassBackground, { borderRadius: size * 0.55 }]}>
            <LinearGradient
              colors={['rgba(128, 128, 128, 0.1)', 'rgba(105, 105, 105, 0.2)', 'rgba(128, 128, 128, 0.1)']}
              style={[styles.glassFill, { borderRadius: size * 0.55 }]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
          </View>

          {/* Bordure glow grise */}
          <View style={[
            styles.neonBorder,
            {
              width: size * 1.05,
              height: size * 1.05,
              borderRadius: size * 0.525,
              borderWidth: 2,
              borderColor: '#808080',
              ...Platform.select({
                ios: {
                  shadowColor: '#808080',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.8,
                  shadowRadius: 8,
                },
                android: {
                  elevation: 8,
                },
              }),
            }
          ]} />

          {/* Icône principale */}
          <View style={styles.iconWrapper}>
            <Ionicons 
              name="checkmark-circle" 
              size={size} 
              color="#FFFFFF"
              style={[
                styles.mainIcon,
                {
                  ...Platform.select({
                    ios: {
                      shadowColor: '#808080',
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.9,
                      shadowRadius: 12,
                    },
                    android: {
                      elevation: 12,
                    },
                  }),
                }
              ]}
            />
          </View>
        </Animated.View>
      </View>
    );
  }

  // Pour le style or avec effet sparkle
  if (verificationStyle === 'gold') {
    return (
      <View style={[styles.neonWrapper, { width: size * 1.8, height: size * 1.8 }, style]}>
        {/* Couche 1: Glow doré */}
        <Animated.View 
          style={[
            styles.baseGlow,
            {
              width: size * 1.6,
              height: size * 1.6,
              borderRadius: size * 0.8,
              opacity: glowOpacity,
            }
          ]}
        >
          <LinearGradient
            colors={['rgba(255, 215, 0, 0.8)', 'rgba(255, 165, 0, 0.4)', 'rgba(255, 215, 0, 0.1)']}
            style={[styles.gradientGlow, { borderRadius: size * 0.8 }]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        </Animated.View>

        {/* Couche 2: Effet shimmer doré */}
        <Animated.View 
          style={[
            styles.shimmerOverlay,
            {
              opacity: shimmerOpacity,
            }
          ]}
        >
          <LinearGradient
            colors={['transparent', 'rgba(255, 255, 255, 0.9)', 'transparent']}
            style={styles.shimmerGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        </Animated.View>

        {/* Couche 3: Badge principal */}
        <Animated.View 
          style={[
            styles.neonBadgeContainer,
            { 
              width: size * 1.2, 
              height: size * 1.2,
              transform: [{ scale: scaleAnim }],
            }
          ]}
        >
          {/* Fond glassmorphism doré */}
          <View style={[styles.glassBackground, { borderRadius: size * 0.6 }]}>
            <LinearGradient
              colors={['rgba(255, 215, 0, 0.15)', 'rgba(255, 165, 0, 0.25)', 'rgba(255, 215, 0, 0.15)']}
              style={[styles.glassFill, { borderRadius: size * 0.6 }]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
          </View>

          {/* Bordure dorée */}
          <View style={[
            styles.neonBorder,
            {
              width: size * 1.15,
              height: size * 1.15,
              borderRadius: size * 0.575,
              borderWidth: 2,
              borderColor: '#FFD700',
              ...Platform.select({
                ios: {
                  shadowColor: '#FFD700',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 1,
                  shadowRadius: 12,
                },
                android: {
                  elevation: 12,
                },
              }),
            }
          ]} />

          {/* Icône principale */}
          <View style={styles.iconWrapper}>
            <Ionicons 
              name="checkmark-circle" 
              size={size} 
              color="#FFFFFF"
              style={[
                styles.mainIcon,
                {
                  ...Platform.select({
                    ios: {
                      shadowColor: '#FFD700',
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 1,
                      shadowRadius: 15,
                    },
                    android: {
                      elevation: 15,
                    },
                  }),
                }
              ]}
            />
          </View>
        </Animated.View>

        {/* Particules dorées flottantes */}
        {animated && (
          <>
            <Animated.View 
              style={[
                styles.floatingParticle,
                {
                  width: 4,
                  height: 4,
                  top: size * 0.1,
                  left: size * 0.8,
                  opacity: shimmerOpacity,
                  backgroundColor: 'rgba(255, 215, 0, 0.8)',
                }
              ]}
            />
            <Animated.View 
              style={[
                styles.floatingParticle,
                {
                  width: 3,
                  height: 3,
                  bottom: size * 0.2,
                  right: size * 0.7,
                  opacity: glowOpacity,
                  backgroundColor: 'rgba(255, 165, 0, 0.9)',
                }
              ]}
            />
          </>
        )}
      </View>
    );
  }

  // Fallback pour autres styles
  return (
    <Ionicons
      name="checkmark-circle"
      size={size}
      color="#3897F0"
      style={style}
    />
  );
}

/**
 * Mémoïsé : la pastille embarque jusqu'à huit boucles d'animation et un SVG,
 * et elle est rendue une à deux fois par ligne de liste. Sans ce `memo`, le
 * moindre re-rendu du parent la reconstruisait entièrement.
 *
 * L'animation elle-même n'est pas touchée : `animated` garde sa valeur par
 * défaut et aucun appelant ne change de comportement.
 */
export default React.memo(VerifiedBadge);

const styles = StyleSheet.create({
  /** `overflow: visible` : le halo déborde volontairement de la pastille. */
  tintGlowWrap: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'visible',
  },
  tintGlow: {
    position: 'absolute',
  },
  neonWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  pulseRing: {
    position: 'absolute',
    borderWidth: 1.5,
    borderStyle: 'solid',
  },
  baseGlow: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradientGlow: {
    width: '100%',
    height: '100%',
  },
  reflectionLayer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reflectionGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
  neonBadgeContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  glassBackground: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(255, 105, 180, 0.05)',
  },
  glassFill: {
    width: '100%',
    height: '100%',
  },
  neonBorder: {
    position: 'absolute',
  },
  iconWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  mainIcon: {
    zIndex: 5,
  },
  shimmerOverlay: {
    position: 'absolute',
    width: '120%',
    height: '120%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shimmerGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
  lightPoint: {
    position: 'absolute',
    width: 4,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 2,
    ...Platform.select({
      ios: {
        shadowColor: '#FFFFFF',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 3,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  floatingParticle: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 105, 180, 0.6)',
    borderRadius: 999,
    ...Platform.select({
      ios: {
        shadowColor: '#FF69B4',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
});
