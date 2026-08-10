/**
 * 🗺️ Carte glissante — tuiles + marqueurs, sans dépendance native.
 *
 * ── Pourquoi pas `react-native-maps`, et ce que ce choix a coûté ──
 * Écrite à la main pour éviter une dépendance native, donc une recompilation
 * avant toute mise en ligne. Le calcul était mauvais : l'app doit de toute
 * façon être recompilée pour livrer quoi que ce soit, et ce fichier a produit
 * deux régressions visibles (téléportation au relâchement, puis carte
 * entièrement vide). Une bibliothèque éprouvée réglerait d'un coup le rognage,
 * la gestion des tuiles, l'inertie et le zoom continu. À reconsidérer.
 *
 * ── Deux pièges déjà payés, à ne pas réintroduire ──
 *   1. **Une vue rogne ses enfants sur ses propres limites.** Une couche sans
 *      dimensions (`width: 0`) n'affiche RIEN sur Android : c'est ce qui a
 *      rendu la carte entièrement vide. La couche est donc dimensionnée à
 *      chaque rendu sur la boîte englobant ce qu'elle contient, et les enfants
 *      sont placés relativement à cette boîte, à coordonnées positives.
 *   2. **Ne jamais remettre la translation à zéro pour « recentrer ».** Voir
 *      ci-dessous.
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

/** Demi-largeur reservee a une epingle autour de son point d'ancrage. */
const MARKER_BOX = 64;

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

  const markerWorlds = useMemo(
    () =>
      markers.map((marker) => ({
        marker,
        world: latLonToWorld(marker.latitude, marker.longitude, renderedZoom),
      })),
    [markers, renderedZoom]
  );

  /**
   * Boîte englobant tout ce qui est rendu, et positions RELATIVES à cette boîte.
   *
   * Une vue ne peut pas contenir ce qui déborde d'elle : Android rogne ses
   * enfants sur ses propres limites. Une couche sans dimensions n'affiche donc
   * rien du tout — c'est ce qui cassait la carte. On mesure ce qu'on rend, on
   * dimensionne la couche dessus, et on décale les enfants pour qu'ils soient
   * tous à des coordonnées positives à l'intérieur.
   *
   * La boîte bouge quand la liste des tuiles change, mais son décalage est
   * appliqué au même rendu que celui des enfants : rien ne bouge à l'écran.
   * La propriété qui évite le sursaut est préservée — les positions restent
   * dérivées du plan monde, jamais du centre courant.
   */
  const layout = useMemo(() => {
    const xs: number[] = [];
    const ys: number[] = [];

    for (const tile of tiles) {
      xs.push(tile.worldLeft, tile.worldLeft + TILE_SIZE);
      ys.push(tile.worldTop, tile.worldTop + TILE_SIZE);
    }
    for (const { world } of markerWorlds) {
      // Marge autour du marqueur : son épingle déborde de son point d'ancrage.
      xs.push(world.x - MARKER_BOX, world.x + MARKER_BOX);
      ys.push(world.y - MARKER_BOX, world.y + MARKER_BOX);
    }

    if (xs.length === 0) {
      return { left: 0, top: 0, width: 0, height: 0, minX: origin.x, minY: origin.y };
    }

    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);

    return {
      // Position de la boîte dans le repère ancré à l'origine.
      left: minX - origin.x,
      top: minY - origin.y,
      width: maxX - minX,
      height: maxY - minY,
      minX,
      minY,
    };
  }, [tiles, markerWorlds, origin]);

  return (
    <GestureDetector gesture={gestures}>
      <View
        style={[styles.root, style]}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setViewport({ width, height });
        }}
      >
        <Animated.View
          style={[
            styles.layer,
            { left: layout.left, top: layout.top, width: layout.width, height: layout.height },
            layerStyle,
          ]}
        >
          {tiles.map((tile) => (
            <Image
              key={`${tile.z}/${tile.worldLeft}/${tile.worldTop}`}
              source={{ uri: tileUrl(tile) }}
              style={[
                styles.tile,
                { left: tile.worldLeft - layout.minX, top: tile.worldTop - layout.minY },
              ]}
              // Les tuiles n'ont pas de contenu propre : décrites, elles
              // noieraient les marqueurs sous un lecteur d'écran.
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
          ))}

          {markerWorlds.map(({ marker, world }) => (
            <View
              key={marker.id}
              style={[styles.marker, { left: world.x - layout.minX, top: world.y - layout.minY }]}
              pointerEvents="box-none"
            >
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
  // Taille et position calculees a chaque rendu : la couche epouse ce qu'elle
  // contient, sinon Android rogne les tuiles qui debordent.
  layer: { position: 'absolute' } as ViewStyle,
  tile: { position: 'absolute', width: TILE_SIZE, height: TILE_SIZE } as ImageStyle,
  // Le marqueur est ancré par son centre bas, comme une épingle posée sur le
  // point : centré sur son milieu, il désignerait un endroit trop au nord.
  marker: { position: 'absolute', transform: [{ translateX: -22 }, { translateY: -48 }] } as ViewStyle,
});
