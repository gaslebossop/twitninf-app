/**
 * Message vocal joint à un tweet (La Forge : « pouvoir ajouter un message
 * vocal dans notre tweet »).
 *
 * Pas de cadre façon vidéo : c'est du son seul. Une ligne — bouton, waveform,
 * compteur — qu'on retrouve à l'identique dans le composeur.
 *
 * Ce que la première version ne faisait pas et qui manquait vraiment : montrer
 * l'avancée de la lecture (la waveform restait morte du début à la fin), faire
 * défiler le temps, et permettre de reprendre plus loin. Un vocal de deux
 * minutes se réécoutait alors depuis le début, à l'aveugle.
 */

import React, { useCallback, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../theme';
import VoiceWaveform, { formatClock, pseudoWaveform } from '../ui/VoiceWaveform';
import { useVoicePlayback } from '../../hooks/useVoicePlayback';

interface TweetVoiceMessageProps {
  audioUrl: string;
  durationSeconds?: number | null;
  /** Appelé avant de lancer la lecture — neutralise l'appui de la ligne, même logique que `TweetImages`. */
  onBeforeOpen?: () => void;
}

function TweetVoiceMessage({ audioUrl, durationSeconds, onBeforeOpen }: TweetVoiceMessageProps) {
  const fallbackMs = typeof durationSeconds === 'number' && durationSeconds > 0 ? durationSeconds * 1000 : 0;
  const { isPlaying, isLoading, positionMs, durationMs, progress, toggle, seekToRatio } = useVoicePlayback(
    audioUrl,
    fallbackMs,
  );

  /**
   * L'API ne garde que l'URL et la durée : aucune amplitude à rejouer côté
   * fil. La silhouette est donc tirée de l'URL — stable pour un tweet donné,
   * différente d'un tweet à l'autre.
   */
  const bars = useMemo(() => pseudoWaveform(audioUrl), [audioUrl]);

  const handleToggle = useCallback(() => {
    onBeforeOpen?.();
    toggle();
  }, [onBeforeOpen, toggle]);

  const handleSeek = useCallback(
    (ratio: number) => {
      onBeforeOpen?.();
      seekToRatio(ratio);
    },
    [onBeforeOpen, seekToRatio],
  );

  // Le compteur montre où on en est pendant l'écoute, et la longueur totale au
  // repos : les deux informations utiles, jamais en même temps.
  const clock = formatClock(positionMs > 0 ? positionMs : durationMs);

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.playButton}
        onPress={handleToggle}
        activeOpacity={0.85}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? 'Mettre le message vocal en pause' : 'Écouter le message vocal'}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={colors.onAccent} />
        ) : (
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={16}
            color={colors.onAccent}
            style={!isPlaying ? styles.playGlyph : undefined}
          />
        )}
      </TouchableOpacity>

      <VoiceWaveform bars={bars} progress={progress} height={26} onSeek={handleSeek} style={styles.waveform} />

      <Text style={styles.clock}>{clock}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  playButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  /** Le triangle de `play` paraît décentré dans un rond : 1 px suffit à le poser. */
  playGlyph: {
    marginLeft: 2,
  },
  waveform: {
    marginHorizontal: 2,
  },
  clock: {
    color: colors.textSecondary,
    fontSize: 12,
    // Chasse fixe : sans elle, la waveform se décale d'un pixel à chaque
    // seconde qui passe, pendant toute la lecture.
    fontFamily: fonts.mono,
    minWidth: 30,
    textAlign: 'right',
  },
});

export default React.memo(TweetVoiceMessage);
