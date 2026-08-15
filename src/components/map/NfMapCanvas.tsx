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
 * 1. LE MAPVIEW A UN NOMBRE FIXE D'ENFANTS, et un `<Marker>` n'a jamais
 *    d'enfant à lui.
 *
 *    C'est la règle la plus chèrement payée du projet, et il a fallu un journal
 *    de plantage pour la formuler juste. `AIRMap insertReactSubview:atIndex:`
 *    termine par `[_reactSubviews insertObject:… atIndex:atIndex]` sans borner
 *    l'index : dès que la transaction de montage de Fabric en demande un
 *    au-delà du tableau, `NSMutableArray` lève
 *    `NSRangeException: index 10 beyond bounds [0 .. 8]`. C'est exactement ce
 *    qu'on a lu dans le rapport de l'appareil.
 *
 *    On a d'abord cru que le fautif était le CONTENU des marqueurs — la couche
 *    d'interopérabilité de Fabric ne supporte effectivement pas les composants
 *    à enfants personnalisés, et les épingles sont pour cette raison devenues
 *    des images rendues par le serveur (`api/src/services/nfMapPinService.js`).
 *    Mais ça ne suffisait pas : ce sont les `<Marker>` EUX-MÊMES, en tant
 *    qu'enfants du `MapView`, qui font dériver l'index. Le montage par paquets
 *    et le vidage à la perte du focus, ajoutés pour « ménager » le natif,
 *    fabriquaient même précisément les retraits qui cassent.
 *
 *    D'où le pool : `MARKER_POOL_SIZE` emplacements posés une fois, clés par
 *    index, jamais un de plus ni un de moins. Tout le reste — apparaître,
 *    disparaître, changer de personne — est devenu un changement de props.
 *
 * 2. La caméra ne se pilote QUE par sauts explicites (`camera.nonce`). Ce
 *    composant ne renvoie jamais la carte là où elle est déjà : un doigt qui
 *    déplace la carte ne doit produire aucun recadrage, sinon on retrouve le
 *    sursaut au relâchement qu'on a passé deux versions à supprimer.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
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
  /** Identité STABLE. Elle ne doit jamais dépendre du zoom — voir `mapMarkers`. */
  id: string;
  latitude: number;
  longitude: number;
  /**
   * URL de l'image de l'épingle, dessinée par le serveur.
   *
   * C'est la SEULE façon de peupler un marqueur ici : voir la règle 1 en
   * en-tête. Changer cette URL est un changement de prop, que la carte encaisse
   * sans risque — contrairement à un changement d'enfants.
   */
  image: string;
  /**
   * Où, dans l'image, se trouve le point désigné (0 = haut, 1 = bas).
   *
   * Il diffère d'une sorte d'épingle à l'autre : une épingle de personne pointe
   * par sa pointe, un groupe se centre sur ses membres. Les valeurs viennent du
   * service de rendu — voir `PIN_ANCHOR_Y` dans `nfMapService`.
   */
  anchorY: number;
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
 * Conversion entre le niveau de zoom « tuiles » (celui que manipule l'écran) et
 * l'étendue en degrés attendue par `react-native-maps`.
 *
 * Le monde fait 360° de large sur `2^zoom` tuiles : une fenêtre couvre donc
 * `360 / 2^zoom` degrés de longitude, à peu près. Rester dans l'unité « zoom »
 * côté écran évite d'avoir à raisonner en deltas dans le reste du code.
 */
const deltaForZoom = (zoom: number) => 360 / Math.pow(2, zoom);
const zoomForDelta = (delta: number) => Math.log2(360 / Math.max(delta, 1e-6));

/**
 * Bornes des SAUTS de caméra — pas du zoom que fait le doigt.
 *
 * La distinction est le fruit d'une régression : passées à la carte native via
 * `minZoomLevel` / `maxZoomLevel`, ces bornes font planter le pincement (voir
 * le commentaire au point d'usage, dans le JSX). Le zoom affiché reste donc
 * libre ; ce qui est borné, c'est ce que NOUS demandons à la caméra.
 *
 * Elles servent de filet : `regionForCamera` est le seul chemin par lequel un
 * cadrage descend au natif, et il garantit ainsi qu'aucun delta absurde n'y
 * arrive — un `MKCoordinateRegion` dont le `latitudeDelta` dépasse 180 lève une
 * exception Objective-C, sans une ligne de log JS.
 *
 * Le plancher ne protège PAS la requête réseau : c'est `queryableBounds`, côté
 * écran, qui ramène la fenêtre interrogée aux 12° que le serveur accepte.
 */
export const MIN_ZOOM = 4;
export const MAX_ZOOM = 18;

const clampZoom = (zoom: number) =>
  Number.isFinite(zoom) ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) : MIN_ZOOM;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/**
 * Région VALIDE pour un centre et un zoom.
 *
 * Deux corrections par rapport à la version précédente, qui posait
 * `latitudeDelta = longitudeDelta` :
 *
 *   - le format de l'écran. Sur un téléphone deux fois plus haut que large,
 *     demander deux deltas égaux fait cadrer la carte sur le plus contraignant
 *     des deux : on obtenait systématiquement plus large que demandé, et
 *     « ouvrir un groupe » ne séparait pas ses membres ;
 *   - la latitude. En Mercator, un degré de latitude occupe `1 / cos(lat)`
 *     fois plus de pixels qu'un degré de longitude.
 *
 * Tout ce qui sort d'ici est fini et dans les bornes du globe, quoi qu'on
 * reçoive en entrée.
 */
