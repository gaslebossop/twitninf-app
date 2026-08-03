import { apiService } from './api';

/**
 * File de publications programmées — avantage abonné.
 *
 * Miroir de `api/src/routes/scheduledTweetRoutes.js`.
 *
 * Le mode `best_time` ne fige pas l'heure au moment où l'on programme : le
 * serveur la recalcule à l'échéance, à partir des créneaux réellement
 * observés sur le compte. L'app affiche donc `scheduled_for` comme une borne
 * basse (« à partir de… »), pas comme une promesse d'horaire — c'est
 * `resolved_for`, écrit après coup, qui dit l'heure retenue.
 */

const BASE = '/api/scheduled-tweets';

export type ScheduleMode = 'exact' | 'best_time';
export type ScheduleStatus = 'pending' | 'publishing' | 'published' | 'failed' | 'canceled';

export interface ScheduledPost {
  id: string;
  content: string;
  media: string[];
  reply_to_id: string | null;
  mode: ScheduleMode;
  scheduled_for: string;
  resolved_for: string | null;
  status: ScheduleStatus;
  published_tweet_id: string | null;
  published_at: string | null;
  last_error: string | null;
  created_at: string;
}

export interface ScheduleConfig {
  max_horizon_days: number;
  max_pending: number;
  modes: ScheduleMode[];
}

export class ScheduleError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

function unwrap(response: any, fallback: string) {
  if (response?.success) return response.data;
  throw new ScheduleError(response?.message || fallback, response?.code);
}

export const STATUS_LABELS: Record<ScheduleStatus, string> = {
  pending: 'En attente',
  publishing: 'Publication en cours',
  published: 'Publié',
  failed: 'Échec',
  canceled: 'Annulé',
};

export async function fetchConfig(): Promise<ScheduleConfig> {
  const response = await apiService.get(`${BASE}/config`);
  return unwrap(response, 'Configuration indisponible.');
}

export async function fetchQueue(status?: ScheduleStatus): Promise<ScheduledPost[]> {
  const response = await apiService.get(BASE, status ? { status } : undefined);
  return unwrap(response, 'File indisponible.');
}

/**
 * Créneaux retenus pour le mode « meilleur moment ».
 *
 * `reliable: false` signifie que le compte n'a pas assez d'historique : le
 * mode retombera sur l'heure demandée. L'app doit le dire AVANT, sinon elle
 * promet une optimisation qui n'aura pas lieu.
 */
export async function fetchBestHours(): Promise<{ hours: number[]; reliable: boolean }> {
  const response = await apiService.get(`${BASE}/best-hours`);
  return unwrap(response, 'Créneaux indisponibles.');
}

export async function schedulePost(params: {
  content: string;
  scheduledFor: Date;
  mode?: ScheduleMode;
  media?: string[];
  replyToId?: string | null;
}): Promise<ScheduledPost> {
  const response = await apiService.post(BASE, {
    content: params.content,
    scheduled_for: params.scheduledFor.toISOString(),
    mode: params.mode || 'exact',
    media: params.media || [],
    reply_to_id: params.replyToId || undefined,
  });
  return unwrap(response, 'Programmation impossible.');
}

export async function updatePost(
  id: string,
  patch: { content?: string; scheduledFor?: Date; mode?: ScheduleMode },
): Promise<ScheduledPost> {
  const response = await apiService.patch(`${BASE}/${id}`, {
    content: patch.content,
    scheduled_for: patch.scheduledFor ? patch.scheduledFor.toISOString() : undefined,
    mode: patch.mode,
  });
  return unwrap(response, 'Modification impossible.');
}

export async function cancelPost(id: string): Promise<ScheduledPost> {
  const response = await apiService.delete(`${BASE}/${id}`);
  return unwrap(response, 'Annulation impossible.');
}

/** « demain à 14:30 » — plus lisible qu'une date ISO dans une liste. */
export function formatSlot(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now.getTime() + 86400000);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `aujourd'hui à ${time}`;
  if (isTomorrow) return `demain à ${time}`;
  return `${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} à ${time}`;
}
