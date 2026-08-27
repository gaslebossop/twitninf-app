/**
 * 🧪 Barre de navigation du test « 2B — Gouttière », sous `fil.refonte2b`.
 *
 * CLONE de `BottomTabNavigator.tsx`. L'original est intact et sert les 99 %
 * restants ; `MainNavigator` choisit entre les deux sur le drapeau.
 *
 * ── Elle est de la couleur de la PAGE, pas un bloc d'encre ──────────────
 * Première version : un bandeau encre pleine largeur. En thème clair, ça
 * plaquait une dalle noire sous un fil papier — un objet étranger, qui ne
 * s'adaptait à aucun des deux thèmes puisque sa couleur ne venait pas d'eux.
 * La barre prend donc `paper.bg`, ses icônes prennent l'encre du texte, et sa
 * séparation est le `hairline` du thème. Tout suit alors clair et sombre sans
 * une seule valeur en dur, et il n'y a plus de contour clair à regarder.
 *
 * ── La forme : une barre pleine largeur, pas une pilule flottante ────────
 * Une pilule étroite tient tant qu'elle porte quatre entrées. Ici la barre est
 * CONFIGURABLE — jusqu'à cinq onglets optionnels s'ajoutent aux fixes — et à
 * sept ou huit entrées une pilule oblige à écraser les cibles ou à les
 * répartir avec des trous. Une barre pleine largeur donne à chaque entrée une
 * colonne de largeur égale quel qu'en soit le nombre, ce qui est aussi ce que
 * spécifie Material 3.
 *
 * ── Ce qui la distingue d'une barre d'icônes ordinaire ───────────────────
 *   - **une pastille qui GLISSE** derrière l'icône active, animée sur le
 *     thread UI. C'est elle qui relie visuellement l'onglet quitté à l'onglet
 *     rejoint — sans elle, l'état actif « saute » et la barre paraît figée ;
 *   - **contour au repos, plein à l'état actif** : la forme change, pas
 *     seulement la couleur, donc l'information ne repose pas sur la vue des
 *     couleurs seule. Le glyphe est choisi EN CLAIR depuis `focused`, sans
 *     animation — voir la note sur le fondu croisé dans `TabItem` ;
 *   - **l'icône active se soulève et grossit** d'un ressort amorti, et
 *     s'enfonce sous le doigt. Les deux vivent sur le thread UI : toucher un
 *     onglet ne provoque aucun rendu React ;
 *   - **une seule rangée, toutes les colonnes égales**, « Publier » compris.
 *     C'est le parti de TikTok, et il dissout un problème au lieu de
 *     l'arbitrer : avec deux groupes de part et d'autre du bouton, un nombre
 *     impair d'onglets rend mathématiquement impossible d'avoir à la fois des
 *     colonnes égales, un bouton au centre exact et aucun vide — il fallait
 *     sacrifier l'un des trois. En rangée unique, la question ne se pose plus :
 *     l'espacement est régulier d'un bord à l'autre, et c'est CELA que l'œil
 *     vérifie, pas que le bouton soit à 50,0 % ;
 *   - **pas de libellés.** Quatre entrées sur cinq sont des pictogrammes
 *     universels (maison, loupe, plus, personne) ; le texte sous chacune
 *     n'apprenait rien et volait la place qui rend les cibles confortables.
 *
 * ── Le jeu d'icônes ─────────────────────────────────────────────────────
 * Une table explicite, PAS les icônes de `OPTIONAL_TABS` (qui servent l'écran
 * de personnalisation). Deux raisons : il y faut la paire contour/plein pour
 * le fondu, et il faut une masse optique homogène — les variantes `-circle`
 * (`person-circle`, `play-circle`) pèsent visiblement plus lourd que les
 * autres et déséquilibraient la rangée.
 *
 * ── Ce qu'elle garde de l'original ──────────────────────────────────────
 * Les MÊMES onglets optionnels, lus dans les MÊMES préférences
 * (`NavbarPrefsContext` / `navbarPreferences.ts`), drapeau de la Carte NF
 * compris. Ce que l'utilisateur a choisi dans « Personnaliser la navbar »
 * s'applique ici sans qu'il ait à le refaire : rien n'est codé en dur.
 *
 * ── Ce qu'elle change ───────────────────────────────────────────────────
 *   - **Notifications** quitte la barre : la cloche est remontée dans
 *     l'en-tête du fil (`FeedGutterScreen`), pastille comprise ;
 *   - **Messages entre dans le socle**, à la place laissée par Notifications.
 *     C'est aussi ce qui met le bouton PILE au centre : le socle passe à quatre
 *     entrées, plus deux raccourcis, soit six onglets — donc sept colonnes,
 *     un nombre impair, donc une colonne du milieu. Avec trois entrées de socle
 *     le compte était pair et le bouton penchait d'une demi-colonne ;
 *   - **Publier** prend sa place, au centre et en accent. C'était un bouton
 *     flottant qui masquait en permanence un coin du fil.
 *
 * ── Pourquoi une barre entièrement maison ───────────────────────────────
 * Elle porte un bouton qui n'est PAS un onglet (« Publier » pousse un écran de
 * la pile) et une pastille animée qui n'existe pas dans la barre standard. Un
 * `tabBar` rendu à la main est la seule façon d'avoir les deux.
 *
 * `@expo/ui` (SwiftUI / Jetpack Compose natifs) a été écarté : sa couche
 * universelle demande le SDK 56, ce projet est en 54 — et même en 55 elle
 * imposerait un build natif personnalisé là où tout ici tourne dans Expo Go.
 *
 * ── La hauteur est MESURÉE, pas devinée ─────────────────────────────────
 * Un `tabBar` personnalisé ne renseigne pas tout seul la hauteur que lisent
 * les écrans (`useBottomTabBarHeight`) : sans rien, React Navigation garde son
 * estimation par défaut (~83 pt) et une barre plus haute recouvrirait le bas
 * de la Recherche et du Profil. On rend donc la vraie hauteur via
 * `BottomTabBarHeightCallbackContext` — ce que la barre standard fait par
 * `onLayout`. C'est ce qui permet à celle-ci de grandir sans casser un écran.
 */

