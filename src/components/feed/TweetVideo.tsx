/**
 * Vidéo jointe à un tweet, dans le fil ou sur sa page détail.
 *
 * Le backend range `media_urls` comme `[url_vidéo, url_miniature]` (voir
 * `POST /api/tweets/video` côté API). Jusqu'ici, le fil filtrait l'URL vidéo
 * (un `.mp4` planté dans une `<Image>` ne rend rien) et laissait passer la
 * seule miniature — affichée comme une photo ordinaire, sans bouton play ni
 * aucun moyen de la lire. Ce composant remplace ce silence : miniature avec
 * recouvrement play tant qu'on n'a pas appuyé, lecture native ensuite.
 *
 * Lecture EN PLACE plutôt qu'un écran dédié : la vidéo TikTok-like
 * (`twitninfvideo.tsx`) charge son propre flux indépendant, sans notion de
 * « ouvrir CETTE vidéo précise » — la brancher ici aurait ouvert un flux
 * générique au lieu du tweet sur lequel on vient d'appuyer.
 */

import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { ResizeMode, Video } from 'expo-av';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../../theme';

interface TweetVideoProps {
  videoUrl: string;
  thumbnailUrl?: string;
  /** Appelé avant de lancer la lecture — neutralise l'appui de la ligne, même logique que `TweetImages`. */
  onBeforeOpen?: () => void;
  /**
   * Durée réelle de la vidéo, dès qu'`expo-av` la connaît. N'existe nulle
   * part dans le modèle `Tweet` — c'est le lecteur qui l'apprend, comme dans
   * `ExploreImmersive`. Sans elle, le dwell du fil retombe sur un forfait de
   * 8 s côté moteur et le raisonnement en taux de complétion ne s'applique
   * jamais à une vidéo du fil.
   */
  onDuration?: (durationMs: number) => void;
}

export default function TweetVideo({ videoUrl, thumbnailUrl, onBeforeOpen, onDuration }: TweetVideoProps) {
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(true);

  if (playing) {
    return (
      <View style={styles.frame}>
        <Video
          source={{ uri: videoUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.CONTAIN}
          useNativeControls
          shouldPlay
          onPlaybackStatusUpdate={(status) => {
            if ('isBuffering' in status) setBuffering(!!status.isBuffering);
            if ('isLoaded' in status && status.isLoaded && status.durationMillis) {
              onDuration?.(status.durationMillis);
            }
          }}
        />
        {buffering && (
          <View style={styles.bufferOverlay} pointerEvents="none">
            <ActivityIndicator color={colors.white} />
          </View>
        )}
      </View>
    );
  }

  return (
    <Pressable
      style={styles.frame}
      onPress={() => {
        onBeforeOpen?.();
        setPlaying(true);
      }}
    >
      {thumbnailUrl ? (
        <Image source={{ uri: thumbnailUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.noThumbnail]} />
      )}
      <View style={styles.scrim} pointerEvents="none" />
      <View style={styles.playButton} pointerEvents="none">
        <Ionicons name="play" size={28} color={colors.white} style={styles.playIcon} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    aspectRatio: 16 / 9,
    marginTop: 8,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Pas de miniature transcodée (rare — échec d'extraction côté serveur) :
  // un aplat neutre plutôt qu'un cadre vide, le bouton play reste le seul
  // signal nécessaire.
  noThumbnail: {
    backgroundColor: colors.surfaceAlt,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  playButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  // Optique : un triangle centré paraît décalé à gauche tant qu'on ne
  // compense pas visuellement son propre centre de masse.
  playIcon: {
    marginLeft: 3,
  },
  bufferOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
});
