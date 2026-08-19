import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, ActivityIndicator, RefreshControl } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { AppHeader, ScreenBackground, GlassCard, GlassButton, EmptyState, confirmAsync, promptAsync } from '../components/ui';
import { toast } from '../components/ui/Toast';
import { colors, fonts, radius, statusBarStyle } from '../theme';
import { useAdminPermissions } from '../hooks/useAdminPermissions';
import { moderationService, Tweet } from '../services/moderationService';
import VerifiedBadge from '../components/VerifiedBadge';

type Tone = 'accent' | 'gold' | 'cyan' | 'danger' | 'neutral';
const TONE_COLOR: Record<Tone, string> = {
  accent: colors.accent, gold: colors.gold, cyan: colors.cyan, danger: colors.red, neutral: colors.textMuted,
};
const TONE_SOFT: Record<Tone, string> = {
  accent: colors.accentSoft, gold: 'rgba(255,210,77,0.10)', cyan: colors.cyanSoft, danger: colors.redMuted, neutral: colors.overlaySoft,
};
const SEVERITY_TONE: Record<string, Tone> = { critical: 'danger', high: 'gold', medium: 'gold', low: 'accent' };
const SEVERITY_ICON: Record<string, keyof typeof Ionicons.glyphMap> = { critical: 'warning', high: 'alert-circle', medium: 'information-circle', low: 'checkmark-circle' };
const SEVERITY_LABEL: Record<string, string> = { critical: 'Critique', high: 'Haute', medium: 'Moyenne', low: 'Faible' };
const STATUS_TONE: Record<string, Tone> = { approved: 'accent', rejected: 'gold', pending: 'cyan', not_eligible: 'gold' };
const STATUS_ICON: Record<string, keyof typeof Ionicons.glyphMap> = { approved: 'checkmark-circle', rejected: 'close-circle', pending: 'time-outline', not_eligible: 'remove-circle-outline' };
const STATUS_LABEL: Record<string, string> = { approved: 'Approuvé', rejected: 'Rejeté', pending: 'En attente', not_eligible: 'Non éligible' };

type FilterKey = 'all' | 'pending' | 'approved' | 'rejected' | 'not_eligible' | 'high' | 'critical';
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'pending', label: 'En attente' },
  { key: 'approved', label: 'Approuvés' },
  { key: 'rejected', label: 'Rejetés' },
  { key: 'not_eligible', label: 'Non éligibles' },
  { key: 'high', label: 'Priorité haute' },
  { key: 'critical', label: 'Critique' },
];

function matchesFilter(t: Tweet, filter: FilterKey): boolean {
  if (filter === 'all') return true;
  if (filter === 'high') return t.severity === 'high' || t.severity === 'critical';
  if (filter === 'critical') return t.severity === 'critical';
  return t.moderation_status === filter;
}

function formatDate(dateString: string) {
  const diffH = Math.floor((Date.now() - new Date(dateString).getTime()) / 3_600_000);
  if (diffH < 1) return 'À l\'instant';
  if (diffH < 24) return `Il y a ${diffH}h`;
  return new Date(dateString).toLocaleDateString('fr-FR');
}

