import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppStatusBar } from '../components/ui';
import { paperFonts, ps, isPaperDark } from '../theme/paper2b';
import { toast } from '../components/ui/Toast';
import { sendAgentMessage, type AgentMessage } from '../services/ultraSupportAgentService';

/**
 * Chat avec l'agent de support IA — avantage Ultra.
 *
 * Même registre que `ConversationThreadScreen2B` (le fil de messages actuel,
 * pas l'ancien `ConversationThreadScreen`) : un RELEVÉ, pas des bulles. L'heure
 * vit dans la gouttière à gauche de chaque ligne, le texte se pose nu sur le
 * papier des deux côtés — seule la position (et le sens de la gouttière)
 * distingue qui parle. Palette et grille copiées de cet écran, pas importées :
 * `ConversationThreadScreen2B` documente déjà pourquoi ce sont les couleurs
 * d'UN dessin, pas une feuille de style partagée.
 *
 * L'agent ne peut rien exécuter d'administratif : quand une demande le
 * dépasse, il dépose un VRAI ticket et le dit — le lien apparaît sous la ligne
 * concernée, jamais une simple promesse en texte. L'historique vit ici, pas
 * côté serveur : quitter l'écran l'efface.
 */

interface DrawingPalette {
  bg: string;
  ink: string;
  onInk: string;
  time: string;
  meta: string;
  hairline: string;
  accent: string;
  onAccent: string;
  halo: string;
}

const LIGHT: DrawingPalette = {
  bg: '#F8F6F1',
  ink: '#17161A',
  onInk: '#F8F6F1',
  time: '#8A8892',
  meta: '#6E6C75',
  hairline: 'rgba(23,22,26,0.10)',
  accent: '#E8384F',
  onAccent: '#FFFFFF',
  halo: 'rgba(232,56,79,0.13)',
};

const DARK: DrawingPalette = {
  bg: '#131210',
  ink: '#F4F2ED',
  onInk: '#131210',
  time: '#918E99',
  meta: '#A3A0AA',
  hairline: 'rgba(244,242,237,0.13)',
  accent: '#FF5468',
  onAccent: '#1A0207',
  halo: 'rgba(255,84,104,0.16)',
};

const M = isPaperDark ? DARK : LIGHT;

const TIME_COL = ps(56);
const GRID_GAP = ps(12);
const PAD_X = ps(20);
const ROW_TOP = ps(16);

interface Props {
  navigation: any;
}

interface DisplayMessage extends AgentMessage {
  id: string;
  ticketId?: string | null;
}

let uidCounter = 0;
function nextId() {
  uidCounter += 1;
  return `m${Date.now()}_${uidCounter}`;
}

