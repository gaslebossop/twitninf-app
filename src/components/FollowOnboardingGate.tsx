import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
import { OnboardingSuggestion } from '../types/api';
import { colors, fonts, withAlpha } from '../theme';

// Simple attente du profil : l'ordre vient de la file, pas de ce delai
// (voir REGISTRATION_WINDOW_MS dans StartupPopupContext).
const STARTUP_SETTLE_MS = 250;

/**
 * Choix des premiers abonnements, a la creation du compte.
 *
 * Ce n'est pas un ecran de bienvenue decoratif : sans abonnement, le
 * recommandeur n'a AUCUN signal (pas de like, pas d'auteur favori, pas d'heure
 * d'activite) et sert un fil generique identique pour tout le monde. Les trois
 * comptes choisis ici sont ce qui distingue le premier fil, et ils pesent
 * volontairement plus lourd tant que le compte n'a pas d'historique reel.
 */
export default function FollowOnboardingGate() {
  if (__DEV__) console.count('[loop-hunt] FollowOnboardingGate render');
  const { user, isAuthenticated, refreshCurrentUser } = useAuth();
  const [ready, setReady] = useState(false);
  const [suggestions, setSuggestions] = useState<OnboardingSuggestion[]>([]);
  const [minimum, setMinimum] = useState(user?.follow_onboarding_minimum ?? 3);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On n'ouvre l'ecran qu'une fois le consentement passe : `needs_consent`
  // reste vrai tant qu'il n'est pas accorde, et la file des popups donne de
  // toute facon la priorite au socle legal.
  const wanted = Boolean(
    isAuthenticated && user && ready && user.needs_follow_onboarding && !user.needs_consent
  );
  const visible = useStartupPopupSlot('follow_onboarding', wanted);

  useEffect(() => {
    setReady(false);
    if (!user?.id || !isAuthenticated) return;
    const timer = setTimeout(() => setReady(true), STARTUP_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [isAuthenticated, user?.id]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiService.getOnboardingSuggestions(12);
      if (!response.success || !response.data) {
        throw new Error(response.message || 'Chargement impossible');
      }
      setSuggestions(response.data.suggestions || []);
      if (response.data.minimum_follows) setMinimum(response.data.minimum_follows);
    } catch (loadError: any) {
      setError(loadError?.message || 'Impossible de charger les suggestions.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const toggle = useCallback((id: string) => {
    setError(null);
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const enough = selected.length >= minimum;
  const remaining = Math.max(0, minimum - selected.length);

  // Le serveur peut renvoyer moins de comptes que le minimum exige : sur une
  // plateforme jeune, peu de comptes publient. Mieux vaut laisser passer que
  // bloquer quelqu'un sur un ecran qu'il ne peut pas satisfaire.
  const impossible = !loading && suggestions.length > 0 && suggestions.length < minimum;

  const submit = async () => {
    if (saving) return;
    if (!enough && !impossible) {
      setError(`Choisis encore ${remaining} compte${remaining > 1 ? 's' : ''}.`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await apiService.submitOnboardingFollows(
        impossible ? suggestions.map((s) => s.id) : selected
      );
      if (!response.success) throw new Error(response.message || 'Enregistrement impossible');
      // Le profil porte `needs_follow_onboarding` : sans ce rafraichissement,
      // l'ecran se rouvrirait au prochain demarrage.
      await refreshCurrentUser?.();
    } catch (saveError: any) {
      setError(saveError?.message || 'Impossible d\'enregistrer ces abonnements.');
    } finally {
      setSaving(false);
    }
  };

  const sorted = useMemo(
    () => [...suggestions].sort((a, b) => b.followers - a.followers),
    [suggestions],
  );

  if (!user) return null;

  return (
    <StartupStepPage
      visible={visible}
      icon="people-outline"
      title="Choisis qui tu veux suivre"
      subtitle={
        impossible
          ? 'Voici les comptes les plus actifs de TwitNinf. Ils composeront ton premier fil.'
          : `Suis au moins ${minimum} comptes parmi les plus actifs. C'est ce qui remplit ton fil au départ — tu pourras te désabonner quand tu veux.`
      }
      footer={
        suggestions.length > 0 ? (
          <>
            {error ? <Text style={stepStyles.error}>{error}</Text> : null}
            <Pressable
              style={[stepStyles.primaryButton, !enough && !impossible && stepStyles.primaryButtonDisabled]}
              onPress={submit}
              disabled={saving || (!enough && !impossible)}
            >
              {saving ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={stepStyles.primaryText}>
                  {impossible
                    ? 'Suivre ces comptes'
                    : enough
                      ? `Suivre ${selected.length} compte${selected.length > 1 ? 's' : ''}`
                      : `Encore ${remaining} compte${remaining > 1 ? 's' : ''}`}
                </Text>
              )}
            </Pressable>
          </>
        ) : null
      }
    >
      {loading ? (
        <View style={stepStyles.loading}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : suggestions.length === 0 ? (
        <>
          <Text style={stepStyles.error}>{error || 'Aucune suggestion disponible.'}</Text>
          <Pressable style={[stepStyles.primaryButton, { marginTop: 16 }]} onPress={load}>
            <Text style={stepStyles.primaryText}>Réessayer</Text>
          </Pressable>
        </>
      ) : (
        sorted.map((account) => (
          <SuggestionRow
            key={account.id}
            account={account}
            selected={selected.includes(account.id)}
            onToggle={() => toggle(account.id)}
          />
        ))
      )}
    </StartupStepPage>
  );
}

function SuggestionRow({
  account,
  selected,
  onToggle,
}: {
  account: OnboardingSuggestion;
  selected: boolean;
  onToggle: () => void;
}) {
  const initial = (account.full_name || account.username || '?').charAt(0).toUpperCase();

  return (
    <Pressable
      onPress={onToggle}
      style={[styles.row, selected && styles.rowSelected]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`Suivre ${account.username}`}
    >
      {account.avatar ? (
        <Image source={{ uri: account.avatar }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarInitial}>{initial}</Text>
        </View>
      )}

      <View style={styles.rowBody}>
        <View style={styles.nameLine}>
          <Text style={styles.rowName} numberOfLines={1}>{account.full_name || account.username}</Text>
          {account.verified ? (
            <Ionicons name="checkmark-circle" size={14} color={colors.accentBright} />
          ) : null}
        </View>
        <Text style={styles.rowHandle} numberOfLines={1}>@{account.username}</Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {account.followers} abonné{account.followers > 1 ? 's' : ''} · {account.recent_tweets} publication{account.recent_tweets > 1 ? 's' : ''} ce mois-ci
        </Text>
      </View>

      <View style={[styles.followPill, selected && styles.followPillSelected]}>
        <Text style={[styles.followPillText, selected && styles.followPillTextSelected]}>
          {selected ? 'Suivi' : 'Suivre'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 11, marginBottom: 8, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  rowSelected: { borderColor: withAlpha(colors.accent, 0.5), backgroundColor: colors.accentMuted },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentMuted },
  avatarInitial: { color: colors.textPrimary, fontSize: 17, fontFamily: fonts.bold },
  rowBody: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rowName: { flexShrink: 1, color: colors.textPrimary, fontSize: 14, fontFamily: fonts.semibold },
  rowHandle: { marginTop: 1, color: colors.textSecondary, fontSize: 12, fontFamily: fonts.regular },
  rowMeta: { marginTop: 3, color: colors.textMuted, fontSize: 11, fontFamily: fonts.regular },
  followPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: colors.borderStrong },
  followPillSelected: { borderColor: colors.textPrimary, backgroundColor: colors.textPrimary },
  followPillText: { color: colors.textPrimary, fontSize: 12, fontFamily: fonts.semibold },
  followPillTextSelected: { color: colors.bg },
});
