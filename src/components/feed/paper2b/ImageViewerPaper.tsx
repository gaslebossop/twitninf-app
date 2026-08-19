/**
 * 🧪 Visionneuse d'images du fil « 2B — Gouttière ».
 *
 * Clone de `components/feed/ImageViewer.tsx`. L'original n'est pas touché : il
 * continue de servir les 99 % hors du test.
 *
 * ── Ce qui n'allait pas dans l'original ─────────────────────────────────
 * Il n'y avait pas de galerie. Un glissement horizontal appelait `setIndex`,
 * qui REMPLAÇAIT la source de l'unique `<Image>` : l'image suivante ne
 * glissait pas, elle apparaissait d'un coup, sans lien avec le geste. Et la
 * scène était bornée à 80 % de la hauteur, donc aucune image n'occupait
 * vraiment l'écran — il restait deux bandes noires quoi qu'on fasse.
 *
 * ── Ce que celle-ci fait ────────────────────────────────────────────────
 *   - une vraie **liste paginée** : l'image suit le doigt, s'aimante à la
 *     suivante, et chaque page garde son propre zoom ;
 *   - **plein écran** : la page fait exactement la taille de la fenêtre, et
 *     l'image s'y inscrit en entier ;
 *   - **pastilles** quand il y a peu d'images, compteur au-delà : quatre
 *     points se lisent d'un coup d'œil, « 3 / 4 » demande de lire ;
 *   - pincer, double-tap centré sur le doigt, glisser vers le bas pour fermer
 *     — repris de l'original, qui les faisait déjà bien.
 *
 * ── Pourquoi le fond reste NOIR dans les deux thèmes ────────────────────
 * Ce n'est pas un oubli du thème papier. Une photo se regarde sur du noir :
 * c'est ce qui ne renvoie aucune lumière parasite sur ses propres couleurs.
 * Aucune visionneuse sérieuse ne pose une photo sur du blanc.
 *
 * ── Règle des worklets ──────────────────────────────────────────────────
 * Tout ce qui tourne dans un geste tourne sur le thread UI. Y appeler une
 * fonction JS ordinaire tue l'application sans le moindre log : les aides
 * portent donc `'worklet'`, et tout retour vers React passe par `runOnJS`.
 */

