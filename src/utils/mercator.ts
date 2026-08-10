/**
 * Projection Web Mercator — le peu de maths dont une carte a besoin.
 *
 * Le monde entier tient dans un carré de `256 × 2^zoom` pixels. Tout le reste
 * en découle : une tuile est un carré de 256 px de ce plan, un marqueur est un
 * point de ce plan, et afficher la carte revient à décider quelle fenêtre de
 * ce plan on regarde.
 *
 * Raisonner en « pixels du monde » plutôt qu'en degrés évite l'erreur classique
 * d'une carte faite maison : positionner les marqueurs par une règle de trois
 * sur la latitude. Mercator n'est pas linéaire en latitude — les marqueurs
 * dériveraient d'autant plus qu'on s'éloigne de l'équateur, sans que ça se voie
 * lors d'un essai fait à Paris.
 */

export const TILE_SIZE = 256;

/** Bornes de Mercator : les pôles s'y projetteraient à l'infini. */
export const MAX_LATITUDE = 85.05112878;

export interface WorldPoint {
  x: number;
  y: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Point géographique → pixel du plan monde, à ce niveau de zoom. */
export function latLonToWorld(latitude: number, longitude: number, zoom: number): WorldPoint {
  const size = TILE_SIZE * Math.pow(2, zoom);
  const lat = clamp(latitude, -MAX_LATITUDE, MAX_LATITUDE);
  const lon = ((longitude + 180) % 360 + 360) % 360 - 180;

  const x = ((lon + 180) / 360) * size;
  const sin = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size;

  return { x, y };
}

/** Pixel du plan monde → point géographique. */
export function worldToLatLon(x: number, y: number, zoom: number): { latitude: number; longitude: number } {
  const size = TILE_SIZE * Math.pow(2, zoom);
  const longitude = (x / size) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / size;
  const latitude = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { latitude, longitude };
}

export interface TileRef {
  x: number;
  y: number;
  z: number;
  /** Position à l'écran du coin haut-gauche de la tuile. */
  left: number;
  top: number;
}

/**
 * Tuiles nécessaires pour couvrir une fenêtre centrée sur un point.
 *
 * Une marge d'une tuile est ajoutée autour : sans elle, un déplacement révèle
 * du vide le temps que la tuile suivante arrive.
 */
export function visibleTiles(
  center: { latitude: number; longitude: number },
  zoom: number,
  viewport: { width: number; height: number },
  margin = 1
): TileRef[] {
  const z = Math.round(zoom);
  const worldSize = TILE_SIZE * Math.pow(2, z);
  const centerPoint = latLonToWorld(center.latitude, center.longitude, z);

  const originX = centerPoint.x - viewport.width / 2;
  const originY = centerPoint.y - viewport.height / 2;

  const firstX = Math.floor(originX / TILE_SIZE) - margin;
  const lastX = Math.floor((originX + viewport.width) / TILE_SIZE) + margin;
  const firstY = Math.floor(originY / TILE_SIZE) - margin;
  const lastY = Math.floor((originY + viewport.height) / TILE_SIZE) + margin;

  const count = Math.pow(2, z);
  const tiles: TileRef[] = [];

  for (let ty = firstY; ty <= lastY; ty += 1) {
    // Pas d'enroulement vertical : au-delà des pôles il n'y a pas de tuile,
    // demander `y = -1` ne rendrait qu'une erreur du serveur de tuiles.
    if (ty < 0 || ty >= count) continue;

    for (let tx = firstX; tx <= lastX; tx += 1) {
      // Horizontalement, le monde s'enroule : à droite du 180e méridien on
      // retrouve le 180e ouest.
      const wrappedX = ((tx % count) + count) % count;
      tiles.push({
        x: wrappedX,
        y: ty,
        z,
        left: tx * TILE_SIZE - originX,
        top: ty * TILE_SIZE - originY,
      });
    }
  }

  // Garde-fou : une fenêtre démesurée demanderait des milliers de tuiles.
  return tiles.slice(0, 64);
}

/** Position à l'écran d'un point géographique, dans la même fenêtre. */
export function screenPosition(
  point: { latitude: number; longitude: number },
  center: { latitude: number; longitude: number },
  zoom: number,
  viewport: { width: number; height: number }
): { x: number; y: number } {
  const z = Math.round(zoom);
  const centerPoint = latLonToWorld(center.latitude, center.longitude, z);
  const target = latLonToWorld(point.latitude, point.longitude, z);

  return {
    x: target.x - (centerPoint.x - viewport.width / 2),
    y: target.y - (centerPoint.y - viewport.height / 2),
  };
}

/** Nouveau centre après un déplacement de `dx, dy` pixels à l'écran. */
export function panCenter(
  center: { latitude: number; longitude: number },
  zoom: number,
  dx: number,
  dy: number
): { latitude: number; longitude: number } {
  const z = Math.round(zoom);
  const point = latLonToWorld(center.latitude, center.longitude, z);
  const moved = worldToLatLon(point.x - dx, point.y - dy, z);
  return {
    latitude: clamp(moved.latitude, -MAX_LATITUDE, MAX_LATITUDE),
    longitude: moved.longitude,
  };
}

/**
 * Rectangle géographique couvert par la fenêtre — c'est ce que l'API attend
 * pour ne renvoyer que les gens réellement à l'écran.
 */
export function viewportBounds(
  center: { latitude: number; longitude: number },
  zoom: number,
  viewport: { width: number; height: number }
): { north: number; south: number; east: number; west: number } {
  const z = Math.round(zoom);
  const point = latLonToWorld(center.latitude, center.longitude, z);

  const topLeft = worldToLatLon(point.x - viewport.width / 2, point.y - viewport.height / 2, z);
  const bottomRight = worldToLatLon(point.x + viewport.width / 2, point.y + viewport.height / 2, z);

  return {
    north: topLeft.latitude,
    south: bottomRight.latitude,
    west: topLeft.longitude,
    east: bottomRight.longitude,
  };
}
