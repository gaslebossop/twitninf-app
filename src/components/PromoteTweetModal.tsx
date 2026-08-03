import { fonts } from '../theme';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import apiService from '../services/api';

interface Tweet {
  id: string;
  content: string;
  view_count: number;
  like_count: number;
  retweet_count: number;
}

interface AdBalance {
  balance: number;
  currency: string;
  prices: {
    impression: number;
    click: number;
    engagement: number;
  };
}

interface PromoteTweetModalProps {
  visible: boolean;
  tweet: Tweet | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function PromoteTweetModal({
  visible,
  tweet,
  onClose,
  onSuccess,
}: PromoteTweetModalProps) {
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState<AdBalance | null>(null);
  
  const [formData, setFormData] = useState({
    title: '',
    budget: '',
    cost_per_impression: '0.10',
    cost_per_click: '0.10',
    max_impressions_per_user: '1',
    targeting_criteria: {
      min_followers: '',
      verified_only: false,
      premium_only: false,
      interests: '',
    },
  });

  useEffect(() => {
    if (visible && tweet) {
      loadBalance();
      // Pré-remplir le titre avec le début du tweet
      setFormData(prev => ({
        ...prev,
        title: tweet.content.length > 50 ? 
          tweet.content.substring(0, 50) + '...' : 
          tweet.content,
      }));
    }
  }, [visible, tweet]);

  const loadBalance = async () => {
    try {
      const response = await apiService.get('/api/ads/balance');
      if (response.success) {
        setBalance(response.data);
      }
    } catch (error) {
      console.error('Erreur lors du chargement du solde:', error);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    if (field.startsWith('targeting_criteria.')) {
      const targetingField = field.split('.')[1];
      setFormData(prev => ({
        ...prev,
        targeting_criteria: {
          ...prev.targeting_criteria,
          [targetingField]: value,
        },
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [field]: value,
      }));
    }
  };

  const validateForm = () => {
    if (!tweet) {
      Alert.alert('Erreur', 'Aucun tweet sélectionné');
      return false;
    }

    if (!formData.title.trim()) {
      Alert.alert('Erreur', 'Le titre de la publicité est requis');
      return false;
    }

    if (!formData.budget || parseFloat(formData.budget) <= 0) {
      Alert.alert('Erreur', 'Le budget doit être supérieur à 0');
      return false;
    }

    if (balance && parseFloat(formData.budget) > balance.balance) {
      Alert.alert('Erreur', `Solde TWC insuffisant. Solde: ${balance.balance} TWC`);
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm() || !tweet) return;

    try {
      setLoading(true);

      const advertisementData = {
        tweet_id: tweet.id,
        title: formData.title,
        budget: parseFloat(formData.budget),
        cost_per_impression: parseFloat(formData.cost_per_impression),
        cost_per_click: parseFloat(formData.cost_per_click),
        max_impressions_per_user: parseInt(formData.max_impressions_per_user),
        targeting_criteria: {
          ...formData.targeting_criteria,
          min_followers: formData.targeting_criteria.min_followers ? 
            parseInt(formData.targeting_criteria.min_followers) : null,
          interests: formData.targeting_criteria.interests ? 
            formData.targeting_criteria.interests.split(',').map(tag => tag.trim()) : [],
        },
      };

      const response = await apiService.post('/api/ads/advertisements', advertisementData);

      if (response.success) {
        Alert.alert(
          'Succès',
          'Publicité créée avec succès ! Votre tweet sera promu dans le feed.',
          [
            {
              text: 'OK',
              onPress: () => {
                onClose();
                onSuccess?.();
              },
            },
          ]
        );
      } else {
        Alert.alert('Erreur', response.message || 'Erreur lors de la création de la publicité');
      }
    } catch (error) {
      console.error('Erreur lors de la création de la publicité:', error);
      Alert.alert('Erreur', 'Impossible de créer la publicité');
    } finally {
      setLoading(false);
    }
  };

  const quickBudgetOptions = [10, 25, 50, 100];

  if (!tweet) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="#4F7CFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Promouvoir ce tweet</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Tweet preview */}
          <View style={styles.tweetPreview}>
            <Text style={styles.tweetPreviewTitle}>Tweet à promouvoir :</Text>
            <View style={styles.tweetCard}>
              <Text style={styles.tweetContent} numberOfLines={3}>
                {tweet.content}
              </Text>
              <View style={styles.tweetStats}>
                <Text style={styles.tweetStat}>
                  👁️ {tweet.view_count} • ❤️ {tweet.like_count} • 🔄 {tweet.retweet_count}
                </Text>
              </View>
            </View>
          </View>

          {/* Solde TWC */}
          {balance && (
            <View style={styles.balanceCard}>
              <Text style={styles.balanceText}>
                Solde disponible: {balance.balance} TWC
              </Text>
            </View>
          )}

          {/* Titre de la publicité */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Titre de la publicité *</Text>
            <TextInput
              style={styles.input}
              value={formData.title}
              onChangeText={(value) => handleInputChange('title', value)}
              placeholder="Titre de votre publicité"
              maxLength={255}
            />
          </View>

          {/* Budget rapide */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Budget rapide (TWC)</Text>
            <View style={styles.quickBudgetGrid}>
              {quickBudgetOptions.map((amount) => (
                <TouchableOpacity
                  key={amount}
                  style={[
                    styles.quickBudgetButton,
                    formData.budget === amount.toString() && styles.quickBudgetButtonSelected,
                  ]}
                  onPress={() => handleInputChange('budget', amount.toString())}
                >
                  <Text style={[
                    styles.quickBudgetText,
                    formData.budget === amount.toString() && styles.quickBudgetTextSelected,
                  ]}>
                    {amount}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Budget personnalisé */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Budget personnalisé (TWC) *</Text>
            <TextInput
              style={styles.input}
              value={formData.budget}
              onChangeText={(value) => handleInputChange('budget', value)}
              placeholder="50"
              keyboardType="numeric"
            />
          </View>

          {/* Coûts */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Coûts par action</Text>
            <View style={styles.costsRow}>
              <View style={styles.costInput}>
                <Text style={styles.costLabel}>Vue</Text>
                <TextInput
                  style={styles.costInputField}
                  value={formData.cost_per_impression}
                  onChangeText={(value) => handleInputChange('cost_per_impression', value)}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.costInput}>
                <Text style={styles.costLabel}>Clic</Text>
                <TextInput
                  style={styles.costInputField}
                  value={formData.cost_per_click}
                  onChangeText={(value) => handleInputChange('cost_per_click', value)}
                  keyboardType="numeric"
                />
              </View>
            </View>
          </View>

          {/* Ciblage simple */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Ciblage</Text>
            
            <View style={styles.switchItem}>
              <Text style={styles.switchLabel}>Utilisateurs vérifiés uniquement</Text>
              <Switch
                value={formData.targeting_criteria.verified_only}
                onValueChange={(value) => handleInputChange('targeting_criteria.verified_only', value)}
                trackColor={{ false: '#e1e8ed', true: '#4F7CFF' }}
                thumbColor={formData.targeting_criteria.verified_only ? 'white' : '#f4f3f4'}
              />
            </View>

            <View style={styles.switchItem}>
              <Text style={styles.switchLabel}>Utilisateurs premium uniquement</Text>
              <Switch
                value={formData.targeting_criteria.premium_only}
                onValueChange={(value) => handleInputChange('targeting_criteria.premium_only', value)}
                trackColor={{ false: '#e1e8ed', true: '#4F7CFF' }}
                thumbColor={formData.targeting_criteria.premium_only ? 'white' : '#f4f3f4'}
              />
            </View>
          </View>

          {/* Estimation */}
          {formData.budget && balance && (
            <View style={styles.estimationCard}>
              <Text style={styles.estimationTitle}>Estimation</Text>
              <Text style={styles.estimationText}>
                Avec {formData.budget} TWC, votre tweet pourrait être vu environ{' '}
                {Math.floor(parseFloat(formData.budget) / parseFloat(formData.cost_per_impression))} fois
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            <Text style={styles.submitButtonText}>
              {loading ? 'Création...' : `Promouvoir pour ${formData.budget || '0'} TWC`}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e1e8ed',
  },
  closeButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold', fontFamily: fonts.bold,
    color: '#14171a',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  tweetPreview: {
    marginBottom: 20,
  },
  tweetPreviewTitle: {
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: '#14171a',
    marginBottom: 8,
  },
  tweetCard: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e1e8ed',
  },
  tweetContent: {
    fontSize: 16,
    color: '#14171a',
    marginBottom: 8,
  },
  tweetStats: {
    flexDirection: 'row',
  },
  tweetStat: {
    fontSize: 14,
    color: '#657786',
  },
  balanceCard: {
    backgroundColor: '#4F7CFF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  balanceText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: '#14171a',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e1e8ed',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: 'white',
  },
  quickBudgetGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  quickBudgetButton: {
    flex: 1,
    padding: 12,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#e1e8ed',
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: 'white',
  },
  quickBudgetButtonSelected: {
    borderColor: '#4F7CFF',
    backgroundColor: '#f0f8ff',
  },
  quickBudgetText: {
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: '#14171a',
  },
  quickBudgetTextSelected: {
    color: '#4F7CFF',
  },
  costsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  costInput: {
    flex: 1,
    marginHorizontal: 4,
  },
  costLabel: {
    fontSize: 14,
    color: '#657786',
    marginBottom: 4,
  },
  costInputField: {
    borderWidth: 1,
    borderColor: '#e1e8ed',
    borderRadius: 8,
    padding: 8,
    fontSize: 14,
    backgroundColor: 'white',
    textAlign: 'center',
  },
  switchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  switchLabel: {
    fontSize: 16,
    color: '#14171a',
    flex: 1,
  },
  estimationCard: {
    backgroundColor: '#f0f8ff',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4F7CFF',
  },
  estimationTitle: {
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: '#4F7CFF',
    marginBottom: 4,
  },
  estimationText: {
    fontSize: 14,
    color: '#14171a',
  },
  footer: {
    padding: 16,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e1e8ed',
  },
  submitButton: {
    backgroundColor: '#4F7CFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#aab8c2',
  },
  submitButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold', fontFamily: fonts.bold,
  },
});
