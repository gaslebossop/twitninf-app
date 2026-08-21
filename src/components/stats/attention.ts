/**
 * Le temps de lecture, semaine par semaine.
 *
 * ── D'où vient la donnée ────────────────────────────────────────────────────
 * De nulle part de nouveau : elle était déjà calculée, elle n'était juste
 * montrée à personne. `DwellSessionTracker` chronomètre la lecture dans le fil,
 * `dwellMirror` la reflète côté serveur, et `economy/creatorPool/signals.js` en
 * tire, pour chaque semaine close, un `rates.attention` — le temps de lecture
 * moyen par vue chronométrable. C'est le signal le plus lourd du score de
 * qualité, donc celui qui décide de la part du pot ; il n'apparaissait sur
 * aucun écran.
 *
 * Ce module ne fait que le lire et le remettre en ordre. Il est PUR : aucun
 * import React Native, aucun réseau. Toute la dérivation discutable (le total
 * lu, la comparaison à la période précédente) tient ici plutôt que dans le JSX,
 * où elle serait invérifiable.
 *
 * ── La semaine, et pas le jour ──────────────────────────────────────────────
 * La tentation serait d'afficher une courbe quotidienne. Il n'y a pas de
 * source : le temps lu n'est agrégé par auteur qu'à la clôture d'une période du
 * pot, qui est hebdomadaire. Fabriquer un jour en répartissant la moyenne sur
 * les vues du jour donnerait une courbe crédible et fausse. La semaine est
 * l'unité réelle de cette mesure, l'écran l'assume.
 *
 * ── Mesuré ou estimé ────────────────────────────────────────────────────────
 * `hasRealDwell` distingue les deux. Quand personne n'a été chronométré sur les
 * publications d'un compte, le moteur retombe sur une estimation décotée
 * (`attentionProxyDiscount`). Une estimation affichée comme une mesure serait
 * un mensonge à l'échelle de l'écran entier : `measured` remonte l'information
 * jusqu'au rendu, qui l'écrit.
 */

import type { CreatorPoolDashboard } from '../../services/creatorPoolService';

/** Une semaine de relevé, close ou en cours. */
export interface AttentionWeek {
  key: string;
  start: string;
  end: string;
  /** Durée de lecture moyenne par vue chronométrable, en millisecondes. */
  msPerView: number;
  /** Vues sur lesquelles la lecture a pu être chronométrée. */
  measurableViews: number;
  /** Temps total lu sur la semaine, en millisecondes. */
  totalMs: number;
  /** Monnaie pour mille vues qualifiées, telle que figée à la clôture. */
  rpm: number;
  /** Rang d'attention dans le vivier de la semaine, 0..1. */
  attentionRank: number | null;
  /** La lecture a-t-elle été réellement chronométrée ? Sinon, estimation décotée. */
  measured: boolean;
  /** Semaine non close — le montant et le rang peuvent encore bouger. */
  inProgress: boolean;
}

/** Ce que le haut de l'écran affiche, une fois les semaines additionnées. */
export interface AttentionSummary {
  /** Temps total lu sur les semaines retenues. */
  totalMs: number;
  /** Durée moyenne par vue, pondérée par les vues — pas la moyenne des moyennes. */
  msPerView: number;
  measurableViews: number;
  /** Variation du temps total contre les semaines précédentes, `null` sans historique. */
  deltaRatio: number | null;
  /** Nombre de semaines effectivement comparées, pour l'écrire au lecteur. */
  weeks: number;
  /** RPM de la semaine la plus récente. */
  latestRpm: number;
  /** Variation du RPM entre les deux dernières semaines closes ou en cours. */
  rpmDeltaRatio: number | null;
  /** Rang d'attention le plus récent connu. */
  latestRank: number | null;
  /** Vrai dès qu'une seule semaine a été réellement chronométrée. */
  measured: boolean;
}

