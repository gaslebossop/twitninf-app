import { fonts , colors} from '../theme';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useAdminPermissions } from '../hooks/useAdminPermissions';
import { moderationService, ModerationAction } from '../services/moderationService';
import { toast } from './ui/Toast';

const { width: screenWidth } = Dimensions.get('window');

interface ModerationHistoryProps {
  onClose: () => void;
}

const COLORS = {
  primary: '#4F7CFF',
  secondary: '#667eea',
  success: '#43e97b',
  warning: '#ffc107',
  danger: '#ff6b6b',
  bgPrimary: '#0B0C0F',
  bgSecondary: '#15171C',
  textPrimary: '#ffffff',
  textSecondary: '#cbd5e0',
  textMuted: '#9BA1AC',
  glassBorder: colors.overlayMedium,
  glassBackground: colors.overlaySoft,
};

const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
};

export default function ModerationHistory({ onClose }: ModerationHistoryProps) {
  const { isModerator, canViewReports } = useAdminPermissions();
  const [actions, setActions] = useState<ModerationAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'ban' | 'suspend' | 'delete' | 'warn'>('all');
  const [selectedAction, setSelectedAction] = useState<ModerationAction | null>(null);

  useEffect(() => {
    loadModerationHistory();
  }, []);

  const loadModerationHistory = async () => {
    try {
      console.log('🔄 Début du chargement de l\'historique...');
      setLoading(true);
      const historyData = await moderationService.getModerationHistory();
      console.log('📜 History data reçu:', historyData);
      console.log('📜 History data type:', typeof historyData);
      console.log('📜 History data length:', historyData?.length);
      console.log('📜 History data is array:', Array.isArray(historyData));
      setActions(historyData || []);
      console.log('✅ Historique chargé avec succès');
    } catch (error) {
      console.error('❌ Erreur lors du chargement de l\'historique:', error);
      toast.error('Impossible de charger l\'historique de modération');
      setActions([]);
    } finally {
      setLoading(false);
    }
  };

  if (!canViewReports) {
    return null;
  }

  const filteredActions = actions?.filter(action => {
    if (filter === 'all') return true;
    return action.type === filter;
  }) || [];

  const getActionColor = (type: string) => {
    switch (type) {
      case 'ban': return '#ff6b6b';
      case 'suspend': return '#ffa502';
      case 'delete': return '#ff4757';
      case 'warn': return '#ffc107';
      case 'approve': return '#43e97b';
      default: return '#9BA1AC';
    }
  };

  const getActionIcon = (type: string) => {
    switch (type) {
      case 'ban': return 'ban';
      case 'suspend': return 'pause';
      case 'delete': return 'trash';
      case 'warn': return 'warning';
      case 'approve': return 'checkmark';
      default: return 'shield';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return '#43e97b';
      case 'expired': return '#9BA1AC';
      case 'reversed': return '#ff6b6b';
      default: return '#9BA1AC';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDuration = (duration?: number) => {
    if (!duration) return 'Permanent';
    if (duration < 24) return `${duration}h`;
    if (duration < 168) return `${Math.floor(duration / 24)}j`;
    return `${Math.floor(duration / 168)}sem`;
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={[COLORS.bgPrimary, COLORS.bgSecondary]}
          style={styles.gradient}
        >
          <View style={styles.loadingContainer}>
            <Ionicons name="refresh" size={48} color={COLORS.primary} />
            <Text style={styles.loadingText}>Chargement de l'historique...</Text>
          </View>
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.bgPrimary, COLORS.bgSecondary]}
        style={styles.gradient}
      >
        {/* Header */}
        <BlurView intensity={40} style={styles.header}>
          <View style={styles.headerContent}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <LinearGradient
                colors={[`${COLORS.primary}30`, `${COLORS.primary}10`]}
                style={styles.closeButtonGradient}
              >
                <Ionicons name="close" size={24} color={COLORS.primary} />
              </LinearGradient>
            </TouchableOpacity>
            
            <View style={styles.headerInfo}>
              <Text style={styles.title}>Historique de Modération</Text>
              <Text style={styles.subtitle}>
                {actions?.length || 0} action(s) au total
              </Text>
            </View>
          </View>
        </BlurView>

        {/* Filtres */}
        <View style={styles.filtersContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                          {[
                { key: 'all', label: 'Toutes', count: actions?.length || 0 },
                { key: 'ban', label: 'Bannissements', count: actions?.filter(a => a.type === 'ban').length || 0 },
                { key: 'suspend', label: 'Suspensions', count: actions?.filter(a => a.type === 'suspend').length || 0 },
                { key: 'delete', label: 'Suppressions', count: actions?.filter(a => a.type === 'delete').length || 0 },
                { key: 'warn', label: 'Avertissements', count: actions?.filter(a => a.type === 'warn').length || 0 },
              ].map((filterOption) => (
              <TouchableOpacity
                key={filterOption.key}
                style={[
                  styles.filterButton,
                  filter === filterOption.key && styles.filterButtonActive
                ]}
                onPress={() => setFilter(filterOption.key as any)}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={
                    filter === filterOption.key
                      ? [COLORS.primary, COLORS.secondary]
                      : [`${COLORS.primary}20`, `${COLORS.primary}10`]
                  }
                  style={styles.filterButtonGradient}
                >
                  <Text style={[
                    styles.filterButtonText,
                    filter === filterOption.key && styles.filterButtonTextActive
                  ]}>
                    {filterOption.label}
                  </Text>
                  <View style={styles.filterBadge}>
                    <Text style={styles.filterBadgeText}>
                      {filterOption.count}
                    </Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Liste des actions */}
        <ScrollView style={styles.actionsList} showsVerticalScrollIndicator={false}>
          {filteredActions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="shield-checkmark" size={64} color={COLORS.textMuted} />
              <Text style={styles.emptyStateTitle}>Aucune action</Text>
              <Text style={styles.emptyStateText}>
                {filter === 'all' ? 'Aucune action de modération trouvée' : 'Aucune action dans cette catégorie'}
              </Text>
            </View>
          ) : (
            filteredActions.map((action) => (
              <TouchableOpacity
                key={action.id}
                style={styles.actionCard}
                onPress={() => setSelectedAction(action)}
                activeOpacity={0.8}
              >
                <BlurView intensity={30} style={styles.actionCardBlur}>
                  <LinearGradient
                    colors={[`${getActionColor(action.type)}20`, `${getActionColor(action.type)}10`]}
                    style={styles.actionCardGradient}
                  >
                    {/* Header de l'action */}
                    <View style={styles.actionHeader}>
                      <View style={styles.actionType}>
                        <LinearGradient
                          colors={[getActionColor(action.type), `${getActionColor(action.type)}80`]}
                          style={styles.actionIconContainer}
                        >
                          <Ionicons 
                            name={getActionIcon(action.type) as any} 
                            size={16} 
                            color="white" 
                          />
                        </LinearGradient>
                        <Text style={[styles.actionTypeText, { color: getActionColor(action.type) }]}>
                          {action.type === 'ban' ? 'Bannissement' :
                           action.type === 'suspend' ? 'Suspension' :
                           action.type === 'delete' ? 'Suppression' :
                           action.type === 'warn' ? 'Avertissement' : 'Approbation'}
                        </Text>
                      </View>
                      
                      <View style={styles.actionStatus}>
                        <View style={[styles.statusDot, { backgroundColor: getStatusColor(action.status) }]} />
                        <Text style={[styles.statusText, { color: getStatusColor(action.status) }]}>
                          {action.status === 'active' ? 'Actif' :
                           action.status === 'expired' ? 'Expiré' : 'Annulé'}
                        </Text>
                      </View>
                    </View>

                    {/* Contenu de l'action */}
                    <View style={styles.actionContent}>
                      <Text style={styles.actionTitle}>
                        {action.targetType === 'user' ? 'Utilisateur' : 
                         action.targetType === 'tweet' ? 'Tweet' : 'Commentaire'} : {action.targetName}
                      </Text>
                      <Text style={styles.actionModerator}>
                        Modérateur : {action.moderatorName}
                      </Text>
                      <Text style={styles.actionReason}>
                        Raison : {action.reason}
                      </Text>
                      {action.duration && (
                        <Text style={styles.actionDuration}>
                          Durée : {formatDuration(action.duration)}
                        </Text>
                      )}
                      <Text style={styles.actionDate}>
                        {formatDate(action.createdAt)}
                      </Text>
                    </View>

                    {/* Actions rapides */}
                    <View style={styles.actionFooter}>
                      <TouchableOpacity
                        style={styles.detailButton}
                        onPress={() => setSelectedAction(action)}
                        activeOpacity={0.7}
                      >
                        <LinearGradient
                          colors={[`${COLORS.primary}30`, `${COLORS.primary}10`]}
                          style={styles.detailButtonGradient}
                        >
                          <Ionicons name="information-circle" size={14} color={COLORS.primary} />
                          <Text style={styles.detailButtonText}>Détails</Text>
                        </LinearGradient>
                      </TouchableOpacity>

                      {action.status === 'active' && (
                        <TouchableOpacity
                          style={styles.reverseButton}
                          onPress={() => {
                            toast.error('Annuler l\'action', {
                              description: 'Cette fonctionnalité sera bientôt disponible',
                            });
                          }}
                          activeOpacity={0.7}
                        >
                          <LinearGradient
                            colors={[`${COLORS.warning}30`, `${COLORS.warning}10`]}
                            style={styles.reverseButtonGradient}
                          >
                            <Ionicons name="refresh" size={14} color={COLORS.warning} />
                            <Text style={[styles.reverseButtonText, { color: COLORS.warning }]}>
                              Annuler
                            </Text>
                          </LinearGradient>
                        </TouchableOpacity>
                      )}
                    </View>
                  </LinearGradient>
                </BlurView>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
  },
  gradient: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  loadingText: {
    marginTop: SPACING.sm,
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  header: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
    borderRadius: 20,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.glassBackground,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  closeButton: {
    marginRight: SPACING.lg,
  },
  closeButtonGradient: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: `${COLORS.primary}30`,
  },
  headerInfo: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  filtersContainer: {
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  filterButton: {
    marginRight: SPACING.md,
  },
  filterButtonActive: {
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  filterButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '500', fontFamily: fonts.medium,
    color: COLORS.textSecondary,
    marginRight: SPACING.sm,
  },
  filterButtonTextActive: {
    color: 'white',
  },
  filterBadge: {
    backgroundColor: colors.overlayStrong,
    borderRadius: 10,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
  },
  filterBadgeText: {
    fontSize: 12,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: 'white',
  },
  actionsList: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxl,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: COLORS.textPrimary,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  emptyStateText: {
    fontSize: 16,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  actionCard: {
    marginBottom: SPACING.md,
    borderRadius: 16,
    overflow: 'hidden',
  },
  actionCardBlur: {
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.glassBackground,
  },
  actionCardGradient: {
    padding: SPACING.lg,
  },
  actionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  actionType: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  actionTypeText: {
    fontSize: 14,
    fontWeight: '600', fontFamily: fonts.semibold,
    textTransform: 'uppercase',
  },
  actionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: SPACING.xs,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500', fontFamily: fonts.medium,
  },
  actionContent: {
    marginBottom: SPACING.md,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  actionModerator: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  actionReason: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  actionDuration: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  actionDate: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  actionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailButton: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  detailButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderWidth: 1,
    borderColor: `${COLORS.primary}30`,
  },
  detailButtonText: {
    fontSize: 12,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: COLORS.primary,
    marginLeft: SPACING.xs,
  },
  reverseButton: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  reverseButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderWidth: 1,
    borderColor: `${COLORS.warning}30`,
  },
  reverseButtonText: {
    fontSize: 12,
    fontWeight: '600', fontFamily: fonts.semibold,
    marginLeft: SPACING.xs,
  },
});
