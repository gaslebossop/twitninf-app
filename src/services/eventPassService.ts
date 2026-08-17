import AsyncStorage from '@react-native-async-storage/async-storage';

import apiService from './api';

/**
 * Places d'invitation — émission, contrôle à l'entrée, mes invitations.
 *
 * Miroir de `api/src/routes/eventPassRoutes.js`. Les paliers et les statuts
 * sont ceux du modèle serveur (`EventPass.TIERS` / `EventPass.STATUSES`) : ce
 * fichier ne peut pas en inventer un, la base le refuserait.
 *
 * ── Pourquoi un cache local ───────────────────────────────────────────────
 * Une place se présente à l'entrée d'une salle, c'est-à-dire à l'endroit exact
 * où le réseau ne passe pas : sous-sol, hangar, foule de mille téléphones sur
 * la même antenne. `fetchMine` écrit donc ce qu'elle obtient, et `cachedMine`
 * rend la dernière liste connue quand l'appel échoue. Le code QR se dessine
 * depuis la matrice (`pass.qr`), sans réseau ni image distante.
 */

const MINE_CACHE_KEY = 'event_passes.mine.v1';

export type PassTier = 'standard' | 'vip' | 'staff' | 'presse';
export type PassStatus = 'valid' | 'used' | 'revoked';

/** Matrice du code QR, telle que l'encodeur du serveur l'a produite. */
export interface QrMatrix {
  size: number;
  level: string;
  /** Une chaîne de « 0 » et « 1 » par ligne, de longueur `size`. */
  rows: string[];
}

export interface EventPass {
  id: string;
  code: string;
  serial: number;
  tier: PassTier;
  status: PassStatus;
  guest_name: string | null;
  event_slug: string;
  event_name: string;
  event_date: string | null;
  /** Date déjà écrite pour l'affichage par le serveur (fuseau, langue). */
  event_date_label?: string | null;
  event_place: string | null;
  expires_at: string | null;
  scans_count: number;
  max_scans: number;
  first_scanned_at: string | null;
  url?: string;
  qr_payload?: string;
  qr?: QrMatrix;
}

/** Vue de l'organisateur : tout, y compris ce qui ne s'imprime pas. */
export interface AdminPass extends EventPass {
  guest_user_id: string | null;
  note: string | null;
  revoked_reason: string | null;
  last_scanned_at: string | null;
  created_at: string;
  guest?: { id: string; username: string; full_name?: string | null } | null;
}

export interface EventSummary {
  event_slug: string;
  event_name: string;
  event_date: string | null;
  event_place: string | null;
  total: number;
  valid: number;
  used: number;
  revoked: number;
  last_issued_at: string | null;
  last_scanned_at: string | null;
}

export interface EventStats {
  event_slug: string;
  total: number;
  valid: number;
  used: number;
  revoked: number;
  /** Entrées effectivement validées, pas le nombre de places. */
  entries: number;
  refusals: Array<{ result: string; count: number }>;
  recent: Array<{
    id: string;
    result: string;
    code_attempt: string | null;
    createdAt: string;
    pass?: { code: string; serial: number; guest_name: string | null; tier: PassTier } | null;
    scanner?: { id: string; username: string } | null;
  }>;
}

/** Motif de refus renvoyé par la porte. `null` quand l'entrée est accordée. */
export type RefusalReason =
  | 'BAD_SIGNATURE'
  | 'UNKNOWN'
  | 'REVOKED'
  | 'EXPIRED'
  | 'ALREADY_USED'
  | 'WRONG_EVENT';

export interface RedeemResult {
  admitted: boolean;
  reason?: RefusalReason;
  message?: string;
  /** Vrai quand le code a été tapé à la main plutôt que scanné. */
  manual?: boolean;
  remaining_scans?: number;
  pass?: EventPass;
}

export interface Outcome<T> {
  success: boolean;
  message?: string;
  data?: T;
}

