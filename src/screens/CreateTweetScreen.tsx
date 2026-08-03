import { colors, fonts, glow, withAlpha } from '../theme';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Animated,
  Alert,
  ActionSheetIOS,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  useWindowDimensions,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Video, ResizeMode } from 'expo-av';
import { apiService } from '../services';
import { publishVideoTweet, type VideoUploadPhase } from '../services/videoTweetService';
import { neuralRankService } from '../services/neuralRankService';
import { CreateTweetRequest, Tweet } from '../types/api';
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
import { countDrafts, saveDraft, deleteDraft, TweetDraft } from '../services/draftsService';
import { useHeaderMetrics } from '../hooks/useHeaderMetrics';

interface CreateTweetScreenProps {
  navigation: any;
  route: {
    params?: {
      parentTweetId?: string;
      replyTo?: string;
      quoteTweetId?: string;
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
  const [loading, setLoading] = useState(false);
  const [charCount, setCharCount] = useState(0);

  // ── Vidéo jointe ──
  // L'option vivait dans un bouton flottant séparé du composeur : on ne
  // pouvait ni écrire sa légende ici, ni régler la visibilité du tweet. Elle
  // est maintenant une pièce jointe du tweet en cours d'écriture.
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoPhase, setVideoPhase] = useState<VideoUploadPhase | null>(null);
  const [videoPercent, setVideoPercent] = useState(0);

  // Lu ici et pas plus bas : le brouillon en cours a besoin de son contexte
  // (réponse / citation) pour être réenregistré au bon endroit.
  const { parentTweetId, replyTo, quoteTweetId } = route.params || {};

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
      Alert.alert('Brouillon enregistré', 'Tu le retrouveras depuis l\'icône brouillons.');
    }
  }, [persistDraft]);

  const handlePickDraft = useCallback((draft: TweetDraft) => {
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
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const inputScaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

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

  const pickVideo = useCallback(async (fromCamera: boolean) => {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        'Permission requise',
        fromCamera
          ? "L'accès à la caméra est nécessaire pour filmer."
          : "L'accès à la galerie est nécessaire pour choisir une vidéo.",
      );
      return;
    }

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: true,
      videoMaxDuration: 60,
      quality: 1,
    };

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

    if (!result.canceled && result.assets?.[0]) {
      setVideoUri(result.assets[0].uri);
    }
  }, []);

  const handleAddVideo = useCallback(() => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Annuler', 'Filmer', 'Choisir dans la galerie'],
          cancelButtonIndex: 0,
          title: 'Ajouter une vidéo',
          message: 'Durée max : 60 secondes',
        },
        (index) => {
          if (index === 1) pickVideo(true);
          if (index === 2) pickVideo(false);
        },
      );
      return;
    }

    Alert.alert('Ajouter une vidéo', 'Durée max : 60 secondes', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Filmer', onPress: () => pickVideo(true) },
      { text: 'Galerie', onPress: () => pickVideo(false) },
    ]);
  }, [pickVideo]);

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
        onProgress: (phase, percent) => {
          setVideoPhase(phase);
          setVideoPercent(percent);
        },
      });

      if (!result.success) {
        Alert.alert('Erreur', result.message || 'Impossible de publier la vidéo.');
        return;
      }

      if (result.tweetId) neuralRankService.onPublish(result.tweetId);

      if (editingDraftId && currentUser?.id) {
        await deleteDraft(currentUser.id, editingDraftId);
        setEditingDraftId(null);
        await refreshDraftCount();
      }

      Alert.alert(
        'Succès !',
        result.message || 'Vidéo publiée avec succès !',
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } finally {
      setLoading(false);
      setVideoPhase(null);
      setVideoPercent(0);
    }
  };

  const handleSubmit = async () => {
    // Une vidéo se suffit à elle-même : seule une publication sans média
    // exige du texte.
    if (!content.trim() && !videoUri) {
      Alert.alert('Erreur', 'Le contenu du tweet ne peut pas être vide');
      return;
    }

    if (content.length > MAX_CHARS) {
      Alert.alert('Erreur', `Le tweet ne peut pas dépasser ${MAX_CHARS} caractères`);
      return;
    }

    if (videoUri) {
      // La file hors ligne ne sait rejouer qu'un tweet texte : mettre une
      // vidéo en attente reviendrait à la perdre au retour du réseau.
      if (offlineEnabled && !online) {
        Alert.alert(
          'Hors ligne',
          "L'envoi d'une vidéo demande une connexion. Réessaie une fois en ligne.",
        );
        return;
      }
      await submitVideoTweet();
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
        Alert.alert(
          'En attente de réseau',
          'Ton tweet est enregistré : il sera publié automatiquement dès que la connexion revient.',
          [{ text: 'OK', onPress: () => navigation.goBack() }],
        );
        return;
      }
    }

    try {
      setLoading(true);

      const tweetData: CreateTweetRequest = {
        content: content.trim(),
        parent_tweet_id: parentTweetId,
        is_private: isPrivate,
        is_sensitive: isSensitive,
        translation_enabled: translationEnabled,
        language: 'fr',
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

        // Un brouillon publié n'a plus lieu d'être : le laisser en liste
        // ferait republier le même texte à la prochaine reprise.
        if (editingDraftId && currentUser?.id) {
          await deleteDraft(currentUser.id, editingDraftId);
          setEditingDraftId(null);
          await refreshDraftCount();
        }

        Alert.alert(
          'Succès !',
          parentTweetId ? 'Réponse publiée avec succès !' : quoteTweetId ? 'Citation publiée avec succès !' : 'Tweet publié avec succès !',
          [
            {
              text: 'OK',
              onPress: () => {
                navigation.goBack();
              },
            },
          ]
        );
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

          Alert.alert(title, message, [
            { text: 'Compris', style: 'default' }
          ]);
        } else {
          // Erreur normale
          Alert.alert('Erreur', response.message || 'Erreur lors de la publication');
        }
      }
    } catch (error) {
      console.error('Erreur lors de la création du tweet:', error);
      Alert.alert('Erreur', 'Impossible de publier le tweet. Vérifiez votre connexion.');
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
      Alert.alert(
        'Garder ce tweet ?',
        'Tu peux l\'enregistrer en brouillon et le reprendre plus tard.',
        [
          { text: 'Continuer l\'édition', style: 'cancel' },
          {
            text: 'Supprimer',
            style: 'destructive',
            onPress: () => navigation.goBack(),
          },
          {
            text: 'Enregistrer',
            onPress: async () => {
              await persistDraft();
              navigation.goBack();
            },
          },
        ]
      );
      return;
    }

    Alert.alert(
      'Annuler la publication',
      'Êtes-vous sûr de vouloir annuler ? Votre tweet sera perdu.',
      [
        { text: 'Continuer l\'édition', style: 'cancel' },
        { text: 'Annuler', style: 'destructive', onPress: () => navigation.goBack() },
      ]
    );
  };

  const isSubmitDisabled =
    (!content.trim() && !videoUri) || content.length > MAX_CHARS || loading;
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
        barStyle="light-content"
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
                        friction: 7,
                        useNativeDriver: true,
                      }).start();
                    }}
                    onBlur={() => {
                      Animated.spring(inputScaleAnim, {
                        toValue: 1,
                        tension: 50,
                        friction: 7,
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

                {/* Options du tweet — chips pleins style segmented */}
                <View style={styles.tweetOptions}>
                  {canAttachVideo && !videoUri && (
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

  tweetOptions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
    paddingTop: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  optionChip: {
    flex: 1,
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
