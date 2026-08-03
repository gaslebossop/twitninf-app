import React, { useMemo } from 'react';
import { Text, TextStyle, View, Platform, StyleSheet } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import {
  clampDisplayNamePrefs,
  displayNameTextStyles,
  NEON_PRESETS,
  resolveDisplayNameFontFamily,
  type DisplayNameEffectId,
} from '../utils/profileDisplayNamePrefs';
import {
  nameEffectOf,
  nameFontOf,
  type ProfileCustomization,
} from '../services/profileCustomizationService';
import type { VerificationStyle } from '../services/verificationStyleService';
import { AnimatedNameFill } from './ProfileDecoration';

/** Contour sombre (tube néon) pour que le glow reste lisible sur fond sombre. */
const NEON_OUTLINE_DXY: ReadonlyArray<{ dx: number; dy: number }> = [
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: -1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: -1 },
  { dx: 1, dy: -1 },
  { dx: -1, dy: 1 },
  { dx: 1, dy: 1 },
];

const NEON_OUTLINE_COLOR: Partial<Record<DisplayNameEffectId, string>> = {
  neon_cyan: 'rgba(6, 52, 68, 0.92)',
  neon_magenta: 'rgba(72, 22, 82, 0.92)',
  neon_lime: 'rgba(28, 58, 14, 0.92)',
  neon_gold: 'rgba(92, 42, 10, 0.92)',
};

export interface PremiumDisplayNameProps {
  text: string;
  baseStyle?: TextStyle;
  isPremium: boolean;
  subscriptionTierRaw?: string | null;
  fontId: string;
  effectId: string;
  numberOfLines?: number;
  /**
   * Personnalisation publique du compte. Quand elle porte une police ou un
   * effet de nom, elle GAGNE sur `fontId`/`effectId` : ces deux-là ne sont
   * qu'un réglage local à l'appareil, la personnalisation vient du serveur et
   * c'est elle que voient les visiteurs.
   */
  customization?: ProfileCustomization | null;
  /** Compte certifié + style de son badge : source de l'effet « Certifié ». */
  verified?: boolean;
  verificationStyle?: VerificationStyle | null;
}

/**
 * Nom affiché sur le profil : polices (système) + effets néon / chrome pour les comptes Pro.
 */
