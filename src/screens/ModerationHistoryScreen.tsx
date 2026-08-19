import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, ActivityIndicator, RefreshControl } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppHeader, ScreenBackground, EmptyState } from '../components/ui';
import { toast } from '../components/ui/Toast';
import { colors, fonts, radius, statusBarStyle } from '../theme';
import { moderationService, ModerationAction } from '../services/moderationService';

interface ModerationHistoryScreenProps {
  navigation: any;
}

type Tone = 'accent' | 'gold' | 'cyan' | 'danger' | 'neutral';
const TONE_COLOR: Record<Tone, string> = {
  accent: colors.accent, gold: colors.gold, cyan: colors.cyan, danger: colors.red, neutral: colors.textMuted,
};
const TONE_SOFT: Record<Tone, string> = {
  accent: colors.accentSoft, gold: 'rgba(255,210,77,0.10)', cyan: colors.cyanSoft, danger: colors.redMuted, neutral: colors.overlaySoft,
};

const ACTION_TONE: Record<string, Tone> = { ban: 'danger', suspend: 'gold', delete: 'danger', warn: 'gold', approve: 'accent' };
const ACTION_ICON: Record<string, keyof typeof Ionicons.glyphMap> = { ban: 'ban', suspend: 'pause', delete: 'trash', warn: 'warning', approve: 'checkmark' };
const ACTION_LABEL: Record<string, string> = { ban: 'Bannissement', suspend: 'Suspension', delete: 'Suppression', warn: 'Avertissement', approve: 'Approbation' };
const STATUS_TONE: Record<string, Tone> = { active: 'accent', expired: 'neutral', reversed: 'danger' };
const STATUS_LABEL: Record<string, string> = { active: 'Actif', expired: 'Expiré', reversed: 'Annulé' };

const FILTERS = [
  { key: 'all', label: 'Toutes' },
  { key: 'ban', label: 'Bannissements' },
  { key: 'suspend', label: 'Suspensions' },
  { key: 'delete', label: 'Suppressions' },
  { key: 'warn', label: 'Avertissements' },
] as const;

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDuration(duration?: number) {
  if (!duration) return 'Permanent';
  if (duration < 24) return `${duration}h`;
  if (duration < 168) return `${Math.floor(duration / 24)}j`;
  return `${Math.floor(duration / 168)}sem`;
}

const ModerationHistoryScreen: React.FC<ModerationHistoryScreenProps> = ({ navigation }) => {
  const [actions, setActions] = useState<ModerationAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<typeof FILTERS[number]['key']>('all');

  const load = useCallback(async () => {
    try {
      const data = await moderationService.getModerationHistory();
      setActions(data || []);
    } catch {
      toast.error('Impossible de charger l\'historique de modération');
      setActions([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  const filtered = actions.filter((a) => filter === 'all' || a.type === filter);

  return (
    <ScreenBackground>
      <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
      <AppHeader navigation={navigation} title="Historique" subtitle={`${actions.length} action(s) au total`} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterRowContent}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const count = f.key === 'all' ? actions.length : actions.filter((a) => a.type === f.key).length;
          return (
            <TouchableOpacity key={f.key} style={[styles.filterChip, active && styles.filterChipActive]} onPress={() => setFilter(f.key)} activeOpacity={0.8}>
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{f.label}</Text>
              <View style={[styles.filterBadge, active && styles.filterBadgeActive]}>
                <Text style={[styles.filterBadgeText, active && styles.filterBadgeTextActive]}>{count}</Text>
              </View>
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
            <EmptyState icon="shield-checkmark-outline" title="Aucune action" message={filter === 'all' ? 'Aucune action de modération trouvée.' : 'Aucune action dans cette catégorie.'} />
          ) : (
            filtered.map((action) => {
              const tone = ACTION_TONE[action.type] || 'neutral';
              const statTone = STATUS_TONE[action.status] || 'neutral';
              return (
                <View key={action.id} style={[styles.card, { borderColor: `${TONE_COLOR[tone]}33` }]}>
                  <View style={styles.cardTopRow}>
                    <View style={styles.cardTypeGroup}>
                      <View style={[styles.typeIcon, { backgroundColor: TONE_SOFT[tone] }]}>
                        <Ionicons name={ACTION_ICON[action.type] || 'shield-outline'} size={14} color={TONE_COLOR[tone]} />
                      </View>
                      <Text style={[styles.cardTypeText, { color: TONE_COLOR[tone] }]}>{ACTION_LABEL[action.type] || action.type}</Text>
                    </View>
                    <View style={styles.statusGroup}>
                      <View style={[styles.statusDot, { backgroundColor: TONE_COLOR[statTone] }]} />
                      <Text style={[styles.statusText, { color: TONE_COLOR[statTone] }]}>{STATUS_LABEL[action.status] || action.status}</Text>
                    </View>
                  </View>

                  <Text style={styles.cardTitle}>
                    {action.targetType === 'user' ? 'Utilisateur' : action.targetType === 'tweet' ? 'Tweet' : 'Commentaire'} : {action.targetName}
                  </Text>
                  <Text style={styles.cardMeta}>Modérateur : {action.moderatorName}</Text>
                  <Text style={styles.cardMeta}>Raison : {action.reason}</Text>
                  {action.duration ? <Text style={styles.cardMeta}>Durée : {formatDuration(action.duration)}</Text> : null}
                  <Text style={styles.cardDate}>{formatDate(action.createdAt)}</Text>
                </View>
              );
            })
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  filterRow: { maxHeight: 48, flexGrow: 0, marginBottom: 4 },
  filterRowContent: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.round,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentMuted },
  filterChipText: { fontSize: 12.5, fontFamily: fonts.medium, color: colors.textSecondary },
  filterChipTextActive: { color: colors.accent, fontFamily: fonts.semibold },
  filterBadge: { backgroundColor: colors.overlayStrong, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  filterBadgeActive: { backgroundColor: colors.accent },
  filterBadgeText: { fontSize: 10.5, fontFamily: fonts.semibold, color: colors.textSecondary },
  filterBadgeTextActive: { color: colors.onAccent },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20 },
  card: {
    borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1,
    padding: 14, marginBottom: 12,
  },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  cardTypeGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeIcon: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  cardTypeText: { fontSize: 12.5, fontFamily: fonts.semibold },
  statusGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  statusText: { fontSize: 12, fontFamily: fonts.medium },
  cardTitle: { fontSize: 14.5, fontFamily: fonts.semibold, color: colors.textPrimary, marginBottom: 4 },
  cardMeta: { fontSize: 13, color: colors.textSecondary, marginBottom: 2 },
  cardDate: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
});

export default ModerationHistoryScreen;
