import React, { useState, useEffect, useRef } from 'react';
/**
 * Pile NATIVE (et non plus la pile JS de `@react-navigation/stack`).
 *
 * Les transitions de cette pile étaient animées sur le thread JS, en
 * concurrence avec le premier rendu de l'écran d'arrivée : la pire seconde de
 * l'app pour le thread le plus chargé. Elles sont désormais pilotées par
 * UIKit / le natif Android.
 *
 * Compatible Expo Go : `native-stack` est du JS pur et s'appuie sur
 * `react-native-screens` 4.16, exactement la version du binaire d'Expo Go.
 *
 * AUCUN écran n'est en `presentation: 'modal'`, et c'est délibéré.
 *
 * Une pile native présente une modale par-dessus le contrôleur de navigation,
 * au sens d'UIKit. Tout écran poussé ENSUITE atterrit dans le contrôleur du
 * dessous, donc derrière la modale : on voyait Réglages, et la page ouverte
 * depuis Réglages s'affichait dessous. Ce n'était pas un oubli de réglage mais
 * une conséquence du modèle natif — la pile JS, elle, empilait tout à plat
 * dans un même conteneur et ne faisait pas la distinction.
 *
 * Les 36 écrans concernés sont donc des cartes ordinaires, animées par
 * `slide_from_bottom` : ils montent toujours depuis le bas, mais s'empilent
 * normalement, et ce qu'on ouvre depuis eux s'affiche bien au-dessus.
 */
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import BottomTabNavigator from './BottomTabNavigator';
import UserProfileScreen from '../screens/UserProfileScreen';
import CreateTweetScreen from '../screens/CreateTweetScreen';
import CreateTweetABTestScreen from '../screens/CreateTweetABTestScreen';
import TweetDetailScreen from '../screens/TweetDetailScreen';
/** 🧪 Clone « 2B — Gouttière » du précédent, monté sur `FLAGS.FEED_2B`. */
import TweetDetailGutterScreen from '../screens/TweetDetailGutterScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import AccountManagerScreen from '../screens/AccountManagerScreen';
import ThemeScreen from '../screens/ThemeScreen';
import PrivacyDataScreen from '../screens/PrivacyDataScreen';
import SuperHeartsScreen from '../screens/SuperHeartsScreen';
import AddAccountScreen from '../screens/AddAccountScreen';
import ModerationScreen from '../screens/ModerationScreen';
import UserManagementScreen from '../screens/UserManagementScreen';
import AnalyticsScreen from '../screens/AnalyticsScreen';
import ContentModerationScreen from '../screens/ContentModerationScreen';
import CommunityReviewScreen from '../screens/CommunityReviewScreen';
import SettingsScreen from '../screens/SettingsScreen';
import AccountStatsScreen from '../screens/AccountStatsScreen';
import PredictiveAnalyticsScreen from '../screens/PredictiveAnalyticsScreen';
import SupportScreen from '../screens/SupportScreen';
import SupportTicketScreen from '../screens/SupportTicketScreen';
import UltraSupportAgentScreen from '../screens/UltraSupportAgentScreen';
import SubscriptionScreen from '../screens/SubscriptionScreen';
import ReportBugScreen from '../screens/ReportBugScreen';
import BetaScreen from '../screens/BetaScreen';
import ForgeScreen from '../screens/ForgeScreen';
import ForgeReviewScreen from '../screens/ForgeReviewScreen';
import CreatorStudioScreen from '../screens/CreatorStudioScreen';
import PaidContentSalesScreen from '../screens/PaidContentSalesScreen';
import ScheduledPostsScreen from '../screens/ScheduledPostsScreen';
import ProfileInsightsScreen from '../screens/ProfileInsightsScreen';
import RetrospectiveScreen from '../screens/RetrospectiveScreen';
import UsernameMarketScreen from '../screens/UsernameMarketScreen';
import ContractsScreen from '../screens/ContractsScreen';
import ContractDetailScreen from '../screens/ContractDetailScreen';
import EditTweetScreen from '../screens/EditTweetScreen';
import NewEconomyScreen from '../screens/NewEconomyScreen';
import TradingScreen from '../screens/TradingScreen';
import WalletDetailScreen from '../screens/WalletDetailScreen';
import CommunityCurrenciesScreen from '../screens/CommunityCurrenciesScreen';
import CurrencyDetailScreen from '../screens/CurrencyDetailScreen';
import CreateCurrencyScreen from '../screens/CreateCurrencyScreen';
import CasinoScreen from '../screens/CasinoScreen';
import TweetMonetizationScreen from '../screens/TweetMonetizationScreen';
import MonetizationProgramScreen from '../screens/MonetizationProgramScreen';
import MonetizationProgramAdminScreen from '../screens/MonetizationProgramAdminScreen';
import EventManagementScreen from '../screens/EventManagementScreen';
import FunctionalEventManagementScreen from '../screens/FunctionalEventManagementScreen';
import FeatureFlagsAdminScreen from '../screens/FeatureFlagsAdminScreen';
import NfMapScreen from '../screens/NfMapScreen';
import KosporBirthdayScreen from '../screens/KosporBirthdayScreen';
import EventScreen from '../screens/EventScreen';
import AnimationLabScreen from '../screens/AnimationLabScreen';
import VerificationStyleScreen from '../screens/VerificationStyleScreen';
import VersionNotesScreen from '../screens/VersionNotesScreen';
import ReadingLanguageScreen from '../screens/ReadingLanguageScreen';
import NavbarCustomizationScreen from '../screens/NavbarCustomizationScreen';
import CreateTargetingAdScreen from '../screens/CreateTargetingAdScreen';
import ReportsScreen from '../screens/ReportsScreen';
import ReportInvestigationScreen from '../screens/ReportInvestigationScreen';
import ModerationHistoryScreen from '../screens/ModerationHistoryScreen';
import UnbanTicketsScreen from '../screens/UnbanTicketsScreen';
import CreateCampaignScreen from '../screens/CreateCampaignScreen';
import CreateAdvertisementScreen from '../screens/CreateAdvertisementScreen';
import EconomyManagementScreen from '../screens/EconomyManagementScreen';
import SimilarityAlgorithmScreen from '../screens/SimilarityAlgorithmScreen';
import CreateVideoScreen from '../screens/CreateVideoScreen';
import RecordVideoScreen from '../screens/RecordVideoScreen';
import VideoEditorScreen from '../screens/VideoEditorScreen';
import VideoCaptionScreen from '../screens/VideoCaptionScreen';
import type { VideoOverlay } from '../utils/videoFilters';
import TwitNinfVideo from '../screens/twitninfvideo';
import MessagesScreen from '../screens/MessagesScreen';
/** 🧪 Clone « 2B — Gouttière » du précédent, monté sur `FLAGS.FEED_2B`. */
import MessagesScreen2B from '../screens/MessagesScreen2B';
import LiveViewerScreen from '../screens/LiveViewerScreen';
import GoLiveScreen from '../screens/GoLiveScreen';
import KosporBirthdayPopup from '../components/KosporBirthdayPopup';
import { useKosporBirthdayEvent } from '../hooks/useKosporBirthdayEvent';
import NavbarOnboardingModal from '../components/NavbarOnboardingModal';
import NavbarFixModal from '../components/NavbarFixModal';
import { Feed2BTourProvider, useFeed2BTour } from '../components/tour/Feed2BTour';
import { StartupFlowBackdrop } from '../components/StartupStepPage';
import { NavbarPrefsProvider, useNavbarPrefs } from '../contexts/NavbarPrefsContext';
import { isValidFor2B } from '../services/navbarPreferences';
import { useStartupPopupSlot } from '../contexts/StartupPopupContext';
import DeveloperPortalScreen from '../screens/DeveloperPortalScreen';
import NewConversationScreen from '../screens/NewConversationScreen';
import ProfileCustomizationScreen from '../screens/ProfileCustomizationScreen';
import ConversationThreadScreen from '../screens/ConversationThreadScreen';
/** 🧪 Clone « 2B — Gouttière » du précédent, monté sur `FLAGS.FEED_2B`. */
import ConversationThreadScreen2B from '../screens/ConversationThreadScreen2B';
import FollowRequestsScreen from '../screens/FollowRequestsScreen';
import UserConnectionsScreen from '../screens/UserConnectionsScreen';
import BookmarksScreen from '../screens/BookmarksScreen';
import WeeklyVoteScreen from '../screens/WeeklyVoteScreen';
import BlockedAccountsScreen from '../screens/BlockedAccountsScreen';
import TwoFactorScreen from '../screens/TwoFactorScreen';
import GroupMembersScreen from '../screens/GroupMembersScreen';
import ContestScreen from '../screens/ContestScreen';
import CreateContestScreen from '../screens/CreateContestScreen';
import EventPassAdminScreen from '../screens/EventPassAdminScreen';
import EventPassScanScreen from '../screens/EventPassScanScreen';
import MyPassesScreen from '../screens/MyPassesScreen';
import AccountStatusScreen from '../screens/AccountStatusScreen';
import CalibrationScreen from '../screens/CalibrationScreen';
import ShadowbanAdminScreen from '../screens/ShadowbanAdminScreen';
import { navigationRef } from './NavigationService';
import { colors } from '../theme';
import BottomTabNavigator2B from './BottomTabNavigator2B';
import NotificationsScreen from '../screens/NotificationsScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../contexts/AuthContext';
import { useFlag } from '../contexts/FeatureFlagContext';
import { FLAGS } from '../config/featureFlagKeys';