/**
 * Combien de semaines de relevé correspondent à la période choisie plus haut
 * dans l'écran. Un seul contrôle de période gouverne toute la page : mélanger
 * « 90 jours » pour les vues et « toutes les semaines » pour la lecture ferait
 * deux écrans dans un.
 */
export function weeksForTimeframe(timeframe: '7d' | '30d' | '90d' | '1y'): number {
  switch (timeframe) {
    case '7d':
      return 1;
    case '30d':
      return 4;
    case '90d':
      return 13;
    default:
      return 52;
  }
}

/**
 * Remet les semaines en ordre chronologique, la plus ancienne d'abord, et
 * ajoute la semaine en cours en dernier si le pot en projette une.
 *
 * `limit` borne la sortie aux N semaines les plus RÉCENTES : c'est la période
 * choisie, pas un échantillon.
 */
export function buildAttentionWeeks(
  dashboard: CreatorPoolDashboard | null,
  limit: number,
): AttentionWeek[] {
  if (!dashboard) return [];

  const closed: AttentionWeek[] = (dashboard.history || []).map((entry) => {
    const breakdown = (entry.breakdown || {}) as Record<string, any>;
    const msPerView = numberOf(breakdown?.rates?.attention);
    const measurableViews = numberOf(breakdown?.measurableViews);
    return {
      key: entry.periodKey,
      start: entry.periodStart,
      end: entry.periodEnd,
      msPerView,
      measurableViews,
      totalMs: msPerView * measurableViews,
      rpm: numberOf(entry.rpm),
      attentionRank: rankOf(breakdown?.percentiles?.attention),
      measured: breakdown?.hasRealDwell === true,
      inProgress: false,
    };
  });

  const current = dashboard.currentPeriod;
  const projection = current?.projection;
  if (projection) {
    const msPerView = numberOf(projection.rates?.attention);
    const measurableViews = numberOf(projection.measurableViews);
    closed.push({
      key: current.key,
      start: current.start,
      end: current.end,
      msPerView,
      measurableViews,
      totalMs: msPerView * measurableViews,
      rpm: numberOf(projection.rpm),
      attentionRank: rankOf(projection.percentiles?.attention),
      measured: projection.hasRealDwell === true,
      inProgress: true,
    });
  }

  const ordered = closed
    .filter((week) => !!week.start)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  return limit > 0 ? ordered.slice(-limit) : ordered;
}

/**
 * Le total, et sa comparaison au bloc de semaines qui précède.
 *
 * `previous` doit contenir AU MOINS autant de semaines que `weeks` pour que la
 * comparaison ait un sens ; sinon on renvoie `null` plutôt qu'une progression
 * fabriquée par une période plus courte.
 */
export function summarizeAttention(
  weeks: AttentionWeek[],
  previous: AttentionWeek[] = [],
): AttentionSummary {
  const totalMs = weeks.reduce((sum, week) => sum + week.totalMs, 0);
  const measurableViews = weeks.reduce((sum, week) => sum + week.measurableViews, 0);
  const previousTotal = previous.reduce((sum, week) => sum + week.totalMs, 0);

  const comparable = previous.length >= weeks.length && previousTotal > 0;
  const last = weeks[weeks.length - 1] || null;
  const beforeLast = weeks[weeks.length - 2] || null;

  return {
    totalMs,
    msPerView: measurableViews > 0 ? totalMs / measurableViews : 0,
    measurableViews,
    deltaRatio: comparable ? (totalMs - previousTotal) / previousTotal : null,
    weeks: weeks.length,
    latestRpm: last ? last.rpm : 0,
    rpmDeltaRatio:
      beforeLast && beforeLast.rpm > 0 && last ? (last.rpm - beforeLast.rpm) / beforeLast.rpm : null,
    latestRank: last ? last.attentionRank : null,
    measured: weeks.some((week) => week.measured),
  };
}

function numberOf(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function rankOf(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null;
}
