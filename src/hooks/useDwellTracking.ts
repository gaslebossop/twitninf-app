import { useCallback, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import neuralRankService from '../services/neuralRankService';
import { DwellSessionTracker, type DwellSegment } from '../services/dwellSessions';

/**
 * Mesure du temps de lecture dans un fil.
 *
 * Les fils savaient déjà QUI passait à l'écran — `onViewableItemsChanged` le
 * dit à chaque changement — mais personne ne chronométrait entre l'entrée et
 * la sortie. Seul le lecteur plein écran d'Explorer produisait du temps de
 * lecture, si bien que le signal Attention du pot créateur, le plus lourd du
 * score, tournait en permanence sur une estimation décotée de moitié.
 *
 * Ce hook branche `DwellSessionTracker` (la machine à états, testée à part) sur
 * le cycle de vie réel de l'écran. Tout l'enjeu est là : un chronomètre qui ne
 * sait pas que l'app est passée en arrière-plan compte une nuit de sommeil
 * comme de la lecture.
 *
 * Quatre points d'arrêt, dans l'ordre où ils se déclenchent en pratique :
 *
 * 1. `AppState` quitte `active` — l'utilisateur bascule d'application.
 * 2. L'écran perd le focus — il change d'onglet ou ouvre un tweet.
 * 3. L'inactivité passe `IDLE_MS` — le téléphone est posé, écran allumé, sur
 *    un tweet qui reste « visible » sans que personne ne le lise.
 * 4. Le démontage.
 *
 * Ce qui reste en cours au moment de l'arrêt n'est pas perdu : le résidu est
 * conservé et reprend au retour, sans jamais rattraper le trou.
 */

/**
 * Sans un seul changement de visibilité pendant ce temps, on considère que
 * plus personne ne lit. Assez long pour ne pas couper une lecture attentive
 * d'un tweet long, assez court pour qu'un téléphone posé ne fabrique pas de
 * l'attention.
 */
const IDLE_MS = 90_000;

export interface DwellMeta {
  /** Auteur, pour ne pas mesurer sa propre lecture. */
  authorId?: string | null;
  media?: 'text' | 'image' | 'video';
  contentChars?: number;
  videoDurationMs?: number | null;
  /** Un contenu sponsorisé n'entre pas dans la paie : inutile de l'envoyer. */
  sponsored?: boolean;
}

interface Options {
  /** Ce que l'écran sait du tweet, au moment de l'envoi. */
  getMeta?: (tweetId: string) => DwellMeta | null | undefined;
  /** Identifiant du lecteur, pour écarter ses propres publications. */
  viewerId?: string | null;
  /** Permet de couper la mesure (fil inactif, onglet secondaire). */
  enabled?: boolean;
}

export function useDwellTracking({ getMeta, viewerId, enabled = true }: Options = {}) {
  const trackerRef = useRef(new DwellSessionTracker());
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabledRef = useRef(enabled);
  const focusedRef = useRef(true);

  // Les métadonnées et le lecteur changent à chaque rendu ; le callback exposé
  // ne doit PAS changer, parce qu'il est appelé depuis `onViewableItemsChanged`
  // que la `FlatList` fige au montage. D'où l'indirection par ref.
  const metaRef = useRef(getMeta);
  metaRef.current = getMeta;
  const viewerRef = useRef(viewerId);
  viewerRef.current = viewerId;
  enabledRef.current = enabled;

  /**
   * Envoie un segment mesuré.
   *
   * Le média et la longueur du contenu partent avec : un temps brut se confond
   * avec la LONGUEUR du tweet, et sans eux le moteur apprend seulement que les
   * contenus longs « marchent mieux » (voir `algorithm/dwell.rs`).
   */
  const emit = useCallback((segments: DwellSegment[]) => {
    if (!segments.length) return;

    for (const segment of segments) {
      const meta = metaRef.current?.(segment.id) || null;

      // Ni les sponsorisés ni ses propres publications : le serveur les écarte
      // de toute façon, autant ne pas dépenser de réseau pour ça.
      if (meta?.sponsored) continue;
      const viewer = viewerRef.current;
      if (viewer && meta?.authorId && String(meta.authorId) === String(viewer)) continue;

      neuralRankService.trackInteraction({
        tweetId: segment.id,
        interactionType: 'view',
        dwellMs: segment.dwellMs,
        dwellMedia: meta?.media,
        contentChars: meta?.contentChars,
        videoDurationMs: meta?.videoDurationMs ?? undefined,
        authorId: meta?.authorId ? String(meta.authorId) : undefined,
      });
    }
  }, []);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const pause = useCallback(() => {
    clearIdleTimer();
    emit(trackerRef.current.pause(Date.now()));
  }, [clearIdleTimer, emit]);

  const armIdleTimer = useCallback(() => {
    clearIdleTimer();
    if (trackerRef.current.activeCount() === 0) return;
    idleTimerRef.current = setTimeout(pause, IDLE_MS);
  }, [clearIdleTimer, pause]);

  /**
   * À câbler sur `onViewableItemsChanged`.
   *
   * Stable pour toute la vie du composant — la `FlatList` refuse que le
   * callback de visibilité change, et l'écran le range de toute façon dans une
   * ref figée au montage.
   */
  const notifyVisible = useCallback(
    (ids: (string | null | undefined)[]) => {
      if (!enabledRef.current || !focusedRef.current) return;
      emit(trackerRef.current.sync(ids, Date.now()));
      armIdleTimer();
    },
    [emit, armIdleTimer],
  );

  // Passage en arrière-plan : le temps hors de l'app ne se compte jamais.
  // `inactive` compte aussi — sur iOS c'est le centre de contrôle, un appel
  // entrant ou le sélecteur d'app, pendant lesquels personne ne lit.
  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state !== 'active') pause();
    };
    const subscription = AppState.addEventListener('change', onChange);
    return () => subscription.remove();
  }, [pause]);

  // Perte de focus de l'écran : changement d'onglet, ouverture d'un tweet.
  // Le retour ne rejoue rien — la prochaine notification de visibilité
  // redémarrera les chronomètres des tweets encore à l'écran.
  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      return () => {
        focusedRef.current = false;
        pause();
      };
    }, [pause]),
  );

  // Démontage : ce qui a été lu jusqu'ici part, le reste est oublié.
  useEffect(() => {
    const tracker = trackerRef.current;
    return () => {
      clearIdleTimer();
      emit(tracker.pause(Date.now()));
      tracker.reset();
    };
  }, [clearIdleTimer, emit]);

  // Couper la mesure en cours de route doit fermer proprement, pas abandonner
  // des chronomètres qui repartiraient faussés à la réactivation.
  useEffect(() => {
    if (!enabled) pause();
  }, [enabled, pause]);

  return { notifyVisible, pauseDwell: pause };
}

export default useDwellTracking;
