import { colors, fonts, glow, withAlpha } from '../theme';
import { ScreenBackground, BackButton, ScreenSkeleton } from '../components/ui';
import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Platform, TextInput, Animated, LayoutAnimation, UIManager, Alert, Modal, KeyboardAvoidingView } from 'react-native';
import Reanimated from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import ReactionBurst, {
  useReactionAnimation,
  LIKE_PALETTE,
  RETWEET_PALETTE,
} from '../components/feed/ReactionBurst';
import VerifiedBadge from '../components/VerifiedBadge';
import PremiumDisplayName from '../components/PremiumDisplayName';
import { certifiedNameColors, type ProfileCustomization } from '../services/profileCustomizationService';
import { useRoute, useNavigation } from '@react-navigation/native';
import { apiService, progressiveRecommendationService } from '../services';
import { Tweet } from '../types/api';
import { useTweetAutoTranslation } from '../contexts/ReadingLanguageContext';
import Avatar from '../components/Avatar';
import PremiumTweetHolo, { usePremiumAuthorTheme } from '../components/PremiumTweetHolo';
import { useAuth } from '../contexts/AuthContext';
import ClickableMentions from '../components/ClickableMentions';
import PaidContentLock from '../components/PaidContentLock';
import TweetLanguageSwitcher from '../components/TweetLanguageSwitcher';
import TranslationReveal from '../components/TranslationReveal';
import ModerationActions from '../components/ModerationActions';
import { useAdminPermissions } from '../hooks/useAdminPermissions';
import ReportSheet from '../components/ReportSheet';
import { useEvents } from '../contexts/EventContext';
import { getEventTheme } from '../themes/eventThemes';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface RouteParams {
  tweetId: string;
  /**
   * Le tweet ouvert est-il une reponse ? L'appelant le sait (il a le
   * `parent_tweet_id` sous la main), l'ecran non : au moment du chargement,
   * `threadAncestors` est encore vide, puisque c'est justement la reponse du
   * serveur qui le remplira. Sans cette indication, le squelette d'un fil et
   * celui d'un tweet isole etaient identiques, et la mise en page sautait
   * quand le vrai contenu arrivait.
   */
  isThread?: boolean;
}

