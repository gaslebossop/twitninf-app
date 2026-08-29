import { colors, fonts, glow, withAlpha, duration as D, easing as E , statusBarStyle} from '../theme';
import { BackButton, ScreenSkeleton, AppRefreshControl, PullRefreshLogo } from '../components/ui';
import { usePullRefreshLogo } from '../hooks/usePullRefreshLogo';
// Alias : ce fichier importe déjà `Animated` du cœur RN plus bas — une
// `Animated.Value` du cœur passée à une vue Reanimated échoue en silence
// (voir CLAUDE.md), donc les deux ne doivent jamais partager le même nom.
import ReanimatedView from 'react-native-reanimated';
import { useHeaderMetrics } from '../hooks/useHeaderMetrics';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  FlatList,
  StyleSheet,
  Animated,
  Easing,
  Platform,
  ActivityIndicator,
  StatusBar,
  Share,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { apiService } from '../services';
import { useAuth } from '../contexts/AuthContext';
import { Tweet } from '../types/api';
import Avatar from '../components/Avatar';
import TweetRow, { type TweetRowAction } from '../components/feed/TweetRow';
import ReportSheet from '../components/ReportSheet';
import { showActionSheet, type ActionSheetItem } from '../components/ui/ActionSheet';
import { webProfileUrl } from '../config/webUrl';
import ModerationActions from '../components/ModerationActions';
import { useKosporBirthdayEvent } from '../hooks/useKosporBirthdayEvent';
import challengeProgressService from '../services/challengeProgressService';
import VerifiedBadge from '../components/VerifiedBadge';
import PremiumBadge from '../components/PremiumBadge';
import IosNativeBadge from '../components/IosNativeBadge';
import { formatCompactCount } from '../utils/format';
import { effectiveSubscriptionTier } from '../utils/subscriptionTier';
import { useProfileBannerHeight } from '../hooks/useProfileBannerHeight';
import useForegroundInterval from '../hooks/useForegroundInterval';
import PremiumDisplayName from '../components/PremiumDisplayName';
import ProfileStories, { useProfileStories } from '../components/ProfileStories';
import { STORY_GRADIENT } from '../components/StoryRing';
import StoryViewer from '../components/StoryViewer';
import { toast } from '../components/ui/Toast';
import { confirmAsync } from '../components/ui/ConfirmSheet';
import { promptAsync } from '../components/ui/PromptSheet';
import strikeService from '../services/strikeService';
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

