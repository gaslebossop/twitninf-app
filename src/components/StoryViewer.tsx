import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
// La barre de progression passe par Reanimated : elle tourne pendant TOUTE la
// lecture d'une story, et `width` n'est pas animable par le native driver
// d'`Animated` — chaque frame traversait donc le pont JS, en concurrence avec
// le décodage de la photo ou de la vidéo. Mêmes durées, même easing.
import Reanimated, {
  cancelAnimation,
  Easing as REasing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Video, ResizeMode } from 'expo-av';
import { fonts , colors, statusBarStyle} from '../theme';
import { useHeaderMetrics } from '../hooks/useHeaderMetrics';
import VerifiedBadge from './VerifiedBadge';
import { toast } from './ui/Toast';
import { confirmAsync } from './ui/ConfirmSheet';
import storiesService, {
  StoryGroup,
  formatStoryAge,
  resolveAvatar,
  resolveStoryMedia,
} from '../services/storiesService';

interface StoryViewerProps {
  visible: boolean;
  groups: StoryGroup[];
  initialGroupIndex?: number;
  currentUserId?: string | null;
  onClose: () => void;
  /** Remonte chaque story consommée pour rafraîchir les anneaux du tray. */
  onStorySeen?: (storyId: string, userId: string) => void;
  onStoryLiked?: (storyId: string, liked: boolean, likesCount: number) => void;
  onStoryDeleted?: (storyId: string) => void;
  onOpenProfile?: (author: { id: string; username: string }) => void;
  onSendMessage?: (author: { id: string; username: string }, text: string) => void;
}

const SWIPE_CLOSE_DISTANCE = 110;

