/**
 * 🧪 Publication ouverte — version « 2B — Gouttière », sous `fil.refonte2b`.
 *
 * CLONE de `TweetDetailScreen.tsx`. L'original n'est pas touché : il continue
 * de servir les comptes hors du test, et le jour où l'essai est tranché, c'est
 * ce fichier-ci qui part (ou l'autre).
 *
 * ── Pourquoi cet écran devait suivre ─────────────────────────────────────
 * Depuis le fil 2B, un tweet s'ouvre en tapant dessus. On quittait donc une
 * page de papier — gouttière, filets, capitales espacées — pour retomber sur
 * des cartes arrondies et une rangée de cinq icônes grises. La refonte du fil
 * s'arrêtait au premier clic.
 *
 * ── Ce qui change, et rien d'autre ───────────────────────────────────────
 *   - la palette et les polices papier (`theme/paper2b`), via les objets `C`
 *     et `F` ci-dessous ;
 *   - l'en-tête : un chevron et un titre, sur un filet ;
 *   - la publication : l'engagement passe en GOUTTIÈRE, à gauche, comme dans
 *     le fil — le cœur et son compteur empilés, le repost dessous. La rangée
 *     de cinq icônes sous le texte disparaît ;
 *   - les réponses, rendues dans la MÊME grille, reliées au tweet par le rail
 *     de la gouttière ;
 *   - le compositeur de réponse : une ligne réglée, pas une boîte grise.
 *
 * ── Ce qui n'a pas bougé ─────────────────────────────────────────────────
 * Toute la logique : chargement, fil d'ancêtres, pagination des réponses,
 * traduction, contenu payant, modération, signalement, suivi d'interactions.
 * Le test porte sur la présentation ; deux écrans qui chargent différemment ne
 * se comparent plus.
 *
 * ── L'habillage d'événement est RETIRÉ ───────────────────────────────────
 * Il avait d'abord été conservé, en pariant qu'un thème actif quelques jours
 * par an ne valait pas de démonter trente styles conditionnels. C'était faux :
 * son dégradé se pose en `absoluteFill` SOUS tout le contenu, donc pendant une
 * fête la page entière virait au vert, avec l'en-tête resté noir par-dessus —
 * la refonte n'était visible qu'entre deux événements. Ce n'était pas un
 * habillage, c'était un écrasement.
 *
 * L'habillage du COMPTE (`profile_customization`, `PremiumTweetHolo`) reste,
 * lui : c'est une personnalisation payée, portée par l'auteur, pas un décor
 * global posé sur la page.
 *
 * ── La lumière premium impose une règle à toute la page ──────────────────
 * `PremiumTweetHolo` peint la couleur de l'auteur DERRIÈRE tout l'écran, sur
 * 540 px, et s'éteint en transparence avant ses bords pour qu'aucune arête
 * n'apparaisse jamais. Conséquence : **aucun bloc de cette page ne porte
 * d'aplat pleine largeur**. Un seul suffit à trancher le halo en deux et à
 * poser la bande noire que le composant existe pour éviter — l'en-tête et le
 * compositeur l'ont fait tous les deux avant d'être repassés en filets.
 *
 * Ce qui structure la page est donc TOUJOURS un filet, jamais une couleur.
 * Toute bande de fond ajoutée ici doit d'abord être vérifiée sur la
 * publication d'un compte Plus ou Pro.
 *
 * ── Une zone délibérément NON redessinée ─────────────────────────────────
 *   - la fiche « algorithme progressif » et le pied de page des publicités :
 *     l'une est un panneau de diagnostic ouvert depuis une icône que seuls
 *     les comptes en mode `progressive` voient, l'autre une surface de
 *     monétisation qui a ses propres règles. Aucune des deux n'est sur le
 *     chemin de lecture, et 2B ne prétend pas trancher pour elles.
 */

import { ScreenSkeleton } from '../components/ui';
import { paper, paperFonts, ps, GUTTER_W, ROW_PAD_X, ROW_GAP } from '../theme/paper2b';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, TextInput, Animated, ActivityIndicator, LayoutAnimation, UIManager, Modal, KeyboardAvoidingView } from 'react-native';
// La version de react-native (core) ne pose aucun inset sur Android — seule
// celle de react-native-safe-area-context protège le haut de l'écran partout.
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
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
import TweetImages from '../components/feed/TweetImages';
import TweetVideo from '../components/feed/TweetVideo';
import TweetVoiceMessage from '../components/feed/TweetVoiceMessage';
import TweetMusicCard from '../components/feed/TweetMusicCard';
import PaidContentLock from '../components/PaidContentLock';
import LockedText from '../components/LockedText';
import TweetLanguageSwitcher from '../components/TweetLanguageSwitcher';
import TranslationReveal from '../components/TranslationReveal';
// `ModerationActions` n'est PAS repris ici : c'est un panneau `BlurView` à
// tuiles dégradées, c'est-à-dire tout ce que 2B ne fait pas — et pour un
// tweet, il n'expose que deux actions. On appelle donc le service
// directement, avec la même confirmation et le même retour.
import { moderationService } from '../services/moderationService';
import { confirmAsync } from '../components/ui/ConfirmSheet';
import { useAdminPermissions } from '../hooks/useAdminPermissions';
import ReportSheet from '../components/ReportSheet';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { toast } from '../components/ui/Toast';
import trackingService from '../services/trackingService';
import { signalsFromTweet } from '../services/neuralRankService';


/**
 * La palette de l'écran, redirigée vers « papier ».
 *
 * On garde le MÊME objet qu'attendaient les ~200 usages de `colors` plutôt que
 * de les réécrire un par un : la seule chose qui change est ce qu'il pointe.
 * Un correctif porté de `TweetDetailScreen` vers ce clone s'applique alors
 * sans retouche de couleur. Même dispositif que dans `FeedGutterScreen`.
 */
const C = {
  bg: paper.bg,
  background: paper.bg,
  surface: paper.bgBand,
  surfaceAlt: paper.bgBand,
  border: paper.hairline,
  borderSubtle: paper.hairline,
  accent: paper.accent,
  accentMuted: paper.hairline,
  like: paper.accent,
  red: paper.accent,
  gold: paper.amber,
  success: paper.reposted,
  successMuted: paper.hairline,
  warningMuted: paper.hairline,
  shadow: paper.navShadow,
  text: paper.ink,
  textPrimary: paper.ink,
  textSecondary: paper.inkSoft,
  textMuted: paper.inkMeta,
};

/**
 * Les voix typographiques, dans le même esprit : le « bold » de l'original
 * devient l'Archivo des titres, son « regular » la grotesque de marque du
 * corps. Les styles hérités n'ont donc pas une seule famille à réécrire.
 */
const F = {
  bold: paperFonts.display,
  semibold: paperFonts.strong,
  medium: paperFonts.bodyStrong,
  regular: paperFonts.body,
  mono: paperFonts.mono,
};

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

/**
 * Formateurs sortis du composant : `toLocaleDateString` est le poste le plus
 * cher d'une ligne de réponse, et il était réinstancié à chaque frappe dans le
 * compositeur.
 */
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

/**
 * Le compteur d'une gouttière : rien plutôt qu'un zéro.
 *
 * Une colonne de « 0 » sous chaque cœur, c'est vingt chiffres qui ne disent
 * rien et qui pèsent autant que ceux qui disent quelque chose. Le fil applique
 * déjà cette règle (`fmtCount` dans `TweetRow`).
 */
const gutterCount = (num: number) => (num > 0 ? formatNumber(num) : '');

