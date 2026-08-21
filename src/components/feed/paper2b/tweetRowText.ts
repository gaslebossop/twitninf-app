/**
 * 🧪 Petites fonctions de texte de la ligne du fil « 2B — Gouttière ».
 *
 * Sorties de `TweetRowGutter.tsx` pour deux raisons, et une seule compte
 * vraiment : elles sont PURES, donc testables sans monter React Native
 * (`tests/tweet-row-text.test.js`). Le reste du fichier ne l'est pas.
 *
 * Aucun import : ce module est chargé tel quel par le lanceur de tests, qui
 * transpile le TypeScript à la volée mais n'a pas de `react-native` à donner.
 */

/**
 * Compteur de la gouttière.
 *
 * Zéro rend une chaîne VIDE, pas « 0 » : une colonne de zéros sous chaque
 * cœur est du bruit. La hauteur de ligne est fixe, donc la gouttière ne bouge
 * pas pour autant.
 */
export function formatCompactCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`;
  return String(n || '');
}

/**
 * Horodatage relatif de l'en-tête d'auteur.
 *
 * `now` est injectable pour les tests : sans lui, l'assertion dépendrait de
 * l'heure à laquelle la suite tourne.
 *
 * ⚠️ Coûteuse au-delà d'un jour : `toLocaleDateString` passe par `Intl`, ce
 * qui est de très loin l'appel le plus cher d'un rendu de ligne. C'est
 * pourquoi l'appelant la mémoïse sur la date du tweet plutôt que de la
 * rappeler à chaque rendu.
 */
export function formatRelativeDate(d: string, now: number = Date.now()): string {
  const diff = now - new Date(d).getTime();
  if (diff < 60000) return `${Math.floor(diff / 1000)} s`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)} min`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} h`;
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/** Nombre de lignes affichées avant « Voir plus ». */
export const TRUNCATION_LINES = 4;

/**
 * Plafond de caractères sous lequel un texte NE PEUT PAS dépasser
 * `TRUNCATION_LINES` lignes, quelle que soit la largeur d'écran gérée par
 * `ps()` (0,88 → 1,2) et quels que soient les glyphes.
 *
 * Le pire cas réel est une suite de capitales larges (« M », « W ») : à
 * l'échelle maximale, une « M » du corps de tweet fait ~23 px pour une
 * colonne de contenu d'environ 380 px, soit ~16 caractères par ligne. 48
 * caractères tiennent donc en 3 lignes pleines ; il reste une ligne de marge
 * pour un éventuel saut de ligne dur.
 *
 * Volontairement PESSIMISTE : se tromper ici ferait disparaître le bouton
 * « Voir plus » d'un tweet réellement tronqué, ce qu'aucun test de compilation
 * ne verrait.
 */
const SAFE_INLINE_CHARS = 48;

/** Sauts de ligne durs tolérés sous ce plafond. */
const SAFE_HARD_BREAKS = 1;

/**
 * Ce texte peut-il se passer de la MESURE de troncature ?
 *
 * ── Ce que la mesure coûte ───────────────────────────────────────────────
 * Pour savoir s'il faut proposer « Voir plus », la ligne rend une SECONDE
 * fois le corps du tweet, en clair, hors écran (`hiddenMeasure`), et lit
 * `onTextLayout`. Autrement dit : chaque ligne du fil met en forme son texte
 * deux fois au montage, puis se re-rend une troisième fois pour ranger le
 * résultat. La mise en forme de texte est ce qu'il y a de plus cher dans une
 * ligne après les images, et une `FlatList` remonte ses cellules à chaque
 * passage dans la fenêtre de virtualisation.
 *
 * ── Ce que cette fonction évite ──────────────────────────────────────────
 * Un texte assez court pour ne PAS pouvoir être tronqué n'a rien à mesurer :
 * on sait déjà que la réponse est « non ». On économise alors la seconde mise
 * en forme ET le rendu supplémentaire.
 */
export function canSkipTruncationMeasure(text: string | null | undefined): boolean {
  if (!text) return true;
  if (text.length > SAFE_INLINE_CHARS) return false;

  let breaks = 0;
  for (let i = 0; i < text.length; i += 1) {
    // 10 = « \n ». Un `split` allouerait un tableau pour une simple somme.
    if (text.charCodeAt(i) === 10) breaks += 1;
    if (breaks > SAFE_HARD_BREAKS) return false;
  }
  return true;
}