import React from 'react';
import {
  createBottomTabNavigator,
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { View, Text, StyleSheet, Pressable, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  interpolate,
  Easing,
} from 'react-native-reanimated';

import { useAuth } from '../contexts/AuthContext';
import { useNavbarPrefs } from '../contexts/NavbarPrefsContext';
import { useFlag } from '../contexts/FeatureFlagContext';
import { FLAGS } from '../config/featureFlagKeys';
import { useForegroundInterval } from '../hooks/useForegroundInterval';
import unreadService from '../services/unreadService';
import { liveService } from '../services/liveService';
import { OPTIONAL_TABS, normalizeFor2B, type OptionalTabKey } from '../services/navbarPreferences';
import { paper, paperFonts, ps } from '../theme/paper2b';
import feedback from '../utils/feedback';

import FeedGutterScreen from '../screens/FeedGutterScreen';
import SearchScreen from '../screens/SearchScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import MessagesScreen2B from '../screens/MessagesScreen2B';
import CasinoScreen from '../screens/CasinoScreen';
import CommunityReviewScreen from '../screens/CommunityReviewScreen';
import TradingScreen from '../screens/TradingScreen';
import WalletDetailScreen from '../screens/WalletDetailScreen';
import AccountStatsScreen from '../screens/AccountStatsScreen';
import TweetMonetizationScreen from '../screens/TweetMonetizationScreen';
import NfMapScreen from '../screens/NfMapScreen';
import SwipeFollowScreen from '../screens/SwipeFollowScreen';
import LivesScreen from '../screens/LivesScreen';
import TwitNinfVideo from '../screens/twitninfvideo';

const Tab = createBottomTabNavigator();

// ─── Gabarit ────────────────────────────────────────────────────────────────
/**
 * Hauteur de la barre hors zone sûre. Material 3 pose 80 dp, 2B resserre à 61.
 *
 * Ce n'est pas un nombre choisi à l'œil : c'est exactement le rembourrage haut
 * plus la pastille, l'interligne du libellé et son filet de garde. Le contenu
 * est donc calé EN HAUT de la rangée, ce qui rend la position verticale de la
 * pastille déterministe — elle est absolue, elle ne peut pas suivre un
 * centrage qui dépendrait de la hauteur du texte.
 */
const BAR_PAD_TOP = ps(10);
/** Marge basse minimale sur un appareil sans encoche à compenser. */
const BAR_PAD_BOTTOM_MIN = ps(10);
/**
 * Icône et pastille : des MAXIMA, atteints quand la barre est peu chargée.
 *
 * La barre étant configurable, elle peut porter neuf colonnes sur un écran de
 * 402 pt — soit 40 pt chacune. Des tailles fixes y débordent : une pastille de
 * 62 pt dans une colonne de 40 recouvre ses deux voisines et sort de l'écran
 * sur la première. Tout est donc dérivé de la largeur réelle d'une colonne
 * (voir `metricsFor`), exactement comme la barre d'origine resserre ses icônes
 * au-delà de six onglets.
 */
const ICON_MAX = ps(26);
const ICON_DENSE = ps(21);
const PILL_W_MAX = ps(62);
const PILL_H_MAX = ps(40);
/** En dessous de cette largeur de colonne, on passe au gabarit resserré. */
const DENSE_UNDER = ps(50);
const BAR_H = BAR_PAD_TOP + PILL_H_MAX + ps(10);
/** Bouton « Publier » — un cran plus haut que la pastille, pour se distinguer. */
const PUBLISH_W = ps(56);
const PUBLISH_H = ps(42);
/** Marge minimale entre le bouton et les icônes voisines, sur une barre dense. */
const PUBLISH_GUTTER = ps(6);

/**
 * Gabarit d'une barre de `slotWidth` pixels par colonne.
 *
 * `pillHeight` ne dépasse jamais `pillWidth` : au-delà, la « pastille »
 * deviendrait un ovale plus haut que large, qui se lit comme un défaut.
 */
function metricsFor(slotWidth: number) {
  const dense = slotWidth > 0 && slotWidth < DENSE_UNDER;
  const pillWidth = slotWidth > 0 ? Math.min(PILL_W_MAX, Math.max(slotWidth - ps(6), ps(28))) : PILL_W_MAX;
  const pillHeight = Math.min(PILL_H_MAX, pillWidth);
  return { icon: dense ? ICON_DENSE : ICON_MAX, pillWidth, pillHeight };
}

/**
 * Onglet « En direct ».
 *
 * Il n'est PAS optionnel : il apparaît seul quand un direct est en cours et
 * disparaît ensuite, exactement comme dans la barre d'origine. Il faut le
 * garder — `LivesScreen` n'a aucune route dans `MainNavigator`, cet onglet est
 * le SEUL chemin vers la liste des directs.
 */
const LIVE_ROUTE = 'Live';

/** Clé de mesure du bouton « Publier » — il n'a pas de `route.key` (pas un onglet). */
const PUBLISH_KEY = '__publish__';

/**
 * Onglets optionnels : clé de préférence → route et écran.
 *
 * Les noms de route sont ceux de l'original, délibérément — un écran ouvert
 * par `navigate('Casino')` depuis les Réglages doit tomber au même endroit
 * dans les deux barres.
 */
const OPTIONAL_SCREENS: Record<OptionalTabKey, { route: string; component: React.ComponentType<any> }> = {
  video: { route: 'Video', component: TwitNinfVideo },
  messages: { route: 'Messages', component: MessagesScreen2B },
  casino: { route: 'Casino', component: CasinoScreen },
  revue: { route: 'Revue', component: CommunityReviewScreen },
  trading: { route: 'Trading', component: TradingScreen },
  wallet: { route: 'WalletDetail', component: WalletDetailScreen },
  analytics: { route: 'AccountStats', component: AccountStatsScreen },
  monetization: { route: 'TweetMonetization', component: TweetMonetizationScreen },
  // Nom distinct du `NfMap` de `MainNavigator` : deux routes du même nom dans
  // deux navigateurs imbriqués rendent `navigate('NfMap')` ambigu, et c'est la
  // pile qui l'emporterait — l'écran s'ouvrirait PAR-DESSUS la barre.
  nfmap: { route: 'NfMapTab', component: NfMapScreen },
  swipe: { route: 'SwipeFollow', component: SwipeFollowScreen },
};

/**
 * Icône (contour) et libellé de chaque route.
 *
 * Chaque entrée DOIT avoir sa paire pleine dans Ionicons (`x-outline` → `x`),
 * le fondu croisé en dépend. Les variantes `-circle` sont évitées : leur
 * disque plein pèse plus lourd que les autres tracés et casse l'homogénéité
 * de la rangée.
 */
const ICON_META: Record<string, { off: keyof typeof Ionicons.glyphMap; label: string }> = {
  Accueil: { off: 'home-outline', label: 'Accueil' },
  Recherche: { off: 'search-outline', label: 'Recherche' },
  Profil: { off: 'person-outline', label: 'Profil' },
  Live: { off: 'radio-outline', label: 'En direct' },
  NotificationsTab: { off: 'notifications-outline', label: 'Notifications' },
  Video: { off: 'videocam-outline', label: 'Vidéos' },
  Messages: { off: 'chatbubble-outline', label: 'Messages' },
  Casino: { off: 'dice-outline', label: 'Casino' },
  Revue: { off: 'hammer-outline', label: 'Revue' },
  Trading: { off: 'stats-chart-outline', label: 'Trading' },
  WalletDetail: { off: 'wallet-outline', label: 'Portefeuille' },
  AccountStats: { off: 'bar-chart-outline', label: 'Analytiques' },
  TweetMonetization: { off: 'cash-outline', label: 'Monétisation' },
  NfMapTab: { off: 'map-outline', label: 'Carte NF' },
  SwipeFollow: { off: 'layers-outline', label: 'Swipe' },
};

/** `home-outline` → `home`. */
const solidOf = (name: string) => name.replace(/-outline$/, '') as keyof typeof Ionicons.glyphMap;

function metaFor(routeName: string): { off: keyof typeof Ionicons.glyphMap; label: string } {
  if (ICON_META[routeName]) return ICON_META[routeName];
  // Repli : une route ajoutée aux préférences sans être déclarée ci-dessus
  // garde au moins l'icône de l'écran de personnalisation.
  const optional = OPTIONAL_TABS.find((t) => OPTIONAL_SCREENS[t.key]?.route === routeName);
  if (optional) return { off: optional.icon as keyof typeof Ionicons.glyphMap, label: optional.label };
  return { off: 'ellipse-outline', label: routeName };
}

// ─── Une entrée ─────────────────────────────────────────────────────────────

interface TabItemProps {
  routeName: string;
  focused: boolean;
  badge: number;
  /** Taille du glyphe, décidée par la barre selon la place disponible. */
  iconSize: number;
  onPress: () => void;
  /** Remonte la géométrie réelle de la colonne à la barre (voir `onTabLayout`). */
  onLayout: (e: LayoutChangeEvent) => void;
}

function TabItem({ routeName, focused, badge, iconSize, onPress, onLayout }: TabItemProps) {
  const { off, label } = metaFor(routeName);

  /** 0 = au repos, 1 = actif. Ressort AMORTI, jamais oscillant. */
  const active = useSharedValue(focused ? 1 : 0);
  /** 0 = relâché, 1 = doigt posé. */
  const pressed = useSharedValue(0);

  React.useEffect(() => {
    active.value = withSpring(focused ? 1 : 0, { damping: 18, stiffness: 220, mass: 0.6 });
  }, [focused, active]);

  // Un seul style porte les deux mouvements : l'élan de sélection et
  // l'enfoncement se composent au lieu de se battre pour le `transform`.
  const boxStyle = useAnimatedStyle(() => ({
    // `as const` : sans lui, TypeScript infère une union de formes de transform
    // au lieu du tuple attendu (même astuce que dans `TweetsScreen`).
    transform: [
      { scale: interpolate(active.value, [0, 1], [1, 1.1]) - pressed.value * 0.12 },
      { translateY: interpolate(active.value, [0, 1], [0, -1.5]) },
    ] as const,
  }));

  /**
   * ⚠️ Le glyphe est choisi EN CLAIR, pas par une animation.
   *
   * La version précédente superposait les deux tracés et échangeait leurs
   * opacités via `createAnimatedComponent(Ionicons)`. Résultat observé : les
   * icônes restaient figées sur l'état du DÉMARRAGE — la maison restait
   * allumée alors qu'on était sur la Recherche — pendant que la pastille, elle,
   * se déplaçait correctement. Reanimated applique bien la valeur initiale au
   * montage d'un composant qu'il n'atteint pas, mais plus aucune mise à jour
   * ensuite : l'icône mentait sur l'écran affiché.
   *
   * Un onglet doit dire vrai avant d'être joli. Le fondu croisé est donc
   * abandonné ; l'animation ne porte plus que sur l'échelle, appliquée à une
   * `Animated.View` ordinaire, qui elle est bien pilotée.
   */

  return (
    <Pressable
      style={S.slot}
      onLayout={onLayout}
      onPress={onPress}
      onPressIn={() => {
        pressed.value = withTiming(1, { duration: 90, easing: Easing.out(Easing.quad) });
      }}
      onPressOut={() => {
        pressed.value = withSpring(0, { damping: 20, stiffness: 300, mass: 0.5 });
      }}
      accessibilityRole="button"
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={badge > 0 ? `${label}, ${badge} non lu${badge > 1 ? 's' : ''}` : label}
    >
      <Animated.View style={[S.iconBox, boxStyle]}>
        {/* Ancre à la taille EXACTE du glyphe : la case au-dessus prend toute
            la largeur de la colonne (pour la zone tapable), un badge calé sur
            son coin flotterait donc loin de l'icône. */}
        <View style={{ width: iconSize, height: iconSize }}>
          <Ionicons
            name={focused ? solidOf(off) : off}
            size={iconSize}
            color={focused ? paper.ink : paper.inkIdle}
            style={S.iconLayer}
          />
          {badge > 0 && (
            <View style={S.badge}>
              <Text style={S.badgeText} numberOfLines={1}>
                {badge > 99 ? '99+' : String(badge)}
              </Text>
            </View>
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── La barre ───────────────────────────────────────────────────────────────

function PaperTabBar({
  state,
  navigation,
  insets,
  liveCount,
  canPublish,
}: BottomTabBarProps & { liveCount: number; canPublish: boolean }) {
  const reportHeight = React.useContext(BottomTabBarHeightCallbackContext);
  const routes = state.routes;

  // Badge de l'onglet Messages — seul compteur restant dans la barre, les
  // notifications ayant leur pastille dans l'en-tête du fil.
  const { user } = useAuth();
  const currentUserId = user?.id ? String(user.id) : null;
  const [messageCount, setMessageCount] = React.useState(0);
  const refreshCount = React.useCallback(async () => {
    // Identifiant passé plutôt que redemandé au serveur, et sondage à trois
    // minutes : mêmes raisons que dans `BottomTabNavigator`.
    //
    // `currentUserId` vient d'`AuthContext`, qui démarre à `null` et se peuple
    // de façon async. Sans cette garde, l'appel IMMÉDIAT que déclenche
    // `useForegroundInterval` au montage partait avec `meId=null` : dans
    // `getMessagesUnreadCount`, ça rend `lastMessageFromMe` faux pour TOUTE
    // conversation, donc une conversation où le DERNIER message est le vôtre
    // (en attente de réponse) était comptée à tort comme non lue — pastille
    // fantôme jusqu'au prochain tick (3 min).
    if (!currentUserId) return;
    setMessageCount(await unreadService.getMessagesUnreadCount(currentUserId));
  }, [currentUserId]);
  useForegroundInterval(refreshCount, 180000);
  React.useEffect(() => unreadService.subscribe(refreshCount), [refreshCount]);
  // Dès que l'identifiant devient disponible (auth résolue après le premier
  // rendu), on recalcule tout de suite plutôt que d'attendre le tick suivant.
  React.useEffect(() => {
    if (currentUserId) refreshCount();
  }, [currentUserId, refreshCount]);

  /**
   * Place du bouton dans la rangée.
   *
   * Il occupe une colonne comme n'importe quel onglet, au milieu de la liste.
   * `ceil` plutôt que `floor` pour qu'à nombre pair de colonnes le côté chargé
   * soit celui de gauche, où vivent les entrées principales.
   */
  const publishAt = canPublish ? Math.ceil(routes.length / 2) : -1;

  /**
   * Géométrie MESURÉE, pas calculée.
   *
   * La version précédente déduisait la position de la pastille d'une formule
   * (largeur de barre, nombre de colonnes, largeur supposée du bouton). Ça
   * tient tant que la réalité colle à l'hypothèse, et ça lâchait dès qu'un
   * onglet était ajouté ou retiré depuis la personnalisation : la pastille se
   * posait sur une colonne, l'onglet actif était sur une autre, et rien dans le
   * code ne pouvait s'en apercevoir.
   *
   * Chaque colonne rend donc sa vraie boîte. La pastille lit ces mesures : elle
   * ne PEUT plus être en désaccord avec ce qui est affiché.
   *
   * ⚠️ Indexé par la CLÉ STABLE de l'onglet (`route.key`), pas par son numéro
   * de colonne. Une position numérique change de sens dès que la barre se
   * reconfigure (onglet optionnel qui arrive après le chargement des
   * préférences, « En direct » qui apparaît, un compte qui devient restreint
   * en cours de session…) OU simplement en revenant d'un écran empilé par-
   * dessus le navigateur d'onglets : la colonne 0 d'hier n'est pas forcément
   * la colonne 0 d'aujourd'hui. Avec un numéro de colonne comme clé, une
   * ancienne mesure pouvait se faire réattribuer au mauvais onglet sans que
   * rien ne s'en aperçoive — la pastille se figeait alors sur un onglet
   * périmé, parfois indéfiniment. Une clé stable rend ça structurellement
   * impossible : une mesure ne peut jamais être lue pour un autre onglet que
   * celui qui l'a produite.
   */
  const [rects, setRects] = React.useState<Record<string, { x: number; w: number }>>({});

  const onTabLayout = React.useCallback((key: string, e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    setRects((prev) => {
      const cur = prev[key];
      // Sans cette garde, chaque `onLayout` déclenche un rendu qui redéclenche
      // un `onLayout` : la barre ne se stabilise jamais.
      if (cur && Math.abs(cur.x - x) < 0.5 && Math.abs(cur.w - width) < 0.5) return prev;
      return { ...prev, [key]: { x, w: width } };
    });
  }, []);

  // Une route qui disparaît (onglet « En direct » retiré, préférence changée)
  // laissait sa mesure derrière elle. Sans impact immédiat — la lecture se fait
  // par clé — mais l'objet ne faisait que croître, et un id de route réutilisé
  // plus tard par React Navigation pouvait ressusciter une géométrie périmée.
  React.useEffect(() => {
    const live = new Set([...routes.map((r) => r.key), PUBLISH_KEY]);
    setRects((prev) => {
      const stale = Object.keys(prev).filter((key) => !live.has(key));
      if (stale.length === 0) return prev;
      const next = { ...prev };
      stale.forEach((key) => delete next[key]);
      return next;
    });
  }, [routes]);

  /** Toutes les colonnes ont la même largeur : celle de la première suffit,
      avec repli sur n'importe laquelle déjà mesurée — au premier rendu la
      première n'a pas encore remonté son layout, et sans repli la barre
      passait un frame au gabarit maximum (flash de largeur de pastille). */
  const slotWidth = rects[routes[0]?.key ?? '']?.w
    ?? Object.values(rects)[0]?.w
    ?? 0;
  const { icon, pillWidth, pillHeight } = React.useMemo(() => metricsFor(slotWidth), [slotWidth]);
  const publishWidth = slotWidth > 0
    ? Math.min(PUBLISH_W, Math.max(slotWidth - PUBLISH_GUTTER * 2, ps(36)))
    : PUBLISH_W;

  /** Centre de l'onglet actif — lu directement par sa clé, aucune conversion. */
  const targetCenter = React.useMemo(() => {
    const activeKey = routes[state.index]?.key;
    const rect = activeKey ? rects[activeKey] : undefined;
    if (!rect) return 0;
    return rect.x + rect.w / 2;
  }, [rects, routes, state.index]);

  const centerX = useSharedValue(0);
  const settled = React.useRef(false);
  const lastActiveKey = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (targetCenter <= 0) return;
    const activeKey = routes[state.index]?.key ?? null;
    // La pastille n'a une raison de GLISSER que si l'onglet actif a vraiment
    // changé. Si sa géométrie bouge pour une autre raison (barre
    // reconfigurée en arrière-plan) sans que l'onglet actif change, un
    // glissé n'aurait aucun sens — instantané dans les deux cas.
    const tabChanged = lastActiveKey.current !== activeKey;
    lastActiveKey.current = activeKey;

    if (!settled.current || !tabChanged) {
      centerX.value = targetCenter;
      settled.current = true;
      return;
    }
    centerX.value = withTiming(targetCenter, { duration: 260, easing: Easing.out(Easing.cubic) });
  }, [targetCenter, centerX, routes, state.index]);

  const pillStyle = useAnimatedStyle(() => ({
    opacity: centerX.value > 0 ? 1 : 0,
    transform: [{ translateX: centerX.value - pillWidth / 2 }] as const,
  }));

  const onLayout = React.useCallback(
    (e: LayoutChangeEvent) => reportHeight?.(e.nativeEvent.layout.height),
    [reportHeight],
  );

  const renderTab = (route: (typeof routes)[number], index: number) => (
    <TabItem
      key={route.key}
      routeName={route.name}
      focused={state.index === index}
      badge={
        route.name === 'Messages' ? messageCount : route.name === LIVE_ROUTE ? liveCount : 0
      }
      iconSize={icon}
      onLayout={(e) => onTabLayout(route.key, e)}
      onPress={() => {
        const event = navigation.emit({
          type: 'tabPress',
          target: route.key,
          canPreventDefault: true,
        });
        if (state.index === index || event.defaultPrevented) return;
        feedback.tap();
        navigation.navigate(route.name as never);
      }}
    />
  );

  return (
    <View
      style={[S.bar, { paddingBottom: Math.max(insets.bottom, BAR_PAD_BOTTOM_MIN) }]}
      onLayout={onLayout}
    >
      <View style={S.row}>
        {/* Pastille active — SOUS les colonnes, jamais devant : elle ne doit
            intercepter aucun appui. */}
        <Animated.View
          pointerEvents="none"
          style={[
            S.pill,
            { width: pillWidth, height: pillHeight, borderRadius: pillHeight / 2 },
            pillStyle,
          ]}
        />

        {canPublish ? routes.slice(0, publishAt).map(renderTab) : routes.map(renderTab)}

        {/* « Publier » n'est pas un onglet : il POUSSE un écran de la pile.
            D'où la navigation par le parent — le `navigate` d'un navigateur
            d'onglets ne connaît que ses propres routes. Mais il occupe une
            colonne exactement comme les autres, d'où le `S.slot`. */}
        {canPublish && (
        <View style={S.slot} onLayout={(e) => onTabLayout(PUBLISH_KEY, e)}>
          <Pressable
            style={[S.publish, { width: publishWidth }]}
            onPress={() => {
              feedback.select();
              (navigation.getParent() ?? navigation).navigate('CreateTweet' as never);
            }}
            accessibilityRole="button"
            accessibilityLabel="Publier un tweet"
          >
            <Ionicons name="add" size={icon} color={paper.onAccent} />
          </Pressable>
        </View>
        )}

        {canPublish && routes.slice(publishAt).map((route, i) => renderTab(route, i + publishAt))}
      </View>
    </View>
  );
}

// ─── Le navigateur ──────────────────────────────────────────────────────────

export default function BottomTabNavigator2B() {
  const { isUserBanned, isUserSuspended } = useAuth();
  const isRestricted = isUserBanned || isUserSuspended;

  const { selected } = useNavbarPrefs();
  const nfMapEnabled = useFlag(FLAGS.NF_MAP);

  // Directs en cours — même sondage et même cadence que la barre d'origine.
  const [liveCount, setLiveCount] = React.useState(0);
  useForegroundInterval(
    React.useCallback(async () => {
      try {
        setLiveCount((await liveService.getLives()).length);
      } catch {
        // Un sondage raté ne doit pas faire disparaître l'onglet : on garde le
        // dernier compte connu jusqu'au suivant.
      }
    }, []),
    30000,
  );

  /**
   * Onglets optionnels réellement montés.
   *
   * Le choix de l'utilisateur ne suffit pas pour ceux qui vivent derrière un
   * drapeau : le palier peut redescendre alors que la préférence, elle, reste
   * écrite sur l'appareil. Sans ce second test, l'onglet survivrait à la
   * fonctionnalité et ouvrirait un écran que l'API refuse de servir.
   */
  const optional = React.useMemo(
    () =>
      selected.filter((key) => {
        if (!OPTIONAL_SCREENS[key]) return false;
        // Messages est passé dans le socle : le garder aussi comme raccourci le
        // monterait deux fois, et React Navigation refuse deux routes du même
        // nom. La préférence peut encore le contenir (elle a été écrite avant,
        // ou par l'autre barre), d'où ce filtre plutôt qu'une confiance aveugle.
        if (key === 'messages') return false;
        if (key === 'nfmap') return nfMapEnabled;
        return true;
      }),
    [selected, nfMapEnabled],
  );

  /**
   * Filet de sécurité, appliqué APRÈS le filtre et jamais avant.
   *
   * Une préférence écrite avant le test 2B peut contenir jusqu'à cinq
   * raccourcis — la barre devient illisible — ou finir à un seul, ce qui
   * décentre le bouton « Publier » (voir `FEED_2B_SLOTS`).
   *
   * ⚠️ L'ordre compte. Normaliser d'abord puis filtrer redonnerait UN seul
   * onglet dès que la coupe à deux garde `messages` ou un onglet dont le
   * drapeau est fermé : le filtre le retire ensuite, et on retombe
   * exactement dans le cas qu'on voulait éviter.
   */
  const mountedOptional = React.useMemo(() => normalizeFor2B(optional), [optional]);

  return (
    <Tab.Navigator
      id={undefined}
      tabBar={(props) => (
        // Un compte restreint ne publie pas : le bouton disparaît de la barre
        // au lieu d'ouvrir un composeur que le serveur refusera.
        <PaperTabBar {...props} liveCount={liveCount} canPublish={!isRestricted} />
      )}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: paper.bg },
        // Mêmes réglages que l'original, et pour les mêmes raisons : `lazy` et
        // `freezeOnBlur` ne tiennent que si l'animation de scène reste à
        // 'none' (voir le commentaire détaillé dans `BottomTabNavigator.tsx`).
        lazy: true,
        freezeOnBlur: true,
        animation: 'none',
        tabBarHideOnKeyboard: true,
      }}
    >
      {isRestricted ? (
        <>
          {/* Compte restreint : ni fil, ni publication. Nom de route distinct
              du `Notifications` de la pile, même raison que `NfMapTab`.
              `freezeOnBlur: false` pour la même raison que plus bas : ces deux
              écrans portent le logo d'actualisation au doigt, et ici
              Notifications est un ONGLET (donc gelable), pas un écran poussé. */}
          <Tab.Screen
            name="NotificationsTab"
            component={NotificationsScreen}
            options={{ freezeOnBlur: false }}
          />
          <Tab.Screen
            name="Profil"
            component={ProfileScreen}
            options={{ freezeOnBlur: false }}
          />
        </>
      ) : (
        <>
          {/* `freezeOnBlur: false` sur les DEUX onglets qui portent le logo
              d'actualisation au doigt (Accueil — Pour toi / Abonnements /
              Explorer — et Profil).

              Le gel casse le lien entre les valeurs animées Reanimated et
              leurs vues natives : c'est le défaut déjà décrit dans
              `usePullRefreshLogo`, où il avait été rattrapé par un remontage
              du logo (`logoKey`). Ce rattrapage ne couvre QUE le logo — le
              `useAnimatedScrollHandler` posé sur la liste, qui alimente
              `pull`, garde lui aussi un lien natif que le gel casse, et rien
              ne le remonte. La traction n'est alors plus lue correctement :
              l'animation ne ressemble plus à celle d'origine et se fige.
              `NotificationsScreen` ne connaît pas ce bug parce qu'il est
              poussé sur la PILE (jamais gelé pendant qu'on s'en sert).

              Les autres onglets gardent le gel : eux n'ont pas de valeur
              animée pilotée par le défilement. */}
          <Tab.Screen
            name="Accueil"
            component={FeedGutterScreen}
            options={{ freezeOnBlur: false }}
          />
          <Tab.Screen name="Recherche" component={SearchScreen} />
          <Tab.Screen name="Messages" component={MessagesScreen2B} />
          {liveCount > 0 && <Tab.Screen name={LIVE_ROUTE} component={LivesScreen} />}
          {mountedOptional.map((key) => (
            <Tab.Screen
              key={key}
              name={OPTIONAL_SCREENS[key].route}
              component={OPTIONAL_SCREENS[key].component}
            />
          ))}
          <Tab.Screen
            name="Profil"
            component={ProfileScreen}
            options={{ freezeOnBlur: false }}
          />
        </>
      )}
    </Tab.Navigator>
  );
}

