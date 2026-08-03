import { colors, fonts, glow, withAlpha } from '../theme';
import { BackButton } from '../components/ui';
import { useHeaderMetrics } from '../hooks/useHeaderMetrics';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Animated,
  Easing,
  SafeAreaView,
  Platform,
  RefreshControl,
  Alert,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { apiService } from '../services';
import { useAuth } from '../contexts/AuthContext';
import { Tweet } from '../types/api';
import Avatar from '../components/Avatar';
import TweetCard from '../components/TweetCard';
import ModerationActions from '../components/ModerationActions';
import { useKosporBirthdayEvent } from '../hooks/useKosporBirthdayEvent';
import challengeProgressService from '../services/challengeProgressService';
import VerifiedBadge from '../components/VerifiedBadge';
import PremiumBadge from '../components/PremiumBadge';
import IosNativeBadge from '../components/IosNativeBadge';
import { formatCompactCount } from '../utils/format';
import { effectiveSubscriptionTier } from '../utils/subscriptionTier';
import { useProfileBannerHeight } from '../hooks/useProfileBannerHeight';
import PremiumDisplayName from '../components/PremiumDisplayName';
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
import {
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

const PROFILE_BODY_BG = colors.bg;

const AVATAR_SIZE = 84;
const AVATAR_BORDER = 4;
const AVATAR_OUTER = AVATAR_SIZE + AVATAR_BORDER * 2;
const AVATAR_ROW_OVERLAP = Math.round(AVATAR_OUTER * 0.58);

interface UserProfile {
  id: string;
  username: string;
  full_name: string;
  avatar?: string;
  banner?: string | null;
  bio?: string | null;
  verified: boolean;
  is_ios_native?: boolean;
  premium: boolean;
  subscription_tier?: 'free' | 'plus' | 'pro';
  verification_style?: 'default' | 'rose' | 'gray' | 'gold';
  is_private_account?: boolean;
  profile_customization?: ProfileCustomization;
  stats: {
    followers: number;
    following: number;
    tweets: number;
    likes: number;
  };
  created_at: string;
  last_activity: string;
}

interface RouteParams {
  userId?: string;
  username?: string;
}

export default function UserProfileScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { top: headerTopInset } = useHeaderMetrics();
  const { user: currentUser, isAuthenticated } = useAuth();
  const { isEventActive } = useKosporBirthdayEvent();
  const { bannerHeight, onBannerParentLayout } = useProfileBannerHeight();

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followStatus, setFollowStatus] = useState<'active' | 'pending' | null>(null);
  const [followLoading, setFollowLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'tweets' | 'replies' | 'media' | 'likes'>('tweets');
  const [likedTweets, setLikedTweets] = useState<{ [key: string]: boolean }>({});
  const [retweetedTweets, setRetweetedTweets] = useState<{ [key: string]: boolean }>({});
  const [tabLoading, setTabLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const [isLive, setIsLive] = useState(false);
  const [pulseAnim] = useState(new Animated.Value(1));

  // Stories du profil consulté : anneau sur l'avatar + rail sous les infos.
  const { group: profileStories, reload: reloadProfileStories, hasStories } = useProfileStories(userProfile?.id);
  const [storyViewerVisible, setStoryViewerVisible] = useState(false);

  // Personnalisation premium du profil consulté (renvoyée par l'API).
  const customization = userProfile?.profile_customization;
  const themed = profileThemeOf(customization) !== 'none';
  const [profileAccent, profileSecondary] = decorationColors(customization);
  const hasAvatarDecoration = (customization?.avatar_decoration || 'none') !== 'none';
  /** Accorde la pastille de certif au profil habillé — même source que le nom. */
  const certifPalette = certifiedNameColors(userProfile?.verification_style, customization);
  const badgeTint = certifPalette.from;
  /**
   * Taille des pastilles, accordée au corps réel du pseudo affiché. Même
   * formule que sur son propre profil : c'est le MÊME nom, il n'a aucune
   * raison d'être flanqué de pastilles différentes selon qui le regarde.
   */
  const visitedBadgeSize = nameBadgeSize(customization, S.fullName.fontSize);
  /**
   * Un profil habillé a droit à une entrée en scène. La condition porte sur
   * `userProfile` et pas sur un état de chargement : tant que la réponse n'est
   * pas là on affiche un chargeur, donc le premier rendu du hero est aussi le
   * premier instant où l'on sait si le profil est premium — la chorégraphie
   * part exactement à ce moment, jamais sur un profil encore nu.
   */
  const premiumProfile = !!userProfile && isPremiumProfile(customization);
  const entrance = useProfileEntrance(premiumProfile);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const followButtonAnim = useRef(new Animated.Value(1)).current;

  // 📡 Vérifier le statut Live
  useEffect(() => {
    if (!userProfile?.id) return;

    const checkLiveStatus = async () => {
      try {
        const { liveService } = require('../services/liveService');
        const lives = await liveService.getLives();
        const userLive = lives.find((l: any) => l.hostId === userProfile.id);
        setIsLive(!!userLive);
      } catch (e) {
        console.error('[UserProfile] Error checking live status:', e);
      }
    };

    checkLiveStatus();
    const timer = setInterval(checkLiveStatus, 20000);
    return () => clearInterval(timer);
  }, [userProfile?.id]);

  // Animation Pulse LIVE
  useEffect(() => {
    if (isLive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.1, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [isLive]);

  const params = route.params as RouteParams;
  const userId = params?.userId;
  const username = params?.username;

  const isKosporProfile = username === 'g' || userProfile?.username === 'g';
  const showBirthdayButton = isEventActive && isKosporProfile;

  useEffect(() => {
    if (userId || username) {
      fetchUserProfile();
      if (userId) fetchUserTweets();
    }
  }, [userId, username, isAuthenticated]);

  // Recharger tweets sur changement d'onglet
  useEffect(() => {
    const run = async () => {
      const resolvedUserId = userId || userProfile?.id;
      if (resolvedUserId) {
        setTabLoading(true);
        scrollRef.current?.scrollTo({ y: 0, animated: false });
        await fetchUserTweets();
        setTabLoading(false);
      }
    };
    run();
  }, [activeTab]);

  /**
   * Fondu global du corps de page — l'arrivée « sobre » d'un profil ordinaire.
   *
   * ⚠ Coupé net sur un profil premium : une opacité qui monte sur TOUT le bloc
   * écrase la cascade qui se joue à l'intérieur (chaque ligne y arrive à son
   * tour). Les deux ensemble ne donnaient pas deux animations mais une seule,
   * la plus grossière des deux.
   */
  useEffect(() => {
    if (!userProfile?.id) return;
    if (premiumProfile) { fadeAnim.setValue(1); return; }
    fadeAnim.setValue(0);
    const animation = Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 900,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [fadeAnim, userProfile?.id, premiumProfile]);

  const fetchUserProfile = async () => {
    if (!userId && !username) return;
    try {
      setLoading(true);
      setError(null);
      let response;
      if (userId) {
        response = await apiService.getUserProfile(userId);
      } else if (username) {
        response = await apiService.getUserProfileByUsername(username);
      }
      if (response?.success && response.data) {
        setUserProfile(response.data.user);
        if (username && !userId) await fetchTweetsAfterProfile(response.data.user.id);
        if (isAuthenticated && currentUser?.id !== response.data.user.id) {
          await checkFollowStatus(response.data.user.id);
        }
      } else {
        setError(response?.message || 'Erreur lors du chargement du profil');
      }
    } catch (err) {
      console.error('Erreur lors du chargement du profil:', err);
      setError('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  const fetchUserTweets = async () => {
    const resolvedUserId = userId || userProfile?.id;
    if (!resolvedUserId) return;
    try {
      const response = await apiService.getUserTweets(resolvedUserId, { limit: 20, type: activeTab });
      if (response.success && response.data) setTweets(response.data.tweets);
    } catch (err) {
      console.error('Erreur lors du chargement des tweets:', err);
    }
  };

  const fetchTweetsAfterProfile = async (targetUserId: string) => {
    try {
      const response = await apiService.getUserTweets(targetUserId, { limit: 20, type: activeTab });
      if (response.success && response.data) setTweets(response.data.tweets);
    } catch (err) {
      console.error('Erreur lors du chargement des tweets:', err);
    }
  };

  useEffect(() => {
    if (!tweets || tweets.length === 0) return;
    const initialLikes: { [key: string]: boolean } = {};
    const initialRetweets: { [key: string]: boolean } = {};
    tweets.forEach((t) => {
      initialLikes[t.id] = (t as any)?.user_interaction?.is_liked || false;
      initialRetweets[t.id] = (t as any)?.user_interaction?.is_retweeted || false;
    });
    setLikedTweets((prev) => ({ ...prev, ...initialLikes }));
    setRetweetedTweets((prev) => ({ ...prev, ...initialRetweets }));
  }, [tweets]);

  const handleLike = async (tweetId: string) => {
    try {
      const wasLiked = likedTweets[tweetId] || false;
      setLikedTweets((prev) => ({ ...prev, [tweetId]: !wasLiked }));
      setTweets((prev) => prev.map((t) => {
        if (t.id !== tweetId) return t;
        const newLikes = wasLiked ? Math.max(0, (t.stats?.likes || 0) - 1) : (t.stats?.likes || 0) + 1;
        return { ...t, stats: { ...(t.stats || {}), likes: newLikes }, user_interaction: { ...(t as any).user_interaction, is_liked: !wasLiked } } as Tweet;
      }));
      const response = await apiService.likeTweet(tweetId);
      if (!response?.success) {
        setLikedTweets((prev) => ({ ...prev, [tweetId]: wasLiked }));
        setTweets((prev) => prev.map((t) => {
          if (t.id !== tweetId) return t;
          return { ...t, stats: { ...(t.stats || {}), likes: wasLiked ? (t.stats?.likes || 0) : Math.max(0, (t.stats?.likes || 0) - 1) }, user_interaction: { ...(t as any).user_interaction, is_liked: wasLiked } } as Tweet;
        }));
      } else if (activeTab === 'likes' && wasLiked) {
        setTweets((prev) => prev.filter((t) => t.id !== tweetId));
      }
    } catch (error) {
      const wasLiked = likedTweets[tweetId] || false;
      setLikedTweets((prev) => ({ ...prev, [tweetId]: wasLiked }));
    }
  };

  const handleRetweet = async (tweetId: string) => {
    try {
      const wasRetweeted = retweetedTweets[tweetId] || false;
      setRetweetedTweets((prev) => ({ ...prev, [tweetId]: !wasRetweeted }));
      setTweets((prev) => prev.map((t) => {
        if (t.id !== tweetId) return t;
        const newRetweets = wasRetweeted ? Math.max(0, (t.stats?.retweets || 0) - 1) : (t.stats?.retweets || 0) + 1;
        return { ...t, stats: { ...(t.stats || {}), retweets: newRetweets }, user_interaction: { ...(t as any).user_interaction, is_retweeted: !wasRetweeted } } as Tweet;
      }));
      const response = await apiService.retweet(tweetId);
      if (!response?.success) {
        setRetweetedTweets((prev) => ({ ...prev, [tweetId]: wasRetweeted }));
      }
    } catch (error) {
      const wasRetweeted = retweetedTweets[tweetId] || false;
      setRetweetedTweets((prev) => ({ ...prev, [tweetId]: wasRetweeted }));
    }
  };

  const handleReply = (tweetId: string) => {
    (navigation as any).navigate('CreateTweet' as never, { replyTo: tweetId, isReply: true } as never);
  };

  const handleShare = (tweetId: string) => { };

  const handleDeleteTweet = (tweetId: string) => {
    setTweets((current) => current.filter((tweet) => tweet.id !== tweetId));
  };

  const handleBookmark = (tweetId: string) => {
    // 📌 Bookmark
    console.log('Bookmark:', tweetId);
    Alert.alert('Succès', 'Tweet ajouté aux favoris');
  };

  const handleSkip = (tweetId: string) => {
    // ⏭️ Skip
    console.log('Skip:', tweetId);
    Alert.alert('Tweet ignoré', 'Ce tweet n\'apparaîtra plus');
  };

  const handleBlock = (userId: string) => {
    // 🚫 Block
    console.log('Block:', userId);
    Alert.alert('Succès', 'Cet utilisateur a été bloqué');
  };

  const checkFollowStatus = async (targetUserId?: string) => {
    const userIdToCheck = targetUserId || userId || userProfile?.id;
    if (!userIdToCheck) return;
    try {
      const response = await apiService.getFollowStatus(userIdToCheck);
      if (response.success && response.data) {
        setIsFollowing(response.data.isFollowing);
        setFollowStatus(response.data.status);
      }
    } catch (err) {
      console.error('Erreur lors de la vérification du statut de suivi:', err);
    }
  };

  const handleFollow = async () => {
    if (!isAuthenticated) {
      Alert.alert('Connexion requise', 'Vous devez être connecté pour suivre des utilisateurs', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Se connecter', onPress: () => navigation.navigate('Login' as never) }
      ]);
      return;
    }
    const targetUserId = userId || userProfile?.id;
    if (!targetUserId) {
      Alert.alert('Erreur', 'ID utilisateur manquant');
      return;
    }
    try {
      setFollowLoading(true);
      if (followStatus === 'active' || followStatus === 'pending') {
        // Se désabonner (actif) ou annuler la demande envoyée (en attente) : même endpoint.
        const wasActive = followStatus === 'active';
        const response = await apiService.unfollowUser(targetUserId);
        if (response.success) {
          setIsFollowing(false);
          setFollowStatus(null);
          if (wasActive) {
            setUserProfile(prev => prev ? { ...prev, stats: { ...prev.stats, followers: prev.stats.followers - 1 } } : null);
          }
          Animated.sequence([
            Animated.timing(followButtonAnim, { toValue: 0.85, duration: 80, useNativeDriver: true }),
            Animated.timing(followButtonAnim, { toValue: 1, duration: 80, useNativeDriver: true })
          ]).start();
        }
      } else {
        const response = await apiService.followUser(targetUserId);
        if (response.success) {
          const newStatus = (response.data as any)?.status === 'pending' ? 'pending' : 'active';
          setFollowStatus(newStatus);
          setIsFollowing(newStatus === 'active');
          if (newStatus === 'active') {
            setUserProfile(prev => prev ? { ...prev, stats: { ...prev.stats, followers: prev.stats.followers + 1 } } : null);
          }
          Animated.sequence([
            Animated.timing(followButtonAnim, { toValue: 1.15, duration: 80, useNativeDriver: true }),
            Animated.timing(followButtonAnim, { toValue: 1, duration: 80, useNativeDriver: true })
          ]).start();
        }
      }
    } catch (err) {
      Alert.alert('Erreur', 'Impossible de modifier le statut de suivi');
    } finally {
      setFollowLoading(false);
    }
  };

  const handleWishHappyBirthday = async () => {
    try {
      await challengeProgressService.completeBirthdayWishChallenge(currentUser?.id || '');
      Alert.alert('🎂 Bon Anniversaire Kospor ! 🎂', 'Merci pour ce beau message ! Défi complété !', [{ text: 'De rien !' }]);
    } catch (error) {
      Alert.alert('🎂 Bon Anniversaire Kospor ! 🎂', 'Merci pour ce beau message d\'anniversaire !', [{ text: 'De rien !' }]);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchUserProfile();
    const resolvedUserId = userId || userProfile?.id;
    if (resolvedUserId) await fetchUserTweets();
    setRefreshing(false);
  };

  const handleTabChange = (tab: 'tweets' | 'replies' | 'media' | 'likes') => setActiveTab(tab);

  // ── LOADING STATE ──
  if (loading && !userProfile) {
    return (
      <SafeAreaView style={S.container}>
        <StatusBar barStyle="light-content" backgroundColor={PROFILE_BODY_BG} />
        <View style={S.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  // ── ERROR STATE ──
  if (error || !userProfile) {
    return (
      <SafeAreaView style={S.container}>
        <StatusBar barStyle="light-content" backgroundColor={PROFILE_BODY_BG} />
        <View style={S.errorContainer}>
          <Ionicons name="alert-circle" size={52} color={colors.red} />
          <Text style={S.errorTitle}>Erreur</Text>
          <Text style={S.errorText}>{error || 'Profil non trouvé'}</Text>
          <TouchableOpacity style={S.retryButton} onPress={fetchUserProfile}>
            <Text style={S.retryButtonText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isOwnProfile = !!(currentUser?.id && userProfile && currentUser.id === userProfile.id);

  const premiumTier = userProfile.premium
    ? effectiveSubscriptionTier(true, userProfile.subscription_tier)
    : 'free';

  return (
    <View style={S.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* ── STICKY HEADER ── */}
      <View style={[S.stickyHeader, { paddingTop: headerTopInset }]}>
        <BackButton navigation={navigation} />
        <View style={S.headerCenter}>
          <View style={S.headerTitleRow}>
            <Text style={S.headerName} numberOfLines={1}>{userProfile.full_name}</Text>
            {userProfile.verified && (
              <VerifiedBadge verificationStyle={userProfile.verification_style} size={15} animated={true} />
            )}
          </View>
          <Text style={S.headerCount}>{formatCompactCount(userProfile.stats.tweets)} posts</Text>
        </View>
      </View>

      {/* ── SCROLLABLE BODY ── */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1, backgroundColor: 'transparent' }}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        bounces={!refreshing}
        removeClippedSubviews={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        <Animated.View
          style={{
            opacity: fadeAnim,
            width: '100%',
            transform: [
              {
                translateY: fadeAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [8, 0],
                }),
              },
            ],
          }}
        >

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
              customization={customization}
              bannerHeight={bannerHeight}
              style={premiumProfile ? entrance.theme : undefined}
            />

            <View style={{ width: '100%' }} onLayout={onBannerParentLayout}>
              <Animated.View
                style={[S.bannerWrap, { height: bannerHeight }, themed && S.bannerWrapThemed, entrance.banner]}
              >
                {userProfile.banner ? (
                  <ProfileBannerImage uri={userProfile.banner} themed={themed} />
                ) : (
                  !themed && <View style={S.bannerPlaceholder} />
                )}
              </Animated.View>
            </View>

            <View style={[S.avatarEditRow, { marginTop: -AVATAR_ROW_OVERLAP }]}>
              <Animated.View style={entrance.avatar}>
              <TouchableOpacity
                activeOpacity={0.85}
                style={S.avatarTouchable}
                onPress={hasStories ? () => setStoryViewerVisible(true) : undefined}
              >
                {/* Le halo d'atterrissage, derrière l'avatar : décor éphémère,
                    démonté dès la fin de la scène. */}
                <ProfileEntranceHalo
                  size={AVATAR_SIZE + AVATAR_BORDER * 2}
                  customization={customization}
                  active={entrance.staging}
                />
                {hasStories && !isLive && !hasAvatarDecoration && (
                  <LinearGradient
                    colors={STORY_GRADIENT as unknown as [string, string, ...string[]]}
                    start={{ x: 0.85, y: 0.05 }}
                    end={{ x: 0.15, y: 0.95 }}
                    style={S.avatarStoryRing}
                    pointerEvents="none"
                  />
                )}
                {!isLive && (
                  <AvatarDecorationLayer customization={customization} size={AVATAR_SIZE + AVATAR_BORDER * 2} />
                )}
                {isLive ? (
                  <View style={S.liveRingContainer}>
                    <LinearGradient
                      colors={[colors.accent, colors.gold]}
                      style={[S.liveRing, { width: 90, height: 90, borderRadius: 45 }]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    />
                    <View style={[S.avatarInner, { width: 90, height: 90, borderRadius: 45 }]}>
                      <Avatar size={84} username={userProfile.username || 'U'} uri={userProfile.avatar as any} />
                    </View>
                    <Animated.View style={[S.liveBadge, { transform: [{ scale: pulseAnim }] }]}>
                      <Text style={S.liveBadgeText}>LIVE</Text>
                    </Animated.View>
                  </View>
                ) : hasAvatarDecoration ? (
                  <LinearGradient
                    colors={[profileAccent, profileSecondary] as [string, string]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={S.avatarRing}
                  >
                    <Avatar
                      size={AVATAR_SIZE}
                      username={userProfile.username || 'U'}
                      uri={userProfile.avatar as any}
                    />
                  </LinearGradient>
                ) : (
                  <View style={S.avatarRing}>
                    <Avatar
                      size={AVATAR_SIZE}
                      username={userProfile.username || 'U'}
                      uri={userProfile.avatar as any}
                    />
                  </View>
                )}
                {/* Après l'avatar : l'ornement doit passer devant lui. */}
                {!isLive && (
                  <AvatarDecorationOrnament
                    customization={customization}
                    size={AVATAR_SIZE + AVATAR_BORDER * 2}
                  />
                )}
              </TouchableOpacity>
              </Animated.View>

              <Animated.View style={[S.headerActions, entrance.action]}>
                {isLive && (
                  <TouchableOpacity
                    style={S.liveBtnHeader}
                    onPress={() => {
                      const { liveService } = require('../services/liveService');
                      liveService.getLives().then((lives: any[]) => {
                        const userLive = lives.find((l: any) => l.hostId === userProfile.id);
                        if (userLive) {
                          (navigation as any).navigate('LiveViewer', {
                            liveId: userLive.liveId,
                            playbackUrl: userLive.metadata?.playbackUrl,
                            hostName: userLive.metadata?.hostName || userProfile.username,
                            hostAvatar: userLive.metadata?.hostAvatar || userProfile.avatar,
                            verified: userProfile.verified,
                            verificationStyle: userProfile.verification_style,
                          });
                        }
                      });
                    }}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="videocam" size={15} color={colors.white} />
                  </TouchableOpacity>
                )}
                {!isOwnProfile && (
                  <Animated.View style={{ transform: [{ scale: followButtonAnim }], flex: 1, maxWidth: '62%' }}>
                    <TouchableOpacity
                      style={[
                        S.followHeaderBtn,
                        followStatus && S.followHeaderBtnOutline,
                        themed && {
                          shadowColor: profileAccent,
                          shadowOpacity: 0.38,
                          shadowRadius: 20,
                          shadowOffset: { width: 0, height: 6 },
                          elevation: 8,
                        },
                        themed && !followStatus && {
                          borderWidth: 1,
                          borderColor: '#eff3f4',
                          backgroundColor: '#eff3f4',
                        },
                        themed && followStatus && {
                          borderColor: withAlpha(profileAccent, 0.55),
                          backgroundColor: withAlpha(profileAccent, 0.16),
                        },
                      ]}
                      onPress={handleFollow}
                      disabled={followLoading}
                      activeOpacity={0.85}
                    >
                      {followLoading ? (
                        <ActivityIndicator size="small" color={followStatus ? colors.textSecondary : colors.white} />
                      ) : (
                        <Text
                          style={[
                            S.followHeaderBtnText,
                            themed && !followStatus && { color: '#0b0c0f' },
                            followStatus && { color: colors.textPrimary },
                          ]}
                        >
                          {followStatus === 'active' ? 'Se désabonner' : followStatus === 'pending' ? 'Demandé' : "S'abonner"}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </Animated.View>
                )}
              </Animated.View>
            </View>

            <View style={[S.profileOverBanner, { marginTop: 8 }]}>
              <View style={S.userInfo}>
                <Animated.View style={[S.nameRow, entrance.name]}>
                  <View style={{ flexShrink: 1, minWidth: 0, marginRight: 6, overflow: 'visible' }}>
                    <PremiumDisplayName
                      text={userProfile.full_name}
                      baseStyle={{ ...S.fullName, fontSize: S.fullName.fontSize * nameSizeScale(customization) }}
                      isPremium={!!userProfile.premium}
                      subscriptionTierRaw={userProfile.subscription_tier}
                      fontId="system"
                      effectId="none"
                      customization={customization}
                      verified={!!userProfile.verified}
                      verificationStyle={userProfile.verification_style}
                    />
                  </View>
                  {userProfile.verified && (
                    <View style={{ marginLeft: 5 }}>
                      <VerifiedBadge
                        verificationStyle={userProfile.verification_style}
                        size={visitedBadgeSize}
                        animated
                        tint={badgeTint}
                      />
                    </View>
                  )}
                  {userProfile.premium && (
                    <View style={{ marginLeft: 4 }}>
                      {/* Mêmes sources que la pastille ci-dessus : le badge se
                          range derrière la certification au lieu d'imposer une
                          troisième palette sur la ligne du pseudo. */}
                      <PremiumBadge
                        type="small"
                        animated
                        size={visitedBadgeSize}
                        subscriptionTier={premiumTier}
                        tint={userProfile.verified ? certifPalette : null}
                      />
                    </View>
                  )}
                  {userProfile.is_private_account && (
                    <View style={{ marginLeft: 4 }}>
                      <Ionicons name="lock-closed" size={14} color={colors.textSecondary} />
                    </View>
                  )}
                </Animated.View>

                {/* ── La cascade ──
                    Une ligne monte après l'autre, 50 ms d'écart. Les index sont
                    fixes et pas dérivés de l'ordre de rendu : le titre, l'« à
                    propos » et la bio sont facultatifs, et un décalage calculé
                    ferait glisser toute la suite dès qu'un champ manque. */}
                <Animated.View style={[S.handleRow, entrance.line(0)]}>
                  <Text style={[S.handle, { flexShrink: 1 }]} numberOfLines={1}>
                    @{userProfile.username}
                  </Text>
                  <View style={S.badgesInline}>
                    {userProfile.is_ios_native && <IosNativeBadge size={15} />}
                  </View>
                </Animated.View>

                {/* Titre premium : une ligne à soi, sous le pseudo. */}
                <Animated.View style={entrance.line(1)}>
                  <ProfileTitleChip customization={customization} />
                </Animated.View>

                {!!customization?.about_me && (
                  <Animated.View
                    style={[
                      S.aboutBlock,
                      {
                        borderLeftColor: profileAccent,
                        backgroundColor: withAlpha(profileAccent, 0.14),
                      },
                      entrance.line(2),
                    ]}
                  >
                    <Text style={S.aboutLabel}>À PROPOS</Text>
                    <Text style={S.aboutText}>{customization.about_me}</Text>
                  </Animated.View>
                )}
                {!!userProfile.bio?.trim?.() && (
                  <Animated.Text style={[S.bio, entrance.line(3)]}>
                    {String(userProfile.bio).trim()}
                  </Animated.Text>
                )}

                {userProfile.created_at ? (
                  <Animated.View style={[S.metaRow, entrance.line(4)]}>
                    <View style={S.metaItem}>
                      <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
                      <Text style={S.metaText}>
                        {' '}A rejoint TwitNinf en{' '}
                        {new Date(userProfile.created_at).toLocaleDateString('fr-FR', {
                          year: 'numeric',
                          month: 'long',
                        })}
                      </Text>
                    </View>
                  </Animated.View>
                ) : null}

                <Animated.View style={[S.statsRow, entrance.line(5)]}>
                  <TouchableOpacity style={S.statGroup} activeOpacity={0.7}>
                    <CountUp value={userProfile.stats.tweets} active={entrance.staging} format={formatCompactCount} style={S.statNum} />
                    <Text style={S.statLbl}> Posts</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[S.statGroup, { marginLeft: 16 }]}
                    activeOpacity={0.7}
                    onPress={() => (navigation as any).navigate('UserConnections', {
                      userId: userProfile.id,
                      username: userProfile.username,
                      initialTab: 'following',
                    })}
                  >
                    <CountUp value={userProfile.stats.following} active={entrance.staging} format={formatCompactCount} style={S.statNum} />
                    <Text style={S.statLbl}> Abonnements</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[S.statGroup, { marginLeft: 16 }]}
                    activeOpacity={0.7}
                    onPress={() => (navigation as any).navigate('UserConnections', {
                      userId: userProfile.id,
                      username: userProfile.username,
                      initialTab: 'followers',
                    })}
                  >
                    <CountUp value={userProfile.stats.followers} active={entrance.staging} format={formatCompactCount} style={S.statNum} />
                    <Text style={S.statLbl}> Abonnés</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[S.statGroup, { marginLeft: 16 }]} activeOpacity={0.7}>
                    <CountUp value={userProfile.stats.likes} active={entrance.staging} format={formatCompactCount} style={S.statNum} />
                    <Text style={S.statLbl}> J&apos;aime</Text>
                  </TouchableOpacity>
                </Animated.View>

                {isOwnProfile && (
                  <TouchableOpacity
                    style={S.followRequestsLink}
                    activeOpacity={0.7}
                    onPress={() => navigation.navigate('FollowRequests' as never)}
                  >
                    <Ionicons name="person-add-outline" size={15} color={colors.accent} />
                    <Text style={S.followRequestsLinkText}>Demandes d&apos;abonnement</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          <View style={S.divider} />
          {showBirthdayButton && (
            <TouchableOpacity style={[S.birthdayBtn, { backgroundColor: colors.gold }, glow(colors.gold, 12)]} onPress={handleWishHappyBirthday} activeOpacity={0.85}>
              <View style={S.birthdayGradient}>
                <Ionicons name="gift" size={20} color="#1a1303" />
                <Text style={S.birthdayText}>Souhaiter bon anniversaire</Text>
                <Ionicons name="heart" size={18} color="#1a1303" />
              </View>
            </TouchableOpacity>
          )}

          {/* Moderation */}
          {!isOwnProfile && (
            <View style={{ paddingHorizontal: 16, marginBottom: 6 }}>
              <ModerationActions
                targetType="user"
                targetId={userProfile.id}
                targetData={userProfile}
                onActionComplete={() => { }}
              />
            </View>
          )}

          {/* Stories à la une du profil */}
          <ProfileStories
            userId={userProfile?.id}
            isOwner={String(currentUser?.id || '') === String(userProfile?.id || '')}
            currentUserId={currentUser?.id ? String(currentUser.id) : null}
          />

          <View style={S.divider} />

          {/* Tabs (underline style) */}
          <View
            style={[
              S.tabsBar,
              themed && { borderBottomColor: withAlpha(profileAccent, 0.28) },
            ]}
          >
            {([
              { key: 'tweets', label: 'Posts' },
              { key: 'replies', label: 'Réponses' },
              { key: 'media', label: 'Médias' },
              { key: 'likes', label: "J'aime" },
            ] as const).map((tab) => (
              <TouchableOpacity
                key={tab.key}
                style={[S.tabItem, activeTab === tab.key && S.tabItemActive]}
                onPress={() => handleTabChange(tab.key)}
                activeOpacity={0.85}
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

          {/* Tweet list */}
          <View style={{ paddingBottom: 40 }}>
            {tabLoading && (
              <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={colors.accent} />
              </View>
            )}
            {userProfile.is_private_account && !isOwnProfile && followStatus !== 'active' && !tabLoading ? (
              <View style={S.emptyContainer}>
                <Ionicons name="lock-closed" size={48} color={colors.borderSubtle} />
                <Text style={S.emptyTitle}>Ce compte est privé</Text>
                <Text style={S.emptyText}>
                  Abonnez-vous pour voir les publications de {userProfile.username}
                </Text>
              </View>
            ) : tweets.length === 0 && !tabLoading ? (
              <View style={S.emptyContainer}>
                <Ionicons name="chatbubble-outline" size={48} color={colors.borderSubtle} />
                <Text style={S.emptyTitle}>Aucun contenu</Text>
                <Text style={S.emptyText}>
                  {userProfile.username} n'a pas encore publié de {activeTab}
                </Text>
              </View>
            ) : (
              tweets.map((tweet) => {
                const tweetWithInteractions = {
                  ...tweet,
                  user_interaction: {
                    is_liked: likedTweets[tweet.id] || false,
                    is_retweeted: retweetedTweets[tweet.id] || false,
                  }
                } as Tweet;
                return (
                  <TweetCard
                    key={tweet.id}
                    tweet={tweetWithInteractions}
                    onLike={handleLike}
                    onRetweet={handleRetweet}
                    onReply={handleReply}
                    onShare={handleShare}
                    onDelete={handleDeleteTweet}
                    compact={false}
                  />
                );
              })
            )}
          </View>

        </Animated.View>
      </ScrollView>

      <StoryViewer
        visible={storyViewerVisible}
        groups={[profileStories]}
        initialGroupIndex={0}
        currentUserId={currentUser?.id ? String(currentUser.id) : null}
        onClose={() => setStoryViewerVisible(false)}
        onStoryLiked={reloadProfileStories}
        onStoryDeleted={reloadProfileStories}
      />
    </View>
  );
}

// ── Twitter/X Dark StyleSheet ──────────────────────────────────────────
const S = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    backgroundColor: 'transparent',
    gap: 12,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700', fontFamily: fonts.bold,
    color: colors.textPrimary,
    marginTop: 8,
  },
  errorText: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 7,
    marginTop: 8,
  },
  retryButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700', fontFamily: fonts.bold,
  },

  // Sticky header
  stickyHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
    backgroundColor: 'transparent',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    backgroundColor: 'transparent',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    minWidth: 0,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '100%',
  },
  headerName: {
    fontSize: 19,
    fontWeight: '800', fontFamily: fonts.bold,
    color: colors.textPrimary,
    letterSpacing: -0.4,
    flexShrink: 1,
  },
  headerCount: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 1,
  },

  profileHero: {
    position: 'relative',
    width: '100%',
    overflow: 'visible',
  },
  profileOverBanner: {
    backgroundColor: 'transparent',
    zIndex: 4,
  },
  bannerWrap: {
    width: '100%',
    backgroundColor: colors.surfaceAlt,
    position: 'relative',
    overflow: 'hidden',
  },
  /** Avec un thème, la bande de bannière n'a rien à montrer sans photo :
      c'est le thème lui-même qui occupe le haut du profil. */
  bannerWrapThemed: { backgroundColor: 'transparent' },
  bannerPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.surfaceAlt,
  },

  avatarEditRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    backgroundColor: 'transparent',
    zIndex: 6,
    elevation: 8,
  },
  avatarTouchable: { position: 'relative' },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 2,
    flexShrink: 1,
    justifyContent: 'flex-end',
  },
  liveBtnHeader: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followHeaderBtn: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...glow(colors.accent, 10),
  },
  followHeaderBtnOutline: {
    backgroundColor: colors.surfaceAlt,
    shadowOpacity: 0,
    elevation: 0,
  },
  followHeaderBtnText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 14,
    letterSpacing: -0.1,
  },

  avatarRing: {
    borderRadius: (AVATAR_SIZE + AVATAR_BORDER * 2) / 2,
    padding: AVATAR_BORDER,
    overflow: 'hidden',
    backgroundColor: colors.bg,
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

  /** Anneau dégradé « story » derrière la bordure de l'avatar. */
  avatarStoryRing: {
    position: 'absolute',
    top: -3,
    left: -3,
    right: -3,
    bottom: -3,
    borderRadius: (AVATAR_SIZE + AVATAR_BORDER * 2) / 2 + 3,
  },
  liveRingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  liveRing: {
    position: 'absolute',
    borderWidth: 0,
  },
  avatarInner: {
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  liveBadge: {
    position: 'absolute',
    bottom: -10,
    alignSelf: 'center',
    backgroundColor: colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.bg,
    zIndex: 10,
  },
  liveBadgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '900', fontFamily: fonts.bold,
    letterSpacing: 0.5,
  },

  // Infos (aligné ProfileScreen)
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
    marginBottom: 4,
    textAlign: 'left',
    letterSpacing: -0.6,
  },
  handleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    marginTop: 1,
    marginBottom: 6,
    maxWidth: '100%',
  },
  badgesInline: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 6,
    gap: 5,
    flexShrink: 0,
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
    textAlign: 'left',
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
    color: colors.textMuted,
  },
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  followRequestsLinkText: {
    fontSize: 13,
    fontFamily: fonts.medium,
    color: colors.accent,
  },

  premiumChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.warningMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gold,
    marginBottom: 10,
    gap: 5,
  },
  premiumChipText: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: '700', fontFamily: fonts.bold,
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle,
    marginVertical: 6,
  },

  // Birthday
  birthdayBtn: {
    marginHorizontal: 16,
    marginVertical: 10,
    borderRadius: 20,
    overflow: 'hidden',
  },
  birthdayGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 10,
  },
  birthdayText: {
    color: '#1a1303',
    fontSize: 15,
    fontFamily: fonts.bold,
  },

  // Tabs — même soulignement que le profil PC et le profil personnel.
  tabsBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'transparent',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    position: 'relative',
  },
  tabItemActive: {
    backgroundColor: 'transparent',
  },
  tabLabel: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.textMuted,
    letterSpacing: -0.1,
  },
  tabLabelActive: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
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

  // Empty state
  emptyContainer: {
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 60,
    paddingBottom: 40,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700', fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  emptyText: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});