export type MainStackParamList = {
  MainTabs: undefined;
  /**
   * Notifications dans la PILE.
   *
   * Elles n'existaient que comme onglet. Le fil « 2B » (drapeau
   * `fil.refonte2b`) remonte la cloche dans son en-tête et retire l'onglet :
   * sans cette route, la cloche n'aurait nulle part où aller.
   *
   * L'ancienne barre garde son onglet du même nom — les deux ne sont jamais
   * montées ensemble, donc `navigate('Notifications')` reste sans ambiguïté.
   */
  Notifications: undefined;
  UserProfile: {
    userId?: string;
    username?: string;
  };
  CreateTweet: {
    parentTweetId?: string;
    replyTo?: string;
    /** Renvoyé par `RecordVideo` : la prise revient s'attacher au tweet. */
    recordedVideoUri?: string;
    /** Texte pré-rempli — idée du radar de tendances ouverte depuis une notification. */
    prefill?: string;
  };
  CreateTweetABTest: {
    parentTweetId?: string;
    replyTo?: string;
    quoteTweetId?: string;
    /** Texte deja saisi dans le composeur : il devient la version temoin. */
    prefill?: string;
  };
  TweetDetail: { tweetId: string };
  EditProfile: undefined;
  AccountManager: undefined;
  Theme: undefined;
  PrivacyData: undefined;
  SuperHearts: undefined;
  AddAccount: undefined;
  Moderation: undefined;
  UserManagement: undefined;
  Analytics: undefined;
  ContentModeration: undefined;
  Settings: {
    returnTo?: string;
  };
  AccountStats: undefined;
  NewEconomy: undefined;
  Trading: undefined;
  WalletDetail: undefined;
  CommunityCurrencies: undefined;
  CurrencyDetail: { currencyId: string };
  CreateCurrency: undefined;
  Casino: undefined;
  TweetMonetization: undefined;
  MonetizationProgram: undefined;
  MonetizationProgramAdmin: undefined;
  EventManagement: undefined;
  FunctionalEventManagement: undefined;
  FeatureFlagsAdmin: undefined;
  NfMap: undefined;
  KosporBirthday: undefined;
  Event: undefined;
  AnimationLab: undefined;
  VerificationStyle: undefined;
  VersionNotes: undefined;
  ReadingLanguage: undefined;
  NavbarCustomization: undefined;
  CreateTargetingAd: undefined;
  CreateCampaign: undefined;
  CreateAdvertisement: undefined;
  EconomyManagement: undefined;
  SimilarityAlgorithm: undefined;
  Reports: undefined;
  ReportInvestigation: { reportId: string };
  ModerationHistory: undefined;
  UnbanTickets: undefined;
  Video: undefined;
  Messages: undefined;
  CreateVideo: undefined;
  /** Concours : page de participation, ouverte depuis la carte du fil. */
  Contest: { contestId: string };
  CreateContest: undefined;
  /**
   * `returnTo` : écran à qui rendre la prise, au lieu d'enchaîner sur
   * `VideoCaption`. Le composeur de tweet en a besoin — la vidéo s'y attache
   * à un texte déjà saisi, qu'on ne peut pas abandonner en chemin.
   */
  RecordVideo: { returnTo?: 'CreateTweet' } | undefined;
  /** Sortie de l'éditeur : l'habillage voyage jusqu'à la publication. */
  VideoEditor: { videoUri: string; returnTo?: 'CreateTweet' };
  VideoCaption: {
    videoUri: string;
    draftId?: string;
    overlays?: VideoOverlay[];
    filterId?: string;
    muted?: boolean;
  };
  LiveViewer: { liveId: string; playbackUrl: string; hostName?: string };
  GoLive: undefined;
  DeveloperPortal: undefined;
  ProfileCustomization: undefined;
  NewConversation: {
    initialTab?: 'dm' | 'group' | 'invites';
  } | undefined;
  ConversationThread: {
    conversationId: string;
    title?: string;
  };
  GroupMembers: {
    conversationId: string;
    title?: string;
  };
  FollowRequests: undefined;
  Bookmarks: undefined;
  WeeklyVote: undefined;
  BlockedAccounts: undefined;
  TwoFactor: undefined;
  UserConnections: {
    userId: string;
    username?: string;
    initialTab?: 'followers' | 'following';
  };
  CommunityReview: undefined;
  /** `draft` : texte pré-rempli, quand on arrive depuis une notification d'idée. */
  PredictiveAnalytics: { draft?: string } | undefined;
  Support: undefined;
  SupportTicket: { ticketId: string };
  UltraSupportAgent: undefined;
  Subscription: undefined;
  ReportBug: undefined;
  /** Programme beta — candidater, suivre sa place, quitter. */
  Beta: undefined;
  Forge: undefined;
  ForgeReview: undefined;

  // Offre créateur
  CreatorStudio: undefined;
  PaidContentSales: undefined;
  ScheduledPosts: undefined;
  /** `tab` : onglet ouvert d'emblée, quand on arrive depuis le studio. */
  ProfileInsights: {
    tab?: 'visitors' | 'impersonation' | 'rising' | 'niche' | 'velocity';
  } | undefined;
  /** `year` : annee couverte. Par defaut, celle que sert le serveur. */
  Retrospective: { year?: number } | undefined;
  UsernameMarket: undefined;
  CreatorContracts: undefined;
  ContractDetail: { contractId: string };
  /** `content` : texte actuel, pour ne pas rouvrir l'éditeur sur un champ vide. */
  EditTweet: { tweetId: string; content?: string };

  // Places d'invitation
  EventPassAdmin: undefined;
  /**
   * Contrôle à l'entrée. Sans `eventSlug`, toute place valable est acceptée —
   * c'est le cas d'un modérateur qui dépanne une porte sans savoir laquelle.
   * Avec, une place authentique émise pour une AUTRE soirée est refusée.
   */
  EventPassScan: { eventSlug?: string; eventName?: string } | undefined;
  MyPasses: undefined;
  AccountStatus: undefined;
  Calibration: undefined;
  ShadowbanAdmin: undefined;
};

