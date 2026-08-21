/**
 * File d'attente d'envoi pour les signaux de MASSE (impressions, temps de
 * lecture) — la seule catégorie de télémétrie qui part pendant que le doigt
 * défile.
 *
 * ── Le problème qu'elle résout ───────────────────────────────────────────
 * Une impression part depuis `onViewableItemsChanged`. Ce callback n'est pas
 * appelé « quelque part » : `VirtualizedList._onScroll` l'appelle LUI-MÊME,
 * sur le thread JS, à chaque événement de défilement
 * (`@react-native/virtualized-lists/Lists/VirtualizedList.js`, `_onScroll`
 * appelle `_updateViewableItems` puis `_scheduleCellsToRenderUpdate`). Tout ce
 * qu'on fait dans ce callback se paie donc DANS l'image de défilement, en
 * concurrence directe avec le fenêtrage de la liste et le rendu des lignes.
 *
 * Or, un défilement rapide qui traverse vingt tweets déclenchait vingt
 * `apiService.post('/api/track')` d'un coup. Chacun ouvre sa propre chaîne :
 * `buildClientHeaders()` (dont un `Intl.DateTimeFormat()` par requête),
 * `JSON.stringify`, `fetch`, puis l'analyse de la réponse — vingt fois, en
 * parallèle, sur le thread qui doit rendre la liste.
 *
 * ── Ce que cette file change, et ce qu'elle ne change PAS ────────────────
 * Elle ne perd RIEN et ne transforme rien : même route, même corps, même
 * ordre. Elle change deux choses seulement :
 *  1. l'envoi ne démarre plus DANS le callback de défilement, mais au tour de
 *     boucle suivant (`schedule`, `setTimeout(…, 0)` par défaut) ;
 *  2. au plus `maxInFlight` requêtes coexistent, au lieu d'autant que de
 *     tweets traversés.
 *
 * C'est délibérément réservé aux signaux de masse. Un geste délibéré (like,
 * repost, « pas intéressé », signalement) reste envoyé immédiatement : il est
 * rare, il n'arrive jamais en rafale, et il peut bloquer un écran qui l'attend.
 */

export interface DeferredDispatcherOptions {
  /**
   * Nombre maximum d'envois simultanés. Au-delà, les suivants attendent leur
   * tour — c'est ce qui empêche une rafale de défilement de saturer le thread
   * JS avec vingt chaînes de promesses concurrentes.
   */
  maxInFlight?: number;
  /**
   * Comment sortir du tour de boucle courant. Par défaut `setTimeout(fn, 0)` :
   * le drainage commence donc APRÈS que le callback de visibilité (et donc
   * l'événement de défilement qui l'a appelé) soit terminé.
   *
   * Paramétrable pour que les tests soient déterministes.
   */
  schedule?: (run: () => void) => void;
}

const defaultSchedule = (run: () => void) => {
  setTimeout(run, 0);
};

export class DeferredDispatcher<Payload> {
  private readonly send: (payload: Payload) => Promise<unknown>;
  private readonly maxInFlight: number;
  private readonly schedule: (run: () => void) => void;

  private readonly queue: Payload[] = [];
  private inFlight = 0;
  private drainScheduled = false;

  constructor(
    send: (payload: Payload) => Promise<unknown>,
    options: DeferredDispatcherOptions = {},
  ) {
    this.send = send;
    this.maxInFlight = Math.max(1, options.maxInFlight ?? 2);
    this.schedule = options.schedule ?? defaultSchedule;
  }

  /** Ce qui attend encore son tour — utile aux tests et au diagnostic. */
  get pending(): number {
    return this.queue.length;
  }

  /** Ce qui est en vol. */
  get active(): number {
    return this.inFlight;
  }

  /**
   * Met un envoi en file. Ne lance JAMAIS la requête de façon synchrone :
   * c'est tout l'intérêt du composant, l'appelant est dans une image de
   * défilement.
   */
  enqueue(payload: Payload): void {
    this.queue.push(payload);
    this.requestDrain();
  }

  private requestDrain() {
    if (this.drainScheduled) return;
    if (this.queue.length === 0) return;
    if (this.inFlight >= this.maxInFlight) return;
    this.drainScheduled = true;
    this.schedule(() => {
      this.drainScheduled = false;
      this.drain();
    });
  }

  private drain() {
    while (this.queue.length > 0 && this.inFlight < this.maxInFlight) {
      const payload = this.queue.shift() as Payload;
      this.inFlight += 1;
      let promise: Promise<unknown>;
      try {
        promise = this.send(payload);
      } catch {
        // Un `send` qui jette de façon synchrone ne doit pas bloquer la file
        // derrière lui : le signal suivant a le droit de partir.
        this.inFlight -= 1;
        continue;
      }
      Promise.resolve(promise)
        .catch(() => {
          // La télémétrie est non bloquante par contrat : un échec réseau ne
          // remonte nulle part et ne réessaie pas (le moteur tolère un trou,
          // pas un doublon).
        })
        .then(() => {
          this.inFlight -= 1;
          this.requestDrain();
        });
    }
  }
}

export default DeferredDispatcher;
