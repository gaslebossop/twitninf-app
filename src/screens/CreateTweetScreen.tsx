import { colors, fonts, glow, withAlpha , statusBarStyle} from '../theme';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Animated,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  useWindowDimensions,
  StatusBar,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Video, ResizeMode, Audio } from 'expo-av';
import { apiService } from '../services';
import { publishVideoTweet, type VideoUploadPhase } from '../services/videoTweetService';
import { neuralRankService } from '../services/neuralRankService';
import { CreateTweetRequest, SpotifyTrack, Tweet } from '../types/api';
import TweetCard from '../components/TweetCard';
import { useEvents } from '../contexts/EventContext';
import { getEventTheme } from '../themes/eventThemes';
import { useAuth } from '../contexts/AuthContext';
import {
  canUseFeature,
  effectiveSubscriptionTier,
  isSubscriptionActiveFor,
  tweetCharLimit,
  TWEET_MAX_CHARS_FREE,
  TWEET_MAX_CHARS_SUBSCRIBER,
} from '../utils/subscriptionTier';
import { useOffline } from '../contexts/OfflineContext';
import DraftsSheet from '../components/DraftsSheet';
import PaywallSetupSheet from '../components/PaywallSetupSheet';
import { lockContent } from '../services/paidContentService';
import AiCopilotSheet from '../components/AiCopilotSheet';
import { countDrafts, saveDraft, deleteDraft, TweetDraft } from '../services/draftsService';
import { serializeOverlays, type VideoOverlay } from '../utils/videoFilters';
import { useHeaderMetrics } from '../hooks/useHeaderMetrics';
import { toast } from '../components/ui/Toast';
import { showActionSheet } from '../components/ui/ActionSheet';
import { useFlag } from '../contexts/FeatureFlagContext';
import { FLAGS } from '../config/featureFlagKeys';
import { confirmAsync } from '../components/ui/ConfirmSheet';

/** Plafond du modèle `Tweet` côté API (`media_urls` : 4 maximum). */
const MAX_TWEET_IMAGES = 4;

/** Aligné avec `tweetAudioService.MAX_DURATION_SECONDS` côté API. */
const MAX_VOICE_SECONDS = 120;

function formatVoiceDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

interface CreateTweetScreenProps {
  navigation: any;
  route: {
    params?: {
      parentTweetId?: string;
      replyTo?: string;
      quoteTweetId?: string;
      /** Texte pré-rempli — idée du radar de tendances ouverte depuis une notification. */
      prefill?: string;
    };
  };
}


