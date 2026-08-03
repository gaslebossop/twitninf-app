import { colors, fonts, glow } from '../theme';
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RtmpPublisherViewMethods } from 'react-native-nitro-rtmp-publisher';
import {
  liveService,
  socket,
  connectLiveSocket,
  disconnectLiveSocket,
  LiveServiceError,
} from '../services/liveService';

/**
 * Diffusion en direct depuis le téléphone.
 *
 * ⚠️ `@api.video/react-native-livestream` (essayé avant celle-ci) plante au
 * premier appel de `startStreaming` sous RN 0.81 + New Architecture : son
 * composant retombe sur `RCTLegacyViewManagerInteropCoordinator` au lieu
 * d'un vrai composant Fabric, et ce chemin de secours a un bug de
 * réentrance sur `synchronouslyDispatchCommandOnUIThread` qui sur-relâche
 * un NSDictionary (confirmé sur un vrai device, cf. le rapport de crash —
 * EXC_BREAKPOINT dans la pile RCTLegacyViewManagerInteropCoordinator ; bug
 * upstream documenté, aucun correctif publié :
 * https://github.com/apivideo/api.video-reactnative-live-stream/issues/107
 * https://github.com/apivideo/api.video-reactnative-live-stream/issues/114).
 * Désactiver la New Architecture n'est pas une option : react-native-
 * reanimated 4 (utilisé dans tout le fil, les stories, etc.) l'exige.
 *
 * `react-native-nitro-rtmp-publisher` est bâtie sur Nitro Modules : son vue
 * est un composant Fabric de bout en bout, sans repli sur l'ancien pont —
 * exactement le chemin qui plantait. Même moteur RTMP côté iOS
 * (HaishinKit), donc aucun changement côté serveur de stream.
 */
type RtmpPublisherModule = typeof import('react-native-nitro-rtmp-publisher');
type NitroModulesModule = typeof import('react-native-nitro-modules');

function loadRtmpPublisher(): { rtmp: RtmpPublisherModule; callback: NitroModulesModule['callback'] } | null {
  try {
    // `callback` vit dans le paquet runtime Nitro, pas dans la lib RTMP :
    // c'est le contournement documenté pour passer une fonction en prop sans
    // que React Native ne la convertisse en `true`. Chargé dans le même bloc
    // protégé : les deux paquets font partie du même module natif absent
    // d'Expo Go.
    const rtmp = require('react-native-nitro-rtmp-publisher');
    const { callback } = require('react-native-nitro-modules');
    return { rtmp, callback };
  } catch {
    return null;
  }
}

const rtmpModule = loadRtmpPublisher();

/** Résolution de diffusion — 720p, un bon compromis qualité/CPU pour le VPS. */
const STREAM_WIDTH = 1280;
const STREAM_HEIGHT = 720;
const STREAM_FPS = 30;
const STREAM_VIDEO_BITRATE = 2_500_000;
const STREAM_AUDIO_BITRATE = 128_000;
const STREAM_AUDIO_SAMPLE_RATE = 44_100;

