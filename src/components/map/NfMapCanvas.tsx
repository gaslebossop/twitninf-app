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
 * 1. UN `<Marker>` N'A JAMAIS D'ENFANT. Jamais une vue, jamais un composant
 *    tactile, jamais rien : uniquement une image, par la prop `image`.
 *
 *    C'est la règle la plus chèrement payée du projet. Un marqueur qui portait
 *    un arbre de vues React passait par la couche d'interopérabilité de Fabric,
 *    dont les mainteneurs de la bibliothèque écrivent qu'elle « ne fonctionne
 *    pas pour les composants personnalisés ayant des composants enfants
 *    personnalisés » (MapView → Marker → enfants). L'app tombait dans
 *    `insertReactSubview:` / `removeReactSubview:`, côté natif, sans une ligne
 *    de log JS — à chaque zoom, à chaque arrivée de quelqu'un, en ouvrant un
 *    profil. Aucun contournement côté JS n'y change quoi que ce soit : ordre
 *    stable, montage par paquets, mémoïsation ont réduit la fréquence sans
 *    jamais supprimer la cause.
 *
 *    La correction officielle — désactiver la Nouvelle Architecture — est
 *    fermée ici : `react-native-reanimated@4` et les modules Nitro l'exigent,
 *    et Expo Go SDK 54 ne connaît qu'elle. Le dessin des épingles est donc
 *    parti sur le serveur (`api/src/services/nfMapPinService.js`), qui rend un
 *    PNG. `shouldUsePinView` de la bibliothèque le dit d'ailleurs lui-même :
 *    `reactSubviews.count == 0 && !imageSrc`. Sans enfant et avec une image, on
 *    quitte définitivement le chemin qui plante.
 *
 *    Conséquence heureuse : plus rien à photographier, donc plus de
 *    `tracksViewChanges`, plus de `contentKey`, plus de marqueur qui se rearme.
 *    Changer l'apparence d'une épingle est devenu un changement d'URL.
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
  /**
   * La carte est-elle à l'écran ?
   *
   * À `false`, elle se VIDE de ses marqueurs, par paquets — voir `mountedIds`.
   * C'est la réponse au crash en touchant « Profil » depuis la fiche de
   * quelqu'un : la pile est réglée en `freezeOnBlur`, si bien que quitter la
   * carte gèle puis détache un `MapView` qui porte encore ses deux cents vues
   * natives de marqueur, et qu'y revenir recommet d'un coup tout le sous-arbre
   * différé. Une carte déjà vide au moment où le navigateur l'escamote ne donne
   * prise ni à l'un ni à l'autre.
   *
   * La carte elle-même reste montée : c'est ce qui évite de repayer son
   * installation, et de rejouer la course au démarrage que `ready` couvre.
   */
  active?: boolean;
  style?: any;
}

/**
 * Combien de marqueurs entrent d'un coup, et à quel rythme — voir `mountedIds`.
 *
 * Vingt tient largement dans une image, et deux cents personnes finissent
 * posées en moins d'un tiers de seconde : assez pour qu'un saut vers une autre
 * ville reste instantané à l'œil, assez peu pour que le natif n'ait jamais à
 * avaler une fournée entière.
 */
const MOUNT_BATCH = 20;
const MOUNT_INTERVAL_MS = 32;

/**
 * Et le vidage, quand la carte n'est plus à l'écran — voir la prop `active`.
 *
 * Plus gros paquets et plus serrés qu'à l'entrée : ici on court contre la
 * transition de navigation, qui dure environ 350 ms. Trois cents marqueurs
 * partent en une centaine de millisecondes, donc bien avant que le navigateur
 * ne gèle ou ne détache l'écran — et personne ne le voit, puisque la carte est
 * déjà en train de sortir du champ.
 */
const DRAIN_BATCH = 50;
const DRAIN_INTERVAL_MS = 16;

/**
 * Le marqueur, réduit à ce que la bibliothèque sait porter sans tomber.
 *
 * Il n'a plus d'enfant, donc plus rien à photographier : tout l'appareillage
 * qui vivait ici — `tracksViewChanges`, le `contentKey`, la temporisation qui
 * rallumait la capture le temps qu'un avatar distant arrive — a disparu avec
 * la vue qu'il servait à figer. Une épingle est désormais une URL.
 *
 * Mémoïsé quand même : sans cette barrière, tout rendu de l'écran — une lettre
 * tapée dans la recherche d'amis, une image de l'animation de la feuille —
 * renvoie une mise à jour à chaque marqueur natif. Les props sont un objet
 * `marker` (mémoïsé en amont) et un rappel stable, donc la comparaison tient.
 */