/**
 * Les paliers, avec le mot qu'en lit un humain.
 *
 * La couleur habille la CARTE, jamais le code QR : l'or et le cyan sont trop
 * clairs pour qu'un lecteur y voie encore un module sombre, et un code teinté
 * cesse d'être détectable sans que rien ne se voie à l'œil. Le garde-fou existe
 * côté serveur (`safeCodeColor`), celui-ci est le même en amont.
 */
export const TIERS: Array<{ key: PassTier; label: string; hint: string }> = [
  { key: 'standard', label: 'Place', hint: 'Invitation ordinaire' },
  { key: 'vip', label: 'VIP', hint: 'Accès privilégié' },
  { key: 'staff', label: 'Équipe', hint: 'Organisation, montage, régie' },
  { key: 'presse', label: 'Presse', hint: 'Journalistes et créateurs' },
];

export const TIER_LABELS: Record<PassTier, string> = {
  standard: 'Place',
  vip: 'VIP',
  staff: 'Équipe',
  presse: 'Presse',
};

export const STATUS_LABELS: Record<PassStatus, string> = {
  valid: 'Valable',
  used: 'Déjà passée',
  revoked: 'Annulée',
};

/** Ce que chaque refus veut dire pour l'équipe qui tient la porte. */
export const REFUSAL_HINTS: Record<RefusalReason, string> = {
  BAD_SIGNATURE: 'Ce code n’a pas été émis par TwitNinf. C’est un faux.',
  UNKNOWN: 'Code inconnu. Vérifie qu’il s’agit bien d’une place TwitNinf.',
  REVOKED: 'Cette place a été annulée par l’organisation.',
  EXPIRED: 'Cette place a dépassé sa date de validité.',
  ALREADY_USED: 'Cette place est déjà passée. Quelqu’un est entré avec.',
  WRONG_EVENT: 'Place authentique, mais émise pour un autre événement.',
};

/** Durée d'un lien de contrôle, en heures. Le serveur borne entre 1 et 72. */
export const DOOR_LINK_HOURS = [6, 12, 24, 48] as const;

/** Un lot va jusqu'à 500 places côté serveur (`MAX_BATCH`). */
export const MAX_BATCH = 500;

/**
 * Quels portefeuilles (Apple Wallet / Google Wallet) sont réellement activés
 * côté serveur — l'app s'en sert pour AFFICHER ou non les boutons plutôt que
 * de proposer un bouton qui échouera systématiquement tant que les
 * certificats n'ont pas été posés sur le VPS.
 */
export interface WalletStatus {
  apple: boolean;
  google: boolean;
}

/**
 * Slug proposé à partir du nom de l'événement.
 *
 * Même normalisation que `normalizeSlug` côté serveur : ce qui est proposé ici
 * doit être exactement ce que la base enregistrera, sinon l'organisateur croit
 * émettre sur « nuit-twitninf » et retrouve ses places ailleurs.
 */
