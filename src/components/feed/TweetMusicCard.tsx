/**
 * Morceau Spotify joint à un tweet, dans le fil ou sur sa page détail.
 *
 * Pas de compte Spotify connecté ici (voir `spotifyService` côté API) : la
 * carte ouvre le morceau dans Spotify pour l'écoute complète. Quand un extrait
 * de 30s existe (`previewUrl` — Spotify ne le fournit plus pour tous les
 * morceaux), un petit bouton play le lit sur place, sans quitter le tweet.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { Audio } from 'expo-av';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, fonts } from '../../theme';
import type { SpotifyTrack } from '../../types/api';

interface TweetMusicCardProps {
  track: SpotifyTrack;
  /** Appelé avant d'ouvrir Spotify — neutralise l'appui de la ligne, même logique que `TweetImages`. */
  onBeforeOpen?: () => void;
}

function TweetMusicCard({ track, onBeforeOpen }: TweetMusicCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  const togglePreview = useCallback(async () => {
    if (!track.previewUrl || isLoading) return;
    try {
      if (!soundRef.current) {
        setIsLoading(true);
        // Même config que les vocaux (ConversationThreadScreen) : sans ça,
        // iOS respecte le switch silencieux et l'extrait ne s'entend pas.
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        }).catch(() => {});
        const { sound } = await Audio.Sound.createAsync(
          { uri: track.previewUrl },
          { shouldPlay: true },
          (status) => {
            if ('isPlaying' in status) setIsPlaying(!!status.isPlaying);
            if ('didJustFinish' in status && status.didJustFinish) setIsPlaying(false);
          }
        );
        soundRef.current = sound;
        setIsLoading(false);
        setIsPlaying(true);
        return;
      }
      const status = await soundRef.current.getStatusAsync();
      if (status.isLoaded && status.isPlaying) {
        await soundRef.current.pauseAsync();
      } else {
        await soundRef.current.playAsync();
      }
    } catch {
      setIsLoading(false);
    }
  }, [track.previewUrl, isLoading]);

  const openInSpotify = useCallback(() => {
    onBeforeOpen?.();
    Linking.openURL(track.externalUrl).catch(() => {});
  }, [track.externalUrl, onBeforeOpen]);

  return (
    <TouchableOpacity style={styles.card} onPress={openInSpotify} activeOpacity={0.85}>
      <View style={styles.artWrap}>
        {/* `expo-image` : la pochette est montée dans une ligne de fil
            recyclée. `memory-disk` évite le redécodage quand on remonte le fil,
            et `recyclingKey` vide la vue avant de charger la pochette suivante
            — sans lui, une cellule réutilisée montre un instant l'album du
            tweet précédent. */}
        {track.albumArt ? (
          <Image
            source={{ uri: track.albumArt }}
            style={styles.art}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={track.albumArt}
            transition={0}
          />
        ) : (
          <View style={[styles.art, styles.artPlaceholder]}>
            <Ionicons name="musical-note" size={18} color={colors.textMuted} />
          </View>
        )}
        {!!track.previewUrl && (
          <TouchableOpacity
            style={styles.previewButton}
            onPress={(e) => {
              e.stopPropagation();
              togglePreview();
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={isPlaying ? 'Mettre en pause l\'extrait' : 'Écouter un extrait'}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={13}
                color={colors.white}
                style={!isPlaying ? { marginLeft: 1 } : undefined}
              />
            )}
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.meta}>
        <Text style={styles.title} numberOfLines={1}>{track.name}</Text>
        {!!track.artist && (
          <Text style={styles.artist} numberOfLines={1}>{track.artist}</Text>
        )}
      </View>
      <Ionicons name="open-outline" size={17} color={colors.cyan} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    padding: 8,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  artWrap: {
    position: 'relative',
  },
  art: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: colors.surfaceAlt,
  },
  artPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewButton: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  meta: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 13.5,
    fontFamily: fonts.bold,
  },
  artist: {
    color: colors.textMuted,
    fontSize: 12,
  },
});

export default React.memo(TweetMusicCard);
