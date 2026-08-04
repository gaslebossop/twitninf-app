import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  createNativeBottomTabNavigator,
  type NativeBottomTabIcon,
  type NativeBottomTabNavigationOptions,
} from '@react-navigation/bottom-tabs/unstable';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, View, StyleSheet, Platform, Dimensions } from 'react-native';
import AnimatedTabIcon from '../components/AnimatedTabIcon';
import { useAuth } from '../contexts/AuthContext';
import { useKosporBirthdayEvent } from '../hooks/useKosporBirthdayEvent';
import { liveService } from '../services/liveService';
import unreadService from '../services/unreadService';
import { colors } from '../theme';

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
import MoreScreen from '../screens/MoreScreen';
import { useNavbarPrefs } from '../contexts/NavbarPrefsContext';
import { resolveTabLayout } from './tabLayout';

const Tab = createBottomTabNavigator();
const NativeTab = createNativeBottomTabNavigator();

const SCREEN_WIDTH = Dimensions.get('window').width;

type TabName =
  | 'Accueil'
  | 'Video'
  | 'Live'
  | 'Recherche'
  | 'Notifications'
  | 'Messages'
  | 'Profil'
  | 'Casino'
  | 'Revue'
  | 'Plus'
  | 'Trading'
  | 'WalletDetail'
  | 'AccountStats'
  | 'TweetMonetization'
  | 'KosporBirthday';

type NativeSfSymbolName = Extract<NativeBottomTabIcon, { type: 'sfSymbol' }>['name'];

interface TabDefinition {
  name: TabName;
  component: React.ComponentType<any>;
}

const TAB_LABELS: Record<TabName, string> = {
  Accueil: 'Accueil',
  Video: 'Vidéos',
  Live: 'Live',
  Recherche: 'Recherche',
  Notifications: 'Activité',
  Messages: 'Messages',
  Profil: 'Profil',
  Casino: 'Casino',
  Revue: 'Revue',
  Plus: 'Plus',
  Trading: 'Trading',
  WalletDetail: 'Wallet',
  AccountStats: 'Stats',
  TweetMonetization: 'Gains',
  KosporBirthday: 'Kospor',
};

const NATIVE_TAB_ICONS: Record<
  Exclude<TabName, 'Recherche'>,
  { default: NativeSfSymbolName; selected: NativeSfSymbolName }
> = {
  Accueil: { default: 'house', selected: 'house.fill' },
  Video: { default: 'play.rectangle', selected: 'play.rectangle.fill' },
  Live: {
    default: 'dot.radiowaves.left.and.right',
    selected: 'dot.radiowaves.left.and.right',
  },
  Notifications: { default: 'bell', selected: 'bell.fill' },
  Messages: { default: 'envelope', selected: 'envelope.fill' },
  Profil: { default: 'person.crop.circle', selected: 'person.crop.circle.fill' },
  Casino: { default: 'dice', selected: 'dice.fill' },
  Revue: { default: 'hammer', selected: 'hammer.fill' },
  Plus: { default: 'ellipsis.circle', selected: 'ellipsis.circle.fill' },
  Trading: { default: 'chart.xyaxis.line', selected: 'chart.xyaxis.line' },
  WalletDetail: { default: 'wallet.pass', selected: 'wallet.pass.fill' },
  AccountStats: { default: 'chart.bar', selected: 'chart.bar.fill' },
  TweetMonetization: { default: 'banknote', selected: 'banknote.fill' },
  KosporBirthday: { default: 'gift', selected: 'gift.fill' },
};

const nativeTabIcon = (name: TabName): NativeBottomTabNavigationOptions['tabBarIcon'] => {
  if (name === 'Recherche') return undefined;
  const icons = NATIVE_TAB_ICONS[name];
  return ({ focused }) => ({
    type: 'sfSymbol',
    name: focused ? icons.selected : icons.default,
  });
};