export default function TweetDetailScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { user: currentUser } = useAuth() as any;
  const { tweetId, isThread } = route.params as unknown as RouteParams;
  const [tweet, setTweet] = useState<Tweet | null>(null);
  const [replies, setReplies] = useState<Tweet[]>([]);
  const [isLiking, setIsLiking] = useState(false);
  const [isRetweeting, setIsRetweeting] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [showReportModal, setShowReportModal] = useState(false);
  // Même éclat que dans le fil : l'icône rebondit, l'anneau et les particules
  // partent de son centre.
  const like = useReactionAnimation();
  const retweet = useReactionAnimation(true);
  const scrollRef = useRef<ScrollView>(null);
  // Position mesurée du compositeur de réponse dans le ScrollView, pour le
  // faire remonter pile au-dessus du clavier quand l'utilisateur tape dedans.
  const composerYRef = useRef(0);
  const replyLikeAnims = useRef<{ [key: string]: Animated.Value }>({}).current;
  const replyRetweetAnims = useRef<{ [key: string]: Animated.Value }>({}).current;
  const [replyLiking, setReplyLiking] = useState<Record<string, boolean>>({});
  const [replyRetweeting, setReplyRetweeting] = useState<Record<string, boolean>>({});
  
  // États pour l'algorithme progressif
  const [currentAlgorithm, setCurrentAlgorithm] = useState<string>('smart');
  const [progressiveInfo, setProgressiveInfo] = useState<any>(null);
  const [showProgressiveModal, setShowProgressiveModal] = useState(false);
  const [isLoadingProgressiveInfo, setIsLoadingProgressiveInfo] = useState(false);
  
  // États pour les tweets similaires
  const [similarTweets, setSimilarTweets] = useState<Tweet[]>([]);
  const [isLoadingSimilar, setIsLoadingSimilar] = useState(false);
  // Chaîne racine -> parent direct lorsque le tweet ciblé est une réponse.
  const [threadAncestors, setThreadAncestors] = useState<Tweet[]>([]);

  /**
   * « Traduction (bêta) » — même comportement que la carte du fil : la langue
   * de lecture du compte s'applique d'office, le sélecteur permet d'en changer
   * pour ce tweet-là seulement.
   */
  const {
    active: activeTranslation,
    setActive: setActiveTranslation,
    displayedContent,
  } = useTweetAutoTranslation({
    id: tweetId,
    content: tweet?.content || '',
    translation_enabled: tweet?.translation_enabled,
    // Jointe par GET /tweets/:id dans la langue du compte : la page s'affiche
    // déjà traduite, sans le second appel qui la faisait basculer sous les
    // yeux. Le bouton de langue continue d'utiliser sa route dédiée.
    translation: (tweet as any)?.translation,
  });
  
  // Habillage premium : la lumière prend la couleur du profil de l'auteur.
  const holo = usePremiumAuthorTheme(tweet?.author);

  const { isModerator, canModerateContent, canDeleteTweets } = useAdminPermissions();
  const { activeEvent, hasActiveEvent } = useEvents();
  
  // Obtenir le thème de l'événement actif
  const eventTheme = activeEvent?.theme_id ? getEventTheme(activeEvent.theme_id) : null;

  const getReplyLikeAnim = (id: string) => {
    if (!replyLikeAnims[id]) replyLikeAnims[id] = new Animated.Value(1);
    return replyLikeAnims[id];
  };

  const getReplyRetweetAnim = (id: string) => {
    if (!replyRetweetAnims[id]) replyRetweetAnims[id] = new Animated.Value(1);
    return replyRetweetAnims[id];
  };

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
    
    // Charger l'algorithme actuel
    loadCurrentAlgorithm();
  }, []);

  // Charger l'algorithme actuel
  const loadCurrentAlgorithm = async () => {
    try {
      const savedAlgorithm = await AsyncStorage.getItem('selectedAlgorithm');
      if (savedAlgorithm) {
        setCurrentAlgorithm(savedAlgorithm);
      }
    } catch (error) {
      console.error('❌ Erreur lors du chargement de l\'algorithme:', error);
    }
  };

  // Charger les informations progressives
  const loadProgressiveInfo = async () => {
    if (currentAlgorithm !== 'progressive' || !tweet) {
      console.log('🚫 Pas de chargement progressif - Algorithme:', currentAlgorithm, 'Tweet:', !!tweet);
      return;
    }
    
    console.log('🚀 Chargement des informations progressives pour tweet:', tweet.id);
    setIsLoadingProgressiveInfo(true);
    
    try {
      // Récupérer les informations de l'algorithme progressif
      const response = await progressiveRecommendationService.getAlgorithmInfo();
      console.log('📡 Réponse getAlgorithmInfo:', response);
      
      if (response && response.success) {
        // Récupérer les statistiques utilisateur
        const userStats = await progressiveRecommendationService.getUserInteractionStats();
        console.log('📊 User stats:', userStats);
        
        // Récupérer les statistiques du tweet
        const tweetStats = await progressiveRecommendationService.getTweetViralityStats(tweet.id);
        console.log('📈 Tweet stats:', tweetStats);
        
        // Récupérer les recommandations progressives pour obtenir le groupe utilisateur
        const progressiveRecommendations = await progressiveRecommendationService.getProgressiveRecommendations({
          limit: 1,
          offset: 0,
          includeUser: true,
          includeStats: true,
          group: 'auto'
        });
        console.log('🚀 Progressive recommendations:', progressiveRecommendations);
        
        const progressiveData = {
          ...response.data,
          tweetId: tweet.id,
          // Utiliser les données du tweet si disponibles, sinon les données de l'API
          tweetScore: (tweet as any)._recommendation_metadata?.progressiveScore || 
                     (tweet as any).progressiveScore || 
                     (tweetStats?.data as any)?.progressiveScore || 0,
          viralScore: (tweet as any)._recommendation_metadata?.viralScore || 
                     (tweet as any).viralScore || 
                     (tweetStats?.data as any)?.viralScore || 0,
          recommendationLevel: (tweet as any)._recommendation_metadata?.recommendationLevel || 
                              (tweet as any).recommendationLevel || 
                              (tweetStats?.data as any)?.recommendationLevel || 0,
          interactions: (tweet as any)._recommendation_metadata?.interactions || 
                       (tweet as any).interactions || 
                       (tweetStats?.data as any)?.interactions || {},
          // Récupérer le groupe utilisateur depuis les recommandations progressives
          userGroup: (progressiveRecommendations?.data as any)?.metadata?.userGroup || 
                    (userStats?.data as any)?.userGroup || 
                    (response.data as any)?.userGroup || 
                    'unknown',
          totalCandidates: (progressiveRecommendations?.data as any)?.metadata?.totalCandidates || 
                          (response.data as any)?.totalCandidates || 
                          ((tweet as any)._recommendation_metadata?.maxCandidates) || 0,
          // Ajouter les interactions du tweet
          likes: tweet.stats?.likes || 0,
          retweets: tweet.stats?.retweets || 0,
          replies: tweet.stats?.replies || 0,
          views: tweet.stats?.views || 0
        };
        
        console.log('✅ Données progressives finales:', progressiveData);
        setProgressiveInfo(progressiveData);
      } else {
        console.warn('⚠️ Réponse getAlgorithmInfo invalide:', response);
        // Créer des données par défaut
        setProgressiveInfo({
          userGroup: 'unknown',
          totalCandidates: 0,
          tweetId: tweet.id,
          tweetScore: 0,
          viralScore: 0,
          recommendationLevel: 0,
          interactions: {},
          likes: tweet.stats?.likes || 0,
          retweets: tweet.stats?.retweets || 0,
          replies: tweet.stats?.replies || 0,
          views: tweet.stats?.views || 0
        });
      }
    } catch (error) {
      console.error('❌ Erreur lors du chargement des informations progressives:', error);
      
      // Essayer de récupérer au moins le groupe utilisateur
      try {
        const fallbackRecommendations = await progressiveRecommendationService.getProgressiveRecommendations({
          limit: 1,
          offset: 0,
          includeUser: true,
          includeStats: true,
          group: 'auto'
        });
        
        const fallbackUserGroup = (fallbackRecommendations?.data as any)?.metadata?.userGroup || 'error';
        console.log('🔄 Groupe utilisateur de fallback:', fallbackUserGroup);
        
        setProgressiveInfo({
          userGroup: fallbackUserGroup,
          totalCandidates: (fallbackRecommendations?.data as any)?.metadata?.totalCandidates || 0,
          tweetId: tweet.id,
          tweetScore: 0,
          viralScore: 0,
          recommendationLevel: 0,
          interactions: {},
          likes: tweet.stats?.likes || 0,
          retweets: tweet.stats?.retweets || 0,
          replies: tweet.stats?.replies || 0,
          views: tweet.stats?.views || 0
        });
      } catch (fallbackError) {
        console.error('❌ Erreur lors du fallback:', fallbackError);
        // Créer des données par défaut en cas d'erreur totale
        setProgressiveInfo({
          userGroup: 'error',
          totalCandidates: 0,
          tweetId: tweet.id,
          tweetScore: 0,
          viralScore: 0,
          recommendationLevel: 0,
          interactions: {},
          likes: tweet.stats?.likes || 0,
          retweets: tweet.stats?.retweets || 0,
          replies: tweet.stats?.replies || 0,
          views: tweet.stats?.views || 0
        });
      }
    } finally {
      setIsLoadingProgressiveInfo(false);
    }
  };

  // Charger les informations progressives quand l'algorithme change
  useEffect(() => {
    if (currentAlgorithm === 'progressive' && tweet) {
      loadProgressiveInfo();
    }
  }, [currentAlgorithm, tweet]);

  useEffect(() => {
    let cancelled = false;

    // Une navigation `push` peut laisser l'ancien contenu visible le temps de
    // la requête. On vide le focus et ses descendants pour ne jamais mélanger
    // deux branches de conversation.
    setTweet(null);
    setReplies([]);
    setSimilarTweets([]);
    setThreadAncestors([]);

    (async () => {
      // Les deux requêtes ne dépendent pas l'une de l'autre : elles ne
      // partagent que `tweetId`, connu d'avance. Enchaînées en `await`, les
      // réponses n'étaient demandées qu'une fois le tweet revenu, ce qui
      // doublait l'attente avant d'avoir la page complète.
      const [res, rep] = await Promise.all([
        apiService.getTweet(tweetId),
        apiService.getTweetReplies(tweetId, { limit: 20, offset: 0 }),
      ]);

      if (cancelled) return;

      if (res?.success && res.data) {
        const fetchedTweet = res.data as Tweet;
        setTweet(fetchedTweet);
        setThreadAncestors(
          Array.isArray(fetchedTweet.thread_ancestors)
            ? fetchedTweet.thread_ancestors
            : fetchedTweet.parentTweet
              ? [fetchedTweet.parentTweet]
              : []
        );

        // Charger les tweets similaires si c'est un original
        if (!fetchedTweet.parent_tweet_id) {
          loadSimilarTweets(fetchedTweet.id);
        }
      }

      if (rep?.success && rep.data?.replies) setReplies(rep.data.replies);
    })();

    return () => {
      cancelled = true;
    };
  }, [tweetId]);

  const loadSimilarTweets = async (id: string) => {
    setIsLoadingSimilar(true);
    try {
      const res = await apiService.getSimilarTweets(id);
      if (res?.success && Array.isArray(res.data)) {
        setSimilarTweets(res.data);
      }
    } catch (error) {
      console.error('❌ Erreur lors du chargement des tweets similaires:', error);
    } finally {
      setIsLoadingSimilar(false);
    }
  };

  const handleLike = async () => {
    if (!tweet || isLiking) return;
    try {
      setIsLiking(true);
      // optimistic update + animation
      const wasLiked = (tweet as any)?.user_interaction?.is_liked || false;
      const currentLikes = tweet.stats?.likes || 0;
      setTweet(prev => prev ? ({
        ...prev,
        stats: { ...(prev.stats || {}), likes: wasLiked ? Math.max(0, currentLikes - 1) : currentLikes + 1 },
        user_interaction: { ...(prev as any).user_interaction, is_liked: !wasLiked }
      } as Tweet) : prev);
      like.play(!wasLiked);
      const res = await apiService.likeTweet(tweet.id);
      if (!res?.success) {
        // revert
        setTweet(prev => prev ? ({
          ...prev,
          stats: { ...(prev.stats || {}), likes: wasLiked ? currentLikes : Math.max(0, currentLikes - 1) },
          user_interaction: { ...(prev as any).user_interaction, is_liked: wasLiked }
        } as Tweet) : prev);
      }
    } finally {
      setIsLiking(false);
    }
  };

  const handleRetweet = async () => {
    if (!tweet || isRetweeting) return;
    try {
      setIsRetweeting(true);
      // optimistic update + animation
      const wasRetweeted = (tweet as any)?.user_interaction?.is_retweeted || false;
      const currentRetweets = tweet.stats?.retweets || 0;
      setTweet(prev => prev ? ({
        ...prev,
        stats: { ...(prev.stats || {}), retweets: wasRetweeted ? Math.max(0, currentRetweets - 1) : currentRetweets + 1 },
        user_interaction: { ...(prev as any).user_interaction, is_retweeted: !wasRetweeted }
      } as Tweet) : prev);
      retweet.play(!wasRetweeted);
      const res = await apiService.retweet(tweet.id);
      if (!res?.success) {
        // revert
        setTweet(prev => prev ? ({
          ...prev,
          stats: { ...(prev.stats || {}), retweets: wasRetweeted ? currentRetweets : Math.max(0, currentRetweets - 1) },
          user_interaction: { ...(prev as any).user_interaction, is_retweeted: wasRetweeted }
        } as Tweet) : prev);
      }
    } finally {
      setIsRetweeting(false);
    }
  };

  const handleReplyLike = async (replyId: string) => {
    if (replyLiking[replyId]) return;
    const target = replies.find(r => r.id === replyId);
    if (!target) return;
    const wasLiked = (target as any)?.user_interaction?.is_liked || false;
    const currentLikes = target.stats?.likes || 0;
    try {
      setReplyLiking(prev => ({ ...prev, [replyId]: true }));
      setReplies(prev => prev.map(r => r.id === replyId ? ({
        ...r,
        stats: { ...(r.stats || {}), likes: wasLiked ? Math.max(0, currentLikes - 1) : currentLikes + 1 },
        user_interaction: { ...(r as any).user_interaction, is_liked: !wasLiked }
      } as Tweet) : r));
      Animated.sequence([
        Animated.timing(getReplyLikeAnim(replyId), { toValue: 1.2, duration: 150, useNativeDriver: true }),
        Animated.timing(getReplyLikeAnim(replyId), { toValue: 1, duration: 150, useNativeDriver: true })
      ]).start();
      const res = await apiService.likeTweet(replyId);
      if (!res?.success) {
        // revert
        setReplies(prev => prev.map(r => r.id === replyId ? ({
          ...r,
          stats: { ...(r.stats || {}), likes: wasLiked ? currentLikes : Math.max(0, currentLikes - 1) },
          user_interaction: { ...(r as any).user_interaction, is_liked: wasLiked }
        } as Tweet) : r));
      }
    } finally {
      setReplyLiking(prev => ({ ...prev, [replyId]: false }));
    }
  };

  const handleReplyRetweet = async (replyId: string) => {
    if (replyRetweeting[replyId]) return;
    const target = replies.find(r => r.id === replyId);
    if (!target) return;
    const wasRetweeted = (target as any)?.user_interaction?.is_retweeted || false;
    const currentRetweets = target.stats?.retweets || 0;
    try {
      setReplyRetweeting(prev => ({ ...prev, [replyId]: true }));
      setReplies(prev => prev.map(r => r.id === replyId ? ({
        ...r,
        stats: { ...(r.stats || {}), retweets: wasRetweeted ? Math.max(0, currentRetweets - 1) : currentRetweets + 1 },
        user_interaction: { ...(r as any).user_interaction, is_retweeted: !wasRetweeted }
      } as Tweet) : r));
      Animated.sequence([
        Animated.timing(getReplyRetweetAnim(replyId), { toValue: 1.15, duration: 180, useNativeDriver: true }),
        Animated.timing(getReplyRetweetAnim(replyId), { toValue: 1, duration: 180, useNativeDriver: true })
      ]).start();
      const res = await apiService.retweet(replyId);
      if (!res?.success) {
        // revert
        setReplies(prev => prev.map(r => r.id === replyId ? ({
          ...r,
          stats: { ...(r.stats || {}), retweets: wasRetweeted ? currentRetweets : Math.max(0, currentRetweets - 1) },
          user_interaction: { ...(r as any).user_interaction, is_retweeted: wasRetweeted }
        } as Tweet) : r));
      }
    } finally {
      setReplyRetweeting(prev => ({ ...prev, [replyId]: false }));
    }
  };

  const handleReply = async () => {
    if (!tweet || isReplying || !replyText.trim()) return;
    try {
      setIsReplying(true);
      const res = await apiService.createTweet({ content: replyText.trim(), parent_tweet_id: tweet.id });
      if (res?.success && res.data) {
        const newReply = res.data as Tweet;
        setReplies((prev) => [newReply, ...prev]);
        const current = tweet.stats?.replies ?? 0;
        setTweet({ ...tweet, stats: { ...(tweet.stats || {}), replies: current + 1 } } as Tweet);
        setReplyText('');
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }
    } finally {
      setIsReplying(false);
    }
  };

  const scrollToComposer = () => {
    // Vers la position mesurée du compositeur, pas la fin du contenu : les
    // tweets similaires et les réponses peuvent continuer bien après lui,
    // `scrollToEnd()` le faisait défiler hors champ au lieu de le montrer.
    scrollRef.current?.scrollTo({ y: Math.max(0, composerYRef.current - 12), animated: true });
  };

  /**
   * Au focus du champ de réponse, fait remonter le compositeur juste
   * au-dessus du clavier. Le petit délai laisse `KeyboardAvoidingView`
   * commencer son animation de remontée, sinon la position mesurée avant
   * que le clavier ne pousse le contenu vers le haut.
   */
  const scrollComposerAboveKeyboard = () => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, composerYRef.current - 12), animated: true });
    }, 120);
  };

  const handleReport = () => {
    setShowReportModal(true);
  };

  // `submitReport` vivait ici : envoi manuel avec motif en texte libre et
  // `severity: 'medium'` codée en dur côté client. Tout le parcours est
  // désormais dans <ReportSheet /> et la gravité est calculée par le serveur.

  const handleModerationAction = () => {
    // Cette fonction sera appelée après une action de modération
    // Optionnel : rafraîchir les données ou naviguer
    console.log('🎯 Action de modération effectuée sur le tweet:', tweet?.id);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor(diff / (1000 * 60));
    
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  return (
    <ScreenBackground>
    <SafeAreaView style={[
      styles.container,
      hasActiveEvent && eventTheme && {
        backgroundColor: eventTheme.colors.background,
      }
    ]}>
      {hasActiveEvent && eventTheme && (
        <LinearGradient
          colors={eventTheme.gradients.primary as any}
          style={styles.gradient}
        />
      )}

      {/* Lumière premium — rejouée à chaque ouverture (clé = publication). */}
      {holo.ready && (
        <PremiumTweetHolo key={tweet?.id} accent={holo.accent} secondary={holo.secondary} />
      )}

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <BackButton navigation={navigation} />
          <Text style={styles.headerTitle}>{threadAncestors.length > 0 ? 'Thread' : 'Tweet'}</Text>
          <View style={styles.headerRight}>
            {/* Bouton d'information pour l'algorithme progressif */}
            {currentAlgorithm === 'progressive' && (
              <TouchableOpacity
                style={[styles.headerAction, { marginRight: 8 }]}
                onPress={() => setShowProgressiveModal(true)}
              >
                <Ionicons name="information-circle-outline" size={19} color={colors.accent} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.headerAction}
              onPress={handleReport}
            >
              <Ionicons name="flag-outline" size={19} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!tweet ? (
          // Le bloc precedent affichait un faux spinner : l'`Animated.Value`
          // etait recreee a chaque rendu et jamais animee, donc la forme
          // restait figee — ce qui se lisait comme un ecran bloque. Meme
          // squelette que le reste de l'app (voir ui/ScreenSkeleton).
          <ScreenSkeleton variant={isThread ? 'thread' : 'tweet'} />
        ) : (
          <View style={styles.tweetContainer}>
            {/* Contexte du thread : racine puis chaque parent jusqu'au message
                ciblé. Toucher un ancêtre recentre la conversation sur lui. */}
            {threadAncestors.length > 0 && (
              <View style={styles.threadContext}>
                {threadAncestors.map((ancestor) => {
                  const author = ancestor.author || (ancestor as any).user;
                  return (
                    <TouchableOpacity
                      key={ancestor.id}
                      style={styles.threadAncestor}
                      onPress={() => (navigation as any).push('TweetDetail', { tweetId: ancestor.id })}
                      activeOpacity={0.78}
                    >
                      <View style={styles.threadAncestorRail}>
                        <Avatar
                          size={42}
                          username={author?.username || 'U'}
                          uri={author?.avatar}
                        />
                        <View style={styles.threadAncestorLine} />
                      </View>

                      <View style={styles.threadAncestorContent}>
                        <View style={styles.threadAncestorHeader}>
                          <PremiumDisplayName
                            text={author?.full_name || author?.username || 'Utilisateur'}
                            baseStyle={styles.threadAncestorName}
                            isPremium={!!author?.premium}
                            subscriptionTierRaw={author?.subscription_tier}
                            fontId="system"
                            effectId="none"
                            numberOfLines={1}
                            customization={author?.profile_customization as ProfileCustomization | undefined}
                            verified={!!author?.verified}
                            verificationStyle={author?.verification_style || 'default'}
                          />
                          {!!author?.username && (
                            <Text style={styles.threadAncestorHandle} numberOfLines={1}>
                              @{author.username}
                            </Text>
                          )}
                          <Text style={styles.threadAncestorTime}>
                            · {formatTime(ancestor.created_at || ancestor.createdAt || new Date().toISOString())}
                          </Text>
                        </View>

                        <ClickableMentions
                          text={ancestor.content}
                          mentions={ancestor.mentions}
                          style={styles.threadAncestorText}
                        />

                        <View style={styles.threadAncestorStats}>
                          <View style={styles.threadAncestorStat}>
                            <Ionicons name="chatbubble-outline" size={14} color={colors.textMuted} />
                            <Text style={styles.threadAncestorStatText}>{formatNumber(ancestor.stats?.replies || 0)}</Text>
                          </View>
                          <View style={styles.threadAncestorStat}>
                            <Ionicons name="repeat-outline" size={15} color={colors.textMuted} />
                            <Text style={styles.threadAncestorStatText}>{formatNumber(ancestor.stats?.retweets || 0)}</Text>
                          </View>
                          <View style={styles.threadAncestorStat}>
                            <Ionicons name="heart-outline" size={14} color={colors.textMuted} />
                            <Text style={styles.threadAncestorStatText}>{formatNumber(ancestor.stats?.likes || 0)}</Text>
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Tweet principal */}
            <View style={[
              styles.mainTweet,
              hasActiveEvent && eventTheme && {
                backgroundColor: eventTheme.colors.surface,
                borderColor: eventTheme.colors.border,
                borderWidth: 1,
                shadowColor: eventTheme.colors.shadow,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
                elevation: 8,
              },
              (tweet as any).is_ad && { 
                  borderColor: colors.gold,
                  borderWidth: 1, 
                  backgroundColor: colors.warningMuted,
              }
            ]}>
              <View style={styles.authorSection}>
                <TouchableOpacity
                  style={styles.avatarContainer}
                  onPress={() => {
                    const author: any = (tweet as any)?.author || {};
                    if (author?.id || author?.username) {
                      (navigation as any).navigate('UserProfile', {
                        userId: author.id,
                        username: author.username,
                      });
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Avatar 
                    size={48} 
                    username={tweet.author?.username || 'U'} 
                    uri={(tweet.author as any)?.avatar}
                    style={hasActiveEvent && eventTheme && {
                      borderColor: eventTheme.colors.accent,
                      borderWidth: 2,
                    }}
                  />
                </TouchableOpacity>
                <View style={styles.authorInfo}>
                  {/* L'habillage suit le compte jusqu'ici : un thème
                      d'événement, lui, reprend la main — c'est un habillage
                      global assumé. */}
                  <PremiumDisplayName
                    text={tweet.author?.full_name || 'Utilisateur'}
                    baseStyle={{
                      ...styles.fullName,
                      ...(hasActiveEvent && eventTheme ? { color: eventTheme.colors.text } : null),
                    }}
                    isPremium={!!(tweet.author as any)?.premium}
                    subscriptionTierRaw={(tweet.author as any)?.subscription_tier}
                    fontId="system"
                    effectId="none"
                    numberOfLines={1}
                    customization={
                      hasActiveEvent && eventTheme
                        ? undefined
                        : ((tweet.author as any)?.profile_customization as ProfileCustomization | undefined)
                    }
                    verified={!!(tweet.author as any)?.verified}
                    verificationStyle={(tweet.author as any)?.verification_style || 'default'}
                  />
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={[
                      styles.username,
                      hasActiveEvent && eventTheme && {
                        color: eventTheme.colors.textSecondary,
                      }
                    ]}>@{tweet.author?.username}</Text>
                    {(tweet.author as any)?.verified && (
                      <View style={{ marginLeft: 6 }}>
                        <VerifiedBadge
                          verificationStyle={(tweet.author as any)?.verification_style || 'default'}
                          size={14}
                          animated={true}
                          tint={
                            certifiedNameColors(
                              (tweet.author as any)?.verification_style,
                              hasActiveEvent && eventTheme
                                ? undefined
                                : ((tweet.author as any)?.profile_customization as ProfileCustomization | undefined),
                            ).from
                          }
                        />
                      </View>
                    )}
                  </View>
                </View>
              </View>

              {threadAncestors.length > 0 && (
                <Text style={styles.replyingTo}>
                  En réponse à{' '}
                  <Text style={styles.replyingToHandle}>
                    @{threadAncestors[threadAncestors.length - 1]?.author?.username || 'utilisateur'}
                  </Text>
                </Text>
              )}

              <TranslationReveal
                tweetId={String(tweetId)}
                language={activeTranslation?.language ?? null}
              >
                <ClickableMentions
                  text={displayedContent || tweet.content}
                  mentions={tweet.mentions}
                  style={[
                    styles.tweetText,
                    hasActiveEvent && eventTheme && {
                      color: eventTheme.colors.text,
                    }
                  ]}
                />
              </TranslationReveal>

              {/* Sélecteur de langue — seulement si l'auteur a publié avec l'option */}
              {tweet.translation_enabled && (
                <TweetLanguageSwitcher
                  tweetId={tweet.id}
                  active={activeTranslation}
                  onSelect={setActiveTranslation}
                />
              )}

              {/* Contenu payant : on arrive ici depuis le fil, un profil, une
                  notification ou un lien. Le texte ci-dessus n'est que
                  l'aperçu ; l'achat doit donc être possible sur cette page
                  aussi, sans repasser par le fil. */}
              {!!(tweet as any).paid_content && !(tweet as any).paid_content.has_access && (
                <PaidContentLock
                  lock={(tweet as any).paid_content}
                  onUnlocked={async () => {
                    // Le contenu complet ne vient QUE du serveur : après
                    // l'achat, on redemande le tweet plutôt que de tenter de
                    // reconstituer quoi que ce soit localement.
                    const res = await apiService.getTweet(String(tweetId));
                    if (res?.success && res.data) setTweet(res.data as Tweet);
                  }}
                />
              )}

              <View style={styles.timeContainer}>
                <Text style={styles.timeText}>
                  {new Date(tweet.created_at || tweet.createdAt || Date.now()).toLocaleString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                  })}
                </Text>
              </View>

              {/* Stats détaillées */}
              {!(tweet as any).is_ad && (
              <View style={styles.statsContainer}>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{formatNumber(tweet.stats?.retweets || 0)}</Text>
                  <Text style={styles.statLabel}>Retweets</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{formatNumber(tweet.stats?.likes || 0)}</Text>
                  <Text style={styles.statLabel}>J'aime</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{formatNumber(tweet.stats?.replies || 0)}</Text>
                  <Text style={styles.statLabel}>Réponses</Text>
                </View>
              </View>
              )}

              {/* Actions avec nouveau design */}
              <View style={styles.actionsContainer}>
                <TouchableOpacity style={styles.actionBtn} onPress={scrollToComposer} disabled={(tweet as any).is_ad}>
                  <View style={[styles.actionBtnInner, styles.replyAction, (tweet as any).is_ad && { opacity: 0.5 }]}>
                    <Ionicons name="chatbubble-outline" size={20} color={colors.textSecondary} />
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={handleRetweet}
                  onLongPress={() => {
                    if (!tweet) return;
                    (navigation as any).navigate('CreateTweet', {
                      parentTweetId: undefined,
                      replyTo: undefined,
                      quoteTweetId: tweet.id
                    });
                  }}
                  delayLongPress={300}
                  disabled={(tweet as any).is_ad || isRetweeting}
                >
                  <View style={[
                    styles.actionBtnInner,
                    styles.retweetAction,
                    (tweet as any)?.user_interaction?.is_retweeted && !((tweet as any).is_ad) && styles.retweetActive,
                    (tweet as any).is_ad && { opacity: 0.5 }
                  ]}>
                    <View style={styles.burstHost}>
                      <ReactionBurst progress={retweet.progress} palette={RETWEET_PALETTE} iconSize={20} />
                      <Reanimated.View style={retweet.iconStyle}>
                        <Ionicons
                          name="repeat"
                          size={20}
                          color={(tweet as any)?.user_interaction?.is_retweeted && !((tweet as any).is_ad) ? colors.success : colors.textSecondary}
                        />
                      </Reanimated.View>
                    </View>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity style={styles.actionBtn} onPress={handleLike} disabled={(tweet as any).is_ad || isLiking}>
                  <View style={[
                    styles.actionBtnInner,
                    styles.likeAction,
                    (tweet as any)?.user_interaction?.is_liked && !((tweet as any).is_ad) && styles.likeActive,
                    (tweet as any).is_ad && { opacity: 0.5 }
                  ]}>
                    <View style={styles.burstHost}>
                      <ReactionBurst progress={like.progress} palette={LIKE_PALETTE} iconSize={20} />
                      <Reanimated.View style={like.iconStyle}>
                        <Ionicons
                          name={(tweet as any)?.user_interaction?.is_liked && !((tweet as any).is_ad) ? 'heart' : 'heart-outline'}
                          size={20}
                          color={(tweet as any)?.user_interaction?.is_liked && !((tweet as any).is_ad) ? colors.like : colors.textSecondary}
                        />
                      </Reanimated.View>
                    </View>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity style={styles.actionBtn} disabled={(tweet as any).is_ad}>
                  <View style={[styles.actionBtnInner, styles.shareAction, (tweet as any).is_ad && { opacity: 0.5 }]}>
                    <Ionicons name="share-outline" size={20} color={colors.textSecondary} />
                  </View>
                </TouchableOpacity>
              </View>

              {/* FOOTER PREMIUM POUR LES PUBS (VUE DETAIL) */}
              {(tweet as any).is_ad && (
                <View style={{
                  marginVertical: 16,
                  padding: 18,
                  borderRadius: 16,
                  backgroundColor: colors.surfaceAlt,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                     <Ionicons name="sparkles" size={24} color={colors.gold} />
                     <View style={{ marginLeft: 14, flex: 1 }}>
                       <Text style={{ color: colors.gold, fontSize: 13, fontFamily: fonts.bold, textTransform: 'uppercase', letterSpacing: 0.6 }}>Publicité ciblée</Text>
                       <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4, fontFamily: fonts.medium }}>Recommandée spécialement pour vous</Text>
                     </View>
                  </View>
                  <View style={{ backgroundColor: colors.gold, padding: 10, borderRadius: 20, paddingHorizontal: 16 }}>
                     <Text style={{ color: '#1a1303', fontSize: 12, fontFamily: fonts.bold }}>Visiter ↗</Text>
                  </View>
                </View>
              )}

              {/* Actions de modération (visible uniquement pour les modérateurs) */}
              {isModerator && (canModerateContent || canDeleteTweets) && (
                <ModerationActions
                  targetType="tweet"
                  targetId={tweet.id}
                  targetData={tweet}
                  onActionComplete={handleModerationAction}
                />
              )}

            
            </View>

            {/* Compositeur de réponse amélioré */}
            {!(tweet as any).is_ad && (
            <View
              style={styles.replySection}
              onLayout={(e) => { composerYRef.current = e.nativeEvent.layout.y; }}
            >
              <View style={styles.replyComposer}>
                <View style={styles.replyAvatarSmall}>
                  <Avatar size={32} username={currentUser?.username || 'U'} uri={(currentUser as any)?.avatar} />
                </View>
                <View style={styles.replyInputContainer}>
                  <TextInput
                    style={styles.replyInput}
                    placeholder="Tweeter votre réponse..."
                    placeholderTextColor={colors.textMuted}
                    value={replyText}
                    onChangeText={setReplyText}
                    onFocus={scrollComposerAboveKeyboard}
                    multiline
                    maxLength={280}
                  />
                  <View style={styles.replyActions}>
                    <View style={styles.characterCount}>
                      <Text style={[
                        styles.characterCountText,
                        replyText.length > 250 && styles.characterCountWarning
                      ]}>
                        {replyText.length}/280
                      </Text>
                    </View>
                    <TouchableOpacity 
                      style={[
                        styles.replySubmitBtn,
                        (!replyText.trim() || isReplying) && styles.replySubmitBtnDisabled
                      ]} 
                      onPress={handleReply} 
                      disabled={!replyText.trim() || isReplying}
                    >
                      {isReplying ? (
                        <View style={styles.loadingDots}>
                          <Text style={styles.replySubmitText}>...</Text>
                        </View>
                      ) : (
                        <Text style={styles.replySubmitText}>Répondre</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
            )}

            {/* Section des réponses */}
            {replies.length > 0 && (
              <View style={styles.repliesSection}>
                <View style={styles.repliesHeader}>
                  <Text style={styles.repliesTitle}>Réponses</Text>
                  <View style={styles.repliesCount}>
                    <Text style={styles.repliesCountText}>{replies.length}</Text>
                  </View>
                </View>
                
                {replies.map((reply, index) => (
                  <View key={reply.id} style={styles.replyItem}>
                    <View style={styles.replyThread}>
                      <View style={styles.threadLine} />
                    </View>
                    <View style={styles.replyContent}>
                      <TouchableOpacity activeOpacity={0.8} onPress={() => (navigation as any).push('TweetDetail', { tweetId: reply.id, isThread: true })}>
                        <View style={styles.replyHeader}>
                          <TouchableOpacity
                            style={styles.replyAvatarContainer}
                            onPress={() => {
                              const author: any = (reply as any)?.author || {};
                              if (author?.id || author?.username) {
                                (navigation as any).navigate('UserProfile', {
                                  userId: author.id,
                                  username: author.username,
                                });
                              }
                            }}
                            activeOpacity={0.8}
                          >
                            <Avatar size={32} username={reply.author?.username || 'U'} uri={(reply.author as any)?.avatar} />
                          </TouchableOpacity>
                          <View style={styles.replyAuthorInfo}>
                            <TouchableOpacity
                              onPress={() => (navigation as any).push('TweetDetail', { tweetId: reply.id, isThread: true })}
                              activeOpacity={0.8}
                            >
                              <View style={styles.replyAuthorRow}>
                                <PremiumDisplayName
                                  text={reply.author?.full_name || reply.author?.username || 'Utilisateur'}
                                  baseStyle={styles.replyAuthorName}
                                  isPremium={!!(reply.author as any)?.premium}
                                  subscriptionTierRaw={(reply.author as any)?.subscription_tier}
                                  fontId="system"
                                  effectId="none"
                                  numberOfLines={1}
                                  customization={(reply.author as any)?.profile_customization as ProfileCustomization | undefined}
                                  verified={!!(reply.author as any)?.verified}
                                  verificationStyle={(reply.author as any)?.verification_style || 'default'}
                                />
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                  <Text style={styles.replyAuthorHandle}>
                                    @{reply.author?.username}
                                  </Text>
                                  {(reply.author as any)?.verified && (
                                    <View style={{ marginLeft: 6 }}>
                                      <VerifiedBadge
                                        verificationStyle={(reply.author as any)?.verification_style || 'default'}
                                        size={14}
                                        animated={true}
                                        tint={
                                          certifiedNameColors(
                                            (reply.author as any)?.verification_style,
                                            (reply.author as any)?.profile_customization as ProfileCustomization | undefined,
                                          ).from
                                        }
                                      />
                                    </View>
                                  )}
                                </View>
                                <Text style={styles.replyTime}>
                                  · {formatTime(reply.created_at || (reply as any).createdAt || Date.now())}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          </View>
                        </View>
                        <TouchableOpacity
                          onPress={() => (navigation as any).push('TweetDetail', { tweetId: reply.id, isThread: true })}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.replyText}>{reply.content}</Text>
                        </TouchableOpacity>
                      </TouchableOpacity>
                      
                      {/* Actions pour les réponses avec like/retweet */}
                      <View style={styles.replyItemActions}>
                        <TouchableOpacity
                          style={styles.replyActionBtn}
                          onPress={() => (navigation as any).push('TweetDetail', { tweetId: reply.id, isThread: true })}
                        >
                          <Ionicons name="chatbubble-outline" size={16} color={colors.textMuted} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.replyActionBtn}
                          onPress={() => handleReplyRetweet(reply.id)}
                          disabled={!!replyRetweeting[reply.id]}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Animated.View style={{ transform: [{ scale: getReplyRetweetAnim(reply.id) }] }}>
                              <Ionicons
                                name={(reply as any)?.user_interaction?.is_retweeted ? 'repeat' : 'repeat-outline'}
                                size={16}
                                color={(reply as any)?.user_interaction?.is_retweeted ? colors.success : colors.textMuted}
                              />
                            </Animated.View>
                            <Text style={[styles.replyActionCount, { color: (reply as any)?.user_interaction?.is_retweeted ? colors.success : colors.textMuted }]}>
                              {formatNumber(reply.stats?.retweets || 0)}
                            </Text>
                          </View>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.replyActionBtn}
                          onPress={() => handleReplyLike(reply.id)}
                          disabled={!!replyLiking[reply.id]}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Animated.View style={{ transform: [{ scale: getReplyLikeAnim(reply.id) }] }}>
                              <Ionicons
                                name={(reply as any)?.user_interaction?.is_liked ? 'heart' : 'heart-outline'}
                                size={16}
                                color={(reply as any)?.user_interaction?.is_liked ? colors.like : colors.textMuted}
                              />
                            </Animated.View>
                            <Text style={[styles.replyActionCount, { color: (reply as any)?.user_interaction?.is_liked ? colors.like : colors.textMuted }]}>
                              {formatNumber(reply.stats?.likes || 0)}
                            </Text>
                          </View>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.replyActionBtn}>
                          <Ionicons name="share-outline" size={16} color={colors.textMuted} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Section des tweets similaires (recommandations vectorielles) —
                sous tous les commentaires, pas avant : on veut d'abord voir
                la conversation, la découverte vient ensuite. */}
            {similarTweets.length > 0 && !isLoadingSimilar && (
              <View style={styles.similarSection}>
                <View style={styles.similarHeader}>
                  <Text style={styles.similarTitle}>Tweets similaires :</Text>
                </View>
                <View style={styles.similarList}>
                  {similarTweets.slice(0, 3).map((sTweet) => {
                    // Compatibilite avec les anciennes reponses de l'API qui
                    // exposaient parfois le profil sous `user` au lieu de `author`.
                    const author = sTweet.author || (sTweet as any).user;

                    return (
                      <TouchableOpacity
                        key={sTweet.id}
                        style={styles.similarTweet}
                        onPress={() => (navigation as any).push('TweetDetail', { tweetId: sTweet.id })}
                        activeOpacity={0.7}
                      >
                        <Avatar
                          size={36}
                          username={author?.username || 'U'}
                          uri={author?.avatar}
                        />
                        <View style={styles.similarTweetContent}>
                          <View style={styles.similarTweetHeader}>
                            <PremiumDisplayName
                              text={author?.full_name || author?.username || 'Utilisateur'}
                              baseStyle={styles.similarTweetName}
                              isPremium={!!author?.premium}
                              subscriptionTierRaw={author?.subscription_tier}
                              fontId="system"
                              effectId="none"
                              numberOfLines={1}
                              customization={author?.profile_customization as ProfileCustomization | undefined}
                              verified={!!author?.verified}
                              verificationStyle={author?.verification_style || 'default'}
                            />
                            {!!author?.username && (
                              <Text style={styles.similarTweetHandle} numberOfLines={1}>
                                @{author.username}
                              </Text>
                            )}
                            {!!author?.verified && (
                              <View style={{ marginLeft: 4 }}>
                                <VerifiedBadge
                                  verificationStyle={author?.verification_style || 'default'}
                                  size={12}
                                  animated={false}
                                  tint={
                                    certifiedNameColors(
                                      author?.verification_style,
                                      author?.profile_customization as ProfileCustomization | undefined,
                                    ).from
                                  }
                                />
                              </View>
                            )}
                          </View>
                          <Text style={styles.similarTweetText} numberOfLines={2}>
                            {sTweet.content}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Signalement — la feuille remplace l'ancienne modale à texte libre :
          catégories, gravité calculée côté serveur, retour explicite. */}
      <ReportSheet
        visible={showReportModal}
        onClose={() => setShowReportModal(false)}
        targetId={tweet?.id || ''}
        targetType="tweet"
        targetLabel={tweet?.author?.username ? `@${tweet.author.username}` : undefined}
      />

      {/* Modal d'information progressif */}
      <Modal
        visible={showProgressiveModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowProgressiveModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalGradient}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🚀 Algorithme Progressif</Text>
              <View style={styles.modalHeaderActions}>
                <TouchableOpacity
                  style={[styles.headerAction, { marginRight: 8 }]}
                  onPress={loadProgressiveInfo}
                  disabled={isLoadingProgressiveInfo}
                >
                  <Ionicons 
                    name="refresh" 
                    size={20} 
                    color={isLoadingProgressiveInfo ? colors.textMuted : colors.accent}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => setShowProgressiveModal(false)}
                >
                  <Ionicons name="close" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
              {isLoadingProgressiveInfo ? (
                <View style={styles.loadingContainer}>
                  <Text style={styles.loadingText}>Chargement des informations...</Text>
                </View>
              ) : progressiveInfo ? (
                <View>
                  {/* Informations générales */}
                  <View style={styles.infoSection}>
                    <Text style={styles.sectionTitle}>📊 Informations Générales</Text>
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Groupe Utilisateur:</Text>
                      <Text style={[styles.infoValue, styles.scoreValue]}>
                        {progressiveInfo.userGroup || 'N/A'}
                      </Text>
                    </View>
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Algorithme:</Text>
                      <Text style={styles.infoValue}>Progressive Viral</Text>
                    </View>
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Tweets Recommandés:</Text>
                      <Text style={styles.infoValue}>{progressiveInfo.totalCandidates || 0}</Text>
                    </View>
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Tweet ID:</Text>
                      <Text style={[styles.infoValue, { fontSize: 12 }]}>
                        {progressiveInfo.tweetId?.substring(0, 8)}...
                      </Text>
                    </View>
                  </View>

                  {/* Scores du tweet */}
                  <View style={styles.infoSection}>
                    <Text style={styles.sectionTitle}>🎯 Scores du Tweet</Text>
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Score Progressif:</Text>
                      <Text style={[styles.infoValue, styles.scoreValue]}>
                        {progressiveInfo.tweetScore?.toFixed(2) || '0.00'}
                      </Text>
                    </View>
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Score Viral:</Text>
                      <Text style={[styles.infoValue, styles.scoreValue]}>
                        {progressiveInfo.viralScore?.toFixed(2) || '0.00'}
                      </Text>
                    </View>
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Niveau Recommandation:</Text>
                      <Text style={[styles.infoValue, styles.scoreValue]}>
                        {progressiveInfo.recommendationLevel || 0}/4
                      </Text>
                    </View>
                  </View>

                  {/* Interactions */}
                  <View style={styles.infoSection}>
                    <Text style={styles.sectionTitle}>💬 Interactions</Text>
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Likes:</Text>
                      <Text style={styles.infoValue}>
                        {progressiveInfo.interactions?.likes || progressiveInfo.likes || 0}
                      </Text>
                    </View>
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Commentaires:</Text>
                      <Text style={styles.infoValue}>
                        {progressiveInfo.interactions?.comments || progressiveInfo.replies || 0}
                      </Text>
                    </View>
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Retweets:</Text>
                      <Text style={styles.infoValue}>
                        {progressiveInfo.interactions?.retweets || progressiveInfo.retweets || 0}
                      </Text>
                    </View>
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Vues:</Text>
                      <Text style={styles.infoValue}>
                        {progressiveInfo.interactions?.views || progressiveInfo.views || 0}
                      </Text>
                    </View>
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Partages:</Text>
                      <Text style={styles.infoValue}>
                        {progressiveInfo.interactions?.shares || 0}
                      </Text>
                    </View>
                  </View>

                  {/* Description de l'algorithme */}
                  <View style={styles.infoSection}>
                    <Text style={styles.sectionTitle}>ℹ️ À propos de l'Algorithme</Text>
                    <Text style={styles.descriptionText}>
                      L'algorithme progressif recommande des tweets basés sur leur viralité croissante. 
                      Les tweets commencent par être recommandés à un petit groupe, puis s'étendent 
                      progressivement selon les interactions (likes, commentaires, retweets).
                    </Text>
                    <Text style={styles.descriptionText}>
                      Votre groupe actuel détermine quels tweets vous sont recommandés en priorité.
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.errorContainer}>
                  <Ionicons name="alert-circle-outline" size={48} color={colors.red} />
                  <Text style={styles.errorText}>Impossible de charger les informations</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  gradient: {
    ...StyleSheet.absoluteFillObject as any,
  },
  header: {
    position: 'relative',
    zIndex: 100,
  },
  headerGradient: {
    ...StyleSheet.absoluteFillObject as any,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingTop: Platform.OS === 'ios' ? 8 : 16,
  },
  backBtn: {
    marginRight: 16,
  },
  backBtnInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700', fontFamily: fonts.bold,
    flex: 1,
  },
  headerRight: {
    width: 36,
    alignItems: 'center',
  },
  headerAction: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexGrow: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingSpinner: {
    marginBottom: 16,
  },
  spinner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: colors.accent,
    borderTopColor: 'transparent',
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '500', fontFamily: fonts.medium,
  },
  tweetContainer: {
    flex: 1,
  },
  threadContext: {
    paddingTop: 14,
    backgroundColor: colors.bg,
  },
  threadAncestor: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    minHeight: 108,
  },
  threadAncestorRail: {
    width: 44,
    alignItems: 'center',
    marginRight: 12,
  },
  threadAncestorLine: {
    width: 2,
    flex: 1,
    minHeight: 24,
    marginTop: 6,
    backgroundColor: colors.border,
    borderRadius: 1,
  },
  threadAncestorContent: {
    flex: 1,
    paddingBottom: 16,
  },
  threadAncestorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 24,
    marginBottom: 5,
  },
  threadAncestorName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700', fontFamily: fonts.bold,
    marginRight: 5,
    maxWidth: '48%',
  },
  threadAncestorHandle: {
    color: colors.textSecondary,
    fontSize: 14,
    marginRight: 4,
    maxWidth: '32%',
  },
  threadAncestorTime: {
    color: colors.textMuted,
    fontSize: 13,
  },
  threadAncestorText: {
    color: colors.textPrimary,
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 10,
  },
  threadAncestorStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
  },
  threadAncestorStat: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  threadAncestorStatText: {
    color: colors.textMuted,
    fontSize: 12,
    marginLeft: 5,
  },
  mainTweet: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  authorSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatarGradient: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700', fontFamily: fonts.bold,
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  authorInfo: {
    flex: 1,
  },
  fullName: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700', fontFamily: fonts.bold,
    marginBottom: 2,
  },
  username: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '400', fontFamily: fonts.regular,
  },
  replyingTo: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: -6,
    marginBottom: 12,
  },
  replyingToHandle: {
    color: colors.accent,
    fontFamily: fonts.medium,
  },
  tweetText: {
    color: colors.textPrimary,
    fontSize: 20,
    lineHeight: 28,
    marginBottom: 16,
    fontWeight: '400', fontFamily: fonts.regular,
  },
  timeContainer: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  timeText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '400', fontFamily: fonts.regular,
  },
  statsContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 24,
  },
  statNumber: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700', fontFamily: fonts.bold,
    marginRight: 4,
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '400', fontFamily: fonts.regular,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  actionBtn: {
    padding: 8,
  },
  actionBtnInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    // L'anneau et les particules sortent du cercle : pas de rognage.
    overflow: 'visible',
  },
  /** Boîte de la taille exacte de l'icône : l'éclat s'y centre tout seul. */
  burstHost: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  replyAction: {},
  retweetAction: {},
  retweetActive: {
    backgroundColor: colors.successMuted,
  },
  likeAction: {},
  likeActive: {
    backgroundColor: withAlpha(colors.like, 0.16),
  },
  shareAction: {},
  replySection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  replyComposer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  replyAvatarSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 8,
  },
  replyAvatarLetter: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700', fontFamily: fonts.bold,
  },
  replyInputContainer: {
    flex: 1,
  },
  replyInput: {
    color: colors.textPrimary,
    fontSize: 16,
    lineHeight: 24,
    minHeight: 48,
    maxHeight: 120,
    paddingVertical: 12,
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
  },
  replyActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  characterCount: {
    flex: 1,
  },
  characterCountText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '400', fontFamily: fonts.regular,
  },
  characterCountWarning: {
    color: colors.like,
  },
  replySubmitBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.accent,
    ...glow(colors.accent, 10),
  },
  replySubmitBtnDisabled: {
    backgroundColor: colors.accentMuted,
  },
  replySubmitText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  loadingDots: {
    alignItems: 'center',
  },
  repliesSection: {
    flex: 1,
  },
  repliesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  repliesTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700', fontFamily: fonts.bold,
  },
  repliesCount: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: colors.accentMuted,
  },
  repliesCountText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  replyItem: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  replyThread: {
    width: 48,
    alignItems: 'center',
    marginRight: 12,
  },
  threadLine: {
    width: 2,
    flex: 1,
    backgroundColor: colors.border,
    marginTop: 8,
  },
  replyContent: {
    flex: 1,
  },
  replyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  replyAvatarContainer: {
    marginRight: 8,
  },
  replyAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  replyAvatarText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700', fontFamily: fonts.bold,
  },
  replyAuthorInfo: {
    flex: 1,
  },
  replyAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  replyAuthorName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600', fontFamily: fonts.semibold,
    marginRight: 6,
  },
  replyAuthorHandle: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '400', fontFamily: fonts.regular,
    marginRight: 6,
  },
  replyTime: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '400', fontFamily: fonts.regular,
  },
  replyText: {
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
  },
  replyItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  replyActionBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginRight: 16,
  },
  replyActionCount: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  // Styles pour le modal de signalement
  modalContainer: {
    flex: 1,
  },
  modalGradient: {
    flex: 1,
    padding: 20,
    backgroundColor: colors.bg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingTop: 20,
  },
  modalTitle: {
    flex: 1,
    textAlign: 'center',
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700', fontFamily: fonts.bold,
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: colors.borderSubtle,
  },
  modalContent: {
    flex: 1,
  },
  modalSubtitle: {
    color: colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  reportLabel: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
    marginBottom: 12,
  },
  reportInput: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 12,
    padding: 16,
    color: colors.textPrimary,
    fontSize: 16,
    minHeight: 120,
    textAlignVertical: 'top',
    marginBottom: 24,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 16,
    backgroundColor: colors.borderSubtle,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  submitButton: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  submitButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitButtonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  disabledButton: {
    opacity: 0.6,
  },
  // Styles pour le modal progressif
  infoSection: {
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700', fontFamily: fonts.bold,
    color: colors.textPrimary,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
  },
  infoLabel: {
    fontSize: 16,
    color: colors.textSecondary,
    flex: 1,
  },
  infoValue: {
    fontSize: 16,
    color: colors.textPrimary,
    fontWeight: '600', fontFamily: fonts.semibold,
    textAlign: 'right',
  },
  scoreValue: {
    color: colors.accent,
    fontWeight: '700', fontFamily: fonts.bold,
  },
  descriptionText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  errorText: {
    fontSize: 16,
    color: colors.red,
    marginTop: 16,
    textAlign: 'center',
  },
  modalHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Styles pour les tweets similaires
  similarSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  similarHeader: {
    marginBottom: 16,
  },
  similarTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800', fontFamily: fonts.bold,
    letterSpacing: -0.5,
  },
  similarList: {
    gap: 4,
  },
  similarTweet: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    marginBottom: 8,
  },
  similarTweetContent: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  similarTweetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  similarTweetName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700', fontFamily: fonts.bold,
    maxWidth: '50%',
  },
  similarTweetHandle: {
    color: colors.textSecondary,
    fontSize: 13,
    marginLeft: 4,
    flex: 1,
  },
  similarTweetText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
});