const S = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: BAR_PAD_TOP,
    // La couleur de la PAGE, dans les deux thèmes. La séparation est le filet
    // du thème lui-même — un contour clair en dur se voyait plus que les
    // icônes en clair, et disparaissait en sombre.
    backgroundColor: paper.bg,
    borderTopWidth: 1,
    borderTopColor: paper.hairline,
  },
  row: {
    flexDirection: 'row',
    height: BAR_H - BAR_PAD_TOP,
  },
  // `justifyContent: 'flex-start'` et non 'center' : le haut de l'icône et le
  // haut de la pastille tombent alors au même y sans rien mesurer. La pastille
  // est absolue, elle ne peut pas suivre un centrage qui dépendrait du contenu.
  slot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    alignSelf: 'stretch',
  },
  // La pastille est posée dans le repère de la rangée et translatée : sa
  // position vient d'un `translateX` animé, pas d'un `left` recalculé à chaque
  // rendu (un `left` animé repasse par le thread JS à chaque image).
  // Largeur, hauteur et rayon sont posés au rendu : ils dépendent de la place
  // réelle (voir `metricsFor`).
  pill: {
    position: 'absolute',
    left: 0,
    top: 0,
    // Voile tiré du FOND DE PAGE, pas une couleur à part : la barre est de la
    // couleur de la page, donc une pastille d'une autre teinte y flotterait
    // comme une vignette collée. Voir `pillWash` dans `theme/paper2b.ts`.
    backgroundColor: paper.pillWash,
  },
  // `alignSelf: 'stretch'` et non une largeur fixe : la case prend celle de sa
  // colonne, donc elle ne peut par construction pas mordre sur la voisine.
  iconBox: {
    alignSelf: 'stretch',
    height: PILL_H_MAX,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Les deux tracés occupent la MÊME case, superposés : c'est ce qui permet
  // d'échanger leurs opacités sans que rien ne bouge d'un pixel.
  iconLayer: {
    position: 'absolute',
  },
  // La largeur est posée au rendu : le bouton se resserre avec sa colonne sur
  // une barre chargée, au lieu de mordre sur ses voisines.
  publish: {
    height: PUBLISH_H,
    // Débord vers le haut de la moitié de l'écart avec la case d'icône, pour
    // que le bouton et les glyphes restent sur la même ligne.
    marginTop: (PILL_H_MAX - PUBLISH_H) / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: ps(14),
    borderCurve: 'continuous',
    backgroundColor: paper.accent,
    boxShadow: `0 ${ps(3)}px ${ps(10)}px ${paper.navShadow}`,
  },
  // Calé sur le coin de l'ICÔNE, pas sur celui de la case : la case fait la
  // taille de la pastille (40) pour la zone tapable, l'icône n'en occupe que
  // 26 au centre — un badge au coin de la case flotterait dans le vide.
  // Ancré au coin du GLYPHE (la vue parente fait exactement sa taille), et
  // débordant légèrement dessus comme un badge natif.
  badge: {
    position: 'absolute',
    top: ps(-5),
    right: ps(-7),
    minWidth: ps(16),
    height: ps(16),
    paddingHorizontal: ps(4),
    borderRadius: ps(8),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: paper.accent,
    borderWidth: 1.5,
    borderColor: paper.bg,
  },
  badgeText: {
    fontFamily: paperFonts.strong,
    fontSize: ps(9),
    color: paper.onAccent,
    // Chiffres à chasse fixe : sans ça la pastille change de largeur entre
    // « 11 » et « 18 », et l'icône sous elle paraît bouger.
    fontVariant: ['tabular-nums'],
  },
});
