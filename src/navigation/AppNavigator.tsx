import React from 'react';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { navigationRef } from './NavigationService';
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
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: 'transparent',
    card: 'transparent',
    text: colors.textPrimary,
    border: colors.border,
  },
};

export default function AppNavigator() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <AppLoadingScreen />;
  }

  return (
    <View style={styles.root}>
      {/* Fond signature « Encre Glass » — rendu UNE fois derrière toute l'app */}
      <ScreenBackground style={StyleSheet.absoluteFill} />
      <NavigationContainer ref={navigationRef} theme={TransparentTheme}>
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
