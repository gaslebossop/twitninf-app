import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenBackground, BackButton } from '../components/ui';
import { useHeaderMetrics, HEADER_CONTENT_HEIGHT } from '../hooks/useHeaderMetrics';
import { colors, radius } from '../theme';
import { toast } from '../components/ui/Toast';
import {
  BLOCK_LABELS,
  editTweet,
  fetchEditability,
  fetchHistory,
  formatRemaining,
  type Editability,
  type EditRevision,
} from '../services/tweetEditService';

/**
 * Modification d'un tweet publié — avantage abonné.
 *
 * Deux partis pris assumés à l'écran :
 *
 * - **Le compte à rebours est visible en permanence.** La fenêtre est de 30
 *   minutes ; laisser quelqu'un écrire une correction puis se faire refuser
 *   à l'envoi serait la pire manière de le lui apprendre.
 * - **L'historique est affiché sous l'éditeur, pas caché derrière un menu.**
 *   C'est ce qui rend l'édition acceptable : les versions précédentes restent
 *   publiques. Le masquer transformerait la fonctionnalité en réécriture
 *   silencieuse d'un texte que d'autres ont déjà partagé.
 */

interface Props {
  navigation: any;
  route: { params: { tweetId: string; content?: string } };
}

export default function EditTweetScreen({ navigation, route }: Props) {
  const { top: headerTopInset } = useHeaderMetrics();
  const { tweetId, content: initialContent } = route.params;

  const [content, setContent] = useState(initialContent || '');
  const [state, setState] = useState<Editability | null>(null);
  const [history, setHistory] = useState<EditRevision[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [remaining, setRemaining] = useState(0);

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const [editability, revisions] = await Promise.all([
        fetchEditability(tweetId),
        fetchHistory(tweetId).catch(() => []),
      ]);
      setState(editability);
      setRemaining(editability.remaining_ms);
      setHistory(revisions);
    } catch (e: any) {
      toast.error('Modification indisponible', {
        description: e?.message || 'Réessaie dans un instant.',
      });
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [tweetId, navigation]);

  useEffect(() => { load(); }, [load]);

  /**
   * Décompte local plutôt qu'un rappel au serveur toutes les secondes : la
   * fenêtre est connue dès le premier appel, et c'est le serveur qui tranche
   * de toute façon au moment de l'envoi.
   */
  useEffect(() => {
    if (!state?.can_edit) return undefined;
    tickRef.current = setInterval(() => {
      setRemaining((prev) => Math.max(0, prev - 1000));
    }, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [state?.can_edit]);

  const expired = remaining <= 0;
  const unchanged = content.trim() === (initialContent || '').trim();

  const save = async () => {
    if (saving || unchanged || !content.trim()) return;
    setSaving(true);
    try {
      await editTweet(tweetId, content.trim());
      navigation.goBack();
    } catch (e: any) {
      toast.error('Modification impossible', {
        description: e?.message || 'Réessaie dans un instant.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenBackground>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

      <View style={[styles.headerShell, { paddingTop: headerTopInset }]}>
        <View style={[styles.header, { minHeight: HEADER_CONTENT_HEIGHT }]}>
          <View style={styles.roundSlot}>
            <BackButton navigation={navigation} style={styles.roundButton} />
          </View>
          <View style={styles.titleGroup}>
            <Text style={styles.title}>Modifier</Text>
          </View>
          <View style={styles.roundSlot}>
            <TouchableOpacity
              onPress={save}
              disabled={saving || unchanged || expired || !state?.can_edit}
              hitSlop={8}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Text style={[
                  styles.saveText,
                  (unchanged || expired || !state?.can_edit) && styles.saveDisabled,
                ]}>
                  OK
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.loader}><ActivityIndicator color={colors.accent} /></View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {state && !state.can_edit ? (
              <View style={styles.blockedBox}>
                <Ionicons name="lock-closed-outline" size={20} color={colors.gold} />
                <Text style={styles.blockedText}>
                  {state.reason ? BLOCK_LABELS[state.reason] : 'Modification indisponible.'}
                </Text>
                {state.reason === 'subscription_required' && (
                  <TouchableOpacity
                    style={styles.upgradeBtn}
                    onPress={() => navigation.navigate('Settings')}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.upgradeBtnText}>Voir l'abonnement</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <>
                <View style={[styles.countdown, expired && styles.countdownOver]}>
                  <Ionicons
                    name="time-outline"
                    size={14}
                    color={expired ? colors.red : colors.cyan}
                  />
                  <Text style={[styles.countdownText, expired && styles.countdownTextOver]}>
                    {expired ? 'Fenêtre fermée' : formatRemaining(remaining)}
                    {state ? ` · ${state.revisions_used}/${state.max_revisions} modifications` : ''}
                  </Text>
                </View>

                <TextInput
                  style={styles.input}
                  value={content}
                  onChangeText={setContent}
                  multiline
                  autoFocus
                  maxLength={1000}
                  placeholder="Ton tweet"
                  placeholderTextColor={colors.textMuted}
                  editable={!expired}
                />
                <Text style={styles.counter}>{content.length} / 1000</Text>

                <Text style={styles.notice}>
                  Les versions précédentes restent consultables par tout le monde.
                </Text>
              </>
            )}

            {history.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Historique public</Text>
                {history.map((revision) => (
                  <View key={revision.revision} style={styles.revisionCard}>
                    <Text style={styles.revisionMeta}>
                      Version {revision.revision} ·{' '}
                      {new Date(revision.edited_at).toLocaleString('fr-FR', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </Text>
                    <Text style={styles.revisionText}>{revision.previous_content}</Text>
                  </View>
                ))}
              </>
            )}

            <View style={{ height: 60 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerShell: { backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  roundSlot: { width: 44, alignItems: 'center' },
  roundButton: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  titleGroup: { flex: 1, alignItems: 'center' },
  title: { color: colors.textPrimary, fontSize: 17, fontWeight: '700' },
  saveText: { color: colors.accent, fontSize: 15, fontWeight: '800' },
  saveDisabled: { color: colors.textDisabled },

  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 16, paddingTop: 12 },

  countdown: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: radius.round,
    backgroundColor: colors.cyanSoft,
    marginBottom: 14,
  },
  countdownOver: { backgroundColor: colors.redMuted },
  countdownText: { color: colors.cyan, fontSize: 12, fontWeight: '700', marginLeft: 6 },
  countdownTextOver: { color: colors.red },

  input: {
    color: colors.textPrimary,
    fontSize: 16,
    lineHeight: 23,
    minHeight: 140,
    textAlignVertical: 'top',
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  counter: { color: colors.textMuted, fontSize: 11, textAlign: 'right', marginTop: 6 },
  notice: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 10 },

  blockedBox: {
    borderRadius: radius.lg,
    padding: 18,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'flex-start',
  },
  blockedText: { color: colors.textPrimary, fontSize: 14, lineHeight: 20, marginTop: 10 },
  upgradeBtn: {
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radius.round,
    backgroundColor: colors.accent,
  },
  upgradeBtnText: { color: colors.onAccent, fontSize: 13, fontWeight: '700' },

  sectionLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 26,
    marginBottom: 10,
  },
  revisionCard: {
    borderRadius: radius.md,
    padding: 13,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  revisionMeta: { color: colors.textMuted, fontSize: 11, marginBottom: 6 },
  revisionText: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
});
