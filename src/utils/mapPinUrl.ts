/**
 * URLs des épingles de la Carte NF.
 *
 * ── Pourquoi les épingles sont des images ──
 * Un `<Marker>` de `react-native-maps` dont le contenu est un arbre de vues
 * React passe par la couche d'interopérabilité de Fabric, dont les mainteneurs
 * écrivent qu'elle « ne fonctionne pas pour les composants personnalisés ayant
 * des composants enfants personnalisés ». L'app tombait dans
 * `insertReactSubview:`, côté natif, à chaque zoom. Le dessin est donc parti
 * sur le serveur — voir `api/src/services/nfMapPinService.js` et la règle 1 en
 * en-tête de `NfMapCanvas`.
 *
 * ── Pourquoi ce fichier ne connaît ni React Native ni la configuration ──
 * L'origine et la densité d'écran sont passées en paramètres plutôt que lues
 * ici. C'est ce qui rend ce calcul — et donc `buildMapMarkers`, qui s'en sert —
 * vérifiable hors d'un appareil : `PixelRatio` et `API_CONFIG` traînent tout le
 * runtime natif derrière eux.
 */

export type PinVariant = 'precise' | 'city' | 'selected' | 'self' | 'ghost';

/**
 * Ancrage vertical des deux sortes d'épingles.
 *
 * ⚠️ Doivent rester égaux à `PIN.anchorY` / `CLUSTER.anchorY` dans
 * `api/src/services/nfMapPinService.js`. Un marqueur est ancré sur le point
 * qu'il désigne : pour une épingle c'est la POINTE, pas le bas de l'image —
 * sous la pointe il reste encore l'étiquette du pseudo. Ancrer en bas
 * décalerait tout le monde vers le nord de la hauteur de son étiquette.
 */
export const PIN_ANCHOR_Y = 0.7297;
export const CLUSTER_ANCHOR_Y = 0.6667;

/** Trois visages au plus sur une épingle de groupe — voir la route de rendu. */
export const MAX_CLUSTER_FACES = 3;

/** Densités servies par le serveur. Au-delà, plus rien de visible à gagner. */
export function clampPinDensity(density: number): number {
  if (!Number.isFinite(density)) return 2;
  return Math.min(4, Math.max(1, Math.round(density)));
}

/**
 * L'avatar entre dans l'URL comme simple EMPREINTE de cache.
 *
 * Le serveur ne la lit pas : il relit l'avatar en base. Mais changer de photo
 * change cette chaîne, donc l'URL, donc l'image que les caches — CDN, Fresco,
 * `RCTImageLoader` — tiennent pour neuve. Sans elle, une nouvelle photo de
 * profil mettrait une journée à apparaître sur la carte.
 */
export function cacheTag(value: string | null | undefined): string {
  if (!value) return '0';
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(36);
}

export interface PinOrigin {
  /** Racine de l'API, sans barre finale. */
  origin: string;
  /**
   * Densité de l'écran.
   *
   * iOS charge l'image du marqueur avec `scale: RCTScreenScale()`, Android
   * dessine le bitmap à sa taille en pixels : les deux veulent `points ×
   * densité`. C'est donc l'app qui doit la dire — le serveur ne peut pas la
   * deviner.
   */
  density: number;
}

/** URL de l'épingle d'une personne. */
export function personPinUrl(
  { origin, density }: PinOrigin,
  person: { id: string; avatar: string | null; variant: PinVariant; label?: string }
): string {
  const query = new URLSearchParams({
    v: person.variant,
    d: String(clampPinDensity(density)),
    c: cacheTag(person.avatar),
  });
  if (person.label) query.set('label', person.label.slice(0, 24));
  return `${origin}/api/nf-map/pin/${encodeURIComponent(person.id)}.png?${query.toString()}`;
}

/**
 * URL de l'épingle d'un groupe.
 *
 * `faces` ne porte que les visages MONTRÉS. Envoyer la composition entière d'un
 * groupe de quarante allongerait l'URL sans rien ajouter à l'image, et ferait
 * rater le cache dès qu'un membre lointain bouge.
 */
export function clusterPinUrl(
  { origin, density }: PinOrigin,
  faces: Array<{ id: string; avatar: string | null }>,
  count: number
): string {
  const shown = faces.slice(0, MAX_CLUSTER_FACES);
  const query = new URLSearchParams({
    ids: shown.map((face) => face.id).join(','),
    count: String(count),
    d: String(clampPinDensity(density)),
    // Empreinte des avatars montrés : une photo changée doit renouveler
    // l'image du groupe, pas seulement celle de l'épingle isolée.
    c: cacheTag(shown.map((face) => face.avatar || '0').join('|')),
  });
  return `${origin}/api/nf-map/cluster.png?${query.toString()}`;
}
