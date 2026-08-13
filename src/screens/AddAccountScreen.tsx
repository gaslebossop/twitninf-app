import { colors, statusBarStyle } from '../theme';
import React from 'react';
import { StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import LoginScreen from './LoginScreen';
import { ScreenBackground, AppHeader } from '../components/ui';

// Cette page réutilise l'écran de connexion existant pour ajouter un compte
export default function AddAccountScreen() {
  const navigation = useNavigation();
  return (
    <ScreenBackground>
      <StatusBar barStyle={statusBarStyle()} backgroundColor={colors.bg} />
      <AppHeader navigation={navigation} title="Ajouter un compte" />
      <LoginScreen />
    </ScreenBackground>
  );
}
