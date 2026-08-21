/**
 * 🧪 Fil de messages « 2B — Gouttière », sous drapeau `fil.refonte2b`.
 *
 * Écrit pour ce test, pas cloné : `ConversationThreadScreen.tsx` reste l'écran
 * de tout compte hors du drapeau et n'est jamais touché.
 *
 * ── L'objet : une TRANSCRIPTION, pas une messagerie ──────────────────────
 * Une messagerie dessine des bulles : deux colonnes de cartes arrondies qui
 * se répondent. Une transcription dessine QUI a parlé, QUAND, et ce qui a été
 * dit — dans une seule colonne, comme un relevé d'échange. C'est ce second
 * objet que 2B demande, parce que le fil dont on arrive n'a ni carte ni
 * couleur de fond : il a une gouttière, des filets et une colonne d'encre.
 *
 * Conséquences, et ce sont elles qui font la refonte :
 *
 *   1. **La bulle disparaît.** Elle est une carte, et la règle du test est
 *      « des filets, jamais des cartes ». Le texte se pose sur le papier, à
 *      la même encre des deux côtés.
 *   2. **La gouttière de 52 px dit qui parle** — celle de `TweetRowGutter`,
 *      au pixel. L'avatar de l'interlocuteur en tête de salve, un repère
 *      d'accent pour les messages sortants. Ce n'est plus la couleur du fond
 *      ni le bord de l'écran qui portent cette information, c'est la colonne.
 *   3. **Le rail relie les messages d'une même salve**, exactement comme il
 *      relie un tweet à sa réponse dans le fil. Il ne descend qu'entre deux
 *      messages liés, jamais sous le dernier — un trait qui pend dans le vide
 *      est le défaut que `TweetRowGutter` documente déjà.
 *   4. **Chaque salve s'ouvre par une ligne d'auteur** : le nom, puis l'heure
 *      en chasse fixe. C'est la forme d'un relevé, et elle rend l'échange
 *      lisible sans que la position gauche/droite ait à le faire.
 *
 * ── Ce qui n'existe plus ─────────────────────────────────────────────────
 * Le bouton appareil photo du compositeur : il ouvrait la story de
 * l'interlocuteur, ce que l'avatar de l'en-tête fait déjà. L'icône « émoji »
 * à côté : elle n'avait aucun gestionnaire d'appui, c'était un pixel mort.
 * Le compositeur garde donc deux cibles au repos — joindre, et le micro.
 *
 * ── Ce qui est REPRIS tel quel, et pourquoi ──────────────────────────────
 * Toute la plomberie : socket temps réel, pagination, enregistrement et
 * lecture vocale, pièces jointes, réactions, accusés de lecture, indicateur
 * de frappe. Ce code porte des correctifs consignés — reset de la session
 * audio iOS, accord entre `MESSAGE_PAGE_SIZE` et `initialNumToRender`,
 * largeur de la barre de réactions dérivée de son contenu, doubles seuils du
 * glissé d'annulation, dédoublonnage. Le test porte sur la présentation ;
 * réécrire cette couche n'aurait rien redessiné et aurait rouvert des bugs
 * déjà fermés.
 *
 * ── La feuille ───────────────────────────────────────────────────────────
 * `theme/messages2b` et non `paper.bg` : le papier est propre aux écrans de
 * messages, le fil garde le fond de l'app. Voir l'en-tête de ce fichier-là.
 */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { paper, paperFonts, ps, GUTTER_W, ROW_PAD_X, ROW_GAP } from '../theme/paper2b';
// La feuille est propre a Messages : le fil garde la sienne (voir le fichier).
import { sheet } from '../theme/messages2b';
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
  onLongPress,
}: {
  emoji: string;
  count: number;
  mine: boolean;
  onPress: () => void;
  onLongPress: () => void;
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
        onLongPress={onLongPress}
        delayLongPress={320}
        style={[styles.reactionPill, mine && styles.reactionPillMine]}
        hitSlop={hitSlop}
        accessibilityRole="button"
        accessibilityLabel={`${emoji}, ${count} réaction${count > 1 ? 's' : ''}`}
        accessibilityHint="Appui long pour voir qui a réagi"
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
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
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

/**
 * Lecteur d'un message vocal, posé SUR le papier — il n'y a plus de bulle
 * autour. Ce qui distinguait « moi » de « l'autre » était la couleur du fond ;
 * c'est maintenant la gouttière, donc les deux côtés se dessinent pareil :
 * bouton d'accent cerné d'un filet, barres à l'encre, part lue à l'accent.
 *
 * Toute la mécanique audio est celle de l'écran d'origine, correctifs
 * compris — notamment l'échappatoire de chargement bloqué ci-dessous.
 */
function VoiceLine({
  uri,
  durationMs,
  waveform,
}: {
  uri: string;
  durationMs?: number;
  waveform?: number[];
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

  return (
    <View style={[styles.voiceBubble, { borderRadius: MSG_R }]}>
      <View style={styles.voicePlayRing}>
        <TouchableOpacity
          onPress={toggle}
          hitSlop={hitSlop}
          style={styles.voicePlayBtn}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Mettre en pause le message vocal' : 'Écouter le message vocal'}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={paper.accent} />
          ) : (
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={14}
              color={paper.accent}
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
              // Amplitude plancher : des barres toutes plates ne se lisent plus
              // comme un son, elles se lisent comme une ligne pointillee.
              { height: ps(6) + amplitude * ps(16) },
              i <= activeBarIndex ? styles.voiceBarPlayed : styles.voiceBarIdle,
            ]}
          />
        ))}
      </View>
      <Text style={styles.voiceDuration}>
        {formatDuration(positionMs > 0 ? positionMs : totalMs)}
      </Text>
    </View>
  );
}

