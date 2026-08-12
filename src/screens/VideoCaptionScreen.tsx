import { fonts , colors, statusBarStyle} from '../theme';
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  Dimensions,
  StatusBar,
  KeyboardAvoidingView,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Video, ResizeMode } from 'expo-av';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { publishVideoTweet } from '../services/videoTweetService';
import { saveDraft, deleteDraft, persistDraftVideo } from '../services/draftsService';
import { serializeOverlays, type VideoOverlay } from '../utils/videoFilters';
import { useAuth } from '../contexts/AuthContext';
import { effectiveSubscriptionTier, canUseFeature } from '../utils/subscriptionTier';
import { toast } from '../components/ui/Toast';

const { width, height } = Dimensions.get('window');

export default function VideoCaptionScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { videoUri, draftId, overlays, filterId, muted } = route.params as {
    videoUri: string;
    draftId?: string;
    overlays?: VideoOverlay[];
    filterId?: string;
    muted?: boolean;
  };

  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<'' | 'uploading' | 'processing'>('');

  const tier = effectiveSubscriptionTier(!!user?.premium, user?.subscription_tier);
  const canDraft = canUseFeature(tier, 'plus');

  /**
   * Met la vidéo de côté comme un brouillon de tweet.
   *
   * Le fichier est d'abord sorti du cache : la caméra y écrit, et le système
   * le vide sans prévenir dès qu'il manque de place. Un brouillon vidéo est
   * censé survivre à ça.
   */
  const saveAsDraft = async () => {
    if (!user?.id || isSavingDraft) return;
    setIsSavingDraft(true);
    try {
      const storedUri = await persistDraftVideo(videoUri);
      const saved = await saveDraft(user.id, {
        id: draftId,
        content: description,
        isPrivate: false,
        isSensitive: false,
        videoUri: storedUri,
      });
      if (!saved) {
        toast.success('Brouillon non enregistré', {
          description: "La vidéo n'a pas pu être mise de côté.",
        });
        return;
      }
      toast.success('Brouillon enregistré', {
        description: 'Tu le retrouveras dans tes brouillons.',
      });
      navigation.popToTop();
    } finally {
      setIsSavingDraft(false);
    }
  };

  const uploadVideo = async () => {
    if (!videoUri) return;
    setIsLoading(true);
    setUploadStatus('uploading');
    setUploadProgress(0);

    try {
      const result = await publishVideoTweet({
        videoUri,
        content: description,
        // L'habillage part avec la vidéo brute : le serveur l'applique
        // pendant son transcodage, pas nous.
        overlaysJson: overlays ? serializeOverlays(overlays) : undefined,
        filterId,
        muted,
        onProgress: (phase, percent) => {
          setUploadStatus(phase);
          setUploadProgress(percent);
        },
      });

      if (!result.success) {
        toast.error(result.message || 'Impossible de publier.');
        return;
      }

      // Publier depuis un brouillon le consomme : le laisser en place
      // laisserait une copie de la vidéo sur le disque et donnerait
      // l'impression qu'il reste quelque chose à publier.
      if (draftId && user?.id) await deleteDraft(user.id, draftId);

      toast.success('Succès 🎉', {
        description: result.message || 'Votre vidéo a été publiée !',
      });
      navigation.popToTop();
    } finally {
      setIsLoading(false);
      setUploadStatus('');
      setUploadProgress(0);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ flex: 1 }}>
          <StatusBar barStyle={statusBarStyle()} />

          {/* Video preview en haut */}
          <Video
            source={{ uri: videoUri }}
            style={styles.videoPreview}
            resizeMode={ResizeMode.COVER}
            isLooping
            shouldPlay
            isMuted={false}
          />
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.95)']} style={styles.videoFade} />

          {/* Loading */}
          {isLoading && (
            <View style={styles.loadingOverlay}>
              <View style={styles.loadingCard}>
                <ActivityIndicator size="large" color="#fe2c55" />
                <Text style={styles.loadingLabel}>
                  {uploadStatus === 'uploading' 
                    ? `Envoi vidÃ©o... ${uploadProgress}%` 
                    : `Optimisation 720p... ${uploadProgress}%`}
                </Text>
                <View style={styles.progressTrack}>
                  <LinearGradient
                    colors={['#fe2c55', '#ff6f61']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={[styles.progressFill, { width: `${uploadProgress}%` }]}
                  />
                </View>
              </View>
            </View>
          )}

          {/* Header */}
          <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Ionicons name="chevron-back" size={30} color="white" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Publier</Text>
            {/* Brouillons : avantage abonné, comme pour les tweets texte. */}
            {canDraft ? (
              <TouchableOpacity onPress={saveAsDraft} disabled={isLoading || isSavingDraft}>
                {isSavingDraft
                  ? <ActivityIndicator size="small" color="white" />
                  : <Ionicons name="bookmark-outline" size={26} color="white" />}
              </TouchableOpacity>
            ) : (
              <View style={{ width: 30 }} />
            )}
          </View>

          {/* Bottom content */}
          <View style={[styles.bottomSection, { paddingBottom: insets.bottom + 12 }]}>
            {/* Description */}
            <TextInput
              style={styles.descInput}
              placeholder="Ajoute une description, des #hashtags..."
              placeholderTextColor={colors.textMuted}
              value={description}
              onChangeText={setDescription}
              maxLength={200}
              multiline
            />

            {/* Privacy row */}
            <View style={styles.privacyRow}>
              <Ionicons name="earth" size={18} color="#888" />
              <Text style={styles.privacyText}>Tout le monde peut voir cette vidÃ©o</Text>
            </View>

            {/* Publish */}
            <TouchableOpacity
              style={[styles.publishBtn, isLoading && { opacity: 0.5 }]}
              onPress={uploadVideo}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#fe2c55', '#ff4070']}
                style={styles.publishGrad}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <>
                    <Ionicons name="arrow-up-circle" size={22} color="white" />
                    <Text style={styles.publishLabel}>Publier</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  videoPreview: { position: 'absolute', top: 0, left: 0, right: 0, height: height * 0.48 },
  videoFade: { position: 'absolute', top: height * 0.38, left: 0, right: 0, height: height * 0.12, zIndex: 5 },

  header: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, zIndex: 10,
  },
  headerTitle: { color: 'white', fontSize: 18, fontWeight: '700' },

  bottomSection: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(8,8,8,0.98)',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 20, paddingHorizontal: 18,
    zIndex: 10,
  },

  descInput: {
    color: 'white', fontSize: 15,
    backgroundColor: colors.overlaySoft,
    borderRadius: 14, padding: 14, minHeight: 80, maxHeight: 120,
    textAlignVertical: 'top',
    borderWidth: 1, borderColor: colors.overlayMedium,
    marginBottom: 12,
  },

  privacyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16,
  },
  privacyText: { color: '#888', fontSize: 13 },

  publishBtn: { borderRadius: 14, overflow: 'hidden' },
  publishGrad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16,
  },
  publishLabel: { color: 'white', fontSize: 17, fontWeight: '800' },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center', alignItems: 'center', zIndex: 20,
  },
  loadingCard: {
    backgroundColor: 'rgba(30,30,30,0.95)',
    borderRadius: 20, padding: 30, alignItems: 'center', gap: 14,
    width: width * 0.7,
    borderWidth: 1, borderColor: 'rgba(254,44,85,0.3)',
  },
  loadingLabel: { color: 'white', fontSize: 15, fontWeight: '600', fontFamily: fonts.semibold, textAlign: 'center' },
  progressTrack: {
    width: '100%', height: 6,
    backgroundColor: colors.overlayStrong,
    borderRadius: 3, overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 3 },
});
