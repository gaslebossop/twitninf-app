/**
 * Recherche — DA « papier », la même que le fil (voir `theme/paper2b.ts`).
 *
 * ── L'objet ──────────────────────────────────────────────────────────────
 * Ce n'est pas un tableau de bord de la recherche, c'est un DÉPOUILLEMENT :
 * on écrit une cote en haut de la page, on choisit une rubrique, et on lit ce
 * qui remonte. La page n'a donc ni carte, ni pastille de couleur, ni grille de
 * tuiles — une colonne, des rubriques en capitales espacées, et la MÊME
 * gouttière de 52 px que le fil, d'un bout à l'autre :
 *
 *   ┌────┬──────────────────────────────┐
 *   │ 🔎 │  le champ, écrit en gros     │  ← la seule signature de l'écran
 *   ├────┴──────────────────────────────┤
 *   │ Tout  Comptes  Publications  …    │  ← rubriques soulignées, comme le fil
 *   ├───────────────────────────────────┤
 *   │ RÉSUMÉ                            │  ← une bande, pas une carte
 *   ├────┬──────────────────────────────┤
 *   │ 👤 │  nom / @pseudo / méta        │  ← l'avatar tient la gouttière
 *   │ 12k│  #tendance                   │  ← le chiffre tient la gouttière
 *   │ ♥ 8│  une publication             │  ← `TweetRowGutter`, sans retouche
 *   └────┴──────────────────────────────┘
 *
 * Une seule colonne de gauche pour trois natures de ligne : c'est elle qui
 * fait tenir la page ensemble, et c'est aussi ce qui raccorde la recherche au
 * fil sans qu'un seul pixel soit redessiné à l'identique de part et d'autre.
 *
 * ── Ce qui a été retiré, et pourquoi ─────────────────────────────────────
 *   - les CARTES (résultat, tendance, résumé) : quatre fonds gris arrondis
 *     empilés font quatre boîtes de même poids, donc aucune hiérarchie. Ce qui
 *     sépare deux lignes ici, c'est le rythme vertical et la gouttière — le
 *     fil 2B ne trace pas une seule règle horizontale, cette page non plus ;
 *   - les PASTILLES de filtre : elles disent la même chose que des onglets
 *     soulignés en occupant plus de place, et elles ne ressemblent à rien
 *     d'autre dans l'app depuis la refonte du fil ;
 *   - les TWEETS CITÉS recopiés dans le résumé : ils sont, par construction,
 *     déjà dans les résultats juste en dessous. Les comptes cités, eux,
 *     restent — ce sont des raccourcis vers des profils qui, souvent, ne sont
 *     PAS dans la liste (filtre « Publications ») ;
 *   - les RUBRIQUES quand le champ est vide : sans requête, aucun filtre ne
 *     change quoi que ce soit à l'écran (les tendances s'affichent quel que
 *     soit le filtre). Un contrôle mort vaut moins qu'un contrôle absent.
 *     Corollaire assumé : vider le champ remet la rubrique sur « Tout »,
 *     sinon un filtre choisi puis caché s'appliquerait en douce à la
 *     recherche suivante ;
 *   - `UserSuggestions` : les suggestions restent (même appel, même donnée),
 *     mais rendues comme les autres comptes de la page au lieu d'un carrousel
 *     de cartes de 72 % de large. Le composant n'avait pas d'autre appelant.
 *
 * ── Ce qui n'a pas bougé ─────────────────────────────────────────────────
 * Le réseau : mêmes appels, mêmes paramètres, même flux WebSocket pour le
 * résumé, même relance unique en cas d'échec. La recherche part toujours de
 * la VALIDATION du champ, jamais de la frappe.
 *
 * ── Les interactions vivent maintenant dans les tweets ───────────────────
 * L'écran tenait deux dictionnaires parallèles (`likedTweets`,
 * `retweetedTweets`) et refabriquait un tweet par ligne à chaque rendu pour
 * les recoller. `TweetRowGutter` lit `user_interaction` directement et se
 * mémoïse dessus : l'état est donc porté par le tweet lui-même, comme dans le
 * fil. Un like ne re-rend plus que sa ligne.
 */
