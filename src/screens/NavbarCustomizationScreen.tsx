import React from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { statusBarStyle } from '../theme';
import { AppHeader, ScreenBackground } from '../components/ui';
import NavbarOnboardingModal from '../components/NavbarOnboardingModal';
import { useNavbarPrefs } from '../contexts/NavbarPrefsContext';

interface NavbarCustomizationScreenProps {
  navigation: any;
}

/**
 * Personnalisation de la navbar — page dediee depuis Reglages, remplace la
 * feuille qui remontait du bas. Reutilise NavbarOnboardingModal en mode
 * `embedded` (voir ce fichier) : meme logique de selection/apercu que
 * l'onboarding, juste sans le `<Modal>` ni l'etape tutoriel qui n'a de sens
 * qu'a la premiere connexion.
 */
const NavbarCustomizationScreen: React.FC<NavbarCustomizationScreenProps> = ({ navigation }) => {
  const { selected, save } = useNavbarPrefs();

  return (
    <ScreenBackground>
      <View style={styles.container}>
        <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
        <AppHeader navigation={navigation} title="Personnaliser la navbar" />

        <NavbarOnboardingModal
          visible
          mode="settings"
          embedded
          initialSelected={selected}
          onComplete={(next) => {
            save(next);
            navigation.goBack();
          }}
          onCancel={() => navigation.goBack()}
        />
      </View>
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
});

export default NavbarCustomizationScreen;
