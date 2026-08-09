import React, { useEffect, useState } from 'react';
import { Platform, StatusBar, View, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useFonts } from 'expo-font';
import { fontAssets, colors } from './src/theme';
import AppLoadingScreen from './src/components/ui/AppLoadingScreen';
import { AuthProvider } from './src/contexts/AuthContext';
import { EventProvider } from './src/contexts/EventContext';
import { EventThemeProvider } from './src/components/EventThemeProvider';
import { FunctionalEventProvider } from './src/contexts/FunctionalEventContext';
import { OfflineProvider } from './src/contexts/OfflineContext';
import { ReadingLanguageProvider, useReadingLanguage } from './src/contexts/ReadingLanguageContext';
import ReadingLanguageModal from './src/components/ReadingLanguageModal';
import { StartupPopupProvider, useStartupPopupSlot } from './src/contexts/StartupPopupContext';
import { ToastProvider } from './src/components/ui/Toast';
import { ConfirmProvider } from './src/components/ui/ConfirmSheet';
import { ActionSheetProvider } from './src/components/ui/ActionSheet';
import { PromptProvider } from './src/components/ui/PromptSheet';
import { RewardProvider } from './src/components/ui/RewardBurst';
import AppNavigator from './src/navigation/AppNavigator';
import 'react-native-gesture-handler';
import { registerForPushNotifications, setupFranceDailyLocalNotifications } from './src/services/push';
import { apiService } from './src/services';
import ProfileCompletionGate from './src/components/ProfileCompletionGate';
import ConsentGate from './src/components/ConsentGate';
import FollowOnboardingGate from './src/components/FollowOnboardingGate';

/**
 * Choix de la langue de lecture à la première connexion.
 *
 * Monté au-dessus du navigateur pour que la question soit posée quel que soit
 * l'écran d'arrivée, et une seule fois : dès que le choix est enregistré,
 * `needsChoice` retombe à faux définitivement (le champ est stocké côté
 * serveur, pas seulement sur l'appareil).
 */
function ReadingLanguageGate() {
  const { needsChoice } = useReadingLanguage();
  // Passe par la file d'attente des popups de démarrage : elle est prioritaire,
  // mais ne doit pas se superposer aux trois autres (voir StartupPopupContext).
  const visible = useStartupPopupSlot('language', needsChoice);
  return <ReadingLanguageModal visible={visible} />;
}

export default function App() {
  // Chargement des polices : le duo de l'app (Plus Jakarta Sans + Inter) et les
  // familles du nom affiché premium (voir `displayNameFonts`).
  // Non bloquant : si le chargement échoue ou traîne, on affiche l'app
  // avec la police système en repli (aucun écran figé possible).
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const [forceReady, setForceReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setForceReady(true), 4000);
    return () => clearTimeout(t);
  }, []);
  const fontsReady = fontsLoaded || !!fontError || forceReady;

  useEffect(() => {
    (async () => {
      try {
        // Vérification de la disponibilité de Constants
        if (!Constants) {
          console.error('❌ Constants is undefined');
          return;
        }

        // Utilise le Project ID EAS défini dans app.json
        const projectId = (Constants as any)?.expoConfig?.extra?.eas?.projectId
          || (Constants as any)?.easConfig?.projectId
          || '341da021-111f-4a0c-9f54-0b5f4c9c3965'; // Project ID correct depuis app.json
        
        console.log('🔔 App - Project ID pour notifications:', projectId);
        
        const token = await registerForPushNotifications(projectId);
        console.log('🔔 App - Token de notification obtenu:', token ? 'Oui' : 'Non');

        await setupFranceDailyLocalNotifications();
        console.log('🔔 App - Rappels locaux FR configurés');
        
        if (token) {
          // Attendre que l'API service soit initialisé
          let retryCount = 0;
          const maxRetries = 10;
          
          const tryRegisterDevice = async () => {
            if (apiService?.token) {
              try {
                console.log('🔔 App - Tentative d\'enregistrement du device...');
                const response = await fetch(`${apiService.getConnectionStatus().baseURL}/api/notifications/register-device`, {
                  method: 'POST',
                  headers: { 
                    'Content-Type': 'application/json', 
                    'Authorization': `Bearer ${apiService.token}` 
                  },
                  body: JSON.stringify({ expoPushToken: token })
                });
                
                if (response.ok) {
                  console.log('✅ App - Device enregistré avec succès');
                } else {
                  console.error('❌ App - Erreur enregistrement device:', response.status, response.statusText);
                }
              } catch (error) {
                console.error('❌ App - Erreur lors de l\'enregistrement du device:', error);
              }
            } else if (retryCount < maxRetries) {
              retryCount++;
              console.log(`🔔 App - Token API non disponible, nouvelle tentative dans 1s (${retryCount}/${maxRetries})`);
              setTimeout(tryRegisterDevice, 1000);
            } else {
              console.error('❌ App - Impossible d\'enregistrer le device après plusieurs tentatives');
            }
          };
          
          tryRegisterDevice();
        }
      } catch (error) {
        console.error('❌ App - Erreur lors de l\'initialisation des notifications:', error);
      }
    })();
  }, []);
  
  if (!fontsReady) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AppLoadingScreen />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
      {/* Les deux hôtes sont montés le plus haut possible : leur calque se
          dessine APRÈS l'arbre applicatif, donc au-dessus de n'importe quel
          écran. `ToastProvider` enveloppe `ConfirmProvider` pour qu'un message
          reste lisible même pendant une question. */}
      <ToastProvider>
      <ConfirmProvider>
      <ActionSheetProvider>
      <PromptProvider>
      <RewardProvider>
      <AuthProvider>
        {/* Sous AuthProvider : le mode hors ligne dépend du palier du compte. */}
        <OfflineProvider>
          <ReadingLanguageProvider>
          <StartupPopupProvider>
          <EventProvider>
            <EventThemeProvider>
              <FunctionalEventProvider>
                <StatusBar
                  barStyle="light-content"
                  translucent={Platform.OS !== 'android'}
                  backgroundColor={Platform.OS === 'android' ? '#010008' : 'transparent'}
                />
                <AppNavigator />
                <ReadingLanguageGate />
                <ProfileCompletionGate />
                {/* Dernier de la file des popups de démarrage : le socle légal
                    se pose une fois que les autres questions sont passées. */}
                <ConsentGate />
                <FollowOnboardingGate />
              </FunctionalEventProvider>
            </EventThemeProvider>
          </EventProvider>
          </StartupPopupProvider>
          </ReadingLanguageProvider>
        </OfflineProvider>
      </AuthProvider>
      </RewardProvider>
      </PromptProvider>
      </ActionSheetProvider>
      </ConfirmProvider>
      </ToastProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