function regionForCamera(
  center: MapCoordinate,
  zoom: number,
  aspectRatio: number
): Region {
  const latitude = clamp(Number.isFinite(center.latitude) ? center.latitude : 0, -85, 85);
  const longitude = clamp(Number.isFinite(center.longitude) ? center.longitude : 0, -180, 180);

  const longitudeDelta = clamp(deltaForZoom(clampZoom(zoom)), 1e-4, 360);
  const cosine = Math.max(0.05, Math.cos((latitude * Math.PI) / 180));
  const latitudeDelta = clamp(longitudeDelta * aspectRatio * cosine, 1e-4, 180);

  return { latitude, longitude, latitudeDelta, longitudeDelta };
}

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
 * Nombre de marqueurs posés sur la carte. FIXE, pour toute la session.
 *
 * ── Ce que ce nombre empêche ──
 * `AIRMap insertReactSubview:atIndex:` finit par
 * `[_reactSubviews insertObject:… atIndex:atIndex]`, sans borner l'index. Dès
 * que la transaction de montage de Fabric demande un index au-delà du tableau,
 * `NSMutableArray` lève `NSRangeException: index 10 beyond bounds [0 .. 8]` —
 * le crash, tel quel, dans le journal de l'appareil. Et l'index dérive parce
 * que `removeReactSubview:` retire par identité pendant que les insertions,
 * elles, arrivent par index.
 *
 * Ce n'était donc PAS le contenu des marqueurs, comme on l'a cru : ce sont les
 * marqueurs eux-mêmes, en tant qu'enfants du `MapView`. Les rendre sans enfants
 * n'y changeait rien, et le vidage par paquets qu'on avait ajouté fabriquait
 * précisément les retraits qui font dériver l'index.
 *
 * La parade tient en une phrase : le `MapView` reçoit `MARKER_POOL_SIZE`
 * enfants au premier rendu, et plus jamais un de plus ni un de moins. Une
 * épingle qui apparaît, disparaît ou change de place n'est plus qu'un
 * changement de props sur un emplacement déjà posé.
 *
 * ── Pourquoi 64 ──
 * Le regroupement fusionne tout ce qui tient dans 72 px : un écran de
 * téléphone n'expose donc jamais plus d'une soixantaine de cases. Les
 * emplacements inutilisés portent un pixel transparent et ne coûtent rien.
 */
const MARKER_POOL_SIZE = 64;

/** Un pixel transparent : l'emplacement est là, mais ne montre rien. */
const PARKED_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/**
 * Où dorment les emplacements inutilisés.
 *
 * Un point fixe, et non le centre courant : une coordonnée qui suivrait la
 * carte réécrirait soixante marqueurs à chaque déplacement du doigt, pour des
 * vues que personne ne voit.
 */
const PARKED_COORDINATE = { latitude: 0, longitude: 0 };

/**
 * Un EMPLACEMENT de marqueur, pas un marqueur.
 *
 * Il est monté une fois et ne repart jamais. Quand il porte quelqu'un, il
 * affiche son épingle ; sinon il se gare hors de vue avec un pixel transparent.
 * Voir `MARKER_POOL_SIZE` pour ce que cette permanence évite.
 *
 * Mémoïsé : sans cette barrière, tout rendu de l'écran — une lettre tapée dans
 * la recherche d'amis, une image de l'animation de la feuille — renvoie une
 * mise à jour aux soixante-quatre emplacements.
 */
