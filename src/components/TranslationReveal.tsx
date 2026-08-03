import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, withAlpha } from '../theme';

interface TranslationRevealProps {
  tweetId: string;
  /** Code de la langue affichée, `null` pour la version originale. */
  language: string | null;
  children: React.ReactNode;
}

/**
 * Révélation d'un tweet traduit : une aurore traverse le texte pendant qu'il
 * s'allume, une seule fois.
 *
 * **Le déclencheur est le point délicat.** Les traductions arrivent en LOT au
 * chargement du fil, bien avant que le tweet soit à l'écran : jouer
 * l'animation à l'arrivée de la donnée la faisait passer dans le vide, et
 * l'utilisateur ne voyait jamais rien. Elle démarre donc au premier rendu de
 * la ligne — c'est-à-dire quand la FlatList la monte, à l'approche du champ de
 * vision — et le registre `revealed` garantit qu'un recyclage ne la rejoue
 * jamais.
 *
 * Deux autres partis pris :
 *  - **en fond, jamais en surimpression** : les couches lumineuses sont
 *    rendues avant le texte, donc derrière lui, et le texte garde son
 *    contraste à chaque image ;
 *  - **tout sur `useNativeDriver`** : le fil continue de défiler à 60 fps
 *    pendant la révélation.
 */
const revealed = new Set<string>();

/** Durées longues et assumées : en dessous d'une seconde, l'œil ne suit pas. */
const BLOOM_IN_MS = 420;
const SWEEP_MS = 1500;
const TEXT_MS = 760;
const BLOOM_OUT_MS = 620;
/** Laisse la ligne se poser avant de lancer : sinon la révélation joue pendant le scroll. */
const START_DELAY_MS = 180;

export default function TranslationReveal({
  tweetId,
  language,
  children,
}: TranslationRevealProps) {
  const sweep = useRef(new Animated.Value(0)).current;
  const bloom = useRef(new Animated.Value(0)).current;
  const textIn = useRef(new Animated.Value(1)).current;
  const [playing, setPlaying] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const previousLanguage = useRef<string | null>(null);

  useEffect(() => {
    // Retour à l'original : rien à révéler, et la prochaine traduction
    // choisie à la main doit pouvoir rejouer.
    if (!language) {
      previousLanguage.current = null;
      return;
    }
    const key = `${tweetId}:${language}`;
    if (previousLanguage.current === language || revealed.has(key)) return;
    previousLanguage.current = language;
    revealed.add(key);

    setPlaying(true);
    sweep.setValue(0);
    bloom.setValue(0);
    textIn.setValue(0);

    const animation = Animated.sequence([
      Animated.delay(START_DELAY_MS),
      Animated.parallel([
        // La halo s'installe d'abord : le bloc « respire » avant que l'onde
        // ne le traverse, ce qui annonce l'effet au lieu de le surprendre.
        Animated.timing(bloom, {
          toValue: 1,
          duration: BLOOM_IN_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(BLOOM_IN_MS * 0.45),
          Animated.timing(sweep, {
            toValue: 1,
            duration: SWEEP_MS,
            // Accélère, tient, puis s'étire en fin de course : c'est cette
            // asymétrie qui donne l'impression d'une lumière qui glisse.
            easing: Easing.bezier(0.16, 0.84, 0.24, 1),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.delay(BLOOM_IN_MS * 0.7),
          Animated.timing(textIn, {
            toValue: 1,
            duration: TEXT_MS,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ]),
      Animated.timing(bloom, {
        toValue: 0,
        duration: BLOOM_OUT_MS,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]);

    animation.start(({ finished }) => {
      if (finished) setPlaying(false);
    });
    return () => animation.stop();
  }, [language, tweetId, sweep, bloom, textIn]);

  const { width, height } = size;

  // Bande plus large que le bloc : une lueur étroite fait un trait qui passe,
  // une bande débordante illumine tout le paragraphe.
  const bandWidth = Math.max(180, width * 1.05);
  const sweepX = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: [-bandWidth, width + bandWidth * 0.35],
  });
  const sweepOpacity = sweep.interpolate({
    inputRange: [0, 0.12, 0.72, 1],
    outputRange: [0, 1, 0.92, 0],
  });
  // Léger basculement de la bande pendant la traversée : une diagonale vivante
  // plutôt qu'un rectangle qui coulisse.
  const sweepSkew = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: ['-9deg', '-15deg'],
  });

  const bloomOpacity = bloom.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const bloomScale = bloom.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1.06] });

  const textOpacity = textIn.interpolate({ inputRange: [0, 1], outputRange: [0.22, 1] });
  const textLift = textIn.interpolate({ inputRange: [0, 1], outputRange: [7, 0] });
  const textScale = textIn.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] });

  return (
    <View
      style={styles.container}
      onLayout={(event) =>
        setSize({
          width: event.nativeEvent.layout.width,
          height: event.nativeEvent.layout.height,
        })
      }
    >
      {playing && width > 0 && (
        <>
          {/* Halo : la nappe colorée qui donne de la présence au bloc */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.bloom,
              { opacity: bloomOpacity, transform: [{ scale: bloomScale }] },
            ]}
          >
            <LinearGradient
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              colors={[
                withAlpha(colors.accent, 0.15),
                withAlpha(colors.cyan, 0.08),
                withAlpha(colors.accent, 0.13),
              ]}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>

          {/* Onde : le cœur lumineux qui traverse */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.sweep,
              {
                width: bandWidth,
                height: Math.max(height + 44, 72),
                opacity: sweepOpacity,
                transform: [{ translateX: sweepX }, { rotateZ: sweepSkew }],
              },
            ]}
          >
            <LinearGradient
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              colors={[
                withAlpha(colors.accent, 0),
                withAlpha(colors.accent, 0.2),
                withAlpha(colors.white, 0.26),
                withAlpha(colors.cyan, 0.2),
                withAlpha(colors.cyan, 0),
              ]}
              locations={[0, 0.34, 0.5, 0.66, 1]}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </>
      )}

      <Animated.View
        style={{
          opacity: textOpacity,
          transform: [{ translateY: textLift }, { scale: textScale }],
        }}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
  },
  /**
   * Aux bords du bloc, pas au-delà : le conteneur découpe (`overflow: hidden`)
   * pour qu'aucune lueur ne bave sur les lignes voisines du fil. Des marges
   * négatives ici seraient rognées, et le rayon de bordure avec.
   */
  bloom: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
  },
  sweep: {
    position: 'absolute',
    top: -22,
    left: 0,
  },
});
