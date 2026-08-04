import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts } from '../theme';
import { STORY_GRADIENT } from './StoryRing';
import StoryViewer from './StoryViewer';
import { toast } from './ui/Toast';
import { showActionSheet } from './ui/ActionSheet';
import storiesService, {
  StoryGroup,
  StoryHighlight,
  StoryItem,
  resolveStoryMedia,
} from '../services/storiesService';

const EMPTY_GROUP: StoryGroup = { user: null, stories: [], has_unseen: false, latest_at: null };

/**
 * Stories ACTIVES d'un profil (fenêtre 24 h) : alimente l'anneau autour de
 * l'avatar. Les stories à la une, elles, sont permanentes et gérées plus bas.
 */
export function useProfileStories(userId?: string | null) {
  const [group, setGroup] = useState<StoryGroup>(EMPTY_GROUP);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!userId) {
      setGroup(EMPTY_GROUP);
      return;
    }
    setLoading(true);
    const next = await storiesService.getUserStories(String(userId));
    setGroup(next || EMPTY_GROUP);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const nextExpiry = Math.min(
      ...group.stories
        .map((item) => new Date(item.expires_at).getTime())
        .filter((value) => Number.isFinite(value) && value > Date.now()),
    );
    if (!Number.isFinite(nextExpiry)) return;
    const timer = setTimeout(() => {
      const now = Date.now();
      setGroup((current) => {
        const stories = current.stories.filter(
          (item) => new Date(item.expires_at).getTime() > now,
        );
        return {
          ...current,
          stories,
          has_unseen: stories.some((item) => !item.seen),
        };
      });
      void reload();
    }, Math.max(250, nextExpiry - Date.now() + 250));
    return () => clearTimeout(timer);
  }, [group.stories, reload]);

  return { group, loading, reload, hasStories: group.stories.length > 0 };
}

interface ProfileStoriesProps {
  userId?: string | null;
  isOwner?: boolean;
  currentUserId?: string | null;
  style?: StyleProp<ViewStyle>;
}

