import { fonts } from '../theme';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '../services';

interface PremiumPopupProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const PremiumPopup: React.FC<PremiumPopupProps> = ({ visible, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<any[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [status, setStatus] = useState<any>(null);

  useEffect(() => {
    if (visible) {
      fetchPlans();
      fetchStatus();
    }
  }, [visible]);

  const fetchPlans = async () => {
    try {
      const response = await apiService.get('/api/premium/plans');
      if (response.data.success) {
        setPlans(response.data.data.plans);
        setSelectedPlan(response.data.data.plans[0]?.id || null);
      }
    } catch (error) {
      console.error('Erreur récup plans:', error);
    }
  };

  const fetchStatus = async () => {
    try {
      const response = await apiService.get('/api/premium/status');
      if (response.data.success) {
        setStatus(response.data.data);
      }
    } catch (error) {
      console.error('Erreur status:', error);
    }
  };

  const handleSubscribe = async () => {
    if (!selectedPlan) {
      Alert.alert('Erreur', 'Sélectionnez un plan');
      return;
    }

    setLoading(true);
    try {
      const response = await apiService.post('/api/premium/subscribe', {
        plan_id: selectedPlan,
        payment_method: 'APPLE_PAY',
      });

      if (response.data.success) {
        Alert.alert('✅ Succès', 'Premium activé avec succès!');
        onSuccess?.();
        onClose();
      }
    } catch (error: any) {
      Alert.alert('Erreur', error.response?.data?.message || 'Erreur lors de l\'abonnement');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    setLoading(true);
    try {
      const response = await apiService.post('/api/premium/cancel');
      if (response.data.success) {
        Alert.alert('✅', 'Abonnement annulé');
        fetchStatus();
      }
    } catch (error: any) {
      Alert.alert('Erreur', error.response?.data?.message || 'Erreur lors de l\'annulation');
    } finally {
      setLoading(false);
    }
  };

  const selectedPlanData = plans.find(p => p.id === selectedPlan);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Twitninf Premium</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 100 }}>
          {/* Current Status */}
          {status?.is_premium && (
            <View style={styles.statusCard}>
              <Ionicons name="checkmark-circle" size={40} color="#4CAF50" />
              <Text style={styles.statusTitle}>Vous êtes Premium ✨</Text>
              <Text style={styles.statusText}>
                Expire le {new Date(status.premium_expires_at).toLocaleDateString()}
              </Text>
              <Text style={styles.daysLeft}>
                {status.days_remaining} jours restants
              </Text>
            </View>
          )}

          {/* Plans Section */}
          <Text style={styles.sectionTitle}>Choisissez votre plan</Text>

          {plans.map((plan) => (
            <TouchableOpacity
              key={plan.id}
              style={[
                styles.planCard,
                selectedPlan === plan.id && styles.planCardSelected,
              ]}
              onPress={() => setSelectedPlan(plan.id)}
            >
              <View style={styles.planHeader}>
                <View>
                  <Text style={styles.planName}>{plan.name}</Text>
                  <Text style={styles.planBilling}>{plan.billing_period}</Text>
                </View>
                <View style={styles.priceContainer}>
                  <Text style={styles.price}>{plan.price_eur}€</Text>
                  <Text style={styles.period}>/mois</Text>
                </View>
              </View>

              {/* Features */}
              <View style={styles.featuresContainer}>
                {plan.features.map((feature, idx) => (
                  <Text key={idx} style={styles.feature}>
                    {feature}
                  </Text>
                ))}
              </View>

              {/* Selection Indicator */}
              {selectedPlan === plan.id && (
                <View style={styles.selectedIndicator}>
                  <Ionicons name="checkmark-circle" size={24} color="#FF9800" />
                </View>
              )}
            </TouchableOpacity>
          ))}

          {/* Benefits Section */}
          <View style={styles.benefitsSection}>
            <Text style={styles.sectionTitle}>Avantages Premium</Text>
            <View style={styles.benefitRow}>
              <Ionicons name="flame" size={20} color="#FF5722" />
              <Text style={styles.benefitText}>Engagement 3x plus élevé</Text>
            </View>
            <View style={styles.benefitRow}>
              <Ionicons name="wallet" size={20} color="#4CAF50" />
              <Text style={styles.benefitText}>Monétisation des tweets</Text>
            </View>
            <View style={styles.benefitRow}>
              <Ionicons name="trending-up" size={20} color="#2196F3" />
              <Text style={styles.benefitText}>Analytics avancés</Text>
            </View>
            <View style={styles.benefitRow}>
              <Ionicons name="remove-circle" size={20} color="#9C27B0" />
              <Text style={styles.benefitText}>Sans publicités</Text>
            </View>
          </View>

          {/* FAQ */}
          <View style={styles.faqSection}>
            <Text style={styles.sectionTitle}>FAQ</Text>
            <View style={styles.faqItem}>
              <Text style={styles.faqQuestion}>Comment ça marche?</Text>
              <Text style={styles.faqAnswer}>
                Activez Premium et accédez immédiatement à tous les avantages. Vous pouvez annuler à tout moment.
              </Text>
            </View>
            <View style={styles.faqItem}>
              <Text style={styles.faqQuestion}>Puis-je annuler?</Text>
              <Text style={styles.faqAnswer}>
                Oui, annulez votre abonnement à tout moment depuis vos paramètres.
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* Footer Actions */}
        <View style={styles.footer}>
          {status?.is_premium ? (
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={handleCancel}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FF5722" />
              ) : (
                <Text style={styles.cancelButtonText}>Annuler l'abonnement</Text>
              )}
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity style={styles.buttonSecondary} onPress={onClose}>
                <Text style={styles.buttonSecondaryText}>Plus tard</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.button}
                onPress={handleSubscribe}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="card" size={18} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.buttonText}>
                      Activer pour {selectedPlanData?.price_eur}€
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    paddingTop: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700', fontFamily: fonts.bold,
    color: '#fff',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  statusCard: {
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderRadius: 12,
    padding: 20,
    marginTop: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '700', fontFamily: fonts.bold,
    color: '#fff',
    marginTop: 12,
  },
  statusText: {
    fontSize: 14,
    color: '#aaa',
    marginTop: 8,
  },
  daysLeft: {
    fontSize: 24,
    fontWeight: '700', fontFamily: fonts.bold,
    color: '#4CAF50',
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700', fontFamily: fonts.bold,
    color: '#fff',
    marginTop: 24,
    marginBottom: 12,
  },
  planCard: {
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#333',
  },
  planCardSelected: {
    borderColor: '#FF9800',
    backgroundColor: 'rgba(255,255,255,0.09)',
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  planName: {
    fontSize: 16,
    fontWeight: '700', fontFamily: fonts.bold,
    color: '#fff',
  },
  planBilling: {
    fontSize: 12,
    color: '#aaa',
    marginTop: 4,
  },
  priceContainer: {
    alignItems: 'flex-end',
  },
  price: {
    fontSize: 24,
    fontWeight: '700', fontFamily: fonts.bold,
    color: '#FF9800',
  },
  period: {
    fontSize: 11,
    color: '#aaa',
  },
  featuresContainer: {
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingTop: 12,
  },
  feature: {
    fontSize: 13,
    color: '#ccc',
    marginBottom: 8,
  },
  selectedIndicator: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  benefitsSection: {
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  benefitText: {
    fontSize: 14,
    color: '#ccc',
    marginLeft: 12,
  },
  faqSection: {
    marginTop: 20,
    marginBottom: 20,
  },
  faqItem: {
    marginBottom: 16,
  },
  faqQuestion: {
    fontSize: 14,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: '#fff',
    marginBottom: 6,
  },
  faqAnswer: {
    fontSize: 12,
    color: '#aaa',
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    backgroundColor: '#FF9800',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '700', fontFamily: fonts.bold,
    color: '#fff',
  },
  buttonSecondary: {
    flex: 1,
    backgroundColor: 'transparent',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#444',
  },
  buttonSecondaryText: {
    fontSize: 14,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: '#ccc',
  },
  cancelButton: {
    backgroundColor: '#d32f2f',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '700', fontFamily: fonts.bold,
    color: '#fff',
  },
});

export default PremiumPopup;
