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
  /**
   * Temps restant pour ajuster le prix, en millisecondes.
   *
   * Le prix se fixe à la publication et reste réglable 30 minutes. Passé ce
   * délai, des gens ont vu le contenu à un prix donné : le changer reviendrait
   * à déplacer l'étiquette sur un article déjà examiné. Rendre le contenu
   * gratuit, en revanche, reste possible à tout moment — ça ne lèse personne.
   */
  price_editable_for_ms?: number;
}

export interface PaidContentConfig {
  min_price_twc: number;
  max_price_twc: number;
  platform_fee_rate: number;
  creator_share_rate: number;
  price_edit_window_ms: number;
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

/** Une monnaie à convertir pour compléter un paiement. */
export interface ConversionStep {
  symbol: string;
  currency_id: string;
  /** Unités prélevées sur cette monnaie. */
  debit: number;
  /** Ce que ça rapporte dans la monnaie du prix. */
  credit: number;
  rate: number;
}

/**
 * Estimation d'achat : ce qu'il manque, et ce qu'il faudrait convertir.
 *
 * `affordable` tient compte de TOUTES les monnaies du compte, pas seulement du
 * solde NF. C'est la différence entre « tu n'as pas assez » et « tu as assez,
 * mais pas dans cette monnaie-là » — deux situations que l'app confondait, ce
 * qui laissait des gens bloqués devant un contenu qu'ils pouvaient s'offrir.
 */
export interface PurchaseQuote {
  price: number;
  currencyId: string;
  /** Solde dans la monnaie du prix. */
  balance: number;
  needsConversion: boolean;
  shortfall: number;
  missing: number;
  affordable: boolean;
  conversions: ConversionStep[];
}

export async function fetchPurchaseQuote(paidContentId: string): Promise<PurchaseQuote> {
  const response = await apiService.get(`${BASE}/${paidContentId}/quote`);
  return unwrap(response, 'Estimation indisponible.');
}

/**
 * @param autoConvert Autorise le serveur à convertir les AUTRES monnaies du
 *   compte pour compléter. Jamais implicite : sans ce consentement, un solde
 *   insuffisant reste un refus, et rien n'est vendu.
 */
export async function purchase(paidContentId: string, autoConvert = false): Promise<{
  purchase_id: string;
  content_type: PaidContentType;
  content_id: string;
  price_twc: number;
  conversions?: Array<{ symbol: string; debited: number; credited: number }>;
}> {
  const response = await apiService.post(
    `${BASE}/${paidContentId}/purchase`,
    autoConvert ? { auto_convert: true } : {},
  );
  return unwrap(response, 'Achat impossible.');
}

/** « 31 500 CONG et 0,57 GCORP » — lisible, sans jargon de taux de change. */
export function describeConversions(steps: ConversionStep[]): string {
  return steps
    .map((step) => `${formatAmount(step.debit)} ${step.symbol}`)
    .join(' et ');
}

/** Montants monétaires : jamais de notation scientifique, jamais 12 décimales. */
export function formatAmount(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded)
    ? rounded.toLocaleString('fr-FR')
    : rounded.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

/** « 12 min pour changer le prix » — un délai muet est un délai qu'on rate. */
export function formatPriceWindow(ms: number): string {
  if (ms <= 0) return 'prix définitif';
  const minutes = Math.floor(ms / 60000);
  if (minutes >= 1) return `${minutes} min pour changer le prix`;
  return `${Math.max(1, Math.floor(ms / 1000))} s pour changer le prix`;
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
