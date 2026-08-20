import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import { useAuth } from '../contexts/AuthContext';
import { useStartupPopupSlot } from '../contexts/StartupPopupContext';
import StartupStepPage, { stepStyles } from './StartupStepPage';
import apiService from '../services/api';
import { colors, fonts, withAlpha } from '../theme';

type Step = 'demographics' | 'location';
type StoredPermission = 'granted' | 'denied' | 'restricted' | 'unavailable';

// Simple attente du profil : l'ordre vient de la file, pas de ce delai
// (voir REGISTRATION_WINDOW_MS dans StartupPopupContext).
const STARTUP_SETTLE_MS = 250;
/**
 * Age au-dela duquel un retour au premier plan vaut une nouvelle connexion.
 *
 * La capture ne se faisait qu'au demarrage A FROID. Or une application mobile
 * n'est presque jamais relancee : elle est mise de cote et reprise. Quelqu'un
 * qui rouvre twitninf trois fois par jour sans jamais le tuer ne poussait donc
 * sa position qu'une fois — et la presence sur la Carte NF expire au bout de
 * 8 h (`ttl_hours`). Resultat : une epingle qui disparait alors que la personne
 * est en train de s'en servir.
 *
 * Une demi-heure laisse la presence largement fraiche sans rejouer une capture
 * a chaque va-et-vient entre deux applications.
 */
const REFRESH_AFTER_MS = 30 * 60 * 1000;
const makeCaptureKey = (userId: string) =>
  `${userId}:${Date.now()}:${Math.random().toString(36).slice(2, 12)}`;

const validBirthday = (day: number, month: number) => {
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  const maxDay = new Date(2024, month, 0).getDate();
  return Number.isInteger(day) && day >= 1 && day <= maxDay;
};

