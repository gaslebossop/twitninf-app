import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '../../theme';

/**
 * Écran de chargement plein écran — lancement de l'app (polices, session).
 * Volontairement sobre : logo + respiration douce, pas de spinner coloré ni
 * de dégradé. Reste à l'écran quelques centaines de ms tout au plus, une
 * mise en scène plus poussée serait hors de proportion.
 */
export default function AppLoadingScreen({ style }: { style?: StyleProp<ViewStyle> }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  return (
    // `style` sert à le poser en VOILE (`StyleSheet.absoluteFill`) plutôt qu'en
    // écran exclusif : l'arbre applicatif se monte alors dessous et l'auth
    // avance pendant que les polices arrivent, au lieu d'attendre son tour.
    <View style={[styles.root, style]}>
      <Animated.View
        // `renderToHardwareTextureAndroid` / `shouldRasterizeIOS` : la vue est
        // gravée en texture une fois, puis l'échelle et l'opacité de la boucle
        // ne sont plus qu'une composition GPU — même dispositif que
        // `FeedRefreshLogo.tsx`.
        renderToHardwareTextureAndroid
        shouldRasterizeIOS
        style={{
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
        }}
      >
        {/* PAS `assets/icon.png` (1920×1920, 126 Ko) : affiché à 64 pt et
            animé en boucle infinie, il forçait le décodage de 3,69 Mpx sur le
            chemin le plus chargé du démarrage (polices + restauration de
            session). `refresh-mark.png` est le même dessin, déjà gravé à sa
            taille d'écran (144×144, 6 Ko) pour ce même problème ailleurs
            (voir `FeedRefreshLogo.tsx`). */}
        <Image source={require('../../../assets/refresh-mark.png')} style={styles.logo} resizeMode="contain" />
      </Animated.View>
      <View style={styles.dots}>
        <View style={styles.dot} />
        <View style={[styles.dot, styles.dotMid]} />
        <View style={styles.dot} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 64,
    height: 64,
    marginBottom: 24,
    tintColor: colors.textPrimary,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceElevated,
  },
  dotMid: {
    backgroundColor: colors.borderStrong,
  },
});
