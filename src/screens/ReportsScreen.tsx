import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, ActivityIndicator, RefreshControl } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppHeader, ScreenBackground, EmptyState } from '../components/ui';
import { toast } from '../components/ui/Toast';
import { colors, fonts, radius, statusBarStyle } from '../theme';
import { reportService, Report } from '../services/reportService';

interface ReportsScreenProps {
  navigation: any;
}

type Tone = 'accent' | 'gold' | 'cyan' | 'danger' | 'neutral';
const TONE_COLOR: Record<Tone, string> = {
  accent: colors.accent, gold: colors.gold, cyan: colors.cyan, danger: colors.red, neutral: colors.textMuted,
};
const TONE_SOFT: Record<Tone, string> = {
  accent: colors.accentSoft, gold: 'rgba(255,210,77,0.10)', cyan: colors.cyanSoft, danger: colors.redMuted, neutral: colors.overlaySoft,
};

const SEVERITY_TONE: Record<string, Tone> = { critical: 'danger', high: 'gold', medium: 'gold', low: 'accent' };
const STATUS_TONE: Record<string, Tone> = { pending: 'gold', investigating: 'accent', resolved: 'accent', dismissed: 'neutral' };
const STATUS_LABEL: Record<string, string> = { pending: 'En attente', investigating: 'En cours', resolved: 'Résolu', dismissed: 'Rejeté' };

const FILTERS = [
  { key: 'all', label: 'Tous' },
  { key: 'pending', label: 'En attente' },
  { key: 'investigating', label: 'En cours' },
  { key: 'resolved', label: 'Résolus' },
  { key: 'dismissed', label: 'Rejetés' },
] as const;

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const ReportsScreen: React.FC<ReportsScreenProps> = ({ navigation }) => {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<typeof FILTERS[number]['key']>('all');

  const load = useCallback(async () => {
    try {
      const data = await reportService.getReports();
      setReports(data?.reports || []);
    } catch (error) {
      toast.error('Impossible de charger les signalements');
      setReports([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  const handlePress = (report: Report) => {
    navigation.navigate('ReportInvestigation', { reportId: report.id });
  };

  const filtered = reports.filter((r) => filter === 'all' || r.status === filter);

  return (
    <ScreenBackground>
      <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
      <AppHeader navigation={navigation} title="Signalements" subtitle={`${reports.length} au total`} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterRowContent}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const count = f.key === 'all' ? reports.length : reports.filter((r) => r.status === f.key).length;
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
            <EmptyState icon="checkmark-circle-outline" title="Aucun signalement" message={filter === 'all' ? 'Aucun signalement trouvé.' : 'Aucun signalement dans cette catégorie.'} />
          ) : (
            filtered.map((report) => {
              const sevTone = SEVERITY_TONE[report.severity] || 'neutral';
              const statTone = STATUS_TONE[report.status] || 'neutral';
              return (
                <TouchableOpacity key={report.id} style={[styles.card, { borderColor: `${TONE_COLOR[sevTone]}33` }]} onPress={() => handlePress(report)} activeOpacity={0.85}>
                  <View style={styles.cardTopRow}>
                    <View style={styles.cardTypeGroup}>
                      <Ionicons
                        name={report.target_type === 'tweet' ? 'chatbubble-outline' : report.target_type === 'user' ? 'person-outline' : 'chatbubble-ellipses-outline'}
                        size={14} color={TONE_COLOR[sevTone]}
                      />
                      <Text style={[styles.cardTypeText, { color: TONE_COLOR[sevTone] }]}>
                        {report.target_type === 'tweet' ? 'Tweet' : report.target_type === 'user' ? 'Utilisateur' : 'Commentaire'}
                      </Text>
                    </View>
                    <Text style={[styles.severityText, { color: TONE_COLOR[sevTone] }]}>Sévérité {report.severity}</Text>
                  </View>

                  <Text style={styles.cardTitle}>Signalé par {report.reporter?.username || 'Utilisateur'}</Text>
                  <Text style={styles.cardReason}>{report.category_label || report.reason}</Text>
                  <Text style={styles.cardDate}>{formatDate(report.created_at)}</Text>

                  <View style={styles.cardFooter}>
                    <View style={styles.statusGroup}>
                      <View style={[styles.statusDot, { backgroundColor: TONE_COLOR[statTone] }]} />
                      <Text style={[styles.statusText, { color: TONE_COLOR[statTone] }]}>{STATUS_LABEL[report.status]}</Text>
                    </View>
                    <View style={styles.openHint}>
                      <Text style={styles.openHintText}>{report.status === 'pending' || report.status === 'investigating' ? 'Enquêter' : 'Voir le dossier'}</Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                    </View>
                  </View>
                </TouchableOpacity>
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
  cardTypeGroup: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardTypeText: { fontSize: 11, fontFamily: fonts.semibold, textTransform: 'uppercase', letterSpacing: 0.3 },
  severityText: { fontSize: 11, fontFamily: fonts.semibold },
  cardTitle: { fontSize: 14.5, fontFamily: fonts.semibold, color: colors.textPrimary, marginBottom: 3 },
  cardReason: { fontSize: 13, color: colors.textSecondary, marginBottom: 4 },
  cardDate: { fontSize: 11, color: colors.textMuted },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  statusGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  statusText: { fontSize: 12, fontFamily: fonts.medium },
  openHint: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  openHintText: { fontSize: 12, color: colors.textMuted, fontFamily: fonts.medium },
});

export default ReportsScreen;
