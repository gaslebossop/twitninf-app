/**
 * 🧪 Lecture plein écran d'une vidéo du fil « 2B — Gouttière ».
 *
 * Pendant du `ImageViewerPaper` pour la vidéo : mêmes gestes, même fond noir,
 * même absence totale de chrome système.
 *
 * ── Pourquoi pas `presentFullscreenPlayer()` ────────────────────────────
 * Parce que c'est précisément ce qu'on cherche à ne plus montrer. Le plein
 * écran d'AVPlayer ramène sa barre grise, son bouton PiP, sa typographie et son
 * geste de fermeture — l'agrandissement rendrait au lecteur natif tout ce que
 * le lecteur en place vient de lui retirer.
 *
 * ── La reprise, dans les deux sens ──────────────────────────────────────
 * Deux instances d'`expo-av` ne partagent pas de session : impossible de
 * « déplacer » la vidéo du fil vers ici. On ouvre donc un second flux, posé à
 * la position d'arrivée, et on rend la position de sortie à la fermeture. Le
 * lecteur en place est coupé AVANT ce montage (`suspendStage`) : sans ça, deux
 * décodeurs jouent le même son à deux positions différentes.
 *
 * ── Pourquoi le fond reste NOIR dans les deux thèmes ────────────────────
 * Même raison que la visionneuse d'images : une image se regarde sur ce qui ne
 * renvoie aucune lumière parasite sur ses propres couleurs.
 *
 * ── Règle des worklets ──────────────────────────────────────────────────
 * Tout ce qui tourne dans un geste tourne sur le thread UI. Y appeler une
 * fonction JS ordinaire tue l'application sans le moindre log : les retours
 * vers React passent tous par `scheduleOnRN`.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { ResizeMode, Video, type AVPlaybackStatus } from 'expo-av';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  Extrapolation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import Ionicons from '@expo/vector-icons/Ionicons';

import { paperFonts, ps } from '../../../theme/paper2b';
import { timing } from '../../../utils/gesture';
import { formatClock } from '../../ui/VoiceWaveform';
import feedback from '../../../utils/feedback';
import VideoScrubBar from './VideoScrubBar';
import { setStageMuted, useStageMuted } from './videoStage';

/** Distance verticale au-delà de laquelle le glissement ferme — celle du visionneur d'images. */
const DISMISS_DISTANCE = 130;
/** Délai avant que l'habillage s'efface tout seul, pendant la lecture. */
const AUTO_HIDE_MS = 3200;
/** Bond du double-appui, de chaque côté de l'écran. */
const SKIP_MS = 10000;
const PROGRESS_INTERVAL_MS = 200;

interface VideoViewerPaperProps {
  videoUrl: string;
  thumbnailUrl?: string;
  /** Position d'arrivée, reprise du lecteur en place. */
  startAtMs: number;
  /** Rend la position de sortie : le fil reprend exactement là. */
  onClose: (positionMs: number) => void;
  onDuration?: (durationMs: number) => void;
}

