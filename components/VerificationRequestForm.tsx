/**
 * 📋 Formulaire de demande de vérification
 * Permet aux utilisateurs de demander la vérification de leur compte
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/contexts/AuthContext';
import apiRequest from '../src/services/api';

interface VerificationRequestFormProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface VerificationRequirements {
  [key: string]: {
    title: string;
    description: string;
    questions?: string[];
    criteria: string[];
    documents_required: string[];
  };
}

interface VerificationStatus {
  has_request: boolean;
  status?: string;
  request_id?: string;
  request_type?: string;
  submitted_at?: string;
  processed_at?: string;
  reason?: string;
  can_request: boolean;
  gemini_analysis?: {
    recommendation: string;
    confidence: number;
    reasoning: string;
  };
}

const { width } = Dimensions.get('window');

const VerificationRequestForm: React.FC<VerificationRequestFormProps> = ({
  visible,
  onClose,
  onSuccess
}) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [requirements, setRequirements] = useState<VerificationRequirements>({});
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  
  // État du formulaire
  const [formData, setFormData] = useState({
    request_type: 'individual',
    public_impact: '',
    platform_impact: '',
    public_identification: '',
    notable_achievements: '',
    profession: '',
    organization: ''
  });

  // États pour l'affichage
  const [showRequirements, setShowRequirements] = useState(false);
  const [selectedType, setSelectedType] = useState('individual');

  useEffect(() => {
    if (visible) {
      console.log('🔍 Utilisateur connecté:', user);
      loadRequirements();
      loadVerificationStatus();
    }
  }, [visible, user]);

  const loadRequirements = async () => {
    try {
      console.log('🔍 Chargement des critères de vérification...');
      const response = await apiRequest.get('/api/verification/requirements', {}, false);
      console.log('📋 Réponse critères:', response);
      if (response.success) {
        setRequirements(response.data);
      }
    } catch (error) {
      console.error('❌ Erreur lors du chargement des critères:', error);
    }
  };

  const loadVerificationStatus = async () => {
    try {
      setLoadingStatus(true);
      console.log('🔍 Chargement du statut de vérification...');
      const response = await apiRequest.get('/api/verification/status', {}, true);
      console.log('📊 Réponse statut:', response);
      if (response.success) {
        setStatus(response.data);
      } else {
        // Fallback si l'API ne répond pas correctement
        console.log('⚠️ API ne répond pas correctement, utilisation du fallback');
        setStatus({
          has_request: false,
          can_request: true
        });
      }
    } catch (error) {
      console.error('❌ Erreur lors du chargement du statut:', error);
      // Fallback en cas d'erreur
      setStatus({
        has_request: false,
        can_request: true
      });
    } finally {
      setLoadingStatus(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const validateForm = (): boolean => {
    if (!formData.public_impact.trim()) {
      Alert.alert('Erreur', 'Répondez à la question: Pourquoi ce compte doit être vérifié ?');
      return false;
    }
    if (formData.public_impact.length < 8) {
      Alert.alert('Erreur', 'Réponse trop courte (minimum 8 caractères)');
      return false;
    }
    if (!formData.platform_impact.trim()) {
      Alert.alert('Erreur', 'Répondez à la question: Pourquoi ce compte est important sur twitninf ?');
      return false;
    }
    if (formData.platform_impact.length < 8) {
      Alert.alert('Erreur', 'Réponse trop courte (minimum 8 caractères)');
      return false;
    }
    if (!formData.public_identification.trim()) {
      Alert.alert('Erreur', 'Répondez à la question: Qui est ce compte sur twitninf ?');
      return false;
    }
    if (formData.public_identification.length < 8) {
      Alert.alert('Erreur', 'Réponse trop courte (minimum 8 caractères)');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    try {
      setLoading(true);
      const response = await apiRequest.post('/api/verification/request', formData, true);

      if (response.success) {
        const requestId = response.data.request_id;
        
        Alert.alert(
          'Demande soumise !',
          'Votre demande de vérification a été soumise avec succès. Elle est maintenant en cours de traitement par notre IA. Vous recevrez une notification une fois l\'analyse terminée.',
          [
            {
              text: 'OK',
              onPress: () => {
                onSuccess();
                onClose();
                // Optionnel: lancer un polling pour vérifier le statut
                if (requestId) {
                  startStatusPolling(requestId);
                }
              }
            }
          ]
        );
      } else {
        Alert.alert('Erreur', response.message || 'Erreur lors de la soumission de la demande');
      }
    } catch (error) {
      console.error('Erreur lors de la soumission:', error);
      Alert.alert('Erreur', 'Erreur lors de la soumission de la demande');
    } finally {
      setLoading(false);
    }
  };

  // Fonction pour vérifier le statut de la demande
  const startStatusPolling = (requestId: string) => {
    const checkStatus = async () => {
      try {
        const response = await apiRequest.get(`/api/verification/request/${requestId}`, true);
        if (response.success) {
          const status = response.data.status;
          if (status === 'approved' || status === 'rejected') {
            // Arrêter le polling et notifier l'utilisateur
            Alert.alert(
              status === 'approved' ? 'Demande approuvée !' : 'Demande rejetée',
              status === 'approved' 
                ? 'Félicitations ! Votre demande de vérification a été approuvée.'
                : `Votre demande a été rejetée. Raison: ${response.data.reason || 'Non spécifiée'}`,
              [{ text: 'OK' }]
            );
            return;
          }
          // Continuer le polling si la demande est encore en cours
          setTimeout(checkStatus, 30000); // Vérifier toutes les 30 secondes
        }
      } catch (error) {
        console.error('Erreur lors de la vérification du statut:', error);
      }
    };
    
    // Commencer le polling après 30 secondes
    setTimeout(checkStatus, 30000);
  };

  const renderRequestTypeSelector = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Type de demande</Text>
      <View style={styles.typeSelector}>
        {Object.entries(requirements).map(([key, req]) => (
          <TouchableOpacity
            key={key}
            style={[
              styles.typeOption,
              selectedType === key && styles.typeOptionSelected
            ]}
            onPress={() => {
              setSelectedType(key);
              handleInputChange('request_type', key);
            }}
          >
            <Text style={[
              styles.typeOptionText,
              selectedType === key && styles.typeOptionTextSelected
            ]}>
              {req.title}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderRequirementsModal = () => (
    <Modal
      visible={showRequirements}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Critères de vérification</Text>
          <TouchableOpacity
            onPress={() => setShowRequirements(false)}
            style={styles.closeButton}
          >
            <Ionicons name="close" size={24} color="#666" />
          </TouchableOpacity>
        </View>
        
        <ScrollView style={styles.modalContent}>
          {requirements[selectedType] && (
            <View style={styles.requirementSection}>
              <Text style={styles.requirementTitle}>
                {requirements[selectedType].title}
              </Text>
              <Text style={styles.requirementDescription}>
                {requirements[selectedType].description}
              </Text>
              
              <Text style={styles.criteriaTitle}>Critères requis :</Text>
              {requirements[selectedType].criteria.map((criterion, index) => (
                <Text key={index} style={styles.criterion}>
                  • {criterion}
                </Text>
              ))}
              
              <Text style={styles.criteriaTitle}>Documents requis :</Text>
              {requirements[selectedType].documents_required.map((doc, index) => (
                <Text key={index} style={styles.criterion}>
                  • {doc}
                </Text>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );

  const renderStatusInfo = () => {
    if (loadingStatus) {
      return (
        <View style={styles.statusContainer}>
          <ActivityIndicator size="small" color="#007AFF" />
          <Text style={styles.statusText}>Chargement du statut...</Text>
        </View>
      );
    }

    if (!status || !status.has_request) {
      return null;
    }

    const getStatusColor = (status: string) => {
      switch (status) {
        case 'approved': return '#34C759';
        case 'rejected': return '#FF3B30';
        case 'pending': return '#FF9500';
        case 'under_review': return '#007AFF';
        default: return '#8E8E93';
      }
    };

    const getStatusText = (status: string) => {
      switch (status) {
        case 'approved': return 'Approuvée ✅';
        case 'rejected': return 'Rejetée ❌';
        case 'pending': return 'En attente ⏳';
        case 'under_review': return 'En révision 🔍';
        default: return 'Inconnu';
      }
    };

    return (
      <View style={styles.statusContainer}>
        <View style={styles.statusHeader}>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(status.status!) }]}>
            <Text style={styles.statusBadgeText}>
              {getStatusText(status.status!)}
            </Text>
          </View>
          {status.gemini_analysis && (
            <View style={styles.aiAnalysis}>
              <Ionicons name="sparkles" size={16} color="#007AFF" />
              <Text style={styles.aiAnalysisText}>
                IA: {(status.gemini_analysis.confidence * 100).toFixed(0)}% de confiance
              </Text>
            </View>
          )}
        </View>
        
        {status.reason && (
          <Text style={styles.statusReason}>
            {status.reason}
          </Text>
        )}
        
        {status.gemini_analysis && (
          <Text style={styles.aiReasoning}>
            Analyse IA: {status.gemini_analysis.reasoning}
          </Text>
        )}
        
        <Text style={styles.statusDate}>
          Soumise le {new Date(status.submitted_at!).toLocaleDateString('fr-FR')}
        </Text>
      </View>
    );
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#666" />
          </TouchableOpacity>
          <Text style={styles.title}>Demande de vérification</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {renderStatusInfo()}
          
          {/* Debug info */}
          <View style={{ padding: 16, backgroundColor: '#f0f0f0', margin: 16, borderRadius: 8 }}>
            <Text style={{ fontSize: 12, color: '#666' }}>
              Debug: status={JSON.stringify(status)}, can_request={status?.can_request}
            </Text>
          </View>
          
          {true && (
            <>
              <View style={styles.infoBox}>
                <Ionicons name="information-circle" size={20} color="#007AFF" />
                <Text style={styles.infoText}>
                  La vérification sur twitninf confirme qu'un compte est authentique. Le processus est simple, mais reste sélectif.
                </Text>
              </View>

              {renderRequestTypeSelector()}

              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Pourquoi ce compte doit être vérifié ?</Text>
                  <TouchableOpacity
                    onPress={() => setShowRequirements(true)}
                    style={styles.helpButton}
                  >
                    <Ionicons name="help-circle" size={16} color="#007AFF" />
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={styles.textArea}
                  placeholder="Expliquez en quelques phrases pourquoi vous avez besoin de la vérification."
                  value={formData.public_impact}
                  onChangeText={(text) => handleInputChange('public_impact', text)}
                  multiline
                  numberOfLines={4}
                  maxLength={400}
                />
                <Text style={styles.characterCount}>
                  {formData.public_impact.length}/400 caractères
                </Text>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Pourquoi ce compte est important sur twitninf ?</Text>
                <TextInput
                  style={styles.textArea}
                  placeholder="Décrivez votre présence sur l'app et l'intérêt pour les autres utilisateurs."
                  value={formData.platform_impact}
                  onChangeText={(text) => handleInputChange('platform_impact', text)}
                  multiline
                  numberOfLines={3}
                  maxLength={300}
                />
                <Text style={styles.characterCount}>
                  {formData.platform_impact.length}/300 caractères
                </Text>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Qui est ce compte sur twitninf ?</Text>
                <TextInput
                  style={styles.textArea}
                  placeholder="Donnez des éléments concrets pour confirmer que ce compte est bien le vôtre."
                  value={formData.public_identification}
                  onChangeText={(text) => handleInputChange('public_identification', text)}
                  multiline
                  numberOfLines={3}
                  maxLength={300}
                />
                <Text style={styles.characterCount}>
                  {formData.public_identification.length}/300 caractères
                </Text>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Réalisations notables (optionnel)</Text>
                <TextInput
                  style={styles.textArea}
                  placeholder="Mentionnez vos réalisations, récompenses, publications, apparitions médiatiques, etc."
                  value={formData.notable_achievements}
                  onChangeText={(text) => handleInputChange('notable_achievements', text)}
                  multiline
                  numberOfLines={3}
                  maxLength={300}
                />
                <Text style={styles.characterCount}>
                  {formData.notable_achievements.length}/300 caractères
                </Text>
              </View>

              {(selectedType === 'brand' || selectedType === 'organization') && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Nom de l'organisation</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Nom officiel de votre organisation"
                    value={formData.organization}
                    onChangeText={(text) => handleInputChange('organization', text)}
                    maxLength={100}
                  />
                </View>
              )}

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Profession (optionnel)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Votre profession ou domaine d'activité"
                  value={formData.profession}
                  onChangeText={(text) => handleInputChange('profession', text)}
                  maxLength={100}
                />
              </View>

              <TouchableOpacity
                style={[styles.submitButton, loading && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                    <Text style={styles.submitButtonText}>Soumettre la demande</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}

          {status?.has_request && status.can_request === false && (
            <View style={styles.statusMessage}>
              <Ionicons name="time" size={48} color="#FF9500" />
              <Text style={styles.statusMessageTitle}>
                Demande en cours de traitement
              </Text>
              <Text style={styles.statusMessageText}>
                Votre demande de vérification est actuellement en cours de traitement. 
                Vous recevrez une notification dès qu'une décision sera prise.
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
      
      {renderRequirementsModal()}
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA'
  },
  closeButton: {
    padding: 4
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000'
  },
  content: {
    flex: 1,
    paddingHorizontal: 16
  },
  statusContainer: {
    backgroundColor: '#F2F2F7',
    padding: 16,
    borderRadius: 12,
    marginVertical: 16
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16
  },
  statusBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600'
  },
  aiAnalysis: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  aiAnalysisText: {
    marginLeft: 4,
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '500'
  },
  statusReason: {
    fontSize: 14,
    color: '#666666',
    marginBottom: 8
  },
  aiReasoning: {
    fontSize: 12,
    color: '#007AFF',
    fontStyle: 'italic',
    marginBottom: 8
  },
  statusDate: {
    fontSize: 12,
    color: '#8E8E93'
  },
  statusText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#666666'
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#E3F2FD',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20
  },
  infoText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: '#1976D2',
    lineHeight: 20
  },
  section: {
    marginBottom: 24
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 12
  },
  helpButton: {
    padding: 4
  },
  typeSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  typeOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F2F2F7',
    borderWidth: 1,
    borderColor: '#E5E5EA'
  },
  typeOptionSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF'
  },
  typeOptionText: {
    fontSize: 14,
    color: '#666666',
    fontWeight: '500'
  },
  typeOptionTextSelected: {
    color: '#FFFFFF'
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#FFFFFF'
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
    textAlignVertical: 'top'
  },
  characterCount: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'right',
    marginTop: 4
  },
  submitButton: {
    backgroundColor: '#007AFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 32
  },
  submitButtonDisabled: {
    backgroundColor: '#C7C7CC'
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8
  },
  statusMessage: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20
  },
  statusMessageTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    marginTop: 16,
    marginBottom: 8
  },
  statusMessageText: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 20
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF'
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA'
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000'
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 16
  },
  requirementSection: {
    paddingVertical: 20
  },
  requirementTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 8
  },
  requirementDescription: {
    fontSize: 16,
    color: '#666666',
    lineHeight: 24,
    marginBottom: 20
  },
  criteriaTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginTop: 16,
    marginBottom: 8
  },
  criterion: {
    fontSize: 14,
    color: '#666666',
    lineHeight: 20,
    marginBottom: 4
  }
});

export default VerificationRequestForm;
