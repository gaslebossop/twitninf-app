import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
// `expo-image` plutôt que `Image` de React Native : cache disque et décodage
// hors du thread JS, sur des avatars et pièces jointes montés en liste.
// `transition={0}` : aucune apparition en fondu, le rendu ne change pas.
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, {
  Easing,
  Extrapolation,
  FadeInDown,
  ZoomIn,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { io } from 'socket.io-client';
import { colors, fonts , statusBarStyle} from '../theme';
import { ScreenBackground, ScreenSkeleton } from '../components/ui';
import apiService from '../services/api';
import unreadService from '../services/unreadService';
import VerifiedBadge from '../components/VerifiedBadge';
import StoryRing from '../components/StoryRing';
import StoryViewer from '../components/StoryViewer';
import EmojiPickerSheet from '../components/EmojiPickerSheet';
import storiesService, { StoryGroup, resolveStoryMedia } from '../services/storiesService';
import { certifiedNameColors, nameIsLit, type ProfileCustomization } from '../services/profileCustomizationService';
import { API_CONFIG } from '../config/api';
import { toast } from '../components/ui/Toast';

interface MessageItem {
  id: string;
  content: string;
  created_at?: string;
  createdAt?: string;
  sender_id?: string;
  sender?: SenderLike;
  message_type?: string;
  metadata?: {
    source?: string;
    story_id?: string;
    story_media_url?: string;
    story_thumbnail_url?: string;
    story_media_type?: 'image' | 'video';
    story_caption?: string | null;
    attachment_url?: string;
    attachment_type?: 'image' | 'audio';
    mime_type?: string;
    duration_ms?: number;
    waveform?: number[];
  };
  reactions?: MessageReactionItem[];
}

interface MessageReactionItem {
  id?: string;
  emoji: string;
  user_id: string;
  username?: string;
}

/**
 * Raccourcis de la barre d'appui long, façon Instagram DM. Le serveur
 * n'impose plus de liste : il valide la FORME de l'emoji, donc le sélecteur
 * complet (bouton « + ») accepte n'importe lequel.
 */
const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👍'];

/**
 * Géométrie de la barre de réactions.
 *
 * La largeur était figée à 232 px alors que le contenu en demandait ~254 :
 * six emojis de 26 px (un glyphe emoji est plus large que sa taille de police)
 * plus leurs marges. Résultat, les emojis débordaient du fond arrondi. Elle se
 * calcule donc à partir des mêmes constantes que le rendu — impossible de
 * désynchroniser l'un de l'autre.
 */
const REACTION_EMOJI_SIZE = 26;
const REACTION_ITEM_WIDTH = 40;
const REACTION_BAR_PADDING = 8;
const REACTION_BAR_ITEMS = QUICK_REACTIONS.length + 1; // + le bouton « ␣ »
const REACTION_BAR_WIDTH = REACTION_BAR_ITEMS * REACTION_ITEM_WIDTH + REACTION_BAR_PADDING * 2;

interface SenderLike {
  id?: string;
  username?: string;
  full_name?: string;
  avatar?: string | null;
  verified?: boolean;
  verification_style?: string;
  profile_customization?: ProfileCustomization;
}

/** Bulles « moi » : dégradé Instagram bleu → violet. */
const MY_BUBBLE_GRADIENT = ['#3B5DF6', '#8134AF'] as const;

/**
 * Glissé « annuler » du message vocal.
 *
 * Deux seuils, et pas un seul : le libellé passe au rouge AVANT le point de
 * non-retour, si bien qu'on voit qu'on va annuler avant de l'avoir fait. Un
 * seuil unique ne laisse le choix qu'entre deviner et rater.
 */
const CANCEL_ARM_DISTANCE = -70;
const CANCEL_SEND_DISTANCE = -90;
/** Amorti sans dépassement : le micro grossit et se pose, il ne rebondit pas. */
const MIC_SPRING = { damping: 24, stiffness: 260, mass: 1 } as const;
/** Au-delà de 15 min entre deux messages, Instagram insère un séparateur. */
const TIME_SEPARATOR_GAP_MS = 15 * 60 * 1000;

function normalizeMessageMetadata(value: unknown): MessageItem['metadata'] | undefined {
  let raw: any = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return undefined;
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;

  const nested = raw.story_reply && typeof raw.story_reply === 'object' ? raw.story_reply : {};
  const story = raw.story && typeof raw.story === 'object' ? raw.story : {};
  const source = raw.source || nested.source || (raw.story_id || nested.story_id || story.id ? 'story_reply' : undefined);
  if (source !== 'story_reply') return raw;

  const mediaType = raw.story_media_type || nested.story_media_type || story.media_type;
  return {
    ...raw,
    source: 'story_reply',
    story_id: String(raw.story_id || nested.story_id || story.id || ''),
    story_media_url: raw.story_media_url || nested.story_media_url || story.media_url,
    story_thumbnail_url: raw.story_thumbnail_url || nested.story_thumbnail_url || story.thumbnail_url,
    story_media_type: mediaType === 'video' ? 'video' : 'image',
    story_caption: raw.story_caption ?? nested.story_caption ?? story.caption ?? null,
  };
}

function normalizeReactions(value: unknown): MessageReactionItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((r) => r && typeof r === 'object' && r.emoji && r.user_id)
    .map((r) => ({ id: r.id ? String(r.id) : undefined, emoji: String(r.emoji), user_id: String(r.user_id), username: r.username }));
}

function normalizeMessage(value: any): MessageItem {
  const raw = value?.message && !value?.id ? value.message : value || {};
  return {
    ...raw,
    id: String(raw.id || ''),
    content: String(raw.content || ''),
    sender_id: raw.sender_id ? String(raw.sender_id) : raw.sender?.id ? String(raw.sender.id) : undefined,
    metadata: normalizeMessageMetadata(raw.metadata ?? raw.message_metadata),
    reactions: normalizeReactions(raw.reactions),
  };
}

/** Regroupe les réactions individuelles par emoji, façon Instagram (❤️ 3). */
function groupReactions(reactions?: MessageReactionItem[]) {
  if (!reactions || reactions.length === 0) return [] as { emoji: string; count: number }[];
  const counts = new Map<string, number>();
  reactions.forEach((r) => counts.set(r.emoji, (counts.get(r.emoji) || 0) + 1));
  return Array.from(counts.entries()).map(([emoji, count]) => ({ emoji, count }));
}

function dedupeMessagesById(list: MessageItem[]): MessageItem[] {
  const seen = new Set<string>();
  const out: MessageItem[] = [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const msg = list[i];
    const id = String(msg?.id || '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(msg);
  }
  return out.reverse();
}

function getAvatarUri(avatar?: string | null): string | null {
  if (!avatar) return null;
  if (avatar.startsWith('http')) return avatar;
  return `${API_CONFIG.BASE_URL}/static/avatars/${avatar}`;
}

/**
 * Pastille de réaction. L'impulsion est déclenchée par un CHANGEMENT d'emoji
 * ou de compteur, jamais par le montage : une pastille recyclée pendant le
 * scroll reste donc parfaitement immobile.
 */
function ReactionPill({
  emoji,
  count,
  mine,
  onPress,
}: {
  emoji: string;
  count: number;
  mine: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const isFirstRenderRef = useRef(true);

  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
    scale.value = withSequence(
      withTiming(1.16, { duration: 110, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: 130, easing: Easing.out(Easing.quad) }),
    );
  }, [emoji, count, scale]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] as const }));

  return (
    <Reanimated.View style={animatedStyle}>
      <TouchableOpacity
        onPress={onPress}
        style={[styles.reactionPill, mine && styles.reactionPillMine]}
        hitSlop={hitSlop}
      >
        <Text style={styles.reactionPillEmoji}>{emoji}</Text>
        {count > 1 && <Text style={styles.reactionPillCount}>{count}</Text>}
      </TouchableOpacity>
    </Reanimated.View>
  );
}

function formatTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(ms?: number) {
  const total = Math.max(0, Math.round((ms || 0) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Nombre de barres affichées dans la waveform d'un message vocal. */
const WAVEFORM_BAR_COUNT = 27;

/**
 * L'enregistrement (`allowsRecordingIOS: true`) laisse la session audio iOS
 * routée vers l'écouteur interne (quasi inaudible) tant qu'elle n'est pas
 * explicitement repassée en mode lecture — même config que `LiveViewerScreen`.
 * Sans ce reset, la lecture d'un vocal juste après un enregistrement (ou le
 * tout premier vocal reçu) sort au volume de l'écouteur, pas du haut-parleur.
 */
async function ensurePlaybackAudioMode() {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  } catch {
    // Non bloquant : au pire la lecture démarre avec le mode audio courant.
  }
}

/** dBFS (typiquement -160..0) → amplitude normalisée 0..1, seuil de silence à -50dB. */
function normalizeMetering(db?: number) {
  if (typeof db !== 'number' || !Number.isFinite(db)) return 0.05;
  const floor = -50;
  const clamped = Math.max(floor, Math.min(0, db));
  return (clamped - floor) / -floor;
}

/** Waveform déterministe (pas de vraie donnée d'amplitude) pour les vieux messages vocaux. */
function pseudoWaveform(seed: string, count: number): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    h = (h * 1103515245 + 12345) >>> 0;
    out.push(0.25 + ((h >>> 8) % 1000) / 1000 * 0.65);
  }
  return out;
}

