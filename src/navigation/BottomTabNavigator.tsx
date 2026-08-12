import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet, Platform, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import AnimatedTabIcon from '../components/AnimatedTabIcon';
import { useAuth } from '../contexts/AuthContext';
import { useKosporBirthdayEvent } from '../hooks/useKosporBirthdayEvent';
import { liveService } from '../services/liveService';
import unreadService from '../services/unreadService';
import { colors, isDarkTheme, withAlpha } from '../theme';

// Import des écrans
import TweetsScreen from '../screens/TweetsScreen';
import SearchScreen from '../screens/SearchScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import MessagesScreen from '../screens/MessagesScreen';
import ProfileScreen from '../screens/ProfileScreen';
import CasinoScreen from '../screens/CasinoScreen';
import CommunityReviewScreen from '../screens/CommunityReviewScreen';
import KosporBirthdayScreen from '../screens/KosporBirthdayScreen';
import { useForegroundInterval } from '../hooks/useForegroundInterval';
import TwitNinfVideo from '../screens/twitninfvideo';
import LivesScreen from '../screens/LivesScreen';
import TradingScreen from '../screens/TradingScreen';
import WalletDetailScreen from '../screens/WalletDetailScreen';
import AccountStatsScreen from '../screens/AccountStatsScreen';
import TweetMonetizationScreen from '../screens/TweetMonetizationScreen';
import { useNavbarPrefs } from '../contexts/NavbarPrefsContext';

