/**
 * Briques du relevé d'écoute.
 *
 * Elles vivent ici et non dans `components/ui` parce qu'elles connaissent le
 * vocabulaire de cette page — un temps de lecture, une semaine de pot, un
 * créneau horaire. Dans le barrel partagé, elles inviteraient à poser un
 * « gros chiffre » sur un écran qui n'est pas un relevé.
 */

export { Rule, Eyebrow, BigFigure, LedgerRow, Note } from './ledger';
export type { RowTone } from './ledger';

export { default as DailyChart } from './DailyChart';

export {
  EMPTY_DAY,
  mergeDays,
  bucketDays,
  rpmOf,
  summarizeDailyDwell,
} from './daily';
export type { DailyPoint, Bucket, DwellSummary } from './daily';
export { default as HourBand } from './HourBand';
export type { HourSlot } from './HourBand';
export { default as ReadRow } from './ReadRow';

export {
  buildAttentionWeeks,
  summarizeAttention,
  weeksForTimeframe,
} from './attention';
export type { AttentionWeek, AttentionSummary } from './attention';

export {
  NBSP,
  MINUS,
  num,
  compact,
  trim,
  duration,
  durationInline,
  signedPercent,
  rank,
  dayLabel,
} from './format';
