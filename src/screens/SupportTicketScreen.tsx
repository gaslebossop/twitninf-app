import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenBackground, BackButton, ScreenSkeleton } from '../components/ui';
import { useHeaderMetrics, HEADER_CONTENT_HEIGHT } from '../hooks/useHeaderMetrics';
import { colors, fonts , statusBarStyle} from '../theme';
import { toast } from '../components/ui/Toast';
import { confirmAsync } from '../components/ui/ConfirmSheet';
import {
  STATUS_LABELS,
  closeTicket,
  fetchTicket,
  isTicketOpen,
  replyToTicket,
  type SupportTicketDetail,
} from '../services/supportService';

/**
 * Fil d'un ticket de support.
 *
 * Les messages du support sont visuellement distincts de ceux de l'utilisateur
 * et portent un badge explicite : `isStaff` est écrit par le serveur depuis le
 * rôle de l'auteur, jamais depuis le corps de la requête, donc ce badge est une
 * garantie réelle et pas une décoration.
 */

interface Props {
  navigation: any;
  route: { params: { ticketId: string } };
}

const STAFF_STATUS_LABELS: Record<string, string> = {
  open: 'À prendre en charge',
  pending: 'En attente de l’utilisateur',
  answered: 'Réponse envoyée',
  resolved: 'Résolu',
  closed: 'Clos',
};