export default function BottomTabNavigator() {
  const { isUserBanned, isUserSuspended } = useAuth();
  /** Sert au badge de l'onglet Live, plus à décider de son existence. */
  const [activeLiveCount, setActiveLiveCount] = React.useState(0);
  // Onglets optionnels choisis à l'onboarding (voir NavbarPrefsContext) — les
  // autres restent joignables depuis Réglages, jamais totalement retirés.
  const {
    loading: navbarPrefsLoading,
    selected: selectedOptionalTabs,
  } = useNavbarPrefs();
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

  const optionalTabs: TabDefinition[] = [
    ...(showVideoTab ? [{ name: 'Video' as const, component: TwitNinfVideo }] : []),
    ...(showMessagesTab ? [{ name: 'Messages' as const, component: MessagesScreen }] : []),
    ...(showCasinoTab ? [{ name: 'Casino' as const, component: CasinoScreen }] : []),
    ...(showRevueTab ? [{ name: 'Revue' as const, component: CommunityReviewScreen }] : []),
    ...(showTradingTab ? [{ name: 'Trading' as const, component: TradingScreen }] : []),
    ...(showWalletTab ? [{ name: 'WalletDetail' as const, component: WalletDetailScreen }] : []),
    ...(showAnalyticsTab ? [{ name: 'AccountStats' as const, component: AccountStatsScreen }] : []),
    ...(showMonetizationTab
      ? [{ name: 'TweetMonetization' as const, component: TweetMonetizationScreen }]
      : []),
  ];

  const eventTabs: TabDefinition[] = isEventActive
    ? [{ name: 'KosporBirthday', component: KosporBirthdayScreen }]
    : [];

  const classicTabs: TabDefinition[] = isRestricted
    ? [
        { name: 'Notifications', component: NotificationsScreen },
        { name: 'Profil', component: ProfileScreen },
      ]
    : [
        { name: 'Accueil', component: TweetsScreen },
        ...optionalTabs.slice(0, showVideoTab ? 1 : 0),
        { name: 'Live', component: LivesScreen },
        { name: 'Recherche', component: SearchScreen },
        { name: 'Notifications', component: NotificationsScreen },
        ...optionalTabs.slice(showVideoTab ? 1 : 0),
        ...eventTabs,
        { name: 'Profil', component: ProfileScreen },
      ];

  // Exactement cinq onglets, jamais plus : au-delà, UITabBarController
  // remplace le cinquième par SON « More » — une UITableView grise, non
  // stylable, toujours en dernière position, qui embarquerait Profil avec
  // elle. Tout ce qui ne tient pas ici part dans MoreScreen, qui applique la
  // même règle de répartition (voir navigation/tabLayout).
  const layout = resolveTabLayout(selectedOptionalTabs);

  const dynamicTab: TabDefinition =
    layout.dynamic === 'messages'
      ? { name: 'Messages', component: MessagesScreen }
      : layout.dynamic === 'revue'
        ? { name: 'Revue', component: CommunityReviewScreen }
        : { name: 'Notifications', component: NotificationsScreen };

  const nativeTabs: TabDefinition[] = isRestricted
    ? classicTabs
    : [
        { name: 'Accueil', component: TweetsScreen },
        { name: 'Recherche', component: SearchScreen },
        dynamicTab,
        { name: 'Plus', component: MoreScreen },
        { name: 'Profil', component: ProfileScreen },
      ];

  // Activité perd sa place dès que le slot dynamique est occupé : son badge
  // remonte alors sur l'onglet Plus, sinon l'alerte deviendrait invisible.
  // Messages n'a pas besoin du même report — quand il est sélectionné, il est
  // prioritaire sur le slot dynamique, donc toujours visible dans la barre.
  const displacedBadgeCount = layout.showsNotifications ? 0 : notificationCount;

  const badgeFor = (name: string) =>
    name === 'Notifications'
      ? notificationCount
      : name === 'Messages'
        ? messageCount
        : name === 'Live'
          ? activeLiveCount
          : name === 'Plus'
            ? displacedBadgeCount
            : 0;

  if (Platform.OS === 'ios') {
    // UITabBarController ne supporte pas qu'on lui remplace sa topologie au
    // milieu de sa première transaction de montage. Les préférences passent
    // d'abord par une valeur par défaut avant d'être hydratées depuis
    // AsyncStorage. Attendre cette hydratation empêche UIKit de sélectionner
    // un contrôleur qui vient d'être retiré de son tableau `viewControllers`.
    if (navbarPrefsLoading) {
      return (
        <View style={styles.nativeTabsLoading}>
          <ActivityIndicator color={colors.accent} />
        </View>
      );
    }

    // Les préférences restent modifiables depuis Réglages et un événement
    // peut s'activer à chaud. Dans ce cas, recréer le conteneur UIKit est plus
    // sûr que de muter la liste de view controllers d'une instance existante.
    const nativeTabsTopologyKey = nativeTabs.map((screen) => screen.name).join('|');

    return (
      <NativeTab.Navigator
        key={nativeTabsTopologyKey}
        id={undefined}
        screenOptions={({ route }) => {
          const name = route.name as TabName;
          const badgeCount = badgeFor(name);
          const isSearch = name === 'Recherche';

          return {
            headerShown: false,
            title: TAB_LABELS[name],
            lazy: true,
            tabBarActiveTintColor: colors.accent,
            tabBarBadge: badgeCount > 0 ? badgeCount : undefined,
            tabBarBadgeStyle: { backgroundColor: colors.accent },
            // Liquid Glass en permanence, et pas seulement sous le doigt.
            //
            // `[UITabBarAppearance new]` part déjà du fond par défaut, qui
            // sous iOS 26 EST le verre. Deux réglages l'écrasaient :
            // `systemChromeMaterialDark` remplaçait le verre par un
            // `UIBlurEffect` classique, et surtout `backgroundColor` peignait
            // un aplat quasi opaque par-dessus. Il ne restait du verre que le
            // reflet de l'élément pressé — d'où l'impression qu'il
            // n'apparaissait qu'au doigt.
            //
            // `systemDefault` est traité à part côté natif : c'est la seule
            // valeur qui laisse `backgroundEffect` intact (voir
            // RNSTabBarAppearanceCoordinator.mm). Ne rien passer ne suffirait
            // pas — bottom-tabs retomberait sur `systemMaterialDark`.
            tabBarBlurEffect: 'systemDefault',
            tabBarControllerMode: 'tabBar',
            tabBarMinimizeBehavior: 'onScrollDown',
            // react-native-screens repasse par défaut le premier ScrollView
            // descendant de l'onglet en `contentInsetAdjustmentBehavior:
            // 'automatic'` (au lieu du `'never'` de React Native), pour que les
            // listes respectent une barre de navigation native. Cette app n'en
            // a pas : chaque écran dessine son propre header et réserve déjà
            // l'encoche via `useHeaderMetrics()` (`insets.top`). Laisser UIKit
            // ajouter le même inset une seconde fois décalait le haut du
            // contenu d'une hauteur de Dynamic Island, et seulement sur les
            // écrans dont la liste se trouve en tête de chaîne — d'où un
            // décalage qui n'apparaissait que sur certains onglets.
            overrideScrollViewContentInsetAdjustmentBehavior: false,
            // Recherche prend le system item : icône loupe et libellé
            // localisés par UIKit. Contrairement à ce que disait le commentaire
            // précédent, ça ne lui donne PAS la lentille séparée d'iOS 26 —
            // react-native-screens 4.25 n'expose aucun rôle `.search`, donc
            // Recherche est un onglet comme les autres et compte dans les cinq.
            tabBarSystemItem: isSearch ? 'search' : undefined,
            tabBarLabel: isSearch ? undefined : TAB_LABELS[name],
            tabBarIcon: isSearch ? undefined : nativeTabIcon(name),
          };
        }}
      >
        {nativeTabs.map((screen) => (
          <NativeTab.Screen
            key={screen.name}
            name={screen.name}
            component={screen.component}
          />
        ))}
      </NativeTab.Navigator>
    );
  }

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
          height: 85,
          backgroundColor: colors.bg,
          borderTopWidth: 0,
          borderTopColor: colors.border,
          paddingBottom: 20,
          paddingTop: 8,
          elevation: 0,
        },
        tabBarBackground: () => <View style={styles.androidBackground} />,
        tabBarItemStyle: {
          paddingVertical: 0,
        },
        headerShown: false,
        tabBarHideOnKeyboard: true,
      })}
    >
      {classicTabs.map((screen) => (
        <Tab.Screen
          key={screen.name}
          name={screen.name}
          component={screen.component}
          options={screen.name === 'KosporBirthday' ? { tabBarLabel: 'Kospor' } : undefined}
        />
      ))}
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  nativeTabsLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
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
