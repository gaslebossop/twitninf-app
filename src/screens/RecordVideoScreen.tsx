import { fonts , colors} from '../theme';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { File, Paths } from 'expo-file-system';
import type { RtmpPublisherViewMethods } from 'react-native-nitro-rtmp-publisher';
import { useAuth } from '../contexts/AuthContext';
import { effectiveSubscriptionTier, type SubscriptionTier } from '../utils/subscriptionTier';
import { toast } from '../components/ui/Toast';
import { confirmAsync } from '../components/ui/ConfirmSheet';

/**
 * Caméra de l'app — enregistrement façon TikTok.
 *
 * On n'utilise plus `ImagePicker.launchCameraAsync` : celui-ci ouvre la
 * caméra *du système*, une interface qu'on ne contrôle pas (pas de segments,
 * pas de retardateur, pas de limite de durée par palier, et un rendu qui n'a
 * rien à voir avec le reste de l'app). Le module utilisé pour le live expose
 * `startRecord(path)` / `pauseRecord()` / `resumeRecord()`, qui écrivent un
 * MP4 **indépendamment de toute diffusion** : la même vue caméra sert donc
 * ici.
 *
 * ⚠️ Un seul fichier MP4 est écrit pour toute la prise : `pauseRecord` /
 * `resumeRecord` mettent l'écriture en pause, ils ne créent pas de fichiers
 * séparés. On peut donc afficher les segments et tout reprendre à zéro, mais
 * PAS supprimer le dernier segment seul — il faudrait découper le MP4, ce qui
 * demanderait ffmpeg. Pour la même raison, il n'y a ni réglage de vitesse ni
 * piste sonore ajoutée : ce module est un encodeur de diffusion, pas un
 * moteur de montage. Les commandes correspondantes sont donc absentes plutôt
 * qu'affichées inertes — un bouton qui ne fait rien coûte plus cher en
 * confiance qu'il ne rapporte en ressemblance.
 */
type RtmpPublisherModule = typeof import('react-native-nitro-rtmp-publisher');
type NitroModulesModule = typeof import('react-native-nitro-modules');

function loadRtmpPublisher(): { rtmp: RtmpPublisherModule; callback: NitroModulesModule['callback'] } | null {
  try {
    const rtmp = require('react-native-nitro-rtmp-publisher');
    const { callback } = require('react-native-nitro-modules');
    return { rtmp, callback };
  } catch {
    return null;
  }
}

const rtmpModule = loadRtmpPublisher();

/** Rouge TikTok — celui de l'obturateur et de la barre de progression. */
const TIKTOK_RED = '#FE2C55';

/**
 * Profil d'encodage par palier.
 *
 * La compression se fait à la source : `prepareVideo` fixe la résolution et
 * le débit du fichier écrit. Réencoder après coup demanderait ffmpeg pour un
 * résultat moins bon (deux générations de compression au lieu d'une).
 */
interface CaptureProfile {
  width: number;
  height: number;
  bitrate: number;
  /** Durées proposées dans les onglets, en millisecondes. */
  durations: number[];
}

/**
 * Débits calibrés sur le budget d'envoi, pas seulement sur la qualité.
 *
 * Le fichier part tel quel vers l'API, qui le transcode ensuite. nginx borne
 * la requête à 100 Mo et l'envoi se fait souvent en 4G : à 8 Mb/s, une minute
 * pesait ~61 Mo, soit plusieurs minutes d'attente pour une différence
 * invisible sur un téléphone. 6 Mb/s ramène la même minute à ~46 Mo.
 */
const PROFILE_FREE: CaptureProfile = {
  // Portrait : la largeur est le petit côté.
  width: 720,
  height: 1280,
  bitrate: 3_000_000,
  durations: [15_000],
};

const PROFILE_SUBSCRIBER: CaptureProfile = {
  width: 1080,
  height: 1920,
  bitrate: 6_000_000,
  durations: [15_000, 60_000],
};

const CAPTURE_FPS = 30;
const AUDIO_BITRATE = 128_000;
const AUDIO_SAMPLE_RATE = 44_100;

