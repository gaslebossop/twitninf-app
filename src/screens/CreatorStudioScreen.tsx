import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenBackground, BackButton } from '../components/ui';
import { useHeaderMetrics, HEADER_CONTENT_HEIGHT } from '../hooks/useHeaderMetrics';
import { colors, radius } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { fetchSales, type SalesDashboard } from '../services/paidContentService';
import { fetchQueue, type ScheduledPost } from '../services/scheduleService';
import { fetchVisitorCount, fetchImpersonationAlerts } from '../services/insightsService';

/**
 * Studio créateur — le point d'entrée des fonctionnalités payantes qui
 * rapportent quelque chose : ventes de contenu, file de publication,
 * renseignements, marché des pseudos.
 *
 * Un hub plutôt que six entrées éparpillées dans les réglages : ces
 * fonctionnalités se consultent ensemble, en début de session, et un abonné
 * qui doit chercher ce qu'il paie finit par ne plus s'en servir.
 *
 * Les chiffres visibles ici sont ceux qui répondent à « qu'est-ce que mon
 * abonnement m'a rapporté ? ». C'est délibérément la première chose affichée.
 */

interface Props {
  navigation: any;
}

interface Summary {
  sales: SalesDashboard | null;
  queue: ScheduledPost[];
  visitors: number | null;
  alerts: number | null;
}

