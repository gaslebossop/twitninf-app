import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useStartupPopupSlot } from '../contexts/StartupPopupContext';
import StartupStepPage, { stepStyles } from './StartupStepPage';
import apiService from '../services/api';
import { ConsentState } from '../types/api';
import { colors, fonts, withAlpha } from '../theme';

// Laisse le profil se charger, rien de plus. L'ordre d'affichage ne depend
// PAS de ce delai : la file recense toutes les etapes avant d'en designer une
// (voir REGISTRATION_WINDOW_MS dans StartupPopupContext). Il doit simplement
// rester dans cette fenetre.
const STARTUP_SETTLE_MS = 250;

interface ConsentSheetProps {
  visible: boolean;
}

/**
 * Premiere acceptation du socle legal, au demarrage. Non refermable : le socle
 * conditionne l'usage du compte.
 *
 * Y revenir plus tard est une consultation ordinaire des reglages, et vit donc
 * dans une vraie page — voir `screens/PrivacyDataScreen`.
 *
 * Tout le contenu (finalites, libelles, version) vient du serveur : rien n'est
 * code ici. Une finalite ajoutee cote API apparait donc sans nouvelle version
 * de l'application, ce qui evite le pire des cas — un texte legal faux chez
 * les personnes qui n'ont pas mis a jour.
 */
