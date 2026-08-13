import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppHeader, ScreenBackground, GlassCard, GlassButton, promptAsync } from '../components/ui';
import { toast } from '../components/ui/Toast';
import { colors, fonts, radius, statusBarStyle } from '../theme';
import { reportService, ReportContext } from '../services/reportService';
import { moderationService } from '../services/moderationService';
import Avatar from '../components/Avatar';

interface ReportInvestigationScreenProps {
  navigation: any;
  route: { params: { reportId: string } };
}

type Tone = 'accent' | 'gold' | 'cyan' | 'danger' | 'neutral';
const TONE_COLOR: Record<Tone, string> = {
  accent: colors.accent, gold: colors.gold, cyan: colors.cyan, danger: colors.red, neutral: colors.textMuted,
};
const TONE_SOFT: Record<Tone, string> = {
  accent: colors.accentSoft, gold: 'rgba(255,210,77,0.10)', cyan: colors.cyanSoft, danger: colors.redMuted, neutral: colors.overlaySoft,
};
const SEVERITY_TONE: Record<string, Tone> = { critical: 'danger', high: 'gold', medium: 'gold', low: 'accent' };

function formatDate(dateString?: string) {
  if (!dateString) return '';
  return new Date(dateString).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const ReportInvestigationScreen: React.FC<ReportInvestigationScreenProps> = ({ navigation, route }) => {
  const { reportId } = route.params;
  const [ctx, setCtx] = useState<ReportContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await reportService.getReportContext(reportId);
    if (!data) toast.error('Impossible de charger le dossier');
    setCtx(data);
    setLoading(false);
  }, [reportId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <ScreenBackground>
        <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
        <AppHeader navigation={navigation} title="Dossier de signalement" />
        <View style={styles.loadingBox}><ActivityIndicator color={colors.accent} /></View>
      </ScreenBackground>
    );
  }

  if (!ctx) {
    return (
      <ScreenBackground>
        <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
        <AppHeader navigation={navigation} title="Dossier de signalement" />
      </ScreenBackground>
    );
  }

  const { report, reporter, target, history, aggregate } = ctx;
  const sevTone = SEVERITY_TONE[report.severity] || 'neutral';
  const isTweet = target.type === 'tweet';
  const closed = report.status === 'resolved' || report.status === 'dismissed';

  const finish = async (
    kind: 'warn' | 'suspend' | 'ban' | 'delete',
    apply: (reason: string) => Promise<boolean>,
  ) => {
    const reason = await promptAsync({
      title: kind === 'warn' ? 'Avertir l\'auteur' : kind === 'suspend' ? 'Suspendre le compte' : kind === 'ban' ? 'Bannir le compte' : 'Supprimer le tweet',
      message: 'Raison (visible dans l\'historique de modération)',
      placeholder: `Ex : ${report.category_label || 'violation des règles'}`,
      defaultValue: report.category_label,
      confirmLabel: 'Confirmer',
      destructive: kind !== 'warn',
    });
    if (reason === null) return;

    setBusy(kind);
    try {
      const ok = await apply(reason);
      if (!ok) {
        toast.error('Action impossible');
        setBusy(null);
        return;
      }
      await reportService.updateReportStatus(reportId, {
        status: 'resolved',
        resolution_action: kind,
        resolution_reason: reason,
      });
      toast.success('Signalement traité');
      navigation.goBack();
    } catch {
      toast.error('Une erreur est survenue');
      setBusy(null);
    }
  };

  const dismiss = async () => {
    const ok = await promptAsync({
      title: 'Rejeter le signalement',
      message: 'Raison (optionnel)',
      placeholder: 'Ex : contenu conforme aux règles',
      required: false,
      confirmLabel: 'Rejeter',
    });
    if (ok === null) return;
    setBusy('dismiss');
    const success = await reportService.updateReportStatus(reportId, { status: 'dismissed', resolution_reason: ok || undefined });
    if (success) {
      toast.success('Signalement rejeté');
      navigation.goBack();
    } else {
      toast.error('Action impossible');
      setBusy(null);
    }
  };

  const authorForWarn = target.user?.id;

  return (
    <ScreenBackground>
      <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
      <AppHeader navigation={navigation} title="Dossier de signalement" subtitle={report.category_label} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: TONE_SOFT[sevTone] }]}>
            <Text style={[styles.badgeText, { color: TONE_COLOR[sevTone] }]}>Sévérité {report.severity}</Text>
          </View>
          {closed && (
            <View style={[styles.badge, { backgroundColor: colors.overlaySoft }]}>
              <Text style={[styles.badgeText, { color: colors.textMuted }]}>
                {report.status === 'resolved' ? 'Déjà traité' : 'Déjà rejeté'}
              </Text>
            </View>
          )}
        </View>

        <GlassCard style={styles.card}>
          <Text style={styles.cardLabel}>Signalé par</Text>
          <View style={styles.reporterRow}>
            <Avatar size={32} username={reporter.username} uri={reporter.avatar} />
            <View style={{ flex: 1 }}>
              <Text style={styles.reporterName}>@{reporter.username || 'inconnu'}</Text>
              <Text style={styles.reporterMeta}>
                {reporter.stats?.upheld ?? 0} confirmés · {reporter.stats?.dismissed ?? 0} écartés
              </Text>
            </View>
          </View>
          {report.reason ? <Text style={styles.reasonText}>« {report.reason} »</Text> : null}
          <Text style={styles.dateText}>{formatDate(report.created_at)}</Text>
        </GlassCard>

        <Text style={styles.sectionTitle}>Contenu visé</Text>
        <GlassCard style={styles.card}>
          {isTweet && target.tweet ? (
            <TouchableOpacity onPress={() => navigation.navigate('TweetDetail', { tweetId: target.tweet!.id })} activeOpacity={0.8}>
              <Text style={styles.tweetContent} numberOfLines={6}>{target.tweet.content}</Text>
              <Text style={styles.linkHint}>Voir le tweet <Ionicons name="arrow-forward" size={12} /></Text>
            </TouchableOpacity>
          ) : target.user ? (
            <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { userId: target.user!.id })} style={styles.userRow} activeOpacity={0.8}>
              <Avatar size={40} username={target.user.username} uri={target.user.avatar} />
              <View style={{ flex: 1 }}>
                <Text style={styles.reporterName}>@{target.user.username}</Text>
                {target.user.is_suspended && <Text style={styles.suspendedHint}>Actuellement suspendu</Text>}
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ) : (
            <Text style={styles.reporterMeta}>Contenu introuvable (peut-être déjà supprimé).</Text>
          )}
        </GlassCard>

        <Text style={styles.sectionTitle}>Antécédents</Text>
        <GlassCard style={styles.card}>
          <View style={styles.statsGrid}>
            <View style={styles.statTile}>
              <Text style={styles.statValue}>{aggregate.reportCount + 1}</Text>
              <Text style={styles.statLabel}>signalement(s) sur cette cible</Text>
            </View>
            <View style={styles.statTile}>
              <Text style={styles.statValue}>{aggregate.distinctReporters}</Text>
              <Text style={styles.statLabel}>signaleurs distincts</Text>
            </View>
            <View style={styles.statTile}>
              <Text style={[styles.statValue, { color: colors.accent }]}>{history?.reports?.upheld ?? 0}</Text>
              <Text style={styles.statLabel}>signalements confirmés (compte)</Text>
            </View>
            <View style={styles.statTile}>
              <Text style={styles.statValue}>{history?.reports?.dismissed ?? 0}</Text>
              <Text style={styles.statLabel}>signalements écartés (compte)</Text>
            </View>
          </View>
        </GlassCard>

        {!closed && (
          <>
            <Text style={styles.sectionTitle}>Décision</Text>
            <View style={styles.actionsGrid}>
              <GlassButton
                label="Avertir"
                icon="alert-circle-outline"
                variant="secondary"
                loading={busy === 'warn'}
                disabled={!!busy || !authorForWarn}
                onPress={() => finish('warn', async () => (
                  // L'avertissement est appliqué côté serveur via resolution_action,
                  // pas d'appel direct : voir moderationController.updateReportStatus.
                  true
                ))}
                style={styles.actionBtn}
              />
              <GlassButton
                label="Suspendre 7j"
                icon="pause-circle-outline"
                variant="secondary"
                loading={busy === 'suspend'}
                disabled={!!busy || !target.user?.id}
                onPress={() => finish('suspend', (reason) => moderationService.suspendUser(target.user!.id, reason, 7 * 24))}
                style={styles.actionBtn}
              />
              <GlassButton
                label="Bannir"
                icon="ban-outline"
                variant="secondary"
                loading={busy === 'ban'}
                disabled={!!busy || !target.user?.id}
                onPress={() => finish('ban', (reason) => moderationService.banUser(target.user!.id, reason, undefined, true))}
                style={styles.actionBtn}
              />
              {isTweet && (
                <GlassButton
                  label="Supprimer le tweet"
                  icon="trash-outline"
                  variant="secondary"
                  loading={busy === 'delete'}
                  disabled={!!busy || !target.tweet?.id}
                  onPress={() => finish('delete', (reason) => moderationService.deleteTweet(target.tweet!.id, reason))}
                  style={styles.actionBtn}
                />
              )}
            </View>

            <TouchableOpacity style={styles.dismissBtn} onPress={dismiss} disabled={!!busy} activeOpacity={0.8}>
              {busy === 'dismiss' ? <ActivityIndicator color={colors.textSecondary} /> : (
                <>
                  <Ionicons name="close-outline" size={16} color={colors.textSecondary} />
                  <Text style={styles.dismissBtnText}>Rejeter le signalement (rien à signaler)</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20 },
  badgeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.round },
  badgeText: { fontSize: 11.5, fontFamily: fonts.semibold },
  card: { padding: 14, marginBottom: 4 },
  cardLabel: { fontSize: 11.5, fontFamily: fonts.semibold, color: colors.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.3 },
  reporterRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reporterName: { fontSize: 14.5, fontFamily: fonts.semibold, color: colors.textPrimary },
  reporterMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  reasonText: { fontSize: 13.5, color: colors.textSecondary, marginTop: 10, fontStyle: 'italic' },
  dateText: { fontSize: 11, color: colors.textMuted, marginTop: 8 },
  sectionTitle: { fontSize: 13, fontFamily: fonts.bold, color: colors.textPrimary, marginTop: 18, marginBottom: 8 },
  tweetContent: { fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
  linkHint: { fontSize: 12, color: colors.accent, marginTop: 8, fontFamily: fonts.medium },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  suspendedHint: { fontSize: 12, color: colors.red, marginTop: 2 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statTile: { width: '47%' },
  statValue: { fontSize: 20, fontFamily: fonts.bold, color: colors.textPrimary },
  statLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2, lineHeight: 14 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionBtn: { flexGrow: 1, minWidth: '47%' },
  dismissBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16, paddingVertical: 12 },
  dismissBtnText: { fontSize: 13, color: colors.textSecondary, fontFamily: fonts.medium },
});

export default ReportInvestigationScreen;
