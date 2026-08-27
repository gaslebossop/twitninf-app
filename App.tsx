import React, { useEffect, useState } from 'react';
import { Platform, StatusBar, StyleSheet, View, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useFonts, loadAsync as loadFontsAsync } from 'expo-font';
import { coreFontAssets, displayNameFontAssets, colors, statusBarStyle } from './src/theme';
import AppLoadingScreen from './src/components/ui/AppLoadingScreen';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { EventsProvider } from './src/contexts/EventsContext';
import { EventProvider } from './src/contexts/EventContext';
import { EventThemeProvider } from './src/components/EventThemeProvider';
import { FunctionalEventProvider } from './src/contexts/FunctionalEventContext';
import { FeatureFlagProvider } from './src/contexts/FeatureFlagContext';
import { BetaProvider } from './src/contexts/BetaContext';
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
import PatchNotesModal from './src/components/PatchNotesModal';
import FollowOnboardingGate from './src/components/FollowOnboardingGate';
import UpdateAvailableGate from './src/components/UpdateAvailableGate';
import SleepGate from './src/components/SleepGate';

/**
 * Enregistrement de l'appareil pour les notifications push.
 *
 * L'ancienne version GUETTAIT `apiService.token` toutes les secondes, dix fois
 * au plus, depuis un `useEffect` posé au-dessus d'`AuthProvider` — le seul
 * endroit de l'arbre qui ne peut pas savoir quand la session aboutit. Deux
 * conséquences : une seconde perdue même quand l'authentification était
 * immédiate, et surtout, au-delà de dix secondes — un réseau lent, c'est-à-dire
 * exactement le cas où l'on tient à ses notifications — **l'appareil n'était
 * jamais enregistré**, silencieusement, le `console.error` étant retiré du
 * bundle en production.
 *
 * Monté SOUS `AuthProvider`, ce composant réagit au moment exact où la session
 * est établie. `isAuthenticated` ne passe à vrai qu'après
 * `apiService.setSessionAccessToken`, le jeton est donc posé quand on arrive
 * ici. Plus de délai, plus de plafond d'essais, plus d'échec muet.
 */
