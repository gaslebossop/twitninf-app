import React, { useState, useEffect, useCallback, useRef } from 'react';
import { fonts, colors, withAlpha , statusBarStyle} from '../theme';
import { ScreenBackground, ScreenSkeleton, AppRefreshControl, PullRefreshLogo } from '../components/ui';
import { usePullRefreshLogo } from '../hooks/usePullRefreshLogo';
// Alias : ce fichier importe déjà `Animated` du cœur RN plus bas — une
// `Animated.Value` du cœur passée à une vue Reanimated échoue en silence
// (voir CLAUDE.md), donc les deux ne doivent jamais partager le même nom.
import ReanimatedView from 'react-native-reanimated';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  FlatList,
  Animated,
  Dimensions,
  StatusBar,
  SafeAreaView,
  Platform,
  ActivityIndicator,
  TextInput,
  Modal,
  Pressable,
  KeyboardAvoidingView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../contexts/AuthContext';
import { Tweet, User } from '../types/api';
import { apiService } from '../services';
import Avatar from '../components/Avatar';
import TweetCard from '../components/TweetCard';
import VerifiedBadge from '../components/VerifiedBadge';
import ModerationButton from '../components/ModerationButton';
import PremiumBadge from '../components/PremiumBadge';
import GAuthLinkRewardCard from '../components/GAuthLinkRewardCard';
import PremiumDisplayName from '../components/PremiumDisplayName';
import PremiumCheckoutSheet from '../components/PremiumCheckoutSheet';
import { useProfileScreenTracking } from '../hooks/useBehaviorTracking';
import { effectiveSubscriptionTier } from '../utils/subscriptionTier';
import NewEconomyService from '../services/newEconomyService';
import { useEventStyles } from '../hooks/useEventStyles';
import { EventBanner } from '../components/EventBanner';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BanAlertBanner from '../components/BanAlertBanner';
import ProfileStories, { useProfileStories } from '../components/ProfileStories';
import { STORY_GRADIENT } from '../components/StoryRing';
import StoryViewer from '../components/StoryViewer';
import {
  AvatarDecorationLayer,
  AvatarDecorationOrnament,
  ProfileBannerImage,
  ProfileThemeBackdrop,
  ProfileTitleChip,
} from '../components/ProfileDecoration';
import profileCustomizationService, {
  certifiedNameColors,
  decorationColors,
  isPremiumProfile,
  nameSizeScale,
  nameBadgeSize,
  profileThemeOf,
  type ProfileCustomization,
} from '../services/profileCustomizationService';
import {
  CountUp,
  ProfileEntranceHalo,
  useProfileEntrance,
} from '../components/PremiumProfileEntrance';
import { useProfileBannerHeight } from '../hooks/useProfileBannerHeight';
import { toast } from '../components/ui/Toast';
import { showActionSheet } from '../components/ui/ActionSheet';
import { confirmAsync } from '../components/ui/ConfirmSheet';
import useForegroundInterval from '../hooks/useForegroundInterval';

const { height } = Dimensions.get('window');

/** Référence stable : un `[]` littéral changerait d'identité à chaque rendu. */
const EMPTY_TWEETS: Tweet[] = [];
/** Même fond que le feed / navigation (TweetsScreen, tabs) */
const PROFILE_BODY_BG = colors.bg;
const AVATAR_SIZE = 84;
const AVATAR_BORDER = 4;
/** Diamètre extérieur du bloc avatar (bordure incluse) */
const AVATAR_OUTER = AVATAR_SIZE + AVATAR_BORDER * 2;
/**
 * Combien la rangée avatar remonte *sur* la bannière (style X).
 * `top` de la rangée = bannerHeight - AVATAR_ROW_OVERLAP
 */
const AVATAR_ROW_OVERLAP = Math.round(AVATAR_OUTER * 0.58);
/** Espace réservé sous la bannière pour le bas de la PP + marge avant le texte (rangée en absolute) */
const AVATAR_HERO_PAD_BOTTOM = Math.max(52, Math.round(AVATAR_OUTER * 0.52) + 20);
/** Remonte nom / stats / compteurs sur la bannière (tout le bloc header = fond transparent) */
const PROFILE_HEADER_LIFT = Math.round(AVATAR_ROW_OVERLAP * 0.72);

interface ProfileScreenProps {
  navigation: any;
}

