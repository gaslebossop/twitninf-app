import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useStartupPopupSlot } from '../contexts/StartupPopupContext';
import apiService from '../services/api';
import { ConsentState } from '../types/api';
import { colors, fonts, withAlpha } from '../theme';

// Court, et volontairement plus court que toutes les autres popups (la plus
// rapide s'enregistre a 1 s). Le consentement est prioritaire dans la file :
// s'il arrivait apres, une autre modale prendrait le creneau puis serait
// remplacee des l'arrivee du consentement — l'utilisateur verrait un
// clignotement. Le delai ne sert qu'a laisser le profil se charger.
const STARTUP_SETTLE_MS = 600;

interface ConsentSheetProps {
  visible: boolean;
  /**
   * `gate` : premiere acceptation, non refermable — le socle conditionne
   * l'usage du compte. `settings` : retour sur les seules options, refermable.
   */
  mode: 'gate' | 'settings';
  onClose?: () => void;
  onSaved?: () => void;
}

/**
 * Ecran de consentement, partage entre la popup de demarrage et les reglages.
 *
 * Tout le contenu (finalites, libelles, version) vient du serveur : rien n'est
 * code ici. Une finalite ajoutee cote API apparait donc sans nouvelle version
 * de l'application, ce qui evite le pire des cas — un texte legal faux chez
 * les personnes qui n'ont pas mis a jour.
 */
export function ConsentSheet({ visible, mode, onClose, onSaved }: ConsentSheetProps) {
  const insets = useSafeAreaInsets();
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
      // Dans les reglages on repart des choix deja faits ; a la premiere
      // acceptation tout part a faux : une case precochee ne vaut pas un
      // consentement.
      setAnswers(
        mode === 'settings'
          ? { ...response.data.preferences }
          : response.data.optional.reduce((acc, purpose) => ({ ...acc, [purpose.key]: false }), {}),
      );
    } catch (loadError: any) {
      setError(loadError?.message || 'Impossible de charger les informations.');
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const toggle = useCallback((key: string) => {
    setError(null);
    setAnswers((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const requiredKeys = useMemo(() => (state?.required || []).map((p) => p.key), [state]);
  const requiredSatisfied = mode === 'settings' || requiredKeys.every((key) => answers[key] === true);

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
      if (mode !== 'settings') {
        requiredKeys.forEach((key) => { accepted[key] = true; });
      }
      state.optional.forEach((purpose) => {
        accepted[purpose.key] = answers[purpose.key] === true;
      });

      const response = await apiService.recordConsent({
        version: state.version,
        accepted,
        source: mode === 'settings' ? 'settings' : 'startup_gate',
      });
      if (!response.success) throw new Error(response.message || 'Enregistrement impossible');

      // Le profil en memoire porte `needs_consent` : sans ce rafraichissement,
      // la popup se reposerait au redemarrage.
      await refreshCurrentUser?.();
      onSaved?.();
      onClose?.();
    } catch (saveError: any) {
      setError(saveError?.message || 'Impossible d\'enregistrer ces choix.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      // En mode `gate` le retour arriere Android ne ferme rien : le socle n'est
      // pas reportable, et une popup qu'on esquive ne prouve aucun accord.
      onRequestClose={mode === 'settings' ? onClose : () => {}}
    >
      <View
        style={[styles.backdrop, {
          paddingTop: Math.max(insets.top, 16),
          paddingBottom: Math.max(insets.bottom, 16),
        }]}
      >
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Ionicons name="shield-checkmark-outline" size={26} color={colors.accentBright} />
            </View>
            {mode === 'settings' ? (
              <Pressable onPress={onClose} hitSlop={12} style={styles.closeButton}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            ) : null}
          </View>

          <Text style={styles.title}>
            {mode === 'settings' ? 'Tes données' : 'Avant de commencer'}
          </Text>
          <Text style={styles.subtitle}>
            {mode === 'settings'
              ? 'Tu peux revenir sur ces choix à tout moment. Retirer un accord est aussi simple que de le donner.'
              : 'TwitNinf a besoin de ton accord sur quelques points. Les trois premiers sont nécessaires au service ; les suivants sont libres et l’application fonctionne sans.'}
          </Text>

          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.accentBright} />
            </View>
          ) : !state ? (
            <>
              <Text style={styles.error}>{error || 'Informations indisponibles.'}</Text>
              <Pressable style={styles.primaryButton} onPress={load}>
                <Text style={styles.primaryText}>Réessayer</Text>
              </Pressable>
            </>
          ) : (
            <>
              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
              >
                {mode === 'settings' ? null : (
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
                  </>
                )}

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
              </ScrollView>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                style={[styles.primaryButton, !requiredSatisfied && styles.primaryButtonDisabled]}
                onPress={submit}
                disabled={saving || !requiredSatisfied}
              >
                {saving ? (
                  <ActivityIndicator color={colors.bg} />
                ) : (
                  <Text style={styles.primaryText}>
                    {mode === 'settings' ? 'Enregistrer mes choix' : 'Continuer'}
                  </Text>
                )}
              </Pressable>
              {mode === 'settings' ? null : (
                <Text style={styles.footnote}>
                  Tu pourras modifier les options libres dans Réglages, à tout moment.
                </Text>
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
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

  return <ConsentSheet visible={visible} mode="gate" />;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', paddingHorizontal: 20, backgroundColor: 'rgba(1,0,8,0.9)' },
  card: { width: '100%', maxWidth: 480, maxHeight: '92%', alignSelf: 'center', padding: 22, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, backgroundColor: colors.surfaceElevated },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  iconCircle: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: colors.accentMuted, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(colors.accent, 0.45) },
  closeButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  title: { marginTop: 18, color: colors.textPrimary, fontSize: 24, letterSpacing: -0.5, fontFamily: fonts.display },
  subtitle: { marginTop: 8, color: colors.textSecondary, fontSize: 14, lineHeight: 21, fontFamily: fonts.regular },
  loading: { paddingVertical: 46, alignItems: 'center' },
  scroll: { marginTop: 18 },
  scrollContent: { paddingBottom: 6 },
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
  error: { marginTop: 12, color: colors.red, fontSize: 12, lineHeight: 18, fontFamily: fonts.semibold },
  primaryButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 16, borderRadius: 16, backgroundColor: colors.textPrimary },
  primaryButtonDisabled: { opacity: 0.4 },
  primaryText: { color: colors.bg, fontSize: 14, fontFamily: fonts.bold },
  footnote: { marginTop: 10, textAlign: 'center', color: colors.textMuted, fontSize: 11, lineHeight: 16, fontFamily: fonts.regular },
});
