/**
 * 🧪 Vidéo jointe à un tweet, dans le fil « 2B — Gouttière ».
 *
 * Clone de `components/feed/TweetVideo.tsx` — l'original continue de servir le
 * fil 2A, qui n'est pas touché (même convention que `TweetImagesPaper`).
 *
 * ── Ce qui n'allait pas dans l'original ─────────────────────────────────
 * Il posait `useNativeControls` et rendait la main : à l'appui, le fil se
 * remplissait de la barre grise d'AVPlayer, avec son bouton PiP, son bouton
 * plein écran système et sa typographie — un morceau d'iOS collé au milieu
 * d'une maquette qui n'a ni cette graisse, ni ces rayons, ni cet accent. Et
 * rien ne partait tant qu'on n'avait pas appuyé : un fil entier de miniatures
 * immobiles.
 *
 * ── Ce que celui-ci fait ────────────────────────────────────────────────
 *   - **lecture automatique et muette** dès que la ligne est à l'écran, une
 *     seule vidéo à la fois, arbitrée par `videoStage` ;
 *   - **habillage maison** : pastille son, temps restant en chasse fixe, barre
 *     de progression scrutable à l'accent du test, bouton d'agrandissement ;
 *   - **plein écran maison** (`VideoViewerPaper`), pas celui d'AVPlayer, avec
 *     reprise exactement là où on en était, dans les deux sens.
 *
 * ── Le coût, ligne par ligne ────────────────────────────────────────────
 * Dans ce fil, tout `useAnimatedStyle` posé dans une ligne se paie ×40 (voir
 * `docs/2B-FLUIDITE-RENDU.md`). L'état AU REPOS — la très grande majorité des
 * lignes, y compris celles qui portent une vidéo qu'on n'a pas encore atteinte
 * — n'a donc AUCUN crochet animé : c'est une image et un rond. Tout ce qui
 * anime vit dans `Stage`, monté sur la seule vidéo qui joue.
 *
 * ── Pourquoi 16/9 fixe ──────────────────────────────────────────────────
 * La hauteur réelle n'est connue qu'une fois le flux ouvert. S'y adapter
 * décalerait le contenu déjà lu au moment où la vidéo arrive — le défaut qui
 * fait perdre sa place dans un fil, exactement celui que `TweetImagesPaper`
 * évite avec son ratio fixe. Miniature et vidéo sont donc toutes deux en
 * `contain` sur le même fond : le passage de l'une à l'autre ne bouge pas d'un
 * pixel.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ResizeMode, Video, type AVPlaybackStatus } from 'expo-av';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useIsFocused } from '@react-navigation/native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { paperFonts, ps } from '../../../theme/paper2b';
import { ease, timing } from '../../../utils/gesture';
import { formatClock } from '../../ui/VoiceWaveform';
import feedback from '../../../utils/feedback';
import VideoScrubBar from './VideoScrubBar';
import VideoViewerPaper from './VideoViewerPaper';
import {
  pauseVideo,
  playVideo,
  resumeStage,
  suspendStage,
  toggleStageMuted,
  useStageMuted,
  useVideoSlot,
} from './videoStage';

/**
 * Cadence des rapports de lecture. 200 ms, et pas le défaut de 500 : c'est ce
 * qui sépare une barre qui avance d'une barre qui saute. La barre elle-même
 * comble l'intervalle par une interpolation linéaire, donc ce confort ne se
 * paie pas en rendus React (voir `VideoScrubBar`).
 */
const PROGRESS_INTERVAL_MS = 200;

/**
 * En deçà, la vidéo boucle. Un extrait de huit secondes qui s'arrête net sur sa
 * dernière image dans un fil ressemble à une panne ; au-delà d'une demi-minute,
 * reboucler à l'insu du lecteur est agressif.
 */
const LOOP_MAX_MS = 30000;

