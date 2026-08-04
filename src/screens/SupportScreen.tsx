import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenBackground, BackButton, ScreenSkeleton } from '../components/ui';
import { useHeaderMetrics, HEADER_CONTENT_HEIGHT } from '../hooks/useHeaderMetrics';
import { colors, fonts } from '../theme';
import { toast } from '../components/ui/Toast';
import {
  CATEGORY_LABELS,
  STATUS_LABELS,
  createTicket,
  fetchStaffQueue,
  fetchSummary,
  fetchTickets,
  isTicketOpen,
  type SupportSummary,
  type SupportTicketSummary,
  type TicketCategory,
} from '../services/supportService';

/**
 * Support par ticket.
 *
 * L'ouverture d'un ticket est accessible à tous — couper le seul canal pour
 * signaler « je n'arrive plus à me connecter » ou « on m'a débité deux fois »
 * serait indéfendable. Ce que l'abonnement Pro apporte est affiché en clair en
 * haut de l'écran : priorité de traitement, délai annoncé, nombre de tickets
 * ouverts en parallèle. L'avantage se voit, il ne se devine pas.
 */

const CATEGORIES: TicketCategory[] = [
  'compte', 'abonnement', 'economie', 'moderation', 'bug', 'autre',
];

const STAFF_STATUS_LABELS: Record<SupportTicketSummary['status'], string> = {
  open: 'À prendre en charge',
  pending: 'En attente de l’utilisateur',
  answered: 'Réponse envoyée',
  resolved: 'Résolu',
  closed: 'Clos',
};

interface Props {
  navigation: any;
}

