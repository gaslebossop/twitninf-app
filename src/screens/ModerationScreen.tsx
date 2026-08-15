import { colors, fonts, radius , statusBarStyle} from '../theme';
import { AppHeader, ScreenBackground, ScreenSkeleton } from '../components/ui';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  RefreshControl,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAdminPermissions } from '../hooks/useAdminPermissions';
import { useAuth } from '../contexts/AuthContext';
import { moderationService } from '../services/moderationService';
import { toast } from '../components/ui/Toast';

const { width: screenWidth } = Dimensions.get('window');
const CARD_GAP = 10;
const CARD_WIDTH = (screenWidth - 20 * 2 - CARD_GAP) / 2;

/** Vocabulaire de tons fermé — reprend le systeme `tone-*` de la console
 *  desktop. Remplace l'ancien pattern « un degrade unique par bouton de
 *  menu », deja identifie comme un tic « genere par IA » ailleurs dans
 *  l'app (SettingsScreen) et corrige de la meme facon ici. */
type Tone = 'accent' | 'gold' | 'cyan' | 'danger' | 'neutral';

const TONE_COLOR: Record<Tone, string> = {
  accent: colors.accent,
  gold: colors.gold,
  cyan: colors.cyan,
  danger: colors.red,
  neutral: colors.textMuted,
};
const TONE_SOFT: Record<Tone, string> = {
  accent: colors.accentSoft,
  gold: 'rgba(255,210,77,0.10)',
  cyan: colors.cyanSoft,
  danger: colors.redMuted,
  neutral: colors.overlaySoft,
};

interface StatisticsData {
  totalUsers: number;
  activeUsers: number;
  totalTweets: number;
  pendingReports: number;
  verificationRequests: number;
  moderationActions: number;
  bannedUsers: number;
  suspendedUsers: number;
  flaggedContent: number;
  pendingReviews: number;
  recentActions: number;
  systemHealth: number;
}

interface ActionCard {
  action: string;
  title: string;
  subtitle: string;
  icon: string;
  group: string;
  tone: Tone;
  available: boolean;
}

interface Report {
  id: string;
  type: 'tweet' | 'user' | 'comment';
  reporterId: string;
  reporterName: string;
  targetId: string;
  targetName: string;
  reason: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'reviewing' | 'resolved' | 'dismissed';
  createdAt: string;
  priority: number;
}

interface ModerationAction {
  id: string;
  type: 'ban' | 'suspend' | 'delete' | 'warn' | 'approve';
  targetType: 'user' | 'tweet' | 'comment';
  targetId: string;
  targetName: string;
  moderatorId: string;
  moderatorName: string;
  reason: string;
  duration?: number;
  createdAt: string;
  status: 'active' | 'expired' | 'reversed';
}

function fmt(value: number) {
  return value.toLocaleString('fr-FR');
}

/** Section label — pendant du `<h3>` d'une `Card` desktop. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

/** Tuile de metrique — pendant du `.admin-stat` desktop. */
function Metric({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: Tone }) {
  return (
    <View style={[styles.metric, { width: CARD_WIDTH }]}>
      <View style={styles.metricLabelRow}>
        <View style={[styles.metricDot, { backgroundColor: TONE_COLOR[tone] }]} />
        <Text style={styles.metricLabel}>{label}</Text>
      </View>
      <Text style={styles.metricValue}>{fmt(value)}</Text>
    </View>
  );
}

