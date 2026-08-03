/**
 * Runtime guards shared by the insights client.
 *
 * TypeScript interfaces disappear at runtime. Without these checks, an API
 * regression such as `{ data: { items: [] } }` is easily mistaken for a real
 * empty result and the UI tells the user that nothing was detected.
 */

export type InsightsErrorKind =
  | 'premium_required'
  | 'invalid_response'
  | 'unavailable';

export class InsightsError extends Error {
  readonly kind: InsightsErrorKind;

  constructor(message: string, kind: InsightsErrorKind = 'unavailable') {
    super(message);
    this.name = 'InsightsError';
    this.kind = kind;
  }
}

export function isPremiumRequiredMessage(message: unknown): boolean {
  const value = String(message || '').toLocaleLowerCase('fr-FR');
  return (
    (value.includes('abonnement') && value.includes('requis'))
    || value.includes('premium required')
  );
}

export function unwrapInsightsResponse<T>(
  response: any,
  fallback: string,
  expected: 'value' | 'array' = 'value',
): T {
  if (!response?.success) {
    const message = String(response?.message || fallback);
    throw new InsightsError(
      message,
      isPremiumRequiredMessage(message) ? 'premium_required' : 'unavailable',
    );
  }

  if (response.data === undefined || response.data === null) {
    throw new InsightsError(
      'Le serveur a renvoyé une réponse incomplète. Réessaie dans un instant.',
      'invalid_response',
    );
  }

  if (expected === 'array' && !Array.isArray(response.data)) {
    throw new InsightsError(
      'Le format des résultats a changé. Mets l’app à jour puis réessaie.',
      'invalid_response',
    );
  }

  return response.data as T;
}

export function finiteNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
