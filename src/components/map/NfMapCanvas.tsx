/**
 * 🗺️ Carte glissante — tuiles + marqueurs, sans dépendance native.
 *
 * ── Pourquoi pas `react-native-maps` ──
 * L'app a un dossier `android/` : toute dépendance native impose une
 * recompilation avant la moindre mise en ligne. Une carte faite de tuiles
 * `<Image>` et de gestes Reanimated — tous deux déjà installés — se déploie
 * par une simple mise à jour. Les marqueurs sont des vues React natives, donc
 * les avatars sont ceux de l'app.
 *
 * ── Ce qui fait qu'elle ne saute plus ──
 * Première version : la couche était translatée pendant le geste, puis remise
 * à zéro au relâchement pendant qu'on recalculait le centre. La remise à zéro
 * se fait sur le thread UI, le nouveau centre arrive un ou deux rendus plus
 * tard : entre les deux, la carte revenait au point de départ puis sautait à
 * l'arrivée. D'où l'impression de téléportation, d'autant plus visible que les
 * tuiles mettaient du temps à charger.
 *
 * La règle qui règle ça : **les tuiles et les marqueurs sont posés en
 * coordonnées ABSOLUES du plan monde**, jamais relativement au centre courant.
 * Recalculer la liste des tuiles n'en déplace donc aucune ; seule la
 * transformation de la couche fait bouger la carte, et elle suit le doigt en
 * continu sans jamais être remise à zéro. Il n'y a plus qu'un seul moment où
 * la carte se réancre volontairement : le changement de niveau de zoom, où les
 * tuiles changent de résolution.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, StyleSheet, View, type ImageStyle, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { colors } from '../../theme';
import {
  TILE_SIZE,
  clamp,
  latLonToWorld,
  tilesAroundWorldPoint,
  worldToLatLon,
  type WorldTile,
} from '../../utils/mercator';

export interface MapCoordinate {
  latitude: number;
  longitude: number;
}

export interface MapMarker<T = unknown> {
  id: string;
  latitude: number;
  longitude: number;
  data: T;
}

const MIN_ZOOM = 3;
const MAX_ZOOM = 17;

/** Déplacement au-delà duquel on étend la liste des tuiles, en pixels. */
const TILE_REFRESH_DISTANCE = 96;

/**
 * Fond de carte.
 *
 * CARTO « Voyager » plutôt que le rendu standard d'OpenStreetMap : couleurs
 * douces, mer bleue, étiquettes lisibles — beaucoup plus proche de ce qu'on
 * attend d'une carte sociale que du plan routier détaillé d'OSM, qui charge
 * l'écran de routes secondaires sous les avatars.
 *
 * Surchargeable par l'environnement, et il FAUDRA le faire : ces fonds
 * gratuits ne tiennent pas le trafic d'une application grand public, et leur
 * licence impose de citer OpenStreetMap et CARTO dans l'écran.
 */
const TILE_URL =
  process.env.EXPO_PUBLIC_NF_MAP_TILE_URL ||
  'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png';

function tileUrl(tile: WorldTile): string {
  return TILE_URL.replace('{z}', String(tile.z))
    .replace('{x}', String(tile.x))
    .replace('{y}', String(tile.y));
}

interface NfMapCanvasProps<T> {
  center: MapCoordinate;
  zoom: number;
  markers: Array<MapMarker<T>>;
  renderMarker: (marker: MapMarker<T>) => React.ReactNode;
  /** Appelé au relâchement seulement — pas à chaque image du geste. */
  onRegionChange: (center: MapCoordinate, zoom: number) => void;
  style?: any;
}