export default function ModerationScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const {
    isAdmin, isModerator, isSuperAdmin, isClasseur, isEconomyGuardian,
    canBanUsers, canSuspendUsers, canDeleteTweets,
    canViewReports, canViewAnalytics, canManageModerators,
    canModerateContent, canManageEconomy,
    loading: permissionsLoading,
  } = useAdminPermissions();
  const { user } = useAuth();

  const [refreshing, setRefreshing] = useState(false);

  const [stats, setStats] = useState<StatisticsData>({
    totalUsers: 0,
    activeUsers: 0,
    totalTweets: 0,
    pendingReports: 0,
    verificationRequests: 0,
    moderationActions: 0,
    bannedUsers: 0,
    suspendedUsers: 0,
    flaggedContent: 0,
    pendingReviews: 0,
    recentActions: 0,
    systemHealth: 100,
  });

  const getAvailableActions = useCallback((): ActionCard[] => {
    const list: ActionCard[] = [
      { action: 'dashboard', title: 'Tableau de bord', subtitle: 'Vue d\'ensemble de la moderation', icon: 'stats-chart-outline', group: 'Pilotage', tone: 'neutral', available: true },
    ];

    if (canViewReports && !isClasseur) {
      list.push({ action: 'reports', title: 'Signalements', subtitle: 'Gerer les signalements utilisateurs', icon: 'flag-outline', group: 'Moderation', tone: 'danger', available: true });
    }
    if (canDeleteTweets || canModerateContent) {
      list.push({
        action: 'tweets',
        title: isClasseur ? 'Classification contenu' : 'Moderation contenu',
        subtitle: isClasseur ? 'Exclure des recommandations' : 'Approuver, rejeter, supprimer',
        icon: 'document-text-outline', group: 'Moderation', tone: 'danger', available: true,
      });
    }
    if ((canBanUsers || canSuspendUsers) && !isClasseur) {
      list.push({ action: 'users', title: 'Gestion utilisateurs', subtitle: 'Bannir, suspendre, verifier', icon: 'people-outline', group: 'Moderation', tone: 'accent', available: true });
    }
    if ((isAdmin || isSuperAdmin) && !isClasseur) {
      list.push({ action: 'unban-tickets', title: 'Tickets de deban', subtitle: 'Reviser les demandes de debannissement', icon: 'mail-unread-outline', group: 'Moderation', tone: 'accent', available: true });
    }

    if (canManageModerators) {
      list.push({ action: 'moderators', title: 'Moderateurs', subtitle: 'Promouvoir, retrograder', icon: 'shield-checkmark-outline', group: 'Gouvernance', tone: 'cyan', available: true });
    }
    if (isAdmin || isSuperAdmin) {
      list.push({ action: 'similarity-algorithm', title: 'Fil « Pour vous »', subtitle: isSuperAdmin ? 'Formules du moteur + visibilite' : 'Qui est mis en avant', icon: 'git-network-outline', group: 'Gouvernance', tone: 'cyan', available: true });
    }

    if (canManageEconomy) {
      list.push({ action: 'economy', title: 'Economie', subtitle: 'Surveillance NF, rich list et transferts', icon: 'cash-outline', group: 'Finance & risque', tone: 'gold', available: true });
      list.push({ action: 'monetization-program', title: 'Programme de monétisation', subtitle: 'Valider les candidatures créateurs', icon: 'trophy-outline', group: 'Finance & risque', tone: 'gold', available: true });
    }

    if (canViewAnalytics && !isClasseur) {
      list.push({ action: 'analytics', title: 'Analyses avancees', subtitle: 'Statistiques et tendances', icon: 'analytics-outline', group: 'Traçabilite', tone: 'neutral', available: true });
    }
    if (isAdmin || isSuperAdmin) {
      list.push({ action: 'events', title: 'Evenements', subtitle: 'Themes Halloween, Noel, etc.', icon: 'calendar-outline', group: 'Traçabilite', tone: 'neutral', available: true });
      list.push({ action: 'functional-events', title: 'Evenements fonctionnels', subtitle: 'Double XP, messages illimites, etc.', icon: 'flash-outline', group: 'Traçabilite', tone: 'neutral', available: true });
      list.push({ action: 'forge-review', title: 'File de la Forge', subtitle: 'Idees proposees par les utilisateurs, et leur recompense', icon: 'hammer-outline', group: 'Traçabilite', tone: 'neutral', available: true });
      list.push({ action: 'feature-flags', title: 'Fonctionnalites en test', subtitle: 'Ouvrir une nouveaute a un groupe, puis a tout le monde', icon: 'flag-outline', group: 'Traçabilite', tone: 'neutral', available: true });
    }
    if (!isClasseur) {
      list.push({ action: 'history', title: 'Historique', subtitle: 'Actions de moderation passees', icon: 'time-outline', group: 'Traçabilite', tone: 'neutral', available: true });
    }

    return list;
  }, [
    canViewReports, canViewAnalytics, canBanUsers, canSuspendUsers,
    canDeleteTweets, canManageModerators, isClasseur, canModerateContent,
    canManageEconomy, isAdmin, isSuperAdmin,
  ]);

  const loadRealStats = useCallback(async () => {
    try {
      const apiStats = await moderationService.getModerationStats();
      setStats({
        totalUsers: apiStats.totalUsers,
        activeUsers: apiStats.activeUsers,
        totalTweets: apiStats.totalTweets,
        pendingReports: apiStats.pendingReports,
        verificationRequests: 0,
        moderationActions: apiStats.moderationActions,
        bannedUsers: apiStats.bannedUsers,
        suspendedUsers: apiStats.suspendedUsers,
        flaggedContent: apiStats.totalReports,
        pendingReviews: apiStats.pendingReports,
        recentActions: apiStats.moderationActions,
        systemHealth: 100,
      });
    } catch (error) {
      // Garder les valeurs par defaut en cas d'erreur
    }
  }, []);

  useEffect(() => {
    loadRealStats();
  }, [loadRealStats]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadRealStats();
    setRefreshing(false);
  }, [loadRealStats]);

  const handleAction = useCallback((action: string, title: string) => {
    switch (action) {
      case 'dashboard':
        break;
      case 'economy':
        if (canManageEconomy) (navigation as any).navigate('EconomyManagement');
        else toast.error('Permission refusee', {
          description: 'Vous n\'avez pas la permission de gerer l\'economie',
        });
        break;
      case 'monetization-program':
        if (canManageEconomy) (navigation as any).navigate('MonetizationProgramAdmin');
        else toast.error('Permission refusee', {
          description: 'Vous n\'avez pas la permission de gerer l\'economie',
        });
        break;
      case 'tweets':
        if (canDeleteTweets || canModerateContent) (navigation as any).navigate('ContentModeration');
        else toast.error('Permission refusee', {
          description: 'Vous n\'avez pas la permission de moderer le contenu',
        });
        break;
      case 'reports':
        if (canViewReports && !isClasseur) (navigation as any).navigate('Reports');
        else if (isClasseur) toast.info('Acces limite', {
          description: 'En tant que classeur de tweets, vous n\'avez acces qu\'a la moderation de contenu',
        });
        else toast.error('Permission refusee', {
          description: 'Vous n\'avez pas la permission de voir les signalements',
        });
        break;
      case 'users':
        if ((canBanUsers || canSuspendUsers) && !isClasseur) (navigation as any).navigate('UserManagement');
        else if (isClasseur) toast.info('Acces limite', {
          description: 'En tant que classeur de tweets, vous n\'avez acces qu\'a la moderation de contenu',
        });
        else toast.error('Permission refusee', {
          description: 'Vous n\'avez pas la permission de gerer les utilisateurs',
        });
        break;
      case 'analytics':
        if (canViewAnalytics && !isClasseur) (navigation as any).navigate('Analytics');
        else if (isClasseur) toast.info('Acces limite', {
          description: 'En tant que classeur de tweets, vous n\'avez acces qu\'a la moderation de contenu',
        });
        else toast.error('Permission refusee', {
          description: 'Vous n\'avez pas la permission de voir les analyses',
        });
        break;
      case 'moderators':
        if (canManageModerators) toast.info('Gestion des moderateurs', {
          description: 'Fonctionnalite en cours de developpement...',
        });
        else toast.error('Permission refusee', {
          description: 'Vous n\'avez pas la permission de gerer les moderateurs',
        });
        break;
      case 'events':
        if (isAdmin || isSuperAdmin) (navigation as any).navigate('EventManagement');
        else toast.error('Permission refusee', {
          description: 'Vous devez etre administrateur pour gerer les evenements',
        });
        break;
      case 'functional-events':
        if (isAdmin || isSuperAdmin) (navigation as any).navigate('FunctionalEventManagement');
        else toast.error('Permission refusee', {
          description: 'Vous devez etre administrateur pour gerer les evenements fonctionnels',
        });
        break;
      case 'forge-review':
        // Cet ecran VERSE de l'argent : il suit la meme porte que les autres
        // actions d'administration, relue en base cote serveur de toute facon.
        if (isAdmin || isSuperAdmin) (navigation as any).navigate('ForgeReview');
        else toast.error('Permission refusee', {
          description: 'Reserve aux administrateurs',
        });
        break;
      case 'feature-flags':
        if (isAdmin || isSuperAdmin) (navigation as any).navigate('FeatureFlagsAdmin');
        else toast.error('Permission refusee', {
          description: 'Vous devez etre administrateur pour gerer les drapeaux de fonctionnalites',
        });
        break;
      case 'similarity-algorithm':
        if (isAdmin || isSuperAdmin) (navigation as any).navigate('SimilarityAlgorithm');
        else toast.error('Permission refusee', {
          description: 'Reserve aux administrateurs',
        });
        break;
      case 'unban-tickets':
        if (isAdmin || isSuperAdmin) (navigation as any).navigate('UnbanTickets');
        else toast.error('Permission refusee', {
          description: 'Reserve aux administrateurs',
        });
        break;
      case 'history':
        if (!isClasseur) (navigation as any).navigate('ModerationHistory');
        else toast.info('Acces limite', {
          description: 'En tant que classeur de tweets, vous n\'avez acces qu\'a la moderation de contenu',
        });
        break;
      default:
        toast.info(`Fonctionnalite "${title}" en cours de developpement`);
    }
  }, [navigation, canDeleteTweets, canModerateContent, canViewReports, canBanUsers, canSuspendUsers, canViewAnalytics, canManageModerators, isClasseur, canManageEconomy, isAdmin, isSuperAdmin]);

  const roleLabel = isSuperAdmin ? 'SUPER ADMIN' : isAdmin ? 'ADMINISTRATEUR' : isEconomyGuardian ? 'GARDIEN ECO' : isModerator ? 'MODERATEUR' : 'UTILISATEUR';
  const roleTone: Tone = isSuperAdmin ? 'danger' : isAdmin ? 'accent' : isEconomyGuardian ? 'gold' : 'cyan';
  const roleIcon = (isSuperAdmin ? 'shield' : isAdmin ? 'shield-checkmark' : isEconomyGuardian ? 'cash' : isModerator ? 'shield-outline' : 'person') as keyof typeof Ionicons.glyphMap;

  if (permissionsLoading) {
    return (
      <ScreenBackground>
        <ScreenSkeleton variant="list" />
      </ScreenBackground>
    );
  }

  if (!canViewReports && !canModerateContent && !canManageEconomy) {
    return (
      <ScreenBackground>
        <View style={[styles.container, styles.centerFill, { paddingHorizontal: 32 }]}>
          <Ionicons name="shield-outline" size={64} color={colors.red} />
          <Text style={styles.deniedTitle}>Acces restreint</Text>
          <Text style={styles.deniedText}>Vous n'avez pas les permissions necessaires pour acceder a cette section.</Text>
          <TouchableOpacity style={styles.deniedButton} onPress={() => navigation.goBack()} activeOpacity={0.85}>
            <Text style={styles.deniedButtonText}>Retour</Text>
          </TouchableOpacity>
        </View>
      </ScreenBackground>
    );
  }

  const actions = getAvailableActions();
  const groups = Array.from(new Set(actions.map(a => a.group)));
  const backlog = stats.pendingReports;

  return (
    <ScreenBackground>
      <View style={styles.container}>
        <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />

        <AppHeader
          navigation={navigation}
          title={isSuperAdmin ? 'Administration' : 'Panneau admin'}
          subtitle="Console de gestion de la plateforme"
          right={(
            <View style={[styles.roleBadge, { backgroundColor: TONE_SOFT[roleTone] }]}>
              <Ionicons name={roleIcon} size={12} color={TONE_COLOR[roleTone]} />
              <Text style={[styles.roleBadgeText, { color: TONE_COLOR[roleTone] }]}>{roleLabel}</Text>
            </View>
          )}
        />

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentInner}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}
        >
          {!isClasseur && backlog > 0 && (
            <TouchableOpacity style={styles.queueBanner} onPress={() => handleAction('reports', 'Signalements')} activeOpacity={0.85}>
              <View style={styles.queueDot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.queueTitle}>{fmt(backlog)} signalement(s) en attente</Text>
                <Text style={styles.queueSubtitle}>Bloque tant qu'un moderateur ne tranche pas</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}

          <View style={styles.userCard}>
            <View style={styles.userAvatar}>
              <Ionicons name={roleIcon} size={26} color={TONE_COLOR[roleTone]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.userName}>{user?.full_name || user?.username || 'Administrateur'}</Text>
              <Text style={styles.userHandle}>@{user?.username || 'admin'}</Text>
            </View>
            <View style={styles.userStat}>
              <Text style={styles.userStatValue}>{fmt(stats.moderationActions)}</Text>
              <Text style={styles.userStatLabel}>actions</Text>
            </View>
          </View>

          {!isClasseur && (
            <>
              <SectionTitle>Comptes</SectionTitle>
              <View style={styles.metricsGrid}>
                <Metric label="Total" value={stats.totalUsers} />
                <Metric label="Actifs" value={stats.activeUsers} tone="cyan" />
                <Metric label="Suspendus" value={stats.suspendedUsers} tone="gold" />
                <Metric label="Bannis" value={stats.bannedUsers} tone="danger" />
              </View>

              <SectionTitle>Contenu &amp; moderation</SectionTitle>
              <View style={styles.metricsGrid}>
                <Metric label="Publications" value={stats.totalTweets} />
                <Metric label="Signalements" value={stats.pendingReports} tone="danger" />
                <Metric label="Actions enregistrees" value={stats.moderationActions} tone="cyan" />
                <Metric label="Verifications" value={stats.verificationRequests} tone="gold" />
              </View>
            </>
          )}

          {groups.map(group => (
            <View key={group}>
              <SectionTitle>{group}</SectionTitle>
              <View style={styles.actionsGrid}>
                {actions.filter(a => a.group === group).map(card => (
                  <TouchableOpacity
                    key={card.action}
                    style={[styles.actionCard, { width: CARD_WIDTH, borderColor: `${TONE_COLOR[card.tone]}33` }]}
                    onPress={() => handleAction(card.action, card.title)}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.actionIcon, { backgroundColor: TONE_SOFT[card.tone] }]}>
                      <Ionicons name={card.icon as keyof typeof Ionicons.glyphMap} size={20} color={TONE_COLOR[card.tone]} />
                    </View>
                    <Text style={styles.actionTitle} numberOfLines={1}>{card.title}</Text>
                    <Text style={styles.actionSubtitle} numberOfLines={2}>{card.subtitle}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}

          <View style={{ height: insets.bottom + 32 }} />
        </ScrollView>
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  centerFill: { justifyContent: 'center', alignItems: 'center', gap: 10 },
  loadingText: { color: colors.textSecondary, fontSize: 13 },

  roleBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999 },
  roleBadgeText: { fontFamily: fonts.bold, fontSize: 9.5, letterSpacing: 0.4 },

  content: { flex: 1 },
  contentInner: { paddingHorizontal: 20, paddingBottom: 20 },

  queueBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.accentMuted, backgroundColor: colors.accentSoft,
    padding: 14, marginBottom: 14,
  },
  queueDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  queueTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: 13 },
  queueSubtitle: { color: colors.textMuted, fontSize: 11, marginTop: 2 },

  userCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    padding: 14, marginBottom: 18,
  },
  userAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  userName: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: 14 },
  userHandle: { color: colors.textMuted, fontSize: 11.5, marginTop: 1 },
  userStat: { alignItems: 'flex-end' },
  userStatValue: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: 15 },
  userStatLabel: { color: colors.textMuted, fontSize: 10 },

  sectionTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: 13.5, marginTop: 18, marginBottom: 10 },

  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP },
  metric: {
    borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    padding: 12,
  },
  metricLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  metricDot: { width: 6, height: 6, borderRadius: 3 },
  metricLabel: { color: colors.textMuted, fontSize: 10.5, fontFamily: fonts.semibold, flexShrink: 1 },
  metricValue: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: 20, letterSpacing: -0.3 },

  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP },
  actionCard: {
    borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1,
    padding: 14, gap: 6, minHeight: 108,
  },
  actionIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  actionTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: 13 },
  actionSubtitle: { color: colors.textMuted, fontSize: 10.5, lineHeight: 14 },

  deniedTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: 22, marginTop: 16 },
  deniedText: { color: colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20, marginTop: 8 },
  deniedButton: { marginTop: 20, backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: 24, paddingVertical: 12 },
  deniedButtonText: { color: colors.onAccent, fontFamily: fonts.bold, fontSize: 14 },
});
