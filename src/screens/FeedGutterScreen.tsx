/**
 * 🧪 Fil « 2B — Gouttière », sous drapeau `fil.refonte2b` (1 %).
 *
 * CLONE de `TweetsScreen.tsx`. Toute la logique de données — recommandations,
 * pagination, cache hors-ligne, suivi d'impressions, bascule d'onglets au
 * glissé — est reprise telle quelle et doit le RESTER : le test porte sur la
 * présentation, et deux fils qui chargent différemment ne se comparent plus.
 *
 * Ce qui diffère de l'original, et rien d'autre :
 *   - la palette papier (`theme/paper2b.ts`), en clair comme en sombre ;
 *   - l'en-tête : chat + mot-marque + CLOCHE + avatar, onglets soulignés ;
 *   - les lignes, rendues par `TweetRowGutter` (engagement en gouttière) ;
 *   - le bouton flottant « + », supprimé : « Publier » est passé au centre de
 *     la barre du bas (`navigation/BottomTabNavigator2B.tsx`).
 *
 * ⚠️ L'onglet « Explorer » n'a pas été redessiné en 2B — la grille et la
 * lecture immersive gardent la palette « Pulse ». C'est assumé pour cet essai,
 * qui porte sur « Pour toi » et « Abonnements ».
 */
import { paper, paperFonts, isPaperDark, ps } from '../theme/paper2b';
import unreadService from '../services/unreadService';
import { useForegroundInterval } from '../hooks/useForegroundInterval';
import { AppStatusBar } from '../components/ui';
import { showActionSheet, type ActionSheetItem } from '../components/ui/ActionSheet';
import { withoutOrphanReplies, threadDepthAt } from '../utils/feed';
// 2B ne NOMME NeuralRank nulle part : la pastille « NeuralRank v2 » de
// l'en-tête d'origine ne revient pas — un moteur de recommandation n'a pas à
// se présenter à qui lit son fil.
//
// La QUESTION, elle, reste : c'est le seul signal explicite du recommandeur
// (`interested` / `not_interested`, avec l'auteur), et le seul qui porte quand
// quelqu'un fait défiler sans rien toucher — précisément le cas où les signaux
// implicites (`trackInteraction` sur les likes et les reposts) ne disent rien.
// La supprimer coupait l'apprentissage du moteur pour les comptes du test.
// Elle est redessinée en 2B : voir `AlgoCheckGutter`.
import AlgoCheckGutter from '../components/feed/paper2b/AlgoCheckGutter';
// Visite guidée : les bulles se posent sur CES éléments-là, pas sur des
// copies. Voir `components/tour/Feed2BTour.tsx`.
import { useTourAnchor, useTourAction } from '../components/tour/Feed2BTour';
import {
  initialAlgoCheckState,
  shouldAskAt,
  afterAsk,
  afterSilentView,
  afterInteraction,
} from '../utils/algoCheck';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Platform,
  UIManager,
  StatusBar,
  RefreshControl,
  Image,
  AppState,
  Dimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  cancelAnimation,
  runOnJS,
  Extrapolation,
  FadeIn,
  LinearTransition,
} from 'react-native-reanimated';
import { clamp, projectDecay, rubberBand, springFrom } from '../utils/gesture';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { apiService, progressiveRecommendationService } from '../services';
import { neuralRankService } from '../services/neuralRankService';
import { Tweet, RecommendationItem, RecommendationRequest, ProgressiveRecommendationRequest, ProgressiveRecommendationItem } from '../types/api';
import Avatar from '../components/Avatar';
import BanAlertBanner from '../components/BanAlertBanner';
import ClickableMentions from '../components/ClickableMentions';
import { useAuth } from '../contexts/AuthContext';
import { useOffline } from '../contexts/OfflineContext';
import { cacheFeed, getCachedFeed } from '../services/offlineService';
import OfflineBanner from '../components/OfflineBanner';
import { registerForPushNotifications } from '../services/push';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { trackingService } from '../services/trackingService';
import { useTweetScreenTracking } from '../hooks/useBehaviorTracking';
import { useEventStyles } from '../hooks/useEventStyles';
import EventStrip from '../components/events/EventStrip';
import ReportSheet from '../components/ReportSheet';
import TweetRowGutter from '../components/feed/paper2b/TweetRowGutter';
import type { TweetRowAction } from '../components/feed/TweetRow';
import PromotedAccountCard from '../components/feed/PromotedAccountCard';
import TweetSkeleton from '../components/feed/TweetSkeleton';
import FeedItemEntrance from '../components/feed/FeedItemEntrance';
import ExploreGrid, { type CardRect } from '../components/feed/ExploreGrid';
import ExploreImmersive from '../components/feed/ExploreImmersive';
import feedback from '../utils/feedback';
import { displayContentOf, splitTweetMedia } from '../utils/tweetMedia';
import { useOptimizedViewTracking } from '../hooks/useOptimizedViewTracking';
import { useDwellTracking } from '../hooks/useDwellTracking';
import StoriesTray from '../components/StoriesTray';
import SpotlightBand from '../components/feed/paper2b/SpotlightBand';
import { PullRefreshLogo } from '../components/ui';
import { usePullRefreshLogo } from '../hooks/usePullRefreshLogo';
import storiesService from '../services/storiesService';
import PaywallSetupSheet from '../components/PaywallSetupSheet';

// ─── Palette ── « papier », propre au test (src/theme/paper2b) ──────────────
import { toast } from '../components/ui/Toast';
import { confirmAsync } from '../components/ui/ConfirmSheet';

/**
 * La palette du fil, redirigée vers « papier ».
 *
 * On garde le MÊME objet `C` que l'original plutôt que de réécrire ses ~200
 * usages : la seule chose qui change est ce qu'il pointe. Un correctif porté
 * de `TweetsScreen` vers ce clone s'applique alors sans retouche de couleur.
 */
const C = {
  bg: paper.bg,
  bgModal: paper.bgBand,
  bgHover: paper.hairline,
  border: paper.hairline,
  borderSubtle: paper.hairline,
  accent: paper.accent,
  accentHover: paper.accent,
  accentMuted: paper.hairline,
  green: paper.reposted,
  red: paper.accent,
  like: paper.accent,
  gold: paper.amber,
  textPrimary: paper.ink,
  textSecondary: paper.inkSoft,
  textMuted: paper.inkMeta,
  white: paper.onAccent,
};

/**
 * Course de référence du glissé entre onglets : la largeur de l'écran.
 *
 * C'est elle qui convertit des pixels de doigt en fraction de bascule. On la
 * lit une fois : la valeur ne sert qu'à donner une échelle au geste, une
 * rotation d'écran ne la rend pas fausse au point de justifier de rebrancher
 * un abonnement aux dimensions dans le chemin chaud du fil.
 */
const SWIPE_SPAN = Dimensions.get('window').width;
/** Fraction de la course, PROJETÉE, au-delà de laquelle l'onglet bascule. */
const SWIPE_COMMIT = 0.32;

/**
 * Les trois onglets du fil, dans leur ordre d'affichage — c'est aussi l'ordre
 * du glissé horizontal (0 = le plus à gauche). `explore` a été ajouté à droite
 * de « Pour toi » : le geste de bascule (plus bas) est écrit en fonction de
 * cette longueur, jamais en dur pour deux onglets.
 */
const TAB_ORDER = ['following', 'forYou', 'explore'] as const;
type FeedTab = typeof TAB_ORDER[number];
const tabIndexOf = (tab: FeedTab): number => TAB_ORDER.indexOf(tab);

/**
 * Fusionne une nouvelle page de tweets dans la liste existante en écartant les
 * id déjà présents.
 *
 * Sans cette déduplication, `keyExtractor` (qui ne retourne que `item.id`)
 * produisait des clés dupliquées dans la FlatList dès qu'une page se
 * chevauchait avec la précédente — ce qui arrive « parfois » côté API
 * (fenêtre de pagination décalée, recommandation déjà vue réinjectée) et
 * systématiquement lors d'une course entre un rafraîchissement et une
 * pagination encore en vol.
 */
/**
 * Les publicités échappent à toute déduplication — jamais bloquées, jamais
 * bloquantes.
 *
 * Une publicité de tweet réutilise le VRAI id du tweet promu (voir
 * `neuralRankRoutes.js` → `injectAds`) : c'est ce qui lui laisse suivre le
 * même classement et le même affichage que n'importe quel contenu. Deux
 * problèmes en découlaient, réglés tous les deux ici :
 *
 * 1. Ce même tweet peut remonter organiquement ailleurs dans le fil — un
 *    tweet qu'on fait la publicité a de bonnes chances d'être aussi
 *    recommandé pour ses propres mérites. Dédupliquer par id nu confondait
 *    les deux occurrences et gardait la première, presque toujours la
 *    version SANS l'étiquette « Sponsorisé ».
 * 2. La MÊME publicité peut légitimement occuper plusieurs emplacements
 *    d'une même page (voir `select_for_feed` côté moteur : avec peu de
 *    campagnes actives, elle revient toutes les 4 lignes plutôt que de
 *    laisser des emplacements vides — c'est voulu). Une première version de
 *    ce correctif dédupliquait par id de PUBLICITÉ plutôt que par id de
 *    tweet : ça réglait le point 1 mais recréait le même bug pour les
 *    répétitions légitimes d'une même campagne, qui se faisaient à nouveau
 *    avaler après la première occurrence.
 *
 * La seule règle qui satisfait les deux à la fois : une entrée publicitaire
 * n'est jamais comparée à rien, ni pour être écartée, ni pour en écarter une
 * autre. Le moteur a déjà décidé combien de fois et où ; le client n'a plus
 * qu'à afficher.
 */
function mergeUniqueTweets(base: Tweet[], incoming: Tweet[]): Tweet[] {
  const seen = new Set(base.filter((t) => !(t as any).is_ad).map((t) => t.id));
  const merged = base.slice();
  for (const tweet of incoming) {
    if (!tweet?.id) continue;
    if ((tweet as any).is_ad) { merged.push(tweet); continue; }
    if (seen.has(tweet.id)) continue;
    seen.add(tweet.id);
    merged.push(tweet);
  }
  return merged;
}

/** Écarte les doublons internes à une même page avant tout affichage. */
function dedupeTweets(list: Tweet[]): Tweet[] {
  const seen = new Set<string>();
  const out: Tweet[] = [];
  for (const tweet of list) {
    if (!tweet?.id) continue;
    if ((tweet as any).is_ad) { out.push(tweet); continue; }
    if (seen.has(tweet.id)) continue;
    seen.add(tweet.id);
    out.push(tweet);
  }
  return out;
}

