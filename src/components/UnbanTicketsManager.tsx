import { fonts } from '../theme';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Dimensions,
  ActivityIndicator,
  TextInput,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useAdminPermissions } from '../hooks/useAdminPermissions';
import { moderationService } from '../services/moderationService';

const { width: screenWidth } = Dimensions.get('window');

interface UnbanTicketsManagerProps {
  onClose: () => void;
}

const COLORS = {
  primary: '#4F7CFF',
  secondary: '#667eea',
  success: '#43e97b',
  warning: '#ffc107',
  danger: '#ff6b6b',
  bgPrimary: '#0B0C0F',
  bgSecondary: '#15171C',
  textPrimary: '#ffffff',
  textSecondary: '#cbd5e0',
  textMuted: '#9BA1AC',
  glassBorder: 'rgba(255, 255, 255, 0.1)',
  glassBackground: 'rgba(255, 255, 255, 0.05)',
};

const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
};

export default function UnbanTicketsManager({ onClose }: UnbanTicketsManagerProps) {
  const { isAdmin, isSuperAdmin } = useAdminPermissions();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [adminNotes, setAdminNotes] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [actionType, setActionType] = useState<'approved' | 'rejected' | null>(null);

  useEffect(() => {
    loadTickets();
  }, [filter]);

  const loadTickets = async () => {
    try {
      setLoading(true);
      const data = await moderationService.getUnbanTickets(filter);
      setTickets(data || []);
    } catch (error) {
      console.error('❌ Erreur chargement tickets:', error);
      Alert.alert('Erreur', 'Impossible de charger les tickets d\'unban');
    } finally {
      setLoading(false);
    }
  };

  const handleProcess = (ticket: any, type: 'approved' | 'rejected') => {
    setSelectedTicket(ticket);
    setActionType(type);
    setAdminNotes('');
    setShowNotesModal(true);
  };

  const submitProcess = async () => {
    if (!selectedTicket || !actionType) return;

    setProcessing(selectedTicket.id);
    try {
      const success = await moderationService.processUnbanTicket(
        selectedTicket.id,
        actionType,
        adminNotes
      );

      if (success) {
        Alert.alert('Succès', `Le ticket a été ${actionType === 'approved' ? 'approuvé' : 'rejeté'}.`);
        setShowNotesModal(false);
        loadTickets();
      } else {
        Alert.alert('Erreur', 'Une erreur est survenue lors du traitement.');
      }
    } catch (error) {
      Alert.alert('Erreur', 'Une erreur est survenue.');
    } finally {
      setProcessing(null);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Date inconnue';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.bgPrimary, COLORS.bgSecondary]}
        style={styles.gradient}
      >
        {/* Header */}
        <BlurView intensity={40} style={styles.header}>
          <View style={styles.headerContent}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <LinearGradient
                colors={[`${COLORS.primary}30`, `${COLORS.primary}10`]}
                style={styles.closeButtonGradient}
              >
                <Ionicons name="close" size={24} color={COLORS.primary} />
              </LinearGradient>
            </TouchableOpacity>
            
            <View style={styles.headerInfo}>
              <Text style={styles.title}>Demandes d'Unban</Text>
              <Text style={styles.subtitle}>
                {tickets.length} ticket(s) {filter === 'pending' ? 'en attente' : filter === 'approved' ? 'approuvés' : 'rejetés'}
              </Text>
            </View>
          </View>
        </BlurView>

        {/* Filtres */}
        <View style={styles.filtersContainer}>
          <View style={styles.filterRow}>
            {(['pending', 'approved', 'rejected'] as const).map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.filterButton, filter === f && styles.filterButtonActive]}
                onPress={() => setFilter(f)}
              >
                <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                  {f === 'pending' ? 'En attente' : f === 'approved' ? 'Approuvés' : 'Rejetés'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Liste */}
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : (
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {tickets.length === 0 ? (
              <View style={styles.centerContainer}>
                <Ionicons name="mail-open-outline" size={64} color={COLORS.textMuted} />
                <Text style={styles.emptyText}>Aucun ticket trouvé</Text>
              </View>
            ) : (
              tickets.map((ticket) => (
                <View key={ticket.id} style={styles.ticketCard}>
                  <View style={styles.ticketHeader}>
                    <Text style={styles.username}>@{ticket.user?.username || 'Inconnu'}</Text>
                    <Text style={styles.date}>{formatDate(ticket.createdAt)}</Text>
                  </View>
                  
                  <Text style={styles.reasonTitle}>Raison de la demande :</Text>
                   <Text style={styles.reasonText}>{ticket.reason}</Text>

                  {ticket.user?.is_suspended && (
                    <View style={styles.currentBanInfo}>
                      <Text style={styles.currentBanTitle}>🚫 Statut actuel : Suspendu</Text>
                      <Text style={styles.currentBanReason}>Raison initiale : {ticket.user.suspension_reason || 'Non spécifiée'}</Text>
                    </View>
                  )}

                  {ticket.status !== 'pending' && (
                    <View style={styles.processedInfo}>
                      <Text style={styles.adminNotesTitle}>Notes de modération :</Text>
                      <Text style={styles.adminNotes}>{ticket.admin_notes || 'Aucune note'}</Text>
                      <Text style={styles.processedBy}>Par {ticket.processor?.username || 'Admin'}</Text>
                    </View>
                  )}

                  {ticket.status === 'pending' && (
                    <View style={styles.actions}>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.approveBtn]}
                        onPress={() => handleProcess(ticket, 'approved')}
                        disabled={processing === ticket.id}
                      >
                        <Ionicons name="checkmark-circle" size={18} color="#fff" />
                        <Text style={styles.actionBtnText}>Approuver</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.actionBtn, styles.rejectBtn]}
                        onPress={() => handleProcess(ticket, 'rejected')}
                        disabled={processing === ticket.id}
                      >
                        <Ionicons name="close-circle" size={18} color="#fff" />
                        <Text style={styles.actionBtnText}>Rejeter</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))
            )}
          </ScrollView>
        )}
      </LinearGradient>

      {/* Modal pour les notes d'admin */}
      <Modal
        visible={showNotesModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowNotesModal(false)}
      >
        <View style={styles.modalOverlay}>
          <BlurView intensity={60} style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {actionType === 'approved' ? 'Approuver' : 'Rejeter'} la demande
            </Text>
            <Text style={styles.modalSubtitle}>Ajoutez une note pour l'utilisateur (optionnel)</Text>
            
            <TextInput
              style={styles.notesInput}
              placeholder="Notes de modération..."
              placeholderTextColor="rgba(255,255,255,0.4)"
              multiline
              value={adminNotes}
              onChangeText={setAdminNotes}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowNotesModal(false)}
              >
                <Text style={styles.modalCancelText}>Annuler</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalSubmitBtn,
                  { backgroundColor: actionType === 'approved' ? COLORS.success : COLORS.danger }
                ]}
                onPress={submitProcess}
                disabled={processing !== null}
              >
                {processing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalSubmitText}>Confirmer</Text>
                )}
              </TouchableOpacity>
            </View>
          </BlurView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  gradient: { flex: 1 },
  header: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
    borderRadius: 20,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.glassBackground,
  },
  headerContent: { flexDirection: 'row', alignItems: 'center' },
  closeButton: { marginRight: SPACING.lg },
  closeButtonGradient: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: `${COLORS.primary}30`,
  },
  headerInfo: { flex: 1 },
  title: { fontSize: 22, fontWeight: 'bold', fontFamily: fonts.bold, color: '#fff' },
  subtitle: { fontSize: 13, color: COLORS.textMuted },
  filtersContainer: { paddingHorizontal: SPACING.lg, marginBottom: SPACING.md },
  filterRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderRadius: 12,
    padding: 4,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
  },
  filterButtonActive: {
    backgroundColor: COLORS.primary,
  },
  filterText: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600' },
  filterTextActive: { color: '#fff' },
  list: { flex: 1, paddingHorizontal: SPACING.lg },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: COLORS.textMuted, marginTop: 12, fontSize: 16 },
  ticketCard: {
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  ticketHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  username: { color: COLORS.primary, fontWeight: 'bold', fontFamily: fonts.bold, fontSize: 16 },
  date: { color: COLORS.textMuted, fontSize: 12 },
  reasonTitle: { color: '#fff', fontSize: 14, fontWeight: '600', fontFamily: fonts.semibold, marginBottom: 4 },
  reasonText: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 12 },
  processedInfo: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  adminNotesTitle: { color: '#fff', fontSize: 13, fontWeight: '600', fontFamily: fonts.semibold, marginBottom: 4 },
  adminNotes: { color: COLORS.textMuted, fontSize: 13, fontStyle: 'italic', marginBottom: 4 },
  processedBy: { color: COLORS.primary, fontSize: 11, alignSelf: 'flex-end' },
  currentBanInfo: {
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.danger,
  },
  currentBanTitle: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: 'bold', fontFamily: fonts.bold,
    marginBottom: 2,
  },
  currentBanReason: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontStyle: 'italic',
  },
  actions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  approveBtn: { backgroundColor: COLORS.success },
  rejectBtn: { backgroundColor: COLORS.danger },
  actionBtnText: { color: '#fff', fontWeight: 'bold', fontFamily: fonts.bold, fontSize: 13 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', fontFamily: fonts.bold, marginBottom: 8 },
  modalSubtitle: { color: COLORS.textMuted, fontSize: 14, marginBottom: 16 },
  notesInput: {
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderRadius: 12,
    padding: 12,
    color: '#fff',
    minHeight: 100,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 20,
  },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalCancelBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  modalCancelText: { color: COLORS.textMuted, fontWeight: '600' },
  modalSubmitBtn: { flex: 2, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  modalSubmitText: { color: '#fff', fontWeight: 'bold' },
});
