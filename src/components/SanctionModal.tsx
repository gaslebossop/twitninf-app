import { fonts , colors} from '../theme';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { toast } from './ui/Toast';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Constantes de design cohérentes avec l'app
const COLORS = {
  primary: '#4F7CFF',
  secondary: '#3D63D9',
  accent: '#3354C4',
  bgPrimary: '#0B0C0F',
  bgSecondary: '#15171C',
  bgTertiary: '#1B1E25',
  textPrimary: '#ffffff',
  textSecondary: '#cbd5e0',
  textMuted: '#9BA1AC',
  success: '#43e97b',
  error: '#ff4757',
  warning: '#ffa502',
  glassBorder: colors.overlayMedium,
  glassBackground: colors.overlaySoft,
};

const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
};

const TYPOGRAPHY = {
  h1: { fontSize: 28, fontWeight: '700' as const, lineHeight: 36 },
  h2: { fontSize: 24, fontWeight: '600' as const, lineHeight: 32 },
  h3: { fontSize: 20, fontWeight: '600' as const, lineHeight: 28 },
  body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
  caption: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
  small: { fontSize: 12, fontWeight: '400' as const, lineHeight: 16 },
};

interface SanctionModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (sanction: SanctionData) => void;
  user: {
    id: string;
    username: string;
    fullName: string;
    avatar?: string;
  };
  sanctionType: 'ban' | 'suspend';
}

export interface SanctionData {
  type: 'ban' | 'suspend';
  duration: number;
  reason: string;
  permanent: boolean;
}

// Options de durée pour les suspensions (en heures)
const DURATION_OPTIONS = [
  { label: '1 heure', value: 1, icon: 'time-outline' },
  { label: '6 heures', value: 6, icon: 'time-outline' },
  { label: '12 heures', value: 12, icon: 'time-outline' },
  { label: '1 jour', value: 24, icon: 'calendar-outline' },
  { label: '3 jours', value: 72, icon: 'calendar-outline' },
  { label: '1 semaine', value: 168, icon: 'calendar-outline' },
  { label: '2 semaines', value: 336, icon: 'calendar-outline' },
  { label: '1 mois', value: 720, icon: 'calendar-outline' },
  { label: '3 mois', value: 2160, icon: 'calendar-outline' },
  { label: '6 mois', value: 4320, icon: 'calendar-outline' },
  { label: '1 an', value: 8760, icon: 'calendar-outline' },
  { label: 'Permanent', value: -1, icon: 'infinite-outline' },
];

const REASON_OPTIONS = [
  { label: 'Spam/Publicité', value: 'Spam/Pub', icon: 'megaphone-outline' },
  { label: 'Harcèlement', value: 'Harcèlement', icon: 'warning-outline' },
  { label: 'Contenu inapproprié', value: 'Contenu inapproprié', icon: 'eye-off-outline' },
  { label: 'Violation copyright', value: 'Violation copyright', icon: 'shield-outline' },
  { label: 'Fausses informations', value: 'Fausses infos', icon: 'information-circle-outline' },
  { label: 'Comportement toxique', value: 'Comportement toxique', icon: 'skull-outline' },
  { label: 'Violation des règles', value: 'Violation règles', icon: 'document-text-outline' },
  { label: 'Compte fake', value: 'Compte fake', icon: 'person-remove-outline' },
  { label: 'Autre', value: 'Autre', icon: 'ellipsis-horizontal-outline' },
];

