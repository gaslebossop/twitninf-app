/**
 * 🧪 Conversation « 2B », sous drapeau `fil.refonte2b`.
 *
 * Écrit pour ce test, pas cloné : `ConversationThreadScreen.tsx` reste l'écran
 * de tout compte hors du drapeau et n'est jamais touché.
 *
 * ── Cet écran EST le dessin « 6a », et son maintien du micro EST « 6b » ───
 *
 * Toutes les valeurs viennent du dessin, à la valeur près, passées par `ps()`
 * — dont le repère est justement les 402 pt pour lesquels il a été fait. Ce
 * fichier n'a donc pas d'échelle typographique à lui : la grille est
 * `46 pt | 12 | reste`, le corps est à 15/1,45, la durée d'un vocal à 19, la
 * minuterie de l'enregistrement à 26, et toutes les métas sont en chasse fixe
 * à 9–9,5 avec leurs capitales espacées. Ne pas « arrondir » ces nombres : ce
 * sont les écarts entre eux qui font la hiérarchie, et un corps remonté à 26
 * (ce qu'était l'écran d'avant) fait s'effondrer la colonne d'heures.
 *
 * ── L'objet : un RELEVÉ D'ÉCHANGE, pas une messagerie ────────────────────
 *   1. **L'heure est dans la gouttière**, colonne de 46 pt en chasse fixe
 *      alignée à droite, à gauche de CHAQUE message, la même pour les deux
 *      interlocuteurs. C'est elle qui range l'écran.
 *   2. **Plus d'alignement gauche/droite.** Une seule colonne de contenu.
 *   3. **C'est la MATIÈRE qui dit qui parle** : le message reçu se pose sur le
 *      papier nu, le message envoyé sur un bloc d'encre. Un aplat plein se lit
 *      sans qu'on ait à lire — ce qu'un rail de 2,5 pt ne faisait pas.
 *   4. **Le vocal est l'objet principal** : onde pleine largeur sur 44 pt,
 *      durée en gros chiffres, vitesse de lecture, état. UN seul gabarit
 *      d'onde dans tout l'écran, l'enregistrement en cours compris.
 *   5. **Les photos ont deux formats** : seule sur la largeur de la colonne,
 *      ou deux carreaux côte à côte.
 *
 * ── Ce qui n'existe plus ─────────────────────────────────────────────────
 * Le rail d'accent des messages sortants · l'horodatage au pied de salve · la
 * pastille d'heure révélée au glissé (et son geste) · l'avatar dans la
 * gouttière · la rangée « Vu » et ses avatars · l'ouverture de transcription
 * (gros avatar + bouton « Voir le profil ») · le sous-titre de l'en-tête.
 * Le dessin ne montre aucun d'eux, et chacun redisait ce qui est déjà écrit
 * ailleurs.
 *
 * ── Deux écarts assumés, et pourquoi ─────────────────────────────────────
 *   - Le dessin écrit « Non écouté » sous un vocal envoyé. Le serveur ne
 *     fournit pas d'accusé d'ÉCOUTE, seulement de lecture de la conversation :
 *     le libellé dit donc « Vu » / « Envoyé », qui est vrai.
 *   - Le bloc ambre « 50 NF — brouillon de concours » n'existe pas dans l'app :
 *     rien ne permet de préparer un concours depuis une conversation. Le
 *     dessiner aurait été un bouton qui ne mène nulle part.
 *
 * ── Ce qui est REPRIS tel quel ───────────────────────────────────────────
 * Toute la plomberie : socket temps réel, chargement, lecture et
 * enregistrement audio, pièces jointes, réactions, accusés de lecture,
 * indicateur de frappe. Ce code porte des correctifs consignés — reset de la
 * session audio iOS, accord entre `MESSAGE_PAGE_SIZE` et `initialNumToRender`,
 * largeur de la barre de réactions dérivée de son contenu, doubles seuils du
 * glissé d'annulation, dédoublonnage.
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
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
// `expo-image` plutôt que `Image` de React Native : cache disque et décodage
// hors du thread JS, sur des avatars et pièces jointes montés en liste.
// `transition={0}` : aucune apparition en fondu, le rendu ne change pas.
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { Audio, AVPlaybackStatus } from 'expo-av';
import {
  ComposedGesture,
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Reanimated, {
  Easing,
  Extrapolation,
  FadeInDown,
  ZoomIn,
  type SharedValue,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { io } from 'socket.io-client';
import { paperFonts, ps, isPaperDark } from '../theme/paper2b';
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

// ─── La palette du dessin ───────────────────────────────────────────────────

/**
 * Les couleurs de « 6a / 6b », à la valeur près.
 *
 * Écrites ici plutôt que dans `theme/messages2b` : ce sont les couleurs d'UN
 * dessin, pas une feuille partagée. Le registre (`MessagesScreen2B`) garde la
 * sienne, et personne ne peut repeindre cet écran-là en touchant celui-ci.
 *
 * Le clair est le dessin littéral. Le sombre n'en est pas l'inversion
 * mécanique : c'est la même idée, l'encre passant du texte au fond. Deux
 * valeurs ne se retournent pas et sont recalculées, pour la raison déjà
 * consignée dans `paper2b.ts` — l'accent `#E8384F` tombe à 4,3:1 sur l'encre
 * et remonte à `#FF5468` ; et le bloc « moi », encre sur encre, disparaîtrait :
 * il passe à une surface relevée plutôt qu'à un pavé quasi blanc par message.
 */
interface DrawingPalette {
  bg: string;
  ink: string;
  /** Texte posé sur l'encre. */
  onInk: string;
  /** L'heure, dans la gouttière. */
  time: string;
  /** Méta en capitales espacées, sur le papier. */
  meta: string;
  hairline: string;
  /** Contour de la pastille de vitesse. */
  pillLine: string;
  /** Contour du cadenas. */
  lockLine: string;
  /** Le chevron qui pointe vers le cadenas. */
  chevron: string;
  /** Fond d'une photo qui n'est pas encore arrivée. */
  media: string;
  accent: string;
  onAccent: string;
  /** Barres non lues d'une onde. */
  bar: string;
  /** Le panneau d'enregistrement. */
  panel: string;
  onPanel: string;
  panelLabel: string;
  panelMeta: string;
  panelScale: string;
  panelLine: string;
  /** Contour de la corbeille. */
  panelOutline: string;
  /** Le halo du bouton rond, au repos puis pendant l'enregistrement. */
  halo: string;
  haloStrong: string;
  /**
   * Les surfaces qui se posent DEVANT la page — barre de réactions, feuille
   * « qui a réagi », pastille de réaction. Elles ont besoin d'un palier
   * d'élévation propre : en sombre, une ombre ne se voit pas, c'est la surface
   * qui doit monter d'un cran.
   */
  surface: string;
  surfaceLine: string;
}

const LIGHT: DrawingPalette = {
  bg: '#F8F6F1',
  ink: '#17161A',
  /** Texte posé sur l'encre. */
  onInk: '#F8F6F1',
  /** L'heure, dans la gouttière. */
  time: '#8A8892',
  /** Méta en capitales espacées, sur le papier. */
  meta: '#6E6C75',
  hairline: 'rgba(23,22,26,0.10)',
  /** Contour de la pastille de vitesse. */
  pillLine: 'rgba(23,22,26,0.18)',
  /** Contour du cadenas. */
  lockLine: 'rgba(23,22,26,0.20)',
  /** Le chevron qui pointe vers le cadenas. */
  chevron: '#B0ADB6',
  /** Fond d'une photo qui n'est pas encore arrivée. */
  media: '#EFEBE3',
  accent: '#E8384F',
  onAccent: '#FFFFFF',
  /** Barres non lues d'une onde posée sur le papier. */
  bar: 'rgba(23,22,26,0.22)',
  /** Le panneau d'enregistrement. */
  panel: '#17161A',
  onPanel: '#F8F6F1',
  panelLabel: 'rgba(248,246,241,0.70)',
  panelMeta: 'rgba(248,246,241,0.60)',
  panelScale: 'rgba(248,246,241,0.45)',
  panelLine: 'rgba(248,246,241,0.14)',
  panelOutline: 'rgba(248,246,241,0.28)',
  /** Le halo du bouton rond, au repos puis pendant l'enregistrement. */
  halo: 'rgba(232,56,79,0.13)',
  haloStrong: 'rgba(232,56,79,0.22)',
  surface: '#FFFFFF',
  surfaceLine: 'rgba(23,22,26,0.12)',
};

const DARK: DrawingPalette = {
  bg: '#131210',
  ink: '#F4F2ED',
  onInk: '#131210',
  time: '#918E99',
  meta: '#A3A0AA',
  hairline: 'rgba(244,242,237,0.13)',
  pillLine: 'rgba(244,242,237,0.22)',
  lockLine: 'rgba(244,242,237,0.22)',
  chevron: '#5E5B66',
  media: '#1C1A17',
  accent: '#FF5468',
  // Encre foncée sur le corail, pas du blanc : blanc sur `#FF5468` ne tient
  // que 3,1:1, illisible sur une capitale de 9,5.
  onAccent: '#1A0207',
  bar: 'rgba(244,242,237,0.24)',
  panel: '#221F1A',
  onPanel: '#F4F2ED',
  panelLabel: 'rgba(244,242,237,0.70)',
  panelMeta: 'rgba(244,242,237,0.62)',
  panelScale: 'rgba(244,242,237,0.45)',
  panelLine: 'rgba(244,242,237,0.14)',
  panelOutline: 'rgba(244,242,237,0.28)',
  halo: 'rgba(255,84,104,0.16)',
  haloStrong: 'rgba(255,84,104,0.26)',
  // Deux crans au-dessus du papier de nuit : c'est ce qui remplace l'ombre.
  surface: '#26221D',
  surfaceLine: 'rgba(244,242,237,0.16)',
};

/** Palette du dessin, figée pour la session comme `paper`. */
const M = isPaperDark ? DARK : LIGHT;

// ─── Types ──────────────────────────────────────────────────────────────────

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

interface SenderLike {
  id?: string;
  username?: string;
  full_name?: string;
  avatar?: string | null;
  verified?: boolean;
  verification_style?: string;
  profile_customization?: ProfileCustomization;
}

// ─── Constantes du dessin ───────────────────────────────────────────────────

/**
 * La grille : `46 pt | 12 | reste`. Retrait latéral de 20 pt, retrait vertical
 * de 16 pt d'une ligne à la suivante — le dessin met `padding:16px 20px 0` sur
 * CHAQUE ligne, sans exception ni resserrement par salve.
 */
/**
 * Assez large pour « 00:44 » d'un seul tenant.
 *
 * Les 46 pt du dessin étaient calculés pour une heure en 9,5 ; à 13, la colonne
 * se retrouvait trop étroite d'un cheveu et l'heure se coupait en deux lignes
 * (« 00:4 » / « 3 »), ce qui décalait tout le message en face. La largeur suit
 * donc le corps de l'heure, et le libellé est verrouillé sur une ligne.
 */
const TIME_COL = ps(56);
const GRID_GAP = ps(12);
const PAD_X = ps(20);
const ROW_TOP = ps(16);

const PHOTO_R = ps(14);
const TILE_R = ps(12);

/**
 * Alignement optique de l'heure sur la première ligne du message.
 *
 * Un `paddingTop` unique ne peut pas marcher : le texte du papier commence à sa
 * hauteur de capitale, le texte d'un bloc commence après le rembourrage du
 * bloc, une photo commence à son bord. Ces quatre valeurs suivent le corps du
 * texte — si celui-ci bouge, elles bougent avec.
 */
const TIME_TOP_TEXT = ps(8);
const TIME_TOP_MEDIA = ps(2);

/**
 * L'onde, un seul gabarit — capturée, stockée ET dessinée avec ce nombre de
 * barres. Le vocal reçu, le vocal envoyé et l'enregistrement en cours ont donc
 * tous la même : ce qu'on voit en parlant est exactement ce qui part. Les
 * vocaux d'avant (27 barres) sont ré-échantillonnés au rendu, pas migrés.
 */
const WAVEFORM_BAR_COUNT = 44;
const WAVE_H = ps(44);
const REC_WAVE_H = ps(56);
const BAR_MIN = ps(4);
const BAR_SPAN = WAVE_H - BAR_MIN;
const REC_BAR_SPAN = REC_WAVE_H - BAR_MIN;

/**
 * Glissé « annuler » du message vocal. Deux seuils, et pas un seul : le libellé
 * passe à l'accent AVANT le point de non-retour, si bien qu'on voit qu'on va
 * annuler avant de l'avoir fait.
 */
