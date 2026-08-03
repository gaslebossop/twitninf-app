import React, { useState, useEffect } from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import BottomTabNavigator from './BottomTabNavigator';
import UserProfileScreen from '../screens/UserProfileScreen';
import CreateTweetScreen from '../screens/CreateTweetScreen';
import CreateTweetABTestScreen from '../screens/CreateTweetABTestScreen';
import TweetDetailScreen from '../screens/TweetDetailScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import AccountManagerScreen from '../screens/AccountManagerScreen';
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
import CasinoScreen from '../screens/CasinoScreen';
import TweetMonetizationScreen from '../screens/TweetMonetizationScreen';
import EventManagementScreen from '../screens/EventManagementScreen';
import FunctionalEventManagementScreen from '../screens/FunctionalEventManagementScreen';
import KosporBirthdayScreen from '../screens/KosporBirthdayScreen';
import VerificationStyleScreen from '../screens/VerificationStyleScreen';
import CreateTargetingAdScreen from '../screens/CreateTargetingAdScreen';
import PolicierCongoAdminScreen from '../screens/PolicierCongoAdminScreen';
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
import { NavbarPrefsProvider, useNavbarPrefs } from '../contexts/NavbarPrefsContext';
import { useStartupPopupSlot } from '../contexts/StartupPopupContext';
import DeveloperPortalScreen from '../screens/DeveloperPortalScreen';
import PolicierCongoChatScreen from '../screens/PolicierCongoChatScreen';
import NewConversationScreen from '../screens/NewConversationScreen';
import ProfileCustomizationScreen from '../screens/ProfileCustomizationScreen';
import ConversationThreadScreen from '../screens/ConversationThreadScreen';
import FollowRequestsScreen from '../screens/FollowRequestsScreen';
import UserConnectionsScreen from '../screens/UserConnectionsScreen';
import GroupMembersScreen from '../screens/GroupMembersScreen';
import { navigationRef } from './NavigationService';


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
  Casino: undefined;
  TweetMonetization: undefined;
  EventManagement: undefined;
  FunctionalEventManagement: undefined;
  KosporBirthday: undefined;
  VerificationStyle: undefined;
  CreateTargetingAd: undefined;
  CreateCampaign: undefined;
  CreateAdvertisement: undefined;
  EconomyManagement: undefined;
  SimilarityAlgorithm: undefined;
  PolicierCongoAdmin: undefined;
  Video: undefined;
  Messages: undefined;
  CreateVideo: undefined;
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
  PolicierCongoChat: undefined;
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

  // Offre créateur
  CreatorStudio: undefined;
  PaidContentSales: undefined;
  ScheduledPosts: undefined;
  /** `tab` : onglet ouvert d'emblée, quand on arrive depuis le studio. */
  ProfileInsights: { tab?: 'visitors' | 'impersonation' | 'rising' | 'velocity' } | undefined;
  UsernameMarket: undefined;
  /** `content` : texte actuel, pour ne pas rouvrir l'éditeur sur un champ vide. */
  EditTweet: { tweetId: string; content?: string };
};

const MainStack = createStackNavigator<MainStackParamList>();

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
      // Délai pour laisser l'app se charger complètement
      const timer = setTimeout(() => {
        setShowBirthdayPopup(true);
        setHasShownPopup(true);
      }, 2000);

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
      }, 2500);

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
          cardStyle: { backgroundColor: '#0A0B0F' },
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
          presentation: 'modal',
          headerShown: false,
        }}
      />
      
      <MainStack.Screen 
        name="CreateTweet" 
        component={CreateTweetScreen}
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />
      
      <MainStack.Screen 
        name="CreateTweetABTest" 
        component={CreateTweetABTestScreen}
        options={{
          presentation: 'modal',
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
          presentation: 'modal',
          headerShown: false,
        }}
      />
      <MainStack.Screen 
        name="AccountManager" 
        component={AccountManagerScreen}
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />
      <MainStack.Screen 
        name="AddAccount" 
        component={AddAccountScreen}
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />
      
      <MainStack.Screen 
        name="Moderation" 
        component={ModerationScreen}
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />
      
      <MainStack.Screen 
        name="UserManagement" 
        component={UserManagementScreen}
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />
      
      <MainStack.Screen 
        name="Analytics" 
        component={AnalyticsScreen}
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />
      
      <MainStack.Screen 
        name="ContentModeration" 
        component={ContentModerationScreen}
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />
      
      <MainStack.Screen 
        name="Settings" 
        component={SettingsScreen}
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />

      <MainStack.Screen
        name="AccountStats"
        component={AccountStatsScreen}
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />
      
      <MainStack.Screen 
        name="Monetization" 
        component={MonetizationScreen}
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />
      
      <MainStack.Screen 
        name="NewEconomy" 
        component={NewEconomyScreen}
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />
      
      <MainStack.Screen 
        name="Trading" 
        component={TradingScreen}
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />
      
      <MainStack.Screen
        name="WalletDetail"
        component={WalletDetailScreen}
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />

      <MainStack.Screen
        name="CommunityCurrencies"
        component={CommunityCurrenciesScreen}
        options={{
          presentation: 'modal',
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
        name="Casino"
        component={CasinoScreen}
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />
      
      <MainStack.Screen 
        name="TweetMonetization" 
        component={TweetMonetizationScreen}
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />
      
      <MainStack.Screen 
        name="EventManagement" 
        component={EventManagementScreen}
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />
      
      <MainStack.Screen 
        name="FunctionalEventManagement" 
        component={FunctionalEventManagementScreen}
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />
      
      <MainStack.Screen 
        name="KosporBirthday" 
        component={KosporBirthdayScreen}
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />
      
      <MainStack.Screen 
        name="VerificationStyle" 
        component={VerificationStyleScreen}
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />
      
      <MainStack.Screen 
        name="CreateTargetingAd" 
        component={CreateTargetingAdScreen}
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />
      
      <MainStack.Screen 
        name="CreateCampaign" 
        component={CreateCampaignScreen}
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />
      
      <MainStack.Screen 
        name="CreateAdvertisement" 
        component={CreateAdvertisementScreen}
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />
      
      <MainStack.Screen 
        name="EconomyManagement" 
        component={EconomyManagementScreen}
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />

      <MainStack.Screen
        name="SimilarityAlgorithm"
        component={SimilarityAlgorithmScreen}
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />

      <MainStack.Screen 
        name="PolicierCongoAdmin" 
        component={PolicierCongoAdminScreen}
        options={{
          presentation: 'modal',
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
          presentation: 'modal',
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
          presentation: 'modal',
          headerShown: false,
        }}
      />

      <MainStack.Screen
        name="GoLive"
        component={GoLiveScreen}
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />

      <MainStack.Screen 
        name="DeveloperPortal" 
        component={DeveloperPortalScreen}
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />
      
      <MainStack.Screen 
        name="PolicierCongoChat" 
        component={PolicierCongoChatScreen}
        options={{
          presentation: 'modal',
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
        options={{ presentation: 'modal', headerShown: false }}
      />

    </MainStack.Navigator>
    
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
