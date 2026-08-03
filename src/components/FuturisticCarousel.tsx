import { fonts } from '../theme';
import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Animated,
  Image,
  ImageSourcePropType,
  ColorValue,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { colors } from '../theme';

const { width, height } = Dimensions.get('window');

// Accent unique « Encre » — pas d'arc-en-ciel par slide.
const ACCENT = colors.accent;
const ACCENT_DEEP = colors.accentHover;
const BG_GRADIENT = ['#0B0C0F', '#101218', '#0B0C0F'] as const;

interface CarouselItem {
  id: number;
  label: string;
  title: string;
  subtitle: string;
  description: string;
  gradientColors: readonly [ColorValue, ColorValue, ...ColorValue[]];
  accentColor: string;
  accentColorSecondary: string;
  image: ImageSourcePropType;
}

interface FuturisticCarouselProps {
  onFinish: () => void;
}

interface ConfettiPiece {
  id: number;
  x: number;
  size: number;
  color: string;
  anim: Animated.Value;
}

const carouselData: CarouselItem[] = [
  {
    id: 1,
    label: 'Bienvenue',
    title: 'twitninf',
    subtitle: 'Votre espace',
    description: 'Un réseau pensé pour\nl’essentiel.',
    gradientColors: BG_GRADIENT,
    accentColor: ACCENT,
    accentColorSecondary: ACCENT_DEEP,
    image: require('../assets/images/chibi/hello.png'),
  },
  {
    id: 2,
    label: 'Fluide',
    title: 'Net.',
    subtitle: 'Sans bruit',
    description: 'Rapide, sobre, sans distraction.\nLe contenu d’abord.',
    gradientColors: BG_GRADIENT,
    accentColor: ACCENT,
    accentColorSecondary: ACCENT_DEEP,
    image: require('../assets/images/chibi/festif.png'),
  },
  {
    id: 3,
    label: 'Partout',
    title: 'iOS &\nAndroid.',
    subtitle: 'Une seule app',
    description: 'La même expérience soignée,\nsur les deux plateformes.',
    gradientColors: BG_GRADIENT,
    accentColor: ACCENT,
    accentColorSecondary: ACCENT_DEEP,
    image: require('../assets/images/chibi/nrv.png'),
  },
];

