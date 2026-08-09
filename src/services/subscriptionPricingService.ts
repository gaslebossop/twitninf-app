import apiService from './api';

/**
 * Tarifs d'abonnement : le prix est libellé en EUROS, le montant en NF est
 * recalculé au cours du moment par l'API. Le client n'invente jamais un
 * prix — il affiche ce que le serveur facturera réellement.
 */
export interface TierPrice {
  /** Prix catalogue en euros (constant). */
  eur: number;
  /** Montant débité en NF au cours actuel. */
  nf: number;
  /** false = cours indisponible ou API pas à jour : ne pas afficher d'euros. */
  live: boolean;
}

export interface SubscriptionPricing {
  currency_symbol: string;
  /** Valeur d'un NF en euros au moment de la requête. */
  nf_price_eur: number | null;
  duration_days: number;
  plus: TierPrice;
  pro: TierPrice;
  upgrade: TierPrice;
}

/**
 * Repli sûr : aucun ancien montant fixe ne doit réapparaître si le cours ou
 * l'API est indisponible. L'interface bloque alors l'achat et propose de
 * réessayer.
 */
const LEGACY_PRICING: SubscriptionPricing = {
  currency_symbol: 'NF',
  nf_price_eur: null,
  // Période standard de l'offre : annoncer un mois ici promettrait six fois la
  // durée réellement vendue.
  duration_days: 5,
  plus: { eur: 0, nf: 0, live: false },
  pro: { eur: 0, nf: 0, live: false },
  upgrade: { eur: 0, nf: 0, live: false },
};

export const subscriptionPricingService = {
  async get(): Promise<SubscriptionPricing> {
    try {
      const res = await apiService.get('/api/users/subscription-pricing');
      const data = res?.data;
      if (!res?.success || !data?.pro) return LEGACY_PRICING;
      return data as SubscriptionPricing;
    } catch {
      return LEGACY_PRICING;
    }
  },
};

/** Montant NF lisible : 4 décimales max, sans zéros inutiles. */
export function formatNf(amount: number): string {
  if (!Number.isFinite(amount)) return '—';
  const rounded = Math.round(amount * 10000) / 10000;
  return rounded.toLocaleString('fr-FR', { maximumFractionDigits: 4 });
}

export function formatEur(amount: number): string {
  return `${Number(amount).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €`;
}

export default subscriptionPricingService;