export default function StoryViewer({
  visible,
  groups,
  initialGroupIndex = 0,
  currentUserId,
  onClose,
  onStorySeen,
  onStoryLiked,
  onStoryDeleted,
  onOpenProfile,
  onSendMessage,
}: StoryViewerProps) {
  const { width, height } = useWindowDimensions();
  const { top: headerTopInset } = useHeaderMetrics();
  const [groupIndex, setGroupIndex] = useState(initialGroupIndex);
  const [storyIndex, setStoryIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [replySent, setReplySent] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [likeBusy, setLikeBusy] = useState(false);

  const progress = useSharedValue(0);
  const translateY = useRef(new Animated.Value(0)).current;
  const pressStartedAt = useRef(0);
  const seenRef = useRef<Set<string>>(new Set());

  const group = groups[groupIndex];
  const stories = group?.stories || [];
  const story = stories[storyIndex];
  const author = story?.author || group?.user || null;
  const isMine = !!(author?.id && currentUserId && String(author.id) === String(currentUserId));

  // Réinitialise la position à chaque ouverture : rouvrir le viewer sur un
  // autre auteur ne doit pas reprendre là où la session précédente s'est arrêtée.
  useEffect(() => {
    if (!visible) return;
    setGroupIndex(initialGroupIndex);
    setStoryIndex(0);
    setPaused(false);
    setReply('');
    setReplySent(false);
    translateY.setValue(0);
    seenRef.current = new Set();
  }, [visible, initialGroupIndex, translateY]);

  useEffect(() => {
    if (visible && groups.length > 0 && groups.every((item) => item.stories.length === 0)) {
      onClose();
    }
  }, [groups, onClose, visible]);

  const stopAnimation = useCallback(() => {
    cancelAnimation(progress);
  }, [progress]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  const goNext = useCallback(() => {
    stopAnimation();
    if (storyIndex < stories.length - 1) {
      setStoryIndex((index) => index + 1);
      return;
    }
    if (groupIndex < groups.length - 1) {
      setGroupIndex((index) => index + 1);
      setStoryIndex(0);
      return;
    }
    onClose();
  }, [groupIndex, groups.length, onClose, stopAnimation, storyIndex, stories.length]);

  const goPrevious = useCallback(() => {
    stopAnimation();
    if (storyIndex > 0) {
      setStoryIndex((index) => index - 1);
      return;
    }
    if (groupIndex > 0) {
      const previousGroup = groups[groupIndex - 1];
      setGroupIndex(groupIndex - 1);
      setStoryIndex(Math.max(0, (previousGroup?.stories?.length || 1) - 1));
      return;
    }
    progress.value = 0;
    setStoryIndex(0);
  }, [groupIndex, groups, progress, stopAnimation, storyIndex]);

  const runProgress = useCallback(
    (from: number, duration: number) => {
      stopAnimation();
      progress.value = from;
      progress.value = withTiming(
        1,
        { duration: Math.max(300, duration), easing: REasing.inOut(REasing.ease) },
        (finished) => {
          // `cancelAnimation` rappelle avec `finished` à faux : une pause ne
          // fait donc pas passer à la story suivante.
          if (finished) runOnJS(goNext)();
        },
      );
    },
    [goNext, progress, stopAnimation],
  );

  // Démarrage / redémarrage de la barre de progression sur changement de story.
  useEffect(() => {
    if (!visible || !story) return;
    setMediaLoading(story.media_type === 'video');
    setLiked(!!story.liked);
    setLikesCount(Number(story.likes_count || 0));
    setReply('');
    setReplySent(false);
    progress.value = 0;
    runProgress(0, story.duration_ms || 5000);

    if (!isMine && !seenRef.current.has(story.id)) {
      seenRef.current.add(story.id);
      storiesService.markViewed(story.id);
      onStorySeen?.(story.id, String(story.user_id));
    }

    return stopAnimation;
    // `runProgress` change à chaque rendu utile ; la dépendance sur l'identité
    // de la story suffit à cadrer le redémarrage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, story?.id]);

  // Pause / reprise : Animated n'a pas de pause native, on relance donc une
  // nouvelle animation sur la durée restante à partir de la valeur courante.
  useEffect(() => {
    if (!visible || !story) return;
    if (paused) {
      stopAnimation();
      return;
    }
    const remaining = (1 - progress.value) * (story.duration_ms || 5000);
    if (remaining > 0) runProgress(progress.value, remaining);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dy) > 14 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.6,
        onPanResponderGrant: () => setPaused(true),
        onPanResponderMove: (_event, gesture) => {
          if (gesture.dy > 0) translateY.setValue(gesture.dy);
        },
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dy > SWIPE_CLOSE_DISTANCE) {
            onClose();
            return;
          }
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 6,
          }).start();
          setPaused(false);
        },
        onPanResponderTerminate: () => {
          translateY.setValue(0);
          setPaused(false);
        },
      }),
    [onClose, translateY],
  );

  const handlePressIn = () => {
    pressStartedAt.current = Date.now();
    setPaused(true);
  };

  const handlePressOut = (direction: 'previous' | 'next') => {
    const held = Date.now() - pressStartedAt.current;
    setPaused(false);
    if (held < 260) {
      if (direction === 'next') goNext();
      else goPrevious();
    }
  };

  const handleDelete = () => {
    if (!story) return;
    confirmAsync({
      title: 'Supprimer la story',
      message: 'Cette story sera définitivement supprimée.',
      confirmLabel: 'Supprimer',
      destructive: true,
    }).then((ok) => {
      if (ok) (async () => {
          const done = await storiesService.remove(story.id);
          if (done) {
            onStoryDeleted?.(story.id);
            goNext();
          } else {
            toast.error('Suppression impossible');
          }
        })();
    });
  };

  const handleSendReply = async () => {
    const text = reply.trim();
    if (!text || !author?.id || !story || sendingReply) return;
    setPaused(true);
    setSendingReply(true);
    const result = await storiesService.reply(story.id, String(author.id), text);
    setSendingReply(false);
    if (!result.success) {
      setPaused(false);
      toast.error('Réponse impossible', {
        description: result.message || 'Réessaie dans un instant.',
      });
      return;
    }
    setReply('');
    setReplySent(true);
    Keyboard.dismiss();
    setPaused(false);
  };

  const handleToggleLike = async () => {
    if (!story || likeBusy) return;
    const previousLiked = liked;
    const previousCount = likesCount;
    const nextLiked = !previousLiked;
    setLiked(nextLiked);
    setLikesCount(Math.max(0, previousCount + (nextLiked ? 1 : -1)));
    setLikeBusy(true);
    const result = await storiesService.setLiked(story.id, nextLiked);
    setLikeBusy(false);
    if (!result.success) {
      setLiked(previousLiked);
      setLikesCount(previousCount);
      toast.error('Like impossible', {
        description: result.message || 'Réessaie dans un instant.',
      });
      return;
    }
    setLiked(result.liked);
    setLikesCount(result.likes_count);
    onStoryLiked?.(story.id, result.liked, result.likes_count);
  };

  // Groupe vide (dernière story supprimée, chargement en cours) : on garde une
  // sortie possible plutôt que d'enfermer l'utilisateur sur un écran noir.
  if (!visible || !story || !group) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <Pressable style={styles.emptyBackdrop} onPress={onClose}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.emptyHint}>Toucher pour fermer</Text>
        </Pressable>
      </Modal>
    );
  }

  const mediaUri = resolveStoryMedia(story.media_url);
  const avatarUri = resolveAvatar(author?.avatar);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent={false}
    >
      <StatusBar barStyle={statusBarStyle()} backgroundColor="#000" />
      <KeyboardAvoidingView
        style={styles.keyboardRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <Animated.View
          style={[styles.root, { transform: [{ translateY }] }]}
          {...panResponder.panHandlers}
        >
        <View style={[styles.mediaWrap, { width, height }]}>
          {/* Le média est affiché ENTIER (`contain`). Les photos qui ne sont pas
              en 9:16 laisseraient sinon des bandes noires : on remplit le fond
              avec le même visuel flouté, comme Instagram. */}
          {story.media_type !== 'video' && (
            <Image
              source={{ uri: mediaUri || '' }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              blurRadius={28}
            />
          )}
          {story.media_type === 'video' ? (
            <Video
              source={{ uri: mediaUri || '' }}
              style={StyleSheet.absoluteFill}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={!paused}
              isLooping={false}
              isMuted={false}
              onLoad={() => setMediaLoading(false)}
            />
          ) : (
            <Image
              source={{ uri: mediaUri || '' }}
              style={StyleSheet.absoluteFill}
              resizeMode="contain"
              onLoadEnd={() => setMediaLoading(false)}
            />
          )}
          {mediaLoading && (
            <View style={styles.mediaLoader}>
              <ActivityIndicator color="#fff" />
            </View>
          )}
        </View>

        {/* Voiles haut/bas : garantissent la lisibilité du header et du composer
            quelle que soit la photo affichée. */}
        <LinearGradient
          colors={['rgba(0,0,0,0.65)', 'rgba(0,0,0,0)']}
          style={[styles.topScrim, { width }]}
          pointerEvents="none"
        />
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.72)']}
          style={[styles.bottomScrim, { width }]}
          pointerEvents="none"
        />

        {/* Zones de tap : gauche = précédent, droite = suivant, appui long = pause */}
        <Pressable
          style={[styles.tapZone, { width: width * 0.32, height }]}
          onPressIn={handlePressIn}
          onPressOut={() => handlePressOut('previous')}
        />
        <Pressable
          style={[styles.tapZone, styles.tapZoneRight, { width: width * 0.68, height }]}
          onPressIn={handlePressIn}
          onPressOut={() => handlePressOut('next')}
        />

        <View style={[styles.header, { top: headerTopInset }]} pointerEvents="box-none">
          <View style={styles.progressRow}>
            {stories.map((item, index) => (
              <View key={item.id} style={styles.progressTrack}>
                <Reanimated.View
                  style={[
                    styles.progressFill,
                    index < storyIndex && styles.progressFillDone,
                    index === storyIndex && progressStyle,
                  ]}
                />
              </View>
            ))}
          </View>

          <View style={styles.headerRow}>
            <TouchableOpacity
              style={styles.headerIdentity}
              activeOpacity={0.8}
              onPress={() => {
                if (!author?.id) return;
                onClose();
                onOpenProfile?.({ id: String(author.id), username: author.username });
              }}
            >
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.headerAvatar} />
              ) : (
                <View style={[styles.headerAvatar, styles.headerAvatarFallback]}>
                  <Text style={styles.headerAvatarText}>
                    {(author?.username || 'U').slice(0, 1).toUpperCase()}
                  </Text>
                </View>
              )}
              <Text style={styles.headerName} numberOfLines={1}>
                {author?.username || 'story'}
              </Text>
              {!!author?.verified && (
                <VerifiedBadge verificationStyle={(author?.verification_style as any) || 'default'} size={13} />
              )}
              <Text style={styles.headerAge}>{formatStoryAge(story.created_at)}</Text>
            </TouchableOpacity>

            <View style={styles.headerActions}>
              {isMine && (
                <TouchableOpacity onPress={handleDelete} hitSlop={hitSlop} style={styles.headerBtn}>
                  <Ionicons name="trash-outline" size={20} color="#fff" />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onClose} hitSlop={hitSlop} style={styles.headerBtn}>
                <Ionicons name="close" size={26} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {!!story.caption && (
          <View style={[styles.captionWrap, { width }]} pointerEvents="none">
            <Text style={styles.caption}>{story.caption}</Text>
          </View>
        )}

        <View style={[styles.footer, { width }]} pointerEvents="box-none">
          {isMine ? (
            <View style={styles.viewsRow}>
              <Ionicons name="eye-outline" size={18} color="#fff" />
              <Text style={styles.viewsText}>
                {story.views_count} vue{story.views_count > 1 ? 's' : ''}
              </Text>
              <Ionicons name="heart" size={17} color="#ff3b5c" style={styles.ownerLikeIcon} />
              <Text style={styles.viewsText}>{likesCount}</Text>
            </View>
          ) : (
            <>
              {replySent && <Text style={styles.replySent}>Réponse envoyée</Text>}
              <View style={styles.replyRow}>
                <TextInput
                  style={styles.replyInput}
                  value={reply}
                  onChangeText={(value) => {
                    setReply(value);
                    setReplySent(false);
                  }}
                  placeholder={`Répondre à ${author?.username || 'cette story'}...`}
                  placeholderTextColor={colors.textPrimary}
                  onFocus={() => {
                    setPaused(true);
                    setReplySent(false);
                  }}
                  onBlur={() => setPaused(false)}
                  returnKeyType="send"
                  editable={!sendingReply}
                  onSubmitEditing={() => void handleSendReply()}
                />
                {reply.trim().length > 0 ? (
                  <TouchableOpacity
                    disabled={sendingReply}
                    onPress={() => void handleSendReply()}
                    hitSlop={hitSlop}
                    style={styles.footerBtn}
                  >
                    {sendingReply
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Ionicons name="send" size={22} color="#fff" />}
                  </TouchableOpacity>
                ) : (
                  <>
                    <TouchableOpacity
                      hitSlop={hitSlop}
                      disabled={likeBusy}
                      style={styles.footerBtn}
                      onPress={() => void handleToggleLike()}
                    >
                      <Ionicons
                        name={liked ? 'heart' : 'heart-outline'}
                        size={25}
                        color={liked ? '#ff3b5c' : '#fff'}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      hitSlop={hitSlop}
                      style={styles.footerBtn}
                      onPress={() => author?.id && onSendMessage?.({ id: String(author.id), username: author.username }, '')}
                    >
                      <Ionicons name="paper-plane-outline" size={22} color="#fff" />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </>
          )}
        </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const hitSlop = { top: 10, bottom: 10, left: 10, right: 10 };

const styles = StyleSheet.create({
  keyboardRoot: { flex: 1, backgroundColor: '#000' },
  root: { flex: 1, backgroundColor: '#000' },
  emptyBackdrop: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyHint: { color: colors.textSecondary, fontSize: 13, fontFamily: fonts.regular },
  mediaWrap: { position: 'absolute', top: 0, left: 0, backgroundColor: '#000' },
  mediaLoader: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },

  topScrim: { position: 'absolute', top: 0, left: 0, height: 160 },
  bottomScrim: { position: 'absolute', bottom: 0, left: 0, height: 190 },

  tapZone: { position: 'absolute', top: 0, left: 0 },
  tapZoneRight: { left: undefined, right: 0 },

  header: {
    position: 'absolute',
    // `top` réel posé à l'appel (useHeaderMetrics), pas une valeur devinée.
    left: 0,
    right: 0,
    paddingHorizontal: 12,
  },
  progressRow: { flexDirection: 'row', gap: 3 },
  progressTrack: {
    flex: 1,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: colors.textMuted,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', width: '0%', backgroundColor: '#fff', borderRadius: 2 },
  progressFillDone: { width: '100%' },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  headerIdentity: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 },
  headerAvatar: { width: 32, height: 32, borderRadius: 16 },
  headerAvatarFallback: { backgroundColor: '#333', alignItems: 'center', justifyContent: 'center' },
  headerAvatarText: { color: '#fff', fontWeight: '700', fontFamily: fonts.bold, fontSize: 13 },
  headerName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fonts.bold,
    maxWidth: '55%',
  },
  headerAge: { color: colors.textPrimary, fontSize: 13 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerBtn: { padding: 2 },

  captionWrap: { position: 'absolute', bottom: 118, paddingHorizontal: 20 },
  caption: {
    color: '#fff',
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 6,
  },

  footer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 34 : 20,
    paddingHorizontal: 14,
  },
  replyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  replySent: {
    color: '#fff',
    fontSize: 12,
    fontFamily: fonts.bold,
    textAlign: 'center',
    marginBottom: 8,
  },
  replyInput: {
    flex: 1,
    height: 46,
    borderRadius: 23,
    borderWidth: 1.2,
    borderColor: colors.textSecondary,
    paddingHorizontal: 18,
    color: '#fff',
    fontSize: 14,
  },
  footerBtn: { padding: 4 },
  ownerLikeIcon: { marginLeft: 8 },
  viewsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  viewsText: { color: '#fff', fontSize: 13, fontWeight: '600', fontFamily: fonts.bold },
});