export default function FeedGutterScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();

  const { styles: eventStyles, theme: currentTheme } = useEventStyles();

  // Mode hors ligne (Pro) : cache du fil et bandeau d'état.
  const {
    enabled: offlineEnabled,
    online,
    pending: pendingTweets,
    pendingActions,
    queueAction,
  } = useOffline();
  const offlineUserId = user?.id ? String(user.id) : '';
  /** Le fil courant vient-il du cache ? Empêche un appelant en amont de
      réafficher une erreur que le repli vient justement d'écarter. */
  const servedFromCacheRef = useRef(false);

  // `useFunctionalEventFeatures({ pageName: 'tweets', refreshInterval: 30000 })`
  // vivait ici et n'alimentait plus que le second bandeau, désormais supprimé.
  // Il entretenait un minuteur de 30 s relançant deux requêtes non mises en
  // cache — sur l'écran du fil, en permanence. `EventStrip` lit l'état déjà
  // chargé par `EventsProvider` et ne demande rien à personne.

  const { trackTweetInteraction, trackProfileInteraction, trackSettingChange, trackCustomAction } = useTweetScreenTracking('TweetsScreen');

  const [tweets, setTweets] = useState<Tweet[]>([]);
  /** Tweet dont on est en train de fixer le prix, `null` quand la feuille est fermée. */
  const [paywallTarget, setPaywallTarget] = useState<string | null>(null);
  // Miroir en ref : permet aux handlers d'être stables (donc mémoïsables et
  // transmissibles aux lignes) tout en lisant toujours la liste à jour.
  const tweetsRef = useRef<Tweet[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Incrémenté au pull-to-refresh pour recharger la barre de stories.
  const [storiesRefresh, setStoriesRefresh] = useState(0);

  /**
   * Arrivée des lignes — voir `components/feed/FeedItemEntrance.tsx`.
   *
   * `entranceSeen` est la mémoire des lignes DÉJÀ apparues : elle vit ici, à
   * l'écran, et pas dans la ligne, précisément parce qu'une ligne est
   * recyclée. Sans elle, chaque remontée à l'écran rejouerait l'animation —
   * le défaut qui avait fait rejeter la première tentative.
   *
   * Les deux vont par paire : on incrémente la génération ET on vide le `Set`,
   * jamais l'un sans l'autre.
   */
  const [entranceGeneration, setEntranceGeneration] = useState(0);
  const entranceSeen = useRef<Set<string>>(new Set()).current;
  const markNewBatch = useCallback(() => {
    entranceSeen.clear();
    setEntranceGeneration((n) => n + 1);
  }, [entranceSeen]);
  // Auteurs ayant une story active (non expirée) : alimente l'anneau autour
  // de l'avatar dans le fil, distinct du badge de vérification.
  const [storyUserIds, setStoryUserIds] = useState<Set<string>>(new Set());
  const [unseenStoryUserIds, setUnseenStoryUserIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  // Ancres de la visite guidée. Elles ne changent rien au rendu : ce sont des
  // refs posées sur des vues qui existaient déjà.
  const tabsAnchor = useTourAnchor('tabs');
  const exploreAnchor = useTourAnchor('explore');
  const gutterAnchor = useTourAnchor('gutter');
  const algoAnchor = useTourAnchor('algo');

  const [activeTab, setActiveTab] = useState<FeedTab>('forYou');
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());

  // ─── Onglet Explorer — état entièrement séparé ─────────────────────────────
  //
  // Volontairement PAS branché sur `tweets`/`tabCacheRef` : ce couple est
  // profondément lié au fil linéaire (like/retweet optimistes, suivi de vues,
  // repli hors ligne, pagination par `offset` partagé). La grille n'affiche
  // que des cartes tapables vers le détail — aucune de ces mécaniques n'y est
  // invoquée — donc lui donner son propre état évite de réinterroger tout ce
  // câblage déjà réglé pour deux onglets.
  const [exploreTweets, setExploreTweets] = useState<Tweet[]>([]);
  const [exploreLoading, setExploreLoading] = useState(false);
  const [exploreRefreshing, setExploreRefreshing] = useState(false);
  const [exploreLoadingMore, setExploreLoadingMore] = useState(false);
  const [exploreError, setExploreError] = useState<string | null>(null);
  const [exploreHasMore, setExploreHasMore] = useState(true);
  const [exploreOffset, setExploreOffset] = useState(0);
  const exploreGenerationRef = useRef(0);
  // Vrai quand un tirage neuf n'a plus rien apporté : coupe la relance
  // automatique en bas de page (voir `onExploreEndReached`).
  const exploreExhaustedRef = useRef(false);

  /**
   * Date de la dernière visite d'Explorer, pour marquer ce qui est arrivé
   * depuis. `exclude_seen` retire déjà le déjà-vu côté serveur, mais en
   * SILENCE : rien ne signale au lecteur que la page a changé, donc il n'a
   * aucune raison de revenir demain. Ce marqueur rend le mécanisme visible.
   */
  const [lastExploreVisitAt, setLastExploreVisitAt] = useState<number | null>(null);
  const exploreEnteredAtRef = useRef<number | null>(null);

  useEffect(() => {
    AsyncStorage.getItem('explore:lastVisitAt')
      .then((raw) => { if (raw) setLastExploreVisitAt(Number(raw)); })
      .catch(() => {});
  }, []);

  /**
   * On mémorise l'instant d'ENTRÉE, pas celui de sortie : sinon tout ce qui
   * paraît pendant la visite serait déjà compté comme « vu » au retour.
   *
   * L'état est avancé en même temps que le stockage : sans ça, une deuxième
   * visite dans la MÊME session compterait encore depuis la date lue au
   * démarrage, et annoncerait comme neufs des tweets déjà vus à la visite
   * précédente.
   */
  const rememberExploreVisit = useCallback(() => {
    const enteredAt = exploreEnteredAtRef.current;
    if (!enteredAt) return;
    exploreEnteredAtRef.current = null;
    setLastExploreVisitAt(enteredAt);
    AsyncStorage.setItem('explore:lastVisitAt', String(enteredAt)).catch(() => {});
  }, []);

  // Index ouvert en lecture ; `null` = grille seule. `immersiveOrigin` est le
  // rectangle de la carte touchée : la lecture s'agrandit depuis lui.
  const [immersiveIndex, setImmersiveIndex] = useState<number | null>(null);
  const [immersiveOrigin, setImmersiveOrigin] = useState<CardRect | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  // Cible du signalement en cours ; null = feuille fermée.
  const [reportTarget, setReportTarget] = useState<{ id: string; label?: string } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalTweets, setTotalTweets] = useState(0);
  // Verrous d'action : en `ref`, pas en state — ils ne changent rien à
  // l'affichage et provoquaient deux rendus complets du fil par like.
  const likeLockRef = useRef<{ [key: string]: boolean }>({});
  const retweetLockRef = useRef<{ [key: string]: boolean }>({});
  const superLikeLockRef = useRef<{ [key: string]: boolean }>({});

  // Numéro de génération de la requête en cours pour l'onglet actif.
  // Un rafraîchissement l'incrémente ; une pagination lancée avant lui capture
  // l'ancienne valeur et, en résolvant après coup, se voit ignorée au lieu de
  // ré-ajouter des tweets déjà présents dans la liste fraîchement rechargée —
  // c'était la cause des doublons d'id vus « parfois » au reload.
  const fetchGenerationRef = useRef(0);

  // Cache par onglet : « Pour toi » et « Abonnements » partageaient un seul
  // tableau, si bien que changer d'onglet affichait le contenu de l'autre.
  const tabCacheRef = useRef<Record<'following' | 'forYou', Tweet[]>>({
    following: [],
    forYou: [],
  });
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [currentAlgorithm, setCurrentAlgorithm] = useState<'neural_rank' | 'progressive'>('neural_rank');
  const [algorithmStats, setAlgorithmStats] = useState<{ [key: string]: number }>({});
  const [displayedAlgorithm, setDisplayedAlgorithm] = useState<string>('neural_rank');

  // ─── Indicateur d'onglet — thread UI (auparavant useNativeDriver: false) ──
  //
  // La position de la pastille était auparavant recalculée à la main à partir
  // de la largeur de la barre, du padding et du gap. Deux défauts :
  //  - les insets d'un enfant absolu ne se mesurent pas dans le même repère
  //    que le `x` d'un enfant en flux, si bien que la pastille pouvait se
  //    retrouver décalée du padding ;
  //  - au premier rendu la largeur vaut 0, donc la pastille apparaissait
  //    d'un coup à la bonne place au lieu de se poser.
  // On mesure donc chaque onglet et on pilote la pastille sur ces valeurs, à
  // l'intérieur d'une piste `absoluteFill` qui, elle, ignore le padding.
  const tabIndicator = useSharedValue(tabIndexOf(activeTab));
  const tabLayouts = useSharedValue<{ x: number; y: number; width: number; height: number }[]>(
    TAB_ORDER.map(() => ({ x: 0, y: 0, width: 0, height: 0 })),
  );
  /** Passe à 1 quand les deux onglets sont mesurés : évite le pop. */
  const tabsReady = useSharedValue(0);

  const handleTabLayout = useCallback(
    (index: number) => (e: LayoutChangeEvent) => {
      const { x, y, width, height } = e.nativeEvent.layout;
      const next = tabLayouts.value.slice();
      next[index] = { x, y, width, height };
      tabLayouts.value = next;
      if (next.every((l) => l.width > 0) && tabsReady.value === 0) {
        tabsReady.value = withTiming(1, { duration: 140 });
      }
    },
    [tabLayouts, tabsReady],
  );

  /**
   * Glissé horizontal entre les deux onglets.
   *
   * `swipe` porte le décalage du doigt en px. Il sert à DEUX choses en même
   * temps — décaler le fil et avancer la pastille — parce qu'un geste doit
   * montrer où il mène pendant qu'on le fait, pas seulement une fois relâché.
   */
  const swipe = useSharedValue(0);
  const swipeStart = useSharedValue(0);
  /**
   * Onglet courant, en valeur partagée : un worklet ne peut pas lire un state
   * React ni une ref. 0 = « Abonnements » (à gauche), 1 = « Pour toi ».
   */
  const tabIndex = useSharedValue(tabIndexOf(activeTab));
  useEffect(() => {
    tabIndex.value = tabIndexOf(activeTab);
  }, [activeTab, tabIndex]);

  const tabIndicatorStyle = useAnimatedStyle(() => {
    const layouts = tabLayouts.value;
    if (!layouts.every((l) => l.width > 0)) {
      return {
        opacity: 0,
        width: 0,
        height: 0,
        transform: [{ translateX: 0 }, { translateY: 0 }] as const,
      };
    }
    // La pastille suit le doigt : glisser vers la gauche (valeur négative) la
    // fait avancer vers l'onglet suivant. Sans ce terme, le geste n'aurait de
    // retour visuel qu'au moment où il est déjà joué.
    //
    // `interpolate` généralise ici à N points (un par onglet) exactement comme
    // à deux : chaque point d'entrée est l'index de l'onglet, chaque sortie sa
    // mesure. Avec deux onglets, c'est rigoureusement le calcul d'avant.
    const inputRange = layouts.map((_, i) => i);
    const p = clamp(tabIndicator.value - swipe.value / SWIPE_SPAN, 0, layouts.length - 1);
    return {
      opacity: tabsReady.value,
      width: interpolate(p, inputRange, layouts.map((l) => l.width)),
      height: interpolate(p, inputRange, layouts.map((l) => l.height)),
      transform: [
        { translateX: interpolate(p, inputRange, layouts.map((l) => l.x)) },
        { translateY: interpolate(p, inputRange, layouts.map((l) => l.y)) },
      ] as const,
    };
  });

  const animateTabSwitch = useCallback((tab: FeedTab) => {
    tabIndicator.value = withSpring(tabIndexOf(tab), {
      damping: 20,
      stiffness: 220,
    });
  }, [tabIndicator]);

  /**
   * Indirection vers `handleTabChange`, qui est déclaré bien plus bas.
   *
   * Le geste est construit une fois et ne peut donc pas capturer une closure
   * qui, elle, change à chaque rendu. La ref règle à la fois le problème de
   * l'ordre de déclaration et celui de la fraîcheur.
   *
   * `switchTab` est indispensable : un worklet reçoit une COPIE des objets
   * qu'il capture, donc lire `ref.current` depuis le thread UI renverrait
   * éternellement la valeur du premier rendu — ici la fonction vide, et la
   * bascule ne partirait jamais. En passant par `runOnJS(switchTab)`, la
   * lecture de la ref a lieu côté JS, où elle est à jour.
   */
  const handleTabChangeRef = useRef<(tab: FeedTab) => void>(() => {});
  const switchTab = useCallback((tab: FeedTab) => {
    handleTabChangeRef.current(tab);
  }, []);

  // La visite guidee bascule elle-meme sur Explorer avant d'en parler : une
  // bulle qui decrit un mur invisible ne montre rien. On passe par `switchTab`
  // (et sa ref) plutot que par `handleTabChange`, defini bien plus bas.
  useTourAction('openExplore', () => switchTab('explore'));

  /**
   * Le geste de bascule d'onglet.
   *
   * Deux onglets côte à côte se changent au doigt, pas seulement en visant un
   * libellé de 90 px en haut de l'écran — c'est le geste le plus fréquent d'un
   * fil, et il n'existait pas.
   *
   * Les trois réglages qui font qu'il ne gêne pas le défilement :
   *  - `activeOffsetX([-24, 24])` : il faut 24 px franchement horizontaux pour
   *    que le geste s'active. En dessous, la liste garde la main.
   *  - `failOffsetY([-16, 16])` : dès que le doigt part vraiment vers le haut
   *    ou le bas, le geste ABANDONNE — il ne reviendra pas voler le
   *    défilement en cours de route.
   *  - `Extrapolation` en butée : sur le premier onglet on ne peut pas aller
   *    plus à gauche ; le fil résiste au lieu de suivre dans le vide.
   */
  const feedSwipe = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-24, 24])
        .failOffsetY([-16, 16])
        .onBegin(() => {
          cancelAnimation(swipe);
          swipeStart.value = swipe.value;
        })
        .onUpdate((event) => {
          const raw = swipeStart.value + event.translationX;
          // Sur le premier onglet un glissé vers la droite ne mène nulle
          // part, et sur le dernier c'est la gauche. Dans ce sens-là, butée
          // élastique : le geste est vu, il n'aboutit pas. Un onglet du
          // milieu n'a pas de bord : les deux sens restent libres.
          const atStart = tabIndex.value <= 0;
          const atEnd = tabIndex.value >= TAB_ORDER.length - 1;
          const outward = (raw > 0 && atStart) || (raw < 0 && atEnd);
          swipe.value = outward ? rubberBand(raw, SWIPE_SPAN * 0.5, 0.55) : raw;
        })
        .onEnd((event) => {
          // Où le doigt envoyait le fil, pas où il l'a laissé : un petit coup
          // sec bascule, une longue traînée molle repose. Un geste ne fait
          // jamais avancer de plus d'un onglet — la course (`SWIPE_SPAN`) est
          // calibrée sur un seul écran, pas sur trois.
          const projected = swipe.value + projectDecay(event.velocityX);
          const commit = Math.abs(projected) > SWIPE_SPAN * SWIPE_COMMIT;
          const step = projected < 0 ? 1 : -1;
          const target = clamp(tabIndex.value + step, 0, TAB_ORDER.length - 1);

          if (commit && target !== tabIndex.value) {
            runOnJS(switchTab)(TAB_ORDER[target]);
          }
          // Le fil revient toujours à sa place : le contenu du nouvel onglet
          // est servi depuis son cache et remplace l'ancien sous le doigt. Le
          // faire sortir puis rentrer ferait clignoter une liste déjà là.
          swipe.value = withSpring(0, springFrom(event.velocityX));
        }),
    [swipe, swipeStart, tabIndex, switchTab],
  );

  /**
   * Le retour visuel du geste passe UNIQUEMENT par la pastille d'onglet
   * (voir `tabIndicatorStyle`), et surtout pas par une translation de la liste.
   *
   * Une vue animée posée autour du fil empêche l'aplatissement des vues sur
   * tout son sous-arbre et ajoute une composition par image pendant le
   * défilement — c'est-à-dire exactement là où l'app doit être irréprochable.
   * Le prix payé était sans commune mesure avec ce que le décalage apportait.
   */
  // Un seul traqueur de vues pour tout le fil. Auparavant chaque tweet montait
  // sa propre instance ET un setInterval(500ms) avec measureInWindow : à 150
  // tweets, ~300 allers-retours de pont par seconde, et aucun regroupement
  // possible puisque le cache de déduplication était par ligne.
  // FlatList qualifie déjà l'impression après 500 ms ; le batcher doit donc
  // l'enregistrer immédiatement au lieu d'ajouter un second délai de 2 s.
  const { trackView } = useOptimizedViewTracking({
    minViewTime: 0,
    debounceMs: 600,
    batchSize: 20,
  });
  const feedImpressionsRef = useRef<Set<string>>(new Set());

  const sendNotificationToken = async () => {
    try {
      const projectId = '341da021-111f-4a0c-9f54-0b5f4c9c3965';
      const notificationToken = await registerForPushNotifications(projectId);
      if (notificationToken) {
        await apiService.updateNotificationToken(notificationToken);
      }
    } catch (error) { }
  };

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
    loadSavedAlgorithm();
    sendNotificationToken();
  }, []);

  const loadSavedAlgorithm = async () => {
    // NeuralRank v2 est le seul algorithme — on force et on sauvegarde
    try { await AsyncStorage.setItem('selectedAlgorithm', 'neural_rank'); } catch { }
    return 'neural_rank';
  };

  // Note : le chargement au focus est assuré uniquement par le `useFocusEffect`
  // plus bas. Un `navigation.addListener('focus')` faisait ici double emploi et
  // déclenchait deux requêtes concurrentes au premier affichage.

  /**
   * Repli hors ligne (Pro) : plutôt qu'un fil vide et « Vérifiez votre
   * connexion », on ressert la dernière copie reçue. Ne s'applique QUE sur un
   * rafraîchissement raté — en pagination, un échec ne doit pas remplacer ce
   * qui est déjà à l'écran par du cache.
   *
   * ⚠ À appeler sur TOUS les chemins d'échec, pas seulement dans un `catch` :
   * `neuralRankService` intercepte l'erreur réseau et renvoie
   * `{ success: false, error }` au lieu de la propager. Ne brancher le repli
   * que sur les exceptions le rendait inopérant sur l'onglet « Pour toi » —
   * l'écran affichait le message d'erreur réseau alors qu'un cache valide
   * était disponible.
   */
  const fallbackToCache = useCallback(async (): Promise<boolean> => {
    if (!offlineEnabled || !offlineUserId) return false;
    const cached = await getCachedFeed(offlineUserId);
    if (!cached) return false;
    setTweets(cached.tweets);
    tweetsRef.current = cached.tweets;
    setError(null);
    setHasMore(false);
    servedFromCacheRef.current = true;
    return true;
  }, [offlineEnabled, offlineUserId]);

  /**
   * Hors ligne avec un cache sous la main : inutile d'attendre l'expiration
   * d'une requête vouée à échouer. On sert directement, la coupure est déjà
   * connue.
   */
  const serveCacheIfOffline = useCallback(async (): Promise<boolean> => {
    if (!offlineEnabled || online) return false;
    return fallbackToCache();
  }, [offlineEnabled, online, fallbackToCache]);

  /** Enregistre le fil affiché pour la prochaine coupure. */
  const rememberFeed = useCallback(
    (list: Tweet[]) => {
      if (!offlineEnabled || !offlineUserId || list.length === 0) return;
      cacheFeed(offlineUserId, list);
    },
    [offlineEnabled, offlineUserId],
  );

  const fetchTweets = async (refresh: boolean = false) => {
    if (refresh && (await serveCacheIfOffline())) { setLoading(false); return; }
    // Capturée avant l'appel réseau : si un rafraîchissement démarre pendant
    // que cette requête est en vol, sa génération devient obsolète et son
    // résultat est ignoré au retour plutôt que fusionné dans la mauvaise liste.
    if (refresh) fetchGenerationRef.current += 1;
    const generation = fetchGenerationRef.current;

    try {
      if (refresh) { setOffset(0); setHasMore(true); setCurrentPage(1); }
      setLoadingMore(true);
      setError(null);

      const currentOffset = refresh ? 0 : offset;

      // On utilise le nouvel endpoint IA pour les abonnements
      const response = await apiService.getFollowingRecommendations({
        limit: 10,
        offset: currentOffset
      });

      if (generation !== fetchGenerationRef.current) return;

      if (response && response.success && response.data && response.data.recommendations && Array.isArray(response.data.recommendations)) {
        const normalizedTweets: Tweet[] = [];
        for (const rec of response.data.recommendations) {
          const t = normalizeRecommendationToTweet(rec);
          if (t) normalizedTweets.push(t);
        }

        if (refresh) {
          const fresh = dedupeTweets(normalizedTweets);
          setTweets(fresh);
          rememberFeed(fresh);
        } else {
          setTweets(prev => mergeUniqueTweets(prev, normalizedTweets));
        }

        if (response.data.pagination) {
          setHasMore(response.data.pagination.hasMore);
          setOffset(currentOffset + normalizedTweets.length);
          setTotalTweets(response.data.pagination.total);
          setTotalPages((response.data.pagination as any).totalPages || Math.ceil(response.data.pagination.total / 10));
          if (!refresh) setCurrentPage((response.data.pagination as any).currentPage || Math.floor(currentOffset / 10) + 1);
        }
      } else {
        if (refresh) { setError('Aucun tweet trouvé'); setTweets([]); }
      }
    } catch (err) {
      if (refresh && !(await fallbackToCache())) {
        setError('Erreur de connexion');
        setTweets([]);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const normalizeRecommendationToTweet = (rec: any): Tweet | null => {
    try {
      let tweetData = rec;
      if (rec.tweet && typeof rec.tweet === 'object') tweetData = rec.tweet;
      const id = tweetData.id || tweetData._id || rec.author?.id || `rec_${Date.now()}_${Math.random()}`;
      const content = tweetData.content || tweetData.text || tweetData.message || rec.content || '';
      const author = tweetData.author || rec.author;
      if (!id) return null;
      const isRetweet = tweetData.is_retweet || tweetData.tweet_type === 'retweet' || rec.is_retweet;
      const isQuote = tweetData.is_quote || tweetData.tweet_type === 'quote' || rec.is_quote;
      // Un COMPTE promu n'est pas un tweet : il n'a ni contenu propre ni
      // engagement, seulement un profil à montrer. Le test « pas de contenu =
      // pas une carte » le jetterait avant même d'arriver à la liste.
      const promotedAccount = tweetData.promoted_account || rec.promoted_account || null;
      if (!promotedAccount && !isRetweet && !isQuote
          && (!content || typeof content !== 'string' || content.trim().length === 0)) return null;
      if (!author || !author.id) return null;
      return {
        id: String(id), content: String(content).trim(),
        author: { 
          id: String(author.id), 
          username: author.username || author.handle || `user_${author.id}`, 
          full_name: author.full_name || author.name || author.displayName || author.username || 'Utilisateur', 
          avatar: author.avatar || author.profile_image || author.avatarUrl, 
          verified: author.verified || false,
          verification_style: author.verification_style || 'default',
          premium: author.premium || false,
          // L'habillage d'un compte le suit dans le fil : sans ce report, la
          // normalisation le jetait et le nom retombait mat, alors que l'API le
          // renvoie bien avec l'auteur.
          profile_customization: author.profile_customization || null,
          stats: author.stats || {}
        } as any,
        created_at: tweetData.created_at || tweetData.createdAt || tweetData.timestamp || rec.created_at || new Date().toISOString(),
        stats: { likes: Number(tweetData.stats?.likes || rec.stats?.likes || 0), retweets: Number(tweetData.stats?.retweets || rec.stats?.retweets || 0), replies: Number(tweetData.stats?.replies || rec.stats?.replies || 0), views: Number(tweetData.stats?.views || rec.stats?.views || 0) },
        user_interaction: { is_liked: Boolean(tweetData.user_interaction?.is_liked || false), is_retweeted: Boolean(tweetData.user_interaction?.is_retweeted || false) },
        mentions: tweetData.mentions || rec.mentions || [],
        hashtags: tweetData.hashtags || rec.hashtags || [],
        media_urls: tweetData.media_urls || rec.media_urls || [],
        ...(rec.score !== undefined && { _recommendation_score: Number(rec.score), _recommendation_final_score: Number(rec.finalScore || rec.score), _recommendation_confidence: Number(rec.confidence || 0), _recommendation_algorithm: rec.algorithm || currentAlgorithm }),
        is_ad: Boolean(tweetData.is_ad || rec.is_ad || false),
        ad_data: tweetData.ad_data || rec.ad_data,
        promoted_account: promotedAccount,
        parent_tweet_id: tweetData.parent_tweet_id || rec.parent_tweet_id || null,
        originalTweet: tweetData.originalTweet || rec.originalTweet || null,
        // « Traduction (bêta) » : cette normalisation recopie les champs un à
        // un, donc un champ oublié ici disparaît du fil même quand l'API
        // l'envoie — c'est ce qui laissait les tweets en version originale
        // alors que l'écran de détail, lui, les traduisait.
        translation_enabled: Boolean(tweetData.translation_enabled ?? rec.translation_enabled ?? false),
        // Contenu payant : `content` ne contient déjà plus que l'aperçu envoyé
        // par le serveur. Sans ces deux champs, la carte affichait cet aperçu
        // SANS le verrou — donc sans rien à acheter, et sans dire pourquoi le
        // texte est illisible.
        paid_content: tweetData.paid_content || rec.paid_content || null,
        is_locked: Boolean(tweetData.is_locked ?? rec.is_locked ?? false),
      } as any;
    } catch { return null; }
  };

  const fetchProgressiveRecommendations = async (forceRefresh: boolean = true) => {
    try {
      setRecommendationsLoading(true);
      setError(null);
      const options: ProgressiveRecommendationRequest = { limit: 20, offset: forceRefresh ? 0 : tweets.length, includeUser: true, includeStats: true, group: 'auto' };
      const response = await progressiveRecommendationService.getProgressiveRecommendations(options);
      if (response && response.success && response.data && response.data.recommendations && Array.isArray(response.data.recommendations)) {
        const normalizedTweets: Tweet[] = [];
        for (const rec of response.data.recommendations) {
          const t = progressiveRecommendationService.normalizeProgressiveRecommendationToTweet(rec);
          if (t) normalizedTweets.push(t);
        }
        if (normalizedTweets.length === 0) { if (forceRefresh) { setError('Aucune recommandation progressive valide'); setTweets([]); } return; }
        if (forceRefresh) setTweets(dedupeTweets(normalizedTweets));
        else setTweets(prev => mergeUniqueTweets(prev, normalizedTweets));
        setCurrentAlgorithm('progressive');
        setDisplayedAlgorithm('progressive');
      } else {
        if (forceRefresh) setError('Erreur lors de la récupération des recommandations progressives');
      }
    } catch { if (forceRefresh) setError('Erreur lors de la récupération des recommandations progressives'); }
    finally { setRecommendationsLoading(false); }
  };

  const fetchNeuralRankRecommendations = async (forceRefresh: boolean = true) => {
    if (forceRefresh && (await serveCacheIfOffline())) { setLoading(false); return; }
    // Voir fetchTweets : une pagination lancée avant un rafraîchissement ne
    // doit pas réinjecter ses résultats une fois le rafraîchissement terminé.
    if (forceRefresh) fetchGenerationRef.current += 1;
    const generation = fetchGenerationRef.current;

    try {
      setRecommendationsLoading(true);
      setError(null);

      const currentOffset = forceRefresh ? 0 : offset;
      const response = await neuralRankService.getRecommendations({
        mode: 'for_you',
        limit: 20,
        offset: currentOffset,
      });

      if (generation !== fetchGenerationRef.current) return;

      // `success: false` couvre aussi la coupure réseau (le service l'avale) :
      // on tente le cache AVANT d'afficher quoi que ce soit d'alarmant.
      if (!response?.success && forceRefresh && (await fallbackToCache())) return;

      if (response?.success && Array.isArray(response.data?.recommendations)) {
        const tweets = dedupeTweets(
          response.data.recommendations.filter(
            (t: any) => t && t.id && t.author && t.author.id
          )
        );

        if (tweets.length === 0 && forceRefresh) {
          setError('Aucune recommandation NeuralRank disponible');
          setTweets([]);
          return;
        }

        if (forceRefresh) {
          setTweets(tweets);
          rememberFeed(tweets);
        } else {
          setTweets(prev => mergeUniqueTweets(prev, tweets));
        }

        if (response.data.pagination) {
          setHasMore(response.data.pagination.hasMore);
          setOffset(currentOffset + tweets.length);
          setTotalTweets(response.data.pagination.total);
        }

        setCurrentAlgorithm('neural_rank');
        setDisplayedAlgorithm('neural_rank');
      } else {
        if (forceRefresh) setError(response?.error || 'Erreur NeuralRank');
      }
    } catch {
      if (forceRefresh && !(await fallbackToCache())) {
        setError('Erreur de connexion NeuralRank');
      }
    } finally {
      setRecommendationsLoading(false);
    }
  };

  const fetchRecommendations = async (_algorithm?: string, forceRefresh: boolean = true) => {
    await fetchNeuralRankRecommendations(forceRefresh);
  };

  /**
   * Onglet Explorer : le mode `trending` du recommandeur Rust — 40 % score de
   * base, 60 % vélocité d'engagement récente (voir `algorithm/trending.rs`
   * côté service). C'est délibérément un mode DIFFÉRENT de `for_you`
   * (personnalisé) et de `discover` (qui déprécie les comptes déjà suivis) :
   * une grille de découverte doit montrer ce qui prend de l'ampleur, suivi ou
   * non, pas repartir du graphe social de la personne qui regarde.
   *
   * Les réponses de la grille sont filtrées des réponses (`tweet_type ===
   * 'reply'`) : une réponse sortie de son fil de discussion, sans le tweet
   * auquel elle répond au-dessus, ne veut rien dire dans une carte de grille.
   */
  /**
   * @param forceRefresh recalcule le classement côté serveur (voir plus bas)
   * @param appendOnly   garde la liste affichée et n'y ajoute que l'inédit
   *
   * `appendOnly` sert le « nouveau tirage » de fin de grille : on veut un
   * classement recalculé (donc `forceRefresh`) SANS remplacer ce qui est à
   * l'écran, sinon le geste renverrait l'utilisateur en haut d'une grille
   * repartie de zéro. Le mélange pondéré côté Rust fait remonter des tweets
   * restés sous la coupure au tirage précédent ; `mergeUniqueTweets` écarte
   * ceux qui étaient déjà là, donc rien n'est jamais montré deux fois.
   */
  const fetchExplore = async (forceRefresh: boolean = true, appendOnly: boolean = false) => {
    if (forceRefresh) exploreGenerationRef.current += 1;
    const generation = exploreGenerationRef.current;

    try {
      if (forceRefresh && !appendOnly) setExploreLoading(true);
      else setExploreLoadingMore(true);
      setExploreError(null);

      const currentOffset = forceRefresh ? 0 : exploreOffset;
      const response = await neuralRankService.getRecommendations({
        mode: 'trending',
        limit: 20,
        offset: currentOffset,
        // Explorer n'a pas le droit de resservir un classement figé : un
        // rafraîchissement doit vraiment changer le feed, pas repartir sur le
        // même cache Rust (jusqu'à 60 s pour `trending`). Pagination
        // (`forceRefresh` faux) continue elle sur le classement déjà en
        // cache, pour ne pas décaler l'ordre pendant un défilement en cours.
        forceRefresh,
        // Explorer est la seule surface qui doit être NEUVE à chaque visite :
        // rouvrir la page sur ce qu'on a déjà lu hier est ce qui fait qu'on ne
        // la rouvre plus. Le fil et « Pour toi » ne le demandent pas — eux
        // assument de resservir un tweet manqué.
        excludeSeen: true,
      });

      if (generation !== exploreGenerationRef.current) return;

      if (response?.success && Array.isArray(response.data?.recommendations)) {
        // ── Ce qui a le droit d'entrer dans la grille ────────────────────────
        // `t.content` non vide était exigé : ça jetait silencieusement TOUT
        // retweet pur (son texte est sur l'original, la ligne du retweet a
        // `content: ''`) et tout tweet publié en image seule. L'API elle-même
        // les accepte — son propre contrôle (`hasRenderableContent`) demande du
        // texte OU du média, sur le tweet ou son original. Sur une page dont le
        // problème est la taille du vivier, c'était une coupe nette pour rien.
        //
        // Les réponses restent écartées (une réponse sortie de son fil ne veut
        // rien dire dans une grille), mais sur `parent_tweet_id` et non sur
        // `tweet_type` : en base, des tweets typés `'tweet'` ont un parent
        // renseigné — voir le commentaire de `RawTweet.parent_tweet_id` côté
        // Rust. `tweet_type` en laissait donc passer.
        const tweets = dedupeTweets(
          response.data.recommendations.filter((t: any) => {
            if (!t || !t.id || !t.author?.id) return false;
            if (t.parent_tweet_id || t.tweet_type === 'reply') return false;
            const source = t.is_retweet && t.originalTweet ? t.originalTweet : t;
            const hasText = !!String(source?.content || '').trim();
            const hasMedia = Array.isArray(source?.media_urls) && source.media_urls.length > 0;
            return hasText || hasMedia;
          })
        );

        let added = tweets.length;
        setExploreTweets((prev) => {
          if (forceRefresh && !appendOnly) return tweets;
          const merged = mergeUniqueTweets(prev, tweets);
          added = merged.length - prev.length;
          return merged;
        });

        if (response.data.pagination) {
          // Un tirage qui n'apporte rien d'inédit signifie que le vivier est
          // réellement épuisé — c'est là, et seulement là, que la grille cesse
          // de proposer une suite.
          setExploreHasMore(appendOnly ? added > 0 : response.data.pagination.hasMore);
          setExploreOffset(currentOffset + tweets.length);
        }
        if (appendOnly) exploreExhaustedRef.current = added === 0;
        else if (forceRefresh) exploreExhaustedRef.current = false;

        if (forceRefresh && !appendOnly && tweets.length === 0) {
          setExploreError('Rien à explorer pour l’instant');
        }
      } else if (forceRefresh && !appendOnly) {
        setExploreError(response?.error || 'Erreur de chargement');
      }
    } catch {
      if (forceRefresh && !appendOnly) setExploreError('Erreur de connexion');
    } finally {
      setExploreLoading(false);
      setExploreRefreshing(false);
      setExploreLoadingMore(false);
    }
  };

  const sendRecommendationFeedback = async (tweetId: string, action: 'like' | 'dislike' | 'skip' | 'share' | 'bookmark') => {
    try { await apiService.sendRecommendationFeedback({ tweetId, action, algorithm: currentAlgorithm, sessionId: `session_${Date.now()}` }); } catch { }
  };

  const fetchFollowing = async () => {
    try {
      if (!user?.id) return;
      const res = await apiService.getUserFollowing(user.id, { limit: 500 });
      if (res && res.success && res.data && Array.isArray((res.data as any).following)) {
        const ids = new Set<string>();
        ids.add(user.id);
        for (const u of (res.data as any).following) { if (u && u.id) ids.add(u.id); }
        setFollowingIds(ids);
      }
    } catch { }
  };

  /** Anneau de story dans le fil : reflète une story active, jamais le badge vérifié. */
  const loadStoryRings = useCallback(async () => {
    const feed = await storiesService.getFeed();
    const withStories = new Set<string>();
    const withUnseen = new Set<string>();
    if (feed.self.stories.length > 0 && feed.self.user?.id) {
      withStories.add(String(feed.self.user.id));
    }
    feed.groups.forEach((group) => {
      const id = group.user?.id ? String(group.user.id) : '';
      if (!id) return;
      withStories.add(id);
      if (group.has_unseen) withUnseen.add(id);
    });
    setStoryUserIds(withStories);
    setUnseenStoryUserIds(withUnseen);
  }, []);

  useEffect(() => {
    void loadStoryRings();
  }, [loadStoryRings, storiesRefresh]);

  const onRefresh = useCallback(async () => {
    trackCustomAction('refresh', 'pull_to_refresh', 'user_action', { tab: activeTab, algorithm: currentAlgorithm, tweets_before_refresh: tweetsRef.current.length });
    setStoriesRefresh((value) => value + 1);

    if (activeTab === 'explore') {
      setExploreRefreshing(true);
      await fetchExplore(true);
      // La grille a sa propre arrivée (voir `ExploreWall`), déclenchée là-bas.
      return;
    }

    setRefreshing(true);
    setError(null);
    servedFromCacheRef.current = false;
    try {
      if (activeTab === 'forYou') await fetchRecommendations(undefined, true);
      else {
        // Les deux appels sont indépendants : les enchaîner doublait pour rien
        // le temps d'attente du rafraîchissement. `allSettled` et non `all` :
        // hors ligne, l'échec de `fetchFollowing` faisait remonter une erreur
        // ici et réaffichait le bandeau que le repli sur cache venait d'effacer.
        await Promise.allSettled([fetchTweets(true), fetchFollowing()]);
      }
      // APRÈS la requête : la fournée est posée, les lignes peuvent entrer.
      // Avant, l'animation partirait sur le contenu encore ancien.
      markNewBatch();
    } catch {
      if (!servedFromCacheRef.current) setError('Erreur lors du rafraîchissement');
    }
    finally { setRefreshing(false); }
  }, [activeTab, currentAlgorithm, trackCustomAction, markNewBatch]);

  /**
   * Changement d'onglet.
   *
   * Chaque onglet a son propre cache : on affiche immédiatement son contenu
   * déjà chargé, et on ne relance une requête que s'il est vide. Auparavant les
   * deux onglets partageaient un unique tableau, ce qui affichait le contenu du
   * précédent après le basculement.
   */
  const handleTabChange = useCallback(async (newTab: FeedTab) => {
    if (newTab === activeTab) return;

    trackCustomAction('tab_change', newTab, 'navigation', { previous_tab: activeTab, new_tab: newTab, algorithm: currentAlgorithm, tweets_loaded: tweetsRef.current.length });

    // L'onglet Explorer a son propre état (voir sa déclaration) : il ne
    // touche jamais `tabCacheRef`/`tweets`, qui restent aux deux onglets du
    // fil linéaire.
    if (newTab === 'explore') {
      exploreEnteredAtRef.current = Date.now();
      setActiveTab(newTab);
      animateTabSwitch(newTab);
      if (exploreTweets.length === 0) await fetchExplore(true);
      return;
    }

    // Passé le retour ci-dessus, la cible n'est plus Explorer : si on en
    // VIENT, la visite se termine maintenant. `rememberExploreVisit` se garde
    // lui-même sur `exploreEnteredAtRef`, qui n'est posé qu'en ENTRANT dans
    // Explorer, donc l'appel est sans effet depuis le fil linéaire. Le placer
    // dans le `if (activeTab !== 'explore')` juste dessous ferait l'inverse de
    // ce qu'on veut : il partirait en quittant le fil linéaire, et jamais en
    // quittant Explorer.
    rememberExploreVisit();

    // Mémoriser l'onglet quitté avant de basculer — seulement s'il fait
    // partie du fil linéaire, cible réelle de ce cache.
    if (activeTab !== 'explore') {
      tabCacheRef.current[activeTab] = tweetsRef.current;
    }

    const cached = tabCacheRef.current[newTab];
    setActiveTab(newTab);
    animateTabSwitch(newTab);
    setError(null);
    setTweets(cached);
    tweetsRef.current = cached;

    if (cached.length === 0) {
      setOffset(0);
      setHasMore(true);
      if (newTab === 'forYou') await fetchRecommendations(undefined, true);
      else await fetchTweets(true);
    }
  }, [activeTab, currentAlgorithm, trackCustomAction, animateTabSwitch, exploreTweets.length, rememberExploreVisit]);

  // Rend la dernière version accessible au geste construit plus haut.
  handleTabChangeRef.current = handleTabChange;

  const handleAlgorithmChange = useCallback(async (_newAlgorithm: string) => {
    // Toujours NeuralRank
    if (activeTab === 'forYou') await fetchNeuralRankRecommendations(true);
  }, [activeTab]);

  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedOnce || tweetsRef.current.length === 0) {
        const loadInitialData = async () => {
          // Les abonnements et le fil sont indépendants : les lancer en
          // parallèle supprime une attente en cascade au premier affichage.
          const jobs: Promise<unknown>[] = [];
          if (followingIds.size === 0) jobs.push(fetchFollowing());
          jobs.push(
            activeTab === 'forYou' ? fetchRecommendations(undefined, true) : fetchTweets(true)
          );
          await Promise.all(jobs);
          setHasLoadedOnce(true);
        };
        loadInitialData();
      }
    }, [hasLoadedOnce, activeTab])
  );

  const handleCreateTweet = () => {
    trackCustomAction('create_tweet_button', 'floating_button', 'user_action', { tab: activeTab, algorithm: currentAlgorithm, tweets_visible: tweets.length, source: 'floating_button' });
    (navigation as any).navigate('CreateTweet');
  };

  /**
   * Like optimiste.
   *
   * L'animation est jouée par `TweetRow` sur le thread UI : cette fonction ne
   * fait plus qu'une seule mise à jour d'état (la liste des tweets), là où elle
   * en déclenchait quatre à cinq par appui.
   */
  const handleLike = useCallback(async (tweetId: string) => {
    if (likeLockRef.current[tweetId]) return;
    likeLockRef.current[tweetId] = true;

    const currentTweet = tweetsRef.current.find(t => t.id === tweetId);
    if (!currentTweet) { likeLockRef.current[tweetId] = false; return; }

    const wasLiked = currentTweet.user_interaction?.is_liked || false;
    // Un like retiré perd son éventuel Super Cœur (jamais rendu — voir
    // `handleSuperLike`) : sans ce nettoyage, l'icône restait dorée et le
    // garde-fou de `TweetRow` bloquait toute nouvelle pose après un unlike.
    const wasSuperLiked = currentTweet.user_interaction?.is_super_liked || false;
    const currentLikes = currentTweet.stats?.likes || 0;
    setTweets(prevTweets => prevTweets.map(tweet => tweet.id !== tweetId ? tweet : { ...tweet, stats: { ...tweet.stats, likes: wasLiked ? currentLikes - 1 : currentLikes + 1 }, user_interaction: { ...tweet.user_interaction, is_liked: !wasLiked, is_super_liked: wasLiked ? false : wasSuperLiked } }));

    // Hors ligne : on met en file et on GARDE l'état optimiste. Annuler le like
    // sous les yeux de l'utilisateur alors qu'on sait le réseau coupé lui ferait
    // croire à un refus, et il réessaierait dans le vide.
    if (offlineEnabled && !online) {
      await queueAction({ type: 'like', tweetId, value: !wasLiked });
      likeLockRef.current[tweetId] = false;
      return;
    }

    try {
      const response = await apiService.likeTweet(tweetId);
      if (!response.success) {
        setTweets(prevTweets => prevTweets.map(tweet => tweet.id === tweetId ? { ...tweet, stats: { ...tweet.stats, likes: currentLikes }, user_interaction: { ...tweet.user_interaction, is_liked: wasLiked, is_super_liked: wasSuperLiked } } : tweet));
      } else {
        trackTweetInteraction(tweetId, wasLiked ? 'unlike' : 'like', { tab: activeTab, previous_likes: currentLikes, algorithm: currentAlgorithm });
        if (activeTab === 'forYou') {
          sendRecommendationFeedback(tweetId, wasLiked ? 'dislike' : 'like');
          if (currentAlgorithm === 'neural_rank') neuralRankService.trackInteraction({ tweetId, interactionType: wasLiked ? 'unlike' : 'like' });
        }
      }
    } catch {
      setTweets(prevTweets => prevTweets.map(tweet => tweet.id === tweetId ? { ...tweet, stats: { ...tweet.stats, likes: currentLikes }, user_interaction: { ...tweet.user_interaction, is_liked: wasLiked, is_super_liked: wasSuperLiked } } : tweet));
    } finally { likeLockRef.current[tweetId] = false; }
  }, [activeTab, currentAlgorithm, trackTweetInteraction, offlineEnabled, online, queueAction]);

  /**
   * Super Cœur — pression longue sur le like, réservé au palier Pro (voir
   * `superHeartHelpers` côté API). Contrairement au like, il ne se retire
   * pas d'ici : le retirer passe par le like normal, et le cœur consommé
   * n'est alors jamais rendu — c'est la route serveur qui porte cette règle.
   */
  const handleSuperLike = useCallback(async (tweetId: string) => {
    if (superLikeLockRef.current[tweetId]) return;
    superLikeLockRef.current[tweetId] = true;

    const currentTweet = tweetsRef.current.find(t => t.id === tweetId);
    if (!currentTweet || currentTweet.user_interaction?.is_super_liked) {
      superLikeLockRef.current[tweetId] = false;
      return;
    }

    const wasLiked = currentTweet.user_interaction?.is_liked || false;
    const currentLikes = currentTweet.stats?.likes || 0;
    const revert = () => setTweets(prevTweets => prevTweets.map(tweet => tweet.id !== tweetId ? tweet : {
      ...tweet,
      stats: { ...tweet.stats, likes: currentLikes },
      user_interaction: { ...tweet.user_interaction, is_liked: wasLiked, is_super_liked: false },
    }));

    setTweets(prevTweets => prevTweets.map(tweet => tweet.id !== tweetId ? tweet : {
      ...tweet,
      stats: { ...tweet.stats, likes: wasLiked ? currentLikes : currentLikes + 1 },
      user_interaction: { ...tweet.user_interaction, is_liked: true, is_super_liked: true },
    }));

    if (offlineEnabled && !online) {
      revert();
      toast.info('Hors ligne', { description: 'Le Super Cœur demande une connexion.' });
      superLikeLockRef.current[tweetId] = false;
      return;
    }

    try {
      const response = await apiService.superLikeTweet(tweetId);
      if (!response.success) {
        revert();
        toast.info('Super Cœur', { description: response.message || 'Impossible de poser le Super Cœur.' });
      }
    } catch {
      revert();
    } finally { superLikeLockRef.current[tweetId] = false; }
  }, [offlineEnabled, online]);

  const handleRetweet = useCallback(async (tweetId: string) => {
    if (retweetLockRef.current[tweetId]) return;
    retweetLockRef.current[tweetId] = true;

    const currentTweet = tweetsRef.current.find(t => t.id === tweetId);
    if (!currentTweet) { retweetLockRef.current[tweetId] = false; return; }

    const wasRetweeted = currentTweet.user_interaction?.is_retweeted || false;
    const currentRetweets = currentTweet.stats?.retweets || 0;
    setTweets(prevTweets => prevTweets.map(tweet => tweet.id !== tweetId ? tweet : { ...tweet, stats: { ...tweet.stats, retweets: wasRetweeted ? currentRetweets - 1 : currentRetweets + 1 }, user_interaction: { ...tweet.user_interaction, is_retweeted: !wasRetweeted } }));

    // Voir `handleLike` : hors ligne on met en file et on garde l'état affiché.
    if (offlineEnabled && !online) {
      await queueAction({ type: 'retweet', tweetId, value: !wasRetweeted });
      retweetLockRef.current[tweetId] = false;
      return;
    }

    try {
      const response = await apiService.retweet(tweetId);
      if (!response.success) {
        setTweets(prevTweets => prevTweets.map(tweet => tweet.id !== tweetId ? tweet : { ...tweet, stats: { ...tweet.stats, retweets: currentRetweets }, user_interaction: { ...tweet.user_interaction, is_retweeted: wasRetweeted } }));
      } else {
        trackTweetInteraction(tweetId, wasRetweeted ? 'unretweet' : 'retweet', { tab: activeTab, previous_retweets: currentRetweets, algorithm: currentAlgorithm });
        if (activeTab === 'forYou') {
          sendRecommendationFeedback(tweetId, wasRetweeted ? 'skip' : 'share');
          if (currentAlgorithm === 'neural_rank') neuralRankService.trackInteraction({ tweetId, interactionType: wasRetweeted ? 'unretweet' : 'retweet' });
        }
      }
    } catch {
      setTweets(prevTweets => prevTweets.map(tweet => tweet.id !== tweetId ? tweet : { ...tweet, stats: { ...tweet.stats, retweets: currentRetweets }, user_interaction: { ...tweet.user_interaction, is_retweeted: wasRetweeted } }));
    } finally { retweetLockRef.current[tweetId] = false; }
  }, [activeTab, currentAlgorithm, trackTweetInteraction, offlineEnabled, online, queueAction]);

  const handleBookmark = async (tweetId: string) => {
    try {
      await trackingService.trackBookmark(tweetId);
    } catch (error) {
      console.warn('Erreur tracking bookmark:', error);
    }
  };

  const handleSkip = async (tweetId: string) => {
    try {
      await trackingService.trackSkip(tweetId);
    } catch (error) {
      console.warn('Erreur tracking skip:', error);
    }
  };

  const handleBlock = async (tweetId: string) => {
    try {
      await trackingService.trackBlock(tweetId);
    } catch (error) {
      console.warn('Erreur tracking block:', error);
    }
  };

  const handleShare = async (tweetId: string) => {
    try {
      await trackingService.trackShare(tweetId);
    } catch (error) {
      console.warn('Erreur tracking share:', error);
    }
  };

  /**
   * Ouvre la feuille de signalement.
   *
   * Avant, cette fonction n'appelait que `trackingService.trackReport()` —
   * un simple événement d'analytics. Aucun signalement n'était créé et
   * l'utilisateur n'avait aucun retour : le bouton « Signaler » du fil
   * principal ne signalait rien du tout.
   */
  const handleReport = (tweetId: string) => {
    // `tweetsRef` et non `tweets` : `handleRowAction` est un `useCallback`
    // stable (c'est ce qui évite de re-rendre toutes les lignes du fil), donc
    // il capture cette fonction une fois pour toutes. Lue depuis le state, la
    // liste serait figée à son contenu du moment, et le sous-titre « @pseudo »
    // manquerait sur tout tweet chargé depuis. Le ref, lui, est à jour.
    const tweet = tweetsRef.current.find((t) => t.id === tweetId);
    setReportTarget({
      id: tweetId,
      label: tweet?.author?.username ? `@${tweet.author.username}` : undefined,
    });

    // Le suivi analytics reste, mais il ne remplace plus le signalement.
    trackingService.trackReport(tweetId).catch((error) => {
      console.warn('Erreur tracking report:', error);
    });
  };

  const handleDeleteTweet = (tweetId: string) => {
    confirmAsync({
      title: 'Supprimer ce tweet ?',
      message: 'Cette action est irréversible.',
      confirmLabel: 'Supprimer',
      destructive: true,
    }).then((ok) => {
      if (ok) (async () => {
            const response = await apiService.deleteTweet(tweetId);
            if (response?.success) {
              setTweets((prev) => prev.filter((t) => t.id !== tweetId));
            } else {
              toast.error(response?.message || 'Impossible de supprimer ce tweet');
            }
          })();
    });
  };

  const handleOptionsMenu = (tweetId: string) => {
    const tweet = tweets.find((t) => t.id === tweetId);
    const isOwnTweet = !!(user?.id && tweet?.author?.id === user.id);

    // Se bloquer/s'ignorer/se signaler soi-même n'a pas de sens : sur son
    // propre tweet, le menu ne propose que ce qui reste pertinent.
    // La modification n'est proposée que dans sa fenêtre de 30 minutes : un
    // bouton toujours visible qui échoue une fois sur deux vaut moins qu'un
    // bouton absent. Le serveur revérifie de toute façon (palier, fenêtre,
    // nombre de révisions) — ce filtre n'est que du confort d'affichage.
    const publishedAt = tweet?.created_at ? new Date(tweet.created_at).getTime() : 0;
    const withinEditWindow = publishedAt > 0 && Date.now() - publishedAt < 30 * 60 * 1000;

    // Chaque entrée porte son icône : dans une liste de cinq lignes, le
    // pictogramme se repère avant le texte, et « Signaler » cesse de
    // ressembler à « Partager ».
    const entries: ActionSheetItem[] = isOwnTweet
      ? [
          ...(withinEditWindow
            ? [{
              label: 'Modifier',
              icon: 'create-outline' as const,
              hint: 'Encore possible pendant 30 minutes après la publication',
              onPress: () => (navigation as any).navigate('EditTweet', {
                tweetId,
                content: tweet?.content,
              }),
            }]
            : []),
          {
            label: (tweet as any)?.paid_content ? 'Gérer le prix' : 'Rendre payant',
            icon: 'lock-closed-outline',
            onPress: () => setPaywallTarget(tweetId),
          },
          { label: 'Partager', icon: 'share-outline', onPress: () => handleShare(tweetId) },
          {
            label: 'Supprimer',
            icon: 'trash-outline',
            onPress: () => handleDeleteTweet(tweetId),
            destructive: true,
          },
        ]
      : [
          { label: 'Ajouter aux favoris', icon: 'bookmark-outline', onPress: () => handleBookmark(tweetId) },
          {
            label: 'Ignorer ce tweet',
            icon: 'eye-off-outline',
            hint: 'Il n’apparaîtra plus dans ton fil',
            onPress: () => handleSkip(tweetId),
          },
          { label: 'Partager', icon: 'share-outline', onPress: () => handleShare(tweetId) },
          { label: 'Signaler', icon: 'flag-outline', onPress: () => handleReport(tweetId) },
          {
            label: 'Bloquer cet utilisateur',
            icon: 'ban-outline',
            onPress: () => handleBlock(tweetId),
            destructive: true,
          },
        ];

    // Une seule feuille pour les deux plateformes : l'ancien code servait
    // `ActionSheetIOS` à iOS et, à Android, un `Alert` à cinq boutons empilés
    // où rien ne distinguait « Signaler » de « Partager ».
    showActionSheet({ items: entries });
  };

  const detectIsRetweet = (t: any) => {
    return !!(t?.is_retweet || t?.tweet_type === 'retweet');
  };

  const detectIsQuote = (t: any) => {
    return !!(t?.is_quote || t?.tweet_type === 'quote');
  };

  // Synchronise le miroir et le cache de l'onglet courant à chaque changement.
  useEffect(() => {
    tweetsRef.current = tweets;
    tabCacheRef.current[activeTab] = tweets;
  }, [tweets, activeTab]);

  // Mémoïsé : ce filtre était recalculé à chaque rendu, y compris pour un like.
  const visibleTweets: Tweet[] = useMemo(
    () => withoutOrphanReplies(tweets.filter(tweet => tweet && tweet.id && tweet.content)),
    [tweets]
  );


  const getAlgorithmColor = (_algo: string) => '#f97316';

  // ─── Fil : handler d'action unique, tracking, rendu ───────────────────────

  /** Contexte transmis aux lignes — stable, sinon toutes se re-rendent. */
  const rowContext = useMemo(
    () => ({ tab: activeTab, algorithm: currentAlgorithm }),
    [activeTab, currentAlgorithm]
  );

  /**
   * Handler unique pour toutes les interactions d'une ligne. Le passer en une
   * seule référence stable (au lieu de 8 closures recréées par ligne et par
   * rendu) est ce qui rend la mémoïsation de `TweetRow` réellement efficace.
   */
  const handleRowAction = useCallback((action: TweetRowAction) => {
    const { type, tweetId, payload } = action;

    // Un utilisateur qui agit parle déjà à l'algorithme : la série de silence
    // repart de zéro, et la question ne viendra pas l'interrompre.
    algoCheckRef.current = afterInteraction(algoCheckRef.current);

    switch (type) {
      case 'like':
        handleLike(tweetId);
        break;

      case 'superlike':
        handleSuperLike(tweetId);
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

      // ⏳ ESSAI — bouton de signalement direct sur la ligne (drapeau
      // `fil.test`). Réutilise la feuille déjà montée par cet écran : rien de
      // neuf à démonter le jour où le bouton disparaît.
      case 'report':
        handleReport(tweetId);
        break;

      case 'openQuote':
        (navigation as any).navigate('TweetDetail', { tweetId });
        break;

      // Concours : l'identifiant vient de la carte, qui l'a resolu elle-meme
      // depuis le tweet — le fil ne transporte pas le concours.
      case 'openContest':
        if (payload?.contestId) {
          (navigation as any).navigate('Contest', { contestId: payload.contestId });
        }
        break;

      case 'profile': {
        const author = payload?.author;
        if (!author?.id) return;
        trackProfileInteraction(author.id, 'view', {
          source: 'tweet_header',
          tweet_id: tweetId,
          tab: activeTab,
          position: payload?.index,
        });
        (navigation as any).navigate('UserProfile', { userId: author.id, username: author.username });
        break;
      }

      case 'open': {
        if (payload?.isAd) {
          // `redirect_url` n'existe plus côté serveur depuis que la publicité
          // EST le tweet ou le compte promu : ces deux branches ne
          // matchaient donc plus jamais, et un tap sur une pub-tweet
          // retombait systématiquement sur le profil de l'auteur au lieu
          // d'ouvrir le tweet lui-même.
          const tweet = payload.tweet;
          apiService.post(`/api/ads/advertisements/${tweet?.ad_data?.id}/click`).catch(() => {});
          const promotedTweetId: string | undefined = tweet?.ad_data?.tweet_id;
          if (promotedTweetId) {
            (navigation as any).navigate('TweetDetail', { tweetId: promotedTweetId });
          } else if (tweet?.author?.id) {
            (navigation as any).navigate('UserProfile', { userId: tweet.author.id, username: tweet.author.username });
          }
          return;
        }
        // `isThread` evite au detail d'afficher le squelette d'un tweet isole
        // pour ce qui est en fait une reponse (voir TweetDetailScreen).
        (navigation as any).navigate('TweetDetail', {
          tweetId,
          isThread: !!(tweets.find((t) => t.id === tweetId) as any)?.parent_tweet_id,
        });
        break;
      }
    }
  }, [handleLike, handleSuperLike, handleRetweet, navigation, activeTab, trackProfileInteraction]);

  /**
   * Comptabilisation des vues via la visibilité réelle de la liste.
   * `viewabilityConfig` est figé dans une ref : FlatList refuse qu'il change
   * après le montage.
   */
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
    minimumViewTime: 500,
    waitForInteraction: false,
  }).current;

  /**
   * Actualisation au geste — logo commun (`usePullRefreshLogo` +
   * `PullRefreshLogo`), aussi monté sur Explorer, les notifications et les
   * profils. Le hook ne fait rien côté Android (pas de rebond, la surface
   * garde son `AppRefreshControl` natif là-bas) et remet `pull` à zéro à
   * chaque prise de focus — sans ça l'indicateur restait « posé » à moitié en
   * revenant sur l'onglet après un changement de page en pleine traction.
   */
  const handlePullRefresh = useCallback(() => {
    if (activeTab === 'explore') return;
    // Pas de secousse ici : `usePullRefreshLogo` la joue déjà au FRANCHISSEMENT
    // du seuil, pendant la traction (comme une vraie liste iOS). En rejouer une
    // au relâchement en ferait deux coup sur coup pour un seul geste.
    onRefresh();
  }, [activeTab, onRefresh]);

  const { pull: feedPull, scrollHandler: onFeedScroll, logoKey, listRef: feedListRef } =
    usePullRefreshLogo(handlePullRefresh, refreshing);

  /**
   * État de la question de réglage (« tu en veux moins / plus »).
   *
   * En ref et pas en state : il est lu et écrit depuis le callback de
   * visibilité de la liste, qui doit rester la MÊME fonction pendant toute la
   * vie de la `FlatList`. Seul `askAtId` est en state — c'est la seule partie
   * qui doit provoquer un rendu.
   */
  const algoCheckRef = useRef(initialAlgoCheckState());
  const askAtIdRef = useRef<string | null>(null);
  const [askAtId, setAskAtId] = useState<string | null>(null);

  /** Referme la question des deux côtés (la ref pour la lecture, le state pour le rendu). */
  const closeAlgoCheck = useCallback((index: number, tweetId: string) => {
    algoCheckRef.current = afterAsk(algoCheckRef.current, index, tweetId);
    askAtIdRef.current = null;
    setAskAtId(null);
  }, []);

  /**
   * Temps de lecture reellement passe sur chaque tweet du fil.
   *
   * La liste savait deja QUI passait a l'ecran ; personne ne chronometrait
   * entre l'entree et la sortie. Le seul temps de lecture mesure dans l'app
   * venait du lecteur plein ecran d'Explorer, si bien que le signal Attention
   * du pot createur — le plus lourd du score de qualite — tournait en
   * permanence sur une estimation decotee de moitie.
   *
   * `getMeta` joint la nature du contenu : un temps brut se confond avec la
   * LONGUEUR du tweet, et sans elle le moteur apprend seulement que les
   * contenus longs « marchent mieux ». Meme raisonnement que
   * `handleExploreDwell`, qui alimente deja la grille Explorer.
   */
  const dwellMeta = useCallback((tweetId: string) => {
    const tweet = tweetsRef.current.find((t) => String(t.id) === String(tweetId));
    if (!tweet) return null;
    const media = splitTweetMedia(tweet);
    const author = (tweet as any)?.originalTweet?.author || tweet.author;
    return {
      authorId: author?.id ? String(author.id) : null,
      media: (media.videoUrl ? 'video' : media.hasVisual ? 'image' : 'text') as
        'text' | 'image' | 'video',
      contentChars: displayContentOf(tweet).length,
      // Une vue publicitaire n'entre pas dans la paie : le pot ecarte deja les
      // sources `AD_SOURCES`, autant ne pas depenser de reseau pour elle.
      sponsored: !!(tweet as any).is_ad,
    };
  }, []);

  const { notifyVisible: notifyDwell } = useDwellTracking({
    viewerId: user?.id,
    getMeta: dwellMeta,
    // Coupe sur Explorer et sous le lecteur plein ecran.
    //
    // `ExploreImmersive` est un CALQUE monte dans cet ecran, pas une route :
    // ouvrir un tweet en lecture ne fait perdre le focus a personne, et la
    // liste du fil ne recoit aucun changement de visibilite. Sans cette garde,
    // son chronometre continuerait de tourner derriere le calque et compterait
    // une seconde fois le temps que `handleExploreDwell` mesure deja — le
    // meme temps envoye deux fois, sur deux tweets differents.
    enabled: activeTab !== 'explore' && immersiveIndex === null,
  });

  // Indirection en ref : `onViewableItemsChanged` doit rester la même fonction
  // pendant toute la vie de la liste, mais doit voir les valeurs à jour.
  const viewTrackingRef = useRef({
    trackView: (_id: string, _v: boolean) => {},
    onView: (_id: string, _index: number) => {},
    notifyVisible: (_ids: (string | null | undefined)[]) => {},
  });

  const onViewableItemsChanged = useRef(
    ({ changed, viewableItems }: {
      changed?: Array<{ item: Tweet; index: number | null; isViewable: boolean }>;
      viewableItems: Array<{ item: Tweet; index: number | null; isViewable: boolean }>;
    }) => {
      // Le chronometre travaille sur la liste COMPLETE des visibles, pas sur
      // les transitions : un callback manque (remontage de la liste, retour
      // d'arriere-plan) desynchroniserait un suivi fonde sur `changed` seul,
      // alors qu'un etat recale a chaque passage se repare tout seul.
      viewTrackingRef.current.notifyVisible(
        (viewableItems || []).filter((e) => e.isViewable).map((e) => e.item?.id),
      );

      const entries = Array.isArray(changed) ? changed : viewableItems;

      for (const entry of entries) {
        const tweet = entry.item;
        if (!tweet?.id) continue;

        if (!entry.isViewable) {
          viewTrackingRef.current.trackView(tweet.id, false);
          continue;
        }

        // Les callbacks de visibilité peuvent reparler d'un item quand un
        // voisin entre dans l'écran. Une impression ne part qu'une seule fois
        // par tweet pendant cette session du feed.
        if (feedImpressionsRef.current.has(tweet.id)) continue;
        feedImpressionsRef.current.add(tweet.id);

        viewTrackingRef.current.trackView(tweet.id, true);
        viewTrackingRef.current.onView(tweet.id, entry.index ?? 0);
      }
    }
  ).current;

  useEffect(() => {
    viewTrackingRef.current = {
      trackView,
      notifyVisible: notifyDwell,
      onView: (tweetId: string, position: number) => {
        trackTweetInteraction(tweetId, 'view', {
          position,
          tab: activeTab,
          algorithm: currentAlgorithm,
        });
        trackingService.trackView(tweetId, 500);

        // ── Question de réglage ──
        // Une impression de plus sans que l'utilisateur ait rien fait. C'est
        // ici, et nulle part ailleurs, qu'on sait qu'un tweet a réellement été
        // VU — d'où le branchement sur le compteur d'impressions plutôt que
        // sur l'index de rendu, qui compte aussi ce qui n'atteint jamais
        // l'écran.
        algoCheckRef.current = afterSilentView(algoCheckRef.current);
        if (askAtIdRef.current) return;

        const seen = tweetsRef.current.find((t) => t.id === tweetId);
        const confidence = Number((seen as any)?._recommendation_confidence) || 0;

        if (shouldAskAt({ index: position, tweetId, state: algoCheckRef.current, confidence })) {
          askAtIdRef.current = tweetId;
          setAskAtId(tweetId);
        }
      },
    };
  }, [notifyDwell, trackView, trackTweetInteraction, activeTab, currentAlgorithm]);

  /**
   * Pastille de la cloche.
   *
   * L'onglet « Notifications » n'existe plus dans la barre du bas de 2B :
   * cette pastille est désormais le seul endroit qui dit « il y a du nouveau ».
   * Même service et même cadence que la barre d'origine, plus un
   * rafraîchissement immédiat dès qu'un écran signale une lecture — sans quoi
   * la pastille survivrait à la consultation des notifications.
   */
  const [notificationCount, setNotificationCount] = useState(0);
  const refreshNotificationCount = useCallback(async () => {
    setNotificationCount(await unreadService.getNotificationsUnreadCount());
  }, []);
  useForegroundInterval(refreshNotificationCount, 30000);
  useEffect(() => unreadService.subscribe(refreshNotificationCount), [refreshNotificationCount]);

  const renderTweet = useCallback(
    ({ item, index }: { item: Tweet; index: number }) => {
      const next = visibleTweets[index + 1];
      const prev = visibleTweets[index - 1];
      // Un compte promu n'a rien d'un tweet : pas de like, pas de réponse,
      // rien à ouvrir en détail. Le passer à `TweetRow` afficherait une carte
      // de tweet vide avec une bio à la place du texte.
      const promoted = (item as any).promoted_account;
      if (promoted) {
        return (
          <FeedItemEntrance
            id={String(item.id)}
            index={index}
            generation={entranceGeneration}
            seen={entranceSeen}
          >
            <PromotedAccountCard
              account={promoted}
              adId={(item as any).ad_data?.id}
              onOpen={() => {
                if ((item as any).ad_data?.id) {
                  apiService.post(`/api/ads/advertisements/${(item as any).ad_data.id}/click`).catch(() => {});
                }
                (navigation as any).navigate('UserProfile', { userId: promoted.id, username: promoted.username });
              }}
            />
          </FeedItemEntrance>
        );
      }
      // Rang dans le fil de discussion — logique pure, donc testée hors de
      // l'écran (voir `utils/feed.ts` et `tests/feed-thread-depth.test.js`).
      const threadDepth = threadDepthAt(visibleTweets, index);

      const row = (
        <TweetRowGutter
          tweet={item}
          index={index}
          /* Seule la première ligne porte l'ancre : la visite désigne « la »
             gouttière, pas les vingt de la liste. */
          gutterRef={index === 0 ? gutterAnchor : undefined}
          isThreadParent={!!(next && next.parent_tweet_id === item.id)}
          isThreadChild={!!(prev && item.parent_tweet_id === prev.id)}
          /* Le nom du parent vient d'ICI, pas de la ligne : la charge utile du
             fil ne joint jamais l'auteur du tweet parent, mais l'écran a la
             ligne précédente sous la main — et c'est justement elle, le
             recommandeur émettant le parent juste avant sa réponse. */
          replyToName={
            prev && item.parent_tweet_id === prev.id
              ? (prev as any)?.author?.full_name || undefined
              : undefined
          }
          threadDepth={threadDepth}
          onAction={handleRowAction}
          contextData={rowContext}
          storyUserIds={storyUserIds}
          unseenStoryUserIds={unseenStoryUserIds}
        />
      );

      // La question ne s'insère pas dans les DONNÉES de la liste : elle est
      // rendue sous la ligne concernée. Toucher `data` obligerait
      // `keyExtractor`, la déduplication, la pagination et le suivi des
      // impressions à composer avec des entrées qui ne sont pas des tweets.
      const entering = (content: React.ReactNode) => (
        <FeedItemEntrance
          id={String(item.id)}
          index={index}
          generation={entranceGeneration}
          seen={entranceSeen}
        >
          {content}
        </FeedItemEntrance>
      );

      if (askAtId !== item.id) return entering(row);

      // Le tweet d'abord, la question juste en dessous : « des tweets comme
      // celui-ci » désigne ce qu'on vient de lire. Au-dessus, la phrase
      // pointerait vers un tweet pas encore vu.
      const author = (item as any)?.originalTweet?.author || (item as any)?.author;
      return entering(
        <>
          {row}
          <View ref={algoAnchor} collapsable={false}>
          <AlgoCheckGutter
            onAnswer={(more) => {
              // Même vocabulaire que la question posée dans Explorer
              // (`handleExploreInterest`) : `interested`/`not_interested`, pas
              // `like`/`skip`. Un « moins » ici doit mettre l'auteur en
              // sourdine côté moteur comme n'importe quel refus explicite —
              // sans `authorId`, il ne porte que sur ce tweet et reste sans
              // effet perceptible dans le fil.
              neuralRankService.trackInteraction({
                tweetId: item.id,
                interactionType: more ? 'interested' : 'not_interested',
                authorId: author?.id ? String(author.id) : undefined,
              });
              trackCustomAction('algo_check_answer', item.id, 'tweet', {
                liked: more,
                position: index,
                algorithm: currentAlgorithm,
              });
              closeAlgoCheck(index, item.id);
            }}
            onDismiss={() => closeAlgoCheck(index, item.id)}
          />
          </View>
        </>
      );
    },
    [visibleTweets, handleRowAction, rowContext, storyUserIds, unseenStoryUserIds, askAtId, trackCustomAction, closeAlgoCheck, currentAlgorithm, navigation, entranceGeneration, entranceSeen, gutterAnchor, algoAnchor]
  );

  // Une publicité de tweet garde le VRAI id du tweet (voir `dedupeKey`
  // ci-dessus) : deux occurrences distinctes — l'organique et la publicité —
  // peuvent désormais coexister dans la liste après le correctif de
  // déduplication. `keyExtractor` doit donc, lui aussi, les distinguer : deux
  // entrées avec la même clé React font disparaître silencieusement l'une des
  // deux au rendu, ce qui aurait annulé le correctif.
  const keyExtractor = useCallback(
    (item: Tweet, index: number) => {
      const t = item as any;
      return t.is_ad ? `ad-${t.ad_data?.id || t.id}-${index}` : String(item.id);
    },
    [],
  );

  /**
   * En-tête de liste, stabilisé.
   *
   * Il était écrit en JSX directement dans la prop : un nouvel élément à CHAQUE
   * rendu de l'écran, donc `StoriesTray` — une rangée d'avatars et de dégradés —
   * reconstruit à chaque like, chaque page chargée, chaque changement d'état
   * sans rapport. Mémoïsé, React reconnaît le même élément et saute tout le
   * sous-arbre.
   *
   * Les fonctions de rechargement ne sont pas mémoïsées en amont ; les mettre
   * en dépendance annulerait tout l'intérêt. On passe donc par une ref, qui
   * reste stable tout en voyant les valeurs à jour.
   */
  const retryRef = useRef<() => void>(() => {});
  retryRef.current = () => {
    trackCustomAction('retry_after_error', error || 'unknown_error', 'user_action', {
      tab: activeTab,
      algorithm: currentAlgorithm,
    });
    if (activeTab === 'forYou') fetchRecommendations(undefined, true);
    else fetchTweets(true);
  };

  const storiesUser = useMemo(
    () => (user
      ? { id: String((user as any).id), username: user.username, avatar: (user as any)?.avatar }
      : null),
    [(user as any)?.id, user?.username, (user as any)?.avatar],
  );

  const listHeader = useMemo(
    () => (
      <>
        <OfflineBanner
          enabled={offlineEnabled}
          online={online}
          pendingCount={pendingTweets.length}
          pendingActionCount={pendingActions.length}
        />
        {/* `layout=` sur les deux blocs ci-dessous : `StoriesTray` passe d'un
            simple rond de chargement à la rangée réelle (hauteurs
            différentes), et `SpotlightBand` ne rend RIEN tant que
            `/api/spotlight/today` n'a pas répondu (`if (loading || !tweet)
            return null`). Sans transition de mise en page, ce sont deux
            sauts de hauteur instantanés à l'ouverture du fil — le premier
            tweet démarre trop haut sur la première image, puis « téléporte »
            plus bas dès que l'une ou l'autre réponse arrive. */}
        <Animated.View layout={LinearTransition.duration(220)}>
          <StoriesTray
            currentUser={storiesUser}
            refreshSignal={storiesRefresh}
            backgroundColor={C.bg}
            onOpenProfile={(author) => (navigation as any).navigate('UserProfile', { userId: author.id, username: author.username })}
            onSendMessage={async (author, message) => {
              if (!message.trim()) {
                (navigation as any).navigate('UserProfile', { userId: author.id, username: author.username });
                return;
              }
              try {
                await apiService.post(`/api/messages/direct/${author.id}`, { content: message.trim() });
              } catch {
                // L'échec d'une réponse de story ne doit pas casser le fil.
              }
            }}
          />
        </Animated.View>

        {/* Le post du jour : une ligne du fil sur un cran de fond, pas une
            notice posée au-dessus des stories. */}
        <Animated.View layout={LinearTransition.duration(220)}>
          <SpotlightBand
            refreshSignal={storiesRefresh}
            onOpenTweet={(tweetId) => (navigation as any).navigate('TweetDetail', { tweetId })}
          />
        </Animated.View>

        {error && (
          <Animated.View entering={FadeIn.duration(180)} style={S.errorBanner}>
            <Ionicons name="alert-circle-outline" size={ps(18)} color={C.red} />
            <Text style={S.errorText}>{error}</Text>
            <TouchableOpacity style={S.retryBtn} onPress={() => retryRef.current()}>
              <Text style={S.retryBtnText}>Réessayer</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </>
    ),
    [offlineEnabled, online, pendingTweets.length, pendingActions.length, storiesUser, storiesRefresh, navigation, error],
  );

  const onEndReached = useCallback(() => {
    if (!hasMore || loadingMore || loading || recommendationsLoading) return;
    if (activeTab === 'forYou') fetchRecommendations(undefined, false);
    else fetchTweets(false);
  }, [hasMore, loadingMore, loading, recommendationsLoading, activeTab]);

  const isInitialLoading = (loading || recommendationsLoading) && visibleTweets.length === 0;

  /**
   * Bas de la grille — ou de la lecture plein écran.
   *
   * Quand la pagination est épuisée, on ne s'arrête pas : on demande un tirage
   * neuf et on n'ajoute que l'inédit. C'est ce qui fait que la lecture continue
   * ne tombe jamais sur une porte fermée. Le drapeau `exploreExhaustedRef`
   * arrête ce mécanisme dès qu'un tirage n'apporte plus rien — sans lui, rester
   * en bas de page relancerait une requête sans fin.
   */
  const onExploreEndReached = useCallback(() => {
    if (exploreLoadingMore || exploreLoading) return;
    if (exploreHasMore) { fetchExplore(false); return; }
    if (exploreExhaustedRef.current) return;
    fetchExplore(true, true);
  }, [exploreHasMore, exploreLoadingMore, exploreLoading, exploreOffset]);

  const onExploreRetry = useCallback(() => {
    exploreExhaustedRef.current = false;
    fetchExplore(true);
  }, []);

  /** « Nouveau tirage » de fin de grille — geste explicite, donc jamais bloqué. */
  const onExploreDrawMore = useCallback(() => {
    feedback.tap();
    exploreExhaustedRef.current = false;
    fetchExplore(true, true);
  }, []);

  /**
   * Appui sur une carte de la grille : ouvre la lecture plein écran, pas la
   * page de détail.
   *
   * `TweetDetailScreen` reste accessible depuis la lecture (« Voir le fil »),
   * mais n'est plus le passage obligé : y envoyer chaque appui terminait la
   * consultation au premier tweet — voir l'en-tête de `ExploreImmersive`.
   */
  const handleOpenExploreTweet = useCallback((tweet: Tweet, from: CardRect | null) => {
    const index = exploreTweets.findIndex(t => t.id === tweet.id);
    trackCustomAction('open_tweet', tweet.id, 'user_action', { tab: 'explore', source: 'explore_grid' });
    setImmersiveOrigin(from);
    setImmersiveIndex(Math.max(0, index));
  }, [exploreTweets, trackCustomAction]);

  const handleCloseImmersive = useCallback(() => setImmersiveIndex(null), []);

  /**
   * Ouvre le fil d'un tweet depuis la lecture plein écran.
   *
   * La `<Modal>` doit se fermer AVANT la navigation : elle est une fenêtre
   * native au-dessus de la pile, l'écran poussé s'ouvrirait derrière elle.
   */
  const handleOpenExploreThread = useCallback((tweet: Tweet) => {
    setImmersiveIndex(null);
    (navigation as any).navigate('TweetDetail', { tweetId: tweet.id });
  }, [navigation]);

  const handleOpenExploreProfile = useCallback((tweet: Tweet) => {
    const author = (tweet as any)?.originalTweet?.author || tweet.author;
    if (!author?.id) return;
    setImmersiveIndex(null);
    (navigation as any).navigate('UserProfile', { userId: author.id, username: author.username });
  }, [navigation]);

  /**
   * Like d'un tweet de la surface Explorer.
   *
   * Handler distinct de `handleLike` : l'état de la grille (`exploreTweets`)
   * est volontairement séparé de `tweets`, donc la mise à jour optimiste doit
   * viser cette liste-là et pas l'autre.
   *
   * `next` est l'état VOULU, pas une bascule : `apiService.likeTweet` bascule
   * côté serveur, donc un appel émis alors qu'on est déjà dans l'état demandé
   * ferait exactement l'inverse. Le double-tap (grille et lecture) ne demande
   * jamais autre chose que `true`, et n'enlève donc jamais un like.
   */
  const handleExploreLike = useCallback(async (tweet: Tweet, next: boolean) => {
    const tweetId = tweet.id;
    if (likeLockRef.current[tweetId]) return;
    if (!!tweet.user_interaction?.is_liked === next) return;
    likeLockRef.current[tweetId] = true;

    // Incrément/décrément relatif plutôt qu'un instantané restauré : la carte
    // peut avoir été rechargée entre-temps par une pagination.
    const applyLiked = (liked: boolean) =>
      setExploreTweets(prev => prev.map(t => t.id !== tweetId ? t : {
        ...t,
        stats: { ...t.stats, likes: Math.max(0, (t.stats?.likes || 0) + (liked ? 1 : -1)) },
        user_interaction: { ...t.user_interaction, is_liked: liked },
      }));

    applyLiked(next);

    // Hors ligne : même règle que le fil linéaire — on met en file et on garde
    // l'état optimiste plutôt que d'annuler sous les yeux de l'utilisateur.
    if (offlineEnabled && !online) {
      await queueAction({ type: 'like', tweetId, value: next });
      likeLockRef.current[tweetId] = false;
      return;
    }

    try {
      const response = await apiService.likeTweet(tweetId);
      if (!response.success) {
        applyLiked(!next);
      } else {
        trackTweetInteraction(tweetId, next ? 'like' : 'unlike', {
          tab: 'explore',
          previous_likes: tweet.stats?.likes || 0,
          algorithm: 'trending',
        });
        neuralRankService.trackInteraction({ tweetId, interactionType: next ? 'like' : 'unlike' });
      }
    } catch {
      applyLiked(!next);
    } finally { likeLockRef.current[tweetId] = false; }
  }, [offlineEnabled, online, queueAction, trackTweetInteraction]);

  /** Double-tap de la grille : ne pose un like, jamais ne l'enlève. */
  const handleGridDoubleTapLike = useCallback(
    (tweet: Tweet) => handleExploreLike(tweet, true),
    [handleExploreLike]
  );

  /** Repartage depuis la lecture plein écran — même optimisme que le like. */
  const handleExploreRetweet = useCallback(async (tweet: Tweet) => {
    const tweetId = tweet.id;
    if (retweetLockRef.current[tweetId]) return;
    retweetLockRef.current[tweetId] = true;

    const wasRetweeted = !!tweet.user_interaction?.is_retweeted;
    const applyRetweeted = (value: boolean) =>
      setExploreTweets(prev => prev.map(t => t.id !== tweetId ? t : {
        ...t,
        stats: { ...t.stats, retweets: Math.max(0, (t.stats?.retweets || 0) + (value ? 1 : -1)) },
        user_interaction: { ...t.user_interaction, is_retweeted: value },
      }));

    applyRetweeted(!wasRetweeted);

    try {
      const response = await apiService.retweet(tweetId);
      if (!response.success) applyRetweeted(wasRetweeted);
      else neuralRankService.trackInteraction({
        tweetId,
        interactionType: wasRetweeted ? 'unretweet' : 'retweet',
      });
    } catch {
      applyRetweeted(wasRetweeted);
    } finally { retweetLockRef.current[tweetId] = false; }
  }, []);

  /** Suivre l'auteur sans quitter la lecture — l'abonnement se prend au moment de l'envie. */
  const handleExploreFollow = useCallback(async (tweet: Tweet) => {
    const author = (tweet as any)?.originalTweet?.author || tweet.author;
    const authorId = author?.id ? String(author.id) : '';
    if (!authorId || followingIds.has(authorId)) return;

    setFollowingIds(prev => new Set(prev).add(authorId));
    feedback.select();
    try {
      const response = await apiService.followUser(authorId);
      if (!response.success) {
        setFollowingIds(prev => { const copy = new Set(prev); copy.delete(authorId); return copy; });
      }
    } catch {
      setFollowingIds(prev => { const copy = new Set(prev); copy.delete(authorId); return copy; });
    }
  }, [followingIds]);

  /**
   * Même résolution d'auteur que `handleExploreFollow` juste au-dessus : sur un
   * retweet, c'est l'auteur d'ORIGINE qu'on suit. Si le prédicat et l'action
   * divergeaient ici, le panneau proposerait « suivre » quelqu'un qu'on suit
   * déjà — sur tous les retweets.
   */
  const isFollowingExploreAuthor = useCallback((tweet: Tweet) => {
    const author = (tweet as any)?.originalTweet?.author || tweet.author;
    const authorId = author?.id ? String(author.id) : '';
    return !!authorId && followingIds.has(authorId);
  }, [followingIds]);

  /**
   * Temps réellement passé sur un tweet en lecture plein écran.
   *
   * C'est le signal de goût le plus fiable dont dispose le classement, et le
   * seul que cette surface peut produire : la grille ne sait rien de ce qui a
   * retenu l'attention, un like n'arrive que sur une minorité de tweets. Toute
   * la chaîne existait déjà (`dwellMs` accepté par le service mobile, relayé
   * par la route Node, pondéré par le handler Rust) — personne ne l'alimentait
   * depuis Explorer.
   */
  /**
   * Réponse à la question posée dans la lecture (« ça t'intéresse ? »).
   *
   * `authorId` est joint impérativement : sans lui, un refus ne porte que sur ce
   * tweet-là et reste invisible dans le fil — c'est ce qui rend le bouton
   * « pas intéressé » de YouTube inefficace (11 % des recommandations non
   * voulues évitées, contre 43 % pour un refus au niveau du compte).
   */
  const handleExploreInterest = useCallback((tweet: Tweet, interested: boolean) => {
    const author = (tweet as any)?.originalTweet?.author || tweet.author;
    neuralRankService.trackInteraction({
      tweetId: tweet.id,
      interactionType: interested ? 'interested' : 'not_interested',
      authorId: author?.id ? String(author.id) : undefined,
    });
    // Un « non » doit se voir tout de suite : le tweet quitte la grille au
    // retour, au lieu d'y être encore après qu'on a dit ne pas en vouloir.
    if (!interested) {
      setExploreTweets(prev => prev.filter(t => t.id !== tweet.id));
    }
  }, []);

  const handleExploreDwell = useCallback((tweet: Tweet, dwellMs: number, videoDurationMs?: number) => {
    // Le temps seul ne dit rien : il faut savoir ce qu'il fallait de temps pour
    // consommer CE contenu. Un pavé survolé dure plus longtemps qu'un tweet
    // court adoré — sans ces trois champs, le moteur apprend juste que les
    // contenus longs « marchent mieux ». Voir `algorithm/dwell.rs`.
    const media = splitTweetMedia(tweet);
    neuralRankService.trackInteraction({
      tweetId: tweet.id,
      interactionType: 'view',
      dwellMs,
      dwellMedia: media.videoUrl ? 'video' : media.hasVisual ? 'image' : 'text',
      contentChars: displayContentOf(tweet).length,
      videoDurationMs,
    });
  }, []);

  /**
   * Pied et état vide STABILISÉS, même traitement que l'en-tête : écrits en
   * JSX directement dans les props, ils étaient de nouveaux éléments à chaque
   * rendu de l'écran — donc un démontage/remontage du pied (squelettes de
   * chargement compris) à chaque like, chaque compteur, chaque changement
   * d'état sans rapport avec la fin de liste.
   */
  const createTweetRef = useRef(handleCreateTweet);
  createTweetRef.current = handleCreateTweet;

  const listEmpty = useMemo(
    () =>
      isInitialLoading ? (
        // Ossature plutôt qu'un logo qui tourne : l'attente paraît
        // beaucoup plus courte et la mise en page ne saute pas.
        <TweetSkeleton count={6} />
      ) : (
        <Animated.View entering={FadeIn.duration(220)} style={S.emptyState}>
          <View style={S.emptyIconWrap}>
            <Ionicons name="chatbubble-ellipses-outline" size={ps(38)} color={C.accent} />
          </View>
          <Text style={S.emptyTitle}>Rien à afficher</Text>
          <Text style={S.emptySubtitle}>
            {activeTab === 'forYou' ? 'Aucune recommandation pour l\'instant' : 'Suivez des comptes pour voir leurs tweets'}
          </Text>
          <TouchableOpacity style={S.emptyAction} onPress={() => createTweetRef.current()}>
            <Text style={S.emptyActionText}>Poster un tweet</Text>
          </TouchableOpacity>
        </Animated.View>
      ),
    [isInitialLoading, activeTab],
  );

  const listFooter = useMemo(
    () => (
      <>
        {loadingMore && visibleTweets.length > 0 && <TweetSkeleton count={2} />}

        {!hasMore && visibleTweets.length > 0 && (
          <View style={S.endRow}>
            <View style={S.endDivider} />
            <Text style={S.endText}>Vous êtes à jour</Text>
            <View style={S.endDivider} />
          </View>
        )}

        <View style={{ height: 120 }} />
      </>
    ),
    [loadingMore, hasMore, visibleTweets.length],
  );

  return (
    <View style={S.root}>
    {/* `SafeAreaView` vient de `react-native-safe-area-context`, PAS du coeur
        de React Native : celle du coeur ne pose aucun inset sur Android, et
        le contenu passait sous la barre de statut. `edges={['top']}` parce
        que le bas est deja gere par la barre d'onglets, en position
        absolue. */}
    <SafeAreaView style={S.container} edges={['top']}>
      <AppStatusBar barStyle={isPaperDark ? 'light-content' : 'dark-content'} backgroundColor={paper.bg} />

      {/* ── Bandeau d'événement ──
          Un seul, désormais. `EventBanner` et `FunctionalEventBanner` étaient
          empilés ici et annonçaient la même fête deux fois dès que les deux
          systèmes étaient actifs — c'est-à-dire dans le cas nominal. */}
      <EventStrip />

      {/* Signalement depuis le fil — la feuille se charge de tout le parcours. */}
      <ReportSheet
        visible={!!reportTarget}
        onClose={() => setReportTarget(null)}
        targetId={reportTarget?.id || ''}
        targetType="tweet"
        targetLabel={reportTarget?.label}
      />

      {/* Lecture plein écran de la découverte. Montée ici, dans l'écran qui
          porte déjà l'état d'Explorer : la grille et la lecture partagent la
          même liste, donc un like posé en lecture est déjà à jour dans la
          grille au retour, et la pagination faite en lecture profite à la
          grille (on ressort sur une grille plus fournie qu'à l'entrée). */}
      <ExploreImmersive
        visible={immersiveIndex !== null}
        tweets={exploreTweets}
        initialIndex={immersiveIndex ?? 0}
        originRect={immersiveOrigin}
        loadingMore={exploreLoadingMore}
        onClose={handleCloseImmersive}
        onEndReached={onExploreEndReached}
        onLike={handleExploreLike}
        onRetweet={handleExploreRetweet}
        onOpenThread={handleOpenExploreThread}
        onOpenProfile={handleOpenExploreProfile}
        onFollow={handleExploreFollow}
        onInterest={handleExploreInterest}
        onDwell={handleExploreDwell}
        followedIds={followingIds}
        currentUserId={user?.id}
      />

      {/* ── En-tête 2B ──
          Chat, mot-marque, cloche, avatar. La cloche remonte ICI depuis la
          barre du bas : c'est ce qui libère sa place dans la navbar, et c'est
          le seul chemin vers les notifications pour les comptes du test. */}
      <View style={S.header}>
        <View style={S.headerTopRow}>
          {/* `brand-mark.png` (192×192), pas `icon.png` (1920×1920) : même
              raison qu'en 2A, voir `TweetsScreen.tsx`. */}
          <Image
            source={require('../../assets/brand-mark.png')}
            style={S.brandMark}
            resizeMode="contain"
          />
          <Text style={S.brandWord}>Twitninf</Text>

          <TouchableOpacity
            onPress={() => (navigation as any).navigate('Notifications')}
            style={S.bellBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel={
              notificationCount > 0
                ? `Notifications, ${notificationCount} non lue${notificationCount > 1 ? 's' : ''}`
                : 'Notifications'
            }
          >
            <Ionicons name="notifications-outline" size={ps(25)} color={C.textPrimary} />
            {notificationCount > 0 && <View style={S.bellDot} />}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => (navigation as any).navigate('Profil')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={S.avatarRing}
          >
            <Avatar size={ps(35)} username={user?.username || 'U'} uri={(user as any)?.avatar} />
          </TouchableOpacity>
        </View>

        {/* Onglets — le trait actif glisse sur le thread UI. Même machinerie
            que l'original ; en 2B il est dessiné comme un soulignement au
            lieu d'une pastille pleine (voir `S.tabIndicator`). */}
        <View style={S.tabBar} ref={tabsAnchor} collapsable={false}>
          {/* Piste : couvre toute la barre, padding compris, ce qui met le
              trait et les `x` mesurés dans le même repère. */}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Animated.View style={[S.tabIndicator, tabIndicatorStyle]} />
          </View>
          {TAB_ORDER.map((tab, index) => (
            <TouchableOpacity
              key={tab}
              // Seul « Explorer » porte une ancre : c'est le seul onglet dont
              // la visite parle en propre.
              ref={tab === 'explore' ? exploreAnchor : undefined}
              style={S.tabItem}
              onPress={() => handleTabChange(tab)}
              onLayout={handleTabLayout(index)}
              activeOpacity={0.85}
            >
              <Text style={[S.tabLabel, activeTab === tab && S.tabLabelActive]}>
                {tab === 'following' ? 'Abonnements' : tab === 'forYou' ? 'Pour toi' : 'Explorer'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Ban alert ── */}
      <BanAlertBanner />

      {/* Pas de bouton flottant en 2B : « Publier » est la touche centrale
          de la barre du bas. Le constat d'origine du redesign était qu'un
          bouton flottant masque en permanence un coin du contenu pour une
          action qui a déjà une place dans la barre. */}

      {/* ── Feed ── */}
      {/* FlatList au lieu d'un ScrollView : les lignes sont recyclées. Le fil
          montait auparavant chaque tweet chargé simultanément et ne les
          démontait jamais — 150 sous-arbres vivants après trois pages. */}
      {/* Le geste de bascule d'onglet enveloppe la liste, il ne la modifie
          pas : ni vue animée, ni gestionnaire de défilement, ni style
          recalculé — le fil rend exactement ce qu'il rendait, et le
          défilement vertical reste natif et prioritaire (`failOffsetY`). */}
      <GestureDetector gesture={feedSwipe}>
      <View style={S.feedWrap}>
      {/* Actualisation : hors du flux, au sommet de la zone de fil — elle ne
          décale pas la liste en apparaissant.

          iOS uniquement : elle suit le doigt via le rebond de la liste, qui
          n'existe pas sur Android (voir `PullRefreshLogo`). Et jamais sur
          Explorer, qui garde sa propre roue native (`ExploreGrid` monte
          `PullRefreshLogo` lui-même sur sa surface) — deux indicateurs pour
          une seule attente. */}
      {Platform.OS === 'ios' && activeTab !== 'explore' && (
        <PullRefreshLogo key={logoKey} pull={feedPull} active={refreshing} />
      )}
      {activeTab === 'explore' ? (
        <ExploreGrid
          tweets={exploreTweets}
          loading={exploreLoading}
          loadingMore={exploreLoadingMore}
          refreshing={exploreRefreshing}
          hasMore={exploreHasMore}
          error={exploreError}
          onRefresh={onRefresh}
          onEndReached={onExploreEndReached}
          onOpenTweet={handleOpenExploreTweet}
          onLikeTweet={handleGridDoubleTapLike}
          onRetry={onExploreRetry}
          onDrawMore={onExploreDrawMore}
          lastVisitAt={lastExploreVisitAt}
          isFollowing={isFollowingExploreAuthor}
          onFollow={handleExploreFollow}
          onShare={handleShare}
          onInterest={handleExploreInterest}
        />
      ) : (
      <Animated.FlatList
        // Indispensable : c'est par cette ref que la traction est lue sur le
        // thread UI (voir `usePullRefreshLogo`). Sans elle, pas de logo.
        ref={feedListRef}
        data={visibleTweets}
        renderItem={renderTweet}
        keyExtractor={keyExtractor}
        style={S.scrollView}
        contentContainerStyle={S.scrollContent}
        showsVerticalScrollIndicator={false}
        // Sur le thread UI : un `onScroll` en JS à chaque image du défilement
        // est exactement ce que 2B passe son temps à éviter.
        onScroll={onFeedScroll}
        // `1` et pas `16` : `16` plafonne les événements à ~60 par seconde,
        // ce qui fait avancer l'animation par paliers sur un écran à 120 Hz.
        // Le coût est nul ici — le gestionnaire est un worklet, il ne réveille
        // pas le thread JS à chaque événement.
        scrollEventThrottle={1}
        // iOS : le rebond de la liste doit exister même quand le fil tient en
        // moins d'un écran, sinon il n'y a rien à tirer et l'actualisation
        // devient impossible sur un compte tout neuf.
        alwaysBounceVertical
        refreshControl={Platform.OS === 'ios' ? undefined : (
          /* ANDROID SEULEMENT.

             iOS n'a plus de `RefreshControl` du tout : sa roue réapparaît en
             gris par-dessus le logo malgré `tintColor="transparent"`, et deux
             indicateurs superposés valent moins que la roue seule. Le
             déclenchement y est fait à la main au relâchement (`onEndDrag` du
             gestionnaire animé), ce que le rebond de la liste permet.

             Android le garde : sans rebond, la traction est mangée par
             `SwipeRefreshLayout` et personne d'autre ne peut ni la mesurer ni
             savoir quand elle est relâchée.

             Pas `AppRefreshControl` : il est blanc en dur, donc invisible sur
             le fond papier du thème clair. */
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            // Remise aux couleurs du fil : le logo ne peut pas suivre le
            // doigt ici, donc cette roue reste le seul indicateur d'Android.
            colors={[paper.accent]}
            progressBackgroundColor={paper.bgBand}
          />
        )}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.6}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        // Fenêtre de rendu : de quoi remplir l'écran sans monter tout le fil.
        initialNumToRender={6}
        maxToRenderPerBatch={5}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={listFooter}
      />
      )}
      </View>
      </GestureDetector>


      {/* Mise en vente d'un de ses tweets — déclenchée depuis le menu « … ». */}
      <PaywallSetupSheet
        visible={!!paywallTarget}
        contentType="tweet"
        contentId={paywallTarget || ''}
        onClose={() => setPaywallTarget(null)}
        onDone={() => onRefresh()}
      />
    </SafeAreaView>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: paper.bg,
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  // ── En-tete ──
  header: {
    backgroundColor: paper.bg,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ps(10),
    paddingHorizontal: ps(20),
    paddingTop: ps(12),
    paddingBottom: ps(16),
  },
  brandMark: {
    width: ps(27),
    height: ps(27),
  },
  // Semi-bold et non Bold : à ce corps, le Bold d'Archivo devient un pavé et
  // écrase la rangée d'onglets juste en dessous.
  brandWord: {
    fontFamily: paperFonts.strong,
    fontSize: ps(28),
    letterSpacing: ps(-0.84),
    color: paper.ink,
    // Pousse cloche et avatar contre le bord droit sans vue d'espacement.
    marginRight: 'auto',
  },
  bellBtn: {
    width: ps(25),
    height: ps(25),
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellDot: {
    position: 'absolute',
    top: ps(-2),
    right: ps(-4),
    width: ps(9),
    height: ps(9),
    borderRadius: ps(4.5),
    backgroundColor: paper.accent,
    // Le liset de fond detache la pastille du glyphe de la cloche.
    borderWidth: 1.5,
    borderColor: paper.bg,
  },
  avatarRing: {
    marginLeft: ps(14),
  },

  // ── Onglets ──
  // Alignes a gauche et souffles, pas repartis sur toute la largeur : trois
  // onglets etires font une barre de segments, pas un sommaire de journal.
  tabBar: {
    flexDirection: 'row',
    gap: ps(20),
    paddingHorizontal: ps(20),
    borderBottomWidth: 1,
    borderBottomColor: paper.hairline,
  },
  tabItem: {
    alignItems: 'center',
    paddingBottom: ps(12),
  },
  // Trait actif : meme machinerie animee que l'original (position et taille
  // viennent de la mesure `onLayout`), mais dessine comme un soulignement au
  // lieu d'une pastille pleine. Fond transparent : seule la bordure basse se
  // voit, exactement sur le bord inferieur de l'onglet.
  tabIndicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: 'transparent',
    borderBottomWidth: 2,
    borderBottomColor: paper.ink,
  },
  tabLabel: {
    fontFamily: paperFonts.display,
    fontSize: ps(18),
    letterSpacing: ps(-0.36),
    color: paper.inkIdle,
  },
  // Repli si la mesure `onLayout` ne se declenche pas : l'onglet actif reste
  // reconnaissable a l'encre de son libelle, sans dependre d'aucune animation.
  tabLabelActive: {
    color: paper.ink,
  },

  // ── Fil ──
  feedWrap: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollContent: {
    paddingTop: ps(6),
  },

  // ── Erreur ──
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ps(9),
    marginHorizontal: ps(20),
    marginTop: ps(14),
    paddingVertical: ps(11),
    paddingHorizontal: ps(13),
    borderRadius: ps(12),
    borderWidth: 1,
    borderColor: paper.accent,
  },
  errorText: {
    flex: 1,
    fontFamily: paperFonts.body,
    fontSize: ps(13.5),
    color: paper.ink,
  },
  retryBtn: {
    borderWidth: 1,
    borderColor: paper.outline,
    borderRadius: ps(9),
    paddingVertical: ps(5),
    paddingHorizontal: ps(11),
  },
  retryBtnText: {
    fontFamily: paperFonts.bodyStrong,
    fontSize: ps(12.5),
    color: paper.ink,
  },

  // ── Fil vide ──
  emptyState: {
    alignItems: 'center',
    paddingTop: ps(64),
    paddingHorizontal: ps(40),
  },
  emptyIconWrap: {
    width: ps(62),
    height: ps(62),
    borderRadius: ps(31),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: paper.hairline,
  },
  emptyTitle: {
    fontFamily: paperFonts.display,
    fontSize: ps(22),
    letterSpacing: ps(-0.7),
    color: paper.ink,
    marginTop: ps(18),
  },
  emptySubtitle: {
    fontFamily: paperFonts.body,
    fontSize: ps(14.5),
    lineHeight: ps(21),
    color: paper.inkSoft,
    textAlign: 'center',
    marginTop: ps(7),
  },
  emptyAction: {
    marginTop: ps(20),
    borderRadius: ps(11),
    paddingVertical: ps(10),
    paddingHorizontal: ps(18),
    backgroundColor: paper.accent,
  },
  emptyActionText: {
    fontFamily: paperFonts.bodyStrong,
    fontSize: ps(14),
    color: paper.onAccent,
  },

  // ── Fin du fil ──
  endRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ps(12),
    marginTop: ps(10),
    paddingHorizontal: ps(20),
    paddingVertical: ps(22),
  },
  endDivider: {
    flex: 1,
    // Filet d'un pixel, PAS mis à l'échelle : un trait de 1,2 px se rend flou.
    height: 1,
    backgroundColor: paper.hairline,
  },
  endText: {
    fontFamily: paperFonts.mono,
    fontSize: ps(10),
    letterSpacing: ps(0.8),
    color: paper.inkMeta,
    textTransform: 'uppercase',
  },
});
