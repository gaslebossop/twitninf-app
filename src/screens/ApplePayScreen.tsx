import { fonts } from '../theme';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Dimensions,
  Animated,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useAuth } from '../contexts/AuthContext';
import apiService from '../services/api';

const { width, height } = Dimensions.get('window');

interface PaymentMethod {
  id: string;
  name: string;
  type: string;
  icon: string;
  description: string;
  supported: boolean;
  processingTime: string;
  fees: string;
  limits: {
    min: number;
    max: number;
    currency: string;
  };
}

interface VirtualCurrency {
  id: string;
  name: string;
  symbol: string;
  currentPrice: number;
  icon: string;
  color: string;
}

const ApplePayScreen: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState(10);
  const [selectedMethod, setSelectedMethod] = useState('apple_pay');
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [currency, setCurrency] = useState<VirtualCurrency | null>(null);
  const [wallet, setWallet] = useState<any>(null);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(50));
  const [error, setError] = useState<string | null>(null);

  const presetAmounts = [5, 10, 20, 50, 100];

  useEffect(() => {
    loadData();
  }, []);

  const animateIn = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('🔄 Chargement des données de paiement...');
      
      // Charger les méthodes de paiement
      const paymentResponse = await apiService.request('/api/payments/payment-methods', {
        method: 'GET',
        requiresAuth: true
      });
      console.log('📋 Réponse méthodes de paiement:', paymentResponse);
      
      if (paymentResponse.success) {
        setPaymentMethods(paymentResponse.data.paymentMethods || []);
        console.log('✅ Méthodes de paiement chargées:', paymentResponse.data.paymentMethods);
      }

      // Charger la cryptomonnaie NINFI et le portefeuille
      const currencyResponse = await apiService.request('/api/virtual-currency/currency/NF', {
        method: 'GET',
        requiresAuth: true
      });
      console.log('💎 Réponse cryptomonnaie:', currencyResponse);
      
      if (currencyResponse.success && currencyResponse.data) {
        // Charger le portefeuille après avoir récupéré la cryptomonnaie
        const walletResponse = await apiService.request(`/api/virtual-currency/wallet/${currencyResponse.data.id}`, {
          method: 'GET',
          requiresAuth: true
        });
        console.log('💰 Réponse portefeuille:', walletResponse);
        
        if (walletResponse.success && walletResponse.data) {
          setWallet(walletResponse.data);
          // La cryptomonnaie est aussi dans la réponse du portefeuille
          if (walletResponse.data.currency) {
            setCurrency(walletResponse.data.currency);
            console.log('✅ Cryptomonnaie mise à jour depuis le portefeuille:', walletResponse.data.currency);
          } else {
            setCurrency(currencyResponse.data);
          }
          console.log('✅ Portefeuille chargé:', walletResponse.data);
        }
      }
      
      // Animation après le chargement
      animateIn();
      
    } catch (error) {
      console.error('❌ Erreur lors du chargement:', error);
      setError('Impossible de charger les données de paiement');
      Alert.alert('Erreur', 'Impossible de charger les données de paiement');
    } finally {
      setLoading(false);
      console.log('🏁 Chargement terminé');
    }
  };

  const handleApplePay = async () => {
    if (!currency) {
      Alert.alert('Erreur', 'Cryptomonnaie non disponible');
      return;
    }

    try {
      setProcessing(true);

      // Simuler la vérification Apple Pay
      const checkResponse = await apiService.request('/api/payments/apple-pay/check', {
        method: 'POST',
        body: {
          domain: 'twitnin.com',
          validationURL: 'https://twitnin.com/apple-pay-validation'
        },
        requiresAuth: true
      });

      if (!checkResponse.success) {
        throw new Error('Apple Pay non disponible');
      }

      // Effectuer le paiement
      const paymentResponse = await apiService.request('/api/payments/apple-pay', {
        method: 'POST',
        body: {
          amount: selectedAmount,
          currencyId: currency.id,
          paymentMethod: 'apple_pay',
          deviceToken: 'simulated_device_token'
        },
        requiresAuth: true
      });

      if (paymentResponse.success) {
        const { transaction, wallet: newWallet } = paymentResponse.data;
        
        setWallet(newWallet);
        
        Alert.alert(
          'Paiement réussi',
          `Vous avez reçu ${transaction.amount.toFixed(8)} ${currency.symbol} pour ${selectedAmount}€`,
          [
            {
              text: 'Voir le portefeuille',
              onPress: () => {
                // Navigation vers le portefeuille
              }
            },
            {
              text: 'OK',
              style: 'cancel'
            }
          ]
        );
      }
    } catch (error) {
      console.error('Erreur lors du paiement:', error);
      Alert.alert('Erreur', 'Le paiement a échoué. Veuillez réessayer.');
    } finally {
      setProcessing(false);
    }
  };

  const calculateNinfiAmount = () => {
    if (!currency || !currency.currentPrice) return 0;
    return selectedAmount / parseFloat(currency.currentPrice.toString());
  };

  // Écran de chargement avec style Apple
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loadingContent}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Chargement...</Text>
        </View>
      </View>
    );
  }

  // Écran d'erreur
  if (error) {
    return (
      <View style={styles.errorContainer}>
        <View style={styles.errorContent}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>Une erreur s'est produite</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadData}>
            <Text style={styles.retryButtonText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header fixe avec blur */}
      <BlurView intensity={80} tint="systemUltraThinMaterialLight" style={styles.headerBlur}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Apple Pay</Text>
          <Text style={styles.headerSubtitle}>Acheter des NINFI</Text>
        </View>
      </BlurView>

      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={[
            styles.content,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Wallet Balance Card */}
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Solde actuel</Text>
            <Text style={styles.balanceAmount}>
              {wallet?.balance ? Number(wallet.balance).toFixed(8) : '0.00000000'} NINFI
            </Text>
            <Text style={styles.balanceEquivalent}>
              ≈ {currency && wallet?.balance 
                ? (Number(wallet.balance) * parseFloat(currency.currentPrice.toString())).toFixed(2) 
                : '0.00'}€
            </Text>
          </View>

          {/* Amount Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Montant</Text>
            <View style={styles.amountContainer}>
              {presetAmounts.map((amount, index) => (
                <TouchableOpacity
                  key={amount}
                  style={[
                    styles.amountButton,
                    selectedAmount === amount && styles.amountButtonSelected,
                  ]}
                  onPress={() => setSelectedAmount(amount)}
                  activeOpacity={0.6}
                >
                  <Text style={[
                    styles.amountText,
                    selectedAmount === amount && styles.amountTextSelected,
                  ]}>
                    {amount}€
                  </Text>
                  <Text style={[
                    styles.amountSubtext,
                    selectedAmount === amount && styles.amountSubtextSelected,
                  ]}>
                    {currency ? (amount / parseFloat(currency.currentPrice.toString())).toFixed(2) : '0'} NINFI
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Exchange Rate */}
          <View style={styles.rateContainer}>
            <View style={styles.rateRow}>
              <Text style={styles.rateLabel}>Taux de change</Text>
              <Text style={styles.rateValue}>
                1€ = {currency?.currentPrice ? (1 / parseFloat(currency.currentPrice.toString())).toFixed(6) : '1.000000'} NINFI
              </Text>
            </View>
            <Text style={styles.rateNote}>Taux actualisé en temps réel</Text>
          </View>

          {/* Transaction Summary */}
          <View style={styles.summaryContainer}>
            <Text style={styles.summaryTitle}>Résumé</Text>
            
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Montant</Text>
              <Text style={styles.summaryValue}>{selectedAmount},00 €</Text>
            </View>
            
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>NINFI reçus</Text>
              <Text style={styles.summaryValue}>
                {calculateNinfiAmount().toFixed(6)} NINFI
              </Text>
            </View>
            
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Frais</Text>
              <Text style={styles.summaryValue}>0,00 €</Text>
            </View>
            
            <View style={styles.summaryDivider} />
            
            <View style={[styles.summaryRow, styles.summaryTotal]}>
              <Text style={styles.summaryTotalLabel}>Total</Text>
              <Text style={styles.summaryTotalValue}>{selectedAmount},00 €</Text>
            </View>
          </View>

          {/* Apple Pay Button */}
          <TouchableOpacity
            style={[
              styles.applePayButton,
              processing && styles.applePayButtonDisabled
            ]}
            onPress={handleApplePay}
            disabled={processing}
            activeOpacity={0.8}
          >
            {processing ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <>
                <View style={styles.applePayIcon}>
                  <Text style={styles.appleIcon}>🍎</Text>
                  <Text style={styles.payText}>Pay</Text>
                </View>
                <Text style={styles.applePayAmount}>{selectedAmount},00 €</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Security Notice */}
          <View style={styles.securityNotice}>
            <View style={styles.securityIcon}>
              <Text style={styles.lockIcon}>🔒</Text>
            </View>
            <View style={styles.securityTextContainer}>
              <Text style={styles.securityTitle}>Paiement sécurisé</Text>
              <Text style={styles.securityDescription}>
                Votre paiement est protégé par Touch ID, Face ID ou votre code d'accès.
              </Text>
            </View>
          </View>

          {/* Terms */}
          <Text style={styles.termsText}>
            En continuant, vous acceptez nos conditions d'utilisation et notre politique de confidentialité.
          </Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContent: {
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 17,
    color: '#8E8E93',
    fontWeight: '400', fontFamily: fonts.regular,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorContent: {
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 24,
    maxWidth: 300,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: '#1C1C1E',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 17,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 17,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  headerBlur: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    paddingTop: Platform.OS === 'ios' ? 44 : 0,
  },
  headerContent: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: '#1C1C1E',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: Platform.OS === 'ios' ? 120 : 80,
    paddingBottom: 40,
  },
  content: {
    paddingHorizontal: 20,
  },
  balanceCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginBottom: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  balanceLabel: {
    fontSize: 15,
    color: '#8E8E93',
    marginBottom: 8,
  },
  balanceAmount: {
    fontSize: 28,
    fontWeight: '700', fontFamily: fonts.bold,
    color: '#1C1C1E',
    marginBottom: 4,
  },
  balanceEquivalent: {
    fontSize: 17,
    color: '#8E8E93',
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700', fontFamily: fonts.bold,
    color: '#1C1C1E',
    marginBottom: 16,
  },
  amountContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  amountButton: {
    width: (width - 56) / 3,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  amountButtonSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  amountText: {
    fontSize: 17,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: '#1C1C1E',
    marginBottom: 4,
  },
  amountTextSelected: {
    color: 'white',
  },
  amountSubtext: {
    fontSize: 13,
    color: '#8E8E93',
  },
  amountSubtextSelected: {
    color: 'rgba(255, 255, 255, 0.8)',
  },
  rateContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  rateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  rateLabel: {
    fontSize: 17,
    color: '#1C1C1E',
  },
  rateValue: {
    fontSize: 17,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: '#007AFF',
  },
  rateNote: {
    fontSize: 13,
    color: '#8E8E93',
  },
  summaryContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  summaryTitle: {
    fontSize: 20,
    fontWeight: '700', fontFamily: fonts.bold,
    color: '#1C1C1E',
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  summaryLabel: {
    fontSize: 17,
    color: '#1C1C1E',
  },
  summaryValue: {
    fontSize: 17,
    color: '#8E8E93',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#E5E5EA',
    marginVertical: 12,
  },
  summaryTotal: {
    paddingTop: 12,
  },
  summaryTotalLabel: {
    fontSize: 17,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: '#1C1C1E',
  },
  summaryTotalValue: {
    fontSize: 17,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: '#1C1C1E',
  },
  applePayButton: {
    backgroundColor: 'transparent',
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  applePayButtonDisabled: {
    opacity: 0.6,
  },
  applePayIcon: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  appleIcon: {
    fontSize: 20,
    color: 'white',
    marginRight: 8,
  },
  payText: {
    fontSize: 20,
    fontFamily: fonts.semibold,
    color: 'white',
  },
  applePayAmount: {
    fontSize: 17,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: 'white',
  },
  securityNotice: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  securityIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  lockIcon: {
    fontSize: 20,
  },
  securityTextContainer: {
    flex: 1,
  },
  securityTitle: {
    fontSize: 17,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: '#1C1C1E',
    marginBottom: 2,
  },
  securityDescription: {
    fontSize: 15,
    color: '#8E8E93',
    lineHeight: 20,
  },
  termsText: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 20,
  },
});

export default ApplePayScreen;