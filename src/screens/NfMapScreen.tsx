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
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';

import { colors, fonts } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { Tappable, HowItWorks } from '../components/ui';
import { toast } from '../components/ui/Toast';
import Avatar from '../components/Avatar';
import MapPin from '../components/map/MapPin';
import MapCluster from '../components/map/MapCluster';
import { clusterize, quantizedDegreesPerPixel } from '../utils/mapCluster';
import NfMapCanvas, {
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
/** Zoom appliqué quand on saute sur quelqu'un depuis la liste. */
const FOCUS_ZOOM = 14;

/** Hauteur de la feuille repliée — juste de quoi lire le résumé. */
const PEEK_HEIGHT = 112;
/** Hauteur réelle de la feuille, constante : c'est la translation qui bouge. */
const SHEET_HEIGHT = Math.round(Dimensions.get('window').height * 0.72);
/** Ouverture un peu plus lente que la fermeture : on suit ce qui se révèle. */
const OPEN_MS = 260;
const CLOSE_MS = 200;

type SheetMode = 'peek' | 'list' | 'settings';

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
 * Ce qu'un marqueur MONTRE à un instant donné.
 *
 * Le rôle change avec le zoom ; l'identité du marqueur, elle, ne change
 * jamais — c'est toute la raison d'être de ce type. Voir le commentaire de
 * `markers` plus bas.
 */
type MarkerRole =
  | { kind: 'self' }
  | { kind: 'solo'; person: NfMapPerson }
  | { kind: 'head'; person: NfMapPerson; faces: NfMapPerson[] }
  | { kind: 'member' };

export default function NfMapScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

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
  const [search, setSearch] = useState('');
  const [sheet, setSheet] = useState<SheetMode>('peek');
  const [inviting, setInviting] = useState<string | null>(null);

  const isGhost = !settings || settings.sharing_mode === 'ghost';

  // ── Chargements ──
  const loadSettings = useCallback(async () => {
    try {
      const loaded = await nfMapService.getSettings();
      setSettings(loaded);
      // Premier passage, aucun choix fait : on explique avant de montrer.
      if (loaded && loaded.sharing_mode === 'ghost' && !loaded.shared_at) setSheet('settings');
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
  const loadNearby = useCallback(async (window: MapBounds) => {
    const fresh = await nfMapService.nearby(window);
    if (fresh.length === 0) return;

    setPeople((current) => {
      const byId = new Map(current.map((person) => [person.id, person]));
      let changed = false;

      for (const person of fresh) {
        const known = byId.get(person.id);
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

  useEffect(() => {
    Promise.all([loadSettings(), loadFriends()]).finally(() => setLoading(false));
  }, [loadSettings, loadFriends]);

  /**
   * Une requête par déplacement, et seulement après une pause : sans ce délai,
   * traverser la carte déclenchait autant d'appels que de relâchements, dont
   * un seul comptait.
   */
  useEffect(() => {
    if (!bounds) return undefined;
    const timer = setTimeout(() => loadNearby(bounds), 280);
    return () => clearTimeout(timer);
  }, [bounds, loadNearby]);

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
          setMyPosition(null);
          toast.success('Tu es invisible', { description: 'Ta position a été effacée.' });
          return;
        }

        // Activer sans envoyer de position laisserait un réglage actif et une
        // carte vide : on enchaîne tout de suite.
        await locateMe({ silent: true });
        setSheet('peek');
        toast.success(mode === 'city' ? 'Ta ville est partagée' : 'Ta position est partagée', {
          description: `Elle disparaît seule au bout de ${updated.policy?.ttl_hours ?? 8} h.`,
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
      jumpTo(
        { latitude: Number(person.latitude), longitude: Number(person.longitude) },
        FOCUS_ZOOM
      );
      setSelected(person);
      setSheet('peek');
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

      // Un groupe s'ouvre en zoomant dessus. Deux paliers d'un coup : un seul
      // ne suffit souvent pas à séparer des gens d'un même quartier, et on
      // aurait à retoucher plusieurs fois le même tas.
      //
      // Les membres réagissent comme la tête : ils sont réduits à un point
      // sous elle, mais restent tactiles sur quelques pixels. Un appui un peu
      // bas tomberait sinon dans le vide alors qu'on visait le groupe.
      if (role.kind === 'head' || role.kind === 'member') {
        jumpTo(
          { latitude: marker.latitude, longitude: marker.longitude },
          Math.min(liveZoom.current + 2, 17)
        );
        setSelected(null);
        return;
      }

      setSelected(role.person);
      setSheet('peek');
    },
    [jumpTo]
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
   * UN marqueur par personne, pour toute la session — et son identifiant est
   * celui de la personne, JAMAIS celui d'un groupe.
   *
   * ── Le regroupement sans démontage ──
   * Regrouper naïvement fabrique des marqueurs dont l'identité dépend du zoom :
   * trois personnes forment un marqueur au loin, trois marqueurs de près. Tout
   * zoom démonte alors des marqueurs — et démonter un marqueur fait tomber
   * l'app sur la version de `react-native-maps` que fige Expo Go, côté natif,
   * sans une ligne de log.
   *
   * D'où ce détour : la liste des marqueurs ne bouge jamais, c'est leur RÔLE
   * qui change. Une personne est tour à tour épingle isolée, tête de groupe
   * (elle porte alors les visages de tout le groupe), ou membre — auquel cas
   * elle glisse au centre du groupe et se réduit à un point, invisible
   * derrière la tête. Rien n'est monté ni démonté : seules des coordonnées et
   * des enfants changent, c'est-à-dire des props.
   */
  const markers: Array<MapMarker<MarkerRole>> = useMemo(() => {
    const clusters = clusterize(
      people.map((person) => ({
        id: person.id,
        latitude: Number(person.latitude),
        longitude: Number(person.longitude),
        person,
      })),
      clusterScale
    );

    const list: Array<MapMarker<MarkerRole>> = [];

    for (const cluster of clusters) {
      if (cluster.items.length === 1) {
        const { person } = cluster.items[0];
        list.push({
          id: person.id,
          latitude: cluster.latitude,
          longitude: cluster.longitude,
          contentKey: `solo${selected?.id === person.id ? ':sel' : ''}`,
          zIndex: 2,
          data: { kind: 'solo', person },
        });
        continue;
      }

      // Tête choisie par identifiant, pas par ordre d'arrivée : le même groupe
      // doit désigner la même tête à chaque calcul, sinon deux marqueurs
      // échangent leur apparence pour rien.
      const members = [...cluster.items].sort((a, b) => a.id.localeCompare(b.id));
      const [head, ...rest] = members;
      const faces = members.map(({ person }) => person);

      list.push({
        id: head.person.id,
        latitude: cluster.latitude,
        longitude: cluster.longitude,
        contentKey: `head:${faces.length}:${faces.slice(0, 3).map((p) => p.id).join(',')}`,
        zIndex: 3,
        data: { kind: 'head', person: head.person, faces },
      });

      for (const member of rest) {
        list.push({
          id: member.person.id,
          // Rassemblés sur la tête : c'est ce qui fait disparaître le tas.
          latitude: cluster.latitude,
          longitude: cluster.longitude,
          contentKey: 'member',
          zIndex: 1,
          data: { kind: 'member' },
        });
      }
    }

    // Se voir soi-même est le seul moyen de vérifier ce que les autres voient.
    // Y COMPRIS en mode fantôme : cette épingle est locale, elle ne publie
    // rien. La cacher tant qu'on ne partage pas — donc par défaut, donc à la
    // toute première ouverture — donnait une carte où on ne se trouve pas.
    // L'épingle dit alors explicitement que personne d'autre ne la voit.
    if (myPosition) {
      list.push({
        id: '__moi__',
        latitude: myPosition.latitude,
        longitude: myPosition.longitude,
        contentKey: `self:${isGhost ? 'ghost' : 'live'}`,
        zIndex: 4,
        data: { kind: 'self' },
      });
    }
    return list;
  }, [people, myPosition, isGhost, clusterScale, selected]);

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
   * Feuille dépliée : elle couvre les trois quarts bas de l'écran.
   *
   * Ce qui flotte au-dessus de la carte est alors DÉMONTÉ, pas décalé. La
   * version précédente le décalait de `OPEN_HEIGHT` (330 px), une constante
   * qui n'a jamais correspondu aux 72 % réels de la feuille : le bouton « me
   * localiser » et surtout la fiche de la personne touchée se retrouvaient
   * dessous, visibles nulle part et impossibles à fermer. C'est le « on ne
   * peut pas fermer les popups ».
   */
  const isSheetOpen = sheet !== 'peek';
  const floatingBottom = PEEK_HEIGHT + insets.bottom + 16;

  /**
   * Glissement de la feuille, piloté en natif.
   *
   * `0` = dépliée. Repliée, on la descend juste assez pour ne laisser dépasser
   * que l'en-tête : le corps sort de l'écran au lieu d'être démonté, donc rien
   * ne se recompose pendant l'animation.
   */
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progress, {
      toValue: isSheetOpen ? 1 : 0,
      duration: isSheetOpen ? OPEN_MS : CLOSE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [isSheetOpen, progress]);

  const slide = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [SHEET_HEIGHT - PEEK_HEIGHT - insets.bottom, 0],
  });
  const chevronTurn = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
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
          onPressMap={() => {
            setSelected(null);
            if (sheet !== 'peek') setSheet('peek');
          }}
          onRegionChange={(_nextCenter, nextZoom, nextBounds) => {
            liveZoom.current = nextZoom;
            setBounds(nextBounds);
          }}
          renderMarker={(marker) => {
            const role = marker.data;

            if (role.kind === 'self') {
              return (
                <MapPin
                  username={user?.username || 'moi'}
                  avatar={user?.avatar}
                  label={isGhost ? 'Toi · invisible' : 'Toi'}
                  self
                  hidden={isGhost}
                />
              );
            }

            // Membre d'un groupe : posé au centre du groupe, sous la tête qui
            // le recouvre. Un point plutôt que rien du tout — un marqueur sans
            // contenu retombe sur l'épingle rouge par défaut de la carte.
            if (role.kind === 'member') return <MapPin username="" collapsed />;

            if (role.kind === 'head') {
              return (
                <MapCluster
                  count={role.faces.length}
                  faces={role.faces.map((person) => ({
                    id: person.id,
                    username: person.username,
                    avatar: person.avatar,
                  }))}
                />
              );
            }

            const { person } = role;
            return (
              <MapPin
                username={person.username}
                avatar={person.avatar}
                label={person.username}
                approximate={person.sharing_mode === 'city'}
                selected={selected?.id === person.id}
              />
            );
          }}
        />
      </View>

      {/* ── Barre du haut : retour, recherche, partage ── */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <Tappable style={styles.round} onPress={() => navigation.goBack()} accessibilityLabel="Retour">
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </Tappable>

        <Tappable
          style={styles.searchPill}
          onPress={() => setSheet('list')}
          accessibilityLabel="Chercher un ami"
        >
          {/* Rangée dans une vue interne : `Tappable` pose le style sur sa vue
              externe, alors que ses enfants vivent dans un `Pressable` sans
              style — la loupe se retrouvait au-dessus du texte. */}
          <View style={styles.pillRow}>
            <Ionicons name="search" size={17} color={colors.textMuted} />
            <Text style={styles.searchPlaceholder} numberOfLines={1}>
              {sharingFriends.length > 0
                ? `${sharingFriends.length} ami${sharingFriends.length > 1 ? 's' : ''} sur la carte`
                : 'Chercher un ami'}
            </Text>
          </View>
        </Tappable>

        <Tappable
          style={[styles.round, !isGhost && styles.roundLive]}
          onPress={() => setSheet(sheet === 'settings' ? 'peek' : 'settings')}
          accessibilityLabel="Réglages de partage"
        >
          <Ionicons
            name={isGhost ? 'eye-off-outline' : 'radio'}
            size={19}
            color={isGhost ? colors.textPrimary : colors.accent}
          />
        </Tappable>
      </View>

      {!isSheetOpen && (
        <Tappable
          style={[styles.locate, { bottom: floatingBottom }]}
          onPress={() => locateMe()}
          accessibilityLabel="Me localiser"
        >
          <Ionicons name="locate" size={20} color={colors.textPrimary} />
        </Tappable>
      )}

      {/* ── Voile : referme la feuille dépliée en touchant la carte ──
          Une feuille qui occupe les trois quarts de l'écran sans rien derrière
          qui la referme se lit comme un cul-de-sac. */}
      {isSheetOpen && (
        <Pressable
          style={styles.backdrop}
          onPress={() => setSheet('peek')}
          accessibilityLabel="Refermer"
        />
      )}

      {/* ── Fiche de la personne touchée ── */}
      {selected && !isSheetOpen && (
        <View style={[styles.card, { bottom: floatingBottom + 58 }]}>
          <Avatar size={44} username={selected.username} uri={selected.avatar || undefined} />
          <View style={styles.cardText}>
            <Text style={styles.cardName} numberOfLines={1}>
              {selected.full_name || selected.username}
            </Text>
            <Text style={styles.cardMeta} numberOfLines={1}>
              {freshness(selected.shared_at)}
              {selected.place_label ? ` · ${selected.place_label}` : ''}
              {selected.sharing_mode === 'city' ? ' · approximatif' : ''}
            </Text>
          </View>
          <Tappable
            style={styles.cardAction}
            onPress={() =>
              (navigation as any).navigate('UserProfile', {
                userId: selected.id,
                username: selected.username,
              })
            }
            haptic="select"
          >
            <Text style={styles.cardActionText}>Profil</Text>
          </Tappable>
          <Tappable onPress={() => setSelected(null)} style={styles.cardClose}>
            <Ionicons name="close" size={18} color={colors.textMuted} />
          </Tappable>
        </View>
      )}

      {/* ── Feuille du bas ──
          Hauteur FIXE, translation animée. Changer la hauteur d'une vue ne
          peut pas passer par le pilote natif : la feuille sautait d'un état à
          l'autre en une image, ce qui se lit comme un défaut d'affichage
          plutôt que comme une ouverture. En glissant une feuille de taille
          constante, l'animation tourne côté natif et ne dépend plus du fil JS.
          C'est le même patron que `ConfirmSheet`. */}
      <Animated.View
        style={[styles.sheet, { height: SHEET_HEIGHT, transform: [{ translateY: slide }] }]}
      >
        <Tappable
          style={styles.handleZone}
          onPress={() => setSheet(sheet === 'peek' ? 'list' : 'peek')}
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
          onPress={() => setSheet(isSheetOpen ? 'peek' : 'list')}
          haptic="tap"
          scaleTo={1}
        >
          <View style={styles.peek}>
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

            <View style={styles.peekText}>
              <Text style={styles.peekTitle} numberOfLines={1}>
                {sheet === 'settings'
                  ? 'Ce que tu partages'
                  : sharingFriends.length > 0
                    ? `${sharingFriends.length} ami${sharingFriends.length > 1 ? 's' : ''} sur la carte`
                    : 'Personne sur la carte'}
              </Text>
              <Text style={styles.peekHint} numberOfLines={1}>
                {isGhost ? 'Tu es en mode fantôme' : 'Ta position est partagée'}
              </Text>
            </View>

            <Animated.View style={{ transform: [{ rotate: chevronTurn }] }}>
              <Ionicons name="chevron-up" size={20} color={colors.textMuted} />
            </Animated.View>
          </View>
        </Tappable>

        {/* Corps : ce qui n'est révélé qu'en dépliant. Hors de l'écran tant
            que la feuille est repliée, donc jamais à cacher à la main. */}
        <View style={[styles.sheetBody, { paddingBottom: insets.bottom }]}>
        {sheet === 'list' && (
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

        {sheet === 'settings' && (
          <ScrollView contentContainerStyle={styles.sheetContent}>
            <HowItWorks
              id="nf-map-sharing"
              title="Ce que la carte montre de toi"
              points={[
                { icon: 'eye-off-outline', text: 'Par défaut, rien : tu es fantôme tant que tu n’as pas choisi.' },
                { icon: 'people-outline', text: 'Seuls les comptes liés à toi peuvent te voir.' },
                { icon: 'time-outline', text: `Ta position s’efface seule au bout de ${settings?.policy?.ttl_hours ?? 8} h.` },
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
                  await nfMapService.clearPosition();
                  setMyPosition(null);
                  await loadSettings();
                  toast.success('Position effacée');
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

  searchPill: {
    flex: 1,
    height: 42,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 21,
    backgroundColor: colors.surface,
    ...floating,
  },
  /** Rangée interne — voir le commentaire au point d'usage. */
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchPlaceholder: { flex: 1, fontFamily: fonts.medium, fontSize: 14, color: colors.textSecondary },

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