function formatTime(): string {
  return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export default function UltraSupportAgentScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const [messages, setMessages] = useState<(DisplayMessage & { time: string })[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    const history: AgentMessage[] = messages.map((m) => ({ role: m.role, content: m.content }));
    const userMessage = { id: nextId(), role: 'user' as const, content: text, time: formatTime() };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setSending(true);
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));

    const result = await sendAgentMessage(text, history);
    setSending(false);

    if (!result.ok) {
      toast.error('Agent indisponible', { description: result.message });
      setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
      setInput(text);
      return;
    }

    setMessages((prev) => [
      ...prev,
      {
        id: nextId(),
        role: 'assistant',
        content: result.data!.reply,
        ticketId: result.data!.ticketFiled,
        time: formatTime(),
      },
    ]);
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [input, sending, messages]);

  const canSend = !!input.trim() && !sending;

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <AppStatusBar />

        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={hitSlop}>
            <Ionicons name="chevron-back" size={ps(19)} color={M.ink} />
          </TouchableOpacity>
          <View style={styles.headerIcon}>
            <Ionicons name="sparkles" size={ps(14)} color={M.accent} />
          </View>
          <Text style={styles.headerName} numberOfLines={1}>Agent IA</Text>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
          >
            {messages.length === 0 && (
              <View style={styles.intro}>
                <Text style={styles.introText}>
                  Décris ton problème. L'agent lit ton compte, tes strikes et tes tickets en
                  direct, et n'ouvre un ticket que si un humain doit trancher.
                </Text>
              </View>
            )}

            {messages.map((m) => {
              const fromMe = m.role === 'user';
              return (
                <View key={m.id}>
                  <View style={[styles.row, fromMe && styles.rowMine]}>
                    <Text
                      style={[styles.rowTime, fromMe && styles.rowTimeMine]}
                      numberOfLines={1}
                    >
                      {m.time}
                    </Text>
                    <View style={[styles.rowBody, fromMe && styles.rowBodyMine]}>
                      <Text style={[styles.bodyText, fromMe && styles.bodyTextMine]}>
                        {m.content}
                      </Text>
                      {!!m.ticketId && (
                        <TouchableOpacity
                          style={styles.ticketLine}
                          onPress={() => navigation.navigate('SupportTicket', { ticketId: m.ticketId })}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.ticketLineText}>Ticket prioritaire ouvert · voir</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {sending && (
            <View style={styles.typingRow}>
              <View style={styles.typingDots}>
                <View style={styles.typingDot} />
                <View style={styles.typingDot} />
                <View style={styles.typingDot} />
              </View>
              <Text style={styles.typingLabel}>L'agent écrit…</Text>
            </View>
          )}

          <View style={[styles.dock, { paddingBottom: ps(12) + Math.max(insets.bottom, ps(18)) }]}>
            <View style={styles.composerRow}>
              <TextInput
                style={styles.input}
                value={input}
                onChangeText={setInput}
                placeholder="Écrire un message…"
                placeholderTextColor={M.time}
                multiline
                maxLength={4000}
                editable={!sending}
              />
              <TouchableOpacity
                onPress={send}
                disabled={!canSend}
                style={[styles.roundBtn, !canSend && styles.roundBtnDim]}
                accessibilityRole="button"
                accessibilityLabel="Envoyer le message"
              >
                {sending ? (
                  <ActivityIndicator size="small" color={M.onAccent} />
                ) : (
                  <Ionicons name="arrow-up" size={ps(21)} color={M.onAccent} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const hitSlop = { top: 10, bottom: 10, left: 10, right: 10 };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: M.bg },
  container: { flex: 1, backgroundColor: 'transparent' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ps(11),
    paddingHorizontal: PAD_X,
    paddingTop: ps(8),
    paddingBottom: ps(12),
    borderBottomWidth: 1,
    borderBottomColor: M.hairline,
  },
  headerIcon: {
    width: ps(28),
    height: ps(28),
    borderRadius: ps(14),
    backgroundColor: M.halo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerName: {
    flex: 1,
    color: M.ink,
    fontSize: ps(21),
    fontFamily: paperFonts.strong,
    letterSpacing: ps(-0.35),
  },

  listContent: { paddingBottom: ps(8) },

  intro: { paddingHorizontal: PAD_X, paddingTop: ps(28) },
  introText: {
    color: M.meta,
    fontSize: ps(16),
    lineHeight: ps(23),
    fontFamily: paperFonts.body,
  },

  row: { flexDirection: 'row', paddingHorizontal: PAD_X, paddingTop: ROW_TOP },
  rowMine: { flexDirection: 'row-reverse' },
  rowTime: {
    width: TIME_COL,
    marginRight: GRID_GAP,
    textAlign: 'right',
    paddingTop: ps(8),
    color: M.time,
    fontSize: ps(13),
    lineHeight: ps(16),
    letterSpacing: ps(0.6),
    fontFamily: paperFonts.mono,
  },
  rowTimeMine: { marginRight: 0, marginLeft: GRID_GAP, textAlign: 'left' },
  rowBody: { flex: 1, minWidth: 0 },
  rowBodyMine: { alignItems: 'flex-end' },

  bodyText: {
    color: M.ink,
    fontSize: ps(19),
    lineHeight: ps(27),
    fontFamily: paperFonts.body,
    alignSelf: 'stretch',
    paddingRight: ps(6),
  },
  bodyTextMine: { textAlign: 'right', alignSelf: 'flex-end', paddingRight: 0, paddingLeft: ps(6) },

  ticketLine: { marginTop: ps(6), paddingRight: ps(6) },
  ticketLineText: {
    color: M.accent,
    fontSize: ps(12),
    letterSpacing: ps(1.1),
    textTransform: 'uppercase',
    fontFamily: paperFonts.mono,
  },

  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ps(10),
    paddingLeft: PAD_X + TIME_COL + GRID_GAP,
    paddingRight: PAD_X,
    paddingBottom: ps(10),
  },
  typingDots: { flexDirection: 'row', alignItems: 'center', gap: ps(5) },
  typingDot: { width: ps(7), height: ps(7), borderRadius: ps(3.5), backgroundColor: M.time },
  typingLabel: {
    color: M.meta,
    fontSize: ps(13),
    fontFamily: paperFonts.mono,
  },

  dock: {
    paddingHorizontal: PAD_X,
    paddingTop: ps(12),
    borderTopWidth: 1,
    borderTopColor: M.hairline,
    backgroundColor: M.bg,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ps(12),
    minHeight: ps(54),
  },
  input: {
    flex: 1,
    color: M.ink,
    fontSize: ps(17),
    lineHeight: ps(24),
    fontFamily: paperFonts.body,
    maxHeight: ps(150),
    paddingVertical: ps(6),
  },
  roundBtn: {
    width: ps(44),
    height: ps(44),
    borderRadius: ps(22),
    backgroundColor: M.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundBtnDim: { opacity: 0.4 },
});
