import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
// `expo-image` plutôt que `Image` de React Native : cache disque et décodage
// hors du thread JS. Sans `transition`, l'apparition reste identique.
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../theme';

/** Dégradé de l'anneau Instagram (jaune → orange → rose → violet → bleu). */
export const STORY_GRADIENT = ['#FEDA75', '#FA7E1E', '#D62976', '#962FBF', '#4F5BD5'] as const;
/** Anneau « déjà vu » : gris neutre, sans dégradé. */
const SEEN_RING = ['#3A3A3A', '#3A3A3A'] as const;

interface StoryRingProps {
  /** Diamètre de la photo, hors anneau. */
  size: number;
  uri?: string | null;
  label?: string | null;
  /** `false` retire complètement l'anneau (avatar nu). */
  hasStory?: boolean;
  /** Anneau gris = toutes les stories ont été vues. */
  seen?: boolean;
  /** Pastille « + » d'ajout de story (profil / « Votre story »). */
  showPlus?: boolean;
  ringWidth?: number;
  /** Couleur de l'écart entre l'anneau et la photo (doit matcher le fond). */
  gapColor?: string;
  style?: StyleProp<ViewStyle>;
}

export default function StoryRing({
  size,
  uri,
  label,
  hasStory = true,
  seen = false,
  showPlus = false,
  ringWidth = 2.5,
  gapColor = colors.bg,
  style,
}: StoryRingProps) {
  const gap = hasStory ? 2.5 : 0;
  const ring = hasStory ? ringWidth : 0;
  const outer = size + (ring + gap) * 2;

  const photo = uri ? (
    <Image
      source={{ uri }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      contentFit="cover"
      cachePolicy="memory-disk"
      transition={0}
      recyclingKey={uri}
    />
  ) : (
    <View
      style={[
        styles.fallback,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.fallbackText, { fontSize: Math.max(10, size * 0.36) }]}>
        {(label || 'U').trim().slice(0, 2).toUpperCase()}
      </Text>
    </View>
  );

  return (
    <View style={[{ width: outer, height: outer }, style]}>
      {hasStory ? (
        <LinearGradient
          colors={(seen ? SEEN_RING : STORY_GRADIENT) as unknown as string[] as any}
          start={{ x: 0.85, y: 0.05 }}
          end={{ x: 0.15, y: 0.95 }}
          style={[styles.center, { width: outer, height: outer, borderRadius: outer / 2 }]}
        >
          <View
            style={[
              styles.center,
              {
                width: size + gap * 2,
                height: size + gap * 2,
                borderRadius: (size + gap * 2) / 2,
                backgroundColor: gapColor,
              },
            ]}
          >
            {photo}
          </View>
        </LinearGradient>
      ) : (
        <View style={[styles.center, { width: outer, height: outer }]}>{photo}</View>
      )}

      {showPlus && (
        <View
          style={[
            styles.plus,
            {
              width: Math.max(18, size * 0.34),
              height: Math.max(18, size * 0.34),
              borderRadius: Math.max(9, size * 0.17),
              borderColor: gapColor,
            },
          ]}
        >
          <Ionicons name="add" size={Math.max(12, size * 0.22)} color="#fff" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  fallback: {
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontWeight: '700',
  },
  plus: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    backgroundColor: '#0095F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
  },
});
