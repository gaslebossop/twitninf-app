import { apiService } from './api';
import type { AccountStatus } from './neuralRankService';

/**
 * Panneau admin du registre d'avertissements (`api/src/routes/shadowbanAdminRoutes.js`).
 *
 * Distinct de la gestion des comptes existante (bannir/suspendre) : ici on
 * agit sur la DISTRIBUTION algorithmique, pas sur l'accès au compte. Réservé
 * côté serveur aux administrateurs (`requireAdminRole`).
 */

export type StrikePolicy =
  | 'spam'
  | 'engagement_bait'
  | 'unoriginal'
  | 'misinformation'
  | 'harassment'
  | 'adult_content'
  | 'hateful_conduct'
  | 'violent_threat';

export const STRIKE_POLICY_LABELS: Record<StrikePolicy, string> = {
  spam: 'Spam / contenu automatisé',
  engagement_bait: 'Incitation artificielle à l’engagement',
  unoriginal: 'Contenu repris sans apport',
  misinformation: 'Information trompeuse',
  harassment: 'Harcèlement ou insultes ciblées',
  adult_content: 'Contenu à caractère sexuel',
  hateful_conduct: 'Propos haineux',
  violent_threat: 'Menace ou apologie de violence',
};

export const STRIKE_POLICIES: StrikePolicy[] = Object.keys(STRIKE_POLICY_LABELS) as StrikePolicy[];

export type ShadowbanLevel = 'clean' | 'monitoring' | 'suppressed' | 'ghosted';

interface ServiceResult<T = undefined> {
  success: boolean;
  data?: T;
  message?: string;
}

async function call<T>(
  path: string,
  options: { method?: 'GET' | 'POST'; body?: any } = {}
): Promise<ServiceResult<T>> {
  try {
    const response = await apiService.request(`/api/admin/shadowban${path}`, {
      method: options.method || 'GET',
      // `apiService.request` stringifie déjà le corps (voir `executeRequest`
      // dans `api.ts`) — le stringifier ici double l'encodage et le serveur
      // reçoit une chaîne JSON au lieu d'un objet.
      body: options.body,
      requiresAuth: true,
    });
    if (!response?.success) {
      return { success: false, message: response?.message || response?.error || 'Échec de la requête' };
    }
    return { success: true, data: (response.data ?? response) as T };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Moteur de recommandation indisponible';
    console.error('[ShadowbanAdmin]', message);
    return { success: false, message };
  }
}

/** État de distribution d'un compte quelconque — vue admin (pas de restriction à soi-même). */
async function getAccountStatus(userId: string): Promise<ServiceResult<AccountStatus>> {
  return call<AccountStatus>(`/account/${userId}/status`);
}

/** Émet un avertissement daté, rattaché à un domaine de règle. */
async function issueStrike(
  userId: string,
  policy: StrikePolicy,
  tweetId?: string | null,
  reason?: string | null
): Promise<ServiceResult<AccountStatus>> {
  return call<AccountStatus>('/strike', {
    method: 'POST',
    body: { userId, policy, tweetId: tweetId || undefined, reason: reason || undefined },
  });
}

/** Recours accepté : retire les avertissements liés à un tweet, ou tout le registre. */
async function revokeStrikes(userId: string, tweetId?: string | null): Promise<ServiceResult<AccountStatus>> {
  return call<AccountStatus>('/strike/revoke', {
    method: 'POST',
    body: { userId, tweetId: tweetId || undefined },
  });
}

/** Décision manuelle de restriction — hors registre, prime sur le calcul automatique. */
async function setLevel(
  userId: string,
  level: ShadowbanLevel,
  reason?: string | null,
  expiresInDays?: number | null
): Promise<ServiceResult> {
  return call('/level', {
    method: 'POST',
    body: { userId, level, reason: reason || undefined, expiresInDays: expiresInDays || undefined },
  });
}

export default { getAccountStatus, issueStrike, revokeStrikes, setLevel };
