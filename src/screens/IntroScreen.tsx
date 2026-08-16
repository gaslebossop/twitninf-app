import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  StatusBar,
  Dimensions,
  Animated,
  TouchableOpacity,
  Text,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FuturisticCarousel from '../components/FuturisticCarousel';
import { colors, fonts , statusBarStyle} from '../theme';
import { AppStatusBar, ScreenBackground } from '../components/ui';

const { width, height } = Dimensions.get('window');

export default function IntroScreen({ navigation }: any) {
  const [showCarousel, setShowCarousel] = useState(true);
  const fadeAnim = new Animated.Value(0);

  // Animation d'entrée
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1000,
      useNativeDriver: true,
    }).start();
  }, []);

  // Réinitialiser le carrousel quand on revient sur cette page
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      setShowCarousel(true);
    });

    return unsubscribe;
  }, [navigation]);

  const handleCarouselFinish = () => {
    setShowCarousel(false);
  };

  // Navigation directe vers Login après la fin du carrousel
  useEffect(() => {
    if (!showCarousel) {
      navigation.navigate('Login');
    }
  }, [showCarousel, navigation]);

  return (
    <ScreenBackground>
      {/* `SafeAreaView` de `react-native-safe-area-context`, PAS celle du
          coeur de React Native : cette derniere ne pose aucun inset sur
          Android. `edges={['top']}` seulement — le bas est deja tenu par
          ce qui s'y trouve. */}
      <SafeAreaView style={[styles.container, showCarousel && styles.containerCarousel]} edges={['top']}>
        <AppStatusBar barStyle={showCarousel ? 'light-content' : undefined} />

        {showCarousel ? (
          <FuturisticCarousel onFinish={handleCarouselFinish} />
        ) : (
          <View style={styles.loginContainer}>
            <Text style={styles.welcomeText}>Bienvenue sur TwitNinf</Text>
            <Text style={styles.subtitleText}>Connectez-vous pour continuer</Text>
          </View>
        )}
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  /**
   * Le carrousel a son propre fond sombre FIXE (`BG_GRADIENT` dans
   * `FuturisticCarousel`), mais il ne couvre que l'intérieur du
   * `SafeAreaView` — la bande au-dessus (encoche / barre de statut) restait
   * `transparent` et laissait passer le fond thémé de `ScreenBackground`,
   * blanc en clair : un bandeau blanc au-dessus d'un écran par ailleurs
   * sombre. Ce fond n'est appliqué QUE pendant le carrousel : une fois
   * basculé sur l'écran de connexion (thémé, adaptatif), il redevient
   * transparent.
   */
  containerCarousel: {
    backgroundColor: '#0B0C0F',
  },
  testButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    borderRadius: 8,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  testButtonGradient: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  testButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  loginContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  welcomeText: {
    fontSize: 32,
    fontFamily: fonts.displayHeavy,
    color: colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.9,
    marginBottom: 10,
  },
  subtitleText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
