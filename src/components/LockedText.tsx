import React, { useEffect } from 'react';
import { Image, LayoutChangeEvent, Platform, StyleProp, StyleSheet, Text, TextStyle, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, withAlpha } from '../theme';
import { GLASS_GRAIN_URI } from '../assets/glassGrain';

/**
 * Texte d'un contenu payant non acheté, vu à travers une vitre dépolie.
 *
 * Le serveur n'envoie jamais le vrai texte : il renvoie un brouillage de même
 * longueur, espaces et retours à la ligne conservés. Il est donc écrit ICI en
 * pleine encre, et c'est la vitre posée par-dessus qui le rend illisible.
 * Rien à protéger côté client : ce qui se floute n'est déjà plus la
 * marchandise.
 *
 * Cinq couches, dans cet ordre — c'est leur empilement qui fait lire
 * « verre » plutôt que « texte raté » :
 *
 * 1. **l'encre**, déjà légèrement bavée. C'est le repli si le flou natif ne
 *    rend pas : on retombe sur un texte sale, jamais sur un bloc vide ;
 * 2. **le flou natif** (`UIVisualEffectView` sur iOS, `dimezisBlurView` sur
 *    Android) : le seul vrai flou, celui qui donne la matière ;
 * 3. **le grain**, en mosaïque. Un flou seul donne une image hors focus ;
 *    c'est le micro-relief qui la fait lire comme du verre DÉPOLI ;
 * 4. **le reflet fixe** : dégradé diagonal pâle + arêtes claires en haut et
 *    en bas. Une surface de verre attrape toujours la lumière sur une arête,
 *    et c'est ce qui pose le bloc au lieu de le laisser flotter ;
 * 5. **le balayage** : une bande de lumière qui traverse lentement, en
 *    boucle. Un bloc figé se lit comme une image ratée ; c'est le mouvement
 *    qui dit « il y a quelque chose derrière ».
 *
 * Le balayage est une boucle CONTINUE, pas une entrée : le recyclage d'une
 * ligne de `FlatList` la reprend en cours de route sans rejouer d'apparition.
 * Linéaire et sans ressort — rien qui rebondisse.
 *
 * Exception assumée à la règle « pas de verre décoratif » de la DA : ici le
 * verre n'est pas un habillage, c'est l'objet même — ce qu'on vend est
 * derrière.
 *
 * Ne jamais poser ce composant sur un aperçu écrit par le créateur : cet
 * aperçu-là est une accroche, il est fait pour être lu.
 */

interface Props {
  text: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  /** Couleur de l'encre sous la vitre — celle qu'aurait eue le texte réel. */
  tint?: string;
}

// iOS floute plus fort à intensité égale ; Android a besoin qu'on pousse pour
// atteindre le même rendu.
const BLUR_INTENSITY = Platform.OS === 'ios' ? 34 : 60;

/** Un aller lent, puis la bande attend hors cadre avant de repasser. */
const SWEEP_TRAVEL_MS = 2200;
const SWEEP_PAUSE_MS = 2600;
const SWEEP_WIDTH = 120;

export default function LockedText({ text, style, numberOfLines, tint }: Props) {
  const ink = tint || colors.textPrimary;

  const [paneWidth, setPaneWidth] = React.useState(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!paneWidth) return;
    // Le cycle complet inclut la pause : la bande passe, puis reste hors
    // cadre. Sans ce temps mort, le fil entier scintille en permanence et
    // devient fatigant à lire.
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, {
        duration: SWEEP_TRAVEL_MS + SWEEP_PAUSE_MS,
        easing: Easing.linear,
      }),
      -1,
      false,
    );
  }, [paneWidth, progress]);

  const sweepStyle = useAnimatedStyle(() => {
    const travelShare = SWEEP_TRAVEL_MS / (SWEEP_TRAVEL_MS + SWEEP_PAUSE_MS);
    // Au-delà de la part de trajet, la bande est parquée à droite, invisible.
    const advance = Math.min(progress.value / travelShare, 1);
    const span = paneWidth + SWEEP_WIDTH;
    // Tuple explicite : sans lui, TS unifie les deux formes de transformation
    // en une union que le type `transform` de RN refuse.
    return {
      transform: [
        { translateX: -SWEEP_WIDTH + advance * span },
        { rotate: '18deg' },
      ] as [{ translateX: number }, { rotate: string }],
    };
  }, [paneWidth]);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next && next !== paneWidth) setPaneWidth(next);
  };

  return (
    <View style={styles.pane} onLayout={onLayout}>
      <Text
        style={[
          style,
          styles.ink,
          { color: withAlpha(ink, 0.82), textShadowColor: withAlpha(ink, 0.5) },
        ]}
        numberOfLines={numberOfLines}
        // Le brouillage n'a aucun sens à voix haute : on annonce l'état, et le
        // verrou juste en dessous porte le prix et le bouton.
        accessibilityLabel="Contenu réservé, non déverrouillé"
      >
        {text}
      </Text>

      <BlurView
        intensity={BLUR_INTENSITY}
        tint="dark"
        experimentalBlurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <Image
        source={{ uri: GLASS_GRAIN_URI }}
        resizeMode="repeat"
        style={[StyleSheet.absoluteFill, styles.grain]}
      />

      <LinearGradient
        colors={[
          withAlpha(colors.textPrimary, 0.14),
          withAlpha(colors.textPrimary, 0.02),
          withAlpha(colors.textPrimary, 0.07),
        ]}
        locations={[0, 0.55, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <Animated.View style={[styles.sweep, sweepStyle]} pointerEvents="none">
        <LinearGradient
          colors={[
            'transparent',
            withAlpha(colors.textPrimary, 0.16),
            withAlpha(colors.textPrimary, 0.03),
            'transparent',
          ]}
          locations={[0, 0.45, 0.62, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Arêtes : la tranche d'une vitre est plus claire que sa surface, et
          l'arête basse renvoie moins de lumière que la haute. */}
      <View style={styles.topEdge} pointerEvents="none" />
      <View style={styles.bottomEdge} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  pane: {
    marginTop: 2,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(colors.textPrimary, 0.13),
    backgroundColor: withAlpha(colors.textPrimary, 0.03),
  },
  ink: {
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 5,
  },
  grain: {
    opacity: 0.16,
  },
  sweep: {
    position: 'absolute',
    top: -40,
    bottom: -40,
    left: 0,
    width: SWEEP_WIDTH,
  },
  topEdge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: withAlpha(colors.textPrimary, 0.24),
  },
  bottomEdge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: withAlpha(colors.textPrimary, 0.08),
  },
});
