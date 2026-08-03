/**
 * 📋 Bouton de demande de vérification
 * Affiche le statut de vérification et permet de faire une demande
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/contexts/AuthContext';
import apiRequest from '../src/services/api';

interface VerificationButtonProps {
  onPress: () => void;
  style?: any;
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

const VerificationButton: React.FC<VerificationButtonProps> = ({
  onPress,
  style
}) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<VerificationStatus | null>(null);

  useEffect(() => {
    loadVerificationStatus();
  }, []);

  const loadVerificationStatus = async () => {
    try {
      setLoading(true);
      const response = await apiRequest.get('/api/verification/status', {}, true);
      if (response.success) {
        setStatus(response.data);
      }
    } catch (error) {
      console.error('Erreur lors du chargement du statut:', error);
    } finally {
      setLoading(false);
    }
  };

  const getButtonContent = () => {
    if (user?.verified) {
      return {
        icon: 'checkmark-circle' as const,
        text: 'Compte vérifié',
        color: '#34C759',
        backgroundColor: '#E8F5E8',
        disabled: true
      };
    }

    if (loading) {
      return {
        icon: 'hourglass' as const,
        text: 'Chargement...',
        color: '#8E8E93',
        backgroundColor: '#F2F2F7',
        disabled: true
      };
    }

    if (!status || !status.has_request) {
      return {
        icon: 'shield-checkmark' as const,
        text: 'Demander la vérification',
        color: '#007AFF',
        backgroundColor: '#E3F2FD',
        disabled: false
      };
    }

    switch (status.status) {
      case 'approved':
        return {
          icon: 'checkmark-circle' as const,
          text: 'Demande approuvée',
          color: '#34C759',
          backgroundColor: '#E8F5E8',
          disabled: true
        };
      case 'rejected':
        return {
          icon: 'close-circle' as const,
          text: 'Demande rejetée',
          color: '#FF3B30',
          backgroundColor: '#FFEBEE',
          disabled: false,
          showRetry: true
        };
      case 'pending':
        return {
          icon: 'time' as const,
          text: 'Demande en attente',
          color: '#FF9500',
          backgroundColor: '#FFF3E0',
          disabled: true
        };
      case 'under_review':
        return {
          icon: 'search' as const,
          text: 'En révision manuelle',
          color: '#007AFF',
          backgroundColor: '#E3F2FD',
          disabled: true
        };
      default:
        return {
          icon: 'shield-checkmark' as const,
          text: 'Demander la vérification',
          color: '#007AFF',
          backgroundColor: '#E3F2FD',
          disabled: false
        };
    }
  };

  const handlePress = () => {
    const buttonContent = getButtonContent();
    
    if (buttonContent.disabled && !buttonContent.showRetry) {
      return;
    }

    if (status?.status === 'rejected') {
      Alert.alert(
        'Demande rejetée',
        status.reason || 'Votre demande de vérification a été rejetée.',
        [
          {
            text: 'Annuler',
            style: 'cancel'
          },
          {
            text: 'Nouvelle demande',
            onPress: onPress
          }
        ]
      );
    } else {
      onPress();
    }
  };

  const buttonContent = getButtonContent();

  return (
    <TouchableOpacity
      style={[
        styles.container,
        { backgroundColor: buttonContent.backgroundColor },
        style
      ]}
      onPress={handlePress}
      disabled={buttonContent.disabled && !buttonContent.showRetry}
    >
      <View style={styles.content}>
        <View style={styles.leftSection}>
          <Ionicons
            name={buttonContent.icon}
            size={24}
            color={buttonContent.color}
          />
          <View style={styles.textContainer}>
            <Text style={[styles.title, { color: buttonContent.color }]}>
              {buttonContent.text}
            </Text>
            {status?.has_request && status.status && (
              <Text style={styles.subtitle}>
                {status.status === 'approved' && 'Votre compte est maintenant vérifié'}
                {status.status === 'rejected' && 'Cliquez pour faire une nouvelle demande'}
                {status.status === 'pending' && 'Traitement automatique en cours...'}
                {status.status === 'under_review' && 'Notre équipe examine votre demande'}
              </Text>
            )}
            {status?.gemini_analysis && (
              <View style={styles.aiIndicator}>
                <Ionicons name="sparkles" size={12} color="#007AFF" />
                <Text style={styles.aiText}>
                  IA: {(status.gemini_analysis.confidence * 100).toFixed(0)}% confiance
                </Text>
              </View>
            )}
          </View>
        </View>
        
        {!buttonContent.disabled && (
          <Ionicons
            name="chevron-forward"
            size={20}
            color={buttonContent.color}
          />
        )}
        
        {buttonContent.showRetry && (
          <Ionicons
            name="refresh"
            size={20}
            color={buttonContent.color}
          />
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    marginVertical: 8,
    overflow: 'hidden'
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },
  textContainer: {
    marginLeft: 12,
    flex: 1
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2
  },
  subtitle: {
    fontSize: 12,
    color: '#666666',
    marginBottom: 4
  },
  aiIndicator: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  aiText: {
    fontSize: 10,
    color: '#007AFF',
    marginLeft: 4,
    fontWeight: '500'
  }
});

export default VerificationButton;
