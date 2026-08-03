import React, { useState, useEffect } from 'react';
import { fonts, colors as C } from '../theme';
import { ScreenBackground } from '../components/ui';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import NewEconomyService, { WalletData as NewWalletData } from '../services/newEconomyService';
import CurrencyService from '../services/currencyService';

interface WalletData {
  wallet: {
    balance: number;
    totalEarned: number;
    totalSpent: number;
    dailyMiningCount: number;
  };
  currency: {
    name: string;
    symbol: string;
    currentPrice: number;
    icon: string;
    color: string;
  };
}

interface Transaction {
  id: string;
  amount: number;
  type: 'TRANSFER' | 'MINING' | 'PURCHASE' | 'REWARD' | 'REFUND' | 'SYSTEM';
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  description: string;
  createdAt: string;
  fromUserId?: string;
  toUserId?: string;
  fromUser?: { username: string };
  toUser?: { username: string };
}

const WalletScreen: React.FC = () => {
  const { user } = useAuth();
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [miningLoading, setMiningLoading] = useState(false);

  const fetchWalletData = async () => {
    try {
      console.log('🔄 [WALLET] Début du chargement des données wallet...');
      
      // Utiliser EXACTEMENT la même méthode que NewEconomyScreen (qui affiche le bon prix)
      const currencyId = '077ae58c-7ba5-4da0-bb67-5829a83a2ea1'; // ID hardcodé comme NewEconomyScreen
      console.log('🆔 [WALLET] ID de cryptomonnaie utilisé:', currencyId);
      
      // Récupérer les données du wallet avec le prix intégré (comme NewEconomyScreen)
      console.log('📡 [WALLET] Appel NewEconomyService.getUserWallet...');
      const walletData = await NewEconomyService.getUserWallet(currencyId);
      console.log('✅ [WALLET] Données wallet reçues:', JSON.stringify(walletData, null, 2));
      
      // LOGS DÉTAILLÉS POUR LE COURS
      console.log('💱 [WALLET] ========== COURS DE LA MONNAIE ==========');
      console.log('💱 [WALLET] Nom de la monnaie:', walletData.currency.name);
      console.log('💱 [WALLET] Symbole:', walletData.currency.symbol);
      console.log('💱 [WALLET] COURS ACTUEL:', walletData.currency.currentPrice);
      console.log('💱 [WALLET] Type du prix:', typeof walletData.currency.currentPrice);
      console.log('💱 [WALLET] Prix formaté:', walletData.currency.currentPrice.toFixed(4));
      console.log('💱 [WALLET] =============================================');
      
      // Convertir au format attendu par l'interface avec le prix exact de getUserWallet
      const convertedData: WalletData = {
        wallet: {
          balance: walletData.wallet.balance,
          totalEarned: walletData.wallet.totalPurchased,
          totalSpent: walletData.wallet.totalSpent,
          dailyMiningCount: 0
        },
        currency: {
          name: walletData.currency.name,
          symbol: walletData.currency.symbol,
          currentPrice: walletData.currency.currentPrice, // Prix DIRECT de getUserWallet !
          icon: '💰',
          color: '#FF6B35'
        }
      };
      
      // LOGS DÉTAILLÉS POUR LA CONVERSION
      console.log('📊 [WALLET] ========== CALCUL CONVERSION ==========');
      console.log('📊 [WALLET] Balance:', walletData.wallet.balance, 'TWC');
      console.log('📊 [WALLET] Prix unitaire:', walletData.currency.currentPrice, '€');
      console.log('📊 [WALLET] Calcul:', walletData.wallet.balance, '×', walletData.currency.currentPrice, '=', walletData.wallet.balance * walletData.currency.currentPrice, '€');
      console.log('📊 [WALLET] Conversion EUR FINALE:', (walletData.wallet.balance * walletData.currency.currentPrice).toFixed(2), '€');
      console.log('📊 [WALLET] =======================================');
      
      setWalletData(convertedData);
      console.log('✅ [WALLET] Données wallet mises à jour avec succès');
    } catch (error) {
      console.error('Erreur lors du chargement du portefeuille:', error);
      
      // Fallback vers l'ancien système si le nouveau échoue
      try {
        const response = await api.request('/virtual-currency/wallet/default-currency-id', {
          method: 'GET',
          requiresAuth: true
        });
        setWalletData(response.data);
      } catch (fallbackError) {
        console.error('Erreur fallback:', fallbackError);
        Alert.alert('Erreur', 'Impossible de charger le portefeuille');
      }
    }
  };

  const fetchTransactions = async () => {
    try {
      const response = await api.request('/virtual-currency/transactions?limit=20', {
        method: 'GET',
        requiresAuth: true
      });
      setTransactions(response.data);
    } catch (error) {
      console.error('Erreur lors du chargement des transactions:', error);
    }
  };

  const loadData = async () => {
    setLoading(true);
    await Promise.all([fetchWalletData(), fetchTransactions()]);
    setLoading(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchWalletData(), fetchTransactions()]);
    setRefreshing(false);
  };

  const mineCurrency = async (action: string) => {
    try {
      setMiningLoading(true);
      const response = await api.request('/virtual-currency/mine', {
        method: 'POST',
        requiresAuth: true,
        body: JSON.stringify({
          currencyId: 'default-currency-id',
          action
        })
      });

      const { reward, newBalance } = response.data;
      
      // Mettre à jour le portefeuille localement
      if (walletData) {
        setWalletData({
          ...walletData,
          wallet: {
            ...walletData.wallet,
            balance: newBalance,
            totalEarned: walletData.wallet.totalEarned + reward,
            dailyMiningCount: walletData.wallet.dailyMiningCount + 1
          }
        });
      }

      Alert.alert(
        'Minage réussi!',
        `Vous avez gagné ${reward} ${walletData?.currency.symbol} pour ${action}`
      );

      // Recharger les transactions
      await fetchTransactions();
    } catch (error: any) {
      console.error('Erreur lors du minage:', error);
      const message = error.response?.data?.message || 'Erreur lors du minage';
      Alert.alert('Erreur', message);
    } finally {
      setMiningLoading(false);
    }
  };

  const transferCurrency = async (toUserId: string, amount: number, description: string) => {
    try {
      const response = await api.request('/virtual-currency/transfer', {
        method: 'POST',
        requiresAuth: true,
        body: JSON.stringify({
          toUserId,
          currencyId: 'default-currency-id',
          amount,
          description
        })
      });

      const { transaction, fee } = response.data;
      
      Alert.alert(
        'Transfert réussi!',
        `Transfert de ${amount} ${walletData?.currency.symbol} effectué (frais: ${fee})`
      );

      // Recharger les données
      await Promise.all([fetchWalletData(), fetchTransactions()]);
    } catch (error: any) {
      console.error('Erreur lors du transfert:', error);
      const message = error.response?.data?.message || 'Erreur lors du transfert';
      Alert.alert('Erreur', message);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 8
    }).format(num);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Fonction pour déterminer le montant à afficher (+ si reçu, - si envoyé)
  const getDisplayAmount = (transaction: Transaction) => {
    // Si on n'a pas les IDs, utiliser l'ancienne logique basée sur le type
    if (!transaction.fromUserId || !transaction.toUserId || !user?.id) {
      return transaction.type === 'MINING' || transaction.type === 'REWARD' ? transaction.amount : -transaction.amount;
    }

    // Si l'utilisateur a envoyé (il est fromUserId), montant négatif
    if (transaction.fromUserId === user.id) {
      return -transaction.amount;
    }
    
    // Si l'utilisateur a reçu (il est toUserId), montant positif
    if (transaction.toUserId === user.id) {
      return transaction.amount;
    }

    // Par défaut, utiliser l'ancienne logique
    return transaction.type === 'MINING' || transaction.type === 'REWARD' ? transaction.amount : -transaction.amount;
  };

  // Fonction pour déterminer la couleur du montant
  const getAmountColor = (transaction: Transaction) => {
    const displayAmount = getDisplayAmount(transaction);
    return displayAmount >= 0 ? '#4CAF50' : '#FF5722';
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'MINING':
        return 'hammer';
      case 'TRANSFER':
        return 'swap-horizontal';
      case 'PURCHASE':
        return 'card';
      case 'REWARD':
        return 'gift';
      default:
        return 'ellipse';
    }
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case 'MINING':
      case 'REWARD':
        return '#4CAF50';
      case 'TRANSFER':
        return '#2196F3';
      case 'PURCHASE':
        return '#FF9800';
      default:
        return '#9E9E9E';
    }
  };

  if (loading) {
    return (
      <ScreenBackground>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF6B35" />
          <Text style={styles.loadingText}>Chargement du portefeuille...</Text>
        </View>
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
    <ScrollView
      style={styles.container}
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
      {/* En-tête du portefeuille */}
      {walletData && (
        <LinearGradient
          colors={[walletData.currency.color, '#FF8A65']}
          style={styles.walletHeader}
        >
          <View style={styles.walletInfo}>
            <Text style={styles.currencyName}>{walletData.currency.name}</Text>
            <Text style={styles.balanceText}>
              {formatNumber(walletData.wallet.balance)} {walletData.currency.symbol}
            </Text>
            <Text style={styles.eurValue}>
              ≈ {formatNumber(walletData.wallet.balance * walletData.currency.currentPrice)} €
            </Text>
          </View>
        </LinearGradient>
      )}

      {/* Actions rapides */}
      <View style={styles.actionsContainer}>
        <Text style={styles.sectionTitle}>Actions rapides</Text>
        
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => mineCurrency('Tweet publié')}
            disabled={miningLoading}
          >
            <Ionicons name="create" size={24} color="#FF6B35" />
            <Text style={styles.actionButtonText}>Tweeter</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => mineCurrency('Like donné')}
            disabled={miningLoading}
          >
            <Ionicons name="heart" size={24} color="#FF6B35" />
            <Text style={styles.actionButtonText}>Liker</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => mineCurrency('Partage effectué')}
            disabled={miningLoading}
          >
            <Ionicons name="share" size={24} color="#FF6B35" />
            <Text style={styles.actionButtonText}>Partager</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => mineCurrency('Commentaire ajouté')}
            disabled={miningLoading}
          >
            <Ionicons name="chatbubble" size={24} color="#FF6B35" />
            <Text style={styles.actionButtonText}>Commenter</Text>
          </TouchableOpacity>
        </View>

        {miningLoading && (
          <View style={styles.miningLoading}>
            <ActivityIndicator size="small" color="#FF6B35" />
            <Text style={styles.miningText}>Minage en cours...</Text>
          </View>
        )}
      </View>

      {/* Statistiques */}
      {walletData && (
        <View style={styles.statsContainer}>
          <Text style={styles.sectionTitle}>Statistiques</Text>
          
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{formatNumber(walletData.wallet.totalEarned)}</Text>
              <Text style={styles.statLabel}>Total gagné</Text>
            </View>
            
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{formatNumber(walletData.wallet.totalSpent)}</Text>
              <Text style={styles.statLabel}>Total dépensé</Text>
            </View>
            
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{walletData.wallet.dailyMiningCount}/100</Text>
              <Text style={styles.statLabel}>Minages aujourd'hui</Text>
            </View>
          </View>
        </View>
      )}

      {/* Historique des transactions */}
      <View style={styles.transactionsContainer}>
        <Text style={styles.sectionTitle}>Transactions récentes</Text>
        
        {transactions.length === 0 ? (
          <View style={styles.emptyTransactions}>
            <Ionicons name="wallet-outline" size={48} color="#9E9E9E" />
            <Text style={styles.emptyText}>Aucune transaction pour le moment</Text>
            <Text style={styles.emptySubtext}>Commencez à miner pour voir vos transactions</Text>
          </View>
        ) : (
          transactions.map((transaction) => (
            <View key={transaction.id} style={styles.transactionItem}>
              <View style={styles.transactionIcon}>
                <Ionicons
                  name={getTransactionIcon(transaction.type) as any}
                  size={20}
                  color={getTransactionColor(transaction.type)}
                />
              </View>
              
              <View style={styles.transactionInfo}>
                <Text style={styles.transactionDescription}>
                  {transaction.description}
                </Text>
                <Text style={styles.transactionDate}>
                  {formatDate(transaction.createdAt)}
                </Text>
              </View>
              
              <View style={styles.transactionAmount}>
                <Text
                  style={[
                    styles.amountText,
                    { color: getAmountColor(transaction) }
                  ]}
                >
                  {getDisplayAmount(transaction) >= 0 ? '+' : ''}
                  {formatNumber(getDisplayAmount(transaction))} {walletData?.currency.symbol}
                </Text>
                <Text style={styles.transactionStatus}>
                  {transaction.status}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: C.textSecondary
  },
  walletHeader: {
    padding: 24,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 16,
    borderRadius: 20,
    overflow: 'hidden',
  },
  walletInfo: {
    alignItems: 'center'
  },
  currencyName: {
    fontSize: 18,
    color: 'white',
    fontWeight: '600', fontFamily: fonts.semibold,
    marginBottom: 8
  },
  balanceText: {
    fontSize: 32,
    color: 'white',
    fontWeight: 'bold', fontFamily: fonts.bold,
    marginBottom: 4
  },
  eurValue: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)'
  },
  actionsContainer: {
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 20,
    padding: 16
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: C.textPrimary,
    marginBottom: 16
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around'
  },
  actionButton: {
    alignItems: 'center',
    padding: 12
  },
  actionButtonText: {
    marginTop: 4,
    fontSize: 12,
    color: C.textSecondary
  },
  miningLoading: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16
  },
  miningText: {
    marginLeft: 8,
    color: C.textSecondary
  },
  statsContainer: {
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 20,
    padding: 16
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  statItem: {
    alignItems: 'center',
    flex: 1
  },
  statValue: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: C.textPrimary
  },
  statLabel: {
    fontSize: 12,
    color: C.textSecondary,
    marginTop: 4
  },
  transactionsContainer: {
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 20,
    padding: 16
  },
  emptyTransactions: {
    alignItems: 'center',
    paddingVertical: 32
  },
  emptyText: {
    fontSize: 16,
    color: C.textSecondary,
    marginTop: 16
  },
  emptySubtext: {
    fontSize: 14,
    color: C.textMuted,
    marginTop: 8
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)'
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  transactionInfo: {
    flex: 1
  },
  transactionDescription: {
    fontSize: 14,
    color: C.textPrimary,
    fontWeight: '500'
  },
  transactionDate: {
    fontSize: 12,
    color: C.textSecondary,
    marginTop: 2
  },
  transactionAmount: {
    alignItems: 'flex-end'
  },
  amountText: {
    fontSize: 14,
    fontWeight: 'bold'
  },
  transactionStatus: {
    fontSize: 10,
    color: C.textSecondary,
    marginTop: 2,
    textTransform: 'uppercase'
  }
});

export default WalletScreen;
