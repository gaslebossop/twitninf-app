import { fonts } from '../theme';
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Circle, Line } from 'react-native-svg';

const { width } = Dimensions.get('window');
const chartWidth = width - 80;
const chartHeight = 200;

interface PriceData {
  date: string;
  price: number;
  volume: number;
}

interface SimpleChartProps {
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

const SimpleChart: React.FC<SimpleChartProps> = ({ data, timeframe, currency }) => {
  const [chartType, setChartType] = React.useState<'line' | 'area'>('area');

  // Vérification de sécurité robuste. `Number.isFinite` et pas `typeof
  // === 'number'` : NaN est un `number`, et c'est précisément lui qui casse
  // la géométrie du graphique jusque dans le rendu natif.
  if (!currency || !Number.isFinite(currency.currentPrice)) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Chargement du graphique...</Text>
        </View>
      </View>
    );
  }

  // Préparer les données pour le graphique
  const prepareChartData = () => {
    // Un seul point est aussi inexploitable que zéro : toute la géométrie du
    // graphique divise par `length - 1`, ce qui donne 0/0 → NaN, et un NaN
    // envoyé à react-native-svg part dans le rendu natif (hors de portée de
    // l'ErrorBoundary JS). L'API renvoie couramment un seul point : le
    // `priceHistory` est filtré côté serveur sur la fenêtre demandée (1 h,
    // 24 h…) et une monnaie calme n'a qu'un relevé dans l'intervalle.
    const usable = (data || []).filter(
      (point) => point && Number.isFinite(point.price),
    );

    if (usable.length < 2) {
      // Générer des données réalistes basées sur le prix actuel
      const basePrice = currency.currentPrice;
      const demoData = Array.from({ length: 50 }, (_, i) => {
        const timeOffset = (49 - i) * (timeframe === '1H' ? 60000 : timeframe === '1D' ? 3600000 : timeframe === '1W' ? 86400000 : 604800000);
        const date = new Date(Date.now() - timeOffset);
        
        // Créer une tendance réaliste
        const trendFactor = currency.trend === 'rising' ? 0.02 : currency.trend === 'falling' ? -0.02 : 0;
        const volatility = basePrice * 0.05; // 5% de volatilité
        const noise = (Math.random() - 0.5) * volatility * 0.3;
        const trend = (i / 50) * trendFactor * basePrice;
        
        // Ajouter des variations cycliques pour plus de réalisme
        const cycle = Math.sin(i * 0.3) * volatility * 0.2;
        
        const price = Math.max(0.0001, basePrice + trend + noise + cycle);
        
        return {
          date: date.toISOString(),
          price: price,
          volume: Math.random() * 500 + 100
        };
      });
      return demoData;
    }
    return usable.slice(-50); // Prendre les 50 derniers points pour plus de fluidité
  };

  const chartData = prepareChartData();
  const prices = chartData.map(d => d.price);
  const maxPrice = Math.max(...prices);
  const minPrice = Math.min(...prices);
  const priceRange = maxPrice - minPrice || 0.001;
  // `prepareChartData` garantit au moins 2 points ; ce garde-fou protège
  // quand même la division qui alimente les coordonnées SVG.
  const lastIndex = Math.max(1, chartData.length - 1);

  // Créer le chemin SVG pour la ligne
  const createPath = () => {
    if (chartData.length < 2) return '';

    const points = chartData.map((point, index) => {
      const x = (index / lastIndex) * chartWidth;
      const y = chartHeight - ((point.price - minPrice) / priceRange) * chartHeight;
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');

    return points;
  };

  // Créer le chemin pour l'area chart (avec remplissage)
  const createAreaPath = () => {
    if (chartData.length < 2) return '';

    const linePath = createPath();
    const areaPath = `${linePath} L ${chartWidth} ${chartHeight} L 0 ${chartHeight} Z`;
    
    return areaPath;
  };

  const pathData = chartType === 'area' ? createAreaPath() : createPath();
  const strokeColor = currency.change24h >= 0 ? '#10B981' : '#EF4444';
  const fillColor = currency.change24h >= 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)';

  // Formater les labels
  const formatLabels = () => {
    const step = Math.max(1, Math.floor(chartData.length / 4));
    return chartData
      .filter((_, index) => index % step === 0)
      .map(point => {
        const date = new Date(point.date);
        return timeframe === '1H' 
          ? date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
          : date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
      });
  };

  const labels = formatLabels();

  const renderTypeSelector = () => (
    <View style={styles.typeSelector}>
      <TouchableOpacity
        style={[styles.typeButton, chartType === 'area' && styles.typeButtonActive]}
        onPress={() => setChartType('area')}
      >
        <Text style={[styles.typeText, chartType === 'area' && styles.typeTextActive]}>
          Area
        </Text>
      </TouchableOpacity>
      
      <TouchableOpacity
        style={[styles.typeButton, chartType === 'line' && styles.typeButtonActive]}
        onPress={() => setChartType('line')}
      >
        <Text style={[styles.typeText, chartType === 'line' && styles.typeTextActive]}>
          Line
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      {renderTypeSelector()}
      
      <LinearGradient
        colors={['#15171C', '#1B1E25']}
        style={styles.chartContainer}
      >
        <View style={styles.chartHeader}>
          <Text style={styles.chartTitle}>{currency.symbol} / EUR</Text>
          <View style={styles.trendContainer}>
            <Ionicons 
              name={currency.change24h >= 0 ? 'trending-up' : 'trending-down'} 
              size={16} 
              color={strokeColor} 
            />
            <Text style={[styles.changeText, { color: strokeColor }]}>
              {currency.change24h >= 0 ? '+' : ''}{currency.change24h.toFixed(2)}%
            </Text>
          </View>
        </View>

        <View style={styles.chartArea}>
          <Svg width={chartWidth} height={chartHeight} style={styles.svg}>
            {/* Grille de fond horizontale */}
            {[...Array(5)].map((_, i) => (
              <Line
                key={`grid-h-${i}`}
                x1="0"
                y1={i * (chartHeight / 4)}
                x2={chartWidth}
                y2={i * (chartHeight / 4)}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1"
                strokeDasharray="4,4"
              />
            ))}
            
            {/* Grille de fond verticale */}
            {[...Array(6)].map((_, i) => (
              <Line
                key={`grid-v-${i}`}
                x1={i * (chartWidth / 5)}
                y1="0"
                x2={i * (chartWidth / 5)}
                y2={chartHeight}
                stroke="rgba(255,255,255,0.09)"
                strokeWidth="1"
                strokeDasharray="4,4"
              />
            ))}

            {/* Ligne ou aire de prix */}
            {pathData ? (
              <Path
                d={pathData}
                fill={chartType === 'area' ? fillColor : 'none'}
                stroke={strokeColor}
                strokeWidth={chartType === 'area' ? 2.5 : 3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {/* Points de données (seulement quelques-uns pour ne pas surcharger) */}
            {chartData.filter((_, index) => index % 5 === 0).map((point, originalIndex) => {
              const index = originalIndex * 5;
              const x = (index / lastIndex) * chartWidth;
              const y = chartHeight - ((point.price - minPrice) / priceRange) * chartHeight;

              // Aucune coordonnée non finie ne doit atteindre le rendu natif.
              if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

              return (
                <Circle
                  key={`point-${index}`}
                  cx={x}
                  cy={y}
                  r={2.5}
                  fill={strokeColor}
                  stroke="#15171C"
                  strokeWidth={2}
                />
              );
            })}
          </Svg>
        </View>

        {/* Labels de temps */}
        <View style={styles.labelsContainer}>
          {labels.map((label, index) => (
            <Text key={index} style={styles.labelText}>
              {label}
            </Text>
          ))}
        </View>

        {/* Statistiques du prix */}
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Min</Text>
            <Text style={styles.statValue}>{minPrice.toFixed(4)}€</Text>
          </View>
          
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Max</Text>
            <Text style={styles.statValue}>{maxPrice.toFixed(4)}€</Text>
          </View>
          
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Actuel</Text>
            <Text style={[styles.statValue, { color: strokeColor }]}>
              {currency.currentPrice.toFixed(4)}€
            </Text>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  typeSelector: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderRadius: 8,
    padding: 4,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
  },
  typeButtonActive: {
    backgroundColor: '#4F7CFF',
  },
  typeText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  typeTextActive: {
    color: '#fff',
  },
  chartContainer: {
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  chartTitle: {
    fontSize: 20,
    fontWeight: '800', fontFamily: fonts.bold,
    color: '#fff',
    letterSpacing: 0.5,
  },
  trendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  changeText: {
    fontSize: 14,
    fontWeight: '600', fontFamily: fonts.semibold,
    marginLeft: 4,
  },
  chartArea: {
    height: chartHeight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  svg: {
    backgroundColor: 'transparent',
  },
  noDataContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noDataText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
  },
  labelsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  labelText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    marginBottom: 4,
  },
  statValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
    textAlign: 'center',
  },
});

export default SimpleChart;
