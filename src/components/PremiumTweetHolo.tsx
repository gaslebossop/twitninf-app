import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { apiService } from '../services';
import { colors } from '../theme';
import type { ProfileCustomization } from '../services/profileCustomizationService';

/* ════════════════════════════════════════════════════════════════════════
   Holo premium — animation d'entrée d'une publication (mobile)
   Pendant du composant Windows : ouvrir la publication d'un abonné fait
   monter une lumière à la couleur de son profil — une pulsation qui
   s'ouvre depuis le haut, puis retombe sur une nappe calme qui respire.

   Règle : QUE de la lumière, aucune géométrie. Les deux couches sont des
   dégradés RADIAUX (react-native-svg) qui s'éteignent en transparence
   avant les bords de leur boîte : aucune arête ne peut apparaître, à
   aucun moment. Un `LinearGradient` dans une View arrondie aurait, lui,
   un bord visible — c'est précisément ce qu'on ne veut pas.

   Tout est peint DERRIÈRE le contenu et l'animation rejoue à chaque
   ouverture (le composant est monté avec l'id de la publication en clé).
   ════════════════════════════════════════════════════════════════════════ */

/** Hauteur habillée, en px. */
const HOLO_HEIGHT = 540;

/** Personnalisations déjà résolues : rouvrir une publication ne refait pas d'appel. */
const themeCache = new Map<string, ProfileCustomization | null>();

export function isPremiumAuthor(author?: any): boolean {
  const tier = author?.subscription_tier;
  return tier === 'plus' || tier === 'pro' || Boolean(author?.premium);
}

export interface PremiumAuthorTheme {
  /** Vrai seulement quand l'auteur est abonné ET que sa couleur est connue. */
  ready: boolean;
  accent: string;
  secondary: string;
}

/**
 * Résout la couleur de profil de l'auteur. Les publications ne portent pas
 * la personnalisation : on la complète avec le profil complet, une seule
 * fois par auteur. Tant qu'elle est inconnue, on n'habille rien — mieux
 * vaut un écran neutre qu'un habillage qui saute.
 */
export function usePremiumAuthorTheme(author?: any): PremiumAuthorTheme {
  const id = author?.id ? String(author.id) : '';
  const premium = isPremiumAuthor(author);
  const known: ProfileCustomization | null | undefined =
    author?.profile_customization ?? (themeCache.has(id) ? themeCache.get(id) : undefined);
  const [theme, setTheme] = useState<ProfileCustomization | null | undefined>(known);

  useEffect(() => {
    setTheme(known);
    if (!premium || !id || known !== undefined) return;

    let active = true;
    apiService
      .getUserProfile(id)
      .then((res: any) => {
        const customization = (res?.data?.user ?? res?.data)?.profile_customization ?? null;
        themeCache.set(id, customization);
        if (active) setTheme(customization);
      })
      .catch(() => {
        // Couleur inconnue : la publication reste neutre, jamais mal habillée.
      });
    return () => {
      active = false;
    };
  }, [id, premium]);

  const accent = theme?.accent_color || colors.accent;
  return {
    ready: premium && theme !== undefined,
    accent,
    secondary: theme?.secondary_color || accent,
  };
}

export default function PremiumTweetHolo({
  accent,
  secondary,
}: {
  accent: string;
  secondary: string;
}) {
  // Entrée (une passe) et respiration (boucle) sont deux valeurs SÉPARÉES,
  // multipliées entre elles : la boucle démarre donc exactement sur l'état
  // final de l'entrée. Enchaîner deux animations sur la même valeur ferait
  // sauter l'image d'une frame — ça se lit comme un bug.
  const enter = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const bloom = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Décélération DOUCE. Surtout pas de `bezier(0.16, 1, 0.3, 1)` : cette
    // courbe abat 90 % de la course dans le premier quart du temps puis
    // rampe — à l'écran ça se lit « ça se téléporte, puis c'est au ralenti ».
    const entrance = Animated.timing(enter, {
      toValue: 1,
      duration: 1400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    // La pulsation est LINÉAIRE : sa forme (montée puis extinction) est déjà
    // portée par l'interpolation. Une courbe par-dessus déplacerait le pic
    // au tout début et étirerait la fin.
    const pulse = Animated.timing(bloom, {
      toValue: 1,
      duration: 2000,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 7500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 7500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    entrance.start(({ finished }) => {
      if (finished) loop.start();
    });
    pulse.start();

    return () => {
      entrance.stop();
      pulse.stop();
      loop.stop();
    };
  }, []);

  const ambientStyle = {
    opacity: Animated.multiply(
      enter,
      breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 0.84] })
    ),
    transformOrigin: '50% 0%',
    transform: [
      { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [-26, 0] }) },
      {
        scale: Animated.multiply(
          enter.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }),
          breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] })
        ),
      },
    ],
  };

  const bloomStyle = {
    opacity: bloom.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 0] }),
    // Origine en haut : la boîte fait 540 px, une mise à l'échelle depuis le
    // centre ferait REMONTER le noyau hors de l'écran au lieu de l'ouvrir.
    transformOrigin: '50% 0%',
    transform: [{ scale: bloom.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1.35] }) }],
  };

  return (
    <View style={styles.holo} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, ambientStyle as any]}>
        <Svg width="100%" height="100%">
          <Defs>
            {/* Le noyau est descendu à 18 % de la hauteur : centré sur 0, la
                moitié du halo passait au-dessus du bord de l'écran et derrière
                l'en-tête — on ne voyait presque rien. */}
            <RadialGradient id="holoAmbient" cx="0.5" cy="0.18" rx="1.1" ry="0.6">
              <Stop offset="0" stopColor={accent} stopOpacity={0.54} />
              <Stop offset="0.44" stopColor={secondary} stopOpacity={0.22} />
              <Stop offset="0.8" stopColor={secondary} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#holoAmbient)" />
        </Svg>
      </Animated.View>

      <Animated.View style={[StyleSheet.absoluteFill, bloomStyle]}>
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id="holoBloom" cx="0.5" cy="0.2" rx="0.66" ry="0.46">
              <Stop offset="0" stopColor={accent} stopOpacity={0.9} />
              <Stop offset="0.34" stopColor={secondary} stopOpacity={0.42} />
              <Stop offset="0.7" stopColor={secondary} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#holoBloom)" />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  holo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: HOLO_HEIGHT,
    zIndex: 0,
  },
});
