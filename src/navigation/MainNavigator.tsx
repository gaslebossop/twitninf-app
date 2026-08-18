import React, { useState, useEffect } from 'react';
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
import ReportBugScreen from '../screens/ReportBugScreen';
import ForgeScreen from '../screens/ForgeScreen';
import ForgeReviewScreen from '../screens/ForgeReviewScreen';
import CreatorStudioScreen from '../screens/CreatorStudioScreen';
import PaidContentSalesScreen from '../screens/PaidContentSalesScreen';
import ScheduledPostsScreen from '../screens/ScheduledPostsScreen';
import ProfileInsightsScreen from '../screens/ProfileInsightsScreen';
import UsernameMarketScreen from '../screens/UsernameMarketScreen';
import EditTweetScreen from '../screens/EditTweetScreen';
import MonetizationScreen from '../screens/MonetizationScreen';
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
import LiveViewerScreen from '../screens/LiveViewerScreen';
import GoLiveScreen from '../screens/GoLiveScreen';
import KosporBirthdayPopup from '../components/KosporBirthdayPopup';
import { useKosporBirthdayEvent } from '../hooks/useKosporBirthdayEvent';
import NavbarOnboardingModal from '../components/NavbarOnboardingModal';
import { StartupFlowBackdrop } from '../components/StartupStepPage';
import { NavbarPrefsProvider, useNavbarPrefs } from '../contexts/NavbarPrefsContext';
import { useStartupPopupSlot } from '../contexts/StartupPopupContext';
import DeveloperPortalScreen from '../screens/DeveloperPortalScreen';
import NewConversationScreen from '../screens/NewConversationScreen';
import ProfileCustomizationScreen from '../screens/ProfileCustomizationScreen';
import ConversationThreadScreen from '../screens/ConversationThreadScreen';
import FollowRequestsScreen from '../screens/FollowRequestsScreen';
import UserConnectionsScreen from '../screens/UserConnectionsScreen';
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


export type MainStackParamList = {
  MainTabs: undefined;
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
  Monetization: undefined;
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
  ReportBug: undefined;
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
  UsernameMarket: undefined;
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
      <MainNavigatorInner />
    </NavbarPrefsProvider>
  );
}

function MainNavigatorInner() {
  const { isEventActive, isLoading } = useKosporBirthdayEvent();
  const [showBirthdayPopup, setShowBirthdayPopup] = useState(false);
  const [hasShownPopup, setHasShownPopup] = useState(false);

  const { loading: navbarPrefsLoading, configured: navbarConfigured, save: saveNavbarPrefs } = useNavbarPrefs();
  const [showNavbarOnboarding, setShowNavbarOnboarding] = useState(false);
  const [hasShownNavbarOnboarding, setHasShownNavbarOnboarding] = useState(false);

  // Ces deux popups sont des <Modal> React Native, comme celles de la langue et
  // des patch notes : elles passent par la file d'attente pour qu'une seule
  // soit ouverte à la fois (voir StartupPopupContext).
  const birthdayVisible = useStartupPopupSlot('birthday', showBirthdayPopup);
  const navbarOnboardingVisible = useStartupPopupSlot('navbar', showNavbarOnboarding);

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

  const handleClosePopup = () => {
    setShowBirthdayPopup(false);
  };

  const handleNavigateToKosporBirthday = () => {
    if (navigationRef.isReady()) {
      navigationRef.navigate('KosporBirthday');
    }
  };

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
      <MainStack.Screen 
        name="MainTabs" 
        component={BottomTabNavigator}
        options={{
          gestureEnabled: false,
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
      <MainStack.Screen 
        name="TweetDetail" 
        component={TweetDetailScreen}
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
        name="Monetization" 
        component={MonetizationScreen}
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
        component={MessagesScreen}
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
        component={ConversationThreadScreen}
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
      {/* Signalement de bug — ouvre un ticket de catégorie « bug ». */}
      <MainStack.Screen
        name="ReportBug"
        component={ReportBugScreen}
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
      <MainStack.Screen
        name="UsernameMarket"
        component={UsernameMarketScreen}
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
