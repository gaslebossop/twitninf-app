import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, ActivityIndicator, RefreshControl } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppHeader, ScreenBackground, EmptyState, promptAsync } from '../components/ui';
import { toast } from '../components/ui/Toast';
import { colors, fonts, radius, statusBarStyle } from '../theme';
import { moderationService } from '../services/moderationService';

interface UnbanTicketsScreenProps {
  navigation: any;
}

type Filter = 'pending' | 'approved' | 'rejected';

function formatDate(dateString: string) {
  if (!dateString) return 'Date inconnue';
  return new Date(dateString).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const UnbanTicketsScreen: React.FC<UnbanTicketsScreenProps> = ({ navigation }) => {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('pending');

  const load = useCallback(async () => {
    try {
      const data = await moderationService.getUnbanTickets(filter);
      setTickets(data || []);
    } catch {
      toast.error('Impossible de charger les tickets d\'unban');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  const handleProcess = async (ticket: any, decision: 'approved' | 'rejected') => {
    const notes = await promptAsync({
      title: decision === 'approved' ? 'Approuver la demande' : 'Rejeter la demande',
      message: `Ajoutez une note pour @${ticket.user?.username || 'cet utilisateur'} (optionnel)`,
      placeholder: 'Notes de modération...',
      multiline: true,
      required: false,
      confirmLabel: decision === 'approved' ? 'Approuver' : 'Rejeter',
      destructive: decision === 'rejected',
    });
    if (notes === null) return;

    setProcessing(ticket.id);
    try {
      const success = await moderationService.processUnbanTicket(ticket.id, decision, notes);
      if (success) {
        toast.success(`Le ticket a été ${decision === 'approved' ? 'approuvé' : 'rejeté'}.`);
        load();
      } else {
        toast.error('Une erreur est survenue lors du traitement.');
      }
    } catch {
      toast.error('Une erreur est survenue.');
    } finally {
      setProcessing(null);
    }
  };

  return (
    <ScreenBackground>
      <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
      <AppHeader navigation={navigation} title="Tickets de déban" subtitle={`${tickets.length} ticket(s) ${filter === 'pending' ? 'en attente' : filter === 'approved' ? 'approuvés' : 'rejetés'}`} />

      <View style={styles.filterRow}>
        {(['pending', 'approved', 'rejected'] as const).map((f) => {
          const active = filter === f;
          return (
            <TouchableOpacity key={f} style={[styles.filterChip, active && styles.filterChipActive]} onPress={() => setFilter(f)} activeOpacity={0.8}>
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {f === 'pending' ? 'En attente' : f === 'approved' ? 'Approuvés' : 'Rejetés'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.loadingBox}><ActivityIndicator color={colors.accent} /></View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        >
          {tickets.length === 0 ? (
            <EmptyState icon="mail-open-outline" title="Aucun ticket" message="Aucune demande de débannissement dans cette catégorie." />
          ) : (
            tickets.map((ticket) => (
              <View key={ticket.id} style={styles.card}>
                <View style={styles.cardTopRow}>
                  <Text style={styles.username}>@{ticket.user?.username || 'Inconnu'}</Text>
                  <Text style={styles.date}>{formatDate(ticket.createdAt)}</Text>
                </View>

                <Text style={styles.label}>Raison de la demande</Text>
                <Text style={styles.reason}>{ticket.reason}</Text>

                {ticket.user?.is_suspended && (
                  <View style={styles.warnBox}>
                    <Text style={styles.warnTitle}>Statut actuel : Suspendu</Text>
                    <Text style={styles.warnText}>Raison initiale : {ticket.user.suspension_reason || 'Non spécifiée'}</Text>
                  </View>
                )}

                {ticket.status !== 'pending' && (
                  <View style={styles.processedBox}>
                    <Text style={styles.label}>Notes de modération</Text>
                    <Text style={styles.processedNotes}>{ticket.admin_notes || 'Aucune note'}</Text>
                    <Text style={styles.processedBy}>Par {ticket.processor?.username || 'Admin'}</Text>
                  </View>
                )}

                {ticket.status === 'pending' && (
                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: colors.accentSoft }]}
                      onPress={() => handleProcess(ticket, 'approved')}
                      disabled={processing === ticket.id}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="checkmark-circle-outline" size={16} color={colors.accent} />
                      <Text style={[styles.actionBtnText, { color: colors.accent }]}>Approuver</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: colors.redMuted }]}
                      onPress={() => handleProcess(ticket, 'rejected')}
                      disabled={processing === ticket.id}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="close-circle-outline" size={16} color={colors.red} />
                      <Text style={[styles.actionBtnText, { color: colors.red }]}>Rejeter</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  filterChip: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  filterChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentMuted },
  filterChipText: { fontSize: 12.5, fontFamily: fonts.medium, color: colors.textSecondary },
  filterChipTextActive: { color: colors.accent, fontFamily: fonts.semibold },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20 },
  card: { borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 12 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  username: { color: colors.accent, fontFamily: fonts.bold, fontSize: 15 },
  date: { color: colors.textMuted, fontSize: 11.5 },
  label: { color: colors.textPrimary, fontSize: 12.5, fontFamily: fonts.semibold, marginBottom: 4 },
  reason: { color: colors.textSecondary, fontSize: 13.5, lineHeight: 19, marginBottom: 4 },
  warnBox: { backgroundColor: colors.redMuted, borderRadius: radius.md, padding: 10, marginTop: 10, borderLeftWidth: 3, borderLeftColor: colors.red },
  warnTitle: { color: colors.red, fontSize: 12, fontFamily: fonts.bold, marginBottom: 2 },
  warnText: { color: colors.textSecondary, fontSize: 12 },
  processedBox: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  processedNotes: { color: colors.textMuted, fontSize: 12.5, fontStyle: 'italic', marginBottom: 4 },
  processedBy: { color: colors.accent, fontSize: 11, alignSelf: 'flex-end' },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: radius.md },
  actionBtnText: { fontSize: 13, fontFamily: fonts.bold },
});

export default UnbanTicketsScreen;
