/**
 * Waveform d'un message vocal — la seule matière honnête de cette
 * fonctionnalité : l'amplitude d'une voix dans le temps.
 *
 * Le premier jet dessinait `6 + ((index * 7) % 16)` : un dents-de-scie qui se
 * répète tous les huit traits, identique sur tous les tweets de l'app, et posé
 * en `surfaceAlt` (#1E1E1E) sur `surface` (#161616) — donc quasiment invisible.
 * Ici les barres viennent soit du métrage réel capté à l'enregistrement, soit
 * d'un tirage déterministe semé par l'URL : deux vocaux n'ont jamais la même
 * silhouette, et la barre franchie par la lecture s'allume en accent.
 *
 * Même composant pour les trois états de la fonctionnalité (enregistrement en
 * cours, relecture dans le composeur, lecture dans le fil) : c'est ce qui fait
 * qu'on reconnaît un vocal d'un bout à l'autre du parcours.
 */

import React, { useCallback, useRef } from 'react';
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { colors } from '../../theme';

/** Assez de barres pour lire un rythme de parole, assez peu pour rester lisible à 200 px. */
export const WAVEFORM_BAR_COUNT = 32;

const BAR_WIDTH = 3;
/** Une barre n'est jamais nulle : un silence reste du temps qui passe. */
const MIN_BAR_HEIGHT = 3;

/** dBFS (-160..0) → amplitude 0..1, plancher de silence à -50 dB. */
export function normalizeMetering(db?: number | null): number {
  if (typeof db !== 'number' || !Number.isFinite(db)) return 0.05;
  const floor = -50;
  const clamped = Math.max(floor, Math.min(0, db));
  return (clamped - floor) / -floor;
}

/** Ramène un flux d'échantillons captés à l'enregistrement à `barCount` valeurs. */
export function downsampleWaveform(samples: number[], barCount: number = WAVEFORM_BAR_COUNT): number[] {
  if (samples.length === 0) return new Array(barCount).fill(0.12);
  const bucketSize = samples.length / barCount;
  const out: number[] = [];
  for (let i = 0; i < barCount; i += 1) {
    const start = Math.floor(i * bucketSize);
    const end = Math.max(start + 1, Math.floor((i + 1) * bucketSize));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end && j < samples.length; j += 1) {
      sum += samples[j];
      count += 1;
    }
    out.push(count > 0 ? sum / count : 0.12);
  }
  return out;
}

/**
 * Silhouette déterministe pour un vocal dont on n'a pas gardé le métrage
 * (l'API ne stocke que l'URL et la durée). Semée par l'URL : le même tweet
 * garde la même forme d'un affichage à l'autre, deux tweets n'ont pas la même.
 */
export function pseudoWaveform(seed: string, barCount: number = WAVEFORM_BAR_COUNT): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const out: number[] = [];
  for (let i = 0; i < barCount; i += 1) {
    h = (h * 1103515245 + 12345) >>> 0;
    out.push(0.25 + (((h >>> 8) % 1000) / 1000) * 0.65);
  }
  return out;
}

/**
 * Compteur `m:ss` à partir de millisecondes.
 *
 * À afficher en `fonts.mono` : en chasse proportionnelle, le passage de 0:09 à
 * 0:10 décale toute la ligne à chaque seconde.
 */
export function formatClock(totalMs: number): string {
  const total = Math.max(0, Math.round((totalMs || 0) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

interface VoiceWaveformProps {
  /** Amplitudes 0..1, une par barre. */
  bars: number[];
  /** Avancée de la lecture 0..1 — les barres franchies passent en accent. */
  progress?: number;
  /** Hauteur de la barre la plus forte. */
  height?: number;
  /** Couleur des barres non lues. */
  color?: string;
  /** Couleur des barres franchies par la lecture. */
  activeColor?: string;
  /**
   * Appui sur la waveform → position visée (0..1).
   *
   * Volontairement un APPUI et pas un glissé : la carte vit dans une ligne de
   * `FlatList`, et capter le déplacement du doigt volerait le défilement
   * vertical du fil.
   */
  onSeek?: (ratio: number) => void;
  style?: StyleProp<ViewStyle>;
}

export default function VoiceWaveform({
  bars,
  progress,
  height = 26,
  color = colors.borderStrong,
  activeColor = colors.accent,
  onSeek,
  style,
}: VoiceWaveformProps) {
  const widthRef = useRef(0);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    widthRef.current = event.nativeEvent.layout.width;
  }, []);

  const handleRelease = useCallback(
    (event: GestureResponderEvent) => {
      if (!onSeek || widthRef.current <= 0) return;
      const ratio = event.nativeEvent.locationX / widthRef.current;
      onSeek(Math.max(0, Math.min(1, ratio)));
    },
    [onSeek],
  );

  const lastIndex = Math.max(0, bars.length - 1);
  const activeIndex = typeof progress === 'number' ? Math.round(Math.max(0, Math.min(1, progress)) * lastIndex) : -1;

  const responder = onSeek
    ? {
        onStartShouldSetResponder: () => true,
        onResponderRelease: handleRelease,
      }
    : null;

  return (
    <View
      style={[styles.row, { height }, style]}
      onLayout={handleLayout}
      accessible={false}
      {...responder}
    >
      {bars.map((amplitude, index) => (
        <View
          key={index}
          style={[
            styles.bar,
            {
              height: MIN_BAR_HEIGHT + Math.max(0, Math.min(1, amplitude)) * (height - MIN_BAR_HEIGHT),
              backgroundColor: index <= activeIndex ? activeColor : color,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    // `space-between` plutôt qu'un `gap` fixe : la waveform occupe toute la
    // largeur disponible, du petit écran à la tablette, sans recalcul.
    justifyContent: 'space-between',
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: BAR_WIDTH / 2,
  },
});
