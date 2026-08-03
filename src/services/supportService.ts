import { apiService } from './api';

/**
 * Support par ticket — le traitement PRIORITAIRE est l'avantage du palier Pro.
 *
 * Ouvrir un ticket reste possible pour tout le monde : couper le seul canal
 * permettant de signaler « je n'arrive plus à me connecter » ou « on m'a débité
 * deux fois » à un utilisateur non abonné serait indéfendable. Ce que Pro
 * apporte, et c'est net : priorité en tête de file du support, délai de réponse
 * annoncé plus court, et plusieurs tickets ouverts en parallèle.
 *
 * Miroir de `api/src/routes/supportRoutes.js`.
 */

const BASE = '/api/support';

export type TicketStatus = 'open' | 'pending' | 'answered' | 'resolved' | 'closed';
export type TicketCategory = 'compte' | 'abonnement' | 'economie' | 'moderation' | 'bug' | 'autre';

export interface SupportTicketSummary {
  id: string;
  subject: string;
  category: TicketCategory;
  status: TicketStatus;
  priority: 'normal' | 'high';
  unread?: boolean;
  unreadForStaff?: boolean;
  slaHours: number;
  lastMessageAt: string | null;
  createdAt: string;
  user?: {
    id: string;
    username: string;
    tier: string;
  } | null;
  assignee?: {
    id: string;
    username: string;
  } | null;
}

export interface SupportMessage {
  id: string;
  body: string;
  isStaff: boolean;
  isInternal: boolean;
  author: {
    id: string;
    username: string;
    fullName: string | null;
    avatar: string | null;
    verified: boolean;
  } | null;
  createdAt: string;
}

export interface SupportTicketDetail {
  ticket: {
    id: string;
    subject: string;
    category: TicketCategory;
    status: TicketStatus;
    priority: 'normal' | 'high';
    slaHours: number;
    createdAt: string;
    closedAt: string | null;
    requester?: {
      id: string;
      username: string;
      fullName: string | null;
      avatar: string | null;
      verified: boolean;
    } | null;
    assignee?: { id: string; username: string } | null;
  };
  actor?: {
    isStaff: boolean;
    isOwner: boolean;
    role: string;
  };
  messages: SupportMessage[];
}

export interface SupportSummary {
  unreadTickets: number;
  openTickets: number;
  priority: 'normal' | 'high';
  slaHours: number;
  maxOpenTickets: number;
  isPro: boolean;
  isStaff?: boolean;
  staffRole?: string | null;
}

export interface Outcome<T> {
  ok: boolean;
  data?: T;
  message?: string;
  code?: string;
}

function fail<T>(response: any, fallback: string): Outcome<T> {
  return { ok: false, message: response?.message || fallback, code: response?.code };
}

export const CATEGORY_LABELS: Record<TicketCategory, string> = {
  compte: 'Mon compte',
  abonnement: 'Abonnement',
  economie: 'NF et portefeuille',
  moderation: 'Modération',
  bug: 'Bug',
  autre: 'Autre',
};

export const STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'En attente de prise en charge',
  pending: 'Le support attend ta réponse',
  answered: 'Le support a répondu',
  resolved: 'Résolu',
  closed: 'Clos',
};

export function isTicketOpen(status: TicketStatus): boolean {
  return status === 'open' || status === 'pending' || status === 'answered';
}

export async function fetchSummary(): Promise<Outcome<SupportSummary>> {
  try {
    const res = await apiService.get(`${BASE}/summary`);
    if (!res?.success) return fail(res, 'Support indisponible.');
    return { ok: true, data: res.data as SupportSummary };
  } catch {
    return { ok: false, message: 'Support indisponible.' };
  }
}

export async function fetchTickets(
  filter?: 'open' | 'closed',
): Promise<Outcome<SupportTicketSummary[]>> {
  try {
    const res = await apiService.get(`${BASE}/tickets`, filter ? { status: filter } : undefined);
    if (!res?.success) return fail(res, 'Impossible de charger tes tickets.');
    return { ok: true, data: (res.data?.tickets || []) as SupportTicketSummary[] };
  } catch {
    return { ok: false, message: 'Impossible de charger tes tickets.' };
  }
}

/** File globale réservée aux modérateurs et administrateurs. */
export async function fetchStaffQueue(
  status: TicketStatus | 'open' = 'open',
): Promise<Outcome<SupportTicketSummary[]>> {
  try {
    const res = await apiService.get(`${BASE}/admin/queue`, { status, limit: '100' });
    if (!res?.success) return fail(res, 'Impossible de charger la file support.');
    return { ok: true, data: (res.data?.tickets || []) as SupportTicketSummary[] };
  } catch {
    return { ok: false, message: 'Impossible de charger la file support.' };
  }
}

export async function fetchTicket(id: string): Promise<Outcome<SupportTicketDetail>> {
  try {
    const res = await apiService.get(`${BASE}/tickets/${id}`);
    if (!res?.success) return fail(res, 'Ticket introuvable.');
    return { ok: true, data: res.data as SupportTicketDetail };
  } catch {
    return { ok: false, message: 'Ticket introuvable.' };
  }
}

export async function createTicket(params: {
  subject: string;
  message: string;
  category: TicketCategory;
}): Promise<Outcome<{ ticket: SupportTicketSummary }>> {
  try {
    const res = await apiService.post(`${BASE}/tickets`, params);
    if (!res?.success) return fail(res, 'Impossible d\'ouvrir le ticket.');
    return { ok: true, data: res.data };
  } catch {
    return { ok: false, message: 'Impossible d\'ouvrir le ticket.' };
  }
}

export async function replyToTicket(
  id: string,
  message: string,
  options: { asStaff?: boolean; internal?: boolean } = {},
): Promise<Outcome<{ message: SupportMessage; ticketStatus: TicketStatus }>> {
  try {
    const res = await apiService.post(`${BASE}/tickets/${id}/messages`, {
      message,
      asStaff: options.asStaff === true,
      internal: options.internal === true,
    });
    if (!res?.success) return fail(res, 'Message non envoyé.');
    return { ok: true, data: res.data };
  } catch {
    return { ok: false, message: 'Message non envoyé.' };
  }
}

export async function closeTicket(id: string): Promise<Outcome<{ status: TicketStatus }>> {
  try {
    const res = await apiService.post(`${BASE}/tickets/${id}/close`, {});
    if (!res?.success) return fail(res, 'Impossible de clore ce ticket.');
    return { ok: true, data: res.data };
  } catch {
    return { ok: false, message: 'Impossible de clore ce ticket.' };
  }
}
