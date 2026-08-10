/**
 * 🗺️ Carte glissante — tuiles + marqueurs, sans dépendance native.
 *
 * ── Pourquoi pas `react-native-maps` ──
 * L'app a un dossier `android/` : toute dépendance native impose une
 * recompilation avant la moindre mise en ligne. Une carte faite de tuiles
 * `<Image>` et de gestes Reanimated — tous deux déjà installés — se déploie
 * par une simple mise à jour, ce qui permet au déploiement progressif de
 * commencer tout de suite. Les marqueurs sont des vues React natives, donc
 * les avatars sont ceux de l'app, pas des pastilles dessinées dans une carte.
 *
 * ── Comment ça tient ensemble ──
 * Pendant le geste, on ne recalcule RIEN : la couche entière est déplacée par
 * une transformation, ce qui reste sur le thread UI. Le centre n'est recalculé
 * qu'au relâchement, et c'est seulement là que les tuiles changent. Zoomer
 * fonctionne pareil : l'échelle suit les doigts, puis on retombe sur un niveau
 * de zoom entier — les tuiles n'existent qu'à des niveaux entiers.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Image, StyleSheet, View, type ImageStyle, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { colors } from '../../theme';
import {
  TILE_SIZE,
  clamp,
  panCenter,
  screenPosition,
  visibleTiles,
  type TileRef,
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

/**
 * Fond de carte. Surchargeable par l'environnement : la politique d'usage des
 * tuiles OpenStreetMap interdit le trafic d'une application grand public, il
 * faudra donc pointer un fournisseur dédié avant les paliers élevés.
 */
const TILE_URL =
  process.env.EXPO_PUBLIC_NF_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

function tileUrl(tile: TileRef): string {
  return TILE_URL.replace('{z}', String(tile.z)).replace('{x}', String(tile.x)).replace('{y}', String(tile.y));
}

interface NfMapCanvasProps<T> {
  center: MapCoordinate;
  zoom: number;
  markers: Array<MapMarker<T>>;
  renderMarker: (marker: MapMarker<T>) => React.ReactNode;
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

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);

  /** Applique le déplacement accumulé, puis remet la couche à zéro. */
  const commitPan = useCallback(
    (dx: number, dy: number) => {
      onRegionChange(panCenter(center, zoom, dx, dy), zoom);
    },
    [center, zoom, onRegionChange]
  );

  /** Retombe sur un niveau entier : les tuiles n'existent qu'à ces niveaux. */
  const commitZoom = useCallback(
    (factor: number) => {
      const next = clamp(Math.round(zoom + Math.log2(factor)), MIN_ZOOM, MAX_ZOOM);
      onRegionChange(center, next);
    },
    [center, zoom, onRegionChange]
  );

  const pan = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
    })
    .onEnd((event) => {
      // Le centre bouge à l'inverse du doigt : glisser vers la droite montre
      // ce qui est à l'ouest.
      runOnJS(commitPan)(event.translationX, event.translationY);
      translateX.value = 0;
      translateY.value = 0;
    });

  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = clampWorklet(event.scale, 0.35, 3);
    })
    .onEnd((event) => {
      runOnJS(commitZoom)(clampWorklet(event.scale, 0.35, 3));
      scale.value = withTiming(1, { duration: 140 });
    });

  const gestures = Gesture.Simultaneous(pan, pinch);

  const layerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ] as const,
  }));

  const tiles = useMemo(
    () => (viewport.width > 0 ? visibleTiles(center, zoom, viewport) : []),
    [center, zoom, viewport]
  );

  const placedMarkers = useMemo(() => {
    if (viewport.width === 0) return [];
    return markers.map((marker) => ({
      marker,
      position: screenPosition(marker, center, zoom, viewport),
    }));
  }, [markers, center, zoom, viewport]);

  return (
    <GestureDetector gesture={gestures}>
      <View
        style={[styles.root, style]}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setViewport({ width, height });
        }}
      >
        <Animated.View style={[StyleSheet.absoluteFill, layerStyle]}>
          {tiles.map((tile) => (
            <Image
              key={`${tile.z}/${tile.x}/${tile.y}/${tile.left}`}
              source={{ uri: tileUrl(tile) }}
              style={[styles.tile, { left: tile.left, top: tile.top }]}
              // Les tuiles n'ont pas de contenu propre : décrites, elles
              // noieraient les marqueurs sous un lecteur d'écran.
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
          ))}

          {placedMarkers.map(({ marker, position }) => (
            <View
              key={marker.id}
              style={[styles.marker, { left: position.x, top: position.y }]}
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

/** Copie locale : une fonction importée serait du JS ordinaire dans un worklet. */
function clampWorklet(value: number, min: number, max: number) {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

// Types explicites : sans eux, `StyleSheet.create` infere une union des trois
// familles de styles, et une tuile ne s'accepte plus comme style d'`Image`.
const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden', backgroundColor: colors.bgElevated } as ViewStyle,
  tile: { position: 'absolute', width: TILE_SIZE, height: TILE_SIZE } as ImageStyle,
  // Le marqueur est ancré par son centre bas, comme une épingle posée sur le
  // point : centré sur son milieu, il désignerait un endroit trop au nord.
  marker: { position: 'absolute', transform: [{ translateX: -22 }, { translateY: -48 }] } as ViewStyle,
});
