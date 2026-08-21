import { fonts , statusBarStyle} from '../theme';
import { AppStatusBar, ScreenBackground, AppRefreshControl } from '../components/ui';
import { showActionSheet, type ActionSheetItem } from '../components/ui/ActionSheet';
import { withoutOrphanReplies } from '../utils/feed';
import AlgoCheckCard from '../components/feed/AlgoCheckCard';
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
  Image,
  AppState,
  Dimensions,
  Share,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  cancelAnimation,
  runOnJS,
  Extrapolation,
  FadeIn,
} from 'react-native-reanimated';
import { clamp, projectDecay, rubberBand, springFrom } from '../utils/gesture';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { apiService, progressiveRecommendationService } from '../services';
import { neuralRankService, signalsFromTweet, withRecommendationScores } from '../services/neuralRankService';
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
import TweetRow, { type TweetRowAction } from '../components/feed/TweetRow';
import PromotedAccountCard from '../components/feed/PromotedAccountCard';
import TweetSkeleton from '../components/feed/TweetSkeleton';
import ExploreGrid, { type CardRect } from '../components/feed/ExploreGrid';
import ExploreImmersive from '../components/feed/ExploreImmersive';
import feedback from '../utils/feedback';
import { displayContentOf, splitTweetMedia, hasRenderableContent } from '../utils/tweetMedia';
import { useOptimizedViewTracking } from '../hooks/useOptimizedViewTracking';
import { useDwellTracking } from '../hooks/useDwellTracking';
import StoriesTray from '../components/StoriesTray';
import SpotlightBanner from '../components/SpotlightBanner';
import storiesService from '../services/storiesService';
import PaywallSetupSheet from '../components/PaywallSetupSheet';

// ─── Palette ── identité « Encre » centralisée (src/theme) ───────────────────
import { colors, glow, withAlpha } from '../theme';
import { toast } from '../components/ui/Toast';
import { confirmAsync } from '../components/ui/ConfirmSheet';

