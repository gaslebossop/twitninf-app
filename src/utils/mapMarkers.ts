/**
 * Construction de la liste de marqueurs de la Carte NF.
 *
 * ── Pourquoi ce calcul vit ici, et pas dans l'écran ──
 * Il porte des invariants qui portent sur la FORME de la liste produite, pas
 * sur ce qu'on voit : rien de tout cela n'est vérifiable depuis un écran React.
 * Les tests de `tests/map-markers.test.js` s'appuient dessus.
 *
 *   1. **L'ordre ne dépend de rien.** Ni du zoom, ni de la composition des
 *      groupes, ni de l'ordre d'arrivée des réponses du serveur. La liste était
 *      produite en parcourant les groupes — tête, puis membres, groupe après
 *      groupe : pour trois personnes A, B, C dont A et C se regroupent, elle
 *      donnait `[A, C, B]` de loin et `[A, B, C]` de près. Le tri final par
 *      identifiant rend cet ordre invariant, ce qui évite à la carte de voir
 *      ses épingles permuter sans raison.
 *
 *   2. **Rien hors de l'écran.** La carte n'expose qu'un nombre FIXE
 *      d'emplacements (`MARKER_POOL_SIZE` dans `NfMapCanvas`), alors que les
 *      positions s'accumulent sur toute la session. Sans le filtre de
 *      `visibleBounds`, ces emplacements pouvaient partir en entier à des gens
 *      hors champ, laissant la vue vide au milieu d'une foule.
 *
 * ── Ce que ce fichier ne fait PLUS ──
 * Il fabriquait un marqueur par personne, y compris pour les membres d'un
 * groupe — des pixels transparents cachés sous la tête — afin qu'aucun marqueur
 * ne soit jamais démonté. Cette contorsion existait parce que retirer un enfant
 * du `MapView` faisait tomber l'app. Le pool à taille fixe règle ce problème à
 * la racine ; les épingles fantômes ont disparu avec lui.
 */

import { clusterize } from './mapCluster';
import {
  CLUSTER_ANCHOR_Y,
  MAX_CLUSTER_FACES,
  PIN_ANCHOR_Y,
  clusterPinUrl,
  personPinUrl,
  type PinOrigin,
} from './mapPinUrl';
import type { MapBounds, MapCoordinate, MapMarker } from '../components/map/NfMapCanvas';
import type { NfMapPerson } from '../services/nfMapService';

/**
 * Ce qu'un marqueur MONTRE à un instant donné.
 *
 * Le rôle change avec le zoom ; l'identité du marqueur, elle, ne change jamais.
 * C'est toute la raison d'être de ce type.
 */
export type MarkerRole =
  | { kind: 'self'; ghost: boolean }
  | { kind: 'solo'; person: NfMapPerson; selected: boolean }
  | { kind: 'head'; person: NfMapPerson; faces: NfMapPerson[] };

/** Identifiant du marqueur « moi ». Local : il ne publie rien. */
export const SELF_MARKER_ID = '__moi__';

/**
 * Une position exploitable, ou rien.
 *
 * Le vide est écarté AVANT la conversion, et c'est le fond du problème :
 * `Number(null)` ne vaut pas `NaN`, il vaut **0**, et `Number('')` aussi. Une
 * ligne à laquelle il manque une latitude ne se signalait donc pas — elle
 * passait tous les contrôles de finitude et posait la personne à zéro degré,
 * c'est-à-dire au large du golfe de Guinée. Vu de la carte, elle avait disparu.
 *
 * On écarte ici, à l'entrée, plutôt que plus bas : plus bas, écarter quelqu'un
 * reviendrait à démonter un marqueur déjà posé, ce que ce code ne fait jamais.
 */
