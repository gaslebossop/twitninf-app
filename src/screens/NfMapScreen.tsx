/**
 * 🗺️ Carte NF — les comptes liés à toi, là où ils ont accepté d'être vus.
 *
 * ── La disposition ──
 * Reprise des codes du genre, parce qu'ils sont devenus l'attente par défaut :
 * carte en plein écran sans barre de titre, commandes flottantes aux coins,
 * pastilles d'avatar en guise de marqueurs, et une feuille glissante en bas
 * qui liste les amis. Rien d'emprunté à une autre application — ni ses icônes,
 * ni ses illustrations, ni son nom : seulement l'agencement, qui est ce que la
 * main connaît déjà.
 *
 * ── Le parti pris ──
 * Une carte de gens est une base de données de déplacements. L'écran montre
 * donc d'abord ce qu'il montrerait DE TOI. Tant que rien n'est choisi, on est
 * fantôme : on voit ceux qui se montrent, et on n'apparaît nulle part.
 *
 * ── Pourquoi la liste d'amis compte autant que la carte ──
 * Une carte vide n'explique rien. La feuille du bas nomme les amis qui ne
 * partagent pas et permet de leur demander — c'est le SEUL chemin par lequel
 * quelqu'un apparaît ici. Aucune position n'est reconstituée depuis les
 * données de localisation collectées ailleurs dans l'app : elles existent pour
 * la fraude et les statistiques, et les afficher publierait la position de
 * gens qui ne l'ont jamais accepté.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

export default function NfMapScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [center, setCenter] = useState<MapCoordinate>(FALLBACK_CENTER);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [people, setPeople] = useState<NfMapPerson[]>([]);
  const [friends, setFriends] = useState<NfMapFriend[]>([]);
  const [settings, setSettings] = useState<NfMapSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<NfMapPerson | null>(null);
  const [search, setSearch] = useState('');
  /** La feuille du bas : repliée sur la liste, dépliée sur les réglages. */
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inviting, setInviting] = useState<string | null>(null);

  /** Bornes réellement affichées, telles que la carte les rapporte. */
  const [bounds, setBounds] = useState<MapBounds | null>(null);

  const isGhost = !settings || settings.sharing_mode === 'ghost';

  // ── Chargements ──
  const loadSettings = useCallback(async () => {
    try {
      const loaded = await nfMapService.getSettings();
      setSettings(loaded);
      // Premier passage, aucun choix fait : on explique avant de montrer.
      if (loaded && loaded.sharing_mode === 'ghost' && !loaded.shared_at) setSettingsOpen(true);
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

  const loadNearby = useCallback(async (bounds: MapBounds) => {
    setPeople(await nfMapService.nearby(bounds));
  }, []);

  useEffect(() => {
    Promise.all([loadSettings(), loadFriends()]).finally(() => setLoading(false));
  }, [loadSettings, loadFriends]);

  /**
   * Une requête par déplacement, et seulement après une pause.
   *
   * Sans ce délai, faire glisser la carte sur quelques écrans déclenchait
   * autant d'appels que de relâchements, dont un seul comptait : le dernier.
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
          toast.success('Tu es invisible', { description: 'Ta position a été effacée.' });
          return;
        }

        // Activer sans envoyer de position laisserait un réglage actif et une
        // carte vide : on enchaîne tout de suite.
        await locateMe({ silent: true });
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

  const focusOn = useCallback((friend: NfMapFriend) => {
    const onMap = people.find((person) => person.id === friend.id);
    if (!onMap) return;
    setCenter({ latitude: Number(onMap.latitude), longitude: Number(onMap.longitude) });
    setZoom(FOCUS_ZOOM);
    setSelected(onMap);
    setSettingsOpen(false);
  }, [people]);

  const markers: Array<MapMarker<NfMapPerson>> = useMemo(
    () =>
      people.map((person) => ({
        id: person.id,
        latitude: Number(person.latitude),
        longitude: Number(person.longitude),
        data: person,
      })),
    [people]
  );

  const visibleFriends = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const matching = needle
      ? friends.filter(
          (friend) =>
            friend.username.toLowerCase().includes(needle) ||
            (friend.full_name || '').toLowerCase().includes(needle)
        )
      : friends;
    // Ceux qui partagent d'abord : c'est ce qu'on vient chercher.
    return matching;
  }, [friends, search]);

  const sharingCount = friends.filter((friend) => friend.is_sharing).length;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* La carte occupe tout l'écran ; les commandes flottent au-dessus. */}
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
            const isSelected = selected?.id === person.id;
            return (
              <Tappable onPress={() => setSelected(person)} haptic="select">
                <View
                  style={[
                    styles.pin,
                    person.sharing_mode === 'city' && styles.pinApproximate,
                    isSelected && styles.pinSelected,
                  ]}
                >
                  <Avatar size={40} username={person.username} uri={person.avatar || undefined} />
                </View>
                <View style={styles.pinTail} />
              </Tappable>
            );
          }}
        />
      </View>

      {/* Commandes flottantes du haut */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <Tappable style={styles.round} onPress={() => navigation.goBack()} accessibilityLabel="Retour">
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </Tappable>

        <View style={styles.statusPill}>
          <Ionicons
            name={isGhost ? 'eye-off' : 'radio'}
            size={13}
            color={isGhost ? colors.textMuted : colors.accent}
          />
          <Text style={styles.statusText}>
            {isGhost ? 'Fantôme' : settings?.sharing_mode === 'city' ? 'Ville' : 'En direct'}
          </Text>
        </View>

        <Tappable
          style={styles.round}
          onPress={() => setSettingsOpen((open) => !open)}
          accessibilityLabel="Réglages de partage"
        >
          <Ionicons name="options-outline" size={20} color={colors.textPrimary} />
        </Tappable>
      </View>

      <Tappable
        style={[styles.locate, { bottom: insets.bottom + 260 }]}
        onPress={() => locateMe()}
        accessibilityLabel="Me localiser"
      >
        <Ionicons name="locate" size={20} color={colors.textPrimary} />
      </Tappable>

      {/* Fiche de la personne touchée */}
      {selected && (
        <View style={[styles.card, { bottom: insets.bottom + 200 }]}>
          <Avatar size={44} username={selected.username} uri={selected.avatar || undefined} />
          <View style={styles.cardText}>
            <Text style={styles.cardName} numberOfLines={1}>
              {selected.full_name || selected.username}
            </Text>
            <Text style={styles.cardMeta} numberOfLines={1}>
              @{selected.username}
              {selected.place_label ? ` · ${selected.place_label}` : ''}
              {selected.sharing_mode === 'city' ? ' · position approximative' : ''}
            </Text>
          </View>
          <Tappable onPress={() => setSelected(null)} style={styles.cardClose}>
            <Ionicons name="close" size={18} color={colors.textMuted} />
          </Tappable>
        </View>
      )}

      {/* Feuille du bas : la liste, ou les réglages */}
      <View style={[styles.sheet, settingsOpen && styles.sheetTall, { paddingBottom: insets.bottom }]}>
        <View style={styles.handle} />

        {settingsOpen ? (
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
                  await loadSettings();
                  toast.success('Position effacée');
                }}
              >
                <Ionicons name="flash-off-outline" size={16} color={colors.red} />
                <Text style={styles.disappearText}>Disparaître maintenant</Text>
              </Tappable>
            )}
          </ScrollView>
        ) : (
          <>
            <View style={styles.searchRow}>
              <Ionicons name="search" size={16} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder={`${sharingCount} sur la carte · chercher un ami`}
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
                    await Promise.all([loadFriends(), bounds ? loadNearby(bounds) : Promise.resolve()]);
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
                visibleFriends.map((friend) => (
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
                          ? 'Sur la carte'
                          : friend.i_follow && friend.follows_me
                            ? 'Ne partage pas sa position'
                            : friend.i_follow
                              ? 'Tu le suis · ne partage pas'
                              : 'Te suit · ne partage pas'}
                      </Text>
                    </View>

                    {friend.is_sharing ? (
                      <Tappable style={styles.friendAction} onPress={() => focusOn(friend)} haptic="select">
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
                ))
              )}
            </ScrollView>
          </>
        )}
      </View>
    </View>
  );
}

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
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    gap: 10,
  },
  round: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  statusText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.textSecondary },

  // Épingle ancrée par le bas : centrée sur son milieu, elle désignerait un
  // point trop au nord.
  pin: {
    borderRadius: 26,
    borderWidth: 2,
    borderColor: colors.accent,
    backgroundColor: colors.surface,
    padding: 2,
  },
  // Une position approximative se signale : la même épingle laisserait croire
  // à une précision qui n'existe pas.
  pinApproximate: { borderStyle: 'dashed', borderColor: colors.textMuted },
  pinSelected: { borderColor: colors.accent, borderWidth: 3 },
  pinTail: {
    alignSelf: 'center',
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.accent,
  },

  locate: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },

  card: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  cardText: { flex: 1, gap: 2 },
  cardName: { fontFamily: fonts.display, fontSize: 15, color: colors.textPrimary },
  cardMeta: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary },
  cardClose: { padding: 6 },

  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 190,
    backgroundColor: colors.bg,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderColor: colors.borderSubtle,
  },
  sheetTall: { height: '68%' },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: 8,
    marginBottom: 6,
  },
  sheetContent: { padding: 16, gap: 10, paddingBottom: 40 },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 6,
    paddingHorizontal: 12,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.bgElevated,
  },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 13, color: colors.textPrimary },

  listContent: { paddingHorizontal: 16, paddingBottom: 20, gap: 4 },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textMuted,
    paddingVertical: 10,
  },

  friendRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  friendAvatarLive: {
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.accent,
    padding: 1,
  },
  friendText: { flex: 1, gap: 2 },
  friendName: { fontFamily: fonts.semibold, fontSize: 14, color: colors.textPrimary },
  friendMeta: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  friendAction: {
    minWidth: 74,
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentMuted,
  },
  friendActionText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.accent },

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