function PushDeviceRegistration({ token }: { token: string | null }) {
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${apiService.getConnectionStatus().baseURL}/api/notifications/register-device`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiService.token}`,
            },
            body: JSON.stringify({ expoPushToken: token }),
          },
        );
        if (!cancelled && !res.ok) {
          console.error('❌ App - Erreur enregistrement device:', res.status, res.statusText);
        }
      } catch (error) {
        console.error("❌ App - Erreur lors de l'enregistrement du device:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, token]);

  return null;
}

/**
 * Choix de la langue de lecture à la première connexion.
 *
 * Monté au-dessus du navigateur pour que la question soit posée quel que soit
 * l'écran d'arrivée, et une seule fois : dès que le choix est enregistré,
 * `needsChoice` retombe à faux définitivement (le champ est stocké côté
 * serveur, pas seulement sur l'appareil).
 */
function ReadingLanguageGate() {
  if (__DEV__) console.count('[loop-hunt] ReadingLanguageGate render');
  const { needsChoice } = useReadingLanguage();
  // Passe par la file d'attente des popups de démarrage : elle est prioritaire,
  // mais ne doit pas se superposer aux trois autres (voir StartupPopupContext).
  const visible = useStartupPopupSlot('language', needsChoice);
  return <ReadingLanguageModal visible={visible} />;
}

export default function App() {
  /**
   * Le démarrage ne bloque QUE sur les polices dont le premier écran a besoin
   * (voir `coreFontAssets`). Les quinze familles du nom affiché premium
   * arrivent juste après, sans bloquer personne : c'est une option cosmétique
   * choisie par une fraction des comptes, elle n'a aucune raison de retarder
   * le lancement de tout le monde.
   *
   * Ce que ça change vraiment : tant que `fontsReady` est faux, RIEN n'est
   * monté — ni navigateur, ni contextes, ni premier appel réseau du fil.
   * L'attente des polices et le chargement du fil étaient donc mis bout à bout
   * au lieu d'avancer ensemble.
   *
   * Le repli reste non bloquant en cas d'échec, et le filet de sécurité passe
   * de 4 s à 1,2 s : sur cinq polices dont trois lues depuis le bundle, quatre
   * secondes n'étaient plus un filet mais une attente réelle.
   */
  const [fontsLoaded, fontError] = useFonts(coreFontAssets);
  const [forceReady, setForceReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setForceReady(true), 1200);
    return () => clearTimeout(t);
  }, []);
  const fontsReady = fontsLoaded || !!fontError || forceReady;

  // Aucun `await` remonté : l'app est déjà affichée quand celles-ci arrivent.
  // Un nom premium s'affiche en police système jusque-là, puis prend la sienne.
  useEffect(() => {
    loadFontsAsync(displayNameFontAssets).catch(() => {});
  }, []);

  /**
   * Préparatifs des notifications, DIFFÉRÉS après le premier rendu utile.
   *
   * Ce bloc ne bloquait déjà pas l'affichage, mais il partait sur le réseau au
   * moment précis où la requête du fil en avait le plus besoin. Le même délai
   * de décantation que les « gates » de démarrage lui laisse la priorité, puis
   * les notifications s'installent.
   *
   * L'enregistrement de l'appareil, lui, ne se fait plus ici : il est confié à
   * `PushDeviceRegistration`, monté sous `AuthProvider` (voir plus haut).
   */
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      (async () => {
        try {
          if (!Constants) {
            console.error("❌ Constants is undefined");
            return;
          }

          // Utilise le Project ID EAS défini dans app.json
          const projectId = (Constants as any)?.expoConfig?.extra?.eas?.projectId
            || (Constants as any)?.easConfig?.projectId
            || '341da021-111f-4a0c-9f54-0b5f4c9c3965'; // Project ID correct depuis app.json

          // Les rappels LOCAUX ne dépendent en rien du jeton push distant :
          // les enchaîner ne servait à rien.
          const [token] = await Promise.all([
            registerForPushNotifications(projectId),
            setupFranceDailyLocalNotifications(),
          ]);
          console.log("🔔 App - Token de notification obtenu:", token ? 'Oui' : 'Non');
          setExpoPushToken(token || null);
        } catch (error) {
          console.error("❌ App - Erreur lors de l'initialisation des notifications:", error);
        }
      })();
    }, 400);
    return () => clearTimeout(timer);
  }, []);
  
  /*
   * Plus de retour anticipé sur `!fontsReady`.
   *
   * L'écran de chargement était rendu À LA PLACE de l'arbre applicatif : tant
   * que les polices n'étaient pas là, `AuthProvider` n'était pas monté, donc
   * la session ne se vérifiait pas, donc le navigateur ne montait pas, donc la
   * première requête du fil ne partait pas. Deux attentes sans aucun rapport —
   * lire des fichiers de police et interroger le serveur d'authentification —
   * étaient mises bout à bout. Le démarrage coûtait leur SOMME.
   *
   * L'arbre se monte désormais tout de suite et l'écran de chargement passe en
   * voile par-dessus : il ne masque plus que l'affichage, il n'empêche plus le
   * travail. Le démarrage coûte le plus long des deux, pas les deux.
   */
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
        {/* Sous AuthProvider (le ciblage dépend du compte) et au-dessus de
            tout le reste : n'importe quel écran ou garde peut alors être posé
            derrière un drapeau. */}
        <FeatureFlagProvider>
        {/* Appartenance beta. Sous AuthProvider (elle suit le compte) et
            au-dessus des écrans : l'en-tête des deux fils y lit le badge.
            Distinct des drapeaux — c'est un état du compte, pas une décision
            de déploiement, et il ne doit pas transiter par `/resolve`, qui
            est en authentification optionnelle. */}
        <BetaProvider>
        {/* Sous AuthProvider : le mode hors ligne dépend du palier du compte. */}
        <OfflineProvider>
          <ReadingLanguageProvider>
          <StartupPopupProvider>
          {/* La source de vérité des événements. Les trois fournisseurs qui
              suivent ne sont plus que des adaptateurs vers celui-ci : ils ne
              tiennent plus d'état et n'interrogent plus le réseau. Il doit
              donc rester AU-DESSUS d'eux. */}
          <EventsProvider>
          <EventProvider>
            <EventThemeProvider>
              <FunctionalEventProvider>
                {/* `light-content` et `#010008` étaient écrits en dur, hérités
                    de l'époque où l'app n'existait qu'en sombre. En thème
                    clair, cela donnait des icônes blanches sur fond blanc sur
                    iOS — heure et batterie purement invisibles — et une bande
                    noire au-dessus d'une app blanche sur Android. Les 80 écrans
                    qui posent leur propre StatusBar utilisent déjà
                    `statusBarStyle()` ; seule la racine avait été oubliée. */}
                <StatusBar
                  barStyle={statusBarStyle()}
                  translucent={Platform.OS !== 'android'}
                  backgroundColor={Platform.OS === 'android' ? colors.bg : 'transparent'}
                />
                <AppNavigator />
                <PushDeviceRegistration token={expoPushToken} />
                <ReadingLanguageGate />
                <ProfileCompletionGate />
                {/* Dernier de la file des popups de démarrage : le socle légal
                    se pose une fois que les autres questions sont passées. */}
                <ConsentGate />
                {/* Entre 23 h et 5 h : « il est tard ». Suggestion, jamais
                    un verrou - les deux issues laissent entrer. */}
                <SleepGate />
                <FollowOnboardingGate />
                {/* L'app n'est sur aucun store : sans cette page, un appareil
                    reste indéfiniment sur un build périmé sans le savoir. */}
                <UpdateAvailableGate />
                {/* À la racine, pas dans TweetsScreen : ces étapes sont des
                    pages plein écran, et montées dans un écran elles
                    laisseraient dépasser la barre d'onglets. */}
                <PatchNotesModal />
              </FunctionalEventProvider>
            </EventThemeProvider>
          </EventProvider>
          </EventsProvider>
          </StartupPopupProvider>
          </ReadingLanguageProvider>
        </OfflineProvider>
        </BetaProvider>
        </FeatureFlagProvider>
      </AuthProvider>
      </RewardProvider>
      </PromptProvider>
      </ActionSheetProvider>
      </ConfirmProvider>
      </ToastProvider>
      {/* Dernier enfant de `SafeAreaProvider` : il se dessine donc au-dessus de
          tout l'arbre applicatif, qui travaille dessous en attendant. */}
      {!fontsReady && <AppLoadingScreen style={StyleSheet.absoluteFill} />}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
