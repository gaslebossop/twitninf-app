import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Share,
  StatusBar,
  SafeAreaView,
} from 'react-native';
// Alias : ce fichier importe la liste animée de Reanimated. Une
// `Animated.Value` du cœur RN passée à une vue Reanimated échoue en silence
// (voir CLAUDE.md), donc les deux ne doivent jamais partager le même nom.
import ReanimatedView, {
  useAnimatedReaction,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts, colors, statusBarStyle } from '../theme';
import { ScreenBackground, ScreenSkeleton, AppRefreshControl, PullRefreshLogo } from '../components/ui';
import { usePullRefreshLogo } from '../hooks/usePullRefreshLogo';
import { HEADER_CONTENT_HEIGHT } from '../hooks/useHeaderMetrics';
import { useAuth } from '../contexts/AuthContext';
import { Tweet, User } from '../types/api';
import { apiService } from '../services';
import TweetCard from '../components/TweetCard';
import ModerationButton from '../components/ModerationButton';
import RetrospectiveBanner from '../components/RetrospectiveBanner';
import GAuthLinkRewardCard from '../components/GAuthLinkRewardCard';
import BanAlertBanner from '../components/BanAlertBanner';
import { EventBanner } from '../components/EventBanner';
import ProfileStories, { useProfileStories } from '../components/ProfileStories';
import StoryViewer from '../components/StoryViewer';
import { useProfileScreenTracking } from '../hooks/useBehaviorTracking';
import { effectiveSubscriptionTier } from '../utils/subscriptionTier';
import profileCustomizationService, {
  certifiedNameColors,
  decorationColors,
  isPremiumProfile,
  nameBadgeSize,
  profileThemeOf,
  type ProfileCustomization,
} from '../services/profileCustomizationService';
import { useProfileEntrance } from '../components/PremiumProfileEntrance';
import { useProfileBannerHeight } from '../hooks/useProfileBannerHeight';
import { toast } from '../components/ui/Toast';
import { showActionSheet } from '../components/ui/ActionSheet';
import { confirmAsync } from '../components/ui/ConfirmSheet';
import { webProfileUrl } from '../config/webUrl';
import useForegroundInterval from '../hooks/useForegroundInterval';
import Tappable from '../components/ui/Tappable';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import ProfileIdentity, { formatCount } from '../components/profile/ProfileIdentity';
import ProfileTopBar from '../components/profile/ProfileTopBar';
import ProfileTabs from '../components/profile/ProfileTabs';

/**
 * ── Ce que cet écran est ──────────────────────────────────────────────────
 *
 * Une **carte d'identité** suivie de ce que la personne publie. Le détail du
 * vocabulaire visuel (photo, nom gravé, sceaux, registre, mention de
 * délivrance) vit dans `components/profile/ProfileIdentity.tsx` : cet écran
 * ne fait que charger les données et composer.
 *
 * ── Ce qui a été retiré, et où c'est parti ───────────────────────────────
 *
 * • Le sélecteur de comptes déroulant et sa modale « Ajouter un compte » :
 *   `setShowAccounts(true)` n'était appelé NULLE PART. Cent dix lignes de JSX
 *   et deux états que personne ne pouvait atteindre. Le vrai chemin est
 *   `AccountManager`, où mène déjà le chevron du pseudo.
 * • `walletBalance` / `loadWalletBalance` / `handlePurchaseSubscription` :
 *   l'abonnement a son propre écran depuis longtemps, et cette machinerie
 *   n'avait plus de site d'appel atteignable.
 * • Les deux boutons flottants sur la bannière (signets, réglages) et les
 *   trois icônes de 34 px collées à l'avatar. Signets et monétisation sont
 *   dans Réglages ; le reste est remonté dans la barre haute et dans le menu
 *   « ⋯ », donc joignable de n'importe où dans la page au lieu du seul haut.
 * • Le bouton « Se déconnecter », qui était posé ENTRE les onglets et les
 *   posts. Une action de compte, rare et destructrice, n'a rien à faire dans
 *   le flux de lecture : elle est dans le menu « ⋯ ».
 */

/** Référence stable : un `[]` littéral changerait d'identité à chaque rendu. */
const EMPTY_TWEETS: Tweet[] = [];