export default function VideoViewerPaper({
  videoUrl,
  thumbnailUrl,
  startAtMs,
  onClose,
  onDuration,
}: VideoViewerPaperProps) {
  const { width, height } = useWindowDimensions();
  const muted = useStageMuted();
  const ref = useRef<Video>(null);

  const [playing, setPlaying] = useState(true);
  const [buffering, setBuffering] = useState(true);
  const [hasFrame, setHasFrame] = useState(false);
  const [positionMs, setPositionMs] = useState(startAtMs);
  const [durationMs, setDurationMs] = useState(0);
  const [landscape, setLandscape] = useState(false);
  const [chromeShown, setChromeShown] = useState(true);

  const progress = useSharedValue(0);
  const scrubbing = useSharedValue(0);
  const dismiss = useSharedValue(0);
  const chrome = useSharedValue(1);
  /** Repère du bond : -1 à gauche, +1 à droite, 0 éteint. */
  const skipSide = useSharedValue(0);

  const positionRef = useRef(startAtMs);
  const durationRef = useRef(0);
  const seededRef = useRef(false);
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Habillage : il s'efface tout seul, mais jamais pendant une pause ──────
  const armAutoHide = useCallback(() => {
    if (hideRef.current) clearTimeout(hideRef.current);
    hideRef.current = setTimeout(() => {
      chrome.value = withTiming(0, timing.base);
      setChromeShown(false);
    }, AUTO_HIDE_MS);
  }, [chrome]);

  const showChrome = useCallback(() => {
    chrome.value = withTiming(1, timing.fast);
    setChromeShown(true);
    armAutoHide();
  }, [armAutoHide, chrome]);

  useEffect(() => {
    armAutoHide();
    return () => {
      if (hideRef.current) clearTimeout(hideRef.current);
      if (skipRef.current) clearTimeout(skipRef.current);
    };
  }, [armAutoHide]);

  // Une vidéo en pause qui perd son habillage laisse un écran mort, sans le
  // moindre moyen de repartir sinon en tâtonnant.
  useEffect(() => {
    if (playing) return;
    if (hideRef.current) clearTimeout(hideRef.current);
    chrome.value = withTiming(1, timing.fast);
    setChromeShown(true);
  }, [chrome, playing]);

  // ── Rotation ─────────────────────────────────────────────────────────────
  // L'app est verrouillée en portrait (`app.config.js`) : le paysage n'existe
  // que le temps de cette visionneuse, et le verrou portrait est remis À TOUS
  // LES COUPS au démontage — un retour au fil couché serait irrattrapable, la
  // maquette 2B n'ayant aucune disposition paysage.
  useEffect(
    () => () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    },
    [],
  );

  const toggleLandscape = useCallback(() => {
    feedback.tap();
    const next = !landscape;
    setLandscape(next);
    showChrome();
    ScreenOrientation.lockAsync(
      next ? ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT : ScreenOrientation.OrientationLock.PORTRAIT_UP,
    ).catch(() => {});
  }, [landscape, showChrome]);

  // ── Fermeture ────────────────────────────────────────────────────────────
  const close = useCallback(() => {
    onClose(positionRef.current);
  }, [onClose]);

  // ── Lecture ──────────────────────────────────────────────────────────────
  const handleStatus = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;

      setBuffering(!!status.isBuffering && !status.isPlaying);

      const total = status.durationMillis ?? 0;
      if (total > 0 && durationRef.current !== total) {
        durationRef.current = total;
        setDurationMs(total);
        onDuration?.(total);
      }

      const position = status.positionMillis ?? 0;
      positionRef.current = position;
      if (!hasFrame && position > 0) setHasFrame(true);

      // Le compteur ne se rerend qu'au changement de seconde affichée : React
      // coupe court quand la valeur est identique.
      setPositionMs(Math.floor(position / 1000) * 1000);

      if (total > 0 && scrubbing.value === 0) {
        progress.value = withTiming(position / total, {
          duration: PROGRESS_INTERVAL_MS,
          easing: Easing.linear,
        });
      }

      if (status.didJustFinish && !status.isLooping) setPlaying(false);
    },
    [hasFrame, onDuration, progress, scrubbing],
  );

  const handleLoad = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded || seededRef.current) return;
      seededRef.current = true;
      if (startAtMs > 800) ref.current?.setPositionAsync(startAtMs).catch(() => {});
    },
    [startAtMs],
  );

  const seekTo = useCallback((ms: number) => {
    const total = durationRef.current;
    const target = total > 0 ? Math.min(Math.max(ms, 0), total) : Math.max(ms, 0);
    positionRef.current = target;
    ref.current?.setPositionAsync(Math.round(target)).catch(() => {});
  }, []);

  const handleSeekRatio = useCallback(
    (ratio: number) => {
      if (durationRef.current <= 0) return;
      seekTo(ratio * durationRef.current);
    },
    [seekTo],
  );

  const togglePlay = useCallback(() => {
    feedback.tap();
    setPlaying((value) => !value);
    showChrome();
  }, [showChrome]);

  const toggleMute = useCallback(() => {
    feedback.tap();
    setStageMuted(!muted);
    showChrome();
  }, [muted, showChrome]);

  /** Bond de ±10 s, avec son repère qui s'allume un instant du bon côté. */
  const skip = useCallback(
    (direction: -1 | 1) => {
      feedback.select();
      seekTo(positionRef.current + direction * SKIP_MS);
      showChrome();
      skipSide.value = direction;
      if (skipRef.current) clearTimeout(skipRef.current);
      skipRef.current = setTimeout(() => {
        skipSide.value = 0;
      }, 520);
    },
    [seekTo, showChrome, skipSide],
  );

  const toggleChrome = useCallback(() => {
    if (chromeShown) {
      if (hideRef.current) clearTimeout(hideRef.current);
      chrome.value = withTiming(0, timing.fast);
      setChromeShown(false);
    } else {
      showChrome();
    }
  }, [chrome, chromeShown, showChrome]);

  // ── Gestes ───────────────────────────────────────────────────────────────
  const gesture = useMemo(() => {
    // Glisser vers le bas ferme. `failOffsetX` laisse la barre de progression
    // travailler : sans lui, un scrub un peu oblique fermerait la visionneuse.
    const pan = Gesture.Pan()
      .activeOffsetY([-14, 14])
      .failOffsetX([-24, 24])
      .onUpdate((e) => {
        'worklet';
        dismiss.value = Math.max(0, e.translationY);
      })
      .onEnd((e) => {
        'worklet';
        if (e.translationY > DISMISS_DISTANCE || e.velocityY > 900) {
          scheduleOnRN(close);
          return;
        }
        dismiss.value = withTiming(0, timing.fast);
      });

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDuration(280)
      .onEnd((e) => {
        'worklet';
        scheduleOnRN(skip, e.x < width / 2 ? -1 : 1);
      });

    const singleTap = Gesture.Tap()
      .numberOfTaps(1)
      .onEnd(() => {
        'worklet';
        scheduleOnRN(toggleChrome);
      });

    // `Exclusive` entre les deux appuis : le simple doit attendre que le double
    // soit écarté, sinon un double-appui masque aussi l'habillage au passage.
    // `Race` face au glissement : les trois sont mutuellement exclusifs.
    return Gesture.Race(pan, Gesture.Exclusive(doubleTap, singleTap));
  }, [close, dismiss, skip, toggleChrome, width]);

  // ── Styles animés ────────────────────────────────────────────────────────
  const sceneStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: dismiss.value },
      { scale: interpolate(dismiss.value, [0, DISMISS_DISTANCE * 2], [1, 0.88], Extrapolation.CLAMP) },
    ] as const,
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dismiss.value, [0, DISMISS_DISTANCE * 1.6], [1, 0.3], Extrapolation.CLAMP),
  }));

  const chromeStyle = useAnimatedStyle(() => ({
    opacity: chrome.value * interpolate(dismiss.value, [0, 80], [1, 0], Extrapolation.CLAMP),
  }));

  const skipLeftStyle = useAnimatedStyle(() => ({
    opacity: skipSide.value === -1 ? 1 : 0,
  }));
  const skipRightStyle = useAnimatedStyle(() => ({
    opacity: skipSide.value === 1 ? 1 : 0,
  }));

  const remainingLabel = durationMs > 0 ? formatClock(durationMs) : '--:--';

  return (
    <Modal
      visible
      transparent
      statusBarTranslucent
      animationType="fade"
      onRequestClose={close}
      supportedOrientations={['portrait', 'landscape']}
    >
      <StatusBar hidden />
      <GestureHandlerRootView style={S.root}>
        <Animated.View style={[S.backdrop, backdropStyle]} />

        <GestureDetector gesture={gesture}>
          <Animated.View style={[S.scene, { width, height }, sceneStyle]}>
            {/* La miniature tient l'image tant que le flux n'a pas rendu la
                sienne : sans elle, l'agrandissement passe par un rectangle noir. */}
            {!!thumbnailUrl && !hasFrame && (
              <Image
                source={{ uri: thumbnailUrl }}
                style={StyleSheet.absoluteFill}
                contentFit="contain"
                cachePolicy="memory-disk"
                transition={0}
              />
            )}

            <Video
              ref={ref}
              source={{ uri: videoUrl }}
              style={StyleSheet.absoluteFill}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={playing}
              isMuted={muted}
              progressUpdateIntervalMillis={PROGRESS_INTERVAL_MS}
              onPlaybackStatusUpdate={handleStatus}
              onLoad={handleLoad}
            />

            {buffering && (
              <View style={S.buffer} pointerEvents="none">
                <ActivityIndicator size="large" color="#FFFFFF" />
              </View>
            )}

            {/* Repères du double-appui — ils n'apparaissent QUE quand on saute,
                jamais au repos : un lecteur couvert de flèches en permanence
                ressemble à une télécommande. */}
            <Animated.View style={[S.skipMark, S.skipLeft, skipLeftStyle]} pointerEvents="none">
              <Ionicons name="play-back" size={ps(22)} color="#FFFFFF" />
              <Text style={S.skipText}>10 s</Text>
            </Animated.View>
            <Animated.View style={[S.skipMark, S.skipRight, skipRightStyle]} pointerEvents="none">
              <Ionicons name="play-forward" size={ps(22)} color="#FFFFFF" />
              <Text style={S.skipText}>10 s</Text>
            </Animated.View>
          </Animated.View>
        </GestureDetector>

        {/* L'habillage est un FRÈRE de la scène, pas un enfant — et c'est la
            structure d'`ImageViewerPaper`, pour une raison précise : Gesture
            Handler ne fait participer au toucher que les gestes portés par les
            ANCÊTRES de la vue touchée. Posés dans le détecteur, ces boutons
            partageraient leur appui avec le simple-appui de la scène, et couper
            le son masquerait l'habillage dans le même geste. En frère, le
            bouton reçoit l'appui, seul. */}
        <Animated.View
          style={[S.chrome, chromeStyle]}
          pointerEvents={chromeShown ? 'box-none' : 'none'}
        >
          <View style={S.topBar} pointerEvents="box-none">
            <Pressable
              style={S.roundBtn}
              onPress={close}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Fermer la vidéo"
            >
              <Ionicons name="chevron-down" size={ps(22)} color="#FFFFFF" />
            </Pressable>
            <Pressable
              style={S.roundBtn}
              onPress={toggleMute}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={muted ? 'Activer le son' : 'Couper le son'}
            >
              <Ionicons name={muted ? 'volume-mute' : 'volume-medium'} size={ps(19)} color="#FFFFFF" />
            </Pressable>
          </View>

          <Pressable
            style={S.bigBtn}
            onPress={togglePlay}
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Mettre en pause' : 'Lire'}
          >
            <Ionicons
              name={playing ? 'pause' : 'play'}
              size={ps(32)}
              color="#FFFFFF"
              style={playing ? undefined : S.playGlyph}
            />
          </Pressable>

          <View style={S.bottomBar} pointerEvents="box-none">
            <View style={S.clockRow}>
              <Text style={S.clock}>{formatClock(positionMs)}</Text>
              <Text style={[S.clock, S.clockDim]}>{remainingLabel}</Text>
            </View>

            <VideoScrubBar
              progress={progress}
              scrubbing={scrubbing}
              onSeek={handleSeekRatio}
              onScrubStart={showChrome}
              expanded
            />

            <View style={S.bottomActions} pointerEvents="box-none">
              <Pressable
                style={S.roundBtn}
                onPress={toggleLandscape}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={landscape ? 'Repasser en portrait' : 'Passer en paysage'}
              >
                <Ionicons
                  name={landscape ? 'phone-portrait-outline' : 'phone-landscape-outline'}
                  size={ps(18)}
                  color="#FFFFFF"
                />
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const S = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  scene: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  buffer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chrome: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: ps(14),
    // Encoche : la visionneuse est hors du `SafeAreaProvider` (elle vit dans la
    // fenêtre native de la `Modal`), donc l'inset est posé à la main.
    paddingTop: ps(54),
  },
  bigBtn: {
    alignSelf: 'center',
    width: ps(74),
    height: ps(74),
    borderRadius: ps(37),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11,10,12,0.44)',
  },
  playGlyph: {
    marginLeft: ps(4),
  },
  bottomBar: {
    paddingHorizontal: ps(14),
    paddingBottom: ps(30),
  },
  clockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: ps(2),
  },
  clock: {
    fontFamily: paperFonts.mono,
    fontSize: ps(12),
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  clockDim: {
    color: 'rgba(255,255,255,0.6)',
  },
  bottomActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  roundBtn: {
    width: ps(38),
    height: ps(38),
    borderRadius: ps(19),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11,10,12,0.44)',
  },
  skipMark: {
    position: 'absolute',
    top: '46%',
    alignItems: 'center',
    gap: ps(4),
    paddingVertical: ps(12),
    paddingHorizontal: ps(16),
    borderRadius: ps(18),
    backgroundColor: 'rgba(11,10,12,0.5)',
  },
  skipLeft: {
    left: '12%',
  },
  skipRight: {
    right: '12%',
  },
  skipText: {
    fontFamily: paperFonts.mono,
    fontSize: ps(11),
    color: '#FFFFFF',
  },
});