import React, { memo, useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { paperFonts, ps } from '../../../theme/paper2b';

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
/** Distance verticale au-delà de laquelle le glissement ferme. */
const DISMISS_DISTANCE = 130;
/** Au-delà, les pastilles deviennent illisibles : on repasse au compteur. */
const DOTS_MAX = 6;

const SPRING = { damping: 22, stiffness: 220, mass: 0.6 };

function clampWorklet(value: number, min: number, max: number) {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

// ─── Une page ───────────────────────────────────────────────────────────────

interface PageProps {
  url: string;
  width: number;
  height: number;
  /** Progression du glissement de fermeture, partagée avec le fond et l'habillage. */
  dismiss: SharedValue<number>;
  onClose: () => void;
  /** Prévient la liste qu'elle doit rendre la main aux gestes de la page. */
  onZoomChange: (zoomed: boolean) => void;
}

/**
 * Mémoïsée : `index` et `anyZoomed` vivent dans la visionneuse, si bien que
 * chaque glissé d'une image à l'autre et chaque entrée ou sortie de zoom
 * re-rendaient TOUTES les pages montées — c'est-à-dire plusieurs images plein
 * écran, dans un écran qui ne sert qu'à les regarder en grand.
 */
const ZoomablePage = memo(function ZoomablePage({ url, width, height, dismiss, onClose, onZoomChange }: PageProps) {
  const [loaded, setLoaded] = useState(false);
  /**
   * Le zoom est AUSSI en state React, pas seulement en `sharedValue` : c'est
   * lui qui active ou désactive les gestes et le défilement de la liste, et
   * `.enabled()` se configure au rendu, pas sur le thread UI.
   */
  const [zoomed, setZoomed] = useState(false);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  const applyZoom = useCallback(
    (next: boolean) => {
      setZoomed(next);
      onZoomChange(next);
    },
    [onZoomChange],
  );

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = clampWorklet(savedScale.value * e.scale, 0.8, MAX_SCALE);
    })
    .onEnd(() => {
      // En dessous de 1×, l'image revient d'elle-même : un pincement de sortie
      // doit rendre la vue d'ensemble, pas laisser une image minuscule.
      if (scale.value < 1.02) {
        scale.value = withSpring(1, SPRING);
        x.value = withSpring(0, SPRING);
        y.value = withSpring(0, SPRING);
        savedScale.value = 1;
        savedX.value = 0;
        savedY.value = 0;
        runOnJS(applyZoom)(false);
        return;
      }
      savedScale.value = scale.value;
      runOnJS(applyZoom)(true);
    });

  /** Déplacement de l'image zoomée. Actif SEULEMENT en zoom, sinon il volerait
   *  le défilement horizontal de la galerie. */
  const panMove = Gesture.Pan()
    .enabled(zoomed)
    .onUpdate((e) => {
      const limitX = ((scale.value - 1) * width) / 2;
      const limitY = ((scale.value - 1) * height) / 2;
      x.value = clampWorklet(savedX.value + e.translationX, -limitX, limitX);
      y.value = clampWorklet(savedY.value + e.translationY, -limitY, limitY);
    })
    .onEnd(() => {
      savedX.value = x.value;
      savedY.value = y.value;
    });

  /**
   * Glissement de fermeture. `activeOffsetY` + `failOffsetX` : il ne se
   * déclenche que sur un geste franchement vertical, sinon la galerie ne
   * défilerait plus jamais horizontalement.
   */
  const panDismiss = Gesture.Pan()
    .enabled(!zoomed)
    .activeOffsetY([-14, 14])
    .failOffsetX([-20, 20])
    .onUpdate((e) => {
      y.value = e.translationY;
      dismiss.value = clampWorklet(Math.abs(e.translationY) / DISMISS_DISTANCE, 0, 1);
    })
    .onEnd((e) => {
      if (Math.abs(e.translationY) > DISMISS_DISTANCE || Math.abs(e.velocityY) > 900) {
        runOnJS(onClose)();
        return;
      }
      y.value = withSpring(0, SPRING);
      dismiss.value = withTiming(0, { duration: 160 });
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      if (scale.value > 1) {
        scale.value = withSpring(1, SPRING);
        x.value = withSpring(0, SPRING);
        y.value = withSpring(0, SPRING);
        savedScale.value = 1;
        savedX.value = 0;
        savedY.value = 0;
        runOnJS(applyZoom)(false);
        return;
      }
      // Zoom centré sur le doigt : zoomer toujours au centre obligerait à
      // repositionner l'image juste après, à chaque fois.
      const focusX = (width / 2 - e.x) * (DOUBLE_TAP_SCALE - 1);
      const focusY = (height / 2 - e.y) * (DOUBLE_TAP_SCALE - 1);
      scale.value = withSpring(DOUBLE_TAP_SCALE, SPRING);
      x.value = withSpring(focusX, SPRING);
      y.value = withSpring(focusY, SPRING);
      savedScale.value = DOUBLE_TAP_SCALE;
      savedX.value = focusX;
      savedY.value = focusY;
      runOnJS(applyZoom)(true);
    });

  const gestures = Gesture.Simultaneous(
    pinch,
    Gesture.Exclusive(doubleTap, panMove, panDismiss),
  );

  // La page quitte l'écran : elle ne doit pas garder son zoom pour la
  // prochaine fois qu'on revient dessus.
  useEffect(() => () => { if (zoomed) onZoomChange(false); }, [zoomed, onZoomChange]);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }] as const,
  }));

  return (
    <GestureDetector gesture={gestures}>
      <Animated.View style={{ width, height }}>
        <Animated.View style={[S.pageInner, imageStyle]}>
          <Image
            source={{ uri: url }}
            style={S.image}
            resizeMode="contain"
            onLoadEnd={() => setLoaded(true)}
            accessibilityIgnoresInvertColors
          />
        </Animated.View>
        {!loaded && (
          <View style={S.loader} pointerEvents="none">
            <ActivityIndicator color="#FFFFFF" />
          </View>
        )}
        {/* Rappel du geste de sortie : une fois zoomé, rien à l'écran ne dit
            comment revenir, et re-pincer vers l'extérieur est le geste le plus
            pénible des deux. */}
        {zoomed && (
          <View pointerEvents="none" style={S.zoomHintWrap}>
            <Text style={S.zoomHint}>Double-tap pour revenir</Text>
          </View>
        )}
      </Animated.View>
    </GestureDetector>
  );
});

// ─── La visionneuse ─────────────────────────────────────────────────────────

interface ImageViewerPaperProps {
  urls: string[];
  initialIndex?: number;
  visible: boolean;
  onClose: () => void;
}

