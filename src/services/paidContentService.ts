import { apiService } from './api';

/**
 * Contenu payant à l'unité.
 *
 * Miroir de `api/src/routes/paidContentRoutes.js`. Deux choses à garder en
 * tête en lisant l'app :
 *
 * - **Le texte verrouillé n'arrive jamais ici.** Le serveur envoie un aperçu
 *   tronqué à la place. L'app ne « floute » donc rien : il n'y a rien à
 *   flouter, la marchandise n'a pas quitté le serveur. C'est ce qui rend le
 *   verrou réel plutôt que décoratif.
 * - **Vendre est réservé au palier Pro**, et c'est revérifié en base à chaque
 *   appel. Masquer le bouton côté app est du confort, pas de la sécurité.
 */

const BASE = '/api/paid-content';

export type PaidContentType = 'tweet' | 'story' | 'live_replay';

/** Ce que le serveur joint à un tweet verrouillé (`tweet.paid_content`). */
export interface PaidContentLock {
  id: string;
  content_type: PaidContentType;
  content_id: string;
  creator_id: string;
  price_twc: number;
  preview_text: string | null;
  is_active: boolean;
  has_access: boolean;
  is_creator: boolean;
  /** Renseignés pour le vendeur uniquement. */
  purchases_count?: number;
  net_twc?: number;
}

export interface PaidContentConfig {
  min_price_twc: number;
  max_price_twc: number;
  platform_fee_rate: number;
  creator_share_rate: number;
}

export interface SalesItem {
  id: string;
  content_type: PaidContentType;
  content_id: string;
  price_twc: number;
  preview_text: string | null;
  is_active: boolean;
  purchases_count: number;
  gross_twc: number;
  net_twc: number;
  created_at: string;
}

export interface SalesDashboard {
  fee_rate: number;
  totals: { gross: number; net: number; sales: number; platform_fee: number };
  items: SalesItem[];
}

export interface PurchasedItem {
  id: string;
  content_type: PaidContentType | null;
  content_id: string | null;
  price_twc: number;
  refunded: boolean;
  created_at: string;
  creator: {
    id: string;
    username: string;
    full_name: string;
    avatar: string | null;
    verified: boolean;
  } | null;
}

export interface Buyer {
  id: string;
  price_twc: number;
  refunded: boolean;
  created_at: string;
  buyer: {
    id: string;
    username: string;
    full_name: string;
    avatar: string | null;
    verified: boolean;
  } | null;
}

/**
 * Erreur métier remontée telle quelle à l'utilisateur.
 *
 * Le serveur écrit ces messages pour être lus (« Solde insuffisant », « Tu
 * possèdes déjà ce contenu ») : les remplacer par un texte générique ferait
 * perdre la seule information utile au moment où quelqu'un essaie de payer.
 */
export class PaidContentError extends Error {}

function unwrap(response: any, fallback: string) {
  if (response?.success) return response.data;
  throw new PaidContentError(response?.message || fallback);
}

export async function fetchConfig(): Promise<PaidContentConfig> {
  const response = await apiService.get(`${BASE}/config`);
  return unwrap(response, 'Configuration indisponible.');
}

/** Pose un verrou sur un de ses contenus. */
export async function lockContent(params: {
  contentType: PaidContentType;
  contentId: string;
  priceTwc: number;
  previewText?: string | null;
}): Promise<PaidContentLock> {
  const response = await apiService.post(BASE, {
    content_type: params.contentType,
    content_id: params.contentId,
    price_twc: params.priceTwc,
    preview_text: params.previewText || undefined,
  });
  return unwrap(response, 'Mise en vente impossible.');
}

/** Retire le verrou. Les acheteurs gardent leur accès — c'est voulu. */
export async function unlockContent(paidContentId: string): Promise<void> {
  const response = await apiService.delete(`${BASE}/${paidContentId}`);
  unwrap(response, 'Retrait impossible.');
}

export async function purchase(paidContentId: string): Promise<{
  purchase_id: string;
  content_type: PaidContentType;
  content_id: string;
  price_twc: number;
}> {
  const response = await apiService.post(`${BASE}/${paidContentId}/purchase`);
  return unwrap(response, 'Achat impossible.');
}

export async function fetchLockState(
  contentType: PaidContentType,
  contentId: string,
): Promise<PaidContentLock | null> {
  const response = await apiService.get(`${BASE}/state/${contentType}/${contentId}`);
  if (!response?.success) return null;
  return response.data || null;
}

export async function fetchSales(): Promise<SalesDashboard> {
  const response = await apiService.get(`${BASE}/sales`);
  return unwrap(response, 'Ventes indisponibles.');
}

export async function fetchPurchases(): Promise<PurchasedItem[]> {
  const response = await apiService.get(`${BASE}/purchases`);
  return unwrap(response, 'Achats indisponibles.');
}

export async function fetchBuyers(paidContentId: string): Promise<Buyer[]> {
  const response = await apiService.get(`${BASE}/${paidContentId}/buyers`);
  return unwrap(response, 'Acheteurs indisponibles.');
}

/** Remboursement à l'initiative du vendeur (geste commercial, contenu retiré). */
export async function refund(purchaseId: string, reason?: string): Promise<void> {
  const response = await apiService.post(`${BASE}/purchases/${purchaseId}/refund`, { reason });
  unwrap(response, 'Remboursement impossible.');
}

/**
 * Part réellement encaissée par le créateur, pour l'afficher AVANT la mise en
 * vente. Un vendeur qui découvre la commission après sa première vente est un
 * vendeur qui ne remet rien en vente.
 */
export function creatorNetFor(priceTwc: number, feeRate: number): number {
  const net = priceTwc * (1 - feeRate);
  return Math.round(net * 100) / 100;
}
