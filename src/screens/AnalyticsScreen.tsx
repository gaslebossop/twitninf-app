import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, StatusBar, ActivityIndicator, RefreshControl } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { AppHeader, ScreenBackground, GlassCard } from '../components/ui';
import { toast } from '../components/ui/Toast';
import { colors, fonts, radius, statusBarStyle } from '../theme';
import { useAdminPermissions } from '../hooks/useAdminPermissions';
import { moderationService, ModerationStats } from '../services/moderationService';

type Tone = 'accent' | 'gold' | 'cyan' | 'danger' | 'neutral';
const TONE_COLOR: Record<Tone, string> = {
  accent: colors.accent, gold: colors.gold, cyan: colors.cyan, danger: colors.red, neutral: colors.textMuted,
};
const TONE_SOFT: Record<Tone, string> = {
  accent: colors.accentSoft, gold: 'rgba(255,210,77,0.10)', cyan: colors.cyanSoft, danger: colors.redMuted, neutral: colors.overlaySoft,
};

function fmt(value: number) {
  return value.toLocaleString('fr-FR');
}

function StatTile({ icon, label, value, tone = 'neutral' }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: number; tone?: Tone }) {
  return (
    <GlassCard style={styles.tile} contentStyle={styles.tileContent}>
      <View style={[styles.tileIcon, { backgroundColor: TONE_SOFT[tone] }]}>
        <Ionicons name={icon} size={18} color={TONE_COLOR[tone]} />
      </View>
      <Text style={styles.tileValue}>{fmt(value)}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </GlassCard>
  );
}

export default function AnalyticsScreen() {
  const navigation = useNavigation();
  const { canViewAnalytics } = useAdminPermissions();

  const [stats, setStats] = useState<ModerationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await moderationService.getModerationStats();
      setStats(data);
    } catch {
      toast.error('Impossible de charger les statistiques');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  if (!canViewAnalytics) {
    return (
      <ScreenBackground>
        <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
        <AppHeader navigation={navigation} title="Analyses" />
        <View style={styles.deniedBox}>
          <Ionicons name="shield-outline" size={56} color={colors.red} />
          <Text style={styles.deniedTitle}>Accès restreint</Text>
          <Text style={styles.deniedText}>Tu n'as pas les permissions nécessaires pour accéder à cette section.</Text>
        </View>
      </ScreenBackground>
    );
  }

  const resolvedShare = stats && stats.totalReports > 0
    ? Math.round(((stats.totalReports - stats.pendingReports) / stats.totalReports) * 100)
    : null;

  return (
    <ScreenBackground>
      <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
      <AppHeader navigation={navigation} title="Analyses" subtitle="Vue d'ensemble en temps réel" />

      {loading ? (
        <View style={styles.loadingBox}><ActivityIndicator color={colors.accent} /></View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        >
          <Text style={styles.sectionTitle}>Comptes</Text>
          <View style={styles.grid}>
            <StatTile icon="people-outline" label="Total" value={stats?.totalUsers ?? 0} />
            <StatTile icon="pulse-outline" label="Actifs" value={stats?.activeUsers ?? 0} tone="cyan" />
            <StatTile icon="pause-circle-outline" label="Suspendus" value={stats?.suspendedUsers ?? 0} tone="gold" />
            <StatTile icon="ban-outline" label="Bannis" value={stats?.bannedUsers ?? 0} tone="danger" />
          </View>

          <Text style={styles.sectionTitle}>Contenu & modération</Text>
          <View style={styles.grid}>
            <StatTile icon="document-text-outline" label="Publications" value={stats?.totalTweets ?? 0} />
            <StatTile icon="hourglass-outline" label="En attente" value={stats?.pendingTweets ?? 0} tone="gold" />
            <StatTile icon="flag-outline" label="Signalements" value={stats?.totalReports ?? 0} tone="danger" />
            <StatTile icon="alert-circle-outline" label="Non traités" value={stats?.pendingReports ?? 0} tone="gold" />
          </View>

          <GlassCard style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryIcon}>
                <Ionicons name="shield-checkmark-outline" size={20} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.summaryValue}>{fmt(stats?.moderationActions ?? 0)}</Text>
                <Text style={styles.summaryLabel}>Actions de modération enregistrées</Text>
              </View>
            </View>
            {resolvedShare !== null && (
              <View style={styles.summaryRow}>
                <View style={[styles.summaryIcon, { backgroundColor: colors.accentSoft }]}>
                  <Ionicons name="checkmark-done-outline" size={20} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.summaryValue}>{resolvedShare}%</Text>
                  <Text style={styles.summaryLabel}>Des signalements ont été traités</Text>
                </View>
              </View>
            )}
          </GlassCard>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20 },
  sectionTitle: { fontSize: 13.5, fontFamily: fonts.bold, color: colors.textPrimary, marginTop: 16, marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '47%' },
  tileContent: { padding: 14 },
  tileIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  tileValue: { fontSize: 20, fontFamily: fonts.bold, color: colors.textPrimary, letterSpacing: -0.3 },
  tileLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  summaryCard: { padding: 16, marginTop: 6, gap: 14 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  summaryIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.overlaySoft },
  summaryValue: { fontSize: 17, fontFamily: fonts.bold, color: colors.textPrimary },
  summaryLabel: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  deniedBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 },
  deniedTitle: { fontSize: 20, fontFamily: fonts.bold, color: colors.textPrimary, marginTop: 8 },
  deniedText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