function MarkerSlotView<T>({
  marker,
  onMarkerPress,
}: {
  /** `null` = emplacement libre. */
  marker: MapMarker<T> | null;
  onMarkerPress?: (marker: MapMarker<T>) => void;
}) {
  return (
    <Marker
      coordinate={
        marker ? { latitude: marker.latitude, longitude: marker.longitude } : PARKED_COORDINATE
      }
      // Le point désigné n'est pas au centre de l'image : une épingle pointe
      // par sa pointe, sous laquelle il reste encore l'étiquette du pseudo.
      //
      // ⚠️ Sans effet sur Apple Maps : `anchor` n'existe que dans
      // `AirGoogleMaps`. Sur iOS l'image est donc centrée sur la coordonnée.
      anchor={{ x: 0.5, y: marker ? marker.anchorY : 0.5 }}
      zIndex={marker?.zIndex ?? 0}
      image={{ uri: marker ? marker.image : PARKED_IMAGE }}
      // Aucune vue à suivre : la carte n'a rien à re-photographier. Laisser la
      // valeur par défaut (vrai) ferait redessiner le marqueur à chaque image
      // pour un contenu qui ne bouge jamais.
      tracksViewChanges={false}
      onPress={marker && onMarkerPress ? () => onMarkerPress(marker) : undefined}
      /*
       * Sans ça, l'épingle est inutilisable sur iOS.
       *
       * Sur Apple Maps, toucher un marqueur déclenche SON `onPress` puis, dans
       * la foulée, celui de la carte — ce que ce drapeau existe précisément
       * pour empêcher. Le `onPress` de la carte sert à refermer ce qui est
       * ouvert : il effaçait donc la fiche dans l'instant où le marqueur
       * venait de la remplir, et toucher quelqu'un ne semblait rien faire.
       */
      stopPropagation
    />
  );
}

const MarkerSlot = React.memo(MarkerSlotView) as typeof MarkerSlotView;