export function slugify(value: string): string {
  return String(value || '')
    .normalize('NFD')
    // Les diacritiques que NFD vient de détacher, écrits en points de code :
    // ces caractères combinants n'ont pas de glyphe propre, et une plage écrite
    // en clair se perd au premier copier-coller sans que rien ne le montre.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

/* ── Invité ─────────────────────────────────────────────────────────────── */

export async function fetchMine(): Promise<Outcome<EventPass[]>> {
  try {
    const res: any = await apiService.get('/api/event-passes/mine');
    if (!res?.success) return { success: false, message: res?.message };

    const passes: EventPass[] = res.data || [];
    // Écrit AVANT de rendre : c'est cette copie qui servira à l'entrée, quand
    // l'appel ci-dessus n'aboutira plus.
    await cacheMine(passes);
    return { success: true, data: passes };
  } catch {
    return { success: false, message: 'Lecture impossible.' };
  }
}

async function cacheMine(passes: EventPass[]): Promise<void> {
  try {
    await AsyncStorage.setItem(MINE_CACHE_KEY, JSON.stringify(passes));
  } catch {
    // Un cache qui ne s'écrit pas ne doit pas faire échouer l'écran.
  }
}

/** La dernière liste connue. `null` si l'app n'en a jamais reçu. */
export async function cachedMine(): Promise<EventPass[] | null> {
  try {
    const raw = await AsyncStorage.getItem(MINE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function fetchWalletStatus(): Promise<Outcome<WalletStatus>> {
  try {
    const res: any = await apiService.get('/api/event-passes/wallet-status');
    if (!res?.success) return { success: false, message: res?.message };
    return { success: true, data: res.data };
  } catch {
    return { success: false, message: 'Statut des portefeuilles indisponible.' };
  }
}

/**
 * Lien Apple Wallet — signé, valable 10 minutes.
 *
 * Cette requête EST authentifiée (JWT normal), mais l'URL qu'elle renvoie ne
 * l'est pas : `Linking.openURL` ouvre Safari, qui n'envoie jamais l'en-tête
 * `Authorization` de l'app. C'est la signature portée par le lien lui-même
 * qui protège le fichier .pkpass, pas une session.
 */
export async function fetchAppleWalletLink(passId: string): Promise<Outcome<{ url: string }>> {
  try {
    const res: any = await apiService.get(`/api/event-passes/${passId}/wallet/apple-link`);
    if (!res?.success) return { success: false, message: res?.message };
    return { success: true, data: res.data };
  } catch (error: any) {
    return {
      success: false,
      message: error?.response?.data?.message || 'Apple Wallet est indisponible.',
    };
  }
}

/** Lien Google Wallet — pointe directement vers pay.google.com, à ouvrir tel quel. */
export async function fetchGoogleWalletLink(passId: string): Promise<Outcome<{ url: string }>> {
  try {
    const res: any = await apiService.get(`/api/event-passes/${passId}/wallet/google`);
    if (!res?.success) return { success: false, message: res?.message };
    return { success: true, data: res.data };
  } catch (error: any) {
    return {
      success: false,
      message: error?.response?.data?.message || 'Google Wallet est indisponible.',
    };
  }
}

/* ── Porte ──────────────────────────────────────────────────────────────── */

/**
 * Regarde une place SANS la consommer.
 *
 * Sépare volontairement de `redeem` : une équipe qui veut d'abord lire le nom
 * ne doit pas brûler la place en la regardant.
 */
export async function verifyPass(
  token: string,
  eventSlug?: string,
): Promise<Outcome<RedeemResult>> {
  try {
    const res: any = await apiService.post('/api/event-passes/verify', {
      token,
      event_slug: eventSlug,
    });
    if (!res?.success) return { success: false, message: res?.message };
    return {
      success: true,
      data: {
        admitted: res.data.ok,
        reason: res.data.reason || undefined,
        message: res.data.message || undefined,
        manual: res.data.manual,
        pass: res.data.pass || undefined,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      message: error?.response?.data?.message || 'Vérification impossible.',
    };
  }
}

/**
 * Valide une entrée. C'est le seul appel qui CONSOMME une place.
 *
 * Un refus n'est pas une erreur : le serveur répond `success: true` avec
 * `admitted: false` et un motif. Seule une panne réseau ou un jeton refusé
 * ressort en `success: false`.
 */
export async function redeemPass(
  token: string,
  options: { eventSlug?: string; deviceLabel?: string } = {},
): Promise<Outcome<RedeemResult>> {
  try {
    const res: any = await apiService.post('/api/event-passes/redeem', {
      token,
      event_slug: options.eventSlug,
      device_label: options.deviceLabel,
    });
    if (!res?.success) return { success: false, message: res?.message };
    return { success: true, data: res.data };
  } catch (error: any) {
    return {
      success: false,
      message: error?.response?.data?.message || 'Validation impossible.',
    };
  }
}

/* ── Organisation ───────────────────────────────────────────────────────── */

export interface BatchInput {
  event_slug: string;
  event_name: string;
  event_date?: string | null;
  event_place?: string | null;
  tier?: PassTier;
  /** Une place nominative par entrée. Prioritaire sur `quantity`. */
  guests?: Array<{ name?: string; tier?: PassTier }>;
  /** Places au porteur, quand les noms ne sont pas connus. */
  quantity?: number;
  max_scans?: number;
  expires_at?: string | null;
  note?: string | null;
}

export async function createBatch(
  input: BatchInput,
): Promise<Outcome<{ count: number; passes: AdminPass[] }>> {
  try {
    const res: any = await apiService.post('/api/event-passes/batch', input);
    if (!res?.success) return { success: false, message: res?.message };
    return { success: true, data: res.data };
  } catch (error: any) {
    // Lot vide, lot trop grand, slug manquant : le serveur renvoie une phrase
    // écrite pour être lue telle quelle.
    return {
      success: false,
      message: error?.response?.data?.message || 'Émission impossible.',
    };
  }
}

export async function fetchEvents(): Promise<Outcome<EventSummary[]>> {
  try {
    const res: any = await apiService.get('/api/event-passes/events');
    if (!res?.success) return { success: false, message: res?.message };
    return { success: true, data: res.data || [] };
  } catch {
    return { success: false, message: 'Lecture impossible.' };
  }
}

export async function fetchPasses(params: {
  eventSlug?: string;
  status?: PassStatus;
  search?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<Outcome<{ total: number; passes: AdminPass[] }>> {
  try {
    const res: any = await apiService.get('/api/event-passes', {
      event_slug: params.eventSlug,
      status: params.status,
      q: params.search,
      limit: params.limit,
      offset: params.offset,
    });
    if (!res?.success) return { success: false, message: res?.message };
    return { success: true, data: res.data };
  } catch {
    return { success: false, message: 'Lecture impossible.' };
  }
}

export async function fetchEventStats(slug: string): Promise<Outcome<EventStats>> {
  try {
    const res: any = await apiService.get(`/api/event-passes/events/${slug}/stats`);
    if (!res?.success) return { success: false, message: res?.message };
    return { success: true, data: res.data };
  } catch {
    return { success: false, message: 'Statistiques indisponibles.' };
  }
}

/**
 * Lien de contrôle à durée limitée, à envoyer à l'équipe qui tient la porte.
 *
 * Il n'autorise que `verify` et `redeem`, sur ce seul événement, et expire tout
 * seul — contrairement à un rôle de modérateur, qu'on oublie de retirer après
 * la soirée. Le jeton voyage dans le FRAGMENT de l'URL : il ne part donc jamais
 * au serveur, ni dans un journal d'accès, ni dans un référent.
 */
export async function createDoorLink(
  slug: string,
  hours: number,
): Promise<Outcome<{ token: string; url: string; expires_at: string; event_slug: string }>> {
  try {
    const res: any = await apiService.post(`/api/event-passes/events/${slug}/door-link`, { hours });
    if (!res?.success) return { success: false, message: res?.message };
    return { success: true, data: res.data };
  } catch (error: any) {
    return {
      success: false,
      message: error?.response?.data?.message || 'Lien de contrôle impossible.',
    };
  }
}

export async function revokePass(id: string, reason?: string): Promise<Outcome<AdminPass>> {
  try {
    const res: any = await apiService.post(`/api/event-passes/${id}/revoke`, { reason });
    if (!res?.success) return { success: false, message: res?.message };
    return { success: true, data: res.data };
  } catch (error: any) {
    return {
      success: false,
      message: error?.response?.data?.message || 'Révocation impossible.',
    };
  }
}

export async function restorePass(id: string): Promise<Outcome<AdminPass>> {
  try {
    const res: any = await apiService.post(`/api/event-passes/${id}/restore`, {});
    if (!res?.success) return { success: false, message: res?.message };
    return { success: true, data: res.data };
  } catch (error: any) {
    return {
      success: false,
      message: error?.response?.data?.message || 'Restauration impossible.',
    };
  }
}

export default {
  fetchMine,
  cachedMine,
  fetchWalletStatus,
  fetchAppleWalletLink,
  fetchGoogleWalletLink,
  verifyPass,
  redeemPass,
  createBatch,
  fetchEvents,
  fetchPasses,
  fetchEventStats,
  createDoorLink,
  revokePass,
  restorePass,
  slugify,
  TIERS,
  TIER_LABELS,
  STATUS_LABELS,
  REFUSAL_HINTS,
  DOOR_LINK_HOURS,
  MAX_BATCH,
};
