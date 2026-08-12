import { fonts , colors, statusBarStyle} from '../theme';
import { ScreenBackground, BackButton } from '../components/ui';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAdminPermissions } from '../hooks/useAdminPermissions';
import { moderationService, ModerationStats } from '../services/moderationService';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const COLORS = {
  primary: '#4F7CFF',
  secondary: '#3D63D9',
  accent: '#3354C4',
  bgPrimary: '#0B0C0F',
  bgSecondary: '#15171C',
  bgTertiary: '#1B1E25',
  textPrimary: '#F2F4F7',
  textSecondary: '#cbd5e0',
  textMuted: '#9BA1AC',
  success: '#2BC48A',
  error: '#F4365B',
  warning: '#E0A458',
  glassBorder: '#23262D',
  glassBackground: '#15171C',
};

const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
};

interface MetricData {
  label: string;
  value: number;
  change: number;
  changeType: 'increase' | 'decrease' | 'neutral';
  icon: string;
  color: string;
  trend: number[];
}

interface ChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    color: string;
  }[];
}

export default function AnalyticsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { isModerator, canViewAnalytics } = useAdminPermissions();
  
  const [selectedPeriod, setSelectedPeriod] = useState<'7d' | '30d' | '90d'>('7d');
  const [selectedMetric, setSelectedMetric] = useState<string>('users');
  const [animationValue] = useState(new Animated.Value(1));
  const [stats, setStats] = useState<ModerationStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      console.log('🔄 Début du chargement des statistiques...');
      setLoading(true);
      const statsData = await moderationService.getModerationStats();
      console.log('📊 Stats data reçu:', statsData);
      console.log('📊 Stats data type:', typeof statsData);
      setStats(statsData || {
        totalUsers: 0,
        activeUsers: 0,
        suspendedUsers: 0,
        bannedUsers: 0,
        totalTweets: 0,
        pendingTweets: 0,
        totalReports: 0,
        pendingReports: 0,
        moderationActions: 0
      });
      console.log('✅ Statistiques chargées avec succès');
    } catch (error) {
      console.error('❌ Erreur lors du chargement des statistiques:', error);
      setStats({
        totalUsers: 0,
        activeUsers: 0,
        suspendedUsers: 0,
        bannedUsers: 0,
        totalTweets: 0,
        pendingTweets: 0,
        totalReports: 0,
        pendingReports: 0,
        moderationActions: 0
      });
    } finally {
      setLoading(false);
    }
  };

  // Générer des métriques basées sur les vraies données
  const getMetrics = (): MetricData[] => {
    if (!stats) return [];
    
    return [
      {
        label: 'Utilisateurs Actifs',
        value: stats.activeUsers,
        change: 12.5,
        changeType: 'increase',
        icon: 'people',
        color: '#4facfe',
        trend: [stats.activeUsers * 0.9, stats.activeUsers * 0.95, stats.activeUsers],
      },
      {
        label: 'Publications',
        value: stats.totalTweets,
        change: -3.2,
        changeType: 'decrease',
        icon: 'chatbubble',
        color: '#f093fb',
        trend: [stats.totalTweets * 1.05, stats.totalTweets * 1.02, stats.totalTweets],
      },
      {
        label: 'Signalements',
        value: stats.totalReports,
        change: 45.2,
        changeType: 'increase',
        icon: 'flag',
        color: '#fa709a',
        trend: [stats.totalReports * 0.7, stats.totalReports * 0.85, stats.totalReports],
      },
      {
        label: 'Actions Modération',
        value: stats.moderationActions,
        change: 8.7,
        changeType: 'increase',
        icon: 'shield-checkmark',
        color: '#43e97b',
        trend: [stats.moderationActions * 0.9, stats.moderationActions * 0.95, stats.moderationActions],
      },
    ];
  };

  const getChartData = (): ChartData => {
    if (!stats) return { labels: [], datasets: [] };
    
    return {
      labels: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
      datasets: [
        {
          label: 'Utilisateurs',
          data: [stats.activeUsers * 0.9, stats.activeUsers * 0.95, stats.activeUsers, stats.activeUsers * 0.98, stats.activeUsers * 1.02, stats.activeUsers, stats.activeUsers],
          color: '#4facfe',
        },
        {
          label: 'Publications',
          data: [stats.totalTweets * 1.05, stats.totalTweets * 1.02, stats.totalTweets, stats.totalTweets * 0.98, stats.totalTweets * 1.01, stats.totalTweets * 0.99, stats.totalTweets],
          color: '#f093fb',
        },
      ],
    };
  };

  const getChangeIcon = (changeType: string) => {
    switch (changeType) {
      case 'increase': return 'trending-up';
      case 'decrease': return 'trending-down';
      default: return 'remove';
    }
  };

  const getChangeColor = (changeType: string) => {
    switch (changeType) {
      case 'increase': return COLORS.success;
      case 'decrease': return COLORS.error;
      default: return COLORS.textMuted;
    }
  };

  const renderSimpleChart = (data: number[], color: string) => {
    const maxValue = Math.max(...data);
    const minValue = Math.min(...data);
    const range = maxValue - minValue;
    
    return (
      <View style={styles.chartContainer}>
        <View style={styles.chartBars}>
          {data.map((value, index) => {
            const height = range > 0 ? ((value - minValue) / range) * 60 : 30;
            return (
              <View key={index} style={styles.chartBarContainer}>
                <View 
                  style={[
                    styles.chartBar, 
                    { 
                      height: height,
                      backgroundColor: color,
                      opacity: 0.3 + (0.7 * (index / (data?.length || 1))),
                    }
                  ]} 
                />
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  if (!canViewAnalytics) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={[COLORS.bgPrimary, COLORS.bgSecondary]} style={styles.accessDeniedGradient}>
          <View style={styles.accessDeniedContent}>
            <Ionicons name="shield-outline" size={80} color={COLORS.error} />
            <Text style={styles.accessDeniedTitle}>Accès Restreint</Text>
            <Text style={styles.accessDeniedText}>
              Vous n'avez pas les permissions nécessaires pour accéder à cette section.
            </Text>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => navigation.goBack()}
              activeOpacity={0.8}
            >
              <View style={styles.backBtnInner}>
                <Text style={styles.backButtonText}>Retour</Text>
              </View>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle={statusBarStyle()} backgroundColor={COLORS.bgPrimary} />
        <LinearGradient
          colors={[COLORS.bgPrimary, COLORS.bgSecondary, COLORS.bgTertiary]}
          style={styles.gradient}
        >
          <View style={styles.loadingContainer}>
            <Ionicons name="refresh" size={48} color={COLORS.primary} />
            <Text style={styles.loadingText}>Chargement des analyses...</Text>
          </View>
        </LinearGradient>
      </View>
    );
  }

  const metrics = getMetrics();
  const chartData = getChartData();

  return (
    <ScreenBackground>
    <View style={styles.container}>
      <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />

      <View style={styles.gradient}>
        {/* Header avec effet de blur */}
        <Animated.View 
          style={[
            styles.header,
            {
              opacity: animationValue,
              transform: [{ translateY: animationValue.interpolate({
                inputRange: [0, 1],
                outputRange: [20, 0],
              })}],
              paddingTop: insets.top + SPACING.md,
            }
          ]}
        >
          <View style={styles.headerContent}>
            <BackButton navigation={navigation} />
            <Text style={styles.headerTitle}>Analyses Avancées</Text>
            <View style={styles.headerRight}>
              <View style={styles.headerStats}>
                <Text style={styles.headerStatsText}>
                  Tableau de bord
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Sélecteur de période */}
        <Animated.View 
          style={[
            styles.periodSelector,
            {
              opacity: animationValue,
              transform: [{ translateY: animationValue.interpolate({
                inputRange: [0, 1],
                outputRange: [30, 0],
              })}],
            }
          ]}
        >
          <BlurView intensity={30} style={styles.periodBlur}>
            <View style={styles.periodButtons}>
              {[
                { key: '7d', label: '7 jours' },
                { key: '30d', label: '30 jours' },
                { key: '90d', label: '90 jours' },
              ].map((period) => (
                <TouchableOpacity
                  key={period.key}
                  style={[
                    styles.periodButton,
                    selectedPeriod === period.key && styles.activePeriodButton
                  ]}
                  onPress={() => setSelectedPeriod(period.key as any)}
                  activeOpacity={0.8}
                >
                  <Text style={[
                    styles.periodButtonText,
                    selectedPeriod === period.key && styles.activePeriodButtonText
                  ]}>
                    {period.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </BlurView>
        </Animated.View>

        {/* Contenu principal */}
        <ScrollView 
          style={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Métriques principales */}
          <View style={styles.metricsSection}>
            <Text style={styles.sectionTitle}>Métriques Principales</Text>
            
            <View style={styles.metricsGrid}>
              {metrics.map((metric, index) => (
                <Animated.View
                  key={metric.label}
                  style={[
                    styles.metricCard,
                    {
                      opacity: animationValue,
                      transform: [{ translateY: animationValue.interpolate({
                        inputRange: [0, 1],
                        outputRange: [40 + (index * 20), 0],
                      })}],
                    }
                  ]}
                >
                  <BlurView intensity={30} style={styles.metricCardBlur}>
                    <View style={styles.metricHeader}>
                      <View style={styles.metricIcon}>
                        <LinearGradient
                          colors={[`${metric.color}40`, `${metric.color}20`]}
                          style={styles.metricIconGradient}
                        >
                          <Ionicons name={metric.icon as any} size={24} color={metric.color} />
                        </LinearGradient>
                      </View>
                      
                      <View style={styles.metricChange}>
                        <Ionicons 
                          name={getChangeIcon(metric.changeType) as any} 
                          size={16} 
                          color={getChangeColor(metric.changeType)} 
                        />
                        <Text style={[styles.metricChangeText, { color: getChangeColor(metric.changeType) }]}>
                          {metric.change > 0 ? '+' : ''}{metric.change}%
                        </Text>
                      </View>
                    </View>
                    
                    <Text style={styles.metricValue}>{metric.value.toLocaleString()}</Text>
                    <Text style={styles.metricLabel}>{metric.label}</Text>
                    
                    {renderSimpleChart(metric.trend, metric.color)}
                  </BlurView>
                </Animated.View>
              ))}
            </View>
          </View>

          {/* Graphique principal */}
          <View style={styles.chartSection}>
            <Text style={styles.sectionTitle}>Évolution des Activités</Text>
            
            <Animated.View
              style={[
                styles.mainChartCard,
                {
                  opacity: animationValue,
                  transform: [{ translateY: animationValue.interpolate({
                    inputRange: [0, 1],
                    outputRange: [60, 0],
                  })}],
                }
              ]}
            >
              <BlurView intensity={30} style={styles.mainChartBlur}>
                <View style={styles.chartHeader}>
                  <Text style={styles.chartTitle}>Utilisateurs vs Publications</Text>
                  <View style={styles.chartLegend}>
                    {chartData.datasets.map((dataset, index) => (
                      <View key={index} style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: dataset.color }]} />
                        <Text style={styles.legendText}>{dataset.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
                
                <View style={styles.mainChart}>
                  <View style={styles.chartBars}>
                    {chartData.labels.map((label, index) => (
                      <View key={index} style={styles.chartColumn}>
                        <View style={styles.chartBarGroup}>
                          {chartData.datasets.map((dataset, datasetIndex) => {
                            const value = dataset.data[index];
                            const maxValue = Math.max(...dataset.data);
                            const height = (value / maxValue) * 80;
                            
                            return (
                              <View 
                                key={datasetIndex}
                                style={[
                                  styles.chartBar,
                                  { 
                                    height: height,
                                    backgroundColor: dataset.color,
                                    opacity: 0.6 + (0.4 * (index / (chartData?.labels?.length || 1))),
                                  }
                                ]} 
                              />
                            );
                          })}
                        </View>
                        <Text style={styles.chartLabel}>{label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </BlurView>
            </Animated.View>
          </View>

          {/* Statistiques détaillées */}
          <View style={styles.detailedStatsSection}>
            <Text style={styles.sectionTitle}>Statistiques Détaillées</Text>
            
            <View style={styles.detailedStatsGrid}>
              {[
                { label: 'Taux d\'engagement', value: '4.2%', change: '+0.8%', color: COLORS.success },
                { label: 'Temps moyen de session', value: '12m 34s', change: '+2m 15s', color: COLORS.primary },
                { label: 'Taux de rétention', value: '68.5%', change: '-1.2%', color: COLORS.warning },
                { label: 'Signalements résolus', value: stats ? `${((stats.totalReports - stats.pendingReports) / stats.totalReports * 100).toFixed(1)}%` : '0%', change: '+3.1%', color: COLORS.success },
              ].map((stat, index) => (
                <Animated.View
                  key={stat.label}
                  style={[
                    styles.detailedStatCard,
                    {
                      opacity: animationValue,
                      transform: [{ translateY: animationValue.interpolate({
                        inputRange: [0, 1],
                        outputRange: [80 + (index * 20), 0],
                      })}],
                    }
                  ]}
                >
                  <BlurView intensity={25} style={styles.detailedStatBlur}>
                    <Text style={styles.detailedStatLabel}>{stat.label}</Text>
                    <Text style={styles.detailedStatValue}>{stat.value}</Text>
                    <View style={styles.detailedStatChange}>
                      <Ionicons 
                        name={stat.change.startsWith('+') ? 'trending-up' : 'trending-down'} 
                        size={14} 
                        color={stat.color} 
                      />
                      <Text style={[styles.detailedStatChangeText, { color: stat.color }]}>
                        {stat.change}
                      </Text>
                    </View>
                  </BlurView>
                </Animated.View>
              ))}
            </View>
          </View>
          
          <View style={{ height: insets.bottom + SPACING.xxl }} />
        </ScrollView>
      </View>
    </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  gradient: {
    flex: 1,
  },
  header: {
    position: 'relative',
    zIndex: 100,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingTop: 16,
  },
  backBtn: {
    marginRight: 16,
  },
  backBtnInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.overlayMedium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700', fontFamily: fonts.bold,
    flex: 1,
  },
  headerRight: {
    width: 80,
    alignItems: 'center',
  },
  headerStats: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: colors.overlayMedium,
  },
  headerStatsText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '500', fontFamily: fonts.medium,
  },
  periodSelector: {
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  periodBlur: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.glassBackground,
  },
  periodButtons: {
    flexDirection: 'row',
    padding: SPACING.xs,
  },
  periodButton: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: 12,
    alignItems: 'center',
  },
  activePeriodButton: {
    backgroundColor: COLORS.primary,
  },
  periodButtonText: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontWeight: '500', fontFamily: fonts.medium,
  },
  activePeriodButtonText: {
    color: COLORS.bgPrimary,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.lg,
    marginTop: SPACING.xl,
  },
  metricsSection: {
    marginBottom: SPACING.xl,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  metricCard: {
    width: (screenWidth - (SPACING.lg * 2) - SPACING.md) / 2,
    borderRadius: 16,
    overflow: 'hidden',
  },
  metricCardBlur: {
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.glassBackground,
    padding: SPACING.lg,
  },
  metricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  metricIcon: {
    marginBottom: SPACING.sm,
  },
  metricIconGradient: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  metricChange: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  metricChangeText: {
    fontSize: 12,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '700', fontFamily: fonts.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  metricLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: SPACING.md,
  },
  chartContainer: {
    height: 60,
    justifyContent: 'flex-end',
  },
  chartBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: '100%',
    gap: 2,
  },
  chartBarContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  chartBar: {
    borderRadius: 2,
    minHeight: 4,
  },
  chartSection: {
    marginBottom: SPACING.xl,
  },
  mainChartCard: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  mainChartBlur: {
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.glassBackground,
    padding: SPACING.lg,
  },
  chartHeader: {
    marginBottom: SPACING.lg,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  chartLegend: {
    flexDirection: 'row',
    gap: SPACING.lg,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  mainChart: {
    height: 120,
  },
  chartColumn: {
    flex: 1,
    alignItems: 'center',
  },
  chartBarGroup: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 80,
    gap: 2,
    marginBottom: SPACING.sm,
  },
  chartLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
  },
  detailedStatsSection: {
    marginBottom: SPACING.xl,
  },
  detailedStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  detailedStatCard: {
    width: (screenWidth - (SPACING.lg * 2) - SPACING.md) / 2,
    borderRadius: 16,
    overflow: 'hidden',
  },
  detailedStatBlur: {
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.glassBackground,
    padding: SPACING.lg,
    alignItems: 'center',
  },
  detailedStatLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  detailedStatValue: {
    fontSize: 20,
    fontWeight: '700', fontFamily: fonts.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  detailedStatChange: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  detailedStatChangeText: {
    fontSize: 12,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  accessDenied: {
    flex: 1,
  },
  accessDeniedGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accessDeniedContent: {
    alignItems: 'center',
    paddingHorizontal: SPACING.xxl,
    maxWidth: 320,
  },
  accessDeniedTitle: {
    fontSize: 28,
    fontWeight: 'bold', fontFamily: fonts.bold,
    color: COLORS.textPrimary,
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  accessDeniedText: {
    fontSize: 16,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: SPACING.xxl,
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xxl,
  },
  loadingText: {
    marginTop: SPACING.md,
    color: COLORS.textMuted,
    fontSize: 16,
  },
});
