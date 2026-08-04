import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
  StyleProp,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors, fonts } from '../theme';
import StoryRing from './StoryRing';
import StoryViewer from './StoryViewer';
import { toast } from './ui/Toast';
import storiesService, {
  StoriesFeed,
  StoryGroup,
  resolveAvatar,
} from '../services/storiesService';

interface StoriesTrayProps {
  currentUser?: { id?: string; username?: string; avatar?: string | null } | null;
  /** Incrémenter cette valeur force un rechargement (pull-to-refresh du fil). */
  refreshSignal?: number;
  /** Fond derrière l'anneau : doit matcher la surface d'accueil. */
  backgroundColor?: string;
  onOpenProfile?: (author: { id: string; username: string }) => void;
  onSendMessage?: (author: { id: string; username: string }, text: string) => void;
  style?: StyleProp<ViewStyle>;
}

const AVATAR_SIZE = 62;

function withoutExpiredStories(group: StoryGroup, now = Date.now()): StoryGroup {
  const stories = group.stories.filter((item) => {
    const expiresAt = new Date(item.expires_at).getTime();
    return Number.isFinite(expiresAt) && expiresAt > now;
  });
  return {
    ...group,
    stories,
    has_unseen: stories.some((item) => !item.seen),
  };
}

export default function StoriesTray({
  currentUser,
  refreshSignal = 0,
  backgroundColor = colors.bg,
  onOpenProfile,
  onSendMessage,
  style,
}: StoriesTrayProps) {
  const [feed, setFeed] = useState<StoriesFeed>({
    self: { user: null, stories: [], has_unseen: false, latest_at: null },
    groups: [],
  });
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerGroups, setViewerGroups] = useState<StoryGroup[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  const load = useCallback(async () => {
    const data = await storiesService.getFeed();
    setFeed(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshSignal]);

  // Une story peut expirer pendant que l'app reste ouverte : on retire son
  // anneau exactement à l'échéance, sans attendre un pull-to-refresh.
  useEffect(() => {
    const allStories = [feed.self, ...feed.groups].flatMap((group) => group.stories);
    const nextExpiry = Math.min(
      ...allStories
        .map((item) => new Date(item.expires_at).getTime())
        .filter((value) => Number.isFinite(value) && value > Date.now()),
    );
    if (!Number.isFinite(nextExpiry)) return;
    const timer = setTimeout(() => {
      const now = Date.now();
      setFeed((current) => ({
        self: withoutExpiredStories(current.self, now),
        groups: current.groups
          .map((group) => withoutExpiredStories(group, now))
          .filter((group) => group.stories.length > 0),
      }));
      setViewerVisible(false);
      setViewerGroups([]);
      void load();
    }, Math.max(250, nextExpiry - Date.now() + 250));
    return () => clearTimeout(timer);
  }, [feed, load]);

  const openGroup = (groups: StoryGroup[], index: number) => {
    if (!groups[index]?.stories?.length) return;
    setViewerGroups(groups);
    setViewerIndex(index);
    setViewerVisible(true);
  };

  const handleAddStory = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        toast.error('Autorisation requise', {
          description: 'Autorise l\'accès à tes photos pour publier une story.',
        });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        // Ne jamais recadrer ici : une story accepte aussi bien un paysage,
        // un portrait, un carré ou une vidéo et le viewer les adapte ensuite.
        allowsEditing: false,
        quality: 0.85,
        videoMaxDuration: 15,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) return;

      setPublishing(true);
      const uploaded = await storiesService.publish(asset.uri, {
        isVideo: asset.type === 'video',
      });
      if (!uploaded.success) {
        toast.error(uploaded.message || 'Publication impossible');
        return;
      }
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Publication impossible');
    } finally {
      setPublishing(false);
    }
  };

  const handleSelfPress = () => {
    if (feed.self.stories.length > 0) {
      openGroup([feed.self, ...feed.groups], 0);
      return;
    }
    handleAddStory();
  };

  /** Marque localement la story comme vue pour éteindre l'anneau sans recharger. */
  const markSeenLocally = (storyId: string) => {
    setFeed((current) => ({
      self: current.self,
      groups: current.groups.map((group) => {
        if (!group.stories.some((item) => item.id === storyId)) return group;
        const stories = group.stories.map((item) => (item.id === storyId ? { ...item, seen: true } : item));
        return { ...group, stories, has_unseen: stories.some((item) => !item.seen) };
      }),
    }));
    setViewerGroups((current) =>
      current.map((group) => ({
        ...group,
        stories: group.stories.map((item) => (item.id === storyId ? { ...item, seen: true } : item)),
      })),
    );
  };

  const removeStoryLocally = (storyId: string) => {
    setFeed((current) => ({
      self: {
        ...current.self,
        stories: current.self.stories.filter((item) => item.id !== storyId),
      },
      groups: current.groups
        .map((group) => ({ ...group, stories: group.stories.filter((item) => item.id !== storyId) }))
        .filter((group) => group.stories.length > 0),
    }));
    setViewerGroups((current) =>
      current
        .map((group) => ({ ...group, stories: group.stories.filter((item) => item.id !== storyId) }))
        .filter((group) => group.stories.length > 0),
    );
  };

  const updateLikeLocally = (storyId: string, liked: boolean, likesCount: number) => {
    const updateGroup = (group: StoryGroup): StoryGroup => ({
      ...group,
      stories: group.stories.map((item) =>
        item.id === storyId ? { ...item, liked, likes_count: likesCount } : item,
      ),
    });
    setFeed((current) => ({
      self: updateGroup(current.self),
      groups: current.groups.map(updateGroup),
    }));
    setViewerGroups((current) => current.map(updateGroup));
  };

  const hasAnything = feed.self.stories.length > 0 || feed.groups.length > 0;
  if (loading && !hasAnything) {
    return (
      <View style={[styles.container, styles.loadingContainer, style]}>
        <ActivityIndicator size="small" color={colors.textMuted} />
      </View>
    );
  }

  const selfAvatar = resolveAvatar(feed.self.user?.avatar || currentUser?.avatar || null);
  const selfHasStory = feed.self.stories.length > 0;

  return (
    <View style={[styles.container, style]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
      >
        {/* « Votre story » — toujours en tête, comme sur Instagram */}
        <TouchableOpacity style={styles.item} activeOpacity={0.75} onPress={handleSelfPress}>
          <View>
            <StoryRing
              size={AVATAR_SIZE}
              uri={selfAvatar}
              label={currentUser?.username || feed.self.user?.username}
              hasStory={selfHasStory}
              seen
              showPlus={!selfHasStory}
              gapColor={backgroundColor}
            />
            {publishing && (
              <View style={styles.publishingOverlay}>
                <ActivityIndicator size="small" color="#fff" />
              </View>
            )}
          </View>
          <Text style={styles.label} numberOfLines={1}>
            Votre story
          </Text>
        </TouchableOpacity>

        {selfHasStory && (
          <TouchableOpacity style={styles.item} activeOpacity={0.75} onPress={handleAddStory}>
            <StoryRing
              size={AVATAR_SIZE}
              uri={selfAvatar}
              label={currentUser?.username}
              hasStory={false}
              showPlus
              gapColor={backgroundColor}
            />
            <Text style={styles.label} numberOfLines={1}>
              Ajouter
            </Text>
          </TouchableOpacity>
        )}

        {feed.groups.map((group, index) => (
          <TouchableOpacity
            key={group.user?.id || `group-${index}`}
            style={styles.item}
            activeOpacity={0.75}
            onPress={() => openGroup(feed.groups, index)}
          >
            <StoryRing
              size={AVATAR_SIZE}
              uri={resolveAvatar(group.user?.avatar)}
              label={group.user?.username}
              hasStory
              seen={!group.has_unseen}
              gapColor={backgroundColor}
            />
            <Text style={styles.label} numberOfLines={1}>
              {group.user?.username || 'story'}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <StoryViewer
        visible={viewerVisible}
        groups={viewerGroups}
        initialGroupIndex={viewerIndex}
        currentUserId={currentUser?.id || feed.self.user?.id || null}
        onClose={() => setViewerVisible(false)}
        onStorySeen={markSeenLocally}
        onStoryLiked={updateLikeLocally}
        onStoryDeleted={removeStoryLocally}
        onOpenProfile={onOpenProfile}
        onSendMessage={onSendMessage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingVertical: 10,
  },
  loadingContainer: { alignItems: 'center', justifyContent: 'center', height: 108 },
  rail: { paddingHorizontal: 10, gap: 14 },
  item: { alignItems: 'center', width: 76 },
  label: {
    marginTop: 6,
    color: colors.textSecondary,
    fontSize: 11.5,
    fontFamily: fonts.regular,
    maxWidth: 72,
    textAlign: 'center',
  },
  publishingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 40,
  },
});