/**
 * Renvoi vers la story à laquelle ce message répond.
 *
 * Plus de carte : une vignette et une étiquette en capitales espacées, la
 * voix des métas du test. Le libellé dit toujours de quel côté vient la
 * réponse, puisque ce n'est plus un fond de couleur qui le dit.
 */
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
    <View style={styles.storyReply}>
      <Text style={styles.storyReplyLabel}>
        {fromMe ? 'RÉPONSE À SA STORY' : 'A RÉPONDU À VOTRE STORY'}
      </Text>
      <View style={styles.storyReplyPreview}>
        {preview ? (
          <Image source={{ uri: preview }} style={styles.storyReplyMedia} contentFit="cover" cachePolicy="memory-disk" transition={0} recyclingKey={preview} />
        ) : (
          <View style={[styles.storyReplyMedia, styles.storyReplyPlaceholder]}>
            <Ionicons name={isVideo ? 'play' : 'image-outline'} size={26} color={sheet.inkMeta} />
          </View>
        )}
        {isVideo && preview && (
          <View style={styles.storyReplyPlay}>
            <Ionicons name="play" size={16} color="#fff" />
          </View>
        )}
        {!!metadata.story_caption && (
          <Text style={styles.storyReplyCaption} numberOfLines={2}>
            {metadata.story_caption}
          </Text>
        )}
      </View>
    </View>
  );
}

interface Reactor {
  userId: string;
  name: string;
  username?: string;
  avatar: string | null;
  verified: boolean;
}

/**
 * Qui a réagi, façon Instagram/Snapchat — ouverte par un appui long sur une
 * pastille de réaction.
 *
 * Même mécanique de feuille que `EmojiPickerSheet` (fondu du fond porté par
 * le Modal, glissé de la feuille porté à part par Reanimated) : le glissé
 * natif du Modal anime tout son contenu comme un bloc, fond compris, et se
 * voyait remonter depuis le bas comme une ombre.
 */