export function ConsentSheet({ visible }: ConsentSheetProps) {
  const { refreshCurrentUser } = useAuth();
  const [state, setState] = useState<ConsentState | null>(null);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiService.getConsentState();
      if (!response.success || !response.data) {
        throw new Error(response.message || 'Chargement impossible');
      }
      setState(response.data);
      // Tout part a faux : une case precochee ne vaut pas un consentement.
      setAnswers(
        response.data.optional.reduce((acc, purpose) => ({ ...acc, [purpose.key]: false }), {}),
      );
    } catch (loadError: any) {
      setError(loadError?.message || 'Impossible de charger les informations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const toggle = useCallback((key: string) => {
    setError(null);
    setAnswers((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const requiredKeys = useMemo(() => (state?.required || []).map((p) => p.key), [state]);
  const requiredSatisfied = requiredKeys.every((key) => answers[key] === true);

  const submit = async () => {
    if (!state || saving) return;
    if (!requiredSatisfied) {
      setError('Il faut accepter les conditions et confirmer ton age pour continuer.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const accepted: Record<string, boolean> = {};
      requiredKeys.forEach((key) => { accepted[key] = true; });
      state.optional.forEach((purpose) => {
        accepted[purpose.key] = answers[purpose.key] === true;
      });

      const response = await apiService.recordConsent({
        version: state.version,
        accepted,
        source: 'startup_gate',
      });
      if (!response.success) throw new Error(response.message || 'Enregistrement impossible');

      // Le profil en memoire porte `needs_consent` : sans ce rafraichissement,
      // l'etape se reposerait au redemarrage.
      await refreshCurrentUser?.();
    } catch (saveError: any) {
      setError(saveError?.message || 'Impossible d\'enregistrer ces choix.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <StartupStepPage
      visible={visible}
      icon="shield-checkmark-outline"
      title="Avant de commencer"
      subtitle="TwitNinf a besoin de ton accord sur quelques points. Les trois premiers sont nécessaires au service ; les suivants sont libres et l’application fonctionne sans."
      footer={
        state ? (
          <>
            {error ? <Text style={stepStyles.error}>{error}</Text> : null}
            <Pressable
              style={[stepStyles.primaryButton, !requiredSatisfied && stepStyles.primaryButtonDisabled]}
              onPress={submit}
              disabled={saving || !requiredSatisfied}
            >
              {saving ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={stepStyles.primaryText}>Continuer</Text>
              )}
            </Pressable>
            <Text style={stepStyles.footnote}>
              Tu pourras modifier les options libres dans Réglages, à tout moment.
            </Text>
          </>
        ) : null
      }
    >
      {loading ? (
        <View style={stepStyles.loading}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : !state ? (
        <>
          <Text style={stepStyles.error}>{error || 'Informations indisponibles.'}</Text>
          <Pressable style={[stepStyles.primaryButton, { marginTop: 16 }]} onPress={load}>
            <Text style={stepStyles.primaryText}>Réessayer</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.sectionLabel}>Nécessaire au service</Text>
          {state.required.map((purpose) => (
            <ConsentRow
              key={purpose.key}
              title={purpose.title}
              summary={purpose.summary}
              documentPath={purpose.documentPath}
              checked={answers[purpose.key] === true}
              onToggle={() => toggle(purpose.key)}
              required
            />
          ))}

          <Text style={styles.sectionLabel}>Libre — tu peux refuser</Text>
          {state.optional.map((purpose) => (
            <ConsentRow
              key={purpose.key}
              title={purpose.title}
              summary={purpose.summary}
              checked={answers[purpose.key] === true}
              onToggle={() => toggle(purpose.key)}
            />
          ))}

          <Text style={styles.sectionLabel}>Ce qui s’applique dans tous les cas</Text>
          {state.notices.map((notice) => (
            <View key={notice.key} style={styles.noticeRow}>
              <Ionicons
                name="information-circle-outline"
                size={17}
                color={colors.textMuted}
                style={styles.noticeIcon}
              />
              <View style={styles.noticeBody}>
                <Text style={styles.noticeTitle}>{notice.title}</Text>
                <Text style={styles.noticeText}>{notice.summary}</Text>
              </View>
            </View>
          ))}

          <Text style={styles.version}>Version du socle : {state.version}</Text>
        </>
      )}
    </StartupStepPage>
  );
}

function ConsentRow({
  title,
  summary,
  documentPath,
  checked,
  onToggle,
  required = false,
}: {
  title: string;
  summary: string;
  documentPath?: string;
  checked: boolean;
  onToggle: () => void;
  required?: boolean;
}) {
  // Le document s'ouvre dans le navigateur, hors de la `<Modal>` : une vue web
  // empilée sous une modale React Native ne s'affiche pas de façon fiable sur
  // Android, et le texte doit rester lisible et partageable.
  const openDocument = () => {
    if (!documentPath) return;
    const base = apiService.getConnectionStatus().baseURL.replace(/\/+$/, '');
    Linking.openURL(`${base}${documentPath}`).catch(() => {});
  };

  return (
    <Pressable
      onPress={onToggle}
      style={[styles.row, checked && styles.rowChecked]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={title}
    >
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked ? <Ionicons name="checkmark" size={15} color={colors.bg} /> : null}
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>
          {title}
          {required ? <Text style={styles.requiredMark}> — obligatoire</Text> : null}
        </Text>
        <Text style={styles.rowSummary}>{summary}</Text>
        {documentPath ? (
          <Pressable onPress={openDocument} hitSlop={8} style={styles.docLinkButton}>
            <Text style={styles.docLink}>Lire le document</Text>
            <Ionicons name="open-outline" size={13} color={colors.accentBright} />
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * Popup de demarrage : s'affiche a la creation du compte, et a toute connexion
 * si le socle n'a jamais ete accepte ou a change de version.
 *
 * `needs_consent` est calcule par le serveur : l'app ne compare aucune version
 * elle-meme, sinon une version ancienne se croirait a jour.
 */
export default function ConsentGate() {
  const { user, isAuthenticated } = useAuth();
  const [ready, setReady] = useState(false);

  const needsConsent = Boolean(user?.needs_consent);
  const wanted = Boolean(isAuthenticated && user && ready && needsConsent);
  const visible = useStartupPopupSlot('consent', wanted);

  useEffect(() => {
    setReady(false);
    if (!user?.id || !isAuthenticated) return;
    const timer = setTimeout(() => setReady(true), STARTUP_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [isAuthenticated, user?.id]);

  if (!user) return null;

  return <ConsentSheet visible={visible} />;
}

const styles = StyleSheet.create({
  sectionLabel: { marginTop: 14, marginBottom: 9, color: colors.textMuted, fontSize: 11, letterSpacing: 0.7, textTransform: 'uppercase', fontFamily: fonts.semibold },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 13, marginBottom: 8, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  rowChecked: { borderColor: withAlpha(colors.accent, 0.5), backgroundColor: colors.accentMuted },
  checkbox: { width: 23, height: 23, marginTop: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 7, borderWidth: 1.5, borderColor: colors.borderStrong },
  checkboxChecked: { borderColor: colors.textPrimary, backgroundColor: colors.textPrimary },
  rowBody: { flex: 1 },
  rowTitle: { color: colors.textPrimary, fontSize: 14, fontFamily: fonts.semibold },
  requiredMark: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.medium },
  rowSummary: { marginTop: 4, color: colors.textSecondary, fontSize: 12, lineHeight: 18, fontFamily: fonts.regular },
  docLinkButton: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, paddingVertical: 2 },
  docLink: { color: colors.accentBright, fontSize: 12, fontFamily: fonts.semibold },
  noticeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 4, marginBottom: 11 },
  noticeIcon: { marginTop: 1 },
  noticeBody: { flex: 1 },
  noticeTitle: { color: colors.textSecondary, fontSize: 13, fontFamily: fonts.semibold },
  noticeText: { marginTop: 3, color: colors.textMuted, fontSize: 12, lineHeight: 18, fontFamily: fonts.regular },
  version: { marginTop: 10, color: colors.textMuted, fontSize: 11, fontFamily: fonts.regular },
});
