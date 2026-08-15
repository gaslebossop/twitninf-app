import apiService from './api';

/**
 * La Forge — proposer une fonctionnalité, et voir ce qu'elle a rapporté.
 *
 * Miroir de `api/src/routes/featureProposalRoutes.js`. Les statuts et les
 * zones sont ceux de l'ENUM serveur : ce fichier ne peut pas en inventer un,
 * la base le refuserait.
 */

export type ProposalStatus = 'received' | 'reviewing' | 'accepted' | 'built' | 'declined';

export type ProposalArea =
  | 'feed'
  | 'profil'
  | 'messages'
  | 'economie'
  | 'carte'
  | 'video'
  | 'autre';

export interface Proposal {
  id: string;
  title: string;
  body: string;
  area: ProposalArea;
  status: ProposalStatus;
  /** `null` tant que le staff n'a rien décidé — ce n'est pas zéro. */
  reward_nf: number | null;
  reward_paid: boolean;
  staff_note: string | null;
  created_at: string;
  decided_at: string | null;
}

export interface BuiltProposal {
  id: string;
  title: string;
  area: ProposalArea;
  built_at: string | null;
  reward_nf: number | null;
  author: { username: string; avatar?: string | null } | null;
}

/**
 * Les zones proposées au choix.
 *
 * Des libellés que quelqu'un reconnaît dans l'app, pas les noms des modules
 * qui les servent : on choisit « Le fil », pas « feed ». La clé technique
 * reste celle du serveur.
 */
export const AREAS: Array<{ key: ProposalArea; label: string; icon: string }> = [
  { key: 'feed', label: 'Le fil', icon: 'newspaper-outline' },
  { key: 'profil', label: 'Les profils', icon: 'person-outline' },
  { key: 'messages', label: 'Les messages', icon: 'chatbubble-outline' },
  { key: 'economie', label: 'Les NF', icon: 'cash-outline' },
  { key: 'carte', label: 'La carte', icon: 'map-outline' },
  { key: 'video', label: 'La vidéo', icon: 'videocam-outline' },
  { key: 'autre', label: 'Autre chose', icon: 'sparkles-outline' },
];

/**
 * Les quatre états, dans l'ordre où ils arrivent.
 *
 * `declined` n'y figure pas : ce n'est pas une étape du chemin mais une
 * sortie, et le montrer comme un cran de la barre laisserait croire qu'on
 * peut en repartir.
 */
export const JOURNEY: ProposalStatus[] = ['received', 'reviewing', 'accepted', 'built'];

export const STATUS_LABELS: Record<ProposalStatus, string> = {
  received: 'Reçue',
  reviewing: 'À l’étude',
  accepted: 'Retenue',
  built: 'Construite',
  declined: 'Écartée',
};

/**
 * Ce que chaque état veut dire pour celui qui a proposé.
 *
 * Un statut seul ne dit pas ce qu'il faut en attendre. « Retenue » sans
 * explication laisse croire que c'est fini ; c'est le moment où l'attente
 * commence vraiment.
 */
export const STATUS_HINTS: Record<ProposalStatus, string> = {
  received: 'Elle est dans la file. Personne ne l’a encore lue.',
  reviewing: 'Quelqu’un la lit et regarde ce qu’elle demanderait.',
  accepted: 'Elle est retenue et attend d’être construite.',
  built: 'Elle est dans l’app. Ta récompense est versée.',
  declined: 'Elle ne sera pas construite. La raison est ci-dessous.',
};

export const TITLE_MIN = 8;
export const TITLE_MAX = 120;
export const BODY_MIN = 40;
export const BODY_MAX = 2000;

export interface Outcome<T> {
  success: boolean;
  message?: string;
  data?: T;
}

export async function submitProposal(params: {
  title: string;
  body: string;
  area: ProposalArea;
}): Promise<Outcome<Proposal>> {
  try {
    const res: any = await apiService.post('/api/forge/proposals', params);
    if (!res?.success) return { success: false, message: res?.message };
    return { success: true, data: res.proposal };
  } catch (error: any) {
    // Le plafond d'idées en cours et la saisie trop courte reviennent tous
    // deux avec un message écrit pour être lu tel quel : on le fait remonter
    // au lieu d'afficher un « erreur réseau » qui n'explique rien.
    const message = error?.response?.data?.message;
    return { success: false, message: message || 'Envoi impossible pour le moment.' };
  }
}

