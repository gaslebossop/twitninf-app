/**
 * Construction de la liste de marqueurs de la Carte NF.
 *
 * ── Pourquoi ce calcul vit ici, et pas dans l'écran ──
 * Il porte les deux invariants qui empêchent l'app de tomber, et aucun des deux
 * n'est vérifiable depuis un écran React : ils portent sur la FORME de la liste
 * produite, pas sur ce qu'on voit. Les tests de `tests/map-markers.test.js`
 * s'appuient dessus.
 *
 *   1. **Un marqueur par personne, la session entière.** L'identifiant d'un
 *      marqueur est celui de la personne, jamais celui d'un groupe. Regrouper
 *      naïvement fabrique des marqueurs dont l'identité dépend du zoom — trois
 *      personnes forment un marqueur au loin, trois marqueurs de près — et tout
 *      zoom démonte alors des marqueurs. Démonter un marqueur fait tomber
 *      `react-native-maps` 1.20.1 sous la Nouvelle Architecture, côté natif,
 *      sans une ligne de log JS.
 *
 *      D'où le détour : la liste ne change pas de contenu, c'est le RÔLE de
 *      chacun qui change. Une personne est tour à tour épingle isolée, tête de
 *      groupe (elle porte alors les visages de tout le groupe), ou membre —
 *      auquel cas elle glisse au centre du groupe et se réduit à un point,
 *      invisible derrière la tête. Rien n'est monté ni démonté : seules des
 *      coordonnées et des props changent.
 *
 *   2. **L'ordre ne dépend de rien.** C'est l'invariant qui manquait, et c'est
 *      lui qui faisait encore tomber l'app au zoom. La liste était produite en
 *      parcourant les groupes — tête, puis membres, groupe après groupe. Pour
 *      trois personnes A, B, C dont A et C se regroupent, elle donne `[A, C, B]`
 *      de loin et `[A, B, C]` de près : le même ensemble, dans un ordre
 *      différent.
 *
 *      React réordonne alors les vues natives enfants de la carte, et déplacer
 *      un marqueur emprunte le même chemin natif que l'insérer ou le retirer —
 *      `insertObject:atIndex: object cannot be nil` sur iOS, index hors bornes
 *      sur Android. Tout le travail sur l'identité stable était annulé par un
 *      simple changement d'ordre. Le tri final par identifiant rend cet ordre
 *      indépendant du zoom, de la composition des groupes et de l'ordre
 *      d'arrivée des réponses du serveur.
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
import type { MapCoordinate, MapMarker } from '../components/map/NfMapCanvas';
import type { NfMapPerson } from '../services/nfMapService';

/**
 * Ce qu'un marqueur MONTRE à un instant donné.
 *
 * Le rôle change avec le zoom ; l'identité du marqueur, elle, ne change jamais.
 * C'est toute la raison d'être de ce type.
 */
export type MarkerRole =
  | { kind: 'self'; ghost: boolean }
  /** `selected` voyage DANS le rôle, pas en `prop` de l'écran : c'est ce qui
   *  permet à `renderMarker` de rester la même fonction d'un rendu à l'autre,
   *  donc à la barrière de mémoïsation des marqueurs de tenir. */
  | { kind: 'solo'; person: NfMapPerson; selected: boolean }
  | { kind: 'head'; person: NfMapPerson; faces: NfMapPerson[] }
  | { kind: 'member' };

/** Identifiant du marqueur « moi ». Local : il ne publie rien. */
export const SELF_MARKER_ID = '__moi__';

/**
 * Image d'un membre de groupe : un pixel transparent.
 *
 * Un membre se tient exactement sous la tête de son groupe, qui le recouvre.
 * Il n'a donc rien à montrer — mais il lui faut quand même une image, parce
 * qu'un marqueur sans image ET sans enfant retombe sur l'épingle rouge par
 * défaut de la carte : on verrait dépasser des piques de sous chaque groupe.
 *
 * Une donnée en ligne plutôt qu'une requête : ce serait sinon un aller-retour
 * réseau par membre caché, pour un pixel qu'on ne voit jamais. Les deux
 * plateformes acceptent les URI `data:` pour l'image d'un marqueur.
 */
const MEMBER_DOT =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

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

    for (const member of rest) {
      list.push({
        id: member.person.id,
        // Rassemblés sur la tête : c'est ce qui fait disparaître le tas.
        latitude: cluster.latitude,
        longitude: cluster.longitude,
        // Le membre est entièrement recouvert par la tête. Il garde malgré tout
        // une image, et c'est délibéré : un marqueur sans image ni enfant
        // retombe sur l'épingle rouge par défaut de la carte, et on verrait
        // dépasser des piques de sous chaque groupe.
        image: MEMBER_DOT,
        anchorY: 0.5,
        zIndex: 1,
        data: { kind: 'member' },
      });
    }
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

  list.sort(byId);
  return list;
}
