import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import eventsApi from '../services/eventsApi';
import useForegroundInterval from '../hooks/useForegroundInterval';
import { artOf, type EventArt } from '../theme/eventArt';
import type {
  ClaimResult,
  EventFeatures,
  EventState,
  QuestProgress,
  QuestView,
} from '../types/events';

/**
 * L'état d'événement de l'app — un seul, désormais.
 *
 * ── Ce qu'il remplace ─────────────────────────────────────────────────────
 * `EventContext`, `FunctionalEventContext`, `useKosporBirthdayEvent`,
 * `useEventTheme`, `useEventStyles` et `useFunctionalEventFeatures` : six
 * points d'accès à la même chose, chacun avec son propre sondage. Le hook
 * Kospor documentait le symptôme dans son propre en-tête — six composants, six
 * minuteurs, une dizaine de requêtes toutes les trente secondes pour une
 * réponse annuelle. Il avait été corrigé à coups de singleton de module ; les
 * cinq autres ne l'avaient pas été.
 *
 * Un fournisseur monté une fois à la racine EST le propriétaire unique : plus
 * besoin de singleton, plus besoin de coordonner des abonnés. Ce qui suit tient
 * en un `useState` et un minuteur suspendu en arrière-plan.
 *
 * ── L'état par défaut est « il ne se passe rien » ─────────────────────────
 * `event` nul n'est pas une erreur, c'est la situation onze mois sur douze. Ce
 * contexte n'échoue jamais bruyamment : si le réseau tombe, l'app perd sa
 * décoration et garde tout le reste. Un événement n'a jamais à empêcher de
 * lire un tweet.
 */

const POLL_MS = 5 * 60 * 1000;

interface EventsContextValue extends EventState {
  /** La DA résolue. Toujours définie — `none` quand il n'y a pas d'événement. */
  art: EventArt;
  /** Vrai seulement si l'événement est actif ET dans sa fenêtre. */
  isLive: boolean;
  /** Millisecondes avant la fin, ou `null` hors événement. */
  endsIn: number | null;
  refresh: (force?: boolean) => Promise<void>;
  claim: (questId: string) => Promise<ClaimResult>;
  /** Signale un geste que seul le client peut constater (navigation, essai). */
  signal: (questId: string, key: string, amount?: number) => void;
}

const EMPTY: EventState = {
  event: null,
  quests: [],
  loading: true,
  error: null,
  fetchedAt: null,
};

const EventsContext = createContext<EventsContextValue>({
  ...EMPTY,
  art: artOf('none'),
  isLive: false,
  endsIn: null,
  refresh: async () => {},
  claim: async () => ({ ok: false, message: 'Aucun événement' }),
  signal: () => {},
});

/**
 * Assemble définitions et progression, et décide de ce qui est visible.
 *
 * C'est ici que vit la seule vraie règle d'affichage : une quête à
 * prérequis non remplis est VERROUILLÉE (on la voit, on sait qu'elle existe),
 * alors qu'une quête `hidden` est ABSENTE tant qu'elle n'a pas bougé. La
 * différence compte : la première donne envie de continuer, la seconde est une
 * surprise, et les confondre supprime l'une ou l'autre.
 */
function assemble(
  event: EventState['event'],
  progress: QuestProgress[],
): QuestView[] {
  if (!event) return [];

  const byId = new Map(progress.map((p) => [p.quest_id, p]));
  const done = new Set(progress.filter((p) => p.completed).map((p) => p.quest_id));

  return event.quests
    .map((quest) => {
      const state =
        byId.get(quest.id) ??
        ({
          quest_id: quest.id,
          progress: 0,
          goal: quest.goal,
          completed: false,
          claimed: false,
        } as QuestProgress);

      const locked = (quest.requires ?? []).some((id) => !done.has(id));
      return { ...quest, state, locked };
    })
    .filter((quest) => !quest.hidden || quest.state.progress > 0)
    .sort((a, b) => {
      // Ce qui est réclamable en premier : c'est la seule chose que
      // l'utilisateur peut faire tout de suite en ouvrant la page.
      const claimable = (q: QuestView) => (q.state.completed && !q.state.claimed ? 0 : 1);
      if (claimable(a) !== claimable(b)) return claimable(a) - claimable(b);
      // Puis le verrouillé en dernier, quel que soit son palier.
      if (a.locked !== b.locked) return a.locked ? 1 : -1;
      // Puis les réclamées tout en bas : elles n'appellent plus d'action.
      if (a.state.claimed !== b.state.claimed) return a.state.claimed ? 1 : -1;
      return 0;
    });
}