export default function PremiumDisplayName({
  text,
  baseStyle,
  isPremium,
  subscriptionTierRaw,
  fontId,
  effectId,
  numberOfLines = 2,
  customization,
  verified = false,
  verificationStyle,
}: PremiumDisplayNameProps) {
  const customFont = nameFontOf(customization);
  const customEffect = nameEffectOf(customization);
  const { fontId: f, effectId: ev } = useMemo(
    () =>
      clampDisplayNamePrefs(
        customFont !== 'system' ? customFont : fontId,
        effectId,
        isPremium,
        subscriptionTierRaw
      ),
    [customFont, fontId, effectId, isPremium, subscriptionTierRaw]
  );

  const fontFamily = resolveDisplayNameFontFamily(f);
  const effectStyles = displayNameTextStyles(ev, f);

  /**
   * Échelle des rayons de halo des presets néon.
   *
   * Deux corrections en une :
   *  - proportionnelle au corps réel du texte (les presets sont calibrés sur le
   *    grand nom du profil, 21 px ; un rayon fixe déborde sur un nom de 13 px) ;
   *  - resserrée d'un tiers, parce que le rayon le plus large valait ~1,05× le
   *    corps du texte. À cette échelle les ombres des lettres voisines se
   *    recouvrent, saturent, et le halo devient un aplat qui remplit la boîte du
   *    texte — le « rectangle » derrière le nom. Sous ~0,75× il redevient un tube.
   */
  const neonRadiusScale = useMemo(() => {
    const flat = StyleSheet.flatten(baseStyle) as TextStyle | undefined;
    const fontSize = typeof flat?.fontSize === 'number' ? flat.fontSize : 21;
    return (fontSize / 21) * 0.68;
  }, [baseStyle]);

  /**
   * Hauteur de ligne calculée sur le corps réel du texte.
   *
   * Le pseudo était rogné en bas dès que la taille choisie était grande
   * (« Géant » double le corps : 21 px → 42 px), et davantage encore avec une
   * police embarquée. Aucune `lineHeight` n'était posée : React Native
   * retombait sur la métrique par défaut de la police, qui ne couvre pas les
   * jambages de toutes les familles — Caveat et Cinzel dépassent nettement.
   * Une hauteur proportionnelle (1,28×) laisse la place quelle que soit la
   * famille et quelle que soit la taille.
   */
  const metrics = useMemo(() => {
    const flat = StyleSheet.flatten(baseStyle) as TextStyle | undefined;
    const fontSize = typeof flat?.fontSize === 'number' ? flat.fontSize : 21;
    return {
      lineHeight: Math.ceil(fontSize * 1.28),
      // La DERNIÈRE lettre était rognée avec certaines familles. React Native
      // dimensionne la boîte du texte sur la somme des chasses (`advance
      // width`), or sur une cursive comme Caveat, ou une italique, le dessin
      // du dernier glyphe déborde de sa propre chasse — la jambe du « y », la
      // boucle du « l ». Ce qui dépasse tombe alors hors de la boîte et est
      // coupé. Quelques points de marge à droite, proportionnels au corps,
      // rendent cette place.
      paddingRight: Math.ceil(fontSize * 0.12),
    } as TextStyle;
  }, [baseStyle]);

  const textStyle = useMemo(
    () => [baseStyle, metrics, fontFamily ? { fontFamily } : null, effectStyles] as TextStyle[],
    [baseStyle, metrics, fontFamily, effectStyles]
  );

  const neonFontStyle = useMemo(
    () =>
      [
        baseStyle,
        // Même hauteur de ligne que le rendu simple : les couches du néon sont
        // superposées, elles doivent partager exactement la même métrique,
        // sinon elles se décalent entre elles.
        metrics,
        fontFamily ? { fontFamily } : null,
        { fontWeight: effectStyles.fontWeight },
        Platform.OS === 'android' ? ({ includeFontPadding: false } as TextStyle) : null,
      ] as TextStyle[],
    [baseStyle, metrics, fontFamily, effectStyles.fontWeight]
  );

  // Effet animé aux couleurs du profil : il passe avant les presets néon/chrome,
  // qui portent des palettes figées sans rapport avec l'accent choisi.
  if (customEffect !== 'none') {
    return (
      <AnimatedNameFill
        customization={customization}
        name={text}
        style={textStyle}
        numberOfLines={numberOfLines}
        verified={verified}
        verificationStyle={verificationStyle}
      />
    );
  }

  if (ev === 'chrome') {
    const maskText = (
      <Text
        style={[...textStyle, Platform.OS === 'android' ? { color: '#000000' } : null]}
        numberOfLines={numberOfLines}
      >
        {text}
      </Text>
    );
    return (
      <MaskedView maskElement={maskText}>
        <LinearGradient
          colors={['#f8fafc', '#94a3b8', '#cbd5e1', '#fde68a', '#fbbf24', '#f8fafc']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={[...textStyle, styles.chromeHiddenFill]} numberOfLines={numberOfLines}>
            {text}
          </Text>
        </LinearGradient>
      </MaskedView>
    );
  }

  const neonLayers = NEON_PRESETS[ev as DisplayNameEffectId];
  if (neonLayers && neonLayers.length > 0) {
    const under = neonLayers.slice(0, -1);
    const top = neonLayers[neonLayers.length - 1];
    const outlineColor = NEON_OUTLINE_COLOR[ev as DisplayNameEffectId] ?? 'rgba(0, 0, 0, 0.78)';
    return (
      <View style={styles.neonWrap}>
        {NEON_OUTLINE_DXY.map((o, i) => (
          <Text
            key={`neon-outline-${i}`}
            pointerEvents="none"
            style={[
              ...neonFontStyle,
              styles.neonUnder,
              {
                zIndex: -1,
                color: outlineColor,
                transform: [{ translateX: o.dx }, { translateY: o.dy }],
              },
            ]}
            numberOfLines={numberOfLines}
          >
            {text}
          </Text>
        ))}
        {under.map((layer, i) => (
          <Text
            key={i}
            pointerEvents="none"
            style={[
              ...neonFontStyle,
              styles.neonUnder,
              {
                zIndex: i,
                color: layer.fill,
                textShadowColor: layer.shadowColor,
                textShadowOffset: { width: 0, height: 0 },
                textShadowRadius: layer.shadowRadius * neonRadiusScale,
              },
            ]}
            numberOfLines={numberOfLines}
          >
            {text}
          </Text>
        ))}
        <Text
          style={[
            ...neonFontStyle,
            styles.neonTop,
            {
              zIndex: under.length,
              color: top.fill,
              textShadowColor: top.shadowColor,
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: top.shadowRadius * neonRadiusScale,
            },
          ]}
          numberOfLines={numberOfLines}
        >
          {text}
        </Text>
      </View>
    );
  }

  return (
    <Text style={textStyle} numberOfLines={numberOfLines}>
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  chromeHiddenFill: {
    opacity: 0,
  },
  neonWrap: {
    position: 'relative',
    alignSelf: 'flex-start',
    backgroundColor: 'transparent',
    overflow: 'visible',
  },
  neonUnder: {
    position: 'absolute',
    left: 0,
    top: 0,
    alignSelf: 'flex-start',
  },
  neonTop: {
    alignSelf: 'flex-start',
  },
});
