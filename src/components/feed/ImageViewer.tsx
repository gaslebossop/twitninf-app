/**
 * Visionneuse plein écran des images d'un tweet.
 *
 * ── Pourquoi une `<Modal>` ici, alors que l'app l'évite ailleurs ──
 * Une modale native rend dans sa propre fenêtre et masque les primitives de
 * l'app (toast, feuille d'action, confirmation). C'est rédhibitoire pour un
 * écran qui en a besoin — ce n'est pas le cas d'une visionneuse, qui n'affiche
 * rien d'autre que l'image. En échange, elle couvre la barre d'onglets, ce
 * qu'une vue posée dans l'arbre ne ferait pas.
 *
 * ── Gestes ──
 *   - pincer pour zoomer, glisser pour déplacer une image zoomée ;
 *   - double-tap : bascule entre 1× et 2,5×, centré sur le doigt ;
 *   - glisser vers le bas (hors zoom) : ferme, en emportant le fond avec soi ;
 *   - glisser latéralement (hors zoom) : image suivante ou précédente.
 *
 * ── Règle des worklets ──
 * Tout ce qui tourne dans un geste tourne sur le thread UI. Y appeler une
 * fonction JS ordinaire tue l'application sans le moindre log : les aides
 * ci-dessous portent donc `'worklet'`, et tout retour vers React passe par
 * `runOnJS`.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { colors, fonts , statusBarStyle} from '../../theme';
import { Tappable } from '../ui';

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
/** Distance verticale au-delà de laquelle le glissement ferme. */
const DISMISS_DISTANCE = 130;

const SPRING = { damping: 22, stiffness: 220, mass: 0.6 };