export default function NfMapCanvas<T>({
  camera,
  markers,
  onMarkerPress,
  onPressMap,
  onRegionChange,
  style,
}: NfMapCanvasProps<T>) {
  const mapRef = useRef<MapView | null>(null);

  /**
   * Format réel de la carte, mesuré.
   *
   * Il sert à calculer un `latitudeDelta` cohérent avec le `longitudeDelta`
   * demandé — voir `regionForCamera`. Mesuré plutôt que déduit de
   * `Dimensions.get('window')` : la carte n'occupe pas forcément tout l'écran,
   * et sur Android la fenêtre inclut des barres système qui n'en font pas
   * partie. Le repli 16/9 ne sert qu'à la toute première image.
   */
  const aspectRatio = useRef(16 / 9);
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) aspectRatio.current = height / width;
  }, []);

  const initialRegion = useMemo<Region>(
    () => regionForCamera(camera.center, camera.zoom, Dimensions.get('window').height / Dimensions.get('window').width),
    // Volontairement figée : `initialRegion` ne sert qu'au premier rendu, la
    // suite passe par `animateToRegion`. La mesure de `onLayout` n'est pas
    // encore disponible ici, d'où la fenêtre système en approximation.
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
    // Tout passe par `regionForCamera` : c'est le seul endroit qui garantit
    // qu'aucune valeur non finie ou hors du globe n'atteint le natif, où elle
    // lèverait une exception sans laisser de trace côté JS.
    mapRef.current?.animateToRegion(
      regionForCamera(camera.center, camera.zoom, aspectRatio.current),
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

  /**
   * Le point de passage OBLIGÉ de tout ce qui remonte vers l'écran.
   *
   * Ce qui sortait d'ici sans contrôle a produit deux pannes visibles :
   *
   *   - `north` à 97°, `west` à -214°. Un rectangle qui déborde du globe part
   *     tel quel dans la requête, que le serveur refuse — et `nearby` rend une
   *     liste vide sans distinguer « refusé » de « personne ici ». La carte
   *     cessait de se peupler dès qu'on dézoomait un peu ;
   *   - une fenêtre à cheval sur l'antiméridien. `getMapBoundaries` rend alors
   *     un coin nord-est à -170° et un sud-ouest à 170° : trier ces deux
   *     nombres donne le rectangle COMPLÉMENTAIRE, c'est-à-dire tout le globe
   *     sauf ce qu'on regarde.
   *
   * On rabat donc sur le globe, on garantit `north > south` (le serveur le
   * refuse à l'identique) et on rejette tout ce qui n'est pas fini.
   */
  const publishRegion = useCallback(
    (rawNorth: number, rawSouth: number, rawEast: number, rawWest: number) => {
      if (![rawNorth, rawSouth, rawEast, rawWest].every(Number.isFinite)) return;

      const north = clamp(Math.max(rawNorth, rawSouth), -90, 90);
      const south = clamp(Math.min(rawNorth, rawSouth), -90, 90);
      const east = clamp(Math.max(rawEast, rawWest), -180, 180);
      const west = clamp(Math.min(rawEast, rawWest), -180, 180);

      // Un rectangle plat n'a pas de sens et le serveur le rejette.
      if (north - south < 1e-6 || east - west < 1e-6) return;

      onRegionChange(
        { latitude: (north + south) / 2, longitude: (east + west) / 2 },
        clampZoom(zoomForDelta(east - west)),
        { north, south, east, west }
      );
    },
    [onRegionChange]
  );

  /**
   * Les emplacements, dans leur ordre définitif.
   *
   * Toujours `MARKER_POOL_SIZE` entrées : les premières portent les marqueurs à
   * montrer, les suivantes valent `null` et se garent. C'est ce tableau de
   * longueur constante qui garantit que le `MapView` ne voit jamais un enfant
   * apparaître ni disparaître — la seule chose qui faisait tomber l'app.
   *
   * Un débordement se coupe ici plutôt que de se répandre : au-delà de la
   * soixantaine de cases qu'un écran peut montrer, une épingle de plus ne serait
   * de toute façon pas lisible.
   */
  const slots = useMemo(() => {
    const out: Array<MapMarker<T> | null> = new Array(MARKER_POOL_SIZE).fill(null);
    const count = Math.min(safeMarkers.length, MARKER_POOL_SIZE);
    for (let index = 0; index < count; index += 1) out[index] = safeMarkers[index];
    return out;
  }, [safeMarkers]);

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
  const handleMapReady = useCallback(async () => {
    setReady(true);
    try {
      const box = await mapRef.current?.getMapBoundaries();
      if (!box) return;
      const { northEast, southWest } = box;
      publishRegion(
        northEast.latitude,
        southWest.latitude,
        northEast.longitude,
        southWest.longitude
      );
    } catch {
      // La carte n'est pas prête à répondre : le premier déplacement prendra
      // le relais. Rien à signaler à l'utilisateur.
    }
  }, [publishRegion]);

  const handleRegionChangeComplete = useCallback(
    (region: Region) => {
      // Une région non finie (carte pas encore posée sur Android) ferait
      // remonter des bornes `NaN` jusqu'à la requête réseau et au calcul des
      // groupes. Les quatre champs sont vérifiés, pas deux : Android en a déjà
      // renvoyé trois valides sur quatre pendant l'installation de la vue.
      if (
        ![region.latitude, region.longitude, region.latitudeDelta, region.longitudeDelta].every(
          Number.isFinite
        )
      ) {
        return;
      }

      publishRegion(
        region.latitude + region.latitudeDelta / 2,
        region.latitude - region.latitudeDelta / 2,
        region.longitude + region.longitudeDelta / 2,
        region.longitude - region.longitudeDelta / 2
      );
    },
    [publishRegion]
  );

  return (
    <View style={[styles.root, style]} onLayout={handleLayout}>
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
        /*
         * ⚠️ PAS de `minZoomLevel` / `maxZoomLevel` ici. Jamais.
         *
         * Ils y ont été posés une fois, pour garder la carte dans un domaine où
         * la fenêtre reste interrogeable. Ils ont fabriqué une boucle
         * d'animations réentrantes au pincement — précisément le « ça plante
         * quand on zoome trop » qu'ils étaient censés éviter.
         *
         * `legacyZoomConstraintsEnabled` vaut YES par défaut, mais les bornes
         * par défaut (0 et `AIRMapMaxZoomLevel`, qui vaut 20) font que le
         * garde-fou ne se déclenche jamais. Les renseigner l'ARME : dès qu'on
         * dépasse la borne, `applyLegacyZoomConstrains` appelle
         * `setRegion:animated:YES` DEPUIS `regionDidChangeAnimated` — ce qui
         * redéclenche `regionDidChangeAnimated`, qui reclampe, qui rappelle
         * `setRegion`, pendant que les doigts continuent de pincer.
         *
         * Et ces bornes ne protégeaient rien qui ne le soit déjà ailleurs :
         * `publishRegion` rabat les bornes sur le globe, `queryableBounds`
         * (côté écran) ramène la requête au plus grand carré que le serveur
         * accepte, et `regionForCamera` borne le zoom de tout saut de caméra.
         * Le zoom AFFICHÉ, lui, n'a pas besoin d'être bridé.
         */
        /*
         * Sur Android, toucher un marqueur recentre la carte par défaut. Ce
         * recadrage non demandé déclenche un changement de région, donc une
         * nouvelle requête, alors qu'on voulait seulement ouvrir une fiche.
         */
        moveOnMarkerPress={false}
      >
        {/* La clé est l'INDEX de l'emplacement, jamais l'identité de la
            personne : c'est ce qui interdit à React de réordonner, d'insérer ou
            de retirer un enfant du MapView. Une épingle qui change de main
            n'est plus qu'un changement de props. */}
        {ready &&
          slots.map((marker, index) => (
            <MarkerSlot key={index} marker={marker} onMarkerPress={onMarkerPress} />
          ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
});
