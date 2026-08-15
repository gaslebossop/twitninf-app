/**
 * Regroupement des marqueurs d'une carte.
 *
 * ── Pourquoi c'est indispensable, pas décoratif ──
 * Vingt personnes dans la même agglomération, ce sont vingt épingles empilées :
 * illisible, et surtout vingt vues natives redessinées à chaque image. C'est
 * ce qui fait ramer puis tomber une carte quand on dézoome vite, parce que
 * dézoomer rapproche tout le monde sans réduire le nombre de vues.
 *
 * ── La méthode ──
 * Découpage en grille, dans l'unité qui compte : le PIXEL. Un regroupement
 * défini en degrés serait trop serré à Paris et trop lâche à Oslo — un degré
 * de longitude ne mesure pas la même distance à l'écran selon la latitude et
 * le zoom. On convertit donc le rayon voulu (en pixels) en degrés à ce
 * zoom-là, et on regroupe dessus.
 *
 * Volontairement sans dépendance ni index spatial : quelques centaines de
 * points au maximum, un passage linéaire suffit largement.
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
 * @param items          points à regrouper
 * @param degreesPerPixel  largeur d'un pixel écran, en degrés de longitude
 * @param radiusPx       distance en deçà de laquelle deux points fusionnent
 * @param latitudeCosine cosinus de la latitude de la fenêtre — voir plus bas
 */
export function clusterize<T extends Clusterable>(
  items: T[],
  degreesPerPixel: number,
  radiusPx = 72,
  latitudeCosine = 1
): Array<Cluster<T>> {
  if (items.length === 0) return [];

  const cellLongitude = degreesPerPixel * radiusPx;
  /*
   * La case doit être CARRÉE à l'écran, pas en degrés.
   *
   * En projection Mercator, un degré de latitude occupe `1 / cos(latitude)`
   * fois plus de pixels qu'un degré de longitude. Une case carrée en degrés
   * est donc, à l'écran, un rectangle d'autant plus HAUT qu'on s'éloigne de
   * l'équateur : à Paris (cos 48,85° ≈ 0,66), elle mesurait 72 px de large
   * pour 110 px de haut. Deux personnes séparées de 100 px verticalement
   * fusionnaient — l'une d'elles étant alors réduite à un point sous la tête
   * du groupe, elle avait purement et simplement disparu de la carte.
   *
   * Le garde-fou à 0,05 évite une case nulle près des pôles.
   */
  const cellLatitude = cellLongitude * Math.min(1, Math.max(0.05, latitudeCosine));

  // Grille dégénérée (zoom non encore connu) : chacun reste seul, ce qui est
  // le comportement sûr — on préfère afficher trop de monde que d'agréger au
  // hasard.
  if (
    !Number.isFinite(cellLongitude) ||
    cellLongitude <= 0 ||
    !Number.isFinite(cellLatitude) ||
    cellLatitude <= 0
  ) {
    return items.map((item) => ({
      id: item.id,
      latitude: item.latitude,
      longitude: item.longitude,
      items: [item],
    }));
  }

  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const key = `${Math.floor(item.longitude / cellLongitude)}:${Math.floor(item.latitude / cellLatitude)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }

  const clusters: Array<Cluster<T>> = [];
  for (const bucket of buckets.values()) {
    if (bucket.length === 1) {
      const [only] = bucket;
      clusters.push({ id: only.id, latitude: only.latitude, longitude: only.longitude, items: bucket });
      continue;
    }

    // Le groupe se pose au barycentre de ses membres, pas au centre de la
    // case : sur une case à cheval entre une ville et le vide, le centre de
    // case tomberait à côté de tout le monde.
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
export function quantizedDegreesPerPixel(longitudeDelta: number, screenWidth: number): number {
  if (!Number.isFinite(longitudeDelta) || longitudeDelta <= 0 || screenWidth <= 0) return 0;
  const step = Math.round(Math.log2(360 / longitudeDelta));
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
