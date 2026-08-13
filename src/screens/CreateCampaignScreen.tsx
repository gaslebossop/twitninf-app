import { fonts } from '../theme';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Switch,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import apiService from '../services/api';
import { BackButton } from '../components/ui';
import { toast } from '../components/ui/Toast';

interface AdBalance {
  balance: number;
  currency: string;
  prices: {
    impression: number;
    click: number;
    engagement: number;
  };
}

export default function CreateCampaignScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState<AdBalance | null>(null);
  
  // Form data
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    objective: 'awareness',
    total_budget: '',
    daily_budget: '',
    start_date: new Date(),
    end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 jours
    targeting_criteria: {
      min_followers: '',
      verified_only: false,
      premium_only: false,
      interests: '',
    },
    // Nouveaux champs pour créer une publicité directement
    create_advertisement: false,
    ad_content: '',
    ad_title: '',
    ad_budget: '',
    ad_cost_per_impression: '0.10',
    ad_cost_per_click: '0.10',
    ad_max_impressions_per_user: '1',
  });

  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);

  useEffect(() => {
    loadBalance();
  }, []);

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
    if (!formData.name.trim()) {
      toast.error('Le nom de la campagne est requis');
      return false;
    }

    if (!formData.total_budget || parseFloat(formData.total_budget) <= 0) {
      toast.error('Le budget total doit être supérieur à 0');
      return false;
    }

    if (balance && parseFloat(formData.total_budget) > balance.balance) {
      toast.error(`Solde TWC insuffisant. Solde: ${balance.balance} TWC`);
      return false;
    }

    if (formData.end_date <= formData.start_date) {
      toast.error('La date de fin doit être après la date de début');
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    try {
      setLoading(true);

      const campaignData = {
        name: formData.name,
        description: formData.description,
        objective: formData.objective,
        total_budget: parseFloat(formData.total_budget),
        daily_budget: formData.daily_budget ? parseFloat(formData.daily_budget) : null,
        start_date: formData.start_date,
        end_date: formData.end_date,
        targeting_criteria: {
          ...formData.targeting_criteria,
          min_followers: formData.targeting_criteria.min_followers ? 
            parseInt(formData.targeting_criteria.min_followers) : null,
          interests: formData.targeting_criteria.interests ? 
            formData.targeting_criteria.interests.split(',').map(tag => tag.trim()) : [],
        },
      };

      // Créer la campagne
      const campaignResponse = await apiService.post('/api/ads/campaigns', campaignData);

      if (campaignResponse.success) {
        let message = 'Campagne créée avec succès !';
        
        // Si l'utilisateur veut créer une publicité directement
        if (formData.create_advertisement && formData.ad_content.trim()) {
          try {
            // D'abord créer le tweet
            const tweetData = {
              content: formData.ad_content,
              hashtags: [],
              mentions: [],
              media_urls: [],
              language: 'fr'
            };
            
            const tweetResponse = await apiService.post('/api/tweets', tweetData);
            
            if (tweetResponse.success) {
              // Créer la publicité
              const advertisementData = {
                tweet_id: tweetResponse.data.id,
                campaign_id: campaignResponse.data.id,
                title: formData.ad_title || 'Publicité de campagne',
                budget: parseFloat(formData.ad_budget || '50'),
                cost_per_impression: parseFloat(formData.ad_cost_per_impression),
                cost_per_click: parseFloat(formData.ad_cost_per_click),
                max_impressions_per_user: parseInt(formData.ad_max_impressions_per_user),
                start_date: formData.start_date,
                end_date: formData.end_date,
                targeting_criteria: campaignData.targeting_criteria,
              };
              
              const adResponse = await apiService.post('/api/ads/advertisements', advertisementData);
              
              if (adResponse.success) {
                message = 'Campagne et publicité créées avec succès !';
              } else {
                message = 'Campagne créée, mais erreur lors de la création de la publicité.';
              }
            } else {
              message = 'Campagne créée, mais erreur lors de la création du tweet.';
            }
          } catch (adError) {
            console.error('Erreur lors de la création de la publicité:', adError);
            message = 'Campagne créée, mais erreur lors de la création de la publicité.';
          }
        }

        toast.success(message);
        navigation.goBack();
      } else {
        toast.error(campaignResponse.message || 'Erreur lors de la création de la campagne');
      }
    } catch (error) {
      console.error('Erreur lors de la création de la campagne:', error);
      toast.error('Impossible de créer la campagne');
    } finally {
      setLoading(false);
    }
  };

  const objectives = [
    { value: 'awareness', label: 'Notoriété', description: 'Augmenter la visibilité' },
    { value: 'engagement', label: 'Engagement', description: 'Encourager les interactions' },
    { value: 'traffic', label: 'Trafic', description: 'Diriger vers un lien' },
    { value: 'conversions', label: 'Conversions', description: 'Générer des actions' },
  ];

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView keyboardShouldPersistTaps="handled">
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <BackButton navigation={navigation} />
        <Text style={styles.headerTitle}>Nouvelle Campagne</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Solde TWC */}
      {balance && (
        <View style={styles.balanceCard}>
          <Text style={styles.balanceText}>
            Solde disponible: {balance.balance} TWC
          </Text>
        </View>
      )}

      {/* Informations de base */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Informations de base</Text>
        
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Nom de la campagne *</Text>
          <TextInput
            style={styles.input}
            value={formData.name}
            onChangeText={(value) => handleInputChange('name', value)}
            placeholder="Ex: Promotion Produit 2025"
            maxLength={255}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={formData.description}
            onChangeText={(value) => handleInputChange('description', value)}
            placeholder="Décrivez l'objectif de votre campagne..."
            multiline
            numberOfLines={3}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Objectif *</Text>
          {objectives.map((objective) => (
            <TouchableOpacity
              key={objective.value}
              style={[
                styles.objectiveOption,
                formData.objective === objective.value && styles.objectiveOptionSelected,
              ]}
              onPress={() => handleInputChange('objective', objective.value)}
            >
              <View style={styles.objectiveContent}>
                <Text style={[
                  styles.objectiveLabel,
                  formData.objective === objective.value && styles.objectiveLabelSelected,
                ]}>
                  {objective.label}
                </Text>
                <Text style={styles.objectiveDescription}>{objective.description}</Text>
              </View>
              <Ionicons
                name={formData.objective === objective.value ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={formData.objective === objective.value ? '#4F7CFF' : '#657786'}
              />
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Budget */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Budget</Text>
        
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Budget total (TWC) *</Text>
          <TextInput
            style={styles.input}
            value={formData.total_budget}
            onChangeText={(value) => handleInputChange('total_budget', value)}
            placeholder="100"
            keyboardType="numeric"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Budget quotidien (TWC) - Optionnel</Text>
          <TextInput
            style={styles.input}
            value={formData.daily_budget}
            onChangeText={(value) => handleInputChange('daily_budget', value)}
            placeholder="10"
            keyboardType="numeric"
          />
        </View>
      </View>

      {/* Dates */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Période</Text>
        
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Date de début</Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowStartDatePicker(true)}
          >
            <Text style={styles.dateButtonText}>
              {formData.start_date.toLocaleDateString('fr-FR')}
            </Text>
            <Ionicons name="calendar-outline" size={20} color="#4F7CFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Date de fin</Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowEndDatePicker(true)}
          >
            <Text style={styles.dateButtonText}>
              {formData.end_date.toLocaleDateString('fr-FR')}
            </Text>
            <Ionicons name="calendar-outline" size={20} color="#4F7CFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Ciblage */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Ciblage</Text>
        
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Nombre minimum de followers</Text>
          <TextInput
            style={styles.input}
            value={formData.targeting_criteria.min_followers}
            onChangeText={(value) => handleInputChange('targeting_criteria.min_followers', value)}
            placeholder="50"
            keyboardType="numeric"
          />
        </View>

        <View style={styles.switchGroup}>
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

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Intérêts (hashtags séparés par des virgules)</Text>
          <TextInput
            style={styles.input}
            value={formData.targeting_criteria.interests}
            onChangeText={(value) => handleInputChange('targeting_criteria.interests', value)}
            placeholder="#Tech, #Innovation, #Startup"
          />
        </View>
      </View>

      {/* Section pour créer une publicité directement */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Créer une publicité directement</Text>
        
        <View style={styles.checkboxContainer}>
          <TouchableOpacity
            style={styles.checkbox}
            onPress={() => setFormData(prev => ({ 
              ...prev, 
              create_advertisement: !prev.create_advertisement 
            }))}
          >
            <View style={[
              styles.checkboxBox,
              formData.create_advertisement && styles.checkboxBoxChecked
            ]}>
              {formData.create_advertisement && (
                <Text style={styles.checkboxCheck}>✓</Text>
              )}
            </View>
            <Text style={styles.checkboxLabel}>
              Créer une publicité avec cette campagne
            </Text>
          </TouchableOpacity>
        </View>

        {formData.create_advertisement && (
          <View style={styles.adForm}>
            <Text style={styles.inputLabel}>Contenu de la publicité *</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.ad_content}
              onChangeText={(text) => setFormData(prev => ({ ...prev, ad_content: text }))}
              placeholder="Écrivez le contenu de votre publicité..."
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <Text style={styles.inputLabel}>Titre de la publicité</Text>
            <TextInput
              style={styles.input}
              value={formData.ad_title}
              onChangeText={(text) => setFormData(prev => ({ ...prev, ad_title: text }))}
              placeholder="Titre optionnel pour la publicité"
            />

            <View style={styles.row}>
              <View style={styles.halfInput}>
                <Text style={styles.inputLabel}>Budget publicité (TWC)</Text>
                <TextInput
                  style={styles.input}
                  value={formData.ad_budget}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, ad_budget: text }))}
                  placeholder="50"
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.halfInput}>
                <Text style={styles.inputLabel}>Max impressions/utilisateur</Text>
                <TextInput
                  style={styles.input}
                  value={formData.ad_max_impressions_per_user}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, ad_max_impressions_per_user: text }))}
                  placeholder="1"
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.halfInput}>
                <Text style={styles.inputLabel}>Coût par vue (TWC)</Text>
                <TextInput
                  style={styles.input}
                  value={formData.ad_cost_per_impression}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, ad_cost_per_impression: text }))}
                  placeholder="0.10"
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.halfInput}>
                <Text style={styles.inputLabel}>Coût par clic (TWC)</Text>
                <TextInput
                  style={styles.input}
                  value={formData.ad_cost_per_click}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, ad_cost_per_click: text }))}
                  placeholder="0.10"
                  keyboardType="numeric"
                />
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Bouton de création */}
      <View style={styles.submitSection}>
        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text style={styles.submitButtonText}>
            {loading ? 'Création...' : 
             formData.create_advertisement ? 'Créer campagne + publicité' : 'Créer la campagne'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Date Pickers */}
      {showStartDatePicker && (
        <DateTimePicker
          value={formData.start_date}
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
            setShowStartDatePicker(false);
            if (selectedDate) {
              handleInputChange('start_date', selectedDate);
            }
          }}
        />
      )}

      {showEndDatePicker && (
        <DateTimePicker
          value={formData.end_date}
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
            setShowEndDatePicker(false);
            if (selectedDate) {
              handleInputChange('end_date', selectedDate);
            }
          }}
        />
      )}
    </ScrollView>
    </KeyboardAvoidingView>
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
  backButton: {
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
  balanceCard: {
    backgroundColor: '#4F7CFF',
    margin: 16,
    padding: 12,
    borderRadius: 8,
  },
  balanceText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
    textAlign: 'center',
  },
  section: {
    backgroundColor: 'white',
    margin: 16,
    padding: 16,
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold', fontFamily: fonts.bold,
    color: '#14171a',
    marginBottom: 16,
  },
  checkboxContainer: {
    marginBottom: 15,
  },
  checkbox: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#007AFF',
    borderRadius: 4,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxChecked: {
    backgroundColor: '#007AFF',
  },
  checkboxCheck: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold', fontFamily: fonts.bold,
  },
  checkboxLabel: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  adForm: {
    marginTop: 15,
    padding: 15,
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  halfInput: {
    flex: 1,
    marginRight: 10,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: '#14171a',
    marginBottom: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: '#14171a',
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e1e8ed',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f7f9fa',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  objectiveOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderWidth: 1,
    borderColor: '#e1e8ed',
    borderRadius: 8,
    marginBottom: 8,
  },
  objectiveOptionSelected: {
    borderColor: '#4F7CFF',
    backgroundColor: '#f0f8ff',
  },
  objectiveContent: {
    flex: 1,
  },
  objectiveLabel: {
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: '#14171a',
  },
  objectiveLabelSelected: {
    color: '#4F7CFF',
  },
  objectiveDescription: {
    fontSize: 14,
    color: '#657786',
    marginTop: 2,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#e1e8ed',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#f7f9fa',
  },
  dateButtonText: {
    fontSize: 16,
    color: '#14171a',
  },
  switchGroup: {
    marginBottom: 16,
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
  submitSection: {
    padding: 16,
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
