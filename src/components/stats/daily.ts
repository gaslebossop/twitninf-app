/**
 * La journée, unité de base du relevé.
 *
 * Module PUR : aucun import React Native, aucun réseau. Tout ce qui décide de
 * ce qu'affiche le haut de l'écran — le temps de lecture total, sa moyenne par
 * vue, le regroupement des barres quand la période est longue — tient ici,
 * plutôt que dans le JSX où ce serait invérifiable.
 *
 * ── Pourquoi le jour, maintenant ───────────────────────────────────────────
 * Le temps de lecture n'existait qu'agrégé À LA SEMAINE, dans
 * `economy/creatorPool/signals.js`, pour calculer la part du pot. Aucune
 * surface ne pouvait donc en montrer une courbe : il aurait fallu répartir la
 * moyenne hebdomadaire sur les vues du jour, c'est-à-dire fabriquer une courbe
 * crédible et fausse. `/api/user-stats/:id/daily` sert `dwell_ms` et
 * `earnings` par jour depuis le 2026-08-21 ; ce module les exploite.
 */

/** Une journée servie par `/api/user-stats/:id/daily`. */
export interface DailyPoint {
  date: string;
  views: number;
  interactions: number;
  followers: number;
  profileViews: number;
  /** Temps de lecture réellement chronométré ce jour-là, en millisecondes. */
  dwellMs: number;
  /**
   * Nombre de mesures de lecture du jour. Distingue « personne n'a lu » de
   * « personne n'était instrumenté » : sans lui, un zéro est ambigu et
   * l'écran annoncerait une chute qui n'en est pas une.
   */
  dwellEvents: number;
  /** Ce que la plateforme a versé ce jour-là, dans la monnaie de plateforme. */
  earnings: number;
}

export const EMPTY_DAY: DailyPoint = {
  date: '',
  views: 0,
  interactions: 0,
  followers: 0,
  profileViews: 0,
  dwellMs: 0,
  dwellEvents: 0,
  earnings: 0,
};

/**
 * Somme les composantes BRUTES de plusieurs journées.
 *
 * Les ratios (le RPM) se recalculent depuis ces sommes, jamais en moyennant
 * les ratios quotidiens : moyenner des moyennes donne un nombre faux dès que
 * les jours n'ont pas le même volume de vues.
 */
export function mergeDays(points: DailyPoint[]): DailyPoint {
  return points.reduce<DailyPoint>(
    (acc, point) => ({
      date: acc.date || point.date,
      views: acc.views + point.views,
      interactions: acc.interactions + point.interactions,
      followers: acc.followers + point.followers,
      profileViews: acc.profileViews + point.profileViews,
      dwellMs: acc.dwellMs + point.dwellMs,
      dwellEvents: acc.dwellEvents + point.dwellEvents,
      earnings: acc.earnings + point.earnings,
    }),
    { ...EMPTY_DAY },
  );
}

/** Une colonne du graphique : un jour, ou un paquet de jours consécutifs. */
export interface Bucket {
  from: string;
  to: string;
  point: DailyPoint;
  days: number;
}

/**
 * Regroupe les journées pour qu'il ne reste jamais plus de `maxBars` colonnes.
 *
 * Trois cent soixante-cinq barres ne tiennent pas sur un téléphone : sous
 * trois pixels, une barre n'est plus lisible et le doigt ne peut plus la
 * viser. Les paquets sont de taille égale et pris dans l'ordre, si bien que
 * le dernier peut être plus court — c'est la période récente qui compte le
 * plus, elle ne doit pas être diluée dans un paquet artificiellement complété.
 */
export function bucketDays(days: DailyPoint[], maxBars: number): Bucket[] {
  if (days.length === 0) return [];
  const size = Math.max(1, Math.ceil(days.length / Math.max(1, maxBars)));

  const buckets: Bucket[] = [];
  for (let i = 0; i < days.length; i += size) {
    const slice = days.slice(i, i + size);
    buckets.push({
      from: slice[0].date,
      to: slice[slice.length - 1].date,
      point: slice.length === 1 ? slice[0] : mergeDays(slice),
      days: slice.length,
    });
  }
  return buckets;
}

/** Le revenu pour mille vues d'un ensemble de journées déjà sommées. */
export function rpmOf(point: DailyPoint): number {
  return point.views > 0 ? (point.earnings / point.views) * 1000 : 0;
}

export interface DwellSummary {
  totalMs: number;
  views: number;
  /** Durée moyenne par vue — définition standard du temps de lecture par vue. */
  msPerView: number;
  perDayMs: number;
  /**
   * Variation entre les deux moitiés de la période affichée. C'est la seule
   * comparaison dont on ait les journées sous la main ; elle est nommée comme
   * telle à l'écran, jamais maquillée en « période précédente ».
   */
  deltaRatio: number | null;
  /** Faux quand aucune lecture n'a été chronométrée sur la période. */
  measured: boolean;
}

export function summarizeDailyDwell(days: DailyPoint[]): DwellSummary {
  const whole = mergeDays(days);

  const half = Math.floor(days.length / 2);
  const firstHalf = mergeDays(days.slice(0, half)).dwellMs;
  const secondHalf = mergeDays(days.slice(half)).dwellMs;

  return {
    totalMs: whole.dwellMs,
    views: whole.views,
    msPerView: whole.views > 0 ? whole.dwellMs / whole.views : 0,
    perDayMs: days.length > 0 ? whole.dwellMs / days.length : 0,
    deltaRatio: half > 0 && firstHalf > 0 ? (secondHalf - firstHalf) / firstHalf : null,
    measured: whole.dwellEvents > 0,
  };
}