export default function CreateTweetScreen({ navigation, route }: CreateTweetScreenProps) {
  const { height: windowHeight } = useWindowDimensions();
  const { top: headerTopInset } = useHeaderMetrics();

  const [content, setContent] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [isSensitive, setIsSensitive] = useState(false);
  /** « Traduction (bêta) » — réservée aux abonnés Pro actifs (revalidé par l'API). */
  const [translationEnabled, setTranslationEnabled] = useState(false);

  /**
   * Contenu payant — prix choisi AVANT publication, verrou posé APRÈS.
   *
   * Le verrou a besoin de l'identifiant du tweet, qui n'existe qu'une fois
   * celui-ci créé. Garder le prix en état local jusque-là évite le cas
   * inverse, bien pire : un verrou posé sur un tweet dont la publication
   * échoue ensuite.
   */
  const [paidPrice, setPaidPrice] = useState<number | null>(null);
  const [paidPreview, setPaidPreview] = useState('');
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [charCount, setCharCount] = useState(0);

  // ── Vidéo jointe ──
  // L'option vivait dans un bouton flottant séparé du composeur : on ne
  // pouvait ni écrire sa légende ici, ni régler la visibilité du tweet. Elle
  // est maintenant une pièce jointe du tweet en cours d'écriture.
  const [videoUri, setVideoUri] = useState<string | null>(null);
  /** Images jointes, en URI locale. Elles ne partent qu'à la publication. */
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  /** Habillage renvoyé par l'éditeur — vide pour une vidéo importée. */
  const [videoEdit, setVideoEdit] = useState<{
    overlays: VideoOverlay[];
    filterId: string;
    muted: boolean;
  } | null>(null);
  const [videoPhase, setVideoPhase] = useState<VideoUploadPhase | null>(null);
  const [videoPercent, setVideoPercent] = useState(0);

  // ── Message vocal joint (La Forge : « pouvoir ajouter un message vocal
  // dans notre tweet ») ──
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [isVoicePreviewPlaying, setIsVoicePreviewPlaying] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordingElapsedRef = useRef(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voicePreviewSoundRef = useRef<Audio.Sound | null>(null);

  // ── Morceau Spotify joint ──
  const [selectedTrack, setSelectedTrack] = useState<SpotifyTrack | null>(null);
  const [spotifySearchOpen, setSpotifySearchOpen] = useState(false);
  const [spotifyQuery, setSpotifyQuery] = useState('');
  const [spotifyResults, setSpotifyResults] = useState<SpotifyTrack[]>([]);
  const [spotifySearching, setSpotifySearching] = useState(false);

  // Lu ici et pas plus bas : le brouillon en cours a besoin de son contexte
  // (réponse / citation) pour être réenregistré au bon endroit.
  const { parentTweetId, replyTo, quoteTweetId, prefill } = route.params || {};

  /**
   * Texte pré-rempli (idée du radar). Posé une seule fois et uniquement sur un
   * composeur vierge : réappliquer le `prefill` à chaque rendu écraserait ce que
   * l'utilisateur est en train de réécrire par-dessus la suggestion.
   */
  const prefillApplied = useRef(false);
  useEffect(() => {
    if (!prefill || prefillApplied.current) return;
    prefillApplied.current = true;
    setContent(prefill);
    setCharCount(prefill.length);
  }, [prefill]);

  // Limite selon l'abonnement de l'auteur : 280 par défaut, 1 000 pour un
  // abonné actif. Le serveur revalide (voir `api/src/utils/tweetLimits.js`) —
  // cette valeur ne sert qu'à cadrer la saisie.
  const { user: currentUser } = useAuth() as any;
  const authorTier = effectiveSubscriptionTier(
    !!currentUser?.premium,
    currentUser?.subscription_tier,
  );
  const MAX_CHARS = tweetCharLimit(
    authorTier,
    currentUser?.subscription_expires_at,
    !!currentUser?.verified,
  );
  const isExtendedLimit = MAX_CHARS > TWEET_MAX_CHARS_FREE;

  /**
   * Traduction automatique : option Pro, et Pro seulement — un abonné Plus ne
   * doit pas voir un bouton que le serveur refusera (403). L'expiration compte
   * autant que le palier, sinon un Pro expiré verrait l'option jusqu'au
   * renouvellement de son jeton.
   */
  const canUseTranslation =
    canUseFeature(authorTier, 'pro') &&
    isSubscriptionActiveFor(authorTier, currentUser?.subscription_expires_at);

  // Brouillons — même population que la limite étendue : c'est l'abonnement
  // qui ouvre les deux.
  const canUseDrafts = isExtendedLimit;

  /**
   * Vendre un contenu à l'unité : Pro actif, exactement comme la traduction.
   * Le serveur revalide le palier à la pose du verrou — ce test n'évite qu'un
   * aller-retour perdu et un bouton qui déçoit.
   */
  const canUsePaidContent = canUseTranslation;

  /**
   * Co-pilote IA — même porte que la traduction : Pro, et Pro actif. Le serveur
   * refuse (403) sinon, autant ne pas afficher le bouton.
   */
  const canUseCopilot = canUseTranslation;
  const [copilotVisible, setCopilotVisible] = useState(false);

  const { enabled: offlineEnabled, online, queue: queueTweet } = useOffline();
  const [draftsVisible, setDraftsVisible] = useState(false);
  const [draftCount, setDraftCount] = useState(0);
  /** Brouillon en cours de reprise : le resauvegarder l'écrase au lieu d'empiler. */
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);

  const refreshDraftCount = useCallback(async () => {
    if (!canUseDrafts || !currentUser?.id) return;
    setDraftCount(await countDrafts(currentUser.id));
  }, [canUseDrafts, currentUser?.id]);

  useEffect(() => {
    refreshDraftCount();
  }, [refreshDraftCount]);

  const persistDraft = useCallback(async () => {
    if (!canUseDrafts || !currentUser?.id || !content.trim()) return false;
    await saveDraft(currentUser.id, {
      id: editingDraftId ?? undefined,
      content,
      isPrivate,
      isSensitive,
      translationEnabled,
      parentTweetId,
      quoteTweetId,
    });
    await refreshDraftCount();
    return true;
  }, [
    canUseDrafts,
    currentUser?.id,
    content,
    editingDraftId,
    isPrivate,
    isSensitive,
    translationEnabled,
    parentTweetId,
    quoteTweetId,
    refreshDraftCount,
  ]);

  const handleSaveDraft = useCallback(async () => {
    const saved = await persistDraft();
    if (saved) {
      setEditingDraftId(null);
      setContent('');
      setCharCount(0);
      toast.success('Brouillon enregistré', {
        description: 'Tu le retrouveras depuis l\'icône brouillons.',
      });
    }
  }, [persistDraft]);

  const handlePickDraft = useCallback((draft: TweetDraft) => {
    // Un brouillon vidéo se reprend dans l'écran de légende, pas ici : le
    // composeur texte n'a pas de quoi afficher ni republier la vidéo.
    if (draft.videoUri) {
      setDraftsVisible(false);
      navigation.navigate('VideoCaption', { videoUri: draft.videoUri, draftId: draft.id });
      return;
    }

    setContent(draft.content);
    setCharCount(draft.content.length);
    setIsPrivate(draft.isPrivate);
    setIsSensitive(draft.isSensitive);
    // Un brouillon écrit du temps de l'abonnement ne doit pas rouvrir l'option
    // à un compte qui n'y a plus droit : l'API la refuserait à la publication.
    setTranslationEnabled(!!draft.translationEnabled && canUseTranslation);
    setEditingDraftId(draft.id);
    setDraftsVisible(false);
  }, [canUseTranslation]);

  const { activeEvent, hasActiveEvent } = useEvents();

  // Obtenir le thème de l'événement actif
  const eventTheme = activeEvent?.theme_id ? getEventTheme(activeEvent.theme_id) : null;

  const [quotedTweet, setQuotedTweet] = useState<Tweet | null>(null);

  // Animations
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  // Au repos dès la première image. Le composeur s'ouvrait par un fondu de
  // 800 ms doublé de deux ressorts à `friction: 8` — le champ de saisie
  // arrivait donc en tremblant, sous un doigt qui voulait déjà écrire.
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const inputScaleAnim = useRef(new Animated.Value(1)).current;

  // Charger le tweet cité si nécessaire
  useEffect(() => {
    (async () => {
      if (!quoteTweetId) return;
      try {
        const res = await apiService.getTweet(quoteTweetId);
        if (res?.success && res.data) {
          setQuotedTweet(res.data as Tweet);
        }
      } catch (e) {
        console.log('Erreur chargement tweet cité:', e);
      }
    })();
  }, [quoteTweetId]);

  const handleContentChange = (text: string) => {
    setContent(text);
    setCharCount(text.length);

    // Animation lors de la saisie
    Animated.sequence([
      Animated.timing(inputScaleAnim, {
        toValue: 1.005,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(inputScaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  /**
   * Une citation part par la route retweet, qui n'accepte aucun média : la
   * vidéo n'y est donc pas proposée plutôt que refusée à la publication.
   */
  const canAttachVideo = !quoteTweetId;

  /**
   * Images : sous drapeau, et exclusives de la vidéo.
   *
   * Le drapeau ne conditionne QUE la publication. L'affichage, lui, n'est
   * jamais conditionné (voir `TweetRow`) : un tweet illustré doit rester
   * lisible par ceux qui ne sont pas encore dans le palier, sinon le
   * déploiement progressif ferait apparaître des tweets vides.
   */
  const canAttachImages = useFlag(FLAGS.TWEET_IMAGES) && !quoteTweetId && !videoUri;

  /**
   * Choix des images. `allowsMultipleSelection` avec la limite restante :
   * refuser après coup une sélection de dix images serait une perte de temps
   * pour l'auteur, autant ne pas la lui laisser faire.
   */
  const pickImages = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast.error('Permission requise', {
        description: "L'accès à la galerie est nécessaire pour choisir une image.",
      });
      return;
    }

    const remaining = MAX_TWEET_IMAGES - imageUris.length;
    if (remaining <= 0) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: remaining > 1,
      selectionLimit: remaining,
      quality: 1,
    });

    if (result.canceled || !result.assets?.length) return;
    setImageUris((current) => [...current, ...result.assets.map((asset) => asset.uri)].slice(0, MAX_TWEET_IMAGES));
  }, [imageUris.length]);

  const removeImage = useCallback((uri: string) => {
    setImageUris((current) => current.filter((entry) => entry !== uri));
  }, []);

  /**
   * Message vocal : exclusif de la vidéo (un seul média « riche » à la fois,
   * même règle qu'entre vidéo et images), mais cumulable avec des images ou
   * un morceau. Pas de retweet-citation : la route retweet n'accepte aucun
   * média.
   */
  const canAttachVoice = !quoteTweetId && !videoUri && !audioUri;

  /** Arrête l'enregistrement en cours et récupère le fichier produit. */
  const stopVoiceRecording = useCallback(async () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    const recording = recordingRef.current;
    recordingRef.current = null;
    setIsRecordingVoice(false);
    if (!recording) return;

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      if (uri) {
        setAudioUri(uri);
        setAudioDuration(recordingElapsedRef.current || 1);
      }
    } catch (e) {
      toast.error('Enregistrement perdu', {
        description: 'Réessaie l\'enregistrement du message vocal.',
      });
    }
  }, []);

  const startVoiceRecording = useCallback(async () => {
    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) {
      toast.error('Permission requise', {
        description: "L'accès au micro est nécessaire pour enregistrer un message vocal.",
      });
      return;
    }

    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      recordingElapsedRef.current = 0;
      setRecordingElapsed(0);
      setIsRecordingVoice(true);
      // Arrêt automatique au plafond serveur : un enregistrement plus long
      // se ferait de toute façon tronquer la durée à la publication.
      recordingTimerRef.current = setInterval(() => {
        recordingElapsedRef.current += 1;
        setRecordingElapsed(recordingElapsedRef.current);
        if (recordingElapsedRef.current >= MAX_VOICE_SECONDS) {
          stopVoiceRecording();
        }
      }, 1000);
    } catch (e) {
      toast.error('Micro indisponible', {
        description: 'Impossible de démarrer l\'enregistrement.',
      });
    }
  }, [stopVoiceRecording]);

  const removeAudio = useCallback(async () => {
    if (voicePreviewSoundRef.current) {
      await voicePreviewSoundRef.current.unloadAsync().catch(() => {});
      voicePreviewSoundRef.current = null;
    }
    setIsVoicePreviewPlaying(false);
    setAudioUri(null);
    setAudioDuration(0);
  }, []);

  /** Écoute (avant publication) du message vocal tout juste enregistré. */
  const toggleVoicePreview = useCallback(async () => {
    if (!audioUri) return;
    try {
      if (voicePreviewSoundRef.current) {
        const status = await voicePreviewSoundRef.current.getStatusAsync();
        if (status.isLoaded && status.isPlaying) {
          await voicePreviewSoundRef.current.pauseAsync();
          setIsVoicePreviewPlaying(false);
        } else {
          await voicePreviewSoundRef.current.playAsync();
          setIsVoicePreviewPlaying(true);
        }
        return;
      }
      const { sound } = await Audio.Sound.createAsync({ uri: audioUri }, { shouldPlay: true });
      voicePreviewSoundRef.current = sound;
      setIsVoicePreviewPlaying(true);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsVoicePreviewPlaying(false);
          sound.setPositionAsync(0).catch(() => {});
        }
      });
    } catch (e) {
      toast.error('Lecture impossible', { description: 'Réessaie dans un instant.' });
    }
  }, [audioUri]);

  // Un composeur fermé pendant un enregistrement ou une écoute ne doit pas
  // laisser le micro ouvert ni le son continuer en arrière-plan.
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
      voicePreviewSoundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  /**
   * Recherche Spotify, avec un léger délai pour ne pas déclencher un appel
   * réseau à chaque frappe — même logique que la recherche globale du fil.
   */
  useEffect(() => {
    if (!spotifySearchOpen) return;
    const query = spotifyQuery.trim();
    if (query.length < 2) {
      setSpotifyResults([]);
      setSpotifySearching(false);
      return;
    }

    setSpotifySearching(true);
    const timer = setTimeout(async () => {
      const response = await apiService.searchSpotifyTracks(query);
      if (response.success && response.data?.tracks) {
        setSpotifyResults(response.data.tracks);
      } else {
        setSpotifyResults([]);
      }
      setSpotifySearching(false);
    }, 350);

    return () => clearTimeout(timer);
  }, [spotifyQuery, spotifySearchOpen]);

  const openSpotifySearch = useCallback(() => {
    setSpotifyQuery('');
    setSpotifyResults([]);
    setSpotifySearchOpen(true);
  }, []);

  const selectSpotifyTrack = useCallback((track: SpotifyTrack) => {
    setSelectedTrack(track);
    setSpotifySearchOpen(false);
    setSpotifyQuery('');
    setSpotifyResults([]);
  }, []);

  const removeSpotifyTrack = useCallback(() => {
    setSelectedTrack(null);
  }, []);

  /**
   * Envoie les images choisies et renvoie leurs URLs publiques.
   *
   * En série et non en parallèle : sur un réseau mobile, quatre envois
   * simultanés se disputent la même bande passante et échouent ensemble.
   * Un échec interrompt la publication plutôt que de publier un tweet amputé
   * d'une image que son auteur croyait jointe.
   */
  const uploadImages = async (): Promise<string[] | null> => {
    const urls: string[] = [];
    for (const uri of imageUris) {
      const response = await apiService.uploadTweetImage(uri);
      if (!response.success || !response.data?.url) {
        toast.error('Image non envoyée', {
          description: response.message || 'Réessaie dans un instant.',
        });
        return null;
      }
      urls.push(response.data.url);
    }
    return urls;
  };

  /** Envoie le message vocal enregistré et renvoie son URL publique + durée. */
  const uploadAudio = async (): Promise<{ url: string; duration: number } | null> => {
    if (!audioUri) return null;
    const response = await apiService.uploadTweetAudio(audioUri, audioDuration);
    if (!response.success || !response.data?.url) {
      toast.error('Message vocal non envoyé', {
        description: response.message || 'Réessaie dans un instant.',
      });
      return null;
    }
    return { url: response.data.url, duration: response.data.duration ?? audioDuration };
  };

  /**
   * Choix d'une vidéo dans la galerie.
   *
   * Filmer ne passe plus par ici : `RecordVideo` s'en charge (voir
   * `openCamera`). Cette fonction ne sert donc plus qu'à l'import.
   */
  const pickVideoFromLibrary = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast.error('Permission requise', {
        description: "L'accès à la galerie est nécessaire pour choisir une vidéo.",
      });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: true,
      videoMaxDuration: 60,
      quality: 1,
    });

    if (!result.canceled && result.assets?.[0]) {
      setVideoUri(result.assets[0].uri);
    }
  }, []);

  /**
   * Caméra de l'app, et non celle du système.
   *
   * `returnTo` ramène la prise ici plutôt que vers l'écran de légende : le
   * texte déjà saisi ne doit pas être abandonné en route.
   */
  const openCamera = useCallback(() => {
    navigation.navigate('RecordVideo', { returnTo: 'CreateTweet' });
  }, [navigation]);

  /**
   * Retour de l'éditeur : la vidéo ET son habillage.
   *
   * Le paramètre est effacé après lecture, sinon revenir sur l'écran
   * réattacherait la même prise en boucle.
   */
  useEffect(() => {
    const incoming = (route.params as any)?.editedVideo;
    if (!incoming?.videoUri) return;
    setVideoUri(incoming.videoUri);
    setVideoEdit({
      overlays: incoming.overlays || [],
      filterId: incoming.filterId || 'none',
      muted: !!incoming.muted,
    });
    navigation.setParams({ editedVideo: undefined });
  }, [route.params, navigation]);

  const handleAddVideo = useCallback(() => {
    showActionSheet({
      title: 'Ajouter une vidéo',
      items: [
        { label: 'Filmer', icon: 'videocam-outline', onPress: openCamera },
        { label: 'Choisir dans la galerie', icon: 'images-outline', onPress: pickVideoFromLibrary },
      ],
    });
  }, [openCamera, pickVideoFromLibrary]);

  /** Publication d'un tweet portant une vidéo — envoi puis transcodage. */
  const submitVideoTweet = async () => {
    setLoading(true);
    setVideoPhase('uploading');
    setVideoPercent(0);

    try {
      const result = await publishVideoTweet({
        videoUri: videoUri as string,
        content,
        isPrivate,
        isSensitive,
        translationEnabled,
        parentTweetId,
        // Habillage de l'éditeur — absent pour une vidéo simplement importée
        // de la galerie, qui n'est jamais passée par lui.
        overlaysJson: videoEdit ? serializeOverlays(videoEdit.overlays) : undefined,
        filterId: videoEdit?.filterId,
        muted: videoEdit?.muted,
        onProgress: (phase, percent) => {
          setVideoPhase(phase);
          setVideoPercent(percent);
        },
      });

      if (!result.success) {
        toast.error(result.message || 'Impossible de publier la vidéo.');
        return;
      }

      if (result.tweetId) neuralRankService.onPublish(result.tweetId);

      if (editingDraftId && currentUser?.id) {
        await deleteDraft(currentUser.id, editingDraftId);
        setEditingDraftId(null);
        await refreshDraftCount();
      }

      toast.success(result.message || 'Vidéo publiée !');
      // `popToTop` et non `goBack` : le parcours vidéo empile la caméra et
      // l'écran de légende au-dessus du composeur. Reculer d'un cran ne
      // fermait que le dernier, laissant le composeur ouvert avec un tweet
      // déjà publié — qu'on pouvait republier.
      //
      // La sortie ne dépend plus d'un « OK » à cliquer : on rend la main tout
      // de suite, le toast suit l'utilisateur sur l'écran d'arrivée.
      navigation.popToTop();
    } finally {
      setLoading(false);
      setVideoPhase(null);
      setVideoPercent(0);
    }
  };

  const handleSubmit = async () => {
    // Un média se suffit à lui-même : seule une publication sans rien joint
    // exige du texte.
    if (!content.trim() && !videoUri && imageUris.length === 0 && !audioUri) {
      toast.error('Le contenu du tweet ne peut pas être vide');
      return;
    }

    if (content.length > MAX_CHARS) {
      toast.error(`Le tweet ne peut pas dépasser ${MAX_CHARS} caractères`);
      return;
    }

    if (videoUri) {
      // La file hors ligne ne sait rejouer qu'un tweet texte : mettre une
      // vidéo en attente reviendrait à la perdre au retour du réseau.
      if (offlineEnabled && !online) {
        toast.info('Hors ligne', {
          description: "L'envoi d'une vidéo demande une connexion. Réessaie une fois en ligne.",
        });
        return;
      }
      await submitVideoTweet();
      return;
    }

    // Même raison que pour la vidéo : la file hors ligne ne rejoue qu'un tweet
    // texte, mettre des images en attente reviendrait à les perdre.
    if (imageUris.length > 0 && offlineEnabled && !online) {
      toast.info('Hors ligne', {
        description: "L'envoi d'images demande une connexion. Réessaie une fois en ligne.",
      });
      return;
    }

    // Idem pour le message vocal : rien à rejouer sans réseau.
    if (audioUri && offlineEnabled && !online) {
      toast.info('Hors ligne', {
        description: "L'envoi d'un message vocal demande une connexion. Réessaie une fois en ligne.",
      });
      return;
    }

    // Hors ligne (Pro) : on met en file plutôt que d'échouer. Le tweet part
    // seul au retour du réseau — l'utilisateur n'a pas à repasser ici.
    if (offlineEnabled && !online) {
      const queued = await queueTweet({
        content: content.trim(),
        isPrivate,
        isSensitive,
        translationEnabled,
        parentTweetId,
        quoteTweetId,
        lastError: null,
      });
      if (queued) {
        if (editingDraftId && currentUser?.id) {
          await deleteDraft(currentUser.id, editingDraftId);
          setEditingDraftId(null);
          await refreshDraftCount();
        }
        toast.info('En attente de réseau', {
          description: 'Ton tweet est enregistré : il partira dès que la connexion revient.',
        });
        navigation.goBack();
        return;
      }
    }

    try {
      setLoading(true);

      // Les images partent AVANT la publication : un échec d'envoi doit se
      // solder par « rien n'est publié », pas par un tweet sans ses images.
      let mediaUrls: string[] = [];
      if (imageUris.length > 0) {
        setUploadingImages(true);
        const uploaded = await uploadImages();
        setUploadingImages(false);
        if (!uploaded) return;
        mediaUrls = uploaded;
      }

      // Même raisonnement que pour les images : le message vocal part AVANT
      // la publication, un échec d'envoi ne doit rien publier du tout.
      let audioPayload: { url: string; duration: number } | null = null;
      if (audioUri) {
        setUploadingAudio(true);
        audioPayload = await uploadAudio();
        setUploadingAudio(false);
        if (!audioPayload) return;
      }

      const tweetData: CreateTweetRequest = {
        content: content.trim(),
        parent_tweet_id: parentTweetId,
        is_private: isPrivate,
        is_sensitive: isSensitive,
        translation_enabled: translationEnabled,
        language: 'fr',
        ...(mediaUrls.length > 0 ? { media_urls: mediaUrls } : {}),
        ...(selectedTrack ? { spotify_track: selectedTrack } : {}),
        ...(audioPayload ? { audio_url: audioPayload.url, audio_duration: audioPayload.duration } : {}),
      };

      // Si c'est une citation, utiliser la route retweet avec commentaire
      let response;
      if (quoteTweetId) {
        response = await apiService.retweet(quoteTweetId, content.trim());
      } else {
        response = await apiService.createTweet(tweetData);
      }

      if (response.success) {
        // Signaler à NeuralRank la publication du tweet pour invalider les caches feed
        const newTweetId = response.data?.tweet?.id || response.data?.id;
        if (newTweetId) neuralRankService.onPublish(String(newTweetId));

        // Verrou payant, une fois l'identifiant connu.
        //
        // Un échec ici ne remet pas en cause la publication : le tweet est
        // parti, il est simplement resté gratuit. On le DIT plutôt que de
        // laisser l'auteur croire qu'il vend quelque chose — c'est de
        // l'argent, le silence n'est pas une option.
        if (newTweetId && paidPrice !== null) {
          try {
            await lockContent({
              contentType: 'tweet',
              contentId: String(newTweetId),
              priceTwc: paidPrice,
              previewText: paidPreview || null,
            });
          } catch (lockError: any) {
            // Volontairement en rouge : la partie qui a échoué est celle qui
            // rapporte de l'argent, c'est elle qui doit attirer l'oeil.
            toast.error('Tweet publié, mais gratuit', {
              description: `${lockError?.message || 'La mise en vente a échoué.'}

Tu peux fixer le prix depuis le menu « … » du tweet.`,
            });
          }
        }

        // Un brouillon publié n'a plus lieu d'être : le laisser en liste
        // ferait republier le même texte à la prochaine reprise.
        if (editingDraftId && currentUser?.id) {
          await deleteDraft(currentUser.id, editingDraftId);
          setEditingDraftId(null);
          await refreshDraftCount();
        }

        // Publier était l'action ; la confirmer par une fenêtre à valider
        // ajoutait un geste à un geste réussi. On rend la main immédiatement
        // et le toast confirme sur l'écran d'arrivée.
        toast.success(
          parentTweetId ? 'Réponse publiée' : quoteTweetId ? 'Citation publiée' : 'Tweet publié',
        );
        navigation.goBack();
      } else {
        // Gestion spécifique des erreurs de ban
        if ((response as any).ban_info) {
          const banInfo = (response as any).ban_info;
          let title = 'Compte suspendu';
          let message = '';

          if (banInfo.suspended) {
            if (banInfo.ban_count >= 5) {
              title = 'Compte banni définitivement';
              message = 'Votre compte a été banni pour violations répétées. Vous ne pouvez plus publier de contenu.';
            } else {
              title = 'Compte temporairement suspendu';
              message = `Votre compte est suspendu jusqu'au ${banInfo.suspended_until ? new Date(banInfo.suspended_until).toLocaleDateString('fr-FR') : 'date indéterminée'}.\n\nRaison: ${banInfo.reason || 'Violation des conditions d\'utilisation'}`;

              if (banInfo.remaining_days && banInfo.remaining_days > 0) {
                message += `\n\nJours restants: ${banInfo.remaining_days}`;
              }
            }
          } else {
            message = response.message || 'Erreur lors de la publication';
          }

          toast.info(title, {
            description: message,
          });
        } else {
          // Erreur normale
          toast.error(response.message || 'Erreur lors de la publication');
        }
      }
    } catch (error) {
      console.error('Erreur lors de la création du tweet:', error);
      toast.error('Impossible de publier le tweet. Vérifiez votre connexion.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (!content.trim()) {
      navigation.goBack();
      return;
    }

    // Avec les brouillons, « votre tweet sera perdu » n'est plus vrai : la
    // sortie propose de le garder, et ne détruit que sur demande explicite.
    if (canUseDrafts) {
      // Trois issues : ce n'est plus une question fermée, donc une feuille
      // d'actions plutôt qu'une confirmation. « Enregistrer » vient en tête —
      // c'est le choix qu'on veut rendre évident.
      showActionSheet({
        title: 'Garder ce tweet ?',
        message: 'Tu peux l’enregistrer en brouillon et le reprendre plus tard.',
        cancelLabel: 'Continuer l’édition',
        items: [
          {
            label: 'Enregistrer le brouillon',
            icon: 'save-outline',
            onPress: async () => {
              await persistDraft();
              navigation.goBack();
            },
          },
          {
            label: 'Supprimer',
            icon: 'trash-outline',
            destructive: true,
            onPress: () => navigation.goBack(),
          },
        ],
      });
      return;
    }

    confirmAsync({
      title: 'Annuler la publication',
      message: 'Êtes-vous sûr de vouloir annuler ? Votre tweet sera perdu.',
      confirmLabel: 'Annuler',
      cancelLabel: 'Continuer l\'édition',
      destructive: true,
    }).then((ok) => {
      if (ok) (() => navigation.goBack())();
    });
  };

  const isSubmitDisabled =
    (!content.trim() && !videoUri && imageUris.length === 0) || content.length > MAX_CHARS || loading;
  const isOverLimit = charCount > MAX_CHARS;
  const charPercentage = (charCount / MAX_CHARS) * 100;

  const bgColor = hasActiveEvent && eventTheme ? eventTheme.colors.background : colors.bg;
  const textColor = hasActiveEvent && eventTheme ? eventTheme.colors.text : colors.textPrimary;
  const mutedColor = hasActiveEvent && eventTheme ? eventTheme.colors.textSecondary : colors.textMuted;

  const Wrapper = hasActiveEvent && eventTheme ? LinearGradient : View;
  const wrapperProps = hasActiveEvent && eventTheme
    ? { colors: eventTheme.gradients.primary as any, style: styles.gradient }
    : { style: [styles.gradient, { backgroundColor: colors.bg }] };

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <StatusBar
        barStyle={statusBarStyle()}
        backgroundColor={hasActiveEvent && eventTheme ? eventTheme.colors.primary : colors.bg}
      />

      <Wrapper {...(wrapperProps as any)}>
        {/* En-tête */}
        <Animated.View
          style={[
            styles.header,
            {
              paddingTop: headerTopInset,
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }, { scale: scaleAnim }]
            }
          ]}
        >
          <View style={styles.headerContent}>
            <TouchableOpacity onPress={handleCancel} style={styles.cancelButton}>
              <Ionicons name="close" size={20} color={textColor} />
            </TouchableOpacity>

            <View style={styles.headerCenter}>
              <Text style={[styles.headerTitle, { color: textColor }]}>
                {parentTweetId ? 'Répondre' : quoteTweetId ? 'Citer' : 'Nouveau tweet'}
              </Text>
              {replyTo && (
                <Text style={[styles.replyToText, { color: mutedColor }]}>
                  Répondre à @{replyTo}
                </Text>
              )}
            </View>

            {/* Co-pilote : n'apparaît qu'avec du texte sur lequel travailler. */}
            {canUseCopilot && !!content.trim() && (
              <TouchableOpacity
                style={styles.draftAction}
                onPress={() => setCopilotVisible(true)}
                activeOpacity={0.7}
                accessibilityLabel="Ouvrir le co-pilote de rédaction"
              >
                <Ionicons name="bulb-outline" size={19} color={textColor} />
              </TouchableOpacity>
            )}

            {canUseDrafts && (
              <>
                {/* Enregistrer : n'apparaît qu'avec du texte à sauver. */}
                {!!content.trim() && (
                  <TouchableOpacity
                    style={styles.draftAction}
                    onPress={handleSaveDraft}
                    activeOpacity={0.7}
                    accessibilityLabel="Enregistrer en brouillon"
                  >
                    <Ionicons name="bookmark-outline" size={19} color={textColor} />
                  </TouchableOpacity>
                )}
                {/* Ouvrir la liste : n'apparaît que s'il y a quelque chose dedans. */}
                {draftCount > 0 && (
                  <TouchableOpacity
                    style={styles.draftAction}
                    onPress={() => setDraftsVisible(true)}
                    activeOpacity={0.7}
                    accessibilityLabel={`Voir les brouillons (${draftCount})`}
                  >
                    <Ionicons name="documents-outline" size={19} color={textColor} />
                    <View style={styles.draftBadge}>
                      <Text style={styles.draftBadgeText}>
                        {draftCount > 9 ? '9+' : draftCount}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
              </>
            )}

            <TouchableOpacity
              style={[
                styles.submitButton,
                isSubmitDisabled && styles.submitButtonDisabled
              ]}
              onPress={handleSubmit}
              disabled={isSubmitDisabled}
              activeOpacity={0.85}
            >
              <Text style={styles.submitButtonText}>
                {loading ? 'Publication…' : 'Publier'}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Zone de contenu */}
        <KeyboardAvoidingView
          style={styles.contentContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Animated.View
              style={[
                styles.inputContainer,
                {
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }, { scale: scaleAnim }]
                }
              ]}
            >
              {/* Conteneur principal */}
              <View style={styles.inputWrapper}>
                {/* Zone de texte */}
                <Animated.View style={[{ transform: [{ scale: inputScaleAnim }] }]}>
                  <TextInput
                    style={[
                      styles.textInput,
                      { color: textColor },
                      charCount > TWEET_MAX_CHARS_FREE && styles.textInputLong,
                      isOverLimit && styles.textInputOverLimit,
                    ]}
                    placeholder={parentTweetId ? "Exprimez votre pensée..." : quoteTweetId ? "Ajoutez un commentaire..." : "Quoi de neuf ?"}
                    placeholderTextColor={mutedColor}
                    value={content}
                    onChangeText={handleContentChange}
                    multiline
                    textAlignVertical="top"
                    maxLength={MAX_CHARS + 20} // Un peu de marge pour l'UX
                    autoFocus
                    onFocus={() => {
                      Animated.spring(inputScaleAnim, {
                        toValue: 1.01,
                        tension: 50,
                        friction: 14,
                        useNativeDriver: true,
                      }).start();
                    }}
                    onBlur={() => {
                      Animated.spring(inputScaleAnim, {
                        toValue: 1,
                        tension: 50,
                        friction: 14,
                        useNativeDriver: true,
                      }).start();
                    }}
                  />
                </Animated.View>

                {/* Aperçu du tweet cité */}
                {quoteTweetId && (
                  <View style={styles.quoteContainer}>
                    {quotedTweet ? (
                      <TweetCard tweet={quotedTweet as any} compact={true} />
                    ) : (
                      <Text style={styles.quoteLoadingText}>Chargement du tweet cité…</Text>
                    )}
                  </View>
                )}

                {/* Compteur de caractères */}
                <View style={styles.charCounterContainer}>
                  <View style={styles.charCounterInfo}>
                    <Text style={[
                      styles.charCounter,
                      isOverLimit && styles.charCounterOverLimit
                    ]}>
                      {MAX_CHARS - charCount}
                    </Text>
                  </View>

                  <View style={styles.charCounterBarContainer}>
                    <View style={styles.charCounterBar}>
                      <View
                        style={[
                          styles.charCounterProgress,
                          {
                            width: `${Math.min(charPercentage, 100)}%`,
                            backgroundColor: isOverLimit
                              ? colors.red
                              : charPercentage > 80
                                ? colors.warning
                                : colors.accent
                          }
                        ]}
                      />
                    </View>
                  </View>
                </View>

                {/* L'offre se présente au moment où la limite gêne vraiment —
                    pas avant. Tant qu'il reste de la marge, ce serait de la
                    publicité ; à 90 %, c'est une réponse au problème en cours. */}
                {!isExtendedLimit && charPercentage >= 90 && (
                  <View style={styles.limitUpsell}>
                    <Ionicons name="expand-outline" size={15} color={colors.accent} />
                    <Text style={styles.limitUpsellText}>
                      À court de place ? Plus et Pro écrivent jusqu'à{' '}
                      {TWEET_MAX_CHARS_SUBSCRIBER} caractères.
                    </Text>
                  </View>
                )}

                {/* Vidéo jointe — aperçu + retrait */}
                {!!videoUri && (
                  <View style={styles.videoAttachment}>
                    <Video
                      source={{ uri: videoUri }}
                      style={styles.videoPreview}
                      resizeMode={ResizeMode.COVER}
                      isLooping
                      isMuted
                      shouldPlay={!loading}
                    />
                    <View style={styles.videoMeta}>
                      <Text style={styles.videoMetaTitle}>Vidéo jointe</Text>
                      <Text style={styles.videoMetaCaption}>
                        {videoPhase === 'uploading'
                          ? `Envoi… ${videoPercent}%`
                          : videoPhase === 'processing'
                            ? `Optimisation 720p… ${videoPercent}%`
                            : 'Elle sera publiée avec ce tweet.'}
                      </Text>
                      {!!videoPhase && (
                        <View style={styles.videoProgressTrack}>
                          <View
                            style={[styles.videoProgressFill, { width: `${videoPercent}%` }]}
                          />
                        </View>
                      )}
                    </View>
                    {!loading && (
                      <TouchableOpacity
                        style={styles.videoRemove}
                        onPress={() => setVideoUri(null)}
                        accessibilityLabel="Retirer la vidéo"
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="close" size={16} color={colors.white} />
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* Images jointes — aperçus + retrait individuel */}
                {imageUris.length > 0 && (
                  <View style={styles.imageStrip}>
                    {imageUris.map((uri) => (
                      <View key={uri} style={styles.imageThumbWrap}>
                        <Image source={{ uri }} style={styles.imageThumb} resizeMode="cover" />
                        {!loading && (
                          <TouchableOpacity
                            style={styles.imageRemove}
                            onPress={() => removeImage(uri)}
                            accessibilityLabel="Retirer cette image"
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons name="close" size={14} color={colors.white} />
                          </TouchableOpacity>
                        )}
                      </View>
                    ))}
                    {uploadingImages && (
                      <Text style={styles.imageHint}>Envoi des images…</Text>
                    )}
                  </View>
                )}

                {/* Morceau Spotify joint — aperçu + retrait */}
                {!!selectedTrack && (
                  <View style={styles.musicAttachment}>
                    {selectedTrack.albumArt ? (
                      <Image source={{ uri: selectedTrack.albumArt }} style={styles.musicAttachmentArt} />
                    ) : (
                      <View style={[styles.musicAttachmentArt, styles.spotifyResultArtPlaceholder]}>
                        <Ionicons name="musical-note" size={18} color={colors.textMuted} />
                      </View>
                    )}
                    <View style={styles.musicAttachmentMeta}>
                      <Text style={styles.musicAttachmentTitle} numberOfLines={1}>{selectedTrack.name}</Text>
                      {!!selectedTrack.artist && (
                        <Text style={styles.musicAttachmentArtist} numberOfLines={1}>{selectedTrack.artist}</Text>
                      )}
                    </View>
                    {!loading && (
                      <TouchableOpacity
                        style={styles.musicAttachmentRemove}
                        onPress={removeSpotifyTrack}
                        accessibilityLabel="Retirer le morceau"
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="close" size={16} color={colors.white} />
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* Message vocal joint — aperçu, lecture, retrait */}
                {!!audioUri && (
                  <View style={styles.voiceAttachment}>
                    <TouchableOpacity
                      style={styles.voiceAttachmentPlay}
                      onPress={toggleVoicePreview}
                      accessibilityLabel={isVoicePreviewPlaying ? 'Mettre en pause' : 'Écouter le message vocal'}
                    >
                      <Ionicons name={isVoicePreviewPlaying ? 'pause' : 'play'} size={16} color={colors.white} />
                    </TouchableOpacity>
                    <View style={styles.voiceAttachmentMeta}>
                      <Text style={styles.voiceAttachmentTitle}>Message vocal</Text>
                      <Text style={styles.voiceAttachmentDuration}>{formatVoiceDuration(audioDuration)}</Text>
                    </View>
                    {!loading && (
                      <TouchableOpacity
                        style={styles.voiceAttachmentRemove}
                        onPress={removeAudio}
                        accessibilityLabel="Retirer le message vocal"
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="close" size={16} color={colors.white} />
                      </TouchableOpacity>
                    )}
                  </View>
                )}
                {uploadingAudio && (
                  <Text style={styles.imageHint}>Envoi du message vocal…</Text>
                )}

                {/* Options du tweet — chips pleins style segmented */}
                <View style={styles.tweetOptions}>
                  {canAttachImages && imageUris.length < MAX_TWEET_IMAGES && (
                    <TouchableOpacity
                      style={styles.optionChip}
                      onPress={pickImages}
                      activeOpacity={0.8}
                      accessibilityLabel="Ajouter une image"
                    >
                      <Ionicons name="image-outline" size={17} color={colors.textMuted} />
                      <Text style={styles.optionText}>IMAGE</Text>
                    </TouchableOpacity>
                  )}

                  {canAttachVideo && !videoUri && imageUris.length === 0 && (
                    <TouchableOpacity
                      style={styles.optionChip}
                      onPress={handleAddVideo}
                      activeOpacity={0.8}
                      accessibilityLabel="Ajouter une vidéo"
                    >
                      <Ionicons name="videocam-outline" size={17} color={colors.textMuted} />
                      <Text style={styles.optionText}>VIDÉO</Text>
                    </TouchableOpacity>
                  )}

                  {!selectedTrack && (
                    <TouchableOpacity
                      style={styles.optionChip}
                      onPress={openSpotifySearch}
                      activeOpacity={0.8}
                      accessibilityLabel="Ajouter un morceau"
                    >
                      <Ionicons name="musical-notes-outline" size={17} color={colors.textMuted} />
                      <Text style={styles.optionText}>MUSIQUE</Text>
                    </TouchableOpacity>
                  )}

                  {canAttachVoice && !isRecordingVoice && (
                    <TouchableOpacity
                      style={styles.optionChip}
                      onPress={startVoiceRecording}
                      activeOpacity={0.8}
                      accessibilityLabel="Enregistrer un message vocal"
                    >
                      <Ionicons name="mic-outline" size={17} color={colors.textMuted} />
                      <Text style={styles.optionText}>VOCAL</Text>
                    </TouchableOpacity>
                  )}

                  {isRecordingVoice && (
                    <TouchableOpacity
                      style={[styles.optionChip, styles.optionChipActive]}
                      onPress={stopVoiceRecording}
                      activeOpacity={0.8}
                      accessibilityLabel="Arrêter l'enregistrement"
                    >
                      <Ionicons name="stop" size={17} color={colors.white} />
                      <Text style={[styles.optionText, styles.optionTextActive]}>
                        {formatVoiceDuration(recordingElapsed)}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {/* Concours : un tweet a cagnotte a son propre formulaire
                      (montant, devise, conditions, duree). On quitte donc le
                      composeur au lieu d'entasser ces champs ici. */}
                  <TouchableOpacity
                    style={styles.optionChip}
                    onPress={() => (navigation as any).navigate('CreateContest')}
                    activeOpacity={0.8}
                    accessibilityLabel="Creer un concours"
                  >
                    <Ionicons name="gift-outline" size={17} color={colors.textMuted} />
                    <Text style={styles.optionText}>CONCOURS</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.optionChip,
                      isPrivate && styles.optionChipActive
                    ]}
                    onPress={() => setIsPrivate(!isPrivate)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={isPrivate ? "lock-closed" : "lock-open"}
                      size={17}
                      color={isPrivate ? colors.white : colors.textMuted}
                    />
                    <Text style={[
                      styles.optionText,
                      isPrivate && styles.optionTextActive
                    ]}>
                      {isPrivate ? 'PRIVÉ' : 'PUBLIC'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.optionChip,
                      isSensitive && styles.optionChipSensitive
                    ]}
                    onPress={() => setIsSensitive(!isSensitive)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={isSensitive ? "warning" : "warning-outline"}
                      size={17}
                      color={isSensitive ? '#1a1303' : colors.textMuted}
                    />
                    <Text style={[
                      styles.optionText,
                      isSensitive && { color: '#1a1303' }
                    ]}>
                      {isSensitive ? 'SENSIBLE' : 'STANDARD'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Recherche Spotify — panneau en ligne, pas de <Modal> (les
                    hôtes toast/confirm ne s'affichent pas sous une fenêtre
                    native séparée, voir CLAUDE.md). */}
                {spotifySearchOpen && (
                  <View style={styles.spotifyPanel}>
                    <View style={styles.spotifySearchRow}>
                      <Ionicons name="search-outline" size={16} color={colors.textMuted} />
                      <TextInput
                        style={styles.spotifySearchInput}
                        placeholder="Chercher un morceau ou un artiste"
                        placeholderTextColor={colors.textMuted}
                        value={spotifyQuery}
                        onChangeText={setSpotifyQuery}
                        autoFocus
                        returnKeyType="search"
                      />
                      <TouchableOpacity
                        onPress={() => setSpotifySearchOpen(false)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityLabel="Fermer la recherche Spotify"
                      >
                        <Ionicons name="close" size={18} color={colors.textMuted} />
                      </TouchableOpacity>
                    </View>

                    {spotifySearching && (
                      <Text style={styles.spotifyHint}>Recherche…</Text>
                    )}

                    {!spotifySearching && spotifyQuery.trim().length >= 2 && spotifyResults.length === 0 && (
                      <Text style={styles.spotifyHint}>Aucun résultat.</Text>
                    )}

                    {spotifyResults.map((track) => (
                      <TouchableOpacity
                        key={track.id}
                        style={styles.spotifyResultRow}
                        onPress={() => selectSpotifyTrack(track)}
                        activeOpacity={0.8}
                      >
                        {track.albumArt ? (
                          <Image source={{ uri: track.albumArt }} style={styles.spotifyResultArt} />
                        ) : (
                          <View style={[styles.spotifyResultArt, styles.spotifyResultArtPlaceholder]}>
                            <Ionicons name="musical-note" size={16} color={colors.textMuted} />
                          </View>
                        )}
                        <View style={styles.spotifyResultMeta}>
                          <Text style={styles.spotifyResultTitle} numberOfLines={1}>{track.name}</Text>
                          {!!track.artist && (
                            <Text style={styles.spotifyResultArtist} numberOfLines={1}>{track.artist}</Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Traduction automatique — visible seulement pour les Pro */}
                {canUseTranslation && (
                  <TouchableOpacity
                    style={[
                      styles.translationRow,
                      translationEnabled && styles.translationRowActive,
                    ]}
                    onPress={() => setTranslationEnabled(!translationEnabled)}
                    activeOpacity={0.8}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: translationEnabled }}
                    accessibilityLabel="Traduction automatique du tweet, bêta"
                  >
                    <Ionicons
                      name="language"
                      size={19}
                      color={translationEnabled ? colors.accent : colors.textMuted}
                    />
                    <View style={styles.translationCopy}>
                      <View style={styles.translationTitleRow}>
                        <Text style={styles.translationTitle}>Traduction</Text>
                        <View style={styles.betaTag}>
                          <Text style={styles.betaTagText}>BÊTA</Text>
                        </View>
                      </View>
                      <Text style={styles.translationCaption}>
                        {translationEnabled
                          ? 'Ton tweet sera traduit en 10 langues après publication.'
                          : 'Rendre ce tweet lisible en 10 langues.'}
                      </Text>
                    </View>
                    <Ionicons
                      name={translationEnabled ? 'checkmark-circle' : 'ellipse-outline'}
                      size={22}
                      color={translationEnabled ? colors.accent : colors.textMuted}
                    />
                  </TouchableOpacity>
                )}

                {/* Contenu payant — Pro uniquement, comme la traduction.
                    Le prix est fixé ICI, avant publication : c'est le moment
                    où l'auteur sait ce que vaut ce qu'il vient d'écrire.
                    Le verrou n'est posé qu'APRÈS la création du tweet (il faut
                    son identifiant), et il restera ajustable 30 minutes. */}
                {canUsePaidContent && !parentTweetId && !quoteTweetId && (
                  <TouchableOpacity
                    style={[
                      styles.translationRow,
                      paidPrice !== null && styles.translationRowActive,
                    ]}
                    onPress={() => setPaywallVisible(true)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Rendre ce tweet payant"
                  >
                    <Ionicons
                      name="lock-closed"
                      size={19}
                      color={paidPrice !== null ? colors.accent : colors.textMuted}
                    />
                    <View style={styles.translationCopy}>
                      <View style={styles.translationTitleRow}>
                        <Text style={styles.translationTitle}>Contenu payant</Text>
                        <View style={styles.betaTag}>
                          <Text style={styles.betaTagText}>PRO</Text>
                        </View>
                      </View>
                      <Text style={styles.translationCaption}>
                        {paidPrice !== null
                          ? `${paidPrice} NF — tu touches ${Math.round(paidPrice * 0.7 * 100) / 100} NF par vente.`
                          : 'Fixer un prix pour débloquer ce tweet.'}
                      </Text>
                    </View>
                    <Ionicons
                      name={paidPrice !== null ? 'checkmark-circle' : 'ellipse-outline'}
                      size={22}
                      color={paidPrice !== null ? colors.accent : colors.textMuted}
                    />
                  </TouchableOpacity>
                )}

                {/* Avertissement */}
                {charCount === 0 && (
                  <View style={styles.writingTips}>
                    <Ionicons name="information-circle" size={16} color={colors.accent} style={{ marginBottom: 6 }} />
                    <Text style={styles.tipsTitle}>Avertissement</Text>
                    <Text style={styles.tipText}>Tout contenu non pertinent ou non original sera supprimé.</Text>
                  </View>
                )}
              </View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Wrapper>

      {/* Prix du contenu payant, en mode brouillon : la feuille renvoie le
          prix, le verrou est posé après la publication. */}
      {canUsePaidContent && (
        <PaywallSetupSheet
          visible={paywallVisible}
          contentType="tweet"
          contentId=""
          draftMode
          draftPrice={paidPrice}
          draftPreview={paidPreview}
          onDraftChange={(price, previewText) => {
            setPaidPrice(price);
            setPaidPreview(previewText);
          }}
          onClose={() => setPaywallVisible(false)}
        />
      )}

      {canUseDrafts && !!currentUser?.id && (
        <DraftsSheet
          visible={draftsVisible}
          userId={String(currentUser.id)}
          onClose={() => {
            setDraftsVisible(false);
            refreshDraftCount();
          }}
          onPick={handlePickDraft}
        />
      )}

      {canUseCopilot && (
        <AiCopilotSheet
          visible={copilotVisible}
          content={content}
          onClose={() => setCopilotVisible(false)}
          // Passe par `handleContentChange` et non `setContent` : le compteur de
          // caractères et l'état du bouton Publier en dépendent.
          onApply={handleContentChange}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  header: {
    // paddingTop réel posé à l'appel (useHeaderMetrics), pas une valeur devinée.
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  cancelButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 16,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: fonts.bold,
    letterSpacing: -0.1,
  },
  replyToText: {
    fontSize: 12,
    marginTop: 2,
  },
  submitButton: {
    backgroundColor: colors.accent,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 84,
    ...glow(colors.accent, 12),
  },
  submitButtonDisabled: {
    backgroundColor: colors.surfaceAlt,
    shadowOpacity: 0,
    elevation: 0,
    opacity: 0.7,
  },
  submitButtonText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 14,
    letterSpacing: -0.1,
  },
  contentContainer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  inputContainer: {
    marginTop: 4,
  },
  inputWrapper: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  textInput: {
    fontSize: 19,
    lineHeight: 27,
    minHeight: 140,
    textAlignVertical: 'top',
    fontFamily: fonts.regular,
  },
  textInputOverLimit: {
    color: colors.red,
  },
  /**
   * Au-delà d'un tweet court, le corps de 19 px cesse d'aider : il pousse le
   * texte hors de l'écran plus vite qu'on ne l'écrit et on perd de vue ce
   * qu'on vient de taper. Le texte long se compose plus confortablement un
   * cran en dessous.
   */
  textInputLong: {
    fontSize: 16,
    lineHeight: 23,
  },
  draftAction: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  draftBadge: {
    position: 'absolute',
    top: 2,
    right: 1,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  draftBadgeText: {
    fontSize: 9,
    fontFamily: fonts.bold,
    color: colors.onAccent,
  },
  limitUpsell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: withAlpha(colors.accent, 0.35),
  },
  limitUpsellText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 17,
    fontFamily: fonts.medium,
    color: colors.textSecondary,
  },
  charCounterContainer: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  charCounterInfo: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 8,
  },
  charCounter: {
    color: colors.textMuted,
    fontSize: 13,
    fontFamily: fonts.bold,
  },
  charCounterOverLimit: {
    color: colors.red,
  },
  charCounterBarContainer: {
    marginBottom: 4,
  },
  charCounterBar: {
    height: 4,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 2,
    overflow: 'hidden',
  },
  charCounterProgress: {
    height: '100%',
    borderRadius: 2,
  },
  // ── Vidéo jointe ──
  imageStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
  },
  imageThumbWrap: { position: 'relative' },
  imageThumb: {
    width: 84,
    height: 84,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  imageRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(colors.black, 0.6),
  },
  imageHint: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },

  videoAttachment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 18,
    padding: 10,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  videoPreview: {
    width: 64,
    height: 84,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
  },
  videoMeta: {
    flex: 1,
    gap: 4,
  },
  videoMetaTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontFamily: fonts.bold,
  },
  videoMetaCaption: {
    color: colors.textMuted,
    fontSize: 12.5,
    lineHeight: 17,
  },
  videoProgressTrack: {
    height: 4,
    borderRadius: 2,
    marginTop: 4,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  videoProgressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  videoRemove: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(colors.bg, 0.7),
  },

  musicAttachment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 18,
    padding: 10,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  musicAttachmentArt: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.surfaceAlt,
  },
  musicAttachmentMeta: {
    flex: 1,
    gap: 2,
  },
  musicAttachmentTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontFamily: fonts.bold,
  },
  musicAttachmentArtist: {
    color: colors.textMuted,
    fontSize: 12.5,
  },
  musicAttachmentRemove: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(colors.bg, 0.7),
  },

  voiceAttachment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 18,
    padding: 10,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  voiceAttachmentPlay: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  voiceAttachmentMeta: {
    flex: 1,
    gap: 2,
  },
  voiceAttachmentTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontFamily: fonts.bold,
  },
  voiceAttachmentDuration: {
    color: colors.textMuted,
    fontSize: 12.5,
  },
  voiceAttachmentRemove: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(colors.bg, 0.7),
  },

  spotifyPanel: {
    marginTop: 18,
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.surface,
    gap: 10,
  },
  spotifySearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  spotifySearchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontFamily: fonts.regular,
    fontSize: 14,
    paddingVertical: 4,
  },
  spotifyHint: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 12.5,
  },
  spotifyResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  spotifyResultArt: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: colors.surfaceAlt,
  },
  spotifyResultArtPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  spotifyResultMeta: {
    flex: 1,
    gap: 2,
  },
  spotifyResultTitle: {
    color: colors.textPrimary,
    fontSize: 13.5,
    fontFamily: fonts.bold,
  },
  spotifyResultArtist: {
    color: colors.textMuted,
    fontSize: 12,
  },

  tweetOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 18,
    paddingTop: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  optionChip: {
    flexGrow: 1,
    flexBasis: '30%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  optionChipActive: {
    backgroundColor: colors.accent,
  },
  optionChipSensitive: {
    backgroundColor: colors.gold,
  },
  optionText: {
    color: colors.textMuted,
    fontSize: 13,
    fontFamily: fonts.bold,
    marginLeft: 7,
    letterSpacing: 0.2,
  },
  optionTextActive: {
    color: colors.white,
  },
  translationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: colors.surface,
  },
  translationRowActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  translationCopy: {
    flex: 1,
    minWidth: 0,
  },
  translationTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  translationTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontFamily: fonts.bold,
  },
  betaTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: colors.accentMuted,
  },
  betaTagText: {
    color: colors.accent,
    fontSize: 9,
    letterSpacing: 0.8,
    fontFamily: fonts.bold,
  },
  translationCaption: {
    marginTop: 2,
    color: colors.textSecondary,
    fontSize: 11.5,
    lineHeight: 16,
    fontFamily: fonts.regular,
  },
  writingTips: {
    marginTop: 20,
    padding: 16,
    backgroundColor: colors.accentMuted,
    borderRadius: 16,
  },
  tipsTitle: {
    color: colors.accent,
    fontSize: 13,
    fontFamily: fonts.bold,
    marginBottom: 6,
  },
  tipText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: fonts.regular,
  },
  quoteContainer: {
    marginTop: 12,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  quoteLoadingText: {
    color: colors.textMuted,
    fontSize: 13,
    padding: 12,
    textAlign: 'center'
  },
});
