import type { EconomicStats } from '../services/newEconomyService';

const FALLBACK_PRICE = 0.01;

function finiteNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  // Les agrégats SQL arrivent parfois sous forme de chaîne. Les accepter ici
  // évite de faire circuler un type imprévisible jusque dans le rendu natif.
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return fallback;
}

function safeText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function safeTrend(value: unknown): EconomicStats['currency']['trend'] {
  return value === 'rising' || value === 'falling' || value === 'stable'
    ? value
    : 'stable';
}

/**
 * Frontière de confiance de l'écran Trading.
 *
 * L'API est externe au rendu React Native : aucune valeur brute ne doit être
 * transmise à Text, SVG ou aux formateurs numériques sans être normalisée.
 */
export function normalizeEconomicStats(value: unknown): EconomicStats {
  const root = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const rawCurrency = root.currency && typeof root.currency === 'object'
    ? root.currency as Record<string, unknown>
    : {};

  const priceHistory = Array.isArray(root.priceHistory)
    ? root.priceHistory.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const point = entry as Record<string, unknown>;
        const date = safeText(point.date, '');
        const timestamp = Date.parse(date);
        const price = finiteNumber(point.price, Number.NaN);

        if (!date || !Number.isFinite(timestamp) || !Number.isFinite(price)) return [];

        return [{
          date: new Date(timestamp).toISOString(),
          price,
          volume: finiteNumber(point.volume),
          multiplier: finiteNumber(point.multiplier, 1),
        }];
      })
    : [];

  return {
    currency: {
      symbol: safeText(rawCurrency.symbol, 'TWC'),
      name: safeText(rawCurrency.name, 'TwitCoins'),
      currentPrice: finiteNumber(rawCurrency.currentPrice, FALLBACK_PRICE),
      basePrice: finiteNumber(rawCurrency.basePrice, FALLBACK_PRICE),
      multiplier: finiteNumber(rawCurrency.multiplier, 1),
      trend: safeTrend(rawCurrency.trend),
      purchaseBonus: finiteNumber(rawCurrency.purchaseBonus),
      priceChange24h: finiteNumber(rawCurrency.priceChange24h),
      volume24h: finiteNumber(rawCurrency.volume24h),
      marketCap: finiteNumber(rawCurrency.marketCap),
      circulatingSupply: finiteNumber(rawCurrency.circulatingSupply),
    },
    priceHistory,
  };
}

export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Erreur inconnue';
  }
}
