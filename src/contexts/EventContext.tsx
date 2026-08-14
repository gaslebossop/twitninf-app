import React, { useMemo, type ReactNode } from 'react';
import eventService, { type Event, type EventConfig } from '../services/eventService';
import { getEventTheme, type EventThemeConfig } from '../themes/eventThemes';
import { useEvents as useEventsState } from './EventsContext';

/**
 * Adaptateur vers le nouveau système d'événements.
 *
 * ── Pourquoi ce fichier existe encore ─────────────────────────────────────
 * Le système d'événements a été refait (`contexts/EventsContext`,
 * `services/eventsApi`, `types/events`). Restaient neuf écrans et composants
 * qui appelaient `useEvents()` sur CE contexte-ci.
 *
 * Les réécrire tous d'un coup, sans pouvoir lancer l'app, aurait été le genre
 * de refonte à l'aveugle qui casse plus qu'elle ne répare. Or leur besoin réel
 * est minuscule : huit d'entre eux ne lisent que `{ activeEvent,
 * hasActiveEvent }`, et seul l'écran d'administration touche au reste.
 *
 * Ce module traduit donc l'ancien vocabulaire dans le nouveau. Ce qui compte
 * est acquis : il n'y a plus qu'UN sondage, plus qu'UNE source de vérité, et
 * plus aucun risque de voir la DA d'un événement s'afficher au-dessus de
 * quêtes appartenant à un autre.
 *
 * ── Ce qui reste à faire ──────────────────────────────────────────────────
 * Migrer les neuf appelants vers `useEvents()` de `EventsContext`, puis
 * supprimer ce fichier, `themes/eventThemes.ts` et `services/eventService.ts`.
 * C'est du travail mécanique, mais qui se vérifie écran par écran — donc à
 * faire quand on peut regarder l'app tourner.
 */

interface EventContextType {
  activeEvent: Event | null;
  eventTheme: EventThemeConfig | null;
  eventConfig: EventConfig | null;
  isLoading: boolean;
  hasActiveEvent: boolean;

  refreshActiveEvent: () => Promise<void>;
  checkForEvents: () => Promise<void>;
  applyEventTheme: (theme: EventThemeConfig | null) => void;

  // Administration. Ces opérations écrivent, donc elles vont directement au
  // serveur : elles n'ont pas d'état local à tenir.
  activateEvent: (id: string, deactivateOthers?: boolean) => Promise<boolean>;
  deactivateEvent: (id: string) => Promise<boolean>;
  createEvent: (eventData: Partial<Event>) => Promise<Event | null>;
  updateEvent: (id: string, updateData: Partial<Event>) => Promise<Event | null>;
  deleteEvent: (id: string) => Promise<boolean>;
}

/**
 * Le fournisseur n'est plus qu'un passe-plat.
 *
 * L'état vit dans `EventsProvider`, monté au-dessus dans `App.tsx`. On garde
 * la balise pour ne pas avoir à toucher à l'arbre de fournisseurs, dont
 * l'ordre est déjà commenté ligne à ligne là-bas.
 */
export const EventProvider: React.FC<{ children: ReactNode }> = ({ children }) => (
  <>{children}</>
);

export const useEvents = (): EventContextType => {
  const { event, art, isLive, loading, refresh } = useEventsState();

  return useMemo(() => {
    /**
     * Traduction du nouvel événement vers l'ancienne forme.
     *
     * `theme_id` porte désormais la clé de DA (`art`), ce qui garde
     * `getEventTheme()` fonctionnel pour les appelants qui s'en servent encore.
     * `colors` est reconstruit depuis la DA plutôt que reçu du serveur : c'est
     * tout l'objet de la refonte — les couleurs sont dessinées dans l'app, pas
     * saisies dans un formulaire.
     */
    const activeEvent: Event | null =
      event && isLive
        ? ({
            id: event.id,
            name: event.name,
            slug: event.slug,
            description: event.description,
            is_active: event.is_active,
            priority: event.priority,
            theme_id: event.art,
            theme_config: {
              id: event.art,
              name: art.name,
              description: event.description ?? '',
              colors: [art.colors.festive, art.colors.ember, art.colors.ink],
              icon: 'sparkles',
            },
            start_date: event.starts_at,
            end_date: event.ends_at,
            auto_activate: true,
            icon: 'sparkles',
            colors: [art.colors.festive, art.colors.ember, art.colors.ink],
            effects: {},
            created_at: '',
            updated_at: '',
          } as Event)
        : null;

    return {
      activeEvent,
      eventTheme: activeEvent?.theme_id ? getEventTheme(activeEvent.theme_id) : null,
      eventConfig: null,
      isLoading: loading,
      hasActiveEvent: !!activeEvent,

      refreshActiveEvent: () => refresh(true),
      checkForEvents: () => refresh(true),
      // La DA ne se pose plus depuis l'extérieur : elle est déduite de
      // l'événement en cours. Conservé pour ne pas casser les appelants.
      applyEventTheme: () => {},

      activateEvent: (id, deactivateOthers = true) =>
        eventService.activateEvent(id, deactivateOthers),
      deactivateEvent: (id) => eventService.deactivateEvent(id),
      createEvent: (data) => eventService.createEvent(data),
      updateEvent: (id, data) => eventService.updateEvent(id, data),
      deleteEvent: (id) => eventService.deleteEvent(id),
    };
  }, [event, art, isLive, loading, refresh]);
};

export default EventProvider;
