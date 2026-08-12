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
 * ── Deux règles que ce fichier fait respecter, apprises en tombant ──
 *
 * 1. AUCUN composant tactile (`Tappable`, `Pressable`, `TouchableOpacity`)
 *    dans un `<Marker>`. Un marqueur n'est pas une vue vivante : la carte en
 *    prend une photo et affiche l'image. Les touches n'arrivent donc jamais
 *    jusqu'au `Pressable` — d'où des épingles qui ne répondaient pas — et sur
 *    Android, l'`Animated.View` du `Tappable` continuait de piloter une vue
 *    déjà photographiée : l'app s'arrêtait net, côté natif, sans une ligne de
 *    log JS. Le contenu d'un marqueur est de la vue morte ; l'appui passe par
 *    `onMarkerPress`, que la carte gère elle-même.
 *
 * 2. La caméra ne se pilote QUE par sauts explicites (`camera.nonce`). Ce
 *    composant ne renvoie jamais la carte là où elle est déjà : un doigt qui
 *    déplace la carte ne doit produire aucun recadrage, sinon on retrouve le
 *    sursaut au relâchement qu'on a passé deux versions à supprimer.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';

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
  /** Identité STABLE. Elle ne doit jamais dépendre du zoom — voir `MapMarker`
   *  dans `NfMapScreen` et le commentaire de `SelfSettlingMarker`. */
  id: string;
  latitude: number;
  longitude: number;
  /** Ce que le marqueur affiche à cet instant. Change sans changer l'`id`. */
  contentKey?: string;
  /** Ordre de superposition — la tête d'un groupe passe devant ses membres. */
  zIndex?: number;
  data: T;
}

/**
 * Cible de caméra.
 *
 * `nonce` change à chaque saut VOULU (« me localiser », « voir cet ami »,
 * « ouvrir ce groupe »). C'est lui, et lui seul, qui déclenche une animation :
 * comparer les coordonnées ne suffisait pas, puisque redemander le même point
 * deux fois de suite est une demande légitime.
 */
export interface MapCamera {
  center: MapCoordinate;
  zoom: number;
  nonce: number;
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

/**
 * Fond de carte sombre.
 *
 * L'app est noire ; le fond par défaut de Google Maps est blanc cassé et
 * saturé de routes jaunes. Poser des avatars dessus donnait une page qui ne
 * ressemblait à aucune autre de l'app. On garde les routes et l'eau lisibles,
 * on éteint tout le reste (commerces, transports, étiquettes de POI) : sur une
 * carte de gens, le nom d'une pizzeria n'est que du bruit derrière les visages.
 *
 * Google uniquement — Apple Maps suit le thème du système via
 * `userInterfaceStyle`, il n'accepte pas de feuille de style.
 */
const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#111111' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6B6B6B' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0A0A0A' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#9A9A9A' }],
  },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#171717' }] },
  { featureType: 'park', elementType: 'geometry', stylers: [{ color: '#141B14' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#242424' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2E2E2E' }] },
  { featureType: 'road.local', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0C1420' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3A4A5A' }] },
];