/** Le compteur avance par pas courts : la barre doit paraître continue. */
const TICK_MS = 100;

/** Au-delà, l'appui est un maintien et non un tap. */
const HOLD_THRESHOLD_MS = 250;

const COUNTDOWN_CHOICES = [0, 3, 10] as const;

function profileFor(tier: SubscriptionTier): CaptureProfile {
  return tier === 'free' ? PROFILE_FREE : PROFILE_SUBSCRIBER;
}

/**
 * `startRecord` attend un chemin de fichier, pas une URL.
 *
 * Côté natif le chemin part dans `URL(fileURLWithPath:)` : lui passer
 * `file:///…` produirait un chemin contenant littéralement « file: » et
 * l'enregistrement échouerait sans message clair.
 */
function toNativePath(uri: string): string {
  const withoutScheme = uri.startsWith('file://') ? uri.slice('file://'.length) : uri;
  try {
    return decodeURIComponent(withoutScheme);
  } catch {
    return withoutScheme;
  }
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Icône + libellé, la brique de la colonne latérale de TikTok. */
function SideAction({
  icon,
  label,
  active,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.sideAction} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name={icon} size={27} color={active ? TIKTOK_RED : '#fff'} />
      <Text style={[styles.sideLabel, active && { color: TIKTOK_RED }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function RecordVideoScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  /**
   * Le module n'autorise qu'UNE vue caméra vivante à la fois (compteur global
   * `ActivePublisherSlot` côté natif), et ce créneau n'est rendu qu'au
   * **démontage** de la vue — `stopPreview` ne le libère pas.
   *
   * Or la pile de navigation garde les écrans montés : partir vers l'écran de
   * légende puis revenir, ou passer d'ici au live, laissait la caméra tenue
   * par un écran qu'on ne voit plus. La seconde vue se voyait alors refuser
   * l'accès avec « another <RtmpPublisherView> already holds the camera ».
   *
   * On démonte donc la vue dès que l'écran perd le focus. L'exception : un
   * enregistrement en cours, qu'un démontage interromprait au milieu.
   */
  const isFocused = useIsFocused();

  /**
   * Où va la prise une fois terminée.
   *
   * Par défaut on enchaîne sur l'écran de légende. Mais le composeur de tweet
   * attache la vidéo à un texte déjà saisi : l'y renvoyer est la seule façon
   * de ne pas perdre ce qui était en cours d'écriture.
   */
  const { returnTo } = (route.params || {}) as { returnTo?: string };

  const deliver = useCallback(
    (uri: string) => {
      // Toujours par l'éditeur : c'est là qu'on ajoute textes, filtre et
      // coupure du son. Il transmettra ensuite à l'écran appelant ou à celui
      // de légende, selon d'où l'on vient.
      navigation.navigate('VideoEditor', { videoUri: uri, returnTo });
    },
    [navigation, returnTo],
  );

  const tier = effectiveSubscriptionTier(!!user?.premium, user?.subscription_tier);
  const profile = useMemo(() => profileFor(tier), [tier]);

  const publisherRef = useRef<RtmpPublisherViewMethods | null>(null);
  const outputPathRef = useRef<string | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didHoldRef = useRef(false);
  /** Durée déjà écrite au fichier, hors segment en cours. */
  const committedRef = useRef(0);
  const segmentStartRef = useRef(0);

  const [permissionsGranted, setPermissionsGranted] = useState<boolean | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [hasFootage, setHasFootage] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [segments, setSegments] = useState<number[]>([]);
  const [isFrontCamera, setIsFrontCamera] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [beautyOn, setBeautyOn] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [maxDurationMs, setMaxDurationMs] = useState(profile.durations[0]);
  const [countdownSetting, setCountdownSetting] = useState<number>(0);
  const [countdownValue, setCountdownValue] = useState(0);
  const [galleryThumb, setGalleryThumb] = useState<string | null>(null);

  useEffect(() => {
    if (!rtmpModule) return;
    rtmpModule.rtmp.requestRtmpPermissions().then(({ granted }) => {
      setPermissionsGranted(granted);
      if (!granted) {
        toast.error('Autorisations requises', {
          description: 'Active la caméra et le micro pour TwitNinf dans Réglages pour filmer.',
        });
      }
    });
  }, []);

  /**
   * Vignette du dernier média, comme TikTok.
   *
   * On interroge la permission SANS la demander : réclamer l'accès à toute la
   * photothèque à la seconde où la caméra s'ouvre, juste pour décorer un
   * bouton, est le genre de demande qui fait refuser tout le reste. Tant
   * qu'elle n'a pas été accordée ailleurs, le bouton garde son icône.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const MediaLibrary = require('expo-media-library');
        const { granted } = await MediaLibrary.getPermissionsAsync();
        if (!granted || cancelled) return;
        const page = await MediaLibrary.getAssetsAsync({ first: 1, sortBy: ['creationTime'] });
        if (!cancelled && page.assets?.[0]) setGalleryThumb(page.assets[0].uri);
      } catch {
        // Module absent (Expo Go) ou photothèque vide : icône par défaut.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // La vue démontée emporte sa référence : sans ça, l'obturateur resterait
  // actif alors qu'aucune caméra n'écoute, et le prochain appui partirait
  // dans le vide.
  useEffect(() => {
    if (!isFocused) {
      publisherRef.current = null;
      setIsReady(false);
    }
  }, [isFocused]);

  const stopTicking = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const cancelCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setCountdownValue(0);
  }, []);

  // L'enregistrement doit être coupé si l'écran disparaît : sans ça, le
  // recorder natif reste attaché et le fichier n'est jamais finalisé.
  useEffect(() => {
    return () => {
      stopTicking();
      cancelCountdown();
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      try {
        if (publisherRef.current?.getRecordStatus?.() !== 'stopped') {
          publisherRef.current?.stopRecord();
        }
      } catch {
        // Vue déjà détruite — rien à finaliser.
      }
    };
  }, [stopTicking, cancelCountdown]);

  // Callback stable : un `hybridRef` qui change d'identité entre deux rendus
  // fait rouvrir/refermer la caméra en boucle (piège documenté de la lib).
  const hybridRef = useMemo(() => {
    if (!rtmpModule) return undefined;
    return rtmpModule.callback((ref: RtmpPublisherViewMethods) => {
      publisherRef.current = ref;
      const rotation = ref.getCameraOrientation();
      ref.prepareVideo(profile.width, profile.height, CAPTURE_FPS, profile.bitrate, 2, rotation);
      ref.prepareAudio(AUDIO_BITRATE, AUDIO_SAMPLE_RATE, false);
      ref.startPreview('back', profile.width, profile.height);
      ref.setOnRecordStatusChange((status) => {
        if (status === 'stopped') setIsRecording(false);
      });
      setIsReady(true);
    });
  }, [profile]);

  const finishRef = useRef<((auto: boolean) => void) | null>(null);

  /** Avance le compteur et coupe net à la limite retenue. */
  const startTicking = useCallback(() => {
    stopTicking();
    segmentStartRef.current = Date.now();
    tickRef.current = setInterval(() => {
      const total = committedRef.current + (Date.now() - segmentStartRef.current);
      if (total >= maxDurationMs) {
        setElapsed(maxDurationMs);
        finishRef.current?.(true);
        return;
      }
      setElapsed(total);
    }, TICK_MS);
  }, [maxDurationMs, stopTicking]);

  /** Ouvre le fichier au premier appel, reprend l'écriture ensuite. */
  const beginRecording = useCallback(() => {
    const publisher = publisherRef.current;
    if (!publisher) return false;

    if (!outputPathRef.current) {
      const target = new File(Paths.cache, `twitninf-${Date.now()}.mp4`);
      const path = toNativePath(target.uri);
      const accepted = publisher.startRecord(path);
      if (!accepted) {
        toast.error('Enregistrement impossible', {
          description: "La caméra n'a pas accepté de démarrer l'enregistrement.",
        });
        return false;
      }
      outputPathRef.current = path;
      setHasFootage(true);
    } else {
      publisher.resumeRecord();
    }

    setIsRecording(true);
    startTicking();
    return true;
  }, [startTicking]);

  /** Ferme le segment courant sans finaliser le fichier. */
  const pauseRecording = useCallback(() => {
    const publisher = publisherRef.current;
    if (!publisher) return;
    publisher.pauseRecord();
    stopTicking();
    const total = committedRef.current + (Date.now() - segmentStartRef.current);
    committedRef.current = Math.min(total, maxDurationMs);
    setElapsed(committedRef.current);
    setSegments((prev) => [...prev, committedRef.current]);
    setIsRecording(false);
  }, [maxDurationMs, stopTicking]);

  /** Retardateur : décompte visible, puis départ. */
  const startWithCountdown = useCallback(() => {
    if (countdownSetting <= 0) {
      beginRecording();
      return;
    }
    setCountdownValue(countdownSetting);
    countdownRef.current = setInterval(() => {
      setCountdownValue((current) => {
        if (current <= 1) {
          cancelCountdown();
          beginRecording();
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  }, [countdownSetting, beginRecording, cancelCountdown]);

  // ── Obturateur : tap pour basculer, maintien pour filmer ────────
  const onShutterPressIn = useCallback(() => {
    if (!isReady || isFinishing || countdownValue > 0) return;
    didHoldRef.current = false;
    if (isRecording) return;
    // Le maintien démarre sans retardateur : attendre 3 s le doigt posé
    // n'aurait aucun sens.
    holdTimerRef.current = setTimeout(() => {
      didHoldRef.current = true;
      beginRecording();
    }, HOLD_THRESHOLD_MS);
  }, [isReady, isFinishing, isRecording, countdownValue, beginRecording]);

  const onShutterPressOut = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (didHoldRef.current) {
      didHoldRef.current = false;
      if (isRecording) pauseRecording();
    }
  }, [isRecording, pauseRecording]);

  const onShutterPress = useCallback(() => {
    if (!isReady || isFinishing) return;
    if (didHoldRef.current) return; // déjà traité par le relâchement
    if (countdownValue > 0) { cancelCountdown(); return; }
    if (isRecording) { pauseRecording(); return; }
    startWithCountdown();
  }, [isReady, isFinishing, isRecording, countdownValue, cancelCountdown, pauseRecording, startWithCountdown]);

  /** Ferme le fichier et passe à l'écran de légende. */
  const finish = useCallback(
    (auto: boolean) => {
      const publisher = publisherRef.current;
      const path = outputPathRef.current;
      if (!publisher || !path || isFinishing) return;

      stopTicking();
      setIsFinishing(true);
      publisher.stopRecord();
      setIsRecording(false);

      // Le muxer finalise l'index MP4 de façon asynchrone : naviguer dans la
      // foulée donnerait un fichier illisible au lecteur de l'écran suivant.
      setTimeout(() => {
        setIsFinishing(false);
        outputPathRef.current = null;
        committedRef.current = 0;
        setSegments([]);
        setElapsed(0);
        setHasFootage(false);
        deliver(`file://${path}`);
      }, auto ? 600 : 400);
    },
    [isFinishing, deliver, stopTicking],
  );

  finishRef.current = finish;

  /** Jette la prise entière — voir la note en tête de fichier. */
  const restart = useCallback(() => {
    if (!hasFootage) return;
    confirmAsync({
      title: 'Recommencer ?',
      message: 'La prise en cours sera perdue, segments compris.',
      confirmLabel: 'Recommencer',
      destructive: true,
    }).then((ok) => {
      if (ok) (() => {
          stopTicking();
          try {
            publisherRef.current?.stopRecord();
          } catch {
            // Rien à finaliser.
          }
          const path = outputPathRef.current;
          if (path) {
            try {
              new File(`file://${path}`).delete();
            } catch {
              // Fichier déjà absent : le cache sera purgé par le système.
            }
          }
          outputPathRef.current = null;
          committedRef.current = 0;
          setSegments([]);
          setElapsed(0);
          setHasFootage(false);
          setIsRecording(false);
        })();
    });
  }, [hasFootage, stopTicking]);

  const flipCamera = useCallback(() => {
    publisherRef.current?.switchCamera();
    setIsFrontCamera((prev) => !prev);
    if (torchOn) setTorchOn(false);
  }, [torchOn]);

  const toggleTorch = useCallback(() => {
    const publisher = publisherRef.current;
    if (!publisher) return;
    if (!publisher.isLanternSupported()) {
      toast.error('Torche indisponible', {
        description: "Cette caméra n'a pas d'éclairage.",
      });
      return;
    }
    const next = !torchOn;
    publisher.setLanternEnabled(next);
    setTorchOn(next);
  }, [torchOn]);

  const toggleBeauty = useCallback(() => {
    const publisher = publisherRef.current;
    if (!publisher) return;
    const next = !beautyOn;
    publisher.setBeautyFilterEnabled(next);
    setBeautyOn(next);
  }, [beautyOn]);

  const cycleCountdown = useCallback(() => {
    setCountdownSetting((current) => {
      const index = COUNTDOWN_CHOICES.indexOf(current as (typeof COUNTDOWN_CHOICES)[number]);
      return COUNTDOWN_CHOICES[(index + 1) % COUNTDOWN_CHOICES.length];
    });
  }, []);

  /** Import galerie — on garde ce chemin, il ne concurrence pas la caméra. */
  const pickFromLibrary = useCallback(async () => {
    if (hasFootage) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.error('Permission requise', {
        description: 'Autorise la galerie pour importer une vidéo.',
      });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: true,
      videoMaxDuration: Math.round(maxDurationMs / 1000),
      quality: 1,
    });
    if (!result.canceled && result.assets?.[0]) {
      deliver(result.assets[0].uri);
    }
  }, [hasFootage, deliver, maxDurationMs]);

  // ─────────────────────────────────────────────────────────────────
  // Module natif absent (Expo Go, ou build sans prebuild)
  // ─────────────────────────────────────────────────────────────────
  if (!rtmpModule) {
    return (
      <View style={styles.container}>
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000' }]} />
        <View style={{ paddingTop: insets.top, paddingHorizontal: 16 }}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={styles.fallbackContainer}>
          <Ionicons name="videocam-off" size={64} color={TIKTOK_RED} />
          <Text style={styles.fallbackTitle}>Caméra indisponible</Text>
          <Text style={styles.fallbackDesc}>
            L'enregistrement repose sur un module natif, absent d'Expo Go.
          </Text>
          <TouchableOpacity style={styles.fallbackBtn} onPress={pickFromLibrary}>
            <Ionicons name="images" size={20} color="#fff" />
            <Text style={styles.fallbackBtnText}>Importer depuis la galerie</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const { RtmpPublisherView } = rtmpModule.rtmp;
  const progress = Math.min(1, elapsed / maxDurationMs);
  const remaining = Math.max(0, maxDurationMs - elapsed);
  const showDurationTabs = !hasFootage && !isRecording && profile.durations.length > 1;

  return (
    <View style={styles.container}>
      {permissionsGranted !== false && (isFocused || isRecording) && (
        // `collapsable={false}` : un ancêtre réaplati sous l'aperçu casse sa
        // surface native (piège documenté de la lib).
        <View style={StyleSheet.absoluteFillObject} collapsable={false}>
          <RtmpPublisherView
            style={StyleSheet.absoluteFillObject}
            forceHardwareCodec
            videoCodec="h264"
            audioCodec="aac"
            aspectRatioMode="fill"
            mirrorPreview={isFrontCamera}
            mirrorStream={isFrontCamera}
            thermalWarningThreshold="severe"
            audioSource="camcorder"
            noiseSuppression={false}
            autoRotateStream
            streamMode="balanced"
            foregroundServiceTitle=""
            foregroundServiceText=""
            foregroundServiceIcon=""
            pictureInPictureEnabled={false}
            hybridRef={hybridRef}
          />
        </View>
      )}

      {/* ── Barre de progression segmentée, plaquée au bord haut ──── */}
      <View style={[styles.progressTrack, { top: insets.top }]}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        {segments.map((mark, index) => (
          <View
            key={`${mark}-${index}`}
            style={[styles.segmentMark, { left: `${(mark / maxDurationMs) * 100}%` }]}
          />
        ))}
      </View>

      {/* ── Fermer + minuteur ──────────────────────────────────────── */}
      <View style={[styles.topRow, { top: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="close" size={32} color="#fff" />
        </TouchableOpacity>

        {(isRecording || hasFootage) && (
          <View style={styles.timerPill}>
            {isRecording && <View style={styles.recDot} />}
            <Text style={styles.timerText}>{formatDuration(remaining)}</Text>
          </View>
        )}

        <View style={{ width: 32 }} />
      </View>

      {/* ── Colonne latérale ───────────────────────────────────────── */}
      <View style={[styles.sideColumn, { top: insets.top + 70 }]}>
        <SideAction icon="sync-outline" label="Retourner" onPress={flipCamera} />
        <SideAction
          icon={torchOn ? 'flash' : 'flash-off'}
          label="Flash"
          active={torchOn}
          onPress={toggleTorch}
        />
        <SideAction icon="sparkles-outline" label="Beauté" active={beautyOn} onPress={toggleBeauty} />
        <SideAction
          icon="timer-outline"
          label={countdownSetting > 0 ? `${countdownSetting}s` : 'Minuteur'}
          active={countdownSetting > 0}
          onPress={cycleCountdown}
        />
      </View>

      {/* ── Décompte du retardateur ────────────────────────────────── */}
      {countdownValue > 0 && (
        <Pressable style={styles.countdownLayer} onPress={cancelCountdown}>
          <Text style={styles.countdownNumber}>{countdownValue}</Text>
          <Text style={styles.countdownHint}>Touche pour annuler</Text>
        </Pressable>
      )}

      {/* ── Bas d'écran ────────────────────────────────────────────── */}
      <View style={[styles.bottomArea, { paddingBottom: insets.bottom + 16 }]}>
        {showDurationTabs && (
          <View style={styles.durationTabs}>
            {profile.durations.map((value) => {
              const active = value === maxDurationMs;
              return (
                <TouchableOpacity
                  key={value}
                  onPress={() => { setMaxDurationMs(value); setElapsed(0); }}
                  style={styles.durationTab}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.durationLabel, active && styles.durationLabelActive]}>
                    {Math.round(value / 1000)}s
                  </Text>
                  {active && <View style={styles.durationDot} />}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {tier === 'free' && !hasFootage && !isRecording && (
          <Text style={styles.tierHint}>15 s en 720p · les abonnés filment 60 s en 1080p</Text>
        )}

        <View style={styles.shutterRow}>
          {/* Gauche : recommencer, une fois qu'il y a de la matière. */}
          <View style={styles.sideSlot}>
            {hasFootage && !isRecording && (
              <TouchableOpacity onPress={restart} style={styles.slotBtn} activeOpacity={0.8}>
                <Ionicons name="refresh" size={26} color="#fff" />
                <Text style={styles.slotLabel}>Reprendre</Text>
              </TouchableOpacity>
            )}
          </View>

          <Pressable
            onPressIn={onShutterPressIn}
            onPressOut={onShutterPressOut}
            onPress={onShutterPress}
            disabled={!isReady || isFinishing}
            style={styles.shutterOuter}
          >
            <View style={[styles.shutterRing, isRecording && styles.shutterRingActive]} />
            <View style={[styles.shutterCore, isRecording && styles.shutterCoreActive]}>
              {!isReady && <ActivityIndicator color="#fff" />}
            </View>
          </Pressable>

          {/* Droite : importer, puis valider une fois qu'on a filmé. */}
          <View style={styles.sideSlot}>
            {hasFootage && !isRecording ? (
              <TouchableOpacity
                onPress={() => finish(false)}
                disabled={isFinishing}
                style={[styles.validateBtn, { backgroundColor: TIKTOK_RED }]}
                activeOpacity={0.85}
              >
                {isFinishing
                  ? <ActivityIndicator color="#fff" />
                  : <Ionicons name="checkmark" size={30} color="#fff" />}
              </TouchableOpacity>
            ) : !isRecording ? (
              <TouchableOpacity onPress={pickFromLibrary} style={styles.slotBtn} activeOpacity={0.8}>
                {galleryThumb
                  ? <Image source={{ uri: galleryThumb }} style={styles.galleryThumb} />
                  : <View style={styles.galleryFallback}><Ionicons name="images" size={22} color="#fff" /></View>}
                <Text style={styles.slotLabel}>Importer</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  progressTrack: {
    position: 'absolute',
    left: 0, right: 0,
    height: 3,
    backgroundColor: colors.overlayStrong,
    flexDirection: 'row',
    zIndex: 4,
  },
  progressFill: { height: '100%', backgroundColor: TIKTOK_RED },
  segmentMark: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: '#000' },

  topRow: {
    position: 'absolute',
    left: 16, right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 3,
  },
  timerPill: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: TIKTOK_RED },
  timerText: { color: '#fff', fontSize: 13, fontFamily: fonts.bold },

  sideColumn: { position: 'absolute', right: 12, alignItems: 'center', gap: 20, zIndex: 3 },
  sideAction: { alignItems: 'center', gap: 4, width: 62 },
  sideLabel: {
    color: '#fff', fontSize: 11, fontFamily: fonts.bold, textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },

  countdownLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
    zIndex: 5,
  },
  countdownNumber: {
    color: '#fff', fontSize: 120, fontFamily: fonts.bold,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8,
  },
  countdownHint: { color: colors.textPrimary, fontSize: 14, marginTop: 6 },

  bottomArea: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 3, gap: 14 },

  durationTabs: { flexDirection: 'row', justifyContent: 'center', gap: 26 },
  durationTab: { alignItems: 'center', gap: 5, paddingHorizontal: 6 },
  durationLabel: { color: colors.textSecondary, fontSize: 14, fontFamily: fonts.bold },
  durationLabelActive: { color: '#fff' },
  durationDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#fff' },

  tierHint: { textAlign: 'center', color: colors.textSecondary, fontSize: 12 },

  shutterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
  },
  sideSlot: { width: 84, alignItems: 'center' },
  slotBtn: { alignItems: 'center', gap: 5 },
  slotLabel: { color: '#fff', fontSize: 12, fontFamily: fonts.bold },
  galleryThumb: { width: 42, height: 42, borderRadius: 8, borderWidth: 1.5, borderColor: '#fff' },
  galleryFallback: {
    width: 42, height: 42, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.overlayStrong,
  },

  // Obturateur TikTok : gros disque rouge, anneau blanc fin détaché.
  shutterOuter: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center' },
  shutterRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 48,
    borderWidth: 5,
    borderColor: colors.textPrimary,
  },
  shutterRingActive: { borderColor: TIKTOK_RED },
  shutterCore: { width: 76, height: 76, borderRadius: 38, backgroundColor: TIKTOK_RED },
  // Carré arrondi pendant l'enregistrement : la métaphore « stop » universelle.
  shutterCoreActive: { width: 32, height: 32, borderRadius: 8 },

  validateBtn: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },

  closeBtn: { padding: 8, borderRadius: 20, backgroundColor: colors.overlayMedium, alignSelf: 'flex-start' },
  fallbackContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30, gap: 16 },
  fallbackTitle: { fontSize: 22, fontFamily: fonts.bold, color: '#fff', textAlign: 'center' },
  fallbackDesc: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  fallbackBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 8, paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 24, backgroundColor: TIKTOK_RED,
  },
  fallbackBtnText: { color: '#fff', fontSize: 15, fontFamily: fonts.bold },
});