const C = {
  bg: colors.bg,
  bgModal: colors.surface,
  bgHover: colors.surfaceHover,
  border: colors.border,
  borderSubtle: colors.borderSubtle,
  accent: colors.accent,
  accentHover: colors.accentHover,
  accentMuted: colors.accentMuted,
  green: colors.success,
  red: colors.red,
  like: colors.like,
  gold: colors.gold,
  textPrimary: colors.textPrimary,
  textSecondary: colors.textSecondary,
  textMuted: colors.textMuted,
  white: colors.white,
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
 * Tweets vus de plus après quoi une question restée sans réponse est
 * considérée comme ignorée, et refermée.
 *
 * Assez pour que le lecteur soit vraiment passé à autre chose ; assez peu
 * pour que le plafond de deux questions par session reste atteignable.
 */
const ASK_ABANDON_AFTER = 8;

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

export default function TweetsScreen() {
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
  /** État de favori connu cette session — voir FeedGutterScreen pour le détail. */
  const [bookmarkedTweets, setBookmarkedTweets] = useState<Record<string, boolean>>({});
  const bookmarkInFlightRef = useRef<Set<string>>(new Set());
  /**
   * Miroir en ref de `bookmarkedTweets` : le menu « … » est lu depuis un
   * `useCallback` stable, qui ne verrait jamais l'état à jour. Voir
   * `handleOptionsMenu`.
   */
  const bookmarkedRef = useRef<Record<string, boolean>>({});
  bookmarkedRef.current = bookmarkedTweets;
  /** Tweet dont on est en train de fixer le prix, `null` quand la feuille est fermée. */
  const [paywallTarget, setPaywallTarget] = useState<string | null>(null);
  // Miroir en ref : permet aux handlers d'être stables (donc mémoïsables et
  // transmissibles aux lignes) tout en lisant toujours la liste à jour.
  const tweetsRef = useRef<Tweet[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Incrémenté au pull-to-refresh pour recharger la barre de stories.
  const [storiesRefresh, setStoriesRefresh] = useState(0);
  // Auteurs ayant une story active (non expirée) : alimente l'anneau autour
  // de l'avatar dans le fil, distinct du badge de vérification.
  const [storyUserIds, setStoryUserIds] = useState<Set<string>>(new Set());
  const [unseenStoryUserIds, setUnseenStoryUserIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
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
          /**
           * Le curseur avance de ce que le SERVEUR a servi, pas de ce qu'on a
           * gardé.
           *
           * Il avançait du nombre de tweets retenus après filtrage et
           * déduplication. Chaque entrée écartée décalait donc le curseur en
           * arrière du serveur, et la page suivante redemandait ce qu'on
           * venait de jeter — pour le jeter encore. Une page entièrement
           * invalide ne faisait pas avancer le curseur du tout : la même
           * requête repartait indéfiniment à chaque arrivée en bas de liste,
           * sans qu'une seule ligne ne s'ajoute.
           */
          setOffset(currentOffset + response.data.recommendations.length);
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
          withRecommendationScores(
            response.data.recommendations.filter(
              (t: any) => t && t.id && t.author && t.author.id
            ),
            response.data.scores,
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
          /**
           * Le curseur avance de ce que le SERVEUR a servi, pas de ce qu'on a
           * gardé.
           *
           * Il avançait du nombre de tweets retenus après filtrage et
           * déduplication. Chaque entrée écartée décalait donc le curseur en
           * arrière du serveur, et la page suivante redemandait ce qu'on
           * venait de jeter — pour le jeter encore. Une page entièrement
           * invalide ne faisait pas avancer le curseur du tout : la même
           * requête repartait indéfiniment à chaque arrivée en bas de liste,
           * sans qu'une seule ligne ne s'ajoute.
           */
          setOffset(currentOffset + response.data.recommendations.length);
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
    } catch {
      if (!servedFromCacheRef.current) setError('Erreur lors du rafraîchissement');
    }
    finally { setRefreshing(false); }
  }, [activeTab, currentAlgorithm, trackCustomAction]);

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
        /**
         * Le moteur reçoit le geste QUEL QUE SOIT L'ONGLET.
         *
         * Cet appel vivait dans le `if (activeTab === 'forYou')` juste en
         * dessous : un like posé depuis « Abonnements » n'atteignait donc
         * jamais le recommandeur — ni like, ni unlike, ni repost, sur un
         * onglet entier. Or un like est un like : le profil de goût,
         * l'affinité d'auteur, la co-occurrence et le modèle de clic sont
         * tous globaux au lecteur, et `/track` ne prend d'ailleurs aucun
         * paramètre d'onglet.
         */
        neuralRankService.trackInteraction({
          tweetId,
          interactionType: wasLiked ? 'unlike' : 'like',
          ...signalsFor(tweetId),
        });

        // Celui-ci reste propre à « Pour toi » : il porte un `algorithm` et un
        // `sessionId`, il rend compte d'une SESSION de recommandation, pas du
        // geste. Il n'a rien à dire sur un fil d'abonnements.
        if (activeTab === 'forYou') {
          sendRecommendationFeedback(tweetId, wasLiked ? 'dislike' : 'like');
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
        // Même raison que pour le like : le repost part au moteur depuis les
        // deux onglets du fil.
        neuralRankService.trackInteraction({
          tweetId,
          interactionType: wasRetweeted ? 'unretweet' : 'retweet',
          ...signalsFor(tweetId),
        });

        if (activeTab === 'forYou') {
          sendRecommendationFeedback(tweetId, wasRetweeted ? 'skip' : 'share');
        }
      }
    } catch {
      setTweets(prevTweets => prevTweets.map(tweet => tweet.id !== tweetId ? tweet : { ...tweet, stats: { ...tweet.stats, retweets: currentRetweets }, user_interaction: { ...tweet.user_interaction, is_retweeted: wasRetweeted } }));
    } finally { retweetLockRef.current[tweetId] = false; }
  }, [activeTab, currentAlgorithm, trackTweetInteraction, offlineEnabled, online, queueAction]);

  /**
   * Signaux joints à chaque geste : auteur à créditer, et version A/B vue.
   *
   * `tweetsRef` et non `tweets` : ces handlers sont capturés une fois par des
   * `useCallback` stables (c'est ce qui évite de re-rendre toutes les lignes),
   * donc une lecture du state serait figée au contenu du montage.
   */
  const signalsFor = useCallback(
    (tweetId: string) =>
      signalsFromTweet(tweetsRef.current.find((t) => String(t.id) === String(tweetId))),
    [],
  );

  const handleBookmark = async (tweetId: string) => {
    if (bookmarkInFlightRef.current.has(tweetId)) return;
    bookmarkInFlightRef.current.add(tweetId);
    try {
      trackingService.trackBookmark(tweetId, signalsFor(tweetId)).catch((error) => {
        console.warn('Erreur tracking bookmark:', error);
      });
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
  };

  const handleSkip = async (tweetId: string) => {
    try {
      await trackingService.trackSkip(tweetId, signalsFor(tweetId));
    } catch (error) {
      console.warn('Erreur tracking skip:', error);
    }
    // « Il n'apparaîtra plus dans ton fil » : le moteur ne marque vu que ce
    // qui pèse positivement, et un skip pèse -0.5 — il ne suffit donc pas à
    // faire disparaître la ligne. On tient la promesse ici, tout de suite.
    setTweets((prev) => prev.filter((t) => String(t.id) !== String(tweetId)));
  };

  const handleBlock = async (tweetId: string) => {
    const { authorId } = signalsFor(tweetId);
    if (!authorId) return;
    const confirmed = await confirmAsync({
      title: 'Bloquer ce compte ?',
      message: 'Il ne pourra plus vous contacter ni voir votre profil, et ses tweets disparaîtront de votre fil.',
      destructive: true,
    });
    if (!confirmed) return;

    trackingService.trackBlock(tweetId, signalsFor(tweetId)).catch((error) => {
      console.warn('Erreur tracking block:', error);
    });
    const response = await apiService.blockUser(authorId);
    if (response.success) {
      toast.success('Compte bloqué');
      setTweets((prev) => prev.filter((t) => String(t.user_id) !== String(authorId)));
    } else {
      toast.error(response.message || 'Impossible de bloquer ce compte');
    }
  };

  const handleShare = async (tweetId: string) => {
    trackingService.trackShare(tweetId, signalsFor(tweetId)).catch((error) => {
      console.warn('Erreur tracking share:', error);
    });
    const response = await apiService.shareTweet(tweetId);
    if (!response.success || !response.data?.share_link) {
      toast.error(response.message || 'Impossible de partager ce tweet');
      return;
    }
    try {
      await Share.share({ message: response.data.share_link, url: response.data.share_link });
    } catch (error) {
      console.warn('Erreur ouverture feuille de partage:', error);
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
    trackingService.trackReport(tweetId, signalsFor(tweetId)).catch((error) => {
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

  /**
   * ⚠️ `tweetsRef`/`bookmarkedRef` et PAS le state — même piège que
   * `handleReport` juste au-dessus, en plus grave.
   *
   * Cette fonction est ordinaire (recréée à chaque rendu), mais elle est
   * appelée depuis `handleRowAction`, qui est un `useCallback` stable : il
   * capture donc la version de CE rendu-là, une fois pour toutes. Ses
   * dépendances ne changent qu'au montage et au changement d'onglet — deux
   * moments où la liste est vide ou périmée.
   *
   * Conséquence vue à l'écran : `tweet` restait `undefined`, donc `isOwnTweet`
   * était faux sur SES PROPRES tweets, et le menu proposait « Bloquer cet
   * utilisateur », « Signaler » et « Ignorer ce tweet » à quelqu'un sur son
   * propre message — au lieu de « Modifier », « Rendre payant » et
   * « Supprimer ». Même cause pour l'état de favori, qui affichait
   * « Ajouter aux favoris » sur un tweet déjà en favori.
   */
  const handleOptionsMenu = (tweetId: string) => {
    const tweet = tweetsRef.current.find((t) => t.id === tweetId);
    const bookmarked = bookmarkedRef.current;
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
          {
            label: bookmarked[tweetId] ? 'Retirer des favoris' : 'Ajouter aux favoris',
            icon: bookmarked[tweetId] ? 'bookmark' : 'bookmark-outline',
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
    // `hasRenderableContent` et non `tweet.content` : ce test-là jetait en
    // silence tout retweet pur, tout tweet en image seule et tout compte
    // promu — voir `utils/feed.ts` pour ce que ça coûtait, jusque dans
    // l'apprentissage du moteur.
    () => withoutOrphanReplies(tweets.filter(hasRenderableContent)),
    [tweets]
  );

  const getAlgorithmLabel = (_algo: string) => 'NeuralRank v2';

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

    // Pure télémétrie du lecteur vidéo, pas un geste délibéré : ne doit ni
    // remettre à zéro la série de silence de l'algo-check, ni tomber dans le
    // switch ci-dessous.
    if (type === 'videoDuration') {
      if (typeof payload === 'number' && payload > 0) {
        videoDurationsRef.current[String(tweetId)] = payload;
      }
      return;
    }

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
        // Aller voir QUI a écrit un tweet est un signal d'intérêt fort (1.5 au
        // barème du moteur, plus qu'un like). Il n'était envoyé nulle part :
        // `trackProfileView` existait sans un seul appelant.
        trackingService.trackProfileView(tweetId, {
          ...signalsFor(tweetId),
          authorId: String(author.id),
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
          isThread: !!(tweetsRef.current.find((t) => t.id === tweetId) as any)?.parent_tweet_id,
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
   * État de la question « ce genre de tweet, ça te parle ? ».
   *
   * En ref et pas en state : il est lu et écrit depuis le callback de
   * visibilité de la liste, qui doit rester la MÊME fonction pendant toute la
   * vie de la `FlatList`. Seul `askAtId` est en state — c'est la seule partie
   * qui doit provoquer un rendu.
   */
  const algoCheckRef = useRef(initialAlgoCheckState());
  const askAtIdRef = useRef<string | null>(null);
  /** Position de la question en cours — nécessaire pour la refermer sans réponse. */
  const askAtIndexRef = useRef(0);
  /** Nombre d'impressions au moment où la question a été posée. */
  const askAtImpressionsRef = useRef(0);
  const [askAtId, setAskAtId] = useState<string | null>(null);

  /**
   * Enregistre la question SANS la retirer de l'écran.
   *
   * `afterAsk` compte la question posée, remet la série de silence à zéro et
   * marque ce tweet comme déjà soumis. Idempotent : appelé deux fois pour le
   * même tweet (une fois à la réponse, une fois à la fermeture), il ne
   * doublerait pas le compteur de la session.
   */
  const recordAlgoCheck = useCallback((index: number, tweetId: string) => {
    if (algoCheckRef.current.answered.has(tweetId)) return;
    algoCheckRef.current = afterAsk(algoCheckRef.current, index, tweetId);
  }, []);

  /**
   * Retire la question de l'écran.
   *
   * ── Pourquoi ce n'est plus appelé depuis `onAnswer` ──
   * Ça l'était, et ça rendait invisible tout ce que la carte fait après la
   * réponse : elle affiche un reçu (« Noté — tu en verras plus. ») pendant
   * ~900 ms, puis s'efface. En fermant depuis `onAnswer`, l'écran démontait
   * la carte dans la même image que l'appui — le reçu n'a jamais pu
   * s'afficher, et le fondu de sortie n'a jamais pu jouer. C'est la carte qui
   * appelle `onDismiss`, quand elle a fini de le faire.
   */
  const closeAlgoCheck = useCallback((index: number, tweetId: string) => {
    recordAlgoCheck(index, tweetId);
    askAtIdRef.current = null;
    askAtIndexRef.current = 0;
    setAskAtId(null);
  }, [recordAlgoCheck]);

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
  /** Durees remontees par TweetVideo (action 'videoDuration'), par id de tweet. */
  const videoDurationsRef = useRef<Record<string, number>>({});

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
      videoDurationMs: media.videoUrl ? videoDurationsRef.current[String(tweetId)] : undefined,
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
        /**
         * L'impression envoyée au moteur.
         *
         * ── Le `500` qui vivait ici ──
         * C'était une constante en dur passée en `dwell_ms`, pas une mesure :
         * chaque tweet vu déclarait une lecture d'une demi-seconde que
         * personne n'avait chronométrée. Elle ne valait rien au barème actuel
         * (sous le premier palier), mais elle traversait quand même le calcul
         * de temps de lecture — et le vrai temps, lui, part séparément par
         * `useDwellTracking`, mesuré, plafonné et accompagné de la nature du
         * contenu. Une valeur inventée qui se fait passer pour une mesure
         * n'attend qu'un changement de seuil pour devenir un faux signal :
         * l'impression part donc SANS temps de lecture.
         *
         * ── Ce qui l'accompagne désormais ──
         * `authorId` déclenche trois mécanismes qui restaient inertes sans lui
         * (filtrage collaboratif, boost temps réel de 30 min, bandit
         * d'exploration) et évite à l'API de retrouver l'auteur en base à
         * chaque tweet vu. `experimentId`/`variantId` attribuent l'impression
         * à la variante RÉELLEMENT affichée.
         *
         * Le RANG, lui, ne part pas d'ici : le moteur sait à quelle place il a
         * servi chaque tweet et l'inscrit lui-même — voir `TrackOptions`.
         */
        trackingService.trackView(tweetId, undefined, signalsFor(tweetId));

        // ── « Ce genre de tweet, ça te parle ? » ──
        // Une impression de plus sans que l'utilisateur ait rien fait. C'est
        // ici, et nulle part ailleurs, qu'on sait qu'un tweet a réellement
        // été VU — d'où le branchement sur le compteur d'impressions plutôt
        // que sur l'index de rendu, qui compte aussi ce qui n'atteint jamais
        // l'écran.
        algoCheckRef.current = afterSilentView(algoCheckRef.current);
        if (askAtIdRef.current) {
          /**
           * Une question laissée sans réponse ne doit pas bloquer la session.
           *
           * Rien ne refermait la question quand le lecteur passait simplement
           * son chemin : sa ligne finit par être démontée par la `FlatList`,
           * `onDismiss` ne part donc jamais, et cette garde-ci bloquait
           * ensuite TOUTE nouvelle question jusqu'à la fin de la session —
           * alors que le plafond est de deux.
           *
           * Le compteur d'impressions et non la visibilité : la question est
           * rendue SOUS son tweet, donc elle allonge l'élément de liste et
           * peut le faire tomber sous le seuil de visibilité au moment même
           * où elle apparaît. Une mesure fondée là-dessus la refermerait dans
           * l'image qui la montre.
           */
          if (
            feedImpressionsRef.current.size - askAtImpressionsRef.current >=
            ASK_ABANDON_AFTER
          ) {
            closeAlgoCheck(askAtIndexRef.current, askAtIdRef.current);
          }
          return;
        }

        const seen = tweetsRef.current.find((t) => t.id === tweetId);
        const confidence = Number((seen as any)?._recommendation_confidence) || 0;

        if (shouldAskAt({ index: position, tweetId, state: algoCheckRef.current, confidence })) {
          askAtIdRef.current = tweetId;
          askAtIndexRef.current = position;
          askAtImpressionsRef.current = feedImpressionsRef.current.size;
          setAskAtId(tweetId);
        }
      },
    };
  }, [notifyDwell, trackView, trackTweetInteraction, activeTab, currentAlgorithm, signalsFor, closeAlgoCheck]);

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
        );
      }
      const row = (
        <TweetRow
          tweet={item}
          index={index}
          isThreadParent={!!(next && next.parent_tweet_id === item.id)}
          isThreadChild={!!(prev && item.parent_tweet_id === prev.id)}
          onAction={handleRowAction}
          contextData={rowContext}
          storyUserIds={storyUserIds}
          unseenStoryUserIds={unseenStoryUserIds}
        />
      );

      // La question ne s'insère pas dans les DONNÉES de la liste : elle est
      // rendue au-dessus de la ligne concernée. Toucher `data` obligerait
      // `keyExtractor`, la déduplication, la pagination et le suivi des
      // impressions à composer avec des entrées qui ne sont pas des tweets.
      if (askAtId !== item.id) return row;

      // Le tweet d'abord, la question juste en dessous : sinon on lit « ce
      // genre de tweet, ça te parle ? » avant d'avoir vu le tweet concerné, et
      // la question devient méconnaissable — rien à l'écran ne dit de quoi
      // elle parle.
      const author = (item as any)?.originalTweet?.author || (item as any)?.author;
      return (
        <>
          {row}
          <AlgoCheckCard
            onAnswer={(liked) => {
              // Même vocabulaire que la question posée dans Explorer
              // (`handleExploreInterest`) : `interested`/`not_interested`, pas
              // `like`/`skip`. Un « pas trop » ici doit mettre l'auteur en
              // sourdine côté moteur comme n'importe quel refus explicite —
              // sans `authorId`, il ne portait que sur ce tweet et restait
              // sans effet perceptible dans le fil.
              neuralRankService.trackInteraction({
                tweetId: item.id,
                interactionType: liked ? 'interested' : 'not_interested',
                ...signalsFromTweet(item),
              });
              trackCustomAction('algo_check_answer', item.id, 'tweet', {
                liked,
                position: index,
                algorithm: currentAlgorithm,
              });
              // On ENREGISTRE, on ne ferme pas : la carte affiche son reçu
              // puis appelle `onDismiss` elle-même. Fermer ici démontait la
              // carte dans la même image que l'appui.
              recordAlgoCheck(index, item.id);
            }}
            onDismiss={() => {
              // Fermer sans répondre compte quand même : on ne repose pas la
              // question tout de suite après avoir été ignoré.
              closeAlgoCheck(index, item.id);
            }}
          />
        </>
      );
    },
    [visibleTweets, handleRowAction, rowContext, storyUserIds, unseenStoryUserIds, askAtId, trackCustomAction, closeAlgoCheck, recordAlgoCheck, currentAlgorithm, navigation]
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

        {/* Spotlight : un vrai élément du fil, pas une notice au-dessus des stories. */}
        <SpotlightBanner
          refreshSignal={storiesRefresh}
          onOpenTweet={(tweetId) => (navigation as any).navigate('TweetDetail', { tweetId })}
        />

        {error && (
          <Animated.View entering={FadeIn.duration(180)} style={S.errorBanner}>
            <Ionicons name="alert-circle-outline" size={18} color={C.red} />
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
    trackingService.trackProfileView(tweet.id, signalsFromTweet(tweet));
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
        neuralRankService.trackInteraction({ tweetId, interactionType: next ? 'like' : 'unlike', ...signalsFromTweet(tweet) });
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
        ...signalsFromTweet(tweet),
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
    neuralRankService.trackInteraction({
      tweetId: tweet.id,
      interactionType: interested ? 'interested' : 'not_interested',
      ...signalsFromTweet(tweet),
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
      ...signalsFromTweet(tweet),
    });
  }, []);

  return (
    <ScreenBackground>
    {/* `SafeAreaView` vient de `react-native-safe-area-context`, PAS du coeur
        de React Native : celle du coeur ne pose aucun inset sur Android, et
        le contenu passait sous la barre de statut. `edges={['top']}` parce
        que le bas est deja gere par la barre d'onglets, en position
        absolue. */}
    <SafeAreaView style={S.container} edges={['top']}>
      <AppStatusBar />

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

      {/* ── Header ── */}
      <View style={S.header}>
        {/* Top row: logo + settings */}
        <View style={S.headerTopRow}>
          <TouchableOpacity
            onPress={() => (navigation as any).navigate('Profil')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={S.avatarRing}
          >
            <Avatar size={32} username={user?.username || 'U'} uri={(user as any)?.avatar} />
          </TouchableOpacity>

          <View style={S.brandLockup}>
            {/* `brand-mark.png` (192×192), pas `icon.png` (1920×1920) : affiché
                statiquement à 26 pt, l'original imposait un décodage de
                3,69 Mpx à chaque montage de l'écran le plus regardé de l'app. */}
            <Image
              source={require('../../assets/brand-mark.png')}
              style={{ width: 26, height: 26 }}
              resizeMode="contain"
            />
            <Text style={S.brandWord}>Twitninf</Text>
          </View>

          <TouchableOpacity
            onPress={() => (navigation as any).navigate('Settings', { returnTo: 'TweetsScreen' })}
            style={S.settingsBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="options-outline" size={19} color={C.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Tab bar — la pastille active glisse sur le thread UI */}
        <View style={S.tabBar}>
          {/* Piste : couvre toute la barre, padding compris, ce qui met la
              pastille et les `x` mesurés dans le même repère. */}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Animated.View style={[S.tabIndicator, tabIndicatorStyle]} />
          </View>
          {TAB_ORDER.map((tab, index) => (
            <TouchableOpacity
              key={tab}
              style={[S.tabItem, activeTab === tab && S.tabItemActive]}
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

      {/* ── Algorithm pill (For You only) ── */}
      {activeTab === 'forYou' && (
        <TouchableOpacity
          style={S.algoPill}
          onPress={() => (navigation as any).navigate('Settings', { returnTo: 'TweetsScreen' })}
          activeOpacity={0.8}
        >
          <View style={S.algoDot} />
          <Text style={S.algoPillText}>{getAlgorithmLabel(displayedAlgorithm)}</Text>
          <Ionicons name="chevron-down" size={13} color={C.accent} style={{ marginLeft: 2 }} />
        </TouchableOpacity>
      )}

      {/* ── Ban alert ── */}
      <BanAlertBanner />

      {/* ── FAB ──
          Un seul bouton : la vidéo est passée dans le composeur de tweet et le
          labo (A/B test) n'est plus utilisé. */}
      <View style={S.fabContainer} pointerEvents="box-none">
        <TouchableOpacity style={S.fab} onPress={handleCreateTweet} activeOpacity={0.85}>
          <Ionicons name="add" size={26} color={C.white} />
        </TouchableOpacity>
      </View>

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
      <FlatList
        data={visibleTweets}
        renderItem={renderTweet}
        keyExtractor={keyExtractor}
        style={S.scrollView}
        contentContainerStyle={S.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
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
        ListEmptyComponent={
          isInitialLoading ? (
            // Ossature plutôt qu'un logo qui tourne : l'attente paraît
            // beaucoup plus courte et la mise en page ne saute pas.
            <TweetSkeleton count={6} />
          ) : (
            <Animated.View entering={FadeIn.duration(220)} style={S.emptyState}>
              <View style={S.emptyIconWrap}>
                <Ionicons name="chatbubble-ellipses-outline" size={38} color={C.accent} />
              </View>
              <Text style={S.emptyTitle}>Rien à afficher</Text>
              <Text style={S.emptySubtitle}>
                {activeTab === 'forYou' ? 'Aucune recommandation pour l\'instant' : 'Suivez des comptes pour voir leurs tweets'}
              </Text>
              <TouchableOpacity style={S.emptyAction} onPress={handleCreateTweet}>
                <Text style={S.emptyActionText}>Poster un tweet</Text>
              </TouchableOpacity>
            </Animated.View>
          )
        }
        ListFooterComponent={
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
        }
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
    </ScreenBackground>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  fullLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },

  // ── Header ──
  header: {
    backgroundColor: 'transparent',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 12 : 6,
    paddingBottom: 10,
  },
  avatarRing: {
    padding: 2,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: C.accent,
  },
  brandLockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  brandWord: {
    color: C.textPrimary,
    fontSize: 21,
    fontFamily: fonts.displayHeavy,
    letterSpacing: -0.4,
  },
  settingsBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 14,
    marginBottom: 10,
    padding: 4,
    borderRadius: 14,
    backgroundColor: colors.surface,
    gap: 4,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'transparent',
  },
  // Filet de sécurité : la pastille animée ci-dessous ne s'affiche que si les
  // DEUX onglets ont fini leur mesure `onLayout` (voir `tabsReady`). Si cette
  // mesure ne se déclenche pas, la pastille reste invisible et le libellé actif
  // (blanc fixe, `tabLabelActive`) se retrouvait sur `transparent` — lisible en
  // sombre par hasard, invisible sur le fond clair de la barre en thème clair.
  // Ce fond plein sur l'onglet actif ne dépend d'aucune animation.
  tabItemActive: {
    backgroundColor: colors.accent,
  },
  // Pastille active : une seule vue qui glisse, au lieu d'un fond qui
  // apparaît/disparaît sur deux boutons distincts. Position et taille
  // viennent entièrement de la mesure des onglets.
  //
  // Pas de `glow()` ici : sous Android il ne rend qu'une `elevation`, qui
  // faisait passer la pastille DEVANT les libellés — le texte de l'onglet
  // actif disparaissait sous l'aplat indigo. L'ombre reste sur iOS, où elle
  // n'a aucun effet sur l'ordre de peinture.
  tabIndicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderRadius: 10,
    backgroundColor: C.accent,
    ...(Platform.OS === 'ios' ? glow(colors.accent, 10) : null),
  },
  tabLabel: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: C.textMuted,
    letterSpacing: -0.1,
  },
  tabLabelActive: {
    color: C.white,
  },

  // ── Algorithm pill ──
  algoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginLeft: 14,
    marginTop: 2,
    marginBottom: 4,
    backgroundColor: colors.accentMuted,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  algoDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 7,
    backgroundColor: colors.accent,
  },
  algoPillText: {
    color: C.accent,
    fontSize: 13,
    fontFamily: fonts.bold,
  },

  // ── FAB ──
  fabContainer: {
    position: 'absolute',
    right: 18,
    bottom: 92,
    alignItems: 'flex-end',
    zIndex: 20,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: C.accent,
    justifyContent: 'center',
    alignItems: 'center',
    ...glow(colors.accent, 16),
  },

  // ── Feed ──
  /**
   * Conteneur du geste de bascule : une vue ordinaire, qui prend simplement la
   * place que la liste occupait. Rien d'animé ici — voir le commentaire du
   * geste sur ce que coûtait une vue animée à cet endroit.
   */
  feedWrap: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollContent: {
    paddingTop: 6,
  },

  // ── Error ──
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.redMuted,
    borderRadius: 12,
    margin: 16,
    padding: 14,
    gap: 10,
  },
  errorText: {
    flex: 1,
    color: C.red,
    fontSize: 14,
  },
  retryBtn: {
    backgroundColor: C.red,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  retryBtnText: {
    color: C.white,
    fontSize: 13,
    fontWeight: '700', fontFamily: fonts.bold,
  },

  // ── Empty ──
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 40,
  },
  emptyIconWrap: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.accentMuted,
    borderWidth: 2,
    borderColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    color: C.textPrimary,
    fontSize: 20,
    fontFamily: fonts.displayHeavy,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: C.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  emptyAction: {
    backgroundColor: C.accent,
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 13,
    ...glow(colors.accent, 14),
  },
  emptyActionText: {
    color: C.white,
    fontWeight: '700', fontFamily: fonts.bold,
    fontSize: 15,
  },

  // ── Tweet row ──
  tweetRow: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    marginHorizontal: 12,
    marginTop: 10,
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 12,
    overflow: 'hidden',
  },
  tweetRowAd: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  tweetInner: {
    flexDirection: 'row',
    gap: 10,
  },

  // ── Avatar col ──
  avatarCol: {
    alignItems: 'center',
    width: 44,
  },
  avatarVerifiedRing: {
    padding: 2,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#3897F0',
  },
  threadLine: {
    flex: 1,
    width: 2,
    backgroundColor: C.border,
    borderRadius: 1,
    marginTop: 6,
    minHeight: 20,
  },
  threadLineTop: {
    position: 'absolute',
    top: -14,
    width: 2,
    height: 14,
    backgroundColor: C.border,
    borderRadius: 1,
    alignSelf: 'center',
  },

  // ── Content col ──
  contentCol: {
    flex: 1,
    paddingBottom: 12,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    marginBottom: 3,
    gap: 4,
  },
  authorName: {
    color: C.textPrimary,
    fontSize: 15,
    fontWeight: '700', fontFamily: fonts.bold,
    letterSpacing: -0.2,
    flexShrink: 1,
    maxWidth: '45%',
  },
  verifiedWrap: {
    marginTop: 1,
  },
  authorHandle: {
    color: C.textSecondary,
    fontSize: 14,
    flexShrink: 1,
    maxWidth: '30%',
  },
  dot: {
    color: C.textMuted,
    fontSize: 14,
  },
  timestamp: {
    color: C.textSecondary,
    fontSize: 14,
  },
  tweetText: {
    color: C.textPrimary,
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 10,
  },
  hiddenMeasure: {
    position: 'absolute',
    opacity: 0,
    left: -9999,
    height: 0,
    width: '100%',
  },
  seeMoreBtn: {
    marginBottom: 10,
    marginTop: -6,
  },
  seeMoreText: {
    color: C.accent,
    fontSize: 14,
    fontWeight: '600', fontFamily: fonts.semibold,
  },

  // ── Quote tweet ──
  quoteTweet: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    backgroundColor: colors.surfaceAlt,
  },
  quoteAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 5,
  },
  quoteAuthorName: {
    color: C.textPrimary,
    fontSize: 14,
    fontWeight: '700', fontFamily: fonts.bold,
  },
  quoteAuthorHandle: {
    color: C.textSecondary,
    fontSize: 13,
  },
  quoteText: {
    color: C.textPrimary,
    fontSize: 14,
    lineHeight: 20,
  },

  // ── Retweet / ad labels ──
  retweetLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 52,
    marginBottom: 6,
  },
  retweetLabelText: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: '500', fontFamily: fonts.medium,
  },
  adLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    marginLeft: 52,
    marginBottom: 8,
    backgroundColor: colors.gold,
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  adLabelText: {
    color: '#1a1303',
    fontSize: 11,
    fontFamily: fonts.bold,
  },

  // ── Actions ──
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
  },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: colors.surfaceAlt,
  },
  actionChipStatic: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  actionIconOnly: {
    padding: 7,
  },
  actionChipRetweetActive: {
    backgroundColor: colors.successMuted,
  },
  actionChipLikeActive: {
    backgroundColor: withAlpha(colors.like, 0.16),
  },
  likeActionBtn: {
    position: 'relative',
    overflow: 'visible',
  },
  likeBurstHeart: {
    position: 'absolute',
    left: 5,
    top: -2,
  },
  actionCount: {
    color: C.textMuted,
    fontSize: 13,
  },

  // ── Separator ──
  separator: {
    height: 0,
  },
  instagramLikeOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },

  // ── Loading more ──
  loadingMoreRow: {
    alignItems: 'center',
    paddingVertical: 20,
  },

  // ── End of feed ──
  endRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 20,
    gap: 12,
  },
  endDivider: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
  },
  endText: {
    color: C.textMuted,
    fontSize: 13,
    fontWeight: '500', fontFamily: fonts.medium,
  },
});
