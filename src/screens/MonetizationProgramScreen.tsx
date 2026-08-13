import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, StatusBar, RefreshControl, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppHeader, ScreenBackground, GlassCard, GlassButton, SectionLabel } from '../components/ui';
import { toast } from '../components/ui/Toast';
import { colors, fonts, radius, statusBarStyle, withAlpha } from '../theme';
import MonetizationProgramService, { MonetizationProgramEligibility } from '../services/monetizationProgramService';

interface MonetizationProgramScreenProps {
  navigation: any;
}

function ProgressRow({
  icon, label, current, target, percentLabel,
}: { icon: string; label: string; current?: string; target?: string; percentLabel: number }) {
  const pct = Math.max(0, Math.min(100, percentLabel));
  const done = pct >= 100;
  return (
    <View style={styles.criterionRow}>
      <View style={styles.criterionHeader}>
        <View style={styles.criterionLabelGroup}>
          <View style={[styles.criterionIcon, done && styles.criterionIconDone]}>
            <Ionicons name={done ? 'checkmark' : (icon as any)} size={15} color={done ? colors.onAccent : colors.textSecondary} />
          </View>
          <Text style={styles.criterionLabel}>{label}</Text>
        </View>
        {current && target ? (
          <Text style={styles.criterionValue}>{current} / {target}</Text>
        ) : null}
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%` }, done && styles.progressFillDone]} />
      </View>
    </View>
  );
}

const MonetizationProgramScreen: React.FC<MonetizationProgramScreenProps> = ({ navigation }) => {
  const [eligibility, setEligibility] = useState<MonetizationProgramEligibility | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [applying, setApplying] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await MonetizationProgramService.getStatus();
      setEligibility(data);
    } catch (error) {
      toast.error('Impossible de charger le programme de monétisation');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const handleApply = async () => {
    if (!eligibility?.canApply || applying) return;
    setApplying(true);
    try {
      await MonetizationProgramService.apply();
      toast.success('Candidature envoyée', { description: 'On te tient au courant après revue.' });
      await load();
    } catch (error: any) {
      toast.error('Envoi impossible', { description: error?.message });
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return (
      <ScreenBackground>
        <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
        <AppHeader navigation={navigation} title="Programme de monétisation" subtitle="Rejoins la monétisation TWC" />
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </ScreenBackground>
    );
  }

  if (!eligibility) return null;

  const { stats, thresholds, criteria, programStatus } = eligibility;

  return (
    <ScreenBackground>
      <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
      <AppHeader navigation={navigation} title="Programme de monétisation" subtitle="Rejoins la monétisation TWC" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {programStatus === 'approved' && (
          <GlassCard style={[styles.statusCard, { borderColor: withAlpha(colors.success, 0.4) }]}>
            <Ionicons name="checkmark-circle" size={26} color={colors.success} />
            <Text style={styles.statusTitle}>Tu es dans le programme</Text>
            <Text style={styles.statusSubtitle}>Tes tweets éligibles peuvent maintenant générer des TWC.</Text>
          </GlassCard>
        )}

        {programStatus === 'pending' && (
          <GlassCard style={[styles.statusCard, { borderColor: withAlpha(colors.gold, 0.4) }]}>
            <Ionicons name="time-outline" size={26} color={colors.gold} />
            <Text style={styles.statusTitle}>Candidature en cours de revue</Text>
            <Text style={styles.statusSubtitle}>On vérifie ton compte manuellement — reviens un peu plus tard.</Text>
          </GlassCard>
        )}

        {programStatus === 'rejected' && (
          <GlassCard style={[styles.statusCard, { borderColor: withAlpha(colors.red, 0.4) }]}>
            <Ionicons name="close-circle" size={26} color={colors.red} />
            <Text style={styles.statusTitle}>Candidature refusée</Text>
            {eligibility.rejectionReason ? (
              <Text style={styles.statusSubtitle}>{eligibility.rejectionReason}</Text>
            ) : (
              <Text style={styles.statusSubtitle}>Tu peux retenter une fois les conditions remplies.</Text>
            )}
          </GlassCard>
        )}

        <SectionLabel style={{ marginTop: 20 }}>Conditions à remplir</SectionLabel>
        <GlassCard style={styles.criteriaCard}>
          <ProgressRow
            icon="eye-outline"
            label="Vues sur 30 jours"
            current={String(stats.views30d)}
            target={String(thresholds.views30d)}
            percentLabel={(stats.views30d / thresholds.views30d) * 100}
          />
          <ProgressRow
            icon="people-outline"
            label="Abonnés"
            current={String(stats.followersCount)}
            target={String(thresholds.followersCount)}
            percentLabel={(stats.followersCount / thresholds.followersCount) * 100}
          />
          <ProgressRow
            icon="shield-checkmark-outline"
            label="Qualité de ta communauté"
            current={String(stats.followerBehaviorScore)}
            target={String(thresholds.followerBehaviorScore)}
            percentLabel={(stats.followerBehaviorScore / thresholds.followerBehaviorScore) * 100}
          />
          <Text style={styles.qualityHint}>
            Tes abonnés doivent montrer une activité réelle dans l'app — ça protège le programme des comptes créés juste pour gonfler un chiffre.
          </Text>
        </GlassCard>

        {!eligibility.hasActiveSubscription && (
          <Text style={styles.subscriptionHint}>
            Un abonnement Plus ou Pro est aussi nécessaire pour toucher tes gains, en plus d'être accepté ici.
          </Text>
        )}

        <SectionLabel style={{ marginTop: 20 }}>Validation</SectionLabel>
        <GlassCard style={styles.reviewCard}>
          <Ionicons name="person-circle-outline" size={20} color={colors.textSecondary} />
          <Text style={styles.reviewText}>
            Même une fois les conditions remplies, une personne vérifie chaque candidature à la main avant l'acceptation.
          </Text>
        </GlassCard>

        {(programStatus === 'none' || programStatus === 'rejected') && (
          <GlassButton
            label={applying ? 'Envoi...' : 'Candidater'}
            icon="paper-plane-outline"
            onPress={handleApply}
            disabled={!criteria.meetsViews || !criteria.meetsFollowers || !criteria.meetsBehavior || applying}
            style={{ marginTop: 24 }}
          />
        )}
      </ScrollView>
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 60 },
  statusCard: { alignItems: 'center', paddingVertical: 20, borderWidth: 1, marginBottom: 4 },
  statusTitle: { fontSize: 16, fontFamily: fonts.bold, color: colors.textPrimary, marginTop: 10 },
  statusSubtitle: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginTop: 4, lineHeight: 18 },
  criteriaCard: { padding: 16 },
  criterionRow: { marginBottom: 16 },
  criterionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  criterionLabelGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  criterionIcon: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.overlaySoft,
  },
  criterionIconDone: { backgroundColor: colors.success },
  criterionLabel: { fontSize: 14, fontFamily: fonts.semibold, color: colors.textPrimary },
  criterionValue: { fontSize: 13, color: colors.textSecondary, fontFamily: fonts.medium },
  progressTrack: { height: 6, borderRadius: radius.round, backgroundColor: colors.overlaySoft, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radius.round, backgroundColor: colors.accent },
  progressFillDone: { backgroundColor: colors.success },
  qualityHint: { fontSize: 12, color: colors.textMuted, lineHeight: 17, marginTop: 4 },
  subscriptionHint: { fontSize: 12, color: colors.textMuted, marginTop: 12, lineHeight: 17 },
  reviewCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  reviewText: { flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
});

export default MonetizationProgramScreen;
