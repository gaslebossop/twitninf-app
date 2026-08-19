/**
 * 🗺️ Carte NF — les comptes liés à toi, là où ils ont accepté d'être vus.
 *
 * ── La disposition ──
 * La carte occupe tout l'écran ; tout le reste flotte au-dessus et ne lui
 * prend jamais de place. Une barre de recherche en haut, une feuille en bas
 * réduite à un aperçu tant qu'on ne l'ouvre pas. C'est l'agencement attendu
 * d'une carte sociale : la carte EST le contenu, pas un encart coincé entre
 * deux panneaux — c'était le défaut de la version précédente, dont la liste
 * mangeait en permanence le bas de l'écran.
 *
 * ── Le parti pris ──
 * Une carte de gens est une base de données de déplacements. L'écran montre
 * donc d'abord ce qu'il montrerait DE TOI. Tant que rien n'est choisi, on est
 * fantôme : on voit ceux qui se montrent, et on n'apparaît nulle part.
 *
 * ── Pourquoi la liste d'amis compte autant que la carte ──
 * Une carte vide n'explique rien. La feuille nomme les amis qui ne partagent
 * pas et permet de leur demander — c'est le SEUL chemin par lequel quelqu'un
 * apparaît ici. Aucune position n'est reconstituée depuis les données de
 * localisation collectées ailleurs dans l'app : elles existent pour la fraude
 * et les statistiques, et les afficher publierait la position de gens qui ne
 * l'ont jamais accepté.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Dimensions,
  PixelRatio,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';

import { API_CONFIG } from '../config/api';
import { colors, fonts } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { Tappable, HowItWorks } from '../components/ui';
import { toast } from '../components/ui/Toast';
import Avatar from '../components/Avatar';
import { quantizedDegreesPerPixel, quantizedLatitudeCosine } from '../utils/mapCluster';
import { buildMapMarkers, coordinatesOf, type MarkerRole } from '../utils/mapMarkers';
import NfMapCanvas, {
  MAX_ZOOM,
  type MapBounds,
  type MapCamera,
  type MapCoordinate,
  type MapMarker,
} from '../components/map/NfMapCanvas';
import {
  nfMapService,
  type NfMapFriend,
  type NfMapPerson,
  type NfMapSettings,
  type SharingMode,
} from '../services/nfMapService';

const FALLBACK_CENTER: MapCoordinate = { latitude: 48.8566, longitude: 2.3522 };
const DEFAULT_ZOOM = 11;

/**
 * Où la carte s'était ouverte la dernière fois.
 *
 * ── Le défaut que ça corrige ──
 * Sans mémoire, la carte s'ouvre sur `FALLBACK_CENTER` — Paris — le temps que
 * le GPS réponde, puis saute à la position réelle. À chaque ouverture on
 * assistait donc à un survol de plusieurs centaines de kilomètres avant que la
 * carte ne se pose. C'est le « ça se téléporte au lancement ».
 *
 * ── Ce qui est écrit, et à quelle précision ──
 * UNIQUEMENT un cadrage de carte, arrondi à trois décimales (~100 m). C'est
 * amplement assez pour rouvrir au bon endroit, et ça évite de laisser traîner
 * la position exacte d'un domicile dans un stockage en clair. Rien ne part au
 * serveur : la publication d'une position reste conditionnée au mode de
 * partage, et elle passe par `nfMapService.pushPosition`.
 */
const LAST_CENTER_KEY = 'nf-map:last-center';
const CENTER_PRECISION = 1000;

async function readLastCenter(): Promise<MapCoordinate | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_CENTER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const latitude = Number(parsed?.latitude);
    const longitude = Number(parsed?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
    return { latitude, longitude };
  } catch {
    // Stockage illisible : le repli fait son travail, il n'y a rien à dire.
    return null;
  }
}

function writeLastCenter(center: MapCoordinate): void {
  const rounded = {
    latitude: Math.round(center.latitude * CENTER_PRECISION) / CENTER_PRECISION,
    longitude: Math.round(center.longitude * CENTER_PRECISION) / CENTER_PRECISION,
  };
  AsyncStorage.setItem(LAST_CENTER_KEY, JSON.stringify(rounded)).catch(() => {
    /* Un cadrage non retenu ne coûte qu'une ouverture sur le repli. */
  });
}
/** Zoom appliqué quand on saute sur quelqu'un depuis la liste. */
const FOCUS_ZOOM = 14;

/**
 * Côté du plus grand rectangle que le serveur accepte de servir.
 *
 * ⚠️ Doit rester égal à `MAX_VIEWPORT_DEGREES` dans `api/src/services/
 * nfMapService.js`. Au-delà, la route lève « Zone trop large » et répond 400 —
 * que `nfMapService.nearby` traduit en liste vide, indistinguable de « personne
 * ici ». La carte cessait donc silencieusement de charger qui que ce soit dès
 * qu'on dézoomait au-delà d'un pays, ce qui est très exactement le « quand on
 * dézoome, elle n'affiche pas tout ».
 *
 * On garde une marge : la carte native arrondit son cadrage, et une fenêtre
 * pile à 12,0° repartait parfois en 400 pour un centième de degré.
 */
const MAX_QUERY_DEGREES = 11.4;

/**
 * Plafond de comptes suivis en mémoire.
 *
 * Les positions s'accumulent volontairement (voir `loadNearby`), mais
 * « borné par tes liens » n'est pas une borne : un compte à huit cents abonnés,
 * ce sont huit cents vues natives de marqueur, à vie. Le serveur n'en rend
 * jamais plus de 200 par requête ; 300 laisse de la place pour plusieurs
 * fenêtres voisines sans jamais approcher le seuil où la carte devient lourde.
 */
const MAX_TRACKED_PEOPLE = 300;

/**
 * Où demander les images d'épingle, et à quelle densité.
 *
 * Constant pour toute la session : ni l'adresse de l'API ni la densité de
 * l'écran ne changent en cours de route. Le calculer une fois évite de faire
 * dépendre la liste des marqueurs d'un objet recréé à chaque rendu — ce qui
 * renverrait une nouvelle URL, donc un rechargement d'image, à chaque frappe.
 */
const PIN_ORIGIN = { origin: API_CONFIG.BASE_URL, density: PixelRatio.get() };

/**
 * Le lieu d'un groupe, s'il en a UN seul.
 *
 * Rend `null` dès que ses membres ne s'accordent pas — auquel cas il n'y a rien
 * de vrai à écrire en en-tête. « approximatif » n'est ajouté que si TOUT le
 * monde partage sa ville plutôt que sa position exacte : le dire alors qu'une
 * partie du groupe est précise serait faux.
 */
function describePlace(people: NfMapPerson[]): string | null {
  if (people.length === 0) return null;

  const place = people[0].place_label || null;
  if (!place || people.some((person) => (person.place_label || null) !== place)) return null;

  const allApproximate = people.every((person) => person.sharing_mode === 'city');
  return allApproximate ? `${place} · approximatif` : place;
}

/** Hauteur d'une ligne de groupe : avatar 28 + 5 px de marge haut et bas. */
const GROUP_ROW_HEIGHT = 38;
/** Cinq lignes ENTIÈRES. Une sixième coupée se lirait comme un défaut. */
const GROUP_VISIBLE_ROWS = 5;

