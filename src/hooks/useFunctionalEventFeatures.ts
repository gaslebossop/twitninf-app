import { useMemo } from 'react';
import { useEvents } from '../contexts/EventsContext';
import type { FunctionalEvent } from '../types/functionalEvent';

/**
 * Les fonctionnalités portées par l'événement en cours.
 *
 * ── Ce que cette réécriture supprime ──────────────────────────────────────
 * La version précédente entretenait un `setInterval` de 30 s qui relançait
 * DEUX requêtes réseau non mises en cache. Elle est montée par l'écran du fil.
 * Autrement dit : quatre requêtes par minute, en permanence, sur l'écran le
 * plus ouvert de l'app et celui dont le défilement doit être irréprochable —
 * pour une réponse qui change une fois par an.
 *
 * Le minuteur n'existe plus. Tout se lit dans l'état déjà chargé par
 * `EventsProvider`, qui sonde une seule fois toutes les cinq minutes, pour
 * toute l'app, et se suspend en arrière-plan.
 *
 * La signature est conservée à l'identique : les appelants n'ont rien à
 * changer, et `pageName` est simplement ignoré (voir la note sur le ciblage
 * par page dans `FunctionalEventContext`).
 */

interface UseFunctionalEventFeaturesOptions {
  pageName: string;
  /** Conservé pour compatibilité d'appel. Plus aucun minuteur n'est créé. */
  refreshInterval?: number;
}

export function useFunctionalEventFeatures(_options: UseFunctionalEventFeaturesOptions) {
  const { event, isLive, loading, refresh } = useEvents();

  return useMemo(() => {
    const current: FunctionalEvent | null =
      event && isLive
        ? ({
            id: event.id,
            name: event.name,
            slug: event.slug,
            description: event.description ?? '',
            is_active: true,
            priority: event.priority,
            target_pages: ['*'],
            features: event.features as Record<string, any>,
            start_date: event.starts_at,
            end_date: event.ends_at,
            auto_activate: true,
            icon: 'sparkles',
            banner_message: event.banner_message,
            created_by: '',
            updated_by: '',
            created_at: '',
            updated_at: '',
          } as FunctionalEvent)
        : null;

    const events = current ? [current] : [];
    const features: Record<string, any> = (current?.features ?? {}) as Record<string, any>;

    return {
      events,
      features,
      isLoading: loading,
      refreshFeatures: () => refresh(true),
      checkFeature: async (featureName: string) => !!features[featureName],
      getFeature: async (featureName: string, defaultValue?: any) =>
        features[featureName] ?? defaultValue,
      hasActiveEvents: events.length > 0,
    };
  }, [event, isLive, loading, refresh]);
}

/** Une bascule précise. Lecture en mémoire, plus aucun appel réseau. */
export function useFeatureCheck(featureName: string, _pageName: string) {
  const { event, isLive, loading } = useEvents();
  const isActive = !!(isLive && (event?.features as Record<string, any>)?.[featureName]);
  return { isActive, isLoading: loading };
}

/** La valeur d'une bascule, avec repli. Lecture en mémoire également. */
export function useFeatureValue(featureName: string, _pageName: string, defaultValue?: any) {
  const { event, isLive, loading } = useEvents();
  const value = isLive
    ? ((event?.features as Record<string, any>)?.[featureName] ?? defaultValue)
    : defaultValue;
  return { value, isLoading: loading };
}