import React, {
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  FlatList,
  LayoutChangeEvent,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';

import {
  paper,
  paperFonts,
  isPaperDark,
  ps,
  GUTTER_W,
  ROW_PAD_X,
  ROW_GAP,
} from '../theme/paper2b';
import { AppStatusBar } from '../components/ui';
import { toast } from '../components/ui/Toast';
import { promptAsync } from '../components/ui/PromptSheet';
import { effectiveSubscriptionTier } from '../utils/subscriptionTier';
import strikeService from '../services/strikeService';
import { showActionSheet, type ActionSheetItem } from '../components/ui/ActionSheet';
import Skeleton from '../components/ui/Skeleton';
import SceneCanvas, { SceneReveal, useSceneReveal } from '../components/SceneCanvas';
import Avatar from '../components/Avatar';
import VerifiedBadge from '../components/VerifiedBadge';
import PremiumDisplayName from '../components/PremiumDisplayName';
import ReportSheet from '../components/ReportSheet';
import BanAlertBanner from '../components/BanAlertBanner';
import EventStrip from '../components/events/EventStrip';
import TweetRowGutter from '../components/feed/paper2b/TweetRowGutter';
import type { TweetRowAction } from '../components/feed/TweetRow';
import {
  certifiedNameColors,
  type ProfileCustomization,
} from '../services/profileCustomizationService';
import { apiService } from '../services';
import tokenStore from '../services/tokenStore';
import { useAuth } from '../contexts/AuthContext';
import { formatCompactCount } from '../utils/format';
import type { Tweet, User, UserSuggestion } from '../types/api';
import { LIST_TUNING } from '../utils/listTuning';

type SearchRouteProp = RouteProp<{ Search: { query?: string; searchType?: string } }, 'Search'>;

type Rubric = 'all' | 'users' | 'tweets' | 'trends';

/**
 * Les rubriques, dans l'ordre d'affichage. C'est aussi l'ordre qui sert au
 * soulignement animé : son index vient d'ici, jamais d'une constante écrite
 * une seconde fois.
 */
const RUBRICS: { key: Rubric; label: string }[] = [
  { key: 'all', label: 'Tout' },
  { key: 'users', label: 'Comptes' },
  { key: 'tweets', label: 'Publications' },
  { key: 'trends', label: 'Tendances' },
];

/**
 * `BottomTabBarHeightContext` rend `undefined` hors d'un navigateur d'onglets
 * (contrairement à `useBottomTabBarHeight`, qui lève) : c'est la forme sûre,
 * et cette valeur est le repli quand l'écran est poussé sur la pile.
 */
const FALLBACK_TAB_BAR_HEIGHT = 85;

/** Une ligne de la liste. Le type porte la nature, le rendu ne devine rien. */
type Row =
  | { key: string; kind: 'head'; label: string }
  | { key: string; kind: 'person'; user: User; meta: string }
  | { key: string; kind: 'tweet'; tweet: Tweet; index: number }
  | { key: string; kind: 'trend'; tag: string; count: number };

/**
 * Le champ — la signature de la page.
 *
 * Ce qu'on tape s'écrit en Archivo à `ps(23)` : à ce corps, la requête EST le
 * titre de l'écran, et il n'y a plus besoin d'un « Recherche » écrit au-dessus
 * ni d'un rappel « Résultats pour … » en dessous. Pas de fond gris arrondi non
 * plus : le filet sous la ligne suffit à dire qu'on écrit ici — c'est la
 * réglure d'un formulaire, pas une boîte.
 *
 * La requête en cours de frappe vit ICI et nulle part ailleurs. Elle vivait
 * dans l'écran, si bien que chaque caractère reconstruisait tous les résultats
 * déjà montés. Le parent n'apprend que la requête VALIDÉE — le réseau ne
 * change pas d'un iota, la recherche partait déjà de `onSubmitEditing`.
 */
const SearchField = memo(function SearchField({
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
    <View style={S.field}>
      <Ionicons name="search" size={ps(20)} color={paper.inkSoft} />
      <TextInput
        style={S.fieldInput}
        placeholder="Rechercher"
        placeholderTextColor={paper.inkIdle}
        value={draft}
        onChangeText={(text) => setDraft(text.replace(/^#+/, '#'))}
        onSubmitEditing={() => onSubmit(draft)}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        selectionColor={paper.accent}
      />
      {draft.length > 0 && (
        <TouchableOpacity
          onPress={clear}
          style={S.fieldClear}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Effacer la recherche"
        >
          <Ionicons name="close" size={ps(20)} color={paper.inkSoft} />
        </TouchableOpacity>
      )}
    </View>
  );
});

/**
 * Les rubriques, soulignées — même machinerie que les onglets du fil.
 *
 * La position et la largeur du trait viennent de la MESURE de chaque onglet
 * (`onLayout`), pas d'un calcul à partir du padding et des gaps : les insets
 * d'un enfant absolu ne se mesurent pas dans le même repère que le `x` d'un
 * enfant en flux. `ready` évite le pop du premier rendu, où toutes les
 * largeurs valent encore 0.
 *
 * Le ressort est celui du fil (damping 20 / stiffness 220) : c'est le même
 * objet d'un écran à l'autre, il doit bouger pareil.
 */
const RubricBar = memo(function RubricBar({
  active,
  onChange,
}: {
  active: Rubric;
  onChange: (rubric: Rubric) => void;
}) {
  const index = Math.max(
    RUBRICS.findIndex((r) => r.key === active),
    0,
  );

  const pos = useSharedValue(index);
  const layouts = useSharedValue(RUBRICS.map(() => ({ x: 0, y: 0, width: 0, height: 0 })));
  const ready = useSharedValue(0);

  useEffect(() => {
    pos.value = withSpring(index, { damping: 20, stiffness: 220 });
  }, [index, pos]);

  const handleLayout = useCallback(
    (i: number) => (e: LayoutChangeEvent) => {
      const { x, y, width, height } = e.nativeEvent.layout;
      const next = layouts.value.slice();
      next[i] = { x, y, width, height };
      layouts.value = next;
      if (next.every((l) => l.width > 0) && ready.value === 0) {
        ready.value = withTiming(1, { duration: 140 });
      }
    },
    [layouts, ready],
  );

  const indicator = useAnimatedStyle(() => {
    const l = layouts.value;
    if (!l.every((m) => m.width > 0)) {
      return {
        opacity: 0,
        width: 0,
        height: 0,
        transform: [{ translateX: 0 }, { translateY: 0 }] as const,
      };
    }
    const input = l.map((_, i) => i);
    return {
      opacity: ready.value,
      width: interpolate(pos.value, input, l.map((m) => m.width)),
      height: interpolate(pos.value, input, l.map((m) => m.height)),
      transform: [
        { translateX: interpolate(pos.value, input, l.map((m) => m.x)) },
        { translateY: interpolate(pos.value, input, l.map((m) => m.y)) },
      ] as const,
    };
  });

  return (
    <View style={S.rubricBar}>
      {/* Piste : couvre toute la barre, padding compris, ce qui met le trait
          et les `x` mesurés dans le même repère. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Animated.View style={[S.rubricIndicator, indicator]} />
      </View>
      {RUBRICS.map((rubric, i) => (
        <TouchableOpacity
          key={rubric.key}
          style={S.rubricItem}
          onPress={() => onChange(rubric.key)}
          onLayout={handleLayout(i)}
          // La rangée fait 40 pt de haut : le `hitSlop` porte la cible à 56
          // sans toucher à la mise en page, donc sans décoller le trait du
          // bord bas de l'onglet. 6 px de côté restent sous le gap de 18,
          // deux rubriques voisines ne peuvent pas se chevaucher.
          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          activeOpacity={0.85}
          accessibilityRole="tab"
          accessibilityState={{ selected: rubric.key === active }}
        >
          <Text style={[S.rubricLabel, rubric.key === active && S.rubricLabelActive]}>
            {rubric.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
});

/** Tête de rubrique — la voix des méta de 2B : capitale espacée, chasse fixe. */
const SectionHead = memo(function SectionHead({ label }: { label: string }) {
  return (
    <View style={S.head}>
      <Text style={S.eyebrow}>{label}</Text>
    </View>
  );
});

/**
 * Une ligne « compte ».
 *
 * L'avatar tient la gouttière, à la place qu'occupe le cœur sur une ligne de
 * tweet : la colonne de gauche reste la même colonne d'un bout à l'autre de la
 * page. Le bouton reprend la pilule contour de « Répondre » — un accent plein
 * ici ferait de chaque ligne une invitation criarde, alors que la ligne
 * entière mène déjà au profil.
 */
const PersonRow = memo(function PersonRow({
  user,
  meta,
  following,
  busy,
  onOpen,
  onFollow,
}: {
  user: User;
  meta: string;
  following: boolean;
  busy: boolean;
  onOpen: (user: User) => void;
  onFollow: (user: User) => void;
}) {
  return (
    <TouchableOpacity style={S.personRow} activeOpacity={0.75} onPress={() => onOpen(user)}>
      <View style={S.gutter}>
        <Avatar size={ps(44)} username={user.username || 'U'} uri={(user as any)?.avatar} />
      </View>

      <View style={S.personContent}>
        <View style={S.personNameRow}>
          <PremiumDisplayName
            text={user.full_name || 'Utilisateur'}
            baseStyle={S.personName}
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
            <View style={S.verifiedWrap}>
              <VerifiedBadge
                verificationStyle={(user.verification_style as any) || 'default'}
                size={ps(15)}
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

        <Text style={S.personHandle} numberOfLines={1}>
          @{user.username || 'username'}
        </Text>
        {!!meta && (
          <Text style={S.personMeta} numberOfLines={1}>
            {meta}
          </Text>
        )}
      </View>

      <TouchableOpacity
        style={[S.pill, following && S.pillMuted]}
        onPress={() => onFollow(user)}
        disabled={busy}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {busy ? (
          <ActivityIndicator size="small" color={paper.inkSoft} />
        ) : (
          <Text style={[S.pillText, following && S.pillTextMuted]}>
            {following ? 'Suivi' : 'Suivre'}
          </Text>
        )}
      </TouchableOpacity>
    </TouchableOpacity>
  );
});

/**
 * Une ligne « tendance ».
 *
 * Le compte tient la gouttière et le mot-dièse la colonne de contenu : c'est
 * exactement la grille d'une ligne de fil, où le chiffre est à gauche et le
 * texte à droite. La liste est déjà triée, elle ne porte donc aucun rang
 * écrit — la position DIT le rang.
 */
const TrendRow = memo(function TrendRow({
  tag,
  count,
  onPress,
}: {
  tag: string;
  count: number;
  onPress: (tag: string) => void;
}) {
  return (
    <TouchableOpacity style={S.trendRow} activeOpacity={0.75} onPress={() => onPress(tag)}>
      <View style={S.gutter}>
        <Text style={S.trendCount}>{formatCompactCount(count)}</Text>
      </View>
      <Text style={S.trendTag} numberOfLines={1}>
        #{tag.replace(/^#+/, '')}
      </Text>
    </TouchableOpacity>
  );
});

/**
 * Le résumé — une BANDE, pas une carte.
 *
 * Un cran de fond sur toute la largeur, sans coin arrondi et sans filet : le
 * changement de ton EST la limite, comme pour le post du jour du fil. Le seul
 * accent de la page est ici, sur le curseur qui bat pendant l'écriture — c'est
 * la seule chose de l'écran qui soit en train de se produire.
 */
const SummaryBand = memo(function SummaryBand({
  text,
  streaming,
  status,
  mentioned,
  onOpenUser,
}: {
  text: string;
  streaming: boolean;
  status: string;
  mentioned: User[];
  onOpenUser: (user: User) => void;
}) {
  return (
    <View style={S.summary}>
      <Text style={S.eyebrow}>RÉSUMÉ</Text>
      <Text style={S.summaryText}>
        {text}
        {streaming && <Text style={S.summaryCaret}>▌</Text>}
      </Text>
      {/* L'étape n'est dite que TANT QUE rien n'est écrit. Dès le premier
          morceau de texte, le curseur qui bat dit déjà « ça arrive » : garder
          les deux, c'est signaler deux fois la même chose. */}
      {streaming && !text && !!status && <Text style={S.summaryStatus}>{status}</Text>}
      {mentioned.length > 0 && (
        <View style={S.summaryRefs}>
          {mentioned.map((u) => (
            <TouchableOpacity
              key={u.id}
              onPress={() => onOpenUser(u)}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Text style={S.summaryRef}>@{u.username}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
});

/**
 * L'attente, dans la grille de la page : un bloc dans la gouttière, deux
 * lignes à côté. Le squelette générique de l'app dessine des cartes arrondies,
 * c'est-à-dire la seule forme que cet écran n'a plus.
 */
const RowsSkeleton = memo(function RowsSkeleton() {
  return (
    <View>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={S.skeletonRow}>
          <View style={S.gutter}>
            <Skeleton width={ps(30)} height={ps(30)} rounded={ps(15)} />
          </View>
          <View style={S.skeletonContent}>
            <Skeleton width="46%" height={ps(15)} rounded={ps(4)} />
            <Skeleton width="88%" height={ps(13)} rounded={ps(4)} style={S.skeletonLine} />
          </View>
        </View>
      ))}
    </View>
  );
});

export default function SearchScreen() {
  const navigation = useNavigation();
  const route = useRoute<SearchRouteProp>();
  const { user } = useAuth();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? FALLBACK_TAB_BAR_HEIGHT;

  /** La requête VALIDÉE, pas celle en cours de frappe : celle-ci vit dans `SearchField`. */
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ users: User[]; tweets: Tweet[] }>({
    users: [],
    tweets: [],
  });
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<Rubric>('all');

  const [displayedAiSummary, setDisplayedAiSummary] = useState('');
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiSummaryStatus, setAiSummaryStatus] = useState('');
  /** Seuls les COMPTES cités sont gardés : les tweets cités sont déjà dans la liste. */
  const [aiMentionedUsers, setAiMentionedUsers] = useState<User[]>([]);
  const summaryRequestIdRef = useRef(0);

  const [trendingHashtags, setTrendingHashtags] = useState<{ tag: string; count: number }[]>([]);
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);

  const [followingUsers, setFollowingUsers] = useState<{ [key: string]: boolean }>({});
  const [followLoading, setFollowLoading] = useState<{ [key: string]: boolean }>({});

  /** Signalement d'une publication trouvée — la feuille se charge du parcours. */
  const [reportTarget, setReportTarget] = useState<{ id: string; label?: string } | null>(null);

  // Récupérer le token depuis AsyncStorage (système standard)
  const [currentToken, setCurrentToken] = useState<string | null>(null);

  const performSearchRef = useRef<(query: string, filterOverride?: Rubric) => Promise<void>>(
    async () => {},
  );

  /**
   * Miroir des publications trouvées, pour les handlers d'identité STABLE :
   * un handler recréé à chaque rendu re-rendrait toutes les lignes, et c'est
   * exactement ce que la mémoïsation de `TweetRowGutter` existe pour éviter.
   */
  const tweetsRef = useRef<Tweet[]>([]);
  useEffect(() => {
    tweetsRef.current = searchResults.tweets;
  }, [searchResults.tweets]);

  /** Un geste par tweet à la fois : deux appels concurrents s'annulent mal. */
  const actionLockRef = useRef<{ [key: string]: boolean }>({});

  // Charger le token au démarrage, et le rafraîchir quand l'utilisateur change.
  useEffect(() => {
    (async () => {
      try {
        setCurrentToken(await tokenStore.getAccessToken());
      } catch (error) {
        console.error('❌ Erreur lors du chargement du token:', error);
      }
    })();
  }, [user?.id]);

  /**
   * Le sommaire (tendances + suggestions) est arrivé — ou a échoué.
   *
   * Sans ce drapeau, deux réponses vides laisseraient le squelette tourner
   * indéfiniment : « pas encore chargé » et « il n'y a rien » se ressemblent
   * quand on ne regarde que la longueur de la liste.
   */
  const [openingLoaded, setOpeningLoaded] = useState(false);

  useEffect(() => {
    // Les deux fonctions rattrapent leurs erreurs : `Promise.all` ne rejette
    // donc jamais ici, et le drapeau se lève dans tous les cas.
    Promise.all([fetchTrendingHashtags(), fetchSuggestions()]).finally(() =>
      setOpeningLoaded(true),
    );
  }, []);

  const parseSummaryContent = (rawSummary: string, results: { users: User[]; tweets: Tweet[] }) => {
    const userIds = Array.from(
      new Set(
        (rawSummary.match(/\[USER:([^\]]+)\]/g) || []).map((m) =>
          m.replace('[USER:', '').replace(']', '').trim(),
        ),
      ),
    );

    const users = (results.users || []).filter((u) => userIds.includes(String(u.id)));
    const usersMap = new Map(users.map((u) => [String(u.id), u]));

    const textWithUsers = rawSummary.replace(/\[USER:([^\]]+)\]/g, (_full, id) => {
      const cited = usersMap.get(String(id).trim());
      if (!cited?.username) return '';
      return `@${cited.username}`;
    });

    const text = textWithUsers
      .replace(/\[TWEET:[^\]]+\]/g, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([,.;!?])/g, '$1')
      .trim();

    return { text, users };
  };

  const generateSearchSummary = async (
    query: string,
    results: { users: User[]; tweets: Tweet[]; hashtags?: { tag: string; count: number }[] },
    filter: Rubric,
  ) => {
    const requestId = ++summaryRequestIdRef.current;

    setAiSummaryLoading(true);
    setAiSummaryStatus('');
    setDisplayedAiSummary('');
    setAiMentionedUsers([]);

    let streamText = '';
    const payload = {
      q: query,
      type: filter,
      users: results.users || [],
      tweets: results.tweets || [],
      hashtags: results.hashtags || [],
    };

    const onChunk = (chunk: string) => {
      if (requestId !== summaryRequestIdRef.current) return;
      streamText += chunk;
      const parsed = parseSummaryContent(streamText, results);
      setDisplayedAiSummary(parsed.text);
      setAiMentionedUsers(parsed.users);
    };
    const onStatus = (status: string) => {
      if (requestId !== summaryRequestIdRef.current) return;
      setAiSummaryStatus(status);
    };

    let streamResponse = await apiService.streamSearchSummaryWs(payload, onChunk, onStatus);

    if (!streamResponse.success) {
      // Retry WS unique pour eviter les 502 frequents sur le fallback HTTP/SSE
      await new Promise((resolve) => setTimeout(resolve, 250));
      streamResponse = await apiService.streamSearchSummaryWs(payload, onChunk, onStatus);
    }

    if (requestId !== summaryRequestIdRef.current) return;

    const finalText = (streamResponse.text || streamText || '').trim();
    if (finalText) {
      const parsed = parseSummaryContent(finalText, results);
      setDisplayedAiSummary(parsed.text);
      setAiMentionedUsers(parsed.users);
    } else {
      setDisplayedAiSummary('');
      setAiMentionedUsers([]);
    }
    setAiSummaryStatus('');
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

  /**
   * Suggestions — même appel que l'ancien carrousel `UserSuggestions`, rendu
   * ici comme les autres comptes de la page.
   */
  const fetchSuggestions = async () => {
    try {
      const response = await apiService.getUserSuggestions(10);
      if (response.success && Array.isArray(response.data)) {
        setSuggestions(response.data);
      }
    } catch (error) {
      console.error('[Recherche] Erreur suggestions:', error);
    }
  };

  const performSearch = async (query: string, filterOverride?: Rubric) => {
    if (!query.trim()) {
      setSearchResults({ users: [], tweets: [] });
      setDisplayedAiSummary('');
      setAiMentionedUsers([]);
      setAiSummaryLoading(false);
      setAiSummaryStatus('');
      return;
    }

    try {
      setLoading(true);
      const filterForSearch = filterOverride || activeFilter;
      // Normaliser les hashtags: éviter les doublons de '#'
      const normalizedQuery = query.replace(/^#+/, '#');

      // Nouvelle recherche : on invalide les flux précédents et on évite
      // d'afficher l'ancien résumé sous les nouveaux résultats.
      summaryRequestIdRef.current += 1;
      setAiSummaryStatus('');
      setAiSummaryLoading(false);
      setDisplayedAiSummary('');
      setAiMentionedUsers([]);

      let response;
      switch (filterForSearch) {
        case 'users':
          response = await apiService.searchUsers({ q: normalizedQuery, limit: 20 }, currentToken);
          if (response.success && response.data) {
            const users = response.data.users || [];
            setSearchResults({ users, tweets: [] });
            generateSearchSummary(normalizedQuery, { users, tweets: [] }, filterForSearch).catch(
              (err) => console.error('❌ Erreur génération résumé IA (users):', err),
            );
          }
          break;
        case 'tweets':
          response = await apiService.searchTweets({ q: normalizedQuery, limit: 20 }, currentToken);
          if (response.success && response.data) {
            const tweets = response.data.tweets || [];
            setSearchResults({ users: [], tweets });
            generateSearchSummary(normalizedQuery, { users: [], tweets }, filterForSearch).catch(
              (err) => console.error('❌ Erreur génération résumé IA (tweets):', err),
            );
          }
          break;
        default:
          response = await apiService.search({ q: normalizedQuery, limit: 20 }, currentToken);
          if (response.success && response.data) {
            const anyData: any = response.data as any;
            const users = anyData.results?.users || anyData.users || [];
            const tweets = anyData.results?.tweets || anyData.tweets || [];
            setSearchResults({ users, tweets });
            generateSearchSummary(
              normalizedQuery,
              { users, tweets, hashtags: anyData.results?.hashtags || [] },
              filterForSearch,
            ).catch((err) => console.error('❌ Erreur génération résumé IA (all):', err));
          }
          break;
      }
    } catch (error) {
      console.error('Erreur lors de la recherche:', error);

      // Gestion spécifique des erreurs d'authentification
      if (error && typeof error === 'object' && 'message' in error) {
        const errorMessage = (error as any).message;
        if (
          errorMessage.includes('401') ||
          errorMessage.includes('Token') ||
          errorMessage.includes('authentification')
        ) {
          try {
            const newToken = await tokenStore.getAccessToken();
            setCurrentToken(newToken);
            if (newToken) {
              performSearch(query);
              return;
            }
          } catch (refreshError) {
            console.error('❌ Erreur lors du rafraîchissement du token:', refreshError);
          }
        }
      }

      toast.error("Impossible d'effectuer la recherche");
      setSearchResults({ users: [], tweets: [] });
      setDisplayedAiSummary('');
      setAiMentionedUsers([]);
      setAiSummaryStatus('');
    } finally {
      setLoading(false);
    }
  };

  performSearchRef.current = performSearch;

  // Ouvre / exécute la recherche quand on arrive depuis un # ou un lien (params de route).
  // Ne pas dépendre de currentToken : au chargement du token, un re-run annulait le
  // setTimeout (cleanup) alors que les params étaient déjà effacés → champ rempli, 0 résultat.
  useEffect(() => {
    const q = route.params?.query;
    if (typeof q !== 'string' || !q.trim()) return;

    const queryStr = q.trim();
    const st = route.params?.searchType;
    let filter: Rubric = 'all';
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
   * ferait re-rendre `SearchField`, et l'isoler n'aurait servi à rien.
   * `performSearchRef` est réaffecté à chaque rendu, il porte donc toujours la
   * version courante.
   */
  const handleSubmitQuery = useCallback((query: string) => {
    setSearchQuery(query);
    if (query.trim()) {
      performSearchRef.current(query);
    } else {
      // Le champ vidé cache les rubriques : la rubrique choisie doit repartir
      // de zéro avec lui, sinon elle s'appliquerait en douce à la recherche
      // suivante depuis un contrôle que personne ne voit plus.
      setActiveFilter('all');
      performSearchRef.current('');
    }
  }, []);

  const handleFilterChange = useCallback(
    (filter: Rubric) => {
      setActiveFilter(filter);
      if (searchQuery.trim()) {
        performSearchRef.current(searchQuery, filter);
      }
    },
    [searchQuery],
  );

  const handleHashtagPress = useCallback((hashtag: string) => {
    const cleanTag = hashtag.replace(/^#+/, '');
    setSearchQuery(`#${cleanTag}`);
    setActiveFilter('tweets');
    performSearchRef.current(`#${cleanTag}`, 'tweets');
  }, []);

  const handleUserPress = useCallback(
    (target: User) => {
      if (target.id) {
        (navigation as any).navigate('UserProfile', {
          userId: target.id,
          username: target.username,
        });
      }
    },
    [navigation],
  );

  /**
   * Même motif de ref-latch que pour les publications : la ligne est
   * mémoïsée, et un handler recréé à chaque rendu la ferait re-rendre malgré
   * tout — notamment pendant que le résumé arrive caractère par caractère.
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

  // ─── Publications trouvées : mêmes gestes que dans le fil ──────────────────

  /** Applique une retouche à UNE publication, sans toucher aux autres. */
  const patchTweet = useCallback((tweetId: string, patch: (t: Tweet) => Tweet) => {
    setSearchResults((prev) => ({
      ...prev,
      tweets: prev.tweets.map((t) => (t.id === tweetId ? patch(t) : t)),
    }));
  }, []);

  const handleLike = useCallback(
    async (tweetId: string) => {
      if (actionLockRef.current[`like:${tweetId}`]) return;
      actionLockRef.current[`like:${tweetId}`] = true;

      const current = tweetsRef.current.find((t) => t.id === tweetId);
      if (!current) {
        actionLockRef.current[`like:${tweetId}`] = false;
        return;
      }

      const wasLiked = !!current.user_interaction?.is_liked;
      const likes = current.stats?.likes || 0;
      const apply = (liked: boolean, count: number) =>
        patchTweet(tweetId, (t) => ({
          ...t,
          stats: { ...t.stats, likes: count },
          user_interaction: { ...t.user_interaction, is_liked: liked },
        }));

      apply(!wasLiked, wasLiked ? Math.max(0, likes - 1) : likes + 1);

      try {
        const response = await apiService.likeTweet(tweetId);
        if (!response.success) {
          apply(wasLiked, likes);
          toast.error('Impossible de liker le tweet');
        }
      } catch {
        apply(wasLiked, likes);
        toast.error('Impossible de liker le tweet');
      } finally {
        actionLockRef.current[`like:${tweetId}`] = false;
      }
    },
    [patchTweet],
  );

  const handleSuperLike = useCallback(
    async (tweetId: string) => {
      if (actionLockRef.current[`super:${tweetId}`]) return;
      actionLockRef.current[`super:${tweetId}`] = true;

      const current = tweetsRef.current.find((t) => t.id === tweetId);
      if (!current || current.user_interaction?.is_super_liked) {
        actionLockRef.current[`super:${tweetId}`] = false;
        return;
      }

      const wasLiked = !!current.user_interaction?.is_liked;
      const likes = current.stats?.likes || 0;
      const revert = () =>
        patchTweet(tweetId, (t) => ({
          ...t,
          stats: { ...t.stats, likes },
          user_interaction: { ...t.user_interaction, is_liked: wasLiked, is_super_liked: false },
        }));

      patchTweet(tweetId, (t) => ({
        ...t,
        stats: { ...t.stats, likes: wasLiked ? likes : likes + 1 },
        user_interaction: { ...t.user_interaction, is_liked: true, is_super_liked: true },
      }));

      try {
        const response = await apiService.superLikeTweet(tweetId);
        if (!response.success) {
          revert();
          toast.info('Super Cœur', {
            description: response.message || 'Impossible de poser le Super Cœur.',
          });
        }
      } catch {
        revert();
      } finally {
        actionLockRef.current[`super:${tweetId}`] = false;
      }
    },
    [patchTweet],
  );

  const handleRetweet = useCallback(
    async (tweetId: string) => {
      if (actionLockRef.current[`rt:${tweetId}`]) return;
      actionLockRef.current[`rt:${tweetId}`] = true;

      const current = tweetsRef.current.find((t) => t.id === tweetId);
      if (!current) {
        actionLockRef.current[`rt:${tweetId}`] = false;
        return;
      }

      const wasRetweeted = !!current.user_interaction?.is_retweeted;
      const retweets = current.stats?.retweets || 0;
      const apply = (retweeted: boolean, count: number) =>
        patchTweet(tweetId, (t) => ({
          ...t,
          stats: { ...t.stats, retweets: count },
          user_interaction: { ...t.user_interaction, is_retweeted: retweeted },
        }));

      apply(!wasRetweeted, wasRetweeted ? Math.max(0, retweets - 1) : retweets + 1);

      try {
        const response = await apiService.retweet(tweetId);
        if (!response.success) {
          apply(wasRetweeted, retweets);
          toast.error('Impossible de retweeter');
        }
      } catch {
        apply(wasRetweeted, retweets);
        toast.error('Impossible de retweeter');
      } finally {
        actionLockRef.current[`rt:${tweetId}`] = false;
      }
    },
    [patchTweet],
  );

  const handleShare = useCallback(async (tweetId: string) => {
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
  }, []);

  const handleReport = useCallback((tweetId: string) => {
    const tweet = tweetsRef.current.find((t) => t.id === tweetId);
    setReportTarget({
      id: tweetId,
      label: tweet?.author?.username ? `@${tweet.author.username}` : undefined,
    });
  }, []);

  /**
   * Menu de la pression longue.
   *
   * Volontairement plus court que celui du fil : mettre en favori, ignorer un
   * tweet ou bloquer son auteur agissent sur un fil qu'on n'est pas en train
   * de lire. Ne reste ici que ce qui a un sens sur un RÉSULTAT.
   */
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

  const handleOptions = useCallback(
    (tweetId: string) => {
      const tweet = tweetsRef.current.find((t) => t.id === tweetId);
      const isOwn = !!(user?.id && tweet?.author?.id === user.id);
      const isUltra = effectiveSubscriptionTier(!!user?.premium, (user as any)?.subscription_tier) === 'ultra';
      const items: ActionSheetItem[] = [
        { label: 'Partager', icon: 'share-outline', onPress: () => handleShare(tweetId) },
        ...(isOwn
          ? []
          : [
              {
                label: 'Signaler',
                icon: 'flag-outline' as const,
                onPress: () => handleReport(tweetId),
              },
              ...(isUltra
                ? [{
                  label: 'Striker (bloquer la diffusion)',
                  icon: 'flag' as const,
                  hint: 'Ultra — immédiat, sans revue, contestable par l\'auteur',
                  onPress: () => handleStrikeTweet(tweetId),
                  destructive: true,
                }]
                : []),
            ]),
      ];
      showActionSheet({ items });
    },
    [user?.id, user?.premium, handleShare, handleReport, handleStrikeTweet],
  );

  /** Contexte transmis aux lignes — stable, sinon toutes se re-rendent. */
  const rowContext = useMemo(() => ({ tab: 'search', algorithm: 'search' }), []);

  const handleRowAction = useCallback(
    (action: TweetRowAction) => {
      const { type, tweetId, payload } = action;
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
        case 'share':
          handleShare(tweetId);
          break;
        case 'options':
          handleOptions(tweetId);
          break;
        case 'report':
          handleReport(tweetId);
          break;
        case 'reply':
          (navigation as any).navigate('TweetDetail', { tweetId, focusReply: true });
          break;
        case 'openQuote':
        case 'open':
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
          (navigation as any).navigate('UserProfile', {
            userId: author.id,
            username: author.username,
          });
          break;
        }
        // `videoDuration` : pure télémétrie du lecteur. Le fil s'en sert pour
        // mesurer le temps de lecture ; ici rien ne l'exploite.
        default:
          break;
      }
    },
    [
      handleLike,
      handleSuperLike,
      handleRetweet,
      handleShare,
      handleOptions,
      handleReport,
      navigation,
    ],
  );

  // ─── La liste ─────────────────────────────────────────────────────────────

  const hasQuery = !!searchQuery.trim();

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];

    if (hasQuery) {
      const users = searchResults.users || [];
      const tweets = searchResults.tweets || [];

      if (users.length > 0) {
        out.push({ key: 'head:users', kind: 'head', label: `COMPTES · ${users.length}` });
        users.forEach((u, i) =>
          out.push({
            key: `user:${u.id || i}`,
            kind: 'person',
            user: u,
            meta: `${formatCompactCount(u.stats?.followers || 0)} ABONNÉS · ${formatCompactCount(
              u.stats?.following || 0,
            )} ABONNEMENTS`,
          }),
        );
      }

      if (tweets.length > 0) {
        out.push({ key: 'head:tweets', kind: 'head', label: `PUBLICATIONS · ${tweets.length}` });
        tweets.forEach((t, i) =>
          out.push({ key: `tweet:${t.id || i}`, kind: 'tweet', tweet: t, index: i }),
        );
      }

      return out;
    }

    if (trendingHashtags.length > 0) {
      out.push({ key: 'head:trends', kind: 'head', label: 'TENDANCES · TWEETS SUR 24 H' });
      trendingHashtags.forEach((h, i) =>
        out.push({ key: `trend:${h.tag}:${i}`, kind: 'trend', tag: h.tag, count: h.count }),
      );
    }

    if (suggestions.length > 0) {
      out.push({ key: 'head:suggestions', kind: 'head', label: 'À SUIVRE' });
      suggestions.forEach((s, i) =>
        out.push({
          key: `suggestion:${s.id || i}`,
          kind: 'person',
          user: s,
          // La RAISON plutôt que le nombre d'abonnés : sur une suggestion, ce
          // qu'on veut savoir c'est pourquoi elle est là.
          meta: (
            s.suggestion_reasons?.[0] || `${formatCompactCount(s.followers_count || 0)} abonnés`
          ).toUpperCase(),
        }),
      );
    }

    return out;
  }, [hasQuery, searchResults, trendingHashtags, suggestions]);

  const renderRow = useCallback(
    ({ item }: { item: Row }) => {
      switch (item.kind) {
        case 'head':
          return <SectionHead label={item.label} />;
        case 'person':
          return (
            <PersonRow
              user={item.user}
              meta={item.meta}
              following={!!followingUsers[item.user.id]}
              busy={!!followLoading[item.user.id]}
              onOpen={handleUserPress}
              onFollow={handleFollowToggle}
            />
          );
        case 'trend':
          return <TrendRow tag={item.tag} count={item.count} onPress={handleHashtagPress} />;
        case 'tweet':
          return (
            <TweetRowGutter
              tweet={item.tweet}
              index={item.index}
              // Des résultats ne sont pas un fil de discussion : deux
              // publications qui se suivent n'ont aucun lien, aucun rail ne
              // doit donc les rattacher.
              isThreadParent={false}
              isThreadChild={false}
              onAction={handleRowAction}
              contextData={rowContext}
            />
          );
        default:
          return null;
      }
    },
    [
      followingUsers,
      followLoading,
      handleUserPress,
      handleFollowToggle,
      handleHashtagPress,
      handleRowAction,
      rowContext,
    ],
  );

  /* Le decor de l'etat vide : le bloc n'apparait qu'une fois la pluie prete. */
  const { pret: pluiePrete, onSettled: onDecorPluie } = useSceneReveal();

  const listHeader = useMemo(() => {
    if (!hasQuery) return null;
    if (!displayedAiSummary && !aiSummaryLoading) return null;
    return (
      <SummaryBand
        text={displayedAiSummary}
        streaming={aiSummaryLoading}
        status={aiSummaryStatus}
        mentioned={aiMentionedUsers}
        onOpenUser={handleUserPress}
      />
    );
  }, [
    hasQuery,
    displayedAiSummary,
    aiSummaryLoading,
    aiSummaryStatus,
    aiMentionedUsers,
    handleUserPress,
  ]);

  const listEmpty = useMemo(() => {
    // Sans requête, une liste vide veut dire « le sommaire n'est pas encore
    // arrivé » — surtout pas « aucun résultat », qui répondrait à une question
    // que personne n'a posée. Et une fois qu'il est arrivé vide, on le dit en
    // une ligne plutôt que de faire tourner un squelette pour toujours.
    if (!hasQuery) {
      if (!openingLoaded) return <RowsSkeleton />;
      return (
        <View style={S.quietWrap}>
          <Text style={S.quietText}>
            Rien ne ressort en ce moment. Écris un mot au-dessus.
          </Text>
        </View>
      );
    }

    return (
      <View style={S.emptyWrap}>
        {/* La scene ne porte NI cadre NI voile : transparente, elle se fond
            dans l'ecran au lieu d'y poser une vignette. Le bloc entier attend
            le decor, sans quoi le texte s'affiche d'abord et la pluie arrive
            par-dessus une demi-seconde plus tard. */}
        <View style={S.emptyScene}>
          <SceneCanvas scene="02-pluie" onSettled={onDecorPluie} />
        </View>

        {!pluiePrete && (
          <View style={S.emptyWaiting} pointerEvents="none">
            <Skeleton width="52%" height={ps(20)} rounded={ps(4)} />
            <Skeleton width="72%" height={ps(14)} rounded={ps(4)} style={S.emptyWaitingLine} />
          </View>
        )}

        <SceneReveal visible={pluiePrete} style={S.emptyTexts}>
          <Text style={S.emptyTitle}>Rien sous ce mot</Text>
          <Text style={S.emptyText} numberOfLines={2}>
            « {searchQuery.trim()} » ne donne aucun compte ni aucune publication. Essaie plus court.
          </Text>
        </SceneReveal>
      </View>
    );
  }, [hasQuery, openingLoaded, pluiePrete, onDecorPluie, searchQuery]);

  return (
    <View style={S.root}>
      {/* `SafeAreaView` vient de `react-native-safe-area-context`, PAS du cœur
          de React Native : celle du cœur ne pose aucun inset sur Android. Le
          bas est déjà géré par la barre d'onglets, en position absolue. */}
      <SafeAreaView style={S.safe} edges={['top']}>
        <AppStatusBar
          barStyle={isPaperDark ? 'light-content' : 'dark-content'}
          backgroundColor={paper.bg}
        />

        <EventStrip />
        <BanAlertBanner />

        <ReportSheet
          visible={!!reportTarget}
          onClose={() => setReportTarget(null)}
          targetId={reportTarget?.id || ''}
          targetType="tweet"
          targetLabel={reportTarget?.label}
        />

        {/* ── La manchette : le champ, puis les rubriques ──
            Deux filets, comme la manchette d'un journal : le premier ferme la
            ligne d'écriture, le second ferme le sommaire. Ils délimitent deux
            bandes de nature différente — ce n'est pas la même règle répétée. */}
        <View style={S.masthead}>
          <SearchField seed={searchQuery} onSubmit={handleSubmitQuery} />
          {/* Les rubriques n'existent que s'il y a quelque chose à filtrer. */}
          {hasQuery && <RubricBar active={activeFilter} onChange={handleFilterChange} />}
        </View>

        {loading ? (
          <RowsSkeleton />
        ) : (
          <FlatList
            data={rows}
            {...LIST_TUNING}
            keyExtractor={(item) => item.key}
            renderItem={renderRow}
            ListHeaderComponent={listHeader}
            ListEmptyComponent={listEmpty}
            contentContainerStyle={[S.listContent, { paddingBottom: tabBarHeight + ps(24) }]}
            showsVerticalScrollIndicator={false}
            // Le clavier est ouvert quand les résultats arrivent : sans ça, le
            // premier appui sur un résultat ne servirait qu'à le refermer.
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const S = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: paper.bg,
  },
  safe: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  // ── Manchette ──
  masthead: {
    backgroundColor: paper.bg,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ps(12),
    paddingHorizontal: ROW_PAD_X,
    paddingTop: ps(10),
    paddingBottom: ps(12),
    borderBottomWidth: 1,
    borderBottomColor: paper.hairline,
  },
  // Le corps du champ EST le titre de la page : Archivo, comme le mot-marque
  // du fil. `minHeight` garantit la cible de 44 pt même quand il est vide.
  fieldInput: {
    flex: 1,
    minHeight: ps(38),
    paddingVertical: 0,
    fontFamily: paperFonts.strong,
    // Le plus gros corps de la page, sans discussion possible : rien d'autre
    // ne doit s'en approcher, sinon la manchette cesse d'être une manchette.
    fontSize: ps(25),
    letterSpacing: ps(-0.5),
    color: paper.ink,
  },
  fieldClear: {
    width: ps(24),
    height: ps(24),
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Rubriques ──
  // Alignées à gauche et soufflées, pas réparties sur toute la largeur :
  // quatre onglets étirés font une barre de segments, pas un sommaire.
  rubricBar: {
    flexDirection: 'row',
    gap: ps(18),
    paddingHorizontal: ROW_PAD_X,
    paddingTop: ps(12),
    borderBottomWidth: 1,
    borderBottomColor: paper.hairline,
  },
  rubricItem: {
    alignItems: 'center',
    paddingBottom: ps(10),
  },
  // Fond transparent : seule la bordure basse se voit, exactement sur le bord
  // inférieur de l'onglet — un soulignement, pas une pastille pleine.
  rubricIndicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: 'transparent',
    borderBottomWidth: 2,
    borderBottomColor: paper.ink,
  },
  rubricLabel: {
    fontFamily: paperFonts.display,
    fontSize: ps(15),
    letterSpacing: ps(-0.3),
    color: paper.inkIdle,
  },
  // Repli si la mesure `onLayout` ne se déclenche pas : l'onglet actif reste
  // reconnaissable à l'encre de son libellé, sans dépendre d'aucune animation.
  rubricLabelActive: {
    color: paper.ink,
  },

  // ── Liste ──
  listContent: {
    paddingTop: ps(4),
  },

  /** LA colonne de gauche, partagée par les trois natures de ligne. */
  gutter: {
    width: GUTTER_W,
    alignItems: 'center',
  },

  // La capitale espacée en chasse fixe est la voix des méta de 2B — la même
  // que « SPONSORISÉ » sur une ligne du fil.
  eyebrow: {
    fontFamily: paperFonts.mono,
    fontSize: ps(10),
    letterSpacing: ps(1.5),
    color: paper.inkMeta,
  },
  head: {
    paddingHorizontal: ROW_PAD_X,
    paddingTop: ps(26),
    paddingBottom: ps(12),
  },

  // ── Résumé ──
  summary: {
    backgroundColor: paper.bgBand,
    paddingHorizontal: ROW_PAD_X,
    paddingTop: ps(14),
    paddingBottom: ps(16),
  },
  // Medium et non Book : sur le fond papier, le Book paraît délavé — même
  // constat que sur le corps d'un tweet.
  summaryText: {
    fontFamily: paperFonts.bodyStrong,
    fontSize: ps(17),
    lineHeight: ps(25),
    color: paper.ink,
    marginTop: ps(9),
  },
  summaryCaret: {
    color: paper.accent,
  },
  summaryStatus: {
    fontFamily: paperFonts.mono,
    fontSize: ps(13),
    lineHeight: ps(18),
    color: paper.inkMeta,
    marginTop: ps(6),
  },
  summaryRefs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ps(14),
    marginTop: ps(12),
  },
  summaryRef: {
    fontFamily: paperFonts.mono,
    fontSize: ps(13),
    color: paper.ink,
  },

  // ── Ligne « compte » ──
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ROW_GAP,
    paddingHorizontal: ROW_PAD_X,
    paddingVertical: ps(11),
  },
  personContent: {
    flex: 1,
    minWidth: 0,
  },
  personNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ps(6),
  },
  // Semi-bold, comme les noms d'auteur du fil : le Bold les rendrait aussi
  // lourds qu'un titre, alors qu'ils ne font qu'annoncer un profil.
  personName: {
    fontFamily: paperFonts.strong,
    fontSize: ps(17),
    letterSpacing: ps(-0.34),
    color: paper.ink,
    flexShrink: 1,
  },
  verifiedWrap: {
    marginLeft: ps(-2),
  },
  personHandle: {
    fontFamily: paperFonts.mono,
    fontSize: ps(13),
    color: paper.inkSoft,
    marginTop: ps(3),
  },
  // Capitale espacée : c'est ce qui autorise ce corps-là. La même phrase en
  // bas de casse à `ps(11)` serait simplement trop petite pour être lue.
  personMeta: {
    fontFamily: paperFonts.mono,
    fontSize: ps(11),
    letterSpacing: ps(0.7),
    color: paper.inkMeta,
    marginTop: ps(5),
  },
  // La pilule contour de « Répondre », reprise telle quelle.
  pill: {
    minWidth: ps(76),
    alignItems: 'center',
    borderWidth: 1,
    borderColor: paper.outline,
    borderRadius: ps(9),
    paddingVertical: ps(6),
    paddingHorizontal: ps(12),
  },
  pillMuted: {
    borderColor: paper.hairline,
  },
  pillText: {
    fontFamily: paperFonts.bodyStrong,
    fontSize: ps(15),
    color: paper.ink,
  },
  pillTextMuted: {
    color: paper.inkSoft,
  },

  // ── Ligne « tendance » ──
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ROW_GAP,
    paddingHorizontal: ROW_PAD_X,
    paddingVertical: ps(12),
  },
  // `tabular-nums` : dix compteurs empilés dans une colonne de 52 px forment
  // une COLONNE — en chiffres à chasse proportionnelle, un « 1 » plus étroit
  // qu'un « 8 » les fait tanguer d'une ligne à l'autre.
  trendCount: {
    fontFamily: paperFonts.display,
    fontSize: ps(17),
    lineHeight: ps(21),
    letterSpacing: ps(-0.51),
    color: paper.ink,
    fontVariant: ['tabular-nums'],
  },
  trendTag: {
    flex: 1,
    fontFamily: paperFonts.strong,
    fontSize: ps(19),
    letterSpacing: ps(-0.38),
    color: paper.ink,
  },

  // ── Attente ──
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ROW_GAP,
    paddingHorizontal: ROW_PAD_X,
    paddingVertical: ps(14),
  },
  skeletonContent: {
    flex: 1,
  },
  skeletonLine: {
    marginTop: ps(9),
  },

  // ── Sommaire vide : une phrase, pas un décor ──
  // La pluie est réservée à l'échec d'une RECHERCHE, où l'on a demandé
  // quelque chose et où il n'y a rien. Un fil de tendances vide, lui, ne dit
  // rien sur ce qu'on cherchait — il ne mérite pas une scène.
  quietWrap: {
    paddingHorizontal: ROW_PAD_X,
    paddingTop: ps(40),
  },
  quietText: {
    fontFamily: paperFonts.body,
    fontSize: ps(15),
    lineHeight: ps(22),
    color: paper.inkSoft,
  },

  // ── Rien trouvé ──
  emptyWrap: {
    paddingTop: ps(8),
    paddingBottom: ps(28),
    alignItems: 'center',
  },
  /**
   * `SceneCanvas` se pose en absolu : sans hauteur explicite ici, il n'aurait
   * rien à remplir et la scène serait invisible.
   */
  emptyScene: {
    width: '100%',
    height: ps(300),
  },
  emptyTexts: {
    alignItems: 'center',
    alignSelf: 'stretch',
    paddingHorizontal: ps(32),
  },
  emptyWaiting: {
    alignItems: 'center',
    paddingTop: ps(16),
  },
  emptyWaitingLine: {
    marginTop: ps(10),
  },
  emptyTitle: {
    fontFamily: paperFonts.display,
    fontSize: ps(22),
    letterSpacing: ps(-0.7),
    color: paper.ink,
    marginTop: ps(14),
    textAlign: 'center',
  },
  emptyText: {
    fontFamily: paperFonts.body,
    fontSize: ps(15),
    lineHeight: ps(22),
    color: paper.inkSoft,
    textAlign: 'center',
    marginTop: ps(8),
    maxWidth: ps(320),
  },
});
