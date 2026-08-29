import React, { useState } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { navigationRef } from './NavigationService';
import { recordScreen } from '../services/breadcrumbs';
import { useDeepLinkNavigation } from '../services/deepLinks';
import { createStackNavigator } from '@react-navigation/stack';
import { Platform } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { StyleSheet, View } from 'react-native';
import { colors } from '../theme';
import ScreenBackground from '../components/ui/ScreenBackground';
import AppLoadingScreen from '../components/ui/AppLoadingScreen';

import IntroScreen from '../screens/IntroScreen';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import MainNavigator from './MainNavigator';
import ApiTest from '../components/ApiTest';

export type RootStackParamList = {
  Intro: undefined;
  Login: undefined;
  Register: undefined;
  MainApp: undefined; // Point d'entrée principal avec tabs
  ApiTest: undefined;
};

const RootStack = createStackNavigator<RootStackParamList>();

const TransparentTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: 'transparent',
    card: 'transparent',
  },
};

export default function AppNavigator() {
  const { isAuthenticated, isLoading } = useAuth();
  // Un lien partagé peut arriver avant que l'arbre de navigation existe :
  // `useDeepLinkNavigation` le garde en attente jusqu'à ce que les deux
  // conditions soient réunies (prêt ET connecté).
  const [navigationReady, setNavigationReady] = useState(false);
  useDeepLinkNavigation(isAuthenticated, navigationReady);

  if (__DEV__) console.count('[loop-hunt] AppNavigator render');

  if (isLoading) {
    return <AppLoadingScreen />;
  }

  return (
    <View style={styles.root}>
      {/* Fond signature « Encre Glass » — rendu UNE fois derrière toute l'app */}
      <ScreenBackground style={StyleSheet.absoluteFill} />
      {/*
        Le fil des écrans traversés se remplit ICI et nulle part ailleurs :
        un seul point d'écoute, donc aucun écran n'a à penser à se déclarer et
        aucun ne peut être oublié. Voir `services/breadcrumbs`.
      */}
      <NavigationContainer
        ref={navigationRef}
        theme={TransparentTheme}
        onReady={() => {
          setNavigationReady(true);
          recordScreen(navigationRef.getCurrentRoute()?.name);
        }}
        onStateChange={() => recordScreen(navigationRef.getCurrentRoute()?.name)}
      >
        <RootStack.Navigator
          id={undefined}
          screenOptions={{
            headerShown: false,
            cardStyle: { backgroundColor: 'transparent' },
          }}
          initialRouteName={isAuthenticated ? "MainApp" : "Intro"}
        >
          {!isAuthenticated ? (
            // Routes publiques (non authentifiées)
            <>
              <RootStack.Screen name="Intro" component={IntroScreen} />
              <RootStack.Screen name="Login" component={LoginScreen} />
              <RootStack.Screen name="Register" component={RegisterScreen} />
              <RootStack.Screen name="ApiTest" component={ApiTest} />
            </>
          ) : (
            // Routes protégées (authentifiées)
            <>
              <RootStack.Screen 
                name="MainApp" 
                component={MainNavigator}
                options={{
                  gestureEnabled: false, // Empêche le retour en arrière
                }}
              />
            </>
          )}
        </RootStack.Navigator>
      </NavigationContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
});
