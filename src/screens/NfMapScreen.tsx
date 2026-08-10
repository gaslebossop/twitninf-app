/**
 * 🗺️ Carte NF — les comptes que tu suis, là où ils ont accepté d'être vus.
 *
 * ── Le parti pris ──
 * Une carte de gens est une base de données de déplacements. L'écran est donc
 * construit à l'envers de la plupart : il ne demande pas « veux-tu activer la
 * carte ? » mais montre d'abord ce qu'il montrerait de toi. Tant qu'on n'a
 * rien choisi, on est fantôme — on voit les autres si eux ont choisi de se
 * montrer, et on n'apparaît nulle part.
 *
 * ── Ce que l'écran ne fait pas ──
 * Il n'envoie aucune position en tâche de fond. La position part quand cet
 * écran est ouvert, et seulement là : une carte qui suit ses utilisateurs
 * quand elle est fermée n'est plus une carte, c'est un traceur.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';

import { colors, fonts } from '../theme';
import { Header, Tappable, HowItWorks } from '../components/ui';
import { toast } from '../components/ui/Toast';
import Avatar from '../components/Avatar';
import NfMapCanvas, { type MapCoordinate, type MapMarker } from '../components/map/NfMapCanvas';
import { viewportBounds } from '../utils/mercator';
import {
  nfMapService,
  type NfMapPerson,
  type NfMapSettings,
  type SharingMode,
} from '../services/nfMapService';

/** Vue par défaut si l'on n'a pas encore de position : l'Europe de l'Ouest. */
const FALLBACK_CENTER: MapCoordinate = { latitude: 48.8566, longitude: 2.3522 };
const DEFAULT_ZOOM = 11;

const MODES: Array<{ id: SharingMode; label: string; hint: string; icon: string }> = [
  {
    id: 'ghost',
    label: 'Fantôme',
    hint: 'Personne ne te voit. Tu vois quand même les autres.',
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
    hint: 'Là où tu es vraiment. À réserver à un moment, pas à la journée.',
    icon: 'navigate-outline',
  },
];

