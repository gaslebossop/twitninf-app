import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, fonts } from '../theme';

interface AvatarProps {
  size: number;
  username?: string | null;
  name?: string | null; // compat
  uri?: string | null;
  style?: any;
}

/**
 * `expo-image` remplace le composant `Image` de React Native : le cache mémoire
 * + disque évite de retélécharger le même avatar à chaque apparition dans le
 * fil, et le fondu supprime le clignotement au recyclage des lignes de liste.
 */
function Avatar({ size, username, name, uri, style }: AvatarProps) {
  const displayName = (username ?? name ?? 'U') as string;
  const initial = (displayName || 'U').trim().charAt(0).toUpperCase() || 'U';
  const hasUri = typeof uri === 'string' && uri.trim().length > 0;

  if (hasUri) {
    return (
      <Image
        source={{ uri: uri as string }}
        style={[{ width: size, height: size, borderRadius: size / 2 }, style]}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={140}
        recyclingKey={uri as string}
      />
    );
  }

  return (
    <LinearGradient
      colors={gradients.accent}
      style={[styles.gradient, { width: size, height: size, borderRadius: size / 2 }, style]}
    >
      <Text style={[styles.initial, { fontSize: Math.max(12, Math.floor(size * 0.42)) }]}>{initial}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    color: colors.onAccent,
    fontFamily: fonts.display,
    letterSpacing: -0.5,
  },
});

// Mémoïsé : un avatar réapparaît à l'identique sur chaque ligne recyclée.
export default React.memo(Avatar);
