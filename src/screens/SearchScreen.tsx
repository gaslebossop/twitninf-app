import React, { memo, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { fonts, radius } from '../theme';
import { ScreenBackground, ScreenSkeleton, EmptyState } from '../components/ui';
import SceneCanvas, { SceneReveal, useSceneReveal } from '../components/SceneCanvas';
import Skeleton from '../components/ui/Skeleton';
import { useHeaderMetrics } from '../hooks/useHeaderMetrics';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { useNavigation, useRoute, RouteProp, ParamListBase } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services';
import { User, Tweet } from '../types/api';
import Avatar from '../components/Avatar';
import TweetCard from '../components/TweetCard';
import BanAlertBanner from '../components/BanAlertBanner';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEventStyles } from '../hooks/useEventStyles';
import { EventBanner } from '../components/EventBanner';
import VerifiedBadge from '../components/VerifiedBadge';
import PremiumDisplayName from '../components/PremiumDisplayName';
import { certifiedNameColors, type ProfileCustomization } from '../services/profileCustomizationService';
import UserSuggestions from '../components/UserSuggestions';
import tokenStore from '../services/tokenStore';
import { toast } from '../components/ui/Toast';

type SearchRouteProp = RouteProp<{ Search: { query?: string; searchType?: string } }, 'Search'>;

/** Ne capture rien : au niveau module, elle sert aussi aux lignes mémoïsées. */
function formatNumber(num: number) {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return num.toString();
}

/**
 * Ligne de résultat « compte », mémoïsée.
 *
 * C'était une fonction nue appelée par `.map()` : pas un élément React que
 * React puisse comparer, donc son JSX — `Avatar`, `PremiumDisplayName`,
 * `VerifiedBadge` — était reconstruit et réconcilié à chaque rendu de l'écran,
 * pour les vingt lignes à la fois. Et l'écran se re-rend aussi pendant que le
 * résumé IA arrive caractère par caractère, pas seulement à la frappe.
 *
 * Les résultats vivent dans un `ScrollView` : rien n'est jamais démonté. La
 * mémoïsation est donc ce qui borne réellement le coût ici, tant que la
 * virtualisation n'est pas faite.
 */
const UserResultRow = memo(function UserResultRow({
  user,
  isFollowing,
  isFollowLoading,
  onPress,
  onFollowToggle,
}: {
  user: User;
  isFollowing: boolean;
  isFollowLoading: boolean;
  onPress: (user: User) => void;
  onFollowToggle: (user: User) => void;
}) {
  return (
    <View style={styles.userItem}>
      <TouchableOpacity
        style={styles.userContent}
        onPress={() => onPress(user)}
        activeOpacity={0.7}
      >
        <Avatar
          size={56}
          username={user.username || 'U'}
          uri={(user as any)?.avatar}
          style={styles.userAvatar}
        />

        <View style={styles.userInfo}>
          <View style={styles.userNameRow}>
            <PremiumDisplayName
              text={user.full_name || 'Utilisateur'}
              baseStyle={styles.userFullName}
              isPremium={!!(user as any)?.premium}
              subscriptionTierRaw={(user as any)?.subscription_tier}
              fontId="system"
              effectId="none"
              numberOfLines={1}
              customization={(user as any)?.profile_customization as ProfileCustomization | undefined}
              verified={!!user.verified}
              verificationStyle={(user.verification_style as any) || 'default'}
            />
            {user.verified && (
              <View style={{ marginLeft: 6 }}>
                <VerifiedBadge
                  verificationStyle={(user.verification_style as any) || 'default'}
                  size={16}
                  tint={
                    certifiedNameColors(
                      (user.verification_style as any) || 'default',
                      (user as any)?.profile_customization as ProfileCustomization | undefined,
                    ).from
                  }
                />
              </View>
            )}
          </View>

          <Text style={styles.userUsername} numberOfLines={1}>
            @{user.username || 'username'}
          </Text>

          <View style={styles.userStats}>
            <Text style={styles.userStat}>
              {formatNumber(user.stats?.followers || 0)} abonnés
            </Text>
            <Text style={styles.statSeparator}>·</Text>
            <Text style={styles.userStat}>
              {formatNumber(user.stats?.following || 0)} abonnements
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.followButton, isFollowing && styles.followingButton]}
          onPress={() => onFollowToggle(user)}
          disabled={isFollowLoading}
        >
          {isFollowLoading ? (
            <ActivityIndicator size="small" color={isFollowing ? colors.textSecondary : colors.onAccent} />
          ) : (
            <Text style={[styles.followButtonText, isFollowing && styles.followingButtonText]}>
              {isFollowing ? 'Suivi' : 'Suivre'}
            </Text>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </View>
  );
});

/**
 * Barre de recherche isolée : la requête en cours de frappe vit ici, et nulle
 * part ailleurs.
 *
 * Elle vivait dans `SearchScreen`, si bien que chaque caractère tapé
 * reconstruisait les lignes de résultats déjà à l'écran — et elles ne sont pas
 * virtualisées, donc toutes montées, jusqu'à 40 à la fois. Corriger une faute
 * de frappe coûtait autant de reconstructions complètes que de caractères.
 *
 * Le parent n'apprend que la requête VALIDÉE. Le réseau ne change pas d'un
 * iota : la recherche partait déjà de `onSubmitEditing`, jamais de la frappe.
 * Conséquence assumée en revanche, et c'est la seule : changer de filtre
 * pendant qu'on tape relance la recherche sur la dernière requête validée, et
 * non sur le texte en cours de saisie — ce qui accorde enfin le libellé
 * « Rien pour « … » » avec les résultats réellement affichés.
 */
