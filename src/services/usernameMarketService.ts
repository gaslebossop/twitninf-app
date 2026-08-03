import { apiService } from './api';

/**
 * Marché des noms d'utilisateur.
 *
 * Miroir de `api/src/routes/usernameMarketRoutes.js`.
 *
 * Le point à ne pas perdre de vue dans l'interface : mettre son pseudo en
 * vente oblige à choisir DÈS MAINTENANT celui qu'on portera après. Ce n'est
 * pas une formalité administrative, c'est ce qui permet à l'échange d'être
 * instantané au moment de l'achat — et donc de ne jamais laisser un compte
 * sans identité.
 */

const BASE = '/api/username-market';

export interface MarketConfig {
  min_price_twc: number;
  max_price_twc: number;
  reservation_price_twc: number;
  reservation_days: number;
  reservation_max_per_user: number;
  platform_fee_rate: number;
  seller_share_rate: number;
}

export interface Availability {
  username: string;
  available: boolean;
  reason: 'taken' | 'reserved' | 'reserved_by_you' | 'yours' | null;
  expires_at?: string;
}

export interface Listing {
  id: string;
  username: string;
  price_twc: number;
  status: 'active' | 'sold' | 'canceled' | 'invalid';
  created_at: string;
  views_count: number;
  seller: {
    id: string;
    username: string;
    full_name: string;
    avatar: string | null;
    verified: boolean;
  } | null;
}

export interface MyMarket {
  fee_rate: number;
  reservation_price_twc: number;
  reservation_days: number;
  listings: Array<{
    id: string;
    username: string;
    replacement_username: string;
    price_twc: number;
    status: string;
    created_at: string;
    sold_at: string | null;
  }>;
  reservations: Array<{ id: string; username: string; expires_at: string }>;
  purchases: Array<{ id: string; username: string; price_twc: number; created_at: string }>;
  sales: Array<{ id: string; username: string; price_twc: number; net_twc: number; created_at: string }>;
}

export type MarketSort = 'recent' | 'price_asc' | 'price_desc' | 'short';

export class UsernameMarketError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

function unwrap(response: any, fallback: string) {
  if (response?.success) return response.data;
  throw new UsernameMarketError(response?.message || fallback, response?.code);
}

export const UNAVAILABILITY_LABELS: Record<string, string> = {
  taken: 'Déjà pris',
  reserved: 'Réservé par quelqu\'un',
  reserved_by_you: 'Réservé par toi',
  yours: 'C\'est déjà ton pseudo',
};

export async function fetchConfig(): Promise<MarketConfig> {
  const response = await apiService.get(`${BASE}/config`);
  return unwrap(response, 'Configuration indisponible.');
}

export async function checkAvailability(username: string): Promise<Availability> {
  const response = await apiService.get(`${BASE}/availability/${encodeURIComponent(username)}`);
  return unwrap(response, 'Vérification impossible.');
}

export async function browseListings(params?: {
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: MarketSort;
  limit?: number;
  offset?: number;
}): Promise<Listing[]> {
  const response = await apiService.get(`${BASE}/listings`, {
    search: params?.search || undefined,
    min_price: params?.minPrice,
    max_price: params?.maxPrice,
    sort: params?.sort,
    limit: params?.limit,
    offset: params?.offset,
  });
  return unwrap(response, 'Annonces indisponibles.');
}

export async function fetchMyMarket(): Promise<MyMarket> {
  const response = await apiService.get(`${BASE}/me`);
  return unwrap(response, 'Marché personnel indisponible.');
}

export async function fetchHistory(username: string): Promise<Array<{ sold_at: string; price_twc: number }>> {
  const response = await apiService.get(`${BASE}/history/${encodeURIComponent(username)}`);
  return unwrap(response, 'Historique indisponible.');
}

/** Le pseudo de remplacement est obligatoire — voir l'en-tête. */
export async function createListing(params: {
  priceTwc: number;
  replacementUsername: string;
}): Promise<{ id: string; username: string; replacement_username: string; price_twc: number }> {
  const response = await apiService.post(`${BASE}/listings`, {
    price_twc: params.priceTwc,
    replacement_username: params.replacementUsername,
  });
  return unwrap(response, 'Mise en vente impossible.');
}

export async function cancelListing(id: string): Promise<void> {
  const response = await apiService.delete(`${BASE}/listings/${id}`);
  unwrap(response, 'Retrait impossible.');
}

/**
 * Achat : change l'identité publique des DEUX comptes en une opération.
 * L'appelant doit rafraîchir la session — le pseudo affiché partout vient de
 * changer.
 */
export async function buyListing(id: string): Promise<{
  sale_id: string;
  username: string;
  previous_username: string;
  price_twc: number;
}> {
  const response = await apiService.post(`${BASE}/listings/${id}/buy`);
  return unwrap(response, 'Achat impossible.');
}

export async function reserveUsername(username: string): Promise<{
  id: string;
  username: string;
  expires_at: string;
}> {
  const response = await apiService.post(`${BASE}/reservations`, { username });
  return unwrap(response, 'Réservation impossible.');
}

/** Prend un pseudo réservé (ou libre) comme identité. */
export async function claimUsername(username: string): Promise<{ previous: string; username: string }> {
  const response = await apiService.post(`${BASE}/claim`, { username });
  return unwrap(response, 'Changement de pseudo impossible.');
}

/** Part nette du vendeur, à afficher avant de fixer un prix. */
export function sellerNetFor(priceTwc: number, feeRate: number): number {
  return Math.round(priceTwc * (1 - feeRate) * 100) / 100;
}
