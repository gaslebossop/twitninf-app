import { colors, fonts, glow , statusBarStyle} from '../theme';
import { AppHeader, ScreenBackground, Skeleton, HowItWorks, CoinBalancePill } from '../components/ui';
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  RefreshControl,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import NewEconomyService, { EconomicStats, ChartRange } from '../services/newEconomyService';
import CurrencyService from '../services/currencyService';
import SimpleChart from '../components/SimpleChart';
import SimpleStatsPanel from '../components/SimpleStatsPanel';
import { describeError, normalizeEconomicStats } from '../utils/tradingData';

const TIMEFRAME_TO_RANGE: Record<'1H' | '1D' | '1W' | '1M', ChartRange> = {
  '1H': '1h', '1D': '24h', '1W': '7d', '1M': '30d',
};

interface MarketData {
  price: number;
  change24h: number;
  volume: number;
  marketCap: number;
  trend: 'rising' | 'falling' | 'stable';
  priceHistory: Array<{
    date: string;
    price: number;
    volume: number;
  }>;
}


const TradingScreenContent: React.FC = () => {
  const navigation = useNavigation();
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [economicStats, setEconomicStats] = useState<EconomicStats | null>(null);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timeframe, setTimeframe] = useState<'1H' | '1D' | '1W' | '1M'>('1D');
  const [currentView, setCurrentView] = useState<'chart' | 'stats'>('chart');
  
  // Animations
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  // ID de la cryptomonnaie (récupéré dynamiquement)
  const [currencyId, setCurrencyId] = useState<string | null>(null);

  useEffect(() => {
    initializeCurrency();
    startAnimations();
  }, []);

  useEffect(() => {
    if (currencyId) {
      loadMarketData();

      // Mettre à jour les données toutes les 30 secondes. Dépend aussi de
      // `timeframe` : sinon l'intervalle gardait en mémoire l'intervalle de
      // graphique sélectionné AU MOMENT du montage (fermeture figée) et
      // continuait de rafraîchir avec l'ancien `range`, même après un
      // changement de sélecteur — l'effet se ré-arme ici avec le bon `range`
      // à chaque changement.
      const interval = setInterval(() => {
        loadMarketData(true);
      }, 30000);

      return () => clearInterval(interval);
    }
  }, [currencyId, timeframe]);

  const startAnimations = () => {
  };

  const initializeCurrency = async () => {
    try {
      // Forcer le nettoyage du cache d'abord
      CurrencyService.clearCache();
      const id = await CurrencyService.getTwitCoinsCurrencyId();
      console.log('🆔 ID de cryptomonnaie récupéré:', id);
      setCurrencyId(id);
    } catch (error) {
      console.error('Erreur lors de l\'initialisation de la cryptomonnaie:', error);
      // Fallback avec l'ID réel de TwitCoins
      const fallbackId = '077ae58c-7ba5-4da0-bb67-5829a83a2ea1';
      console.log('🆔 Utilisation de l\'ID de fallback:', fallbackId);
      setCurrencyId(fallbackId);
    }
  };

  const loadMarketData = async (silent = false) => {
    try {
      if (!currencyId) return;
      if (!silent) {
        setLoading(true);
        setMarketError(null);
      }
      
      const response = await NewEconomyService.getEconomicStats(currencyId, TIMEFRAME_TO_RANGE[timeframe]);
      const stats = normalizeEconomicStats(response);
      setEconomicStats(stats);

      // Tous les composants reçoivent le même objet normalisé. Auparavant,
      // seule cette vue était protégée tandis que SimpleChart/SimpleStatsPanel
      // continuaient à consommer la réponse API brute.
      const marketInfo: MarketData = {
        price: stats.currency.currentPrice,
        change24h: stats.currency.priceChange24h,
        volume: stats.currency.volume24h,
        marketCap: stats.currency.marketCap,
        trend: stats.currency.trend,
        priceHistory: stats.priceHistory,
      };
      
      setMarketData(marketInfo);
      setMarketError(null);
    } catch (error) {
      const message = describeError(error);
      console.error('[Trading] Échec du chargement des données', {
        stage: 'loadMarketData',
        currencyId,
        timeframe,
        silent,
        message,
        stack: error instanceof Error ? error.stack : undefined,
      });
      if (!silent || !marketData) setMarketError(message);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    if (!currencyId) return;
    setRefreshing(true);
    await loadMarketData();
    setRefreshing(false);
  };

  const formatPrice = (price: number) => {
    const value = Number.isFinite(price) ? price : 0;
    return `${value.toFixed(4)}€`;
  };

  const formatVolume = (volume: number) => {
    const value = Number.isFinite(volume) ? volume : 0;
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M€`;
    } else if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}k€`;
    }
    return `${value.toFixed(0)}€`;
  };

  const formatMarketCap = (marketCap: number) => {
    const value = Number.isFinite(marketCap) ? marketCap : 0;
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(2)}M€`;
    } else if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}k€`;
    }
    return `${value.toFixed(0)}€`;
  };

  const getTrendColor = (trend: string, change: number) => {
    if (change > 0) return '#10B981';
    if (change < 0) return '#EF4444';
    return '#6B7280';
  };

  const getTrendIcon = (trend: string, change: number) => {
    if (change > 0) return 'trending-up';
    if (change < 0) return 'trending-down';
    return 'remove';
  };

  const renderHeader = () => (
    <AppHeader
      navigation={navigation}
      title="TwitCoins"
      subtitle="Cours, stats et actions TWC"
      right={(
        <View style={styles.headerActions}>
          {/* Le solde tient dans l'en-tête : décider d'acheter ou de vendre sans
              savoir ce qu'on a n'a pas de sens. */}
          <CoinBalancePill compact style={styles.headerBalance} />
          <TouchableOpacity
            style={[styles.viewToggle, currentView === 'chart' && styles.viewToggleActive]}
            onPress={() => setCurrentView('chart')}
          >
            <Ionicons name="analytics" size={20} color={currentView === 'chart' ? '#fff' : colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewToggle, currentView === 'stats' && styles.viewToggleActive]}
            onPress={() => setCurrentView('stats')}
          >
            <Ionicons name="bar-chart" size={20} color={currentView === 'stats' ? '#fff' : colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={onRefresh}
            disabled={refreshing}
          >
            <Ionicons name={refreshing ? "hourglass" : "refresh"} size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
    />
  );

  const renderPriceHeader = () => {
    if (!marketData) return null;

    return (
      <Animated.View 
        style={[
          styles.priceContainer,
          { 
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }]
          }
        ]}
      >
        <View style={styles.priceCard}>
          <View style={styles.priceHeader}>
            <View style={styles.priceInfo}>
              <Text style={styles.currencyName}>TwitCoins</Text>
              <Text style={styles.currencySymbol}>TWC</Text>
            </View>
            
            <View style={[styles.trendBadge, { backgroundColor: getTrendColor(marketData.trend, marketData.change24h) }]}>
              <Ionicons 
                name={getTrendIcon(marketData.trend, marketData.change24h)} 
                size={16} 
                color="#fff" 
              />
              <Text style={styles.trendText}>{marketData.trend.toUpperCase()}</Text>
            </View>
          </View>
          
          <View style={styles.priceRow}>
            <Text style={styles.currentPrice}>
              {formatPrice(marketData.price)}
            </Text>
            
            <View style={styles.changeContainer}>
              <Text style={[
                styles.priceChange,
                { color: getTrendColor(marketData.trend, marketData.change24h) }
              ]}>
                {marketData.change24h >= 0 ? '+' : ''}{marketData.change24h.toFixed(2)}%
              </Text>
            </View>
          </View>
          
          <View style={styles.priceStats}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Volume 24h</Text>
              <Text style={styles.statValue}>{formatVolume(marketData.volume)}</Text>
            </View>
            
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Market Cap</Text>
              <Text style={styles.statValue}>{formatMarketCap(marketData.marketCap)}</Text>
            </View>
          </View>
        </View>
      </Animated.View>
    );
  };

  const renderMarketStats = () => {
    if (!economicStats) return null;

    const stats = [
      {
        label: 'Offre Totale',
        value: `${formatMarketCap(economicStats.currency.circulatingSupply).replace('€', '')} TWC`,
        icon: 'pie-chart',
        color: colors.accent
      },
      {
        label: 'Multiplicateur',
        value: `×${(Number.isFinite(economicStats.currency.multiplier) ? economicStats.currency.multiplier : 1).toFixed(2)}`,
        icon: 'trending-up',
        color: colors.success
      },
      {
        label: 'Bonus Achat',
        value: `${(Number.isFinite(economicStats.currency.purchaseBonus) ? economicStats.currency.purchaseBonus : 0).toFixed(1)}%`,
        icon: 'gift',
        color: colors.gold
      },
      {
        label: 'Volume 24h',
        value: formatVolume(economicStats.currency.volume24h),
        icon: 'bar-chart',
        color: colors.cyan
      }
    ];

    return (
      <View style={styles.statsContainer}>
        <Text style={styles.sectionTitle}>Statistiques du Marché</Text>
        
        <View style={styles.statsGrid}>
          {stats.map((stat, index) => (
            <Animated.View
              key={index}
              style={[
                styles.statCard,
                {
                  opacity: fadeAnim,
                  transform: [{
                    translateY: slideAnim.interpolate({
                      inputRange: [0, 50],
                      outputRange: [0, 50 + index * 10]
                    })
                  }]
                }
              ]}
            >
              <View style={styles.statCardGradient}>
                <View style={[styles.statIcon, { backgroundColor: stat.color }]}>
                  <Ionicons name={stat.icon as any} size={20} color={colors.white} />
                </View>

                <Text style={styles.statLabel}>{stat.label}</Text>
                <Text style={styles.statValue}>{stat.value}</Text>
              </View>
            </Animated.View>
          ))}
        </View>
      </View>
    );
  };

  const renderTradingActions = () => (
    <View style={styles.actionsContainer}>
      <Text style={styles.sectionTitle}>Actions de Trading</Text>
      
      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={[styles.buyButton, styles.actionButtonGradient, { backgroundColor: colors.success }, glow(colors.success, 10)]}
          onPress={() => navigation.navigate('NewEconomy' as never)}
          activeOpacity={0.85}
        >
          <Ionicons name="add-circle" size={22} color={colors.white} />
          <Text style={styles.actionButtonText}>Acheter TWC</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.sellButton, styles.actionButtonGradient, { backgroundColor: colors.surfaceAlt }]}
          onPress={() => {
            // TODO: Implémenter la fonctionnalité de vente/échange
          }}
          activeOpacity={0.85}
        >
          <Ionicons name="swap-horizontal" size={22} color={colors.textPrimary} />
          <Text style={[styles.actionButtonText, { color: colors.textPrimary }]}>Utiliser TWC</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderMainContent = () => {
    if (marketError && !marketData) {
      return (
        <View style={styles.errorState} accessibilityRole="alert">
          <View style={styles.errorIcon}>
            <Ionicons name="warning-outline" size={26} color={colors.warning} />
          </View>
          <Text style={styles.errorTitle}>Trading momentanément indisponible</Text>
          <Text style={styles.errorText}>
            Les données du marché n’ont pas pu être chargées. L’erreur a été journalisée pour le diagnostic.
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => loadMarketData()} activeOpacity={0.8}>
            <Ionicons name="refresh" size={18} color={colors.white} />
            <Text style={styles.retryButtonText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (currentView === 'stats' && economicStats) {
      return (
        <SimpleStatsPanel
          currency={economicStats.currency}
          refreshing={refreshing}
          onRefresh={onRefresh}
        />
      );
    }

    if (currentView === 'chart' && marketData && economicStats) {
      return (
        <ScrollView
          showsVerticalScrollIndicator={false}
          bounces={!refreshing}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#4F7CFF"
              title="Actualisation..."
              titleColor="#4F7CFF"
              progressViewOffset={0}
              progressBackgroundColor="transparent"
            />
          }
        >
          {renderPriceHeader()}

          {/* Ce que « acheter » et « vendre » veulent dire ici — c'est une
              monnaie interne, pas une bourse, et l'écran ne le disait pas. */}
          <HowItWorks
            id="trading"
            title="Ce que tu échanges exactement"
            points={[
              { icon: 'cash-outline', text: 'Le NF est la monnaie de l’app. Son cours bouge avec les achats et les ventes des autres membres.' },
              { icon: 'arrow-up-circle-outline', text: 'Acheter convertit des euros en NF au cours affiché ; vendre fait l’inverse.' },
              { icon: 'pulse-outline', text: 'Le cours affiché est celui de l’instant : entre l’affichage et la validation, il peut avoir bougé.' },
              { icon: 'gift-outline', text: 'Tes NF servent partout dans l’app : promotion de tweets, contenus payants, casino, marché des pseudos.' },
            ]}
            warning="Ce n’est pas un placement. La valeur du NF ne garantit aucun retour en euros."
            style={styles.howItWorks}
          />

          {economicStats?.currency ? (
            <SimpleChart
              data={marketData?.priceHistory || []}
              timeframe={timeframe}
              currency={{
                symbol: economicStats.currency.symbol || 'TWC',
                name: economicStats.currency.name || 'TwitCoins',
                currentPrice: economicStats.currency.currentPrice || 0.01,
                change24h: economicStats.currency.priceChange24h || 0,
                trend: economicStats.currency.trend || 'stable'
              }}
            />
          ) : (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>Chargement du graphique...</Text>
            </View>
          )}
          
          {renderTradingActions()}
          
          {/* Espace en bas pour la navigation */}
          <View style={{ height: 100 }} />
        </ScrollView>
      );
    }

    return null;
  };

  if (loading) {
    return (
      <ScreenBackground>
        <View style={styles.container}>
          <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
          <View style={styles.gradient}>
            {renderHeader()}
            <View style={styles.content}>
              <Skeleton width="100%" height={90} rounded={20} style={{ marginTop: 16, marginBottom: 16 }} />
              <Skeleton width="100%" height={210} rounded={20} style={{ marginBottom: 16 }} />
              <Skeleton width="100%" height={64} rounded={16} style={{ marginBottom: 12 }} />
              <Skeleton width="100%" height={64} rounded={16} />
            </View>
          </View>
        </View>
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
    <View style={styles.container}>
      <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />

      <View style={styles.gradient}>
        {renderHeader()}

        <View style={styles.content}>
          {renderMainContent()}
        </View>
      </View>
    </View>
    </ScreenBackground>
  );
};

interface TradingErrorBoundaryState {
  error: Error | null;
}

/** Dernier filet de sécurité pour les erreurs de rendu/native component. */
class TradingErrorBoundary extends React.Component<React.PropsWithChildren, TradingErrorBoundaryState> {
  state: TradingErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): TradingErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Trading] Crash de rendu intercepté', {
      stage: 'render',
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <ScreenBackground>
        <StatusBar barStyle={statusBarStyle()} backgroundColor={colors.bg} />
        <AppHeader title="Trading" subtitle="Cours, statistiques et actions TWC" />
        <View style={styles.errorState} accessibilityRole="alert">
          <View style={styles.errorIcon}>
            <Ionicons name="bug-outline" size={26} color={colors.warning} />
          </View>
          <Text style={styles.errorTitle}>Le module Trading a rencontré une erreur</Text>
          <Text style={styles.errorText}>
            Le crash a été intercepté et enregistré. Tu peux relancer uniquement cet écran sans fermer l’app.
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => this.setState({ error: null })}
            activeOpacity={0.8}
          >
            <Ionicons name="reload" size={18} color={colors.white} />
            <Text style={styles.retryButtonText}>Relancer Trading</Text>
          </TouchableOpacity>
        </View>
      </ScreenBackground>
    );
  }
}