export function coordinatesOf(person: NfMapPerson): MapCoordinate | null {
  const rawLatitude = person.latitude;
  const rawLongitude = person.longitude;
  if (rawLatitude === null || rawLatitude === undefined || rawLatitude === '') return null;
  if (rawLongitude === null || rawLongitude === undefined || rawLongitude === '') return null;

  const latitude = Number(rawLatitude);
  const longitude = Number(rawLongitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

/** Ordre total, indépendant de la locale de l'appareil — voir l'invariant 2. */
const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export interface BuildMarkersInput {
  people: NfMapPerson[];
  /** Position de l'appareil, pour l'épingle « moi ». `null` = pas encore connue. */
  myPosition: MapCoordinate | null;
  /**
   * Le compte connecté, pour dessiner sa propre épingle.
   *
   * `null` tant que la session n'est pas chargée : sans identifiant, le serveur
   * n'a personne à dessiner, et l'épingle « moi » attend simplement son tour.
   */
  me: { id: string; avatar: string | null } | null;
  /** On ne partage rien : l'épingle « moi » le dit, elle ne disparaît pas. */
  isGhost: boolean;
  /** Personne dont la fiche est ouverte, s'il y en a une. */
  selectedId?: string | null;
  /** Largeur d'un pixel écran en degrés, arrondie au palier de zoom. */
  clusterScale: number;
  /** Correction Mercator de la hauteur des cases — voir `mapCluster`. */
  clusterLatitudeCosine: number;
  /** Où demander les images d'épingle, et à quelle densité — voir `mapPinUrl`. */
  pin: PinOrigin;
  /**
   * Fenêtre affichée. Ce qui tombe en dehors ne produit AUCUN marqueur.
   *
   * Ce n'est pas une optimisation, c'est une condition de correction. Les
   * positions s'accumulent sur toute la session, à travers toutes les villes
   * traversées, alors que la carte n'expose qu'un nombre fixe d'emplacements
   * (voir `MARKER_POOL_SIZE`). Sans ce filtre, les emplacements partaient aux
   * premiers identifiants du tri — c'est-à-dire à des gens potentiellement tous
   * hors de l'écran, laissant la vue vide au milieu d'une foule.
   *
   * `null` tant que la carte n'a pas dit ce qu'elle affiche : on montre alors
   * tout, ce qui est le comportement d'avant la première fenêtre.
   */
  visibleBounds?: MapBounds | null;
}

/**
 * Marge autour de la fenêtre, en fraction de sa taille.
 *
 * Une épingle qui entre par le bord doit déjà être posée quand elle devient
 * visible, sinon elle apparaît en retard, après le déplacement.
 */
const VIEWPORT_MARGIN = 0.3;

function isWithin(bounds: MapBounds, latitude: number, longitude: number): boolean {
  const latitudeMargin = (bounds.north - bounds.south) * VIEWPORT_MARGIN;
  const longitudeMargin = (bounds.east - bounds.west) * VIEWPORT_MARGIN;
  return (
    latitude >= bounds.south - latitudeMargin &&
    latitude <= bounds.north + latitudeMargin &&
    longitude >= bounds.west - longitudeMargin &&
    longitude <= bounds.east + longitudeMargin
  );
}

export function buildMapMarkers({
  people,
  myPosition,
  me,
  isGhost,
  selectedId,
  clusterScale,
  clusterLatitudeCosine,
  pin,
  visibleBounds,
}: BuildMarkersInput): Array<MapMarker<MarkerRole>> {
  const points: Array<{ id: string; latitude: number; longitude: number; person: NfMapPerson }> = [];
  for (const person of people) {
    const here = coordinatesOf(person);
    if (!here) continue;
    points.push({ id: person.id, ...here, person });
  }

  const clusters = clusterize(points, clusterScale, undefined, clusterLatitudeCosine);
  const list: Array<MapMarker<MarkerRole>> = [];

  for (const cluster of clusters) {
    if (cluster.items.length === 1) {
      const { person } = cluster.items[0];
      const selected = selectedId === person.id;
      list.push({
        id: person.id,
        latitude: cluster.latitude,
        longitude: cluster.longitude,
        image: personPinUrl(pin, {
          id: person.id,
          avatar: person.avatar,
          variant: selected ? 'selected' : person.sharing_mode === 'city' ? 'city' : 'precise',
          label: person.username,
        }),
        anchorY: PIN_ANCHOR_Y,
        zIndex: 2,
        data: { kind: 'solo', person, selected },
      });
      continue;
    }

    // Tête choisie par identifiant, pas par ordre d'arrivée : le même groupe
    // doit désigner la même tête à chaque calcul, sinon deux marqueurs
    // échangent leur apparence pour rien — et l'URL de l'épingle de groupe,
    // donc son entrée de cache, changerait à chaque recalcul.
    const members = [...cluster.items].sort(byId);
    const [head, ...rest] = members;
    const faces = members.map(({ person }) => person);

    list.push({
      id: head.person.id,
      latitude: cluster.latitude,
      longitude: cluster.longitude,
      image: clusterPinUrl(
        pin,
        faces.slice(0, MAX_CLUSTER_FACES).map((person) => ({
          id: person.id,
          avatar: person.avatar,
        })),
        faces.length
      ),
      anchorY: CLUSTER_ANCHOR_Y,
      zIndex: 3,
      data: { kind: 'head', person: head.person, faces },
    });

    // Les membres ne produisent AUCUN marqueur.
    //
    // Ils en avaient un — un pixel transparent posé sous la tête — pour
    // satisfaire une règle devenue caduque : « un marqueur par personne, jamais
    // démonté ». Cette règle existait parce que retirer un enfant du `MapView`
    // faisait tomber l'app. Le pool de marqueurs à taille fixe (voir
    // `NfMapCanvas`) règle ce problème à la racine, et ces épingles fantômes
    // n'ont plus aucune raison d'exister : elles coûtaient une vue native
    // chacune pour ne rien montrer.
    void rest;
  }

  // Se voir soi-même est le seul moyen de vérifier ce que les autres voient.
  // Y COMPRIS en mode fantôme : cette épingle est locale, elle ne publie rien.
  // La cacher tant qu'on ne partage pas — donc par défaut, donc à la toute
  // première ouverture — donnait une carte où on ne se trouve pas. L'épingle
  // dit alors explicitement que personne d'autre ne la voit.
  if (myPosition && me) {
    list.push({
      id: SELF_MARKER_ID,
      latitude: myPosition.latitude,
      longitude: myPosition.longitude,
      image: personPinUrl(pin, {
        id: me.id,
        avatar: me.avatar,
        variant: isGhost ? 'ghost' : 'self',
        label: isGhost ? 'Toi · invisible' : 'Toi',
      }),
      anchorY: PIN_ANCHOR_Y,
      zIndex: 4,
      data: { kind: 'self', ghost: isGhost },
    });
  }

  // Hors champ, aucun marqueur — voir `visibleBounds`. L'épingle « moi » et
  // celle dont la fiche est ouverte échappent au filtre : les faire disparaître
  // pendant qu'on les lit serait absurde.
  const onScreen = visibleBounds
    ? list.filter(
        (marker) =>
          marker.id === SELF_MARKER_ID ||
          (marker.data.kind === 'solo' && marker.data.selected) ||
          isWithin(visibleBounds, marker.latitude, marker.longitude)
      )
    : list;

  onScreen.sort(byId);
  return onScreen;
}
