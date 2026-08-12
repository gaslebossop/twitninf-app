import { fonts , colors} from '../theme';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { LineChart, BarChart } from 'react-native-chart-kit';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');
const chartWidth = width - 60;

interface PriceData {
  date: string;
  price: number;
  volume: number;
  high?: number;
  low?: number;
  open?: number;
  close?: number;
}

interface AdvancedChartProps {
  data: PriceData[];
  timeframe: string;
  currency: {
    symbol: string;
    name: string;
    currentPrice: number;
    change24h: number;
    trend: 'rising' | 'falling' | 'stable';
  };
}

interface TechnicalIndicator {
  name: string;
  value: number;
  signal: 'buy' | 'sell' | 'neutral';
  description: string;
}

const AdvancedChart: React.FC<AdvancedChartProps> = ({ data, timeframe, currency }) => {
  const [chartType, setChartType] = useState<'line' | 'area' | 'candle' | 'volume'>('area');
  const [showIndicators, setShowIndicators] = useState(true);
  const [technicalIndicators, setTechnicalIndicators] = useState<TechnicalIndicator[]>([]);

  useEffect(() => {
    calculateTechnicalIndicators();
  }, [data]);

  const calculateTechnicalIndicators = () => {
    if (data.length < 14) return;

    const prices = data.map(d => d.price);
    const volumes = data.map(d => d.volume);
    
    // RSI (Relative Strength Index)
    const rsi = calculateRSI(prices, 14);
    
    // SMA (Simple Moving Average)
    const sma20 = calculateSMA(prices, 20);
    const sma50 = calculateSMA(prices, 50);
    
    // MACD
    const macd = calculateMACD(prices);
    
    // Bollinger Bands
    const bollingerBands = calculateBollingerBands(prices, 20);
    
    // Volume trend
    const volumeTrend = calculateVolumeTrend(volumes);

    const indicators: TechnicalIndicator[] = [
      {
        name: 'RSI (14)',
        value: rsi,
        signal: rsi > 70 ? 'sell' : rsi < 30 ? 'buy' : 'neutral',
        description: rsi > 70 ? 'Surachat' : rsi < 30 ? 'Survente' : 'Neutre'
      },
      {
        name: 'SMA 20/50',
        value: ((sma20 / sma50) - 1) * 100,
        signal: sma20 > sma50 ? 'buy' : sma20 < sma50 ? 'sell' : 'neutral',
        description: sma20 > sma50 ? 'Tendance haussière' : 'Tendance baissière'
      },
      {
        name: 'MACD',
        value: macd.macd,
        signal: macd.signal > 0 ? 'buy' : 'sell',
        description: macd.signal > 0 ? 'Signal d\'achat' : 'Signal de vente'
      },
      {
        name: 'Volume',
        value: volumeTrend,
        signal: volumeTrend > 10 ? 'buy' : volumeTrend < -10 ? 'sell' : 'neutral',
        description: volumeTrend > 10 ? 'Volume croissant' : volumeTrend < -10 ? 'Volume décroissant' : 'Volume stable'
      }
    ];

    setTechnicalIndicators(indicators);
  };

  const calculateRSI = (prices: number[], period: number): number => {
    if (prices.length < period + 1) return 50;

    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
      const change = prices[prices.length - i] - prices[prices.length - i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;
    
    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  };

  const calculateSMA = (prices: number[], period: number): number => {
    if (prices.length < period) return prices[prices.length - 1];
    
    const sum = prices.slice(-period).reduce((acc, price) => acc + price, 0);
    return sum / period;
  };

  const calculateMACD = (prices: number[]) => {
    const ema12 = calculateEMA(prices, 12);
    const ema26 = calculateEMA(prices, 26);
    const macd = ema12 - ema26;
    
    return {
      macd,
      signal: macd > 0 ? 1 : -1
    };
  };

  const calculateEMA = (prices: number[], period: number): number => {
    if (prices.length === 0) return 0;
    if (prices.length === 1) return prices[0];
    
    const multiplier = 2 / (period + 1);
    let ema = prices[0];
    
    for (let i = 1; i < prices.length; i++) {
      ema = (prices[i] * multiplier) + (ema * (1 - multiplier));
    }
    
    return ema;
  };

  const calculateBollingerBands = (prices: number[], period: number) => {
    const sma = calculateSMA(prices, period);
    const recentPrices = prices.slice(-period);
    
    const variance = recentPrices.reduce((acc, price) => acc + Math.pow(price - sma, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    
    return {
      upper: sma + (2 * stdDev),
      middle: sma,
      lower: sma - (2 * stdDev)
    };
  };

  const calculateVolumeTrend = (volumes: number[]): number => {
    if (volumes.length < 10) return 0;
    
    const recent = volumes.slice(-5);
    const previous = volumes.slice(-10, -5);
    
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const previousAvg = previous.reduce((a, b) => a + b, 0) / previous.length;
    
    return ((recentAvg / previousAvg) - 1) * 100;
  };

  const getChartData = () => {
    if (!data.length) return { labels: [], datasets: [] };

    const labels = data.map((point, index) => {
      if (index % Math.ceil(data.length / 6) === 0) {
        const date = new Date(point.date);
        return timeframe === '1H' 
          ? date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
          : date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
      }
      return '';
    });

    const prices = data.map(point => point.price);
    const volumes = data.map(point => point.volume);

    switch (chartType) {
      case 'line':
        return {
          labels,
          datasets: [{
            data: prices,
            color: (opacity = 1) => `rgba(29, 155, 240, ${opacity})`,
            strokeWidth: 2
          }]
        };
      
      case 'area':
        return {
          labels,
          datasets: [{
            data: prices,
            color: (opacity = 1) => currency.change24h >= 0 
              ? `rgba(16, 185, 129, ${opacity})` 
              : `rgba(239, 68, 68, ${opacity})`,
            strokeWidth: 3
          }]
        };
      
      case 'volume':
        return {
          labels,
          datasets: [{
            data: volumes.map(v => v / 1000), // Convertir en milliers
            color: (opacity = 1) => `rgba(139, 92, 246, ${opacity})`
          }]
        };
      
      default:
        return {
          labels,
          datasets: [{
            data: prices,
            color: (opacity = 1) => `rgba(29, 155, 240, ${opacity})`,
            strokeWidth: 2
          }]
        };
    }
  };

  const getChartConfig = () => ({
    backgroundColor: 'transparent',
    backgroundGradientFrom: '#15171C',
    backgroundGradientTo: '#1B1E25',
    color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity * 0.7})`,
    style: {
      borderRadius: 16
    },
    propsForDots: {
      r: "3",
      strokeWidth: "2",
      stroke: currency.change24h >= 0 ? "#10B981" : "#EF4444"
    },
    propsForBackgroundLines: {
      strokeDasharray: "3,3",
      stroke: "rgba(255,255,255,0.1)"
    },
    fillShadowGradient: currency.change24h >= 0 ? '#10B981' : '#EF4444',
    fillShadowGradientOpacity: 0.3,
  });

  const renderChartTypeSelector = () => (
    <View style={styles.chartTypeContainer}>
      {[
        { type: 'area', icon: 'trending-up', label: 'Area' },
        { type: 'line', icon: 'analytics', label: 'Line' },
        { type: 'volume', icon: 'bar-chart', label: 'Volume' }
      ].map((item) => (
        <TouchableOpacity
          key={item.type}
          style={[
            styles.chartTypeButton,
            chartType === item.type && styles.chartTypeButtonActive
          ]}
          onPress={() => setChartType(item.type as any)}
        >
          <Ionicons 
            name={item.icon as any} 
            size={16} 
            color={chartType === item.type ? '#fff' : colors.textSecondary} 
          />
          <Text style={[
            styles.chartTypeText,
            chartType === item.type && styles.chartTypeTextActive
          ]}>
            {item.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderChart = () => {
    const chartData = getChartData();
    
    if (!chartData.datasets[0].data.length) {
      return (
        <View style={styles.noDataContainer}>
          <Text style={styles.noDataText}>Données insuffisantes</Text>
        </View>
      );
    }

    const chartConfig = getChartConfig();

    if (chartType === 'volume') {
      return (
        <BarChart
          data={chartData}
          width={chartWidth}
          height={220}
          chartConfig={chartConfig}
          style={styles.chart}
          withInnerLines={false}
          showBarTops={false}
          fromZero
          yAxisLabel=""
          yAxisSuffix=""
        />
      );
    }

    if (chartType === 'area') {
      return (
        <LineChart
          data={chartData}
          width={chartWidth}
          height={220}
          chartConfig={chartConfig}
          style={styles.chart}
          withInnerLines={true}
          withOuterLines={false}
          bezier
        />
      );
    }

    return (
      <LineChart
        data={chartData}
        width={chartWidth}
        height={220}
        chartConfig={chartConfig}
        bezier
        style={styles.chart}
        withInnerLines={true}
        withOuterLines={false}
      />
    );
  };

  const renderTechnicalIndicators = () => {
    if (!showIndicators || !technicalIndicators.length) return null;

    return (
      <View style={styles.indicatorsContainer}>
        <View style={styles.indicatorsHeader}>
          <Text style={styles.indicatorsTitle}>Indicateurs Techniques</Text>
          <TouchableOpacity
            onPress={() => setShowIndicators(!showIndicators)}
            style={styles.toggleButton}
          >
            <Ionicons 
              name={showIndicators ? "chevron-up" : "chevron-down"} 
              size={20} 
              color={colors.textSecondary} 
            />
          </TouchableOpacity>
        </View>

        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.indicatorsScroll}
        >
          {technicalIndicators.map((indicator, index) => (
            <View key={index} style={styles.indicatorCard}>
              <LinearGradient
                colors={['#15171C', '#1B1E25']}
                style={styles.indicatorGradient}
              >
                <View style={styles.indicatorHeader}>
                  <Text style={styles.indicatorName}>{indicator.name}</Text>
                  <View style={[
                    styles.signalBadge,
                    { backgroundColor: getSignalColor(indicator.signal) }
                  ]}>
                    <Text style={styles.signalText}>
                      {indicator.signal.toUpperCase()}
                    </Text>
                  </View>
                </View>
                
                <Text style={styles.indicatorValue}>
                  {indicator.value.toFixed(2)}
                  {indicator.name.includes('%') ? '%' : ''}
                </Text>
                
                <Text style={styles.indicatorDescription}>
                  {indicator.description}
                </Text>
              </LinearGradient>
            </View>
          ))}
        </ScrollView>
      </View>
    );
  };

  const getSignalColor = (signal: string) => {
    switch (signal) {
      case 'buy': return '#10B981';
      case 'sell': return '#EF4444';
      default: return '#6B7280';
    }
  };

  const renderMarketSentiment = () => {
    const buySignals = technicalIndicators.filter(i => i.signal === 'buy').length;
    const sellSignals = technicalIndicators.filter(i => i.signal === 'sell').length;
    const neutralSignals = technicalIndicators.filter(i => i.signal === 'neutral').length;
    
    const total = buySignals + sellSignals + neutralSignals;
    const sentiment = buySignals > sellSignals ? 'Bullish' : sellSignals > buySignals ? 'Bearish' : 'Neutral';
    const sentimentColor = buySignals > sellSignals ? '#10B981' : sellSignals > buySignals ? '#EF4444' : '#6B7280';

    return (
      <View style={styles.sentimentContainer}>
        <LinearGradient
          colors={['#15171C', '#1B1E25']}
          style={styles.sentimentCard}
        >
          <Text style={styles.sentimentTitle}>Sentiment du Marché</Text>
          
          <View style={styles.sentimentRow}>
            <View style={[styles.sentimentBadge, { backgroundColor: sentimentColor }]}>
              <Text style={styles.sentimentText}>{sentiment}</Text>
            </View>
            
            <Text style={styles.sentimentScore}>
              {total > 0 ? Math.round((buySignals / total) * 100) : 50}% Bullish
            </Text>
          </View>
          
          <View style={styles.signalsBreakdown}>
            <View style={styles.signalStat}>
              <View style={[styles.signalDot, { backgroundColor: '#10B981' }]} />
              <Text style={styles.signalLabel}>Achat: {buySignals}</Text>
            </View>
            
            <View style={styles.signalStat}>
              <View style={[styles.signalDot, { backgroundColor: '#EF4444' }]} />
              <Text style={styles.signalLabel}>Vente: {sellSignals}</Text>
            </View>
            
            <View style={styles.signalStat}>
              <View style={[styles.signalDot, { backgroundColor: '#6B7280' }]} />
              <Text style={styles.signalLabel}>Neutre: {neutralSignals}</Text>
            </View>
          </View>
        </LinearGradient>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {renderChartTypeSelector()}
      
      <LinearGradient
        colors={['#15171C', '#1B1E25']}
        style={styles.chartContainer}
      >
        <View style={styles.chartHeader}>
          <Text style={styles.chartTitle}>
            {currency.symbol} / EUR
          </Text>
          <Text style={styles.chartSubtitle}>
            {chartType === 'volume' ? 'Volume de Trading' : 'Évolution du Prix'}
          </Text>
        </View>

        {renderChart()}
      </LinearGradient>

      {renderTechnicalIndicators()}
      {renderMarketSentiment()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  chartTypeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 16,
    backgroundColor: colors.overlayMedium,
    borderRadius: 12,
    padding: 4,
  },
  chartTypeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  chartTypeButtonActive: {
    backgroundColor: '#4F7CFF',
  },
  chartTypeText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600', fontFamily: fonts.semibold,
    marginLeft: 4,
  },
  chartTypeTextActive: {
    color: '#fff',
  },
  chartContainer: {
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.overlayMedium,
    marginBottom: 16,
  },
  chartHeader: {
    marginBottom: 16,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: '700', fontFamily: fonts.bold,
    color: '#fff',
  },
  chartSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  chart: {
    borderRadius: 16,
  },
  noDataContainer: {
    height: 220,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noDataText: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  indicatorsContainer: {
    marginBottom: 16,
  },
  indicatorsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  indicatorsTitle: {
    fontSize: 16,
    fontWeight: '700', fontFamily: fonts.bold,
    color: '#fff',
  },
  toggleButton: {
    padding: 4,
  },
  indicatorsScroll: {
    flexDirection: 'row',
  },
  indicatorCard: {
    width: 150,
    marginRight: 12,
  },
  indicatorGradient: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.overlayMedium,
  },
  indicatorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  indicatorName: {
    fontSize: 12,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: '#fff',
    flex: 1,
  },
  signalBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 4,
  },
  signalText: {
    fontSize: 8,
    fontWeight: '700', fontFamily: fonts.bold,
    color: '#fff',
  },
  indicatorValue: {
    fontSize: 18,
    fontWeight: '700', fontFamily: fonts.bold,
    color: '#4F7CFF',
    marginBottom: 4,
  },
  indicatorDescription: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  sentimentContainer: {
    marginBottom: 16,
  },
  sentimentCard: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.overlayMedium,
  },
  sentimentTitle: {
    fontSize: 16,
    fontWeight: '700', fontFamily: fonts.bold,
    color: '#fff',
    marginBottom: 12,
  },
  sentimentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sentimentBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  sentimentText: {
    fontSize: 14,
    fontWeight: '700', fontFamily: fonts.bold,
    color: '#fff',
  },
  sentimentScore: {
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: '#fff',
  },
  signalsBreakdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  signalStat: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  signalDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  signalLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
});

export default AdvancedChart;
