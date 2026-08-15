/**
 * 🗺️ Carte de la Carte NF, rendue par MapLibre dans une `WebView`.
 *
 * ── Pourquoi la carte n'est plus native ──
 * `react-native-maps` est figé à 1.20.1 par Expo Go (voir `app.config.js`), une
 * version antérieure au support Fabric alors que la Nouvelle Architecture est
 * obligatoire ici. Monter ou démonter un `<Marker>` y fait tomber le natif sur
 * `insertReactSubview:` / `insertObject:atIndex:`, **sans une ligne de log JS**.
 * Toute la version précédente de ce fichier était une architecture de
 * contournement autour de ce seul fait : un pool de 64 emplacements posés une
 * fois pour toutes, jamais un enfant de plus ni de moins, des personnes
 * accumulées à vie pour n'avoir jamais à en retirer une.
 *
 * Changer de bibliothèque native aurait réglé la cause, mais Expo Go doit
 * rester complet — décision prise, et elle ferme cette porte. Reste un moteur
 * de carte qui ne demande AUCUN module natif nouveau : MapLibre GL JS dans une
 * `WebView`. `react-native-webview` est en 13.15.0, exactement la version du
 * binaire d'Expo Go : rien à installer, rien à recompiler.
 *
 * Ce n'est pas « du HTML » au sens où on l'entend d'habitude : MapLibre dessine
 * en WebGL sur un canvas, composité par le GPU. C'est le moteur des cartes web
 * modernes, pas une page de texte.
 *
 * ── Ce que ce changement supprime ──
 * Le pool de marqueurs, la règle « aucun marqueur ne doit jamais être démonté »,
 * et les épingles fantômes. Retirer un nœud du DOM ne fait rien tomber : les
 * épingles redeviennent une liste ordinaire. Le contrat de ce composant, lui,
 * n'a pas bougé d'une prop — `NfMapScreen` ne sait pas que la carte a changé.
 *
 * ── Ce qui, dans une WebView, trahirait une page web ──
 * Quatre choses, neutralisées ici et dans la page (voir
 * `api/src/services/nfMapWebView.js`) : le rebond élastique en fin de geste, la
 * sélection de texte à l'appui long, le flash blanc avant le premier rendu, et
 * le canvas qui s'assemble à vue.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { API_CONFIG } from '../../config/api';
import { colors, isDarkTheme } from '../../theme';

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
   * Le serveur les dessinait parce qu'un `<Marker>` natif à enfants faisait
   * tomber l'app. Cette raison a disparu avec la carte native — mais le rendu
   * reste le bon choix : une même épingle est calculée une fois pour tous les
   * téléphones qui la regardent, et le CDN la sert ensuite. Voir
   * `api/src/services/nfMapPinService.js`.
   */
  image: string;
  /**
   * Où, dans l'image, se trouve le point désigné (0 = haut, 1 = bas).
   *
   * Contrairement à la carte native — où cette valeur était SANS EFFET sur
   * Apple Maps, `anchor` n'existant que dans `AirGoogleMaps` — elle est
   * respectée sur les deux plateformes ici : c'est le même moteur des deux
   * côtés. Les épingles iOS étaient jusque-là centrées sur leur coordonnée au
   * lieu de pointer dessus.
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
 * Zoom « tuiles » : la vue fait `360 / 2^zoom` degrés de large.
 *
 * C'est l'unité de l'écran, conservée telle quelle par ce changement de moteur.
 * MapLibre compte autrement (en tuiles de 512 px) ; la conversion vit dans la
 * page, en un seul endroit — voir `toMapLibreZoom` dans `bridge.js`.
 */
const zoomForDelta = (delta: number) => Math.log2(360 / Math.max(delta, 1e-6));

export const MIN_ZOOM = 4;
export const MAX_ZOOM = 18;

const clampZoom = (zoom: number) =>
  Number.isFinite(zoom) ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) : MIN_ZOOM;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/**
 * La page, servie par l'API.
 *
 * Le thème part dans l'URL : le fond de carte DOIT suivre celui de l'app.
 * Forcé en sombre, il transformait chaque élément flottant — barre de
 * recherche, bouton de localisation, fiche d'un groupe, feuille du bas — en
 * dalle blanche posée sur du noir. Le défaut n'était pas dans ces éléments,
 * c'était le fond qui ne suivait personne.
 *
 * Lu à la construction de l'URL et pas figé au chargement du module : le thème
 * peut changer entre deux ouvertures de l'écran.
 */
