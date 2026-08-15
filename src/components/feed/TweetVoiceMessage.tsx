/**
 * Message vocal joint à un tweet (La Forge : « pouvoir ajouter un message
 * vocal dans notre tweet »).
 *
 * Pas de cadre visuel façon vidéo : c'est du son seul, une carte compacte
 * bouton play/pause + durée suffit — même esprit que `TweetMusicCard`.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../theme';

interface TweetVoiceMessageProps {
  audioUrl: string;
  durationSeconds?: number | null;
  /** Appelé avant de lancer la lecture — neutralise l'appui de la ligne, même logique que `TweetImages`. */
  onBeforeOpen?: () => void;
}

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

export default function TweetVoiceMessage({ audioUrl, durationSeconds, onBeforeOpen }: TweetVoiceMessageProps) {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  // Le son ne doit pas continuer à jouer une fois la ligne quittée.
  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
    };
  }, []);

  const handlePress = async () => {
    onBeforeOpen?.();

    if (soundRef.current) {
      const status = await soundRef.current.getStatusAsync();
      if (status.isLoaded && status.isPlaying) {
        await soundRef.current.pauseAsync();
        setPlaying(false);
      } else {
        await soundRef.current.playAsync();
        setPlaying(true);
      }
      return;
    }

    try {
      setLoading(true);
      const { sound } = await Audio.Sound.createAsync({ uri: audioUrl }, { shouldPlay: true });
      soundRef.current = sound;
      setPlaying(true);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setPlaying(false);
          sound.setPositionAsync(0).catch(() => {});
        }
      });
    } catch (e) {
      // Silencieux : un message vocal qui ne charge pas n'est pas une erreur
      // bloquante pour le reste de la ligne.
    } finally {
      setLoading(false);
    }
  };

  return (
    <Pressable style={styles.card} onPress={handlePress}>
      <View style={styles.playButton}>
        <Ionicons name={loading ? 'hourglass-outline' : playing ? 'pause' : 'play'} size={18} color={colors.white} />
      </View>
      <View style={styles.waveform} pointerEvents="none">
        {Array.from({ length: 18 }).map((_, index) => (
          <View
            key={index}
            style={[
              styles.waveformBar,
              { height: 6 + ((index * 7) % 16) },
            ]}
          />
        ))}
      </View>
      {typeof durationSeconds === 'number' && durationSeconds > 0 && (
        <Text style={styles.duration}>{formatDuration(durationSeconds)}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    padding: 10,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  waveform: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  waveformBar: {
    width: 3,
    borderRadius: 1.5,
    backgroundColor: colors.surfaceAlt,
  },
  duration: {
    color: colors.textMuted,
    fontSize: 12.5,
    fontFamily: fonts.regular,
  },
});