export default function FuturisticCarousel({ onFinish }: FuturisticCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  // displayedIndex drives the image source — only updates once the slide is invisible,
  // preventing the old image from briefly flashing the new one mid-transition.
  const [displayedIndex, setDisplayedIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [confettiPieces, setConfettiPieces] = useState<ConfettiPiece[]>([]);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const scaleAnim = useRef(new Animated.Value(0.92)).current;
  const iconAnim = useRef(new Animated.Value(0)).current;
  const gradientFadeAnim = useRef(new Animated.Value(0)).current;
  const imageOpacity = useRef(new Animated.Value(0)).current;
  const labelAnim = useRef(new Animated.Value(0)).current;
  const lineAnim = useRef(new Animated.Value(0)).current;

  const playInitialAnimation = useCallback(() => {
    fadeAnim.setValue(0);
    slideAnim.setValue(40);
    scaleAnim.setValue(0.92);
    iconAnim.setValue(0);
    gradientFadeAnim.setValue(0);
    imageOpacity.setValue(0);
    labelAnim.setValue(0);
    lineAnim.setValue(0);

    // Tout en parallèle avec de petits delays — ~500ms au total au lieu de 1200ms
    Animated.parallel([
      Animated.timing(gradientFadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(80),
        Animated.parallel([
          Animated.timing(fadeAnim, { toValue: 1, duration: 380, useNativeDriver: true }),
          Animated.timing(slideAnim, { toValue: 0, duration: 350, useNativeDriver: true }),
          Animated.timing(scaleAnim, { toValue: 1, duration: 320, useNativeDriver: true }),
          Animated.timing(labelAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(lineAnim, { toValue: 1, duration: 420, useNativeDriver: false }),
        ]),
      ]),
      Animated.sequence([
        Animated.delay(160),
        Animated.parallel([
          Animated.timing(iconAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
          Animated.timing(imageOpacity, { toValue: 1, duration: 240, useNativeDriver: true }),
        ]),
      ]),
    ]).start();
  }, [fadeAnim, slideAnim, scaleAnim, iconAnim, gradientFadeAnim, imageOpacity, labelAnim, lineAnim]);

  const playEnterAnimation = useCallback(() => {
    Animated.parallel([
      Animated.timing(gradientFadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 320, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.timing(labelAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.timing(lineAnim, { toValue: 1, duration: 400, useNativeDriver: false }),
      Animated.timing(iconAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.timing(imageOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
    ]).start(() => setIsAnimating(false));
  }, [fadeAnim, slideAnim, scaleAnim, iconAnim, gradientFadeAnim, imageOpacity, labelAnim, lineAnim]);

  const triggerConfetti = useCallback(() => {
    const colors = ['#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#60a5fa', '#f87171'];
    const count = 40;
    const pieces: ConfettiPiece[] = Array.from({ length: count }).map((_, i) => ({
      id: i,
      x: Math.random() * width,
      size: 5 + Math.random() * 7,
      color: colors[Math.floor(Math.random() * colors.length)],
      anim: new Animated.Value(0),
    }));
    setConfettiPieces(pieces);
    let completed = 0;
    pieces.forEach((p) => {
      Animated.timing(p.anim, {
        toValue: 1,
        duration: 1100 + Math.random() * 800,
        delay: Math.random() * 200,
        useNativeDriver: true,
      }).start(() => {
        completed++;
        if (completed === pieces.length) setTimeout(() => setConfettiPieces([]), 150);
      });
    });
  }, []);

  const transitionToSlide = useCallback(
    (newIndex: number, direction: 'next' | 'prev') => {
      if (isAnimating || newIndex < 0 || newIndex >= carouselData.length) return;
      setIsAnimating(true);
      const exitSlide = direction === 'next' ? -40 : 40;
      const enterSlide = direction === 'next' ? 40 : -40;

      // Phase 1 : image disparaît en premier (120ms)
      Animated.parallel([
        Animated.timing(imageOpacity, { toValue: 0, duration: 120, useNativeDriver: true }),
        Animated.timing(iconAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
      ]).start(() => {
        // Image invisible → on swap la source ICI, pendant que le fond est encore visible
        // React a tout le temps du fade suivant pour committer le nouveau source
        setDisplayedIndex(newIndex);

        // Phase 2 : fade out du reste (contenu + fond)
        Animated.parallel([
          Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
          Animated.timing(slideAnim, { toValue: exitSlide, duration: 200, useNativeDriver: true }),
          Animated.timing(scaleAnim, { toValue: 0.93, duration: 200, useNativeDriver: true }),
          Animated.timing(gradientFadeAnim, { toValue: 0, duration: 240, useNativeDriver: true }),
          Animated.timing(labelAnim, { toValue: 0, duration: 160, useNativeDriver: true }),
          Animated.timing(lineAnim, { toValue: 0, duration: 160, useNativeDriver: false }),
        ]).start(() => {
          // Tout est invisible → on peut changer l'index UI sans risque
          setCurrentIndex(newIndex);
          fadeAnim.setValue(0);
          slideAnim.setValue(enterSlide);
          scaleAnim.setValue(0.93);
          iconAnim.setValue(0);
          gradientFadeAnim.setValue(0);
          imageOpacity.setValue(0);
          labelAnim.setValue(0);
          lineAnim.setValue(0);

          // Une frame pour s'assurer que le nouveau source est rendu avant le fade-in
          requestAnimationFrame(() => playEnterAnimation());
        });
      });
    },
    [isAnimating, fadeAnim, slideAnim, scaleAnim, iconAnim, gradientFadeAnim, imageOpacity, labelAnim, lineAnim, triggerConfetti, playEnterAnimation]
  );

  useEffect(() => {
    const timer = setTimeout(() => playInitialAnimation(), 80);
    return () => clearTimeout(timer);
  }, []);

  const nextSlide = useCallback(() => {
    if (currentIndex < carouselData.length - 1) transitionToSlide(currentIndex + 1, 'next');
  }, [currentIndex, transitionToSlide]);

  const previousSlide = useCallback(() => {
    if (currentIndex > 0) transitionToSlide(currentIndex - 1, 'prev');
  }, [currentIndex, transitionToSlide]);

  const handleFinish = useCallback(() => onFinish(), [onFinish]);

  const currentItem = carouselData[currentIndex];
  const displayedItem = carouselData[displayedIndex];
  const isLastSlide = currentIndex === carouselData.length - 1;

  return (
    <View style={styles.container}>
      {/* Background */}
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: gradientFadeAnim }]}>
        <LinearGradient
          colors={currentItem.gradientColors}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      </Animated.View>

      {/* Ambient glow blob */}
      <Animated.View
        style={[
          styles.glowBlob,
          { backgroundColor: currentItem.accentColor, opacity: gradientFadeAnim },
        ]}
      />
      <Animated.View
        style={[
          styles.glowBlobSecondary,
          { backgroundColor: currentItem.accentColorSecondary, opacity: gradientFadeAnim },
        ]}
      />

      {/* Skip button */}
      <TouchableOpacity style={styles.skipButton} onPress={handleFinish} activeOpacity={0.7}>
        <BlurView intensity={20} tint="dark" style={styles.skipBlur}>
          <Text style={styles.skipText}>Passer</Text>
        </BlurView>
      </TouchableOpacity>

      {/* Slide number label */}
      <Animated.View style={[styles.labelContainer, { opacity: labelAnim, transform: [{ translateX: labelAnim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }] }]}>
        <Text style={[styles.slideLabel, { color: currentItem.accentColor }]}>
          {currentItem.label}
        </Text>
      </Animated.View>

      {/* Confetti */}
      {confettiPieces.length > 0 && (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
          {confettiPieces.map((p) => (
            <Animated.View
              key={p.id}
              style={{
                position: 'absolute',
                top: 0,
                left: p.x,
                width: p.size,
                height: p.size * 0.55,
                backgroundColor: p.color,
                borderRadius: 2,
                transform: [
                  { translateY: p.anim.interpolate({ inputRange: [0, 1], outputRange: [-40, height + 40] }) },
                  { rotate: p.anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${Math.random() * 720 - 360}deg`] }) },
                ],
                opacity: p.anim.interpolate({ inputRange: [0, 0.1, 0.88, 1], outputRange: [0, 1, 1, 0] }),
              }}
            />
          ))}
        </View>
      )}

      {/* Main content */}
      <Animated.View
        style={[
          styles.content,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
          },
        ]}
      >
        {/* Image */}
        <Animated.View
          style={[
            styles.imageWrapper,
            {
              opacity: iconAnim,
              transform: [
                { scale: iconAnim.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] }) },
                { translateY: iconAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
              ],
            },
          ]}
        >
          {/* Soft color bloom behind image */}
          <Animated.View
            style={[
              styles.imageColorBloom,
              { backgroundColor: currentItem.accentColor, opacity: imageOpacity },
            ]}
          />
          {/* Glow rings */}
          <View style={[styles.imageGlowRing, { borderColor: currentItem.accentColor + '40' }]} />
          <View style={[styles.imageGlowRingInner, { borderColor: currentItem.accentColor + '28' }]} />

          <Animated.Image
            source={displayedItem.image}
            style={[styles.slideImage, { opacity: imageOpacity }]}
            resizeMode="contain"
          />
        </Animated.View>

        {/* Accent line */}
        <Animated.View
          style={[
            styles.accentLine,
            {
              backgroundColor: currentItem.accentColor,
              width: lineAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 48] }),
            },
          ]}
        />

        {/* Text */}
        <View style={styles.textBlock}>
          <Text style={styles.mainTitle}>{currentItem.title}</Text>
          <Text style={[styles.accentSubtitle, { color: currentItem.accentColor }]}>
            {currentItem.subtitle}
          </Text>
          <Text style={styles.description}>{currentItem.description}</Text>
        </View>

        {/* Dot indicators */}
        <View style={styles.dotsRow}>
          {carouselData.map((_, i) => (
            <Animated.View
              key={i}
              style={[
                styles.dot,
                i === currentIndex
                  ? [styles.dotActive, { backgroundColor: currentItem.accentColor }]
                  : styles.dotInactive,
              ]}
            />
          ))}
        </View>

        {/* Navigation */}
        <View style={styles.navRow}>
          {currentIndex > 0 ? (
            <TouchableOpacity
              style={styles.backButton}
              onPress={previousSlide}
              disabled={isAnimating}
              activeOpacity={0.7}
            >
              <BlurView intensity={25} tint="dark" style={styles.backBlur}>
                <Text style={styles.backArrow}>←</Text>
              </BlurView>
            </TouchableOpacity>
          ) : (
            <View style={styles.navPlaceholder} />
          )}

          {!isLastSlide ? (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={nextSlide}
              disabled={isAnimating}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={[currentItem.accentColor, currentItem.accentColorSecondary]}
                style={styles.primaryButtonGrad}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Text style={styles.primaryButtonText}>Continuer</Text>
                <Text style={styles.primaryButtonArrow}>→</Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.finishButton}
              onPress={handleFinish}
              disabled={isAnimating}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={[currentItem.accentColor, currentItem.accentColorSecondary]}
                style={styles.primaryButtonGrad}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Text style={styles.primaryButtonText}>Commencer</Text>
                <Text style={styles.primaryButtonArrow}>→</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  /* Ambient glows */
  glowBlob: {
    position: 'absolute',
    width: width * 0.9,
    height: width * 0.9,
    borderRadius: width * 0.45,
    top: -width * 0.3,
    left: -width * 0.25,
    opacity: 0.14,
    transform: [{ scale: 1.2 }],
  },
  glowBlobSecondary: {
    position: 'absolute',
    width: width * 0.75,
    height: width * 0.75,
    borderRadius: width * 0.375,
    bottom: height * 0.04,
    right: -width * 0.22,
    opacity: 0.1,
  },

  /* Grid */
  gridContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.028)',
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.028)',
  },

  /* Corner brackets */
  cornerTL: {
    position: 'absolute',
    top: 56,
    left: 24,
    width: 20,
    height: 20,
  },
  cornerBR: {
    position: 'absolute',
    bottom: 44,
    right: 24,
    width: 20,
    height: 20,
    transform: [{ rotate: '180deg' }],
  },
  cornerBracketH: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 20,
    height: 2,
    borderTopWidth: 1.5,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  cornerBracketV: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 2,
    height: 20,
    borderLeftWidth: 1.5,
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },

  /* Skip */
  skipButton: {
    position: 'absolute',
    top: 56,
    right: 24,
    borderRadius: 100,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    zIndex: 10,
  },
  skipBlur: {
    paddingVertical: 9,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    fontWeight: '500', fontFamily: fonts.medium,
    letterSpacing: 0.4,
  },

  /* Label */
  labelContainer: {
    position: 'absolute',
    top: 130,
    left: 32,
    zIndex: 5,
  },
  slideLabel: {
    fontSize: 11,
    fontWeight: '700', fontFamily: fonts.bold,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },

  /* Content */
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 60,
    paddingBottom: 40,
  },

  /* Image */
  imageWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 36,
  },
  imageColorBloom: {
    position: 'absolute',
    width: Math.min(width * 0.55, 230),
    height: Math.min(width * 0.55, 230),
    borderRadius: Math.min(width * 0.275, 115),
    opacity: 0.13,
  },
  imageGlowRing: {
    position: 'absolute',
    width: Math.min(width * 0.72, 310),
    height: Math.min(width * 0.72, 310),
    borderRadius: Math.min(width * 0.36, 155),
    borderWidth: 1,
  },
  imageGlowRingInner: {
    position: 'absolute',
    width: Math.min(width * 0.58, 250),
    height: Math.min(width * 0.58, 250),
    borderRadius: Math.min(width * 0.29, 125),
    borderWidth: 1,
  },
  slideImage: {
    width: Math.min(width * 0.62, 260),
    height: Math.min(height * 0.3, 240),
  },

  /* Accent line */
  accentLine: {
    height: 2,
    borderRadius: 2,
    marginBottom: 24,
    alignSelf: 'flex-start',
    marginLeft: 2,
  },

  /* Text */
  textBlock: {
    alignSelf: 'stretch',
    marginBottom: 40,
  },
  mainTitle: {
    fontSize: 44,
    fontWeight: '800', fontFamily: fonts.bold,
    color: colors.textPrimary,
    letterSpacing: -1.4,
    lineHeight: 50,
    marginBottom: 8,
  },
  accentSubtitle: {
    fontSize: 15,
    fontWeight: '700', fontFamily: fonts.bold,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.42)',
    lineHeight: 26,
    letterSpacing: 0.1,
    fontWeight: '400', fontFamily: fonts.regular,
  },

  /* Dots */
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: 36,
    gap: 8,
  },
  dot: {
    borderRadius: 100,
  },
  dotActive: {
    width: 28,
    height: 6,
  },
  dotInactive: {
    width: 6,
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },

  /* Nav row */
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'space-between',
    gap: 12,
  },
  navPlaceholder: {
    width: 52,
  },

  /* Back button */
  backButton: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    width: 52,
    height: 52,
  },
  backBlur: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 20,
    fontWeight: '300',
  },

  /* Primary / Finish button */
  primaryButton: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
  },
  finishButton: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 16,
  },
  primaryButtonGrad: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 14,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700', fontFamily: fonts.bold,
    letterSpacing: 0.3,
  },
  primaryButtonArrow: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 16,
    fontWeight: '400', fontFamily: fonts.regular,
  },
});