interface TweetVideoPaperProps {
  /** Identifiant de la LIGNE du fil — c'est lui que la liste déclare visible. */
  tweetId: string;
  videoUrl: string;
  thumbnailUrl?: string;
  /** Appelé avant toute interaction — neutralise l'appui de la ligne. */
  onBeforeOpen?: () => void;
  /**
   * Durée réelle de la vidéo, dès qu'`expo-av` la connaît. N'existe nulle part
   * dans le modèle `Tweet` : sans elle, le dwell du fil retombe sur un forfait
   * de 8 s côté moteur et le raisonnement en taux de complétion ne s'applique
   * jamais à une vidéo du fil.
   */
  onDuration?: (durationMs: number) => void;
}

export default function TweetVideoPaper({
  tweetId,
  videoUrl,
  thumbnailUrl,
  onBeforeOpen,
  onDuration,
}: TweetVideoPaperProps) {
  const active = useVideoSlot(tweetId);
  /**
   * L'écran qui porte cette ligne est-il encore CELUI qu'on regarde ?
   *
   * Le garde vit ici, et pas seulement dans le fil : `TweetRowGutter` sert
   * aussi la recherche, et un écran poussé par-dessus ne démonte pas celui du
   * dessous. Sans ça, une vidéo lancée dans les résultats continuerait de
   * jouer, son compris, pendant qu'on lit un profil.
   *
   * Le fil, lui, a en plus son propre garde (`FeedGutterScreen`) : la
   * navigation ne voit ni l'onglet Explorer ni le calque de lecture immersive,
   * qui vivent DANS l'écran du fil.
   */
  const screenFocused = useIsFocused();
  /** Mise en pause à la main : la vidéo garde son image, mais rend la scène. */
  const [held, setHeld] = useState(false);
  const [hasFrame, setHasFrame] = useState(false);
  const [failed, setFailed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  /** Reprise : là où on en était, du plein écran au fil et retour. */
  const resumeAtRef = useRef(0);

  // La scène a rendu la main à cette vidéo (défilement, retour du plein écran) :
  // une pause posée il y a trois tweets ne doit pas la retenir.
  useEffect(() => {
    if (active) setHeld(false);
  }, [active]);

  // Recyclage de ligne : `expo-image` vide la vue avant de charger une nouvelle
  // source, mais l'état de CE composant, lui, survivrait au changement de tweet
  // si on ne le remettait pas à plat.
  useEffect(() => {
    setHasFrame(false);
    setFailed(false);
    resumeAtRef.current = 0;
  }, [videoUrl]);

  const handlePlay = useCallback(() => {
    onBeforeOpen?.();
    feedback.tap();
    setFailed(false);
    setHeld(false);
    playVideo(tweetId);
  }, [onBeforeOpen, tweetId]);

  const handlePause = useCallback(() => {
    onBeforeOpen?.();
    feedback.tap();
    setHeld(true);
    pauseVideo(tweetId);
  }, [onBeforeOpen, tweetId]);

  const handleOpenFullscreen = useCallback(() => {
    onBeforeOpen?.();
    feedback.tap();
    // La scène est coupée AVANT le montage du plein écran : deux instances du
    // même flux qui jouent ensemble, c'est un écho, et deux décodeurs ouverts.
    suspendStage();
    setFullscreen(true);
  }, [onBeforeOpen]);

  const handleCloseFullscreen = useCallback(
    (positionMs: number) => {
      resumeAtRef.current = positionMs;
      setFullscreen(false);
      setHasFrame(false);
      setHeld(false);
      resumeStage();
      playVideo(tweetId);
    },
    [tweetId],
  );

  const handleFail = useCallback(() => {
    setFailed(true);
    setHeld(false);
    pauseVideo(tweetId);
  }, [tweetId]);

  /**
   * Fin de lecture d'une vidéo trop longue pour boucler. Elle reste montée sur
   * sa première image, prête à repartir : la renvoyer à la miniature ferait
   * clignoter la ligne au moment précis où l'on vient de finir de regarder.
   */
  const handleEnded = useCallback(() => {
    resumeAtRef.current = 0;
    setHeld(true);
    pauseVideo(tweetId);
  }, [tweetId]);

  const handleFirstFrame = useCallback(() => setHasFrame(true), []);

  const handlePosition = useCallback((ms: number) => {
    resumeAtRef.current = ms;
  }, []);

  const mounted = screenFocused && (active || held) && !failed && !fullscreen;

  return (
    <View style={S.frame}>
      {/* Miniature toujours montée sous la vidéo : elle tient la place pendant
          l'ouverture du flux, et reprend la main dès que la ligne rend la
          scène. `expo-image` pour le cache mémoire+disque et le `recyclingKey`,
          mêmes raisons que la grille d'images. */}
      {!!thumbnailUrl && !hasFrame && (
        <Image
          source={{ uri: thumbnailUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          cachePolicy="memory-disk"
          recyclingKey={thumbnailUrl}
          transition={0}
        />
      )}

      {mounted && (
        <Stage
          videoUrl={videoUrl}
          playing={active}
          startAtMs={resumeAtRef.current}
          onFirstFrame={handleFirstFrame}
          onPositionChange={handlePosition}
          onDuration={onDuration}
          onPause={handlePause}
          onResume={handlePlay}
          onEnded={handleEnded}
          onBeforeInteract={onBeforeOpen}
          onFullscreen={handleOpenFullscreen}
          onFail={handleFail}
        />
      )}

      {/* Au repos : le seul signal nécessaire. Pas de voile sur toute l'image —
          un gris permanent sur chaque vidéo du fil ternirait toutes les
          miniatures pour rendre lisible un rond qui porte déjà son fond. */}
      {!mounted && !failed && (
        <Pressable
          style={S.posterHit}
          onPress={handlePlay}
          accessibilityRole="button"
          accessibilityLabel="Lire la vidéo"
        >
          <View style={S.playBadge}>
            <Ionicons name="play" size={ps(26)} color="#FFFFFF" style={S.playGlyph} />
          </View>
        </Pressable>
      )}

      {failed && (
        <Pressable
          style={S.failed}
          onPress={handlePlay}
          accessibilityRole="button"
          accessibilityLabel="Réessayer la lecture"
        >
          <Ionicons name="refresh" size={ps(20)} color="rgba(255,255,255,0.9)" />
          <Text style={S.failedText}>Vidéo indisponible — appuie pour réessayer</Text>
        </Pressable>
      )}

      {fullscreen && (
        <VideoViewerPaper
          videoUrl={videoUrl}
          thumbnailUrl={thumbnailUrl}
          startAtMs={resumeAtRef.current}
          onClose={handleCloseFullscreen}
          onDuration={onDuration}
        />
      )}
    </View>
  );
}

// ─── La vidéo qui joue ──────────────────────────────────────────────────────

interface StageProps {
  videoUrl: string;
  playing: boolean;
  startAtMs: number;
  onFirstFrame: () => void;
  onPositionChange: (ms: number) => void;
  onDuration?: (ms: number) => void;
  onPause: () => void;
  onResume: () => void;
  onEnded: () => void;
  onBeforeInteract?: () => void;
  onFullscreen: () => void;
  onFail: () => void;
}

/**
 * Isolée dans son propre composant, et pas fondue dans le lecteur : c'est ici
 * que vivent les trois `useAnimatedStyle` du lecteur, et ce composant n'est
 * monté que sur UNE ligne du fil à la fois. Fondus au-dessus, ces crochets
 * seraient montés sur chaque ligne portant une vidéo, jouée ou non.
 */
function Stage({
  videoUrl,
  playing,
  startAtMs,
  onFirstFrame,
  onPositionChange,
  onDuration,
  onPause,
  onResume,
  onEnded,
  onBeforeInteract,
  onFullscreen,
  onFail,
}: StageProps) {
  const muted = useStageMuted();
  const ref = useRef<Video>(null);

  const progress = useSharedValue(0);
  const scrubbing = useSharedValue(0);
  /** Opacité du glyphe central — 1 en pause, un éclair de 350 ms à la reprise. */
  const glyph = useSharedValue(playing ? 0 : 1);

  const [buffering, setBuffering] = useState(true);
  const [remaining, setRemaining] = useState(0);
  const [loopable, setLoopable] = useState(false);
  const durationRef = useRef(0);
  const seededRef = useRef(false);
  const frameRef = useRef(false);
  const hideGlyphRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Le premier passage de l'effet est le montage, pas un appui. */
  const firstRunRef = useRef(true);

  useEffect(
    () => () => {
      if (hideGlyphRef.current) clearTimeout(hideGlyphRef.current);
    },
    [],
  );

  useEffect(() => {
    if (hideGlyphRef.current) clearTimeout(hideGlyphRef.current);
    if (!playing) {
      glyph.value = withTiming(1, timing.instant);
      return;
    }
    // Une lecture qui DÉMARRE ne montre rien : le glyphe est un accusé de
    // réception d'appui, et la lecture automatique n'en est pas un. Sans cette
    // garde, chaque vidéo atteinte en défilant ferait clignoter une pause au
    // milieu de son image.
    if (firstRunRef.current) {
      firstRunRef.current = false;
      return;
    }
    // À la reprise, le glyphe se montre puis s'efface tout seul.
    glyph.value = withTiming(1, { duration: 90, easing: ease.out });
    hideGlyphRef.current = setTimeout(() => {
      glyph.value = withTiming(0, timing.base);
    }, 260);
  }, [glyph, playing]);

  const handleStatus = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) {
        if ('error' in status && status.error) onFail();
        return;
      }

      setBuffering(!!status.isBuffering && !status.isPlaying);

      const total = status.durationMillis ?? 0;
      if (total > 0 && durationRef.current !== total) {
        durationRef.current = total;
        setLoopable(total <= LOOP_MAX_MS);
        onDuration?.(total);
      }

      const position = status.positionMillis ?? 0;
      onPositionChange(position);

      if (!frameRef.current && position > 0) {
        frameRef.current = true;
        onFirstFrame();
      }

      if (total > 0) {
        // `setState` est appelé à chaque rapport, mais React coupe court quand
        // la valeur ne change pas : le compteur ne rerend qu'une fois par
        // seconde, pas cinq.
        setRemaining(Math.max(0, Math.ceil((total - position) / 1000)));
        if (scrubbing.value === 0) {
          progress.value = withTiming(position / total, {
            duration: PROGRESS_INTERVAL_MS,
            easing: Easing.linear,
          });
        }
      }

      if (status.didJustFinish && !status.isLooping) {
        // Remise à zéro AVANT de rendre la scène : sans elle, le prochain appui
        // relancerait une vidéo déjà à sa fin, qui s'arrêterait aussitôt.
        ref.current?.setPositionAsync(0).catch(() => {});
        progress.value = 0;
        onEnded();
      }
    },
    [onDuration, onEnded, onFail, onFirstFrame, onPositionChange, progress, scrubbing],
  );

  const handleLoad = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded || seededRef.current) return;
      seededRef.current = true;
      // Reprise du plein écran. Le seuil évite de poser un `seek` inutile — et
      // coûteux en ouverture de flux — pour une lecture qui commence au début.
      if (startAtMs > 800) ref.current?.setPositionAsync(startAtMs).catch(() => {});
    },
    [startAtMs],
  );

  const handleSeek = useCallback((ratio: number) => {
    const total = durationRef.current;
    if (total <= 0) return;
    ref.current?.setPositionAsync(Math.round(ratio * total)).catch(() => {});
  }, []);

  const handleToggle = useCallback(() => {
    if (playing) onPause();
    else onResume();
  }, [onPause, onResume, playing]);

  const handleMute = useCallback(() => {
    onBeforeInteract?.();
    feedback.tap();
    toggleStageMuted();
  }, [onBeforeInteract]);

  const glyphStyle = useAnimatedStyle(() => ({
    opacity: glyph.value,
    transform: [{ scale: 0.86 + glyph.value * 0.14 }],
  }));

  return (
    <>
      <Video
        ref={ref}
        source={{ uri: videoUrl }}
        style={StyleSheet.absoluteFill}
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay={playing}
        isMuted={muted}
        isLooping={loopable}
        progressUpdateIntervalMillis={PROGRESS_INTERVAL_MS}
        onPlaybackStatusUpdate={handleStatus}
        onLoad={handleLoad}
        onError={onFail}
      />

      {/* Toute la surface répond à l'appui : dans un fil, la cible est le
          rectangle vidéo tout entier, pas un bouton de 44 px. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={handleToggle}
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Mettre la vidéo en pause' : 'Reprendre la vidéo'}
      />

      <Animated.View style={[S.centerGlyph, glyphStyle]} pointerEvents="none">
        <Ionicons
          name={playing ? 'pause' : 'play'}
          size={ps(24)}
          color="#FFFFFF"
          style={playing ? undefined : S.playGlyph}
        />
      </Animated.View>

      {buffering && (
        <View style={S.buffer} pointerEvents="none">
          <ActivityIndicator color="#FFFFFF" />
        </View>
      )}

      {/* Voile de pied : les glyphes blancs doivent rester lisibles sur une
          image claire. Un dégradé, pas un aplat — un aplat noir de 76 px au bas
          de chaque vidéo se lit comme une bande, pas comme de la lumière. */}
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']} style={S.scrim} pointerEvents="none" />

      <View style={S.chrome} pointerEvents="box-none">
        <View style={S.chromeRow} pointerEvents="box-none">
          <View style={S.clockPill}>
            <Text style={S.clockText}>{formatClock(remaining * 1000)}</Text>
          </View>
          <View style={S.chromeButtons}>
            <Pressable
              style={S.chromeBtn}
              onPress={handleMute}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={muted ? 'Activer le son' : 'Couper le son'}
            >
              <Ionicons name={muted ? 'volume-mute' : 'volume-medium'} size={ps(15)} color="#FFFFFF" />
            </Pressable>
            <Pressable
              style={S.chromeBtn}
              onPress={onFullscreen}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Ouvrir en plein écran"
            >
              <Ionicons name="expand" size={ps(15)} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>

        <VideoScrubBar
          progress={progress}
          scrubbing={scrubbing}
          onSeek={handleSeek}
          onScrubStart={onBeforeInteract}
        />
      </View>
    </>
  );
}

