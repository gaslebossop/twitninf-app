import { fonts , colors} from '../theme';
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Dimensions,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

interface StatData {
  label: string;
  value: string;
  change?: number;
  icon: string;
  color: string;
}

interface SimpleStatsPanelProps {
  currency: {
    symbol: string;
    name: string;
    currentPrice: number;
    basePrice: number;
    multiplier: number;
    trend: 'rising' | 'falling' | 'stable';
    purchaseBonus: number;
    priceChange24h: number;
    volume24h: number;
    marketCap: number;
    circulatingSupply: number;
  };
  refreshing?: boolean;
  onRefresh?: () => void;
}

const SimpleStatsPanel: React.FC<SimpleStatsPanelProps> = ({ 
  currency, 
  refreshing = false, 
  onRefresh 
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'overview' | 'market'>('overview');

  // Vérification de sécurité robuste
  if (!currency || typeof currency.currentPrice !== 'number' || typeof currency.multiplier !== 'number') {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Chargement des données...</Text>
        </View>
      </View>
    );
  }

  const formatNumber = (num: number, decimals = 2): string => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(decimals)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(decimals)}k`;
    }
    return num.toFixed(decimals);
  };

  const formatPrice = (price: number): string => {
    return `${price.toFixed(4)}€`;
  };

  const formatPercentage = (value: number): string => {
    return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  const getOverviewStats = (): StatData[] => [
    {
      label: 'Prix Actuel',
      value: formatPrice(currency.currentPrice),
      change: currency.priceChange24h,
      icon: 'trending-up',
      color: '#4F7CFF'
    },
    {
      label: 'Multiplicateur',
      value: `×${currency.multiplier.toFixed(2)}`,
      change: ((currency.multiplier - 1) * 100),
      icon: 'calculator',
      color: '#10B981'
    },
    {
      label: 'Volume 24h',
      value: formatNumber(currency.volume24h) + '€',
      icon: 'bar-chart',
      color: '#8B5CF6'
    },
    {
      label: 'Market Cap',
      value: formatNumber(currency.marketCap) + '€',
      icon: 'pie-chart',
      color: '#F59E0B'
    }
  ];

  const getMarketStats = (): StatData[] => [
    {
      label: 'Offre Circulante',
      value: formatNumber(currency.circulatingSupply) + ' TWC',
      icon: 'disc',
      color: '#06B6D4'
    },
    {
      label: 'Bonus Achat',
      value: `${currency.purchaseBonus.toFixed(1)}%`,
      icon: 'gift',
      color: '#EF4444'
    },
    {
      label: 'Prix de Base',
      value: formatPrice(currency.basePrice),
      icon: 'cash',
      color: '#10B981'
    },
    {
      label: 'Tendance',
      value: currency.trend.charAt(0).toUpperCase() + currency.trend.slice(1),
      icon: currency.trend === 'rising' ? 'trending-up' : currency.trend === 'falling' ? 'trending-down' : 'remove',
      color: currency.trend === 'rising' ? '#10B981' : currency.trend === 'falling' ? '#EF4444' : '#6B7280'
    }
  ];

  const getCurrentStats = (): StatData[] => {
    return selectedCategory === 'market' ? getMarketStats() : getOverviewStats();
  };

  const getTrendColor = (change?: number) => {
    if (!change) return '#6B7280';
    return change > 0 ? '#10B981' : change < 0 ? '#EF4444' : '#6B7280';
  };

  const renderCategorySelector = () => (
    <View style={styles.categorySelector}>
      <TouchableOpacity
        style={[
          styles.categoryButton,
          selectedCategory === 'overview' && styles.categoryButtonActive
        ]}
        onPress={() => setSelectedCategory('overview')}
      >
        <Ionicons 
          name="analytics" 
          size={16} 
          color={selectedCategory === 'overview' ? '#fff' : colors.textSecondary} 
        />
        <Text style={[
          styles.categoryText,
          selectedCategory === 'overview' && styles.categoryTextActive
        ]}>
          Vue d'ensemble
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.categoryButton,
          selectedCategory === 'market' && styles.categoryButtonActive
        ]}
        onPress={() => setSelectedCategory('market')}
      >
        <Ionicons 
          name="bar-chart" 
          size={16} 
          color={selectedCategory === 'market' ? '#fff' : colors.textSecondary} 
        />
        <Text style={[
          styles.categoryText,
          selectedCategory === 'market' && styles.categoryTextActive
        ]}>
          Marché
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderStatCard = (stat: StatData, index: number) => (
    <View key={index} style={styles.statCard}>
      <LinearGradient
        colors={['#15171C', '#1B1E25']}
        style={styles.statCardGradient}
      >
        <View style={styles.statCardHeader}>
          <View style={[styles.statIcon, { backgroundColor: stat.color }]}>
            <Ionicons name={stat.icon as any} size={20} color="#fff" />
          </View>
        </View>
        
        <Text style={styles.statLabel}>{stat.label}</Text>
        <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
        
        {stat.change !== undefined && (
          <Text style={[
            styles.changeText,
            { color: getTrendColor(stat.change) }
          ]}>
            {formatPercentage(stat.change)}
          </Text>
        )}
      </LinearGradient>
    </View>
  );

  const renderSummary = () => {
    // Calculer un score de santé basé sur les vraies données
    const priceStability = Math.max(0, 100 - Math.abs(currency.priceChange24h) * 10);
    const volumeScore = Math.min(100, (currency.volume24h / 10000) * 100);
    const trendScore = currency.trend === 'rising' ? 85 : currency.trend === 'stable' ? 70 : 55;
    const healthScore = (priceStability + volumeScore + trendScore) / 3;
    
    const healthLabel = healthScore > 80 ? 'Excellent' : healthScore > 65 ? 'Très Bon' : healthScore > 50 ? 'Bon' : 'Moyen';
    const healthColor = healthScore > 80 ? '#10B981' : healthScore > 65 ? '#3B82F6' : healthScore > 50 ? '#F59E0B' : '#EF4444';

    return (
      <View style={styles.summaryContainer}>
        <LinearGradient
          colors={['#15171C', '#1B1E25']}
          style={styles.summaryCard}
        >
          <View style={styles.summaryHeader}>
            <Text style={styles.summaryTitle}>Résumé du Marché</Text>
            <TouchableOpacity onPress={onRefresh} disabled={refreshing}>
              <Ionicons 
                name={refreshing ? "hourglass" : "refresh"} 
                size={20} 
                color={colors.textSecondary} 
              />
            </TouchableOpacity>
          </View>
          
          <View style={styles.summaryContent}>
            <View style={styles.healthScore}>
              <Text style={styles.healthLabel}>Indice de Santé du Marché</Text>
              <View style={styles.healthRow}>
                <View style={[styles.healthBadge, { backgroundColor: healthColor }]}>
                  <Ionicons 
                    name={healthScore > 80 ? "checkmark-circle" : healthScore > 50 ? "warning" : "alert-circle"} 
                    size={16} 
                    color="#fff" 
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.healthText}>{healthLabel}</Text>
                </View>
                <Text style={[styles.healthPercentage, { color: healthColor }]}>
                  {healthScore.toFixed(0)}%
                </Text>
              </View>
            </View>
            
            <View style={styles.keyMetrics}>
              <View style={styles.keyMetric}>
                <Text style={styles.keyMetricLabel}>Prix</Text>
                <Text style={[
                  styles.keyMetricValue,
                  { color: getTrendColor(currency.priceChange24h) }
                ]}>
                  {formatPrice(currency.currentPrice)}
                </Text>
              </View>
              
              <View style={styles.keyMetric}>
                <Text style={styles.keyMetricLabel}>Tendance</Text>
                <Text style={styles.keyMetricValue}>
                  {currency.trend.charAt(0).toUpperCase() + currency.trend.slice(1)}
                </Text>
              </View>
              
              <View style={styles.keyMetric}>
                <Text style={styles.keyMetricLabel}>Volume</Text>
                <Text style={styles.keyMetricValue}>
                  {formatNumber(currency.volume24h)}€
                </Text>
              </View>
            </View>
          </View>
        </LinearGradient>
      </View>
    );
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {renderSummary()}
      {renderCategorySelector()}
      
      <View style={styles.statsGrid}>
        {getCurrentStats().map((stat, index) => renderStatCard(stat, index))}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  summaryContainer: {
    marginBottom: 20,
  },
  summaryCard: {
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.overlayMedium,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '700', fontFamily: fonts.bold,
    color: '#fff',
  },
  summaryContent: {
    gap: 16,
  },
  healthScore: {
    alignItems: 'center',
  },
  healthLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  healthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  healthBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  healthText: {
    fontSize: 14,
    fontWeight: '700', fontFamily: fonts.bold,
    color: '#fff',
  },
  healthPercentage: {
    fontSize: 20,
    fontWeight: '800', fontFamily: fonts.bold,
    color: '#fff',
  },
  keyMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  keyMetric: {
    alignItems: 'center',
  },
  keyMetricLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  keyMetricValue: {
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: '#fff',
  },
  categorySelector: {
    flexDirection: 'row',
    marginBottom: 20,
    backgroundColor: colors.overlayMedium,
    borderRadius: 12,
    padding: 4,
  },
  categoryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  categoryButtonActive: {
    backgroundColor: '#4F7CFF',
  },
  categoryText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600', fontFamily: fonts.semibold,
    marginLeft: 6,
  },
  categoryTextActive: {
    color: '#fff',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statCard: {
    width: '48%',
    marginBottom: 16,
  },
  statCardGradient: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.overlayMedium,
    minHeight: 120,
  },
  statCardHeader: {
    marginBottom: 12,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700', fontFamily: fonts.bold,
    marginBottom: 8,
  },
  changeText: {
    fontSize: 12,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
  },
});

export default SimpleStatsPanel;
