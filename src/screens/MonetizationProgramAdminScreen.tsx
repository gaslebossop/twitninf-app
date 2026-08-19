import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, StatusBar, RefreshControl, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppHeader, ScreenBackground, GlassCard, GlassButton, EmptyState, confirmAsync, promptAsync } from '../components/ui';
import { toast } from '../components/ui/Toast';
import Avatar from '../components/Avatar';
import { colors, fonts, statusBarStyle } from '../theme';
import MonetizationProgramService, { MonetizationProgramApplication } from '../services/monetizationProgramService';

interface MonetizationProgramAdminScreenProps {
  navigation: any;
}

function StatChip({ label, value, target, pass }: { label: string; value: number; target: number; pass: boolean }) {
  return (
    <View style={[styles.chip, pass ? styles.chipPass : styles.chipFail]}>
      <Ionicons name={pass ? 'checkmark' : 'close'} size={12} color={pass ? colors.success : colors.red} />
      <Text style={styles.chipText}>{label} {value}/{target}</Text>
    </View>
  );
}

const MonetizationProgramAdminScreen: React.FC<MonetizationProgramAdminScreenProps> = ({ navigation }) => {
  const [applications, setApplications] = useState<MonetizationProgramApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await MonetizationProgramService.listApplications();
      setApplications(data);
    } catch (error) {
      toast.error('Impossible de charger les candidatures');
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

  const handleApprove = async (app: MonetizationProgramApplication) => {
    const ok = await confirmAsync({
      title: 'Accepter la candidature',
      message: `@${app.username} pourra toucher des récompenses TWC sur ses tweets éligibles.`,
      confirmLabel: 'Accepter',
    });
    if (!ok) return;

    setProcessingId(app.id);
    try {
      await MonetizationProgramService.reviewApplication(app.id, 'approve');
      toast.success(`@${app.username} accepté dans le programme`);
      setApplications((prev) => prev.filter((a) => a.id !== app.id));
    } catch (error: any) {
      toast.error('Échec de l\'acceptation', { description: error?.message });
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (app: MonetizationProgramApplication) => {
    const reason = await promptAsync({
      title: 'Refuser la candidature',
      message: `Raison du refus pour @${app.username} (optionnel)`,
      placeholder: 'Ex : abonnés majoritairement inactifs',
      required: false,
    });
    if (reason === null) return;

    setProcessingId(app.id);
    try {
      await MonetizationProgramService.reviewApplication(app.id, 'reject', reason || undefined);
      toast.success(`Candidature de @${app.username} refusée`);
      setApplications((prev) => prev.filter((a) => a.id !== app.id));
    } catch (error: any) {
      toast.error('Échec du refus', { description: error?.message });
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <ScreenBackground>
      <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
      <AppHeader navigation={navigation} title="Programme de monétisation" subtitle={`${applications.length} candidature(s) en attente`} />

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          showsVerticalScrollIndicator={false}
        >
          {applications.length === 0 ? (
            <EmptyState
              icon="checkmark-done-outline"
              title="Aucune candidature en attente"
              message="Les nouvelles candidatures apparaîtront ici."
            />
          ) : (
            applications.map((app) => (
              <GlassCard key={app.id} style={styles.appCard}>
                <View style={styles.appHeader}>
                  <Avatar size={40} username={app.username} uri={app.avatar || undefined} />
                  <View style={styles.appIdentity}>
                    <View style={styles.appNameRow}>
                      <Text style={styles.appName}>@{app.username}</Text>
                      {app.verified && <Ionicons name="checkmark-circle" size={14} color={colors.accent} />}
                    </View>
                    <Text style={styles.appDate}>
                      Candidature du {new Date(app.appliedAt).toLocaleDateString('fr-FR')}
                    </Text>
                  </View>
                </View>

                <View style={styles.chipsRow}>
                  <StatChip label="Vues" value={app.stats.views30d} target={app.thresholds.views30d} pass={app.stats.views30d >= app.thresholds.views30d} />
                  <StatChip label="Abonnés" value={app.stats.followersCount} target={app.thresholds.followersCount} pass={app.stats.followersCount >= app.thresholds.followersCount} />
                  <StatChip label="Qualité" value={app.stats.followerBehaviorScore} target={app.thresholds.followerBehaviorScore} pass={app.stats.followerBehaviorScore >= app.thresholds.followerBehaviorScore} />
                </View>

                <View style={styles.actionsRow}>
                  <GlassButton
                    label="Refuser"
                    variant="secondary"
                    icon="close-outline"
                    onPress={() => handleReject(app)}
                    disabled={processingId === app.id}
                    style={{ flex: 1 }}
                  />
                  <GlassButton
                    label="Accepter"
                    icon="checkmark-outline"
                    onPress={() => handleApprove(app)}
                    disabled={processingId === app.id}
                    style={{ flex: 1 }}
                  />
                </View>
              </GlassCard>
            ))
          )}
        </ScrollView>
      )}
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 60 },
  appCard: { padding: 16, marginBottom: 12 },
  appHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  appIdentity: { flex: 1 },
  appNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  appName: { fontSize: 15, fontFamily: fonts.bold, color: colors.textPrimary },
  appDate: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
  },
  chipPass: { backgroundColor: colors.successMuted },
  chipFail: { backgroundColor: colors.redMuted },
  chipText: { fontSize: 12, fontFamily: fonts.medium, color: colors.textPrimary },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
});

export default MonetizationProgramAdminScreen;
