import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radius } from '../theme';
import { Button, Tappable } from '../components/ui';
import { toast } from '../components/ui/Toast';
import eventPassService, {
  REFUSAL_HINTS,
  type RedeemResult,
  type RefusalReason,
} from '../services/eventPassService';

/**
 * Contrôle à l'entrée : on scanne, la place est consommée, on laisse entrer.
 *
 * ── L'anti-rebond n'est pas du confort ────────────────────────────────────
 * La caméra relit le même code plusieurs fois par seconde. Sans garde, le
 * premier appel valide la place et le deuxième, une fraction de seconde plus
 * tard, annonce « déjà utilisée » — sur la place qu'on vient soi-même de faire
 * passer. L'équipe voit alors un refus rouge pour une entrée pourtant
 * accordée. D'où `RESCAN_GUARD_MS` : le même code est ignoré pendant deux
 * secondes et demie.
 *
 * ── Pourquoi un champ de saisie manuelle ──────────────────────────────────
 * Écran cassé, batterie vide, place imprimée : le serveur accepte le code seul
 * (`NINF-XXXX-XXXX`) et journalise le passage comme saisie manuelle. Refuser
 * quelqu'un dont la place est authentique parce que son téléphone ne s'allume
 * plus n'aide personne.
 */

const RESCAN_GUARD_MS = 2500;

/** Vibrations distinctes : à une porte bruyante, on ne regarde pas l'écran. */
const BUZZ_ADMITTED = 40;
const BUZZ_REFUSED = [0, 90, 70, 90];

interface Verdict {
  admitted: boolean;
  title: string;
  detail: string;
  guest?: string | null;
  serial?: number | null;
  manual?: boolean;
}

function verdictFrom(result: RedeemResult): Verdict {
  if (result.admitted) {
    const remaining = result.remaining_scans ?? 0;
    return {
      admitted: true,
      title: 'Entrée accordée',
      detail: remaining > 0
        ? `Encore ${remaining} entrée${remaining > 1 ? 's' : ''} sur cette place.`
        : 'Place consommée.',
      guest: result.pass?.guest_name,
      serial: result.pass?.serial,
      manual: result.manual,
    };
  }

  const reason = result.reason as RefusalReason | undefined;
  return {
    admitted: false,
    title: 'Refusée',
    detail: (reason && REFUSAL_HINTS[reason]) || result.message || 'Place refusée.',
    guest: result.pass?.guest_name,
    serial: result.pass?.serial,
  };
}

