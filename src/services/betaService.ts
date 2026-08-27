import apiService from './api';

/**
 * 🧪 Programme beta — une seule porte.
 *
 * On est sur la version beta de l'app, ou on ne l'est pas. Membre ⇒ fil 2B,
 * badge BETA près du logo, et les tests suivants. Non-membre ⇒ le fil normal,
 * sans aucune trace du programme.
 *
 * Miroir de `api/src/routes/betaRoutes.js`. Les statuts sont ceux de la
 * contrainte SQL : ce fichier ne peut pas en inventer un.
 *
 * ⚠️ L'appartenance ne commande PAS l'affichage du fil 2B directement. Elle
 * alimente l'attribut de ciblage `is_beta` côté serveur, qui alimente le
 * drapeau `fil.refonte2b`, qui aiguille `MainNavigator`. Le badge, lui, est
 * bien branché sur l'appartenance : il dit « tu es dans la beta », pas
 * « tu vois la refonte ».
 */

/** `null` = ce compte n'a jamais candidaté. */
export type BetaStatus = 'pending' | 'approved' | 'rejected' | 'revoked' | 'left' | null;

export interface BetaProgram {
  is_open: boolean;
  /** `null` = pas de plafond. Ce n'est pas zéro. */
  capacity: number | null;
  members: number;
  /** `null` quand `capacity` l'est. */
  seats_left: number | null;
  headline: string;
  pitch: string | null;
}

export interface BetaState {
  status: BetaStatus;
  is_member: boolean;
  /** Place dans la file, 1 pour le prochain servi. `null` hors attente. */
  position: number | null;
  motivation: string | null;
  applied_at: string | null;
  approved_at: string | null;
  reviewed_at: string | null;
  can_apply: boolean;
  program: BetaProgram;
}

interface Outcome<T> {
  success: boolean;
  data?: T;
  message?: string;
}

/**
 * État servi tant que rien n'est revenu du serveur, et après une panne.
 *
 * Volontairement « pas membre, programme fermé » : une panne doit rendre
 * l'ancien comportement, jamais un état intermédiaire où l'app afficherait un
 * badge BETA ou un bouton « rejoindre » qui échouerait à l'appui.
 */
export const UNKNOWN_BETA_STATE: BetaState = {
  status: null,
  is_member: false,
  position: null,
  motivation: null,
  applied_at: null,
  approved_at: null,
  reviewed_at: null,
  can_apply: false,
  program: {
    is_open: false,
    capacity: null,
    members: 0,
    seats_left: null,
    headline: 'La beta TwitNinf',
    pitch: null,
  },
};

function stateFrom(res: any): BetaState {
  return {
    status: res?.status ?? null,
    is_member: Boolean(res?.is_member),
    position: res?.position ?? null,
    motivation: res?.motivation ?? null,
    applied_at: res?.applied_at ?? null,
    approved_at: res?.approved_at ?? null,
    reviewed_at: res?.reviewed_at ?? null,
    can_apply: Boolean(res?.can_apply),
    program: {
      is_open: Boolean(res?.program?.is_open),
      capacity: res?.program?.capacity ?? null,
      members: Number(res?.program?.members) || 0,
      seats_left: res?.program?.seats_left ?? null,
      headline: res?.program?.headline || UNKNOWN_BETA_STATE.program.headline,
      pitch: res?.program?.pitch ?? null,
    },
  };
}

export async function fetchStatus(): Promise<Outcome<BetaState>> {
  try {
    const res: any = await apiService.get('/api/beta/me');
    if (!res?.success) return { success: false, message: res?.message };
    return { success: true, data: stateFrom(res) };
  } catch {
    return { success: false, message: 'Statut beta indisponible.' };
  }
}

/**
 * Candidater. Le serveur renvoie l'état complet en retour : l'appelant n'a
 * pas à relancer `fetchStatus` pour connaître sa place dans la file.
 */
export async function apply(motivation?: string): Promise<Outcome<BetaState>> {
  try {
    const res: any = await apiService.post('/api/beta/apply', {
      motivation: motivation?.trim() || null,
    });
    if (!res?.success) return { success: false, message: res?.message };
    return { success: true, data: stateFrom(res) };
  } catch (error: any) {
    // Programme fermé, déjà membre : le serveur écrit une phrase destinée à
    // être lue. On la montre telle quelle plutôt qu'un « erreur réseau ».
    const message = error?.response?.data?.message;
    return { success: false, message: message || 'Candidature impossible pour le moment.' };
  }
}

export async function leave(): Promise<Outcome<BetaState>> {
  try {
    const res: any = await apiService.post('/api/beta/leave', {});
    if (!res?.success) return { success: false, message: res?.message };
    return { success: true, data: stateFrom(res) };
  } catch (error: any) {
    const message = error?.response?.data?.message;
    return { success: false, message: message || 'Impossible de quitter la beta.' };
  }
}

/**
 * Libellés d'état. Écrits du point de vue de qui lit, pas de la base :
 * « ta candidature est en file », pas « statut : pending ».
 */
export const STATUS_LABELS: Record<Exclude<BetaStatus, null>, string> = {
  pending: 'Candidature en file',
  approved: 'Tu es dans la beta',
  rejected: 'Candidature non retenue',
  revoked: 'Accès retiré',
  left: 'Tu as quitté la beta',
};

export default {
  fetchStatus,
  apply,
  leave,
  STATUS_LABELS,
  UNKNOWN_BETA_STATE,
};
