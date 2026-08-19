import React from 'react';
import {
  Image,
  Platform,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, withAlpha } from '../theme';
import { GLASS_GRAIN_URI } from '../assets/glassGrain';

/**
 * Aperçu d'un contenu payant dont le vrai texte reste côté serveur.
 *
 * Le panneau reprend le principe des PPV de plateformes de créateurs : le
 * contenu verrouillé est l'objet principal, le cadenas et le prix sont au
 * centre, et l'appel à l'action vient immédiatement dessous. La hauteur est
 * volontairement bornée pour qu'un faux texte très long ne transforme jamais
 * la page en immense rectangle vide.
 */

interface Props {
  text: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  tint?: string;
  price?: number;
  compact?: boolean;
}

const GLASS_TINT: React.ComponentProps<typeof BlurView>['tint'] =
  Platform.OS === 'ios' ? 'systemMaterialDark' : 'dark';

export default function LockedText({
  text,
  style,
  numberOfLines,
  tint,
  price,
  compact = false,
}: Props) {
  const ink = tint || colors.textPrimary;
  const visibleLines = Math.min(numberOfLines ?? (compact ? 5 : 8), compact ? 5 : 8);
  const displayedPrice = typeof price === 'number'
    ? price.toLocaleString('fr-FR', { maximumFractionDigits: 2 })
    : null;

  return (
    <View
      style={[styles.frame, compact && styles.frameCompact]}
      accessible
      accessibilityLabel={
        displayedPrice
          ? `Contenu privé verrouillé, ${displayedPrice} NF`
          : 'Contenu privé verrouillé'
      }
    >
      {/* Un soupçon des couleurs de l'app traverse le verre sombre. Elles
          remplacent la grande nappe rose/cyan qui donnait un aspect casino. */}
      <LinearGradient
        colors={[
          withAlpha(colors.accent, 0.14),
          'rgba(22,22,26,0.34)',
          withAlpha(colors.cyan, 0.08),
        ]}
        locations={[0, 0.52, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={styles.scrambledCopy} pointerEvents="none">
        <Text
          style={[
            style,
            styles.ink,
            { color: withAlpha(ink, 0.34), textShadowColor: withAlpha(ink, 0.4) },
          ]}
          numberOfLines={visibleLines}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {text}
        </Text>
      </View>

      {/* Pas de `experimentalBlurMethod` sur Android : le mode "dimezisBlurView"
          passe par un flou RenderScript qui plante avec
          `RSIllegalArgumentException: Radius out of range` sur certains
          environnements (observé sur émulateur BlueStacks) — la doc expo-blur
          le documente elle-même comme experimental. Le défaut `'none'`
          retombe sur un simple voile semi-transparent, sans risque natif. */}
      <BlurView
        intensity={Platform.OS === 'ios' ? 86 : 96}
        tint={GLASS_TINT}
        blurReductionFactor={2.4}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <LinearGradient
        colors={[
          colors.overlayMedium,
          colors.overlaySoft,
          'rgba(0,0,0,0.20)',
        ]}
        locations={[0, 0.42, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <Image
        source={{ uri: GLASS_GRAIN_URI }}
        resizeMode="repeat"
        style={[StyleSheet.absoluteFill, styles.grain]}
      />

      <View style={styles.center} pointerEvents="none">
        <View style={[styles.lockHalo, compact && styles.lockHaloCompact]}>
          <LinearGradient
            colors={[colors.overlayStrong, colors.overlaySoft]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.lockGlass}
          >
            <Ionicons
              name="lock-closed"
              size={compact ? 23 : 28}
              color={colors.white}
            />
          </LinearGradient>
        </View>

        <Text style={[styles.label, compact && styles.labelCompact]}>CONTENU PRIVÉ</Text>
        {displayedPrice && (
          <Text style={[styles.price, compact && styles.priceCompact]}>{displayedPrice} NF</Text>
        )}
      </View>

      <View style={styles.topHighlight} pointerEvents="none" />
      <View style={styles.bottomShade} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    aspectRatio: 1.62,
    marginTop: 4,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#111114',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.overlayStrong,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 6,
  },
  frameCompact: {
    aspectRatio: 1.86,
    borderRadius: radius.md + 2,
  },
  scrambledCopy: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 18,
  },
  ink: {
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  grain: {
    opacity: 0.08,
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockHalo: {
    width: 68,
    height: 68,
    padding: 1,
    marginBottom: 14,
    borderRadius: 34,
    backgroundColor: colors.overlayStrong,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.36,
    shadowRadius: 14,
    elevation: 6,
  },
  lockHaloCompact: {
    width: 56,
    height: 56,
    marginBottom: 10,
    borderRadius: 28,
  },
  lockGlass: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 99,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.overlayStrong,
  },
  label: {
    color: colors.textPrimary,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
    letterSpacing: 1.55,
  },
  labelCompact: {
    fontSize: 9,
  },
  price: {
    color: colors.white,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '800',
    letterSpacing: -0.45,
    marginTop: 3,
  },
  priceCompact: {
    fontSize: 17,
    lineHeight: 21,
  },
  topHighlight: {
    position: 'absolute',
    top: 0,
    left: 12,
    right: 12,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.overlayStrong,
  },
  bottomShade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
});