const S = StyleSheet.create({
  frame: {
    width: '100%',
    aspectRatio: 16 / 9,
    marginTop: ps(10),
    borderRadius: ps(14),
    overflow: 'hidden',
    // Le fond des bandes noires. Pas `paper.bg` : une vidéo se regarde sur du
    // sombre, dans les deux thèmes — même raison que la visionneuse d'images.
    backgroundColor: '#0B0A0C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterHit: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBadge: {
    width: ps(58),
    height: ps(58),
    borderRadius: ps(29),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11,10,12,0.52)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  // Optique : un triangle centré paraît décalé à gauche tant qu'on ne compense
  // pas son propre centre de masse.
  playGlyph: {
    marginLeft: ps(3),
  },
  centerGlyph: {
    position: 'absolute',
    width: ps(52),
    height: ps(52),
    borderRadius: ps(26),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11,10,12,0.46)',
  },
  buffer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: ps(76),
  },
  chrome: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: ps(10),
  },
  chromeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chromeButtons: {
    flexDirection: 'row',
    gap: ps(6),
  },
  chromeBtn: {
    width: ps(30),
    height: ps(30),
    borderRadius: ps(15),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11,10,12,0.5)',
  },
  clockPill: {
    paddingHorizontal: ps(8),
    height: ps(22),
    borderRadius: ps(11),
    justifyContent: 'center',
    backgroundColor: 'rgba(11,10,12,0.5)',
  },
  clockText: {
    fontFamily: paperFonts.mono,
    fontSize: ps(11),
    color: '#FFFFFF',
    // La chasse fixe seule ne suffit pas : sans tabulaire, « 1:11 » et « 0:08 »
    // n'ont pas la même largeur et la pastille tressaute à chaque seconde.
    fontVariant: ['tabular-nums'],
  },
  failed: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: ps(8),
    paddingHorizontal: ps(24),
    backgroundColor: 'rgba(11,10,12,0.72)',
  },
  failedText: {
    fontFamily: paperFonts.body,
    fontSize: ps(12),
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
  },
});