/**
 * La ligne de méta d'un ancêtre : « 3 J'AIME · 1 REPOST · 1 RÉPONSE ».
 *
 * Les compteurs à zéro sont omis plutôt qu'affichés à 0 — et si tout est à
 * zéro la ligne entière disparaît, au lieu de laisser « 0 · 0 · 0 » sous un
 * message que personne n'a encore lu.
 */
const ancestorMeta = (t: any): string => {
  const parts: string[] = [];
  const likes = t?.stats?.likes || 0;
  const retweets = t?.stats?.retweets || 0;
  const replies = t?.stats?.replies || 0;
  if (likes > 0) parts.push(`${formatNumber(likes)} J'AIME`);
  if (retweets > 0) parts.push(`${formatNumber(retweets)} REPOST${retweets > 1 ? 'S' : ''}`);
  if (replies > 0) parts.push(`${formatNumber(replies)} RÉPONSE${replies > 1 ? 'S' : ''}`);
  return parts.join(' · ');
};

interface ReplyItemProps {
  reply: Tweet;
  navigation: any;
  onLike: (replyId: string) => void;
  onRetweet: (replyId: string) => void;
  liking: boolean;
  retweeting: boolean;
  likeAnim: Animated.Value;
  retweetAnim: Animated.Value;
}

/**
 * Une réponse, isolée et mémoïsée.
 *
 * Le bloc vivait en ligne dans le `.map()` de l'écran : taper un caractère
 * dans le compositeur re-rendait les vingt réponses, animations et badges
 * compris. Le rendu est repris tel quel, à l'identique.
 */