const MainStack = createNativeStackNavigator<MainStackParamList>();

export default function MainNavigator() {
  return (
    <NavbarPrefsProvider>
      {/* Le voile de la visite guidée est rendu par ce fournisseur, APRÈS le
          navigateur : il doit passer au-dessus du fil, de la barre du bas et
          des bulles elles-mêmes. */}
      <Feed2BTourProvider>
        <MainNavigatorInner />
      </Feed2BTourProvider>
    </NavbarPrefsProvider>
  );
}

function MainNavigatorInner() {
  const { user } = useAuth();
  const { isEventActive, isLoading } = useKosporBirthdayEvent();
  const [showBirthdayPopup, setShowBirthdayPopup] = useState(false);
  const [hasShownPopup, setHasShownPopup] = useState(false);

  const {
    loading: navbarPrefsLoading,
    configured: navbarConfigured,
    selected: navbarSelected,
    save: saveNavbarPrefs,
  } = useNavbarPrefs();
  const [showNavbarOnboarding, setShowNavbarOnboarding] = useState(false);
  const [hasShownNavbarOnboarding, setHasShownNavbarOnboarding] = useState(false);
  const [showNavbarFix, setShowNavbarFix] = useState(false);

  // Ces deux popups sont des <Modal> React Native, comme celles de la langue et
  // des patch notes : elles passent par la file d'attente pour qu'une seule
  // soit ouverte à la fois (voir StartupPopupContext).
  const birthdayVisible = useStartupPopupSlot('birthday', showBirthdayPopup);
  const navbarOnboardingVisible = useStartupPopupSlot('navbar', showNavbarOnboarding);
  const navbarFixVisible = useStartupPopupSlot('navbar2b', showNavbarFix);

  // Présentation du fil 2B : une seule fois par compte, et seulement pour qui
  // a le drapeau. Le « déjà vu » est persisté par compte plutôt que par
  // appareil — un compte qui change de téléphone n'a pas à revoir une page
  // qu'il a déjà lue, et deux comptes sur le même téléphone ne se volent pas
  // leur première fois.
  const { start: startFeed2BTour, active: feed2BTourActive } = useFeed2BTour();
  const [wantsFeed2BTour, setWantsFeed2BTour] = useState(false);
  // La visite n'est pas une `<Modal>`, mais elle passe quand même par la file :
  // une modale native ouverte en même temps s'afficherait PAR-DESSUS le voile,
  // et la visite désignerait des éléments cachés.
  const feed2BTourSlot = useStartupPopupSlot('feed2b', wantsFeed2BTour);

  // Afficher la popup au lancement si l'événement est actif
  useEffect(() => {
    if (!isLoading && isEventActive && !hasShownPopup) {
      // Délai pour laisser l'app se charger. L'ordre d'affichage vient de la
      // file (REGISTRATION_WINDOW_MS), pas de ce délai.
      const timer = setTimeout(() => {
        setShowBirthdayPopup(true);
        setHasShownPopup(true);
      }, 250);

      return () => clearTimeout(timer);
    }
  }, [isEventActive, isLoading, hasShownPopup]);

  // Onboarding navbar : une fois par lancement d'app, tant que le compte n'a
  // jamais validé de choix (première connexion OU compte existant qui n'est
  // jamais passé par cet écran). `Plus tard` referme sans persister — elle
  // réapparaîtra donc au prochain lancement, jusqu'à configuration réelle.
  useEffect(() => {
    if (!navbarPrefsLoading && !navbarConfigured && !hasShownNavbarOnboarding) {
      const timer = setTimeout(() => {
        setShowNavbarOnboarding(true);
        setHasShownNavbarOnboarding(true);
      }, 250);

      return () => clearTimeout(timer);
    }
  }, [navbarPrefsLoading, navbarConfigured, hasShownNavbarOnboarding]);


  // Le drapeau est lu plus bas (`feed2B`), mais l'effet en a besoin ici — la
  // constante est déclarée après pour rester à côté de son commentaire
  // d'origine, donc on relit le drapeau plutôt que de déplacer l'un des deux.
  const feed2BFlag = useFlag(FLAGS.FEED_2B);
  /**
   * Correction de la barre pour les comptes du test « 2B ».
   *
   * La barre d'origine acceptait cinq raccourcis, celle du fil 2B en accepte
   * deux ou aucun. Un compte qui avait personnalisé la sienne AVANT d'entrer
   * dans le test garde sa préférence : sa barre est surchargée, ou
   * déséquilibrée avec un seul raccourci.
   *
   * `BottomTabNavigator2B` sait déjà se rattraper au rendu, mais en silence.
   * Cette popup dit ce qui se passe et rend le choix.
   *
   * Ne concerne QUE les comptes déjà configurés : ceux qui ne le sont pas
   * tombent sur l'onboarding, qui applique déjà la bonne limite.
   */
  useEffect(() => {
    if (navbarPrefsLoading || !navbarConfigured) return;
    if (!feed2BFlag) return;
    if (isValidFor2B(navbarSelected)) {
      // Corrigée entre-temps (depuis Réglages, ou par cette popup) : on la
      // referme au lieu de la laisser ouverte sur un problème résolu.
      setShowNavbarFix(false);
      return;
    }
    setShowNavbarFix(true);
  }, [navbarPrefsLoading, navbarConfigured, navbarSelected, feed2BFlag]);

  useEffect(() => {
    if (!feed2BFlag || !user?.id) return;
    let cancelled = false;
    const key = `feed2b_intro_seen_${user.id}`;

    (async () => {
      try {
        const seen = await AsyncStorage.getItem(key);
        if (cancelled || seen) return;
        // Marqué comme vu à l'OUVERTURE, pas à la fermeture : une page fermée
        // par un balayage, un plantage ou un changement d'écran ne doit pas
        // revenir à chaque lancement. Elle reste réouvrable depuis les réglages.
        await AsyncStorage.setItem(key, '1');
        if (!cancelled) setWantsFeed2BTour(true);
      } catch {
        // Stockage indisponible : on n'affiche pas plutôt que de risquer de
        // remontrer la page à chaque démarrage.
      }
    })();

    return () => { cancelled = true; };
  }, [feed2BFlag, user?.id]);

  // La file a donné le créneau : la visite démarre. Elle rend son créneau
  // quand elle se termine — passée, finie ou interrompue faute d'ancre —,
  // sans quoi les popups suivantes resteraient bloquées derrière elle.
  useEffect(() => {
    if (feed2BTourSlot) startFeed2BTour();
  }, [feed2BTourSlot, startFeed2BTour]);

  // Le créneau n'est rendu qu'APRÈS que la visite ait réellement démarré :
  // relâcher dès que `active` est faux le rendrait dans la même image que
  // l'octroi, avant même que `start()` ait pu poser son état.
  const feed2BTourRan = useRef(false);
  useEffect(() => {
    if (feed2BTourActive) feed2BTourRan.current = true;
    else if (feed2BTourRan.current) {
      feed2BTourRan.current = false;
      setWantsFeed2BTour(false);
    }
  }, [feed2BTourActive]);

  const handleClosePopup = () => {
    setShowBirthdayPopup(false);
  };

  const handleNavigateToKosporBirthday = () => {
    if (navigationRef.isReady()) {
      navigationRef.navigate('KosporBirthday');
    }
  };

  /**
   * 🧪 Test « 2B — Gouttière » (voir `FLAGS.FEED_2B`).
   *
   * Lu ICI et nulle part ailleurs. Changer de valeur remonte le navigateur
   * d'onglets — ce qui n'arrive qu'au démarrage ou juste après un changement
   * de compte, jamais pendant que l'utilisateur navigue.
   */
  const feed2B = useFlag(FLAGS.FEED_2B);

  return (
    <>
      <MainStack.Navigator
        id={undefined}
        screenOptions={{
          headerShown: false,
          // Même correction que dans `BottomTabNavigator` : le fond de la pile
          // doit être exactement le noir des écrans, sinon la transition
          // laisse voir une bande d'un gris légèrement différent.
          // (`contentStyle` est le nom de `cardStyle` côté pile native.)
          contentStyle: { backgroundColor: colors.bg },
          // Gèle les écrans hors champ : leurs timers et re-rendus s'arrêtent
          // tant qu'ils ne sont pas revisibles.
          freezeOnBlur: true,
        }}
        initialRouteName="MainTabs"
      >
      {/* 🧪 Le seul aiguillage du test « 2B — Gouttière ».
          Tout tient dans le composant monté sous `MainTabs` : ni l'ancienne
          barre ni l'ancien fil ne sont modifiés, et repasser le palier à 0 %
          suffit à tout rendre à l'état d'avant, sans publier de version.
          Le drapeau vaut « éteint » tant qu'il n'a pas répondu : le fil
          d'origine est donc toujours ce qui s'affiche par défaut. */}
      <MainStack.Screen
        name="MainTabs"
        component={feed2B ? BottomTabNavigator2B : BottomTabNavigator}
        options={{
          gestureEnabled: false,
          // Exempté du `freezeOnBlur` global de la pile : cet écran héberge la
          // pastille animée (Reanimated) de la navbar. Geler/dégeler cet écran
          // (ex: pousser Réglages par-dessus puis revenir) casse la liaison
          // entre la shared value et la vue native — l'icône active et le
          // contenu restent corrects (l'état React survit au gel), mais la
          // pastille ne suit plus aucun changement d'onglet ensuite, même si
          // son calcul JS est correct. Les autres écrans gardent le gel.
          freezeOnBlur: false,
        }}
      />
      
      <MainStack.Screen 
        name="UserProfile" 
        component={UserProfileScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />
      
      {/* Concours : la page de participation, et le formulaire de creation. */}
      <MainStack.Screen
        name="Contest"
        component={ContestScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_right',
          headerShown: false,
        }}
      />

      <MainStack.Screen
        name="CreateContest"
        component={CreateContestScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />

      <MainStack.Screen 
        name="CreateTweet" 
        component={CreateTweetScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />
      
      <MainStack.Screen 
        name="CreateTweetABTest" 
        component={CreateTweetABTestScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />
      {/* 🧪 Une publication ouverte suit le fil dont elle vient : sous le
          drapeau 2B, c'est la version « gouttière » qui est poussée. Même
          nom de route des deux côtés — tous les `navigate('TweetDetail')`
          de l'app (fil, recherche, notifications, liens profonds) marchent
          sans en connaître un mot. */}
      <MainStack.Screen
        name="TweetDetail"
        component={feed2B ? TweetDetailGutterScreen : TweetDetailScreen}
        options={{ headerShown: false }}
      />
      <MainStack.Screen 
        name="EditProfile" 
        component={EditProfileScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />
      <MainStack.Screen
        name="Theme"
        component={ThemeScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_right',
          headerShown: false,
        }}
      />
      <MainStack.Screen
        name="PrivacyData"
        component={PrivacyDataScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_right',
          headerShown: false,
        }}
      />
      <MainStack.Screen
        name="SuperHearts"
        component={SuperHeartsScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_right',
          headerShown: false,
        }}
      />
      <MainStack.Screen 
        name="AccountManager" 
        component={AccountManagerScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />
      <MainStack.Screen 
        name="AddAccount" 
        component={AddAccountScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />
      
      <MainStack.Screen 
        name="Moderation" 
        component={ModerationScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />
      
      <MainStack.Screen 
        name="UserManagement" 
        component={UserManagementScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />
      
      <MainStack.Screen 
        name="Analytics" 
        component={AnalyticsScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />
      
      <MainStack.Screen 
        name="ContentModeration" 
        component={ContentModerationScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />
      
      <MainStack.Screen 
        name="Settings" 
        component={SettingsScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />

      <MainStack.Screen
        name="AccountStats"
        component={AccountStatsScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />
      
      <MainStack.Screen 
        name="NewEconomy" 
        component={NewEconomyScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />
      
      <MainStack.Screen 
        name="Trading" 
        component={TradingScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />
      
      <MainStack.Screen
        name="WalletDetail"
        component={WalletDetailScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />

      <MainStack.Screen
        name="CommunityCurrencies"
        component={CommunityCurrenciesScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />

      <MainStack.Screen
        name="CurrencyDetail"
        component={CurrencyDetailScreen}
        options={{
          headerShown: false,
        }}
      />

      <MainStack.Screen
        name="CreateCurrency"
        component={CreateCurrencyScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />

      <MainStack.Screen
        name="Casino"
        component={CasinoScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />
      
      <MainStack.Screen
        name="TweetMonetization"
        component={TweetMonetizationScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />


      <MainStack.Screen
        name="MonetizationProgram"
        component={MonetizationProgramScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />

      <MainStack.Screen
        name="MonetizationProgramAdmin"
        component={MonetizationProgramAdminScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />

      <MainStack.Screen 
        name="EventManagement" 
        component={EventManagementScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />
      
      <MainStack.Screen
        name="FunctionalEventManagement"
        component={FunctionalEventManagementScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />

      <MainStack.Screen
        name="FeatureFlagsAdmin"
        component={FeatureFlagsAdminScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />

      <MainStack.Screen
        name="NfMap"
        component={NfMapScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />

      <MainStack.Screen
        name="KosporBirthday"
        component={KosporBirthdayScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />

      {/* Le hub d'événement générique — il remplace `KosporBirthday`, dont le
          contenu était écrit en dur pour une seule fête. Celui-ci rend
          n'importe quel événement que le serveur déclare actif, avec sa
          direction artistique. */}
      {/* Banc d'essai des animations de demarrage. Outil interne, atteint
          uniquement depuis les reglages d'un compte certifie. */}
      <MainStack.Screen
        name="AnimationLab"
        component={AnimationLabScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_right',
          headerShown: false,
        }}
      />

      <MainStack.Screen
        name="Event"
        component={EventScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />

      <MainStack.Screen
        name="VerificationStyle"
        component={VerificationStyleScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />

      <MainStack.Screen
        name="VersionNotes"
        component={VersionNotesScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />

      <MainStack.Screen
        name="ReadingLanguage"
        component={ReadingLanguageScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />

      <MainStack.Screen
        name="NavbarCustomization"
        component={NavbarCustomizationScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />

      <MainStack.Screen 
        name="CreateTargetingAd" 
        component={CreateTargetingAdScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />
      
      <MainStack.Screen 
        name="CreateCampaign" 
        component={CreateCampaignScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />
      
      <MainStack.Screen 
        name="CreateAdvertisement" 
        component={CreateAdvertisementScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />
      
      <MainStack.Screen 
        name="EconomyManagement" 
        component={EconomyManagementScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />

      <MainStack.Screen
        name="SimilarityAlgorithm"
        component={SimilarityAlgorithmScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />

      <MainStack.Screen
        name="Reports"
        component={ReportsScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />

      <MainStack.Screen
        name="ReportInvestigation"
        component={ReportInvestigationScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />

      <MainStack.Screen
        name="ModerationHistory"
        component={ModerationHistoryScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />

      <MainStack.Screen
        name="UnbanTickets"
        component={UnbanTicketsScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />

      {/* Vidéos et Messages : accessibles en onglet SI choisis à la personnalisation
          de la navbar (voir NavbarPrefsContext), sinon uniquement via Réglages —
          double entrée, même principe que Casino/Revue plus bas. */}
      <MainStack.Screen
        name="Video"
        component={TwitNinfVideo}
        options={{
          presentation: 'card',
          headerShown: false,
        }}
      />

      <MainStack.Screen
        name="Messages"
        component={feed2B ? MessagesScreen2B : MessagesScreen}
        options={{
          presentation: 'card',
          headerShown: false,
        }}
      />

      {/* Cible de la cloche de l'en-tête du fil « 2B ». Enregistrée pour tout
          le monde, pas seulement sous le drapeau : une route conditionnelle
          disparaîtrait de la pile au moment même où un lien profond ou une
          notification poussée essaie de l'ouvrir. */}
      <MainStack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          presentation: 'card',
          headerShown: false,
        }}
      />

      <MainStack.Screen
        name="CreateVideo"
        component={CreateVideoScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />

      {/* `card` et non `modal` : la caméra doit occuper tout le cadre, alors
          qu'une feuille modale laisse voir l'écran précédent derrière elle. */}
      <MainStack.Screen
        name="RecordVideo"
        component={RecordVideoScreen}
        options={{
          presentation: 'card',
          headerShown: false,
          // Même raison que l'éditeur : un glissement doit rester un geste de
          // l'écran, pas un retour arrière.
          gestureEnabled: false,
        }}
      />

      {/* `gestureEnabled: false` : on fait glisser des textes au doigt sur cet
          écran, et le geste de retour de la pile attrapait le mouvement
          horizontal — on quittait l'éditeur en essayant de déplacer un mot. */}
      <MainStack.Screen
        name="VideoEditor"
        component={VideoEditorScreen}
        options={{
          presentation: 'card',
          headerShown: false,
          gestureEnabled: false,
        }}
      />

      <MainStack.Screen
        name="VideoCaption"
        component={VideoCaptionScreen}
        options={{
          presentation: 'card',
          headerShown: false,
        }}
      />


      <MainStack.Screen
        name="LiveViewer"
        component={LiveViewerScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />

      <MainStack.Screen
        name="GoLive"
        component={GoLiveScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />

      <MainStack.Screen 
        name="DeveloperPortal" 
        component={DeveloperPortalScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />
      
      <MainStack.Screen
        name="ProfileCustomization"
        component={ProfileCustomizationScreen}
        options={{
          presentation: 'card',
          headerShown: false,
        }}
      />

      <MainStack.Screen
        name="NewConversation"
        component={NewConversationScreen}
        options={{
          presentation: 'card',
          headerShown: false,
        }}
      />

      <MainStack.Screen
        name="ConversationThread"
        component={feed2B ? ConversationThreadScreen2B : ConversationThreadScreen}
        options={{
          presentation: 'card',
          headerShown: false,
        }}
      />

      <MainStack.Screen
        name="FollowRequests"
        component={FollowRequestsScreen}
        options={{
          presentation: 'card',
          headerShown: false,
        }}
      />
      <MainStack.Screen
        name="UserConnections"
        component={UserConnectionsScreen}
        options={{ headerShown: false }}
      />
      <MainStack.Screen
        name="Bookmarks"
        component={BookmarksScreen}
        options={{ presentation: 'card', headerShown: false }}
      />
      <MainStack.Screen
        name="WeeklyVote"
        component={WeeklyVoteScreen}
        options={{ presentation: 'card', headerShown: false }}
      />
      <MainStack.Screen
        name="BlockedAccounts"
        component={BlockedAccountsScreen}
        options={{ presentation: 'card', headerShown: false }}
      />
      <MainStack.Screen
        name="TwoFactor"
        component={TwoFactorScreen}
        options={{ presentation: 'card', headerShown: false }}
      />

      <MainStack.Screen
        name="GroupMembers"
        component={GroupMembersScreen}
        options={{
          presentation: 'card',
          headerShown: false,
        }}
      />

      {/* Revue communautaire (BÊTA) — jusqu'ici réservée à l'app Windows.
          En `card` et non en `modal` : on y enchaîne les contenus un par un,
          c'est une session de travail, pas une feuille qu'on ouvre et referme. */}
      <MainStack.Screen
        name="CommunityReview"
        component={CommunityReviewScreen}
        options={{
          presentation: 'card',
          headerShown: false,
        }}
      />

      {/* Analytics prédictifs (avantage Pro) — on y navigue entre onglets et on
          y teste des brouillons : une carte, pas une feuille modale. */}
      <MainStack.Screen
        name="PredictiveAnalytics"
        component={PredictiveAnalyticsScreen}
        options={{ headerShown: false }}
      />

      {/* Support par ticket */}
      <MainStack.Screen
        name="Support"
        component={SupportScreen}
        options={{ headerShown: false }}
      />
      <MainStack.Screen
        name="SupportTicket"
        component={SupportTicketScreen}
        options={{ headerShown: false }}
      />
      <MainStack.Screen
        name="UltraSupportAgent"
        component={UltraSupportAgentScreen}
        options={{ headerShown: false }}
      />
      {/* Abonnement — page servie par l'API dans une WebView. L'ecran garde la
          main sur l'achat : la page ne fait que le demander. */}
      <MainStack.Screen
        name="Subscription"
        component={SubscriptionScreen}
        options={{ headerShown: false }}
      />
      {/* Signalement de bug — ouvre un ticket de catégorie « bug ». */}
      <MainStack.Screen
        name="ReportBug"
        component={ReportBugScreen}
        options={{ headerShown: false }}
      />

      {/* Programme beta. Volontairement NON decline en 2B : les sous-ecrans de
          Reglages ne le sont pas, et une seconde version serait a maintenir
          pour un ecran qu'on ouvre trois fois. */}
      <MainStack.Screen
        name="Beta"
        component={BetaScreen}
        options={{ headerShown: false }}
      />

      {/* La Forge — proposer une fonctionnalite, et suivre sa recompense. */}
      <MainStack.Screen
        name="Forge"
        component={ForgeScreen}
        options={{ headerShown: false }}
      />

      {/* File de la Forge — cote staff : decider et verser. */}
      <MainStack.Screen
        name="ForgeReview"
        component={ForgeReviewScreen}
        options={{ headerShown: false }}
      />

      {/* Offre créateur — ventes de contenu, programmation, renseignements,
          marché des pseudos et modification d'un tweet publié. */}
      <MainStack.Screen
        name="CreatorStudio"
        component={CreatorStudioScreen}
        options={{ headerShown: false }}
      />
      <MainStack.Screen
        name="PaidContentSales"
        component={PaidContentSalesScreen}
        options={{ headerShown: false }}
      />
      <MainStack.Screen
        name="ScheduledPosts"
        component={ScheduledPostsScreen}
        options={{ headerShown: false }}
      />
      <MainStack.Screen
        name="ProfileInsights"
        component={ProfileInsightsScreen}
        options={{ headerShown: false }}
      />
      {/* Retrospective annuelle en stories : plein ecran, sans en-tete. */}
      <MainStack.Screen
        name="Retrospective"
        component={RetrospectiveScreen}
        options={{ headerShown: false, presentation: 'card', animation: 'fade' }}
      />
      <MainStack.Screen
        name="UsernameMarket"
        component={UsernameMarketScreen}
        options={{ headerShown: false }}
      />
      <MainStack.Screen
        name="CreatorContracts"
        component={ContractsScreen}
        options={{ headerShown: false }}
      />
      <MainStack.Screen
        name="ContractDetail"
        component={ContractDetailScreen}
        options={{ headerShown: false }}
      />
      <MainStack.Screen
        name="EditTweet"
        component={EditTweetScreen}
        options={{ presentation: 'card', animation: 'slide_from_bottom', headerShown: false }}
      />

      {/* Places d'invitation — emission cote organisation, controle a la porte,
          et les invitations recues cote invite. */}
      <MainStack.Screen
        name="EventPassAdmin"
        component={EventPassAdminScreen}
        options={{ presentation: 'card', animation: 'slide_from_bottom', headerShown: false }}
      />

      {/* Meme raison que `RecordVideo` : la camera doit occuper tout le cadre,
          alors qu'une feuille modale laisse voir l'ecran precedent derriere. */}
      <MainStack.Screen
        name="EventPassScan"
        component={EventPassScanScreen}
        options={{ presentation: 'card', headerShown: false }}
      />

      <MainStack.Screen
        name="MyPasses"
        component={MyPassesScreen}
        options={{ presentation: 'card', animation: 'slide_from_bottom', headerShown: false }}
      />

      <MainStack.Screen
        name="AccountStatus"
        component={AccountStatusScreen}
        options={{ presentation: 'card', animation: 'slide_from_bottom', headerShown: false }}
      />

      <MainStack.Screen
        name="Calibration"
        component={CalibrationScreen}
        options={{ presentation: 'card', animation: 'slide_from_bottom', headerShown: false }}
      />

      <MainStack.Screen
        name="ShadowbanAdmin"
        component={ShadowbanAdminScreen}
        options={{ presentation: 'card', animation: 'slide_from_bottom', headerShown: false }}
      />

    </MainStack.Navigator>

    {/* Masque l'application pendant tout le parcours de démarrage.
        Placé ICI, entre le navigateur et les deux étapes ci-dessous : il
        recouvre le fil, mais les étapes rendues après lui restent visibles.
        Sans ce fond, le fil réapparaissait un instant à chaque « Continuer ». */}
    <StartupFlowBackdrop />

    {/* Popup d'anniversaire de Kospor */}
    <KosporBirthdayPopup
      visible={birthdayVisible}
      onClose={handleClosePopup}
      onNavigateToKosporBirthday={handleNavigateToKosporBirthday}
    />

    {/* Correction de la barre pour les comptes du test « 2B » : leur ancienne
        préférence peut contenir jusqu'à cinq raccourcis, pour deux
        emplacements. Déclarée AVANT l'onboarding : la file les sérialise, et
        les deux ne peuvent de toute façon pas être pertinentes ensemble. */}
    <NavbarFixModal
      visible={navbarFixVisible}
      selected={navbarSelected}
      onChoose={() => {
        setShowNavbarFix(false);
        // Même garde que la popup d'anniversaire : `navigate` sur une
        // référence pas encore prête est un no-op silencieux, et la popup
        // serait refermée sans que rien ne s'ouvre.
        if (navigationRef.isReady()) navigationRef.navigate('NavbarCustomization' as never);
      }}
      onClearAll={() => {
        saveNavbarPrefs([]);
        setShowNavbarFix(false);
      }}
      onDismiss={() => setShowNavbarFix(false)}
    />

    {/* Onboarding : choix des onglets optionnels de la navbar */}
    <NavbarOnboardingModal
      visible={navbarOnboardingVisible}
      mode="onboarding"
      onComplete={(selected) => {
        saveNavbarPrefs(selected);
        setShowNavbarOnboarding(false);
      }}
      onCancel={() => setShowNavbarOnboarding(false)}
    />

    </>
  );
}