export function EventsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<EventState>(EMPTY);
  /** Signaux déjà envoyés dans cette session, pour ne pas les répéter. */
  const sent = useRef<Set<string>>(new Set());

  const refresh = useCallback(async (force = false) => {
    try {
      const payload = await eventsApi.fetchCurrent(force);
      const event = payload?.event ?? null;
      setState({
        event,
        quests: assemble(event, payload?.progress ?? []),
        loading: false,
        error: null,
        fetchedAt: Date.now(),
      });
    } catch (error: any) {
      // On GARDE l'événement déjà connu : perdre le réseau ne doit pas faire
      // disparaître une page qu'on était en train de lire.
      setState((current) => ({
        ...current,
        loading: false,
        error: error?.message ?? 'Événements indisponibles',
      }));
    }
  }, []);

  useForegroundInterval(() => { void refresh(); }, POLL_MS);

  const claim = useCallback(
    async (questId: string): Promise<ClaimResult> => {
      const slug = state.event?.slug;
      if (!slug) return { ok: false, message: 'Aucun événement en cours' };

      const result = await eventsApi.claimQuest(slug, questId);
      // On relit le serveur plutôt que de deviner : le contenu d'un lot à
      // tirage n'existe qu'après la remise, et le solde a bougé.
      if (result.ok) await refresh(true);
      return result;
    },
    [state.event?.slug, refresh],
  );

  const signal = useCallback(
    (questId: string, key: string, amount = 1) => {
      const slug = state.event?.slug;
      if (!slug) return;

      // Garde locale EN PLUS de la clé d'idempotence serveur : inutile
      // d'envoyer cent fois la même requête pour se la faire refuser cent fois.
      const dedupe = `${slug}:${questId}:${key}`;
      if (sent.current.has(dedupe)) return;
      sent.current.add(dedupe);

      void eventsApi.reportSignal(slug, {
        quest_id: questId,
        amount,
        idempotency_key: dedupe,
      });
    },
    [state.event?.slug],
  );

  const value = useMemo<EventsContextValue>(() => {
    const event = state.event;
    const now = Date.now();
    const start = event?.starts_at ? Date.parse(event.starts_at) : NaN;
    const end = event?.ends_at ? Date.parse(event.ends_at) : NaN;

    // Le serveur reste juge de `is_active` ; les dates ne servent qu'à éviter
    // d'afficher « il reste -3 jours » quand une désactivation a pris du retard.
    const inWindow =
      (!Number.isFinite(start) || now >= start) && (!Number.isFinite(end) || now <= end);

    return {
      ...state,
      art: artOf(event?.art),
      isLive: !!event?.is_active && inWindow,
      endsIn: Number.isFinite(end) ? Math.max(0, end - now) : null,
      refresh,
      claim,
      signal,
    };
  }, [state, refresh, claim, signal]);

  return <EventsContext.Provider value={value}>{children}</EventsContext.Provider>;
}

/** L'état complet de l'événement en cours. */
/**
 * Fournisseur d'APERÇU, réservé aux outils internes.
 *
 * ── Pourquoi il existe ────────────────────────────────────────────────────
 * La page d'événement ne montre quelque chose que si un événement est
 * RÉELLEMENT en cours côté serveur. Hors période, elle affiche « bientôt » et
 * zéro quête — donc impossible d'en juger la mise en page, ni de voir à quoi
 * ressemble une quête réclamable, verrouillée ou déjà encaissée.
 *
 * Les seules alternatives étaient d'allumer l'événement en production ou de
 * décaler ses dates : deux gestes visibles par tous les utilisateurs, pour
 * regarder un écran.
 *
 * Celui-ci substitue un état complet à celui du serveur, sans toucher à
 * `EventScreen` — qui reste strictement le même composant, avec les mêmes
 * données en entrée. Un aperçu qui passe par un chemin de rendu différent de
 * la vraie page ne prouve rien.
 */
export function EventsPreviewProvider({
  value,
  children,
}: {
  value: EventsContextValue;
  children: ReactNode;
}) {
  return <EventsContext.Provider value={value}>{children}</EventsContext.Provider>;
}

export function useEvents(): EventsContextValue {
  return useContext(EventsContext);
}

/**
 * La DA courante.
 *
 * Toujours définie : un composant n'a jamais à tester « y a-t-il un
 * événement ? » avant de peindre. Hors événement, il reçoit l'habillage
 * ordinaire de l'app et rend exactement ce qu'il rendait.
 */
export function useEventArt(): EventArt {
  return useContext(EventsContext).art;
}

/**
 * Une bascule de fonctionnalité de l'événement.
 *
 * Remplace `functionalEventService.isFeatureActive(nom, page)`, qui partait au
 * réseau à CHAQUE appel — donc à chaque rendu de chaque écran qui posait la
 * question. Ici on lit un objet déjà en mémoire.
 */
export function useEventFeature<K extends keyof EventFeatures>(
  name: K,
): EventFeatures[K] | undefined {
  const { event, isLive } = useContext(EventsContext);
  if (!isLive) return undefined;
  return event?.features?.[name];
}

export default EventsProvider;
