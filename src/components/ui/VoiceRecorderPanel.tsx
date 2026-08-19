/**
 * Panneau d'enregistrement d'un message vocal, dans le composeur.
 *
 * Le premier jet n'avait pas de panneau : la puce « VOCAL » de la rangée
 * d'options se changeait en puce-chronomètre. Trois défauts d'un coup — la
 * rangée se réagençait au démarrage (les puces suivantes sautaient d'une
 * ligne), rien ne disait que le micro captait vraiment quelque chose, et le
 * seul moyen de sortir était de valider : pas d'abandon possible.
 *
 * Ici l'enregistrement occupe la PLACE de la future pièce jointe, au-dessus
 * des options. Le panneau devient la carte du vocal une fois terminé : même
 * surface, même waveform, au même endroit.
 *
 * ── Pourquoi des `ref` en entrée plutôt que des props ─────────────────────
 * Le métrage arrive dix fois par seconde. Le remonter en état dans
 * `CreateTweetScreen` (un écran de ~2000 lignes) le ferait re-rendre dix fois
 * par seconde pendant tout l'enregistrement. L'écran écrit donc dans des refs,
 * et ce panneau — lui seul — les relit à son rythme.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, fonts } from '../../theme';
import { duration as motionDurations, easing } from '../../theme/motion';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import Tappable from './Tappable';
import VoiceWaveform, { WAVEFORM_BAR_COUNT, formatClock } from './VoiceWaveform';

/** 10 rafraîchissements par seconde : le seuil au-delà duquel l'oeil ne suit plus. */
const REFRESH_MS = 100;
/** En dessous, on prévient que le plafond approche. */
const WARN_REMAINING_MS = 15000;

interface VoiceRecorderPanelProps {
  /** Amplitudes 0..1 empilées par le micro, la plus récente en fin de tableau. */
  samplesRef: React.MutableRefObject<number[]>;
  /** Durée écoulée, tenue par le statut d'enregistrement (pas par une horloge). */
  elapsedMsRef: React.MutableRefObject<number>;
  maxSeconds: number;
  /** Abandon : l'enregistrement est jeté, rien n'est joint. */
  onCancel: () => void;
  /** Fin : le vocal est joint au tweet. */
  onAttach: () => void;
}

export default function VoiceRecorderPanel({
  samplesRef,
  elapsedMsRef,
  maxSeconds,
  onCancel,
  onAttach,
}: VoiceRecorderPanelProps) {
  const reduceMotion = useReduceMotion();
  const [elapsedMs, setElapsedMs] = useState(0);
  const [bars, setBars] = useState<number[]>(() => new Array(WAVEFORM_BAR_COUNT).fill(0.04));
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const id = setInterval(() => {
      setElapsedMs(elapsedMsRef.current);
      const samples = samplesRef.current;
      // Le plus récent à droite, le début de la phrase qui s'échappe à gauche :
      // c'est le sens de lecture d'un enregistrement en cours.
      const window = samples.slice(-WAVEFORM_BAR_COUNT);
      const padding = new Array(Math.max(0, WAVEFORM_BAR_COUNT - window.length)).fill(0.04);
      setBars([...padding, ...window]);
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [samplesRef, elapsedMsRef]);

  // Pastille rouge : le seul mouvement en boucle de la fonctionnalité, et il
  // dit une chose vraie — le micro est ouvert MAINTENANT.
  useEffect(() => {
    if (reduceMotion) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.25,
          duration: 620,
          easing: easing.inOut,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 620,
          easing: easing.inOut,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion]);

  const remainingMs = Math.max(0, maxSeconds * 1000 - elapsedMs);
  const nearLimit = remainingMs <= WARN_REMAINING_MS;

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Animated.View style={[styles.dot, { opacity: pulse }]} />
        <Text style={[styles.status, nearLimit && styles.statusWarning]}>
          {nearLimit ? `Il reste ${formatClock(remainingMs)}` : 'Micro ouvert'}
        </Text>
        <Text style={styles.timer}>{formatClock(elapsedMs)}</Text>
      </View>

      <VoiceWaveform bars={bars} height={34} color={colors.borderStrong} activeColor={colors.accent} progress={1} />

      <View style={styles.actions}>
        <Tappable
          style={styles.cancel}
          onPress={onCancel}
          haptic="select"
          accessibilityLabel="Annuler l'enregistrement"
        >
          <Text style={styles.cancelText}>Annuler</Text>
        </Tappable>
        <Tappable
          style={styles.attach}
          onPress={onAttach}
          haptic="select"
          accessibilityLabel="Joindre le message vocal au tweet"
        >
          <Ionicons name="checkmark" size={17} color={colors.onAccent} />
          <Text style={styles.attachText}>Joindre</Text>
        </Tappable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginTop: 18,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.surface,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.red,
  },
  status: {
    flex: 1,
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: 13,
  },
  statusWarning: {
    color: colors.warning,
  },
  timer: {
    color: colors.textPrimary,
    fontFamily: fonts.mono,
    fontSize: 13,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cancel: {
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    color: colors.textSecondary,
    fontFamily: fonts.semibold,
    fontSize: 13.5,
  },
  attach: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: colors.accent,
  },
  attachText: {
    color: colors.onAccent,
    fontFamily: fonts.semibold,
    fontSize: 13.5,
  },
});