export default function SupportScreen({ navigation }: Props) {
  const { top: headerTopInset } = useHeaderMetrics();

  const [summary, setSummary] = useState<SupportSummary | null>(null);
  const [tickets, setTickets] = useState<SupportTicketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [composing, setComposing] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<TicketCategory>('autre');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    // Le serveur détermine `isStaff` depuis la base, pas depuis le JWT local qui
    // peut dater d'avant la promotion du compte.
    const summaryResult = await fetchSummary();
    const resolvedSummary = summaryResult.ok ? summaryResult.data! : null;
    if (resolvedSummary) setSummary(resolvedSummary);
    const ticketsResult = resolvedSummary?.isStaff
      ? await fetchStaffQueue('open')
      : await fetchTickets();
    if (ticketsResult.ok) {
      setTickets(ticketsResult.data!);
      setError(null);
    } else {
      setError(ticketsResult.message || 'Support indisponible.');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Revenir d'un fil doit rafraîchir la pastille « non lu » de la liste.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const submit = useCallback(async () => {
    if (subject.trim().length < 3) {
      toast.error('Sujet trop court', {
        description: 'Résume ton problème en quelques mots.',
      });
      return;
    }
    if (body.trim().length < 10) {
      toast.error('Message trop court', {
        description: 'Décris ce qui se passe, en 10 caractères minimum.',
      });
      return;
    }

    setSubmitting(true);
    const result = await createTicket({
      subject: subject.trim(),
      message: body.trim(),
      category,
    });
    setSubmitting(false);

    if (!result.ok) {
      toast.info('Ticket non ouvert', {
        description: result.message || 'Réessaie dans un instant.',
      });
      return;
    }

    setSubject('');
    setBody('');
    setCategory('autre');
    setComposing(false);
    await load();
  }, [subject, body, category, load]);

  const openCount = tickets.filter((t) => isTicketOpen(t.status)).length;
  const staffMode = summary?.isStaff === true;
  const canOpenMore = !staffMode && (!summary || openCount < summary.maxOpenTickets);

  return (
    <ScreenBackground>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

      <View style={[styles.headerShell, { paddingTop: headerTopInset }]}>
        <View style={[styles.header, { minHeight: HEADER_CONTENT_HEIGHT }]}>
          <View style={styles.roundSlot}>
            <BackButton navigation={navigation} style={styles.roundButton} />
          </View>
          <View style={styles.titleGroup}>
            <Text style={styles.title}>{staffMode ? 'File support' : 'Support'}</Text>
          </View>
          <View style={styles.roundSlot}>
            {!staffMode && !composing && canOpenMore && (
              <TouchableOpacity
                style={styles.roundButton}
                onPress={() => setComposing(true)}
                activeOpacity={0.8}
                accessibilityLabel="Ouvrir un nouveau ticket"
              >
                <Ionicons name="add" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
          }
        >
          {!!summary && (
            <View style={[styles.slaCard, (staffMode || summary.isPro) && styles.slaCardPro]}>
              <View style={styles.slaHead}>
                <Ionicons
                  name={staffMode ? 'shield-checkmark' : summary.isPro ? 'flash' : 'headset-outline'}
                  size={16}
                  color={staffMode || summary.isPro ? colors.accent : colors.textSecondary}
                />
                <Text style={[styles.slaTitle, (staffMode || summary.isPro) && styles.slaTitlePro]}>
                  {staffMode
                    ? `${summary.openTickets} ticket${summary.openTickets > 1 ? 's' : ''} à traiter`
                    : summary.isPro ? 'Traitement prioritaire' : 'Traitement standard'}
                </Text>
              </View>
              <Text style={styles.slaText}>
                {staffMode
                  ? `${summary.unreadTickets} ticket${summary.unreadTickets > 1 ? 's' : ''} avec une nouvelle réponse. Les tickets prioritaires et les plus anciens apparaissent d’abord.`
                  : summary.isPro
                  ? `Tes tickets passent en tête de file. Réponse visée sous ${summary.slaHours} h, jusqu'à ${summary.maxOpenTickets} tickets ouverts en même temps.`
                  : `Réponse visée sous ${summary.slaHours} h, un ticket ouvert à la fois. Le palier Pro place tes tickets en tête de file, sous ${24} h.`}
              </Text>
            </View>
          )}

          {!staffMode && composing && (
            <View style={styles.composeCard}>
              <Text style={styles.composeTitle}>Nouveau ticket</Text>

              <Text style={styles.fieldLabel}>Catégorie</Text>
              <View style={styles.chipRow}>
                {CATEGORIES.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.chip, category === c && styles.chipActive]}
                    onPress={() => setCategory(c)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, category === c && styles.chipTextActive]}>
                      {CATEGORY_LABELS[c]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Sujet</Text>
              <TextInput
                style={styles.input}
                placeholder="En quelques mots"
                placeholderTextColor={colors.textMuted}
                value={subject}
                onChangeText={setSubject}
                maxLength={160}
              />

              <Text style={styles.fieldLabel}>Ce qui se passe</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                placeholder="Décris le problème : ce que tu faisais, ce qui s'est passé, depuis quand."
                placeholderTextColor={colors.textMuted}
                value={body}
                onChangeText={setBody}
                multiline
                textAlignVertical="top"
                maxLength={4000}
              />

              <View style={styles.composeActions}>
                <TouchableOpacity
                  style={styles.ghostButton}
                  onPress={() => setComposing(false)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.ghostButtonText}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryButton, submitting && styles.buttonDisabled]}
                  onPress={submit}
                  disabled={submitting}
                  activeOpacity={0.85}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color={colors.onAccent} />
                  ) : (
                    <Text style={styles.primaryButtonText}>Envoyer</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {loading ? (
            <ScreenSkeleton variant="list" />
          ) : error ? (
            <View style={styles.centered} accessibilityRole="alert">
              <Ionicons name="cloud-offline-outline" size={22} color={colors.warning} />
              <Text style={styles.centeredText}>{error}</Text>
            </View>
          ) : tickets.length === 0 ? (
            !composing && (
              <View style={styles.centered}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="chatbubbles-outline" size={24} color={colors.textSecondary} />
                </View>
                <Text style={styles.emptyTitle}>{staffMode ? 'File vide' : 'Aucun ticket'}</Text>
                <Text style={styles.centeredText}>
                  {staffMode
                    ? 'Aucun ticket ouvert ne demande de réponse pour le moment.'
                    : 'Un souci de compte, de paiement, un bug ? Ouvre un ticket, une vraie personne le lira.'}
                </Text>
                {!staffMode && (
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={() => setComposing(true)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.primaryButtonText}>Ouvrir un ticket</Text>
                  </TouchableOpacity>
                )}
              </View>
            )
          ) : (
            tickets.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={styles.ticketRow}
                onPress={() => navigation.navigate('SupportTicket', { ticketId: t.id })}
                activeOpacity={0.8}
              >
                <View style={styles.ticketHead}>
                  <Text style={styles.ticketSubject} numberOfLines={1}>{t.subject}</Text>
                  {(staffMode ? t.unreadForStaff : t.unread) && <View style={styles.unreadDot} />}
                </View>
                <Text style={styles.ticketStatus}>
                  {staffMode ? STAFF_STATUS_LABELS[t.status] : STATUS_LABELS[t.status]}
                  {staffMode && t.user?.username ? ` · @${t.user.username}` : ''}
                </Text>
                <View style={styles.ticketMeta}>
                  <View style={styles.tag}>
                    <Text style={styles.tagText}>{CATEGORY_LABELS[t.category]}</Text>
                  </View>
                  {t.priority === 'high' && (
                    <View style={[styles.tag, styles.tagPriority]}>
                      <Ionicons name="flash" size={10} color={colors.accent} />
                      <Text style={[styles.tagText, styles.tagTextPriority]}>Prioritaire</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  headerShell: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  roundSlot: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  roundButton: {
    width: 40,
    height: 40,
    padding: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  titleGroup: { flex: 1, minWidth: 0, paddingHorizontal: 10 },
  title: {
    color: colors.textPrimary,
    fontSize: 17,
    textAlign: 'center',
    fontFamily: fonts.heading,
  },

  // La barre d'onglets absolue de l'app recouvrirait le dernier élément.
  content: { padding: 16, paddingBottom: 120 },

  slaCard: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  slaCardPro: { borderColor: colors.accentMuted, backgroundColor: colors.accentSoft },
  slaHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  slaTitle: { color: colors.textPrimary, fontSize: 14, fontFamily: fonts.bold },
  slaTitlePro: { color: colors.accent },
  slaText: {
    color: colors.textSecondary,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 6,
    fontFamily: fonts.regular,
  },

  composeCard: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginTop: 14,
  },
  composeTitle: { color: colors.textPrimary, fontSize: 15, fontFamily: fonts.bold },
  fieldLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 14,
    marginBottom: 7,
    fontFamily: fonts.regular,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.surfaceElevated,
  },
  chipActive: { backgroundColor: colors.accentMuted },
  chipText: { color: colors.textSecondary, fontSize: 12, fontFamily: fonts.regular },
  chipTextActive: { color: colors.accent, fontFamily: fonts.bold },
  input: {
    borderRadius: 10,
    backgroundColor: colors.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: colors.textPrimary,
    fontSize: 14,
    fontFamily: fonts.regular,
  },
  inputMultiline: { minHeight: 110, lineHeight: 20 },
  composeActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  ghostButton: {
    flex: 1,
    height: 44,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  ghostButtonText: { color: colors.textSecondary, fontSize: 14, fontFamily: fonts.regular },
  primaryButton: {
    flex: 1,
    height: 44,
    minWidth: 150,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    marginTop: 0,
  },
  primaryButtonText: { color: colors.onAccent, fontSize: 14, fontFamily: fonts.bold },
  buttonDisabled: { opacity: 0.5 },

  ticketRow: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginTop: 10,
  },
  ticketHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ticketSubject: { color: colors.textPrimary, fontSize: 14.5, flex: 1, fontFamily: fonts.bold },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  ticketStatus: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
    fontFamily: fonts.regular,
  },
  ticketMeta: { flexDirection: 'row', gap: 7, marginTop: 9 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.surfaceElevated,
  },
  tagPriority: { backgroundColor: colors.accentMuted },
  tagText: { color: colors.textMuted, fontSize: 10.5, fontFamily: fonts.regular },
  tagTextPriority: { color: colors.accent, fontFamily: fonts.bold },

  centered: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 12 },
  centeredText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 16,
    fontFamily: fonts.regular,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { color: colors.textPrimary, fontSize: 15, marginTop: 12, fontFamily: fonts.bold },
});
