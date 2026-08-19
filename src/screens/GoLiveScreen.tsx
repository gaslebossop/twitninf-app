import { colors, fonts, glow } from '../theme';
import React, { memo, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  TextInput,
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Avatar from '../components/Avatar';
import type { RtmpPublisherViewMethods } from 'react-native-nitro-rtmp-publisher';
import { toast } from '../components/ui/Toast';
import { confirmAsync } from '../components/ui/ConfirmSheet';
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

/** Un message du chat, tel que le serveur le diffuse (identité comprise). */
interface LiveChatMessage {
  id: string;
  text: string;
  user: string;
  avatar?: string | null;
  verified?: boolean;
  premium?: boolean;
  mine?: boolean;
}

/**
 * Ligne de chat mémoïsée, comme côté spectateur (`LiveViewerScreen`). Le
 * déclencheur est ici DOUBLE — la frappe du diffuseur et l'arrivée d'un
 * message — et il tombe pendant la capture et l'encodage du flux : le thread
 * JS qu'on encombrait est celui-là même qui pilote la diffusion. `setMessages`
 * conserve la référence des messages déjà là, donc la comparaison par défaut
 * de `memo` suffit.
 */
const ChatRow = memo(function ChatRow({ item }: { item: LiveChatMessage }) {
  return (
    <View style={styles.chatRow}>
      <Avatar size={26} uri={item.avatar} username={item.user} style={styles.chatAvatar} />
      <View style={styles.chatBody}>
        <Text style={[styles.chatAuthor, item.mine && styles.chatAuthorMine]} numberOfLines={1}>
          {item.user}
          {item.verified ? ' ✓' : ''}
        </Text>
        <Text style={styles.chatText}>{item.text}</Text>
      </View>
    </View>
  );
});

/**
 * Composeur isolé : le brouillon vivait dans l'écran, si bien que chaque
 * caractère tapé re-rendait le chat entier — pendant la diffusion. L'état de
 * saisie ne sort plus d'ici ; l'écran n'apprend le texte qu'à l'envoi.
 */
const LiveComposer = memo(function LiveComposer({ onSend }: { onSend: (text: string) => void }) {
  const [draft, setDraft] = useState('');

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
  }, [draft, onSend]);

  return (
    <View style={styles.composer}>
      <TextInput
        style={styles.composerInput}
        value={draft}
        onChangeText={setDraft}
        placeholder="Répondre à ton public…"
        placeholderTextColor={colors.textMuted}
        onSubmitEditing={submit}
        returnKeyType="send"
        blurOnSubmit={false}
        maxLength={500}
      />
      <TouchableOpacity onPress={submit} style={styles.composerSend}>
        <Ionicons name="send" size={18} color={colors.textPrimary} />
      </TouchableOpacity>
    </View>
  );
});