export async function fetchMine(): Promise<Outcome<Proposal[]>> {
  try {
    const res: any = await apiService.get('/api/forge/proposals/mine');
    if (!res?.success) return { success: false, message: res?.message };
    return { success: true, data: res.proposals || [] };
  } catch {
    return { success: false, message: 'Lecture impossible.' };
  }
}

export interface ForgeStats {
  total: number;
  built: number;
  in_progress: number;
  /** Ce qui a été VERSÉ, pas ce qui a été décidé. */
  paid_nf: number;
}

export async function fetchStats(): Promise<Outcome<ForgeStats>> {
  try {
    const res: any = await apiService.get('/api/forge/stats');
    if (!res?.success) return { success: false, message: res?.message };
    return { success: true, data: res.stats };
  } catch {
    return { success: false, message: 'Lecture impossible.' };
  }
}

export async function fetchBuilt(): Promise<Outcome<BuiltProposal[]>> {
  try {
    const res: any = await apiService.get('/api/forge/built');
    if (!res?.success) return { success: false, message: res?.message };
    return { success: true, data: res.proposals || [] };
  } catch {
    return { success: false, message: 'Lecture impossible.' };
  }
}

/* ── Côté staff ─────────────────────────────────────────────────────────── */

export interface QueuedProposal extends Proposal {
  author: { id: string; username: string; avatar?: string | null } | null;
}

/**
 * Les décisions offertes au staff.
 *
 * Des ACTIONS, pas les valeurs de l'ENUM serveur. Un écran d'administration
 * propose ce qu'on peut faire ; il n'expose pas le modèle de données. « built »
 * ne dit rien à personne, « Construite — verser la récompense » dit ce qui va
 * se passer, y compris le mouvement d'argent.
 */
export const DECISIONS: Array<{
  status: ProposalStatus;
  label: string;
  icon: string;
  /** Cette décision déclenche-t-elle un versement ? */
  pays?: boolean;
  /** Le motif est-il obligatoire ? Le serveur le refuse sinon. */
  needsNote?: boolean;
}> = [
  { status: 'reviewing', label: 'Mettre à l’étude', icon: 'search-outline' },
  { status: 'accepted', label: 'Retenir', icon: 'bookmark-outline' },
  { status: 'built', label: 'Construite — verser', icon: 'checkmark-done-outline', pays: true },
  { status: 'declined', label: 'Écarter', icon: 'close-outline', needsNote: true },
];

/**
 * Montants proposés en un tap.
 *
 * Le barème n'existe pas et ne doit pas exister — le staff décide idée par
 * idée. Mais retaper un montant à chaque fois pousse à l'arrondi paresseux :
 * quelques repères évitent que tout finisse à 100 par défaut.
 */
export const REWARD_PRESETS = [10, 50, 100, 250, 500, 1000];

export async function fetchQueue(status: ProposalStatus): Promise<Outcome<QueuedProposal[]>> {
  try {
    const res: any = await apiService.get(`/api/forge/queue?status=${status}`);
    if (!res?.success) return { success: false, message: res?.message };
    return { success: true, data: res.proposals || [] };
  } catch {
    return { success: false, message: 'Lecture impossible.' };
  }
}

export async function decideProposal(
  id: string,
  params: { status: ProposalStatus; reward_nf?: number | null; note?: string },
): Promise<Outcome<Proposal>> {
  try {
    const res: any = await apiService.patch(`/api/forge/proposals/${id}`, params);
    if (!res?.success) return { success: false, message: res?.message };
    return { success: true, data: res.proposal };
  } catch (error: any) {
    // Trésorerie insuffisante, refus non motivé, montant invalide : le serveur
    // renvoie une phrase écrite pour être lue. On la montre telle quelle.
    return {
      success: false,
      message: error?.response?.data?.message || 'Décision impossible.',
    };
  }
}

export default {
  submitProposal,
  fetchMine,
  fetchBuilt,
  fetchStats,
  fetchQueue,
  decideProposal,
  AREAS,
  JOURNEY,
  STATUS_LABELS,
};
