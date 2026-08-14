import React, { useMemo, type ReactNode } from 'react';
import { functionalEventService } from '../services/functionalEventService';
import type {
  FunctionalEvent,
  FunctionalEventContextType,
  FunctionalEventFeatures,
} from '../types/functionalEvent';
import { useEvents as useEventsState } from './EventsContext';

/**
 * Adaptateur vers le nouveau système d'événements.
 *
 * ── Le problème que ce fichier résout ─────────────────────────────────────
 * L'ancienne version tenait son propre état et son propre sondage, en
 * parallèle de `EventContext` et de `useKosporBirthdayEvent` — trois systèmes
 * interrogeant le serveur sur le même sujet sans jamais se parler.
 *
 * Pire : `functionalEventService` va au réseau à CHAQUE appel, sans aucun
 * cache. Et `useFunctionalEventFeatures`, monté par l'écran du fil, relançait
 * deux de ces appels toutes les trente secondes. Le fil — l'écran le plus
 * ouvert de l'app, celui qui doit défiler sans accroc — émettait donc quatre
 * requêtes par minute, indéfiniment, pour savoir s'il y avait une fête.
 *
 * Tout cela lit désormais l'état déjà chargé par `EventsProvider`. Zéro
 * requête, zéro minuteur.
 *
 * ── Ce qui reste à faire ──────────────────────────────────────────────────
 * Migrer `FunctionalEventManagementScreen` (le seul appelant à utiliser
 * réellement cette interface) vers l'écran d'administration du nouveau
 * système, puis supprimer ce fichier et `services/functionalEventService`.
 */

/** L'état vit dans `EventsProvider` ; celui-ci n'est plus qu'une balise. */
export function FunctionalEventProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useFunctionalEvents(): FunctionalEventContextType {
  const { event, isLive, loading, refresh } = useEventsState();

  return useMemo(() => {
    /**
     * L'événement courant traduit dans l'ancienne forme.
     *
     * `target_pages` vaut `['*']` : le ciblage par page a disparu du modèle,
     * et c'est volontaire. Il servait à afficher une fête sur le fil mais pas
     * sur le profil — une distinction que personne n'a jamais su justifier, et
     * qui obligeait à répéter le slug dans trois listes différentes.
     */
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

    const activeEvents = current ? [current] : [];
    const features: FunctionalEventFeatures = (current?.features ?? {}) as FunctionalEventFeatures;

    return {
      activeEvents,
      isLoading: loading,
      hasActiveEvents: activeEvents.length > 0,

      refreshActiveEvents: () => refresh(true),
      // Les quatre lectures ci-dessous restent `async` pour ne pas casser les
      // appelants, mais aucune ne touche plus au réseau : elles répondent
      // depuis l'état déjà en mémoire.
      getActiveEventsForPage: async () => activeEvents,
      getActiveFeaturesForPage: async () => features,
      isFeatureActive: async (featureName: string) => !!features[featureName],
      getFeatureValue: async (featureName: string, _page: string, defaultValue?: any) =>
        features[featureName] ?? defaultValue,

      // Administration : ces opérations écrivent, elles vont au serveur.
      activateEvent: (id, deactivateOthers = true) =>
        functionalEventService.activateEvent(id, deactivateOthers),
      deactivateEvent: (id) => functionalEventService.deactivateEvent(id),
      createEvent: (data) => functionalEventService.createEvent(data),
      updateEvent: (id, data) => functionalEventService.updateEvent(id, data),
      deleteEvent: (id) => functionalEventService.deleteEvent(id),
      getAllEvents: () => functionalEventService.getAllEvents(),
      initializeDefaultEvents: () => functionalEventService.initializeDefaultEvents(),
    };
  }, [event, isLive, loading, refresh]);
}

export default FunctionalEventProvider;
