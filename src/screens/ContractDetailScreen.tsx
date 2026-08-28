import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ScreenBackground, BackButton, EmptyState, ScreenSkeleton, confirmAsync, promptAsync } from '../components/ui';
import Avatar from '../components/Avatar';
import { useHeaderMetrics, HEADER_CONTENT_HEIGHT } from '../hooks/useHeaderMetrics';
import { colors, radius, statusBarStyle } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { toast } from '../components/ui/Toast';
import contractService, { type CreatorContract } from '../services/contractService';

interface Props {
  navigation: any;
  route: { params: { contractId: string } };
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente de réponse',
  rejected: 'Refusé',
  accepted: 'Accepté · brouillon attendu',
  draft_submitted: 'Brouillon en revue',
  changes_requested: 'Modification demandée',
  approved: 'Publié',
  cancelled: 'Annulé',
};

export default function ContractDetailScreen({ navigation, route }: Props) {
  const { contractId } = route.params;
  const { top: headerTopInset } = useHeaderMetrics();
  const { user } = useAuth() as any;

  const [contract, setContract] = useState<CreatorContract | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draftText, setDraftText] = useState('');

  const load = useCallback(async () => {
    const res = await contractService.getContract(contractId);
    if (res.success) {
      setContract(res.data!);
      setDraftText(res.data!.draft_content?.text || '');
    } else {
      toast.error('Contrat introuvable', { description: res.message });
    }
  }, [contractId]);

  useFocusEffect(useCallback(() => { load().finally(() => setLoading(false)); }, [load]));

  const isBrand = contract?.brand_user_id === user?.id;
  const other = isBrand ? contract?.creator : contract?.brand;

  const refresh = async (action: () => Promise<{ success: boolean; message?: string; data?: CreatorContract }>) => {
    setBusy(true);
    try {
      const res = await action();
      if (!res.success) {
        toast.error('Action impossible', { description: res.message });
        return;
      }
      setContract(res.data!);
    } finally {
      setBusy(false);
    }
  };

  const onAccept = async () => {
    const ok = await confirmAsync({
      title: 'Accepter ce contrat ?',
      message: `${contract?.price_nf} NF seront débités du portefeuille de la marque et séquestrés jusqu'à la validation de ton brouillon.`,
      confirmLabel: 'Accepter',
    });
    if (!ok) return;
    await refresh(() => contractService.respond(contractId, true));
  };

  const onReject = async () => {
    const reason = await promptAsync({
      title: 'Refuser ce contrat ?',
      message: 'Un motif est optionnel.',
      placeholder: 'Motif (optionnel)',
      required: false,
    });
    if (reason === null) return;
    await refresh(() => contractService.respond(contractId, false, reason || undefined));
  };

  const onSubmitDraft = async () => {
    if (!draftText.trim()) {
      toast.error('Brouillon vide', { description: 'Écris le contenu du tweet avant de le soumettre.' });
      return;
    }
    await refresh(() => contractService.submitDraft(contractId, { text: draftText.trim() }));
    toast.success('Brouillon envoyé', { description: 'La marque va le relire.' });
  };

  const onApprove = async () => {
    const ok = await confirmAsync({
      title: 'Valider et publier ?',
      message: `Le tweet sera publié immédiatement et ${contract?.price_nf} NF seront crédités au créateur. Cette action est définitive.`,
      confirmLabel: 'Valider et publier',
    });
    if (!ok) return;
    await refresh(() => contractService.review(contractId, 'approve'));
    toast.success('Contrat approuvé', { description: 'Le tweet est publié.' });
  };

  const onRequestChanges = async () => {
    const feedback = await promptAsync({
      title: 'Demander une modification',
      placeholder: 'Ce qui doit changer',
      multiline: true,
    });
    if (feedback === null || !feedback.trim()) return;
    await refresh(() => contractService.review(contractId, 'request_changes', feedback.trim()));
  };

  const onCancel = async () => {
    const ok = await confirmAsync({
      title: 'Annuler ce contrat ?',
      message: 'La marque ne répond pas. Le séquestre lui sera intégralement remboursé.',
      confirmLabel: 'Annuler et rembourser',
      destructive: true,
    });
    if (!ok) return;
    await refresh(() => contractService.cancel(contractId));
  };

  if (loading || !contract) {
    return (
      <ScreenBackground>
        <SafeHeader navigation={navigation} title="Contrat" topInset={headerTopInset} />
        <ScreenSkeleton variant="list" />
      </ScreenBackground>
    );
  }

  const lastFeedback = [...contract.revision_history].reverse().find((e) => e.type === 'feedback');

  return (
    <ScreenBackground>
      <StatusBar barStyle={statusBarStyle()} backgroundColor={colors.bg} />
      <SafeHeader navigation={navigation} title="Contrat" topInset={headerTopInset} />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.partyRow}>
            <Avatar size={44} username={other?.username || '?'} uri={other?.avatar || undefined} />
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={styles.partyLabel}>{isBrand ? 'Créateur' : 'Marque'}</Text>
              <Text style={styles.partyName}>@{other?.username || '?'}</Text>
            </View>
            <Text style={styles.price}>{contract.price_nf} NF</Text>
          </View>

          <View style={styles.statusPill}>
            <Text style={styles.statusText}>{STATUS_LABELS[contract.status] || contract.status}</Text>
          </View>

          <Text style={styles.sectionLabel}>Brief</Text>
          <Text style={styles.brief}>{contract.brief}</Text>

          {!!lastFeedback && contract.status !== 'approved' && (
            <>
              <Text style={styles.sectionLabel}>Dernier retour de la marque</Text>
              <View style={styles.feedbackBox}>
                <Text style={styles.feedbackText}>{lastFeedback.feedback}</Text>
              </View>
            </>
          )}

          {/* pending */}
          {contract.status === 'pending' && !isBrand && (
            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.ghostBtn} onPress={onReject} disabled={busy} activeOpacity={0.85}>
                <Text style={styles.ghostBtnText}>Refuser</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryBtn} onPress={onAccept} disabled={busy} activeOpacity={0.85}>
                {busy ? <ActivityIndicator size="small" color={colors.onAccent} /> : <Text style={styles.primaryBtnText}>Accepter</Text>}
              </TouchableOpacity>
            </View>
          )}
          {contract.status === 'pending' && isBrand && (
            <Text style={styles.waitHint}>En attente de la réponse du créateur.</Text>
          )}

          {/* accepted / changes_requested : le créateur soumet un brouillon */}
          {(contract.status === 'accepted' || contract.status === 'changes_requested') && !isBrand && (
            <>
              <Text style={styles.sectionLabel}>{contract.status === 'accepted' ? 'Brouillon' : 'Nouveau brouillon'}</Text>
              <View style={styles.draftBox}>
                <TextInput
                  style={styles.draftInput}
                  placeholder="Contenu du tweet sponsorisé"
                  placeholderTextColor={colors.textMuted}
                  value={draftText}
                  onChangeText={setDraftText}
                  multiline
                  maxLength={1000}
                />
              </View>
              <TouchableOpacity style={[styles.primaryBtn, busy && styles.btnDisabled]} onPress={onSubmitDraft} disabled={busy} activeOpacity={0.85}>
                {busy ? <ActivityIndicator size="small" color={colors.onAccent} /> : <Text style={styles.primaryBtnText}>Soumettre à la marque</Text>}
              </TouchableOpacity>
            </>
          )}
          {(contract.status === 'accepted' || contract.status === 'changes_requested') && isBrand && (
            <Text style={styles.waitHint}>En attente d'un brouillon du créateur.</Text>
          )}

          {/* draft_submitted : la marque relit */}
          {contract.status === 'draft_submitted' && isBrand && (
            <>
              <Text style={styles.sectionLabel}>Brouillon à valider</Text>
              <View style={styles.draftBox}>
                <Text style={styles.draftPreview}>{contract.draft_content?.text}</Text>
              </View>
              <View style={styles.actionsRow}>
                <TouchableOpacity style={styles.ghostBtn} onPress={onRequestChanges} disabled={busy} activeOpacity={0.85}>
                  <Text style={styles.ghostBtnText}>Demander une modif</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryBtn} onPress={onApprove} disabled={busy} activeOpacity={0.85}>
                  {busy ? <ActivityIndicator size="small" color={colors.onAccent} /> : <Text style={styles.primaryBtnText}>Valider et publier</Text>}
                </TouchableOpacity>
              </View>
            </>
          )}
          {contract.status === 'draft_submitted' && !isBrand && (
            <>
              <Text style={styles.waitHint}>En attente de la revue de la marque.</Text>
              <TouchableOpacity style={[styles.ghostBtn, styles.cancelBtn]} onPress={onCancel} disabled={busy} activeOpacity={0.85}>
                <Text style={styles.cancelBtnText}>La marque ne répond pas · annuler et me faire rembourser la marque</Text>
              </TouchableOpacity>
            </>
          )}

          {/* terminal */}
          {contract.status === 'approved' && (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => navigation.navigate('TweetDetail', { tweetId: contract.tweet_id })}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>Voir le tweet publié</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenBackground>
  );
}