/** Ramène un flux d'échantillons de métrage (capturé pendant l'enregistrement) à `barCount` valeurs. */
function downsampleWaveform(samples: number[], barCount: number): number[] {
  if (samples.length === 0) return new Array(barCount).fill(0.12);
  const bucketSize = samples.length / barCount;
  const out: number[] = [];
  for (let i = 0; i < barCount; i += 1) {
    const start = Math.floor(i * bucketSize);
    const end = Math.max(start + 1, Math.floor((i + 1) * bucketSize));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end && j < samples.length; j += 1) {
      sum += samples[j];
      count += 1;
    }
    out.push(count > 0 ? sum / count : 0.12);
  }
  return out;
}

/** Bulle lecteur pour un message vocal, façon Instagram : bouton play + waveform + durée. */
function VoiceMessageBubble({
  uri,
  durationMs,
  waveform,
  fromMe,
  bubbleRadius,
}: {
  uri: string;
  durationMs?: number;
  waveform?: number[];
  fromMe: boolean;
  bubbleRadius: any;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [totalMs, setTotalMs] = useState(durationMs || 0);
  const soundRef = useRef<Audio.Sound | null>(null);
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLoadTimeout = useCallback(() => {
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
  }, []);

  /**
   * Sortie de secours quand le chargement/la lecture ne progresse jamais
   * (réseau faible, flux coupé en route) : sans ça, `isLoaded` reste `false`
   * indéfiniment côté expo-av, sans erreur ni statut exploitable — le bouton
   * restait bloqué sur "lecture" avec 0 %/0 s, sans aucun moyen de réessayer.
   */
  const resetToIdle = useCallback(async (showError?: boolean) => {
    clearLoadTimeout();
    setIsPlaying(false);
    setIsLoading(false);
    setPositionMs(0);
    const sound = soundRef.current;
    soundRef.current = null;
    if (sound) {
      try {
        await sound.unloadAsync();
      } catch {
        // Déjà déchargé ou jamais chargé : rien à faire.
      }
    }
    if (showError) {
      toast.error('Lecture impossible', { description: 'Vérifie ta connexion et réessaie.' });
    }
  }, [clearLoadTimeout]);

  useEffect(() => {
    return () => {
      clearLoadTimeout();
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, [clearLoadTimeout]);

  const bars = useMemo(
    () => (waveform && waveform.length > 0 ? downsampleWaveform(waveform, WAVEFORM_BAR_COUNT) : pseudoWaveform(uri, WAVEFORM_BAR_COUNT)),
    [waveform, uri],
  );

  const onStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      if ((status as any).error) resetToIdle(true);
      return;
    }
    clearLoadTimeout();
    setIsLoading(false);
    setPositionMs(status.positionMillis || 0);
    if (status.durationMillis) setTotalMs(status.durationMillis);
    if (status.didJustFinish) {
      setIsPlaying(false);
      setPositionMs(0);
      soundRef.current?.setPositionAsync(0).catch(() => {});
    }
  }, [clearLoadTimeout, resetToIdle]);

  const toggle = useCallback(async () => {
    try {
      if (isLoading) return;
      await ensurePlaybackAudioMode();
      if (!soundRef.current) {
        setIsLoading(true);
        setIsPlaying(true);
        // 12s : largement assez pour un début de flux même en 4G faible.
        // Au-delà, on considère le chargement mort plutôt que de laisser
        // l'utilisateur devant un lecteur figé sans recours.
        loadTimeoutRef.current = setTimeout(() => {
          resetToIdle(true);
        }, 12000);
        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true, volume: 1.0 },
          onStatusUpdate,
        );
        soundRef.current = sound;
        return;
      }
      const status = await soundRef.current.getStatusAsync();
      if (status.isLoaded && status.isPlaying) {
        await soundRef.current.pauseAsync();
        setIsPlaying(false);
      } else {
        await soundRef.current.setVolumeAsync(1.0);
        await soundRef.current.playAsync();
        setIsPlaying(true);
      }
    } catch {
      resetToIdle(true);
    }
  }, [uri, onStatusUpdate, isLoading, resetToIdle]);

  const progress = totalMs > 0 ? Math.min(1, positionMs / totalMs) : 0;
  const activeBarIndex = Math.round(progress * (WAVEFORM_BAR_COUNT - 1));

  const content = (
    <View style={styles.voiceRow}>
      <View style={[styles.voicePlayBtn, fromMe ? styles.voicePlayBtnMine : styles.voicePlayBtnOther]}>
        <TouchableOpacity onPress={toggle} hitSlop={hitSlop} style={styles.voicePlayBtnTouch}>
          {isLoading ? (
            <ActivityIndicator size="small" color={fromMe ? '#3B5DF6' : '#fff'} />
          ) : (
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={15}
              color={fromMe ? '#3B5DF6' : '#fff'}
              style={!isPlaying ? { marginLeft: 1 } : undefined}
            />
          )}
        </TouchableOpacity>
      </View>
      <View style={styles.voiceWaveform}>
        {bars.map((amplitude, i) => (
          <View
            key={i}
            style={[
              styles.voiceBar,
              { height: 4 + amplitude * 20 },
              i <= activeBarIndex
                ? (fromMe ? styles.voiceBarActiveMine : styles.voiceBarActiveOther)
                : (fromMe ? styles.voiceBarMine : styles.voiceBarOther),
            ]}
          />
        ))}
      </View>
      <Text style={[styles.voiceDuration, fromMe && styles.voiceDurationMine]}>
        {formatDuration(positionMs > 0 ? positionMs : totalMs)}
      </Text>
    </View>
  );

  if (fromMe) {
    return (
      <LinearGradient
        colors={MY_BUBBLE_GRADIENT as unknown as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.voiceBubble, bubbleRadius]}
      >
        {content}
      </LinearGradient>
    );
  }
  return <View style={[styles.voiceBubble, styles.voiceBubbleOther, bubbleRadius]}>{content}</View>;
}

function StoryReplyReference({
  message,
  fromMe,
}: {
  message: MessageItem;
  fromMe: boolean;
}) {
  const metadata = message.metadata;
  if (metadata?.source !== 'story_reply') return null;
  const isVideo = metadata.story_media_type === 'video';
  const preview = resolveStoryMedia(
    metadata.story_thumbnail_url || (!isVideo ? metadata.story_media_url : null),
  );
  return (
    <View style={[styles.storyReplyCard, fromMe && styles.storyReplyCardMine]}>
      <Text style={[styles.storyReplyLabel, fromMe && styles.storyReplyLabelMine]}>
        {fromMe ? 'Vous avez répondu à sa story' : 'A répondu à votre story'}
      </Text>
      <View style={styles.storyReplyPreview}>
        {preview ? (
          <Image source={{ uri: preview }} style={styles.storyReplyMedia} contentFit="cover" cachePolicy="memory-disk" transition={0} recyclingKey={preview} />
        ) : (
          <LinearGradient
            colors={['#33223D', '#17151C']}
            style={[styles.storyReplyMedia, styles.storyReplyVideo]}
          >
            <Ionicons name={isVideo ? 'play' : 'image-outline'} size={30} color="#fff" />
          </LinearGradient>
        )}
        {isVideo && preview && (
          <View style={styles.storyReplyPlay}>
            <Ionicons name="play" size={18} color="#fff" />
          </View>
        )}
        {!!metadata.story_caption && (
          <Text
            style={styles.storyReplyCaption}
            numberOfLines={2}
          >
            {metadata.story_caption}
          </Text>
        )}
      </View>
    </View>
  );
}

