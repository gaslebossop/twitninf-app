/**
 * 🧪 Fil de messages « 2B — Gouttière », sous drapeau `fil.refonte2b`.
 *
 * CLONE de `ConversationThreadScreen.tsx`. Toute la logique — socket temps
 * réel, pagination, enregistrement/lecture vocale, pièces jointes, réactions,
 * accusés de lecture, indicateur de frappe — est reprise telle quelle et doit
 * le RESTER. Seule la présentation change :
 *   - la palette papier (`theme/paper2b.ts`), en clair comme en sombre ;
 *   - la bulle « moi » et la bulle vocale « moi » : dégradé bleu → violet
 *     remplacé par un aplat `paper.accent` (règle « surfaces pleines », « un
 *     seul accent ») ;
 *   - le rouge d'enregistrement/annulation (`#FF3B30`) et le noir du
 *     visualiseur d'image restent inchangés : ce sont des conventions
 *     système, pas des couleurs de marque.
 * L'original n'est pas touché ; il continue de servir tout compte sans le
 * drapeau.
 */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
// `expo-image` plutôt que `Image` de React Native : cache disque et décodage
// hors du thread JS, sur des avatars et pièces jointes montés en liste.
// `transition={0}` : aucune apparition en fondu, le rendu ne change pas.
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
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
import { colors, statusBarStyle } from '../theme';
import { paper, paperFonts, isPaperDark } from '../theme/paper2b';
import { AppStatusBar, ScreenSkeleton } from '../components/ui';
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
import { useAuth } from '../contexts/AuthContext';

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

/**
 * Nombre de messages chargés à l'ouverture.
 *
 * La route serveur plafonne DÉJÀ à 30 par défaut (100 au maximum) : contrairement
 * à ce qu'on pourrait croire en lisant l'appel nu, l'historique entier n'est
 * jamais téléchargé. Le dire explicitement ici sert à deux choses : le `limit`
 * de la requête et l'`initialNumToRender` de la liste ne peuvent plus se
 * désaccorder, et si le défaut serveur bouge un jour, les deux suivent ensemble.
 *
 * Pourquoi l'accord compte : la liste tournait sur `initialNumToRender: 10`,
 * donc la hauteur de contenu mesurée au premier rendu ne valait qu'un tiers de
 * la vraie. `scrollToEnd` visait cette fausse fin, le défilement montait le lot
 * suivant, la hauteur augmentait, `scrollToEnd` repartait — l'écran PARCOURAIT
 * l'historique par à-coups au lieu de s'ouvrir dessus. En montant les 30 d'un
 * coup, la première mesure est la bonne et un seul défilement suffit.
 */
