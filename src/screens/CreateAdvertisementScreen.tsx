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
  FlatList,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import apiService from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { BackButton } from '../components/ui';
import { toast } from '../components/ui/Toast';

interface Tweet {
  id: string;
  content: string;
  created_at: string;
  view_count: number;
  like_count: number;
  retweet_count: number;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  total_budget: number;
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

export default function CreateAdvertisementScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState<AdBalance | null>(null);
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  
  // Form data
  const [formData, setFormData] = useState({
    tweet_id: '',
    campaign_id: '',
    title: '',
    description: '',
    budget: '',
    cost_per_impression: '0.10',
    cost_per_click: '0.10',
    cost_per_engagement: '0.05',
    start_date: new Date(),
    end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    max_impressions_per_day: '',
    max_impressions_per_user: '1',
    targeting_criteria: {
      min_followers: '',
      verified_only: false,
      premium_only: false,
      interests: '',
    },
  });

  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showTweetSelector, setShowTweetSelector] = useState(false);

  useEffect(() => {
    if (user?.id) {
      loadData();
    }
  }, [user?.id]);

  const loadData = async () => {
    try {
      if (!user?.id) {
        console.error('Utilisateur non connecté');
        return;
      }

      const [balanceResponse, tweetsResponse, campaignsResponse] = await Promise.all([
        apiService.get('/api/ads/balance'),
        apiService.get(`/api/users/${user.id}/tweets?limit=50`),
        apiService.get('/api/ads/campaigns?status=active')
      ]);

      if (balanceResponse.success) {
        setBalance(balanceResponse.data);
      }

      if (tweetsResponse.success) {
        setTweets(tweetsResponse.data.tweets || []);
        console.log('Tweets chargés:', tweetsResponse.data.tweets?.length || 0);
      } else {
        console.error('Erreur lors du chargement des tweets:', tweetsResponse.message);
      }

      if (campaignsResponse.success) {
        setCampaigns(campaignsResponse.data.data || []);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des données:', error);
      toast.error('Impossible de charger les données');
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
    if (!formData.tweet_id) {
      toast.error('Veuillez sélectionner un tweet à promouvoir');
      return false;
    }

    if (!formData.title.trim()) {
      toast.error('Le titre de la publicité est requis');
      return false;
    }

    if (!formData.budget || parseFloat(formData.budget) <= 0) {
      toast.error('Le budget doit être supérieur à 0');
      return false;
    }

    if (balance && parseFloat(formData.budget) > balance.balance) {
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

      const advertisementData = {
        ...formData,
        budget: parseFloat(formData.budget),
        cost_per_impression: parseFloat(formData.cost_per_impression),
        cost_per_click: parseFloat(formData.cost_per_click),
        cost_per_engagement: parseFloat(formData.cost_per_engagement),
        max_impressions_per_day: formData.max_impressions_per_day ? 
          parseInt(formData.max_impressions_per_day) : null,
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
        toast.success('Publicité créée');
        navigation.goBack();
      } else {
        toast.error(response.message || 'Erreur lors de la création de la publicité');
      }
    } catch (error) {
      console.error('Erreur lors de la création de la publicité:', error);
      toast.error('Impossible de créer la publicité');
    } finally {
      setLoading(false);
    }
  };

  const renderTweetItem = ({ item }: { item: Tweet }) => (
    <TouchableOpacity
      style={[
        styles.tweetItem,
        formData.tweet_id === item.id && styles.tweetItemSelected,
      ]}
      onPress={() => {
        handleInputChange('tweet_id', item.id);
        setShowTweetSelector(false);
      }}
    >
      <View style={styles.tweetContent}>
        <Text style={styles.tweetText} numberOfLines={2}>
          {item.content}
        </Text>
        <View style={styles.tweetStats}>
          <Text style={styles.tweetStat}>
            👁️ {item.view_count} • ❤️ {item.like_count} • 🔄 {item.retweet_count}
          </Text>
        </View>
      </View>
      <Ionicons
        name={formData.tweet_id === item.id ? 'radio-button-on' : 'radio-button-off'}
        size={20}
        color={formData.tweet_id === item.id ? '#4F7CFF' : '#657786'}
      />
    </TouchableOpacity>
  );

  const renderCampaignItem = ({ item }: { item: Campaign }) => (
    <TouchableOpacity
      style={[
        styles.campaignItem,
        formData.campaign_id === item.id && styles.campaignItemSelected,
      ]}
      onPress={() => handleInputChange('campaign_id', item.id)}
    >
      <View style={styles.campaignContent}>
        <Text style={styles.campaignName}>{item.name}</Text>
        <Text style={styles.campaignBudget}>
          Budget: {item.total_budget} TWC • Statut: {item.status}
        </Text>
      </View>
      <Ionicons
        name={formData.campaign_id === item.id ? 'radio-button-on' : 'radio-button-off'}
        size={20}
        color={formData.campaign_id === item.id ? '#4F7CFF' : '#657786'}
      />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <BackButton navigation={navigation} />
        <Text style={styles.headerTitle}>Nouvelle Publicité</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Solde TWC */}
      {balance && (
        <View style={styles.balanceCard}>
          <Text style={styles.balanceText}>
            Solde disponible: {balance.balance} TWC
          </Text>
          <Text style={styles.pricesText}>
            Prix: {balance.prices.impression} TWC/vue • {balance.prices.click} TWC/clic
          </Text>
        </View>
      )}

      {/* Sélection du tweet */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tweet à promouvoir *</Text>
        
        {formData.tweet_id ? (
          <View style={styles.selectedTweetContainer}>
            <Text style={styles.selectedTweetText}>
              Tweet sélectionné: {tweets.find(t => t.id === formData.tweet_id)?.content.substring(0, 50)}...
            </Text>
            <TouchableOpacity
              style={styles.changeTweetButton}
              onPress={() => setFormData(prev => ({ ...prev, tweet_id: '' }))}
            >
              <Text style={styles.changeTweetButtonText}>Changer</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.selectTweetButton}
            onPress={() => {
              if (tweets.length > 0) {
                setShowTweetSelector(true);
              } else {
                toast.info('Aucun tweet', {
                  description: 'Vous n\'avez pas encore de tweets à promouvoir.',
                });
              }
            }}
          >
            <Ionicons name="add-circle-outline" size={24} color="#4F7CFF" />
            <Text style={styles.selectTweetButtonText}>Sélectionner le tweet</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Sélection de la campagne */}
      {campaigns.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Campagne (optionnel)</Text>
          <FlatList
            data={campaigns}
            renderItem={renderCampaignItem}
            keyExtractor={(item) => item.id}
            style={styles.campaignsList}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled={true}
          />
        </View>
      )}

      {/* Informations de la publicité */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Informations de la publicité</Text>
        
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Titre de la publicité *</Text>
          <TextInput
            style={styles.input}
            value={formData.title}
            onChangeText={(value) => handleInputChange('title', value)}
            placeholder="Ex: Promotion spéciale"
            maxLength={255}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={formData.description}
            onChangeText={(value) => handleInputChange('description', value)}
            placeholder="Décrivez votre publicité..."
            multiline
            numberOfLines={3}
          />
        </View>
      </View>

      {/* Budget et coûts */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Budget et coûts</Text>
        
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Budget total (TWC) *</Text>
          <TextInput
            style={styles.input}
            value={formData.budget}
            onChangeText={(value) => handleInputChange('budget', value)}
            placeholder="50"
            keyboardType="numeric"
          />
        </View>

        <View style={styles.costsGrid}>
          <View style={styles.costInput}>
            <Text style={styles.label}>Coût par vue (TWC)</Text>
            <TextInput
              style={styles.input}
              value={formData.cost_per_impression}
              onChangeText={(value) => handleInputChange('cost_per_impression', value)}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.costInput}>
            <Text style={styles.label}>Coût par clic (TWC)</Text>
            <TextInput
              style={styles.input}
              value={formData.cost_per_click}
              onChangeText={(value) => handleInputChange('cost_per_click', value)}
              keyboardType="numeric"
            />
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Coût par engagement (TWC)</Text>
          <TextInput
            style={styles.input}
            value={formData.cost_per_engagement}
            onChangeText={(value) => handleInputChange('cost_per_engagement', value)}
            keyboardType="numeric"
          />
        </View>
      </View>

      {/* Limites */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Limites</Text>
        
        <View style={styles.costsGrid}>
          <View style={styles.costInput}>
            <Text style={styles.label}>Max impressions/jour</Text>
            <TextInput
              style={styles.input}
              value={formData.max_impressions_per_day}
              onChangeText={(value) => handleInputChange('max_impressions_per_day', value)}
              placeholder="100"
              keyboardType="numeric"
            />
          </View>
          <View style={styles.costInput}>
            <Text style={styles.label}>Max impressions/utilisateur</Text>
            <TextInput
              style={styles.input}
              value={formData.max_impressions_per_user}
              onChangeText={(value) => handleInputChange('max_impressions_per_user', value)}
              keyboardType="numeric"
            />
          </View>
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

      {/* Bouton de création */}
      <View style={styles.submitSection}>
        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text style={styles.submitButtonText}>
            {loading ? 'Création...' : 'Créer la publicité'}
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

      {/* Modal de sélection de tweet */}
      {showTweetSelector && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sélectionner un tweet</Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setShowTweetSelector(false)}
              >
                <Ionicons name="close" size={24} color="#657786" />
              </TouchableOpacity>
            </View>
            
            <FlatList
              data={tweets}
              renderItem={renderTweetItem}
              keyExtractor={(item) => item.id}
              style={styles.modalTweetsList}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f9fa',
  },
  scrollContent: {
    flex: 1,
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
  pricesText: {
    color: 'white',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
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
  tweetsList: {
    maxHeight: 200,
  },
  selectTweetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f8ff',
    borderWidth: 2,
    borderColor: '#4F7CFF',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 20,
    marginVertical: 10,
  },
  selectTweetButtonText: {
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: '#4F7CFF',
    marginLeft: 10,
  },
  selectedTweetContainer: {
    backgroundColor: '#e8f5e8',
    borderWidth: 1,
    borderColor: '#17BF63',
    borderRadius: 12,
    padding: 16,
    marginVertical: 10,
  },
  selectedTweetText: {
    fontSize: 14,
    color: '#14171a',
    marginBottom: 10,
  },
  changeTweetButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#4F7CFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  changeTweetButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    margin: 20,
    maxHeight: '80%',
    width: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e8ed',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold', fontFamily: fonts.bold,
    color: '#14171a',
  },
  modalCloseButton: {
    padding: 5,
  },
  modalTweetsList: {
    maxHeight: 400,
  },
  tweetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderWidth: 1,
    borderColor: '#e1e8ed',
    borderRadius: 8,
    marginBottom: 8,
  },
  tweetItemSelected: {
    borderColor: '#4F7CFF',
    backgroundColor: '#f0f8ff',
  },
  tweetContent: {
    flex: 1,
  },
  tweetText: {
    fontSize: 14,
    color: '#14171a',
    marginBottom: 4,
  },
  tweetStats: {
    flexDirection: 'row',
  },
  tweetStat: {
    fontSize: 12,
    color: '#657786',
  },
  campaignsList: {
    maxHeight: 150,
  },
  campaignItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderWidth: 1,
    borderColor: '#e1e8ed',
    borderRadius: 8,
    marginBottom: 8,
  },
  campaignItemSelected: {
    borderColor: '#4F7CFF',
    backgroundColor: '#f0f8ff',
  },
  campaignContent: {
    flex: 1,
  },
  campaignName: {
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: '#14171a',
  },
  campaignBudget: {
    fontSize: 14,
    color: '#657786',
    marginTop: 2,
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
  costsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  costInput: {
    flex: 1,
    marginHorizontal: 4,
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