const CANCEL_ARM_DISTANCE = -70;
const CANCEL_SEND_DISTANCE = -90;
/**
 * Remonter pour verrouiller : le pouce quitte l'écran, l'enregistrement
 * continue. Plus loin que le seuil d'annulation — on remonte peu par accident
 * en glissant vers la gauche, et l'écran a de la place vers le haut.
 */
const LOCK_ARM_DISTANCE = -84;
/** Amorti sans dépassement : le micro grossit et se pose, il ne rebondit pas. */
const MIC_SPRING = { damping: 24, stiffness: 260, mass: 1 } as const;
/** Le plafond que le panneau annonce sous l'onde. Au-delà : on arrête, on envoie. */
const MAX_RECORDING_MS = 120000;
/** Au-delà de 15 min entre deux messages, un séparateur de jour s'insère. */
const TIME_SEPARATOR_GAP_MS = 15 * 60 * 1000;
/**
 * Deux photos plus éloignées que ça ne forment pas la paire du dessin : ce sont
 * deux envois, pas un envoi de deux images.
 */
const PHOTO_PAIR_GAP_MS = 60 * 1000;
const PHOTO_SELECTION_LIMIT = 4;

/**
 * Raccourcis de la barre d'appui long. Le serveur n'impose plus de liste : il
 * valide la FORME de l'emoji, donc le sélecteur complet accepte n'importe lequel.
 */
const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👍'];

/**
 * Géométrie de la barre de réactions.
 *
 * La largeur était figée à 232 px alors que le contenu en demandait ~254 : six
 * emojis de 26 px (un glyphe emoji est plus large que sa taille de police) plus
 * leurs marges. Elle se calcule donc à partir des mêmes constantes que le rendu.
 */
const REACTION_EMOJI_SIZE = 26;
const REACTION_ITEM_WIDTH = 40;
const REACTION_BAR_PADDING = 8;
const REACTION_BAR_ITEMS = QUICK_REACTIONS.length + 1;
const REACTION_BAR_WIDTH = REACTION_BAR_ITEMS * REACTION_ITEM_WIDTH + REACTION_BAR_PADDING * 2;

/**
 * Nombre de messages chargés à l'ouverture.
 *
 * La route serveur plafonne DÉJÀ à 30 par défaut : l'historique entier n'est
 * jamais téléchargé. Le dire ici accorde le `limit` de la requête et
 * l'`initialNumToRender` de la liste — désaccordés, la hauteur mesurée au
 * premier rendu ne valait qu'un tiers de la vraie, et l'écran PARCOURAIT
 * l'historique par à-coups au lieu de s'ouvrir dessus.
 */
const MESSAGE_PAGE_SIZE = 30;

/**
 * Vitesses de lecture d'un vocal, dans l'ordre où la pastille les fait défiler.
 * Trois et pas plus : au-delà de 2× une voix n'est plus une voix, et une
 * pastille qu'il faut appuyer cinq fois n'est plus un raccourci.
 */
const PLAYBACK_RATES = [1, 1.5, 2] as const;
const RATE_LABELS = ['1×', '1,5×', '2×'] as const;

/** Contenus posés par l'envoi optimiste : ce ne sont pas des légendes. */
const PLACEHOLDER_CONTENTS = new Set(['📷 Photo', '🎤 Message vocal']);

/**
 * Ce que l'enregistreur pousse vers le panneau, SANS passer par un rendu de
 * l'écran. Voir `recorderChannelRef`.
 */
interface RecorderTick {
  durationMs: number;
  bars: number[];
}

interface RecorderChannel {
  onTick: ((tick: RecorderTick) => void) | null;
  onCancelArmed: ((armed: boolean) => void) | null;
}

// ─── Normalisation des données du serveur ───────────────────────────────────

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

/** L'émetteur, quel que soit le champ que le serveur a rempli. */
function messageSenderId(msg?: MessageItem | null): string {
  return String(msg?.sender_id || msg?.sender?.id || '');
}

function messageTs(msg?: MessageItem | null): number {
  return new Date(msg?.created_at || msg?.createdAt || 0).getTime();
}

function isPhotoMessage(msg?: MessageItem | null): boolean {
  return msg?.metadata?.attachment_type === 'image' && !!msg?.metadata?.attachment_url;
}

/** La légende sous une photo, quand il y en a une vraie. */
function photoCaption(msg: MessageItem): string {
  const content = (msg.content || '').trim();
  if (!content || PLACEHOLDER_CONTENTS.has(content)) return '';
  return content;
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

/** Séparateur de jour : « Aujourd'hui 14:32 », « Hier », « 12 mars ». */
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
  if (dayDiff <= 0) return "Aujourd'hui";
  if (dayDiff === 1) return 'Hier';
  if (dayDiff < 7) return date.toLocaleDateString('fr-FR', { weekday: 'long' });
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

// ─── Audio ──────────────────────────────────────────────────────────────────

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

/** dBFS (typiquement -160..0) → amplitude normalisée 0..1, silence à -50 dB. */
function normalizeMetering(db?: number) {
  if (typeof db !== 'number' || !Number.isFinite(db)) return 0.05;
  const floor = -50;
  const clamped = Math.max(floor, Math.min(0, db));
  return (clamped - floor) / -floor;
}

/** Onde déterministe (pas de vraie amplitude) pour les vieux messages vocaux. */
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

/** Ramène un flux d'échantillons de métrage à `barCount` valeurs, par moyenne. */
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
 * Ramène une onde à `count` barres, qu'elle en ait plus OU moins.
 *
 * `downsampleWaveform` ne sait que réduire, et par moyenne de seaux : lui
 * demander d'étirer 27 échantillons sur 44 barres reviendrait à en recopier
 * certains, ce qui se voit — l'onde monte en escalier au lieu de monter.
 */
function resampleWaveform(values: number[], count: number): number[] {
  if (!values || values.length === 0) return new Array(count).fill(0.12);
  if (values.length === count) return values;
  if (values.length > count) return downsampleWaveform(values, count);
  const span = values.length - 1;
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = span <= 0 || count <= 1 ? 0 : (i / (count - 1)) * span;
    const low = Math.floor(t);
    const high = Math.min(values.length - 1, low + 1);
    out.push(values[low] + (values[high] - values[low]) * (t - low));
  }
  return out;
}

// ─── Petites pièces ─────────────────────────────────────────────────────────

/**
 * Pastille de réaction. L'impulsion est déclenchée par un CHANGEMENT d'emoji ou
 * de compteur, jamais par le montage : une pastille recyclée pendant le
 * défilement reste donc parfaitement immobile.
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

/** Les pastilles de réaction d'UN message. */
function ReactionRow({
  message,
  myId,
  onReact,
  onShowReactors,
}: {
  message: MessageItem;
  myId: string | null;
  onReact: (messageId: string, emoji: string) => void;
  onShowReactors: (messageId: string, emoji: string) => void;
}) {
  const grouped = groupReactions(message.reactions);
  if (grouped.length === 0) return null;
  const messageId = String(message.id);
  return (
    <View style={styles.reactionPillRow}>
      {grouped.map((g) => (
        <ReactionPill
          key={g.emoji}
          emoji={g.emoji}
          count={g.count}
          mine={!!message.reactions?.some(
            (r) => r.emoji === g.emoji && String(r.user_id) === String(myId),
          )}
          onPress={() => onReact(messageId, g.emoji)}
          onLongPress={() => onShowReactors(messageId, g.emoji)}
        />
      ))}
    </View>
  );
}

/**
 * Les trois gestes d'un message — appui simple, double appui, appui long.
 *
 * Extraits en hook parce qu'ils servent à DEUX endroits : la ligne du relevé et
 * un carreau de photo. Depuis que deux photos peuvent tenir sur une même ligne,
 * la seconde n'est plus rendue par la première, et deux copies de cette
 * composition auraient divergé au premier réglage.
 *
 * Tout passe par Gesture Handler : mélanger les touchables du cœur RN avec
 * Gesture Handler sur le même arbre casse le double appui.
 */
function useMessageGestures({
  messageId,
  alreadyHearted,
  onSingleTap,
  onLongPress,
  onReact,
}: {
  messageId: string;
  alreadyHearted: boolean;
  onSingleTap: () => void;
  onLongPress: (messageId: string, x: number, y: number) => void;
  onReact: (messageId: string, emoji: string) => void;
}) {
  const pressed = useSharedValue(0);
  const heartPop = useSharedValue(0);

  /**
   * Double appui façon Instagram : pose un cœur, ne l'enlève jamais. Un second
   * double appui sur un message déjà aimé ne rejoue donc rien — même règle que
   * le double appui du fil, pour la même raison : un geste qui peut retirer ce
   * qu'il vient de poser n'est plus sûr à répéter vite.
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
          if (success) runOnJS(onSingleTap)();
        }),
    [pressed, onSingleTap],
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
   * Plus de `Gesture.Race` avec un glissé : celui qui révélait l'heure du
   * message n'a plus d'objet, la gouttière l'affiche en permanence.
   */
  const gesture = useMemo(
    () => Gesture.Exclusive(longPressGesture, Gesture.Exclusive(doubleTapGesture, singleTapGesture)),
    [longPressGesture, doubleTapGesture, singleTapGesture],
  );

  const pressedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pressed.value, [0, 1], [1, 0.92]),
  }));

  const heartPopStyle = useAnimatedStyle(() => ({
    opacity: interpolate(heartPop.value, [0, 0.12, 0.7, 1], [0, 1, 0.9, 0], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(heartPop.value, [0, 0.35, 1], [0.4, 1.18, 0.95], Extrapolation.CLAMP) },
    ],
  }));

  return { gesture, pressedStyle, heartPopStyle };
}

/**
 * Message vocal — l'objet principal de la conversation, pas une pièce jointe.
 *
 * L'onde pleine largeur, puis une rangée de commandes en dessous : bouton de
 * lecture, durée en gros chiffres, pastille de vitesse, et à droite le mot
 * d'action, souligné d'un filet d'accent.
 *
 * **Le même dessin des deux côtés.** Mes vocaux sont rendus exactement comme
 * ceux que je reçois : même bouton d'encre, mêmes barres, même pastille de
 * vitesse. Ce qui dit qui parle est la POSITION (gouttière à gauche ou à
 * droite), rien d'autre — l'accusé de lecture, lui, se pose sous le dernier
 * message envoyé, pas dans le lecteur.
 *
 * ── Pourquoi le geste vient du parent ─────────────────────────────────────
 * `waveGesture` est la composition de gestes du message (appui = lire, double
 * appui = cœur, appui long = réactions), construite par `MessageEntry` et posée
 * ICI autour de la seule onde. Deux raisons : l'onde est la grande cible, et la
 * rangée de commandes contient de VRAIS boutons — un `TouchableOpacity` sous un
 * `GestureDetector` du parent verrait les deux se déclencher sur le même appui,
 * et changer la vitesse mettrait la lecture en pause du même coup.
 */
