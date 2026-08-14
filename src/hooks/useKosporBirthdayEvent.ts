/**
 * Hook spécialisé pour l'événement Kospor Birthday
 * Vérifie si l'événement est actif et gère l'affichage de la page et de l'onglet
 *
 * ## Pourquoi un sondage PARTAGÉ et non un `setInterval` par composant
 *
 * Ce hook est monté simultanément par six endroits (MainNavigator,
 * BottomTabNavigator, SettingsScreen, UserProfileScreen, KosporBirthdayScreen
 * et KosporBirthdayPopup). Chaque instance entretenait son propre minuteur de
 * 30 s, et chaque tick déclenchait DEUX appels réseau — soit, sur un simple
 * profil ouvert, une dizaine de requêtes toutes les 30 secondes pour une
 * réponse qui ne change qu'une fois par an. Aucune de ces requêtes n'était
 * mise en cache (`functionalEventService` va au réseau à chaque appel).
 *
 * Le minuteur vit donc désormais dans le module : un seul, quel que soit le
 * nombre d'abonnés, et les composants ne font que lire l'état partagé.
 *
 * Il est aussi suspendu quand l'app passe en arrière-plan, comme
 * `useForegroundInterval` le fait pour les autres sondages : les minuteurs nus
 * réveillaient le thread JS et alimentaient pour rien les compteurs de cadence
 * de l'anti-fraude côté API.
 */

import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { functionalEventService } from '../services/functionalEventService';

const PAGE = 'kosporbirthday';
const FEATURE = 'kosporbirthday';
const REFRESH_MS = 5 * 60 * 1000;

interface KosporState {
  isEventActive: boolean;
  isLoading: boolean;
  events: any[];
}

let state: KosporState = { isEventActive: false, isLoading: true, events: [] };

const subscribers = new Set<(next: KosporState) => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let appStateSub: { remove: () => void } | null = null;
/** Requête en vol partagée : six montages simultanés = un seul aller-retour. */
let inFlight: Promise<void> | null = null;

function publish(next: KosporState): void {
  state = next;
  subscribers.forEach((notify) => notify(next));
}

function refresh(): Promise<void> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const [isActive, events] = await Promise.all([
        functionalEventService.isFeatureActive(FEATURE, PAGE),
        functionalEventService.getActiveEventsForPage(PAGE),
      ]);
      publish({ isEventActive: isActive, isLoading: false, events });
    } catch (error) {
      console.error('Erreur lors de la vérification de l\'événement Kospor Birthday:', error);
      publish({ isEventActive: false, isLoading: false, events: [] });
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

function startTimer(): void {
  if (timer) return;
  timer = setInterval(refresh, REFRESH_MS);
}

function stopTimer(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

function onAppStateChange(status: AppStateStatus): void {
  if (status === 'active') {
    refresh();
    startTimer();
  } else {
    stopTimer();
  }
}

/** Démarre le sondage au premier abonné, l'arrête quand le dernier s'en va. */
function subscribe(notify: (next: KosporState) => void): () => void {
  subscribers.add(notify);

  if (subscribers.size === 1) {
    refresh();
    if (AppState.currentState === 'active') startTimer();
    appStateSub = AppState.addEventListener('change', onAppStateChange);
  }

  return () => {
    subscribers.delete(notify);
    if (subscribers.size === 0) {
      stopTimer();
      appStateSub?.remove();
      appStateSub = null;
    }
  };
}

export function useKosporBirthdayEvent() {
  const [local, setLocal] = useState<KosporState>(state);

  useEffect(() => subscribe(setLocal), []);

  return {
    isEventActive: local.isEventActive,
    isLoading: local.isLoading,
    events: local.events,
    refreshEvent: refresh,
  };
}