function MapImageMarkerView<T>({
  marker,
  onMarkerPress,
}: {
  marker: MapMarker<T>;
  onMarkerPress?: (marker: MapMarker<T>) => void;
}) {
  return (
    <Marker
      coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
      // Le point désigné n'est pas au centre de l'image : une épingle pointe
      // par sa pointe, sous laquelle il reste encore l'étiquette du pseudo.
      anchor={{ x: 0.5, y: marker.anchorY }}
      zIndex={marker.zIndex}
      image={{ uri: marker.image }}
      // Aucune vue à suivre : la carte n'a rien à re-photographier. Laisser la
      // valeur par défaut (vrai) ferait redessiner le marqueur à chaque image
      // pour un contenu qui ne bouge jamais.
      tracksViewChanges={false}
      onPress={onMarkerPress ? () => onMarkerPress(marker) : undefined}
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

const MapImageMarker = React.memo(MapImageMarkerView) as typeof MapImageMarkerView;

export default function NfMapCanvas<T>({
  camera,
  markers,
  onMarkerPress,
  onPressMap,
  onRegionChange,
  active = true,
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
   * Les marqueurs entrent par PAQUETS, jamais tous d'un coup.
   *
   * ── Le geste qui faisait tomber l'app ──
   * Toucher « Voir » sur un ami d'une autre ville. La caméra saute, la nouvelle
   * fenêtre est interrogée, et le serveur rend d'un coup jusqu'à deux cents
   * personnes qu'on ne connaissait pas. React insère alors deux cents vues
   * natives de marqueur dans UNE SEULE mise à jour — et une insertion en masse
   * est très exactement ce que `react-native-maps` 1.20.1 ne supporte pas sous
   * la Nouvelle Architecture : `insertObject:atIndex: object cannot be nil`
   * côté iOS, index hors bornes côté Android, sans une ligne de log JS. Rester
   * dans sa ville ne déclenchait rien, parce que les gens y arrivaient un à un.
   *
   * ── Pourquoi un ensemble d'identifiants, et pas un simple compteur ──
   * Un compteur qui tronquerait la liste serait pire que le mal. La liste est
   * triée par identifiant : quelqu'un dont l'identifiant est petit s'insère en
   * TÊTE et pousse le dernier hors de la troncature — c'est-à-dire le démonte,
   * sans que personne l'ait demandé. Un ensemble nommé ne se laisse pas décaler.
   *
   * Tant que la carte est à l'écran, cet ensemble ne fait que GRANDIR : un
   * marqueur entré n'en sort pas. Le seul retrait est le vidage volontaire de
   * la prop `active`, quand la carte s'en va — lui aussi par paquets.
   */
  const [mountedIds, setMountedIds] = useState<ReadonlySet<string>>(() => new Set());

  /**
   * Le point de passage OBLIGÉ de tout ce qui remonte vers l'écran.
   *
   * Ce qui sortait d'ici sans contrôle a produit les deux pannes les plus
   * visibles de la carte :
   *
   *   - `north` à 97°, `west` à -214°. Un rectangle qui déborde du globe part
   *     tel quel dans la requête, que le serveur refuse — et `nearby` rend une
   *     liste vide sans distinguer « refusé » de « personne ici ». La carte
   *     cessait de se peupler dès qu'on dézoomait un peu ;
   *   - une fenêtre à cheval sur l'antiméridien. `getMapBoundaries` rend alors
   *     un coin nord-est à -170° et un sud-ouest à 170° : trier ces deux
   *     nombres donne le rectangle COMPLÉMENTAIRE, c'est-à-dire tout le globe
   *     sauf ce qu'on regarde. Le zoom qu'on en déduisait était bon pour la
   *     planète entière, et il redescendait dans `animateToRegion`.
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

  useEffect(() => {
    if (!ready) return undefined;

    // ── Sortie : la carte quitte l'écran, on la vide ──
    if (!active) {
      if (mountedIds.size === 0) return undefined;
      const timer = setTimeout(() => {
        setMountedIds((current) => {
          const next = new Set(current);
          let removed = 0;
          for (const id of current) {
            if (removed >= DRAIN_BATCH) break;
            next.delete(id);
            removed += 1;
          }
          return next;
        });
      }, DRAIN_INTERVAL_MS);
      return () => clearTimeout(timer);
    }

    // ── Entrée : par paquets, jamais tous d'un coup ──
    const pending = safeMarkers.filter((marker) => !mountedIds.has(marker.id));
    if (pending.length === 0) return undefined;

    // Un tour de boucle d'événements entre deux paquets : le natif a le temps
    // de poser ce qu'on vient de lui donner avant d'en recevoir d'autres.
    const timer = setTimeout(() => {
      setMountedIds((current) => {
        const next = new Set(current);
        for (const marker of pending.slice(0, MOUNT_BATCH)) next.add(marker.id);
        return next;
      });
    }, MOUNT_INTERVAL_MS);

    return () => clearTimeout(timer);
  }, [ready, active, safeMarkers, mountedIds]);

  /** Ce qui est réellement posé sur la carte : les marqueurs déjà entrés. */
  const visibleMarkers = useMemo(
    () => safeMarkers.filter((marker) => mountedIds.has(marker.id)),
    [safeMarkers, mountedIds]
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
        {visibleMarkers.map((marker) => (
          <MapImageMarker key={marker.id} marker={marker} onMarkerPress={onMarkerPress} />
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
});
