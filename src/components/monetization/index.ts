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

export { default as SectionHeading } from './SectionHeading';

export { default as PayoutRow } from './PayoutRow';
export { default as ContentRow } from './ContentRow';
export { default as CriterionRow } from './CriterionRow';
export { default as ProgramOverview } from './ProgramOverview';
export { default as Disclosure, DisclosureLine } from './Disclosure';

// Primitives « relevé » — voir l'en-tête de `statement.tsx` pour la règle
// qu'elles imposent (aucune carte, chiffres à chasse fixe, une couleur par
// rôle). L'écran des gains est bâti dessus.
export { Rule, Eyebrow, Figure, LedgerRow, ShareBar } from './statement';

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