function ReactorsSheet({
  visible,
  emoji,
  reactors,
  onClose,
  onOpenProfile,
}: {
  visible: boolean;
  emoji: string;
  reactors: Reactor[];
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const sheetTranslateY = useSharedValue(windowHeight);

  useEffect(() => {
    if (!visible) return;
    sheetTranslateY.value = windowHeight;
    sheetTranslateY.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) });
  }, [visible, windowHeight, sheetTranslateY]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.value }],
  }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.reactorsBackdrop}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <Reanimated.View style={[styles.reactorsSheet, sheetStyle]}>
              <View style={styles.reactorsGrabber} />
              <Text style={styles.reactorsTitle}>
                {emoji} {reactors.length} {reactors.length > 1 ? 'réactions' : 'réaction'}
              </Text>
              <ScrollView contentContainerStyle={styles.reactorsList} keyboardShouldPersistTaps="handled">
                {reactors.map((r) => (
                  <TouchableOpacity
                    key={r.userId}
                    style={styles.reactorRow}
                    onPress={() => onOpenProfile(r.userId)}
                    activeOpacity={0.7}
                  >
                    {r.avatar ? (
                      <Image
                        source={{ uri: r.avatar }}
                        style={styles.reactorAvatar}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        transition={0}
                        recyclingKey={r.avatar}
                      />
                    ) : (
                      <View style={[styles.reactorAvatar, styles.rowAvatarFallback]}>
                        <Text style={styles.reactorAvatarText}>{r.name.slice(0, 1).toUpperCase()}</Text>
                      </View>
                    )}
                    <Text style={styles.reactorName} numberOfLines={1}>
                      {r.name}
                    </Text>
                    {!!r.username && (
                      <Text style={styles.reactorHandle} numberOfLines={1}>
                        @{r.username}
                      </Text>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </Reanimated.View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

/** Séparateur de jour : « Aujourd'hui 14:32 », « Hier 09:10 », « 12 mars 08:00 ». */
function formatSeparator(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfMessageDay = new Date(date);
  startOfMessageDay.setHours(0, 0, 0, 0);
  const dayDiff = Math.round(
    (startOfToday.getTime() - startOfMessageDay.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (dayDiff <= 0) return `AUJOURD'HUI ${formatTime(value)}`;
  if (dayDiff === 1) return 'HIER';
  if (dayDiff < 7) return date.toLocaleDateString('fr-FR', { weekday: 'long' }).toUpperCase();
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }).toUpperCase();
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

interface MessageEntryProps {
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
  onShowReactors: (messageId: string, emoji: string) => void;
}

/**
 * Rayon unique, pas de coin resserré par regroupement.
 *
 * La version précédente resserrait le coin intérieur d'une salve (6 px contre
 * 18) pour dire « ces messages vont ensemble ». C'est exactement le tell d'app
 * de chat générique, et désormais redondant : le rail d'accent (voir
 * `S.accentRail`) et le rythme vertical (`ps(2)` dans une salve, `ps(12)`
 * entre deux) disent déjà la même chose. Empiler les deux aurait été le
 * défaut « plusieurs indices pour une seule idée ».
 */
const MSG_R = ps(14);
/** Une bulle ne dépasse jamais cette part de la largeur : la ligne reste lisible. */
const BUBBLE_MAX = '78%';
/** Largeur du rail d'accent, et son décalage hors de la bulle. */
const RAIL_W = ps(2.5);
const RAIL_OFFSET = ps(7);

const MessageEntry = memo(function MessageEntry({
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
  onShowReactors,
}: MessageEntryProps) {
  const { msg: item, sender, fromMe, isFirstOfGroup, isLastOfGroup, showSeparator } = entry;
  const messageId = String(item.id);

  const senderAvatar = getAvatarUri(sender?.avatar || null);
  const attachmentType = item.metadata?.attachment_type;
  const attachmentUrl = item.metadata?.attachment_url;
  const groupedReactions = groupReactions(item.reactions);

  // Lecture pure (aucune mutation ici) : `freshIdsRef` est alimenté à
  // l'arrivée du message, pas au rendu. Fondu-glissé court et SANS ressort :
  // le message se pose, il ne rebondit pas.
  const isFreshMessage = freshIdsRef.current.has(messageId);

  /**
   * L'avatar n'apparaît QUE dans un groupe, et seulement en tête de la salve —
   * avec le nom, pas séparé de lui. La version précédente le posait au PIED
   * (convention de messagerie générique), pendant que le nom ouvrait la salve
   * plus haut : les deux repères d'identité d'un même bloc de messages
   * pointaient donc à ses deux extrémités opposées. Fil B2 annonce toujours
   * l'auteur au début d'une rangée (`TweetRowGutter.authorRow`) ; ici la salve
   * en tient lieu.
   *
   * En tête-à-tête, l'en-tête de l'écran dit déjà à qui on parle : le répéter
   * à chaque message vole 44 px de largeur à toutes les lignes pour une
   * information qu'on a sous les yeux.
   */
  const showAvatar = isGroup && !fromMe;

  // ── Gestes de la bulle ────────────────────────────────────────────────
  // Remplace le `TouchableOpacity` d'origine : mélanger les touchables du
  // cœur RN avec Gesture Handler sur le même arbre casse le double-tap (voir
  // `references/gestures/SKILL.md`). Tout passe donc par une seule
  // composition Gesture Handler.
  const pressed = useSharedValue(0);
  const dragPeek = useSharedValue(0);
  const heartPop = useSharedValue(0);

  const alreadyHearted = !!item.reactions?.some(
    (r) => r.emoji === '❤️' && String(r.user_id) === String(myId),
  );

  const handleSingleTap = useCallback(() => {
    if (attachmentType === 'image' && attachmentUrl) onOpenImage(attachmentUrl);
    else onToggleExpanded(messageId);
  }, [attachmentType, attachmentUrl, messageId, onOpenImage, onToggleExpanded]);

  /**
   * Double-tap façon Instagram : pose un cœur, ne l'enlève jamais. Un second
   * double-tap sur un message déjà aimé ne rejoue donc rien — même règle que
   * le double-tap du fil (`TweetRowGutter`), pour la même raison : un geste
   * qui peut retirer ce qu'il vient de poser n'est plus sûr à répéter vite.
   */
  const handleDoubleTap = useCallback(() => {
    if (alreadyHearted) return;
    heartPop.value = 0;
    heartPop.value = withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) });
    onReact(messageId, '❤️');
  }, [alreadyHearted, heartPop, messageId, onReact]);

  const singleTapGesture = useMemo(
    () =>
      Gesture.Tap()
        .maxDistance(10)
        .onBegin(() => {
          pressed.value = withTiming(1, { duration: 80 });
        })
        .onFinalize(() => {
          pressed.value = withTiming(0, { duration: 120 });
        })
        .onEnd((_e, success) => {
          if (success) runOnJS(handleSingleTap)();
        }),
    [pressed, handleSingleTap],
  );

  const doubleTapGesture = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .maxDistance(10)
        .onEnd((_e, success) => {
          if (success) runOnJS(handleDoubleTap)();
        }),
    [handleDoubleTap],
  );

  const longPressGesture = useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(280)
        .maxDistance(10)
        .onStart((e) => {
          runOnJS(onLongPress)(messageId, e.absoluteX, e.absoluteY);
        }),
    [messageId, onLongPress],
  );

  /**
   * Glisser la bulle fait apparaître son heure exacte, façon Instagram — mais
   * un repère fixe au coin plutôt qu'une colonne qui suit le doigt : une
   * bulle courte et une bulle qui remplit presque les 78% n'ouvrent pas le
   * même espace à droite, un ancrage au coin marche pour les deux sans calcul
   * de largeur. Purement transitoire : relâcher fait toujours disparaître
   * l'heure, rien n'est mémorisé (contrairement à `expanded`, qui reste posé
   * par un appui simple).
   */
  const revealGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-14, 14])
        .failOffsetY([-8, 8])
        .onUpdate((e) => {
          dragPeek.value = e.translationX;
        })
        .onEnd(() => {
          dragPeek.value = withTiming(0, { duration: 160 });
        }),
    [dragPeek],
  );

  const bubbleGesture = useMemo(
    () => Gesture.Race(revealGesture, Gesture.Exclusive(longPressGesture, Gesture.Exclusive(doubleTapGesture, singleTapGesture))),
    [revealGesture, longPressGesture, doubleTapGesture, singleTapGesture],
  );

  const pressedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pressed.value, [0, 1], [1, 0.92]),
  }));

  const revealTimeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(dragPeek.value), [10, 45], [0, 1], Extrapolation.CLAMP),
  }));

  const heartPopStyle = useAnimatedStyle(() => ({
    opacity: interpolate(heartPop.value, [0, 0.12, 0.7, 1], [0, 1, 0.9, 0], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(heartPop.value, [0, 0.35, 1], [0.4, 1.18, 0.95], Extrapolation.CLAMP) },
    ],
  }));

  return (
    <Reanimated.View
      style={{ marginBottom: isLastOfGroup ? ps(12) : ps(2) }}
      entering={
        isFreshMessage ? FadeInDown.duration(200).easing(Easing.out(Easing.cubic)) : undefined
      }
    >
      {showSeparator && (
        <Text style={styles.separatorText}>
          {formatSeparator(item.created_at || item.createdAt)}
        </Text>
      )}

      {/* Le nom n'est utile qu'en groupe : ailleurs il redit l'en-tête. */}
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
            numberOfLines={1}
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
        {showAvatar && (
          <View style={styles.avatarSlot}>
            {isFirstOfGroup &&
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
          <View style={styles.bubbleWrap}>
            <GestureDetector gesture={bubbleGesture}>
              <Reanimated.View
                style={[styles.bubbleTouch, pressedStyle]}
                accessible
                accessibilityRole="button"
                accessibilityLabel={
                  attachmentType === 'image'
                    ? 'Image'
                    : attachmentType === 'audio'
                      ? 'Message vocal'
                      : item.content
                }
                accessibilityHint="Appui double pour aimer, appui long pour réagir"
              >
                {attachmentType === 'image' && attachmentUrl ? (
                  <Image source={{ uri: attachmentUrl }} style={[styles.attachmentImage, { borderRadius: MSG_R }]} contentFit="cover" cachePolicy="memory-disk" transition={0} recyclingKey={attachmentUrl} />
                ) : attachmentType === 'audio' && attachmentUrl ? (
                  <VoiceLine
                    uri={attachmentUrl}
                    durationMs={item.metadata?.duration_ms}
                    waveform={item.metadata?.waveform}
                  />
                ) : (
                  <View style={styles.bubble}>
                    <Text style={styles.bubbleText}>{item.content}</Text>
                  </View>
                )}
              </Reanimated.View>
            </GestureDetector>

            {/* Rail d'accent : le seul repère qui distingue encore « moi » de
                « l'autre » côté matière — la position gauche/droite fait le
                reste (voir la note sur `msgRow` plus bas). Il ne se dessine
                que pour mes messages, jamais un aplat, jamais dupliqué en
                face : un signal rare reste un signal. `bottom` s'étend d'un
                cran quand la salve continue, pour rejoindre le message
                suivant sans lui laisser un pixel de trait interrompu. */}
            {fromMe && (
              <View
                pointerEvents="none"
                style={[styles.accentRail, { bottom: isLastOfGroup ? 0 : -ps(2) }]}
              />
            )}

            {/* Heure révélée en glissant la bulle — geste transitoire, voir
                `revealGesture`. Ancrée au coin extérieur, pas dans la marge
                variable qu'ouvrirait une bulle plus courte que la largeur
                max. */}
            <Reanimated.View
              pointerEvents="none"
              style={[styles.revealTimePill, fromMe ? styles.revealTimePillMine : styles.revealTimePillOther, revealTimeStyle]}
            >
              <Text style={styles.revealTimeText}>{formatTime(item.created_at || item.createdAt)}</Text>
            </Reanimated.View>

            {/* Cœur du double-tap. En accent, comme celui du fil — mais posé
                sur la bulle, pas plein écran : ici l'échelle est celle d'un
                message, pas celle d'une ligne entière. */}
            <Reanimated.View pointerEvents="none" style={[styles.heartPopOverlay, heartPopStyle]}>
              <Ionicons name="heart" size={ps(34)} color={paper.accent} />
            </Reanimated.View>
          </View>

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
                  onLongPress={() => onShowReactors(messageId, g.emoji)}
                />
              ))}
            </View>
          )}

          {/*
            UN horodatage par salve, au pied du dernier message — pas un par
            bulle. Trois messages envoyés dans la même minute portaient trois
            fois la même heure, juste sous le séparateur qui la donnait déjà.
            L'appui sur une bulle révèle l'heure de CE message précis.
          */}
          {(isLastOfGroup || expanded) && (
            <Text style={[styles.messageTime, fromMe ? styles.messageTimeRight : styles.messageTimeLeft]}>
              {formatTime(item.created_at || item.createdAt)}
            </Text>
          )}
        </View>
      </View>

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
  // Le bas de l'écran, pas seulement le haut : `SafeAreaView` ne couvre que
  // `edges={['top']}` (le bas est géré ici, au repos seulement — voir
  // `inputBar`), sinon le compositeur se collait à la barre d'accueil sur les
  // appareils sans bouton. Même geste que `CommentSheet` (`insets.bottom`).
  const insets = useSafeAreaInsets();
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
  /** Message + emoji dont on veut voir qui a réagi (appui long sur une pastille). */
  const [reactorsFor, setReactorsFor] = useState<{ messageId: string; emoji: string } | null>(null);

  const flatListRef = useRef<FlatList>(null);
  /**
   * `scrollToEnd()` vise `contentSize`, qui peut être en retard d'une frame
   * sur la vraie hauteur (mesure d'un message tout juste monté, padding du
   * `contentContainerStyle`) — le défilement s'arrête alors juste avant le
   * bas, un manque documenté de la méthode plutôt qu'un bug de cet écran.
   * `scrollToOffset` vers une valeur volontairement hors d'atteinte est
   * borné par la liste elle-même à sa vraie fin, quelle que soit la fraîcheur
   * de la mesure.
   */
  const scrollToBottom = useCallback((animated = true) => {
    flatListRef.current?.scrollToOffset({ offset: 100000, animated });
  }, []);
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

  /**
   * Remonter au clavier, comme Instagram — sans lui, le clavier recouvre la
   * fin de la conversation sans que rien ne compense : la vue garde le même
   * décalage de défilement pendant que la zone visible rétrécit, et les
   * derniers messages passent derrière le clavier.
   *
   * Inconditionnel (pas de garde `isAtBottomRef`) : ouvrir le clavier, c'est
   * l'intention de répondre à ce qui se dit MAINTENANT, qu'on ait ou non
   * remonté lire l'historique juste avant.
   */
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const sub = Keyboard.addListener(showEvent, () => scrollToBottom());
    return () => sub.remove();
  }, [scrollToBottom]);

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
      // Pas de `markMessageAsFresh` ici : ce message est le mien, j'ai déjà
      // les yeux dessus. Le marquer « frais » jouait `FadeInDown` (200 ms) EN
      // MÊME TEMPS que le défilement automatique vers le bas (voir
      // `scrollToBottom`) — deux animations non coordonnées sur la même
      // rangée, l'une déplaçant la bulle dans son repère, l'autre déplaçant
      // la liste sous elle. Le défilement suffit déjà à dire « c'est parti ».
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
        // Même raison que dans `send()` : pas d'entrée animée sur mon propre
        // envoi, elle se battait avec le défilement automatique.
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
    scrollToBottom();
  }, [scrollToBottom]);

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

  const handleShowReactors = useCallback((messageId: string, emoji: string) => {
    setReactorsFor({ messageId, emoji });
  }, []);

  /**
   * Qui a posé CET emoji sur CE message, résolu en identité affichable.
   * `item.reactions` ne porte que `user_id` (+ un `username` pas toujours
   * fourni par le serveur) : on complète par `participantMap`, déjà chargé
   * pour l'en-tête et l'indicateur de frappe, et par mon propre profil pour
   * mes réactions.
   */
  const reactors = useMemo(() => {
    if (!reactorsFor) return [];
    const msg = messages.find((m) => String(m.id) === reactorsFor.messageId);
    const list = (msg?.reactions || []).filter((r) => r.emoji === reactorsFor.emoji);
    return list.map((r) => {
      const uid = String(r.user_id);
      if (uid === myId) {
        return {
          userId: uid,
          name: 'Vous',
          username: authUser?.username,
          avatar: getAvatarUri((authUser as any)?.avatar || null),
          verified: false,
        };
      }
      const known = participantMap[uid];
      return {
        userId: uid,
        name: known?.full_name || known?.username || r.username || conversationTitle || 'Utilisateur',
        username: known?.username || r.username,
        avatar: getAvatarUri(known?.avatar || (!isGroup ? conversationAvatar : null) || null),
        verified: !!known?.verified,
      };
    });
  }, [reactorsFor, messages, myId, authUser, participantMap, conversationTitle, conversationAvatar, isGroup]);

  const openReactorProfile = useCallback(
    (userId: string) => {
      setReactorsFor(null);
      if (userId === myId) return;
      const known = participantMap[userId];
      (navigation as any).navigate('UserProfile', {
        userId,
        username: known?.username || (!isGroup ? conversationUsername : undefined),
      });
    },
    [myId, participantMap, navigation, isGroup, conversationUsername],
  );

  /**
   * Mémoïsé : une closure recréée à chaque rendu invalide la mémoïsation
   * interne de la FlatList, si bien que toutes les bulles montées se
   * re-rendaient à chaque frappe dans le compositeur.
   *
   * `messages` n'y figure plus — le groupage est précalculé dans `decorated` —
   * donc un message reçu ne recrée plus cette fonction. Les dépendances qui
   * restent (appui sur une bulle, accusé de lecture) la recréent encore, mais
   * `MessageEntry` est mémoïsé : seule la bulle réellement touchée se re-rend.
   */
  const renderItem = useCallback(
    ({ item }: { item: DecoratedMessage }) => {
      const messageId = String(item.msg.id);
      const showSeen = item.fromMe && lastOutgoingMessageId === messageId && hasBeenSeen;
      return (
        <MessageEntry
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
          onShowReactors={handleShowReactors}
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
      handleShowReactors,
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
    // Pas de `ScreenBackground` : il peint `colors.bg` en dur, le fond de
    // l'app. La feuille se pose à plat, comme `FeedGutterScreen` pose la sienne.
    <View style={styles.root}>
      {/* `SafeAreaView` de `react-native-safe-area-context`, PAS celle du
          coeur de React Native : cette derniere ne pose aucun inset sur
          Android. `edges={['top']}` seulement — le bas est deja tenu par
          ce qui s'y trouve. */}
      <SafeAreaView style={styles.container} edges={['top']}>
        <AppStatusBar />

        {/* ── En-tête : un filet, jamais un aplat ── */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={hitSlop}>
            <Ionicons name="chevron-back" size={26} color={paper.ink} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.headerCenter} onPress={openPeer} activeOpacity={0.75}>
            {/* L'avatar ouvre la story : c'est ce que faisait le bouton
                appareil photo du compositeur, qui n'a donc plus lieu d'être. */}
            <TouchableOpacity onPress={openPeerStory} activeOpacity={0.8}>
              <StoryRing
                size={ps(32)}
                uri={avatarUri}
                label={conversationTitle}
                hasStory={!isGroup && !!peerStories?.stories?.length}
                seen={!peerStories?.has_unseen}
                gapColor={sheet.bg}
                ringWidth={2}
              />
            </TouchableOpacity>
            <View style={styles.headerTextBlock}>
              <View style={styles.headerNameRow}>
                {isGroup && (
                  <Ionicons name="people" size={13} color={sheet.inkSoft} style={{ marginRight: 4 }} />
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
                    ? 'en train d\'Écrire…'
                    : isGroup
                      ? `${memberCount} membre${memberCount > 1 ? 's' : ''}`
                      : `@${conversationUsername || 'user'}`)}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Actualiser et « voir le profil » ont disparu : le second
              redisait exactement ce que fait déjà un appui sur l'avatar ou le
              nom juste à côté (`openPeer`), et les messages arrivent déjà en
              direct par socket sans bouton pour le demander. */}
        </View>

        {/* ── Corps ── */}
        {loading ? (
          <ScreenSkeleton variant="messages" />
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
              // les entrées ont une hauteur variable et portent des animations
              // d'entrée, et le clipping est connu pour y faire disparaître des
              // vues. Le gain serait marginal sur 30 éléments.
              ListHeaderComponent={
                // En-tête de la transcription : de qui est cet échange. Pas de
                // bouton plein — un mot souligné d'accent suffit.
                <View style={styles.threadIntro}>
                  <StoryRing
                    size={ps(76)}
                    uri={avatarUri}
                    label={conversationTitle}
                    hasStory={false}
                    gapColor={sheet.bg}
                  />
                  <Text style={styles.introName}>{conversationTitle || 'Conversation'}</Text>
                  <Text style={styles.introSub}>
                    {isGroup
                      ? `Groupe · ${memberCount} membre${memberCount > 1 ? 's' : ''}`
                      : `@${conversationUsername || 'user'}`}
                  </Text>
                  <TouchableOpacity style={styles.introBtn} onPress={openPeer} activeOpacity={0.8}>
                    <Text style={styles.introBtnText}>
                      {isGroup ? 'Voir les membres' : 'Voir le profil'}
                    </Text>
                  </TouchableOpacity>
                </View>
              }
            />

            {/* « écrit… » : posé dans la gouttière, comme une entrée qui
                s'annonce sans encore rien dire. */}
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
                <View style={styles.typingDots}>
                  <Animated.View style={[styles.typingDot, { opacity: dot1 }]} />
                  <Animated.View style={[styles.typingDot, { opacity: dot2 }]} />
                  <Animated.View style={[styles.typingDot, { opacity: dot3 }]} />
                </View>
              </View>
            )}

            {/* ── Compositeur : une ligne réglée, pas une boîte grise ──
                Deux cibles au repos seulement — joindre, et le micro. */}
            <View style={[styles.inputBar, { paddingBottom: ps(10) + insets.bottom }]}>
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
                        color={cancelArmed ? '#FF3B30' : sheet.inkMeta}
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
                    // Le clavier peut déjà être ouvert (on revient d'un autre
                    // champ, ou on avait remonté lire l'historique pendant
                    // qu'il l'était déjà) : dans ce cas `keyboardWillShow` ne
                    // se redéclenche pas, seul le focus le dit.
                    onFocus={() => scrollToBottom()}
                    placeholder="Écrire…"
                    placeholderTextColor={sheet.inkMeta}
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
                      <TouchableOpacity
                        onPress={pickAndSendImage}
                        disabled={attachmentSending}
                        hitSlop={hitSlop}
                        accessibilityRole="button"
                        accessibilityLabel="Joindre une image"
                        accessibilityState={{ disabled: attachmentSending, busy: attachmentSending }}
                      >
                        {attachmentSending ? (
                          <ActivityIndicator size="small" color={sheet.inkSoft} />
                        ) : (
                          <Ionicons name="add" size={32} color={sheet.inkSoft} />
                        )}
                      </TouchableOpacity>
                    )}
                    <GestureDetector gesture={micGesture}>
                      <Reanimated.View
                        style={[styles.micButton, isRecording && styles.micButtonActive, micStyle]}
                        accessibilityRole="button"
                        accessibilityLabel="Maintenir pour enregistrer un message vocal"
                      >
                        <Ionicons
                          name={isRecording ? 'mic' : 'mic-outline'}
                          size={30}
                          color={isRecording ? '#fff' : sheet.inkSoft}
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

        <ReactorsSheet
          visible={!!reactorsFor}
          emoji={reactorsFor?.emoji || ''}
          reactors={reactors}
          onClose={() => setReactorsFor(null)}
          onOpenProfile={openReactorProfile}
        />
      </SafeAreaView>
    </View>
  );
}

