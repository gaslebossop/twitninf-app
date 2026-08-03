import { fonts } from '../theme';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

interface MarketStat {
  label: string;
  value: string;
  change?: number;
  changeLabel?: string;
  icon: string;
  color: string;
  trend?: 'up' | 'down' | 'neutral';
}

interface MarketStatsData {
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
  marketMetrics: {
    totalUsers: number;
    activeTraders: number;
    averageHolding: number;
    transactionCount24h: number;
    liquidityIndex: number;
    volatilityIndex: number;
  };
  economicHealth: {
    supplyGrowth: number;
    demandIndex: number;
    priceStability: number;
    marketSentiment: number;
  };
}

interface MarketStatsPanelProps {
  data: MarketStatsData;
  refreshing?: boolean;
  onRefresh?: () => void;
}

const MarketStatsPanel: React.FC<MarketStatsPanelProps> = ({ 
  data, 
  refreshing = false, 
  onRefresh 
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'overview' | 'metrics' | 'health'>('overview');
  const [animatedValues] = useState(() => 
    Array.from({ length: 8 }, () => new Animated.Value(0))
  );

  useEffect(() => {
    // Animation en cascade pour les cartes
    const animations = animatedValues.map((animValue, index) =>
      Animated.timing(animValue, {
        toValue: 1,
        duration: 600,
        delay: index * 100,
        useNativeDriver: true,
      })
    );

    Animated.stagger(50, animations).start();
  }, [data]);

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

  const getOverviewStats = (): MarketStat[] => [
    {
      label: 'Prix Actuel',
      value: formatPrice(data.currency.currentPrice),
      change: data.currency.priceChange24h,
      changeLabel: '24h',
      icon: 'trending-up',
      color: '#4F7CFF',
      trend: data.currency.priceChange24h > 0 ? 'up' : data.currency.priceChange24h < 0 ? 'down' : 'neutral'
    },
    {
      label: 'Multiplicateur',
      value: `×${data.currency.multiplier.toFixed(2)}`,
      change: ((data.currency.multiplier - 1) * 100),
      changeLabel: 'vs base',
      icon: 'calculator',
      color: '#10B981',
      trend: data.currency.multiplier > 1 ? 'up' : 'down'
    },
    {
      label: 'Volume 24h',
      value: formatNumber(data.currency.volume24h) + '€',
      icon: 'bar-chart',
      color: '#8B5CF6'
    },
    {
      label: 'Market Cap',
      value: formatNumber(data.currency.marketCap) + '€',
      icon: 'pie-chart',
      color: '#F59E0B'
    },
    {
      label: 'Offre Circulante',
      value: formatNumber(data.currency.circulatingSupply) + ' TWC',
      icon: 'disc',
      color: '#06B6D4'
    },
    {
      label: 'Bonus Achat',
      value: `${data.currency.purchaseBonus.toFixed(1)}%`,
      icon: 'gift',
      color: '#EF4444'
    }
  ];

  const getMetricsStats = (): MarketStat[] => [
    {
      label: 'Utilisateurs Totaux',
      value: formatNumber(data.marketMetrics.totalUsers, 0),
      icon: 'people',
      color: '#4F7CFF'
    },
    {
      label: 'Traders Actifs',
      value: formatNumber(data.marketMetrics.activeTraders, 0),
      change: (data.marketMetrics.activeTraders / data.marketMetrics.totalUsers) * 100,
      changeLabel: 'du total',
      icon: 'trending-up',
      color: '#10B981'
    },
    {
      label: 'Holding Moyen',
      value: formatNumber(data.marketMetrics.averageHolding) + ' TWC',
      icon: 'wallet',
      color: '#8B5CF6'
    },
    {
      label: 'Transactions 24h',
      value: formatNumber(data.marketMetrics.transactionCount24h, 0),
      icon: 'swap-horizontal',
      color: '#F59E0B'
    },
    {
      label: 'Index Liquidité',
      value: `${data.marketMetrics.liquidityIndex.toFixed(1)}%`,
      icon: 'water',
      color: '#06B6D4',
      trend: data.marketMetrics.liquidityIndex > 70 ? 'up' : data.marketMetrics.liquidityIndex < 30 ? 'down' : 'neutral'
    },
    {
      label: 'Volatilité',
      value: `${data.marketMetrics.volatilityIndex.toFixed(1)}%`,
      icon: 'pulse',
      color: '#EF4444',
      trend: data.marketMetrics.volatilityIndex > 20 ? 'up' : 'down'
    }
  ];

  const getHealthStats = (): MarketStat[] => [
    {
      label: 'Croissance Offre',
      value: formatPercentage(data.economicHealth.supplyGrowth),
      icon: 'trending-up',
      color: '#10B981',
      trend: data.economicHealth.supplyGrowth > 0 ? 'up' : 'down'
    },
    {
      label: 'Index Demande',
      value: `${data.economicHealth.demandIndex.toFixed(1)}/100`,
      icon: 'heart',
      color: '#EF4444',
      trend: data.economicHealth.demandIndex > 60 ? 'up' : data.economicHealth.demandIndex < 40 ? 'down' : 'neutral'
    },
    {
      label: 'Stabilité Prix',
      value: `${data.economicHealth.priceStability.toFixed(1)}%`,
      icon: 'shield-checkmark',
      color: '#06B6D4',
      trend: data.economicHealth.priceStability > 80 ? 'up' : 'down'
    },
    {
      label: 'Sentiment Marché',
      value: `${data.economicHealth.marketSentiment.toFixed(1)}%`,
      icon: 'happy',
      color: '#F59E0B',
      trend: data.economicHealth.marketSentiment > 60 ? 'up' : data.economicHealth.marketSentiment < 40 ? 'down' : 'neutral'
    }
  ];

  const getCurrentStats = (): MarketStat[] => {
    switch (selectedCategory) {
      case 'metrics': return getMetricsStats();
      case 'health': return getHealthStats();
      default: return getOverviewStats();
    }
  };

  const getTrendIcon = (trend?: 'up' | 'down' | 'neutral') => {
    switch (trend) {
      case 'up': return 'arrow-up';
      case 'down': return 'arrow-down';
      default: return 'remove';
    }
  };

  const getTrendColor = (trend?: 'up' | 'down' | 'neutral') => {
    switch (trend) {
      case 'up': return '#10B981';
      case 'down': return '#EF4444';
      default: return '#6B7280';
    }
  };

  const renderCategorySelector = () => (
    <View style={styles.categorySelector}>
      {[
        { key: 'overview', label: 'Vue d\'ensemble', icon: 'analytics' },
        { key: 'metrics', label: 'Métriques', icon: 'bar-chart' },
        { key: 'health', label: 'Santé', icon: 'pulse' }
      ].map((category) => (
        <TouchableOpacity
          key={category.key}
          style={[
            styles.categoryButton,
            selectedCategory === category.key && styles.categoryButtonActive
          ]}
          onPress={() => setSelectedCategory(category.key as any)}
        >
          <Ionicons 
            name={category.icon as any} 
            size={16} 
            color={selectedCategory === category.key ? '#fff' : 'rgba(255,255,255,0.6)'} 
          />
          <Text style={[
            styles.categoryText,
            selectedCategory === category.key && styles.categoryTextActive
          ]}>
            {category.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderStatCard = (stat: MarketStat, index: number) => (
    <Animated.View
      key={`${selectedCategory}-${index}`}
      style={[
        styles.statCard,
        {
          opacity: animatedValues[index],
          transform: [{
            translateY: animatedValues[index].interpolate({
              inputRange: [0, 1],
              outputRange: [50, 0]
            })
          }]
        }
      ]}
    >
      <LinearGradient
        colors={['#15171C', '#1B1E25']}
        style={styles.statCardGradient}
      >
        <View style={styles.statCardHeader}>
          <View style={[styles.statIcon, { backgroundColor: stat.color }]}>
            <Ionicons name={stat.icon as any} size={20} color="#fff" />
          </View>
          
          {stat.trend && (
            <View style={[styles.trendIndicator, { backgroundColor: getTrendColor(stat.trend) }]}>
              <Ionicons name={getTrendIcon(stat.trend)} size={12} color="#fff" />
            </View>
          )}
        </View>
        
        <Text style={styles.statLabel}>{stat.label}</Text>
        <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
        
        {stat.change !== undefined && (
          <View style={styles.changeContainer}>
            <Text style={[
              styles.changeText,
              { color: getTrendColor(stat.trend) }
            ]}>
              {formatPercentage(stat.change)}
            </Text>
            {stat.changeLabel && (
              <Text style={styles.changeLabel}>{stat.changeLabel}</Text>
            )}
          </View>
        )}
      </LinearGradient>
    </Animated.View>
  );

  const renderMarketSummary = () => {
    const healthScore = (
      data.economicHealth.supplyGrowth * 0.2 +
      data.economicHealth.demandIndex * 0.3 +
      data.economicHealth.priceStability * 0.3 +
      data.economicHealth.marketSentiment * 0.2
    ) / 100;

    const healthLabel = healthScore > 0.8 ? 'Excellent' : 
                       healthScore > 0.6 ? 'Bon' : 
                       healthScore > 0.4 ? 'Moyen' : 'Faible';

    const healthColor = healthScore > 0.8 ? '#10B981' : 
                       healthScore > 0.6 ? '#F59E0B' : 
                       healthScore > 0.4 ? '#EF4444' : '#DC2626';

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
                color="rgba(255,255,255,0.6)" 
              />
            </TouchableOpacity>
          </View>
          
          <View style={styles.summaryContent}>
            <View style={styles.healthScore}>
              <Text style={styles.healthLabel}>Santé du Marché</Text>
              <View style={styles.healthRow}>
                <View style={[styles.healthBadge, { backgroundColor: healthColor }]}>
                  <Text style={styles.healthText}>{healthLabel}</Text>
                </View>
                <Text style={styles.healthPercentage}>
                  {(healthScore * 100).toFixed(0)}%
                </Text>
              </View>
            </View>
            
            <View style={styles.keyMetrics}>
              <View style={styles.keyMetric}>
                <Text style={styles.keyMetricLabel}>Prix</Text>
                <Text style={[
                  styles.keyMetricValue,
                  { color: getTrendColor(data.currency.priceChange24h > 0 ? 'up' : 'down') }
                ]}>
                  {formatPrice(data.currency.currentPrice)}
                </Text>
              </View>
              
              <View style={styles.keyMetric}>
                <Text style={styles.keyMetricLabel}>Tendance</Text>
                <Text style={styles.keyMetricValue}>
                  {data.currency.trend.charAt(0).toUpperCase() + data.currency.trend.slice(1)}
                </Text>
              </View>
              
              <View style={styles.keyMetric}>
                <Text style={styles.keyMetricLabel}>Volume</Text>
                <Text style={styles.keyMetricValue}>
                  {formatNumber(data.currency.volume24h)}€
                </Text>
              </View>
            </View>
          </View>
        </LinearGradient>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {renderMarketSummary()}
      {renderCategorySelector()}
      
      <ScrollView 
        style={styles.statsContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.statsGrid}>
          {getCurrentStats().map((stat, index) => renderStatCard(stat, index))}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  summaryContainer: {
    marginBottom: 20,
  },
  summaryCard: {
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
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
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 8,
  },
  healthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  healthBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
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
    color: 'rgba(255,255,255,0.6)',
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
    backgroundColor: 'rgba(255,255,255,0.09)',
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
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '600', fontFamily: fonts.semibold,
    marginLeft: 6,
  },
  categoryTextActive: {
    color: '#fff',
  },
  statsContainer: {
    flex: 1,
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
    borderColor: 'rgba(255,255,255,0.1)',
    minHeight: 120,
  },
  statCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trendIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700', fontFamily: fonts.bold,
    marginBottom: 8,
  },
  changeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  changeText: {
    fontSize: 12,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  changeLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
  },
});

export default MarketStatsPanel;