interface NfMapCanvasProps<T> {
  camera: MapCamera;
  markers: Array<MapMarker<T>>;
  renderMarker: (marker: MapMarker<T>) => React.ReactNode;
  /** Appui sur un marqueur. Géré par la carte : voir la règle 1 en en-tête. */
  onMarkerPress?: (marker: MapMarker<T>) => void;
  /** Appui sur le fond de carte — sert à refermer ce qui est ouvert. */
  onPressMap?: () => void;
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

/**
 * Un marqueur qui décide SEUL quand cesser de se laisser photographier.
 *
 * `tracksViewChanges` demande à la carte de re-photographier la vue du
 * marqueur à chaque image. C'est indispensable une fraction de seconde — sinon
 * la photo est prise avant que l'avatar distant soit arrivé et l'épingle reste
 * vide pour toujours — et ruineux au-delà.
 *
 * Le drapeau était global : le moindre changement dans la liste relançait la
 * photo de TOUS les marqueurs pendant plus d'une seconde. Avec vingt-cinq
 * épingles, ça fait des milliers de captures de vues natives en rafale, et
 * c'est le profil de panne connu des marqueurs personnalisés (mémoire qui
 * grimpe, puis arrêt). Ça explique aussi pourquoi la carte ne tombait jamais
 * là où il n'y a personne : sans marqueur, ce code ne s'exécute pas.
 *
 * Ici chaque marqueur s'éteint pour son propre compte, une seule fois, sans
 * jamais réveiller ses voisins.
 */
const SETTLE_MS = 450;

function SelfSettlingMarker({
  contentKey,
  latitude,
  longitude,
  zIndex,
  onPress,
  children,
}: {
  /**
   * Décrit ce que le marqueur AFFICHE, pas qui il est.
   *
   * Un marqueur garde son identité toute la session — c'est ce qui évite de le
   * démonter, donc de faire tomber l'app — mais son apparence change : une
   * épingle isolée devient la tête d'un groupe quand on dézoome. Comme la
   * photo est figée après un instant, il faut la réarmer précisément à ces
   * moments-là, et à ces moments-là seulement.
   */
  contentKey: string;
  latitude: number;
  longitude: number;
  zIndex?: number;
  onPress?: () => void;
  children: React.ReactNode;
}) {
  const [tracks, setTracks] = useState(true);

  useEffect(() => {
    setTracks(true);
    const timer = setTimeout(() => setTracks(false), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [contentKey]);

  return (
    <Marker
      coordinate={{ latitude, longitude }}
      // Ancré par le bas : centré sur son milieu, le marqueur désignerait un
      // point trop au nord.
      anchor={{ x: 0.5, y: 1 }}
      zIndex={zIndex}
      tracksViewChanges={tracks}
      onPress={onPress}
      /*
       * Sans ça, l'épingle est inutilisable sur iOS.
       *
       * Sur Apple Maps, toucher un marqueur déclenche SON `onPress` puis, dans
       * la foulée, celui de la carte — ce que ce drapeau existe précisément
       * pour empêcher. Le `onPress` de la carte sert à refermer ce qui est
       * ouvert : il effaçait donc la fiche dans l'instant où le marqueur
       * venait de la remplir, et toucher quelqu'un ne semblait rien faire.
       *
       * À ne pas confondre avec le champ `action: 'marker-press'` de
       * l'événement de carte, qui permettrait de filtrer — il est documenté
       * Android uniquement et vaut `undefined` ici.
       */
      stopPropagation
    >
      {children}
    </Marker>
  );
}

export default function NfMapCanvas<T>({
  camera,
  markers,
  renderMarker,
  onMarkerPress,
  onPressMap,
  onRegionChange,
  style,
}: NfMapCanvasProps<T>) {
  const mapRef = useRef<MapView | null>(null);

  const initialRegion = useMemo<Region>(
    () => ({
      latitude: camera.center.latitude,
      longitude: camera.center.longitude,
      latitudeDelta: deltaForZoom(camera.zoom),
      longitudeDelta: deltaForZoom(camera.zoom),
    }),
    // Volontairement figée : `initialRegion` ne sert qu'au premier rendu, la
    // suite passe par `animateToRegion`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Saut explicite demandé par l'écran. Un déplacement au doigt ne change pas
  // le `nonce`, donc ne repasse jamais ici : la carte n'est jamais recadrée
  // sous le doigt.
  const lastNonce = useRef(camera.nonce);
  useEffect(() => {
    if (camera.nonce === lastNonce.current) return;
    lastNonce.current = camera.nonce;
    mapRef.current?.animateToRegion(
      {
        latitude: camera.center.latitude,
        longitude: camera.center.longitude,
        latitudeDelta: deltaForZoom(camera.zoom),
        longitudeDelta: deltaForZoom(camera.zoom),
      },
      350
    );
  }, [camera]);

  /**
   * Un marqueur sans coordonnées valides fait tomber le natif.
   *
   * `Number(null)` vaut 0 et `Number(undefined)` vaut `NaN` : une ligne à
   * laquelle il manque une latitude arrivait jusqu'ici. Côté natif, un point
   * `NaN` n'est pas rejeté proprement, il produit l'objet nil qui fait
   * exploser le tableau de marqueurs. On filtre à l'entrée plutôt que d'y
   * faire confiance.
   */
  const safeMarkers = useMemo(
    () =>
      markers.filter(
        (marker) =>
          Number.isFinite(marker.latitude) &&
          Number.isFinite(marker.longitude) &&
          Math.abs(marker.latitude) <= 90 &&
          Math.abs(marker.longitude) <= 180
      ),
    [markers]
  );


  /**
   * Première fenêtre, dès que la carte est posée.
   *
   * Sur Android, `onRegionChangeComplete` ne se déclenche PAS au premier
   * affichage (bug connu de la bibliothèque, corrigé en 1.24.11 mais qu'on ne
   * veut pas être seul à devoir croire) : sans ce rattrapage, l'écran n'a
   * aucune fenêtre à interroger tant que le doigt n'a pas bougé la carte —
   * d'où une carte vide à l'arrivée, qui ne se peuplait qu'après un dézoom.
   *
   * On demande ses bornes à la carte plutôt que de les recalculer : elle seule
   * sait ce qu'elle affiche vraiment, une fois les marges appliquées.
   */
  /**
   * Tant que la carte native n'a pas répondu « je suis prête », AUCUN
   * marqueur n'est monté.
   *
   * Sur iOS, poser des marqueurs pendant que la carte s'installe encore fait
   * tomber l'app dans `-[__NSArrayM insertObject:atIndex:]: object cannot be
   * nil` : du code natif, donc pas une ligne dans la console JS. C'est la même
   * famille de panne que le montage/démontage de marqueurs sous la Nouvelle
   * Architecture, corrigée côté bibliothèque à partir de 1.21 — mais la garde
   * ne coûte rien et couvre le cas où la course se rejoue.
   */
  const [ready, setReady] = useState(false);

  const handleMapReady = useCallback(async () => {
    setReady(true);
    try {
      const box = await mapRef.current?.getMapBoundaries();
      if (!box) return;
      const { northEast, southWest } = box;
      const north = Math.max(northEast.latitude, southWest.latitude);
      const south = Math.min(northEast.latitude, southWest.latitude);
      const east = Math.max(northEast.longitude, southWest.longitude);
      const west = Math.min(northEast.longitude, southWest.longitude);
      if (![north, south, east, west].every(Number.isFinite)) return;

      onRegionChange(
        { latitude: (north + south) / 2, longitude: (east + west) / 2 },
        zoomForDelta(east - west),
        { north, south, east, west }
      );
    } catch {
      // La carte n'est pas prête à répondre : le premier déplacement prendra
      // le relais. Rien à signaler à l'utilisateur.
    }
  }, [onRegionChange]);

  const handleRegionChangeComplete = useCallback(
    (region: Region) => {
      // Une région non finie (carte pas encore posée sur Android) ferait
      // remonter des bornes `NaN` jusqu'à la requête réseau et au calcul des
      // groupes.
      if (!Number.isFinite(region.latitude) || !Number.isFinite(region.longitudeDelta)) return;

      onRegionChange(
        { latitude: region.latitude, longitude: region.longitude },
        zoomForDelta(region.longitudeDelta),
        {
          north: region.latitude + region.latitudeDelta / 2,
          south: region.latitude - region.latitudeDelta / 2,
          east: region.longitude + region.longitudeDelta / 2,
          west: region.longitude - region.longitudeDelta / 2,
        }
      );
    },
    [onRegionChange]
  );

  return (
    <View style={[styles.root, style]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        // Google des deux côtés serait un fond identique partout, mais impose
        // une clé sur iOS aussi ; on garde Apple Maps sur iOS, en sombre.
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        customMapStyle={Platform.OS === 'android' ? DARK_MAP_STYLE : undefined}
        userInterfaceStyle="dark"
        initialRegion={initialRegion}
        onRegionChangeComplete={handleRegionChangeComplete}
        onMapReady={handleMapReady}
        onPress={onPressMap}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        showsPointsOfInterest={false}
        showsBuildings={false}
        showsTraffic={false}
        toolbarEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
      >
        {ready &&
          safeMarkers.map((marker) => (
            <SelfSettlingMarker
              key={marker.id}
              contentKey={marker.contentKey ?? marker.id}
              latitude={marker.latitude}
              longitude={marker.longitude}
              zIndex={marker.zIndex}
              onPress={() => onMarkerPress?.(marker)}
            >
              {renderMarker(marker)}
            </SelfSettlingMarker>
          ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
});
