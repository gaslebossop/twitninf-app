import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, withAlpha } from '../theme';
import { deleteDraft, getDrafts, TweetDraft } from '../services/draftsService';

/**
 * Liste des brouillons enregistrés — reprise ou suppression.
 *
 * Volontairement sans confirmation à la suppression : un brouillon est un
 * jet, pas un document. Une boîte de dialogue par ligne transformerait le
 * ménage en corvée, alors que la perte est faible et que l'écriture repart
 * du même endroit.
 */

interface DraftsSheetProps {
  visible: boolean;
  userId: string;
  onClose: () => void;
  onPick: (draft: TweetDraft) => void;
}

function relativeDate(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `il y a ${days} j`;
  return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export default function DraftsSheet({ visible, userId, onClose, onPick }: DraftsSheetProps) {
  const [drafts, setDrafts] = useState<TweetDraft[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setDrafts(await getDrafts(userId));
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (visible) refresh();
  }, [visible, refresh]);

  const remove = useCallback(
    async (id: string) => {
      // Retrait immédiat de la liste : attendre l'écriture disque pour un
      // stockage local donnerait une impression de latence sans raison.
      setDrafts((current) => current.filter((d) => d.id !== id));
      await deleteDraft(userId, id);
    },
    [userId],
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.grabber} />

          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Brouillons</Text>
              <Text style={styles.subtitle}>
                {loading
                  ? ' '
                  : drafts.length === 0
                    ? 'Rien en attente'
                    : `${drafts.length} en attente · sur cet appareil`}
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.empty}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : drafts.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="document-text-outline" size={30} color={colors.textMuted} />
              <Text style={styles.emptyText}>
                Un tweet commencé mais pas publié atterrit ici.
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {drafts.map((draft) => (
                <Pressable
                  key={draft.id}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                  onPress={() => onPick(draft)}
                >
                  <View style={styles.rowText}>
                    <Text style={styles.rowContent} numberOfLines={2}>
                      {/* Une vidéo sans légende donnerait une ligne vide, donc
                          illisible dans la liste : on la nomme. */}
                      {draft.content?.trim() || (draft.videoUri ? 'Vidéo sans légende' : '')}
                    </Text>
                    <View style={styles.metaRow}>
                      <Text style={styles.rowMeta}>{relativeDate(draft.updatedAt)}</Text>
                      {draft.videoUri && (
                        <>
                          <Text style={styles.metaDot}>·</Text>
                          <Ionicons name="videocam" size={11} color={colors.textMuted} />
                        </>
                      )}
                      {draft.parentTweetId && (
                        <>
                          <Text style={styles.metaDot}>·</Text>
                          <Text style={styles.rowMeta}>réponse</Text>
                        </>
                      )}
                      {draft.quoteTweetId && (
                        <>
                          <Text style={styles.metaDot}>·</Text>
                          <Text style={styles.rowMeta}>citation</Text>
                        </>
                      )}
                      {draft.isPrivate && (
                        <>
                          <Text style={styles.metaDot}>·</Text>
                          <Ionicons name="lock-closed" size={10} color={colors.textMuted} />
                        </>
                      )}
                    </View>
                  </View>
                  <Pressable
                    onPress={() => remove(draft.id)}
                    hitSlop={10}
                    style={styles.deleteBtn}
                    accessibilityLabel="Supprimer ce brouillon"
                  >
                    <Ionicons name="trash-outline" size={17} color={colors.textMuted} />
                  </Pressable>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    paddingHorizontal: 20,
    // Pas d'insets : aucun SafeAreaProvider n'est monté dans cette app.
    paddingBottom: 30,
    paddingTop: 10,
    maxHeight: '80%',
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontFamily: fonts.displayHeavy,
    color: colors.textPrimary,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 44,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 30,
  },
  list: {
    maxHeight: 420,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 13,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  rowPressed: {
    borderColor: withAlpha(colors.accent, 0.4),
  },
  rowText: {
    flex: 1,
  },
  rowContent: {
    fontSize: 13.5,
    lineHeight: 19,
    fontFamily: fonts.regular,
    color: colors.textPrimary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 5,
  },
  rowMeta: {
    fontSize: 11,
    fontFamily: fonts.medium,
    color: colors.textMuted,
  },
  metaDot: {
    fontSize: 11,
    color: colors.textMuted,
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
