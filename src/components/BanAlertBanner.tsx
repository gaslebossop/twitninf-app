import { fonts , colors} from '../theme';
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { moderationService } from '../services/moderationService';
import { toast } from './ui/Toast';

interface BanAlertBannerProps {
  onDismiss?: () => void;
}

export default function BanAlertBanner({ onDismiss }: BanAlertBannerProps) {
  const { isUserBanned, isUserSuspended, banInfo, user } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isPolicierCongo = user?.username === 'policiercongo';

  const handleSubmit = async () => {
    if (reason.length < 10) {
      toast.error('Veuillez fournir une explication plus détaillée (min 10 caractères).');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await moderationService.submitUnbanTicket(reason);
      if (result.success) {
        toast.success('Votre demande de débannissement a été envoyée avec succès.');
        setShowModal(false);
        setReason('');
      } else {
        toast.error(result.message || 'Une erreur est survenue.');
      }
    } catch (error: any) {
      toast.error(error.message || 'Une erreur est survenue lors de l\'envoi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Si l'utilisateur n'est ni banni ni suspendu, ne rien afficher
  if (!isUserBanned && !isUserSuspended) {
    return null;
  }

  const getBanInfo = () => {
    if (isUserBanned) {
      return {
        icon: 'warning',
        color: '#ff6b6b',
        title: 'Compte banni définitivement',
        message: 'Votre compte a été banni pour violations répétées',
        backgroundColor: 'rgba(255, 107, 107, 0.15)',
        borderColor: 'rgba(255, 107, 107, 0.4)'
      };
    } else if (isUserSuspended) {
      return {
        icon: 'information-circle',
        color: '#ffd93d',
        title: 'Compte temporairement suspendu',
        message: `Suspendu jusqu'au ${banInfo?.suspended_until ? new Date(banInfo.suspended_until).toLocaleDateString('fr-FR') : 'date indéterminée'}`,
        backgroundColor: 'rgba(255, 217, 61, 0.15)',
        borderColor: 'rgba(255, 217, 61, 0.4)'
      };
    }
    return null;
  };

  const banInfoData = getBanInfo();
  if (!banInfoData) return null;

  return (
    <View style={[styles.container, { backgroundColor: banInfoData.backgroundColor, borderColor: banInfoData.borderColor }]}>
      <View style={styles.content}>
        <Ionicons name={banInfoData.icon as any} size={20} color={banInfoData.color} />
        <View style={styles.textContainer}>
          <Text style={[styles.title, { color: banInfoData.color }]}>{banInfoData.title}</Text>
          <Text style={[styles.message, { color: banInfoData.color }]}>{banInfoData.message}</Text>
          {banInfo?.suspension_reason && (
            <Text style={styles.reason}>Raison: {banInfo.suspension_reason}</Text>
          )}
        </View>
      </View>
      
      <View style={styles.actions}>
        <TouchableOpacity 
          style={styles.unbanButton} 
          onPress={() => setShowModal(true)}
        >
          <Text style={[styles.unbanButtonText, { color: banInfoData.color }]}>Demander l'unban</Text>
        </TouchableOpacity>

        {onDismiss && (
          <TouchableOpacity onPress={onDismiss} style={styles.dismissButton}>
            <Ionicons name="close" size={20} color={banInfoData.color} />
          </TouchableOpacity>
        )}
      </View>

      <Modal
        visible={showModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Demande de débannissement</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Expliquez pourquoi nous devrions réactiver votre compte.
            </Text>

            <TextInput
              style={styles.textInput}
              placeholder="Votre explication..."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={6}
              value={reason}
              onChangeText={setReason}
              textAlignVertical="top"
            />

            {isPolicierCongo && (
              <Text style={styles.policierNote}>
                Note: En tant que PolicierCongo, vous n'avez aucune limite de caractères.
              </Text>
            )}

            <TouchableOpacity 
              style={[styles.submitButton, isSubmitting && styles.disabledButton]}
              onPress={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>Envoyer la demande</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  textContainer: {
    marginLeft: 12,
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: 'bold', fontFamily: fonts.bold,
    marginBottom: 2,
  },
  message: {
    fontSize: 13,
    color: '#cfefff',
    lineHeight: 18,
  },
  reason: {
    fontSize: 12,
    color: '#8899a6',
    marginTop: 2,
    fontStyle: 'italic',
  },
  dismissButton: {
    padding: 4,
    marginLeft: 8,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  unbanButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.overlayStrong,
    backgroundColor: colors.overlayMedium,
  },
  unbanButtonText: {
    fontSize: 12,
    fontWeight: 'bold', fontFamily: fonts.bold,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#15202b',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.overlayMedium,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold', fontFamily: fonts.bold,
    color: '#fff',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#8899a6',
    marginBottom: 12,
  },
  textInput: {
    backgroundColor: colors.overlayMedium,
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 15,
    minHeight: 120,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.overlayMedium,
  },
  policierNote: {
    fontSize: 12,
    color: '#4F7CFF',
    fontStyle: 'italic',
    marginBottom: 16,
  },
  submitButton: {
    backgroundColor: '#4F7CFF',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold', fontFamily: fonts.bold,
  },
  disabledButton: {
    opacity: 0.6,
  },
});