export default function SanctionModal({ visible, onClose, onConfirm, user, sanctionType }: SanctionModalProps) {
  const [duration, setDuration] = useState(168); // 1 semaine par défaut
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [permanent, setPermanent] = useState(false);

  useEffect(() => {
    if (visible) {
      console.log('🔍 Modal ouvert pour:', user?.username, 'Type:', sanctionType);
      setDuration(168);
      setReason('');
      setCustomReason('');
      setPermanent(false);
    }
  }, [visible, user, sanctionType]);

  const handleConfirm = () => {
    console.log('🔍 Tentative de confirmation avec:', { duration, reason, customReason, permanent });
    
    if (!reason && !customReason.trim()) {
      toast.error('Veuillez sélectionner ou saisir un motif');
      return;
    }

    if (reason === 'Autre' && !customReason.trim()) {
      toast.error('Veuillez préciser le motif');
      return;
    }

    const finalReason = reason === 'Autre' ? customReason : reason;
    const finalPermanent = sanctionType === 'ban' ? true : permanent;
    const finalDuration = finalPermanent ? -1 : duration;

    console.log('🔍 Confirmation avec:', { type: sanctionType, duration: finalDuration, reason: finalReason, permanent: finalPermanent });

    onConfirm({
      type: sanctionType,
      duration: finalDuration,
      reason: finalReason,
      permanent: finalPermanent,
    });
  };

  const getSanctionIcon = () => {
    return sanctionType === 'ban' ? 'ban' : 'time';
  };

  const getSanctionColor = () => {
    return sanctionType === 'ban' ? COLORS.error : COLORS.warning;
  };

  const getSanctionTitle = () => {
    return sanctionType === 'ban' ? 'Bannir l\'utilisateur' : 'Suspendre l\'utilisateur';
  };

  const getSanctionDescription = () => {
    return sanctionType === 'ban' 
      ? 'Cette action bannira définitivement l\'utilisateur'
      : 'Cette action suspendra temporairement l\'utilisateur';
  };

  const getSanctionGradient = () => {
    return sanctionType === 'ban' 
      ? [COLORS.error, '#ff3838'] as const
      : [COLORS.warning, '#ff6b6b'] as const;
  };

  // Calculer la taille adaptative
  const modalWidth = Math.min(screenWidth * 0.9, 400);
  const maxHeight = screenHeight * 0.8;

  if (!visible) return null;

  console.log('🔍 Rendu du modal, visible:', visible, 'user:', user?.username);

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        {/* Backdrop */}
        <TouchableOpacity 
          style={styles.backdrop} 
          activeOpacity={1} 
          onPress={onClose}
        />
        
        {/* Modal Content */}
        <KeyboardAvoidingView
          style={[styles.modalContainer, { width: modalWidth, maxHeight }]}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <View style={[styles.iconContainer, { backgroundColor: getSanctionColor() + '20' }]}>
                <Ionicons 
                  name={getSanctionIcon()} 
                  size={24} 
                  color={getSanctionColor()} 
                />
              </View>
              <View style={styles.headerText}>
                <Text style={[styles.title, TYPOGRAPHY.h2]}>
                  {getSanctionTitle()}
                </Text>
                <Text style={[styles.subtitle, TYPOGRAPHY.caption]}>
                  {getSanctionDescription()}
                </Text>
              </View>
            </View>
            
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={24} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* User Info */}
          <View style={styles.userSection}>
            <View style={styles.userAvatar}>
              <Ionicons name="person" size={32} color={COLORS.primary} />
            </View>
            <View style={styles.userInfo}>
              <Text style={[styles.userName, TYPOGRAPHY.h3]} numberOfLines={1}>
                {user?.fullName || user?.username || 'Utilisateur'}
              </Text>
              <Text style={[styles.userHandle, TYPOGRAPHY.caption]} numberOfLines={1}>
                @{user?.username || 'username'}
              </Text>
            </View>
          </View>

          {/* Content */}
          <ScrollView
            style={styles.content}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.contentContainer}
            keyboardShouldPersistTaps="handled"
          >
            {/* Duration Selection - Only for suspensions */}
            {sanctionType === 'suspend' && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, TYPOGRAPHY.h3]}>
                  Durée de suspension
                </Text>
                
                <View style={styles.durationGrid}>
                  {DURATION_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.durationOption,
                        duration === option.value && styles.selectedDurationOption,
                      ]}
                      onPress={() => {
                        setDuration(option.value);
                        setPermanent(option.value === -1);
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons 
                        name={option.icon as any} 
                        size={16} 
                        color={duration === option.value ? COLORS.primary : COLORS.textSecondary} 
                      />
                      <Text style={[
                        styles.durationText,
                        TYPOGRAPHY.small,
                        duration === option.value && styles.selectedDurationText,
                      ]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Reason Selection */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, TYPOGRAPHY.h3]}>
                Motif de la sanction
              </Text>
              
              <View style={styles.reasonGrid}>
                {REASON_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.reasonOption,
                      reason === option.value && styles.selectedReasonOption,
                    ]}
                    onPress={() => setReason(option.value)}
                    activeOpacity={0.7}
                  >
                    <Ionicons 
                      name={option.icon as any} 
                      size={16} 
                      color={reason === option.value ? COLORS.primary : COLORS.textSecondary} 
                    />
                    <Text style={[
                      styles.reasonText,
                      TYPOGRAPHY.small,
                      reason === option.value && styles.selectedReasonText,
                    ]} numberOfLines={2}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {reason === 'Autre' && (
                <View style={styles.customReasonContainer}>
                  <TextInput
                    style={[styles.customReasonInput, TYPOGRAPHY.body]}
                    placeholder="Précisez le motif de la sanction..."
                    placeholderTextColor={COLORS.textMuted}
                    value={customReason}
                    onChangeText={setCustomReason}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                </View>
              )}
            </View>

            {/* Warning */}
            <View style={styles.warningContainer}>
              <Ionicons name="warning" size={20} color={COLORS.warning} />
              <Text style={[styles.warningText, TYPOGRAPHY.caption]}>
                Cette action sera enregistrée dans l'historique de modération et peut être réversible.
              </Text>
            </View>
          </ScrollView>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <Text style={[styles.cancelButtonText, TYPOGRAPHY.body]}>
                Annuler
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.confirmButton}
              onPress={handleConfirm}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={getSanctionGradient()}
                style={styles.confirmButtonGradient}
              >
                <Ionicons 
                  name={getSanctionIcon()} 
                  size={20} 
                  color="#ffffff" 
                />
                <Text style={[styles.confirmButtonText, TYPOGRAPHY.body]}>
                  {sanctionType === 'ban' ? 'Bannir' : 'Suspendre'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContainer: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    marginHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.glassBorder,
    backgroundColor: COLORS.bgSecondary,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  headerText: {
    flex: 1,
  },
  title: {
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    color: COLORS.textSecondary,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.glassBackground,
  },
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.glassBackground,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    borderRadius: 12,
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.bgTertiary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  userHandle: {
    color: COLORS.textSecondary,
  },
  content: {
    maxHeight: 400,
  },
  contentContainer: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  durationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  durationOption: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    borderRadius: 8,
    backgroundColor: COLORS.glassBackground,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  selectedDurationOption: {
    backgroundColor: COLORS.primary + '20',
    borderColor: COLORS.primary,
  },
  durationText: {
    color: COLORS.textSecondary,
    marginLeft: SPACING.sm,
    flex: 1,
  },
  selectedDurationText: {
    color: COLORS.primary,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  reasonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  reasonOption: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    borderRadius: 8,
    backgroundColor: COLORS.glassBackground,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  selectedReasonOption: {
    backgroundColor: COLORS.primary + '20',
    borderColor: COLORS.primary,
  },
  reasonText: {
    color: COLORS.textSecondary,
    marginLeft: SPACING.sm,
    flex: 1,
  },
  selectedReasonText: {
    color: COLORS.primary,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  customReasonContainer: {
    marginTop: SPACING.md,
  },
  customReasonInput: {
    backgroundColor: COLORS.glassBackground,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    color: COLORS.textPrimary,
    minHeight: 80,
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.warning + '10',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.warning + '30',
  },
  warningText: {
    color: COLORS.textSecondary,
    marginLeft: SPACING.sm,
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.glassBorder,
    gap: SPACING.md,
    backgroundColor: COLORS.bgSecondary,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: 12,
    backgroundColor: COLORS.glassBackground,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: COLORS.textSecondary,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  confirmButton: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  confirmButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  confirmButtonText: {
    color: '#ffffff',
    fontWeight: '600', fontFamily: fonts.semibold,
    marginLeft: SPACING.sm,
  },
});