export default function GoLiveScreen() {
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();

  const [permissionsGranted, setPermissionsGranted] = useState<boolean | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(false);
  const [liveId, setLiveId] = useState('');
  const [viewers, setViewers] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  const [torchOn, setTorchOn] = useState(false);
  const [beautyOn, setBeautyOn] = useState(false);
  const [muted, setMuted] = useState(false);

  const publisherRef = useRef<RtmpPublisherViewMethods | null>(null);
  const chatListRef = useRef<FlatList<LiveChatMessage> | null>(null);

  useEffect(() => {
    if (!rtmpModule) return;
    rtmpModule.rtmp.requestRtmpPermissions().then(({ granted }) => {
      setPermissionsGranted(granted);
      if (!granted) {
        toast.error('Autorisations requises', {
          description: 'Active la caméra et le micro pour TwitNinf dans Réglages pour passer en direct.',
        });
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

  /**
   * Le chat de son propre live.
   *
   * L'écran écoutait `viewerCount` sans jamais émettre `joinLive` : il
   * n'appartenait donc à aucune salle socket, et le serveur n'y diffuse que
   * vers les membres. Ni les messages ni le compteur n'arrivaient — d'où un
   * live pendant lequel le streamer ne voit rien de son public.
   *
   * La salle n'est créée côté serveur qu'à `postPublish`, c'est-à-dire après
   * la poignée de main RTMP : rejoindre dès `startStream` échoue en silence
   * (`joinLive` ignore un live inconnu). On réessaie donc jusqu'à ce que le
   * serveur réponde — sa première diffusion de `viewerCount` vaut accusé de
   * réception, puisqu'elle n'atteint que les membres de la salle.
   */
  useEffect(() => {
    if (!isStreaming || !liveId) return;

    let joined = false;

    const handleChatMessage = (msg: any) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [
          ...prev.slice(-79),
          {
            id: msg.id || `${Date.now()}`,
            text: msg.text,
            user: msg.user || 'Anonyme',
            avatar: msg.avatar,
            verified: msg.verified,
            premium: msg.premium,
          },
        ];
      });
    };
    const handleJoined = () => { joined = true; };

    const join = () => socket.emit('joinLive', liveId);

    socket.on('chatMessage', handleChatMessage);
    socket.on('viewerCount', handleJoined);
    socket.on('connect', join);

    join();
    const retry = setInterval(() => {
      if (joined) return clearInterval(retry);
      join();
    }, 2000);

    return () => {
      clearInterval(retry);
      socket.off('chatMessage', handleChatMessage);
      socket.off('viewerCount', handleJoined);
      socket.off('connect', join);
      setMessages([]);
    };
  }, [isStreaming, liveId]);

  /**
   * Le texte arrive du composeur plutôt que d'un état de l'écran : la fonction
   * ne dépend donc plus du brouillon, et garde son identité d'une frappe à
   * l'autre.
   */
  const sendMessage = useCallback((text: string) => {
    if (!text || !liveId) return;
    socket.emit('chatMessage', { liveId, message: text });
    // Le serveur rediffuse à tout le monde SAUF l'auteur : sans cet ajout
    // local, l'hôte ne verrait jamais ses propres réponses.
    setMessages((prev) => [
      ...prev.slice(-79),
      { id: `local-${Date.now()}`, text, user: 'Toi', mine: true },
    ]);
  }, [liveId]);

  /**
   * Stables, et pas des flèches anonymes : une identité neuve à chaque rendu
   * suffirait à faire re-rendre toutes les lignes montées par le
   * `CellRenderer` de la FlatList, `ChatRow` mémoïsé ou non.
   */
  const renderChatRow = useCallback(({ item }: { item: LiveChatMessage }) => <ChatRow item={item} />, []);
  const chatKeyExtractor = useCallback((item: LiveChatMessage) => item.id, []);
  const scrollChatToEnd = useCallback(() => chatListRef.current?.scrollToEnd({ animated: true }), []);

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
            toast.error('Connexion échouée', {
              description: message || "Le serveur de diffusion n'a pas accepté le flux. Vérifie ta connexion et réessaie.",
            });
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
      toast.error('Live impossible', {
        description: message,
      });
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
    confirmAsync({
      title: 'Arrêter le live ?',
      message: 'Voulez-vous vraiment terminer la diffusion ?',
      confirmLabel: 'Arrêter',
      destructive: true,
    }).then((ok) => {
      if (ok) (() => void stopStream())();
    });
  };

  const toggleCamera = () => {
    publisherRef.current?.switchCamera?.();
    setIsFrontCamera((prev) => !prev);
    // La torche appartient au module caméra arrière : basculer en frontale
    // l'éteint côté système sans prévenir, et l'icône resterait allumée.
    if (torchOn) setTorchOn(false);
  };

  const toggleTorch = () => {
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
  };

  const toggleBeauty = () => {
    const publisher = publisherRef.current;
    if (!publisher) return;
    const next = !beautyOn;
    publisher.setBeautyFilterEnabled(next);
    setBeautyOn(next);
  };

  const toggleMute = () => {
    const publisher = publisherRef.current;
    if (!publisher) return;
    const next = !muted;
    publisher.setAudioMuted(next);
    setMuted(next);
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
      {/* Démonté hors focus : le module n'accorde la caméra qu'à UNE vue à la
          fois, et ne rend ce créneau qu'au démontage — `stopPreview` ne suffit
          pas. Un écran resté monté dans la pile bloquait donc la caméra pour
          tous les autres (« already holds the camera »). Une diffusion en
          cours fait exception : la couper serait pire que le conflit. */}
      {permissionsGranted !== false && (isFocused || isStreaming) && (
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

          {/* Commandes caméra : disponibles avant ET pendant la diffusion —
              c'est en direct qu'on a besoin d'éclairer ou de se couper. */}
          <View style={styles.controlColumn}>
            <TouchableOpacity onPress={toggleCamera} style={styles.circleBtn}>
              <Ionicons name="camera-reverse" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={toggleTorch} style={[styles.circleBtn, torchOn && styles.circleBtnOn]}>
              <Ionicons name={torchOn ? 'flash' : 'flash-off'} size={20} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={toggleBeauty} style={[styles.circleBtn, beautyOn && styles.circleBtnOn]}>
              <Ionicons name="sparkles" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={toggleMute} style={[styles.circleBtn, muted && styles.circleBtnDanger]}>
              <Ionicons name={muted ? 'mic-off' : 'mic'} size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        {isStreaming && (
          <View style={styles.chatLayer} pointerEvents="box-none">
            <FlatList
              ref={chatListRef}
              data={messages}
              keyExtractor={chatKeyExtractor}
              style={styles.chatList}
              contentContainerStyle={styles.chatListContent}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={scrollChatToEnd}
              renderItem={renderChatRow}
            />

            <LiveComposer onSend={sendMessage} />
          </View>
        )}

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
    backgroundColor: colors.overlayMedium,
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
  controlColumn: { gap: 10, alignItems: 'center' },
  circleBtnOn: { backgroundColor: colors.accent },
  circleBtnDanger: { backgroundColor: colors.redMuted },
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
  // ── Chat du live (côté streamer) ────────────────────────────────
  // Posé en surimpression sur l'aperçu caméra, comme sur Instagram : le
  // public doit rester visible sans amputer l'image.
  chatLayer: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
  },
  chatList: {
    maxHeight: 220,
    flexGrow: 0,
  },
  chatListContent: {
    gap: 8,
    paddingVertical: 4,
  },
  // Aucune bulle : texte posé sur l'image, tenu lisible par l'ombre portée.
  chatRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
    maxWidth: '90%',
    gap: 8,
  },
  chatAvatar: { borderRadius: 14, marginTop: 2 },
  chatBody: { flexShrink: 1 },
  chatAuthor: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
    marginBottom: 1,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  chatAuthorMine: {
    color: colors.accent,
  },
  chatText: {
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 19,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  composerInput: {
    flex: 1,
    height: 42,
    paddingHorizontal: 16,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: colors.overlayStrong,
    color: colors.textPrimary,
    fontSize: 14,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  composerSend: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
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
    borderColor: colors.overlayStrong,
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
