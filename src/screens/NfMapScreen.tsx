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

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';

import { colors, fonts } from '../theme';
import { Tappable, HowItWorks } from '../components/ui';
import { toast } from '../components/ui/Toast';
import Avatar from '../components/Avatar';
import MapPin from '../components/map/MapPin';
import NfMapCanvas, {
  type MapBounds,
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
/** Hauteur approximative de la feuille ouverte, pour décaler ce qui flotte. */
const OPEN_HEIGHT = 330;

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

export default function NfMapScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [center, setCenter] = useState<MapCoordinate>(FALLBACK_CENTER);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
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

  const loadNearby = useCallback(async (window: MapBounds) => {
    setPeople(await nfMapService.nearby(window));
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
      setCenter(here);
      setZoom(FOCUS_ZOOM);

      if (settings && settings.sharing_mode !== 'ghost') {
        try {
          await nfMapService.pushPosition(here.latitude, here.longitude);
          await loadSettings();
        } catch {
          toast.error('Position non partagée', { description: 'Réessaie dans un instant.' });
        }
      }
    },
    [settings, loadSettings]
  );

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

  const focusOn = useCallback((person: NfMapPerson) => {
    setCenter({ latitude: Number(person.latitude), longitude: Number(person.longitude) });
    setZoom(FOCUS_ZOOM);
    setSelected(person);
    setSheet('peek');
  }, []);

  const markers: Array<MapMarker<NfMapPerson | null>> = useMemo(() => {
    const list: Array<MapMarker<NfMapPerson | null>> = people.map((person) => ({
      id: person.id,
      latitude: Number(person.latitude),
      longitude: Number(person.longitude),
      data: person,
    }));

    // Se voir soi-même est le seul moyen de vérifier ce que les autres voient.
    if (myPosition && !isGhost) {
      list.push({
        id: '__moi__',
        latitude: myPosition.latitude,
        longitude: myPosition.longitude,
        data: null,
      });
    }
    return list;
  }, [people, myPosition, isGhost]);

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
  const floatingBottom = (sheet === 'peek' ? PEEK_HEIGHT : OPEN_HEIGHT) + 16;

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
          center={center}
          zoom={zoom}
          markers={markers}
          onRegionChange={(nextCenter, nextZoom, nextBounds) => {
            setCenter(nextCenter);
            setZoom(nextZoom);
            setBounds(nextBounds);
          }}
          renderMarker={(marker) => {
            const person = marker.data;
            if (!person) return <MapPin username="moi" label="Toi" self />;

            return (
              <Tappable onPress={() => setSelected(person)} haptic="select">
                <MapPin
                  username={person.username}
                  avatar={person.avatar}
                  label={(person.full_name || person.username).split(' ')[0]}
                  approximate={person.sharing_mode === 'city'}
                  selected={selected?.id === person.id}
                />
              </Tappable>
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
          <Ionicons name="search" size={17} color={colors.textMuted} />
          <Text style={styles.searchPlaceholder} numberOfLines={1}>
            {sharingFriends.length > 0
              ? `${sharingFriends.length} ami${sharingFriends.length > 1 ? 's' : ''} sur la carte`
              : 'Chercher un ami'}
          </Text>
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

      <Tappable
        style={[styles.locate, { bottom: floatingBottom }]}
        onPress={() => locateMe()}
        accessibilityLabel="Me localiser"
      >
        <Ionicons name="locate" size={20} color={colors.textPrimary} />
      </Tappable>

      {/* ── Fiche de la personne touchée ── */}
      {selected && (
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

      {/* ── Feuille du bas ── */}
      <View
        style={[
          styles.sheet,
          sheet === 'peek' ? { height: PEEK_HEIGHT + insets.bottom } : styles.sheetOpen,
          { paddingBottom: insets.bottom },
        ]}
      >
        <Tappable
          style={styles.handleZone}
          onPress={() => setSheet(sheet === 'peek' ? 'list' : 'peek')}
          haptic="tap"
        >
          <View style={styles.handle} />
        </Tappable>

        {sheet === 'peek' && (
          <Tappable style={styles.peek} onPress={() => setSheet('list')} haptic="tap">
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
                {sharingFriends.length > 0
                  ? `${sharingFriends.length} ami${sharingFriends.length > 1 ? 's' : ''} sur la carte`
                  : 'Personne sur la carte'}
              </Text>
              <Text style={styles.peekHint} numberOfLines={1}>
                {isGhost ? 'Tu es en mode fantôme' : 'Ta position est partagée'}
              </Text>
            </View>

            <Ionicons name="chevron-up" size={18} color={colors.textMuted} />
          </Tappable>
        )}

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
                <Ionicons name="flash-off-outline" size={16} color={colors.red} />
                <Text style={styles.disappearText}>Disparaître maintenant</Text>
              </Tappable>
            )}
          </ScrollView>
        )}
      </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 21,
    backgroundColor: colors.surface,
    ...floating,
  },
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
  sheetOpen: { height: '72%' },
  handleZone: { alignItems: 'center', paddingTop: 8, paddingBottom: 8 },
  handle: { width: 38, height: 4, borderRadius: 2, backgroundColor: colors.border },

  peek: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18 },
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
  mode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  disappearText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.red },
});