export default function GoLiveScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [permissionsGranted, setPermissionsGranted] = useState<boolean | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(false);
  const [liveId, setLiveId] = useState('');
  const [viewers, setViewers] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const publisherRef = useRef<RtmpPublisherViewMethods | null>(null);

  useEffect(() => {
    if (!rtmpModule) return;
    rtmpModule.rtmp.requestRtmpPermissions().then(({ granted }) => {
      setPermissionsGranted(granted);
      if (!granted) {
        Alert.alert(
          'Autorisations requises',
          'Active la caméra et le micro pour TwitNinf dans Réglages pour passer en direct.',
        );
      }
    });
  }, []);

  useEffect(() => {
    connectLiveSocket();
    const handleViewerCount = (count: number) => setViewers(count);
    socket.on('viewerCount', handleViewerCount);
    return () => {
      socket.off('viewerCount', handleViewerCount);
      disconnectLiveSocket();
    };
  }, []);

  // Callback stable : un `hybridRef` qui change d'identité entre deux rendus
  // fait rouvrir/refermer la caméra en boucle (piège documenté de la lib).
  const hybridRef = useMemo(() => {
    if (!rtmpModule) return undefined;
    return rtmpModule.callback((ref: RtmpPublisherViewMethods) => {
      publisherRef.current = ref;
      const rotation = ref.getCameraOrientation();
      ref.prepareVideo(STREAM_WIDTH, STREAM_HEIGHT, STREAM_FPS, STREAM_VIDEO_BITRATE, 2, rotation);
      ref.prepareAudio(STREAM_AUDIO_BITRATE, STREAM_AUDIO_SAMPLE_RATE, false);
      ref.startPreview(isFrontCamera ? 'front' : 'back', STREAM_WIDTH, STREAM_HEIGHT);
      ref.setAutoReconnect(5, 3000);

      ref.setOnConnectionEvent((event: string, message?: string) => {
        switch (event) {
          case 'connectionSuccess':
            setIsStreaming(true);
            setIsLoading(false);
            break;
          case 'connectionFailed':
          case 'authError':
            setIsStreaming(false);
            setIsLoading(false);
            Alert.alert(
              'Connexion échouée',
              message || "Le serveur de diffusion n'a pas accepté le flux. Vérifie ta connexion et réessaie.",
            );
            break;
          case 'disconnect':
            setIsStreaming(false);
            break;
          default:
            break;
        }
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    });
  }, []);

  const stopStream = useCallback(async () => {
    try {
      publisherRef.current?.stopStream?.();
    } catch (err) {
      console.warn('[GoLive] stopStream:', err);
    }
    setIsStreaming(false);
    if (liveId) await liveService.endLive(liveId);
    navigation.goBack();
  }, [liveId, navigation]);

  const startStream = useCallback(async () => {
    setIsLoading(true);
    try {
      // Le serveur tire la clé et dit où publier : rien n'est deviné côté app.
      const credentials = await liveService.requestStreamCredentials();
      setLiveId(credentials.liveId);

      // `startStream` attend une URL unique (serveur + app + clé) — c'est le
      // dernier segment que le serveur RTMP lit comme nom de publication.
      const base = credentials.ingestUrl.replace(/\/$/, '');
      publisherRef.current?.startStream(`${base}/${credentials.streamKey}`);
      // La réussite/l'échec arrive par événement (setOnConnectionEvent) :
      // pas de promesse à attendre ici.
    } catch (err: any) {
      const message =
        err instanceof LiveServiceError
          ? err.message
          : 'La connexion au serveur de diffusion a échoué. Réessaie dans un instant.';
      Alert.alert('Live impossible', message);
      setIsLoading(false);
    }
  }, []);

  const toggleStream = useCallback(() => {
    if (isLoading) return;
    if (isStreaming) {
      void stopStream();
    } else {
      void startStream();
    }
  }, [isLoading, isStreaming, startStream, stopStream]);

  const closeStream = () => {
    if (!isStreaming) {
      navigation.goBack();
      return;
    }
    Alert.alert('Arrêter le live ?', 'Voulez-vous vraiment terminer la diffusion ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Arrêter', style: 'destructive', onPress: () => void stopStream() },
    ]);
  };

  const toggleCamera = () => {
    publisherRef.current?.switchCamera?.();
    setIsFrontCamera((prev) => !prev);
  };

  // ─────────────────────────────────────────────────────────────────
  // Module natif absent (Expo Go, ou build sans prebuild)
  // ─────────────────────────────────────────────────────────────────
  if (!rtmpModule) {
    return (
      <View style={styles.container}>
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.bg }]} />
        <View style={{ paddingTop: insets.top, paddingHorizontal: 16 }}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
            <Ionicons name="close" size={28} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <View style={styles.fallbackContainer}>
          <Ionicons name="videocam-off" size={64} color={colors.red} />
          <Text style={styles.fallbackTitle}>Diffusion indisponible</Text>
          <Text style={styles.fallbackDesc}>
            La diffusion en direct repose sur un module natif RTMP, absent d'Expo Go.
          </Text>
          <Text style={styles.fallbackHint}>
            Utilise l'application TwitNinf compilée pour passer en direct.
          </Text>
        </View>
      </View>
    );
  }

  const { RtmpPublisherView } = rtmpModule.rtmp;

  return (
    <View style={styles.container}>
      {permissionsGranted !== false && (
        // `collapsable={false}` : un ancêtre de mise en page réaplati sous
        // l'aperçu casse sa surface native (piège documenté de la lib).
        <View style={StyleSheet.absoluteFillObject} collapsable={false}>
          <RtmpPublisherView
            style={StyleSheet.absoluteFillObject}
            forceHardwareCodec
            videoCodec="h264"
            audioCodec="aac"
            aspectRatioMode="adjust"
            mirrorPreview={isFrontCamera}
            mirrorStream={isFrontCamera}
            thermalWarningThreshold="severe"
            audioSource="camcorder"
            noiseSuppression={false}
            autoRotateStream
            streamMode="balanced"
            // Vide par défaut : un titre non vide arme un service de premier
            // plan Android, ce qui ajoute des permissions et exige le
            // formulaire Play Console dédié. Pas encore de build Android
            // pour ce projet — à activer explicitement le jour où il y en
            // aura un et que la diffusion doit survivre en arrière-plan.
            foregroundServiceTitle=""
            foregroundServiceText=""
            foregroundServiceIcon=""
            pictureInPictureEnabled={false}
            hybridRef={hybridRef}
          />
        </View>
      )}

      <View
        style={[
          styles.overlay,
          { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 20 },
        ]}
      >
        <View style={styles.topBar}>
          <TouchableOpacity onPress={closeStream} style={styles.circleBtn}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>

          {isStreaming ? (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveBadgeText}>EN DIRECT</Text>
              <View style={styles.viewerBadge}>
                <Ionicons name="eye" size={12} color={colors.textPrimary} />
                <Text style={styles.viewerText}>{viewers}</Text>
              </View>
            </View>
          ) : (
            <View style={[styles.liveBadge, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
              <Text style={styles.liveBadgeText}>PRÊT À DIFFUSER</Text>
            </View>
          )}

          <TouchableOpacity onPress={toggleCamera} style={styles.circleBtn}>
            <Ionicons name="camera-reverse" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[
              styles.streamBtn,
              isStreaming && styles.streamBtnActive,
              { backgroundColor: isStreaming ? colors.redMuted : colors.accent },
              glow(isStreaming ? colors.red : colors.accent, 16),
            ]}
            onPress={toggleStream}
            disabled={isLoading}
          >
            <View style={styles.streamBtnGradient}>
              {isLoading ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Ionicons name={isStreaming ? 'stop' : 'radio'} size={26} color={colors.white} />
              )}
            </View>
          </TouchableOpacity>
          <Text style={styles.streamBtnText}>
            {isLoading ? 'Connexion…' : isStreaming ? 'Arrêter' : 'Lancer le Live'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  closeBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignSelf: 'flex-start',
  },
  fallbackContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
    gap: 16,
  },
  fallbackTitle: {
    fontSize: 22,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  fallbackDesc: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  fallbackHint: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 22,
    backgroundColor: colors.surfaceAlt,
    padding: 12,
    borderRadius: 8,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  circleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  liveBadgeText: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  viewerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 6,
    gap: 4,
  },
  viewerText: {
    color: colors.textPrimary,
    fontSize: 11,
    fontFamily: fonts.bold,
  },
  bottomBar: {
    alignItems: 'center',
    paddingBottom: 20,
  },
  streamBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.2)',
    marginBottom: 12,
  },
  streamBtnActive: {
    borderColor: colors.accent,
  },
  streamBtnGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  streamBtnText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontFamily: fonts.bold,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