const ProfileScreen: React.FC<ProfileScreenProps> = ({ navigation }) => {
  const { user: authUser, logout, isLoading, refreshCurrentUser, accounts, switchAccount, addAccountByCredentials } = useAuth() as any;
  const { styles: eventStyles, theme: currentTheme } = useEventStyles();
  const user = authUser as User | null;
  const { trackProfileInteraction, trackCustomAction } = useProfileScreenTracking(user?.id);

  const { bannerHeight, onBannerParentLayout } = useProfileBannerHeight();

  const [activeTab, setActiveTab] = useState<'tweets' | 'replies' | 'media' | 'likes'>('tweets');
  const [profileTweets, setProfileTweets] = useState<Tweet[]>([]);
  const [tabLoading, setTabLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showAccounts, setShowAccounts] = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [newAccUsername, setNewAccUsername] = useState('');
  const [newAccPassword, setNewAccPassword] = useState('');
  const [isLive, setIsLive] = useState(false);
  const [pendingFollowRequests, setPendingFollowRequests] = useState(0);

  // Stories du profil : anneau autour de l'avatar + rail sous les infos.
  const { group: myStories, reload: reloadMyStories, hasStories } = useProfileStories(user?.id);
  const [storyViewerVisible, setStoryViewerVisible] = useState(false);

  /**
   * Personnalisation premium. `/auth/me` ne renvoie PAS `profile_customization`
   * — sans cette requête dédiée, l'utilisateur voyait son habillage sur les
   * profils des autres mais pas sur le sien. Rechargée à chaque focus : on
   * revient ici juste après l'avoir modifiée.
   */
  const [customization, setCustomization] = useState<ProfileCustomization | undefined>(
    (user as any)?.profile_customization as ProfileCustomization | undefined,
  );
  const [customizationHydrated, setCustomizationHydrated] = useState(
    !!(user as any)?.profile_customization,
  );
  const visibleCustomization = customizationHydrated ? customization : undefined;
  const themed = profileThemeOf(visibleCustomization) !== 'none';
  const [profileAccent, profileSecondary] = decorationColors(visibleCustomization);
  const hasAvatarDecoration =
    (visibleCustomization?.avatar_decoration || 'none') !== 'none';
  /** Accorde la pastille de certif au profil habillé — même source que le nom. */
  const certifPalette = certifiedNameColors(
    (user as any)?.verification_style,
    visibleCustomization,
  );
  const badgeTint = certifPalette.from;

  /**
   * Mise en scène d'arrivée — décidée UNE fois, au montage, et jamais revue.
   *
   * ⚠ Différence importante avec l'écran d'un autre profil : ici le hero est
   * rendu tout de suite, avec les données du contexte d'auth, alors que la
   * personnalisation peut n'arriver qu'après (`useFocusEffect` la recharge à
   * chaque retour sur l'onglet). Si la décision suivait cet état, le nom, la
   * bio et les compteurs — déjà à l'écran — disparaîtraient pour refaire leur
   * entrée : bien pire que pas d'animation. On ne joue donc la scène que
   * lorsque l'habillage est déjà connu au premier rendu ; sinon le profil se
   * contente de se parer quand la réponse tombe, comme avant.
   */
  const entranceDecision = useRef<boolean | null>(null);
  if (entranceDecision.current === null) {
    const seeded = (user as any)?.profile_customization as ProfileCustomization | undefined;
    entranceDecision.current = !!seeded && isPremiumProfile(seeded);
  }
  const premiumProfile = entranceDecision.current;
  const entrance = useProfileEntrance(premiumProfile);

  useEffect(() => {
    const fromAuth = (user as any)?.profile_customization as ProfileCustomization | undefined;
    setCustomization(fromAuth);
    setCustomizationHydrated(!!fromAuth);
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      profileCustomizationService.get().then((state) => {
        if (!cancelled) {
          setCustomization(state.customization);
          setCustomizationHydrated(true);
        }
      }).catch(() => {
        if (!cancelled) setCustomizationHydrated(true);
      });
      return () => {
        cancelled = true;
      };
    }, [user?.id]),
  );

  const loadPendingFollowRequests = useCallback(async () => {
    if (!user?.id || !user.is_private_account) {
      setPendingFollowRequests(0);
      return;
    }
    try {
      const response = await apiService.getFollowRequests();
      setPendingFollowRequests(response?.success ? (response.data?.requests?.length || 0) : 0);
    } catch {
      setPendingFollowRequests(0);
    }
  }, [user?.id, user?.is_private_account]);

  useFocusEffect(
    useCallback(() => {
      void loadPendingFollowRequests();
    }, [loadPendingFollowRequests]),
  );

  const loadProfileTweets = useCallback(async (showLoader = true) => {
    if (!user?.id) {
      setProfileTweets([]);
      setTabLoading(false);
      return;
    }
    if (showLoader) setTabLoading(true);
    try {
      const response = await apiService.getUserTweets(user.id, { limit: 50, type: activeTab });
      setProfileTweets(response?.success ? response.data?.tweets || [] : []);
    } catch {
      setProfileTweets([]);
    } finally {
      if (showLoader) setTabLoading(false);
    }
  }, [activeTab, user?.id]);

  useFocusEffect(
    useCallback(() => {
      void loadProfileTweets(true);
    }, [loadProfileTweets]),
  );

  /**
   * Les quatre handlers passés à `TweetCard` doivent garder la même identité
   * d'un rendu à l'autre, sinon le comparateur de la carte (voir
   * `components/TweetCard`) échoue et les cinquante cartes se re-rendent au
   * moindre like. Ils lisent donc l'état courant par référence plutôt que par
   * capture de closure.
   */
  const profileTweetsRef = useRef(profileTweets);
  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    profileTweetsRef.current = profileTweets;
  }, [profileTweets]);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  const updateTweetInteraction = useCallback((
    tweetId: string,
    interaction: 'is_liked' | 'is_retweeted',
    stat: 'likes' | 'retweets',
    enabled: boolean,
  ) => {
    setProfileTweets((current) => current.map((tweet) => {
      if (tweet.id !== tweetId) return tweet;
      const wasEnabled = !!tweet.user_interaction?.[interaction];
      const delta = enabled === wasEnabled ? 0 : enabled ? 1 : -1;
      return {
        ...tweet,
        stats: {
          likes: tweet.stats?.likes || 0,
          retweets: tweet.stats?.retweets || 0,
          replies: tweet.stats?.replies || 0,
          views: tweet.stats?.views || 0,
          [stat]: Math.max(0, (tweet.stats?.[stat] || 0) + delta),
        },
        user_interaction: {
          is_liked: !!tweet.user_interaction?.is_liked,
          is_retweeted: !!tweet.user_interaction?.is_retweeted,
          [interaction]: enabled,
        },
      } as Tweet;
    }));
  }, []);

  const handleLike = useCallback(async (tweetId: string) => {
    const wasLiked = !!profileTweetsRef.current.find((tweet) => tweet.id === tweetId)?.user_interaction?.is_liked;
    updateTweetInteraction(tweetId, 'is_liked', 'likes', !wasLiked);
    const response = await apiService.likeTweet(tweetId);
    if (!response?.success) updateTweetInteraction(tweetId, 'is_liked', 'likes', wasLiked);
    if (activeTabRef.current === 'likes' && wasLiked && response?.success) {
      setProfileTweets((current) => current.filter((tweet) => tweet.id !== tweetId));
    }
  }, [updateTweetInteraction]);

  const handleRetweet = useCallback(async (tweetId: string) => {
    const wasRetweeted = !!profileTweetsRef.current.find((tweet) => tweet.id === tweetId)?.user_interaction?.is_retweeted;
    updateTweetInteraction(tweetId, 'is_retweeted', 'retweets', !wasRetweeted);
    const response = await apiService.retweet(tweetId);
    if (!response?.success) updateTweetInteraction(tweetId, 'is_retweeted', 'retweets', wasRetweeted);
  }, [updateTweetInteraction]);

  const handleReply = useCallback((tweetId: string) => {
    navigation.navigate('CreateTweet', { parentTweetId: tweetId, replyTo: tweetId });
  }, [navigation]);

  const handleDeleteTweet = useCallback((tweetId: string) => {
    setProfileTweets((current) => current.filter((tweet) => tweet.id !== tweetId));
  }, []);

  const tweetKeyExtractor = useCallback((tweet: Tweet) => tweet.id, []);

  const renderTweetItem = useCallback(
    ({ item }: { item: Tweet }) => (
      <TweetCard
        tweet={item}
        onLike={handleLike}
        onRetweet={handleRetweet}
        onReply={handleReply}
        onDelete={handleDeleteTweet}
        compact={false}
      />
    ),
    [handleLike, handleRetweet, handleReply, handleDeleteTweet],
  );

  const insets = useSafeAreaInsets();
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [premiumLoading, setPremiumLoading] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState(false);

  const loadWalletBalance = async () => {
    setWalletLoading(true);
    setWalletError(false);
    try {
      const walletData = await NewEconomyService.getNfWallet();
      setWalletBalance(Number(walletData?.wallet?.balance || 0));
    } catch {
      setWalletBalance(0);
      setWalletError(true);
    } finally {
      setWalletLoading(false);
    }
  };

  const handleOpenPremiumModal = () => {
    // Le palier est choisi dans la feuille elle-même, plus en amont.
    setShowPremiumModal(true);
    void loadWalletBalance();
  };

  const handlePurchaseSubscription = async (tier: 'plus' | 'pro') => {
    try {
      setPremiumLoading(true);
      const result = await apiService.request('/api/users/purchase-subscription', {
        method: 'POST', requiresAuth: true, body: { tier }
      });
      const purchase = result?.data;
      if (
        result?.success !== true ||
        purchase?.payment_confirmed !== true ||
        !purchase?.transaction_id ||
        purchase?.subscription_tier !== tier
      ) {
        throw new Error(result?.message || 'Le paiement NF n’a pas été confirmé.');
      }
      await refreshCurrentUser();
      await loadWalletBalance();
      const state = await profileCustomizationService.get();
      setCustomization(state.customization);
      setCustomizationHydrated(true);
      setShowPremiumModal(false);
      const label = tier === 'pro' ? 'Pro' : 'Plus';
      // La durée vient de la réponse d'achat : l'annoncer en dur a déjà promis
      // un mois là où l'abonnement en couvrait cinq jours.
      const days = Number(purchase?.duration_days) || 5;
      toast.success('Félicitations !', {
        description: `Abonnement ${label} activé pour ${days} jour${days > 1 ? 's' : ''}.`,
      });
    } catch (error: any) {
      toast.error(error?.message || 'Une erreur est survenue.');
    } finally { setPremiumLoading(false); }
  };

  // L'abonnement socket vit indépendamment du sondage : il n'a pas de raison
  // de s'arrêter en arrière-plan, contrairement au minuteur ci-dessous.
  useEffect(() => {
    const { socket } = require('../services/liveService');
    const handleLiveEnded = ({ liveId }: { liveId: string }) => { if (liveId === user?.id) setIsLive(false); };
    socket.on('liveEnded', handleLiveEnded);
    return () => { socket.off('liveEnded', handleLiveEnded); };
  }, [user?.id]);

  // `useForegroundInterval` plutôt qu'un `setInterval` nu : le sondage battait
  // aussi app en arrière-plan, réveillant le thread JS toutes les 30 s.
  const checkLiveStatus = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { liveService } = require('../services/liveService');
      const lives = await liveService.getLives();
      setIsLive(!!lives.find((l: any) => l.hostId === user.id));
    } catch { }
  }, [user?.id]);

  useForegroundInterval(checkLiveStatus, 30000);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshCurrentUser();
      await loadPendingFollowRequests();
      await loadProfileTweets(false);
      const state = await profileCustomizationService.get();
      setCustomization(state.customization);
      setCustomizationHydrated(true);
    } catch { }
    finally { setRefreshing(false); }
  };

  const { pull, scrollHandler, logoKey, listRef } = usePullRefreshLogo(onRefresh, refreshing);

  const handleAddAccount = async () => {
    if (!newAccUsername.trim() || !newAccPassword) {
      toast.error('Champs requis', {
        description: "Entrez un nom d'utilisateur et un mot de passe.",
      });
      return;
    }
    const res = await addAccountByCredentials(newAccUsername.trim(), newAccPassword);
    if (!res.success) { toast.error(res.message || 'Impossible d\'ajouter le compte'); return; }
    setShowAddAccount(false); setShowAccounts(false);
    setNewAccUsername(''); setNewAccPassword('');
  };

  const openPickerWith = async (fromCamera: boolean) => {
    try {
      if (fromCamera) {
        const p = await ImagePicker.requestCameraPermissionsAsync();
        if (p.status !== 'granted') { toast.error('Permission requise', {
          description: 'Autorisez l\'accès à la caméra.',
        }); return; }
      } else {
        const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (p.status !== 'granted') { toast.error('Permission requise', {
          description: 'Autorisez l\'accès à la galerie.',
        }); return; }
      }
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.9 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.9 });
      if (result.canceled) return;
      const uri = result.assets?.[0]?.uri;
      if (!uri) return;
      setIsUploading(true);
      const uploading = await apiService.uploadUserAvatar(uri);
      if (uploading.success && uploading.data?.url) {
        toast.success('Avatar mis à jour.');
        await refreshCurrentUser();
      } else toast.error(uploading.message || 'Impossible de mettre à jour l\'avatar');
    } catch { toast.error('Une erreur est survenue'); }
    finally { setIsUploading(false); }
  };

  const handleChangeAvatar = () => {
    showActionSheet({
      title: 'Photo de profil',
      items: [
        { label: 'Prendre une photo', icon: 'camera-outline', onPress: () => openPickerWith(true) },
        { label: 'Choisir dans la galerie', icon: 'images-outline', onPress: () => openPickerWith(false) },
      ],
    });
  };

  const handleLogout = () => {
    confirmAsync({
      title: 'Déconnexion',
      message: 'Êtes-vous sûr de vouloir vous déconnecter ?',
      confirmLabel: 'Déconnexion',
      destructive: true,
    }).then((ok) => {
      // Même raison que `AccountManagerScreen.handleClearAllAccounts` : pas de
      // navigation manuelle, `AppNavigator` bascule déjà tout seul sur
      // `isAuthenticated`. L'appeler ici en plus courait la course contre ce
      // re-rendu et produisait « NAVIGATE Intro not handled » puis un
      // « Maximum update depth exceeded ».
      if (ok) (async () => { await logout(); })();
    });
  };

  const formatStat = (n?: number) => {
    if (!n) return '0';
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  };

  if (!user) {
    return (
      <ScreenBackground>
        <SafeAreaView style={S.safeArea}>
          <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
          <ScreenSkeleton variant="detail" />
        </SafeAreaView>
      </ScreenBackground>
    );
  }

  const TABS: { key: typeof activeTab; label: string }[] = [
    { key: 'tweets', label: 'Posts' },
    { key: 'replies', label: 'Réponses' },
    { key: 'media', label: 'Médias' },
    { key: 'likes', label: "J'aime" },
  ];

  const subTier = effectiveSubscriptionTier(!!user.premium, user.subscription_tier);

  /** Taille des pastilles, accordée au corps réel du pseudo (voir nameBadgeSize). */
  const badgeSize = nameBadgeSize(visibleCustomization, S.fullName.fontSize);

  return (
    <ScreenBackground>
    <View style={S.safeArea}>
      <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
      <EventBanner />

      {/*
        Le contenu de l'onglet est virtualisé : l'écran montait jusqu'à
        cinquante `TweetCard` avant la première frame. Tout ce qui précède les
        posts (hero, stats, stories, onglets) devient l'en-tête de la liste, et
        garde exactement sa place et son défilement.

        `removeClippedSubviews` reste à `false`, comme sur l'ancien ScrollView :
        le hero et les parures premium débordent en `position: absolute`, et le
        clipping les ferait disparaître.
      */}
      <View style={S.listWrap}>
      {Platform.OS === 'ios' && <PullRefreshLogo key={logoKey} pull={pull} active={refreshing} />}
      <ReanimatedView.FlatList
        // Voir `usePullRefreshLogo` : la traction est lue par cette ref, sur
        // le thread UI, pas par `onScroll` (que `VirtualizedList` compose).
        ref={listRef}
        style={S.scroll}
        contentContainerStyle={{ paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
        bounces={!refreshing}
        alwaysBounceVertical
        removeClippedSubviews={false}
        onScroll={scrollHandler}
        scrollEventThrottle={1}
        refreshControl={Platform.OS === 'ios' ? undefined : (
          <AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        )}
        data={tabLoading ? EMPTY_TWEETS : profileTweets}
        keyExtractor={tweetKeyExtractor}
        renderItem={renderTweetItem}
        initialNumToRender={6}
        maxToRenderPerBatch={5}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        ListHeaderComponent={
          <>

        {/* ── Hero bannière + PP ── */}
        <View style={S.profileHero}>

          {/*
            Thème premium : un fond peint DERRIÈRE tout le profil (bannière,
            avatar, nom, bio, stats) et qui déborde sous le hero. Il ne passe
            jamais par-dessus la bannière — d'où sa place en premier enfant.

            Sur un profil habillé, la scène d'arrivée remplace le fondu interne
            du calque : `style` est fusionné en dernier, donc il gagne sur les
            clés qu'il redéfinit (`opacity`, `transform`).
          */}
          <ProfileThemeBackdrop
            customization={visibleCustomization}
            bannerHeight={bannerHeight}
            style={premiumProfile ? entrance.theme : undefined}
          />

          {/* Bannière */}
          <View style={{ width: '100%' }} onLayout={onBannerParentLayout}>
            <Animated.View
              style={[S.bannerWrap, { height: bannerHeight }, themed && S.bannerWrapThemed, entrance.banner]}
            >
              {user.banner ? (
                <ProfileBannerImage uri={user.banner as string} themed={themed} />
              ) : (
                !themed && <View style={S.bannerPlaceholder} />
              )}

              <TouchableOpacity
                style={[S.bannerSettings, { top: Math.max(insets.top, 8) + 4 }]}
                onPress={() => navigation.navigate('Settings', { returnTo: 'ProfileScreen' })}
                activeOpacity={0.8}
              >
                {/* Sur le liseré sombre fixe de la bannière (`bannerSettings`,
                    `rgba(15,20,25,0.65)` quel que soit le thème) — une icône
                    thémée y passait au quasi-noir en clair, invisible sur ce
                    fond qui, lui, ne change jamais. */}
                <Ionicons name="settings-outline" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </Animated.View>
          </View>

          {/* Avatar + boutons — flow normal, marginTop négatif pour chevaucher la bannière */}
          <View style={[S.avatarEditRow, { marginTop: -AVATAR_ROW_OVERLAP }]}>

            <Animated.View style={entrance.avatar}>
            <TouchableOpacity
              // Comportement Instagram : l'avatar ouvre la story quand il y en
              // a une. La photo de profil se change via « Modifier le profil »
              // ou par appui long.
              onPress={hasStories ? () => setStoryViewerVisible(true) : handleChangeAvatar}
              onLongPress={handleChangeAvatar}
              activeOpacity={0.85}
              style={S.avatarTouchable}
            >
              {/* Le halo d'atterrissage, derrière l'avatar : décor éphémère,
                  démonté dès la fin de la scène. */}
              <ProfileEntranceHalo
                size={AVATAR_SIZE + AVATAR_BORDER * 2}
                customization={visibleCustomization}
                active={entrance.staging}
              />
              {hasStories && !hasAvatarDecoration && (
                <LinearGradient
                  colors={STORY_GRADIENT as unknown as [string, string, ...string[]]}
                  start={{ x: 0.85, y: 0.05 }}
                  end={{ x: 0.15, y: 0.95 }}
                  style={S.avatarStoryRing}
                  pointerEvents="none"
                />
              )}
              {/* Décoration d'avatar premium (palier Pro) */}
              <AvatarDecorationLayer customization={visibleCustomization} size={AVATAR_SIZE + AVATAR_BORDER * 2} />
              {hasAvatarDecoration ? (
                <LinearGradient
                  colors={[profileAccent, profileSecondary] as [string, string]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[S.avatarBorder, isLive && S.liveBorder]}
                >
                  <Avatar size={AVATAR_SIZE} username={user.username} uri={user.avatar as any} />
                  {isUploading && (
                    <View style={S.uploadOverlay}>
                      <ActivityIndicator color="#fff" size="small" />
                    </View>
                  )}
                </LinearGradient>
              ) : (
                <View style={[S.avatarBorder, isLive && S.liveBorder]}>
                  <Avatar size={AVATAR_SIZE} username={user.username} uri={user.avatar as any} />
                  {isUploading && (
                    <View style={S.uploadOverlay}>
                      <ActivityIndicator color="#fff" size="small" />
                    </View>
                  )}
                </View>
              )}
              {/* Après l'avatar : l'ornement doit passer devant lui. */}
              <AvatarDecorationOrnament
                customization={visibleCustomization}
                size={AVATAR_SIZE + AVATAR_BORDER * 2}
              />
              {isLive && (
                <View style={S.liveBadge}>
                  <Text style={S.liveBadgeText}>LIVE</Text>
                </View>
              )}
            </TouchableOpacity>
            </Animated.View>

            <Animated.View style={[S.headerActions, entrance.action]}>
              <TouchableOpacity
                style={[
                  S.outlineIconBtn,
                  themed && {
                    borderColor: withAlpha(profileAccent, 0.55),
                    backgroundColor: withAlpha(profileAccent, 0.16),
                  },
                ]}
                onPress={() => navigation.navigate('TweetMonetization')}
                activeOpacity={0.8}
              >
                <Ionicons name="cash-outline" size={18} color={colors.textPrimary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  S.outlineIconBtn,
                  themed && {
                    borderColor: withAlpha(profileAccent, 0.55),
                    backgroundColor: withAlpha(profileAccent, 0.16),
                  },
                ]}
                onPress={() => navigation.navigate('ProfileCustomization')}
                activeOpacity={0.8}
              >
                <Ionicons name="color-palette-outline" size={18} color={colors.textPrimary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  S.editProfileBtn,
                  themed && {
                    borderColor: withAlpha(profileAccent, 0.55),
                    backgroundColor: withAlpha(profileAccent, 0.16),
                  },
                ]}
                onPress={() => navigation.navigate('EditProfile')}
                activeOpacity={0.8}
              >
                <Text style={S.editProfileText}>Modifier le profil</Text>
              </TouchableOpacity>

              {isLive && (
                <TouchableOpacity
                  style={S.liveBtn}
                  onPress={() => {
                    const { liveService } = require('../services/liveService');
                    liveService.getLives().then((lives: any[]) => {
                      const userLive = lives.find((l: any) => l.hostId === user.id);
                      if (userLive) {
                        navigation.navigate('LiveViewer', {
                          liveId: userLive.liveId,
                          playbackUrl: userLive.metadata.playbackUrl,
                        });
                      }
                    });
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons name="videocam" size={15} color="#fff" />
                </TouchableOpacity>
              )}
            </Animated.View>
          </View>

          {/* Infos utilisateur — suit l'avatar en flow normal */}
          <View style={[S.profileOverBanner, { marginTop: 8 }]}>
            <View style={S.userInfo}>

              <Animated.View style={[S.nameRow, entrance.name]}>
                {/* `maxWidth: '88%'` coupait le pseudo bien avant le bord :
                    avec la taille « Géant » (corps doublé), le nom butait sur
                    ce plafond et non sur la largeur disponible. `flexShrink`
                    et `minWidth: 0` suffisent — le nom occupe toute la place
                    que les pastilles lui laissent, et pas moins. */}
                <View style={{ flexShrink: 1, minWidth: 0, marginRight: 6, overflow: 'visible' }}>
                  <PremiumDisplayName
                    text={user.full_name}
                    baseStyle={{ ...S.fullName, fontSize: S.fullName.fontSize * nameSizeScale(visibleCustomization) }}
                    isPremium={!!user.premium}
                    subscriptionTierRaw={user.subscription_tier}
                    fontId="system"
                    effectId="none"
                    customization={visibleCustomization}
                    verified={!!user.verified}
                    verificationStyle={user.verification_style as any}
                  />
                </View>
                {user.verified && (
                  <View style={{ marginLeft: 5 }}>
                    <VerifiedBadge
                      verificationStyle={(user.verification_style as any) || 'default'}
                      size={badgeSize}
                      animated
                      tint={badgeTint}
                    />
                  </View>
                )}
                {user.premium && (
                  <View style={{ marginLeft: 4 }}>
                    {/* Mêmes sources que la pastille ci-dessus : le badge se
                        range derrière la certification au lieu d'imposer une
                        troisième palette sur la ligne du pseudo. */}
                    <PremiumBadge
                      type="small"
                      animated
                      size={badgeSize}
                      subscriptionTier={subTier}
                      tint={user.verified ? certifPalette : null}
                    />
                  </View>
                )}
                {user.is_private_account && (
                  <View style={{ marginLeft: 4 }}>
                    <Ionicons name="lock-closed" size={14} color={colors.textSecondary} />
                  </View>
                )}
              </Animated.View>

              {/* ── La cascade ──
                  Une ligne monte après l'autre, 50 ms d'écart. Les index sont
                  fixes et pas dérivés de l'ordre de rendu : le titre, la bio et
                  l'« à propos » sont facultatifs, et un décalage calculé ferait
                  glisser toute la suite dès qu'un champ manque. */}
              <Animated.View style={entrance.line(0)}>
                <TouchableOpacity
                  style={S.handleRow}
                  onPress={() => (navigation as any).navigate('AccountManager')}
                  activeOpacity={0.8}
                >
                  <Text style={S.handle}>@{user.username}</Text>
                  <Ionicons name="chevron-down" size={13} color={colors.textSecondary} style={{ marginLeft: 3 }} />
                </TouchableOpacity>
              </Animated.View>

              {/* Titre premium : une ligne à soi, sous le pseudo. */}
              <Animated.View style={entrance.line(1)}>
                <ProfileTitleChip customization={visibleCustomization} />
              </Animated.View>

              {!!user.bio?.trim?.() && (
                <Animated.Text style={[S.bio, entrance.line(2)]}>
                  {String(user.bio).trim()}
                </Animated.Text>
              )}

              {/* « À propos » premium : bloc distinct de la bio, façon Discord */}
              {!!visibleCustomization?.about_me && (
                <Animated.View
                  style={[
                    S.aboutBlock,
                    {
                      borderLeftColor: profileAccent,
                      backgroundColor: withAlpha(profileAccent, 0.14),
                    },
                    entrance.line(3),
                  ]}
                >
                  <Text style={S.aboutLabel}>À PROPOS</Text>
                  <Text style={S.aboutText}>{visibleCustomization.about_me}</Text>
                </Animated.View>
              )}

              <Animated.View style={[S.metaRow, entrance.line(4)]}>
                {!!user.city?.trim?.() && (
                  <View style={S.metaItem}>
                    <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
                    <Text style={S.metaText}> {String(user.city).trim()}</Text>
                  </View>
                )}
                {user.created_at && (
                  <View style={S.metaItem}>
                    <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
                    <Text style={S.metaText}>
                      {' '}A rejoint en{' '}
                      {new Date(user.created_at).toLocaleDateString('fr-FR', {
                        month: 'long',
                        year: 'numeric',
                      })}
                    </Text>
                  </View>
                )}
              </Animated.View>

              <Animated.View style={[S.statsRow, entrance.line(5)]}>
                <TouchableOpacity
                  style={S.statGroup}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('UserConnections', {
                    userId: user.id,
                    username: user.username,
                    initialTab: 'following',
                  })}
                >
                  <CountUp value={Number(user.stats?.following || 0)} active={entrance.staging} format={formatStat} style={S.statNum} />
                  <Text style={S.statLbl}> Abonnements</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[S.statGroup, { marginLeft: 16 }]}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('UserConnections', {
                    userId: user.id,
                    username: user.username,
                    initialTab: 'followers',
                  })}
                >
                  <CountUp value={Number(user.stats?.followers || 0)} active={entrance.staging} format={formatStat} style={S.statNum} />
                  <Text style={S.statLbl}> Abonnés</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[S.statGroup, { marginLeft: 16 }]} activeOpacity={0.7}>
                  <CountUp value={Number(user.stats?.tweets || 0)} active={entrance.staging} format={formatStat} style={S.statNum} />
                  <Text style={S.statLbl}> Posts</Text>
                </TouchableOpacity>
              </Animated.View>

              {user.is_private_account && (
                <Animated.View style={entrance.line(6)}>
                  <TouchableOpacity
                    style={S.followRequestsLink}
                    activeOpacity={0.8}
                    onPress={() => navigation.navigate('FollowRequests')}
                  >
                    <View style={S.followRequestsIcon}>
                      <Ionicons name="person-add-outline" size={16} color={colors.accent} />
                    </View>
                    <Text style={S.followRequestsLinkText}>Demandes d&apos;abonnement</Text>
                    {pendingFollowRequests > 0 && (
                      <View style={S.followRequestsBadge}>
                        <Text style={S.followRequestsBadgeText}>
                          {pendingFollowRequests > 99 ? '99+' : pendingFollowRequests}
                        </Text>
                      </View>
                    )}
                    <Ionicons name="chevron-forward" size={17} color={colors.textSecondary} />
                  </TouchableOpacity>
                </Animated.View>
              )}

            </View>
          </View>

        </View>
        {/* fin profileHero */}

        {/* Bannière ban */}
        <BanAlertBanner />

        {/* Admin */}
        <View style={{ paddingHorizontal: 16, marginTop: 4, marginBottom: 2 }}>
          <ModerationButton />
        </View>

        {/* Sélecteur de comptes */}
        {showAccounts && (
          <View style={S.accountsDropdown}>
            {accounts.map((acc: any) => (
              <TouchableOpacity
                key={acc.id}
                style={S.accountItem}
                onPress={() => switchAccount(acc.id)}
              >
                <Avatar size={28} username={acc.username} uri={acc.avatar} />
                <View style={{ marginLeft: 10, flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: '600', fontFamily: fonts.semibold, fontSize: 14 }}>
                    @{acc.username}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={1}>
                    {acc.full_name}
                  </Text>
                </View>
                {acc.verified && (
                  <VerifiedBadge
                    verificationStyle={(acc.verification_style as any) || 'default'}
                    size={14}
                  />
                )}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={S.addAccountRow} onPress={() => setShowAddAccount(true)}>
              <Ionicons name="person-add-outline" size={16} color={colors.accent} />
              <Text style={S.addAccountText}>Ajouter un compte</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Modal ajout de compte */}
        {showAddAccount && (
          <Modal
            transparent
            animationType="fade"
            visible
            onRequestClose={() => setShowAddAccount(false)}
          >
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <Pressable style={S.modalOverlay} onPress={() => setShowAddAccount(false)}>
              <Pressable style={S.addAccountBox} onPress={(e) => e.stopPropagation()}>
                <Text style={S.addAccountTitle}>Ajouter un compte</Text>
                <Text style={S.inputLabel}>Nom d'utilisateur</Text>
                <TextInput
                  style={S.input}
                  placeholder="username"
                  placeholderTextColor={colors.textSecondary}
                  value={newAccUsername}
                  onChangeText={setNewAccUsername}
                  autoCapitalize="none"
                />
                <Text style={S.inputLabel}>Mot de passe</Text>
                <TextInput
                  style={S.input}
                  placeholder="••••••••"
                  placeholderTextColor={colors.textSecondary}
                  value={newAccPassword}
                  onChangeText={setNewAccPassword}
                  secureTextEntry
                />
                <View style={S.addAccountActions}>
                  <TouchableOpacity
                    onPress={() => setShowAddAccount(false)}
                    style={S.cancelBtn}
                  >
                    <Text style={S.cancelText}>Annuler</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleAddAccount} style={S.confirmBtn}>
                    <Text style={S.confirmText}>Ajouter</Text>
                  </TouchableOpacity>
                </View>
              </Pressable>
            </Pressable>
            </KeyboardAvoidingView>
          </Modal>
        )}

        {/* ── STORIES À LA UNE ── */}
        <ProfileStories userId={user?.id} isOwner currentUserId={user?.id} />

        {/* ── TABS ── */}
        <View
          style={[
            S.tabsBar,
            themed && { borderBottomColor: withAlpha(profileAccent, 0.28) },
          ]}
        >
          {TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={S.tabItem}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
            >
              <Text style={[S.tabLabel, activeTab === tab.key && S.tabLabelActive]}>
                {tab.label}
              </Text>
              {activeTab === tab.key && (
                <View style={[S.tabUnderline, themed && { backgroundColor: profileAccent }]} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* ── LOGOUT ──
            Dans l'en-tête, pas dans le pied de liste : avec beaucoup de
            tweets, un bouton posé après toute la liste demandait de tout
            faire défiler pour se déconnecter. */}
        <TouchableOpacity style={S.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={16} color={colors.red} />
          <Text style={S.logoutText}>Se déconnecter</Text>
        </TouchableOpacity>

          </>
        }
        ListEmptyComponent={
          tabLoading ? (
          <View style={S.emptyWrap}>
            <ActivityIndicator size="small" color={colors.accent} />
          </View>
        ) : (
          <View style={S.emptyWrap}>
            <Ionicons
              name={
                activeTab === 'tweets'
                  ? 'chatbubble-outline'
                  : activeTab === 'replies'
                  ? 'chatbubble-ellipses-outline'
                  : activeTab === 'media'
                  ? 'image-outline'
                  : 'heart-outline'
              }
              size={42}
              color={colors.textMuted}
            />
            <Text style={S.emptyTitle}>
              {activeTab === 'tweets'
                ? 'Pas encore de posts'
                : activeTab === 'replies'
                ? 'Pas encore de réponses'
                : activeTab === 'media'
                ? 'Pas encore de médias'
                : 'Pas encore de likes'}
            </Text>
          </View>
          )
        }
        ListFooterComponent={
          <>

        {/* ── PREMIUM BANNER ── */}
        {subTier !== 'pro' && (
          <TouchableOpacity
            style={S.premiumBanner}
            onPress={handleOpenPremiumModal}
            activeOpacity={0.85}
          >
            <Ionicons name="diamond" size={18} color={colors.gold} />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={S.premiumBannerTitle}>
                {subTier === 'plus' ? 'Passer à Pro' : 'Abonnements Plus & Pro'}
              </Text>
              <Text style={S.premiumBannerSub}>
                {subTier === 'plus'
                  ? 'Mise à niveau vers Premium Pro'
                  : 'Premium Pro · 15 € en NF · 5 jours'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        )}

        <View style={{ marginHorizontal: 16 }}>
          <GAuthLinkRewardCard />
        </View>

          </>
        }
      />
      </View>

      {/* ── VISIONNEUSE DE STORIES (avatar) ── */}
      <StoryViewer
        visible={storyViewerVisible}
        groups={[myStories]}
        initialGroupIndex={0}
        currentUserId={user?.id}
        onClose={() => setStoryViewerVisible(false)}
        onStoryDeleted={reloadMyStories}
      />

      {/* ── MODAL PREMIUM ── */}
      <PremiumCheckoutSheet
        visible={showPremiumModal}
        onClose={() => setShowPremiumModal(false)}
        currentTier={subTier}
        walletBalance={walletBalance}
        walletLoading={walletLoading}
        walletError={walletError}
        onRetryWallet={loadWalletBalance}
        loading={premiumLoading}
        // Le palier vient de la feuille : le figer sur « pro » facturait le
        // palier haut même quand l'utilisateur avait choisi Plus.
        onPurchase={(tier) => handlePurchaseSubscription(tier)}
      />

    </View>
    </ScreenBackground>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: 'transparent' },
  listWrap: { flex: 1 },
  scroll: { flex: 1, backgroundColor: 'transparent' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },

  // ── Hero bannière + PP (PP en absolute, rangée transparente pour voir la bannière)
  profileHero: {
    position: 'relative',
    width: '100%',
    overflow: 'visible',
  },
  /** Bloc nom / bio / stats : transparent pour laisser voir le thème derrière */
  profileOverBanner: {
    backgroundColor: 'transparent',
    zIndex: 4,
  },
  bannerWrap: {
    width: '100%',
    backgroundColor: colors.surface,
    position: 'relative',
    overflow: 'hidden',
  },
  /** Avec un thème, la bande de bannière n'a rien à montrer sans photo :
      c'est le thème lui-même qui occupe le haut du profil. */
  bannerWrapThemed: { backgroundColor: 'transparent' },
  bannerPlaceholder: {
    ...StyleSheet.absoluteFillObject as any,
    backgroundColor: colors.surface,
  },
  bannerSettings: {
    position: 'absolute',
    right: 12,
    zIndex: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(15, 20, 25, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Avatar + Edit (superposé à la bannière ; pas de fond opaque sur toute la ligne)
  avatarEditRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    backgroundColor: 'transparent',
    zIndex: 6,
    elevation: 8,
  },
  aboutBlock: {
    marginTop: 10,
    marginBottom: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderLeftWidth: 3,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
  },
  aboutLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontFamily: fonts.bold,
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  aboutText: { color: colors.textSecondary, fontSize: 13.5, lineHeight: 19 },

  avatarTouchable: { position: 'relative' },
  /** Anneau dégradé « story » derrière la bordure de l'avatar. */
  avatarStoryRing: {
    position: 'absolute',
    top: -3,
    left: -3,
    right: -3,
    bottom: -3,
    borderRadius: (AVATAR_SIZE + AVATAR_BORDER * 2) / 2 + 3,
  },
  avatarBorder: {
    borderRadius: (AVATAR_SIZE + AVATAR_BORDER * 2) / 2,
    padding: AVATAR_BORDER,
    overflow: 'hidden',
    backgroundColor: colors.bg,
  },
  liveBorder: { backgroundColor: colors.accent },
  liveBadge: {
    position: 'absolute',
    bottom: -2,
    alignSelf: 'center',
    backgroundColor: colors.accent,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#000',
  },
  liveBadgeText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject as any,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Action buttons aligned to bottom-right of banner area
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 2,
  },
  outlineIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.overlayMedium,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  editProfileBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.overlayMedium,
    backgroundColor: 'transparent',
  },
  editProfileText: {
    color: colors.textPrimary,
    fontWeight: '600', fontFamily: fonts.semibold,
    fontSize: 14,
  },
  liveBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── User info (left-aligned like Twitter)
  userInfo: {
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 6,
    overflow: 'visible',
    backgroundColor: 'transparent',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    overflow: 'visible',
  },
  fullName: {
    fontSize: 21,
    fontWeight: '800', fontFamily: fonts.bold,
    color: colors.textPrimary,
    letterSpacing: -0.6,
  },
  handleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
    marginBottom: 6,
  },
  handle: {
    fontSize: 15,
    color: colors.textSecondary,
    fontWeight: '400', fontFamily: fonts.regular,
  },
  bio: {
    fontSize: 15,
    color: colors.textPrimary,
    lineHeight: 21,
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 10,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 14,
    color: colors.textSecondary,
  },

  // Stats inline (Twitter style)
  statsRow: {
    flexDirection: 'row',
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  statGroup: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  statNum: {
    fontSize: 16,
    fontWeight: '800', fontFamily: fonts.bold,
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  statLbl: {
    fontSize: 14,
    color: colors.textMuted,
    fontWeight: '400', fontFamily: fonts.regular,
  },
  followRequestsLink: {
    minHeight: 42,
    marginTop: 10,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(colors.accent, 0.32),
    backgroundColor: withAlpha(colors.accent, 0.08),
    flexDirection: 'row',
    alignItems: 'center',
  },
  followRequestsIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: withAlpha(colors.accent, 0.14),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },
  followRequestsLinkText: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  followRequestsBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 7,
  },
  followRequestsBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.white,
  },

  // ── Tabs
  tabsBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.overlayMedium,
    marginTop: 0,
    backgroundColor: 'transparent',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    position: 'relative',
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '500', fontFamily: fonts.medium,
    color: colors.textMuted,
    letterSpacing: -0.1,
  },
  tabLabelActive: {
    color: colors.textPrimary,
    fontWeight: '700', fontFamily: fonts.bold,
    letterSpacing: -0.2,
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: '25%',
    right: '25%',
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.accent,
  },

  // ── Empty tab
  emptyWrap: {
    paddingVertical: 48,
    alignItems: 'center',
    gap: 12,
  },
  emptyTitle: {
    fontSize: 15,
    color: colors.textSecondary,
  },

  // ── Accounts dropdown
  accountsDropdown: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: 'rgba(12,14,20,0.45)',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.overlayMedium,
    overflow: 'hidden',
  },
  accountItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  addAccountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  addAccountText: { color: colors.accent, fontWeight: '600', fontFamily: fonts.semibold, fontSize: 14 },

  // ── Add account modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  addAccountBox: {
    width: '100%',
    backgroundColor: 'rgba(16,18,25,0.98)',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.overlayMedium,
    padding: 22,
  },
  addAccountTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '700', fontFamily: fonts.bold, marginBottom: 6 },
  inputLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '500', fontFamily: fonts.medium, marginTop: 14, marginBottom: 7, textTransform: 'uppercase', letterSpacing: 0.6 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.overlayMedium,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 13 : 10,
    color: colors.textPrimary,
    fontSize: 15,
  },
  addAccountActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 18, gap: 10 },
  cancelBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 7, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.overlayMedium },
  cancelText: { color: colors.textMuted, fontWeight: '500', fontFamily: fonts.medium, fontSize: 14 },
  confirmBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 7, backgroundColor: colors.accent },
  confirmText: { color: '#fff', fontWeight: '600', fontFamily: fonts.semibold, fontSize: 14 },

  // ── Premium banner
  premiumBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    padding: 16,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,215,0,0.2)',
    backgroundColor: 'rgba(255,215,0,0.04)',
  },
  premiumBannerTitle: { color: colors.gold, fontWeight: '700', fontFamily: fonts.bold, fontSize: 15 },
  premiumBannerSub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },

  // ── Logout (discret)
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 28,
    paddingVertical: 13,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(244,33,46,0.25)',
    backgroundColor: 'rgba(244,33,46,0.03)',
    gap: 8,
  },
  logoutText: { color: colors.red, fontWeight: '600', fontFamily: fonts.semibold, fontSize: 15 },

  // ── Premium modal
  premiumOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    justifyContent: 'center',
  },
  premiumModal: { width: '100%', maxWidth: 420, borderRadius: 22, overflow: 'hidden' },
  premiumModalInner: {
    paddingHorizontal: 18, paddingTop: 48, paddingBottom: 14, position: 'relative',
    backgroundColor: colors.surfaceAlt,
  },
  premiumModalBorder: {
    borderWidth: 1,
    borderColor: colors.warningMuted,
  },
  premiumClose: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  premiumHero: {
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  premiumHeroKicker: {
    fontSize: 11,
    fontWeight: '800', fontFamily: fonts.bold,
    letterSpacing: 2,
    color: 'rgba(253, 224, 71, 0.95)',
    textAlign: 'center',
    marginBottom: 6,
  },
  premiumTitle: {
    fontSize: 24,
    fontWeight: '800', fontFamily: fonts.bold,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  premiumSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: 4,
  },
  trustRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  trustChip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.25)',
    paddingVertical: 10,
    paddingHorizontal: 10,
    flex: 1,
    minWidth: 100,
    maxWidth: '100%',
  },
  trustChipText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  premiumSectionLabel: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '800', fontFamily: fonts.bold,
    letterSpacing: 0.4,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  featureBlock: {
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.overlaySoft,
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 10,
    gap: 12,
  },
  featureIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureIconWrapGold: {
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
  },
  featureText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500', fontFamily: fonts.medium,
  },
  proTease: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.28)',
  },
  proTeaseText: {
    flex: 1,
    color: colors.cyan,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  tierPickCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.overlayMedium,
    paddingVertical: 14,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  tierPickCardActive: {
    borderColor: colors.gold,
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
  },
  tierPickTitle: { color: colors.textPrimary, fontWeight: '800', fontFamily: fonts.bold, fontSize: 17, marginBottom: 4 },
  tierPickPrice: { color: colors.gold, fontWeight: '800', fontFamily: fonts.bold, fontSize: 16 },
  tierPickHint: { color: colors.textSecondary, fontSize: 11, marginTop: 6, lineHeight: 15 },
  premiumPricingRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceAlt,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: colors.overlayMedium,
  },
  pricingSep: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.surfaceElevated,
    marginHorizontal: 4,
  },
  pricingLabel: { color: colors.textSecondary, fontSize: 12, marginBottom: 6, fontWeight: '600' },
  pricingAmount: { color: colors.gold, fontSize: 26, fontWeight: '800' },
  pricingUnit: { fontSize: 14, color: colors.textMuted, fontWeight: '700' },
  pricingHint: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  pricingWarn: { color: colors.red, fontSize: 10, marginTop: 6, textAlign: 'center', maxWidth: 140, lineHeight: 14 },
  premiumCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  premiumConfirmBtn: { flex: 2, borderRadius: 12, overflow: 'hidden' },
  premiumConfirmGradient: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  premiumConfirmLabel: { color: '#fff', fontWeight: '800', fontFamily: fonts.bold, fontSize: 15 },
});

export default ProfileScreen;
