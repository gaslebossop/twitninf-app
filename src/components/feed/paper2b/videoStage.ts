/**
 * 🧪 L'arbitre des vidéos du fil « 2B — Gouttière » : qui joue, et avec quel son.
 *
 * ── Pourquoi un module et pas un état React ─────────────────────────────
 * La lecture automatique demande de savoir quelle ligne est à l'écran. Cette
 * information existe déjà dans `FeedGutterScreen` (`onViewableItemsChanged`),
 * mais la faire redescendre en propriété rerendrait TOUTES les lignes visibles
 * à chaque pixel de défilement — exactement ce que la mémoïsation de
 * `TweetRowGutter` existe pour éviter, et ce que le budget de vues animées par
 * ligne interdit (voir `docs/2B-FLUIDITE-RENDU.md`).
 *
 * Les lecteurs s'abonnent donc directement ici via `useSyncExternalStore` :
 * seul le composant vidéo qui change d'état se rerend, jamais la ligne, jamais
 * la liste.
 *
 * ── Une seule vidéo à la fois ───────────────────────────────────────────
 * Deux décodeurs ouverts en même temps saccadent le défilement sur Android
 * d'entrée de gamme (constat déjà fait dans `ExploreImmersive`, qui ne monte
 * la vidéo que sur la page active), et deux bandes-son simultanées n'ont aucun
 * sens. L'élection est donc exclusive.
 *
 * ── Le son est GLOBAL et il se souvient ─────────────────────────────────
 * Le fil démarre muet — un son qui part tout seul dans un fil public est le
 * défaut le plus détesté. Mais couper le son à chaque nouvelle vidéo obligerait
 * à réappuyer pour chacune : une fois que le lecteur a dit « je veux entendre »,
 * il l'a dit pour la session. C'est le comportement de X et d'Instagram.
 */

import { useEffect, useSyncExternalStore } from 'react';

import { ensurePlaybackAudioMode } from '../../../hooks/useVoicePlayback';

// ─── État du module ─────────────────────────────────────────────────────────

const listeners = new Set<() => void>();

/** Identifiants des tweets actuellement visibles, DANS L'ORDRE de la liste. */
let visible: string[] = [];
/** Lecteurs montés — un tweet visible sans vidéo n'est pas candidat. */
const registered = new Set<string>();
/**
 * Vidéos que le lecteur a explicitement mises en pause. Tant qu'elles sont à
 * l'écran, l'élection ne les relance pas : redémarrer une vidéo que l'on vient
 * d'arrêter est le genre de détail qui fait fermer l'app. L'oubli se fait à la
 * sortie d'écran — revenir dessus plus tard, c'est une nouvelle intention.
 */
const optedOut = new Set<string>();
/** Vidéo lancée à la main : elle garde la main sur l'élection tant qu'elle est vue. */
let pinned: string | null = null;

let activeId: string | null = null;
let suspended = false;
let muted = true;

function emit(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Désigne la vidéo qui joue.
 *
 * L'ordre de `visible` est celui de la liste : à deux vidéos à l'écran, c'est
 * la plus haute qui joue, celle vers laquelle on vient de faire défiler.
 */
function elect(): void {
  let next: string | null = null;

  if (!suspended) {
    if (pinned && (visible.length === 0 || visible.includes(pinned))) {
      // Pas de `registered` à vérifier : une vidéo lancée à la main l'a
      // forcément été depuis son propre lecteur, donc monté.
      next = pinned;
    } else {
      pinned = null;
      next = visible.find((id) => registered.has(id) && !optedOut.has(id)) ?? null;
    }
  }

  if (next === activeId) return;
  activeId = next;
  emit();
}

// ─── Ce que l'écran alimente ────────────────────────────────────────────────

/**
 * Appelé par le callback de visibilité de la liste, à chaque changement.
 *
 * ⚠️ Ce callback tourne sur le thread JS pendant le défilement
 * (`VirtualizedList._onScroll`) : tout ce qui est fait ici se paie dans
 * l'image. D'où le retour immédiat quand rien n'a bougé — le cas de très loin
 * le plus fréquent, la liste rappelant les mêmes identifiants dès qu'un voisin
 * entre à l'écran.
 */
export function setVisibleTweets(ids: (string | null | undefined)[]): void {
  const next = ids.filter((id): id is string => typeof id === 'string' && id.length > 0);

  if (next.length === visible.length && next.every((id, i) => visible[i] === id)) return;

  for (const id of visible) {
    if (!next.includes(id)) optedOut.delete(id);
  }
  visible = next;
  elect();
}

/**
 * Coupe toute lecture en place — le plein écran a pris le relais, ou l'écran
 * a perdu le focus. Deux instances qui jouent le même flux, c'est un écho.
 */
export function suspendStage(): void {
  if (suspended) return;
  suspended = true;
  elect();
}

export function resumeStage(): void {
  if (!suspended) return;
  suspended = false;
  elect();
}

/** Remet la scène à zéro (sortie du fil) : plus rien n'est visible, donc plus rien ne joue. */
export function resetStage(): void {
  visible = [];
  optedOut.clear();
  pinned = null;
  elect();
}

// ─── Ce que les lecteurs pilotent ───────────────────────────────────────────

/** Lancement à la main, depuis la miniature ou le bouton central. */
export function playVideo(tweetId: string): void {
  optedOut.delete(tweetId);
  pinned = tweetId;
  if (activeId === tweetId) return;
  activeId = tweetId;
  emit();
}

/** Pause demandée par le lecteur : la vidéo ne redémarrera pas toute seule. */
export function pauseVideo(tweetId: string): void {
  optedOut.add(tweetId);
  if (pinned === tweetId) pinned = null;
  if (activeId !== tweetId) return;
  activeId = null;
  emit();
}

export function setStageMuted(next: boolean): void {
  if (muted === next) return;
  muted = next;
  // Sans ce passage en mode LECTURE, une vidéo démutée reste inaudible sur un
  // iPhone dont l'interrupteur latéral est sur silencieux — et l'utilisateur
  // conclut que le bouton son est cassé. Même précaution que les vocaux.
  if (!next) ensurePlaybackAudioMode();
  emit();
}

export function toggleStageMuted(): void {
  setStageMuted(!muted);
}

// ─── Abonnements ────────────────────────────────────────────────────────────

/**
 * Inscrit ce lecteur à la scène et dit s'il doit jouer.
 *
 * L'inscription est indispensable : `setVisibleTweets` reçoit tous les tweets
 * visibles, dont l'immense majorité n'a pas de vidéo. Sans registre, l'élection
 * désignerait un tweet en texte pur et aucune vidéo ne jouerait jamais.
 */
export function useVideoSlot(tweetId: string): boolean {
  useEffect(() => {
    registered.add(tweetId);
    elect();
    return () => {
      registered.delete(tweetId);
      optedOut.delete(tweetId);
      if (pinned === tweetId) pinned = null;
      elect();
    };
  }, [tweetId]);

  return useSyncExternalStore(
    subscribe,
    () => activeId === tweetId,
    () => false,
  );
}

export function useStageMuted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => muted,
    () => true,
  );
}

export function isStageMuted(): boolean {
  return muted;
}