/**
 * Les trois crans de la feuille, à la façon de Snap Map.
 *
 * Snap n'a pas de « fiche flottante » : il a UNE feuille en bas dont le
 * contenu change, et qu'on tire au doigt. Toucher quelqu'un la fait monter au
 * cran du milieu ; la tirer plus haut donne la liste complète. C'est ce qui
 * évite d'avoir deux objets — une carte flottante et une feuille — qui se
 * disputent le bas de l'écran et se recouvrent.
 */
/** Repliée : juste de quoi lire le résumé. */
const PEEK_HEIGHT = 112;
/** Cran du milieu : une fiche de personne, ou les premières lignes d'un groupe. */
const CARD_HEIGHT = 312;
/** Hauteur réelle de la feuille, constante : c'est la translation qui bouge. */
const SHEET_HEIGHT = Math.round(Dimensions.get('window').height * 0.72);
/** Ouverture un peu plus lente que la fermeture : on suit ce qui se révèle. */
const OPEN_MS = 260;
const CLOSE_MS = 200;

type SheetMode = 'peek' | 'list' | 'settings';

/**
 * Les crans de la feuille. Snap en a trois, et c'est ce qui rend le geste
 * lisible : un pour le résumé, un pour une fiche, un pour la liste entière.
 */
type SheetDetent = 'peek' | 'card' | 'full';

const MODES: Array<{ id: SharingMode; label: string; hint: string; icon: string }> = [
  {
    id: 'ghost',
    label: 'Mode fantôme',
    hint: 'Personne ne te voit. Tu vois quand même ceux qui se montrent.',
    icon: 'eye-off-outline',
  },
  {
    id: 'city',
    label: 'Ma ville',
    hint: 'Un point approximatif. Ta position exacte n’est même pas enregistrée.',
    icon: 'business-outline',
  },
  {
    id: 'precise',
    label: 'Position précise',
    hint: 'Là où tu es vraiment. Pour un moment, pas pour la journée.',
    icon: 'navigate-outline',
  },
];

/** « il y a 3 min ». Une position de plusieurs heures ne dit plus grand-chose. */
function freshness(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 2) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  return `il y a ${Math.round(minutes / 60)} h`;
}

/**
 * La durée de vie d'une position, écrite comme on la dirait.
 *
 * Le serveur la donne en heures. « au bout de 72 h » est juste mais ne se lit
 * pas : personne ne compte en heures au-delà d'une journée. Au-dessus de
 * 48 heures on passe en jours.
 */
function ttlLabel(hours: number | undefined): string {
  const value = Number(hours);
  if (!Number.isFinite(value) || value <= 0) return 'un moment';
  if (value < 48) return `${Math.round(value)} h`;
  const days = Math.round(value / 24);
  return `${days} jour${days > 1 ? 's' : ''}`;
}

/**
 * La même chose, en colonne.
 *
 * Dans la liste d'un groupe, treize lignes qui commencent toutes par « il y
 * a » n'apprennent rien : ce qui distingue les lignes, c'est le nombre. Réduite
 * à « 38 h » et alignée à droite, la durée se compare d'un coup d'œil.
 */