/** Séparateur de jour : « Aujourd'hui 14:32 », « Hier 09:10 », « 12 mars 08:00 ». */
function formatSeparator(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const time = formatTime(value);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfMessageDay = new Date(date);
  startOfMessageDay.setHours(0, 0, 0, 0);
  const dayDiff = Math.round(
    (startOfToday.getTime() - startOfMessageDay.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (dayDiff <= 0) return time;
  if (dayDiff === 1) return `Hier ${time}`;
  if (dayDiff < 7) return `${date.toLocaleDateString([], { weekday: 'long' })} ${time}`;
  return `${date.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${time}`;
}

export default function ConversationThreadScreen({ navigation, route }: any) {
  const conversationId = route?.params?.conversationId as string;
  const conversationTitle = route?.params?.title as string;
  const conversationUsername = route?.params?.username as string | undefined;
  const conversationAvatar = route?.params?.avatar as string | null | undefined;
  const conversationVerified = !!route?.params?.verified;
  const conversationVerificationStyle = route?.params?.verificationStyle || 'default';
  const isGroup = !!route?.params?.isGroup;
  const memberCount = Number(route?.params?.memberCount || 0);
  const directOtherUserId = route?.params?.otherUserId as string | undefined;

  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState('');
  const [myId, setMyId] = useState<string | null>(null);
  const [participantMap, setParticipantMap] = useState<Record<string, SenderLike>>({});
  // L'en-tête est monté depuis les params de navigation, qui ne transportent
  // pas la personnalisation : on va la chercher dans les participants chargés.
  const peerCustomization = !isGroup && directOtherUserId
    ? participantMap[String(directOtherUserId)]?.profile_customization
    : undefined;
  const [typingUsers, setTypingUsers] = useState<Array<{ user_id: string; username?: string | null }>>([]);
  const [readByUser, setReadByUser] = useState<Record<string, string>>({});
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null);
  const [peerStories, setPeerStories] = useState<StoryGroup | null>(null);
  const [storyViewerVisible, setStoryViewerVisible] = useState(false);
  const [attachmentSending, setAttachmentSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  /**
   * Le glissé « annuler » n'est plus un état React.
   *
   * `setRecordingDragX` était appelé à CHAQUE événement de déplacement : tout
   * l'écran de conversation — sa liste de messages comprise — se rendait à
   * nouveau soixante fois par seconde pendant qu'on glissait le pouce. Seul le
   * franchissement du seuil mérite un rendu ; le reste est du mouvement, et le
   * mouvement va sur le thread UI.
   */
  const [cancelArmed, setCancelArmed] = useState(false);
  const [viewerImageUrl, setViewerImageUrl] = useState<string | null>(null);
  const [reactionBarFor, setReactionBarFor] = useState<{ messageId: string; x: number; y: number } | null>(null);
  /** Message pour lequel le sélecteur complet d'emoji est ouvert (bouton « + »). */
  const [emojiPickerFor, setEmojiPickerFor] = useState<string | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const socketRef = useRef<any>(null);
  const typingTimeoutRef = useRef<any>(null);
  const isTypingRef = useRef(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const waveformSamplesRef = useRef<number[]>([]);
  /**
   * Messages qui viennent tout juste d'arriver (envoi local ou socket) et qui
   * ont donc droit à l'animation d'entrée.
   *
   * La décision est prise ICI, à l'arrivée du message, et surtout PAS pendant
   * le rendu : une ligne de FlatList se re-rend plusieurs fois, et un drapeau
   * calculé au rendu retombait à `undefined` avant que Reanimated n'enregistre
   * l'animation — résultat, aucune animation ne se jouait. L'identifiant est
   * retiré après coup pour que le recyclage pendant le scroll ne la rejoue pas.
   */
  const justArrivedIdsRef = useRef<Set<string>>(new Set());
  const freshTimersRef = useRef<any[]>([]);

  const markMessageAsFresh = useCallback((messageId: string) => {
    justArrivedIdsRef.current.add(messageId);
    const timer = setTimeout(() => justArrivedIdsRef.current.delete(messageId), 700);
    freshTimersRef.current.push(timer);
  }, []);

  useEffect(
    () => () => {
      freshTimersRef.current.forEach(clearTimeout);
      freshTimersRef.current = [];
    },
    [],
  );
  const dot1 = useRef(new Animated.Value(0.25)).current;
  const dot2 = useRef(new Animated.Value(0.25)).current;
  const dot3 = useRef(new Animated.Value(0.25)).current;
  const micScale = useSharedValue(1);
  /** Décalage horizontal du pouce pendant l'enregistrement, en px (≤ 0). */
  const recordingDragX = useSharedValue(0);
  /** Miroir du seuil côté UI : évite de renvoyer vers JS à chaque image. */
  const cancelArmedUI = useSharedValue(false);

  // Visualiseur d'image : glissé vertical piloté sur le thread UI (Reanimated)
  // pour rester fluide même quand le thread JS est occupé.
  const viewerTranslateY = useSharedValue(0);
  const viewerImageScale = useSharedValue(1);
  const viewerBackdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(viewerTranslateY.value), [0, 280], [1, 0.35], Extrapolation.CLAMP),
  }));
  const viewerImageAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: viewerTranslateY.value }, { scale: viewerImageScale.value }] as const,
  }));

  const avatarUri = getAvatarUri(conversationAvatar || null);
  const canSend = useMemo(() => text.trim().length > 0 && !sending, [text, sending]);

  // ─── Données ──────────────────────────────────────────────────────────────

  const markReadIfNeeded = useCallback(
    async (list: MessageItem[], currentUid: string | null, myLastReadAt?: string | null) => {
      if (!currentUid || !Array.isArray(list) || list.length === 0) return;
      const threshold = myLastReadAt ? new Date(myLastReadAt).getTime() : 0;
      const hasUnread = list.some((m) => {
        const sid = String(m.sender_id || m?.sender?.id || '');
        if (!sid || sid === String(currentUid)) return false;
        const ts = new Date(m.created_at || m.createdAt || 0).getTime();
        if (!Number.isFinite(ts)) return true;
        return ts > threshold;
      });
      if (!hasUnread) return;
      await unreadService.withRetry(async () => {
        const res = await apiService.post(`/api/messages/conversations/${conversationId}/read`, {});
        if (!res?.success) throw new Error(res?.message || 'mark-as-read failed');
        return res;
      });
      unreadService.notifyChanged();
    },
    [conversationId],
  );

  const loadMessages = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    try {
      const me = await apiService.getCurrentUser();
      setMyId(me?.id || null);

      const convRes = await apiService.get('/api/messages/conversations');
      let myPrevReadAt: string | null = null;
      if (convRes?.success && Array.isArray(convRes?.conversations)) {
        const conv = convRes.conversations.find((c: any) => c?.id === conversationId);
        if (conv) {
          const map: Record<string, SenderLike> = {};
          (Array.isArray(conv?.participants) ? conv.participants : []).forEach((p: any) => {
            if (p?.id) {
              map[String(p.id)] = {
                id: p.id,
                username: p.username,
                full_name: p.full_name,
                avatar: p.avatar,
                verified: p.verified,
                verification_style: p.verification_style,
              };
            }
          });
          setParticipantMap(map);

          const persistedReads: Record<string, string> = {};
          (Array.isArray(conv?.participant_reads) ? conv.participant_reads : []).forEach((r: any) => {
            if (r?.user_id && r?.last_read_at) {
              persistedReads[String(r.user_id)] = String(r.last_read_at);
              if (String(r.user_id) === String(me?.id || '')) myPrevReadAt = String(r.last_read_at);
            }
          });
          setReadByUser((prev) => ({ ...persistedReads, ...prev }));
        }
      }

      const res = await apiService.get(`/api/messages/conversations/${conversationId}/messages`);
      const list = res?.success ? res.messages || [] : [];
      const safeList = Array.isArray(list) ? list : [];
      const normalizedList = safeList.map(normalizeMessage).filter((message) => message.id);
      setMessages(dedupeMessagesById(normalizedList));
      await markReadIfNeeded(normalizedList, me?.id || null, myPrevReadAt);
    } finally {
      setLoading(false);
    }
  }, [conversationId, markReadIfNeeded]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Anneau de story sur l'avatar du header, comme dans Instagram Direct.
  useEffect(() => {
    if (isGroup || !directOtherUserId) return;
    let active = true;
    storiesService.getUserStories(String(directOtherUserId)).then((group) => {
      if (active && group?.stories?.length) setPeerStories(group);
    });
    return () => {
      active = false;
    };
  }, [directOtherUserId, isGroup]);

  useEffect(() => {
    if (messages.length === 0) return;
    const timer = setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(timer);
  }, [messages]);

  useEffect(() => {
    if (!myId || !conversationId) return;
    const socket = io(API_CONFIG.BASE_URL, { transports: ['websocket'], query: { userId: myId } });
    socketRef.current = socket;
    socket.emit('join_user', myId);
    socket.emit('join_conversation', conversationId);

    const resolveConversationId = (payload: any): string =>
      String(
        payload?.conversation_id ||
          payload?.conversationId ||
          payload?.message?.conversation_id ||
          payload?.message?.conversationId ||
          '',
      );

    socket.on('message:new', (payload: any) => {
      if (resolveConversationId(payload) !== String(conversationId)) return;
      const incoming = normalizeMessage(payload?.message || payload);
      if (!incoming?.id) return;
      setMessages((prev) => {
        if (prev.some((m) => String(m.id) === String(incoming.id))) return prev;
        markMessageAsFresh(String(incoming.id));
        return dedupeMessagesById([...prev, incoming]);
      });
      const senderId = String(incoming?.sender_id || incoming?.sender?.id || '');
      if (myId && senderId && senderId !== String(myId)) {
        unreadService
          .withRetry(() => apiService.post(`/api/messages/conversations/${conversationId}/read`, {}))
          .then(() => unreadService.notifyChanged())
          .catch(() => {});
      }
    });

    socket.on('message:reaction', (payload: any) => {
      if (resolveConversationId(payload) !== String(conversationId)) return;
      const messageId = String(payload?.message_id || payload?.messageId || '');
      if (!messageId) return;
      const reactions = normalizeReactions(payload?.reactions);
      setMessages((prev) => prev.map((m) => (String(m.id) === messageId ? { ...m, reactions } : m)));
    });

    socket.on('typing:update', (payload: any) => {
      if (resolveConversationId(payload) !== String(conversationId)) return;
      const uid = String(payload?.user_id || payload?.userId || payload?.sender_id || '');
      if (!uid || (myId && uid === String(myId))) return;
      const username = payload?.username || participantMap[uid]?.username || null;
      const isTyping = Boolean(
        payload?.is_typing ?? payload?.isTyping ?? payload?.typing ?? payload?.status === 'start',
      );
      setTypingUsers((prev) => {
        const next = prev.filter((u) => u.user_id !== uid);
        if (isTyping) next.push({ user_id: uid, username });
        return next;
      });
    });

    socket.on('read:update', (payload: any) => {
      if (resolveConversationId(payload) !== String(conversationId)) return;
      const uid = String(payload?.user_id || payload?.userId || '');
      if (!uid) return;
      setReadByUser((prev) => ({
        ...prev,
        [uid]: String(payload?.last_read_at || new Date().toISOString()),
      }));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [myId, conversationId, participantMap, markMessageAsFresh]);

  // Animation des trois points « en train d'écrire ».
  useEffect(() => {
    if (typingUsers.length === 0) return;
    const animateDot = (value: Animated.Value, delayMs: number) =>
      Animated.sequence([
        Animated.delay(delayMs),
        Animated.timing(value, { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.timing(value, { toValue: 0.25, duration: 280, useNativeDriver: true }),
      ]);
    const loop = Animated.loop(
      Animated.parallel([animateDot(dot1, 0), animateDot(dot2, 120), animateDot(dot3, 240)]),
    );
    loop.start();
    return () => {
      loop.stop();
      dot1.setValue(0.25);
      dot2.setValue(0.25);
      dot3.setValue(0.25);
    };
  }, [typingUsers.length, dot1, dot2, dot3]);

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    const optimisticId = `tmp_${Date.now()}`;
    try {
      const content = text.trim();
      markMessageAsFresh(optimisticId);
      setMessages((prev) => [
        ...prev,
        { id: optimisticId, content, created_at: new Date().toISOString(), sender_id: myId || undefined },
      ]);
      setText('');
      const res = await apiService.post(`/api/messages/conversations/${conversationId}/messages`, { content });
      if (res?.success && res?.message?.id) {
        const savedMessage = normalizeMessage(res.message);
        setMessages((prev) => dedupeMessagesById(prev.map((m) => (m.id === optimisticId ? savedMessage : m))));
      } else if (!res?.success) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      }
      if (socketRef.current && myId && isTypingRef.current) {
        socketRef.current.emit('typing:stop', {
          conversationId,
          conversation_id: conversationId,
          userId: myId,
          user_id: myId,
        });
        isTypingRef.current = false;
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
    } finally {
      setSending(false);
    }
  };

  // ─── Réactions ──────────────────────────────────────────────────────────────

  const applyReactionsLocally = useCallback((messageId: string, reactions: MessageReactionItem[]) => {
    setMessages((prev) => prev.map((m) => (String(m.id) === messageId ? { ...m, reactions } : m)));
  }, []);

  /**
   * Pose ou retire ma réaction sur un message (un seul emoji par personne,
   * comme Instagram/WhatsApp : recliquer le même emoji le retire, en choisir
   * un autre remplace le précédent). Mise à jour optimiste immédiate, puis
   * réconciliée par la réponse HTTP (le socket `message:reaction` fera de
   * même pour les autres participants).
   */
  const sendReaction = useCallback(
    async (messageId: string, emoji: string) => {
      setReactionBarFor(null);
      const target = messages.find((m) => String(m.id) === messageId);
      const mine = target?.reactions?.find((r) => String(r.user_id) === String(myId));
      const isRemoving = mine?.emoji === emoji;
      const optimistic = (target?.reactions || []).filter((r) => String(r.user_id) !== String(myId));
      if (!isRemoving && myId) optimistic.push({ emoji, user_id: String(myId) });
      applyReactionsLocally(messageId, optimistic);
      try {
        const res = isRemoving
          ? await apiService.delete(`/api/messages/${messageId}/reactions`)
          : await apiService.post(`/api/messages/${messageId}/reactions`, { emoji });
        if (res?.success && Array.isArray(res.reactions)) {
          applyReactionsLocally(messageId, normalizeReactions(res.reactions));
        }
      } catch {
        // Le socket `message:reaction` (ou le prochain chargement) réconciliera l'état si l'appel échoue.
      }
    },
    [messages, myId, applyReactionsLocally],
  );

  // ─── Pièces jointes (image / message vocal) ────────────────────────────────

  const sendAttachment = useCallback(
    async (uri: string, kind: 'image' | 'audio', durationMs?: number, waveform?: number[]) => {
      setAttachmentSending(true);
      const optimisticId = `tmp_${Date.now()}`;
      try {
        markMessageAsFresh(optimisticId);
        setMessages((prev) => [
          ...prev,
          {
            id: optimisticId,
            content: kind === 'audio' ? '🎤 Message vocal' : '📷 Photo',
            message_type: kind,
            created_at: new Date().toISOString(),
            sender_id: myId || undefined,
            metadata: { attachment_url: uri, attachment_type: kind, duration_ms: durationMs, waveform },
          },
        ]);
        const res = await apiService.sendMessageAttachment(conversationId, uri, { kind, durationMs, waveform });
        if (res?.success && (res as any)?.message?.id) {
          const savedMessage = normalizeMessage((res as any).message);
          setMessages((prev) => dedupeMessagesById(prev.map((m) => (m.id === optimisticId ? savedMessage : m))));
        } else {
          setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
          toast.error((res as any)?.message || 'Envoi impossible');
        }
      } catch (error) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        toast.error(error instanceof Error ? error.message : 'Envoi impossible');
      } finally {
        setAttachmentSending(false);
      }
    },
    [conversationId, myId, markMessageAsFresh],
  );

  const pickAndSendImage = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        toast.error('Autorisation requise', {
          description: 'Autorise l\'accès à tes photos pour envoyer une image.',
        });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.85,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) return;
      await sendAttachment(asset.uri, 'image');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Sélection impossible');
    }
  }, [sendAttachment]);

  const startRecording = useCallback(async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        toast.error('Autorisation requise', {
          description: 'Autorise l\'accès au micro pour envoyer un message vocal.',
        });
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      waveformSamplesRef.current = [];
      const { recording } = await Audio.Recording.createAsync(
        { ...Audio.RecordingOptionsPresets.HIGH_QUALITY, isMeteringEnabled: true },
        (status) => {
          if (typeof status.durationMillis === 'number') setRecordingMs(status.durationMillis);
          if (status.isRecording) waveformSamplesRef.current.push(normalizeMetering(status.metering));
        },
        100,
      );
      recordingRef.current = recording;
      setRecordingMs(0);
      setIsRecording(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de démarrer l\'enregistrement');
    }
  }, []);

  const stopRecordingInternal = useCallback(async () => {
    const recording = recordingRef.current;
    recordingRef.current = null;
    setIsRecording(false);
    // Repasse en mode lecture normal (haut-parleur) dès l'arrêt : sans ça, la
    // prévisualisation immédiate du vocal qu'on vient d'envoyer sortirait
    // encore au volume de l'écouteur interne.
    await ensurePlaybackAudioMode();
    if (!recording) return null;
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      const waveform = downsampleWaveform(waveformSamplesRef.current, WAVEFORM_BAR_COUNT);
      return uri ? { uri, waveform } : null;
    } catch {
      return null;
    }
  }, []);

  const cancelRecording = useCallback(async () => {
    await stopRecordingInternal();
    setRecordingMs(0);
  }, [stopRecordingInternal]);

  const stopAndSendRecording = useCallback(async () => {
    const result = await stopRecordingInternal();
    const durationMs = recordingMs;
    setRecordingMs(0);
    if (!result) return;
    if (durationMs < 800) return; // Trop court pour être un vrai message vocal
    await sendAttachment(result.uri, 'audio', durationMs, result.waveform);
  }, [stopRecordingInternal, recordingMs, sendAttachment]);

  useEffect(() => {
    ensurePlaybackAudioMode();
    return () => {
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
    };
  }, []);

  // Le geste ci-dessous n'est construit qu'une fois : sans cette ref
  // « toujours à jour », ses callbacks fermeraient sur les toutes premières
  // versions de start/stop/cancelRecording (donc sur un `recordingMs` figé à 0
  // pour toujours) au lieu des dernières.
  const recordingActionsRef = useRef({ startRecording, stopAndSendRecording, cancelRecording });
  useEffect(() => {
    recordingActionsRef.current = { startRecording, stopAndSendRecording, cancelRecording };
  });

  /**
   * Geste façon Instagram/WhatsApp : on maintient le micro appuyé pour
   * enregistrer, on relâche pour envoyer, on glisse vers la gauche au-delà
   * du seuil pour annuler.
   *
   * `minDistance(0)` : le geste s'active au contact, sans attendre les 10 px
   * réglementaires — sans quoi un message vocal court, enregistré sans bouger
   * le pouce, ne serait jamais reconnu comme un geste terminé.
   *
   * Les trois passages vers JS (`runOnJS`) sont les seuls qui restent, et ils
   * correspondent chacun à un vrai événement : on commence, on franchit le
   * seuil, on lâche.
   */
  const startRec = useCallback(() => recordingActionsRef.current.startRecording(), []);
  const cancelRec = useCallback(() => recordingActionsRef.current.cancelRecording(), []);
  const sendRec = useCallback(() => recordingActionsRef.current.stopAndSendRecording(), []);

  const micGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .onBegin(() => {
          recordingDragX.value = 0;
          cancelArmedUI.value = false;
          micScale.value = withSpring(1.25, MIC_SPRING);
          runOnJS(startRec)();
        })
        .onUpdate((event) => {
          // Vers la droite, il n'y a rien à faire : le geste ne va que vers
          // l'annulation, et laisser le micro suivre à droite le suggérerait.
          const next = Math.min(0, event.translationX);
          recordingDragX.value = next;

          const armed = next < CANCEL_ARM_DISTANCE;
          if (armed !== cancelArmedUI.value) {
            cancelArmedUI.value = armed;
            runOnJS(setCancelArmed)(armed);
          }
        })
        .onEnd((event, success) => {
          // Geste interrompu par le système : on n'envoie surtout pas un
          // message que l'utilisateur n'a pas relâché lui-même.
          if (!success || event.translationX < CANCEL_SEND_DISTANCE) runOnJS(cancelRec)();
          else runOnJS(sendRec)();
        })
        .onFinalize(() => {
          micScale.value = withSpring(1, MIC_SPRING);
          recordingDragX.value = 0;
          cancelArmedUI.value = false;
          runOnJS(setCancelArmed)(false);
        }),
    [micScale, recordingDragX, cancelArmedUI, startRec, cancelRec, sendRec],
  );

  const micStyle = useAnimatedStyle(() => ({
    transform: [{ scale: micScale.value }] as const,
  }));

  const slideHintStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: recordingDragX.value }] as const,
  }));

  const closeImageViewer = useCallback(() => {
    setViewerImageUrl(null);
  }, []);

  const openImageViewer = useCallback((url: string) => {
    viewerTranslateY.value = 0;
    viewerImageScale.value = 1;
    setViewerImageUrl(url);
  }, [viewerImageScale, viewerTranslateY]);

  /**
   * Glisser l'image vers le bas pour fermer, comme sur Instagram. Passe par
   * `react-native-gesture-handler` + Reanimated (thread UI) plutôt que
   * `PanResponder` : c'est ce dernier qui ne captait pas fiablement le geste
   * une fois affiché dans un `Modal` — connu côté RN, notamment sur Android.
   */
  const viewerPanGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(4)
        .onUpdate((e) => {
          if (e.translationY < 0) return;
          viewerTranslateY.value = e.translationY;
          viewerImageScale.value = interpolate(e.translationY, [0, 280], [1, 0.85], Extrapolation.CLAMP);
        })
        .onEnd((e) => {
          if (e.translationY > 120 || e.velocityY > 800) {
            runOnJS(closeImageViewer)();
            return;
          }
          // damping ≈ 2·√stiffness : amortissement critique, l'image revient
          // en place d'un seul mouvement, sans dépassement ni oscillation.
          viewerTranslateY.value = withSpring(0, { damping: 28, stiffness: 180 });
          viewerImageScale.value = withSpring(1, { damping: 28, stiffness: 180 });
        }),
    [closeImageViewer, viewerImageScale, viewerTranslateY],
  );

  useEffect(() => {
    if (!socketRef.current || !myId) return;
    if (text.trim().length > 0 && !isTypingRef.current) {
      socketRef.current.emit('typing:start', {
        conversationId,
        conversation_id: conversationId,
        userId: myId,
        user_id: myId,
      });
      isTypingRef.current = true;
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      if (socketRef.current && myId && isTypingRef.current) {
        socketRef.current.emit('typing:stop', {
          conversationId,
          conversation_id: conversationId,
          userId: myId,
          user_id: myId,
        });
        isTypingRef.current = false;
      }
    }, 1400);
  }, [text, conversationId, myId]);

  // ─── Accusés de lecture ───────────────────────────────────────────────────

  const seenReaders = useMemo(() => {
    if (!myId || messages.length === 0) return [] as [string, string][];
    const lastMine = [...messages]
      .reverse()
      .find((m) => String(m.sender_id || m?.sender?.id || '') === String(myId));
    if (!lastMine) return [];
    const lastMineTs = new Date(lastMine.created_at || lastMine.createdAt || 0).getTime();
    if (!lastMineTs) return [];
    return Object.entries(readByUser).filter(([uid, ts]) => {
      if (String(uid) === String(myId)) return false;
      const t = new Date(ts).getTime();
      return Number.isFinite(t) && t >= lastMineTs;
    });
  }, [messages, myId, readByUser]);

  const hasBeenSeen = seenReaders.length > 0;

  const seenAt = useMemo(() => {
    if (!hasBeenSeen) return '';
    const latest = seenReaders.reduce((max, [, ts]) => {
      const t = new Date(ts).getTime();
      return Number.isFinite(t) ? Math.max(max, t) : max;
    }, 0);
    return latest ? formatTime(new Date(latest).toISOString()) : '';
  }, [hasBeenSeen, seenReaders]);

  const seenLabel = useMemo(() => {
    if (!hasBeenSeen) return '';
    if (!isGroup) return `Vu${seenAt ? ` ${seenAt}` : ''}`;
    const names = seenReaders
      .map(([uid]) => participantMap[String(uid)]?.username || 'user')
      .slice(0, 3);
    const suffix = seenReaders.length > 3 ? ` +${seenReaders.length - 3}` : '';
    return `Vu par ${names.join(', ')}${suffix}`;
  }, [hasBeenSeen, isGroup, seenAt, seenReaders, participantMap]);

  const lastOutgoingMessageId = useMemo(() => {
    if (!myId || messages.length === 0) return null;
    const lastMine = [...messages]
      .reverse()
      .find((m) => String(m.sender_id || m?.sender?.id || '') === String(myId));
    return lastMine?.id ? String(lastMine.id) : null;
  }, [messages, myId]);

  // ─── Navigation ───────────────────────────────────────────────────────────

  const openPeer = () => {
    if (isGroup) {
      navigation.navigate('GroupMembers', { conversationId, title: conversationTitle });
      return;
    }
    navigation.navigate('UserProfile', {
      userId: directOtherUserId || route?.params?.userId || undefined,
      username: conversationUsername,
    });
  };

  const openPeerStory = () => {
    if (peerStories?.stories?.length) {
      setStoryViewerVisible(true);
      return;
    }
    openPeer();
  };

  // ─── Rendu d'un message ───────────────────────────────────────────────────

  /**
   * Descente automatique en bas du fil.
   *
   * Avant : un `setTimeout` armé à CHAQUE changement de taille du contenu, y
   * compris pendant la frappe. Deux corrections — plus de minuteur, et on ne
   * force plus la descente si le lecteur a remonté la conversation, ce qui la
   * lui arrachait des mains à la moindre arrivée de message.
   */
  const isAtBottomRef = useRef(true);

  const handleListScroll = useCallback((event: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom =
      contentSize.height - (contentOffset.y + layoutMeasurement.height);
    isAtBottomRef.current = distanceFromBottom < 80;
  }, []);

  const handleContentSizeChange = useCallback(() => {
    if (!isAtBottomRef.current) return;
    flatListRef.current?.scrollToEnd({ animated: true });
  }, []);

  /**
   * Mémoïsé : une closure recréée à chaque rendu invalide la mémoïsation
   * interne de la FlatList, si bien que toutes les bulles montées se
   * re-rendaient à chaque frappe dans le compositeur.
   */
  const renderItem = useCallback(({ item, index }: { item: MessageItem; index: number }) => {
    const senderId = String(item.sender_id || item?.sender?.id || '');
    const sender = item?.sender || participantMap[senderId] || {};
    const fromMe = !!(myId && senderId && String(myId) === senderId);
    const currentTs = new Date(item.created_at || item.createdAt || 0).getTime();

    const prevMsg = index > 0 ? messages[index - 1] : null;
    const nextMsg = index < messages.length - 1 ? messages[index + 1] : null;
    const prevTs = new Date(prevMsg?.created_at || prevMsg?.createdAt || 0).getTime();
    const prevSenderId = String(prevMsg?.sender_id || prevMsg?.sender?.id || '');
    const nextSenderId = String(nextMsg?.sender_id || nextMsg?.sender?.id || '');

    const isFirstOfGroup = prevSenderId !== senderId;
    const isLastOfGroup = nextSenderId !== senderId;
    const showSeparator =
      index === 0 ||
      (Number.isFinite(currentTs) && Number.isFinite(prevTs) && currentTs - prevTs > TIME_SEPARATOR_GAP_MS);

    // Rayons Instagram : le coin côté interlocuteur se resserre au sein
    // d'une même salve de messages pour former un bloc continu.
    const big = 20;
    const small = 6;
    const bubbleRadius = fromMe
      ? {
          borderTopLeftRadius: big,
          borderBottomLeftRadius: big,
          borderTopRightRadius: isFirstOfGroup ? big : small,
          borderBottomRightRadius: isLastOfGroup ? big : small,
        }
      : {
          borderTopRightRadius: big,
          borderBottomRightRadius: big,
          borderTopLeftRadius: isFirstOfGroup ? big : small,
          borderBottomLeftRadius: isLastOfGroup ? big : small,
        };

    const senderAvatar = getAvatarUri(sender?.avatar || null);
    const isLastOutgoing = fromMe && lastOutgoingMessageId === String(item.id);
    const expanded = expandedMessageId === String(item.id);
    const attachmentType = item.metadata?.attachment_type;
    const attachmentUrl = item.metadata?.attachment_url;
    const groupedReactions = groupReactions(item.reactions);

    // Lecture pure (aucune mutation ici) : `justArrivedIdsRef` est alimenté à
    // l'arrivée du message, pas au rendu. Fondu-glissé court et SANS ressort :
    // le message se pose, il ne rebondit pas.
    const isFreshMessage = justArrivedIdsRef.current.has(String(item.id));

    return (
      <Reanimated.View
        style={{ marginBottom: isLastOfGroup ? 10 : 2 }}
        entering={
          isFreshMessage
            ? FadeInDown.duration(200).easing(Easing.out(Easing.cubic))
            : undefined
        }
      >
        {showSeparator && (
          <View style={styles.separator}>
            <Text style={styles.separatorText}>{formatSeparator(item.created_at || item.createdAt)}</Text>
          </View>
        )}

        {isGroup && !fromMe && isFirstOfGroup && (
          <View style={styles.groupSenderRow}>
            <Text
              style={[
                styles.groupSenderName,
                nameIsLit(sender?.profile_customization) && {
                  color: certifiedNameColors(
                    sender?.verification_style as any,
                    sender?.profile_customization,
                  ).from,
                },
              ]}
            >
              {sender?.username || 'user'}
            </Text>
            {!!sender?.verified && (
              <VerifiedBadge
                verificationStyle={(sender?.verification_style as any) || 'default'}
                size={10}
                tint={
                  certifiedNameColors(
                    sender?.verification_style as any,
                    sender?.profile_customization,
                  ).from
                }
              />
            )}
          </View>
        )}

        <View style={[styles.msgRow, fromMe ? styles.msgRowRight : styles.msgRowLeft]}>
          {!fromMe && (
            <View style={styles.avatarSlot}>
              {isLastOfGroup &&
                (senderAvatar ? (
                  <Image source={{ uri: senderAvatar }} style={styles.rowAvatar} contentFit="cover" cachePolicy="memory-disk" transition={0} recyclingKey={senderAvatar} />
                ) : (
                  <View style={[styles.rowAvatar, styles.rowAvatarFallback]}>
                    <Text style={styles.rowAvatarText}>
                      {String(sender?.username || 'U').slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                ))}
            </View>
          )}

          <View style={[styles.messageColumn, fromMe && styles.messageColumnMine]}>
            <StoryReplyReference message={item} fromMe={fromMe} />
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() =>
                attachmentType === 'image' && attachmentUrl
                  ? openImageViewer(attachmentUrl)
                  : setExpandedMessageId(expanded ? null : String(item.id))
              }
              onLongPress={(evt) => {
                const { pageX, pageY } = evt.nativeEvent;
                setReactionBarFor({ messageId: String(item.id), x: pageX, y: pageY });
              }}
              delayLongPress={280}
              style={styles.bubbleTouch}
            >
              {attachmentType === 'image' && attachmentUrl ? (
                <Image source={{ uri: attachmentUrl }} style={[styles.attachmentImage, bubbleRadius]} contentFit="cover" cachePolicy="memory-disk" transition={0} recyclingKey={attachmentUrl} />
              ) : attachmentType === 'audio' && attachmentUrl ? (
                <VoiceMessageBubble
                  uri={attachmentUrl}
                  durationMs={item.metadata?.duration_ms}
                  waveform={item.metadata?.waveform}
                  fromMe={fromMe}
                  bubbleRadius={bubbleRadius}
                />
              ) : fromMe ? (
                <LinearGradient
                  colors={MY_BUBBLE_GRADIENT as unknown as [string, string]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.bubble, bubbleRadius]}
                >
                  <Text style={styles.bubbleTextMe}>{item.content}</Text>
                </LinearGradient>
              ) : (
                <View style={[styles.bubble, styles.bubbleOther, bubbleRadius]}>
                  <Text style={styles.bubbleTextOther}>{item.content}</Text>
                </View>
              )}
            </TouchableOpacity>

            {groupedReactions.length > 0 && (
              <View
                style={[styles.reactionPillRow, fromMe ? styles.reactionPillRowMine : styles.reactionPillRowOther]}
              >
                {groupedReactions.map((g) => (
                  <ReactionPill
                    key={g.emoji}
                    emoji={g.emoji}
                    count={g.count}
                    mine={!!item.reactions?.some(
                      (r) => r.emoji === g.emoji && String(r.user_id) === String(myId),
                    )}
                    onPress={() => sendReaction(String(item.id), g.emoji)}
                  />
                ))}
              </View>
            )}
          </View>
        </View>

        {expanded && (
          <Text style={[styles.messageTime, fromMe ? styles.messageTimeRight : styles.messageTimeLeft]}>
            {formatTime(item.created_at || item.createdAt)}
          </Text>
        )}

        {isLastOutgoing && hasBeenSeen && (
          <View style={styles.seenRow}>
            {!isGroup ? (
              avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.seenAvatar} contentFit="cover" cachePolicy="memory-disk" transition={0} recyclingKey={avatarUri} />
              ) : (
                <View style={[styles.seenAvatar, styles.rowAvatarFallback]}>
                  <Text style={styles.seenAvatarText}>
                    {String(conversationUsername || 'U').slice(0, 1).toUpperCase()}
                  </Text>
                </View>
              )
            ) : (
              seenReaders.slice(0, 3).map(([uid]) => {
                const uri = getAvatarUri(participantMap[String(uid)]?.avatar || null);
                return uri ? (
                  <Image key={uid} source={{ uri }} style={[styles.seenAvatar, { marginLeft: -5 }]} contentFit="cover" cachePolicy="memory-disk" transition={0} recyclingKey={uri} />
                ) : (
                  <View key={uid} style={[styles.seenAvatar, styles.rowAvatarFallback, { marginLeft: -5 }]}>
                    <Text style={styles.seenAvatarText}>
                      {String(participantMap[String(uid)]?.username || 'U').slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                );
              })
            )}
            <Text style={styles.seenLabel}>{seenLabel}</Text>
          </View>
        )}
      </Reanimated.View>
    );
  }, [
    messages,
    participantMap,
    myId,
    isGroup,
    expandedMessageId,
    openImageViewer,
    lastOutgoingMessageId,
    sendReaction,
  ]);

  const typingLabel = useMemo(() => {
    if (typingUsers.length === 0) return '';
    if (!isGroup) return '';
    const first = typingUsers[0]?.username || participantMap[typingUsers[0]?.user_id]?.username || 'Quelqu\'un';
    return typingUsers.length > 1 ? `${first} +${typingUsers.length - 1} écrivent…` : `${first} écrit…`;
  }, [typingUsers, isGroup, participantMap]);

  // ─── Rendu ────────────────────────────────────────────────────────────────

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />

        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={hitSlop}>
            <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.headerCenter} onPress={openPeer} activeOpacity={0.75}>
            <TouchableOpacity onPress={openPeerStory} activeOpacity={0.8}>
              <StoryRing
                size={34}
                uri={avatarUri}
                label={conversationTitle}
                hasStory={!isGroup && !!peerStories?.stories?.length}
                seen={!peerStories?.has_unseen}
                gapColor={colors.bg}
                ringWidth={2}
              />
            </TouchableOpacity>
            <View style={styles.headerTextBlock}>
              <View style={styles.headerNameRow}>
                {isGroup && (
                  <Ionicons name="people" size={13} color={colors.textSecondary} style={{ marginRight: 4 }} />
                )}
                <Text
                  style={[
                    styles.headerName,
                    nameIsLit(peerCustomization) && {
                      color: certifiedNameColors(conversationVerificationStyle as any, peerCustomization).from,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {conversationTitle || 'Conversation'}
                </Text>
                {!isGroup && conversationVerified && (
                  <View style={{ marginLeft: 4 }}>
                    <VerifiedBadge
                      verificationStyle={conversationVerificationStyle as any}
                      size={13}
                      tint={certifiedNameColors(conversationVerificationStyle as any, peerCustomization).from}
                    />
                  </View>
                )}
              </View>
              <Text style={styles.headerSub} numberOfLines={1}>
                {typingLabel ||
                  (typingUsers.length > 0
                    ? 'en train d\'écrire…'
                    : isGroup
                      ? `${memberCount} membre${memberCount > 1 ? 's' : ''}`
                      : `@${conversationUsername || 'user'}`)}
              </Text>
            </View>
          </TouchableOpacity>

          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.headerIconBtn} onPress={loadMessages} hitSlop={hitSlop}>
              <Ionicons name="refresh-outline" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconBtn} onPress={openPeer} hitSlop={hitSlop}>
              <Ionicons name="information-circle-outline" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Corps ── */}
        {loading ? (
          <ScreenSkeleton variant="thread" />
        ) : (
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
          >
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              onScroll={handleListScroll}
              scrollEventThrottle={160}
              onContentSizeChange={handleContentSizeChange}
              ListHeaderComponent={
                <View style={styles.threadIntro}>
                  <StoryRing
                    size={86}
                    uri={avatarUri}
                    label={conversationTitle}
                    hasStory={false}
                    gapColor={colors.bg}
                  />
                  <Text style={styles.introName}>{conversationTitle || 'Conversation'}</Text>
                  <Text style={styles.introSub}>
                    {isGroup
                      ? `Groupe · ${memberCount} membre${memberCount > 1 ? 's' : ''}`
                      : `@${conversationUsername || 'user'} · twitninf`}
                  </Text>
                  <TouchableOpacity style={styles.introBtn} onPress={openPeer} activeOpacity={0.8}>
                    <Text style={styles.introBtnText}>
                      {isGroup ? 'Voir les membres' : 'Voir le profil'}
                    </Text>
                  </TouchableOpacity>
                </View>
              }
            />

            {/* Indicateur « écrit… » */}
            {typingUsers.length > 0 && (
              <View style={styles.typingRow}>
                <View style={styles.avatarSlot}>
                  {(() => {
                    const uri = getAvatarUri(
                      participantMap[String(typingUsers[0]?.user_id || '')]?.avatar || conversationAvatar || null,
                    );
                    return uri ? (
                      <Image source={{ uri }} style={styles.rowAvatar} contentFit="cover" cachePolicy="memory-disk" transition={0} recyclingKey={uri} />
                    ) : (
                      <View style={[styles.rowAvatar, styles.rowAvatarFallback]} />
                    );
                  })()}
                </View>
                <View style={styles.typingBubble}>
                  <Animated.View style={[styles.typingDot, { opacity: dot1 }]} />
                  <Animated.View style={[styles.typingDot, { opacity: dot2 }]} />
                  <Animated.View style={[styles.typingDot, { opacity: dot3 }]} />
                </View>
              </View>
            )}

            {/* ── Composer ── */}
            <View style={styles.inputBar}>
              <TouchableOpacity style={styles.cameraBtn} onPress={openPeerStory} activeOpacity={0.85}>
                <Ionicons name="camera" size={19} color="#fff" />
              </TouchableOpacity>

              <View style={styles.inputWrap}>
                {isRecording ? (
                  <View style={styles.recordingRow}>
                    <View style={styles.recordingDot} />
                    <Text style={styles.recordingTimer}>{formatDuration(recordingMs)}</Text>
                    {/* Le déplacement suit le pouce sur le thread UI ; seul le
                        passage du seuil (`cancelArmed`) redescend jusqu'à
                        React, où il change une couleur. */}
                    <Reanimated.View style={[styles.recordingSlideHint, slideHintStyle]}>
                      <Ionicons
                        name="chevron-back"
                        size={14}
                        color={cancelArmed ? '#FF3B30' : colors.textMuted}
                      />
                      <Text
                        style={[styles.recordingSlideHintText, cancelArmed && styles.recordingSlideHintTextActive]}
                      >
                        Glisser pour annuler
                      </Text>
                    </Reanimated.View>
                  </View>
                ) : (
                  <TextInput
                    style={styles.input}
                    value={text}
                    onChangeText={setText}
                    placeholder="Message…"
                    placeholderTextColor={colors.textMuted}
                    multiline
                    maxLength={1000}
                  />
                )}
                {canSend ? (
                  <TouchableOpacity onPress={send} style={styles.sendBtn} hitSlop={hitSlop}>
                    <Text style={styles.sendText}>Envoyer</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.inputIcons}>
                    {!isRecording && (
                      <TouchableOpacity onPress={pickAndSendImage} disabled={attachmentSending} hitSlop={hitSlop}>
                        {attachmentSending ? (
                          <ActivityIndicator size="small" color={colors.textSecondary} />
                        ) : (
                          <Ionicons name="image-outline" size={22} color={colors.textSecondary} />
                        )}
                      </TouchableOpacity>
                    )}
                    {!isRecording && <Ionicons name="happy-outline" size={22} color={colors.textSecondary} />}
                    <GestureDetector gesture={micGesture}>
                      <Reanimated.View
                        style={[
                          styles.micButton,
                          isRecording && styles.micButtonActive,
                          micStyle,
                        ]}
                      >
                        <Ionicons
                          name={isRecording ? 'mic' : 'mic-outline'}
                          size={20}
                          color={isRecording ? '#fff' : colors.textSecondary}
                        />
                      </Reanimated.View>
                    </GestureDetector>
                  </View>
                )}
              </View>
            </View>
          </KeyboardAvoidingView>
        )}

        {peerStories && (
          <StoryViewer
            visible={storyViewerVisible}
            groups={[peerStories]}
            initialGroupIndex={0}
            currentUserId={myId}
            onClose={() => setStoryViewerVisible(false)}
            onOpenProfile={openPeer}
          />
        )}

        <Modal visible={!!viewerImageUrl} transparent animationType="fade" onRequestClose={closeImageViewer}>
          {/* Modal rend son contenu dans une racine native séparée (surtout sur
              Android) : react-native-gesture-handler y a besoin de sa PROPRE
              GestureHandlerRootView, sans quoi le geste de glissé ne se
              déclenche jamais, même si l'app en a une à sa racine. */}
          <GestureHandlerRootView style={{ flex: 1 }}>
            <Reanimated.View style={[styles.imageViewerBackdrop, viewerBackdropStyle]}>
              <SafeAreaView style={styles.imageViewerHeader}>
                <TouchableOpacity onPress={closeImageViewer} hitSlop={hitSlop} style={styles.imageViewerBack}>
                  <Ionicons name="chevron-back" size={26} color="#fff" />
                </TouchableOpacity>
              </SafeAreaView>
              <GestureDetector gesture={viewerPanGesture}>
                <Reanimated.View style={[styles.imageViewerBody, viewerImageAnimatedStyle]}>
                  {viewerImageUrl && (
                    <Image source={{ uri: viewerImageUrl }} style={styles.imageViewerImage} contentFit="contain" cachePolicy="memory-disk" transition={0} recyclingKey={viewerImageUrl} />
                  )}
                </Reanimated.View>
              </GestureDetector>
            </Reanimated.View>
          </GestureHandlerRootView>
        </Modal>

        <Modal
          visible={!!reactionBarFor}
          transparent
          animationType="none"
          onRequestClose={() => setReactionBarFor(null)}
        >
          <TouchableWithoutFeedback onPress={() => setReactionBarFor(null)}>
            <View style={StyleSheet.absoluteFill}>
              {reactionBarFor && (
                <Reanimated.View
                  // Ouverture franche et visible, mais SANS `springify()` :
                  // c'est lui qui faisait osciller la barre pendant près
                  // d'une seconde.
                  entering={ZoomIn.duration(190).easing(Easing.out(Easing.cubic))}
                  style={[
                    styles.reactionBar,
                    {
                      top: Math.max(50, reactionBarFor.y - 76),
                      left: Math.min(
                        Dimensions.get('window').width - REACTION_BAR_WIDTH - 12,
                        Math.max(12, reactionBarFor.x - REACTION_BAR_WIDTH / 2),
                      ),
                    },
                  ]}
                >
                  {QUICK_REACTIONS.map((emoji) => (
                    <TouchableOpacity
                      key={emoji}
                      onPress={() => sendReaction(reactionBarFor.messageId, emoji)}
                      style={styles.reactionBarItem}
                    >
                      <Text style={styles.reactionBarEmoji}>{emoji}</Text>
                    </TouchableOpacity>
                  ))}

                  {/* « + » : ouvre le sélecteur complet, comme Instagram. */}
                  <TouchableOpacity
                    onPress={() => {
                      setEmojiPickerFor(reactionBarFor.messageId);
                      setReactionBarFor(null);
                    }}
                    style={styles.reactionBarItem}
                    accessibilityLabel="Choisir un autre emoji"
                  >
                    <View style={styles.reactionBarMore}>
                      <Ionicons name="add" size={20} color={colors.textPrimary} />
                    </View>
                  </TouchableOpacity>
                </Reanimated.View>
              )}
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        <EmojiPickerSheet
          visible={!!emojiPickerFor}
          onClose={() => setEmojiPickerFor(null)}
          onSelect={(emoji) => {
            if (emojiPickerFor) sendReaction(emojiPickerFor, emoji);
            setEmojiPickerFor(null);
          }}
        />
      </SafeAreaView>
    </ScreenBackground>
  );
}