export default function ImageViewerPaper({
  urls,
  initialIndex = 0,
  visible,
  onClose,
}: ImageViewerPaperProps) {
  // `useWindowDimensions` et non `Dimensions.get` : la modale couvre la barre
  // de statut, ses pages doivent suivre la fenêtre réelle.
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(initialIndex);
  const [anyZoomed, setAnyZoomed] = useState(false);

  const dismiss = useSharedValue(0);

  useEffect(() => {
    if (!visible) return;
    setIndex(initialIndex);
    setAnyZoomed(false);
    dismiss.value = 0;
  }, [visible, initialIndex, dismiss]);

  /**
   * Stables : `ZoomablePage` mémoïsée ne sert à rien si elle reçoit un élément
   * neuf à chaque changement d'index ou de zoom. `setAnyZoomed` est déjà stable
   * (c'est un setter de `useState`), et `width`/`height` ne bougent qu'à la
   * rotation — les seules dépendances qui restent.
   */
  const renderPage = useCallback(
    ({ item }: { item: string }) => (
      <ZoomablePage
        url={item}
        width={width}
        height={height}
        dismiss={dismiss}
        onClose={onClose}
        onZoomChange={setAnyZoomed}
      />
    ),
    [width, height, dismiss, onClose],
  );
  const pageKeyExtractor = useCallback((url: string, i: number) => `${url}-${i}`, []);
  const getPageLayout = useCallback(
    (_: unknown, i: number) => ({ length: width, offset: width * i, index: i }),
    [width],
  );

  const onMomentumEnd = useCallback(
    (e: { nativeEvent: { contentOffset: { x: number } } }) => {
      const next = Math.round(e.nativeEvent.contentOffset.x / width);
      setIndex(clampWorklet(next, 0, urls.length - 1));
    },
    [width, urls.length],
  );

  const share = useCallback(async () => {
    const url = urls[index];
    if (!url) return;
    try {
      await Share.share({ url, message: url });
    } catch {
      // L'utilisateur a annulé, ou la plateforme a refusé : ce n'est pas une
      // erreur à lui signaler par-dessus une image plein écran.
    }
  }, [urls, index]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dismiss.value, [0, 1], [1, 0.2], Extrapolation.CLAMP),
  }));

  // L'habillage s'efface pendant le geste de fermeture : il n'a plus rien à
  // commander une fois l'image en train de partir.
  const chromeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dismiss.value, [0, 0.4], [1, 0], Extrapolation.CLAMP),
  }));

  if (!visible || urls.length === 0) return null;

  const showDots = urls.length > 1 && urls.length <= DOTS_MAX;
  const showCounter = urls.length > DOTS_MAX;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" />
      {/* Une `<Modal>` native rend dans SA fenêtre, hors de l'arbre React : le
          `GestureHandlerRootView` d'`App.tsx` ne la couvre pas, et sans
          celui-ci aucun geste n'est reconnu sous Android — la visionneuse s'y
          réduirait à une image fixe qu'on ne pourrait ni zoomer ni fermer. */}
      <GestureHandlerRootView style={S.root}>
        <Animated.View style={[StyleSheet.absoluteFill, S.backdrop, backdropStyle]} />

        <FlatList
          data={urls}
          horizontal
          pagingEnabled
          // Coupé dès qu'une page est zoomée : sinon le déplacement dans
          // l'image fait défiler la galerie au lieu de bouger la photo.
          scrollEnabled={!anyZoomed}
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={getPageLayout}
          keyExtractor={pageKeyExtractor}
          onMomentumScrollEnd={onMomentumEnd}
          renderItem={renderPage}
        />

        <Animated.View style={[S.chrome, chromeStyle]} pointerEvents="box-none">
          <View style={S.topBar} pointerEvents="box-none">
            <Pressable
              style={S.action}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
              hitSlop={{ top: ps(8), bottom: ps(8), left: ps(8), right: ps(8) }}
            >
              <Ionicons name="close" size={ps(24)} color="#FFFFFF" />
            </Pressable>
            <Pressable
              style={S.action}
              onPress={share}
              accessibilityRole="button"
              accessibilityLabel="Partager cette image"
              hitSlop={{ top: ps(8), bottom: ps(8), left: ps(8), right: ps(8) }}
            >
              <Ionicons name="share-outline" size={ps(21)} color="#FFFFFF" />
            </Pressable>
          </View>

          {showDots && (
            <View style={S.dots} pointerEvents="none">
              {urls.map((url, i) => (
                <View key={`${url}-${i}`} style={[S.dot, i === index && S.dotOn]} />
              ))}
            </View>
          )}

          {showCounter && (
            <View style={S.counter} pointerEvents="none">
              <Text style={S.counterText}>
                {index + 1} / {urls.length}
              </Text>
            </View>
          )}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const S = StyleSheet.create({
  root: { flex: 1 },
  // Noir dans les deux thèmes, et c'est voulu — voir l'en-tête du fichier.
  backdrop: { backgroundColor: '#000000' },
  pageInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  loader: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },

  zoomHintWrap: { position: 'absolute', bottom: ps(110), alignSelf: 'center' },
  zoomHint: {
    fontFamily: paperFonts.mono,
    fontSize: ps(10),
    letterSpacing: ps(0.8),
    color: 'rgba(255,255,255,0.55)',
  },

  chrome: { ...StyleSheet.absoluteFillObject },
  topBar: {
    position: 'absolute',
    top: ps(48),
    left: ps(12),
    right: ps(12),
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  action: {
    width: ps(40),
    height: ps(40),
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: ps(20),
    backgroundColor: 'rgba(0,0,0,0.45)',
  },

  dots: {
    position: 'absolute',
    bottom: ps(56),
    alignSelf: 'center',
    flexDirection: 'row',
    gap: ps(7),
  },
  dot: {
    width: ps(6),
    height: ps(6),
    borderRadius: ps(3),
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  dotOn: { backgroundColor: '#FFFFFF' },

  counter: {
    position: 'absolute',
    bottom: ps(52),
    alignSelf: 'center',
    paddingHorizontal: ps(12),
    paddingVertical: ps(6),
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  counterText: {
    fontFamily: paperFonts.mono,
    fontSize: ps(12),
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
});