function SafeHeader({ navigation, title, topInset }: { navigation: any; title: string; topInset: number }) {
  return (
    <View style={[styles.headerShell, { paddingTop: topInset }]}>
      <View style={[styles.header, { minHeight: HEADER_CONTENT_HEIGHT }]}>
        <View style={styles.roundSlot}>
          <BackButton navigation={navigation} style={styles.roundButton} />
        </View>
        <View style={styles.titleGroup}>
          <Text style={styles.title}>{title}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerShell: { backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  roundSlot: { width: 40, alignItems: 'center' },
  roundButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  titleGroup: { flex: 1, alignItems: 'center' },
  title: { color: colors.textPrimary, fontSize: 17, fontWeight: '700' },

  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 60 },

  partyRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  partyLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  partyName: { color: colors.textPrimary, fontSize: 16, fontWeight: '700', marginTop: 2 },
  price: { color: colors.accentBright, fontSize: 16, fontWeight: '800' },

  statusPill: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.round, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, marginBottom: 16 },
  statusText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },

  sectionLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 12, marginBottom: 8 },
  brief: { color: colors.textPrimary, fontSize: 14, lineHeight: 20 },

  feedbackBox: { padding: 12, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderStrong },
  feedbackText: { color: colors.textPrimary, fontSize: 13, lineHeight: 19 },

  waitHint: { color: colors.textMuted, fontSize: 13, marginTop: 16, textAlign: 'center' },

  draftBox: { padding: 12, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, minHeight: 90 },
  draftInput: { color: colors.textPrimary, fontSize: 14, lineHeight: 20, minHeight: 80, textAlignVertical: 'top', padding: 0 },
  draftPreview: { color: colors.textPrimary, fontSize: 14, lineHeight: 20 },

  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  primaryBtn: { flex: 1, marginTop: 12, paddingVertical: 13, borderRadius: radius.round, backgroundColor: colors.accent, alignItems: 'center' },
  primaryBtnText: { color: colors.onAccent, fontSize: 14, fontWeight: '700' },
  ghostBtn: { flex: 1, paddingVertical: 13, borderRadius: radius.round, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  ghostBtnText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },

  cancelBtn: { marginTop: 10, borderColor: colors.red },
  cancelBtnText: { color: colors.red, fontSize: 12, fontWeight: '700', textAlign: 'center' },
});