export default function ProfileCompletionGate() {
  if (__DEV__) console.count('[loop-hunt] ProfileCompletionGate render');
  const { user, isAuthenticated, refreshCurrentUser } = useAuth();
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState<Step>('demographics');
  const [age, setAge] = useState('');
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captured, setCaptured] = useState(false);
  const captureKey = useRef('');
  // Verrou synchrone contre les ré-entrées de l'effet de capture ci-dessous
  // (voir son commentaire) — remis à zéro en même temps que `captureKey`,
  // donc à chaque changement d'identité, jamais entre deux rendus du même
  // utilisateur.
  const captureAttempted = useRef(false);
  /** Horodatage de la derniere capture reussie, pour l'echeance ci-dessus. */
  const lastCaptureAt = useRef(0);

  const needsDemographics = Boolean(user && !user.demographics_validated_at);
  const consent = user?.location_consent_status || 'undetermined';
  const needsLocationDecision = Boolean(user && consent === 'undetermined');
  const wanted = Boolean(isAuthenticated && user && ready && (needsDemographics || needsLocationDecision));
  const visible = useStartupPopupSlot('profile', wanted);

  useEffect(() => {
    setReady(false);
    setCaptured(false);
    setError(null);
    if (!user?.id || !isAuthenticated) {
      captureKey.current = '';
      captureAttempted.current = false;
      return;
    }
    captureKey.current = makeCaptureKey(user.id);
    captureAttempted.current = false;
    setAge(user.declared_age ? String(user.declared_age) : '');
    setDay(user.birth_day ? String(user.birth_day) : '');
    setMonth(user.birth_month ? String(user.birth_month) : '');
    setStep(user.demographics_validated_at ? 'location' : 'demographics');
    const timer = setTimeout(() => setReady(true), STARTUP_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    if (needsDemographics) setStep('demographics');
    else if (needsLocationDecision) setStep('location');
  }, [needsDemographics, needsLocationDecision]);

  const storePermissionOnly = useCallback(async (permissionStatus: StoredPermission) => {
    if (!captureKey.current) return;
    const response = await apiService.recordSessionLocation({
      captureKey: captureKey.current,
      permissionStatus,
      capturedAt: new Date().toISOString(),
    });
    if (!response.success) throw new Error(response.message || 'Enregistrement impossible');
    lastCaptureAt.current = Date.now();
    setCaptured(true);
    await refreshCurrentUser();
  }, [refreshCurrentUser]);

  const captureLocation = useCallback(async () => {
    if (!captureKey.current || captured) return;
    const lastKnown = await Location.getLastKnownPositionAsync({
      maxAge: 5 * 60 * 1000,
      requiredAccuracy: 1000,
    });
    const position = lastKnown || await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
      mayShowUserSettingsDialog: true,
    });

    let place: Location.LocationGeocodedAddress | undefined;
    try {
      [place] = await Location.reverseGeocodeAsync(position.coords);
    } catch {
      // La position reste exploitable si le geocodage inverse echoue.
    }

    const response = await apiService.recordSessionLocation({
      captureKey: captureKey.current,
      permissionStatus: 'granted',
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      countryCode: place?.isoCountryCode || null,
      country: place?.country || null,
      region: place?.region || null,
      city: place?.city || place?.district || null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
      capturedAt: new Date(position.timestamp).toISOString(),
    });
    if (!response.success) throw new Error(response.message || 'Enregistrement impossible');
    lastCaptureAt.current = Date.now();
    setCaptured(true);
  }, [captured]);

  // Aux connexions suivantes : une seule capture, sans reposer la question.
  //
  // `captureLocation`/`storePermissionOnly` changent d'identité à chaque
  // fois que `AuthContext` recalcule sa valeur mémoïsée (elles referment sur
  // `refreshCurrentUser`, recréée à chaque changement de `user`/
  // `isAuthenticated` — voir `AuthContext.tsx`) — et `storePermissionOnly`
  // appelle justement `refreshCurrentUser()` avant de se terminer. Sans
  // verrou synchrone, cette chaîne peut se rappeler elle-même : l'effet se
  // relance sur la nouvelle identité de `storePermissionOnly` AVANT que
  // `setCaptured(true)` (qui ne committe qu'à la résolution de l'appel
  // réseau) n'ait eu le temps de fermer la porte — une deuxième capture
  // démarre pendant que la première est encore en vol, chacune finissant par
  // rappeler `refreshCurrentUser()` à son tour. C'est exactement la
  // signature d'un « Maximum update depth exceeded » : la porte se ferme
  // maintenant AVANT le moindre `await`, pas après.
  useEffect(() => {
    if (!ready || !user?.id || consent !== 'granted' || captured || captureAttempted.current) return;
    captureAttempted.current = true;
    let cancelled = false;
    (async () => {
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (cancelled) return;
        if (permission.granted) await captureLocation();
        else await storePermissionOnly('denied');
      } catch (captureError) {
        console.error('[location] Echec de la capture de connexion:', captureError);
        // Un échec réseau doit pouvoir être retenté au prochain rendu —
        // seul un succès (via `captured`) doit fermer la porte pour de bon.
        if (!cancelled) captureAttempted.current = false;
      }
    })();
    return () => { cancelled = true; };
  }, [captured, captureLocation, consent, ready, storePermissionOnly, user?.id]);

  /**
   * Le retour au premier plan vaut une nouvelle connexion.
   *
   * On ne recapture rien ici : on rouvre simplement la porte que l'effet
   * ci-dessus referme apres son premier succes. Lui seul sait quoi envoyer, et
   * il relit la permission systeme au passage — une autorisation revoquee dans
   * les reglages de l'appareil pendant que l'application dormait est donc vue
   * a ce moment-la, pas au prochain lancement.
   *
   * La cle de capture n'est PAS regeneree : cote serveur, `capture_key`
   * dedoublonne l'evenement de localisation, qui reste donc un par session —
   * seule la Carte NF est rafraichie (`updatePosition` lit la charge utile
   * envoyee, pas la ligne deja en base). On ne cree pas une trace personnelle
   * supplementaire pour repousser une echeance de presence.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      if (Date.now() - lastCaptureAt.current < REFRESH_AFTER_MS) return;
      captureAttempted.current = false;
      setCaptured(false);
    });
    return () => subscription.remove();
  }, []);

  const saveDemographics = async () => {
    const parsedAge = Number(age);
    const parsedDay = Number(day);
    const parsedMonth = Number(month);
    if (!Number.isInteger(parsedAge) || parsedAge < 13 || parsedAge > 120) {
      setError('Indique un âge valide entre 13 et 120 ans.');
      return;
    }
    if (!validBirthday(parsedDay, parsedMonth)) {
      setError('Indique un jour et un mois de naissance valides.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await apiService.updateDemographics({
        declaredAge: parsedAge,
        birthDay: parsedDay,
        birthMonth: parsedMonth,
      });
      if (!response.success) throw new Error(response.message);
      await refreshCurrentUser();
      setStep('location');
    } catch (saveError: any) {
      setError(saveError?.message || 'Impossible d\'enregistrer ces informations.');
    } finally {
      setSaving(false);
    }
  };

  const allowLocation = async () => {
    setSaving(true);
    setError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        await storePermissionOnly('denied');
        return;
      }
      await captureLocation();
      await refreshCurrentUser();
    } catch (captureError: any) {
      setError(captureError?.message || 'La localisation est momentanément indisponible.');
    } finally {
      setSaving(false);
    }
  };

  const declineLocation = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await storePermissionOnly('denied');
    } catch (declineError: any) {
      setError(declineError?.message || 'Impossible d\'enregistrer ce choix.');
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  const isDemographics = step === 'demographics';

  return (
    <StartupStepPage
      visible={visible}
      icon={isDemographics ? 'calendar-outline' : 'location-outline'}
      title={isDemographics ? 'Complète ton profil' : 'Localisation des connexions'}
      subtitle={
        isDemographics
          ? "Ton âge aide à produire des statistiques d'audience par tranches. Le jour et le mois servent à ton anniversaire. Ces informations restent privées."
          : 'Avec ton accord, TwitNinf enregistre une position approximative une fois à chaque connexion pour produire des statistiques géographiques agrégées et sécuriser les sessions. Aucun suivi en arrière-plan.'
      }
      footer={
        <>
          {error ? <Text style={stepStyles.error}>{error}</Text> : null}
          {isDemographics ? (
            <Pressable style={stepStyles.primaryButton} onPress={saveDemographics} disabled={saving}>
              {saving ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={stepStyles.primaryText}>Valider et continuer</Text>
              )}
            </Pressable>
          ) : (
            <>
              <Pressable style={stepStyles.primaryButton} onPress={allowLocation} disabled={saving}>
                {saving ? (
                  <ActivityIndicator color={colors.onAccent} />
                ) : (
                  <Text style={stepStyles.primaryText}>Autoriser la localisation</Text>
                )}
              </Pressable>
              <Pressable style={stepStyles.secondaryButton} onPress={declineLocation} disabled={saving}>
                <Text style={stepStyles.secondaryText}>Pas maintenant</Text>
              </Pressable>
            </>
          )}
        </>
      }
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {isDemographics ? (
          <View style={styles.fields}>
            <View style={styles.fieldWide}>
              <Text style={styles.label}>Âge</Text>
              <TextInput value={age} onChangeText={(v) => setAge(v.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" placeholder="18" placeholderTextColor={colors.textMuted} style={styles.input} maxLength={3} />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Jour</Text>
              <TextInput value={day} onChangeText={(v) => setDay(v.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" placeholder="24" placeholderTextColor={colors.textMuted} style={styles.input} maxLength={2} />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Mois</Text>
              <TextInput value={month} onChangeText={(v) => setMonth(v.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" placeholder="08" placeholderTextColor={colors.textMuted} style={styles.input} maxLength={2} />
            </View>
          </View>
        ) : (
          <View style={styles.privacyRow}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.success} />
            <Text style={styles.privacyText}>Les créateurs ne voient que des groupes d'au moins 5 personnes, jamais tes coordonnées.</Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </StartupStepPage>
  );
}

const styles = StyleSheet.create({
  fields: { flexDirection: 'row', gap: 10, marginTop: 4 },
  fieldWide: { flex: 1.15 },
  field: { flex: 1 },
  label: { marginBottom: 7, color: colors.textSecondary, fontSize: 12, fontFamily: fonts.semibold },
  input: { minHeight: 52, paddingHorizontal: 15, borderRadius: 14, borderWidth: 1, borderColor: colors.borderStrong, color: colors.textPrimary, backgroundColor: colors.surface, fontSize: 17, fontFamily: fonts.bold },
  privacyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 4, padding: 13, borderRadius: 14, backgroundColor: withAlpha(colors.success, 0.09) },
  privacyText: { flex: 1, color: colors.textSecondary, fontSize: 12, lineHeight: 18, fontFamily: fonts.medium },
});