function VoiceBlock({
  uri,
  durationMs,
  waveform,
  waveGesture,
  waveStyle,
  registerToggle,
}: {
  uri: string;
  durationMs?: number;
  waveform?: number[];
  waveGesture: ComposedGesture;
  waveStyle: StyleProp<ViewStyle>;
  /** Rend la lecture pilotable par l'appui simple du parent. */
  registerToggle: (fn: (() => void) | null) => void;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [totalMs, setTotalMs] = useState(durationMs || 0);
  const [rateIndex, setRateIndex] = useState(0);
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
   * restait bloqué sur « lecture » avec 0 %/0 s, sans moyen de réessayer.
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
    () =>
      waveform && waveform.length > 0
        ? resampleWaveform(waveform, WAVEFORM_BAR_COUNT)
        : pseudoWaveform(uri, WAVEFORM_BAR_COUNT),
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
        // 12 s : largement assez pour un début de flux même en 4G faible.
        // Au-delà, on considère le chargement mort plutôt que de laisser
        // l'utilisateur devant un lecteur figé sans recours.
        loadTimeoutRef.current = setTimeout(() => {
          resetToIdle(true);
        }, 12000);
        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true, volume: 1.0, progressUpdateIntervalMillis: 90 },
          onStatusUpdate,
        );
        soundRef.current = sound;
        // La vitesse est posée APRÈS le chargement, jamais dans le statut
        // initial : passée à `createAsync`, un décodeur qui ne sait pas la
        // tenir fait échouer la création ENTIÈRE, et le vocal devient
        // illisible au lieu de se contenter de jouer à 1×.
        if (PLAYBACK_RATES[rateIndex] !== 1) {
          await sound.setRateAsync(PLAYBACK_RATES[rateIndex], true).catch(() => {});
        }
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
  }, [uri, onStatusUpdate, isLoading, resetToIdle, rateIndex]);

  /**
   * L'appui simple du parent (sur l'onde) doit lire, mais `toggle` vit ici avec
   * le son. Il est donc prêté au parent le temps du montage, plutôt que de
   * remonter tout l'état audio d'un cran.
   */
  useEffect(() => {
    registerToggle(toggle);
    return () => registerToggle(null);
  }, [registerToggle, toggle]);

  const cycleRate = useCallback(() => {
    const next = (rateIndex + 1) % PLAYBACK_RATES.length;
    setRateIndex(next);
    // Applique la vitesse au son DÉJÀ chargé ; s'il ne l'est pas encore, la
    // valeur est reprise à la création (voir `createAsync` plus haut).
    soundRef.current?.setRateAsync(PLAYBACK_RATES[next], true).catch(() => {});
  }, [rateIndex]);

  const progress = totalMs > 0 ? Math.min(1, positionMs / totalMs) : 0;
  const activeBarIndex = Math.round(progress * (WAVEFORM_BAR_COUNT - 1));

  return (
    <View style={styles.voiceBlock}>
      <GestureDetector gesture={waveGesture}>
        <Reanimated.View
          style={[styles.voiceWave, waveStyle]}
          accessible
          accessibilityRole="button"
          accessibilityLabel={`Message vocal, ${formatDuration(totalMs)}`}
          accessibilityHint="Appui pour écouter, appui double pour aimer, appui long pour réagir"
        >
          {bars.map((amplitude, i) => (
            <View
              key={i}
              style={[
                styles.bar,
                // Plancher d'amplitude : des barres toutes plates ne se lisent
                // plus comme un son, elles se lisent comme un pointillé.
                { height: BAR_MIN + amplitude * BAR_SPAN },
                { backgroundColor: i <= activeBarIndex ? M.accent : M.bar },
              ]}
            />
          ))}
        </Reanimated.View>
      </GestureDetector>

      <View style={styles.voiceControls}>
        <TouchableOpacity
          onPress={toggle}
          hitSlop={hitSlop}
          style={styles.voicePlay}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Mettre en pause le message vocal' : 'Écouter le message vocal'}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={M.onInk} />
          ) : (
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={ps(17)}
              color={M.onInk}
              style={!isPlaying ? { marginLeft: ps(2) } : undefined}
            />
          )}
        </TouchableOpacity>

        {/* La position pendant la lecture, la durée sinon — un seul chiffre, à
            une seule taille, comme partout ailleurs dans l'écran. */}
        <Text style={styles.voiceDuration}>
          {formatDuration(positionMs > 0 ? positionMs : totalMs)}
        </Text>

        <TouchableOpacity
          onPress={cycleRate}
          hitSlop={hitSlop}
          style={styles.voiceRate}
          accessibilityRole="button"
          accessibilityLabel={`Vitesse de lecture ${RATE_LABELS[rateIndex]}`}
        >
          <Text style={styles.voiceRateText}>{RATE_LABELS[rateIndex]}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={toggle} hitSlop={hitSlop} style={styles.voiceAction}>
          <Text style={styles.voiceActionText}>{isPlaying ? 'Pause' : 'Lire'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/**
 * Une photo : seule elle prend la largeur de la colonne sur 190 pt, en paire
 * elle prend un carreau de 112. Elle porte ses PROPRES gestes et ses propres
 * réactions — dans une paire, aimer celle de gauche ne doit pas poser un cœur
 * sur celle de droite.
 */
const PhotoTile = memo(function PhotoTile({
  message,
  myId,
  half,
  onOpenImage,
  onLongPress,
  onReact,
  onShowReactors,
}: {
  message: MessageItem;
  myId: string | null;
  half: boolean;
  onOpenImage: (url: string) => void;
  onLongPress: (messageId: string, x: number, y: number) => void;
  onReact: (messageId: string, emoji: string) => void;
  onShowReactors: (messageId: string, emoji: string) => void;
}) {
  const messageId = String(message.id);
  const url = message.metadata?.attachment_url || '';
  const caption = half ? '' : photoCaption(message);
  const alreadyHearted = !!message.reactions?.some(
    (r) => r.emoji === '❤️' && String(r.user_id) === String(myId),
  );

  const handleSingleTap = useCallback(() => {
    if (url) onOpenImage(url);
  }, [url, onOpenImage]);

  const { gesture, pressedStyle, heartPopStyle } = useMessageGestures({
    messageId,
    alreadyHearted,
    onSingleTap: handleSingleTap,
    onLongPress,
    onReact,
  });

  return (
    <View style={half ? styles.photoHalf : styles.photoFull}>
      <View style={styles.photoWrap}>
        <GestureDetector gesture={gesture}>
          <Reanimated.View
            style={pressedStyle}
            accessible
            accessibilityRole="imagebutton"
            accessibilityLabel="Photo"
            accessibilityHint="Appui pour agrandir, appui double pour aimer, appui long pour réagir"
          >
            <Image
              source={{ uri: url }}
              style={half ? styles.photoImageHalf : styles.photoImageFull}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={0}
              recyclingKey={url}
            />
          </Reanimated.View>
        </GestureDetector>
        <Reanimated.View pointerEvents="none" style={[styles.heartPopOverlay, heartPopStyle]}>
          <Ionicons name="heart" size={ps(34)} color={M.accent} />
        </Reanimated.View>
      </View>

      {/* La légende sous la photo, comme « regarde la tête de Pamplemousse ce
          matin » dans le dessin — jamais le contenu de remplacement que pose
          l'envoi optimiste. */}
      {!!caption && <Text style={styles.photoCaption}>{caption}</Text>}

      <ReactionRow
        message={message}
        myId={myId}
        onReact={onReact}
        onShowReactors={onShowReactors}
      />
    </View>
  );
});

/**
 * Renvoi vers la story à laquelle ce message répond.
 *
 * Pas de carte : une vignette et une étiquette en capitales espacées, la voix
 * des métas du dessin. Le libellé dit de quel côté vient la réponse.
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
        {fromMe ? 'Réponse à sa story' : 'A répondu à votre story'}
      </Text>
      <View style={styles.storyReplyPreview}>
        {preview ? (
          <Image source={{ uri: preview }} style={styles.storyReplyMedia} contentFit="cover" cachePolicy="memory-disk" transition={0} recyclingKey={preview} />
        ) : (
          <View style={[styles.storyReplyMedia, styles.storyReplyPlaceholder]}>
            <Ionicons name={isVideo ? 'play' : 'image-outline'} size={ps(24)} color={M.meta} />
          </View>
        )}
        {isVideo && preview && (
          <View style={styles.storyReplyPlay}>
            <Ionicons name="play" size={ps(15)} color="#fff" />
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
 * Qui a réagi — ouverte par un appui long sur une pastille de réaction.
 *
 * Même mécanique de feuille que `EmojiPickerSheet` (fondu du fond porté par le
 * Modal, glissé de la feuille porté à part par Reanimated) : le glissé natif du
 * Modal anime tout son contenu comme un bloc, fond compris, et se voyait
 * remonter depuis le bas comme une ombre.
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
                      <View style={[styles.reactorAvatar, styles.avatarFallback]}>
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

// ─── Une ligne du relevé ────────────────────────────────────────────────────

/**
 * Le message, plus tout ce qui dépend de ses VOISINS — calculé hors du rendu.
 *
 * Le groupage vivait dans `renderItem`, qui devait donc lire `messages[i ± 1]`
 * et changeait d'identité à chaque message reçu : la mémoïsation était annulée
 * par le seul événement qui compte, et le `CellRenderer` de la FlatList
 * re-rendait TOUTES les lignes montées. Une passe `O(n)` sans rendu la remplace.
 */
interface DecoratedMessage {
  msg: MessageItem;
  /**
   * Seconde photo de la paire, quand deux images se suivent dans la salve. Elle
   * n'a PAS d'entrée à elle dans la liste : la paire est une seule ligne du
   * relevé, sous une seule heure — c'est ce que montre le dessin, et c'est aussi
   * ce qui s'est passé (les deux photos partent d'une seule sélection).
   */
  pairedMsg?: MessageItem;
  sender: SenderLike;
  fromMe: boolean;
  isFirstOfGroup: boolean;
  showSeparator: boolean;
}

/**
 * Constante de module, et non un littéral recréé à chaque rendu : c'est une
 * prop identique d'un rendu à l'autre qui permet à `memo` d'épargner les
 * messages dont l'expéditeur n'est pas encore connu.
 */
const NO_SENDER: SenderLike = {};

interface MessageEntryProps {
  entry: DecoratedMessage;
  isGroup: boolean;
  myId: string | null;
  /**
   * Accusé de lecture, posé DANS le bloc du dernier message sortant — plus une
   * rangée d'avatars sous la conversation. Vide partout ailleurs.
   */
  seenLabel: string;
  /** Une ref, donc une identité stable : lue au rendu, jamais écrite ici. */
  freshIdsRef: React.MutableRefObject<Set<string>>;
  onOpenImage: (url: string) => void;
  onLongPress: (messageId: string, x: number, y: number) => void;
  onReact: (messageId: string, emoji: string) => void;
  onShowReactors: (messageId: string, emoji: string) => void;
}

/**
 * Une ligne : l'heure dans la gouttière, le message en face.
 *
 * Les deux côtés se dessinent PAREIL — même encre, même papier, même lecteur
 * vocal. Ce qui dit qui parle est la position : mes messages s'alignent à
 * droite et leur heure passe dans la gouttière de droite, ceux que je reçois
 * restent à gauche. Un seul signal, et il n'est jamais répété.
 */
const MessageEntry = memo(function MessageEntry({
  entry,
  isGroup,
  myId,
  seenLabel,
  freshIdsRef,
  onOpenImage,
  onLongPress,
  onReact,
  onShowReactors,
}: MessageEntryProps) {
  const { msg: item, pairedMsg, sender, fromMe, isFirstOfGroup, showSeparator } = entry;
  const messageId = String(item.id);

  const senderAvatar = getAvatarUri(sender?.avatar || null);
  const attachmentUrl = item.metadata?.attachment_url;
  const isPhoto = isPhotoMessage(item);
  const isVoice = item.metadata?.attachment_type === 'audio' && !!attachmentUrl;
  const showSenderRow = isGroup && !fromMe && isFirstOfGroup;

  // Lecture pure (aucune mutation ici) : `freshIdsRef` est alimenté à l'arrivée
  // du message, pas au rendu. Fondu-glissé court et SANS ressort : le message se
  // pose, il ne rebondit pas.
  const isFreshMessage = freshIdsRef.current.has(messageId);

  const alreadyHearted = !!item.reactions?.some(
    (r) => r.emoji === '❤️' && String(r.user_id) === String(myId),
  );

  /**
   * Prêté par `VoiceBlock` au montage : l'appui sur l'onde met en lecture, et
   * l'état du son reste chez celui qui le possède.
   */
  const voiceToggleRef = useRef<(() => void) | null>(null);
  const registerVoiceToggle = useCallback((fn: (() => void) | null) => {
    voiceToggleRef.current = fn;
  }, []);

  const handleSingleTap = useCallback(() => {
    voiceToggleRef.current?.();
  }, []);

  const { gesture, pressedStyle, heartPopStyle } = useMessageGestures({
    messageId,
    alreadyHearted,
    onSingleTap: handleSingleTap,
    onLongPress,
    onReact,
  });

  const timeTop = isPhoto || isVoice ? TIME_TOP_MEDIA : TIME_TOP_TEXT;

  const photos = pairedMsg ? (
    <View style={styles.photoPair}>
      <PhotoTile
        message={item}
        myId={myId}
        half
        onOpenImage={onOpenImage}
        onLongPress={onLongPress}
        onReact={onReact}
        onShowReactors={onShowReactors}
      />
      <PhotoTile
        message={pairedMsg}
        myId={myId}
        half
        onOpenImage={onOpenImage}
        onLongPress={onLongPress}
        onReact={onReact}
        onShowReactors={onShowReactors}
      />
    </View>
  ) : (
    <PhotoTile
      message={item}
      myId={myId}
      half={false}
      onOpenImage={onOpenImage}
      onLongPress={onLongPress}
      onReact={onReact}
      onShowReactors={onShowReactors}
    />
  );

  const voice = (
    <VoiceBlock
      uri={attachmentUrl || ''}
      durationMs={item.metadata?.duration_ms}
      waveform={item.metadata?.waveform}
      waveGesture={gesture}
      waveStyle={pressedStyle}
      registerToggle={registerVoiceToggle}
    />
  );

  return (
    <Reanimated.View
      entering={
        isFreshMessage ? FadeInDown.duration(200).easing(Easing.out(Easing.cubic)) : undefined
      }
    >
      {showSeparator && (
        <Text style={styles.separatorText}>
          {formatSeparator(item.created_at || item.createdAt)}
        </Text>
      )}

      {/* En groupe, la salve s'ouvre par son auteur — avatar ET nom du même
          côté, dans la colonne de contenu. L'avatar tenait avant dans la
          gouttière, qui porte désormais l'heure de chaque message. En
          tête-à-tête, l'en-tête de l'écran dit déjà à qui on parle. */}
      {showSenderRow && (
        <View style={styles.senderRow}>
          {senderAvatar ? (
            <Image
              source={{ uri: senderAvatar }}
              style={styles.senderAvatar}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={0}
              recyclingKey={senderAvatar}
            />
          ) : (
            <View style={[styles.senderAvatar, styles.avatarFallback]}>
              <Text style={styles.avatarFallbackText}>
                {String(sender?.username || 'U').slice(0, 1).toUpperCase()}
              </Text>
            </View>
          )}
          <Text
            style={[
              styles.senderName,
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
              size={11}
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

      {/* La grille se MIROITE pour mes messages : le bloc part à droite et
          l'heure passe dans la gouttière de droite, à côté de lui. Garder
          l'heure à gauche l'aurait laissée seule au bout d'une ligne vide, à
          quarante points du message qu'elle date. */}
      <View
        style={[
          styles.row,
          fromMe && styles.rowMine,
          showSenderRow && styles.rowAfterSender,
        ]}
      >
        <Text
          style={[styles.rowTime, fromMe && styles.rowTimeMine, { paddingTop: timeTop }]}
          numberOfLines={1}
        >
          {formatTime(item.created_at || item.createdAt)}
        </Text>

        <View style={[styles.rowBody, fromMe && styles.rowBodyMine]}>
          <StoryReplyReference message={item} fromMe={fromMe} />

          {isPhoto ? (
            photos
          ) : isVoice ? (
            <View style={[styles.holder, fromMe && styles.holderMine]}>
              {voice}
              <Reanimated.View pointerEvents="none" style={[styles.heartPopOverlay, heartPopStyle]}>
                <Ionicons name="heart" size={ps(38)} color={M.accent} />
              </Reanimated.View>
              <ReactionRow
                message={item}
                myId={myId}
                onReact={onReact}
                onShowReactors={onShowReactors}
              />
            </View>
          ) : (
            <View style={[styles.holder, fromMe && styles.holderMine]}>
              <GestureDetector gesture={gesture}>
                <Reanimated.View
                  style={[styles.textOnPaper, fromMe && styles.textMine, pressedStyle]}
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel={item.content}
                  accessibilityHint="Appui double pour aimer, appui long pour réagir"
                >
                  <Text style={[styles.bodyText, fromMe && styles.bodyTextMine]}>
                    {item.content}
                  </Text>
                </Reanimated.View>
              </GestureDetector>
              <Reanimated.View pointerEvents="none" style={[styles.heartPopOverlay, heartPopStyle]}>
                <Ionicons name="heart" size={ps(38)} color={M.accent} />
              </Reanimated.View>
              <ReactionRow
                message={item}
                myId={myId}
                onReact={onReact}
                onShowReactors={onShowReactors}
              />
            </View>
          )}

          {/* L'accusé de lecture : une ligne sous le dernier message envoyé,
              pas une rangée d'avatars, et surtout pas répété par message. */}
          {fromMe && !!seenLabel && <Text style={styles.seenLabel}>{seenLabel}</Text>}
        </View>
      </View>
    </Reanimated.View>
  );
});

// ─── Le panneau d'enregistrement ────────────────────────────────────────────

/**
 * Le haut du panneau : le voyant, la minuterie et l'onde de ce qu'on est en
 * train de dire.
 *
 * Composant à part, ABONNÉ à un canal plutôt que nourri par des props. C'est ce
 * qui permet à l'écran de ne pas se rendre dix fois par seconde pendant qu'on
 * parle : ici ce rythme est le sujet — quarante-quatre hauteurs de barre et une
 * minuterie — et il ne coûte que ce bloc-là, pas la liste qui dort derrière.
 */
const RecordingHead = memo(function RecordingHead({
  channelRef,
  paused,
}: {
  channelRef: React.MutableRefObject<RecorderChannel>;
  paused: boolean;
}) {
  const [durationMs, setDurationMs] = useState(0);
  const [bars, setBars] = useState<number[]>(() => new Array(WAVEFORM_BAR_COUNT).fill(0.06));

  useEffect(() => {
    const channel = channelRef.current;
    channel.onTick = (tick) => {
      setDurationMs(tick.durationMs);
      setBars(tick.bars);
    };
    return () => {
      channel.onTick = null;
    };
  }, [channelRef]);

  return (
    <View>
      <View style={styles.recHeadRow}>
        <View style={[styles.recDot, paused && styles.recDotPaused]} />
        <Text style={styles.recLabel}>{paused ? 'En pause' : 'Enregistrement'}</Text>
        <Text style={styles.recTimer}>{formatDuration(durationMs)}</Text>
      </View>

      <View style={styles.recWave}>
        {bars.map((amplitude, i) => (
          <View key={i} style={[styles.bar, styles.recBar, { height: BAR_MIN + amplitude * REC_BAR_SPAN }]} />
        ))}
      </View>

      {/* Les deux bouts de l'onde : d'où elle part, et où elle s'arrêtera
          d'elle-même. Le plafond est annoncé AVANT qu'on l'atteigne, sinon
          l'arrêt automatique passe pour une panne. */}
      <View style={styles.recScale}>
        <Text style={styles.recScaleText}>0:00</Text>
        <Text style={styles.recScaleText}>Max {formatDuration(MAX_RECORDING_MS)}</Text>
      </View>
    </View>
  );
});

/**
 * « Glisser pour annuler » : suit le pouce sur le thread UI, et ne passe à
 * l'accent qu'au franchissement du premier seuil, prévenu par le même canal.
 */
const CancelHint = memo(function CancelHint({
  channelRef,
  dragX,
}: {
  channelRef: React.MutableRefObject<RecorderChannel>;
  dragX: SharedValue<number>;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const channel = channelRef.current;
    channel.onCancelArmed = setArmed;
    return () => {
      channel.onCancelArmed = null;
    };
  }, [channelRef]);

  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dragX.value }] as const,
  }));

  return (
    <Reanimated.View style={[styles.recHint, slideStyle]}>
      <Ionicons name="close" size={ps(14)} color={armed ? M.accent : M.panelMeta} />
      <Text style={[styles.recHintText, armed && styles.recHintTextArmed]} numberOfLines={1}>
        Glisser pour annuler
      </Text>
    </Reanimated.View>
  );
});