export default function ContentModerationScreen() {
  const navigation = useNavigation();
  const { canDeleteTweets, isClasseur, canModerateContent } = useAdminPermissions();

  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');

  const load = useCallback(async () => {
    try {
      const data = await moderationService.getTweets();
      setTweets(data || []);
    } catch {
      toast.error('Impossible de charger les tweets');
      setTweets([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  const filtered = tweets.filter((t) => matchesFilter(t, filter));

  const run = async (tweet: Tweet, label: string, action: () => Promise<boolean>) => {
    setBusyId(tweet.id);
    try {
      const ok = await action();
      if (ok) {
        toast.success(label);
        load();
      } else {
        toast.error('Action impossible');
      }
    } catch {
      toast.error('Une erreur est survenue');
    } finally {
      setBusyId(null);
    }
  };

  const approve = (tweet: Tweet) => {
    confirmAsync({
      title: 'Approuver',
      message: 'Le tweet sera approuvé et visible normalement.',
      confirmLabel: 'Confirmer',
    }).then((ok) => { if (ok) run(tweet, 'Tweet approuvé', () => moderationService.approveTweet(tweet.id)); });
  };

  const reject = (tweet: Tweet) => {
    confirmAsync({
      title: 'Exclure des recommandations',
      message: 'Le tweet sera exclu des recommandations mais restera visible.',
      confirmLabel: 'Confirmer',
    }).then((ok) => { if (ok) run(tweet, 'Tweet exclu des recommandations', () => moderationService.rejectTweet(tweet.id, 'Action de modération')); });
  };

  const ban = async (tweet: Tweet) => {
    // `Alert.prompt` est iOS-only : sur Android l'appel ne faisait rien, donc
    // bannir était impossible depuis un téléphone Android. Voir PromptSheet.
    const motif = await promptAsync({
      title: 'Motif du bannissement',
      message: 'Il sera visible dans l\'historique de modération.',
      placeholder: 'Contenu inapproprié',
      defaultValue: 'Contenu inapproprié',
      confirmLabel: 'Bannir',
      icon: 'ban-outline',
      destructive: true,
      multiline: true,
      maxLength: 300,
    });
    if (!motif) return;
    run(tweet, 'Utilisateur banni', () => moderationService.banUser(tweet.author.id, motif));
  };

  if (!canDeleteTweets && !canModerateContent) {
    return (
      <ScreenBackground>
        <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
        <AppHeader navigation={navigation} title="Modération de contenu" />
        <View style={styles.deniedBox}>
          <Ionicons name="shield-outline" size={56} color={colors.red} />
          <Text style={styles.deniedTitle}>Accès restreint</Text>
          <Text style={styles.deniedText}>Tu n'as pas les permissions nécessaires pour accéder à cette section.</Text>
        </View>
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
      <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
      <AppHeader
        navigation={navigation}
        title={isClasseur ? 'Classification de contenu' : 'Modération de contenu'}
        right={(
          <View style={styles.headerCount}>
            <Text style={styles.headerCountText}>{tweets.filter((t) => t.moderation_status === 'pending').length} en attente</Text>
          </View>
        )}
      />

      {isClasseur && (
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={18} color={colors.accent} />
          <Text style={styles.infoText}>En tant que classeur de tweets, tu peux approuver ou exclure des recommandations, mais pas bannir d'utilisateurs.</Text>
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterRowContent}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const count = tweets.filter((t) => matchesFilter(t, f.key)).length;
          return (
            <TouchableOpacity key={f.key} style={[styles.filterChip, active && styles.filterChipActive]} onPress={() => setFilter(f.key)} activeOpacity={0.8}>
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{f.label} ({count})</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.loadingBox}><ActivityIndicator color={colors.accent} /></View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        >
          {filtered.length === 0 ? (
            <EmptyState icon="checkmark-circle-outline" title="Aucun tweet" message={filter === 'all' ? 'Aucun tweet trouvé.' : 'Aucun tweet dans cette catégorie.'} />
          ) : (
            filtered.map((tweet) => {
              const sevTone = SEVERITY_TONE[tweet.severity] || 'neutral';
              const statTone = STATUS_TONE[tweet.moderation_status] || 'neutral';
              const busy = busyId === tweet.id;
              return (
                <GlassCard key={tweet.id} style={[styles.card, { borderColor: `${TONE_COLOR[sevTone]}33` }]}>
                  <View style={styles.cardTopRow}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.nameRow}>
                        <Text style={styles.authorName} numberOfLines={1}>{tweet.author.full_name || tweet.author.username}</Text>
                        {tweet.author.verified && <VerifiedBadge verificationStyle={(tweet.author as any).verification_style || 'default'} size={13} />}
                      </View>
                      <Text style={styles.authorHandle}>@{tweet.author.username} · {formatDate(tweet.created_at)}</Text>
                    </View>
                  </View>

                  <View style={styles.badgesRow}>
                    <View style={[styles.badge, { backgroundColor: TONE_SOFT[sevTone] }]}>
                      <Ionicons name={SEVERITY_ICON[tweet.severity] || 'help-circle'} size={11} color={TONE_COLOR[sevTone]} />
                      <Text style={[styles.badgeText, { color: TONE_COLOR[sevTone] }]}>{SEVERITY_LABEL[tweet.severity] || tweet.severity}</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: TONE_SOFT[statTone] }]}>
                      <Ionicons name={STATUS_ICON[tweet.moderation_status] || 'help-circle-outline'} size={11} color={TONE_COLOR[statTone]} />
                      <Text style={[styles.badgeText, { color: TONE_COLOR[statTone] }]}>{STATUS_LABEL[tweet.moderation_status] || tweet.moderation_status}</Text>
                    </View>
                  </View>

                  <Text style={styles.tweetText}>{tweet.content}</Text>

                  <View style={styles.statsRow}>
                    <View style={styles.statItem}><Ionicons name="heart-outline" size={13} color={colors.textMuted} /><Text style={styles.statText}>{tweet.likes}</Text></View>
                    <View style={styles.statItem}><Ionicons name="repeat-outline" size={13} color={colors.textMuted} /><Text style={styles.statText}>{tweet.retweets}</Text></View>
                    <View style={styles.statItem}><Ionicons name="chatbubble-outline" size={13} color={colors.textMuted} /><Text style={styles.statText}>{tweet.replies}</Text></View>
                    {tweet.reports > 0 && (
                      <View style={styles.statItem}><Ionicons name="flag-outline" size={13} color={colors.red} /><Text style={[styles.statText, { color: colors.red }]}>{tweet.reports}</Text></View>
                    )}
                  </View>

                  {tweet.flags?.length > 0 && (
                    <View style={styles.flagsRow}>
                      {tweet.flags.map((flag, i) => (
                        <View key={i} style={styles.flagChip}><Text style={styles.flagText}>{flag}</Text></View>
                      ))}
                    </View>
                  )}

                  <View style={styles.actionsRow}>
                    <GlassButton label="Approuver" icon="checkmark-outline" variant="secondary" style={{ flex: 1 }} loading={busy} disabled={busy} onPress={() => approve(tweet)} />
                    <GlassButton label="Exclure" icon="close-outline" variant="secondary" style={{ flex: 1 }} loading={busy} disabled={busy} onPress={() => reject(tweet)} />
                    {!isClasseur && (
                      <GlassButton label="Bannir" icon="ban-outline" variant="secondary" style={{ flex: 1 }} loading={busy} disabled={busy} onPress={() => ban(tweet)} />
                    )}
                  </View>
                </GlassCard>
              );
            })
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  headerCount: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.round, backgroundColor: colors.overlaySoft },
  headerCountText: { fontSize: 11.5, fontFamily: fonts.semibold, color: colors.textSecondary },
  infoBox: {
    flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 8, padding: 12,
    borderRadius: radius.md, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentMuted,
  },
  infoText: { flex: 1, fontSize: 12.5, color: colors.textSecondary, lineHeight: 18 },
  filterRow: { maxHeight: 44, flexGrow: 0, marginBottom: 6 },
  filterRowContent: { paddingHorizontal: 16, gap: 8 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.round, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  filterChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentMuted },
  filterChipText: { fontSize: 12.5, fontFamily: fonts.medium, color: colors.textSecondary },
  filterChipTextActive: { color: colors.accent, fontFamily: fonts.semibold },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20 },
  card: { padding: 14, marginBottom: 12, borderWidth: 1 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  authorName: { fontSize: 14.5, fontFamily: fonts.semibold, color: colors.textPrimary, flexShrink: 1 },
  authorHandle: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  badgesRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.round },
  badgeText: { fontSize: 10, fontFamily: fonts.semibold, textTransform: 'uppercase', letterSpacing: 0.2 },
  tweetText: { fontSize: 14, color: colors.textPrimary, lineHeight: 20, marginBottom: 10 },
  statsRow: { flexDirection: 'row', gap: 16, marginBottom: 10 },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontSize: 12.5, color: colors.textMuted },
  flagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  flagChip: { backgroundColor: colors.redMuted, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm },
  flagText: { fontSize: 10.5, color: colors.red, fontFamily: fonts.medium },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  deniedBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 },
  deniedTitle: { fontSize: 20, fontFamily: fonts.bold, color: colors.textPrimary, marginTop: 8 },
  deniedText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
