import { fonts } from '../theme';
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
import { reportService, Report } from '../services/reportService';
import { useNavigation } from '@react-navigation/native';
import { toast } from './ui/Toast';
import { confirmAsync } from './ui/ConfirmSheet';

const { width: screenWidth } = Dimensions.get('window');

interface ReportsManagerProps {
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
  glassBorder: 'rgba(255, 255, 255, 0.1)',
  glassBackground: 'rgba(255, 255, 255, 0.05)',
};

const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
};

export default function ReportsManager({ onClose }: ReportsManagerProps) {
  const { isModerator, canViewReports } = useAdminPermissions();
  const navigation = useNavigation();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'investigating' | 'resolved' | 'dismissed'>('all');

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    try {
      console.log('🔄 Début du chargement des signalements...');
      setLoading(true);
      const reportsData = await reportService.getReports();
      console.log('🚩 Reports data reçu:', reportsData);
      
      if (reportsData) {
        setReports(reportsData.reports || []);
        console.log('✅ Signalements chargés avec succès');
      } else {
        setReports([]);
      }
    } catch (error) {
      console.error('❌ Erreur lors du chargement des signalements:', error);
      toast.error('Impossible de charger les signalements');
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  if (!canViewReports) {
    return null;
  }

  const filteredReports = reports?.filter(report => {
    if (filter === 'all') return true;
    return report.status === filter;
  }) || [];

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return '#ff6b6b';
      case 'high': return '#ffa502';
      case 'medium': return '#ffc107';
      case 'low': return '#43e97b';
      default: return '#9BA1AC';
    }
  };

  const handleReportPress = (report: Report) => {
    if (report.target_type === 'tweet' && report.target?.id) {
      // Naviguer vers le tweet
      (navigation as any).navigate('TweetDetail', { tweetId: report.target.id });
    } else if (report.target_type === 'user' && report.target?.id) {
      // Naviguer vers le profil utilisateur
      (navigation as any).navigate('UserProfile', { userId: report.target.id });
    } else {
      // Si pas de données de cible, afficher les détails du signalement
      setSelectedReport(report);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#ffa502';
      case 'investigating': return '#4F7CFF';
      case 'resolved': return '#43e97b';
      case 'dismissed': return '#9BA1AC';
      default: return '#9BA1AC';
    }
  };

  const handleReportAction = async (report: Report, action: 'resolve' | 'dismiss' | 'escalate') => {
    const actionText = {
      resolve: 'résoudre',
      dismiss: 'rejeter',
      escalate: 'escalader'
    }[action];

    confirmAsync({
      title: `Action sur le signalement`,
      message: `Voulez-vous vraiment ${actionText} ce signalement ?`,
      confirmLabel: actionText.charAt(0).toUpperCase() + actionText.slice(1),
      destructive: true,
    }).then((ok) => {
      if (ok) (async () => {
            try {
              const status = action === 'resolve' ? 'resolved' : 'dismissed';
              const success = await reportService.updateReportStatus(report.id, { status });
              if (success) {
                toast.success(`Signalement ${actionText} avec succès`);
                loadReports(); // Recharger les données
              } else {
                toast.error('Impossible de traiter le signalement');
              }
            } catch (error) {
              console.error('❌ Erreur lors de l\'action sur le signalement:', error);
              toast.error('Une erreur est survenue');
            }
            setSelectedReport(null);
          })();
    });
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

  if (loading) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={[COLORS.bgPrimary, COLORS.bgSecondary]}
          style={styles.gradient}
        >
          <View style={styles.loadingContainer}>
            <Ionicons name="refresh" size={48} color={COLORS.primary} />
            <Text style={styles.loadingText}>Chargement des signalements...</Text>
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
              <Text style={styles.title}>Gestion des Signalements</Text>
              <Text style={styles.subtitle}>
                {reports?.length || 0} signalement(s) au total
              </Text>
            </View>
          </View>
        </BlurView>

        {/* Filtres */}
        <View style={styles.filtersContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {[
                              { key: 'all', label: 'Tous', count: reports?.length || 0 },
                      { key: 'pending', label: 'En attente', count: reports?.filter(r => r.status === 'pending').length || 0 },
        { key: 'investigating', label: 'En cours', count: reports?.filter(r => r.status === 'investigating').length || 0 },
        { key: 'resolved', label: 'Résolus', count: reports?.filter(r => r.status === 'resolved').length || 0 },
        { key: 'dismissed', label: 'Rejetés', count: reports?.filter(r => r.status === 'dismissed').length || 0 },
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

        {/* Liste des signalements */}
        <ScrollView style={styles.reportsList} showsVerticalScrollIndicator={false}>
          {filteredReports.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-circle" size={64} color={COLORS.textMuted} />
              <Text style={styles.emptyStateTitle}>Aucun signalement</Text>
              <Text style={styles.emptyStateText}>
                {filter === 'all' ? 'Aucun signalement trouvé' : 'Aucun signalement dans cette catégorie'}
              </Text>
            </View>
          ) : (
            filteredReports.map((report) => (
                             <TouchableOpacity
                 key={report.id}
                 style={styles.reportCard}
                 onPress={() => handleReportPress(report)}
                 activeOpacity={0.8}
               >
                <BlurView intensity={30} style={styles.reportCardBlur}>
                  <LinearGradient
                    colors={[`${getSeverityColor(report.severity)}20`, `${getSeverityColor(report.severity)}10`]}
                    style={styles.reportCardGradient}
                  >
                    {/* Header du signalement */}
                    <View style={styles.reportHeader}>
                      <View style={styles.reportType}>
                        <Ionicons 
                          name={
                            report.target_type === 'tweet' ? 'chatbubble-outline' :
                            report.target_type === 'user' ? 'person-outline' : 'chatbubble-ellipses-outline'
                          } 
                          size={16} 
                          color={getSeverityColor(report.severity)} 
                        />
                        <Text style={[styles.reportTypeText, { color: getSeverityColor(report.severity) }]}>
                          {report.target_type === 'tweet' ? 'Tweet' : report.target_type === 'user' ? 'Utilisateur' : 'Commentaire'}
                        </Text>
                      </View>
                      
                      <View style={styles.reportPriority}>
                        <Ionicons 
                          name="flag" 
                          size={14} 
                          color={getSeverityColor(report.severity)} 
                        />
                        <Text style={[styles.priorityText, { color: getSeverityColor(report.severity) }]}>
                          Sévérité {report.severity}
                        </Text>
                      </View>
                    </View>

                    {/* Contenu du signalement */}
                    <View style={styles.reportContent}>
                      <Text style={styles.reportTitle}>
                        Signalé par {report.reporter?.username || 'Utilisateur'}
                      </Text>
                      <Text style={styles.reportTarget}>
                        Cible : {report.target_type === 'tweet' ? 'Tweet' : 'Utilisateur'}
                      </Text>
                      <Text style={styles.reportReason}>
                        Raison : {report.reason}
                      </Text>
                      <Text style={styles.reportDate}>
                        {formatDate(report.created_at)}
                      </Text>
                    </View>

                    {/* Status et actions */}
                    <View style={styles.reportFooter}>
                      <View style={styles.reportStatus}>
                        <View style={[styles.statusDot, { backgroundColor: getStatusColor(report.status) }]} />
                        <Text style={[styles.statusText, { color: getStatusColor(report.status) }]}>
                          {report.status === 'pending' ? 'En attente' :
                           report.status === 'investigating' ? 'En cours' :
                           report.status === 'resolved' ? 'Résolu' : 'Rejeté'}
                        </Text>
                      </View>

                      {report.status === 'pending' && (
                        <View style={styles.reportActions}>
                          <TouchableOpacity
                            style={styles.actionButton}
                            onPress={() => handleReportAction(report, 'resolve')}
                            activeOpacity={0.7}
                          >
                            <LinearGradient
                              colors={[COLORS.success, '#38f9d7']}
                              style={styles.actionButtonGradient}
                            >
                              <Ionicons name="checkmark" size={14} color="white" />
                              <Text style={styles.actionButtonText}>Résoudre</Text>
                            </LinearGradient>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.actionButton}
                            onPress={() => handleReportAction(report, 'dismiss')}
                            activeOpacity={0.7}
                          >
                            <LinearGradient
                              colors={[COLORS.danger, '#ff4757']}
                              style={styles.actionButtonGradient}
                            >
                              <Ionicons name="close" size={14} color="white" />
                              <Text style={styles.actionButtonText}>Rejeter</Text>
                            </LinearGradient>
                          </TouchableOpacity>
                        </View>
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
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 10,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
  },
  filterBadgeText: {
    fontSize: 12,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: 'white',
  },
  reportsList: {
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
  reportCard: {
    marginBottom: SPACING.md,
    borderRadius: 16,
    overflow: 'hidden',
  },
  reportCardBlur: {
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.glassBackground,
  },
  reportCardGradient: {
    padding: SPACING.lg,
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  reportType: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reportTypeText: {
    fontSize: 12,
    fontWeight: '600', fontFamily: fonts.semibold,
    marginLeft: SPACING.xs,
    textTransform: 'uppercase',
  },
  reportPriority: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  priorityText: {
    fontSize: 12,
    fontWeight: '600', fontFamily: fonts.semibold,
    marginLeft: SPACING.xs,
  },
  reportContent: {
    marginBottom: SPACING.md,
  },
  reportTitle: {
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  reportTarget: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  reportReason: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  reportDate: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  reportFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reportStatus: {
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
  reportActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  actionButton: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  actionButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: 'white',
    marginLeft: SPACING.xs,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xxl,
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: 18,
    color: COLORS.textSecondary,
  },
});
