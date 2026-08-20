/**
 * Chronomètre de lecture, tweet par tweet.
 *
 * CE QUE ÇA RÉSOUT
 *
 * Les deux fils savent déjà QUI est à l'écran : `onViewableItemsChanged`, avec
 * `itemVisiblePercentThreshold: 50` et `minimumViewTime: 500`, signale chaque
 * entrée et chaque sortie de visibilité. Mais ils ne font que COMPTER les vues
 * — personne ne chronomètre entre l'entrée et la sortie. Résultat : le seul
 * temps de lecture mesuré dans toute l'app venait du lecteur plein écran
 * d'Explorer, et le signal Attention du pot créateur — le plus lourd du score
 * de qualité — tournait sur une estimation décotée de moitié.
 *
 * Cette classe est la machine à états qui manquait. Elle est PURE : aucun
 * import React Native, aucun réseau, aucune horloge interne — l'instant est
 * toujours passé en argument. C'est ce qui la rend testable au milliseconde
 * près (`tests/dwell-sessions.test.js`) et ce qui garantit qu'elle ne compte
 * jamais un temps qu'elle n'a pas vu passer.
 *
 * CE QU'ELLE REFUSE DE COMPTER
 *
 * - Un scroll rapide : sous une seconde, ce n'est pas une lecture. Le résidu
 *   est cependant conservé, car deux passages de 600 ms sur le même tweet font
 *   bien 1,2 s de lecture — les jeter serait fausser vers le bas.
 * - Le temps en arrière-plan : `pause()` clôt les chronomètres, et rien du
 *   trou n'est rattrapé au retour.
 * - Une durée aberrante : plafonnée par segment ET en cumul par tweet sur la
 *   session, pour qu'un téléphone posé sur la table ne fabrique pas de
 *   l'attention.
 * - Une horloge qui recule (changement de fuseau, correction NTP) : un delta
 *   négatif vaut zéro, jamais une soustraction.
 */

/**
 * En dessous, c'est un passage, pas une lecture.
 * Doit rester égal à `DWELL_FLOOR_MS` dans `api/src/services/dwellMirror.js` :
 * en dessous, le serveur jette l'envoi et on aura consommé du réseau pour rien.
 */
export const MIN_DWELL_MS = 1000;

/**
 * Plafond par segment et par tweet.
 * Doit rester égal à `DWELL_CAP_MS` côté serveur, lui-même aligné sur le
 * `dwellCap` que `economy/creatorPool/signals.js` applique à la lecture.
 */
export const MAX_DWELL_MS = 600_000;

export interface DwellSegment {
  id: string;
  dwellMs: number;
}

interface SessionState {
  /** Instant d'entrée en visibilité, `null` si le tweet n'est plus à l'écran. */
  startedAt: number | null;
  /** Temps accumulé mais pas encore émis, faute d'atteindre le seuil. */
  pending: number;
  /** Temps déjà émis pour ce tweet, pour borner le cumul de la session. */
  emitted: number;
}

export class DwellSessionTracker {
  private readonly minMs: number;
  private readonly maxMs: number;
  private readonly sessions = new Map<string, SessionState>();

  constructor(options: { minMs?: number; maxMs?: number } = {}) {
    this.minMs = options.minMs ?? MIN_DWELL_MS;
    this.maxMs = options.maxMs ?? MAX_DWELL_MS;
  }

  /**
   * Aligne l'état sur la liste des tweets actuellement visibles.
   *
   * C'est le seul point d'entrée du fil : on lui passe ce que
   * `onViewableItemsChanged` vient de rendre, et il en déduit les entrées, les
   * sorties, et les segments à envoyer. Travailler sur la liste complète
   * plutôt que sur les transitions évite de désynchroniser l'état quand un
   * callback est manqué — ce qui arrive au remontage d'une `FlatList`.
   */
  sync(visibleIds: (string | null | undefined)[], now: number): DwellSegment[] {
    const visible = new Set(
      visibleIds.filter((id): id is string => typeof id === 'string' && id.length > 0),
    );

    const segments: DwellSegment[] = [];

    // Sorties : tout ce qui était en cours et n'est plus visible.
    for (const [id, state] of this.sessions) {
      if (state.startedAt !== null && !visible.has(id)) {
        const segment = this.close(id, state, now);
        if (segment) segments.push(segment);
      }
    }

    // Entrées : un tweet déjà en cours n'est PAS redémarré — le callback de
    // visibilité reparle des voisins à chaque changement, et repartir de zéro
    // à chaque fois effacerait le temps écoulé depuis l'entrée réelle.
    for (const id of visible) {
      const state = this.sessions.get(id);
      if (!state) {
        this.sessions.set(id, { startedAt: now, pending: 0, emitted: 0 });
      } else if (state.startedAt === null) {
        state.startedAt = now;
      }
    }

    return segments;
  }

  /**
   * Arrête tous les chronomètres en cours — passage en arrière-plan, perte de
   * focus de l'écran, inactivité prolongée, démontage.
   *
   * Les résidus sont conservés : revenir sur l'écran reprend la lecture là où
   * elle s'était arrêtée, sans compter l'absence.
   */
  pause(now: number): DwellSegment[] {
    const segments: DwellSegment[] = [];
    for (const [id, state] of this.sessions) {
      if (state.startedAt === null) continue;
      const segment = this.close(id, state, now);
      if (segment) segments.push(segment);
    }
    return segments;
  }

  /** Oublie tout, résidus compris — changement de compte, ou nouveau fil. */
  reset(): void {
    this.sessions.clear();
  }

  /** Nombre de tweets dont le chronomètre tourne. */
  activeCount(): number {
    let count = 0;
    for (const state of this.sessions.values()) if (state.startedAt !== null) count += 1;
    return count;
  }

  /**
   * Ferme un chronomètre et décide s'il y a matière à envoyer.
   * Muté sur place : l'état vit dans la `Map`, pas dans la valeur de retour.
   */
  private close(id: string, state: SessionState, now: number): DwellSegment | null {
    const startedAt = state.startedAt;
    state.startedAt = null;
    if (startedAt === null) return null;

    // Une horloge qui recule ne retire jamais du temps déjà lu.
    const elapsed = Math.max(0, now - startedAt);
    state.pending += elapsed;

    if (state.pending < this.minMs) return null;

    const room = Math.max(0, this.maxMs - state.emitted);
    if (room === 0) {
      // Plafond de session atteint : on cesse d'accumuler plutôt que de garder
      // un résidu qui ne partira jamais.
      state.pending = 0;
      return null;
    }

    const dwellMs = Math.min(Math.round(state.pending), room, this.maxMs);
    state.pending = 0;
    state.emitted += dwellMs;

    return { id, dwellMs };
  }
}

export default DwellSessionTracker;
