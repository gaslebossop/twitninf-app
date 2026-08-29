import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Image,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiService } from '../services/api';
import { toast } from '../components/ui/Toast';
import { colors, fonts } from '../theme';
import { ScreenBackground, Tappable } from '../components/ui';

interface Status {
  emailEnabled: boolean;
  totpEnabled: boolean;
  recoveryCodesLeft: number;
  hasEmail: boolean;
  emailHint: string | null;
  mailAvailable: boolean;
}

/**
 * Vérification en deux étapes.
 *
 * Deux facteurs indépendants (code par e-mail, application d'authentification)
 * et un jeu de codes de secours. Les codes de secours ne sont AFFICHÉS QU'UNE
 * FOIS : le serveur n'en garde que les condensés, les réafficher est
 * impossible — l'écran le dit, sinon l'utilisateur ferme le panneau en pensant
 * les retrouver plus tard.
 */
export default function TwoFactorScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);

  const [emailStep, setEmailStep] = useState(false);
  const [emailCode, setEmailCode] = useState('');

  const [totpSetup, setTotpSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [totpCode, setTotpCode] = useState('');

  const [password, setPassword] = useState('');
  const [pendingAction, setPendingAction] = useState<'email' | 'totp' | 'all' | null>(null);

  const refresh = useCallback(async () => {
    const response = await apiService.getTwoFactorStatus();
    if (response.success) setStatus(response.data as Status);
    else toast.error(response.message || 'Chargement impossible');
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const startEmail = () => run(async () => {
    const response = await apiService.startTwoFactorEmail();
    if (!response.success) return toast.error(response.message || 'Envoi impossible');
    setEmailStep(true);
    toast.success('Code envoyé par e-mail');
  });

  const confirmEmail = () => run(async () => {
    const response = await apiService.confirmTwoFactorEmail(emailCode.trim());
    if (!response.success) return toast.error(response.message || 'Code incorrect');
    setCodes((response.data as any).recoveryCodes);
    setEmailStep(false);
    setEmailCode('');
  });

  const startTotp = () => run(async () => {
    const response = await apiService.startTwoFactorTotp();
    if (!response.success) return toast.error(response.message || 'Préparation impossible');
    setTotpSetup(response.data as any);
  });

  const confirmTotp = () => run(async () => {
    const response = await apiService.confirmTwoFactorTotp(totpCode.trim());
    if (!response.success) return toast.error(response.message || 'Code incorrect');
    setCodes((response.data as any).recoveryCodes);
    setTotpSetup(null);
    setTotpCode('');
  });

  const confirmPassword = () => run(async () => {
    if (!pendingAction) return;
    const response = pendingAction === 'all'
      ? await apiService.regenerateTwoFactorCodes(password)
      : await apiService.disableTwoFactor(password, pendingAction);
    if (!response.success) return toast.error(response.message || 'Mot de passe incorrect');

    if (pendingAction === 'all') setCodes((response.data as any).recoveryCodes);
    else { setCodes(null); toast.success('Méthode désactivée'); }
    setPassword('');
    setPendingAction(null);
  });

  return (
    <View style={styles.root}>
      <ScreenBackground style={StyleSheet.absoluteFill} />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Tappable onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </Tappable>
        <Text style={styles.headerTitle}>Vérification en deux étapes</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
        <Text style={styles.intro}>
          Un second code demandé à chaque connexion. Même avec ton mot de passe,
          personne n’entre sans lui.
        </Text>

        {!status && <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />}

        {codes && (
          <View style={styles.codesBox}>
            <Text style={styles.codesTitle}>Tes codes de secours</Text>
            <Text style={styles.codesHint}>
              Note-les maintenant : ils ne seront plus jamais affichés. Chacun ne
              sert qu’une fois, et c’est le seul moyen d’entrer si tu perds ton
              téléphone.
            </Text>
            <View style={styles.codesGrid}>
              {codes.map((code) => <Text key={code} style={styles.codeItem}>{code}</Text>)}
            </View>
          </View>
        )}

        {status && (
          <>
            {/* ── Code par e-mail ──────────────────────────────────────── */}
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Ionicons name="mail-outline" size={20} color={colors.textSecondary} />
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle}>Code par e-mail</Text>
                  <Text style={styles.cardSub}>
                    {status.emailEnabled
                      ? `Actif — envoyé à ${status.emailHint ?? 'ton adresse'}.`
                      : status.hasEmail
                        ? `Un code sera envoyé à ${status.emailHint ?? 'ton adresse'}.`
                        : 'Aucune adresse e-mail sur ce compte.'}
                  </Text>
                </View>
                <Tappable
                  style={[styles.btn, status.emailEnabled && styles.btnGhost]}
                  disabled={busy || (!status.emailEnabled && (!status.hasEmail || !status.mailAvailable))}
                  onPress={() => (status.emailEnabled ? setPendingAction('email') : startEmail())}
                >
                  <Text style={[styles.btnText, status.emailEnabled && styles.btnGhostText]}>
                    {status.emailEnabled ? 'Désactiver' : 'Activer'}
                  </Text>
                </Tappable>
              </View>

              {!status.mailAvailable && !status.emailEnabled && (
                <Text style={styles.warn}>
                  L’envoi d’e-mails n’est pas configuré sur le serveur : méthode
                  indisponible pour l’instant.
                </Text>
              )}

              {emailStep && !status.emailEnabled && (
                <View style={styles.inlineRow}>
                  <TextInput
                    style={styles.input}
                    value={emailCode}
                    onChangeText={setEmailCode}
                    placeholder="Code reçu"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="number-pad"
                  />
                  <Tappable style={styles.btn} disabled={busy || !emailCode.trim()} onPress={confirmEmail}>
                    <Text style={styles.btnText}>Valider</Text>
                  </Tappable>
                </View>
              )}
            </View>

            {/* ── Application d'authentification ───────────────────────── */}
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Ionicons name="phone-portrait-outline" size={20} color={colors.textSecondary} />
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle}>Application d’authentification</Text>
                  <Text style={styles.cardSub}>
                    {status.totpEnabled
                      ? 'Active — code renouvelé toutes les 30 secondes.'
                      : 'Google Authenticator, 1Password… Fonctionne sans réseau.'}
                  </Text>
                </View>
                <Tappable
                  style={[styles.btn, status.totpEnabled && styles.btnGhost]}
                  disabled={busy}
                  onPress={() => (status.totpEnabled ? setPendingAction('totp') : startTotp())}
                >
                  <Text style={[styles.btnText, status.totpEnabled && styles.btnGhostText]}>
                    {status.totpEnabled ? 'Désactiver' : 'Activer'}
                  </Text>
                </Tappable>
              </View>

              {totpSetup && !status.totpEnabled && (
                <View style={{ gap: 12, marginTop: 12 }}>
                  <Image source={{ uri: totpSetup.qr }} style={styles.qr} resizeMode="contain" />
                  <Text style={styles.cardSub}>
                    Impossible de scanner ? Saisis cette clé :
                  </Text>
                  <Text selectable style={styles.secret}>{totpSetup.secret}</Text>
                  <View style={styles.inlineRow}>
                    <TextInput
                      style={styles.input}
                      value={totpCode}
                      onChangeText={setTotpCode}
                      placeholder="Code de l’app"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="number-pad"
                    />
                    <Tappable style={styles.btn} disabled={busy || !totpCode.trim()} onPress={confirmTotp}>
                      <Text style={styles.btnText}>Valider</Text>
                    </Tappable>
                  </View>
                </View>
              )}
            </View>

            {/* ── Codes de secours ─────────────────────────────────────── */}
            {(status.emailEnabled || status.totpEnabled) && (
              <View style={styles.card}>
                <View style={styles.cardHead}>
                  <Ionicons name="key-outline" size={20} color={colors.textSecondary} />
                  <View style={styles.cardText}>
                    <Text style={styles.cardTitle}>Codes de secours</Text>
                    <Text style={styles.cardSub}>{status.recoveryCodesLeft} code(s) encore utilisable(s).</Text>
                  </View>
                  <Tappable style={[styles.btn, styles.btnGhost]} onPress={() => setPendingAction('all')}>
                    <Text style={[styles.btnText, styles.btnGhostText]}>Regénérer</Text>
                  </Tappable>
                </View>
              </View>
            )}

            {/* Le mot de passe est exigé pour tout ce qui AFFAIBLIT le compte :
                une session volée ne doit pas pouvoir retirer la protection. */}
            {pendingAction && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>
                  {pendingAction === 'all' ? 'Regénérer les codes de secours' : 'Désactiver cette méthode'}
                </Text>
                <Text style={styles.cardSub}>Confirme avec ton mot de passe.</Text>
                <View style={styles.inlineRow}>
                  <TextInput
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Mot de passe"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry
                  />
                  <Tappable style={styles.btn} disabled={busy || !password} onPress={confirmPassword}>
                    <Text style={styles.btnText}>Confirmer</Text>
                  </Tappable>
                </View>
                <Tappable onPress={() => { setPendingAction(null); setPassword(''); }} style={{ paddingVertical: 10 }}>
                  <Text style={styles.cancel}>Annuler</Text>
                </Tappable>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 17, fontFamily: fonts.bold, color: colors.textPrimary },
  content: { paddingHorizontal: 16, gap: 14 },
  intro: { fontSize: 14, fontFamily: fonts.regular, color: colors.textSecondary, lineHeight: 20 },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardText: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 15, fontFamily: fonts.bold, color: colors.textPrimary },
  cardSub: { fontSize: 13, fontFamily: fonts.regular, color: colors.textSecondary, marginTop: 2, lineHeight: 18 },
  warn: { fontSize: 13, fontFamily: fonts.regular, color: colors.red, marginTop: 8, lineHeight: 18 },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  btnText: { fontSize: 13, fontFamily: fonts.bold, color: colors.white },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  btnGhostText: { color: colors.textPrimary },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontFamily: fonts.regular,
    fontSize: 15,
  },
  qr: { width: 200, height: 200, alignSelf: 'center', backgroundColor: '#fff', borderRadius: 12 },
  secret: { fontSize: 15, color: colors.textPrimary, letterSpacing: 2, textAlign: 'center' },
  codesBox: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 16,
    padding: 14,
  },
  codesTitle: { fontSize: 15, fontFamily: fonts.bold, color: colors.textPrimary },
  codesHint: { fontSize: 13, fontFamily: fonts.regular, color: colors.textSecondary, marginTop: 4, lineHeight: 18 },
  codesGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 },
  codeItem: {
    width: '50%',
    fontSize: 15,
    color: colors.textPrimary,
    letterSpacing: 1,
    paddingVertical: 3,
  },
  cancel: { fontSize: 13, fontFamily: fonts.regular, color: colors.textSecondary, textAlign: 'center' },
});
