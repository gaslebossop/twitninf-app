import { colors, fonts, glow, withAlpha } from '../theme';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  ActivityIndicator,
  Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { BackButton, ScreenSkeleton, CoinBalancePill, celebrateReward } from '../components/ui';
import { useHeaderMetrics } from '../hooks/useHeaderMetrics';
import NewEconomyService, {
  PurchasePackage,
  WalletData,
  EconomicStatus
} from '../services/newEconomyService';
import SendCoinsModal from '../components/SendCoinsModal';
import { toast } from '../components/ui/Toast';
import { confirmAsync } from '../components/ui/ConfirmSheet';

const { width } = Dimensions.get('window');

const NewEconomyScreen: React.FC = () => {
  const navigation = useNavigation();
  const { top: headerTopInset } = useHeaderMetrics();
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [packages, setPackages] = useState<PurchasePackage[]>([]);
  const [economicStatus, setEconomicStatus] = useState<EconomicStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [sendModalOpen, setSendModalOpen] = useState(false);

  // ID de la cryptomonnaie TwitCoins
  const currencyId = '077ae58c-7ba5-4da0-bb67-5829a83a2ea1'; // ID réel de TwitCoins

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        loadWalletData(),
        loadPurchasePackages()
      ]);
    } catch (error) {
      console.error('Erreur lors du chargement:', error);
      toast.error('Impossible de charger les données');
    } finally {
      setLoading(false);
    }
  };

  const loadWalletData = async () => {
    try {
      const data = await NewEconomyService.getUserWallet(currencyId);
      setWalletData(data);
    } catch (error) {
      console.error('Erreur portefeuille:', error);
    }
  };

  const loadPurchasePackages = async () => {
    try {
      const data = await NewEconomyService.getPurchasePackages(currencyId);
      setPackages(data.packages);
      setEconomicStatus(data.economicStatus);
    } catch (error) {
      console.error('Erreur packages:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handlePurchase = async (packageItem: PurchasePackage) => {
    confirmAsync({
      title: 'Confirmer l\'achat',
      message: `Acheter ${packageItem.name} pour ${packageItem.currentPrice}€?\\n${packageItem.totalCoins} TwitCoins (${packageItem.bonusCoins > 0 ? `+${packageItem.bonusCoins} bonus` : 'pas de bonus'})`,
      confirmLabel: 'Acheter',
    }).then((ok) => {
      if (ok) (() => processPurchase(packageItem))();
    });
  };

  const processPurchase = async (packageItem: PurchasePackage) => {
    try {
      setPurchasing(packageItem.id);
      
      // TODO: Intégrer le système de paiement réel
      const result = await NewEconomyService.purchaseCoins(
        currencyId,
        packageItem.id,
        'stripe' // ou autre méthode de paiement
      );

      // Un achat crédité se fête au lieu de demander un « OK », et le solde se
      // rafraîchit sans intervention.
      celebrateReward({
        amount: packageItem.totalCoins,
        label: packageItem.bonusCoins > 0 ? `dont ${packageItem.bonusCoins} de bonus` : packageItem.name,
      });
      loadWalletData();
    } catch (error) {
      console.error('Erreur achat:', error);
      toast.error('L\'achat a échoué. Veuillez réessayer.');
    } finally {
      setPurchasing(null);
    }
  };

  const renderHeader = () => (
    <View style={[styles.header, { paddingTop: headerTopInset }]}>
      <BackButton navigation={navigation} />
      <Text style={styles.headerTitle}>TwitCoins Store</Text>
      {/* Ce bouton « stats » n'avait aucun `onPress` : il répondait au doigt
          sans jamais rien faire. Remplacé par le solde, qui a sa place ici et
          mène vraiment quelque part (le portefeuille). */}
      <CoinBalancePill compact />
    </View>
  );

  const renderWalletCard = () => {
    if (!walletData || !walletData.currency || typeof walletData.currency.currentPrice !== 'number') return null;

    return (
      <View style={styles.walletCard}>
        <View style={styles.walletHeader}>
          <Text style={styles.walletTitle}>Mon Portefeuille</Text>
          {economicStatus && (
            <View style={styles.trendBadge}>
              <Text style={styles.trendText}>
                {NewEconomyService.getTrendIcon(economicStatus.trend)} {economicStatus.trend}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.balanceContainer}>
          <Text style={styles.balanceLabel}>Solde actuel</Text>
          <Text style={styles.balanceAmount}>
            {NewEconomyService.formatCoins(walletData.wallet.balance)} TWC
          </Text>
          <View style={styles.eurBadge}>
            <View style={styles.eurBadgeIcon}>
              <Text style={styles.eurBadgeIconText}>€</Text>
            </View>
            <Text style={styles.eurBadgeValue}>
              {NewEconomyService.formatPrice(walletData.wallet.balance * walletData.currency.currentPrice)}
            </Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Total acheté</Text>
            <Text style={styles.statValue}>
              {NewEconomyService.formatCoins(walletData.wallet.totalPurchased)}
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Points fidélité</Text>
            <Text style={styles.statValue}>{walletData.wallet.loyaltyPoints}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.sendButton} onPress={() => setSendModalOpen(true)} activeOpacity={0.85}>
          <Ionicons name="send" size={16} color={colors.white} />
          <Text style={styles.sendButtonText}>Envoyer à un ami</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderEconomicStatus = () => {
    if (!economicStatus) return null;

    return (
      <View style={styles.economicCard}>
        <Text style={styles.sectionTitle}>État Économique</Text>
        <View style={styles.economicRow}>
          <View style={styles.economicItem}>
            <Text style={styles.economicLabel}>Tendance</Text>
            <View style={[styles.trendChip, { backgroundColor: NewEconomyService.getTrendColor(economicStatus.trend) }]}>
              <Text style={styles.trendChipText}>
                {NewEconomyService.getTrendIcon(economicStatus.trend)} {economicStatus.trend}
              </Text>
            </View>
          </View>
          <View style={styles.economicItem}>
            <Text style={styles.economicLabel}>Multiplicateur</Text>
            <Text style={styles.economicValue}>×{economicStatus.multiplier.toFixed(2)}</Text>
          </View>
          <View style={styles.economicItem}>
            <Text style={styles.economicLabel}>Bonus d'achat</Text>
            <Text style={styles.economicValue}>+{economicStatus.bonus.toFixed(0)}%</Text>
          </View>
        </View>
      </View>
    );
  };

  const isVipPackage = (packageId: string) => {
    return packageId.startsWith('vip_');
  };

  const getVipColor = (packageId: string) => {
    if (packageId === 'vip_10000') return colors.gold; // Or
    if (packageId === 'vip_1000') return colors.textSecondary; // Argent
    if (packageId === 'vip_500') return '#B87333'; // Bronze (couleur physique, pas décorative)
    if (packageId === 'vip_100') return colors.cyan;
    return colors.accent;
  };

  const formatPrice = (price: string) => {
    const numPrice = parseFloat(price);
    if (numPrice >= 1000) {
      return `${(numPrice / 1000).toFixed(1)}k€`;
    }
    return `${price}€`;
  };

  const renderPackageCard = (packageItem: PurchasePackage) => {
    const isVip = isVipPackage(packageItem.id);
    
    return (
      <TouchableOpacity
        key={packageItem.id}
        style={[
          styles.packageCard,
          packageItem.popular && styles.popularPackage,
          isVip && styles.vipPackage
        ]}
        onPress={() => handlePurchase(packageItem)}
        disabled={purchasing === packageItem.id}
      >
        {packageItem.popular && (
          <View style={styles.popularBadge}>
            <Text style={styles.popularText}>⭐ POPULAIRE</Text>
          </View>
        )}
        
        {isVip && (
          <View style={styles.vipBadge}>
            <Text style={styles.vipText}>👑 VIP</Text>
          </View>
        )}
        
        <View style={styles.packageHeader}>
          <Text style={[styles.packageName, isVip && styles.vipPackageName]}>
            {packageItem.name}
          </Text>
          <Text style={[styles.packagePrice, isVip && styles.vipPackagePrice]}>
            {formatPrice(packageItem.currentPrice)}
          </Text>
        </View>

        <View style={styles.coinsContainer}>
          <Text style={[styles.baseCoins, isVip && styles.vipBaseCoins]}>
            {NewEconomyService.formatCoins(packageItem.coins)} TWC
          </Text>
          {packageItem.bonusCoins > 0 && (
            <Text style={[styles.bonusCoins, isVip && styles.vipBonusCoins]}>
              +{NewEconomyService.formatCoins(packageItem.bonusCoins)} bonus
            </Text>
          )}
        </View>

        <View style={styles.packageDetails}>
          <Text style={[styles.totalCoins, isVip && styles.vipTotalCoins]}>
            Total: {NewEconomyService.formatCoins(packageItem.totalCoins)} TWC
          </Text>
          <Text style={[styles.pricePerCoin, isVip && styles.vipPricePerCoin]}>
            {packageItem.pricePerCoin}€ par coin
          </Text>
        </View>

        {packageItem.savings > 0 && (
          <View style={[styles.savingsBadge, isVip && styles.vipSavingsBadge]}>
            <Text style={[styles.savingsText, isVip && styles.vipSavingsText]}>
              ÉCONOMIE {packageItem.savings}%
            </Text>
          </View>
        )}

        <View
          style={[
            styles.purchaseButton,
            isVip && styles.vipPurchaseButton,
            { backgroundColor: packageItem.popular ? colors.success : isVip ? getVipColor(packageItem.id) : colors.accent },
            isVip && glow(getVipColor(packageItem.id), 10),
          ]}
        >
          {purchasing === packageItem.id ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <Text style={[styles.purchaseButtonText, isVip && styles.vipPurchaseButtonText]}>
              {isVip ? 'Acheter VIP' : 'Acheter'}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <ScreenSkeleton variant="list" />
    );
  }

  return (
    <View style={styles.container}>
      {renderHeader()}
      
      <ScrollView
        style={styles.content}
        bounces={!refreshing}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            tintColor={colors.accent}
            title="Actualisation..."
            titleColor={colors.accent}
            progressViewOffset={0}
            progressBackgroundColor="transparent"
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {renderWalletCard()}
        {renderEconomicStatus()}
        
        <View style={styles.packagesSection}>
          <Text style={styles.sectionTitle}>Packages TwitCoins</Text>
          <Text style={styles.sectionSubtitle}>
            Achetez des TwitCoins pour débloquer des fonctionnalités premium
          </Text>
          
          <View style={styles.packagesGrid}>
            {packages.filter(pkg => pkg && typeof pkg.currentPrice === 'string' && pkg.name).map(renderPackageCard)}
          </View>
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>ℹ️ Informations</Text>
          <Text style={styles.infoText}>
            • Les TwitCoins sont achetés uniquement avec de l'argent réel{'\n'}
            • Aucun système de minage gratuit{'\n'}
            • Prix variables selon l'économie de la plateforme{'\n'}
            • Bonus d'achat pendant les promotions{'\n'}
            • Points de fidélité pour les acheteurs réguliers
          </Text>
        </View>
      </ScrollView>

      {walletData && (
        <SendCoinsModal
          visible={sendModalOpen}
          onClose={() => setSendModalOpen(false)}
          currencyId={currencyId}
          symbol={walletData.currency?.symbol || 'TWC'}
          balance={walletData.wallet.balance}
          onSent={() => { void loadWalletData(); }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // paddingTop réel posé à l'appel (useHeaderMetrics), pas une valeur devinée.
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: 'transparent',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800', fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  statsButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  loadingText: {
    color: colors.textPrimary,
    marginTop: 10,
    fontSize: 16,
  },
  walletCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    backgroundColor: colors.surface,
  },
  walletHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  walletTitle: {
    fontSize: 18,
    fontWeight: '700', fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  trendBadge: {
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  trendText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  balanceContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  balanceLabel: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: 8,
  },
  balanceAmount: {
    color: colors.gold,
    fontSize: 32,
    fontWeight: '800', fontFamily: fonts.bold,
    marginBottom: 4,
  },
  balanceValue: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  eurBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.successMuted,
    borderWidth: 1,
    borderColor: colors.success,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 14,
    gap: 8,
  },
  eurBadgeIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eurBadgeIconText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '900', fontFamily: fonts.bold,
  },
  eurBadgeValue: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '900', fontFamily: fonts.bold,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendButtonText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700', fontFamily: fonts.bold,
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: 4,
  },
  statValue: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  economicCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700', fontFamily: fonts.bold,
    color: colors.textPrimary,
    marginBottom: 16,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 20,
  },
  economicRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  economicItem: {
    alignItems: 'center',
    flex: 1,
  },
  economicLabel: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: 8,
  },
  economicValue: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  trendChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  trendChipText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  packagesSection: {
    marginBottom: 20,
  },
  packagesGrid: {
    gap: 16,
  },
  packageCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  popularPackage: {
    borderColor: colors.success,
  },
  vipPackage: {
    borderColor: colors.gold,
    borderWidth: 3,
    backgroundColor: colors.surfaceAlt,
  },
  popularBadge: {
    position: 'absolute',
    top: -8,
    right: 20,
    backgroundColor: colors.success,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    zIndex: 1,
  },
  popularText: {
    color: colors.textPrimary,
    fontSize: 10,
    fontWeight: '800', fontFamily: fonts.bold,
  },
  packageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  packageName: {
    fontSize: 18,
    fontWeight: '700', fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  packagePrice: {
    fontSize: 20,
    fontWeight: '800', fontFamily: fonts.bold,
    color: colors.accent,
  },
  coinsContainer: {
    marginBottom: 12,
  },
  baseCoins: {
    fontSize: 24,
    fontWeight: '700', fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  bonusCoins: {
    fontSize: 14,
    color: colors.success,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  packageDetails: {
    marginBottom: 16,
  },
  totalCoins: {
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  pricePerCoin: {
    fontSize: 12,
    color: colors.textMuted,
  },
  savingsBadge: {
    backgroundColor: colors.red,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  savingsText: {
    color: colors.textPrimary,
    fontSize: 10,
    fontWeight: '800', fontFamily: fonts.bold,
  },
  purchaseButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  purchaseButtonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700', fontFamily: fonts.bold,
  },
  infoSection: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 40,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700', fontFamily: fonts.bold,
    color: colors.textPrimary,
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
  },
  // Styles VIP
  vipBadge: {
    position: 'absolute',
    top: -8,
    left: 20,
    backgroundColor: colors.gold,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    zIndex: 1,
  },
  vipText: {
    color: '#1a1303',
    fontSize: 10,
    fontWeight: '800', fontFamily: fonts.bold,
  },
  vipPackageName: {
    fontSize: 20,
    fontWeight: '800', fontFamily: fonts.bold,
    color: colors.gold,
  },
  vipPackagePrice: {
    fontSize: 24,
    fontWeight: '900', fontFamily: fonts.bold,
    color: colors.gold,
  },
  vipBaseCoins: {
    fontSize: 18,
    fontWeight: '700', fontFamily: fonts.bold,
    color: colors.gold,
  },
  vipBonusCoins: {
    fontSize: 14,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: colors.gold,
  },
  vipTotalCoins: {
    fontSize: 18,
    fontWeight: '700', fontFamily: fonts.bold,
    color: colors.gold,
  },
  vipPricePerCoin: {
    fontSize: 14,
    color: colors.gold,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  vipSavingsBadge: {
    backgroundColor: colors.gold,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  vipSavingsText: {
    color: '#1a1303',
    fontSize: 10,
    fontWeight: '800', fontFamily: fonts.bold,
  },
  vipPurchaseButton: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: colors.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  vipPurchaseButtonText: {
    color: '#1a1303',
    fontSize: 18,
    fontWeight: '800', fontFamily: fonts.bold,
    textAlign: 'center',
  },
});

export default NewEconomyScreen;