const MESSAGE_PAGE_SIZE = 30;

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
            <ActivityIndicator size="small" color={fromMe ? paper.accent : paper.onAccent} />
          ) : (
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={15}
              color={fromMe ? paper.accent : paper.onAccent}
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
      <View style={[styles.voiceBubble, styles.voiceBubbleMine, bubbleRadius]}>
        {content}
      </View>
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
          <View
            style={[styles.storyReplyMedia, styles.storyReplyVideo, styles.storyReplyPlaceholder]}
          >
            <Ionicons name={isVideo ? 'play' : 'image-outline'} size={30} color={paper.ink} />
          </View>
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

/**
 * ─── Une bulle, et rien qu'une bulle ────────────────────────────────────────
 *
 * Le corps du message était du JSX inline dans `renderItem`, dont les
 * dépendances contenaient `messages` : il lisait ses voisins pour décider du
 * groupage Instagram. La mémoïsation était donc annulée par le seul événement
 * qui compte — l'arrivée d'un message — et rien n'arrêtait la propagation, le
 * `CellRenderer` de la FlatList (une `PureComponent`) re-rendant TOUTES les
 * bulles montées faute de composant mémoïsé en dessous.
 *
 * Deux gestes le corrigent ensemble :
 *  1. le groupage devient une donnée précalculée (`DecoratedMessage`), donc
 *     `renderItem` n'a plus besoin de `messages` ;
 *  2. la bulle se défend elle-même par `React.memo`, si bien que même quand
 *     `renderItem` change encore d'identité (appui sur une bulle, accusé de
 *     lecture reçu), seules les bulles réellement touchées se re-rendent.
 *
 * Le second geste répare du même coup l'accusé de lecture « Vu », qui
 * n'apparaissait jamais à temps : la rangée lisait six valeurs du composant
 * dont cinq manquaient aux dépendances de `renderItem`, et restait donc figée
 * dans une closure périmée jusqu'au message suivant. Elle arrive désormais par
 * des props ordinaires (`showSeen`, `seenLabel`, `seenAvatars`), que le
 * comparateur de `memo` voit changer.
 */

/** Le message, plus tout ce qui dépend de ses VOISINS — calculé hors du rendu. */
interface DecoratedMessage {
  msg: MessageItem;
  sender: SenderLike;
  fromMe: boolean;
  isFirstOfGroup: boolean;
  isLastOfGroup: boolean;
  showSeparator: boolean;
}

/** Un avatar de la rangée « Vu », déjà résolu par l'écran. */
interface SeenAvatar {
  key: string;
  uri: string | null;
  initial: string;
  /** En groupe les avatars se chevauchent ; en tête-à-tête il n'y en a qu'un. */
  overlap: boolean;
}

/**
 * Constantes de module, et non des littéraux recréés à chaque rendu : toutes
 * les bulles sauf la dernière sortante les reçoivent, et c'est une prop
 * identique d'un rendu à l'autre qui permet à `memo` de les épargner quand un
 * accusé de lecture arrive.
 */
const NO_SEEN_AVATARS: SeenAvatar[] = [];
const NO_SENDER: SenderLike = {};
const SEEN_AVATAR_OVERLAP = { marginLeft: -5 } as const;

interface MessageBubbleProps {
  entry: DecoratedMessage;
  isGroup: boolean;
  myId: string | null;
  expanded: boolean;
  /** Faux sur toutes les bulles sauf la dernière sortante, une fois vue. */
  showSeen: boolean;
  seenLabel: string;
  seenAvatars: SeenAvatar[];
  /** Une ref, donc une identité stable : lue au rendu, jamais écrite ici. */
  freshIdsRef: React.MutableRefObject<Set<string>>;
  onOpenImage: (url: string) => void;
  onToggleExpanded: (messageId: string) => void;
  onLongPress: (messageId: string, x: number, y: number) => void;
  onReact: (messageId: string, emoji: string) => void;
}

const MessageBubble = memo(function MessageBubble({
  entry,
  isGroup,
  myId,
  expanded,
  showSeen,
  seenLabel,
  seenAvatars,
  freshIdsRef,
  onOpenImage,
  onToggleExpanded,
  onLongPress,
  onReact,
}: MessageBubbleProps) {
  const { msg: item, sender, fromMe, isFirstOfGroup, isLastOfGroup, showSeparator } = entry;
  const messageId = String(item.id);

  // Rayons Instagram : le coin côté interlocuteur se resserre au sein d'une
  // même salve de messages pour former un bloc continu.
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
  const attachmentType = item.metadata?.attachment_type;
  const attachmentUrl = item.metadata?.attachment_url;
  const groupedReactions = groupReactions(item.reactions);

  // Lecture pure (aucune mutation ici) : `freshIdsRef` est alimenté à
  // l'arrivée du message, pas au rendu. Fondu-glissé court et SANS ressort :
  // le message se pose, il ne rebondit pas.
  const isFreshMessage = freshIdsRef.current.has(messageId);

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
                ? onOpenImage(attachmentUrl)
                : onToggleExpanded(messageId)
            }
            onLongPress={(evt) => {
              const { pageX, pageY } = evt.nativeEvent;
              onLongPress(messageId, pageX, pageY);
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
              <View style={[styles.bubble, styles.bubbleMine, bubbleRadius]}>
                <Text style={styles.bubbleTextMe}>{item.content}</Text>
              </View>
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
                  onPress={() => onReact(messageId, g.emoji)}
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

      {showSeen && (
        <View style={styles.seenRow}>
          {seenAvatars.map((a) =>
            a.uri ? (
              <Image
                key={a.key}
                source={{ uri: a.uri }}
                style={a.overlap ? [styles.seenAvatar, SEEN_AVATAR_OVERLAP] : styles.seenAvatar}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={0}
                recyclingKey={a.uri}
              />
            ) : (
              <View
                key={a.key}
                style={
                  a.overlap
                    ? [styles.seenAvatar, styles.rowAvatarFallback, SEEN_AVATAR_OVERLAP]
                    : [styles.seenAvatar, styles.rowAvatarFallback]
                }
              >
                <Text style={styles.seenAvatarText}>{a.initial}</Text>
              </View>
            ),
          )}
          <Text style={styles.seenLabel}>{seenLabel}</Text>
        </View>
      )}
    </Reanimated.View>
  );
});

export default function ConversationThreadScreen({ navigation, route }: any) {
  // Réactif (rotation, foldable, split-screen) là où `Dimensions.get` pris
  // ponctuellement servait une valeur figée au rendu d'ouverture.
  const { width: windowWidth } = useWindowDimensions();
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

  /**
   * L'identifiant courant vient d'`AuthContext`, plus d'un `getCurrentUser()`
   * réseau : cet écran en est un descendant, et c'était un aller-retour complet
   * pour une donnée déjà en mémoire — ici en tête d'un chargement, donc
   * strictement sur le chemin critique de l'ouverture de l'écran.
   */
  const { user: authUser } = useAuth();
  const authUserId = authUser?.id ? String(authUser.id) : null;

  const loadMessages = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    try {
      setMyId(authUserId);

      /*
       * Les DEUX requêtes partent ensemble.
       *
       * Elles étaient en série, et la première ne conditionnait rien : elle
       * télécharge l'annuaire COMPLET des conversations pour n'en retenir
       * qu'une — celle qu'on vient d'ouvrir — et en extraire les participants
       * et l'horodatage de lecture. L'identifiant de la conversation, lui, est
       * connu depuis la navigation. C'étaient donc deux allers-retours
       * consécutifs avant le premier message affiché, dont l'un s'allonge avec
       * le nombre de conversations — qui n'a aucun rapport avec celle qu'on lit.
       *
       * `allSettled` et non `all` : l'annuaire n'est qu'un décor (avatars,
       * accusés de lecture). S'il échoue, les messages doivent quand même
       * s'afficher — c'est le même arbitrage que sur le fil d'accueil.
       *
       * Le vrai correctif reste côté serveur : joindre les participants à la
       * réponse des messages, ou ouvrir `GET /api/messages/conversations/:id`.
       * On passerait alors de deux requêtes à une.
       */
      const [convSettled, msgSettled] = await Promise.allSettled([
        apiService.get('/api/messages/conversations'),
        apiService.get(
          `/api/messages/conversations/${conversationId}/messages?limit=${MESSAGE_PAGE_SIZE}`,
        ),
      ]);
      const convRes = convSettled.status === 'fulfilled' ? convSettled.value : null;

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
              if (String(r.user_id) === String(authUserId || '')) myPrevReadAt = String(r.last_read_at);
            }
          });
          setReadByUser((prev) => ({ ...persistedReads, ...prev }));
        }
      }

      const res = msgSettled.status === 'fulfilled' ? msgSettled.value : null;
      const list = res?.success ? res.messages || [] : [];
      const safeList = Array.isArray(list) ? list : [];
      const normalizedList = safeList.map(normalizeMessage).filter((message) => message.id);
      setMessages(dedupeMessagesById(normalizedList));
      await markReadIfNeeded(normalizedList, authUserId, myPrevReadAt);
    } finally {
      setLoading(false);
    }
  }, [conversationId, markReadIfNeeded, authUserId]);

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
   * Groupage Instagram (coins resserrés au sein d'une salve, séparateur
   * d'horodatage) précalculé une fois par changement de liste. Il vivait dans
   * `renderItem`, qui devait donc lire `messages[index ± 1]` — et changer
   * d'identité à chaque message reçu. Une passe `O(n)` sans rendu remplace le
   * re-rendu de toutes les bulles montées.
   */
  const decorated = useMemo<DecoratedMessage[]>(
    () =>
      messages.map((msg, index) => {
        const senderId = String(msg.sender_id || msg?.sender?.id || '');
        const prevMsg = index > 0 ? messages[index - 1] : null;
        const nextMsg = index < messages.length - 1 ? messages[index + 1] : null;
        const currentTs = new Date(msg.created_at || msg.createdAt || 0).getTime();
        const prevTs = new Date(prevMsg?.created_at || prevMsg?.createdAt || 0).getTime();
        return {
          msg,
          // `NO_SENDER` plutôt qu'un `{}` littéral : un objet neuf à chaque
          // passe ferait échouer la comparaison de `memo` sur les messages
          // dont l'expéditeur n'est pas encore connu.
          sender: msg?.sender || participantMap[senderId] || NO_SENDER,
          fromMe: !!(myId && senderId && String(myId) === senderId),
          isFirstOfGroup: String(prevMsg?.sender_id || prevMsg?.sender?.id || '') !== senderId,
          isLastOfGroup: String(nextMsg?.sender_id || nextMsg?.sender?.id || '') !== senderId,
          showSeparator:
            index === 0 ||
            (Number.isFinite(currentTs) &&
              Number.isFinite(prevTs) &&
              currentTs - prevTs > TIME_SEPARATOR_GAP_MS),
        };
      }),
    [messages, participantMap, myId],
  );

  /**
   * Avatars de la rangée « Vu », résolus ici plutôt que dans la bulle : celle-ci
   * n'a ainsi besoin ni de `participantMap`, ni de l'avatar de l'interlocuteur,
   * ni du pseudo. Seule la dernière bulle sortante reçoit ce tableau ; toutes
   * les autres reçoivent `NO_SEEN_AVATARS`, dont l'identité ne change jamais.
   */
  const seenAvatars = useMemo<SeenAvatar[]>(() => {
    if (!hasBeenSeen) return NO_SEEN_AVATARS;
    if (!isGroup) {
      return [
        {
          key: 'peer',
          uri: avatarUri,
          initial: String(conversationUsername || 'U').slice(0, 1).toUpperCase(),
          overlap: false,
        },
      ];
    }
    return seenReaders.slice(0, 3).map(([uid]) => ({
      key: String(uid),
      uri: getAvatarUri(participantMap[String(uid)]?.avatar || null),
      initial: String(participantMap[String(uid)]?.username || 'U').slice(0, 1).toUpperCase(),
      overlap: true,
    }));
  }, [hasBeenSeen, isGroup, avatarUri, conversationUsername, seenReaders, participantMap]);

  /**
   * Poignées stables passées aux bulles mémoïsées. Une prop de callback
   * recréée à chaque rendu casserait `memo` aussi sûrement qu'une dépendance
   * de trop — et `sendReaction` lit `messages`, donc change d'identité à
   * chaque message reçu. Il passe par une ref : la bulle n'en sait rien.
   */
  const sendReactionRef = useRef(sendReaction);
  useEffect(() => {
    sendReactionRef.current = sendReaction;
  }, [sendReaction]);

  const handleBubbleReact = useCallback((messageId: string, emoji: string) => {
    sendReactionRef.current(messageId, emoji);
  }, []);

  const handleBubbleToggleExpanded = useCallback((messageId: string) => {
    setExpandedMessageId((prev) => (prev === messageId ? null : messageId));
  }, []);

  const handleBubbleLongPress = useCallback((messageId: string, x: number, y: number) => {
    setReactionBarFor({ messageId, x, y });
  }, []);

  /**
   * Mémoïsé : une closure recréée à chaque rendu invalide la mémoïsation
   * interne de la FlatList, si bien que toutes les bulles montées se
   * re-rendaient à chaque frappe dans le compositeur.
   *
   * `messages` n'y figure plus — le groupage est précalculé dans `decorated` —
   * donc un message reçu ne recrée plus cette fonction. Les dépendances qui
   * restent (appui sur une bulle, accusé de lecture) la recréent encore, mais
   * `MessageBubble` est mémoïsé : seule la bulle réellement touchée se re-rend.
   */
  const renderItem = useCallback(
    ({ item }: { item: DecoratedMessage }) => {
      const messageId = String(item.msg.id);
      const showSeen = item.fromMe && lastOutgoingMessageId === messageId && hasBeenSeen;
      return (
        <MessageBubble
          entry={item}
          isGroup={isGroup}
          myId={myId}
          expanded={expandedMessageId === messageId}
          showSeen={showSeen}
          seenLabel={showSeen ? seenLabel : ''}
          seenAvatars={showSeen ? seenAvatars : NO_SEEN_AVATARS}
          freshIdsRef={justArrivedIdsRef}
          onOpenImage={openImageViewer}
          onToggleExpanded={handleBubbleToggleExpanded}
          onLongPress={handleBubbleLongPress}
          onReact={handleBubbleReact}
        />
      );
    },
    [
      isGroup,
      myId,
      expandedMessageId,
      lastOutgoingMessageId,
      hasBeenSeen,
      seenLabel,
      seenAvatars,
      openImageViewer,
      handleBubbleToggleExpanded,
      handleBubbleLongPress,
      handleBubbleReact,
    ],
  );

  const typingLabel = useMemo(() => {
    if (typingUsers.length === 0) return '';
    if (!isGroup) return '';
    const first = typingUsers[0]?.username || participantMap[typingUsers[0]?.user_id]?.username || 'Quelqu\'un';
    return typingUsers.length > 1 ? `${first} +${typingUsers.length - 1} écrivent…` : `${first} écrit…`;
  }, [typingUsers, isGroup, participantMap]);

  // ─── Rendu ────────────────────────────────────────────────────────────────

  return (
    // Pas de `ScreenBackground` ici : il peint `colors.bg` en dur (le fond
    // « Pulse »), ce qui recouvrait le papier. 2B pose le sien à plat,
    // exactement comme `FeedGutterScreen` et `TweetDetailGutterScreen`.
    <View style={styles.root}>
      {/* `SafeAreaView` de `react-native-safe-area-context`, PAS celle du
          coeur de React Native : cette derniere ne pose aucun inset sur
          Android. `edges={['top']}` seulement — le bas est deja tenu par
          ce qui s'y trouve. */}
      <SafeAreaView style={styles.container} edges={['top']}>
        <AppStatusBar />

        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={hitSlop}>
            <Ionicons name="chevron-back" size={28} color={paper.ink} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.headerCenter} onPress={openPeer} activeOpacity={0.75}>
            <TouchableOpacity onPress={openPeerStory} activeOpacity={0.8}>
              <StoryRing
                size={34}
                uri={avatarUri}
                label={conversationTitle}
                hasStory={!isGroup && !!peerStories?.stories?.length}
                seen={!peerStories?.has_unseen}
                gapColor={paper.bg}
                ringWidth={2}
              />
            </TouchableOpacity>
            <View style={styles.headerTextBlock}>
              <View style={styles.headerNameRow}>
                {isGroup && (
                  <Ionicons name="people" size={13} color={paper.inkSoft} style={{ marginRight: 4 }} />
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
              <Ionicons name="refresh-outline" size={22} color={paper.ink} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconBtn} onPress={openPeer} hitSlop={hitSlop}>
              <Ionicons name="information-circle-outline" size={24} color={paper.ink} />
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
              data={decorated}
              keyExtractor={(item) => String(item.msg.id)}
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              onScroll={handleListScroll}
              scrollEventThrottle={160}
              onContentSizeChange={handleContentSizeChange}
              // Accordé à la taille de page : tout ce que le serveur envoie est
              // monté au premier rendu, donc `scrollToEnd` connaît la vraie
              // hauteur du contenu dès le premier appel (voir MESSAGE_PAGE_SIZE).
              initialNumToRender={MESSAGE_PAGE_SIZE}
              // Les suivants sont ceux qui s'accumulent pendant la session, à
              // mesure que la conversation vit.
              maxToRenderPerBatch={10}
              updateCellsBatchingPeriod={50}
              windowSize={11}
              // `removeClippedSubviews` reste à `false`, comme sur ProfileScreen :
              // les bulles ont une hauteur variable et portent des animations
              // d'entrée, et le clipping est connu pour y faire disparaître des
              // vues. Le gain serait marginal sur 30 éléments.
              ListHeaderComponent={
                <View style={styles.threadIntro}>
                  <StoryRing
                    size={86}
                    uri={avatarUri}
                    label={conversationTitle}
                    hasStory={false}
                    gapColor={paper.bg}
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
                <Ionicons name="camera" size={19} color={paper.onAccent} />
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
                        color={cancelArmed ? '#FF3B30' : paper.inkMeta}
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
                    placeholderTextColor={paper.inkMeta}
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
                          <ActivityIndicator size="small" color={paper.inkSoft} />
                        ) : (
                          <Ionicons name="image-outline" size={22} color={paper.inkSoft} />
                        )}
                      </TouchableOpacity>
                    )}
                    {!isRecording && <Ionicons name="happy-outline" size={22} color={paper.inkSoft} />}
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
                          color={isRecording ? '#fff' : paper.inkSoft}
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
                        windowWidth - REACTION_BAR_WIDTH - 12,
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
                      <Ionicons name="add" size={20} color={paper.ink} />
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
    </View>
  );
}