export default function NfMapCanvas<T>({
  center,
  zoom,
  markers,
  renderMarker,
  onRegionChange,
  style,
}: NfMapCanvasProps<T>) {
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  /**
   * Origine du repère : le point du plan monde auquel les enfants sont ancrés.
   * Ne change qu'au changement de zoom ou lorsqu'on saute ailleurs — jamais
   * pendant un déplacement.
   */
  const [origin, setOrigin] = useState(() => latLonToWorld(center.latitude, center.longitude, zoom));
  const [renderedZoom, setRenderedZoom] = useState(Math.round(zoom));

  /** Déplacement courant depuis l'origine, en pixels du plan monde. */
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const pinchScale = useSharedValue(1);

  /** Copie JS du déplacement, rafraîchie par paliers : sert UNIQUEMENT à
   *  décider quelles tuiles exister, jamais où les poser. */
  const [tilePan, setTilePan] = useState({ x: 0, y: 0 });

  /** Dernier centre annoncé au parent : évite de se réancrer sur son propre écho. */
  const lastReported = useRef<MapCoordinate>(center);

  // ── Réancrage volontaire ──
  // Le parent a sauté ailleurs (« me localiser », « voir cet ami ») ou changé
  // de zoom. On repose l'origine et on repart d'un déplacement nul.
  useEffect(() => {
    const sameAsEcho =
      Math.abs(center.latitude - lastReported.current.latitude) < 1e-9 &&
      Math.abs(center.longitude - lastReported.current.longitude) < 1e-9;
    const sameZoom = Math.round(zoom) === renderedZoom;
    if (sameAsEcho && sameZoom) return;

    setOrigin(latLonToWorld(center.latitude, center.longitude, Math.round(zoom)));
    setRenderedZoom(Math.round(zoom));
    lastReported.current = center;
    panX.value = 0;
    panY.value = 0;
    setTilePan({ x: 0, y: 0 });
  }, [center, zoom, renderedZoom, panX, panY]);

  /** Centre visuel courant, en géographique. */
  const currentCenter = useCallback(
    (dx: number, dy: number): MapCoordinate =>
      worldToLatLon(origin.x + dx, origin.y + dy, renderedZoom),
    [origin, renderedZoom]
  );

  const commitRegion = useCallback(
    (dx: number, dy: number) => {
      const next = currentCenter(dx, dy);
      lastReported.current = next;
      onRegionChange(next, renderedZoom);
    },
    [currentCenter, onRegionChange, renderedZoom]
  );

  const commitZoom = useCallback(
    (factor: number, dx: number, dy: number) => {
      const next = clamp(Math.round(renderedZoom + Math.log2(factor)), MIN_ZOOM, MAX_ZOOM);
      const visual = currentCenter(dx, dy);
      lastReported.current = visual;
      // Même centre, autre résolution : c'est le seul saut assumé.
      onRegionChange(visual, next);
    },
    [currentCenter, onRegionChange, renderedZoom]
  );

  const extendTiles = useCallback((x: number, y: number) => setTilePan({ x, y }), []);

  // Étend la couverture pendant le déplacement. Comme les tuiles sont posées en
  // absolu, en ajouter n'en bouge aucune : ça peut donc arriver n'importe quand.
  useAnimatedReaction(
    () => ({ x: panX.value, y: panY.value }),
    (now, previous) => {
      if (!previous) return;
      if (
        Math.abs(now.x - previous.x) > TILE_REFRESH_DISTANCE ||
        Math.abs(now.y - previous.y) > TILE_REFRESH_DISTANCE
      ) {
        runOnJS(extendTiles)(now.x, now.y);
      }
    }
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onStart(() => {
          startX.value = panX.value;
          startY.value = panY.value;
        })
        .onUpdate((event) => {
          // La carte suit le doigt : aller vers la droite ramène l'ouest.
          panX.value = startX.value - event.translationX;
          panY.value = startY.value - event.translationY;
        })
        .onEnd(() => {
          // Aucune remise à zéro ici : le déplacement RESTE appliqué, et le
          // parent apprend simplement le nouveau centre. C'est ce qui supprime
          // l'aller-retour de l'ancienne version.
          runOnJS(commitRegion)(panX.value, panY.value);
          runOnJS(extendTiles)(panX.value, panY.value);
        }),
    [commitRegion, extendTiles, panX, panY, startX, startY]
  );

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onUpdate((event) => {
          pinchScale.value = Math.min(Math.max(event.scale, 0.35), 3);
        })
        .onEnd((event) => {
          const factor = Math.min(Math.max(event.scale, 0.35), 3);
          runOnJS(commitZoom)(factor, panX.value, panY.value);
          pinchScale.value = withTiming(1, { duration: 120 });
        }),
    [commitZoom, panX, panY, pinchScale]
  );

  const gestures = useMemo(() => Gesture.Simultaneous(pan, pinch), [pan, pinch]);

  const layerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: viewport.width / 2 - panX.value },
      { translateY: viewport.height / 2 - panY.value },
      { scale: pinchScale.value },
    ] as const,
  }));

  const tiles = useMemo(() => {
    if (viewport.width === 0) return [];
    return tilesAroundWorldPoint(
      { x: origin.x + tilePan.x, y: origin.y + tilePan.y },
      renderedZoom,
      viewport,
      2
    );
  }, [origin, tilePan, renderedZoom, viewport]);

  // Position absolue des marqueurs : indépendante du déplacement, donc jamais
  // recalculée en glissant.
  const placedMarkers = useMemo(
    () =>
      markers.map((marker) => {
        const world = latLonToWorld(marker.latitude, marker.longitude, renderedZoom);
        return { marker, left: world.x - origin.x, top: world.y - origin.y };
      }),
    [markers, origin, renderedZoom]
  );

  return (
    <GestureDetector gesture={gestures}>
      <View
        style={[styles.root, style]}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setViewport({ width, height });
        }}
      >
        <Animated.View style={[styles.layer, layerStyle]}>
          {tiles.map((tile) => (
            <Image
              key={`${tile.z}/${tile.worldLeft}/${tile.worldTop}`}
              source={{ uri: tileUrl(tile) }}
              style={[
                styles.tile,
                { left: tile.worldLeft - origin.x, top: tile.worldTop - origin.y },
              ]}
              // Les tuiles n'ont pas de contenu propre : décrites, elles
              // noieraient les marqueurs sous un lecteur d'écran.
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
          ))}

          {placedMarkers.map(({ marker, left, top }) => (
            <View key={marker.id} style={[styles.marker, { left, top }]} pointerEvents="box-none">
              {renderMarker(marker)}
            </View>
          ))}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

// Types explicites : sans eux, `StyleSheet.create` infère une union des trois
// familles de styles, et une tuile ne s'accepte plus comme style d'`Image`.
const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden', backgroundColor: '#A9C9E8' } as ViewStyle,
  // La couche n'a pas de taille : ses enfants sont posés en absolu autour de
  // son origine, y compris en coordonnées négatives.
  layer: { position: 'absolute', left: 0, top: 0, width: 0, height: 0 } as ViewStyle,
  tile: { position: 'absolute', width: TILE_SIZE, height: TILE_SIZE } as ImageStyle,
  // Le marqueur est ancré par son centre bas, comme une épingle posée sur le
  // point : centré sur son milieu, il désignerait un endroit trop au nord.
  marker: { position: 'absolute', transform: [{ translateX: -22 }, { translateY: -48 }] } as ViewStyle,
});