// ─── L'écran ────────────────────────────────────────────────────────────────

export default function ConversationThreadScreen({ navigation, route }: any) {
  // Réactif (rotation, foldable, split-screen) là où `Dimensions.get` pris
  // ponctuellement servait une valeur figée au rendu d'ouverture.
  const { width: windowWidth } = useWindowDimensions();
  // Le bas de l'écran, pas seulement le haut : `SafeAreaView` ne couvre que
  // `edges={['top']}`, sinon le quai se collerait à la barre d'accueil sur les
  // appareils sans bouton. Le dessin réserve 30 px là où il n'y a pas d'inset.
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
  const [peerStories, setPeerStories] = useState<StoryGroup | null>(null);
  const [storyViewerVisible, setStoryViewerVisible] = useState(false);
  const [attachmentSending, setAttachmentSending] = useState(false);

  /**
   * L'enregistrement a TROIS temps, pas deux.
   *
   * `holding` : le pouce est sur le micro, relâcher envoie, glisser à gauche
   * annule, remonter verrouille. `locked` : le pouce est parti, on enregistre
   * les mains libres, et ce sont les trois commandes du panneau qui décident —
   * la corbeille annule, le bouton rond met en pause, « Envoyer » envoie. Un
   * booléen ne pouvait pas porter le second : c'est lui que le dessin appelle
   * « remonter pour verrouiller ».
   */
  const [recState, setRecState] = useState<'idle' | 'holding' | 'locked'>('idle');
  const [recPaused, setRecPaused] = useState(false);
  const isRecording = recState !== 'idle';

  const [viewerImageUrl, setViewerImageUrl] = useState<string | null>(null);
  const [reactionBarFor, setReactionBarFor] = useState<{ messageId: string; x: number; y: number } | null>(null);
  /** Message pour lequel le sélecteur complet d'emoji est ouvert (bouton « + »). */
  const [emojiPickerFor, setEmojiPickerFor] = useState<string | null>(null);
  /** Message + emoji dont on veut voir qui a réagi (appui long sur une pastille). */
  const [reactorsFor, setReactorsFor] = useState<{ messageId: string; emoji: string } | null>(null);

  const flatListRef = useRef<FlatList>(null);
  /**
   * `scrollToEnd()` vise `contentSize`, qui peut être en retard d'une frame sur
   * la vraie hauteur — le défilement s'arrête alors juste avant le bas, un
   * manque documenté de la méthode plutôt qu'un bug de cet écran.
   * `scrollToOffset` vers une valeur hors d'atteinte est borné par la liste
   * elle-même à sa vraie fin, quelle que soit la fraîcheur de la mesure.
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
   * ── Pourquoi la durée est une ref, et le reste un canal ──────────────────
   *
   * `setRecordingMs` était appelé dix fois par seconde : tout l'écran — sa liste
   * de messages comprise — se rendait à nouveau pendant toute la durée de
   * l'enregistrement, pour une minuterie qui n'affiche que des secondes. Et le
   * panneau a maintenant bien plus à montrer qu'une minuterie : l'onde de ce
   * qu'on est en train de dire, soit quarante-quatre hauteurs par relevé.
   *
   * La durée devient donc une ref (lue à l'arrêt, jamais rendue), et le panneau
   * s'abonne à un canal : lui seul se rend, l'écran ne bouge pas. Même chose
   * pour le franchissement du seuil d'annulation, qui vient du thread UI et n'a
   * besoin d'atteindre que le libellé qui change de couleur.
   */
  const recordingMsRef = useRef(0);
  const recorderChannelRef = useRef<RecorderChannel>({ onTick: null, onCancelArmed: null });
  /** Armé une fois par enregistrement : le plafond ne peut pas envoyer deux fois. */
  const capReachedRef = useRef(false);
  /** Renseigné plus bas ; appelé par le rappel de métrage quand le plafond tombe. */
  const autoStopRef = useRef<() => void>(() => {});
  /**
   * Génération de l'enregistrement en cours.
   *
   * `startRecording` est asynchrone : demande d'autorisation, configuration de
   * la session audio, création de l'enregistreur. Un pouce relevé pendant ce
   * temps-là appelait l'arrêt sur un `recordingRef` encore vide — puis la
   * création se terminait et posait un enregistreur que PLUS PERSONNE n'allait
   * fermer. Micro ouvert en fond, panneau bloqué. Chaque tentative prend donc un
   * numéro, et une création qui arrive après son propre arrêt se referme
   * elle-même.
   */
  const recordingGenRef = useRef(0);

  /**
   * Messages qui viennent tout juste d'arriver (envoi local ou socket) et qui
   * ont donc droit à l'animation d'entrée.
   *
   * La décision est prise ICI, à l'arrivée du message, et surtout PAS pendant le
   * rendu : une ligne de FlatList se re-rend plusieurs fois, et un drapeau
   * calculé au rendu retombait à `undefined` avant que Reanimated n'enregistre
   * l'animation. L'identifiant est retiré après coup pour que le recyclage
   * pendant le défilement ne la rejoue pas.
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
  /** Miroir du verrou côté UI, pour la même raison. */
  const lockedUI = useSharedValue(false);
  /**
   * Le geste a-t-il conclu lui-même ?
   *
   * `onBegin` d'un `Pan` se déclenche au CONTACT, mais `onEnd` seulement si le
   * geste s'est ACTIVÉ. Un appui posé et relevé sans le moindre déplacement
   * peut donc démarrer un enregistrement que rien ne vient terminer : le
   * panneau reste ouvert, le micro reste ouvert, et l'écran est bloqué jusqu'à
   * ce qu'on quitte la conversation. C'est le bug qui rendait les vocaux
   * inutilisables. `onFinalize`, lui, se déclenche TOUJOURS : ce drapeau lui dit
   * s'il doit conclure à la place de `onEnd`.
   */
  const gestureEndedUI = useSharedValue(false);
  /** Le maintien a-t-il vraiment démarré ? Sinon, rien à conclure. */
  const holdActiveUI = useSharedValue(false);

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
        const sid = messageSenderId(m);
        if (!sid || sid === String(currentUid)) return false;
        const ts = messageTs(m);
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
       * qu'une — celle qu'on vient d'ouvrir — et en extraire les participants et
       * l'horodatage de lecture. L'identifiant de la conversation, lui, est
       * connu depuis la navigation.
       *
       * `allSettled` et non `all` : l'annuaire n'est qu'un décor (avatars,
       * accusés de lecture). S'il échoue, les messages doivent quand même
       * s'afficher — même arbitrage que sur le fil d'accueil.
       *
       * Le vrai correctif reste côté serveur : joindre les participants à la
       * réponse des messages, ou ouvrir `GET /api/messages/conversations/:id`.
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

  // Anneau de story sur l'avatar de l'en-tête, comme dans Instagram Direct.
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
   * Remonter au clavier — sans ça, le clavier recouvre la fin de la conversation
   * sans que rien ne compense : la vue garde le même décalage de défilement
   * pendant que la zone visible rétrécit.
   *
   * Inconditionnel (pas de garde `isAtBottomRef`) : ouvrir le clavier, c'est
   * l'intention de répondre à ce qui se dit MAINTENANT.
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
      const senderId = messageSenderId(incoming);
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
      // Pas de `markMessageAsFresh` ici : ce message est le mien, j'ai déjà les
      // yeux dessus. Le marquer « frais » jouait `FadeInDown` (200 ms) EN MÊME
      // TEMPS que le défilement automatique vers le bas — deux animations non
      // coordonnées sur la même rangée.
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

  // ─── Réactions ────────────────────────────────────────────────────────────

  const applyReactionsLocally = useCallback((messageId: string, reactions: MessageReactionItem[]) => {
    setMessages((prev) => prev.map((m) => (String(m.id) === messageId ? { ...m, reactions } : m)));
  }, []);

  /**
   * Pose ou retire ma réaction (un seul emoji par personne : recliquer le même
   * le retire, en choisir un autre remplace le précédent). Mise à jour optimiste
   * immédiate, puis réconciliée par la réponse HTTP — le socket
   * `message:reaction` fera de même pour les autres participants.
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
        // Le socket (ou le prochain chargement) réconciliera l'état.
      }
    },
    [messages, myId, applyReactionsLocally],
  );

  // ─── Pièces jointes (photo / message vocal) ──────────────────────────────

  const sendAttachment = useCallback(
    async (uri: string, kind: 'image' | 'audio', durationMs?: number, waveform?: number[]) => {
      setAttachmentSending(true);
      const optimisticId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
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
    [conversationId, myId],
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
      // Plusieurs photos d'un coup : sans ça, la paire côte à côte du dessin
      // n'aurait jamais eu l'occasion de se produire, puisqu'il fallait rouvrir
      // la galerie entre chaque envoi.
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: PHOTO_SELECTION_LIMIT,
        quality: 0.85,
      });
      if (result.canceled) return;
      const assets = (result.assets || []).filter((a) => !!a?.uri);
      if (assets.length === 0) return;
      // En série, pas en parallèle : l'ordre d'arrivée côté serveur est celui de
      // la sélection, et c'est cet ordre qui décide de la paire au rendu.
      for (const asset of assets) {
        await sendAttachment(asset.uri, 'image');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Sélection impossible');
    }
  }, [sendAttachment]);

  // ─── Enregistrement ──────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    const gen = recordingGenRef.current + 1;
    recordingGenRef.current = gen;
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        setRecState('idle');
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
      // PAS de `Keyboard.dismiss()` ici, même si le panneau serait plus au
      // large sans clavier : le fermer déplace tout le quai vers le bas — donc
      // le micro — PENDANT que le doigt est encore posé dessus. Gesture Handler
      // perd alors la vue qu'il suivait, et l'enregistrement meurt à la
      // première image. Le clavier n'est de toute façon ouvert que dans un cas
      // de bord (du texte saisi puis effacé sans le refermer).
      waveformSamplesRef.current = [];
      recordingMsRef.current = 0;
      capReachedRef.current = false;
      const { recording } = await Audio.Recording.createAsync(
        { ...Audio.RecordingOptionsPresets.HIGH_QUALITY, isMeteringEnabled: true },
        (status) => {
          if (status.isRecording) waveformSamplesRef.current.push(normalizeMetering(status.metering));
          if (typeof status.durationMillis === 'number') recordingMsRef.current = status.durationMillis;
          // L'onde du panneau est le ré-échantillonnage de TOUT ce qui a été dit
          // jusqu'ici : elle se resserre à mesure que ça dure, et ce qu'on voit
          // en parlant est exactement l'onde qui partira.
          recorderChannelRef.current.onTick?.({
            durationMs: recordingMsRef.current,
            bars: resampleWaveform(waveformSamplesRef.current, WAVEFORM_BAR_COUNT),
          });
          if (!capReachedRef.current && recordingMsRef.current >= MAX_RECORDING_MS) {
            capReachedRef.current = true;
            autoStopRef.current();
          }
        },
        100,
      );

      // Le pouce s'est relevé pendant qu'on créait l'enregistreur : il ne doit
      // surtout pas rester ouvert derrière nous (voir `recordingGenRef`).
      if (gen !== recordingGenRef.current) {
        await recording.stopAndUnloadAsync().catch(() => {});
        await ensurePlaybackAudioMode();
        return;
      }

      recordingRef.current = recording;
      setRecPaused(false);
      setRecState('holding');
    } catch (error) {
      recordingRef.current = null;
      setRecState('idle');
      await ensurePlaybackAudioMode();
      toast.error(error instanceof Error ? error.message : 'Impossible de démarrer l\'enregistrement');
    }
  }, []);

  const stopRecordingInternal = useCallback(async () => {
    // Invalide la création éventuellement encore en vol (voir `recordingGenRef`).
    recordingGenRef.current += 1;
    const recording = recordingRef.current;
    recordingRef.current = null;
    setRecState('idle');
    setRecPaused(false);
    lockedUI.value = false;

    if (!recording) {
      await ensurePlaybackAudioMode();
      return null;
    }

    let uri: string | null = null;
    try {
      await recording.stopAndUnloadAsync();
      uri = recording.getURI();
    } catch {
      // Le système a pu couper l'enregistreur avant nous (appel entrant, perte
      // de la session audio). Le fichier est écrit au fil de l'eau : on tente
      // quand même d'en récupérer le chemin plutôt que de tout jeter.
      try {
        uri = recording.getURI();
      } catch {
        uri = null;
      }
    }

    // APRÈS l'arrêt, jamais avant. Repasser la session iOS en lecture
    // (`allowsRecordingIOS: false`) pendant qu'un enregistrement tourne encore
    // l'interrompt de force : `stopAndUnloadAsync` échoue alors, on repart sans
    // fichier, et le vocal disparaît sans un mot. C'était l'ordre d'origine, et
    // il était faux.
    await ensurePlaybackAudioMode();

    if (!uri) return null;
    return { uri, waveform: resampleWaveform(waveformSamplesRef.current, WAVEFORM_BAR_COUNT) };
  }, [lockedUI]);

  const cancelRecording = useCallback(async () => {
    await stopRecordingInternal();
    recordingMsRef.current = 0;
  }, [stopRecordingInternal]);

  const stopAndSendRecording = useCallback(async () => {
    // La durée est lue AVANT l'arrêt, et c'est essentiel : expo-av délivre un
    // dernier statut APRÈS `stopAndUnloadAsync`, dans lequel `durationMillis`
    // retombe à zéro. La lire après faisait échouer le seuil des 800 ms sur
    // TOUS les vocaux — correctement enregistrés, puis jetés en silence.
    const durationMs = recordingMsRef.current;
    const result = await stopRecordingInternal();
    recordingMsRef.current = 0;

    if (!result) {
      // Un relâchement quasi immédiat n'a rien enregistré du tout : inutile de
      // s'en plaindre. Au-delà du seuil, en revanche, on a perdu quelque chose
      // et il faut le dire plutôt que de ne rien faire.
      if (durationMs >= 800) {
        toast.error('Enregistrement perdu', { description: 'Réessaie.' });
      }
      return;
    }

    if (durationMs < 800) {
      toast.info('Trop court', { description: 'Maintiens le micro un peu plus longtemps.' });
      return;
    }

    await sendAttachment(result.uri, 'audio', durationMs, result.waveform);
  }, [stopRecordingInternal, sendAttachment]);

  /**
   * Le plafond de deux minutes arrête ET envoie, dans les deux temps de
   * l'enregistrement : c'est ce que le « Max 2:00 » écrit sous l'onde promet.
   * Passe par une ref parce que le rappel de métrage est posé une seule fois, à
   * la création de l'enregistreur.
   */
  useEffect(() => {
    autoStopRef.current = () => {
      stopAndSendRecording();
    };
  }, [stopAndSendRecording]);

  /**
   * Pause et reprise — la commande du bouton rond une fois les mains libres.
   * Elle n'existe QUE là : pendant le maintien, ce bouton est sous le pouce.
   */
  const togglePause = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) return;
    try {
      if (recPaused) {
        await recording.startAsync();
        setRecPaused(false);
      } else {
        await recording.pauseAsync();
        setRecPaused(true);
      }
    } catch {
      // Pause non supportée sur cet appareil : on continue d'enregistrer, ce qui
      // est le comportement le moins destructeur.
    }
  }, [recPaused]);

  useEffect(() => {
    ensurePlaybackAudioMode();
    return () => {
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
    };
  }, []);

  // Le geste ci-dessous n'est construit qu'une fois : sans cette ref « toujours à
  // jour », ses rappels fermeraient sur les toutes premières versions de
  // start/stop/cancel au lieu des dernières.
  const recordingActionsRef = useRef({ startRecording, stopAndSendRecording, cancelRecording });
  useEffect(() => {
    recordingActionsRef.current = { startRecording, stopAndSendRecording, cancelRecording };
  });

  const startRec = useCallback(() => recordingActionsRef.current.startRecording(), []);
  const cancelRec = useCallback(() => recordingActionsRef.current.cancelRecording(), []);
  const sendRec = useCallback(() => recordingActionsRef.current.stopAndSendRecording(), []);
  const lockRec = useCallback(() => setRecState('locked'), []);
  /** Le seuil franchi ne va qu'au panneau : l'écran n'a pas à se rendre pour ça. */
  const armCancel = useCallback((armed: boolean) => {
    recorderChannelRef.current.onCancelArmed?.(armed);
  }, []);

  /**
   * ── Maintenir pour parler ─────────────────────────────────────────────────
   *
   * DEUX gestes simultanés, et non un `Pan` seul. C'est la correction du bug qui
   * rendait les vocaux inutilisables.
   *
   * Un `Pan` ne se déclenche vraiment (`onEnd`) que s'il s'est ACTIVÉ, et il ne
   * s'active qu'au premier déplacement du doigt — `minDistance(0)` ne change
   * rien à ça, il ne fait qu'abaisser le seuil de distance. Un pouce posé et
   * relevé sans bouger d'un pixel, ce qui est EXACTEMENT le geste d'un message
   * vocal court, ouvrait donc le micro depuis `onBegin` sans que rien ne vienne
   * jamais le refermer : panneau bloqué, micro ouvert, écran mort.
   *
   * `LongPress` n'a pas ce défaut : il s'active au bout de sa durée, sans
   * dépendre du moindre mouvement, et son `onEnd` tombe au relâchement. Son
   * `maxDistance` par défaut vaut 10 px et l'annulerait dès qu'on glisse — il
   * est donc ouvert en grand, puisque glisser fait partie du geste. Le `Pan`
   * qui l'accompagne ne sert plus qu'à MESURER ce glissé.
   *
   * Effet de bord bienvenu des 180 ms : un simple tapotement sur le micro
   * n'enregistre plus un vocal vide d'un dixième de seconde.
   */
  const micGesture = useMemo(() => {
    const hold = Gesture.LongPress()
      .minDuration(180)
      // Glisser fait partie du geste (annuler, verrouiller) : il ne doit
      // surtout pas l'annuler. Le défaut est de 10 px.
      .maxDistance(10000)
      .shouldCancelWhenOutside(false)
      .onStart(() => {
        holdActiveUI.value = true;
        gestureEndedUI.value = false;
        lockedUI.value = false;
        cancelArmedUI.value = false;
        recordingDragX.value = 0;
        micScale.value = withSpring(1.25, MIC_SPRING);
        runOnJS(startRec)();
      })
      .onEnd((_event, success) => {
        if (!holdActiveUI.value || lockedUI.value) return;
        gestureEndedUI.value = true;
        // Au-delà du second seuil, ou geste interrompu par le système : on
        // n'envoie surtout pas un message que personne n'a relâché.
        const shouldCancel = !success || recordingDragX.value < CANCEL_SEND_DISTANCE;
        if (shouldCancel) runOnJS(cancelRec)();
        else runOnJS(sendRec)();
      })
      .onFinalize(() => {
        micScale.value = withSpring(1, MIC_SPRING);
        recordingDragX.value = 0;
        if (!holdActiveUI.value) return;
        holdActiveUI.value = false;
        // Le verrou DÉMONTE le micro (il devient le bouton de pause) : Gesture
        // Handler finalise donc le geste au moment même où l'on verrouille.
        // Sans cette sortie, l'enregistrement mains libres s'arrêterait dans la
        // seconde qui suit.
        if (lockedUI.value) return;
        cancelArmedUI.value = false;
        runOnJS(armCancel)(false);
        // Dernier filet : `onEnd` n'a pas conclu (annulation système, vue
        // démontée). C'est ici que cet enregistrement-là se termine, sinon le
        // micro reste ouvert derrière nous.
        if (!gestureEndedUI.value) {
          gestureEndedUI.value = true;
          runOnJS(cancelRec)();
        }
      });

    const drag = Gesture.Pan()
      .minDistance(0)
      .shouldCancelWhenOutside(false)
      .onUpdate((event) => {
        // Rien tant que le maintien n'a pas pris, et plus rien une fois
        // verrouillé : le pouce peut alors avoir quitté l'écran.
        if (!holdActiveUI.value || lockedUI.value) return;

        // Vers la droite et vers le bas, il n'y a rien à faire : les deux
        // gestes vont vers la gauche (annuler) et vers le haut (verrouiller).
        const dx = Math.min(0, event.translationX);
        const dy = Math.min(0, event.translationY);

        // UN seul axe décide, celui qui domine : sans ça, un glissé en
        // diagonale armerait l'annulation ET le verrou, et on ne saurait plus
        // lequel des deux on est en train de faire.
        if (dy < LOCK_ARM_DISTANCE && -dy > -dx) {
          lockedUI.value = true;
          recordingDragX.value = 0;
          cancelArmedUI.value = false;
          runOnJS(armCancel)(false);
          runOnJS(lockRec)();
          return;
        }

        const next = -dx > -dy ? dx : 0;
        recordingDragX.value = next;

        const armed = next < CANCEL_ARM_DISTANCE;
        if (armed !== cancelArmedUI.value) {
          cancelArmedUI.value = armed;
          runOnJS(armCancel)(armed);
        }
      });

    return Gesture.Simultaneous(hold, drag);
  }, [
    micScale,
    recordingDragX,
    cancelArmedUI,
    lockedUI,
    gestureEndedUI,
    holdActiveUI,
    startRec,
    cancelRec,
    sendRec,
    lockRec,
    armCancel,
  ]);

  const micStyle = useAnimatedStyle(() => ({
    transform: [{ scale: micScale.value }] as const,
  }));

  /**
   * Pendant l'enregistrement, la conversation s'efface derrière le panneau : le
   * dessin met l'en-tête à 35 % et les messages à 28 %. Fondu de 160 ms —
   * l'écran change d'état, il ne clignote pas.
   */
  const dim = useSharedValue(0);
  useEffect(() => {
    dim.value = withTiming(isRecording ? 1 : 0, {
      duration: 160,
      easing: Easing.out(Easing.cubic),
    });
  }, [isRecording, dim]);

  const headerDimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dim.value, [0, 1], [1, 0.35]),
  }));
  const listDimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dim.value, [0, 1], [1, 0.28]),
  }));

  // ─── Visualiseur d'image ─────────────────────────────────────────────────

  const closeImageViewer = useCallback(() => {
    setViewerImageUrl(null);
  }, []);

  const openImageViewer = useCallback((url: string) => {
    viewerTranslateY.value = 0;
    viewerImageScale.value = 1;
    setViewerImageUrl(url);
  }, [viewerImageScale, viewerTranslateY]);

  /**
   * Glisser l'image vers le bas pour fermer. Passe par
   * `react-native-gesture-handler` + Reanimated (thread UI) plutôt que
   * `PanResponder` : c'est ce dernier qui ne captait pas fiablement le geste une
   * fois affiché dans un `Modal` — connu côté RN, notamment sur Android.
   */
  const viewerPanGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(4)
        .onUpdate((e) => {
          if (e.translationY < 0) return;
          viewerTranslateY.value = e.translationY;
          viewerImageScale.value = interpolate(
            e.translationY,
            [0, 320],
            [1, 0.82],
            Extrapolation.CLAMP,
          );
        })
        .onEnd((e) => {
          if (e.translationY > 120 || e.velocityY > 800) {
            runOnJS(closeImageViewer)();
            return;
          }
          // damping ≈ 2·√stiffness : amortissement critique, l'image revient en
          // place d'un seul mouvement, sans dépassement ni oscillation.
          viewerTranslateY.value = withSpring(0, { damping: 28, stiffness: 180 });
          viewerImageScale.value = withSpring(1, { damping: 28, stiffness: 180 });
        }),
    [closeImageViewer, viewerImageScale, viewerTranslateY],
  );

  // ─── Indicateur de frappe (émission) ─────────────────────────────────────

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

  // ─── Accusés de lecture ──────────────────────────────────────────────────

  const seenReaders = useMemo(() => {
    if (!myId || messages.length === 0) return [] as [string, string][];
    const lastMine = [...messages].reverse().find((m) => messageSenderId(m) === String(myId));
    if (!lastMine) return [];
    const lastMineTs = messageTs(lastMine);
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
    const lastMine = [...messages].reverse().find((m) => messageSenderId(m) === String(myId));
    return lastMine?.id ? String(lastMine.id) : null;
  }, [messages, myId]);

  // ─── Navigation ──────────────────────────────────────────────────────────

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

  // ─── Rendu d'un message ──────────────────────────────────────────────────

  /**
   * Descente automatique en bas du fil.
   *
   * Plus de `setTimeout` armé à chaque changement de taille du contenu (frappe
   * comprise), et on ne force plus la descente si le lecteur a remonté la
   * conversation — ce qui la lui arrachait des mains à chaque message reçu.
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

  const decorated = useMemo<DecoratedMessage[]>(() => {
    const out: DecoratedMessage[] = [];
    for (let index = 0; index < messages.length; index += 1) {
      const msg = messages[index];
      const senderId = messageSenderId(msg);
      const prevMsg = index > 0 ? messages[index - 1] : null;

      // Deux photos qui se suivent, du même émetteur, à moins d'une minute :
      // elles viennent d'une seule sélection et prennent une seule ligne du
      // relevé, sous une seule heure. Jamais trois — au-delà, chaque photo
      // reprend sa pleine largeur : une grille de vignettes n'est plus une
      // conversation, et le dessin ne montre qu'une paire.
      const candidate = messages[index + 1];
      const paired =
        isPhotoMessage(msg) &&
        isPhotoMessage(candidate) &&
        messageSenderId(candidate) === senderId &&
        Math.abs(messageTs(candidate) - messageTs(msg)) < PHOTO_PAIR_GAP_MS
          ? candidate
          : undefined;

      const currentTs = messageTs(msg);
      const prevTs = messageTs(prevMsg);

      out.push({
        msg,
        pairedMsg: paired,
        // `NO_SENDER` plutôt qu'un `{}` littéral : un objet neuf à chaque passe
        // ferait échouer la comparaison de `memo` sur les messages dont
        // l'expéditeur n'est pas encore connu.
        sender: msg?.sender || participantMap[senderId] || NO_SENDER,
        fromMe: !!(myId && senderId && String(myId) === senderId),
        isFirstOfGroup: messageSenderId(prevMsg) !== senderId,
        showSeparator:
          index === 0 ||
          (Number.isFinite(currentTs) &&
            Number.isFinite(prevTs) &&
            currentTs - prevTs > TIME_SEPARATOR_GAP_MS),
      });

      if (paired) index += 1;
    }
    return out;
  }, [messages, participantMap, myId]);

  /**
   * Poignées stables passées aux lignes mémoïsées. Une prop de rappel recréée à
   * chaque rendu casserait `memo` aussi sûrement qu'une dépendance de trop — et
   * `sendReaction` lit `messages`, donc change d'identité à chaque message reçu.
   * Il passe par une ref : la ligne n'en sait rien.
   */
  const sendReactionRef = useRef(sendReaction);
  useEffect(() => {
    sendReactionRef.current = sendReaction;
  }, [sendReaction]);

  const handleReact = useCallback((messageId: string, emoji: string) => {
    sendReactionRef.current(messageId, emoji);
  }, []);

  const handleLongPress = useCallback((messageId: string, x: number, y: number) => {
    setReactionBarFor({ messageId, x, y });
  }, []);

  const handleShowReactors = useCallback((messageId: string, emoji: string) => {
    setReactorsFor({ messageId, emoji });
  }, []);

  /**
   * Qui a posé CET emoji sur CE message, résolu en identité affichable.
   * `item.reactions` ne porte que `user_id` (+ un `username` pas toujours fourni
   * par le serveur) : on complète par `participantMap`, déjà chargé pour
   * l'en-tête et l'indicateur de frappe, et par mon propre profil.
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
   * Mémoïsé : une closure recréée à chaque rendu invalide la mémoïsation interne
   * de la FlatList, si bien que toutes les lignes montées se re-rendaient à
   * chaque frappe. `messages` n'y figure pas — le groupage est précalculé.
   */
  const renderItem = useCallback(
    ({ item }: { item: DecoratedMessage }) => {
      const messageId = String(item.msg.id);
      const pairedId = item.pairedMsg ? String(item.pairedMsg.id) : null;
      const isLastOutgoing =
        item.fromMe && (lastOutgoingMessageId === messageId || lastOutgoingMessageId === pairedId);
      return (
        <MessageEntry
          entry={item}
          isGroup={isGroup}
          myId={myId}
          seenLabel={isLastOutgoing && hasBeenSeen ? seenLabel : ''}
          freshIdsRef={justArrivedIdsRef}
          onOpenImage={openImageViewer}
          onLongPress={handleLongPress}
          onReact={handleReact}
          onShowReactors={handleShowReactors}
        />
      );
    },
    [
      isGroup,
      myId,
      lastOutgoingMessageId,
      hasBeenSeen,
      seenLabel,
      openImageViewer,
      handleLongPress,
      handleReact,
      handleShowReactors,
    ],
  );

  const typingLabel = useMemo(() => {
    if (typingUsers.length === 0) return '';
    if (!isGroup) return '';
    const first = typingUsers[0]?.username || participantMap[typingUsers[0]?.user_id]?.username || 'Quelqu\'un';
    return typingUsers.length > 1 ? `${first} +${typingUsers.length - 1} écrivent…` : `${first} écrit…`;
  }, [typingUsers, isGroup, participantMap]);

  /**
   * Le bouton rond change de rôle, jamais de place : micro au repos et pendant
   * le maintien, flèche d'envoi quand il y a du texte, pause une fois les mains
   * libres. La géométrie du quai ne bouge pas, c'est son icône et son geste qui
   * changent.
   */
  const roundIsSend = recState === 'idle' && canSend;
  const roundIsPause = recState === 'locked';
  const roundIsMic = !roundIsSend && !roundIsPause;

  // ─── Rendu ───────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      {/* `SafeAreaView` de `react-native-safe-area-context`, PAS celle du cœur de
          React Native : cette dernière ne pose aucun inset sur Android.
          `edges={['top']}` seulement — le bas est tenu par le quai. */}
      <SafeAreaView style={styles.container} edges={['top']}>
        <AppStatusBar />

        {/* ── En-tête : un filet, jamais un aplat, et UNE seule ligne ── */}
        <Reanimated.View
          style={[styles.header, headerDimStyle]}
          pointerEvents={isRecording ? 'none' : 'auto'}
        >
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={hitSlop}>
            <Ionicons name="chevron-back" size={ps(19)} color={M.ink} />
          </TouchableOpacity>

          {/* L'avatar ouvre la story : c'est ce que faisait le bouton appareil
              photo du compositeur, qui n'a donc plus lieu d'être. */}
          <TouchableOpacity onPress={openPeerStory} activeOpacity={0.8}>
            <StoryRing
              size={ps(32)}
              uri={avatarUri}
              label={conversationTitle}
              hasStory={!isGroup && !!peerStories?.stories?.length}
              seen={!peerStories?.has_unseen}
              gapColor={M.bg}
              ringWidth={2}
            />
          </TouchableOpacity>

          <View style={styles.headerNameRow}>
            {isGroup && (
              <Ionicons name="people" size={ps(13)} color={M.meta} style={{ marginRight: ps(5) }} />
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
              <View style={{ marginLeft: ps(5) }}>
                <VerifiedBadge
                  verificationStyle={conversationVerificationStyle as any}
                  size={13}
                  tint={certifiedNameColors(conversationVerificationStyle as any, peerCustomization).from}
                />
              </View>
            )}
          </View>

          {/* Le bouton du dessin, à droite de la barre. Il a une vraie
              destination : le profil, ou les membres en groupe. */}
          <TouchableOpacity onPress={openPeer} hitSlop={hitSlop}>
            <Ionicons name="options-outline" size={ps(19)} color={M.ink} />
          </TouchableOpacity>
        </Reanimated.View>

        {/* ── Corps ── */}
        {loading ? (
          <ScreenSkeleton variant="messages" />
        ) : (
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
          >
            <Reanimated.View
              style={[styles.listHost, listDimStyle]}
              pointerEvents={isRecording ? 'none' : 'auto'}
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
                // hauteur du contenu dès le premier appel.
                initialNumToRender={MESSAGE_PAGE_SIZE}
                maxToRenderPerBatch={10}
                updateCellsBatchingPeriod={50}
                windowSize={11}
                // `removeClippedSubviews` reste à `false` : les lignes ont une
                // hauteur variable et portent des animations d'entrée, et le
                // clipping est connu pour y faire disparaître des vues.
                removeClippedSubviews={false}
              />
            </Reanimated.View>

            {/* « écrit… » : dans la colonne du relevé, à la place qu'occupera le
                message. La gouttière reste vide — il n'y a pas encore d'heure à
                mettre. Trois points sur le papier, sans pastille autour. */}
            {typingUsers.length > 0 && !isRecording && (
              <View style={styles.typingRow}>
                <View style={styles.typingDots}>
                  <Animated.View style={[styles.typingDot, { opacity: dot1 }]} />
                  <Animated.View style={[styles.typingDot, { opacity: dot2 }]} />
                  <Animated.View style={[styles.typingDot, { opacity: dot3 }]} />
                </View>
                {!!typingLabel && (
                  <Text style={styles.typingLabel} numberOfLines={1}>
                    {typingLabel}
                  </Text>
                )}
              </View>
            )}

            {/* Remonter pour verrouiller : sur le chemin du pouce, au-dessus du
                micro. Disparaît une fois verrouillé — l'affordance a servi, la
                répéter serait du bruit. */}
            {recState === 'holding' && (
              <View style={styles.lockColumn} pointerEvents="none">
                <View style={styles.lockCircle}>
                  <Ionicons name="lock-closed-outline" size={ps(17)} color={M.ink} />
                </View>
                <Text style={styles.lockLabel}>Remonter pour verrouiller</Text>
                <Ionicons name="chevron-up" size={ps(15)} color={M.chevron} />
              </View>
            )}

            {/*
              ── Le quai : compositeur au repos, panneau d'enregistrement en
              parlant ──

              UN seul conteneur pour les deux états, et surtout UN SEUL nœud de
              micro, à la même place de l'arbre dans les deux cas. Ce n'est pas
              un choix de mise en forme : le `GestureDetector` du micro porte le
              geste EN COURS. Le démonter pour afficher un panneau à part
              annulerait le maintien à la première image, et l'enregistrement
              s'arrêterait avant d'avoir commencé. C'est la même mécanique qui
              rend le verrou possible — là, on démonte volontairement le micro
              pour le remplacer par la pause, et `onFinalize` sait qu'il ne doit
              rien conclure (voir `micGesture`).
            */}
            <View
              style={[
                styles.dock,
                isRecording && styles.dockRecording,
                { paddingBottom: ps(12) + Math.max(insets.bottom, ps(18)) },
              ]}
            >
              {isRecording && (
                <>
                  <RecordingHead channelRef={recorderChannelRef} paused={recPaused} />

                  {/*
                    Le pied est AU-DESSUS de la rangée du micro, alors que le
                    dessin le met en dessous. C'est le seul écart de mise en
                    page, et il est structurel : tout ce qui se glisse SOUS le
                    bouton le remonte, donc le fait sortir de sous le pouce qui
                    est en train de le maintenir. Gesture Handler perd alors la
                    vue qu'il suivait et l'enregistrement s'interrompt. Le quai
                    grandit vers le haut, jamais vers le bas.
                  */}
                  <View style={styles.recFoot}>
                    <Text style={styles.recFootText}>
                      {recState === 'locked' ? 'Prêt à partir' : 'Relâcher pour envoyer'}
                    </Text>
                    <TouchableOpacity
                      onPress={stopAndSendRecording}
                      disabled={recState !== 'locked'}
                      style={[styles.recSend, recState !== 'locked' && styles.recDimmed]}
                      accessibilityRole="button"
                      accessibilityLabel="Envoyer le message vocal"
                      accessibilityState={{ disabled: recState !== 'locked' }}
                    >
                      <Text style={styles.recSendText}>Envoyer</Text>
                      <Ionicons name="arrow-up" size={ps(15)} color={M.panel} />
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {/*
                LA MÊME RANGÉE dans les deux états, et surtout la même hauteur :
                le bouton rond ne change ni de taille ni de place quand le
                panneau s'ouvre. Sa croissance visible pendant le maintien passe
                par `transform: scale` (voir `micStyle`), qui ne touche pas à la
                mise en page.
              */}
              <View style={styles.composerRow}>
                {isRecording ? (
                  <>
                    {/* Vraie cible une fois les mains libres. Pendant le
                        maintien, le pouce est sur le micro et ne peut pas
                        l'atteindre : un bouton hors de portée s'affiche comme
                        tel plutôt que de mentir. */}
                    <TouchableOpacity
                      onPress={cancelRecording}
                      disabled={recState !== 'locked'}
                      hitSlop={hitSlop}
                      style={[styles.recTrash, recState !== 'locked' && styles.recDimmed]}
                      accessibilityRole="button"
                      accessibilityLabel="Annuler le message vocal"
                      accessibilityState={{ disabled: recState !== 'locked' }}
                    >
                      <Ionicons name="trash-outline" size={ps(17)} color={M.onPanel} />
                    </TouchableOpacity>

                    {recState === 'locked' ? (
                      <Text style={styles.recHintText}>Mains libres</Text>
                    ) : (
                      <CancelHint channelRef={recorderChannelRef} dragX={recordingDragX} />
                    )}
                  </>
                ) : (
                  <>
                    <TouchableOpacity
                      onPress={pickAndSendImage}
                      disabled={attachmentSending}
                      hitSlop={hitSlop}
                      accessibilityRole="button"
                      accessibilityLabel="Joindre une photo"
                      accessibilityState={{ disabled: attachmentSending, busy: attachmentSending }}
                    >
                      {attachmentSending ? (
                        <ActivityIndicator size="small" color={M.meta} />
                      ) : (
                        <Ionicons name="image-outline" size={ps(21)} color={M.ink} />
                      )}
                    </TouchableOpacity>

                    <TextInput
                      style={styles.input}
                      value={text}
                      onChangeText={setText}
                      // Le clavier peut déjà être ouvert (on revient d'un autre
                      // champ, ou on avait remonté lire l'historique pendant
                      // qu'il l'était déjà) : dans ce cas `keyboardWillShow` ne
                      // se redéclenche pas, seul le focus le dit.
                      onFocus={() => scrollToBottom()}
                      placeholder="Écrire un message…"
                      placeholderTextColor={M.time}
                      multiline
                      maxLength={1000}
                    />

                    {/* Le mot du geste, pas une icône de plus : c'est la seule
                        chose que le micro ne dit pas de lui-même. */}
                    {!canSend && <Text style={styles.holdHint}>Maintenir</Text>}
                  </>
                )}

                <View style={[styles.micHalo, isRecording && styles.micHaloStrong]}>
                  {roundIsMic ? (
                    <GestureDetector gesture={micGesture}>
                      <Reanimated.View
                        style={[styles.roundBtn, micStyle]}
                        accessibilityRole="button"
                        accessibilityLabel="Maintenir pour enregistrer un message vocal"
                      >
                        <Ionicons name="mic" size={ps(21)} color={M.onAccent} />
                      </Reanimated.View>
                    </GestureDetector>
                  ) : (
                    <TouchableOpacity
                      onPress={roundIsPause ? togglePause : send}
                      style={styles.roundBtn}
                      accessibilityRole="button"
                      accessibilityLabel={
                        roundIsPause
                          ? recPaused
                            ? 'Reprendre l\'enregistrement'
                            : 'Mettre l\'enregistrement en pause'
                          : 'Envoyer le message'
                      }
                    >
                      <Ionicons
                        name={roundIsPause ? (recPaused ? 'mic' : 'pause') : 'arrow-up'}
                        size={ps(21)}
                        color={M.onAccent}
                      />
                    </TouchableOpacity>
                  )}
                </View>
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
                  // c'est lui qui faisait osciller la barre pendant près d'une
                  // seconde.
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

                  {/* « + » : ouvre le sélecteur complet. */}
                  <TouchableOpacity
                    onPress={() => {
                      setEmojiPickerFor(reactionBarFor.messageId);
                      setReactionBarFor(null);
                    }}
                    style={styles.reactionBarItem}
                    accessibilityLabel="Choisir un autre emoji"
                  >
                    <View style={styles.reactionBarMore}>
                      <Ionicons name="add" size={20} color={M.ink} />
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: M.bg },
  container: { flex: 1, backgroundColor: 'transparent' },

  // ── En-tête ──  padding: 8px 20px 12px · gap 11
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ps(11),
    paddingHorizontal: PAD_X,
    paddingTop: ps(8),
    paddingBottom: ps(12),
    borderBottomWidth: 1,
    borderBottomColor: M.hairline,
  },
  headerNameRow: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  headerName: {
    color: M.ink,
    fontSize: ps(21),
    fontFamily: paperFonts.strong,
    letterSpacing: ps(-0.35),
    flexShrink: 1,
  },

  listHost: { flex: 1 },
  listContent: { paddingBottom: ps(8) },

  // ── Séparateur de jour ──
  separatorText: {
    color: M.time,
    fontSize: ps(12),
    letterSpacing: ps(1.7),
    textTransform: 'uppercase',
    fontFamily: paperFonts.mono,
    textAlign: 'center',
    paddingTop: ps(20),
    paddingBottom: ps(2),
  },

  // ── L'ouverture d'une salve, en groupe seulement ──
  senderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ps(6),
    paddingLeft: PAD_X + TIME_COL + GRID_GAP,
    paddingRight: PAD_X,
    paddingTop: ROW_TOP,
  },
  senderAvatar: { width: ps(24), height: ps(24), borderRadius: ps(12) },
  avatarFallback: {
    backgroundColor: M.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: { color: M.ink, fontSize: ps(12), fontFamily: paperFonts.strong },
  senderName: {
    color: M.meta,
    fontSize: ps(15),
    letterSpacing: ps(0.4),
    fontFamily: paperFonts.strong,
    flexShrink: 1,
  },

  // ── La grille ──  46px | 12 | reste · padding 16px 20px 0
  //
  // Miroitée pour mes messages : `row-reverse` place la gouttière d'heure à
  // droite et rend la colonne de contenu au bloc, qui s'y aligne à droite. Les
  // marges, elles, restent PHYSIQUES en `row-reverse` — d'où `rowTimeMine`,
  // qui repasse l'écart de droite à gauche.
  row: { flexDirection: 'row', paddingHorizontal: PAD_X, paddingTop: ROW_TOP },
  rowMine: { flexDirection: 'row-reverse' },
  rowAfterSender: { paddingTop: ps(6) },
  rowTime: {
    width: TIME_COL,
    marginRight: GRID_GAP,
    textAlign: 'right',
    color: M.time,
    fontSize: ps(13),
    lineHeight: ps(16),
    letterSpacing: ps(0.6),
    fontFamily: paperFonts.mono,
  },
  rowTimeMine: { marginRight: 0, marginLeft: GRID_GAP, textAlign: 'left' },
  rowBody: { flex: 1, minWidth: 0 },
  rowBodyMine: { alignItems: 'flex-end' },
  // `alignSelf: 'stretch'` est obligatoire, et c'est subtil : sans lui, sous le
  // `alignItems: 'flex-end'` de `rowBodyMine`, le conteneur se rétrécissait à
  // la largeur de son contenu. Une onde n'a pas de largeur propre — ses barres
  // sont en `flex: 1` — donc MES vocaux sortaient plus étroits que ceux que je
  // reçois, alors qu'ils doivent occuper la même colonne. Le texte, lui,
  // continue de se caler à droite par `textMine`.
  holder: { position: 'relative', alignSelf: 'stretch' },
  // Les pastilles de réaction suivent leur message : à droite quand il l'est.
  holderMine: { alignItems: 'flex-end' },

  // ── Le texte ──
  // Le même papier, la même encre des deux côtés : seule la position change.
  textOnPaper: { alignSelf: 'stretch', paddingRight: ps(6) },
  textMine: { alignSelf: 'flex-end', paddingRight: 0, paddingLeft: ps(6) },
  bodyText: {
    color: M.ink,
    fontSize: ps(24),
    lineHeight: ps(33),
    fontFamily: paperFonts.body,
  },
  // Ce que je dis se range du côté de son heure, jusqu'au fer.
  bodyTextMine: { textAlign: 'right' },

  // L'accusé de lecture : une ligne, sous le dernier message envoyé.
  seenLabel: {
    marginTop: ps(6),
    textAlign: 'right',
    color: M.time,
    fontSize: ps(12),
    letterSpacing: ps(1.1),
    textTransform: 'uppercase',
    fontFamily: paperFonts.mono,
  },

  // ── L'onde, un seul gabarit ──  hauteur 44 · gap 2 · radius 2
  bar: { flex: 1, borderRadius: ps(2) },
  voiceBlock: { alignSelf: 'stretch' },
  voiceWave: { flexDirection: 'row', alignItems: 'flex-end', height: WAVE_H, gap: 2 },
  voiceControls: { flexDirection: 'row', alignItems: 'center', gap: ps(10), marginTop: ps(10) },
  voicePlay: {
    width: ps(40),
    height: ps(40),
    borderRadius: ps(20),
    backgroundColor: M.ink,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  voiceDuration: {
    color: M.ink,
    fontSize: ps(28),
    lineHeight: ps(28),
    letterSpacing: ps(-0.9),
    fontFamily: paperFonts.display,
  },
  voiceRate: {
    borderWidth: 1,
    borderColor: M.pillLine,
    borderRadius: ps(6),
    paddingHorizontal: ps(8),
    paddingVertical: ps(4),
  },
  voiceRateText: {
    color: M.meta,
    fontSize: ps(12.5),
    letterSpacing: ps(1),
    textTransform: 'uppercase',
    fontFamily: paperFonts.mono,
  },
  // Le mot d'action du dessin : encre pleine, souligné d'un filet d'accent.
  voiceAction: {
    marginLeft: 'auto',
    borderBottomWidth: 1,
    borderBottomColor: M.accent,
    paddingBottom: ps(1),
  },
  voiceActionText: {
    color: M.ink,
    fontSize: ps(12.5),
    letterSpacing: ps(0.9),
    textTransform: 'uppercase',
    fontFamily: paperFonts.mono,
  },

  // ── Les photos ──  seule : radius 14, hauteur 190 · paire : radius 12, 112
  photoFull: { alignSelf: 'stretch' },
  photoHalf: { flex: 1, minWidth: 0 },
  photoPair: { flexDirection: 'row', gap: ps(8) },
  // `position: relative` ancre le cœur du double appui ; `overflow: visible`
  // parce que sur Android une vue rogne ses enfants par défaut, et le cœur
  // déborde volontairement du cadre.
  photoWrap: { position: 'relative', overflow: 'visible' },
  photoImageFull: {
    width: '100%',
    height: ps(210),
    borderRadius: PHOTO_R,
    backgroundColor: M.media,
  },
  photoImageHalf: {
    width: '100%',
    height: ps(124),
    borderRadius: TILE_R,
    backgroundColor: M.media,
  },
  photoCaption: {
    color: M.ink,
    fontSize: ps(24),
    lineHeight: ps(33),
    marginTop: ps(9),
    fontFamily: paperFonts.body,
  },

  heartPopOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Renvoi vers une story ──
  storyReply: { marginBottom: ps(6) },
  storyReplyLabel: {
    color: M.meta,
    fontSize: ps(11),
    letterSpacing: ps(1.2),
    textTransform: 'uppercase',
    fontFamily: paperFonts.mono,
    marginBottom: ps(5),
  },
  storyReplyPreview: { width: ps(112) },
  storyReplyMedia: {
    width: ps(112),
    height: ps(150),
    borderRadius: TILE_R,
    backgroundColor: M.media,
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
    color: M.meta,
    fontSize: ps(14),
    lineHeight: ps(19),
    marginTop: ps(5),
    fontFamily: paperFonts.body,
  },

  // ── Réactions ──
  reactionPillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: ps(4), marginTop: ps(6) },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ps(4),
    backgroundColor: M.surface,
    borderWidth: 1,
    borderColor: M.surfaceLine,
    borderRadius: ps(14),
    paddingHorizontal: ps(9),
    paddingVertical: ps(4),
  },
  reactionPillMine: { borderColor: M.accent },
  reactionPillEmoji: { fontSize: ps(16) },
  reactionPillCount: { color: M.meta, fontSize: ps(12.5), fontFamily: paperFonts.mono },

  // Largeur dérivée de son contenu — voir REACTION_BAR_WIDTH.
  reactionBar: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    width: REACTION_BAR_WIDTH,
    paddingHorizontal: REACTION_BAR_PADDING,
    paddingVertical: ps(6),
    borderRadius: ps(24),
    // `M.surface` et non le papier : la barre se pose DEVANT la conversation.
    // En sombre, c'est ce palier qui remplace l'ombre, qui ne s'y voit pas.
    backgroundColor: M.surface,
    borderWidth: 1,
    borderColor: M.surfaceLine,
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
    borderColor: M.surfaceLine,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Qui a réagi ──
  reactorsBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  reactorsSheet: {
    maxHeight: '62%',
    paddingTop: ps(8),
    paddingBottom: ps(28),
    borderTopLeftRadius: ps(20),
    borderTopRightRadius: ps(20),
    backgroundColor: M.surface,
    borderTopWidth: 1,
    borderTopColor: M.surfaceLine,
  },
  reactorsGrabber: {
    alignSelf: 'center',
    width: ps(36),
    height: ps(4),
    borderRadius: ps(2),
    marginBottom: ps(14),
    backgroundColor: M.surfaceLine,
  },
  reactorsTitle: {
    color: M.ink,
    fontSize: ps(19),
    fontFamily: paperFonts.strong,
    paddingHorizontal: PAD_X,
    marginBottom: ps(6),
  },
  reactorsList: { paddingHorizontal: PAD_X, paddingTop: ps(6) },
  reactorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ps(11),
    paddingVertical: ps(9),
  },
  reactorAvatar: { width: ps(42), height: ps(42), borderRadius: ps(21) },
  reactorAvatarText: { color: M.ink, fontSize: ps(17), fontFamily: paperFonts.strong },
  reactorName: { color: M.ink, fontSize: ps(19), fontFamily: paperFonts.body, flexShrink: 1 },
  reactorHandle: { color: M.meta, fontSize: ps(14), fontFamily: paperFonts.mono, marginLeft: 'auto' },

  // ── « écrit… » ──
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ps(10),
    paddingLeft: PAD_X + TIME_COL + GRID_GAP,
    paddingRight: PAD_X,
    paddingBottom: ps(10),
  },
  typingDots: { flexDirection: 'row', alignItems: 'center', gap: ps(5) },
  typingDot: { width: ps(7), height: ps(7), borderRadius: ps(3.5), backgroundColor: M.chevron },
  typingLabel: {
    color: M.meta,
    fontSize: ps(15),
    fontFamily: paperFonts.mono,
    flexShrink: 1,
  },

  // ── Remonter pour verrouiller ──  gap 9 · padding 0 20 16
  lockColumn: {
    alignItems: 'center',
    gap: ps(9),
    paddingHorizontal: PAD_X,
    paddingBottom: ps(16),
  },
  lockCircle: {
    width: ps(40),
    height: ps(40),
    borderRadius: ps(20),
    borderWidth: 1,
    borderColor: M.lockLine,
    backgroundColor: M.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockLabel: {
    color: M.meta,
    fontSize: ps(12),
    letterSpacing: ps(1.3),
    textTransform: 'uppercase',
    fontFamily: paperFonts.mono,
  },

  // ── Le quai ──  composeur : padding 12 20 30 · gap 12
  dock: {
    paddingHorizontal: PAD_X,
    paddingTop: ps(12),
    borderTopWidth: 1,
    borderTopColor: M.hairline,
    backgroundColor: M.bg,
  },
  // Le même quai, devenu panneau : il change de matière et de coins, pas de
  // place — et surtout, il ne se démonte pas (voir le commentaire du rendu).
  dockRecording: {
    backgroundColor: M.panel,
    borderTopWidth: 0,
    borderTopLeftRadius: ps(24),
    borderTopRightRadius: ps(24),
    paddingTop: ps(20),
  },
  // `minHeight` verrouillé : la rangée fait la même hauteur que le contenu de
  // gauche soit un champ de saisie ou une corbeille. C'est ce qui garantit que
  // le bouton rond ne bouge pas d'un pixel quand le panneau s'ouvre sous le
  // pouce — sans quoi Gesture Handler perd la vue qu'il suit.
  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ps(12),
    minHeight: ps(54),
  },
  input: {
    flex: 1,
    color: M.ink,
    fontSize: ps(22),
    lineHeight: ps(30),
    fontFamily: paperFonts.body,
    maxHeight: ps(150),
    paddingVertical: ps(6),
  },
  holdHint: {
    color: M.time,
    fontSize: ps(11.5),
    letterSpacing: ps(0.9),
    textTransform: 'uppercase',
    fontFamily: paperFonts.mono,
  },

  // Le halo du dessin (`box-shadow: 0 0 0 5px` puis `7px`). Un conteneur plutôt
  // qu'une ombre : React Native ne sait pas dessiner une ombre sans décalage ni
  // flou sur Android.
  // Le rembourrage NE CHANGE PAS entre les deux états, seule la couleur monte :
  // toucher au rembourrage déplacerait le bouton qu'on est en train de tenir.
  micHalo: { padding: ps(5), borderRadius: ps(40), backgroundColor: M.halo },
  micHaloStrong: { backgroundColor: M.haloStrong },
  roundBtn: {
    width: ps(44),
    height: ps(44),
    borderRadius: ps(22),
    backgroundColor: M.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Le panneau d'enregistrement ──
  recHeadRow: { flexDirection: 'row', alignItems: 'center', gap: ps(9) },
  recDot: { width: ps(8), height: ps(8), borderRadius: ps(4), backgroundColor: M.accent },
  recDotPaused: { backgroundColor: M.panelScale },
  recLabel: {
    color: M.panelLabel,
    fontSize: ps(12),
    letterSpacing: ps(1.55),
    textTransform: 'uppercase',
    fontFamily: paperFonts.mono,
  },
  recTimer: {
    marginLeft: 'auto',
    color: M.onPanel,
    fontSize: ps(34),
    lineHeight: ps(34),
    letterSpacing: ps(-1.3),
    fontFamily: paperFonts.display,
  },
  recWave: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: REC_WAVE_H,
    gap: 2,
    marginTop: ps(16),
  },
  recBar: { backgroundColor: M.onPanel },
  recScale: { flexDirection: 'row', justifyContent: 'space-between', marginTop: ps(8) },
  recScaleText: {
    color: M.panelScale,
    fontSize: ps(11),
    letterSpacing: ps(1.1),
    textTransform: 'uppercase',
    fontFamily: paperFonts.mono,
  },
  recTrash: {
    width: ps(44),
    height: ps(44),
    borderRadius: ps(22),
    borderWidth: 1,
    borderColor: M.panelOutline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Pendant le maintien, le pouce est sur le micro : ces deux commandes montrent
  // ce que le verrou donnera, sans prétendre qu'on peut les atteindre.
  recDimmed: { opacity: 0.4 },
  recHint: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: ps(8) },
  recHintText: {
    flex: 1,
    color: M.panelMeta,
    fontSize: ps(12),
    letterSpacing: ps(1),
    textTransform: 'uppercase',
    fontFamily: paperFonts.mono,
  },
  recHintTextArmed: { color: M.accent },
  recFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ps(10),
    marginTop: ps(16),
    paddingTop: ps(14),
    paddingBottom: ps(4),
    borderTopWidth: 1,
    borderTopColor: M.panelLine,
  },
  recFootText: {
    flex: 1,
    color: M.panelMeta,
    fontSize: ps(12),
    letterSpacing: ps(1),
    textTransform: 'uppercase',
    fontFamily: paperFonts.mono,
  },
  recSend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ps(7),
    backgroundColor: M.onPanel,
    borderRadius: ps(10),
    paddingHorizontal: ps(13),
    paddingVertical: ps(8),
  },
  recSendText: { color: M.panel, fontSize: ps(16), fontFamily: paperFonts.strong },

  // ── Visualiseur d'image : posé sur du média, donc hors palette ──
  imageViewerBackdrop: { flex: 1, backgroundColor: '#000' },
  imageViewerHeader: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2 },
  imageViewerBack: { padding: ps(12) },
  imageViewerBody: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  imageViewerImage: { width: '100%', height: '80%' },
});
