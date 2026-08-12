import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ScreenBackground, BackButton, EmptyState } from '../components/ui';
import { useHeaderMetrics, HEADER_CONTENT_HEIGHT } from '../hooks/useHeaderMetrics';
import { colors, radius , statusBarStyle} from '../theme';
import { toast } from '../components/ui/Toast';
import { confirmAsync } from '../components/ui/ConfirmSheet';
import {
  STATUS_LABELS,
  cancelPost,
  fetchBestHours,
  fetchQueue,
  formatSlot,
  schedulePost,
  type ScheduleMode,
  type ScheduledPost,
} from '../services/scheduleService';

/**
 * File de publications programmées.
 *
 * Le mode « meilleur moment » mérite une explication à l'écran, et pas
 * seulement un libellé : le serveur choisira l'heure À L'ÉCHÉANCE, pas
 * maintenant. Sans cette précision, un créateur qui programme pour lundi et
 * voit partir son tweet à 21 h croit à un bug.
 *
 * Quand le compte n'a pas assez d'historique, on le DIT au lieu de laisser
 * croire à une optimisation : le mode retombera sur l'heure demandée.
 */

interface Props {
  navigation: any;
}

const DEFAULT_LEAD_MINUTES = 60;

export default function ScheduledPostsScreen({ navigation }: Props) {
  const { top: headerTopInset } = useHeaderMetrics();

  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [bestHours, setBestHours] = useState<{ hours: number[]; reliable: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [composing, setComposing] = useState(false);
  const [content, setContent] = useState('');
  const [mode, setMode] = useState<ScheduleMode>('exact');
  const [when, setWhen] = useState(() => new Date(Date.now() + DEFAULT_LEAD_MINUTES * 60000));
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [queue, hours] = await Promise.all([
        fetchQueue(),
        fetchBestHours().catch(() => null),
      ]);
      setPosts(queue);
      setBestHours(hours);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'File indisponible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const pending = useMemo(() => posts.filter((p) => p.status === 'pending' || p.status === 'publishing'), [posts]);
  const past = useMemo(() => posts.filter((p) => p.status !== 'pending' && p.status !== 'publishing'), [posts]);

  const submit = async () => {
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    try {
      await schedulePost({ content: content.trim(), scheduledFor: when, mode });
      setContent('');
      setComposing(false);
      setMode('exact');
      setWhen(new Date(Date.now() + DEFAULT_LEAD_MINUTES * 60000));
      await load();
    } catch (e: any) {
      toast.error('Programmation impossible', {
        description: e?.message || 'Réessaie dans un instant.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const confirmCancel = (post: ScheduledPost) => {
    confirmAsync({
      title: 'Annuler cette publication ?',
      message: 'Elle ne partira pas. Le texte est perdu.',
      confirmLabel: 'Annuler la publication',
      cancelLabel: 'Garder',
      destructive: true,
    }).then((ok) => {
      if (ok) (async () => {
            try {
              await cancelPost(post.id);
              await load();
            } catch (e: any) {
              toast.error('Annulation impossible', {
                description: e?.message || 'Réessaie dans un instant.',
              });
            }
          })();
    });
  };

  return (
    <ScreenBackground>
      <StatusBar barStyle={statusBarStyle()} backgroundColor={colors.bg} />

      <View style={[styles.headerShell, { paddingTop: headerTopInset }]}>
        <View style={[styles.header, { minHeight: HEADER_CONTENT_HEIGHT }]}>
          <View style={styles.roundSlot}>
            <BackButton navigation={navigation} style={styles.roundButton} />
          </View>
          <View style={styles.titleGroup}>
            <Text style={styles.title}>Programmation</Text>
          </View>
          <View style={styles.roundSlot}>
            {!composing && (
              <TouchableOpacity
                style={styles.roundButton}
                onPress={() => setComposing(true)}
                activeOpacity={0.8}
                accessibilityLabel="Programmer une publication"
              >
                <Ionicons name="add" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
          }
        >
          {composing && (
            <View style={styles.composer}>
              <TextInput
                style={styles.input}
                placeholder="Qu'est-ce que tu veux publier ?"
                placeholderTextColor={colors.textMuted}
                value={content}
                onChangeText={setContent}
                multiline
                maxLength={1000}
              />
              <Text style={styles.counter}>{content.length} / 1000</Text>

              <View style={styles.modeRow}>
                <TouchableOpacity
                  style={[styles.modeChip, mode === 'exact' && styles.modeChipActive]}
                  onPress={() => setMode('exact')}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name="alarm-outline"
                    size={15}
                    color={mode === 'exact' ? colors.onAccent : colors.textSecondary}
                  />
                  <Text style={[styles.modeText, mode === 'exact' && styles.modeTextActive]}>
                    Heure précise
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modeChip, mode === 'best_time' && styles.modeChipActive]}
                  onPress={() => setMode('best_time')}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name="sparkles-outline"
                    size={15}
                    color={mode === 'best_time' ? colors.onAccent : colors.textSecondary}
                  />
                  <Text style={[styles.modeText, mode === 'best_time' && styles.modeTextActive]}>
                    Meilleur moment
                  </Text>
                </TouchableOpacity>
              </View>

              {mode === 'best_time' && (
                <Text style={styles.modeHint}>
                  {bestHours?.reliable
                    ? `On publiera au premier bon créneau après la date choisie (${bestHours.hours
                      .slice(0, 3)
                      .map((h) => `${h}h`)
                      .join(', ')}).`
                    : 'Pas encore assez de publications pour repérer tes créneaux : on publiera à l\'heure choisie.'}
                </Text>
              )}

              <View style={styles.whenRow}>
                <TouchableOpacity
                  style={styles.whenBtn}
                  onPress={() => setPicker('date')}
                  activeOpacity={0.85}
                >
                  <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
                  <Text style={styles.whenText}>
                    {when.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.whenBtn}
                  onPress={() => setPicker('time')}
                  activeOpacity={0.85}
                >
                  <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
                  <Text style={styles.whenText}>
                    {when.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </TouchableOpacity>
              </View>

              {picker && (
                <DateTimePicker
                  value={when}
                  mode={picker}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  minimumDate={new Date()}
                  onChange={(event, selected) => {
                    // Android ferme le sélecteur à chaque interaction ; iOS le
                    // garde ouvert tant qu'on ne le referme pas.
                    if (Platform.OS === 'android') setPicker(null);
                    if (event.type === 'dismissed' || !selected) return;
                    setWhen(selected);
                  }}
                />
              )}
              {picker && Platform.OS === 'ios' && (
                <TouchableOpacity style={styles.pickerDone} onPress={() => setPicker(null)}>
                  <Text style={styles.pickerDoneText}>Terminé</Text>
                </TouchableOpacity>
              )}

              <View style={styles.composerActions}>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => { setComposing(false); setContent(''); }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.secondaryBtnText}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryBtn, (!content.trim() || submitting) && styles.btnDisabled]}
                  onPress={submit}
                  disabled={!content.trim() || submitting}
                  activeOpacity={0.85}
                >
                  {submitting
                    ? <ActivityIndicator size="small" color={colors.onAccent} />
                    : <Text style={styles.primaryBtnText}>Programmer</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {loading ? (
            <View style={styles.loader}><ActivityIndicator color={colors.accent} /></View>
          ) : error ? (
            <Text style={styles.error}>{error}</Text>
          ) : (
            <>
              <Text style={styles.sectionLabel}>À venir</Text>
              {pending.length === 0 ? (
                <EmptyState
                  compact
                  icon="time-outline"
                  title="Rien en attente"
                  message="Écris maintenant, publie quand ton audience est là."
                  action={{
                    label: 'Programmer un tweet',
                    icon: 'add',
                    onPress: () => navigation.navigate('CreateTweet'),
                  }}
                />
              ) : pending.map((post) => (
                <View key={post.id} style={styles.card}>
                  <View style={styles.cardHead}>
                    <View style={styles.slotPill}>
                      <Ionicons
                        name={post.mode === 'best_time' ? 'sparkles' : 'alarm'}
                        size={12}
                        color={colors.cyan}
                      />
                      <Text style={styles.slotText}>
                        {post.mode === 'best_time' ? 'dès ' : ''}{formatSlot(post.scheduled_for)}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => confirmCancel(post)} hitSlop={8}>
                      <Ionicons name="close" size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.cardBody} numberOfLines={4}>{post.content}</Text>
                </View>
              ))}

              {past.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>Historique</Text>
                  {past.map((post) => (
                    <View key={post.id} style={[styles.card, styles.cardPast]}>
                      <View style={styles.cardHead}>
                        <Text style={[
                          styles.statusText,
                          post.status === 'failed' && styles.statusFailed,
                          post.status === 'published' && styles.statusPublished,
                        ]}>
                          {STATUS_LABELS[post.status]}
                          {post.resolved_for ? ` · ${formatSlot(post.resolved_for)}` : ''}
                        </Text>
                        {post.published_tweet_id && (
                          <TouchableOpacity
                            onPress={() => navigation.navigate('TweetDetail', { tweetId: post.published_tweet_id })}
                            hitSlop={8}
                          >
                            <Ionicons name="open-outline" size={16} color={colors.textMuted} />
                          </TouchableOpacity>
                        )}
                      </View>
                      <Text style={styles.cardBody} numberOfLines={2}>{post.content}</Text>
                      {!!post.last_error && (
                        <Text style={styles.errorLine} numberOfLines={2}>{post.last_error}</Text>
                      )}
                    </View>
                  ))}
                </>
              )}
            </>
          )}

          <View style={{ height: 60 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerShell: { backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  roundSlot: { width: 40, alignItems: 'center' },
  roundButton: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  titleGroup: { flex: 1, alignItems: 'center' },
  title: { color: colors.textPrimary, fontSize: 17, fontWeight: '700' },
  content: { paddingHorizontal: 16, paddingTop: 8 },
  loader: { paddingVertical: 40, alignItems: 'center' },
  error: { color: colors.red, fontSize: 13, paddingVertical: 20, textAlign: 'center' },
  empty: { color: colors.textMuted, fontSize: 13, paddingVertical: 16, lineHeight: 19 },

  composer: {
    borderRadius: radius.lg,
    padding: 14,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    marginBottom: 18,
  },
  input: {
    color: colors.textPrimary,
    fontSize: 15,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  counter: { color: colors.textMuted, fontSize: 11, textAlign: 'right', marginTop: 4 },

  modeRow: { flexDirection: 'row', marginTop: 12, marginBottom: 4 },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.round,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
  },
  modeChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  modeText: { color: colors.textSecondary, fontSize: 13, marginLeft: 6, fontWeight: '600' },
  modeTextActive: { color: colors.onAccent },
  modeHint: { color: colors.textMuted, fontSize: 12, marginTop: 8, lineHeight: 17 },

  whenRow: { flexDirection: 'row', marginTop: 14 },
  whenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
  },
  whenText: { color: colors.textPrimary, fontSize: 13, marginLeft: 6, fontWeight: '600' },
  pickerDone: { alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 12 },
  pickerDoneText: { color: colors.accent, fontSize: 14, fontWeight: '700' },

  composerActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 },
  primaryBtn: {
    minWidth: 120,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: radius.round,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  primaryBtnText: { color: colors.onAccent, fontSize: 14, fontWeight: '700' },
  secondaryBtn: { paddingHorizontal: 16, paddingVertical: 11, marginRight: 8 },
  secondaryBtnText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  btnDisabled: { opacity: 0.45 },

  sectionLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 10,
  },
  card: {
    borderRadius: radius.md,
    padding: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  cardPast: { opacity: 0.75 },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  slotPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.round,
    backgroundColor: colors.cyanSoft,
  },
  slotText: { color: colors.cyan, fontSize: 12, fontWeight: '700', marginLeft: 5 },
  cardBody: { color: colors.textPrimary, fontSize: 14, lineHeight: 20 },
  statusText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  statusFailed: { color: colors.red },
  statusPublished: { color: colors.success },
  errorLine: { color: colors.red, fontSize: 12, marginTop: 6 },
});