export default function EventPassScanScreen() {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();

  const eventSlug: string | undefined = route.params?.eventSlug;
  const eventName: string | undefined = route.params?.eventName;

  const [permission, requestPermission] = useCameraPermissions();
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [busy, setBusy] = useState(false);
  const [admitted, setAdmitted] = useState(0);
  const [refused, setRefused] = useState(0);
  const [torch, setTorch] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState('');

  /** Dernier code traité, et quand. Une ref : ne doit pas provoquer de rendu. */
  const lastScan = useRef<{ token: string; at: number }>({ token: '', at: 0 });
  /** L'appel est en cours : la caméra continue de lire, on ne réémet pas. */
  const inFlight = useRef(false);
  /**
   * Un verdict est-il à l'écran, et pour quel code.
   *
   * La fenêtre de deux secondes et demie ne suffit pas seule : un téléphone
   * posé face à une place déjà validée finit par dépasser le délai, revalide, et
   * annonce « déjà utilisée » en rouge pour une entrée qu'il vient lui-même
   * d'accorder. Tant que son verdict est affiché, un code ne repasse donc pas —
   * il faut soit un autre code, soit un appui pour refermer.
   */
  const shownFor = useRef<string | null>(null);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const submit = useCallback(async (token: string, fromCamera: boolean) => {
    if (inFlight.current) return;

    const now = Date.now();
    if (fromCamera && token === lastScan.current.token
      && (shownFor.current === token || now - lastScan.current.at < RESCAN_GUARD_MS)) {
      return;
    }
    lastScan.current = { token, at: now };

    inFlight.current = true;
    setBusy(true);

    const res = await eventPassService.redeemPass(token, {
      eventSlug,
      deviceLabel: Platform.OS === 'ios' ? 'iOS — contrôle' : 'Android — contrôle',
    });

    if (res.success && res.data) {
      const next = verdictFrom(res.data);
      shownFor.current = token;
      setVerdict(next);
      if (next.admitted) {
        setAdmitted((count) => count + 1);
        Vibration.vibrate(BUZZ_ADMITTED);
      } else {
        setRefused((count) => count + 1);
        Vibration.vibrate(BUZZ_REFUSED);
      }
    } else {
      // Panne réseau ou jeton de porte expiré : ce n'est pas un verdict sur la
      // place. On ne compte rien, et surtout on ne laisse pas croire à un refus.
      toast.error('Validation impossible', { description: res.message });
      // Le garde-fou est levé : l'équipe doit pouvoir repasser le même code
      // aussitôt, sans attendre deux secondes et demie pour rien.
      lastScan.current = { token: '', at: 0 };
      shownFor.current = null;
    }

    inFlight.current = false;
    setBusy(false);
  }, [eventSlug]);

  const onBarcode = useCallback(({ data }: { data: string }) => {
    if (!data) return;
    submit(data, true);
  }, [submit]);

  /**
   * Refermer le verdict rouvre la porte au même code : c'est le geste par
   * lequel l'équipe dit « suivant », y compris quand le suivant présente la
   * même place d'équipe pour une seconde entrée.
   */
  const dismissVerdict = useCallback(() => {
    shownFor.current = null;
    lastScan.current = { token: '', at: 0 };
    setVerdict(null);
  }, []);

  const submitManual = useCallback(async () => {
    const value = manualCode.trim();
    if (!value) return;
    await submit(value, false);
    setManualCode('');
  }, [manualCode, submit]);

  /* ── Permission ──────────────────────────────────────────────────────── */

  if (!permission) {
    return (
      <View style={styles.stateScreen}>
        <StatusBar barStyle="light-content" backgroundColor="#000000" />
        <Text style={styles.stateText}>Préparation de l’appareil photo…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.stateScreen, { paddingTop: insets.top + 24 }]}>
        <StatusBar barStyle="light-content" backgroundColor="#000000" />
        <Ionicons name="camera-outline" size={54} color={colors.textMuted} />
        <Text style={styles.stateTitle}>L’appareil photo est nécessaire</Text>
        <Text style={styles.stateText}>
          Le contrôle à l’entrée lit le code QR des places. Sans appareil photo, il reste
          la saisie du code imprimé.
        </Text>
        <View style={styles.stateActions}>
          {permission.canAskAgain && (
            <Button label="Autoriser" icon="camera-outline" onPress={requestPermission} />
          )}
          <Button
            label="Saisir un code"
            variant="secondary"
            icon="keypad-outline"
            onPress={() => setManualOpen(true)}
          />
          <Button label="Retour" variant="ghost" onPress={() => navigation.goBack()} />
        </View>

        {manualOpen && (
          <ManualEntry
            value={manualCode}
            onChange={setManualCode}
            onSubmit={submitManual}
            busy={busy}
            onClose={() => setManualOpen(false)}
          />
        )}

        {verdict && <VerdictPanel verdict={verdict} onDismiss={dismissVerdict} inset={insets.bottom} />}
      </View>
    );
  }

  /* ── Contrôle ────────────────────────────────────────────────────────── */

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      {/* Démontée hors champ : une caméra qui tourne derrière un autre écran
          chauffe le téléphone et vide la batterie de la soirée. */}
      {isFocused && (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={onBarcode}
        />
      )}

      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Tappable style={styles.roundButton} onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </Tappable>

        <View style={styles.topTitles}>
          <Text style={styles.topTitle} numberOfLines={1}>
            {eventName || 'Contrôle à l’entrée'}
          </Text>
          <Text style={styles.topSubtitle} numberOfLines={1}>
            {eventSlug ? `Événement « ${eventSlug} »` : 'Tous les événements'}
          </Text>
        </View>

        <Tappable style={styles.roundButton} onPress={() => setTorch((on) => !on)} hitSlop={10}>
          <Ionicons name={torch ? 'flashlight' : 'flashlight-outline'} size={20} color="#FFFFFF" />
        </Tappable>
      </View>

      <View style={styles.counters}>
        <View style={styles.counter}>
          <Text style={[styles.counterValue, { color: colors.success }]}>{admitted}</Text>
          <Text style={styles.counterLabel}>entrées</Text>
        </View>
        <View style={styles.counterSeparator} />
        <View style={styles.counter}>
          <Text style={[styles.counterValue, { color: colors.red }]}>{refused}</Text>
          <Text style={styles.counterLabel}>refus</Text>
        </View>
      </View>

      <View style={styles.reticle} pointerEvents="none">
        <View style={styles.reticleBox} />
        <Text style={styles.reticleHint}>Présente le code QR de la place</Text>
      </View>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <Button
          label="Saisir le code à la main"
          variant="secondary"
          icon="keypad-outline"
          fullWidth
          onPress={() => setManualOpen(true)}
        />
      </View>

      {manualOpen && (
        <ManualEntry
          value={manualCode}
          onChange={setManualCode}
          onSubmit={submitManual}
          busy={busy}
          onClose={() => setManualOpen(false)}
        />
      )}

      {verdict && (
        <VerdictPanel verdict={verdict} onDismiss={dismissVerdict} inset={insets.bottom} />
      )}
    </View>
  );
}

/* ── Saisie manuelle ────────────────────────────────────────────────────── */

/**
 * Une couche absolue, pas une `<Modal>` : les hôtes de toast et de confirmation
 * de l'app ne s'affichent pas sous une modale React Native, et c'est
 * précisément un toast qui annonce ici une panne réseau.
 */