function ReplyItemBase({
  reply,
  navigation,
  onLike,
  onRetweet,
  liking,
  retweeting,
  likeAnim,
  retweetAnim,
}: ReplyItemProps) {
  const isLiked = !!(reply as any)?.user_interaction?.is_liked;
  const isRetweeted = !!(reply as any)?.user_interaction?.is_retweeted;
  const open = () => navigation.push('TweetDetail', { tweetId: reply.id, isThread: true });

  return (
    <View style={styles.replyItem}>
      {/* ── La gouttière d'une réponse ──
          La même colonne qu'ailleurs, en plus petit : le cœur et son compteur
          empilés, le repost dessous. C'est ce qui remplace la rangée de
          quatre icônes grises que l'original posait sous chaque réponse — et
          dont la première (« répondre ») ne faisait qu'ouvrir la réponse,
          c'est-à-dire ce que fait déjà un appui n'importe où sur la ligne.

          Aucun rail ici : dans 2B le trait ne relie qu'un parent à SA
          réponse. Ces réponses-ci sont des sœurs, pas une chaîne — un trait
          les traversant dirait un enchaînement qui n'existe pas. */}
      <View style={styles.replyGutter}>
        <TouchableOpacity
          style={styles.gutterBtn}
          onPress={() => onLike(reply.id)}
          disabled={liking}
          hitSlop={{ top: 6, bottom: 6, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={isLiked ? 'Retirer le like' : 'Aimer cette réponse'}
        >
          <Animated.View style={{ transform: [{ scale: likeAnim }] }}>
            <Ionicons
              name={isLiked ? 'heart' : 'heart-outline'}
              size={ps(17)}
              color={isLiked ? C.like : C.textSecondary}
            />
          </Animated.View>
          <Text style={[styles.gutterCount, isLiked && styles.gutterCountLiked]}>
            {gutterCount(reply.stats?.likes || 0)}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.gutterBtn, styles.gutterBtnSecond]}
          onPress={() => onRetweet(reply.id)}
          disabled={retweeting}
          hitSlop={{ top: 6, bottom: 6, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={isRetweeted ? 'Annuler le repost' : 'Reposter cette réponse'}
        >
          <Animated.View style={{ transform: [{ scale: retweetAnim }] }}>
            <Ionicons
              name="repeat"
              size={ps(15)}
              color={isRetweeted ? C.success : C.textSecondary}
            />
          </Animated.View>
          <Text style={[styles.gutterCount, isRetweeted && styles.gutterCountReposted]}>
            {gutterCount(reply.stats?.retweets || 0)}
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.replyContent} activeOpacity={0.8} onPress={open}>
        <View style={styles.replyAuthorRow}>
          <TouchableOpacity
            onPress={() => {
              const author: any = (reply as any)?.author || {};
              if (author?.id || author?.username) {
                navigation.navigate('UserProfile', {
                  userId: author.id,
                  username: author.username,
                });
              }
            }}
            activeOpacity={0.8}
          >
            <Avatar
              size={ps(26)}
              username={reply.author?.username || 'U'}
              uri={(reply.author as any)?.avatar}
            />
          </TouchableOpacity>

          <View style={styles.replyNameWrap}>
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
          </View>

          {(reply.author as any)?.verified && (
            <VerifiedBadge
              verificationStyle={(reply.author as any)?.verification_style || 'default'}
              size={ps(14)}
              tint={
                certifiedNameColors(
                  (reply.author as any)?.verification_style,
                  (reply.author as any)?.profile_customization as ProfileCustomization | undefined,
                ).from
              }
            />
          )}

          <Text style={styles.replyTime}>
            {formatTime(reply.created_at || (reply as any).createdAt || Date.now())}
          </Text>
        </View>

        <Text style={styles.replyText}>{reply.content}</Text>
      </TouchableOpacity>
    </View>
  );
}

/** Taille de page des réponses — la même au premier chargement et à la suite. */
const REPLIES_PAGE_SIZE = 20;

const ReplyItem = React.memo(ReplyItemBase);

export default function TweetDetailGutterScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user: currentUser } = useAuth() as any;
  const { tweetId, isThread } = route.params as unknown as RouteParams;
  const [tweet, setTweet] = useState<Tweet | null>(null);
  const [replies, setReplies] = useState<Tweet[]>([]);
  /**
   * Pagination des réponses.
   *
   * L'écran demandait `{ limit: 20, offset: 0 }` avec un `offset` écrit en
   * dur, et aucun chemin de code — quel que soit le geste de l'utilisateur —
   * ne pouvait demander la 21e. Sur un tweet populaire, les réponses
   * existaient, le serveur savait les servir, et l'application ne les
   * demandait jamais. Ce n'était pas une lenteur : c'était un manque.
   *
   * Le serveur renvoie déjà `data.pagination.hasMore` — l'information était
   * reçue, typée (`PaginationInfo`), et jetée.
   *
   * `replyOffset` est tenu à part de `replies.length` : publier une réponse
   * l'ajoute en tête localement, et compter les éléments affichés ferait alors
   * sauter une réponse du serveur à la page suivante.
   */
  const [replyOffset, setReplyOffset] = useState(0);
  const [hasMoreReplies, setHasMoreReplies] = useState(false);
  const [loadingMoreReplies, setLoadingMoreReplies] = useState(false);
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
  
  /**
   * Contenu payant. Le serveur n'a envoyé qu'un aperçu ; sans aperçu rédigé
   * par le créateur, c'est un brouillage de même longueur, qu'on floute pour
   * qu'il se lise comme un contenu verrouillé et pas comme un bug.
   */
  const contentLock = (tweet as any)?.paid_content || null;
  const isContentLocked = !!contentLock && !contentLock.has_access;
  const isScrambled = isContentLocked && !contentLock.preview_text;

  // Habillage premium : la lumière prend la couleur du profil de l'auteur.
  const holo = usePremiumAuthorTheme(tweet?.author);

  const { isModerator, canModerateContent, canDeleteTweets } = useAdminPermissions();

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
        // Les trois appels ne partagent que `tweet.id`, connu d'avance : aucun
        // n'attend le résultat d'un autre. Enchaînés en `await`, ils faisaient
        // trois allers-retours consécutifs là où un seul temps d'attente
        // suffit — c'est l'exact inverse du `Promise.all` écrit 70 lignes plus
        // bas dans ce même fichier.
        const [userStats, tweetStats, progressiveRecommendations] = await Promise.all([
          progressiveRecommendationService.getUserInteractionStats(),
          progressiveRecommendationService.getTweetViralityStats(tweet.id),
          progressiveRecommendationService.getProgressiveRecommendations({
            limit: 1,
            offset: 0,
            includeUser: true,
            includeStats: true,
            group: 'auto'
          }),
        ]);
        console.log('📊 User stats:', userStats);
        console.log('📈 Tweet stats:', tweetStats);
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

  /**
   * Charger les informations progressives quand l'algorithme change.
   *
   * La dépendance est l'IDENTIFIANT du tweet, plus l'objet. `handleLike` et
   * `handleRetweet` construisent chacun un objet `tweet` neuf en mise à jour
   * optimiste — et un second pour revenir en arrière en cas d'échec. Chaque
   * « j'aime » relançait donc toute la chaîne de requêtes, et un échec réseau
   * la relançait deux fois : aimer puis retweeter déclenchait huit
   * allers-retours que personne n'avait demandés.
   */
  const tweetId_progressive = tweet?.id;
  useEffect(() => {
    if (currentAlgorithm === 'progressive' && tweetId_progressive) {
      loadProgressiveInfo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAlgorithm, tweetId_progressive]);

  useEffect(() => {
    let cancelled = false;

    // Une navigation `push` peut laisser l'ancien contenu visible le temps de
    // la requête. On vide le focus et ses descendants pour ne jamais mélanger
    // deux branches de conversation.
    setTweet(null);
    setReplies([]);
    setReplyOffset(0);
    setHasMoreReplies(false);
    setSimilarTweets([]);
    setThreadAncestors([]);

    (async () => {
      // Les deux requêtes ne dépendent pas l'une de l'autre : elles ne
      // partagent que `tweetId`, connu d'avance. Enchaînées en `await`, les
      // réponses n'étaient demandées qu'une fois le tweet revenu, ce qui
      // doublait l'attente avant d'avoir la page complète.
      const [res, rep] = await Promise.all([
        apiService.getTweet(tweetId),
        apiService.getTweetReplies(tweetId, { limit: REPLIES_PAGE_SIZE, offset: 0 }),
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

      if (rep?.success && rep.data?.replies) {
        setReplies(rep.data.replies);
        setReplyOffset(rep.data.replies.length);
        setHasMoreReplies(!!rep.data.pagination?.hasMore);
      }
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

  /**
   * Le serveur refuse like, retweet et réponse sur un contenu payant non
   * acheté (403). On arrête le geste ici plutôt que de le laisser partir :
   * l'écran afficherait sinon un état optimiste qu'il faudrait annuler.
   */
  const refuseLocked = () => {
    toast.info('Contenu réservé', {
      description: `Débloque ce contenu pour ${contentLock?.price_twc} NF avant d'interagir avec lui.`,
    });
  };

  const handleLike = async () => {
    if (isContentLocked) return refuseLocked();
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
    if (isContentLocked) return refuseLocked();
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

  /**
   * Identité stable : ces deux handlers descendent dans chaque `ReplyItem`
   * mémoïsé. L'état courant est lu par référence.
   */
  const loadMoreReplies = useCallback(async () => {
    if (loadingMoreReplies || !hasMoreReplies) return;
    setLoadingMoreReplies(true);
    try {
      const rep = await apiService.getTweetReplies(tweetId, {
        limit: REPLIES_PAGE_SIZE,
        offset: replyOffset,
      });
      const page: Tweet[] = rep?.success ? (rep.data?.replies ?? []) : [];
      if (page.length) {
        // Dédoublonnage : une réponse publiée à l'instant vit déjà en tête de
        // la liste locale, et le serveur la renverra elle aussi.
        setReplies((prev) => {
          const seen = new Set(prev.map((r) => String(r.id)));
          return [...prev, ...page.filter((r) => !seen.has(String(r.id)))];
        });
        setReplyOffset((offset) => offset + page.length);
      }
      setHasMoreReplies(!!rep?.data?.pagination?.hasMore);
    } catch {
      // Un échec ne doit pas verrouiller le bouton : `hasMoreReplies` reste
      // vrai, l'utilisateur peut réessayer.
    } finally {
      setLoadingMoreReplies(false);
    }
  }, [tweetId, replyOffset, hasMoreReplies, loadingMoreReplies]);

  const repliesRef = useRef(replies);
  const replyLikingRef = useRef(replyLiking);
  const replyRetweetingRef = useRef(replyRetweeting);
  useEffect(() => {
    repliesRef.current = replies;
  }, [replies]);
  useEffect(() => {
    replyLikingRef.current = replyLiking;
  }, [replyLiking]);
  useEffect(() => {
    replyRetweetingRef.current = replyRetweeting;
  }, [replyRetweeting]);

  const handleReplyLike = useCallback(async (replyId: string) => {
    if (replyLikingRef.current[replyId]) return;
    const target = repliesRef.current.find(r => r.id === replyId);
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
  }, []);

  const handleReplyRetweet = useCallback(async (replyId: string) => {
    if (replyRetweetingRef.current[replyId]) return;
    const target = repliesRef.current.find(r => r.id === replyId);
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
  }, []);

  const handleReply = async () => {
    if (isContentLocked) return refuseLocked();
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
        // Répondre est le deuxième geste le plus lourd du barème du moteur
        // (3.5, derrière le retweet). Il n'était émis que depuis `TweetCard`,
        // monté seulement dans Profil et Recherche : répondre depuis un fil ou
        // depuis cette page ne comptait pas.
        trackingService.trackComment(tweet.id, signalsFromTweet(tweet));
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

  /**
   * Modération d'une publication : approuver, ou la retirer des
   * recommandations. Mêmes appels que `ModerationActions`, même confirmation,
   * même retour — seule la forme change (deux pilules, pas deux tuiles).
   */
  const [moderating, setModerating] = useState(false);
  const runModeration = async (action: 'approve' | 'reject') => {
    if (moderating || !tweet) return;
    const ok = await confirmAsync({
      title: action === 'approve' ? 'Approuver cette publication ?' : 'La masquer ?',
      message:
        action === 'approve'
          ? 'Elle sera validée et pourra être promue.'
          : 'Elle restera en ligne mais sortira des recommandations.',
      confirmLabel: action === 'approve' ? 'Approuver' : 'Masquer',
      destructive: action === 'reject',
    });
    if (!ok) return;

    setModerating(true);
    try {
      const success =
        action === 'approve'
          ? await moderationService.approveTweet(tweet.id)
          : await moderationService.rejectTweet(tweet.id, 'Contenu non conforme');
      if (success) {
        toast.success(action === 'approve' ? 'Publication approuvée' : 'Publication masquée');
        handleModerationAction();
      } else {
        toast.error("L'action n'a pas pu être appliquée");
      }
    } catch {
      toast.error("L'action n'a pas pu être appliquée");
    } finally {
      setModerating(false);
    }
  };

  const handleModerationAction = () => {
    // Cette fonction sera appelée après une action de modération
    // Optionnel : rafraîchir les données ou naviguer
    console.log('🎯 Action de modération effectuée sur le tweet:', tweet?.id);
  };

  return (
    // Pas de `ScreenBackground` ici : c'est le fond « Pulse » de l'app, et 2B
    // pose le sien à plat (`paper.bg`), exactement comme `FeedGutterScreen`.
    <View style={styles.root}>
    {/* Aucun habillage d'événement ici — voir la note en tête de fichier :
        son dégradé repeignait toute la page en vert sous le papier, et
        l'en-tête restait noir par-dessus. */}
    <SafeAreaView style={styles.container}>
      {/* Lumière premium — rejouée à chaque ouverture (clé = publication). */}
      {holo.ready && (
        <PremiumTweetHolo key={tweet?.id} accent={holo.accent} secondary={holo.secondary} />
      )}

      {/* ── En-tête 2B ──
          Un chevron nu et un titre, posés sur un filet. Le `BackButton` de
          l'app est une pastille pleine sur fond de surface : sur du papier,
          c'est le seul bouton de la page qui aurait un fond. */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity
            onPress={() => (navigation as any).goBack()}
            style={styles.backBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Revenir en arrière"
          >
            <Ionicons name="chevron-back" size={ps(24)} color={C.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {threadAncestors.length > 0 ? 'Conversation' : 'Publication'}
          </Text>
          <View style={styles.headerRight}>
            {/* Bouton d'information pour l'algorithme progressif */}
            {currentAlgorithm === 'progressive' && (
              <TouchableOpacity
                style={[styles.headerAction, { marginRight: 8 }]}
                onPress={() => setShowProgressiveModal(true)}
              >
                <Ionicons name="information-circle-outline" size={19} color={C.accent} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.headerAction}
              onPress={handleReport}
            >
              <Ionicons name="flag-outline" size={19} color={C.textPrimary} />
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
                          size={ps(36)}
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
                          {/* Poussée contre le bord droit par un `marginLeft:
                              'auto'` — plus de point médian, il séparait deux
                              choses qui ne se touchent plus. */}
                          <Text style={styles.threadAncestorTime}>
                            {formatTime(ancestor.created_at || ancestor.createdAt || new Date().toISOString())}
                          </Text>
                        </View>

                        <ClickableMentions
                          text={ancestor.content}
                          mentions={ancestor.mentions}
                          style={styles.threadAncestorText}
                        />

                        {/* Une ligne de méta, pas trois icônes.
                            Ces compteurs-là ne se touchent pas : on est sur
                            la réponse, pas sur l'ancêtre. Les dessiner comme
                            la rangée d'actions du fil d'origine promettait un
                            geste qui n'existe pas ici — et remettait sur la
                            page la rangée d'icônes grises que 2B supprime
                            partout ailleurs. Un ancêtre est du contexte : il
                            doit être le bloc le plus calme de l'écran. */}
                        {ancestorMeta(ancestor) !== '' && (
                          <Text style={styles.threadAncestorMeta}>{ancestorMeta(ancestor)}</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* ── La publication ──
                Elle n'est plus une CARTE : sur une page qui ne parle que
                d'elle, un cadre ne la distingue de rien. Ce qui la distingue,
                c'est le corps de son texte et le poids de ses compteurs.

                Elle prend la même grille que le fil — gouttière à gauche,
                contenu à droite. C'est ce qui fait reconnaître la ligne sur
                laquelle on vient de taper. */}
            <View style={styles.mainRow}>
              {/* ── La gouttière de la publication ouverte ──
                  Ses compteurs sont les plus gros de l'app (`ps(30)`) : c'est
                  la seule page où ils sont le sujet. Ils remplacent À LA FOIS
                  la rangée de trois statistiques et la rangée de quatre
                  boutons que l'original empilait — deux blocs qui portaient
                  les mêmes nombres, l'un en lecture, l'autre en action, sans
                  qu'aucun des deux ne soit lisible d'un coup d'œil. */}
              <View style={styles.mainGutter}>
                <TouchableOpacity
                  style={styles.gutterBtn}
                  onPress={handleLike}
                  disabled={(tweet as any).is_ad || isLiking}
                  hitSlop={{ top: 8, bottom: 8, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={
                    (tweet as any)?.user_interaction?.is_liked
                      ? 'Retirer le like'
                      : 'Aimer cette publication'
                  }
                >
                  {/* ⚠️ `overflow: 'visible'` sur l'hôte : `ReactionBurst`
                      s'ancre sur une vue de 0 × 0 et dessine tout en dehors
                      d'elle. Sur Android, une vue rogne ses enfants par
                      défaut — sans ça, l'éclat est découpé à la taille de
                      l'icône et le geste paraît n'avoir rien déclenché. */}
                  <View style={styles.burstHost}>
                    <ReactionBurst progress={like.progress} palette={LIKE_PALETTE} iconSize={ps(24)} />
                    <Reanimated.View style={like.iconStyle}>
                      <Ionicons
                        name={
                          (tweet as any)?.user_interaction?.is_liked && !((tweet as any).is_ad)
                            ? 'heart'
                            : 'heart-outline'
                        }
                        size={ps(24)}
                        color={
                          (tweet as any)?.user_interaction?.is_liked && !((tweet as any).is_ad)
                            ? C.like
                            : C.textPrimary
                        }
                      />
                    </Reanimated.View>
                  </View>
                  {/* La gouttière fait 52 pt : à `ps(30)`, « 1.2K » est déjà
                      plus large qu'elle. Le compteur rétrécit donc au lieu de
                      se faire couper — un tweet à quatre chiffres ne doit pas
                      perdre son dernier caractère. */}
                  <Text
                    style={[
                      styles.mainCount,
                      (tweet as any)?.user_interaction?.is_liked && styles.mainCountLiked,
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.6}
                  >
                    {gutterCount(tweet.stats?.likes || 0)}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.gutterBtn, styles.gutterBtnSecond]}
                  onPress={handleRetweet}
                  onLongPress={() => {
                    if (!tweet) return;
                    (navigation as any).navigate('CreateTweet', {
                      parentTweetId: undefined,
                      replyTo: undefined,
                      quoteTweetId: tweet.id,
                    });
                  }}
                  delayLongPress={300}
                  disabled={(tweet as any).is_ad || isRetweeting}
                  hitSlop={{ top: 8, bottom: 8, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={
                    (tweet as any)?.user_interaction?.is_retweeted
                      ? 'Annuler le repost'
                      : 'Reposter — appui long pour citer'
                  }
                >
                  <View style={styles.burstHostSmall}>
                    <ReactionBurst progress={retweet.progress} palette={RETWEET_PALETTE} iconSize={ps(20)} />
                    <Reanimated.View style={retweet.iconStyle}>
                      <Ionicons
                        name="repeat"
                        size={ps(20)}
                        color={
                          (tweet as any)?.user_interaction?.is_retweeted && !((tweet as any).is_ad)
                            ? C.success
                            : C.textPrimary
                        }
                      />
                    </Reanimated.View>
                  </View>
                  <Text
                    style={[
                      styles.mainCountSub,
                      (tweet as any)?.user_interaction?.is_retweeted && styles.mainCountReposted,
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.6}
                  >
                    {gutterCount(tweet.stats?.retweets || 0)}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.mainContent}>
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
                    size={ps(38)}
                    username={tweet.author?.username || 'U'}
                    uri={(tweet.author as any)?.avatar}
                  />
                </TouchableOpacity>
                <View style={styles.authorInfo}>
                  {/* L'habillage du COMPTE, lui, reste : c'est une
                      personnalisation payée, pas un décor global. */}
                  <PremiumDisplayName
                    text={tweet.author?.full_name || 'Utilisateur'}
                    baseStyle={styles.fullName}
                    isPremium={!!(tweet.author as any)?.premium}
                    subscriptionTierRaw={(tweet.author as any)?.subscription_tier}
                    fontId="system"
                    effectId="none"
                    numberOfLines={1}
                    customization={(tweet.author as any)?.profile_customization as ProfileCustomization | undefined}
                    verified={!!(tweet.author as any)?.verified}
                    verificationStyle={(tweet.author as any)?.verification_style || 'default'}
                  />
                  <View style={styles.usernameRow}>
                    <Text style={styles.username}>@{tweet.author?.username}</Text>
                    {(tweet.author as any)?.verified && (
                      <VerifiedBadge
                        verificationStyle={(tweet.author as any)?.verification_style || 'default'}
                        size={ps(14)}
                        animated={true}
                        tint={
                          certifiedNameColors(
                            (tweet.author as any)?.verification_style,
                            (tweet.author as any)?.profile_customization as ProfileCustomization | undefined,
                          ).from
                        }
                      />
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

              {isScrambled ? (
                <LockedText
                  text={displayedContent || tweet.content}
                  style={styles.tweetText}
                  price={contentLock?.price_twc}
                />
              ) : (
                <TranslationReveal
                  tweetId={String(tweetId)}
                  language={activeTranslation?.language ?? null}
                >
                  <ClickableMentions
                    text={displayedContent || tweet.content}
                    mentions={tweet.mentions}
                    style={styles.tweetText}
                  />
                </TranslationReveal>
              )}

              {/* Images/vidéo jointes. Comme dans le fil, l'affichage ne teste
                  jamais le drapeau `tweet.images` : il ne conditionne que la
                  publication. Pas de `onPress` ici — on est déjà sur le tweet.
                  Un tweet vidéo range `media_urls` comme
                  `[url_vidéo, url_miniature]` (voir `POST /api/tweets/video`
                  côté API) — même séparation que dans `TweetRow`, sinon la
                  miniature atterrit dans la grille comme une photo ordinaire,
                  sans bouton play ni moyen de lancer la lecture. */}
              {!isContentLocked && (() => {
                const urls = (Array.isArray(tweet.media_urls) ? tweet.media_urls : [])
                  .filter((url): url is string => typeof url === 'string');
                const videoUrl = urls.find((url) => /\.(mp4|mov|m3u8|webm)(\?|$)/i.test(url));
                if (videoUrl) {
                  const thumbnailUrl = urls.find((url) => url !== videoUrl);
                  return <TweetVideo videoUrl={videoUrl} thumbnailUrl={thumbnailUrl} />;
                }
                return <TweetImages urls={urls} />;
              })()}

              {!isContentLocked && !!(tweet as any).audio_url && (
                <TweetVoiceMessage
                  audioUrl={(tweet as any).audio_url}
                  durationSeconds={(tweet as any).audio_duration}
                />
              )}

              {!isContentLocked && !!tweet.spotify_track && (
                <TweetMusicCard track={tweet.spotify_track} />
              )}

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
              {isContentLocked && (
                <PaidContentLock
                  lock={contentLock}
                  onUnlocked={async () => {
                    // Le contenu complet ne vient QUE du serveur : après
                    // l'achat, on redemande le tweet plutôt que de tenter de
                    // reconstituer quoi que ce soit localement.
                    const res = await apiService.getTweet(String(tweetId));
                    if (res?.success && res.data) setTweet(res.data as Tweet);
                  }}
                />
              )}

              {/* L'heure de publication, dans la voix des méta : capitale
                  espacée en chasse fixe. C'est la même voix que « SPONSORISÉ »
                  ou « TENDANCES » ailleurs dans 2B. */}
              <Text style={styles.timeText}>
                {`${new Date(tweet.created_at || tweet.createdAt || Date.now()).toLocaleDateString(
                  'fr-FR',
                  { day: 'numeric', month: 'long', year: 'numeric' },
                )} · ${new Date(tweet.created_at || tweet.createdAt || Date.now()).toLocaleTimeString(
                  'fr-FR',
                  { hour: '2-digit', minute: '2-digit' },
                )}`.toUpperCase()}
              </Text>

              {/* ── Le pied de la publication ──
                  Ne reste sous le texte que ce qui APPELLE une réponse : leur
                  nombre, et le bouton pour en écrire une. Les likes et les
                  reposts sont dans la gouttière, ils n'ont pas à être redits
                  ici — c'est exactement le partage que fait une ligne du fil.

                  Le bouton « Partager » de l'original n'est pas repris : il
                  n'avait aucun `onPress`, il ne partageait rien. */}
              {!(tweet as any).is_ad && (
                <View style={styles.mainFooter}>
                  <Text style={styles.mainReplies}>
                    {(tweet.stats?.replies || 0) > 0
                      ? `${formatNumber(tweet.stats?.replies || 0)} RÉPONSE${(tweet.stats?.replies || 0) > 1 ? 'S' : ''}`
                      : 'AUCUNE RÉPONSE'}
                  </Text>
                  <TouchableOpacity
                    style={styles.replyPill}
                    onPress={scrollToComposer}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.replyPillText}>Répondre</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* FOOTER PREMIUM POUR LES PUBS (VUE DETAIL) */}
              {(tweet as any).is_ad && (
                <View style={{
                  marginVertical: 16,
                  padding: 18,
                  borderRadius: 16,
                  backgroundColor: C.surfaceAlt,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                     <Ionicons name="sparkles" size={24} color={C.gold} />
                     <View style={{ marginLeft: 14, flex: 1 }}>
                       <Text style={{ color: C.gold, fontSize: 13, fontFamily: F.bold, textTransform: 'uppercase', letterSpacing: 0.6 }}>Publicité ciblée</Text>
                       <Text style={{ color: C.textSecondary, fontSize: 13, marginTop: 4, fontFamily: F.medium }}>Recommandée spécialement pour vous</Text>
                     </View>
                  </View>
                  <View style={{ backgroundColor: C.gold, padding: 10, borderRadius: 20, paddingHorizontal: 16 }}>
                     <Text style={{ color: '#1a1303', fontSize: 12, fontFamily: F.bold }}>Visiter ↗</Text>
                  </View>
                </View>
              )}

              {/* ── Modération (modérateurs seulement) ──
                  Deux choix prêts à l'emploi, dans la même pilule que
                  « Répondre ». L'ancien panneau annonçait « Actions de
                  Modération / Gérer ce contenu publié » au-dessus de deux
                  tuiles à dégradé : trois lignes de titre pour deux boutons,
                  et le bloc le plus lourd de la page pour la seule personne
                  qui n'est pas venue lire. */}
              {isModerator && (canModerateContent || canDeleteTweets) && (
                <View style={styles.moderation}>
                  <Text style={styles.moderationLabel}>MODÉRATION</Text>
                  <View style={styles.moderationRow}>
                    <TouchableOpacity
                      style={styles.moderationPill}
                      onPress={() => runModeration('approve')}
                      disabled={moderating}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.moderationPillText}>Approuver</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.moderationPill}
                      onPress={() => runModeration('reject')}
                      disabled={moderating}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.moderationPillText}>Masquer</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              </View>
            </View>

            {/* Compositeur de réponse amélioré */}
            {!(tweet as any).is_ad && (
            <View
              style={styles.replySection}
              onLayout={(e) => { composerYRef.current = e.nativeEvent.layout.y; }}
            >
              <View style={styles.replyComposer}>
                <View style={styles.replyAvatarSmall}>
                  <Avatar size={ps(34)} username={currentUser?.username || 'U'} uri={(currentUser as any)?.avatar} />
                </View>
                <View style={styles.replyInputContainer}>
                  <TextInput
                    style={styles.replyInput}
                    placeholder="Tweeter votre réponse..."
                    placeholderTextColor={C.textMuted}
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
                          {/* Désactivé, le bouton n'a plus d'aplat : son texte
                              doit repasser à l'encre, sinon il écrit en blanc
                              sur le papier. */}
                          <Text style={[styles.replySubmitText, styles.replySubmitTextOff]}>…</Text>
                        </View>
                      ) : (
                        <Text
                          style={[
                            styles.replySubmitText,
                            !replyText.trim() && styles.replySubmitTextOff,
                          ]}
                        >
                          Répondre
                        </Text>
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
                {/* Tête de rubrique, pas un titre avec sa pastille : le
                    nombre tient dans la ligne au lieu d'avoir son propre
                    conteneur coloré. Même voix que « TENDANCES » ailleurs. */}
                <View style={styles.repliesHeader}>
                  <Text style={styles.repliesTitle}>{`RÉPONSES · ${replies.length}`}</Text>
                </View>
                
                {replies.map((reply) => (
                  <ReplyItem
                    key={reply.id}
                    reply={reply}
                    navigation={navigation}
                    onLike={handleReplyLike}
                    onRetweet={handleReplyRetweet}
                    liking={!!replyLiking[reply.id]}
                    retweeting={!!replyRetweeting[reply.id]}
                    likeAnim={getReplyLikeAnim(reply.id)}
                    retweetAnim={getReplyRetweetAnim(reply.id)}
                  />
                ))}

                {/* Un bouton plutôt qu'un `onEndReached` : les réponses vivent
                    dans le `ScrollView` de la page, qui porte encore les
                    tweets similaires en dessous. Un déclenchement au
                    défilement se serait armé en traversant cette section. */}
                {hasMoreReplies && (
                  <TouchableOpacity
                    style={styles.loadMoreReplies}
                    onPress={loadMoreReplies}
                    disabled={loadingMoreReplies}
                    activeOpacity={0.7}
                  >
                    {loadingMoreReplies ? (
                      <ActivityIndicator size="small" color={C.accent} />
                    ) : (
                      <Text style={styles.loadMoreRepliesText}>Afficher plus de réponses</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Section des tweets similaires (recommandations vectorielles) —
                sous tous les commentaires, pas avant : on veut d'abord voir
                la conversation, la découverte vient ensuite. */}
            {similarTweets.length > 0 && !isLoadingSimilar && (
              <View style={styles.similarSection}>
                <View style={styles.similarHeader}>
                  <Text style={styles.similarTitle}>À LIRE ENSUITE</Text>
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
                        {/* L'avatar tient la gouttière, comme partout ailleurs
                            sur cette page : les trois colonnes de gauche
                            (compteur, avatar, avatar) tombent au même x. */}
                        <View style={styles.similarAvatar}>
                          <Avatar
                            size={ps(36)}
                            username={author?.username || 'U'}
                            uri={author?.avatar}
                          />
                        </View>
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
                        <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
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
            <View style={[styles.modalHeader, { paddingTop: insets.top + 20 }]}>
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
                    color={isLoadingProgressiveInfo ? C.textMuted : C.accent}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => setShowProgressiveModal(false)}
                >
                  <Ionicons name="close" size={24} color={C.textPrimary} />
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
                  <Ionicons name="alert-circle-outline" size={48} color={C.red} />
                  <Text style={styles.errorText}>Impossible de charger les informations</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  // ⚠️ SANS FOND. La lumière premium de l'auteur (`PremiumTweetHolo`) est
  // peinte derrière toute la page, et son noyau tombe juste sous l'en-tête :
  // un aplat ici posait une barre noire en plein milieu du halo, avec du
  // vert au-dessus et du vert en dessous. Seul le filet reste — c'est lui qui
  // ferme l'en-tête, pas une couleur.
  header: {
    position: 'relative',
    zIndex: 100,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerGradient: {
    ...StyleSheet.absoluteFillObject as any,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: ROW_PAD_X,
    paddingVertical: ps(12),
  },
  // Le chevron est cadré à gauche de la gouttière : le titre commence donc à
  // la même abscisse que le texte des publications, en dessous.
  backBtn: {
    width: ps(30),
    marginLeft: ps(-6),
    marginRight: ps(6),
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerTitle: {
    color: C.textPrimary,
    fontFamily: F.semibold,
    fontSize: ps(19),
    letterSpacing: ps(-0.38),
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Pas de pastille pleine : sur du papier, ce serait le seul bouton de la
  // page à porter un fond.
  headerAction: {
    width: ps(32),
    height: ps(32),
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
    borderColor: C.accent,
    borderTopColor: 'transparent',
  },
  loadingText: {
    color: C.textSecondary,
    fontFamily: F.medium,
    fontSize: ps(16),
    lineHeight: ps(23),
  },
  tweetContainer: {
    flex: 1,
  },
  // Sans fond, comme tout le reste de la page : cet aplat noir était le
  // dernier à trancher la lumière premium, et il ne se voyait QUE sur une
  // conversation — c'est-à-dire exactement quand il y a des ancêtres à
  // afficher. Voir la règle en tête de fichier.
  threadContext: {
    paddingTop: ps(14),
  },
  // ── Le fil au-dessus de la publication ──
  // Le rail vit dans la GOUTTIÈRE, à la même largeur que partout : c'est lui
  // qui rattache un parent à sa réponse. Il ne descend qu'entre deux lignes
  // liées, jamais « pour le rythme » sous la dernière.
  threadAncestor: {
    flexDirection: 'row',
    gap: ROW_GAP,
    paddingHorizontal: ROW_PAD_X,
    minHeight: ps(104),
  },
  threadAncestorRail: {
    width: GUTTER_W,
    alignItems: 'center',
  },
  // Un vrai filet d'un pixel : le mettre à l'échelle le rendrait flou.
  threadAncestorLine: {
    width: 1,
    flex: 1,
    minHeight: ps(24),
    marginTop: ps(6),
    backgroundColor: paper.gutterLine,
  },
  threadAncestorContent: {
    flex: 1,
    minWidth: 0,
    paddingBottom: ps(16),
  },
  threadAncestorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ps(6),
    minHeight: ps(24),
    marginBottom: ps(5),
  },
  threadAncestorName: {
    color: C.textPrimary,
    fontFamily: F.semibold,
    fontSize: ps(16),
    letterSpacing: ps(-0.32),
    maxWidth: '48%',
  },
  threadAncestorHandle: {
    color: C.textMuted,
    fontFamily: F.mono,
    fontSize: ps(12),
    maxWidth: '32%',
  },
  threadAncestorTime: {
    color: C.textMuted,
    fontFamily: F.mono,
    fontSize: ps(12),
    marginLeft: 'auto',
  },
  threadAncestorText: {
    color: C.textPrimary,
    fontFamily: F.medium,
    fontSize: ps(16),
    lineHeight: ps(23),
    marginBottom: ps(10),
  },
  threadAncestorMeta: {
    color: C.textMuted,
    fontFamily: F.mono,
    fontSize: ps(11),
    letterSpacing: ps(1.1),
  },
  // ── La publication, dans la grille du fil ──
  // Les retraits sont ceux de `TweetRowGutter` : c'est ce qui fait que la
  // ligne du fil et la page qu'elle ouvre se superposent exactement.
  mainRow: {
    flexDirection: 'row',
    gap: ROW_GAP,
    paddingHorizontal: ROW_PAD_X,
    paddingTop: ps(16),
    paddingBottom: ps(20),
    // Dernier maillon de la chaîne de l'éclat : sans lui, Android rogne la
    // gerbe du cœur au cadre de la ligne.
    overflow: 'visible',
    // Aucune règle horizontale : ce qui sépare la publication de ses réponses,
    // c'est la tête de rubrique « N RÉPONSES » et l'espace, comme dans le fil.
  },
  mainGutter: {
    width: GUTTER_W,
    alignItems: 'center',
    // Obligatoire sur toute la chaîne qui porte un `ReactionBurst` : l'éclat
    // se dessine EN DEHORS de son hôte, et Android rogne par défaut.
    overflow: 'visible',
  },
  mainContent: {
    flex: 1,
    minWidth: 0,
  },
  gutterBtn: {
    alignItems: 'center',
    gap: ps(2),
    overflow: 'visible',
  },
  gutterBtnSecond: {
    marginTop: ps(12),
    gap: ps(1),
  },
  burstHostSmall: {
    width: ps(20),
    height: ps(20),
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  // Le plus gros chiffre de l'app : sur cette page, il EST le sujet.
  mainCount: {
    fontFamily: F.bold,
    fontSize: ps(30),
    lineHeight: ps(34),
    letterSpacing: ps(-0.9),
    color: C.textPrimary,
  },
  mainCountLiked: {
    color: C.like,
  },
  // Même famille, un cran plus bas : au repos les deux compteurs doivent
  // former une colonne régulière, pas deux tailles qui se disputent.
  mainCountSub: {
    fontFamily: F.bold,
    fontSize: ps(21),
    lineHeight: ps(25),
    letterSpacing: ps(-0.63),
    color: C.textPrimary,
  },
  mainCountReposted: {
    color: C.success,
  },
  mainFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ps(12),
    marginTop: ps(16),
  },
  moderation: {
    marginTop: ps(22),
  },
  moderationLabel: {
    fontFamily: F.mono,
    fontSize: ps(10),
    letterSpacing: ps(1.5),
    color: C.textMuted,
    marginBottom: ps(10),
  },
  moderationRow: {
    flexDirection: 'row',
    gap: ps(10),
  },
  moderationPill: {
    borderWidth: 1,
    borderColor: paper.outline,
    borderRadius: ps(9),
    paddingVertical: ps(7),
    paddingHorizontal: ps(14),
  },
  moderationPillText: {
    fontFamily: F.medium,
    fontSize: ps(15),
    color: C.textPrimary,
  },
  mainReplies: {
    fontFamily: F.mono,
    fontSize: ps(11),
    letterSpacing: ps(1.2),
    color: C.textMuted,
  },
  // La pilule contour du fil, à l'identique.
  replyPill: {
    marginLeft: 'auto',
    borderWidth: 1,
    borderColor: paper.outline,
    borderRadius: ps(9),
    paddingVertical: ps(6),
    paddingHorizontal: ps(13),
  },
  replyPillText: {
    fontFamily: F.medium,
    fontSize: ps(15),
    color: C.textPrimary,
  },
  authorSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: ps(12),
  },
  avatarContainer: {
    position: 'relative',
    marginRight: ps(10),
  },
  avatarGradient: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: C.textPrimary,
    fontSize: 20,
    fontWeight: '700', fontFamily: F.bold,
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: C.bg,
  },
  authorInfo: {
    flex: 1,
  },
  // Semi-bold, comme les noms d'auteur du fil : le Bold les rendrait aussi
  // lourds que le texte de la publication, qu'ils ne font qu'annoncer.
  fullName: {
    color: C.textPrimary,
    fontFamily: F.semibold,
    fontSize: ps(19),
    letterSpacing: ps(-0.38),
    marginBottom: ps(2),
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ps(6),
    marginTop: ps(1),
  },
  username: {
    color: C.textMuted,
    fontFamily: F.mono,
    fontSize: ps(13),
  },
  replyingTo: {
    color: C.textSecondary,
    fontFamily: F.regular,
    fontSize: ps(14),
    lineHeight: ps(20),
    marginBottom: ps(10),
  },
  replyingToHandle: {
    fontFamily: F.medium,
    color: C.textPrimary,
  },
  // LE texte de la page. Deux points au-dessus du corps du fil (`ps(19)`) :
  // c'est la seule chose qu'on est venu lire ici, elle doit peser plus qu'une
  // ligne de fil — et c'est ce qui remplace le cadre disparu.
  tweetText: {
    color: C.textPrimary,
    fontFamily: F.medium,
    fontSize: ps(21),
    lineHeight: ps(31),
    marginBottom: ps(14),
  },
  timeText: {
    color: C.textMuted,
    fontFamily: F.mono,
    fontSize: ps(11),
    lineHeight: ps(15),
    letterSpacing: ps(1.1),
    marginTop: ps(4),
  },
  /** Boîte de la taille exacte de l'icône : l'éclat s'y centre tout seul. */
  // ⚠️ La boîte fait EXACTEMENT la taille de l'icône qu'elle porte, et elle
  // est à l'échelle. Elle valait 20 × 20 en dur, hérité de l'ancienne rangée
  // d'actions où l'icône faisait 20 : le cœur de la gouttière fait `ps(24)`,
  // il débordait donc de son hôte et Android le rognait — un cœur coupé sur
  // ses deux côtés. Toute la chaîne au-dessus est en `overflow: 'visible'`
  // (`gutterBtn`, `mainGutter`, `mainRow`) pour que l'éclat, lui, puisse
  // sortir : il se dessine à `iconSize * 2.1`, très au-delà de cette boîte.
  burstHost: {
    width: ps(24),
    height: ps(24),
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  // Deux filets et de l'air — PAS un cran de fond.
  //
  // Le compositeur portait `bgBand` sur toute la largeur, et c'est ce qui
  // tranchait net la lumière premium à mi-écran : au-dessus la couleur de
  // l'auteur, en dessous un rectangle gris. Une bande pleine ne peut pas
  // cohabiter avec un halo qu'elle traverse. Les filets, eux, le laissent
  // passer et disent la même chose : ici, c'est à toi d'écrire.
  replySection: {
    paddingHorizontal: ROW_PAD_X,
    paddingVertical: ps(16),
    borderTopWidth: 1,
    borderTopColor: C.border,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  replyComposer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ROW_GAP,
  },
  // L'avatar de qui écrit tient la gouttière : la réponse en cours de saisie
  // se pose dans la même grille que celles déjà publiées, juste en dessous.
  replyAvatarSmall: {
    width: GUTTER_W,
    alignItems: 'center',
    marginTop: ps(6),
  },
  replyAvatarLetter: {
    color: C.textPrimary,
    fontSize: 14,
    fontWeight: '700', fontFamily: F.bold,
  },
  replyInputContainer: {
    flex: 1,
  },
  // Le corps de saisie est celui d'une réponse publiée : ce qu'on écrit a
  // déjà la tête de ce qui sera lu.
  replyInput: {
    color: C.textPrimary,
    fontFamily: F.medium,
    fontSize: ps(17),
    lineHeight: ps(25),
    minHeight: ps(48),
    maxHeight: ps(140),
    paddingVertical: ps(10),
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
  },
  replyActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: ps(8),
  },
  characterCount: {
    flex: 1,
  },
  characterCountText: {
    color: C.textMuted,
    fontFamily: F.mono,
    fontSize: ps(12),
  },
  characterCountWarning: {
    color: C.like,
  },
  // Le seul aplat d'accent de la page — publier est ce qu'on est venu faire
  // ici, et rien d'autre ne doit lui disputer la couleur. Pas de halo : 2B
  // n'a pas une seule ombre portée hors de la barre de navigation.
  replySubmitBtn: {
    paddingHorizontal: ps(18),
    paddingVertical: ps(9),
    borderRadius: ps(10),
    backgroundColor: C.accent,
  },
  replySubmitBtnDisabled: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: C.border,
  },
  replySubmitText: {
    color: paper.onAccent,
    fontFamily: F.medium,
    fontSize: ps(15),
  },
  replySubmitTextOff: {
    color: C.textMuted,
  },
  loadingDots: {
    alignItems: 'center',
  },
  repliesSection: {
    flex: 1,
  },
  // Une pilule contour, alignée sur la colonne de contenu : un aplat gris
  // pleine largeur en ferait le bloc le plus lourd du bas de page, pour une
  // action qui ne fait qu'allonger la liste.
  loadMoreReplies: {
    alignSelf: 'flex-start',
    marginLeft: ROW_PAD_X + GUTTER_W + ROW_GAP,
    marginVertical: ps(14),
    paddingVertical: ps(7),
    paddingHorizontal: ps(14),
    borderRadius: ps(9),
    borderWidth: 1,
    borderColor: paper.outline,
  },
  loadMoreRepliesText: {
    color: C.textPrimary,
    fontFamily: F.medium,
    fontSize: ps(15),
  },
  repliesHeader: {
    paddingHorizontal: ROW_PAD_X,
    paddingTop: ps(24),
    paddingBottom: ps(10),
  },
  repliesTitle: {
    color: C.textMuted,
    fontFamily: F.mono,
    fontSize: ps(10),
    letterSpacing: ps(1.5),
  },
  // Une réponse : la grille du fil, sans filet de séparation. Ce qui borne
  // une ligne, c'est le bloc de sa gouttière et l'espace, pas un trait.
  replyItem: {
    flexDirection: 'row',
    gap: ROW_GAP,
    paddingHorizontal: ROW_PAD_X,
    paddingTop: ps(12),
    paddingBottom: ps(14),
  },
  replyGutter: {
    width: GUTTER_W,
    alignItems: 'center',
  },
  gutterCount: {
    fontFamily: F.bold,
    fontSize: ps(15),
    lineHeight: ps(18),
    letterSpacing: ps(-0.45),
    color: C.textPrimary,
  },
  gutterCountLiked: {
    color: C.like,
  },
  gutterCountReposted: {
    color: C.success,
  },
  replyContent: {
    flex: 1,
    minWidth: 0,
  },
  replyAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  replyAvatarText: {
    color: C.textPrimary,
    fontSize: 14,
    fontWeight: '700', fontFamily: F.bold,
  },
  // Avatar, nom et heure sur UNE ligne : l'auteur d'une réponse s'annonce,
  // il n'a pas besoin d'un bloc d'en-tête à lui.
  replyAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ps(7),
  },
  replyNameWrap: {
    flexShrink: 1,
    // Sans `minWidth: 0`, un enfant de flexbox refuse de descendre sous sa
    // largeur intrinsèque et `flexShrink` reste sans effet.
    minWidth: 0,
  },
  replyAuthorName: {
    color: C.textPrimary,
    fontFamily: F.semibold,
    fontSize: ps(16),
    letterSpacing: ps(-0.32),
    flexShrink: 1,
  },
  replyTime: {
    color: C.textMuted,
    fontFamily: F.mono,
    fontSize: ps(12),
    marginLeft: 'auto',
    paddingLeft: ps(6),
  },
  replyText: {
    color: C.textPrimary,
    fontFamily: F.medium,
    fontSize: ps(16),
    lineHeight: ps(23),
    marginTop: ps(6),
  },
  // Styles pour le modal de signalement
  modalContainer: {
    flex: 1,
  },
  modalGradient: {
    flex: 1,
    padding: 20,
    backgroundColor: C.bg,
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
    color: C.textPrimary,
    fontSize: 20,
    fontWeight: '700', fontFamily: F.bold,
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: C.borderSubtle,
  },
  modalContent: {
    flex: 1,
  },
  modalSubtitle: {
    color: C.textSecondary,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  reportLabel: {
    color: C.textPrimary,
    fontSize: 16,
    fontWeight: '600', fontFamily: F.semibold,
    marginBottom: 12,
  },
  reportInput: {
    backgroundColor: C.surfaceAlt,
    borderWidth: 1,
    borderColor: C.borderSubtle,
    borderRadius: 12,
    padding: 16,
    color: C.textPrimary,
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
    backgroundColor: C.borderSubtle,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: C.textSecondary,
    fontSize: 16,
    fontWeight: '600', fontFamily: F.semibold,
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
    color: C.textPrimary,
    fontSize: 16,
    fontWeight: '600', fontFamily: F.semibold,
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
    fontWeight: '700', fontFamily: F.bold,
    color: C.textPrimary,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.surface,
  },
  infoLabel: {
    fontSize: 16,
    color: C.textSecondary,
    flex: 1,
  },
  infoValue: {
    fontSize: 16,
    color: C.textPrimary,
    fontWeight: '600', fontFamily: F.semibold,
    textAlign: 'right',
  },
  scoreValue: {
    color: C.accent,
    fontWeight: '700', fontFamily: F.bold,
  },
  descriptionText: {
    fontSize: 14,
    color: C.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  errorText: {
    fontSize: 16,
    color: C.red,
    marginTop: 16,
    textAlign: 'center',
  },
  modalHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Styles pour les tweets similaires
  // ── « À lire ensuite » ──
  // Trois lignes dans la grille de la page, pas trois cartes grises : un
  // encadré par suggestion en aurait fait le bloc le plus dense de l'écran,
  // sous la publication qu'on est venu lire.
  similarSection: {
    paddingBottom: ps(8),
  },
  similarHeader: {
    paddingHorizontal: ROW_PAD_X,
    paddingTop: ps(24),
    paddingBottom: ps(10),
  },
  similarTitle: {
    color: C.textMuted,
    fontFamily: F.mono,
    fontSize: ps(10),
    letterSpacing: ps(1.5),
  },
  similarList: {},
  similarTweet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ROW_GAP,
    paddingHorizontal: ROW_PAD_X,
    paddingVertical: ps(10),
  },
  similarAvatar: {
    width: GUTTER_W,
    alignItems: 'center',
  },
  similarTweetContent: {
    flex: 1,
    minWidth: 0,
  },
  similarTweetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ps(5),
    marginBottom: ps(3),
  },
  similarTweetName: {
    color: C.textPrimary,
    fontFamily: F.semibold,
    fontSize: ps(15),
    letterSpacing: ps(-0.3),
    maxWidth: '55%',
  },
  similarTweetHandle: {
    color: C.textMuted,
    fontFamily: F.mono,
    fontSize: ps(12),
    flexShrink: 1,
  },
  similarTweetText: {
    color: C.textSecondary,
    fontFamily: F.regular,
    fontSize: ps(14.5),
    lineHeight: ps(20),
  },
});