/** Référence stable : un `[]` littéral changerait d'identité à chaque rendu. */
const EMPTY_TWEETS: Tweet[] = [];

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
  city?: string | null;
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
  /** Non-null si ce profil est bloqué, dans un sens ou l'autre — voir le rendu dédié plus bas. */
  const [blockedState, setBlockedState] = useState<'by_me' | 'by_them' | null>(null);
  /** État de favori connu cette session — voir FeedGutterScreen pour le détail. */
  const [bookmarkedTweets, setBookmarkedTweets] = useState<{ [key: string]: boolean }>({});
  const bookmarkInFlightRef = useRef<Set<string>>(new Set());
  const [likedTweets, setLikedTweets] = useState<{ [key: string]: boolean }>({});
  const [retweetedTweets, setRetweetedTweets] = useState<{ [key: string]: boolean }>({});
  const [tabLoading, setTabLoading] = useState(false);

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
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const followButtonAnim = useRef(new Animated.Value(1)).current;

  // 📡 Vérifier le statut Live — suspendu quand l'app passe en arrière-plan.
  const checkLiveStatus = useCallback(async () => {
    if (!userProfile?.id) return;
    try {
      const { liveService } = require('../services/liveService');
      const lives = await liveService.getLives();
      const userLive = lives.find((l: any) => l.hostId === userProfile.id);
      setIsLive(!!userLive);
    } catch (e) {
      console.error('[UserProfile] Error checking live status:', e);
    }
  }, [userProfile?.id]);

  useForegroundInterval(checkLiveStatus, 20000);

  // Animation Pulse LIVE
  useEffect(() => {
    if (!isLive) return;
    // La boucle n'était jamais arrêtée : elle survivait à la fin du direct et
    // au démontage de l'écran, et continuait de tourner pour la session.
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [isLive, pulseAnim]);

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
        scrollRef.current?.scrollToOffset({ offset: 0, animated: false });
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
    // Ce fondu-ci reste : il tient l'exigence « pas d'état intermédiaire
    // visible » (on n'habille rien tant que la personnalisation n'est pas
    // chargée, puis tout entre d'un bloc). Mais 900 ms, c'était un rideau —
    // on voyait le profil se dévoiler au lieu de le voir arriver.
    const animation = Animated.timing(fadeAnim, {
      toValue: 1,
      duration: D.base,
      easing: E.out,
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
        const blocked = (response.data as any).blocked || null;
        setBlockedState(blocked);
        // Un profil bloqué ne porte pas de `stats` (voir `minimalBlockedUser`
        // côté serveur) : la mise en page plus bas lit `userProfile.stats.*`
        // sans garde, un objet manquant y ferait planter l'écran.
        setUserProfile(blocked
          ? { ...response.data.user, stats: { followers: 0, following: 0, tweets: 0, likes: 0 } } as UserProfile
          : response.data.user);
        // Un profil bloqué ne rend qu'une identité minimale (voir
        // `minimalBlockedUser` côté serveur) : ni tweets ni statut de suivi
        // n'ont de sens à charger par-dessus.
        if (!blocked) {
          if (username && !userId) await fetchTweetsAfterProfile(response.data.user.id);
          if (isAuthenticated && currentUser?.id !== response.data.user.id) {
            await checkFollowStatus(response.data.user.id);
          }
        } else {
          setTweets([]);
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

  /**
   * Identité stable de `handleRowAction` : `TweetRow` est mémoïsé sur ses
   * props par référence, donc une closure recréée à chaque rendu re-rendrait
   * toutes les lignes montées. L'état courant est lu par référence.
   */
  const likedTweetsRef = useRef(likedTweets);
  const retweetedTweetsRef = useRef(retweetedTweets);
  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    likedTweetsRef.current = likedTweets;
  }, [likedTweets]);
  useEffect(() => {
    retweetedTweetsRef.current = retweetedTweets;
  }, [retweetedTweets]);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  const handleLike = useCallback(async (tweetId: string) => {
    try {
      const wasLiked = likedTweetsRef.current[tweetId] || false;
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
      } else if (activeTabRef.current === 'likes' && wasLiked) {
        setTweets((prev) => prev.filter((t) => t.id !== tweetId));
      }
    } catch (error) {
      const wasLiked = likedTweetsRef.current[tweetId] || false;
      setLikedTweets((prev) => ({ ...prev, [tweetId]: wasLiked }));
    }
  }, []);

  const handleRetweet = useCallback(async (tweetId: string) => {
    try {
      const wasRetweeted = retweetedTweetsRef.current[tweetId] || false;
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
      const wasRetweeted = retweetedTweetsRef.current[tweetId] || false;
      setRetweetedTweets((prev) => ({ ...prev, [tweetId]: wasRetweeted }));
    }
  }, []);

  const handleShare = useCallback(async (tweetId: string) => {
    const response = await apiService.shareTweet(tweetId);
    if (!response.success || !response.data?.share_link) {
      toast.error(response.message || 'Impossible de partager ce tweet');
      return;
    }
    try {
      await Share.share({ message: response.data.share_link, url: response.data.share_link });
    } catch {
      // Feuille de partage annulée — rien à signaler.
    }
  }, []);

  const handleDeleteTweet = useCallback((tweetId: string) => {
    setTweets((current) => current.filter((tweet) => tweet.id !== tweetId));
  }, []);

  /**
   * Point d'entrée unique pour bloquer/débloquer CE profil — appelé aussi
   * bien depuis le bouton d'en-tête que depuis « Bloquer cet utilisateur »
   * dans le menu d'un de ses tweets. Même action réelle des deux côtés :
   * bloquer depuis un tweet n'a jamais eu de raison de peser moins que
   * bloquer depuis l'en-tête.
   */
  /**
   * Partage le lien PUBLIC du compte, celui du client web.
   *
   * Le lien du tweet vient de l'API (elle trace le partage) ; celui d'un
   * profil n'a rien à tracer et se compose ici, à partir du même domaine web.
   */
  const handleShareProfile = async (username?: string | null) => {
    if (!username) return;
    const url = webProfileUrl(username);
    try {
      await Share.share({ message: url, url });
    } catch {
      // Feuille de partage annulée — rien à signaler.
    }
  };

  const handleBlockToggle = useCallback(async (targetUserId: string, targetUsername?: string) => {
    if (blockedState === 'by_me') {
      const response = await apiService.unblockUser(targetUserId);
      if (response.success) {
        setBlockedState(null);
        toast.success(targetUsername ? `@${targetUsername} débloqué` : 'Compte débloqué');
        fetchUserProfile();
      } else {
        toast.error(response.message || 'Impossible de débloquer ce compte');
      }
      return;
    }

    const confirmed = await confirmAsync({
      title: targetUsername ? `Bloquer @${targetUsername} ?` : 'Bloquer ce compte ?',
      message: 'Il ne pourra plus vous contacter ni voir votre profil, et ses tweets disparaîtront de votre fil.',
      destructive: true,
    });
    if (!confirmed) return;

    const response = await apiService.blockUser(targetUserId);
    if (response.success) {
      toast.success(targetUsername ? `@${targetUsername} a été bloqué` : 'Compte bloqué');
      setBlockedState('by_me');
      setTweets([]);
    } else {
      toast.error(response.message || 'Impossible de bloquer ce compte');
    }
  }, [blockedState]);

  const handleBookmark = useCallback(async (tweetId: string) => {
    if (bookmarkInFlightRef.current.has(tweetId)) return;
    bookmarkInFlightRef.current.add(tweetId);
    try {
      const response = await apiService.bookmarkTweet(tweetId);
      if (response.success) {
        setBookmarkedTweets((prev) => ({ ...prev, [tweetId]: !!response.data?.bookmarked }));
        toast.success(response.data?.bookmarked ? 'Ajouté aux favoris' : 'Retiré des favoris');
      } else {
        toast.error(response.message || 'Impossible de mettre ce tweet en favori');
      }
    } finally {
      bookmarkInFlightRef.current.delete(tweetId);
    }
  }, []);

  const [reportTarget, setReportTarget] = useState<{ id: string; label?: string } | null>(null);

  const handleReport = useCallback((tweetId: string) => {
    const tweet = tweets.find((t) => t.id === tweetId);
    setReportTarget({
      id: tweetId,
      label: tweet?.author?.username ? `@${tweet.author.username}` : undefined,
    });
  }, [tweets]);

  const handleSkip = useCallback((tweetId: string) => {
    toast.info('Tweet ignoré', { description: 'Ce tweet n\'apparaîtra plus' });
  }, []);

  /** Même découpage propriétaire/visiteur que le fil principal (TweetsScreen). */
  /** Strike Ultra : voir `TweetsScreen.handleStrikeTweet`, même comportement. */
  const handleStrikeTweet = useCallback(async (tweetId: string) => {
    const reason = await promptAsync({
      title: 'Striker ce tweet',
      message: 'Bloque la diffusion instantanément, sans revue. L\'auteur pourra contester.',
      placeholder: 'Motif du strike (10 caractères minimum)…',
      multiline: true,
      maxLength: 500,
      confirmLabel: 'Striker',
      destructive: true,
      icon: 'flag',
    });
    if (!reason) return;
    const trimmed = reason.trim();
    if (trimmed.length < 10) {
      toast.error('Motif trop court', { description: 'Décris en au moins 10 caractères.' });
      return;
    }
    const result = await strikeService.createStrike(tweetId, trimmed);
    if (!result.success) {
      toast.error('Strike impossible', { description: result.message });
      return;
    }
    toast.success('Diffusion bloquée', {
      description: 'Ce tweet n\'apparaît plus dans les recommandations. L\'auteur peut contester.',
    });
  }, []);

  const handleOptionsMenu = useCallback((tweetId: string) => {
    const tweet = tweets.find((t) => t.id === tweetId);
    const isOwnTweet = !!(currentUser?.id && tweet?.author?.id === currentUser.id);
    const isUltra = effectiveSubscriptionTier(!!currentUser?.premium, (currentUser as any)?.subscription_tier) === 'ultra';

    const entries: ActionSheetItem[] = isOwnTweet
      ? [
          { label: 'Partager', icon: 'share-outline', onPress: () => handleShare(tweetId) },
          {
            label: 'Supprimer',
            icon: 'trash-outline',
            onPress: () => handleDeleteTweet(tweetId),
            destructive: true,
          },
        ]
      : [
          {
            label: bookmarkedTweets[tweetId] ? 'Retirer des favoris' : 'Ajouter aux favoris',
            icon: bookmarkedTweets[tweetId] ? 'bookmark' : 'bookmark-outline',
            onPress: () => handleBookmark(tweetId),
          },
          {
            label: 'Ignorer ce tweet',
            icon: 'eye-off-outline',
            hint: 'Il n’apparaîtra plus dans ton fil',
            onPress: () => handleSkip(tweetId),
          },
          { label: 'Partager', icon: 'share-outline', onPress: () => handleShare(tweetId) },
          { label: 'Signaler', icon: 'flag-outline', onPress: () => handleReport(tweetId) },
          ...(isUltra
            ? [{
              label: 'Striker (bloquer la diffusion)',
              icon: 'flag' as const,
              hint: 'Ultra — immédiat, sans revue, contestable par l\'auteur',
              onPress: () => handleStrikeTweet(tweetId),
              destructive: true,
            }]
            : []),
          {
            label: 'Bloquer cet utilisateur',
            icon: 'ban-outline',
            onPress: () => tweet?.author?.id && handleBlockToggle(tweet.author.id, tweet.author.username),
            destructive: true,
          },
        ];

    showActionSheet({ items: entries });
  }, [tweets, currentUser?.id, currentUser?.premium, handleShare, handleDeleteTweet, handleBookmark, handleSkip, handleReport, handleBlockToggle, handleStrikeTweet, bookmarkedTweets]);

  /**
   * L'état d'interaction vit à côté des tweets : on le fusionne une fois par
   * changement plutôt qu'à chaque rendu de chaque ligne.
   */
  const tweetsWithInteractions = React.useMemo(
    () =>
      tweets.map((tweet) => ({
        ...tweet,
        user_interaction: {
          is_liked: likedTweets[tweet.id] || false,
          is_retweeted: retweetedTweets[tweet.id] || false,
        },
      })) as Tweet[],
    [tweets, likedTweets, retweetedTweets],
  );

  const tweetKeyExtractor = useCallback((tweet: Tweet) => tweet.id, []);

  /** Contexte transmis aux lignes — pas de fil algorithmique ici, juste le profil. */
  const rowContext = React.useMemo(() => ({ tab: 'profile', algorithm: 'none' }), []);

  const handleRowAction = useCallback((action: TweetRowAction) => {
    const { type, tweetId, payload } = action;
    switch (type) {
      case 'like':
        handleLike(tweetId);
        break;
      case 'retweet':
        handleRetweet(tweetId);
        break;
      case 'reply':
        (navigation as any).navigate('TweetDetail', { tweetId, focusReply: true });
        break;
      case 'share':
        handleShare(tweetId);
        break;
      case 'options':
        handleOptionsMenu(tweetId);
        break;
      case 'report':
        handleReport(tweetId);
        break;
      case 'openQuote':
        (navigation as any).navigate('TweetDetail', { tweetId });
        break;
      case 'openContest':
        if (payload?.contestId) {
          (navigation as any).navigate('Contest', { contestId: payload.contestId });
        }
        break;
      case 'profile': {
        const author = payload?.author;
        if (!author?.id) return;
        (navigation as any).navigate('UserProfile', { userId: author.id, username: author.username });
        break;
      }
      case 'open': {
        (navigation as any).navigate('TweetDetail', {
          tweetId,
          isThread: !!(tweets.find((t) => t.id === tweetId) as any)?.parent_tweet_id,
        });
        break;
      }
    }
  }, [navigation, handleLike, handleRetweet, handleShare, handleOptionsMenu, handleReport, tweets]);

  const renderTweetItem = useCallback(
    ({ item, index }: { item: Tweet; index: number }) => (
      <TweetRow
        tweet={item}
        index={index}
        isThreadParent={false}
        isThreadChild={false}
        onAction={handleRowAction}
        contextData={rowContext}
      />
    ),
    [handleRowAction, rowContext],
  );

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
      confirmAsync({
        title: 'Connexion requise',
        message: 'Vous devez être connecté pour suivre des utilisateurs',
        confirmLabel: 'Se connecter',
      }).then((ok) => {
        if (ok) (() => navigation.navigate('Login' as never))();
      });
      return;
    }
    const targetUserId = userId || userProfile?.id;
    if (!targetUserId) {
      toast.error('ID utilisateur manquant');
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
      toast.error('Impossible de modifier le statut de suivi');
    } finally {
      setFollowLoading(false);
    }
  };

  const handleWishHappyBirthday = async () => {
    try {
      await challengeProgressService.completeBirthdayWishChallenge(currentUser?.id || '');
      toast.info('🎂 Bon Anniversaire Kospor ! 🎂', {
        description: 'Merci pour ce beau message ! Défi complété !',
      });
    } catch (error) {
      toast.info('🎂 Bon Anniversaire Kospor ! 🎂', {
        description: 'Merci pour ce beau message d\'anniversaire !',
      });
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchUserProfile();
    const resolvedUserId = userId || userProfile?.id;
    if (resolvedUserId) await fetchUserTweets();
    setRefreshing(false);
  };

  // `listRef` remplace l'ancienne `scrollRef` : `useAnimatedRef` expose le
  // même `.current` (donc `scrollToOffset` marche toujours) tout en donnant à
  // `usePullRefreshLogo` de quoi lire la traction sur le thread UI.
  const { pull, scrollHandler, logoKey, listRef: scrollRef } = usePullRefreshLogo(onRefresh, refreshing);

  const handleTabChange = (tab: 'tweets' | 'replies' | 'media' | 'likes') => setActiveTab(tab);

  // ── LOADING STATE ──
  if (loading && !userProfile) {
    return (
      <View style={S.container}>
        <StatusBar barStyle={statusBarStyle()} backgroundColor={PROFILE_BODY_BG} />
        <ScreenSkeleton variant="detail" />
      </View>
    );
  }

  // ── ERROR STATE ──
  if (error || !userProfile) {
    return (
      <View style={S.container}>
        <StatusBar barStyle={statusBarStyle()} backgroundColor={PROFILE_BODY_BG} />
        <View style={S.errorContainer}>
          <Ionicons name="alert-circle" size={52} color={colors.red} />
          <Text style={S.errorTitle}>Erreur</Text>
          <Text style={S.errorText}>{error || 'Profil non trouvé'}</Text>
          <TouchableOpacity style={S.retryButton} onPress={fetchUserProfile}>
            <Text style={S.retryButtonText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── BLOCKED STATE ── retour anticipé : la mise en page normale plus bas
  // (avatar, banniere, bouton Suivre, stats...) ne connait pas `blockedState`
  // et l'aurait affichee telle quelle — seuls les tweets etaient masques
  // avant ce correctif, ce qui laissait passer la photo et le bouton Suivre.
  if (blockedState) {
    return (
      <View style={S.container}>
        <StatusBar barStyle={statusBarStyle()} backgroundColor={PROFILE_BODY_BG} />
        <View style={[S.stickyHeader, { paddingTop: headerTopInset }]}>
          <BackButton navigation={navigation} />
          <View style={S.headerCenter} />
        </View>
        <View style={S.errorContainer}>
          <View style={S.blockedAvatarPlaceholder}>
            <Ionicons name="person" size={40} color={colors.textSecondary} />
          </View>
          <Text style={S.errorTitle}>@{userProfile.username}</Text>
          <Text style={S.errorText}>
            {blockedState === 'by_me' ? 'Vous avez bloqué ce compte' : 'Ce compte vous a bloqué'}
          </Text>
          {blockedState === 'by_me' && (
            <TouchableOpacity
              style={S.retryButton}
              onPress={() => handleBlockToggle(userProfile.id, userProfile.username)}
            >
              <Text style={S.retryButtonText}>Débloquer</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  const isOwnProfile = !!(currentUser?.id && userProfile && currentUser.id === userProfile.id);

  // Compte privé non suivi : la liste reste vide et le message prend sa place.
  // Comme avant, la règle ne s'applique pas tant que l'onglet charge — sinon
  // les tweets déjà affichés disparaîtraient à chaque changement d'onglet.
  const isLockedPrivateProfile =
    !!userProfile.is_private_account && !isOwnProfile && followStatus !== 'active' && !tabLoading;
  const showsTweets = !isLockedPrivateProfile;

  const premiumTier = userProfile.premium
    ? effectiveSubscriptionTier(true, userProfile.subscription_tier)
    : 'free';

  return (
    <View style={S.container}>
      <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />

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
      {/*
        La scène d'arrivée (fondu + 8 px) enveloppe désormais la liste plutôt
        que son contenu : avec une liste virtualisée il n'y a plus de conteneur
        unique à animer. À 8 px de course, le mouvement est le même à l'œil.
      */}
      <Animated.View
        style={{
          flex: 1,
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
      {Platform.OS === 'ios' && <PullRefreshLogo key={logoKey} pull={pull} active={refreshing} />}
      <ReanimatedView.FlatList
        ref={scrollRef}
        style={{ flex: 1, backgroundColor: 'transparent' }}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        bounces={!refreshing}
        alwaysBounceVertical
        removeClippedSubviews={false}
        onScroll={scrollHandler}
        scrollEventThrottle={1}
        refreshControl={Platform.OS === 'ios' ? undefined : (
          <AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        )}
        data={showsTweets ? tweetsWithInteractions : EMPTY_TWEETS}
        keyExtractor={tweetKeyExtractor}
        renderItem={renderTweetItem}
        initialNumToRender={6}
        maxToRenderPerBatch={5}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        ListHeaderComponent={
          <>

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
                {/* `blockedState` est toujours nul ici : le retour anticipé plus haut
                    intercepte tout profil bloqué avant d'atteindre cette mise en page. */}
                {!isOwnProfile && (
                  <TouchableOpacity
                    style={S.profileOptionsBtn}
                    onPress={() => showActionSheet({
                      items: [
                        {
                          label: 'Partager ce compte',
                          icon: 'share-outline',
                          onPress: () => handleShareProfile(userProfile.username),
                        },
                        {
                          label: 'Bloquer ce compte',
                          icon: 'ban-outline',
                          destructive: true,
                          onPress: () => handleBlockToggle(userProfile.id, userProfile.username),
                        },
                      ],
                    })}
                    activeOpacity={0.85}
                    aria-label="Plus d'options"
                  >
                    <Ionicons name="ellipsis-horizontal" size={17} color={colors.textPrimary} />
                  </TouchableOpacity>
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

                {(userProfile.created_at || userProfile.city?.trim?.()) ? (
                  <Animated.View style={[S.metaRow, entrance.line(4)]}>
                    {!!userProfile.city?.trim?.() && (
                      <View style={S.metaItem}>
                        <Ionicons name="location-outline" size={14} color={colors.textMuted} />
                        <Text style={S.metaText}> {String(userProfile.city).trim()}</Text>
                      </View>
                    )}
                    {userProfile.created_at && (
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
                    )}
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
            {tabLoading && (
              <ScreenSkeleton variant="detail" />
            )}
          </>
        }
        ListEmptyComponent={
          tabLoading ? null : isLockedPrivateProfile ? (
              <View style={S.emptyContainer}>
                <Ionicons name="lock-closed" size={48} color={colors.borderSubtle} />
                <Text style={S.emptyTitle}>Ce compte est privé</Text>
                <Text style={S.emptyText}>
                  Abonnez-vous pour voir les publications de {userProfile.username}
                </Text>
              </View>
            ) : (
              <View style={S.emptyContainer}>
                <Ionicons name="chatbubble-outline" size={48} color={colors.borderSubtle} />
                <Text style={S.emptyTitle}>Aucun contenu</Text>
                <Text style={S.emptyText}>
                  {userProfile.username} n'a pas encore publié de {activeTab}
                </Text>
              </View>
            )
        }
        ListFooterComponent={<View style={{ height: 40 }} />}
      />
      </Animated.View>

      <StoryViewer
        visible={storyViewerVisible}
        groups={[profileStories]}
        initialGroupIndex={0}
        currentUserId={currentUser?.id ? String(currentUser.id) : null}
        onClose={() => setStoryViewerVisible(false)}
        onStoryLiked={reloadProfileStories}
        onStoryDeleted={reloadProfileStories}
      />

      <ReportSheet
        visible={!!reportTarget}
        onClose={() => setReportTarget(null)}
        targetId={reportTarget?.id || ''}
        targetType="tweet"
        targetLabel={reportTarget?.label}
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
  blockedAvatarPlaceholder: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Sticky header
  stickyHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
    zIndex: 20,
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
  profileOptionsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
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
    borderBottomColor: colors.overlayMedium,
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
