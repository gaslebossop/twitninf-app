/**
 * Mise en forme des valeurs du relevé d'écoute.
 *
 * Séparé du rendu, sans import React Native : ces fonctions décident des
 * décimales et des unités, les composants ne décident que de la taille et de
 * la couleur. C'est aussi ce qui les rend vérifiables sans monter un écran.
 *
 * Deux caractères comptent ici :
 *   * `NBSP` — une espace insécable entre le chiffre et son unité, pour que
 *     « 12 s » ne se coupe jamais en fin de ligne.
 *   * `MINUS` — le vrai signe moins (U+2212), pas le trait d'union : sur une
 *     colonne de chiffres, le trait d'union est trop court et le signe saute.
 */

export const NBSP = ' ';
export const MINUS = '−';

/** Un nombre entier, séparateurs français. */
export function num(value: number): string {
  return Math.round(finite(value)).toLocaleString('fr-FR');
}

/** Abrégé pour les grands comptes : 12,4 k, 3,1 M. */
export function compact(value: number): string {
  const n = finite(value);
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${trim(n / 1_000_000)}${NBSP}M`;
  if (abs >= 10_000) return `${trim(n / 1_000)}${NBSP}k`;
  return num(n);
}

/** Un décimal au plus, virgule française, sans zéro inutile. */
export function trim(value: number): string {
  return finite(value).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}

/**
 * Une durée, en deux morceaux — le chiffre et son unité — parce que le rendu
 * les compose à des tailles différentes.
 *
 * L'unité change avec l'ordre de grandeur : une lecture moyenne se dit en
 * secondes, un cumul hebdomadaire en heures. Au-delà de l'heure, la forme
 * « 4 h 12 » porte déjà son unité, d'où une unité vide.
 */
export function duration(ms: number): { value: string; unit: string } {
  const total = Math.max(0, finite(ms));

  if (total < 1000) return { value: '0', unit: 's' };
  if (total < 60_000) return { value: trim(total / 1000), unit: 's' };
  // Sous dix minutes, l'entier ment trop : 90 s arrondi donnerait « 2 min »,
  // soit un tiers de plus que la durée réelle.
  if (total < 600_000) return { value: trim(total / 60_000), unit: 'min' };
  if (total < 3_600_000) return { value: num(total / 60_000), unit: 'min' };

  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.round((total % 3_600_000) / 60_000);
  // 59,7 min arrondi à 60 doit passer à l'heure suivante, pas afficher « 4 h 60 ».
  if (minutes === 60) return { value: `${hours + 1}${NBSP}h${NBSP}00`, unit: '' };
  return { value: `${hours}${NBSP}h${NBSP}${String(minutes).padStart(2, '0')}`, unit: '' };
}

/** La même durée sur une seule ligne, pour une ligne de registre. */
export function durationInline(ms: number): string {
  const { value, unit } = duration(ms);
  return unit ? `${value}${NBSP}${unit}` : value;
}

/**
 * Une variation, signée et lisible.
 * `null` quand il n'y a rien à comparer — un « +0 % » inventé vaut moins que
 * l'aveu qu'on n'a pas encore d'histoire.
 */
export function signedPercent(ratio: number | null): string | null {
  if (ratio === null || !Number.isFinite(ratio)) return null;
  const pct = ratio * 100;
  if (Math.abs(pct) < 0.5) return 'stable';
  const sign = pct > 0 ? '+' : MINUS;
  return `${sign}${trim(Math.abs(pct))}${NBSP}%`;
}

/** Rang dans le vivier, écrit — jamais dessiné en anneau. */
export function rank(percentile: number | null): string | null {
  if (percentile === null || !Number.isFinite(percentile)) return null;
  const value = Math.round(Math.min(1, Math.max(0, percentile)) * 100);
  return `${value === 1 ? '1er' : `${value}e`}${NBSP}/100`;
}

/** « 12 août » — la date d'ouverture d'une semaine de relevé. */
export function dayLabel(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function finite(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}
