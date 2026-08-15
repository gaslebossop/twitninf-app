/**
 * Regroupement des marqueurs d'une carte.
 *
 * ── Pourquoi c'est indispensable, pas décoratif ──
 * Vingt personnes dans la même agglomération, ce sont vingt épingles empilées :
 * illisible, et surtout vingt vues natives redessinées à chaque image. C'est
 * ce qui fait ramer puis tomber une carte quand on dézoome vite, parce que
 * dézoomer rapproche tout le monde sans réduire le nombre de vues.
 *
 * ── La méthode, et pourquoi ce n'est plus une grille ──
 * Le regroupement se fait par DISTANCE réelle à l'écran, en pixels : chaque
 * groupe est semé sur un point, puis absorbe ceux qui tiennent dans son rayon.
 *
 * La version précédente découpait le plan en cases. C'était plus simple et
 * c'était faux : deux personnes aux coins opposés d'une case de 72 px sont à
 * 102 px l'une de l'autre, et l'arrondi du zoom par paliers entiers pouvait
 * encore gonfler la case de 41 % — on a mesuré des groupes réunissant des gens
 * séparés de 143 px, soit plus du tiers de la largeur d'un téléphone. Vu de
 * l'écran, ça donne des groupes aberrants, et les absorbés disparaissent
 * derrière une tête qui n'est pas près d'eux.
 *
 * Une grille a aussi des FRONTIÈRES : deux points à un pixel l'un de l'autre,
 * mais de part et d'autre d'une bordure, ne se regroupent jamais, et la
 * composition change dès que la bordure bouge. C'est ce défaut-là que
 * l'arrondi du zoom cherchait à masquer. Le semis par distance n'a pas de
 * frontière : il ne dépend que des positions relatives.
 *
 * Volontairement sans dépendance ni index spatial : quelques centaines de
 * points au maximum, une comparaison deux à deux reste immédiate.
 */

export interface Clusterable {
  id: string;
  latitude: number;
  longitude: number;
}

export interface Cluster<T extends Clusterable> {
  /** Stable tant que la composition ne change pas — évite de recréer la vue. */
  id: string;
  latitude: number;
  longitude: number;
  items: T[];
}

/**
 * Distance maximale à la GRAINE d'un groupe, en pixels d'écran.
 *
 * ⚠️ C'est une DEMI-largeur, pas une largeur. Deux membres diamétralement
 * opposés sont à `2 × CLUSTER_RADIUS_PX` l'un de l'autre : c'est le piège de
 * cette famille d'algorithmes, et c'est ce qui a produit des groupes de 204 px
 * de large alors qu'on croyait en demander 72.
 *
 * 36 px donne donc des groupes de 72 px au plus — 79 px en tenant compte de
 * l'arrondi de l'échelle. Une épingle mesurant 46 px, deux personnes ainsi
 * réunies sont bien à un jet de pierre l'une de l'autre à l'écran, ce qui est
 * exactement ce que « regrouper » doit vouloir dire.
 */
export const CLUSTER_RADIUS_PX = 36;

/**
/**
 * @param items            points à regrouper
 * @param degreesPerPixel  largeur d'un pixel écran, en degrés de longitude
 * @param radiusPx         DEMI-largeur d'un groupe, en pixels — voir plus bas
 * @param latitudeCosine   cosinus de la latitude de la fenêtre — voir plus bas
 */
