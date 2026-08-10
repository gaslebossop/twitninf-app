/**
 * 🗺️ Carte de la Carte NF, sur `react-native-maps`.
 *
 * ── Pourquoi cette bibliothèque, après une version écrite à la main ──
 * La première version posait ses propres tuiles pour éviter une dépendance
 * native, donc une recompilation. Le calcul était mauvais : l'app doit de
 * toute façon être recompilée pour livrer quoi que ce soit, et ce fichier a
 * produit deux régressions visibles — la carte qui se téléporte au
 * relâchement, puis la carte entièrement vide (une couche sans dimensions
 * rogne tout son contenu). Zoom continu, inertie, gestion mémoire des tuiles
 * et rognage sont des problèmes déjà résolus ; les réécrire coûtait plus que
 * la dépendance.
 *
 * ── Ce que ce composant garde de l'ancien ──
 * Exactement la même interface (`center`, `zoom`, `markers`, `renderMarker`,
 * `onRegionChange`), pour que l'écran et l'API n'aient rien à savoir du
 * changement. Les marqueurs restent des vues React : les avatars affichés sont
 * ceux de l'app, pas des pastilles dessinées par la carte.
 *
 * ── Fond de carte ──
 * Sur iOS, le fournisseur par défaut est Apple Maps : aucune clé, rien à
 * configurer. Sur Android, Google Maps exige une clé dans `app.json`
 * (`android.config.googleMaps.apiKey`) — sans elle, la carte s'affiche grise.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';

export interface MapCoordinate {
  latitude: number;
  longitude: number;
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface MapMarker<T = unknown> {
  id: string;
  latitude: number;
  longitude: number;
  data: T;
}

/**
 * Conversion entre le niveau de zoom « tuiles » (3 à 17, celui que manipule
 * l'écran) et l'étendue en degrés attendue par `react-native-maps`.
 *
 * Le monde fait 360° de large sur `2^zoom` tuiles : une fenêtre couvre donc
 * `360 / 2^zoom` degrés de longitude, à peu près. Rester dans l'unité « zoom »
 * côté écran évite d'avoir à raisonner en deltas dans le reste du code.
 */
const deltaForZoom = (zoom: number) => 360 / Math.pow(2, zoom);
const zoomForDelta = (delta: number) => Math.log2(360 / Math.max(delta, 1e-6));

interface NfMapCanvasProps<T> {
  center: MapCoordinate;
  zoom: number;
  markers: Array<MapMarker<T>>;
  renderMarker: (marker: MapMarker<T>) => React.ReactNode;
  /**
   * Appelé quand le déplacement est terminé, pas pendant.
   *
   * Les bornes viennent de la carte elle-même : les recalculer à partir du
   * centre et du zoom serait une approximation, alors que la carte connaît
   * exactement ce qu'elle affiche.
   */
  onRegionChange: (center: MapCoordinate, zoom: number, bounds: MapBounds) => void;
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
  const mapRef = useRef<MapView | null>(null);

  /**
   * Dernière région annoncée au parent.
   *
   * Le parent renvoie ce centre en `props`, et sans cette mémoire on
   * réappliquerait notre propre écho à la carte : elle serait recadrée juste
   * après chaque déplacement, ce qui redonnerait exactement le sursaut qu'on
   * a passé deux versions à supprimer.
   */
  const lastReported = useRef<{ center: MapCoordinate; zoom: number }>({ center, zoom });

  const initialRegion = useMemo<Region>(
    () => ({
      latitude: center.latitude,
      longitude: center.longitude,
      latitudeDelta: deltaForZoom(zoom),
      longitudeDelta: deltaForZoom(zoom),
    }),
    // Volontairement figée : `initialRegion` ne sert qu'au premier rendu, la
    // suite passe par `animateToRegion`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Le parent a sauté ailleurs (« me localiser », « voir cet ami »). On anime
  // vers la nouvelle région ; un déplacement au doigt, lui, ne repasse jamais
  // ici puisqu'il correspond à notre propre écho.
  useEffect(() => {
    const echo = lastReported.current;
    const sameCenter =
      Math.abs(center.latitude - echo.center.latitude) < 1e-9 &&
      Math.abs(center.longitude - echo.center.longitude) < 1e-9;
    const sameZoom = Math.abs(zoom - echo.zoom) < 1e-6;
    if (sameCenter && sameZoom) return;

    lastReported.current = { center, zoom };
    mapRef.current?.animateToRegion(
      {
        latitude: center.latitude,
        longitude: center.longitude,
        latitudeDelta: deltaForZoom(zoom),
        longitudeDelta: deltaForZoom(zoom),
      },
      350
    );
  }, [center, zoom]);

  /**
   * `tracksViewChanges` : le marqueur est photographié une fois puis figé.
   *
   * Figé trop tôt, la photo est prise avant l'arrivée de l'avatar distant, et
   * le marqueur reste vide pour toujours. On laisse donc le suivi actif un
   * court instant après chaque changement de liste, puis on le coupe — le
   * garder actif redessine chaque marqueur à chaque image et fait tomber la
   * carte à quelques images par seconde dès qu'il y en a une dizaine.
   */
  const [tracksChanges, setTracksChanges] = useState(true);
  useEffect(() => {
    setTracksChanges(true);
    const timer = setTimeout(() => setTracksChanges(false), 2000);
    return () => clearTimeout(timer);
  }, [markers]);

  const handleRegionChangeComplete = useCallback(
    (region: Region) => {
      const next = { latitude: region.latitude, longitude: region.longitude };
      const nextZoom = zoomForDelta(region.longitudeDelta);
      lastReported.current = { center: next, zoom: nextZoom };
      onRegionChange(next, nextZoom, {
        north: region.latitude + region.latitudeDelta / 2,
        south: region.latitude - region.latitudeDelta / 2,
        east: region.longitude + region.longitudeDelta / 2,
        west: region.longitude - region.longitudeDelta / 2,
      });
    },
    [onRegionChange]
  );

  return (
    <View style={[styles.root, style]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        onRegionChangeComplete={handleRegionChangeComplete}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
      >
        {markers.map((marker) => (
          <Marker
            key={marker.id}
            coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
            // Ancré par le bas : centré sur son milieu, le marqueur
            // désignerait un point trop au nord.
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={tracksChanges}
          >
            {renderMarker(marker)}
          </Marker>
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
});