function shortFreshness(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 2) return 'maintenant';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} j`;
}

/**
 * Rectangle RÉELLEMENT interrogeable, ramené autour du centre de la vue.
 *
 * Plutôt que d'envoyer une fenêtre que le serveur va refuser — donc de ne rien
 * recevoir — on demande le plus grand carré autorisé, centré sur ce qu'on
 * regarde. Dézoomé au-delà de la limite, on charge donc les gens du milieu de
 * l'écran au lieu de personne, et les positions déjà connues restent affichées.
 */
function queryableBounds(bounds: MapBounds): MapBounds {
  const centerLatitude = (bounds.north + bounds.south) / 2;
  const centerLongitude = (bounds.east + bounds.west) / 2;
  const halfLatitude = Math.min((bounds.north - bounds.south) / 2, MAX_QUERY_DEGREES / 2);
  const halfLongitude = Math.min((bounds.east - bounds.west) / 2, MAX_QUERY_DEGREES / 2);

  return {
    north: Math.min(90, centerLatitude + halfLatitude),
    south: Math.max(-90, centerLatitude - halfLatitude),
    east: Math.min(180, centerLongitude + halfLongitude),
    west: Math.max(-180, centerLongitude - halfLongitude),
  };
}

export default function NfMapScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  /**
   * La carte est-elle encore à l'écran ?
   *
   * Elle ne l'est plus dès qu'on ouvre un profil depuis la fiche de quelqu'un.
   * La pile est réglée en `freezeOnBlur` (voir `MainNavigator`), donc l'écran
   * est gelé puis escamoté — avec ses deux cents marqueurs natifs encore posés,
   * ce que `react-native-maps` 1.20.1 ne supporte pas sous la Nouvelle
   * Architecture. Perdre le focus vide la carte par paquets, et deux requêtes
   * en vol cessent d'alimenter un écran que plus personne ne regarde.
   */
  const isFocused = useIsFocused();

  /**
   * Cible de caméra — uniquement les sauts VOULUS.
   *
   * Le déplacement au doigt n'écrit rien ici. Avant, chaque déplacement
   * réécrivait `center` et `zoom` dans l'état de l'écran : toute la page se
   * reconstruisait pendant qu'on faisait glisser la carte, et la carte
   * recevait en retour sa propre position en `props`. C'est de là que venaient
   * les à-coups et le sentiment que la carte se battait contre le doigt.
   */
  const [camera, setCamera] = useState<MapCamera>({
    center: FALLBACK_CENTER,
    zoom: DEFAULT_ZOOM,
    nonce: 0,
  });
  const jumpTo = useCallback((center: MapCoordinate, zoom: number) => {
    setCamera((current) => ({ center, zoom, nonce: current.nonce + 1 }));
  }, []);

  /** Zoom réellement affiché. Une `ref` : le lire ne doit rien redessiner. */
  const liveZoom = useRef(DEFAULT_ZOOM);
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [people, setPeople] = useState<NfMapPerson[]>([]);
  const [friends, setFriends] = useState<NfMapFriend[]>([]);
  const [settings, setSettings] = useState<NfMapSettings | null>(null);
  const [myPosition, setMyPosition] = useState<MapCoordinate | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<NfMapPerson | null>(null);
  /**
   * Le groupe ouvert, s'il y en a un.
   *
   * `people` ne contient QUE les autres : quand le groupe te réunit à tes
   * voisins, ta propre ligne n'y figure pas — on ne s'annonce pas à soi-même sa
   * dernière position connue. `includesSelf` sert seulement à le dire en titre.
   */
  const [group, setGroup] = useState<{
    people: NfMapPerson[];
    includesSelf: boolean;
    center: MapCoordinate;
    /** Le lieu, s'il est le MÊME pour tout le monde — voir `describePlace`. */
    commonPlace: string | null;
  } | null>(null);
  const [search, setSearch] = useState('');
  const [sheet, setSheet] = useState<SheetMode>('peek');
  const [detent, setDetent] = useState<SheetDetent>('peek');
  /**
   * Le lieu qu'on survole, à la façon de Snap Map.
   *
   * Il change pendant le geste, pas seulement à la fin : c'est ce défilement
   * sous le doigt qui dit « tu regardes ici ». La valeur vient des étiquettes
   * déjà dessinées par la carte (voir `onPlaceChange` dans `NfMapCanvas`),
   * donc aucune requête et aucun décalage avec ce qui est à l'écran.
   */
  const [place, setPlace] = useState<string | null>(null);
  const [inviting, setInviting] = useState<string | null>(null);

  const isGhost = !settings || settings.sharing_mode === 'ghost';

  // ── Chargements ──
  const loadSettings = useCallback(async () => {
    try {
      const loaded = await nfMapService.getSettings();
      setSettings(loaded);
      // Premier passage, aucun choix fait : on explique avant de montrer.
      if (loaded && loaded.sharing_mode === 'ghost' && !loaded.shared_at) { setSheet('settings'); setDetent('full'); }
    } catch {
      /* La carte reste lisible sans ses réglages. */
    }
  }, []);

  const loadFriends = useCallback(async () => {
    try {
      const result = await nfMapService.friends();
      setFriends(result.people);
    } catch {
      /* La liste est un complément, son échec ne casse pas la carte. */
    }
  }, []);

  /**
   * Les personnes connues s'ACCUMULENT ; elles ne sont jamais retirées.
   *
   * Le serveur ne répond que pour le rectangle affiché : remplacer la liste à
   * chaque réponse fait disparaître tous ceux qu'on vient de laisser derrière
   * soi. Or faire disparaître quelqu'un, c'est démonter son marqueur — et
   * démonter un marqueur est précisément ce qui fait tomber l'app sur la
   * version de `react-native-maps` figée par Expo Go. Se déplacer revenait
   * donc à provoquer la panne à chaque pause du doigt.
   *
   * On fusionne : un compte déjà connu voit sa position mise à jour SUR PLACE
   * (une simple prop du marqueur, aucun démontage), un compte nouveau s'ajoute.
   * L'ensemble est naturellement borné — seuls les comptes liés à toi peuvent
   * apparaître — et repart à zéro en quittant l'écran.
   */
  /**
   * Numéro de la dernière requête lancée.
   *
   * Deux réponses `nearby` peuvent revenir dans le désordre — c'est la norme
   * quand on traverse la carte, la fenêtre d'avant mettant plus longtemps que
   * celle d'après. La réponse en retard réécrivait alors des positions par des
   * plus anciennes : quelqu'un sautait en arrière, ou revenait à un endroit
   * qu'il avait quitté. On ignore purement et simplement ce qui n'est plus la
   * requête en cours.
   */
  const nearbyRequest = useRef(0);

  const loadNearby = useCallback(async (window: MapBounds) => {
    const request = nearbyRequest.current + 1;
    nearbyRequest.current = request;

    const fresh = await nfMapService.nearby(queryableBounds(window));
    if (request !== nearbyRequest.current) return;
    if (fresh.length === 0) return;

    setPeople((current) => {
      const byId = new Map(current.map((person) => [person.id, person]));
      let changed = false;

      for (const person of fresh) {
        // Une ligne sans position exploitable ne doit jamais entrer : filtrée
        // plus loin, elle formerait un marqueur qui apparaît puis disparaît —
        // or c'est le DÉMONTAGE d'un marqueur qui fait tomber le natif.
        if (!coordinatesOf(person)) continue;

        const known = byId.get(person.id);
        // Plafond atteint : on continue de mettre à jour ceux qu'on suit déjà,
        // on cesse seulement d'en ajouter. Retirer quelqu'un serait démonter
        // son marqueur, ce qu'on ne fait jamais en cours de session.
        if (!known && byId.size >= MAX_TRACKED_PEOPLE) continue;

        const moved =
          !known ||
          known.shared_at !== person.shared_at ||
          String(known.latitude) !== String(person.latitude) ||
          String(known.longitude) !== String(person.longitude);
        if (moved) {
          byId.set(person.id, person);
          changed = true;
        }
      }

      return changed ? Array.from(byId.values()) : current;
    });
  }, []);

  /**
   * Le cadrage de départ est lu AVANT que la carte n'existe.
   *
   * `NfMapCanvas` fige sa caméra initiale au montage — elle part dans le script
   * d'amorçage de la page, évalué une seule fois. Lire la dernière position
   * après coup ne servirait donc à rien : la carte se serait déjà ouverte sur
   * Paris. C'est pour ça que cette lecture partage le même `loading` que les
   * réglages, et que la carte n'est montée qu'une fois les trois terminées.
   */
  useEffect(() => {
    Promise.all([
      loadSettings(),
      loadFriends(),
      readLastCenter().then((center) => {
        // `nonce` ne bouge pas : ce n'est pas un saut, c'est le point de départ.
        if (center) setCamera((current) => ({ ...current, center, zoom: FOCUS_ZOOM }));
      }),
    ]).finally(() => setLoading(false));
  }, [loadSettings, loadFriends]);

  /**
   * Une requête par déplacement, et seulement après une pause : sans ce délai,
   * traverser la carte déclenchait autant d'appels que de relâchements, dont
   * un seul comptait.
   */
  useEffect(() => {
    if (!bounds || !isFocused) return undefined;
    const timer = setTimeout(() => {
      // Le `catch` n'est pas décoratif : `apiService` LÈVE sur expiration de
      // délai, et un rejet non capté dans un `setTimeout` remonte en écran
      // rouge sous Expo Go. Un réseau lent au milieu d'un déplacement suffisait
      // à le déclencher — vu de l'utilisateur, la carte « plante ».
      loadNearby(bounds).catch(() => {
        /* Fenêtre non chargée : le prochain déplacement réessaiera. Les
           positions déjà connues restent affichées. */
      });
    }, 280);
    return () => clearTimeout(timer);
  }, [bounds, isFocused, loadNearby]);

  /**
   * Position de l'appareil : demandée pour CENTRER la carte, ce qui ne suppose
   * aucun partage. Elle n'est envoyée au serveur que si un mode est actif.
   */
  const locateMe = useCallback(
    async ({ silent = false } = {}) => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        if (!silent) {
          toast.info('Position refusée', {
            description: 'La carte marche quand même, elle ne sera juste pas centrée sur toi.',
          });
        }
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const here = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      setMyPosition(here);
      jumpTo(here, FOCUS_ZOOM);
      // La prochaine ouverture partira d'ici plutôt que du repli.
      writeLastCenter(here);

      if (settings && settings.sharing_mode !== 'ghost') {
        try {
          await nfMapService.pushPosition(here.latitude, here.longitude);
          await loadSettings();
        } catch {
          toast.error('Position non partagée', { description: 'Réessaie dans un instant.' });
        }
      }
    },
    [settings, loadSettings, jumpTo]
  );

  /**
   * On se localise à l'arrivée, sans rien demander.
   *
   * Sinon la carte s'ouvre sur Paris — la valeur de repli — et on n'y est pas.
   * Le premier réflexe est alors de dézoomer pour se chercher, et comme la
   * fenêtre interrogée est celle de Paris, il n'y a personne à afficher non
   * plus : l'écran paraît vide ET perdu. Se centrer sur soi ne partage rien,
   * c'est un cadrage local.
   */
  const located = useRef(false);
  useEffect(() => {
    if (loading || located.current) return;
    located.current = true;
    locateMe({ silent: true }).catch(() => {
      /* Permission refusée ou GPS muet : le repli fait son travail. */
    });
  }, [loading, locateMe]);

  const changeMode = useCallback(
    async (mode: SharingMode) => {
      try {
        const updated = await nfMapService.setSettings({ sharing_mode: mode });
        setSettings(updated);

        if (mode === 'ghost') {
          // L'épingle « moi » RESTE, en trait discontinu : elle est locale et
          // ne publie rien (voir son commentaire dans `markers`). L'effacer
          // ici contredisait cette intention — et surtout, c'était démonter un
          // marqueur, l'unique geste que ce fichier passe son temps à éviter.
          toast.success('Tu es invisible', { description: 'Ta position a été effacée.' });
          return;
        }

        // Activer sans envoyer de position laisserait un réglage actif et une
        // carte vide : on enchaîne tout de suite.
        await locateMe({ silent: true });
        setSheet('peek');
        toast.success(mode === 'city' ? 'Ta ville est partagée' : 'Ta position est partagée', {
          description: `Elle disparaît seule au bout de ${ttlLabel(updated.policy?.ttl_hours)}.`,
        });
      } catch (error: any) {
        toast.error(error?.message || 'Réglage impossible');
      }
    },
    [locateMe]
  );

  const inviteFriend = useCallback(async (friend: NfMapFriend) => {
    setInviting(friend.id);
    try {
      const sent = await nfMapService.invite(friend.id);
      if (sent) toast.success(`Demande envoyée à @${friend.username}`);
      else toast.info('Déjà demandé aujourd’hui', { description: 'Laisse-lui le temps de répondre.' });
    } catch (error: any) {
      toast.error(error?.message || 'Demande impossible');
    } finally {
      setInviting(null);
    }
  }, []);

  const focusOn = useCallback(
    (person: NfMapPerson) => {
      const here = coordinatesOf(person);
      if (!here) return;
      jumpTo(here, FOCUS_ZOOM);
      setGroup(null);
      setSelected(person);
      setSheet('peek');
      setDetent('card');
    },
    [jumpTo]
  );

  /**
   * Appui sur un marqueur. Traité ICI et pas dans le marqueur lui-même : un
   * marqueur est une image, pas une vue vivante — voir l'en-tête de
   * `NfMapCanvas`. C'est ce qui rendait les épingles insensibles au doigt.
   */
  const onMarkerPress = useCallback(
    (marker: MapMarker<MarkerRole>) => {
      const role = marker.data;
      if (role.kind === 'self') return;

      /*
       * Un groupe OUVRE SA LISTE, il ne fait plus que zoomer.
       *
       * Zoomer de deux paliers était la seule réponse possible du temps où un
       * marqueur ne pouvait rien porter : on ne savait pas qui était dans le
       * tas, il fallait aller voir. Mais un groupe rassemble justement les gens
       * qu'on n'arrive pas à distinguer — et zoomer les sépare sans dire
       * lesquels c'étaient, ni depuis quand ils sont là. La liste répond aux
       * deux d'un coup, et le zoom reste disponible depuis son en-tête.
       *
       * Les membres n'ont aucun marqueur à eux : la tête porte le groupe, et
       * c'est elle qu'on touche.
       */
      if (role.kind === 'head') {
        setGroup({
          people: role.faces,
          includesSelf: role.includesSelf,
          center: { latitude: marker.latitude, longitude: marker.longitude },
          commonPlace: describePlace(role.faces),
        });
        setSelected(null);
        setSheet('peek');
        setDetent('card');
        return;
      }

      setGroup(null);
      setSelected(role.person);
      setSheet('peek');
      setDetent('card');
    },
    []
  );

  /**
   * Pas de la grille, figé par palier de zoom. Isolé dans son propre `useMemo`
   * pour que le regroupement ne dépende PAS des bornes brutes : à zoom
   * constant, traverser toute la carte laisse cette valeur inchangée, donc
   * rien n'est recalculé.
   */
  const clusterScale = useMemo(
    () =>
      bounds
        ? quantizedDegreesPerPixel(bounds.east - bounds.west, Dimensions.get('window').width)
        : 0,
    [bounds]
  );

  /**
   * Correction de latitude de la grille, arrondie elle aussi par paliers.
   *
   * Sans elle, les cases de regroupement sont carrées en DEGRÉS, donc
   * rectangulaires à l'écran — 52 % trop hautes à la latitude de Paris. Deux
   * personnes distantes de cent pixels verticalement fusionnaient en un groupe,
   * et celle qui n'en était pas la tête se réduisait à un point de huit pixels
   * caché dessous : elle avait disparu de la carte sans que rien ne le dise.
   */
  const clusterLatitudeCosine = useMemo(
    () => (bounds ? quantizedLatitudeCosine((bounds.north + bounds.south) / 2) : 1),
    [bounds]
  );

  /**
   * Les marqueurs. Tout le calcul — et surtout les deux invariants qui
   * empêchent l'app de tomber — vit dans `utils/mapMarkers`, où il est
   * testable : un marqueur par personne pour toute la session, dans un ordre
   * qui ne dépend jamais du zoom.
   */
  const markers = useMemo(
    () =>
      buildMapMarkers({
        people,
        myPosition,
        me: user?.id ? { id: String(user.id), avatar: user.avatar ?? null } : null,
        isGhost,
        selectedId: selected?.id ?? null,
        clusterScale,
        clusterLatitudeCosine,
        pin: PIN_ORIGIN,
      }),
    [
      people,
      myPosition,
      user?.id,
      user?.avatar,
      isGhost,
      clusterScale,
      clusterLatitudeCosine,
      selected,
    ]
  );

  /**
   * Les trois rappels passés à la carte, STABLES d'un rendu à l'autre.
   *
   * Ils étaient écrits en fonctions fléchées dans le JSX. Chaque rendu de
   * l'écran — une lettre tapée dans la recherche d'amis, une image de
   * l'animation de la feuille, l'arrivée de la liste d'amis — en fabriquait de
   * nouvelles, et la carte renvoyait une mise à jour à CHACUN de ses marqueurs
   * natifs. Sur `react-native-maps` 1.20.1 sous la Nouvelle Architecture, c'est
   * du travail natif inutile à chaque frappe au clavier.
   *
   * `renderMarker` ne dépend volontairement pas de `selected` : la sélection
   * voyage dans le rôle du marqueur (voir `MarkerRole`), donc dans ses props.
   */
  const handlePressMap = useCallback(() => {
    setSelected(null);
    setGroup(null);
    setDetent('peek');
    setSheet('peek');
  }, []);

  const handleRegionChange = useCallback(
    (_center: MapCoordinate, nextZoom: number, nextBounds: MapBounds) => {
      liveZoom.current = nextZoom;
      setBounds(nextBounds);
    },
    []
  );

  const visibleFriends = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return friends;
    return friends.filter(
      (friend) =>
        friend.username.toLowerCase().includes(needle) ||
        (friend.full_name || '').toLowerCase().includes(needle)
    );
  }, [friends, search]);

  const sharingFriends = useMemo(() => friends.filter((friend) => friend.is_sharing), [friends]);

  /**
   * La vue est plus large que ce que le serveur sert en une fois.
   *
   * Le dire est la moitié du correctif. Techniquement, `queryableBounds` charge
   * déjà le centre de l'écran ; mais sans un mot, une carte qui montre moins de
   * monde à mesure qu'on dézoome se lit comme une panne — c'est le « elle
   * n'affiche pas tout » — alors que c'est une limite assumée.
   */
  const viewTooWide = useMemo(
    () =>
      !!bounds &&
      (bounds.north - bounds.south > MAX_QUERY_DEGREES ||
        bounds.east - bounds.west > MAX_QUERY_DEGREES),
    [bounds]
  );

  /**
   * Feuille dépliée : elle couvre les trois quarts bas de l'écran.
   *
   * Ce qui flotte au-dessus de la carte est alors DÉMONTÉ, pas décalé. La
   * version précédente le décalait de `OPEN_HEIGHT` (330 px), une constante
   * qui n'a jamais correspondu aux 72 % réels de la feuille : le bouton « me
   * localiser » et surtout la fiche de la personne touchée se retrouvaient
   * dessous, visibles nulle part et impossibles à fermer. C'est le « on ne
   * peut pas fermer les popups ».
   */
  /**
   * Ce que la feuille MONTRE, déduit de la sélection.
   *
   * Une seule feuille, un seul endroit où regarder. Avant, une fiche flottante
   * se posait par-dessus la feuille : deux objets pour le bas de l'écran, qui
   * se recouvraient dès que la feuille montait.
   */
  const content: 'person' | 'group' | 'settings' | 'list' =
    group ? 'group' : selected ? 'person' : sheet === 'settings' ? 'settings' : 'list';

  /** Hauteur visible de chaque cran, marge système comprise. */
  const detentHeight = useCallback(
    (name: SheetDetent) =>
      (name === 'peek' ? PEEK_HEIGHT : name === 'card' ? CARD_HEIGHT : SHEET_HEIGHT - insets.bottom) +
      insets.bottom,
    [insets.bottom]
  );
  /** Translation correspondante : 0 = entièrement dépliée. */
  const offsetFor = useCallback(
    (name: SheetDetent) => Math.max(0, SHEET_HEIGHT - detentHeight(name)),
    [detentHeight]
  );

  const isSheetOpen = detent !== 'peek';
  const floatingBottom = PEEK_HEIGHT + insets.bottom + 16;

  /**
   * Position de la feuille, EN PIXELS.
   *
   * Une valeur en pixels et non une progression de 0 à 1 : le doigt déplace des
   * pixels, et convertir dans les deux sens à chaque image pour un geste
   * continu n'apporte rien.
   */
  const sheetY = useRef(new Animated.Value(offsetFor('peek'))).current;
  /** D'où partait la feuille quand le doigt s'est posé. */
  const dragOrigin = useRef(offsetFor('peek'));

  const settle = useCallback(
    (name: SheetDetent) => {
      Animated.spring(sheetY, {
        toValue: offsetFor(name),
        useNativeDriver: true,
        damping: 26,
        stiffness: 260,
        mass: 0.9,
      }).start();
    },
    [offsetFor, sheetY]
  );

  // Un changement de cran décidé par l'app (toucher quelqu'un, refermer) :
  // le geste, lui, pilote `sheetY` directement et ne repasse pas par ici.
  useEffect(() => { settle(detent); }, [detent, settle]);

  /**
   * Le geste de la feuille — la contrainte principale de Snap.
   *
   * Trois règles, chacune pour une raison :
   *
   *   1. **Seul l'en-tête est saisissable.** Le corps défile ; s'il tirait
   *      aussi la feuille, on ne pourrait plus lire une longue liste sans la
   *      refermer par accident.
   *   2. **La feuille ne dépasse jamais ses bornes** — pas de rebond
   *      élastique au-delà du cran haut, c'est ce qui trahit une feuille faite
   *      à la main.
   *   3. **La vitesse décide, pas seulement la position.** Un geste bref et
   *      vif doit changer de cran même sur trente pixels ; sans ça, il faut
   *      traîner le doigt jusqu'à mi-chemin et la feuille paraît collante.
   *
   * `PanResponder` plutôt que Reanimated : la valeur animée existante est déjà
   * une `Animated.Value`, et un worklet qui appellerait une fonction JS
   * ordinaire tuerait l'app sans laisser un seul log.
   */
  const pan = useMemo(
    () =>
      PanResponder.create({
        /*
         * `…Capture` et pas `onMoveShouldSetPanResponder`.
         *
         * L'en-tête contient des zones tactiles (la poignée, la rangée du
         * résumé). Sans la variante capturante, c'est l'enfant qui garde le
         * geste dès que le doigt s'est posé sur lui : le glissement ne partait
         * qu'en visant les quelques pixels de marge entre eux, et paraissait
         * marcher une fois sur trois. La capture laisse le parent reprendre la
         * main dès que le mouvement devient franchement vertical — le simple
         * appui, lui, continue d'atteindre l'enfant.
         */
        onMoveShouldSetPanResponderCapture: (_event, gesture) =>
          Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.5,
        onPanResponderGrant: () => {
          sheetY.stopAnimation((value: number) => { dragOrigin.current = value; });
        },
        onPanResponderMove: (_event, gesture) => {
          const low = offsetFor('full');
          const high = offsetFor('peek');
          sheetY.setValue(Math.min(high, Math.max(low, dragOrigin.current + gesture.dy)));
        },
        onPanResponderRelease: (_event, gesture) => {
          const landed = dragOrigin.current + gesture.dy;
          const order: SheetDetent[] = ['full', 'card', 'peek'];

          // Un geste vif l'emporte sur la distance parcourue.
          if (Math.abs(gesture.vy) > 0.7) {
            const current = order.reduce((best, name) =>
              Math.abs(offsetFor(name) - dragOrigin.current) < Math.abs(offsetFor(best) - dragOrigin.current)
                ? name
                : best
            );
            const index = order.indexOf(current);
            const next = order[Math.min(order.length - 1, Math.max(0, index + (gesture.vy > 0 ? 1 : -1)))];
            setDetent(next);
            settle(next);
            return;
          }

          // Sinon, le cran le plus proche de là où le doigt s'est levé.
          const nearest = order.reduce((best, name) =>
            Math.abs(offsetFor(name) - landed) < Math.abs(offsetFor(best) - landed) ? name : best
          );
          setDetent(nearest);
          settle(nearest);
        },
      }),
    [offsetFor, settle, sheetY]
  );

  const chevronTurn = sheetY.interpolate({
    inputRange: [offsetFor('full'), offsetFor('peek')],
    outputRange: ['180deg', '0deg'],
    extrapolate: 'clamp',
  });

  /**
   * Le voile SUIT la feuille, il n'apparaît pas d'un coup.
   *
   * Il était monté et démonté sur une condition booléenne : un aplat noir à
   * 45 % surgissait en une image puis disparaissait de même, pendant que la
   * feuille, elle, glissait. C'est ça, « le fond qui arrive d'un coup ».
   * Interpolé sur la position de la feuille, il ne peut plus se désynchroniser
   * d'elle — même tiré au doigt, à mi-course.
   */
  /** Ce qui flotte au-dessus de la carte s estompe quand la feuille monte. */
  const floatingFade = sheetY.interpolate({
    inputRange: [offsetFor('card'), offsetFor('peek')],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const backdropOpacity = sheetY.interpolate({
    inputRange: [offsetFor('full'), offsetFor('card'), offsetFor('peek')],
    outputRange: [0.5, 0.18, 0],
    extrapolate: 'clamp',
  });

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={StyleSheet.absoluteFill}>
        <NfMapCanvas
          camera={camera}
          markers={markers}
          onMarkerPress={onMarkerPress}
          // Toucher le fond referme ce qui est ouvert : c'est le geste qu'on
          // essaie d'abord, avant de chercher une croix.
          onPressMap={handlePressMap}
          onRegionChange={handleRegionChange}
          onPlaceChange={setPlace}
        />
      </View>

      {/* ── Barre du haut, disposée comme celle de Snap ──
          Des boutons ronds aux extrémités, et le NOM DU LIEU au centre, sur la
          même ligne. Il occupait auparavant une bande à part sous une pastille
          de recherche pleine largeur : trois choses empilées en haut d'un écran
          dont le sujet est la carte. Le lieu est le titre de cet écran, le
          reste est de la commande — d'où la recherche réduite à une icône. */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <Tappable style={styles.round} onPress={() => navigation.goBack()} accessibilityLabel="Retour">
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </Tappable>

        <Tappable
          style={styles.round}
          onPress={() => { setSheet('list'); setDetent('full'); }}
          accessibilityLabel="Chercher un ami"
        >
          <Ionicons name="search" size={20} color={colors.textPrimary} />
        </Tappable>

        {/* L'écart qui renvoie le bouton suivant à DROITE.
            Il était tenu par la pastille de recherche en pleine largeur ; en la
            réduisant à une icône, les trois boutons se sont tassés à gauche et
            le titre centré leur passait dessus. */}
        <View style={styles.topSpacer} pointerEvents="none" />

        <Tappable
          style={[styles.round, !isGhost && styles.roundLive]}
          onPress={() => { const next = sheet === 'settings' ? 'peek' : 'settings'; setSheet(next); setDetent(next === 'settings' ? 'full' : 'peek'); }}
          accessibilityLabel="Réglages de partage"
        >
          {/* Un crayon : ce bouton sert à MODIFIER ce qu'on partage. L'œil
              barré et l'onde décrivaient l'état actuel, pas l'action — et un
              état ne se touche pas, il se lit. L'état reste dit, mais par la
              couleur et l'anneau d'accent quand le partage est actif. */}
          <Ionicons
            name="create-outline"
            size={19}
            color={isGhost ? colors.textPrimary : colors.accent}
          />
        </Tappable>
      </View>

      {/* ── Le nom du lieu ──
          Posé en couche à part, ABSOLUE, et pas dans la rangée des boutons.
          La barre porte un bouton à gauche et deux à droite : un titre en
          `flex: 1` entre les deux occupe l'espace restant, qui n'est pas
          centré — il était décalé vers la gauche de la largeur d'un bouton.
          Une couche absolue se centre sur l'écran, quel que soit le nombre de
          boutons de chaque côté.

          Les marges latérales valent la place prise par les deux boutons de
          droite : un nom long s'abrège plutôt que de passer dessous. */}
      {place ? (
        <View style={[styles.topTitle, { top: insets.top + 8 }]} pointerEvents="none">
          <Text style={styles.placeText} numberOfLines={1}>
            {place}
          </Text>
        </View>
      ) : null}


      {/* Ces deux-là s'ESTOMPENT avec la feuille au lieu d'être démontés.
          Montés sur condition, ils disparaissaient en une image — ombre
          comprise, ce qui se voit d'autant plus qu'elle est portée. Leur
          opacité suit la même valeur que le voile, donc ils ne peuvent pas se
          désynchroniser du glissement, même tiré au doigt. */}
      <Animated.View
        style={[styles.locate, { bottom: floatingBottom, opacity: floatingFade }]}
        pointerEvents={isSheetOpen ? 'none' : 'auto'}
      >
        <Tappable onPress={() => locateMe()} accessibilityLabel="Me localiser" style={styles.locateHit}>
          <Ionicons name="locate" size={20} color={colors.textPrimary} />
        </Tappable>
      </Animated.View>

      {/* ── Vue trop large ──
          Sans ce mot, la carte semble perdre du monde à mesure qu'on dézoome. */}
      {viewTooWide && (
        <Animated.View
          style={[styles.notice, { bottom: floatingBottom, opacity: floatingFade }]}
          pointerEvents="none"
        >
          <Ionicons name="search-outline" size={14} color={colors.textMuted} />
          <Text style={styles.noticeText} numberOfLines={1}>
            Zoome pour charger tout le monde
          </Text>
        </Animated.View>
      )}

      {/* ── Voile : referme la feuille dépliée en touchant la carte ──
          Une feuille qui occupe les trois quarts de l'écran sans rien derrière
          qui la referme se lit comme un cul-de-sac. */}
      {/* Toujours monté, jamais conditionné : c'est son OPACITÉ qui suit la
          feuille. Monté sur condition, il surgissait en une image.
          `pointerEvents` le rend traversant tant qu'il est invisible, sinon il
          intercepterait les gestes sur la carte alors qu'on ne le voit pas. */}
      <Animated.View
        style={[styles.backdrop, { opacity: backdropOpacity }]}
        pointerEvents={isSheetOpen ? 'auto' : 'none'}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => { setSheet('peek'); setSelected(null); setGroup(null); setDetent('peek'); }}
          accessibilityLabel="Refermer"
        />
      </Animated.View>


      {/* ── Feuille du bas ──
          Hauteur FIXE, translation animée : changer la hauteur d'une vue ne
          peut pas passer par le pilote natif, et la feuille sautait d'un état à
          l'autre en une image. En glissant une feuille de taille constante,
          l'animation tourne côté natif.

          L'EN-TÊTE porte le geste, pas le corps : une longue liste doit
          pouvoir défiler sans qu'on referme la feuille par accident. C'est la
          contrainte de Snap, et c'est aussi la seule qui se remarque quand
          elle manque. */}
      <Animated.View
        style={[styles.sheet, { height: SHEET_HEIGHT, transform: [{ translateY: sheetY }] }]}
      >
        <View {...pan.panHandlers}>
        <Tappable
          style={styles.handleZone}
          onPress={() => setDetent(detent === 'peek' ? 'full' : 'peek')}
          haptic="tap"
          scaleTo={1}
        >
          <View style={styles.handle} />
        </Tappable>

        {/* En-tête permanent : le résumé reste lisible dépliée ou repliée, et
            c'est le même objet qui se transforme au lieu de deux panneaux qui
            se remplacent. Le chevron devient la croix — la sortie est là où on
            vient de cliquer pour entrer. */}
        <Tappable
          style={styles.peekTouch}
          onPress={() => setDetent(isSheetOpen ? 'peek' : 'full')}
          haptic="tap"
          scaleTo={1}
        >
          {/* L'en-tête DIT CE QU'ON REGARDE.
              Toucher quelqu'un sur la carte le fait apparaître ici plutôt que
              dans une fiche flottante posée par-dessus : un seul objet occupe
              le bas de l'écran, comme chez Snap. */}
          <View style={styles.peek}>
            {content === 'person' && selected ? (
              <Avatar size={40} username={selected.username} uri={selected.avatar || undefined} />
            ) : content === 'group' && group ? (
              <View style={styles.peekAvatars}>
                {group.people.slice(0, 4).map((person, index) => (
                  <View
                    key={person.id}
                    style={[styles.peekAvatar, index > 0 && styles.peekAvatarStacked]}
                  >
                    <Avatar size={30} username={person.username} uri={person.avatar || undefined} />
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.peekAvatars}>
                {sharingFriends.slice(0, 5).map((friend, index) => (
                  <View
                    key={friend.id}
                    style={[styles.peekAvatar, index > 0 && styles.peekAvatarStacked]}
                  >
                    <Avatar size={30} username={friend.username} uri={friend.avatar || undefined} />
                  </View>
                ))}
              </View>
            )}

            <View style={styles.peekText}>
              <Text style={styles.peekTitle} numberOfLines={1}>
                {content === 'person' && selected
                  ? selected.full_name || selected.username
                  : content === 'group' && group
                    ? `${group.people.length + (group.includesSelf ? 1 : 0)} personnes ici`
                    : content === 'settings'
                      ? 'Ce que tu partages'
                      : sharingFriends.length > 0
                        ? `${sharingFriends.length} ami${sharingFriends.length > 1 ? 's' : ''} sur la carte`
                        : 'Personne sur la carte'}
              </Text>
              <Text style={styles.peekHint} numberOfLines={1}>
                {content === 'person' && selected
                  ? `Dernière activité : ${freshness(selected.shared_at)}`
                  : content === 'group' && group
                    ? [group.commonPlace, group.includesSelf ? 'dont toi' : null].filter(Boolean).join(' · ') ||
                      'Touche quelqu’un pour le suivre'
                    : isGhost
                      ? 'Tu es en mode fantôme'
                      : 'Ta position est partagée'}
              </Text>
            </View>

            {content === 'person' || content === 'group' ? (
              <Tappable
                onPress={() => { setSelected(null); setGroup(null); setDetent('peek'); }}
                style={styles.cardClose}
                accessibilityLabel="Fermer"
              >
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </Tappable>
            ) : (
              <Animated.View style={{ transform: [{ rotate: chevronTurn }] }}>
                <Ionicons name="chevron-up" size={20} color={colors.textMuted} />
              </Animated.View>
            )}
          </View>
        </Tappable>
        </View>

        {/* Corps : ce qui n'est révélé qu'en dépliant. Hors de l'écran tant
            que la feuille est repliée, donc jamais à cacher à la main. */}
        <View style={[styles.sheetBody, { paddingBottom: insets.bottom }]}>
        {/* ── Une personne ──
            L'en-tête porte déjà son nom et sa dernière activité ; ici ne
            restent que les actions, en pastilles, comme la rangée de Snap. */}
        {content === 'person' && selected && (
          <View style={styles.personBody}>
            <Text style={styles.personWhere} numberOfLines={2}>
              {selected.place_label
                ? `${selected.place_label}${selected.sharing_mode === 'city' ? ' · position approximative' : ''}`
                : selected.sharing_mode === 'city'
                  ? 'Position approximative'
                  : 'Position précise'}
            </Text>
            <View style={styles.personActions}>
              <Tappable
                style={styles.personAction}
                onPress={() =>
                  (navigation as any).navigate('UserProfile', {
                    userId: selected.id,
                    username: selected.username,
                  })
                }
                haptic="select"
              >
                <View style={styles.pillRow}>
                  <Ionicons name="person-outline" size={16} color={colors.accent} />
                  <Text style={styles.personActionText}>Profil</Text>
                </View>
              </Tappable>
              <Tappable style={styles.personAction} onPress={() => focusOn(selected)} haptic="select">
                <View style={styles.pillRow}>
                  <Ionicons name="locate-outline" size={16} color={colors.accent} />
                  <Text style={styles.personActionText}>Centrer</Text>
                </View>
              </Tappable>
            </View>
          </View>
        )}

        {/* ── Un groupe ──
            Le lieu est dans l'en-tête, donc chaque ligne ne porte que ce qui
            la distingue : qui, et depuis quand. */}
        {content === 'group' && group && (
          <ScrollView contentContainerStyle={styles.listContent} nestedScrollEnabled>
            {group.people.map((person) => (
              <Tappable
                key={person.id}
                style={styles.groupRow}
                onPress={() => focusOn(person)}
                haptic="select"
              >
                <View style={styles.groupRowInner}>
                  <Avatar size={34} username={person.username} uri={person.avatar || undefined} />
                  <Text style={styles.groupName} numberOfLines={1}>
                    {person.full_name || person.username}
                  </Text>
                  <Text style={styles.groupWhen}>{shortFreshness(person.shared_at)}</Text>
                  <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
                </View>
              </Tappable>
            ))}
          </ScrollView>
        )}

        {content === 'list' && (
          <>
            <View style={styles.searchRow}>
              <Ionicons name="search" size={16} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Chercher un ami"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <ScrollView
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  tintColor={colors.accent}
                  onRefresh={async () => {
                    setRefreshing(true);
                    await Promise.all([
                      loadFriends(),
                      bounds ? loadNearby(bounds) : Promise.resolve(),
                    ]);
                    setRefreshing(false);
                  }}
                />
              }
            >
              {visibleFriends.length === 0 ? (
                <Text style={styles.emptyText}>
                  {friends.length === 0
                    ? 'Personne pour l’instant. Abonne-toi à des comptes, ou fais-toi suivre : ce sont eux qui peuvent apparaître ici.'
                    : 'Aucun ami à ce nom.'}
                </Text>
              ) : (
                visibleFriends.map((friend) => {
                  const onMap = people.find((person) => person.id === friend.id);
                  return (
                    <View key={friend.id} style={styles.friendRow}>
                      <View style={friend.is_sharing ? styles.friendAvatarLive : undefined}>
                        <Avatar size={40} username={friend.username} uri={friend.avatar || undefined} />
                      </View>

                      <View style={styles.friendText}>
                        <Text style={styles.friendName} numberOfLines={1}>
                          {friend.full_name || friend.username}
                        </Text>
                        <Text style={styles.friendMeta} numberOfLines={1}>
                          {friend.is_sharing
                            ? onMap
                              ? freshness(onMap.shared_at)
                              : 'Sur la carte, hors de la vue'
                            : 'Ne partage pas sa position'}
                        </Text>
                      </View>

                      {friend.is_sharing ? (
                        <Tappable
                          style={[styles.friendAction, !onMap && styles.friendActionMuted]}
                          onPress={() => onMap && focusOn(onMap)}
                          disabled={!onMap}
                          haptic="select"
                        >
                          <Text style={styles.friendActionText}>Voir</Text>
                        </Tappable>
                      ) : (
                        <Tappable
                          style={styles.friendAction}
                          onPress={() => inviteFriend(friend)}
                          disabled={inviting === friend.id}
                          haptic="select"
                        >
                          {inviting === friend.id ? (
                            <ActivityIndicator size="small" color={colors.accent} />
                          ) : (
                            <Text style={styles.friendActionText}>Inviter</Text>
                          )}
                        </Tappable>
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>
          </>
        )}

        {content === 'settings' && (
          <ScrollView contentContainerStyle={styles.sheetContent}>
            <HowItWorks
              id="nf-map-sharing"
              title="Ce que la carte montre de toi"
              points={[
                { icon: 'eye-off-outline', text: 'Par défaut, rien : tu es fantôme tant que tu n’as pas choisi.' },
                { icon: 'people-outline', text: 'Seuls les comptes liés à toi peuvent te voir.' },
                { icon: 'time-outline', text: `Ta position s’efface seule au bout de ${ttlLabel(settings?.policy?.ttl_hours)}.` },
              ]}
            />

            {MODES.map((mode) => {
              const active = settings?.sharing_mode === mode.id;
              return (
                <Tappable
                  key={mode.id}
                  style={[styles.mode, active && styles.modeActive]}
                  onPress={() => changeMode(mode.id)}
                  haptic="select"
                >
                  <View style={styles.modeRow}>
                    <Ionicons
                      name={mode.icon as any}
                      size={20}
                      color={active ? colors.accent : colors.textMuted}
                    />
                    <View style={styles.modeText}>
                      <Text style={[styles.modeLabel, active && styles.modeLabelActive]}>{mode.label}</Text>
                      <Text style={styles.modeHint}>{mode.hint}</Text>
                    </View>
                    {active && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                  </View>
                </Tappable>
              );
            })}

            {settings?.is_live && (
              <Tappable
                style={styles.disappear}
                onPress={async () => {
                  try {
                    await nfMapService.clearPosition();
                    // L'épingle « moi » reste, en fantôme : elle est locale.
                    // Voir `changeMode`.
                    await loadSettings();
                    toast.success('Position effacée');
                  } catch (error: any) {
                    toast.error(error?.message || 'Effacement impossible');
                  }
                }}
              >
                <View style={styles.pillRow}>
                  <Ionicons name="flash-off-outline" size={16} color={colors.red} />
                  <Text style={styles.disappearText}>Disparaître maintenant</Text>
                </View>
              </Tappable>
            )}
          </ScrollView>
        )}
        </View>
      </Animated.View>
    </View>
  );
}

/** Ombre commune aux éléments qui flottent au-dessus de la carte. */
const floating = {
  shadowColor: '#000',
  shadowOpacity: 0.15,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 2 },
  elevation: 4,
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },

  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  round: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    ...floating,
  },
  roundLive: { borderWidth: 1.5, borderColor: colors.accentMuted },
  /** Renvoie le bouton de partage a droite. Voir le commentaire au point d usage. */
  topSpacer: { flex: 1 },

  /** Rangée interne — voir le commentaire au point d'usage. */
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  /**
   * Couche du titre : absolue, donc reellement centree sur l ecran.
   *
   * 108 px de marge de chaque cote = les deux boutons ronds de droite et
   * leurs ecarts. Symetrique des deux cotes pour que le centre reste le
   * centre, meme si un nom long doit s abreger.
   */
  topTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 104,
  },
  /**
   * Le nom du lieu : le TITRE de l'écran, pas une légende.
   *
   * `fonts.heading` — la police des en-têtes de l'app (voir `AppHeader`), pas
   * `display`. Le titre d'un écran doit se lire comme tous les autres titres de
   * l'app ; une graisse à part pour cette seule page se remarque tout de suite,
   * et pas en bien.
   *
   * Ni ombre portée ni pastille. L'ombre était censée le décoller du fond,
   * mais elle empâtait le dessin des lettres — c'est elle qu'on prenait pour
   * une mauvaise police. Elle n'a plus lieu d'être depuis que la carte suit
   * le thème : le texte et le fond de carte viennent désormais de la même
   * palette, ils contrastent par construction.
   */
  placeText: {
    fontFamily: fonts.heading,
    fontSize: 20,
    lineHeight: 25,
    color: colors.textPrimary,
  },

  locateHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  locate: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    ...floating,
  },

  // Posée à gauche, à la même hauteur que le bouton « me localiser » qui occupe
  // la droite : les deux ne se recouvrent jamais.
  notice: {
    position: 'absolute',
    left: 16,
    maxWidth: '68%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: colors.surface,
    ...floating,
  },
  noticeText: { flexShrink: 1, fontFamily: fonts.medium, fontSize: 12, color: colors.textSecondary },

  card: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 18,
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  cardText: { flex: 1, gap: 2 },
  cardName: { fontFamily: fonts.display, fontSize: 15, color: colors.textPrimary },
  cardMeta: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary },
  cardAction: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
  },
  cardActionText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.accent },
  cardClose: { padding: 4 },

  // La fiche d'un groupe empile ses lignes au lieu de les aligner : c'est la
  // seule différence de fond avec la fiche d'une personne, dont elle reprend
  // le fond, le rayon et l'ombre pour rester le même objet aux yeux du lecteur.
  group: { flexDirection: 'column', alignItems: 'stretch', gap: 6, paddingVertical: 10 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  groupTitle: { fontFamily: fonts.display, fontSize: 15, color: colors.textPrimary },
  groupWhere: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary },
  // Discret : c'est une commodité, pas l'action principale de cette fiche —
  // celle-là, c'est de toucher quelqu'un dans la liste.
  groupZoom: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated,
  },
  // ── Corps « une personne » ──
  personBody: { paddingHorizontal: 18, paddingTop: 14, gap: 14 },
  personWhere: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  personActions: { flexDirection: 'row', gap: 10 },
  personAction: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
  },
  personActionText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.accent },

  groupRow: { height: GROUP_ROW_HEIGHT, justifyContent: 'center' },
  groupRowInner: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  groupName: { flex: 1, fontFamily: fonts.medium, fontSize: 14, color: colors.textPrimary },
  // Tabulaires : sans ça les chiffres n'ont pas la même largeur et la colonne
  // de durées tremble d'une ligne à l'autre.
  groupWhen: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },

  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  sheetBody: { flex: 1 },
  handleZone: { alignItems: 'center', paddingTop: 8, paddingBottom: 8 },
  handle: { width: 38, height: 4, borderRadius: 2, backgroundColor: colors.border },

  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },


  peekTouch: { paddingHorizontal: 18 },
  peek: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  peekAvatars: { flexDirection: 'row' },
  peekAvatar: { borderRadius: 17, borderWidth: 2, borderColor: colors.bg },
  // Empilement à la façon d'une pile de jetons : montre qu'il y a du monde
  // sans aligner cinq avatars sur toute la largeur.
  peekAvatarStacked: { marginLeft: -12 },
  peekText: { flex: 1, gap: 2 },
  peekTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.textPrimary },
  peekHint: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.bgElevated,
  },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 13, color: colors.textPrimary },

  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textMuted,
    paddingVertical: 10,
  },

  friendRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  friendAvatarLive: { borderRadius: 24, borderWidth: 2, borderColor: colors.accent, padding: 1 },
  friendText: { flex: 1, gap: 2 },
  friendName: { fontFamily: fonts.semibold, fontSize: 14, color: colors.textPrimary },
  friendMeta: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  friendAction: {
    minWidth: 76,
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
  },
  friendActionMuted: { opacity: 0.45 },
  friendActionText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.accent },

  sheetContent: { padding: 16, gap: 10, paddingBottom: 40 },
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mode: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  modeActive: { borderColor: colors.accentMuted, backgroundColor: colors.accentSoft },
  modeText: { flex: 1, gap: 3 },
  modeLabel: { fontFamily: fonts.semibold, fontSize: 15, color: colors.textSecondary },
  modeLabelActive: { color: colors.textPrimary },
  modeHint: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: colors.textMuted },

  disappear: {
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  disappearText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.red },
});