export function clusterize<T extends Clusterable>(
  items: T[],
  degreesPerPixel: number,
  radiusPx = CLUSTER_RADIUS_PX,
  latitudeCosine = 1
): Array<Cluster<T>> {
  if (items.length === 0) return [];

  /*
   * Un degré de latitude ne vaut pas un degré de longitude à l'écran.
   *
   * En projection Mercator, un degré de latitude occupe `1 / cos(latitude)`
   * fois plus de pixels : à Paris (cos 48,85° ≈ 0,66), il est une fois et demie
   * plus « long » qu'un degré de longitude. Sans cette correction, le rayon de
   * regroupement serait un ovale couché, et des gens séparés de cent pixels
   * verticalement fusionneraient — l'un d'eux disparaissant alors derrière la
   * tête du groupe.
   *
   * Le garde-fou à 0,05 évite une division explosive près des pôles.
   */
  const cosine = Math.min(1, Math.max(0.05, latitudeCosine));
  const degreesPerPixelY = degreesPerPixel * cosine;

  // Échelle inconnue (zoom pas encore connu) : chacun reste seul, ce qui est le
  // comportement sûr — on préfère afficher trop de monde que d'agréger au
  // hasard.
  if (
    !Number.isFinite(degreesPerPixel) ||
    degreesPerPixel <= 0 ||
    !Number.isFinite(degreesPerPixelY) ||
    degreesPerPixelY <= 0
  ) {
    return items.map((item) => ({
      id: item.id,
      latitude: item.latitude,
      longitude: item.longitude,
      items: [item],
    }));
  }

  /*
   * Semis dans l'ordre des identifiants, et non dans l'ordre d'arrivée.
   *
   * C'est ce qui rend le résultat reproductible : deux calculs successifs sur
   * le même ensemble sèment les mêmes groupes, donc désignent les mêmes têtes
   * et demandent les mêmes images. Semer dans l'ordre du serveur ferait changer
   * la composition à chaque réponse, pour des gens qui n'ont pas bougé.
   */
  const ordered = [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const taken = new Set<string>();
  const clusters: Array<Cluster<T>> = [];
  const radiusSquared = radiusPx * radiusPx;

  for (const seed of ordered) {
    if (taken.has(seed.id)) continue;
    taken.add(seed.id);

    const bucket: T[] = [seed];
    for (const other of ordered) {
      if (taken.has(other.id)) continue;

      const dx = (other.longitude - seed.longitude) / degreesPerPixel;
      const dy = (other.latitude - seed.latitude) / degreesPerPixelY;
      if (dx * dx + dy * dy > radiusSquared) continue;

      bucket.push(other);
      taken.add(other.id);
    }

    if (bucket.length === 1) {
      clusters.push({
        id: seed.id,
        latitude: seed.latitude,
        longitude: seed.longitude,
        items: bucket,
      });
      continue;
    }

    // Le groupe se pose au barycentre de ses membres, pas sur sa graine : une
    // graine excentrée désignerait un point où le groupe n'est pas.
    let latitude = 0;
    let longitude = 0;
    for (const item of bucket) {
      latitude += item.latitude;
      longitude += item.longitude;
    }

    clusters.push({
      // L'identifiant dépend de la composition : deux groupes différents ne
      // réutilisent jamais la même vue de marqueur.
      id: `groupe:${bucket.map((item) => item.id).sort().join(',')}`,
      latitude: latitude / bucket.length,
      longitude: longitude / bucket.length,
      items: bucket,
    });
  }

  return clusters;
}

/** Largeur d'un pixel écran en degrés, pour la fenêtre affichée. */
export function degreesPerPixel(longitudeDelta: number, screenWidth: number): number {
  if (!Number.isFinite(longitudeDelta) || screenWidth <= 0) return 0;
  return longitudeDelta / screenWidth;
}

/**
 * La même largeur, mais ARRONDIE au palier de zoom.
 *
 * Le pas de grille calculé sur la largeur exacte de la fenêtre change d'un
 * poil de virgule à chaque déplacement du doigt : les frontières de cases se
 * décalent, la composition des groupes bouge, et l'affichage de la moitié des
 * épingles est refait pour rien — alors que la carte montre exactement les
 * mêmes gens au même endroit.
 *
 * En arrondissant au palier de zoom, un déplacement à zoom constant produit un
 * pas RIGOUREUSEMENT identique : mêmes cases, mêmes groupes, rien à redessiner.
 * Seul un zoom change quelque chose — et c'est un geste rare et délibéré.
 */
/**
 * Par QUARTS de palier, et plus par paliers entiers.
 *
 * L'arrondi grossit l'échelle, donc le rayon, donc ce que la carte considère
 * comme « proche ». Par paliers entiers l'erreur atteint 2^0,5 — 41 % — et on a
 * mesuré des groupes de 204 px de large. Par quarts elle plafonne à 2^0,125,
 * soit 9 %. La stabilité tient toujours : la dérive de ±1 % que produit un
 * déplacement nord-sud ne franchit presque jamais un quart de palier.
 */
const ZOOM_SUBDIVISIONS = 4;

export function quantizedDegreesPerPixel(longitudeDelta: number, screenWidth: number): number {
  if (!Number.isFinite(longitudeDelta) || longitudeDelta <= 0 || screenWidth <= 0) return 0;
  const step = Math.round(Math.log2(360 / longitudeDelta) * ZOOM_SUBDIVISIONS) / ZOOM_SUBDIVISIONS;
  return 360 / Math.pow(2, step) / screenWidth;
}

/**
 * Le cosinus de la latitude, lui aussi ARRONDI — pour la même raison que le pas
 * de grille au-dessus.
 *
 * Pris sur la latitude exacte du centre, il changerait à chaque déplacement du
 * doigt, donc la hauteur des cases aussi, donc la composition des groupes :
 * exactement ce que `quantizedDegreesPerPixel` existe pour empêcher. Par
 * paliers de 5°, remonter la France entière ne franchit qu'une poignée de
 * marches, et deux fenêtres du même palier donnent une grille identique.
 */
export function quantizedLatitudeCosine(latitude: number): number {
  if (!Number.isFinite(latitude)) return 1;
  const step = Math.round(Math.min(85, Math.max(-85, latitude)) / 5) * 5;
  return Math.cos((step * Math.PI) / 180);
}