export default function CreatorStudioScreen({ navigation }: Props) {
  const { top: headerTopInset } = useHeaderMetrics();
  const { user } = useAuth();

  const [summary, setSummary] = useState<Summary>({
    sales: null, queue: [], visitors: null, alerts: null,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const tier = String((user as any)?.subscription_tier || 'free');
  const isPro = tier === 'pro';

  /**
   * Chaque bloc est chargé indépendamment : une route indisponible (ou
   * refusée parce que l'abonnement vient d'expirer) laisse les autres
   * s'afficher. Un `Promise.all` transformerait un seul 403 en écran vide.
   */
  const load = useCallback(async () => {
    const results = await Promise.allSettled([
      isPro ? fetchSales() : Promise.resolve(null),
      fetchQueue('pending'),
      fetchVisitorCount(),
      fetchImpersonationAlerts('open'),
    ]);

    setSummary({
      sales: results[0].status === 'fulfilled' ? (results[0].value as SalesDashboard | null) : null,
      queue: results[1].status === 'fulfilled' ? (results[1].value as ScheduledPost[]) : [],
      visitors: results[2].status === 'fulfilled' ? (results[2].value as any).count : null,
      alerts: results[3].status === 'fulfilled' ? (results[3].value as any[]).length : null,
    });
    setLoading(false);
  }, [isPro]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const net = summary.sales?.totals.net ?? 0;
  const salesCount = summary.sales?.totals.sales ?? 0;

  return (
    <ScreenBackground>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

      <View style={[styles.headerShell, { paddingTop: headerTopInset }]}>
        <View style={[styles.header, { minHeight: HEADER_CONTENT_HEIGHT }]}>
          <View style={styles.roundSlot}>
            <BackButton navigation={navigation} style={styles.roundButton} />
          </View>
          <View style={styles.titleGroup}>
            <Text style={styles.title}>Studio créateur</Text>
          </View>
          <View style={styles.roundSlot} />
        </View>
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
          }
        >
          {/* Ce que l'abonnement a rapporté — en tête, et pas enfoui. */}
          <View style={styles.earningsCard}>
            <Text style={styles.earningsLabel}>Encaissé sur tes contenus</Text>
            <Text style={styles.earningsValue}>{net} NF</Text>
            <Text style={styles.earningsHint}>
              {salesCount === 0
                ? 'Aucune vente pour le moment'
                : `${salesCount} vente${salesCount > 1 ? 's' : ''} · tu gardes 70 % de chaque prix`}
            </Text>
          </View>

          <Text style={styles.sectionLabel}>Vendre</Text>

          <StudioRow
            icon="lock-closed"
            title="Contenus payants"
            subtitle={isPro
              ? `${summary.sales?.items.length ?? 0} contenu(s) en vente`
              : 'Réservé au palier Pro'}
            locked={!isPro}
            onPress={() => navigation.navigate('PaidContentSales')}
          />

          <StudioRow
            icon="at"
            title="Marché des pseudos"
            subtitle="Réserve, vends ou rachète un nom d'utilisateur"
            onPress={() => navigation.navigate('UsernameMarket')}
          />

          <Text style={styles.sectionLabel}>Publier</Text>

          <StudioRow
            icon="time"
            title="Publications programmées"
            subtitle={summary.queue.length
              ? `${summary.queue.length} en attente`
              : 'Écris maintenant, publie au bon moment'}
            badge={summary.queue.length || undefined}
            onPress={() => navigation.navigate('ScheduledPosts')}
          />

          <Text style={styles.sectionLabel}>Surveiller</Text>

          <StudioRow
            icon="eye"
            title="Visiteurs de ton profil"
            subtitle={summary.visitors != null
              ? `${summary.visitors} visiteur(s) sur 7 jours`
              : 'Qui est passé sur ta page'}
            onPress={() => navigation.navigate('ProfileInsights', { tab: 'visitors' })}
          />

          <StudioRow
            icon="shield-half"
            title="Alerte usurpation"
            subtitle={summary.alerts
              ? `${summary.alerts} compte(s) te ressemblent`
              : 'Aucun compte suspect détecté'}
            badge={summary.alerts || undefined}
            danger={Boolean(summary.alerts)}
            onPress={() => navigation.navigate('ProfileInsights', { tab: 'impersonation' })}
          />

          <StudioRow
            icon="trending-up"
            title="Radar des comptes qui montent"
            subtitle="Repère-les avant tout le monde"
            onPress={() => navigation.navigate('ProfileInsights', { tab: 'rising' })}
          />

          <StudioRow
            icon="flame"
            title="Tes tweets qui ont décollé"
            subtitle="Quand tu sors de ta propre courbe"
            onPress={() => navigation.navigate('ProfileInsights', { tab: 'velocity' })}
          />

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </ScreenBackground>
  );
}

function StudioRow({
  icon, title, subtitle, onPress, badge, locked, danger,
}: {
  icon: any;
  title: string;
  subtitle: string;
  onPress: () => void;
  badge?: number;
  locked?: boolean;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.rowIcon, danger && styles.rowIconDanger]}>
        <Ionicons name={icon} size={18} color={danger ? colors.red : colors.textPrimary} />
      </View>
      <View style={styles.rowTexts}>
        <View style={styles.rowTitleLine}>
          <Text style={styles.rowTitle}>{title}</Text>
          {locked && (
            <View style={styles.proTag}>
              <Text style={styles.proTagText}>PRO</Text>
            </View>
          )}
        </View>
        <Text style={styles.rowSubtitle} numberOfLines={1}>{subtitle}</Text>
      </View>
      {badge ? (
        <View style={[styles.badge, danger && styles.badgeDanger]}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  headerShell: { backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  roundSlot: { width: 40, alignItems: 'center' },
  roundButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  titleGroup: { flex: 1, alignItems: 'center' },
  title: { color: colors.textPrimary, fontSize: 17, fontWeight: '700' },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 16, paddingTop: 8 },

  earningsCard: {
    borderRadius: radius.lg,
    padding: 18,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    marginBottom: 8,
  },
  earningsLabel: { color: colors.textSecondary, fontSize: 13 },
  earningsValue: {
    color: colors.textPrimary,
    fontSize: 32,
    fontWeight: '800',
    marginTop: 6,
  },
  earningsHint: { color: colors.textMuted, fontSize: 12, marginTop: 6 },

  sectionLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 22,
    marginBottom: 10,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
    marginRight: 12,
  },
  rowIconDanger: { backgroundColor: colors.redMuted },
  rowTexts: { flex: 1 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center' },
  rowTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  rowSubtitle: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
  proTag: {
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: colors.warningMuted,
  },
  proTagText: { color: colors.gold, fontSize: 10, fontWeight: '800' },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    marginRight: 8,
  },
  badgeDanger: { backgroundColor: colors.red },
  badgeText: { color: colors.onAccent, fontSize: 11, fontWeight: '800' },
});