const TradingScreen: React.FC = () => (
  <TradingErrorBoundary>
    <TradingScreenContent />
  </TradingErrorBoundary>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  gradient: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
  },
  loadingText: {
    color: '#fff',
    marginTop: 16,
    fontSize: 16,
    fontWeight: '500', fontFamily: fonts.medium,
  },
  howItWorks: { marginHorizontal: 16, marginBottom: 16 },
  headerBalance: { marginRight: 8 },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewToggle: {
    padding: 8,
    marginRight: 8,
    borderRadius: 8,
    backgroundColor: colors.overlayMedium,
  },
  viewToggleActive: {
    backgroundColor: '#4F7CFF',
  },
  refreshButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  errorState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingBottom: 72,
  },
  errorIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.warningMuted,
    marginBottom: 16,
  },
  errorTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontFamily: fonts.bold,
    textAlign: 'center',
    marginBottom: 8,
  },
  errorText: {
    color: colors.textSecondary,
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 420,
    marginBottom: 20,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: colors.accent,
  },
  retryButtonText: {
    color: colors.white,
    fontSize: 14,
    fontFamily: fonts.semibold,
  },
  priceContainer: {
    marginBottom: 20,
  },
  priceCard: {
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.overlayMedium,
  },
  priceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  priceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencyName: {
    fontSize: 18,
    fontWeight: '700', fontFamily: fonts.bold,
    color: '#fff',
    marginRight: 12,
  },
  currencySymbol: {
    fontSize: 14,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: '#4F7CFF',
    backgroundColor: 'rgba(29, 155, 240, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  trendText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700', fontFamily: fonts.bold,
    marginLeft: 4,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  currentPrice: {
    fontSize: 36,
    fontWeight: '900', fontFamily: fonts.bold,
    color: '#fff',
  },
  changeContainer: {
    alignItems: 'flex-end',
  },
  priceChange: {
    fontSize: 18,
    fontWeight: '700', fontFamily: fonts.bold,
  },
  priceStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: '#fff',
  },
  timeframeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 20,
    backgroundColor: colors.overlayMedium,
    borderRadius: 12,
    padding: 4,
  },
  timeframeButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  timeframeButtonActive: {
    backgroundColor: '#4F7CFF',
  },
  timeframeText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  timeframeTextActive: {
    color: '#fff',
  },
  chartContainer: {
    marginBottom: 20,
  },
  chartCard: {
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.overlayMedium,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: '700', fontFamily: fonts.bold,
    color: '#fff',
  },
  chartLegend: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  legendText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  chart: {
    borderRadius: 16,
  },
  noDataText: {
    color: colors.textSecondary,
    textAlign: 'center',
    padding: 40,
    fontSize: 16,
  },
  statsContainer: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700', fontFamily: fonts.bold,
    color: '#fff',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statCard: {
    width: '48%',
    marginBottom: 12,
  },
  statCardGradient: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.overlayMedium,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  actionsContainer: {
    marginBottom: 20,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  buyButton: {
    flex: 1,
    marginRight: 8,
  },
  sellButton: {
    flex: 1,
    marginLeft: 8,
  },
  actionButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700', fontFamily: fonts.bold,
    marginLeft: 8,
  },
});

export default TradingScreen;
