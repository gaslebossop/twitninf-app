/**
 * Formatage des chiffres de la monétisation.
 *
 * Pourquoi ne pas appeler `toLocaleString('fr-FR')`, que le reste de l'app
 * utilise : la table ICU de Hermes n'est pas celle de Node ni celle du système
 * sur tous les appareils. Selon le téléphone, `(1000).toLocaleString('fr-FR')`
 * rend « 1 000 » avec une espace fine insécable, une espace insécable, ou
 * « 1,000 ». Sur un écran dont le sujet EST le montant, ce genre d'écart se
 * remarque tout de suite et fait douter du chiffre lui-même. Tout est donc
 * calculé ici, avec une seule espace insécable (U+00A0) et une virgule
 * décimale, identiques partout.
 *
 * Le module est pur — aucun import React Native — pour rester testable sous
 * `node --test` (voir `tests/monetization-format.test.js`).
 */

/** Espace insécable : un montant ne doit jamais se couper en fin de ligne. */
const NBSP = ' ';
/** Le vrai signe moins typographique, aligné sur les chiffres. */
const MINUS = '−';

const MONTHS_SHORT = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
];

const MONTHS_LONG = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

/** Mars, mai, juin et août ne s'abrègent pas — les abréger rallonge parfois. */
const monthLabel = (index: number) => MONTHS_SHORT[index] ?? '';

/**
 * Le garde-fou de tout l'écran.
 *
 * Toute valeur venue du réseau passe par ici. C'est la réponse au défaut qui a
 * motivé la refonte : un champ renommé côté serveur devenait `undefined`, puis
 * s'affichait tel quel au milieu d'une phrase. Ici il devient `0`, et un zéro
 * se repère immédiatement comme une anomalie.
 */
export function num(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/**
 * Arrondi décimal exact.
 *
 * `(1.005).toFixed(2)` rend « 1.00 » : 1.005 n'existe pas en binaire, la
 * valeur stockée est 1.00499…, et l'arrondi tombe du mauvais côté. Repasser
 * par la notation exponentielle décale la virgule sans repasser par le
 * binaire. Sur un écran d'argent, un centime qui disparaît est une plainte.
 */
function roundTo(value: number, decimals: number): number {
  const shifted = Math.round(Number(`${value}e${decimals}`));
  const back = Number(`${shifted}e-${decimals}`);
  return Number.isFinite(back) ? back : value;
}

/** « 1 240,50 ». Arrondit — ne tronque jamais, un centime perdu se voit. */
export function money(value: unknown, decimals = 2): string {
  const n = num(value);
  const sign = n < 0 ? MINUS : '';
  const fixed = roundTo(Math.abs(n), decimals).toFixed(decimals);
  const [whole, fraction] = fixed.split('.');
  const grouped = groupThousands(whole);
  return fraction ? `${sign}${grouped},${fraction}` : `${sign}${grouped}`;
}

/** « 1,2 k », « 3,4 M ». Au-delà du millier, la précision n'apporte rien. */
export function compact(value: unknown): string {
  const n = Math.round(num(value));
  const abs = Math.abs(n);
  const sign = n < 0 ? MINUS : '';

  const scale = (divisor: number, suffix: string) => {
    const scaled = abs / divisor;
    // 999 999 doit se lire « 1 M », pas « 1000,0 k ».
    const rounded = scaled >= 100 ? Math.round(scaled) : Math.round(scaled * 10) / 10;
    const text = String(rounded).replace('.', ',');
    return `${sign}${text}${NBSP}${suffix}`;
  };

  if (abs >= 999_500) return scale(1_000_000, 'M');
  if (abs >= 1000) return scale(1000, 'k');
  return `${sign}${groupThousands(String(abs))}`;
}

/** Prend un ratio (0–1) et rend « 72 % ». */
export function percent(value: unknown, decimals = 0): string {
  const n = num(value) * 100;
  const fixed = n.toFixed(decimals).replace('.', ',');
  return `${fixed}${NBSP}%`;
}

/**
 * « 3 j 04 h » — assez précis pour situer la clôture, sans faux compte à
 * rebours qui se figerait dès que l'écran perd le focus.
 */
export function timeUntil(iso: string | undefined | null): string {
  if (!iso) return '—';
  const target = new Date(iso).getTime();
  if (!Number.isFinite(target)) return '—';

  const ms = target - Date.now();
  if (ms <= 0) return 'imminente';

  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  // Insécable comme les montants : « 3 j 04 h » coupé en fin de ligne devient
  // « 3 j » sur une ligne et « 04 h » sur la suivante, ce qui se lit de travers.
  if (days >= 1) return `${days}${NBSP}j${NBSP}${String(hours % 24).padStart(2, '0')}${NBSP}h`;
  if (hours >= 1) return `${hours}${NBSP}h${NBSP}${String(minutes % 60).padStart(2, '0')}${NBSP}min`;
  return `${minutes}${NBSP}min`;
}

/**
 * « 11 – 17 août » pour une semaine, « 28 juil. – 3 août » à cheval.
 *
 * La borne de fin est EXCLUSIVE côté serveur (lundi 00:00 du lundi suivant) —
 * on retire une milliseconde avant d'afficher, sinon toutes les semaines
 * paraissent finir un lundi.
 */
export function periodLabel(startIso?: string | null, endIso?: string | null): string {
  if (!startIso) return '';
  const start = new Date(startIso);
  if (!Number.isFinite(start.getTime())) return '';

  if (!endIso) return `${start.getDate()} ${monthLabel(start.getMonth())}`;

  const end = new Date(new Date(endIso).getTime() - 1);
  if (!Number.isFinite(end.getTime())) return `${start.getDate()} ${monthLabel(start.getMonth())}`;

  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.getDate()} – ${end.getDate()} ${monthLabel(end.getMonth())}`;
  }
  return `${start.getDate()} ${monthLabel(start.getMonth())} – ${end.getDate()} ${monthLabel(end.getMonth())}`;
}

/** « 11/08 » — sous une barre d'histogramme, où deux caractères de plus gênent. */
export function shortDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** « 17 août 2026 » — pour une date isolée (encaissement, candidature). */
export function fullDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Variation entre deux périodes, en ratio.
 *
 * `null` quand la période précédente vaut zéro : « +∞ % » n'informe personne,
 * l'écran doit dans ce cas ne rien afficher plutôt qu'un chiffre absurde.
 */
export function deltaRatio(current: unknown, previous: unknown): number | null {
  const before = num(previous);
  if (before <= 0) return null;
  return (num(current) - before) / before;
}

/** « +18 % » / « −12 % ». Chaîne vide si la comparaison n'a pas de sens. */
export function signedPercent(ratio: number | null | undefined, decimals = 0): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return '';
  const value = ratio * 100;
  const sign = value < 0 ? MINUS : '+';
  return `${sign}${Math.abs(value).toFixed(decimals).replace('.', ',')}${NBSP}%`;
}

export { NBSP, MINUS };