const mapTheme = () => (isDarkTheme() ? 'dark' : 'light');

const viewUrl = () => `${API_CONFIG.BASE_URL}/api/nf-map/view?theme=${mapTheme()}`;
const styleUrl = () => `${API_CONFIG.BASE_URL}/api/nf-map/style.json?theme=${mapTheme()}`;

/** Racine de la page, pour reconnaître ce qui a le droit de naviguer. */
const VIEW_ORIGIN = `${API_CONFIG.BASE_URL}/api/nf-map/view`;

/**
 * Ce que la page reçoit AVANT d'avoir fini de se charger.
 *
 * `window.NFMAP_BOOT` est lu par le pont à la toute fin de son évaluation : la
 * carte démarre donc sans attendre un aller-retour de message. Injecter après
 * le chargement marcherait aussi, mais laisserait une fenêtre — visible — où la
 * page est là et la carte pas encore.
 */
function bootScript(camera: MapCamera): string {
  return `window.NFMAP_BOOT = ${JSON.stringify({
    style: styleUrl(),
    latitude: camera.center.latitude,
    longitude: camera.center.longitude,
    zoom: clampZoom(camera.zoom),
  })};
true;`;
}

/**
 * Les deux caractères que JSON accepte et que JavaScript refuse.
 *
 * Construits par code plutôt qu'écrits en clair : ils sont invisibles dans un
 * éditeur, et une relecture les prendrait pour des espaces ordinaires.
 */
const JS_LINE_BREAKS = new RegExp(
  `[${String.fromCharCode(0x2028)}${String.fromCharCode(0x2029)}]`,
  'g'
);

function toScriptLiteral(value: unknown): string {
  return JSON.stringify(value).replace(
    JS_LINE_BREAKS,
    (char) => `\\u${char.charCodeAt(0).toString(16)}`
  );
}

interface NfMapCanvasProps<T> {
  camera: MapCamera;
  markers: Array<MapMarker<T>>;
  /** Appui sur un marqueur. Géré par la carte : l'épingle est une image. */
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
   * Le lieu au centre de la vue, mis à jour PENDANT le geste.
   *
   * Il vient des étiquettes que la carte dessine déjà, pas d'un géocodage
   * inverse : c'est instantané, gratuit, et le nom annoncé est exactement
   * celui qu'on lit à l'écran. `null` quand la vue ne couvre aucun lieu
   * nommé — en pleine mer, ou trop dézoomé pour qu'une commune s'affiche.
   */
  onPlaceChange?: (name: string | null) => void;
  style?: any;
}