const hitSlop = { top: 10, bottom: 10, left: 10, right: 10 };

/** Avatar d'une entrée : plus petit que dans le registre, la colonne est la même. */
const ENTRY_AVATAR = ps(32);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: sheet.bg },
  container: { flex: 1, backgroundColor: 'transparent' },

  // ── En-tête ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: ps(14),
    paddingVertical: ps(9),
    borderBottomWidth: 1,
    borderBottomColor: paper.hairline,
  },
  backBtn: { padding: ps(4), marginRight: ps(2) },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingLeft: ps(2) },
  headerTextBlock: { marginLeft: ps(9), flex: 1, minWidth: 0 },
  headerNameRow: { flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  headerName: {
    color: paper.ink,
    fontSize: ps(22),
    fontFamily: paperFonts.strong,
    letterSpacing: ps(-0.3),
    flexShrink: 1,
  },
  headerSub: {
    color: sheet.inkMeta,
    fontSize: ps(14),
    marginTop: ps(2),
    fontFamily: paperFonts.body,
  },
  listContent: { paddingBottom: ps(10) },

  // ── Ouverture de la transcription ──
  threadIntro: {
    alignItems: 'center',
    paddingTop: ps(22),
    paddingBottom: ps(22),
    paddingHorizontal: ROW_PAD_X,
  },
  introName: {
    color: paper.ink,
    fontSize: ps(20),
    fontFamily: paperFonts.display,
    letterSpacing: ps(-0.4),
    marginTop: ps(12),
    textAlign: 'center',
  },
  introSub: {
    color: sheet.inkMeta,
    fontSize: ps(13),
    fontFamily: paperFonts.body,
    marginTop: ps(6),
  },
  // Pas de bouton plein : un mot, souligné d'un filet d'accent.
  introBtn: {
    marginTop: ps(16),
    borderBottomWidth: 1,
    borderBottomColor: paper.accent,
    paddingBottom: ps(2),
  },
  introBtnText: { color: paper.accent, fontSize: ps(14), fontFamily: paperFonts.strong },

  // ── Séparateur de jour ──
  separatorText: {
    color: sheet.inkMeta,
    fontSize: ps(10),
    letterSpacing: ps(1.5),
    fontFamily: paperFonts.mono,
    textAlign: 'center',
    paddingTop: ps(14),
    paddingBottom: ps(10),
  },

  // ── Une bulle ──
  // L'alignement gauche/droite est le repere principal de l'emetteur : c'est
  // lui qui permet de savoir qui parle SANS lire. Le supprimer au profit d'une
  // colonne unique rendait l'ecran illisible, c'est la lecon de la version
  // precedente. `flex-start` (et non plus `flex-end`) parce que l'avatar
  // ouvre desormais la salve au lieu de la clore — voir `showAvatar`.
  msgRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: ROW_PAD_X },
  msgRowLeft: { justifyContent: 'flex-start' },
  msgRowRight: { justifyContent: 'flex-end' },
  avatarSlot: { width: ps(30), alignItems: 'center', justifyContent: 'flex-start', marginRight: ps(7) },
  rowAvatar: { width: ps(26), height: ps(26), borderRadius: ps(13) },
  rowAvatarFallback: {
    backgroundColor: sheet.band,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowAvatarText: { color: paper.ink, fontSize: ps(11), fontFamily: paperFonts.strong },

  groupSenderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ps(4),
    marginLeft: ROW_PAD_X + ps(37),
    marginBottom: ps(4),
    marginTop: ps(8),
  },
  groupSenderName: { color: sheet.inkMeta, fontSize: ps(12), fontFamily: paperFonts.strong },

  messageColumn: { maxWidth: BUBBLE_MAX, alignItems: 'flex-start' },
  messageColumnMine: { alignItems: 'flex-end' },
  bubbleTouch: { maxWidth: '100%' },
  // `position: relative` : ancre `accentRail` et les deux pastilles de geste,
  // qui se positionnent en absolu pour epouser exactement la hauteur de CE
  // conteneur (texte, image ou lecteur vocal), quel que soit son nombre de
  // lignes. `overflow: visible` : sur Android une vue rogne ses enfants par
  // defaut, et le coeur du double-tap comme la pastille d'heure debordent
  // volontairement du cadre de la bulle (meme piege que documente dans
  // `TweetRowGutter`).
  bubbleWrap: { position: 'relative', overflow: 'visible' },
  // Meme fond des deux cotes : ce qui distinguait « moi » tenait tout entier
  // dans un aplat d'accent, contraire a la regle de `paper2b.ts` (« aucun
  // aplat de couleur hors du concours »). La position et le rail suffisent.
  bubble: { paddingHorizontal: ps(18), paddingVertical: ps(13), backgroundColor: sheet.band },
  bubbleText: {
    color: paper.ink,
    fontSize: ps(26),
    lineHeight: ps(35),
    fontFamily: paperFonts.body,
  },
  // Le seul signal qui reste de « moi » cote matiere. Jamais dessine en face :
  // un signal repete des deux cotes cesse d'en etre un.
  accentRail: {
    position: 'absolute',
    top: 0,
    right: -RAIL_OFFSET,
    width: RAIL_W,
    borderRadius: RAIL_W / 2,
    backgroundColor: paper.accent,
  },
  // Ancrée au coin EXTÉRIEUR de la bulle, pas dans sa marge de largeur : un
  // message d'un mot et un message qui frôle `BUBBLE_MAX` n'ouvrent pas le
  // même espace à côté d'eux, un coin fixe fonctionne pour les deux.
  revealTimePill: {
    position: 'absolute',
    bottom: -ps(9),
    backgroundColor: sheet.bg,
    borderRadius: ps(8),
    paddingHorizontal: ps(6),
    paddingVertical: ps(2),
  },
  revealTimePillMine: { right: -ps(4) },
  revealTimePillOther: { left: -ps(4) },
  revealTimeText: { color: sheet.inkMeta, fontSize: ps(10), fontFamily: paperFonts.mono },
  heartPopOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },

  attachmentImage: {
    width: ps(220),
    // Sur un ecran etroit la colonne peut descendre sous 220 pt : l'image se
    // reduit alors au lieu de deborder de la bulle.
    maxWidth: '100%',
    height: ps(220),
    backgroundColor: sheet.band,
  },

  // UN horodatage par salve, discret, du cote de son auteur.
  messageTime: { color: sheet.inkMeta, fontSize: ps(10), fontFamily: paperFonts.mono, marginTop: ps(3) },
  messageTimeRight: { textAlign: 'right', marginRight: ps(4) },
  messageTimeLeft: { marginLeft: ps(4) },

  // ── Message vocal, posé sur le papier ──
  // Meme lecture des deux cotes (voir l'en-tete de `VoiceLine`) : plus de fond
  // colore pour « moi », le bouton de lecture porte seul l'accent.
  voiceBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ps(9),
    paddingHorizontal: ps(11),
    paddingVertical: ps(10),
    width: ps(228),
    maxWidth: '100%',
    backgroundColor: sheet.band,
  },
  voicePlayRing: {
    width: ps(28),
    height: ps(28),
    borderRadius: ps(14),
    borderWidth: 1,
    borderColor: paper.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voicePlayBtn: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  voiceWaveform: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2.5, height: ps(24) },
  voiceBar: { flex: 1, maxWidth: 3, borderRadius: 1.5 },
  voiceBarIdle: { backgroundColor: paper.ink, opacity: 0.25 },
  voiceBarPlayed: { backgroundColor: paper.accent },
  voiceDuration: { color: sheet.inkMeta, fontSize: ps(10.5), fontFamily: paperFonts.mono },

  // ── Renvoi vers une story ──
  storyReply: { marginBottom: ps(6) },
  storyReplyLabel: {
    color: sheet.inkMeta,
    fontSize: ps(9.5),
    letterSpacing: ps(1.2),
    fontFamily: paperFonts.mono,
    marginBottom: ps(5),
  },
  storyReplyPreview: { width: ps(112) },
  storyReplyMedia: {
    width: ps(112),
    height: ps(150),
    borderRadius: ps(8),
    backgroundColor: sheet.band,
  },
  storyReplyPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  storyReplyPlay: {
    position: 'absolute',
    top: ps(60),
    left: ps(42),
    width: ps(28),
    height: ps(28),
    borderRadius: ps(14),
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyReplyCaption: {
    color: sheet.inkMeta,
    fontSize: ps(12),
    lineHeight: ps(16),
    marginTop: ps(5),
    fontFamily: paperFonts.body,
  },

  // ── Réactions ──
  reactionPillRow: { flexDirection: 'row', gap: ps(4), marginTop: ps(4) },
  reactionPillRowMine: { alignSelf: 'flex-end' },
  reactionPillRowOther: { alignSelf: 'flex-start' },
  // Une surface pleine et discrete : cernee de rouge, la pastille se lisait
  // comme une erreur, pas comme une reaction.
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ps(3),
    backgroundColor: sheet.band,
    borderRadius: ps(12),
    paddingHorizontal: ps(7),
    paddingVertical: ps(3),
  },
  reactionPillMine: { backgroundColor: paper.pillWash },
  reactionPillEmoji: { fontSize: ps(12) },
  reactionPillCount: { color: sheet.inkMeta, fontSize: ps(10), fontFamily: paperFonts.mono },

  // Largeur dérivée de son contenu — voir REACTION_BAR_WIDTH.
  reactionBar: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    width: REACTION_BAR_WIDTH,
    paddingHorizontal: REACTION_BAR_PADDING,
    paddingVertical: ps(6),
    borderRadius: ps(24),
    backgroundColor: sheet.band,
    borderWidth: 1,
    borderColor: paper.hairline,
  },
  // Largeur fixe par emplacement : c'est ce qui garantit que le contenu tient
  // exactement dans REACTION_BAR_WIDTH, quelle que soit la largeur réelle du
  // glyphe emoji (elle varie selon la police système et la plateforme).
  reactionBarItem: { width: REACTION_ITEM_WIDTH, alignItems: 'center', justifyContent: 'center' },
  reactionBarEmoji: { fontSize: REACTION_EMOJI_SIZE },
  reactionBarMore: {
    width: ps(30),
    height: ps(30),
    borderRadius: ps(15),
    borderWidth: 1,
    borderColor: paper.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Qui a réagi ──
  reactorsBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  reactorsSheet: {
    maxHeight: '62%',
    paddingTop: ps(8),
    paddingBottom: ps(28),
    borderTopLeftRadius: ps(20),
    borderTopRightRadius: ps(20),
    backgroundColor: sheet.band,
  },
  reactorsGrabber: {
    alignSelf: 'center',
    width: ps(36),
    height: ps(4),
    borderRadius: ps(2),
    marginBottom: ps(14),
    backgroundColor: paper.outline,
  },
  reactorsTitle: {
    color: paper.ink,
    fontSize: ps(16),
    fontFamily: paperFonts.strong,
    paddingHorizontal: ROW_PAD_X,
    marginBottom: ps(6),
  },
  reactorsList: { paddingHorizontal: ROW_PAD_X, paddingTop: ps(6) },
  reactorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ps(11),
    paddingVertical: ps(9),
  },
  reactorAvatar: { width: ps(38), height: ps(38), borderRadius: ps(19) },
  reactorAvatarText: { color: paper.ink, fontSize: ps(15), fontFamily: paperFonts.strong },
  reactorName: { color: paper.ink, fontSize: ps(15), fontFamily: paperFonts.body, flexShrink: 1 },
  reactorHandle: { color: sheet.inkMeta, fontSize: ps(13), fontFamily: paperFonts.mono, marginLeft: 'auto' },

  // ── Accusés de lecture ──
  seenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ps(4),
    justifyContent: 'flex-end',
    paddingHorizontal: ROW_PAD_X,
    marginTop: ps(4),
  },
  seenAvatar: { width: ps(14), height: ps(14), borderRadius: ps(7) },
  seenAvatarText: { color: paper.ink, fontSize: ps(8), fontFamily: paperFonts.strong },
  seenLabel: {
    color: sheet.inkMeta,
    fontSize: ps(10),
    letterSpacing: ps(0.8),
    fontFamily: paperFonts.mono,
    marginLeft: ps(2),
  },

  // ── « écrit… » ──
  typingRow: {
    flexDirection: 'row',
    paddingHorizontal: ROW_PAD_X,
    paddingBottom: ps(8),
    alignItems: 'center',
  },
  typingDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ps(4),
    backgroundColor: sheet.band,
    borderRadius: ps(14),
    paddingHorizontal: ps(12),
    paddingVertical: ps(9),
  },
  typingDot: { width: ps(6), height: ps(6), borderRadius: ps(3), backgroundColor: sheet.inkMeta },

  // ── Compositeur : une ligne réglée ──
  // `paddingBottom` fixe volontairement absent d'ici : il dépend de l'appareil
  // (encoche ou bouton d'accueil) et est calculé au rendu — voir l'appel du
  // composant.
  inputBar: {
    paddingHorizontal: ROW_PAD_X,
    paddingTop: ps(10),
    borderTopWidth: 1,
    borderTopColor: paper.hairline,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: ps(12),
    borderBottomWidth: 1,
    borderBottomColor: paper.hairline,
    paddingBottom: ps(6),
  },
  input: {
    flex: 1,
    color: paper.ink,
    fontSize: ps(26),
    lineHeight: ps(35),
    fontFamily: paperFonts.body,
    maxHeight: ps(144),
    paddingVertical: ps(6),
    paddingTop: ps(6),
  },
  inputIcons: { flexDirection: 'row', alignItems: 'center', gap: ps(14), paddingBottom: ps(6) },
  micButton: { alignItems: 'center', justifyContent: 'center' },
  micButtonActive: {
    width: ps(44),
    height: ps(44),
    borderRadius: ps(22),
    backgroundColor: '#FF3B30',
  },
  sendBtn: { paddingLeft: ps(10), paddingBottom: ps(8) },
  sendText: { color: paper.accent, fontSize: ps(15), fontFamily: paperFonts.strong },

  recordingRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: ps(8), paddingVertical: ps(8) },
  recordingDot: { width: ps(8), height: ps(8), borderRadius: ps(4), backgroundColor: '#FF3B30' },
  recordingTimer: { color: paper.ink, fontSize: ps(13), fontFamily: paperFonts.mono },
  recordingSlideHint: { flexDirection: 'row', alignItems: 'center', gap: ps(3), marginLeft: 'auto' },
  recordingSlideHintText: { color: sheet.inkMeta, fontSize: ps(12), fontFamily: paperFonts.body },
  recordingSlideHintTextActive: { color: '#FF3B30' },

  // ── Visualiseur d'image : posé sur du média, donc hors palette ──
  imageViewerBackdrop: { flex: 1, backgroundColor: '#000' },
  imageViewerHeader: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2 },
  imageViewerBack: { padding: ps(12) },
  imageViewerBody: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  imageViewerImage: { width: '100%', height: '80%' },
});
