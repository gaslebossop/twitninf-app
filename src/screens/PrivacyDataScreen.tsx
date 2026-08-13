import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, fonts, statusBarStyle, withAlpha } from '../theme';
import { AppHeader, ScreenBackground } from '../components/ui';
import { toast } from '../components/ui/Toast';
import apiService from '../services/api';
import { ConsentState } from '../types/api';

interface Props {
  navigation: any;
}

/**
 * « Tes données » : retour sur les accords déjà donnés.
 *
 * C'est une PAGE et non une popup : la première acceptation (le socle, bloquant)
 * reste une modale dans `ConsentGate`, mais y revenir plus tard est une
 * consultation ordinaire des réglages — le RGPD (art. 7.3) demande que retirer
 * un accord soit aussi simple que de le donner, donc ça se range où on range le
 * reste, pas derrière une fenêtre qui s'impose.
 *
 * Tout le contenu (finalités, libellés, version) vient du serveur : une
 * finalité ajoutée côté API apparaît sans nouvelle version de l'application.
 */
const PrivacyDataScreen: React.FC<Props> = ({ navigation }) => {
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
      setAnswers({ ...response.data.preferences });
    } catch (loadError: any) {
      setError(loadError?.message || 'Impossible de charger les informations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = useCallback((key: string) => {
    setError(null);
    setAnswers((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Rien à enregistrer tant que rien n'a bougé : le bouton reste inerte plutôt
  // que d'envoyer une écriture identique à ce qui est déjà en base.
  const dirty = useMemo(() => {
    if (!state) return false;
    return state.optional.some((purpose) => answers[purpose.key] !== state.preferences[purpose.key]);
  }, [state, answers]);

  const submit = async () => {
    if (!state || saving) return;
    setSaving(true);
    setError(null);
    try {
      const accepted: Record<string, boolean> = {};
      state.optional.forEach((purpose) => {
        accepted[purpose.key] = answers[purpose.key] === true;
      });

      const response = await apiService.recordConsent({
        version: state.version,
        accepted,
        source: 'settings',
      });
      if (!response.success) throw new Error(response.message || 'Enregistrement impossible');

      setState((prev) => (prev ? { ...prev, preferences: { ...prev.preferences, ...accepted } } : prev));
      toast.success('Choix enregistrés');
    } catch (saveError: any) {
      setError(saveError?.message || 'Impossible d\'enregistrer ces choix.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenBackground>
      <View style={styles.safe}>
        <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
        <AppHeader navigation={navigation} title="Tes données" />

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : !state ? (
          <View style={styles.loading}>
            <Text style={styles.error}>{error || 'Informations indisponibles.'}</Text>
            <Pressable style={styles.primaryButton} onPress={load}>
              <Text style={styles.primaryText}>Réessayer</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <Text style={styles.intro}>
              Tu peux revenir sur ces choix à tout moment. Retirer un accord est aussi simple
              que de le donner.
            </Text>

            <Text style={styles.sectionLabel}>Libre — tu peux refuser</Text>
            {state.optional.map((purpose) => (
              <ConsentRow
                key={purpose.key}
                title={purpose.title}
                summary={purpose.summary}
                documentPath={purpose.documentPath}
                checked={answers[purpose.key] === true}
                onToggle={() => toggle(purpose.key)}
              />
            ))}

            <Text style={styles.sectionLabel}>Ce qui s'applique dans tous les cas</Text>
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

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              style={[styles.primaryButton, (!dirty || saving) && styles.primaryButtonDisabled]}
              onPress={submit}
              disabled={saving || !dirty}
            >
              {saving ? (
                <ActivityIndicator color={colors.bg} />
              ) : (
                <Text style={styles.primaryText}>Enregistrer mes choix</Text>
              )}
            </Pressable>

            <Text style={styles.version}>Version du socle : {state.version}</Text>
          </ScrollView>
        )}
      </View>
    </ScreenBackground>
  );
};

function ConsentRow({
  title,
  summary,
  documentPath,
  checked,
  onToggle,
}: {
  title: string;
  summary: string;
  documentPath?: string;
  checked: boolean;
  onToggle: () => void;
}) {
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
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSummary}>{summary}</Text>
        {documentPath ? (
          <Pressable onPress={openDocument} hitSlop={8} style={styles.docLinkButton}>
            <Text style={styles.docLink}>Lire le document</Text>
            <Ionicons name="open-outline" size={13} color={colors.accent} />
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  content: { padding: 16, paddingBottom: 40 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  intro: {
    color: colors.textSecondary,
    fontSize: 14,
    fontFamily: fonts.regular,
    lineHeight: 20,
  },
  sectionLabel: {
    marginTop: 22,
    marginBottom: 10,
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    fontFamily: fonts.semibold,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    marginBottom: 10,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowChecked: { borderColor: colors.accent, backgroundColor: withAlpha(colors.accent, 0.08) },
  checkbox: {
    width: 23,
    height: 23,
    marginTop: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
  },
  checkboxChecked: { borderColor: colors.accent, backgroundColor: colors.accent },
  rowBody: { flex: 1 },
  rowTitle: { color: colors.textPrimary, fontSize: 15, fontFamily: fonts.bold },
  rowSummary: {
    marginTop: 4,
    color: colors.textSecondary,
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: fonts.regular,
  },
  docLinkButton: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, paddingVertical: 2 },
  docLink: { color: colors.accent, fontSize: 12, fontFamily: fonts.semibold },
  noticeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 4, marginBottom: 12 },
  noticeIcon: { marginTop: 1 },
  noticeBody: { flex: 1 },
  noticeTitle: { color: colors.textSecondary, fontSize: 13, fontFamily: fonts.semibold },
  noticeText: { marginTop: 3, color: colors.textMuted, fontSize: 12, lineHeight: 18, fontFamily: fonts.regular },
  version: { marginTop: 16, color: colors.textMuted, fontSize: 11, fontFamily: fonts.regular },
  error: { marginTop: 14, color: colors.red, fontSize: 12, lineHeight: 18, fontFamily: fonts.semibold },
  primaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    borderRadius: 16,
    backgroundColor: colors.accent,
  },
  primaryButtonDisabled: { opacity: 0.4 },
  primaryText: { color: colors.onAccent, fontSize: 14, fontFamily: fonts.bold },
});

export default PrivacyDataScreen;