export default function NfMapCanvas<T>({
  camera,
  markers,
  onMarkerPress,
  onPressMap,
  onRegionChange,
  onPlaceChange,
  style,
}: NfMapCanvasProps<T>) {
  const webRef = useRef<WebView | null>(null);

  /**
   * La page a-t-elle fini de poser sa première vue ?
   *
   * Avant, toute injection serait perdue : le pont existe, mais la carte n'est
   * pas construite. Il remet ce qu'on lui donne en attente, mais s'appuyer
   * là-dessus rendrait l'ordre des messages significatif — on préfère ne rien
   * envoyer tant que la page n'a pas dit qu'elle était prête.
   */
  const [ready, setReady] = useState(false);

  /**
   * Camera de départ, FIGÉE.
   *
   * Elle ne sert qu'au script d'amorçage, évalué une seule fois : la
   * recalculer à chaque rendu changerait la prop `injectedJavaScriptBefore…` et
   * ferait recharger la WebView entière à chaque déplacement.
   */
  const initialCamera = useRef(camera);

  /**
   * Un marqueur sans coordonnées valides n'a rien à faire sur la carte.
   *
   * `Number(null)` vaut 0 et `Number(undefined)` vaut `NaN` : une ligne à
   * laquelle il manque une latitude arrivait jusqu'ici. Ça ne fait plus tomber
   * l'app comme du temps de la carte native — le pont refuse les coordonnées
   * non finies — mais une épingle posée à zéro degré, au large du golfe de
   * Guinée, resterait un défaut visible.
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
   * Ce qui descend réellement dans la page : la géométrie, pas les données.
   *
   * `data` porte la personne entière — pseudo, avatar, mode de partage,
   * horodatage. Rien de tout cela n'est utile au rendu, et la page n'a aucune
   * raison de le connaître : elle ne reçoit que ce qu'elle dessine. L'appui
   * remonte un identifiant, que ce composant remet en correspondance ici.
   */
  const payload = useMemo(
    () =>
      safeMarkers.map((marker) => ({
        id: marker.id,
        latitude: marker.latitude,
        longitude: marker.longitude,
        image: marker.image,
        anchorY: marker.anchorY,
        zIndex: marker.zIndex ?? 0,
      })),
    [safeMarkers]
  );

  /** Correspondance identifiant → marqueur, pour l'appui qui remonte. */
  const byId = useMemo(() => {
    const map = new Map<string, MapMarker<T>>();
    for (const marker of safeMarkers) map.set(marker.id, marker);
    return map;
  }, [safeMarkers]);

  /**
   * Dernier envoi, pour ne pas réémettre l'identique.
   *
   * L'écran se rend à chaque lettre tapée dans la recherche d'amis et à chaque
   * image de l'animation de la feuille. Sans cette comparaison, chacun de ces
   * rendus renverrait la liste entière des épingles dans la page.
   */
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    const serialized = toScriptLiteral(payload);
    if (serialized === lastSent.current) return;
    lastSent.current = serialized;
    webRef.current?.injectJavaScript(`window.NFMAP.setMarkers(${serialized});true;`);
  }, [payload, ready]);

  /**
   * Saut explicite demandé par l'écran.
   *
   * Un déplacement au doigt ne change pas le `nonce`, donc ne repasse jamais
   * ici : la carte n'est jamais recadrée sous le doigt. C'est ce qui a supprimé
   * le sursaut au relâchement qu'on a passé deux versions à traquer.
   */
  const lastNonce = useRef(camera.nonce);
  /**
   * Le PREMIER cadrage ne s'anime pas.
   *
   * La carte s'ouvre sur une position de repli, puis l'écran apprend où on est
   * — soit par le GPS, soit par la dernière position retenue. Animer ce
   * passage-là faisait survoler des centaines de kilomètres à chaque ouverture,
   * après quoi la carte se posait : c'est le « ça se téléporte au lancement ».
   *
   * Les sauts SUIVANTS gardent leur animation : eux sont demandés, et suivre
   * des yeux le trajet vers un ami dit où il est par rapport à soi.
   */
  const firstJumpDone = useRef(false);

  useEffect(() => {
    if (!ready) return;
    if (camera.nonce === lastNonce.current) return;
    lastNonce.current = camera.nonce;

    const { latitude, longitude } = camera.center;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

    const instant = !firstJumpDone.current;
    firstJumpDone.current = true;

    webRef.current?.injectJavaScript(
      `window.NFMAP.jumpTo(${clamp(latitude, -85, 85)},${clamp(longitude, -180, 180)},${clampZoom(
        camera.zoom
      )},${instant});true;`
    );
  }, [camera, ready]);

  /**
   * Le point de passage OBLIGÉ de tout ce qui remonte vers l'écran.
   *
   * Ce qui sortait d'ici sans contrôle a produit deux pannes visibles :
   *
   *   - `north` à 97°, `west` à -214°. Un rectangle qui déborde du globe part
   *     tel quel dans la requête, que le serveur refuse — et `nearby` rend une
   *     liste vide sans distinguer « refusé » de « personne ici ». La carte
   *     cessait de se peupler dès qu'on dézoomait un peu ;
   *   - une fenêtre à cheval sur l'antiméridien. Les bornes rendent alors un
   *     est à -170° et un ouest à 170° : trier ces deux nombres donne le
   *     rectangle COMPLÉMENTAIRE, c'est-à-dire tout le globe sauf ce qu'on
   *     regarde.
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

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let message: any;
      try {
        message = JSON.parse(event.nativeEvent.data);
      } catch {
        // La page n'émet que du JSON qu'elle fabrique elle-même. Un message
        // illisible ne peut venir que d'un état qu'on ne connaît pas : on
        // l'ignore plutôt que de laisser remonter une exception dans un
        // gestionnaire d'événement natif.
        return;
      }

      switch (message?.type) {
        case 'ready':
          // Une WebView peut être rechargée par le système sous pression
          // mémoire. Repasser par `ready` doit tout reposer : on oublie donc
          // le dernier envoi pour que les épingles soient réémises.
          lastSent.current = null;
          setReady(true);
          return;

        case 'region': {
          const bounds = message.bounds;
          if (!bounds) return;
          publishRegion(bounds.north, bounds.south, bounds.east, bounds.west);
          return;
        }

        case 'marker': {
          const marker = byId.get(String(message.id));
          if (marker && onMarkerPress) onMarkerPress(marker);
          return;
        }

        case 'place':
          onPlaceChange?.(typeof message.name === 'string' ? message.name : null);
          return;

        case 'map':
          onPressMap?.();
          return;

        default:
          return;
      }
    },
    [byId, onMarkerPress, onPlaceChange, onPressMap, publishRegion]
  );

  /**
   * Rien ne navigue, sauf la page elle-même.
   *
   * L'attribution des données porte des liens : sans ce filtre, un appui
   * dessus remplacerait la carte par un site web à l'intérieur de l'écran,
   * sans aucun moyen de revenir. On les ouvre dans le navigateur du système,
   * ce qui est le comportement attendu, et la carte reste en place.
   */
  const handleNavigation = useCallback((request: { url: string }) => {
    if (request.url.startsWith(VIEW_ORIGIN)) return true;
    if (/^https?:\/\//i.test(request.url)) {
      Linking.openURL(request.url).catch(() => {
        /* Aucun navigateur disponible : il n'y a rien à dire à l'utilisateur. */
      });
    }
    return false;
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }, style]}>
      <WebView
        ref={webRef}
        source={{ uri: viewUrl() }}
        // La page pose son propre fond, mais trop tard : le compositeur natif
        // peint le sien AVANT d'avoir lu la moindre ligne de CSS, et il est
        // blanc par défaut. C'est le flash qui trahit une WebView.
        // Le fond sombre est posé par le style, pas par une prop : `opaque` et
        // `backgroundColor` existent bien sur la vue native mais sont absents
        // des types de la 13.15.0. C'est `styles.web` qui peint le fond avant
        // le premier rendu de la page, ce qui est le point qui compte — sans
        // lui, la WebView est blanche le temps du chargement.
        style={[styles.web, { backgroundColor: colors.bg }]}
        injectedJavaScriptBeforeContentLoaded={bootScript(initialCamera.current)}
        onMessage={handleMessage}
        onShouldStartLoadWithRequest={handleNavigation}
        // ── Tout ce qui suit efface la « page web » ──
        // Le rebond élastique de fin de geste est la signature nº1 d'une
        // WebView : aucune carte native ne rebondit.
        bounces={false}
        overScrollMode="never"
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        // L'aperçu de lien au appui long (iOS) et le menu contextuel n'ont
        // aucun sens sur une carte.
        allowsLinkPreview={false}
        // Pas d'indicateur de chargement : la page se dévoile d'elle-même une
        // fois ses tuiles posées (voir l'opacité dans la page).
        startInLoadingState={false}
        // Rien ne doit pouvoir ouvrir une seconde vue par-dessus la carte.
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false}
        // La page et MapLibre sont derrière des URLs immuables : le cache de
        // la plateforme évite de retélécharger un mégaoctet à chaque ouverture.
        cacheEnabled
        // Le rendu WebGL doit être composité par le GPU, sinon le déplacement
        // saccade sur Android.
        androidLayerType="hardware"
        // Une carte ne se met jamais à l'échelle du texte du système : le
        // canvas se retrouverait à une taille qui n'est plus celle de la vue.
        textZoom={100}
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        // Le contenu vient de notre API et de nulle part ailleurs — la page
        // elle-même est verrouillée par sa CSP (`connect-src 'self'`).
        originWhitelist={[API_CONFIG.BASE_URL]}
        // Les tuiles arrivent en clair du proxy de l'API, jamais d'un tiers.
        mixedContentMode="never"
        {...(Platform.OS === 'ios' ? { allowsBackForwardNavigationGestures: false } : null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  web: { flex: 1 },
});