type TabKey = 'tweets' | 'replies' | 'media' | 'likes';

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: 'tweets', label: 'Posts' },
  { key: 'replies', label: 'Réponses' },
  { key: 'media', label: 'Médias' },
  { key: 'likes', label: "J'aime" },
];

const EMPTY_COPY: Record<TabKey, { icon: any; title: string; message: string }> = {
  tweets: {
    icon: 'create-outline',
    title: 'Aucun post pour le moment',
    message: 'Ce que tu publieras apparaîtra ici, du plus récent au plus ancien.',
  },
  replies: {
    icon: 'chatbubble-ellipses-outline',
    title: 'Aucune réponse',
    message: 'Tes réponses aux posts des autres se rangent ici.',
  },
  media: {
    icon: 'image-outline',
    title: 'Aucun média',
    message: 'Les posts contenant une photo ou une vidéo se retrouvent ici.',
  },
  likes: {
    icon: 'heart-outline',
    title: "Aucun j'aime",
    message: 'Les posts que tu aimes sont gardés ici, visibles de toi seul.',
  },
};

interface ProfileScreenProps {
  navigation: any;
}

const ProfileScreen: React.FC<ProfileScreenProps> = ({ navigation }) => {
  const { user: authUser, logout, refreshCurrentUser } = useAuth() as any;
  const user = authUser as User | null;
  useProfileScreenTracking(user?.id);

  const insets = useSafeAreaInsets();
  const { bannerHeight, onBannerParentLayout } = useProfileBannerHeight();

  const [activeTab, setActiveTab] = useState<TabKey>('tweets');
  const [profileTweets, setProfileTweets] = useState<Tweet[]>([]);
  const [tabLoading, setTabLoading] = useState(true);
  /**
   * L'echec reseau etait avale : le `catch` posait une liste vide, et l'ecran
   * annoncait « Aucun post » a quelqu'un qui en a des centaines. Un etat vide
   * qui ment sur une panne est pire que pas d'etat vide du tout.
   */
  const [tabError, setTabError] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
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
  const hasAvatarDecoration = (visibleCustomization?.avatar_decoration || 'none') !== 'none';
  /** Accorde la pastille de certif au profil habillé — même source que le nom. */
  const certifPalette = certifiedNameColors(
    (user as any)?.verification_style,
    visibleCustomization,
  );

  /**
   * Mise en scène d'arrivée — décidée UNE fois, au montage, et jamais revue.
   *
   * ⚠ Si la décision suivait l'état de la personnalisation, le nom, la bio et
   * les compteurs — déjà à l'écran — disparaîtraient pour refaire leur entrée
   * dès que la réponse tombe : bien pire que pas d'animation. On ne joue donc
   * la scène que lorsque l'habillage est déjà connu au premier rendu.
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
      return () => { cancelled = true; };
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
    useCallback(() => { void loadPendingFollowRequests(); }, [loadPendingFollowRequests]),
  );

  const loadProfileTweets = useCallback(async (showLoader = true) => {
    if (!user?.id) {
      setProfileTweets([]);
      setTabLoading(false);
      return;
    }
    if (showLoader) setTabLoading(true);
    setTabError(false);
    try {
      const response = await apiService.getUserTweets(user.id, { limit: 50, type: activeTab });
      if (response?.success) {
        setProfileTweets(response.data?.tweets || []);
      } else {
        setProfileTweets([]);
        setTabError(true);
      }
    } catch {
      setProfileTweets([]);
      setTabError(true);
    } finally {
      if (showLoader) setTabLoading(false);
    }
  }, [activeTab, user?.id]);

  useFocusEffect(
    useCallback(() => { void loadProfileTweets(true); }, [loadProfileTweets]),
  );

  /**
   * Les quatre handlers passés à `TweetCard` doivent garder la même identité
   * d'un rendu à l'autre, sinon le comparateur de la carte échoue et les
   * cinquante cartes se re-rendent au moindre like. Ils lisent donc l'état
   * courant par référence plutôt que par capture de closure.
   */
  const profileTweetsRef = useRef(profileTweets);
  const activeTabRef = useRef(activeTab);
  useEffect(() => { profileTweetsRef.current = profileTweets; }, [profileTweets]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

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
    const wasLiked = !!profileTweetsRef.current.find((t) => t.id === tweetId)?.user_interaction?.is_liked;
    updateTweetInteraction(tweetId, 'is_liked', 'likes', !wasLiked);
    const response = await apiService.likeTweet(tweetId);
    if (!response?.success) updateTweetInteraction(tweetId, 'is_liked', 'likes', wasLiked);
    if (activeTabRef.current === 'likes' && wasLiked && response?.success) {
      setProfileTweets((current) => current.filter((t) => t.id !== tweetId));
    }
  }, [updateTweetInteraction]);

  const handleRetweet = useCallback(async (tweetId: string) => {
    const wasRetweeted = !!profileTweetsRef.current.find((t) => t.id === tweetId)?.user_interaction?.is_retweeted;
    updateTweetInteraction(tweetId, 'is_retweeted', 'retweets', !wasRetweeted);
    const response = await apiService.retweet(tweetId);
    if (!response?.success) updateTweetInteraction(tweetId, 'is_retweeted', 'retweets', wasRetweeted);
  }, [updateTweetInteraction]);

  const handleReply = useCallback((tweetId: string) => {
    navigation.navigate('CreateTweet', { parentTweetId: tweetId, replyTo: tweetId });
  }, [navigation]);

  const handleDeleteTweet = useCallback((tweetId: string) => {
    setProfileTweets((current) => current.filter((t) => t.id !== tweetId));
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

  // L'abonnement socket vit indépendamment du sondage : il n'a pas de raison
  // de s'arrêter en arrière-plan, contrairement au minuteur ci-dessous.
  useEffect(() => {
    const { socket } = require('../services/liveService');
    const handleLiveEnded = ({ liveId }: { liveId: string }) => {
      if (liveId === user?.id) setIsLive(false);
    };
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

  const { pull, scrollY, scrollHandler, logoKey, listRef } = usePullRefreshLogo(onRefresh, refreshing);

  const openPickerWith = async (fromCamera: boolean) => {
    try {
      if (fromCamera) {
        const p = await ImagePicker.requestCameraPermissionsAsync();
        if (p.status !== 'granted') {
          toast.error('Permission requise', { description: "Autorisez l'accès à la caméra." });
          return;
        }
      } else {
        const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (p.status !== 'granted') {
          toast.error('Permission requise', { description: "Autorisez l'accès à la galerie." });
          return;
        }
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
        toast.success('Photo de profil mise à jour.');
        await refreshCurrentUser();
      } else toast.error(uploading.message || "Impossible de mettre à jour la photo");
    } catch { toast.error('Une erreur est survenue'); }
    finally { setIsUploading(false); }
  };

  const handleChangeAvatar = useCallback(() => {
    showActionSheet({
      title: 'Photo de profil',
      items: [
        { label: 'Prendre une photo', icon: 'camera-outline', onPress: () => openPickerWith(true) },
        { label: 'Choisir dans la galerie', icon: 'images-outline', onPress: () => openPickerWith(false) },
      ],
    });
  }, []);

  const handleShare = useCallback(async () => {
    const username = (user as any)?.username;
    if (!username) return;
    const url = webProfileUrl(username);
    try {
      await Share.share({ message: url, url });
    } catch {
      // Feuille de partage annulée — rien à signaler.
    }
  }, [user]);

  const handleLogout = useCallback(() => {
    confirmAsync({
      title: 'Déconnexion',
      message: 'Tu devras ressaisir tes identifiants pour revenir sur ce compte.',
      confirmLabel: 'Se déconnecter',
      destructive: true,
    }).then((ok) => {
      // Pas de navigation manuelle : `AppNavigator` bascule déjà tout seul sur
      // `isAuthenticated`. L'appeler ici en plus courait la course contre ce
      // re-rendu et produisait « NAVIGATE Intro not handled ».
      if (ok) (async () => { await logout(); })();
    });
  }, [logout]);

  /**
   * Le menu « ⋯ ». Il ramasse tout ce qui traînait en tant que bouton posé
   * dans la page : le partage, les signets (qui occupaient une pastille sur
   * la bannière) et la déconnexion (qui coupait le flux de lecture en deux).
   * Trois destinations rares, joignables depuis n'importe quel point du
   * défilement au lieu du seul haut de page.
   */
  const handleMore = useCallback(() => {
    showActionSheet({
      items: [
        { label: 'Partager mon profil', icon: 'share-outline', onPress: handleShare },
        { label: 'Signets', icon: 'bookmark-outline', onPress: () => navigation.navigate('Bookmarks') },
        { label: 'Se déconnecter', icon: 'log-out-outline', destructive: true, onPress: handleLogout },
      ],
    });
  }, [handleShare, handleLogout, navigation]);

  /**
   * Onglets collants. La rangée mesure sa propre position dans l'en-tête, et
   * un clone se pose sous la barre haute dès que l'originale la traverse.
   *
   * `stickyHeaderIndices` ne pouvait pas servir : sur une `FlatList`, l'index
   * 0 est l'en-tête ENTIER, donc coller les onglets aurait collé aussi la
   * bannière, l'avatar et la bio.
   *
   * Le franchissement est comparé sur le thread UI et ne repasse par React
   * qu'aux DEUX instants où l'état change — pas à chaque image.
   */
  const tabsY = useSharedValue(0);
  const [tabsPinned, setTabsPinned] = useState(false);
  const barHeight = insets.top + HEADER_CONTENT_HEIGHT;

  const onTabsLayout = useCallback((e: any) => {
    tabsY.value = e.nativeEvent.layout.y;
  }, [tabsY]);

  useAnimatedReaction(
    () => tabsY.value > 0 && scrollY.value >= tabsY.value - barHeight,
    (pinned, previous) => {
      if (pinned !== previous) scheduleOnRN(setTabsPinned, pinned);
    },
    [barHeight],
  );

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

  const subTier = effectiveSubscriptionTier(!!user.premium, user.subscription_tier);
  /** Taille des pastilles, accordée au corps réel du pseudo. */
  const badgeSize = nameBadgeSize(visibleCustomization, 25);

  const upsell = subTier === 'ultra' ? null : subTier === 'pro'
    ? { title: 'Passer à Ultra', sub: 'Réservé aux gros créateurs · 300 NF' }
    : subTier === 'plus'
      ? { title: 'Passer à Pro', sub: "Parures d'avatar, thèmes de profil et titre" }
      : { title: 'Découvrir Plus, Pro et Ultra', sub: 'Premium Pro · 15 € en NF · 5 jours' };

  const empty = EMPTY_COPY[activeTab];

  return (
    <ScreenBackground>
      <View style={S.safeArea}>
        <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
        <EventBanner />

        {/*
          Le contenu de l'onglet est virtualisé : l'écran montait jusqu'à
          cinquante `TweetCard` avant la première frame. Tout ce qui précède
          les posts devient l'en-tête de la liste, et garde exactement sa
          place et son défilement.

          `removeClippedSubviews` reste à `false` : le hero et les parures
          premium débordent en `position: absolute`, et le clipping les ferait
          disparaître.
        */}
        <View style={S.stage}>
        <View style={S.listWrap}>
          {Platform.OS === 'ios' && <PullRefreshLogo key={logoKey} pull={pull} active={refreshing} />}
          <ReanimatedView.FlatList
            ref={listRef}
            style={S.scroll}
            contentContainerStyle={S.content}
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
                <ProfileIdentity
                  displayName={user.full_name}
                  username={user.username}
                  avatarUri={user.avatar as any}
                  bannerUri={user.banner as any}
                  bio={user.bio}
                  city={user.city}
                  createdAt={user.created_at}
                  verified={!!user.verified}
                  verificationStyle={user.verification_style}
                  premium={!!user.premium}
                  tier={subTier as any}
                  subscriptionExpiresAt={user.subscription_expires_at}
                  isPrivate={!!user.is_private_account}
                  isLive={isLive}
                  isUploading={isUploading}
                  followers={Number(user.stats?.followers || 0)}
                  following={Number(user.stats?.following || 0)}
                  posts={Number(user.stats?.tweets || 0)}
                  customization={visibleCustomization}
                  accent={profileAccent}
                  secondary={profileSecondary}
                  themed={themed}
                  hasAvatarDecoration={hasAvatarDecoration}
                  hasStories={hasStories}
                  badgeTint={certifPalette.from}
                  badgeSize={badgeSize}
                  entrance={entrance}
                  playEntrance={premiumProfile}
                  scrollY={scrollY}
                  bannerHeight={bannerHeight}
                  onBannerParentLayout={onBannerParentLayout}
                  // Comportement Instagram : l'avatar ouvre la story quand il y
                  // en a une, l'appui long change toujours la photo.
                  onPressAvatar={hasStories ? () => setStoryViewerVisible(true) : handleChangeAvatar}
                  onLongPressAvatar={handleChangeAvatar}
                  onPressHandle={() => navigation.navigate('AccountManager')}
                  onPressFollowers={() => navigation.navigate('UserConnections', {
                    userId: user.id, username: user.username, initialTab: 'followers',
                  })}
                  onPressFollowing={() => navigation.navigate('UserConnections', {
                    userId: user.id, username: user.username, initialTab: 'following',
                  })}
                  actions={
                    <View style={S.actionRow}>
                      <Tappable
                        style={S.actionBtn}
                        onPress={() => navigation.navigate('EditProfile')}
                        scaleTo={0.98}
                        accessibilityRole="button"
                      >
                        <Text style={S.actionLabel}>Modifier le profil</Text>
                      </Tappable>
                      {/*
                        Promue depuis une pastille de 34 px : c'est la surface
                        payante de l'écran, et le seul chemin vers elle dans
                        toute l'app.
                      */}
                      <Tappable
                        style={S.actionBtn}
                        onPress={() => navigation.navigate('ProfileCustomization')}
                        scaleTo={0.98}
                        accessibilityRole="button"
                      >
                        <Text style={S.actionLabel}>Personnaliser</Text>
                      </Tappable>
                      <Tappable
                        style={S.actionIcon}
                        onPress={handleShare}
                        scaleTo={0.94}
                        accessibilityRole="button"
                        accessibilityLabel="Partager mon profil"
                      >
                        <Ionicons name="share-outline" size={19} color={colors.textPrimary} />
                      </Tappable>
                    </View>
                  }
                  footer={
                    <>
                      {!!user.is_private_account && (
                        <Tappable
                          style={S.rowLink}
                          onPress={() => navigation.navigate('FollowRequests')}
                          scaleTo={0.98}
                          accessibilityRole="button"
                        >
                          <Ionicons name="person-add-outline" size={18} color={colors.textSecondary} />
                          <Text style={S.rowLinkTitle}>Demandes d&apos;abonnement</Text>
                          {pendingFollowRequests > 0 && (
                            <View style={S.rowCount}>
                              <Text style={S.rowCountText}>
                                {pendingFollowRequests > 99 ? '99+' : pendingFollowRequests}
                              </Text>
                            </View>
                          )}
                          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                        </Tappable>
                      )}

                      {/*
                        L'offre payante, remontée du PIED DE LISTE — où elle
                        était posée après cinquante posts, donc jamais vue —
                        jusque sous les actions. Une ligne entre deux filets,
                        pas une carte teintée : l'or ne sert qu'au losange
                        parce que cet écran mène à un achat en NF.
                      */}
                      {!!upsell && (
                        <Tappable
                          style={S.offer}
                          onPress={() => navigation.navigate('Subscription')}
                          scaleTo={0.98}
                          accessibilityRole="button"
                        >
                          <Ionicons name="diamond" size={17} color={colors.gold} />
                          <View style={S.offerText}>
                            <Text style={S.offerTitle}>{upsell.title}</Text>
                            <Text style={S.offerSub} numberOfLines={1}>{upsell.sub}</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                        </Tappable>
                      )}
                    </>
                  }
                />

                {/* Rétrospective annuelle — sous le drapeau `profil.retrospective`. */}
                <RetrospectiveBanner username={user?.username} avatar={user?.avatar as any} />
                <BanAlertBanner />
                <View style={S.adminSlot}><ModerationButton /></View>

                <ProfileStories userId={user?.id} isOwner currentUserId={user?.id} />

                <View onLayout={onTabsLayout}>
                  <ProfileTabs<TabKey>
                    tabs={TABS}
                    active={activeTab}
                    onChange={setActiveTab}
                    accent={themed ? profileAccent : undefined}
                  />
                </View>
              </>
            }
            ListEmptyComponent={
              tabLoading ? (
                <View style={S.loadingSlot}>
                  <ActivityIndicator size="small" color={colors.accent} />
                </View>
              ) : tabError ? (
                <ErrorState
                  title="Impossible de charger tes posts"
                  detail="Vérifie ta connexion, puis réessaie."
                  retryLabel="Réessayer"
                  onRetry={() => loadProfileTweets(true)}
                />
              ) : (
                <EmptyState icon={empty.icon} title={empty.title} message={empty.message} />
              )
            }
            ListFooterComponent={
              <View style={S.footerSlot}><GAuthLinkRewardCard /></View>
            }
          />
        </View>

        <ProfileTopBar
          scrollY={scrollY}
          bannerHeight={bannerHeight}
          topInset={insets.top}
          name={user.full_name}
          subtitle={`${formatCount(user.stats?.tweets)} posts`}
          verified={!!user.verified}
          verificationStyle={user.verification_style}
          avatarUri={user.avatar as any}
          username={user.username}
          onOpenSettings={() => navigation.navigate('Settings', { returnTo: 'ProfileScreen' })}
          onOpenMore={handleMore}
        />

        {tabsPinned && (
          <View style={[S.tabsPinned, { top: barHeight }]}>
            <ProfileTabs<TabKey>
              tabs={TABS}
              active={activeTab}
              onChange={setActiveTab}
              accent={themed ? profileAccent : undefined}
            />
          </View>
        )}

        </View>

        <StoryViewer
          visible={storyViewerVisible}
          groups={[myStories]}
          initialGroupIndex={0}
          currentUserId={user?.id}
          onClose={() => setStoryViewerVisible(false)}
          onStoryDeleted={reloadMyStories}
        />
      </View>
    </ScreenBackground>
  );
};

const S = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: 'transparent' },
  /** Cadre de reference de la barre haute et des onglets collants. */
  stage: { flex: 1, position: 'relative' },
  listWrap: { flex: 1 },
  scroll: { flex: 1, backgroundColor: 'transparent' },
  // La tab bar du bas est en `position: absolute` (83 iOS / 85 Android) et
  // recouvre la fin de la liste : sans cette réserve, le dernier post est
  // coupé en deux.
  content: { paddingBottom: 96 },

  // ── Actions ───────────────────────────────────────────────────────────
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  /**
   * Un seul traitement, neutre et plein, pour les deux destinations. Aucune
   * n'est « l'action » de l'écran — modifier son profil et l'habiller sont
   * deux chemins de même rang — et l'accent reste donc disponible pour ce
   * qui, ailleurs, en a vraiment besoin.
   */
  actionBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontFamily: fonts.bold,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.1,
    color: colors.textPrimary,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Lignes de pied d'identité ─────────────────────────────────────────
  rowLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    marginTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
    paddingTop: 14,
  },
  rowLinkTitle: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 15,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  rowCount: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCountText: { fontFamily: fonts.bold, fontSize: 12, color: colors.onAccent },

  offer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    marginTop: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  offerText: { flex: 1, minWidth: 0 },
  offerTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.1,
    color: colors.textPrimary,
  },
  offerSub: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 19,
    letterSpacing: 0.1,
    color: colors.textMuted,
    marginTop: 1,
  },

  adminSlot: { paddingHorizontal: 16, marginTop: 16 },
  footerSlot: { marginHorizontal: 16, marginTop: 16 },
  loadingSlot: { paddingVertical: 56, alignItems: 'center' },

  /**
   * Le clone collant. Fond PLEIN et non flouté : la barre haute au-dessus
   * porte déjà le matériau, et empiler deux verres l'un sur l'autre est
   * précisément ce qu'il ne faut pas faire — plus rien ne se détache.
   */
  tabsPinned: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 25,
    backgroundColor: colors.bg,
  },
});

export default ProfileScreen;
