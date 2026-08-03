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
  SafeAreaView,
} from 'react-native';
import FuturisticCarousel from '../components/FuturisticCarousel';
import { colors, fonts } from '../theme';
import { ScreenBackground } from '../components/ui';

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
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

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