/** Rail des « stories à la une » épinglées sur le profil. */
export default function ProfileStories({
  userId,
  isOwner = false,
  currentUserId,
  style,
}: ProfileStoriesProps) {
  const [highlights, setHighlights] = useState<StoryHighlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewerHighlight, setViewerHighlight] = useState<StoryHighlight | null>(null);

  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<StoryHighlight | null>(null);
  const [archive, setArchive] = useState<StoryItem[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);

  const [renameTarget, setRenameTarget] = useState<StoryHighlight | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const load = useCallback(async () => {
    if (!userId) {
      setHighlights([]);
      setLoading(false);
      return;
    }
    const list = await storiesService.getHighlights(String(userId));
    setHighlights(list);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const openPicker = async (target: StoryHighlight | null) => {
    setPickerTarget(target);
    setSelected([]);
    setTitle(target ? target.title : '');
    setPickerVisible(true);
    setArchiveLoading(true);
    const items = await storiesService.getArchive();
    setArchive(items);
    setArchiveLoading(false);
  };

  const toggleSelected = (storyId: string) => {
    setSelected((current) =>
      current.includes(storyId) ? current.filter((id) => id !== storyId) : [...current, storyId],
    );
  };

  const submitPicker = async () => {
    if (!selected.length) return;
    setSaving(true);
    try {
      const done = pickerTarget
        ? await storiesService.addToHighlight(pickerTarget.id, selected)
        : (await storiesService.createHighlight(title.trim() || 'À la une', selected, selected[0])).success;
      if (!done) {
        toast.error('Impossible d\'enregistrer la story à la une');
        return;
      }
      setPickerVisible(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const confirmRename = async () => {
    if (!renameTarget) return;
    const next = renameValue.trim();
    if (!next) return;
    const done = await storiesService.renameHighlight(renameTarget.id, next);
    setRenameTarget(null);
    if (done) await load();
    else toast.error('Renommage impossible');
  };

  const openHighlightOptions = (highlight: StoryHighlight) => {
    if (!isOwner) return;
    showActionSheet({
      title: highlight.title,
      message: `${highlight.story_count} story${highlight.story_count > 1 ? 's' : ''}`,
      items: [
        {
          label: 'Renommer',
          icon: 'text-outline',
          onPress: () => {
            setRenameValue(highlight.title);
            setRenameTarget(highlight);
          },
        },
        {
          label: 'Ajouter des stories',
          icon: 'add-circle-outline',
          onPress: () => openPicker(highlight),
        },
        {
          label: 'Supprimer',
          icon: 'trash-outline',
          destructive: true,
          onPress: async () => {
            const done = await storiesService.deleteHighlight(highlight.id);
            if (done) {
              await load();
              toast.success('À la une supprimée');
            } else {
              toast.error('Suppression impossible');
            }
          },
        },
      ],
    });
  };

  if (loading) return null;
  if (!isOwner && highlights.length === 0) return null;

  return (
    <View style={[styles.container, style]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
        {isOwner && (
          <TouchableOpacity style={styles.item} activeOpacity={0.75} onPress={() => openPicker(null)}>
            <View style={styles.addCircle}>
              <Ionicons name="add" size={26} color={colors.textPrimary} />
            </View>
            <Text style={styles.label} numberOfLines={1}>
              Nouvelle
            </Text>
          </TouchableOpacity>
        )}

        {highlights.map((highlight) => {
          const cover = resolveStoryMedia(highlight.cover_url);
          return (
            <TouchableOpacity
              key={highlight.id}
              style={styles.item}
              activeOpacity={0.75}
              onPress={() => setViewerHighlight(highlight)}
              onLongPress={() => openHighlightOptions(highlight)}
            >
              <LinearGradient
                colors={STORY_GRADIENT as unknown as string[] as any}
                start={{ x: 0.85, y: 0.05 }}
                end={{ x: 0.15, y: 0.95 }}
                style={styles.ring}
              >
                <View style={styles.ringInner}>
                  {cover ? (
                    <Image source={{ uri: cover }} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumb, styles.thumbFallback]}>
                      <Ionicons name="bookmark" size={20} color={colors.textSecondary} />
                    </View>
                  )}
                </View>
              </LinearGradient>
              <Text style={styles.label} numberOfLines={1}>
                {highlight.title}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Lecture d'une une : ses stories forment un groupe comme un autre. */}
      {viewerHighlight && (
        <StoryViewer
          visible
          groups={[{ user: null, stories: viewerHighlight.stories, has_unseen: false, latest_at: null }]}
          initialGroupIndex={0}
          currentUserId={currentUserId}
          onClose={() => setViewerHighlight(null)}
          onStoryDeleted={load}
        />
      )}

      {/* Sélecteur d'archive : créer une une ou en enrichir une existante. */}
      <Modal visible={pickerVisible} animationType="slide" transparent onRequestClose={() => setPickerVisible(false)}>
        <View style={styles.sheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setPickerVisible(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>
              {pickerTarget ? `Ajouter à « ${pickerTarget.title} »` : 'Nouvelle story à la une'}
            </Text>

            {!pickerTarget && (
              <TextInput
                style={styles.sheetInput}
                value={title}
                onChangeText={setTitle}
                placeholder="Nom (ex : Voyages)"
                placeholderTextColor={colors.textMuted}
                maxLength={40}
              />
            )}

            {archiveLoading ? (
              <View style={styles.sheetLoading}>
                <ActivityIndicator color={colors.textSecondary} />
              </View>
            ) : archive.length === 0 ? (
              <Text style={styles.sheetEmpty}>
                Aucune story dans ton archive. Publie une story, elle restera disponible ici 30 jours.
              </Text>
            ) : (
              <ScrollView contentContainerStyle={styles.grid} style={{ maxHeight: 320 }}>
                {archive.map((story) => {
                  const uri = resolveStoryMedia(story.thumbnail_url || story.media_url);
                  const index = selected.indexOf(story.id);
                  return (
                    <TouchableOpacity
                      key={story.id}
                      style={styles.gridItem}
                      activeOpacity={0.8}
                      onPress={() => toggleSelected(story.id)}
                    >
                      {uri ? (
                        <Image source={{ uri }} style={styles.gridThumb} />
                      ) : (
                        <View style={[styles.gridThumb, styles.thumbFallback]}>
                          <Ionicons name="videocam" size={18} color={colors.textSecondary} />
                        </View>
                      )}
                      {index >= 0 && (
                        <View style={styles.gridBadge}>
                          <Text style={styles.gridBadgeText}>{index + 1}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            <TouchableOpacity
              style={[styles.sheetBtn, (!selected.length || saving) && styles.sheetBtnDisabled]}
              disabled={!selected.length || saving}
              onPress={submitPicker}
              activeOpacity={0.85}
            >
              <Text style={styles.sheetBtnText}>
                {saving ? 'Enregistrement…' : pickerTarget ? 'Ajouter' : 'Créer'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetCancel} onPress={() => setPickerVisible(false)}>
              <Text style={styles.sheetCancelText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Renommage */}
      <Modal visible={!!renameTarget} animationType="fade" transparent onRequestClose={() => setRenameTarget(null)}>
        <View style={styles.dialogBackdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setRenameTarget(null)} />
          <View style={styles.dialog}>
            <Text style={styles.sheetTitle}>Renommer</Text>
            <TextInput
              style={styles.sheetInput}
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder="Nom de la story à la une"
              placeholderTextColor={colors.textMuted}
              maxLength={40}
              autoFocus
            />
            <TouchableOpacity
              style={[styles.sheetBtn, !renameValue.trim() && styles.sheetBtnDisabled]}
              disabled={!renameValue.trim()}
              onPress={confirmRename}
            >
              <Text style={styles.sheetBtnText}>Enregistrer</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetCancel} onPress={() => setRenameTarget(null)}>
              <Text style={styles.sheetCancelText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 12 },
  rail: { paddingHorizontal: 16, gap: 16 },
  item: { alignItems: 'center', width: 72 },
  addCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  ring: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  ringInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: { width: 58, height: 58, borderRadius: 29 },
  thumbFallback: { backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  label: {
    marginTop: 6,
    color: colors.textSecondary,
    fontSize: 11.5,
    fontFamily: fonts.regular,
    maxWidth: 70,
    textAlign: 'center',
  },

  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surfaceAlt,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 28,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginBottom: 14,
  },
  sheetTitle: { color: colors.textPrimary, fontSize: 17, fontFamily: fonts.display, marginBottom: 12 },
  sheetInput: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: colors.textPrimary,
    fontSize: 15,
    marginBottom: 14,
  },
  sheetLoading: { paddingVertical: 40, alignItems: 'center' },
  sheetEmpty: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: 24,
    textAlign: 'center',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 8 },
  gridItem: { width: '31%', aspectRatio: 0.62 },
  gridThumb: { width: '100%', height: '100%', borderRadius: 10 },
  gridBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#0095F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  gridBadgeText: { color: '#fff', fontSize: 11, fontFamily: fonts.bold },
  sheetBtn: {
    marginTop: 14,
    backgroundColor: '#0095F6',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  sheetBtnDisabled: { opacity: 0.45 },
  sheetBtnText: { color: '#fff', fontSize: 15, fontFamily: fonts.bold },
  sheetCancel: { paddingVertical: 12, alignItems: 'center' },
  sheetCancelText: { color: colors.textSecondary, fontSize: 14, fontFamily: fonts.semibold },

  dialogBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 400, backgroundColor: colors.surfaceAlt, borderRadius: 18, padding: 18 },
});
