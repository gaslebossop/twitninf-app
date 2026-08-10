/**
 * Drapeaux de fonctionnalité — types partagés entre le service, le contexte
 * et l'écran d'administration.
 *
 * Le client reçoit des DÉCISIONS (`FlagDecision`), jamais des définitions.
 * Les définitions (`FeatureFlag`) ne circulent que sur les routes admin :
 * elles contiennent la liste des testeurs internes et la composition des
 * cohortes, qui n'ont rien à faire dans le bundle de tout le monde.
 */

/** Ce que le serveur renvoie pour un drapeau donné, à cet utilisateur. */
export interface FlagDecision {
  enabled: boolean;
  variant: string | null;
  payload: any;
  /** Présent uniquement en simulation admin : pourquoi cette décision. */
  reason?: string;
  bucket?: number | null;
  rule?: string | null;
}

export type FlagMap = Record<string, FlagDecision>;

export interface ResolvedFlags {
  flags: FlagMap;
  resolved_at: string;
}

// ───────────────────────── Administration ─────────────────────────

export type FlagOperator =
  | 'eq'
  | 'neq'
  | 'in'
  | 'not_in'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'starts_with'
  | 'exists'
  | 'not_exists'
  | 'semver_gte'
  | 'semver_lt';

export interface FlagCondition {
  attribute: string;
  operator: FlagOperator;
  value: any;
}

/**
 * Un segment ciblé. Toutes ses conditions doivent passer (ET logique).
 *
 * Il porte SOIT un `percentage` figé — le segment est alors exclusif : lui à
 * 30 %, tout le monde à 0 % — SOIT un `boost`, multiplicateur du palier
 * global. Le boost donne de l'avance sans exclure : à 10 % global, un boost
 * de 2 sert 20 % du segment et 10 % des autres, et tout le monde arrive
 * ensemble à 100 %.
 */
export interface FlagRule {
  id: string;
  label?: string | null;
  /** Palier propre au segment. 100 = tout le segment. Absent si `boost`. */
  percentage?: number;
  /** Multiplicateur du palier global. Absent si `percentage`. */
  boost?: number;
  variant?: string | null;
  conditions: FlagCondition[];
}

export interface FlagVariant {
  key: string;
  weight: number;
  payload?: any;
}

export type BucketUnit = 'user' | 'device' | 'session';

/**
 * Plan de montée automatique du palier : la fonctionnalité élargit sa portée
 * seule, un cran par intervalle. `null` = le palier ne bouge qu'à la main.
 *
 * Le plan s'arrête dès qu'un humain intervient (`halted_reason`) et ne repart
 * jamais tout seul — il faut le réarmer.
 */
export interface FlagAutoRollout {
  enabled: boolean;
  steps: number[];
  interval_minutes: number;
  started_at: string;
  next_at: string | null;
  last_step_at: string | null;
  armed_by: string | null;
  halted_at: string | null;
  halted_reason: string | null;
  completed_at: string | null;
}

export interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  rollout_percentage: number;
  rules: FlagRule[];
  variants: FlagVariant[];
  allowlist: string[];
  blocklist: string[];
  bucket_by: BucketUnit;
  salt: string;
  auto_rollout: FlagAutoRollout | null;
  payload: any;
  start_at: string | null;
  end_at: string | null;
  archived_at: string | null;
  created_at?: string;
  updated_at?: string;
  creator?: { id: string; username: string } | null;
  updater?: { id: string; username: string } | null;
}

/**
 * Vocabulaire de ciblage servi par l'API. L'écran d'administration le lit au
 * lieu de le redéclarer : une liste dupliquée côté app deviendrait fausse dès
 * qu'un attribut est ajouté au serveur, et proposerait des ciblages qui ne
 * matchent jamais.
 */
export interface FlagSchema {
  attributes: Record<string, string>;
  operators: FlagOperator[];
  bucket_units: BucketUnit[];
  /** Bornes et échelle par défaut de la montée automatique, côté serveur. */
  auto_rollout?: {
    default_steps: number[];
    default_interval_minutes: number;
    min_interval_minutes: number;
    max_interval_minutes: number;
    halt_reasons: Record<string, string>;
  };
}

export interface FlagSimulation {
  decision: FlagDecision;
  context: Record<string, any>;
}

export interface FlagExposure {
  sampled: number;
  matched: number;
  ratio: number;
  estimated_users: number;
  total_active_users: number;
  by_variant: Record<string, number>;
  caveat: string;
}
