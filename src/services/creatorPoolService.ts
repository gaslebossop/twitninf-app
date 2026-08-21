/**
 * Pot créateur hebdomadaire — côté app.
 *
 * Un seul appel sert tout l'écran (`getDashboard`). Ce n'est pas de la
 * paresse : montant à encaisser, projection de la semaine, rangs de qualité et
 * historique se calculent ensemble côté serveur. Les chercher en quatre
 * requêtes garantissait qu'un écran affiche un montant venu d'une réponse et
 * un RPM venu d'une autre — c'est exactement ce qui produisait des lignes
 * incohérentes dans l'ancienne page.
 */

import { API_CONFIG } from '../config/api';
import tokenStore from './tokenStore';

/** Ce qu'un signal vaut, et où il situe le créateur dans le vivier de la semaine. */
export interface QualityRates {
  attention: number;
  retention: number;
  dau: number;
  penalty: number;
}

export interface EarnedBonus {
  key: string;
  label: string;
  description: string;
  multiplier: number;
  detail: Record<string, number> | null;
}

export interface BonusCatalogEntry {
  key: string;
  label: string;
  description: string;
  multiplier: number;
  enabled: boolean;
}

/** Projection de la semaine en cours — jamais encaissable tant qu'elle n'est pas close. */
export interface PeriodProjection {
  amount: number;
  payableAmount: number;
  rpm: number;
  share: number;
  quality: number;
  qualifiedViews: number;
  rawViews: number;
  /**
   * Vues sur lesquelles la lecture a pu être chronométrée — le dénominateur du
   * taux d'attention, et non `qualifiedViews`. Le serveur l'envoyait déjà
   * (`creatorPool/index.js`), le type l'ignorait : sans lui, `rates.attention`
   * (des millisecondes PAR VUE) ne peut pas être reconverti en temps total lu.
   */
  measurableViews: number;
  distinctViewers: number;
  hasRealDwell: boolean;
  attentionFactor: number;
  rates: QualityRates;
  percentiles: QualityRates;
  raw: {
    followsGained: number;
    returningViewers: number;
    dauGained: number;
    negatives: number;
  };
  bonuses: { multiplier: number; capped: boolean; earned: EarnedBonus[] };
  eligible: boolean;
  lockedReason: string | null;
}

export interface ClaimablePeriod {
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  amount: number;
  rpm: number;
}

export interface PayoutHistoryEntry {
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  amount: number;
  qualifiedViews: number;
  quality: number;
  rpm: number;
  bonusMultiplier: number;
  status: 'claimable' | 'claimed' | string;
  claimedAt: string | null;
  breakdown: Record<string, any> | null;
}

export interface CreatorPoolDashboard {
  currency: { id: string; symbol: string; name: string };
  now: string;
  currentPeriod: {
    key: string;
    start: string;
    end: string;
    pool: {
      pool: number;
      inflows: number;
      inflowTransactions: number;
      treasuryBalance: number;
      cappedByTreasury: boolean;
      shareOfInflows: number;
    };
    cohortSize: number;
    projection: PeriodProjection | null;
  };
  claimable: { count: number; total: number; periods: ClaimablePeriod[] };
  history: PayoutHistoryEntry[];
  weights: QualityRates;
  bonusCatalog: BonusCatalogEntry[];
}

/**
 * État renvoyé par le moteur Rust (`shadowban::AccountStatus`).
 *
 * `level_label` et `summary` sont écrits côté moteur, en français et à
 * destination du créateur : l'app les affiche tels quels plutôt que de
 * réécrire une traduction qui finirait par diverger des seuils réels.
 */
export interface EngineAccountStatus {
  level: 'clean' | 'monitoring' | 'suppressed' | 'ghosted' | string;
  level_label: string;
  summary: string;
  manual: boolean;
  active_strikes: number;
  strike_ttl_days: number;
  restricted_surfaces: string[];
  recovers_at: string | null;
  nearing_permanent_ban: {
    policy: string;
    reason: string;
    active_strikes: number;
    limit: number;
  } | null;
  per_policy: {
    policy: string;
    label: string;
    reason: string;
    [k: string]: any;
  }[];
}

/** Faits qualité et restriction en cours — écran « État du compte ». */
export interface AccountStatus {
  engine: EngineAccountStatus | null;
  window: {
    days: number;
    count: number;
    /** Ce que coûterait le PROCHAIN fait. `null` = un avertissement daté. */
    nextPenaltyDays: number | null;
    nextIsStrike: boolean;
  };
  events: {
    id: string;
    tweetId: string | null;
    kind: string;
    label: string;
    reason: string | null;
    occurredAt: string;
  }[];
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = await tokenStore.getAccessToken();
  if (!token) throw new Error('Session expirée');

  const response = await fetch(`${API_CONFIG.BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success === false) {
    throw new Error(body?.message || `Erreur ${response.status}`);
  }
  return body.data as T;
}

const CreatorPoolService = {
  getDashboard(): Promise<CreatorPoolDashboard> {
    return request<CreatorPoolDashboard>('/api/creator-pool/dashboard');
  },

  /**
   * Encaisse une période, ou toutes celles qui attendent si `periodKey` est
   * omis. Le montant n'est pas recalculé : il a été figé à la clôture, donc ce
   * qui est encaissé est exactement ce qui était affiché.
   */
  claim(periodKey?: string): Promise<{ total: number; claimed: number }> {
    return request('/api/creator-pool/claim', {
      method: 'POST',
      body: JSON.stringify(periodKey ? { periodKey } : {}),
    });
  },

  getAccountStatus(): Promise<AccountStatus> {
    return request<AccountStatus>('/api/creator-pool/account-status');
  },
};

export default CreatorPoolService;