function clampWorklet(value: number, min: number, max: number) {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

interface ImageViewerProps {
  urls: string[];
  /** Image ouverte au départ. */
  initialIndex?: number;
  visible: boolean;
  onClose: () => void;
}

export default function ImageViewer({ urls, initialIndex = 0, visible, onClose }: ImageViewerProps) {
  const { width, height } = Dimensions.get('window');
  const [index, setIndex] = useState(initialIndex);
  const [loaded, setLoaded] = useState(false);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  /** Progression du glissement de fermeture, pour estomper le fond. */
  const dismissProgress = useSharedValue(0);

  const reset = useCallback(() => {
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedX.value = 0;
    savedY.value = 0;
    dismissProgress.value = 0;
  }, [dismissProgress, savedScale, savedX, savedY, scale, translateX, translateY]);

  // Rouvrir sur une autre image ne doit pas hériter du zoom de la précédente.
  useEffect(() => {
    if (!visible) return;
    setIndex(initialIndex);
    setLoaded(false);
    reset();
  }, [visible, initialIndex, reset]);

  const goTo = useCallback(
    (next: number) => {
      if (next < 0 || next > urls.length - 1) return;
      setIndex(next);
      setLoaded(false);
      reset();
    },
    [urls.length, reset]
  );

  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = clampWorklet(savedScale.value * event.scale, 0.8, MAX_SCALE);
    })
    .onEnd(() => {
      // En dessous de 1×, l'image revient d'elle-même : un pincement de sortie
      // doit rendre la vue d'ensemble, pas laisser une image minuscule.
      if (scale.value < 1) {
        scale.value = withSpring(1, SPRING);
        translateX.value = withSpring(0, SPRING);
        translateY.value = withSpring(0, SPRING);
        savedScale.value = 1;
        savedX.value = 0;
        savedY.value = 0;
        return;
      }
      savedScale.value = scale.value;
    });

  const pan = Gesture.Pan()
    .onUpdate((event) => {
      if (scale.value > 1) {
        // Zoomé : le glissement déplace l'image, borné à ses propres marges
        // pour qu'on ne puisse pas la perdre hors de l'écran.
        const limitX = ((scale.value - 1) * width) / 2;
        const limitY = ((scale.value - 1) * height) / 2;
        translateX.value = clampWorklet(savedX.value + event.translationX, -limitX, limitX);
        translateY.value = clampWorklet(savedY.value + event.translationY, -limitY, limitY);
        return;
      }

      // Non zoomé : le vertical ferme, l'horizontal change d'image.
      translateY.value = event.translationY;
      translateX.value = event.translationX;
      dismissProgress.value = clampWorklet(Math.abs(event.translationY) / DISMISS_DISTANCE, 0, 1);
    })
    .onEnd((event) => {
      if (scale.value > 1) {
        savedX.value = translateX.value;
        savedY.value = translateY.value;
        return;
      }

      if (Math.abs(event.translationY) > DISMISS_DISTANCE || Math.abs(event.velocityY) > 900) {
        runOnJS(onClose)();
        return;
      }

      // Changement d'image : geste franchement horizontal seulement, sinon un
      // glissement de fermeture un peu de travers ferait défiler la galerie.
      const horizontal = Math.abs(event.translationX) > Math.abs(event.translationY);
      if (horizontal && Math.abs(event.translationX) > width * 0.25) {
        runOnJS(goTo)(event.translationX < 0 ? index + 1 : index - 1);
      }

      translateX.value = withSpring(0, SPRING);
      translateY.value = withSpring(0, SPRING);
      dismissProgress.value = withTiming(0, { duration: 160 });
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((event) => {
      if (scale.value > 1) {
        scale.value = withSpring(1, SPRING);
        translateX.value = withSpring(0, SPRING);
        translateY.value = withSpring(0, SPRING);
        savedScale.value = 1;
        savedX.value = 0;
        savedY.value = 0;
        return;
      }

      // Zoom centré sur le doigt : zoomer toujours au centre obligerait à
      // repositionner l'image juste après, à chaque fois.
      const focusX = (width / 2 - event.x) * (DOUBLE_TAP_SCALE - 1);
      const focusY = (height / 2 - event.y) * (DOUBLE_TAP_SCALE - 1);
      scale.value = withSpring(DOUBLE_TAP_SCALE, SPRING);
      translateX.value = withSpring(focusX, SPRING);
      translateY.value = withSpring(focusY, SPRING);
      savedScale.value = DOUBLE_TAP_SCALE;
      savedX.value = focusX;
      savedY.value = focusY;
    });

  const gestures = Gesture.Simultaneous(pinch, Gesture.Exclusive(doubleTap, pan));

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ] as const,
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dismissProgress.value, [0, 1], [1, 0.25], Extrapolation.CLAMP),
  }));

  // Les commandes s'effacent pendant le geste de fermeture : elles n'ont plus
  // rien à commander une fois l'image en train de partir.
  const chromeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dismissProgress.value, [0, 0.4], [1, 0], Extrapolation.CLAMP),
  }));

  if (!visible || urls.length === 0) return null;

  const current = urls[Math.min(Math.max(index, 0), urls.length - 1)];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <StatusBar barStyle={statusBarStyle()} />
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />

        <GestureDetector gesture={gestures}>
          <Animated.View style={styles.stage}>
            <Animated.View key={current} style={[{ width, height: height * 0.8 }, imageStyle]}>
              <Image
                source={{ uri: current }}
                style={styles.image}
                resizeMode="contain"
                onLoadEnd={() => setLoaded(true)}
              />
            </Animated.View>
            {!loaded && (
              <View style={styles.loader} pointerEvents="none">
                <ActivityIndicator color={colors.white} />
              </View>
            )}
          </Animated.View>
        </GestureDetector>

        <Animated.View style={[styles.chrome, chromeStyle]} pointerEvents="box-none">
          <Tappable onPress={onClose} style={styles.close} accessibilityLabel="Fermer">
            <Ionicons name="close" size={24} color={colors.white} />
          </Tappable>

          {urls.length > 1 && (
            <View style={styles.counter}>
              <Text style={styles.counterText}>
                {index + 1} / {urls.length}
              </Text>
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center' },
  backdrop: { backgroundColor: '#000' },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  loader: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },

  chrome: { ...StyleSheet.absoluteFillObject },
  close: {
    position: 'absolute',
    top: 48,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  counter: {
    position: 'absolute',
    bottom: 54,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  counterText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.white },
});