const SearchBar = memo(function SearchBar({
  seed,
  onSubmit,
}: {
  /** Requête poussée de l'extérieur : lien profond, appui sur un hashtag, effacement. */
  seed: string;
  onSubmit: (query: string) => void;
}) {
  const [draft, setDraft] = useState(seed);

  // Recalage sur une requête venue de l'extérieur. Un `setState` pendant le
  // rendu du MÊME composant est le motif prévu par React pour ça : il relance
  // le rendu aussitôt, sans afficher la valeur intermédiaire ni toucher au
  // parent — là où un `useEffect` laisserait passer une image.
  const lastSeed = useRef(seed);
  if (lastSeed.current !== seed) {
    lastSeed.current = seed;
    setDraft(seed);
  }

  const clear = useCallback(() => {
    setDraft('');
    onSubmit('');
  }, [onSubmit]);

  return (
    <View style={styles.searchBarContainer}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={20} color={colors.textSecondary} style={styles.searchIcon} />

        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher"
          placeholderTextColor={colors.textMuted}
          value={draft}
          onChangeText={(text) => setDraft(text.replace(/^#+/, '#'))}
          onSubmitEditing={() => onSubmit(draft)}
          returnKeyType="search"
        />

        {draft.length > 0 && (
          <TouchableOpacity onPress={clear} style={styles.clearButton}>
            <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
});

export default function SearchScreen() {
  const navigation = useNavigation();
  const route = useRoute<SearchRouteProp>();
  const { user, accounts } = useAuth();
  const { styles: eventStyles, theme: currentTheme } = useEventStyles();
  const { top: headerTopInset } = useHeaderMetrics();

  /** La requête VALIDÉE, pas celle en cours de frappe : celle-ci vit dans `SearchBar`. */
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ users: User[]; tweets: Tweet[] }>({ users: [], tweets: [] });
  const [loading, setLoading] = useState(false);
  const [displayedAiSummary, setDisplayedAiSummary] = useState('');
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiSummaryStatus, setAiSummaryStatus] = useState('');
  const [aiSummaryRefs, setAiSummaryRefs] = useState<{ users: User[]; tweets: Tweet[] }>({ users: [], tweets: [] });
  const [activeFilter, setActiveFilter] = useState<'all' | 'users' | 'tweets' | 'trends'>('all');
  const [trendingHashtags, setTrendingHashtags] = useState<Array<{ tag: string; count: number }>>([]);
  const summaryAnimationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const summaryRequestIdRef = useRef(0);
  const SUMMARY_ANIM_BASE_MS = 10;
  const SUMMARY_ANIM_CACHED_MULTIPLIER = 5;

  // États pour les interactions avec les tweets
  const [likedTweets, setLikedTweets] = useState<{ [key: string]: boolean }>({});
  const [retweetedTweets, setRetweetedTweets] = useState<{ [key: string]: boolean }>({});
  const [followingUsers, setFollowingUsers] = useState<{ [key: string]: boolean }>({});
  const [followLoading, setFollowLoading] = useState<{ [key: string]: boolean }>({});

  // Récupérer le token depuis AsyncStorage (système standard)
  const [currentToken, setCurrentToken] = useState<string | null>(null);

  const performSearchRef = useRef<(query: string, filterOverride?: 'all' | 'users' | 'tweets' | 'trends') => Promise<void>>(async () => {});

  // Charger le token au démarrage
  useEffect(() => {
    const loadToken = async () => {
      try {
        const token = await tokenStore.getAccessToken();
        setCurrentToken(token);
        console.log('🔑 Token chargé pour la recherche:', token ? 'Présent' : 'Absent');
      } catch (error) {
        console.error('❌ Erreur lors du chargement du token:', error);
      }
    };
    
    loadToken();
  }, []);

  // Rafraîchir le token quand l'utilisateur change
  useEffect(() => {
    const refreshToken = async () => {
      try {
        const token = await tokenStore.getAccessToken();
        setCurrentToken(token);
        console.log('🔄 Token rafraîchi pour la recherche:', token ? 'Présent' : 'Absent');
      } catch (error) {
        console.error('❌ Erreur lors du rafraîchissement du token:', error);
      }
    };
    
    refreshToken();
  }, [user?.id]); // Se déclenche quand l'utilisateur change

  useEffect(() => {
    // Animation d'entrée douce

    fetchTrendingHashtags();
  }, []);

  // Initialiser les états d'interaction avec les tweets reçus
  useEffect(() => {
    if (searchResults.tweets.length > 0) {
      console.log('🔄 useEffect - Initialisation des états d\'interaction avec', searchResults.tweets.length, 'tweets');
      
      const initialLikes: { [key: string]: boolean } = {};
      const initialRetweets: { [key: string]: boolean } = {};
      
      searchResults.tweets.forEach(tweet => {
        console.log(`📝 Tweet ${tweet.id}:`, {
          content: tweet.content?.substring(0, 50) + '...',
          user_interaction: tweet.user_interaction,
          stats: tweet.stats
        });
        
        if (tweet.user_interaction) {
          initialLikes[tweet.id] = tweet.user_interaction.is_liked || false;
          initialRetweets[tweet.id] = tweet.user_interaction.is_retweeted || false;
          console.log(`✅ Tweet ${tweet.id} - Like: ${initialLikes[tweet.id]}, Retweet: ${initialRetweets[tweet.id]}`);
        } else {
          console.log(`⚠️ Tweet ${tweet.id} - Pas d'interaction utilisateur`);
          initialLikes[tweet.id] = false;
          initialRetweets[tweet.id] = false;
        }
      });
      
      console.log('📊 États initiaux (useEffect):', { likes: initialLikes, retweets: initialRetweets });
      setLikedTweets(prev => ({ ...prev, ...initialLikes }));
      setRetweetedTweets(prev => ({ ...prev, ...initialRetweets }));
    }
  }, [searchResults.tweets]);

  useEffect(() => {
    return () => {
      if (summaryAnimationIntervalRef.current) {
        clearInterval(summaryAnimationIntervalRef.current);
      }
    };
  }, []);

  const stopSummaryAnimation = () => {
    if (summaryAnimationIntervalRef.current) {
      clearInterval(summaryAnimationIntervalRef.current);
      summaryAnimationIntervalRef.current = null;
    }
  };

  const parseSummaryContent = (
    rawSummary: string,
    results: { users: User[]; tweets: Tweet[] }
  ) => {
    const userIds = Array.from(new Set((rawSummary.match(/\[USER:([^\]]+)\]/g) || []).map((m) => m.replace('[USER:', '').replace(']', '').trim())));
    const tweetIds = Array.from(new Set((rawSummary.match(/\[TWEET:([^\]]+)\]/g) || []).map((m) => m.replace('[TWEET:', '').replace(']', '').trim())));

    const users = (results.users || []).filter((u) => userIds.includes(String(u.id)));
    const tweets = (results.tweets || []).filter((t) => tweetIds.includes(String(t.id)));

    const usersMap = new Map(users.map((u) => [String(u.id), u]));

    const textWithUsers = rawSummary.replace(/\[USER:([^\]]+)\]/g, (_full, id) => {
      const user = usersMap.get(String(id).trim());
      if (!user?.username) return '';
      return `@${user.username}`;
    });

    const text = textWithUsers
      .replace(/\[TWEET:[^\]]+\]/g, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([,.;!?])/g, '$1')
      .trim();

    return { text, users, tweets };
  };

  const getStableSummaryCacheKey = (query: string, filter: 'all' | 'users' | 'tweets' | 'trends') => {
    const stableQuery = query
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/^#+/, '#')
      .toLowerCase();
    return `${filter}:${stableQuery}`;
  };

  const animateCachedSummary = (
    summaryText: string,
    speedMs = Math.max(1, Math.floor(SUMMARY_ANIM_BASE_MS / SUMMARY_ANIM_CACHED_MULTIPLIER))
  ) => {
    stopSummaryAnimation();
    setDisplayedAiSummary('');
    let currentIndex = 0;

    summaryAnimationIntervalRef.current = setInterval(() => {
      currentIndex += 3;
      const partialRaw = summaryText.slice(0, currentIndex);
      const parsed = parseSummaryContent(partialRaw, searchResults);
      setDisplayedAiSummary(parsed.text);
      if (currentIndex >= summaryText.length) {
        stopSummaryAnimation();
      }
    }, speedMs);
  };

  const generateSearchSummary = async (
    query: string,
    results: { users: User[]; tweets: Tweet[]; hashtags?: Array<{ tag: string; count: number }> },
    filter: 'all' | 'users' | 'tweets' | 'trends'
  ) => {
    const requestId = ++summaryRequestIdRef.current;
    stopSummaryAnimation();

    setAiSummaryLoading(true);
    setAiSummaryStatus('');
    setDisplayedAiSummary('');
    setAiSummaryRefs({ users: [], tweets: [] });

    let streamText = '';
    const payload = {
      q: query,
      type: filter,
      users: results.users || [],
      tweets: results.tweets || [],
      hashtags: results.hashtags || []
    };

    let streamResponse = await apiService.streamSearchSummaryWs(
      payload,
      (chunk: string) => {
        if (requestId !== summaryRequestIdRef.current) return;
        streamText += chunk;
        const parsed = parseSummaryContent(streamText, results);
        setDisplayedAiSummary(parsed.text);
        setAiSummaryRefs({ users: parsed.users, tweets: parsed.tweets });
      },
      (status: string) => {
        if (requestId !== summaryRequestIdRef.current) return;
        setAiSummaryStatus(status);
      }
    );

    if (!streamResponse.success) {
      // Retry WS unique pour eviter les 502 frequents sur le fallback HTTP/SSE
      await new Promise((resolve) => setTimeout(resolve, 250));
      streamResponse = await apiService.streamSearchSummaryWs(
        payload,
        (chunk: string) => {
          if (requestId !== summaryRequestIdRef.current) return;
          streamText += chunk;
          const parsed = parseSummaryContent(streamText, results);
          setDisplayedAiSummary(parsed.text);
          setAiSummaryRefs({ users: parsed.users, tweets: parsed.tweets });
        },
        (status: string) => {
          if (requestId !== summaryRequestIdRef.current) return;
          setAiSummaryStatus(status);
        }
      );
    }

    if (requestId !== summaryRequestIdRef.current) return;

    const finalText = (streamResponse.text || streamText || '').trim();
    if (finalText) {
      const parsed = parseSummaryContent(finalText, results);
      setDisplayedAiSummary(parsed.text);
      setAiSummaryRefs({ users: parsed.users, tweets: parsed.tweets });
      setAiSummaryStatus('');
    } else {
      setDisplayedAiSummary('');
      setAiSummaryRefs({ users: [], tweets: [] });
      setAiSummaryStatus('');
    }

    setAiSummaryLoading(false);
  };

  const fetchTrendingHashtags = async () => {
    try {
      const response = await apiService.getTrendingHashtags({ limit: 10, period: '24h' });
      if (response.success && response.data) {
        setTrendingHashtags(response.data.hashtags || []);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des hashtags tendance:', error);
    }
  };

  const performSearch = async (query: string, filterOverride?: 'all' | 'users' | 'tweets' | 'trends') => {
    if (!query.trim()) {
      setSearchResults({ users: [], tweets: [] });
      setDisplayedAiSummary('');
      setAiSummaryRefs({ users: [], tweets: [] });
      setAiSummaryLoading(false);
      setAiSummaryStatus('');
      stopSummaryAnimation();
      return;
    }

    try {
      setLoading(true);
      const filterForSearch = filterOverride || activeFilter;
      // Normaliser les hashtags: éviter les doublons de '#'
      const normalizedQuery = query.replace(/^#+/, '#');

      // Nouvelle recherche: on invalide les streams precedents et on evite d'afficher l'ancien resume.
      summaryRequestIdRef.current += 1;
      stopSummaryAnimation();
      setAiSummaryStatus('');
      setAiSummaryLoading(false);
      setDisplayedAiSummary('');
      setAiSummaryRefs({ users: [], tweets: [] });
      
      // Vérifier si on a un token valide
      if (!currentToken) {
        console.log('⚠️ Pas de token d\'authentification, recherche publique');
        // Continuer avec la recherche publique (sans token)
      } else {
        console.log('🔑 Token d\'authentification disponible pour la recherche');
      }
      
      let response;
      switch (filterForSearch) {
        case 'users':
          response = await apiService.searchUsers({ q: normalizedQuery, limit: 20 }, currentToken);
          if (response.success && response.data) {
            const users = response.data.users || [];
            setSearchResults({ users, tweets: [] });
            generateSearchSummary(normalizedQuery, { users, tweets: [] }, filterForSearch).catch((err) => {
              console.error('❌ Erreur génération résumé IA (users):', err);
            });
          }
          break;
        case 'tweets':
          response = await apiService.searchTweets({ q: normalizedQuery, limit: 20 }, currentToken);
          if (response.success && response.data) {
            const tweets = response.data.tweets || [];
            setSearchResults({ users: [], tweets });
            generateSearchSummary(normalizedQuery, { users: [], tweets }, filterForSearch).catch((err) => {
              console.error('❌ Erreur génération résumé IA (tweets):', err);
            });
          }
          break;
        default:
          response = await apiService.search({ q: normalizedQuery, limit: 20 }, currentToken);
          if (response.success && response.data) {
            const anyData: any = response.data as any;
            console.log('🔍 Recherche globale - Réponse complète:', JSON.stringify(anyData, null, 2));
            
            const users = anyData.results?.users || anyData.users || [];
            const tweets = anyData.results?.tweets || anyData.tweets || [];
            
            console.log('🔍 Recherche globale - Users extraits:', users.length);
            console.log('🔍 Recherche globale - Tweets extraits:', tweets.length);
            
            // Log du premier tweet pour vérifier la structure
            if (tweets.length > 0) {
              console.log('🔍 Premier tweet de la recherche globale:', {
                id: tweets[0].id,
                content: tweets[0].content?.substring(0, 50),
                user_interaction: tweets[0].user_interaction,
                stats: tweets[0].stats
              });
            }
            
            // Mettre à jour les résultats de recherche (le useEffect s'occupera des états d'interaction)
            setSearchResults({ users, tweets });
            console.log('🔍 Recherche globale - Résultats mis à jour, useEffect va initialiser les interactions');
            generateSearchSummary(normalizedQuery, { users, tweets, hashtags: anyData.results?.hashtags || [] }, filterForSearch).catch((err) => {
              console.error('❌ Erreur génération résumé IA (all):', err);
            });
          }
          break;
      }
    } catch (error) {
      console.error('Erreur lors de la recherche:', error);
      
      // Gestion spécifique des erreurs d'authentification
      if (error && typeof error === 'object' && 'message' in error) {
        const errorMessage = (error as any).message;
        if (errorMessage.includes('401') || errorMessage.includes('Token') || errorMessage.includes('authentification')) {
          console.log('🔐 Erreur d\'authentification, tentative de rafraîchissement du token');
          // Rafraîchir le token et réessayer
          try {
            const newToken = await tokenStore.getAccessToken();
            setCurrentToken(newToken);
            if (newToken) {
              console.log('🔄 Token rafraîchi, nouvelle tentative de recherche');
              // Réessayer la recherche avec le nouveau token
              performSearch(query);
              return;
            }
          } catch (refreshError) {
            console.error('❌ Erreur lors du rafraîchissement du token:', refreshError);
          }
        }
      }
      
      toast.error('Impossible d\'effectuer la recherche');
      setSearchResults({ users: [], tweets: [] });
      setDisplayedAiSummary('');
      setAiSummaryRefs({ users: [], tweets: [] });
      setAiSummaryStatus('');
    } finally {
      setLoading(false);
    }
  };

  performSearchRef.current = performSearch;

  // Ouvre / exécute la recherche quand on arrive depuis un # ou un lien (params de route)
  // Ne pas dépendre de currentToken : au chargement du token, un re-run annulait le rAF/setTimeout
  // avant performSearch (cleanup), alors que les params étaient déjà effacés → champ rempli mais 0 résultat.
  useEffect(() => {
    const q = route.params?.query;
    if (typeof q !== 'string' || !q.trim()) return;

    const queryStr = q.trim();
    const st = route.params?.searchType;
    let filter: 'all' | 'users' | 'tweets' | 'trends' = 'all';
    if (st === 'hashtags' || queryStr.startsWith('#')) filter = 'tweets';
    else if (st === 'users' || queryStr.startsWith('@')) filter = 'users';

    setSearchQuery(queryStr);
    setActiveFilter(filter);
    (navigation as any).setParams({ query: undefined, searchType: undefined });

    const t = setTimeout(() => {
      performSearchRef.current(queryStr, filter);
    }, 0);
    return () => clearTimeout(t);
  }, [route.params?.query, route.params?.searchType, navigation]);

  /**
   * Stable (`useCallback` sans dépendance) : une identité neuve à chaque rendu
   * ferait re-rendre `SearchBar`, et l'isoler n'aurait servi à rien.
   * `performSearchRef` est réaffecté à chaque rendu, il porte donc toujours la
   * version courante — c'est déjà le motif retenu ailleurs dans ce fichier.
   */
  const handleSubmitQuery = useCallback((query: string) => {
    setSearchQuery(query);
    if (query.trim()) {
      performSearchRef.current(query);
    }
  }, []);

  const handleFilterChange = (filter: 'all' | 'users' | 'tweets' | 'trends') => {
    setActiveFilter(filter);
    if (searchQuery.trim()) {
      performSearch(searchQuery, filter);
    }
  };

  const handleHashtagPress = (hashtag: string) => {
    const cleanTag = hashtag.replace(/^#+/, '');
    setSearchQuery(`#${cleanTag}`);
    setActiveFilter('tweets');
    performSearch(`#${cleanTag}`, 'tweets');
  };

  const handleUserPress = useCallback((user: User) => {
    if (user.id) {
      (navigation as any).navigate('UserProfile', {
        userId: user.id,
        username: user.username
      });
    }
  }, [navigation]);

  /**
   * Même motif de ref-latch que pour les interactions de tweet plus bas : la
   * ligne de résultat est mémoïsée, et un handler recréé à chaque rendu la
   * ferait re-rendre malgré tout — notamment pendant que le résumé IA arrive
   * caractère par caractère.
   */
  const followingUsersRef = useRef(followingUsers);
  const followLoadingRef = useRef(followLoading);
  useEffect(() => {
    followingUsersRef.current = followingUsers;
  }, [followingUsers]);
  useEffect(() => {
    followLoadingRef.current = followLoading;
  }, [followLoading]);

  const handleFollowToggle = useCallback(async (targetUser: User) => {
    if (!targetUser.id || followLoadingRef.current[targetUser.id]) return;
    const isFollowing = followingUsersRef.current[targetUser.id] || false;
    setFollowLoading((prev) => ({ ...prev, [targetUser.id]: true }));
    try {
      const res = isFollowing
        ? await apiService.unfollowUser(targetUser.id)
        : await apiService.followUser(targetUser.id);
      if (res.success) {
        setFollowingUsers((prev) => ({ ...prev, [targetUser.id]: !isFollowing }));
      } else {
        toast.error(isFollowing ? 'Impossible de se désabonner' : 'Impossible de suivre');
      }
    } catch {
      toast.error('Une erreur est survenue');
    } finally {
      setFollowLoading((prev) => ({ ...prev, [targetUser.id]: false }));
    }
  }, []);

  /**
   * Handlers d'identité stable : le comparateur de `TweetCard` compare les
   * callbacks par référence. L'état des interactions est donc lu par
   * référence plutôt que capturé dans la closure.
   */
  const likedTweetsRef = useRef(likedTweets);
  const retweetedTweetsRef = useRef(retweetedTweets);
  useEffect(() => {
    likedTweetsRef.current = likedTweets;
  }, [likedTweets]);
  useEffect(() => {
    retweetedTweetsRef.current = retweetedTweets;
  }, [retweetedTweets]);

  // Gestion des likes
  const handleLike = useCallback(async (tweetId: string) => {
    console.log(`❤️ Gestion du like pour le tweet ${tweetId}`);
    console.log(`📊 État actuel - Liked: ${likedTweetsRef.current[tweetId]}, Retweeted: ${retweetedTweetsRef.current[tweetId]}`);

    try {
      const wasLiked = likedTweetsRef.current[tweetId] || false;
      console.log(`❤️ Changement de like: ${wasLiked} -> ${!wasLiked}`);
      
      // Optimistic update - mettre à jour l'état local immédiatement
      setLikedTweets(prev => {
        const newState = { ...prev, [tweetId]: !wasLiked };
        console.log(`📝 Nouvel état des likes:`, newState);
        return newState;
      });
      
      // Mettre à jour les statistiques ET les interactions utilisateur du tweet dans les résultats
      setSearchResults(prev => {
        const newResults = {
          ...prev,
          tweets: prev.tweets.map(tweet => {
            if (tweet.id === tweetId) {
              const currentLikes = tweet.stats?.likes || 0;
              const newLikes = wasLiked ? currentLikes - 1 : currentLikes + 1;
              console.log(`📊 Mise à jour stats - Tweet ${tweetId}: ${currentLikes} -> ${newLikes}`);
              
              return {
                ...tweet,
                stats: {
                  ...tweet.stats,
                  likes: newLikes
                },
                user_interaction: {
                  ...tweet.user_interaction,
                  is_liked: !wasLiked
                }
              };
            }
            return tweet;
          })
        };
        console.log(`📝 Résultats mis à jour pour le tweet ${tweetId}`);
        return newResults;
      });
      
      console.log(`🌐 Envoi de la requête API pour ${wasLiked ? 'unlike' : 'like'} le tweet ${tweetId}`);
      const response = await apiService.likeTweet(tweetId);
      
      if (!response.success) {
        console.log(`❌ API échouée, revert de l'état pour le tweet ${tweetId}`);
        // Revert si l'API échoue
        setLikedTweets(prev => ({ ...prev, [tweetId]: wasLiked }));
        setSearchResults(prev => ({
          ...prev,
          tweets: prev.tweets.map(tweet => {
            if (tweet.id === tweetId) {
              const currentLikes = tweet.stats?.likes || 0;
              return {
                ...tweet,
                stats: {
                  ...tweet.stats,
                  likes: wasLiked ? currentLikes : currentLikes - 1
                },
                user_interaction: {
                  ...tweet.user_interaction,
                  is_liked: wasLiked
                }
              };
            }
            return tweet;
          })
        }));
        toast.error('Impossible de liker le tweet');
      } else {
        console.log(`✅ Like ${wasLiked ? 'supprimé' : 'ajouté'} avec succès pour le tweet ${tweetId}`);
      }
    } catch (error) {
      console.error(`❌ Erreur lors du like du tweet ${tweetId}:`, error);
      // Revert en cas d'erreur
      const wasLiked = likedTweetsRef.current[tweetId] || false;
      setLikedTweets(prev => ({ ...prev, [tweetId]: wasLiked }));
      setSearchResults(prev => ({
        ...prev,
        tweets: prev.tweets.map(tweet => {
          if (tweet.id === tweetId) {
            const currentLikes = tweet.stats?.likes || 0;
            return {
              ...tweet,
              stats: {
                ...tweet.stats,
                likes: wasLiked ? currentLikes : currentLikes - 1
              },
              user_interaction: {
                ...tweet.user_interaction,
                is_liked: wasLiked
              }
            };
          }
          return tweet;
        })
      }));
      toast.error('Impossible de liker le tweet');
    }
  }, []);

  // Gestion des retweets
  const handleRetweet = useCallback(async (tweetId: string) => {
    console.log(`🔄 Gestion du retweet pour le tweet ${tweetId}`);
    console.log(`📊 État actuel - Liked: ${likedTweetsRef.current[tweetId]}, Retweeted: ${retweetedTweetsRef.current[tweetId]}`);

    try {
      const wasRetweeted = retweetedTweetsRef.current[tweetId] || false;
      console.log(`🔄 Changement de retweet: ${wasRetweeted} -> ${!wasRetweeted}`);
      
      // Optimistic update - mettre à jour l'état local immédiatement
      setRetweetedTweets(prev => {
        const newState = { ...prev, [tweetId]: !wasRetweeted };
        console.log(`📝 Nouvel état des retweets:`, newState);
        return newState;
      });
      
      // Mettre à jour les statistiques ET les interactions utilisateur du tweet dans les résultats
      setSearchResults(prev => {
        const newResults = {
          ...prev,
          tweets: prev.tweets.map(tweet => {
            if (tweet.id === tweetId) {
              const currentRetweets = tweet.stats?.retweets || 0;
              const newRetweets = wasRetweeted ? currentRetweets - 1 : currentRetweets + 1;
              console.log(`📊 Mise à jour stats - Tweet ${tweetId}: ${currentRetweets} -> ${newRetweets}`);
              
              return {
                ...tweet,
                stats: {
                  ...tweet.stats,
                  retweets: newRetweets
                },
                user_interaction: {
                  ...tweet.user_interaction,
                  is_retweeted: !wasRetweeted
                }
              };
            }
            return tweet;
          })
        };
        console.log(`📝 Résultats mis à jour pour le tweet ${tweetId}`);
        return newResults;
      });
      
      console.log(`🌐 Envoi de la requête API pour ${wasRetweeted ? 'unretweet' : 'retweet'} le tweet ${tweetId}`);
      const response = await apiService.retweet(tweetId);
      
      if (!response.success) {
        console.log(`❌ API échouée, revert de l'état pour le tweet ${tweetId}`);
        // Revert si l'API échoue
        setRetweetedTweets(prev => ({ ...prev, [tweetId]: wasRetweeted }));
        setSearchResults(prev => ({
          ...prev,
          tweets: prev.tweets.map(tweet => {
            if (tweet.id === tweetId) {
              const currentRetweets = tweet.stats?.retweets || 0;
              return {
                ...tweet,
                stats: {
                  ...tweet.stats,
                  retweets: wasRetweeted ? currentRetweets : currentRetweets - 1
                },
                user_interaction: {
                  ...tweet.user_interaction,
                  is_retweeted: wasRetweeted
                }
              };
            }
            return tweet;
          })
        }));
        toast.error('Impossible de retweeter');
      } else {
        console.log(`✅ Retweet ${wasRetweeted ? 'supprimé' : 'ajouté'} avec succès pour le tweet ${tweetId}`);
      }
    } catch (error) {
      console.error(`❌ Erreur lors du retweet du tweet ${tweetId}:`, error);
      // Revert en cas d'erreur
      const wasRetweeted = retweetedTweetsRef.current[tweetId] || false;
      setRetweetedTweets(prev => ({ ...prev, [tweetId]: wasRetweeted }));
      setSearchResults(prev => ({
        ...prev,
        tweets: prev.tweets.map(tweet => {
          if (tweet.id === tweetId) {
            const currentRetweets = tweet.stats?.retweets || 0;
            return {
              ...tweet,
              stats: {
                ...tweet.stats,
                retweets: wasRetweeted ? currentRetweets : currentRetweets - 1
              },
              user_interaction: {
                ...tweet.user_interaction,
                is_retweeted: wasRetweeted
              }
            };
          }
          return tweet;
        })
      }));
      toast.error('Impossible de retweeter');
    }
  }, []);

  // Gestion des réponses
  const handleReply = useCallback((tweetId: string) => {
    (navigation as any).navigate('CreateTweet', {
      replyTo: tweetId,
      isReply: true
    });
  }, [navigation]);

  // Gestion du partage
  const handleShare = useCallback((tweetId: string) => {
    // Implémenter le partage
    toast.info('Partage', {
      description: 'Fonctionnalité de partage à venir',
    });
  }, []);

  const handleBookmark = (tweetId: string) => {
    // 📌 Bookmark
    console.log('Bookmark:', tweetId);
    toast.success('Tweet ajouté aux favoris');
  };

  const handleSkip = (tweetId: string) => {
    // ⏭️ Skip
    console.log('Skip:', tweetId);
    toast.info('Tweet ignoré', {
      description: 'Ce tweet n\'apparaîtra plus',
    });
  };

  const handleBlock = (userId: string) => {
    // 🚫 Block
    console.log('Block:', userId);
    toast.success('Cet utilisateur a été bloqué');
  };

  /* Le decor de l'etat vide : le bloc n'apparait qu'une fois la pluie prete. */
  const { pret: pluiePrete, onSettled: onDecorPluie } = useSceneReveal();

  const renderUserItem = (user: User, index: number) => (
    <UserResultRow
      key={user.id || index}
      user={user}
      isFollowing={!!followingUsers[user.id]}
      isFollowLoading={!!followLoading[user.id]}
      onPress={handleUserPress}
      onFollowToggle={handleFollowToggle}
    />
  );

  /**
   * Les interactions sont fusionnées au niveau des DONNÉES, plus au rendu :
   * l'ancienne version fabriquait deux objets neufs par tweet et par rendu de
   * l'écran — donc aussi à chaque caractère du résumé IA qui arrive en
   * flux — et traçait une ligne de console par tweet au passage.
   */
  const tweetsWithInteractions = useMemo(
    () =>
      (searchResults.tweets || []).map((tweet) => ({
        ...tweet,
        user_interaction: {
          is_liked: likedTweets[tweet.id] || false,
          is_retweeted: retweetedTweets[tweet.id] || false,
        },
      })),
    [searchResults.tweets, likedTweets, retweetedTweets],
  );

  const renderTweetItem = (tweet: Tweet, index: number) => (
    <View key={tweet.id || index} style={styles.tweetItem}>
      <TweetCard
        tweet={tweet}
        onLike={handleLike}
        onRetweet={handleRetweet}
        onReply={handleReply}
        onShare={handleShare}
        compact={false}
      />
    </View>
  );

  return (
    <ScreenBackground>
    <View style={[styles.container, eventStyles.container]}>
      <View style={styles.gradient}>
        {/* ── Event banners ── */}
        <EventBanner />
        
        {/* ── Bannière de ban/suspension ── */}
        <BanAlertBanner />
        
        <View style={[styles.topBar, eventStyles.header, { paddingTop: headerTopInset }]}>
          <TouchableOpacity
            onPress={() => (navigation as any).navigate('Profil')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.topBarSide}
          >
            <Avatar size={34} username={user?.username || 'U'} uri={(user as any)?.avatar} />
          </TouchableOpacity>
          <Text style={[styles.topBarTitle, eventStyles.headerText]}>Recherche</Text>
          <View style={styles.topBarSide} />
        </View>

      {/* Barre de recherche */}
      <SearchBar seed={searchQuery} onSubmit={handleSubmitQuery} />

      {/* Filtres */}
      <View style={styles.filtersContainer}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersScroll}
        >
          {[
            { key: 'all', label: 'Tout' },
            { key: 'users', label: 'Personnes' },
            { key: 'tweets', label: 'Publications' },
            { key: 'trends', label: 'Tendances' },
          ].map((filter) => (
            <TouchableOpacity
              key={filter.key}
              onPress={() => handleFilterChange(filter.key as any)}
              style={[
                styles.filterButton,
                activeFilter === filter.key && styles.filterButtonActive
              ]}
            >
              <Text style={[
                styles.filterButtonText,
                activeFilter === filter.key && styles.filterButtonTextActive
              ]}>
                {filter.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Contenu principal */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Platform.OS === 'ios' ? 100 : 20 }
        ]}
        showsVerticalScrollIndicator={false}
      >
        {loading && <ScreenSkeleton variant="feed" count={5} />}

        {!loading && searchQuery.trim() && (
          <>
            {(displayedAiSummary || aiSummaryLoading) && (
              <View style={styles.aiSummaryCard}>
                <View style={styles.aiSummaryHeader}>
                  <Text style={styles.aiSummaryTitle}>Résumé</Text>
                </View>
                <Text style={styles.aiSummaryText}>
                  {(displayedAiSummary || '') + (aiSummaryLoading ? ' ▌' : '')}
                </Text>
                {aiSummaryLoading && !!aiSummaryStatus && (
                  <Text style={styles.aiSummaryStatusText}>{aiSummaryStatus}</Text>
                )}
                {aiSummaryRefs.users.length > 0 && (
                  <View style={styles.aiRefSection}>
                    <Text style={styles.aiRefLabel}>Comptes cites</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {aiSummaryRefs.users.map((u) => (
                        <TouchableOpacity key={u.id} style={styles.aiRefChip} onPress={() => handleUserPress(u)}>
                          <Text style={styles.aiRefChipText}>@{u.username}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
                {aiSummaryRefs.tweets.length > 0 && (
                  <View style={styles.aiRefSection}>
                    <Text style={styles.aiRefLabel}>Tweets cites</Text>
                    {aiSummaryRefs.tweets.slice(0, 2).map((tweet, index) => (
                      <View key={tweet.id || index} style={styles.aiRefTweetCard}>
                        {renderTweetItem(tweet, index)}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Résultats des utilisateurs */}
            {(searchResults?.users?.length || 0) > 0 && (
              <View style={styles.resultsSection}>
                <Text style={styles.sectionTitle}>
                  Personnes ({searchResults.users.length})
                </Text>
                {searchResults.users.map(renderUserItem)}
              </View>
            )}

            {/* Résultats des tweets */}
            {(searchResults?.tweets?.length || 0) > 0 && (
              <View style={styles.resultsSection}>
                <Text style={styles.sectionTitle}>
                  Publications ({searchResults.tweets.length})
                </Text>
                {tweetsWithInteractions.map(renderTweetItem)}
              </View>
            )}

            {/* Aucun résultat : il pleut sur le rebord. */}
            {(searchResults?.users?.length || 0) === 0 && (searchResults?.tweets?.length || 0) === 0 && (
              <View style={styles.videSousLaPluie}>
                {/* La scene ne porte NI cadre NI voile : transparente, elle se
                    fond dans l'ecran au lieu d'y poser une vignette. Le texte
                    passe donc dessous, dans les couleurs du theme — il reste
                    lisible en clair comme en sombre sans rien teinter.

                    Le bloc entier attend le decor : sans ca le texte s'affiche
                    d'abord, et la pluie arrive par-dessus une demi-seconde
                    plus tard. */}
                <View style={styles.scenePluie}>
                  <SceneCanvas scene="02-pluie" onSettled={onDecorPluie} />
                </View>

                {!pluiePrete && (
                  <View style={styles.videAttente} pointerEvents="none">
                    <Skeleton width="52%" height={20} />
                    <Skeleton width="72%" height={14} style={styles.videAttenteLigne} />
                  </View>
                )}

                <SceneReveal visible={pluiePrete} style={styles.videTextes}>
                  <Text style={styles.videTitre}>Aucun résultat</Text>
                  <Text style={styles.videTexte} numberOfLines={2}>
                    Rien pour « {searchQuery.trim()} ». Essaie autre chose.
                  </Text>
                </SceneReveal>
              </View>
            )}
          </>
        )}

        {/* Hashtags tendance */}
        {!loading && !searchQuery.trim() && (
          <View style={styles.trendingSection}>
            <Text style={styles.sectionTitle}>Tendances pour vous</Text>
            
            {(trendingHashtags?.length || 0) > 0 ? (
              trendingHashtags.map((hashtag, index) => (
                <TouchableOpacity
                  key={index}
                  onPress={() => handleHashtagPress(hashtag.tag)}
                  style={styles.trendingItem}
                  activeOpacity={0.7}
                >
                  <View style={styles.trendingContent}>
                    <Text style={styles.trendingHashtag}>#{hashtag.tag.replace(/^#+/, '')}</Text>
                    <Text style={styles.trendingCount}>{formatNumber(hashtag.count)} Tweets</Text>
                  </View>
                  <View style={styles.trendingOptions} pointerEvents="none">
                    <Ionicons name="ellipsis-horizontal" size={16} color={colors.textSecondary} />
                  </View>
                </TouchableOpacity>
              ))
            ) : (
              <EmptyState icon="trending-up-outline" title="Aucune tendance" message="Reviens plus tard pour voir ce qui buzz." />
            )}
          </View>
        )}

        {/* Suggestions d'utilisateurs IA */}
        {!loading && !searchQuery.trim() && (
          <UserSuggestions />
        )}
      </ScrollView>
      </View>

    </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  gradient: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  topBarSide: { width: 34 },
  topBarTitle: {
    fontSize: 16,
    fontFamily: fonts.heading,
    color: colors.textPrimary,
  },
  searchBarContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 16,
    fontFamily: fonts.medium,
  },
  clearButton: {
    padding: 4,
  },
  filtersContainer: {
    paddingVertical: 10,
  },
  filtersScroll: {
    paddingHorizontal: 20,
  },
  filterButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: radius.round,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterButtonActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentMuted,
  },
  filterButtonText: {
    color: colors.textSecondary,
    fontSize: 13.5,
    fontFamily: fonts.medium,
  },
  filterButtonTextActive: {
    color: colors.accent,
    fontFamily: fonts.semibold,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  aiSummaryCard: {
    marginTop: 18,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentMuted,
  },
  aiSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  aiSummaryTitle: {
    marginLeft: 6,
    color: colors.accent,
    fontSize: 14,
    fontFamily: fonts.bold,
  },
  aiSummaryText: {
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.medium,
  },
  aiSummaryStatusText: {
    marginTop: 8,
    color: colors.textSecondary,
    fontSize: 12,
    fontStyle: 'italic',
  },
  aiRefSection: {
    marginTop: 12,
  },
  aiRefLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontFamily: fonts.bold,
    marginBottom: 8,
  },
  aiRefChip: {
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    marginRight: 8,
  },
  aiRefChipText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontFamily: fonts.semibold,
  },
  aiRefTweetCard: {
    marginBottom: 8,
  },
  videSousLaPluie: {
    marginTop: 20,
    paddingBottom: 28,
    alignItems: 'center',
  },
  /**
   * `SceneCanvas` se pose en absolu : sans hauteur explicite ici, il n'aurait
   * rien à remplir et la scène serait invisible.
   */
  scenePluie: {
    width: '100%',
    height: 300,
  },
  videTextes: {
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  videAttente: {
    alignItems: 'center',
    paddingTop: 16,
    gap: 0,
  },
  videAttenteLigne: { marginTop: 10 },
  videTitre: {
    marginTop: 14,
    color: colors.textPrimary,
    fontFamily: fonts.display,
    fontSize: 19,
    lineHeight: 25,
    textAlign: 'center',
  },
  videTexte: {
    marginTop: 8,
    maxWidth: 320,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  resultsSection: {
    marginVertical: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  userItem: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    marginBottom: 8,
  },
  userContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  userAvatar: {
    width: 56,
    height: 56,
    borderRadius: 16,
    marginRight: 16,
    backgroundColor: colors.surfaceAlt,
  },
  userInfo: {
    flex: 1,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  userFullName: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
    marginRight: 6,
  },
  verifiedIcon: {
    marginLeft: 4,
  },
  userUsername: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  userStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userStat: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  statSeparator: {
    color: colors.textMuted,
    marginHorizontal: 8,
  },
  followButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: radius.md,
    minWidth: 78,
    alignItems: 'center',
  },
  followingButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  followButtonText: {
    color: colors.onAccent,
    fontSize: 13,
    fontFamily: fonts.bold,
  },
  followingButtonText: {
    color: colors.textPrimary,
  },
  tweetItem: {
    marginBottom: 12,
  },
  noResultsContainer: {
    alignItems: 'center',
    paddingVertical: 80,
  },
  noResultsTitle: {
    fontSize: 20,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
    marginTop: 16,
    marginBottom: 8,
  },
  noResultsSubtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  trendingSection: {
    marginTop: 20,
  },
  trendingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
    borderRadius: 14,
    marginBottom: 8,
  },
  trendingContent: {
    flex: 1,
  },
  trendingCategory: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 4,
  },
  trendingHashtag: {
    fontSize: 17,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  trendingCount: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  trendingOptions: {
    padding: 8,
    marginLeft: 16,
  },
  noTrendingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: colors.surface,
    borderRadius: 14,
  },
  noTrendingText: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});