const Tab = createBottomTabNavigator();

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function BottomTabNavigator() {
  const { isUserBanned, isUserSuspended } = useAuth();
  /** Sert au badge de l'onglet Live, plus à décider de son existence. */
  const [activeLiveCount, setActiveLiveCount] = React.useState(0);
  // Onglets optionnels choisis à l'onboarding (voir NavbarPrefsContext) — les
  // autres restent joignables depuis Réglages, jamais totalement retirés.
  const { selected: selectedOptionalTabs } = useNavbarPrefs();
  const showVideoTab = selectedOptionalTabs.includes('video');
  const showMessagesTab = selectedOptionalTabs.includes('messages');
  const showCasinoTab = selectedOptionalTabs.includes('casino');
  const showRevueTab = selectedOptionalTabs.includes('revue');
  const showTradingTab = selectedOptionalTabs.includes('trading');
  const showWalletTab = selectedOptionalTabs.includes('wallet');
  const showAnalyticsTab = selectedOptionalTabs.includes('analytics');
  const showMonetizationTab = selectedOptionalTabs.includes('monetization');

  // Vérifier si l'événement Kospor Birthday est actif
  const { isEventActive } = useKosporBirthdayEvent();

  // Polling des lives actifs pour masquer/afficher l'onglet.
  // Suspendu quand l'app passe en arrière-plan.
  useForegroundInterval(
    React.useCallback(async () => {
      try {
        const lives = await liveService.getLives();
        setActiveLiveCount(lives.length);
      } catch (e) {
        console.error('Error checking lives:', e);
      }
    }, []),
    30000
  );

  // Compteurs "non lu" réels pour les badges de la navbar.
  const [notificationCount, setNotificationCount] = React.useState(0);
  const [messageCount, setMessageCount] = React.useState(0);

  const refreshCounts = React.useCallback(async () => {
    const [notifCount, msgCount] = await Promise.all([
      unreadService.getNotificationsUnreadCount(),
      unreadService.getMessagesUnreadCount(),
    ]);
    setNotificationCount(notifCount);
    setMessageCount(msgCount);
  }, []);

  useForegroundInterval(refreshCounts, 30000);

  // Rafraîchissement immédiat quand un écran signale une lecture.
  React.useEffect(() => unreadService.subscribe(refreshCounts), [refreshCounts]);

  const isRestricted = isUserBanned || isUserSuspended;

  // La barre peut maintenant porter jusqu'à 5 onglets optionnels (+ Live et
  // l'événement, conditionnels) : à 9 icônes ou plus, un gabarit fixe de 50pt
  // déborde sur un écran étroit. On resserre l'icône plutôt que de la rogner.
  const visibleTabCount = isRestricted
    ? 2
    : 3 + // Accueil, Recherche, Notifications
      1 + // Profil
      1 + // Live
      selectedOptionalTabs.length +
      (isEventActive ? 1 : 0);

  const slotWidth = Math.floor(SCREEN_WIDTH / Math.max(visibleTabCount, 1));
  const isDense = slotWidth < 46;
  const iconBoxWidth = Math.min(50, Math.max(34, slotWidth - 4));
  const iconGlyphSize = isDense ? 21 : 24;

  return (
    <Tab.Navigator
      id={undefined}
      screenOptions={({ route }) => ({
        // `sceneContainerStyle` (prop du navigateur) n'existe plus en v7 de
        // bottom-tabs : elle était silencieusement ignorée, donc les écrans
        // n'avaient pas de fond opaque. Cela se voyait d'autant plus avec une
        // transition animée, qui laissait passer un flash clair entre deux
        // onglets. L'équivalent v7 est `sceneStyle`, dans screenOptions.
        // `colors.bg`, pas un hex figé : le `#0A0B0F` codé ici datait de la DA
        // « Encre » et ne correspondait plus au noir des écrans (`#0A0A0A`).
        // L'écart était petit mais visible en couture pendant une transition.
        sceneStyle: { backgroundColor: colors.bg },
        // Les 9 onglets étaient tous montés dès le premier affichage et
        // continuaient de tourner en arrière-plan.
        lazy: true,
        freezeOnBlur: true,
        // Pas d'animation de scène, et c'est délibéré : dès qu'`animation`
        // vaut autre chose que 'none', bottom-tabs v7 passe un `activityState`
        // animé. `shouldFreeze` n'est alors jamais strictement égal à 0, si
        // bien que `freezeOnBlur` ci-dessus devient inopérant, et les onglets
        // situés à gauche de l'onglet courant ne sont jamais détachés. Tous
        // les onglets visités restaient donc vivants, timers compris, et
        // l'écran cible s'affichait noir le temps de son montage.
        animation: 'none',
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap;

          if (route.name === 'Accueil') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Video') {
            iconName = focused ? 'play-circle' : 'play-circle-outline';
          } else if (route.name === 'Live') {
            iconName = focused ? 'radio' : 'radio-outline';
          } else if (route.name === 'Recherche') {
            iconName = focused ? 'search' : 'search-outline';
          } else if (route.name === 'Notifications') {
            iconName = focused ? 'notifications' : 'notifications-outline';
          } else if (route.name === 'Messages') {
            iconName = focused ? 'mail' : 'mail-outline';
          } else if (route.name === 'Profil') {
            iconName = focused ? 'person-circle' : 'person-circle-outline';
          } else if (route.name === 'Casino') {
            iconName = focused ? 'dice' : 'dice-outline';
          } else if (route.name === 'Revue') {
            iconName = focused ? 'hammer' : 'hammer-outline';
          } else if (route.name === 'Trading') {
            iconName = focused ? 'analytics' : 'analytics-outline';
          } else if (route.name === 'WalletDetail') {
            iconName = focused ? 'wallet' : 'wallet-outline';
          } else if (route.name === 'AccountStats') {
            iconName = focused ? 'stats-chart' : 'stats-chart-outline';
          } else if (route.name === 'TweetMonetization') {
            iconName = focused ? 'cash' : 'cash-outline';
          } else if (route.name === 'KosporBirthday') {
            iconName = focused ? 'gift' : 'gift-outline';
          } else {
            iconName = 'help-outline';
          }

          const badgeCount =
            route.name === 'Notifications'
              ? notificationCount
              : route.name === 'Messages'
                ? messageCount
                : route.name === 'Live'
                  ? activeLiveCount
                  : 0;

          return (
            <AnimatedTabIcon
              focused={focused}
              iconName={iconName}
              glyphSize={iconGlyphSize}
              boxWidth={iconBoxWidth}
              dense={isDense}
              badgeCount={badgeCount}
              badgeStyle={styles.tabBadge}
            />
          );
        },
        tabBarLabel: () => null, // Pas de labels comme sur Twitter
        tabBarStyle: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: Platform.OS === 'ios' ? 83 : 85,
          backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.bg,
          borderTopWidth: 0,
          borderTopColor: Platform.OS === 'ios' ? 'transparent' : colors.border,
          paddingBottom: Platform.OS === 'ios' ? 34 : 20,
          paddingTop: Platform.OS === 'ios' ? 8 : 8,
          shadowColor: Platform.OS === 'ios' ? '#000' : 'transparent',
          shadowOpacity: Platform.OS === 'ios' ? 0.3 : 0,
          shadowRadius: Platform.OS === 'ios' ? 15 : 0,
          shadowOffset: { width: 0, height: Platform.OS === 'ios' ? -2 : 0 },
          elevation: Platform.OS === 'ios' ? 0 : 0,
        },
        tabBarBackground: () => (
          Platform.OS === 'ios' ? (
            <BlurView
              intensity={60}
              tint={isDarkTheme() ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
              style={styles.blurBackground}
            />
          ) : (
            <View style={styles.androidBackground} />
          )
        ),
        tabBarItemStyle: {
          paddingVertical: 0,
        },
        headerShown: false,
        tabBarHideOnKeyboard: true,
      })}
    >
      {isRestricted ? (
        <>
          <Tab.Screen
            name="Notifications"
            component={NotificationsScreen}
          />
          <Tab.Screen
            name="Profil"
            component={ProfileScreen}
          />
        </>
      ) : (
        <>
          <Tab.Screen
            name="Accueil"
            component={TweetsScreen}
          />
          {showVideoTab && (
            <Tab.Screen
              name="Video"
              component={TwitNinfVideo}
            />
          )}
          {/* Toujours monté. L'onglet n'apparaissait qu'en présence d'un live
              déjà en cours, or c'est le seul chemin vers « Passer en direct » :
              tant que personne ne diffusait, personne ne pouvait commencer.
              L'écran a d'ailleurs un état vide écrit pour ce cas précis
              (« Sois le premier à diffuser ! »), jusqu'ici inatteignable. */}
          <Tab.Screen
            name="Live"
            component={LivesScreen}
          />

          <Tab.Screen
            name="Recherche"
            component={SearchScreen}
          />
          <Tab.Screen
            name="Notifications"
            component={NotificationsScreen}
          />
          {showMessagesTab && (
            <Tab.Screen
              name="Messages"
              component={MessagesScreen}
            />
          )}
          {showCasinoTab && (
            <Tab.Screen
              name="Casino"
              component={CasinoScreen}
            />
          )}
          {/* Revue communautaire (BÊTA). Elle reste aussi accessible depuis les
              réglages et depuis MainNavigator — même double entrée que Casino,
              qui est à la fois un onglet et un écran de la pile. */}
          {showRevueTab && (
            <Tab.Screen
              name="Revue"
              component={CommunityReviewScreen}
            />
          )}
          {/* Trading, Portefeuille, Analytiques, Monétisation : même double
              entrée (onglet + Réglages) que Casino/Revue ci-dessus. */}
          {showTradingTab && (
            <Tab.Screen
              name="Trading"
              component={TradingScreen}
            />
          )}
          {showWalletTab && (
            <Tab.Screen
              name="WalletDetail"
              component={WalletDetailScreen}
            />
          )}
          {showAnalyticsTab && (
            <Tab.Screen
              name="AccountStats"
              component={AccountStatsScreen}
            />
          )}
          {showMonetizationTab && (
            <Tab.Screen
              name="TweetMonetization"
              component={TweetMonetizationScreen}
            />
          )}
          {isEventActive && (
            <Tab.Screen
              name="KosporBirthday"
              component={KosporBirthdayScreen}
              options={{
                tabBarLabel: 'Kospor',
              }}
            />
          )}
          <Tab.Screen
            name="Profil"
            component={ProfileScreen}
          />
        </>
      )}
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  blurBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // Dérivé du fond du thème : cette valeur était figée en sombre, donc la
    // barre restait noire en thème clair et ses icônes disparaissaient.
    backgroundColor: withAlpha(colors.bg, 0.62),
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  androidBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  // Position du badge, commune aux onglets Notifications et Messages.
  // Le reste de l'habillage de l'icône vit dans AnimatedTabIcon.
  tabBadge: {
    top: -2,
    right: -2,
  },
});