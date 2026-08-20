/**
 * Briques du tableau de bord de monétisation.
 *
 * Elles vivent ici plutôt que dans `components/ui` parce qu'elles ne sont pas
 * des primitives : chacune connaît le vocabulaire du pot créateur (un rang
 * dans le vivier, une semaine close, une part estimée). Les mettre dans le
 * barrel partagé inviterait à les réutiliser ailleurs avec un autre sens.
 *
 * Les trois écrans de monétisation — gains, programme, état du compte —
 * partagent ce dossier ; c'est ce qui les fait se ressembler.
 */

export { default as MetricTile } from './MetricTile';
export type { MetricTone } from './MetricTile';

export { default as EarningsBars } from './EarningsBars';
export type { EarningsBar, BarKind } from './EarningsBars';

export { default as QualityRing } from './QualityRing';
export { default as SignalBar } from './SignalBar';
export { default as PayoutRow } from './PayoutRow';
export { default as ContentRow } from './ContentRow';
export { default as CriterionRow } from './CriterionRow';
export { default as ProgramOverview } from './ProgramOverview';
export { default as Disclosure, DisclosureLine } from './Disclosure';

export {
  num,
  money,
  compact,
  percent,
  timeUntil,
  periodLabel,
  shortDate,
  fullDate,
  deltaRatio,
  signedPercent,
  NBSP,
  MINUS,
} from './format';