export default function NfMapScreen() {
  const navigation = useNavigation();

  const [center, setCenter] = useState<MapCoordinate>(FALLBACK_CENTER);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [people, setPeople] = useState<NfMapPerson[]>([]);
  const [settings, setSettings] = useState<NfMapSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selected, setSelected] = useState<NfMapPerson | null>(null);

  const viewportRef = useRef({ width: 390, height: 700 });

  // ── Réglages ──
  const loadSettings = useCallback(async () => {
    try {
      const loaded = await nfMapService.getSettings();
      setSettings(loaded);
      // Premier passage sans choix explicite : on explique avant de montrer.
      if (loaded && loaded.sharing_mode === 'ghost' && !loaded.shared_at) setPanelOpen(true);
    } catch {
      /* La carte reste lisible sans ses réglages. */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // ── Personnes visibles dans la fenêtre ──
  const loadNearby = useCallback(
    async (nextCenter: MapCoordinate, nextZoom: number) => {
      const bounds = viewportBounds(nextCenter, nextZoom, viewportRef.current);
      const found = await nfMapService.nearby(bounds);
      setPeople(found);
    },
    []
  );

  useEffect(() => {
    loadNearby(center, zoom);
  }, [center, zoom, loadNearby]);

  /**
   * Position de l'appareil.
   *
   * Demandée pour CENTRER la carte, ce qui ne suppose aucun partage : elle
   * n'est envoyée au serveur que si un mode de partage a été choisi.
   */
  const locateMe = useCallback(async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      toast.info('Position refusée', {
        description: 'La carte reste utilisable, elle ne sera juste pas centrée sur toi.',
      });
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

    if (settings && settings.sharing_mode !== 'ghost') {
      try {
        await nfMapService.pushPosition(here.latitude, here.longitude);
        await loadSettings();
      } catch {
        toast.error('Position non partagée', { description: 'Réessaie dans un instant.' });
      }
    }
  }, [settings, loadSettings]);

  const changeMode = useCallback(
    async (mode: SharingMode) => {
      try {
        const updated = await nfMapService.setSettings({ sharing_mode: mode });
        setSettings(updated);

        if (mode === 'ghost') {
          toast.success('Tu es invisible', { description: 'Ta position a été effacée.' });
          return;
        }

        // Passer en mode visible sans envoyer de position laisserait un
        // réglage actif et une carte vide : on enchaîne tout de suite.
        await locateMe();
        toast.success(mode === 'city' ? 'Ta ville est partagée' : 'Ta position est partagée', {
          description: `Elle disparaît toute seule au bout de ${updated.policy?.ttl_hours ?? 8} h.`,
        });
      } catch (error: any) {
        toast.error(error?.message || 'Réglage impossible');
      }
    },
    [locateMe]
  );

  const markers: Array<MapMarker<NfMapPerson>> = people.map((person) => ({
    id: person.id,
    latitude: Number(person.latitude),
    longitude: Number(person.longitude),
    data: person,
  }));

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Header
        title="Carte NF"
        onBack={() => navigation.goBack()}
        right={
          <Tappable onPress={() => setPanelOpen((open) => !open)} style={styles.headerAction}>
            <Ionicons
              name={settings?.sharing_mode === 'ghost' ? 'eye-off-outline' : 'radio-outline'}
              size={22}
              color={settings?.sharing_mode === 'ghost' ? colors.textMuted : colors.accent}
            />
          </Tappable>
        }
      />

      <View
        style={styles.mapWrap}
        onLayout={(event) => {
          viewportRef.current = {
            width: event.nativeEvent.layout.width,
            height: event.nativeEvent.layout.height,
          };
        }}
      >
        <NfMapCanvas
          center={center}
          zoom={zoom}
          markers={markers}
          onRegionChange={(nextCenter, nextZoom) => {
            setCenter(nextCenter);
            setZoom(nextZoom);
          }}
          renderMarker={(marker) => {
            const person = marker.data;
            return (
              <Tappable onPress={() => setSelected(person)} haptic="select">
                <View
                  style={[
                    styles.pin,
                    person.sharing_mode === 'city' && styles.pinApproximate,
                  ]}
                >
                  <Avatar size={38} username={person.username} uri={person.avatar || undefined} />
                </View>
              </Tappable>
            );
          }}
        />

        <Tappable style={styles.locate} onPress={locateMe} accessibilityLabel="Me localiser">
          <Ionicons name="locate" size={20} color={colors.textPrimary} />
        </Tappable>

        {people.length === 0 && (
          <View style={styles.emptyOverlay} pointerEvents="none">
            <Text style={styles.emptyText}>
              Personne ici pour l’instant. Seuls les comptes que tu suis et qui partagent leur
              position apparaissent.
            </Text>
          </View>
        )}
      </View>

      {selected && (
        <View style={styles.card}>
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

      {panelOpen && (
        <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
          <HowItWorks
            id="nf-map-sharing"
            title="Ce que la carte montre de toi"
            points={[
              { icon: 'eye-off-outline', text: 'Par défaut, rien : tu es fantôme tant que tu n’as pas choisi.' },
              { icon: 'people-outline', text: 'Seuls les comptes que tu suis en retour te voient.' },
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  headerAction: { paddingHorizontal: 8, paddingVertical: 6 },

  mapWrap: { flex: 1 },
  pin: {
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.accent,
    backgroundColor: colors.surface,
    padding: 2,
  },
  // Une position approximative se signale : la même épingle pour les deux
  // modes laisserait croire à une précision qui n'existe pas.
  pinApproximate: { borderStyle: 'dashed', borderColor: colors.textMuted },

  locate: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  emptyOverlay: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 90,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  card: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 90,
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

  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '62%',
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: colors.borderSubtle,
  },
  panelContent: { padding: 16, gap: 10, paddingBottom: 40 },

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