function ManualEntry({
  value, onChange, onSubmit, busy, onClose,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  busy: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={styles.manualLayer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Tappable style={styles.manualBackdrop} onPress={onClose} haptic={false}>
        <View />
      </Tappable>

      <View style={[styles.manualSheet, { paddingBottom: insets.bottom + 18 }]}>
        <View style={styles.manualHead}>
          <Text style={styles.manualTitle}>Code imprimé</Text>
          <Tappable style={styles.roundButtonDark} onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={20} color={colors.textSecondary} />
          </Tappable>
        </View>

        <Text style={styles.manualHint}>
          Le code figure sous le QR de la place, au format NINF-XXXX-XXXX.
        </Text>

        <TextInput
          style={styles.manualInput}
          value={value}
          onChangeText={(next) => onChange(next.toUpperCase())}
          placeholder="NINF-0000-0000"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={onSubmit}
          editable={!busy}
        />

        <Button
          label="Valider l’entrée"
          icon="checkmark-circle-outline"
          fullWidth
          loading={busy}
          disabled={!value.trim()}
          onPress={onSubmit}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

/* ── Verdict ────────────────────────────────────────────────────────────── */

/**
 * Le verdict reste affiché jusqu'au suivant : à une porte, quelqu'un lève les
 * yeux une seconde après le bip, et un panneau qui s'efface tout seul le laisse
 * sans réponse. Il se remplace au scan suivant, ou se ferme d'un appui.
 */
function VerdictPanel({
  verdict, onDismiss, inset,
}: {
  verdict: Verdict;
  onDismiss: () => void;
  inset: number;
}) {
  const tint = verdict.admitted ? colors.success : colors.red;

  return (
    <Tappable
      style={[styles.verdictLayer, { paddingBottom: inset + 20, backgroundColor: tint }]}
      onPress={onDismiss}
      haptic={false}
    >
      <View style={styles.verdictInner}>
        <Ionicons
          name={verdict.admitted ? 'checkmark-circle' : 'close-circle'}
          size={62}
          color="#FFFFFF"
        />
        <Text style={styles.verdictTitle}>{verdict.title}</Text>

        {!!verdict.guest && <Text style={styles.verdictGuest}>{verdict.guest}</Text>}
        {verdict.serial != null && (
          <Text style={styles.verdictSerial}>
            Place Nº {String(verdict.serial).padStart(3, '0')}
          </Text>
        )}

        <Text style={styles.verdictDetail}>{verdict.detail}</Text>

        {verdict.manual && (
          <Text style={styles.verdictManual}>Code saisi à la main — passage journalisé comme tel.</Text>
        )}

        <Text style={styles.verdictDismiss}>Appuie pour continuer</Text>
      </View>
    </Tappable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },

  stateScreen: {
    flex: 1, backgroundColor: colors.bg,
    alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32,
  },
  stateTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: 19, marginTop: 6 },
  stateText: { color: colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  stateActions: { alignSelf: 'stretch', gap: 10, marginTop: 18 },

  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  topTitles: { flex: 1 },
  topTitle: { color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 16 },
  topSubtitle: { color: 'rgba(255,255,255,0.65)', fontSize: 11.5, marginTop: 2 },
  roundButton: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)',
  },
  roundButtonDark: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt,
  },

  counters: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999,
    paddingHorizontal: 20, paddingVertical: 10, marginTop: 14, gap: 18,
  },
  counter: { alignItems: 'center', minWidth: 54 },
  counterValue: { fontFamily: fonts.bold, fontSize: 22 },
  counterLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 10.5, marginTop: 1 },
  counterSeparator: { width: 1, height: 26, backgroundColor: 'rgba(255,255,255,0.2)' },

  reticle: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 },
  reticleBox: {
    width: 250, height: 250, borderRadius: 28,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)',
  },
  reticleHint: { color: 'rgba(255,255,255,0.85)', fontSize: 13.5 },

  bottomBar: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: 'rgba(0,0,0,0.55)' },

  manualLayer: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
  manualBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)' },
  manualSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    borderTopWidth: 1, borderColor: colors.border,
    paddingHorizontal: 20, paddingTop: 18, gap: 12,
  },
  manualHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  manualTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: 17 },
  manualHint: { color: colors.textMuted, fontSize: 12.5, lineHeight: 17 },
  manualInput: {
    backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 14,
    color: colors.textPrimary, fontFamily: fonts.bold, fontSize: 18, letterSpacing: 2,
  },

  verdictLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28,
  },
  verdictInner: { alignItems: 'center' },
  verdictTitle: { color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 30, marginTop: 14 },
  verdictGuest: { color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 21, marginTop: 18, textAlign: 'center' },
  verdictSerial: { color: 'rgba(255,255,255,0.85)', fontSize: 14, marginTop: 4 },
  verdictDetail: {
    color: 'rgba(255,255,255,0.92)', fontSize: 15.5,
    textAlign: 'center', lineHeight: 21, marginTop: 16,
  },
  verdictManual: { color: 'rgba(255,255,255,0.8)', fontSize: 12.5, textAlign: 'center', marginTop: 12 },
  verdictDismiss: { color: 'rgba(255,255,255,0.75)', fontSize: 12.5, marginTop: 30 },
});