const hitSlop = { top: 10, bottom: 10, left: 10, right: 10 };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: paper.bg },
  container: { flex: 1, backgroundColor: 'transparent' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: paper.hairline,
  },
  backBtn: { padding: 4, marginRight: 2 },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingLeft: 2 },
  headerTextBlock: { marginLeft: 8, flex: 1, minWidth: 0 },
  headerNameRow: { flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  headerName: {
    color: paper.ink,
    fontSize: 15,
    fontFamily: paperFonts.strong,
    flexShrink: 1,
  },
  headerSub: { color: paper.inkMeta, fontSize: 12, marginTop: 1, fontFamily: paperFonts.body },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  headerIconBtn: { padding: 7 },

  // Liste
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingVertical: 12, paddingHorizontal: 10 },

  threadIntro: { alignItems: 'center', paddingTop: 18, paddingBottom: 28 },
  introName: {
    color: paper.ink,
    fontSize: 19,
    fontFamily: paperFonts.display,
    marginTop: 12,
  },
  introSub: { color: paper.inkMeta, fontSize: 13, marginTop: 4, fontFamily: paperFonts.body },
  introBtn: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: paper.bgBand,
  },
  introBtnText: { color: paper.ink, fontSize: 13, fontFamily: paperFonts.strong },

  // Messages
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', marginVertical: 1 },
  msgRowLeft: { justifyContent: 'flex-start' },
  msgRowRight: { justifyContent: 'flex-end', paddingRight: 2 },
  avatarSlot: { width: 32, alignItems: 'center', justifyContent: 'flex-end', marginRight: 6 },
  rowAvatar: { width: 26, height: 26, borderRadius: 13 },
  rowAvatarFallback: { backgroundColor: paper.bgBand, alignItems: 'center', justifyContent: 'center' },
  rowAvatarText: { color: paper.ink, fontSize: 11, fontFamily: paperFonts.strong },

  groupSenderRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 44, marginBottom: 4, marginTop: 8 },
  groupSenderName: { color: paper.inkMeta, fontSize: 11, fontFamily: paperFonts.strong },

  messageColumn: { maxWidth: '82%', alignItems: 'flex-start' },
  messageColumnMine: { alignItems: 'flex-end' },
  bubbleTouch: { maxWidth: '100%' },
  bubble: { paddingHorizontal: 14, paddingVertical: 9 },
  bubbleMine: { backgroundColor: paper.accent },
  bubbleOther: { backgroundColor: paper.bgBand },
  bubbleTextMe: { color: paper.onAccent, fontSize: 15, lineHeight: 21, fontFamily: paperFonts.body },
  bubbleTextOther: { color: paper.ink, fontSize: 15, lineHeight: 21, fontFamily: paperFonts.body },
  storyReplyCard: {
    width: 212,
    maxWidth: '100%',
    marginBottom: 9,
  },  storyReplyCardMine: {
    alignItems: 'flex-end',
  },
  storyReplyLabel: {
    color: paper.inkMeta,
    fontSize: 11.5,
    lineHeight: 15,
    fontFamily: paperFonts.strong,
    marginBottom: 5,
  },
  storyReplyLabelMine: { color: paper.inkSoft, textAlign: 'right' },
  storyReplyPreview: {
    width: '100%',
    aspectRatio: 0.72,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: paper.bgBand,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.overlayStrong,
  },
  storyReplyPlaceholder: { backgroundColor: paper.bgBand },
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
    fontFamily: paperFonts.body,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowRadius: 4,
  },

  attachmentImage: {
    width: 220,
    // `maxWidth` : sur un écran étroit la bulle (82 % de la largeur moins la
    // colonne d'avatar) peut descendre sous 220 pt — l'image plie au lieu
    // de déborder de la bulle.
    maxWidth: '100%',
    height: 220,
    backgroundColor: paper.bgBand,
  },

  voiceBubble: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    width: 230,
    maxWidth: '100%',
  },
  voiceBubbleMine: { backgroundColor: paper.accent },
  voiceBubbleOther: { backgroundColor: paper.bgBand },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  voicePlayBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voicePlayBtnMine: { backgroundColor: paper.onAccent },
  voicePlayBtnOther: { backgroundColor: paper.accent },
  voicePlayBtnTouch: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  voiceWaveform: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2.5,
    height: 24,
  },
  voiceBar: { width: 2.5, borderRadius: 1.5 },
  voiceBarMine: { backgroundColor: isPaperDark ? 'rgba(26,2,7,0.35)' : 'rgba(255,255,255,0.4)' },
  voiceBarActiveMine: { backgroundColor: paper.onAccent },
  voiceBarOther: { backgroundColor: paper.outline },
  voiceBarActiveOther: { backgroundColor: paper.accent },
  voiceDuration: { color: paper.ink, fontSize: 10.5, fontFamily: paperFonts.monoStrong },
  voiceDurationMine: { color: paper.onAccent },

  recordingRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, overflow: 'hidden' },
  recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF3B30' },
  recordingTimer: { color: paper.ink, fontSize: 14, fontFamily: paperFonts.monoStrong },
  recordingSlideHint: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 'auto' },
  recordingSlideHintText: { color: paper.inkMeta, fontSize: 12.5, fontFamily: paperFonts.bodyStrong },
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
    backgroundColor: paper.bgBand,
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: paper.outline,
  },
  reactionPillMine: { borderColor: paper.accent },
  reactionPillEmoji: { fontSize: 13 },
  reactionPillCount: { color: paper.inkSoft, fontSize: 11, fontFamily: paperFonts.monoStrong },

  reactionBar: {
    position: 'absolute',
    width: REACTION_BAR_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: paper.bgBand,
    borderRadius: 28,
    paddingHorizontal: REACTION_BAR_PADDING,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: paper.outline,
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

  messageTime: { color: paper.inkMeta, fontSize: 10.5, marginTop: 3, fontFamily: paperFonts.mono },
  messageTimeRight: { textAlign: 'right', marginRight: 6 },
  messageTimeLeft: { marginLeft: 44 },

  separator: { alignItems: 'center', marginVertical: 14 },
  separatorText: { color: paper.inkMeta, fontSize: 11, fontFamily: paperFonts.strong },

  // Accusés de lecture
  seenRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 4, marginTop: 4, gap: 4 },
  seenAvatar: { width: 14, height: 14, borderRadius: 7 },
  seenAvatarText: { color: paper.ink, fontSize: 7, fontFamily: paperFonts.strong },
  seenLabel: { color: paper.inkMeta, fontSize: 11, fontFamily: paperFonts.bodyStrong },

  // Typing
  typingRow: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 10, paddingBottom: 8 },
  typingBubble: {
    backgroundColor: paper.bgBand,
    borderRadius: 20,
    borderBottomLeftRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  typingDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: paper.inkSoft },

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
    backgroundColor: paper.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: paper.bg,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: paper.outline,
    paddingLeft: 16,
    paddingRight: 12,
    minHeight: 40,
  },
  input: {
    flex: 1,
    color: paper.ink,
    fontSize: 15,
    paddingVertical: Platform.OS === 'ios' ? 9 : 6,
    maxHeight: 110,
    fontFamily: paperFonts.body,
  },
  inputIcons: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 8 },
  sendBtn: { paddingLeft: 10, paddingVertical: 6 },
  sendText: { color: paper.accent, fontSize: 14, fontFamily: paperFonts.strong },
});