export default function SupportTicketScreen({ navigation, route }: Props) {
  const { ticketId } = route.params;
  const { top: headerTopInset } = useHeaderMetrics();
  const scrollRef = useRef<ScrollView>(null);

  const [detail, setDetail] = useState<SupportTicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const result = await fetchTicket(ticketId);
    if (result.ok) {
      setDetail(result.data!);
      setError(null);
    } else {
      setError(result.message || 'Ticket introuvable.');
    }
    setLoading(false);
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);

  const send = useCallback(async () => {
    const text = reply.trim();
    if (!text) return;

    setSending(true);
    const result = await replyToTicket(ticketId, text, {
      asStaff: detail?.actor?.isStaff === true,
    });
    setSending(false);

    if (!result.ok) {
      toast.success('Message non envoyé', {
        description: result.message || 'Réessaie dans un instant.',
      });
      return;
    }

    setReply('');
    await load();
    // Après rechargement, le dernier message est en bas : on l'y amène.
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [reply, ticketId, load, detail?.actor?.isStaff]);

  const onClose = useCallback(() => {
    confirmAsync({
      title: detail?.actor?.isStaff ? 'Clore ce ticket côté support ?' : 'Clore ce ticket ?',
      message: detail?.actor?.isStaff
        ? 'Le fil sera fermé pour le support et pour l’utilisateur.'
        : 'Tu ne pourras plus y répondre. Si le problème revient, ouvre-en un nouveau.',
      confirmLabel: 'Clore',
      destructive: true,
    }).then((ok) => {
      if (ok) (async () => {
            const result = await closeTicket(ticketId);
            if (result.ok) await load();
            else toast.error(result.message || 'Impossible de clore ce ticket.');
          })();
    });
  }, [ticketId, load, detail?.actor?.isStaff]);

  const ticket = detail?.ticket;
  const open = ticket ? isTicketOpen(ticket.status) : false;
  const staffMode = detail?.actor?.isStaff === true;

  return (
    <ScreenBackground>
      <StatusBar barStyle={statusBarStyle()} backgroundColor={colors.bg} />

      <View style={[styles.headerShell, { paddingTop: headerTopInset }]}>
        <View style={[styles.header, { minHeight: HEADER_CONTENT_HEIGHT }]}>
          <View style={styles.roundSlot}>
            <BackButton navigation={navigation} style={styles.roundButton} />
          </View>
          <View style={styles.titleGroup}>
            <Text style={styles.title} numberOfLines={1}>
              {ticket?.subject || 'Ticket'}
            </Text>
            {!!ticket && (
              <Text style={styles.subtitle} numberOfLines={1}>
                {staffMode && ticket.requester?.username ? `@${ticket.requester.username} · ` : ''}
                {staffMode ? STAFF_STATUS_LABELS[ticket.status] : STATUS_LABELS[ticket.status]}
              </Text>
            )}
          </View>
          <View style={styles.roundSlot}>
            {open && (
              <TouchableOpacity
                style={styles.roundButton}
                onPress={onClose}
                activeOpacity={0.8}
                accessibilityLabel="Clore le ticket"
              >
                <Ionicons name="checkmark-done" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? headerTopInset + 8 : 0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {loading ? (
            <ScreenSkeleton variant="thread" />
          ) : error ? (
            <View style={styles.centered} accessibilityRole="alert">
              <Ionicons name="cloud-offline-outline" size={22} color={colors.warning} />
              <Text style={styles.centeredText}>{error}</Text>
            </View>
          ) : (
            <>
              {ticket?.priority === 'high' && (
                <View style={styles.priorityBanner}>
                  <Ionicons name="flash" size={14} color={colors.accent} />
                  <Text style={styles.priorityText}>
                    Ticket prioritaire — réponse visée sous {ticket.slaHours} h.
                  </Text>
                </View>
              )}

              {staffMode && ticket?.requester && (
                <View style={styles.requesterCard}>
                  <View style={styles.requesterIcon}>
                    <Ionicons name="person" size={14} color={colors.accent} />
                  </View>
                  <View style={styles.requesterTextWrap}>
                    <Text style={styles.requesterName}>
                      {ticket.requester.fullName || ticket.requester.username}
                    </Text>
                    <Text style={styles.requesterHandle}>@{ticket.requester.username}</Text>
                  </View>
                  <View style={styles.staffModeBadge}>
                    <Text style={styles.staffModeBadgeText}>Réponse officielle</Text>
                  </View>
                </View>
              )}

              {detail?.messages.map((m) => (
                <View
                  key={m.id}
                  style={[
                    styles.bubble,
                    m.isStaff ? styles.bubbleStaff : styles.bubbleUser,
                    (staffMode ? m.isStaff : !m.isStaff) ? styles.bubbleOwn : styles.bubbleOther,
                  ]}
                >
                  {m.isStaff && (
                    <View style={styles.staffBadge}>
                      <Ionicons name="shield-checkmark" size={11} color={colors.accent} />
                      <Text style={styles.staffBadgeText}>Support TwitNinf</Text>
                    </View>
                  )}
                  <Text style={styles.bubbleText}>{m.body}</Text>
                  <Text style={styles.bubbleTime}>
                    {new Date(m.createdAt).toLocaleString('fr-FR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              ))}

              {!open && (
                <Text style={styles.closedNote}>
                  Ce ticket est clos. Ouvre-en un nouveau si le problème persiste.
                </Text>
              )}
            </>
          )}
        </ScrollView>

        {open && !loading && !error && (
          <View style={styles.composer}>
            <TextInput
              style={styles.composerInput}
              placeholder={staffMode ? 'Réponse officielle du support…' : 'Ta réponse…'}
              placeholderTextColor={colors.textMuted}
              value={reply}
              onChangeText={setReply}
              multiline
              maxLength={4000}
            />
            <TouchableOpacity
              style={[styles.sendButton, (!reply.trim() || sending) && styles.buttonDisabled]}
              onPress={send}
              disabled={!reply.trim() || sending}
              activeOpacity={0.85}
              accessibilityLabel="Envoyer"
            >
              {sending ? (
                <ActivityIndicator size="small" color={colors.onAccent} />
              ) : (
                <Ionicons name="arrow-up" size={18} color={colors.onAccent} />
              )}
            </TouchableOpacity>
          </View>
        )}
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
    fontSize: 16,
    textAlign: 'center',
    fontFamily: fonts.heading,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 1,
    fontFamily: fonts.regular,
  },

  content: { padding: 16, paddingBottom: 24 },

  priorityBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    padding: 11,
    borderRadius: 11,
    backgroundColor: colors.accentSoft,
    marginBottom: 14,
  },
  priorityText: { color: colors.accent, fontSize: 12, flex: 1, fontFamily: fonts.regular },

  requesterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    padding: 11,
    borderRadius: 11,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: 14,
  },
  requesterIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requesterTextWrap: { flex: 1, minWidth: 0 },
  requesterName: { color: colors.textPrimary, fontSize: 12.5, fontFamily: fonts.bold },
  requesterHandle: { color: colors.textMuted, fontSize: 10.5, marginTop: 1, fontFamily: fonts.regular },
  staffModeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.accentMuted },
  staffModeBadgeText: { color: colors.accent, fontSize: 9.5, fontFamily: fonts.bold },

  bubble: {
    maxWidth: '88%',
    padding: 12,
    borderRadius: 14,
    marginBottom: 10,
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: colors.accentMuted,
    borderBottomRightRadius: 4,
  },
  bubbleStaff: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderBottomLeftRadius: 4,
  },
  bubbleOwn: { alignSelf: 'flex-end' },
  bubbleOther: { alignSelf: 'flex-start' },
  staffBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  staffBadgeText: { color: colors.accent, fontSize: 11, fontFamily: fonts.bold },
  bubbleText: {
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.regular,
  },
  bubbleTime: { color: colors.textMuted, fontSize: 10.5, marginTop: 6, fontFamily: fonts.regular },

  closedNote: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 18,
    fontFamily: fonts.regular,
  },

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 9,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  composerInput: {
    flex: 1,
    maxHeight: 120,
    minHeight: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    paddingHorizontal: 15,
    paddingTop: 11,
    paddingBottom: 11,
    color: colors.textPrimary,
    fontSize: 14,
    fontFamily: fonts.regular,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.4 },

  centered: { alignItems: 'center', paddingVertical: 40 },
  centeredText: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 10,
    fontFamily: fonts.regular,
  },
});