const hitSlop = { top: 10, bottom: 10, left: 10, right: 10 };

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  backBtn: { padding: 4, marginRight: 2 },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingLeft: 2 },
  headerTextBlock: { marginLeft: 8, flex: 1, minWidth: 0 },
  headerNameRow: { flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  headerName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontFamily: fonts.bold,
    flexShrink: 1,
  },
  headerSub: { color: colors.textMuted, fontSize: 12, marginTop: 1, fontFamily: fonts.regular },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  headerIconBtn: { padding: 7 },

  // Liste
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingVertical: 12, paddingHorizontal: 10 },

  threadIntro: { alignItems: 'center', paddingTop: 18, paddingBottom: 28 },
  introName: {
    color: colors.textPrimary,
    fontSize: 19,
    fontFamily: fonts.display,
    marginTop: 12,
  },
  introSub: { color: colors.textMuted, fontSize: 13, marginTop: 4, fontFamily: fonts.regular },
  introBtn: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
  },
  introBtnText: { color: colors.textPrimary, fontSize: 13, fontFamily: fonts.semibold },

  // Messages
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', marginVertical: 1 },
  msgRowLeft: { justifyContent: 'flex-start' },
  msgRowRight: { justifyContent: 'flex-end', paddingRight: 2 },
  avatarSlot: { width: 32, alignItems: 'center', justifyContent: 'flex-end', marginRight: 6 },
  rowAvatar: { width: 26, height: 26, borderRadius: 13 },
  rowAvatarFallback: { backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  rowAvatarText: { color: colors.textPrimary, fontSize: 11, fontFamily: fonts.bold },

  groupSenderRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 44, marginBottom: 4, marginTop: 8 },
  groupSenderName: { color: colors.textMuted, fontSize: 11, fontFamily: fonts.semibold },

  messageColumn: { maxWidth: '82%', alignItems: 'flex-start' },
  messageColumnMine: { alignItems: 'flex-end' },
  bubbleTouch: { maxWidth: '100%' },
  bubble: { paddingHorizontal: 14, paddingVertical: 9 },
  bubbleOther: { backgroundColor: colors.surfaceAlt },
  bubbleTextMe: { color: '#fff', fontSize: 15, lineHeight: 21, fontFamily: fonts.regular },
  bubbleTextOther: { color: colors.textPrimary, fontSize: 15, lineHeight: 21, fontFamily: fonts.regular },
  storyReplyCard: {
    width: 212,
    maxWidth: '100%',
    marginBottom: 9,
  },
  storyReplyCardMine: {
    alignItems: 'flex-end',
  },
  storyReplyLabel: {
    color: colors.textMuted,
    fontSize: 11.5,
    lineHeight: 15,
    fontFamily: fonts.semibold,
    marginBottom: 5,
  },
  storyReplyLabelMine: { color: colors.textSecondary, textAlign: 'right' },
  storyReplyPreview: {
    width: '100%',
    aspectRatio: 0.72,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#17151C',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.overlayStrong,
  },
  storyReplyMedia: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyReplyVideo: { alignItems: 'center', justifyContent: 'center' },
  storyReplyPlay: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyReplyCaption: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    color: '#fff',
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fonts.regular,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowRadius: 4,
  },

  attachmentImage: {
    width: 220,
    height: 220,
    backgroundColor: colors.surfaceAlt,
  },

  voiceBubble: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    width: 230,
  },
  voiceBubbleOther: { backgroundColor: colors.surfaceAlt },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  voicePlayBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voicePlayBtnMine: { backgroundColor: colors.textPrimary },
  voicePlayBtnOther: { backgroundColor: '#3B5DF6' },
  voicePlayBtnTouch: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  voiceWaveform: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2.5,
    height: 24,
  },
  voiceBar: { width: 2.5, borderRadius: 1.5 },
  voiceBarMine: { backgroundColor: colors.textMuted },
  voiceBarActiveMine: { backgroundColor: '#fff' },
  voiceBarOther: { backgroundColor: colors.borderStrong },
  voiceBarActiveOther: { backgroundColor: '#3B5DF6' },
  voiceDuration: { color: colors.textPrimary, fontSize: 10.5, fontFamily: fonts.medium },
  voiceDurationMine: { color: '#fff' },

  recordingRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, overflow: 'hidden' },
  recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF3B30' },
  recordingTimer: { color: colors.textPrimary, fontSize: 14, fontFamily: fonts.medium },
  recordingSlideHint: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 'auto' },
  recordingSlideHintText: { color: colors.textMuted, fontSize: 12.5, fontFamily: fonts.medium },
  recordingSlideHintTextActive: { color: '#FF3B30' },

  micButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButtonActive: { backgroundColor: '#FF3B30' },

  imageViewerBackdrop: { flex: 1, backgroundColor: '#000' },
  imageViewerHeader: { position: 'absolute', top: 0, left: 0, zIndex: 1 },
  imageViewerBack: { padding: 14 },
  imageViewerBody: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  imageViewerImage: {
    width: '100%',
    height: '80%',
  },

  reactionPillRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: -10,
    zIndex: 1,
  },
  reactionPillRowMine: { alignSelf: 'flex-end', marginRight: 6 },
  reactionPillRowOther: { alignSelf: 'flex-start', marginLeft: 6 },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  reactionPillMine: { borderColor: '#3B5DF6' },
  reactionPillEmoji: { fontSize: 13 },
  reactionPillCount: { color: colors.textSecondary, fontSize: 11, fontFamily: fonts.semibold },

  reactionBar: {
    position: 'absolute',
    width: REACTION_BAR_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: 28,
    paddingHorizontal: REACTION_BAR_PADDING,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
  },
  // Largeur fixe par emplacement : c'est ce qui garantit que le contenu tient
  // exactement dans REACTION_BAR_WIDTH, quelle que soit la largeur réelle du
  // glyphe emoji (elle varie selon la police système et la plateforme).
  reactionBarItem: {
    width: REACTION_ITEM_WIDTH,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionBarEmoji: { fontSize: REACTION_EMOJI_SIZE, lineHeight: REACTION_EMOJI_SIZE + 6 },
  reactionBarMore: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlayMedium,
  },

  messageTime: { color: colors.textMuted, fontSize: 10.5, marginTop: 3, fontFamily: fonts.regular },
  messageTimeRight: { textAlign: 'right', marginRight: 6 },
  messageTimeLeft: { marginLeft: 44 },

  separator: { alignItems: 'center', marginVertical: 14 },
  separatorText: { color: colors.textMuted, fontSize: 11, fontFamily: fonts.semibold },

  // Accusés de lecture
  seenRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 4, marginTop: 4, gap: 4 },
  seenAvatar: { width: 14, height: 14, borderRadius: 7 },
  seenAvatarText: { color: colors.textPrimary, fontSize: 7, fontFamily: fonts.bold },
  seenLabel: { color: colors.textMuted, fontSize: 11, fontFamily: fonts.medium },

  // Typing
  typingRow: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 10, paddingBottom: 8 },
  typingBubble: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 20,
    borderBottomLeftRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  typingDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.textSecondary },

  // Composer
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 10,
  },
  cameraBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0095F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    paddingLeft: 16,
    paddingRight: 12,
    minHeight: 40,
  },
  input: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 15,
    paddingVertical: Platform.OS === 'ios' ? 9 : 6,
    maxHeight: 110,
    fontFamily: fonts.regular,
  },
  inputIcons: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 8 },
  sendBtn: { paddingLeft: 10, paddingVertical: 6 },
  sendText: { color: '#0095F6', fontSize: 14, fontFamily: fonts.bold },
});
