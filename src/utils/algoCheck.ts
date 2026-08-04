/**
 * « Ce tweet te plaît ? » — quand poser la question, et quand se taire.
 *
 * ── Pourquoi le signal vient du client ───────────────────────────────────
 * L'idée de départ était de suivre l'hésitation du recommandeur : afficher la
 * question quand sa confiance sur un tweet est basse. Sauf que le service Rust
 * ne renvoie à l'API que des IDENTIFIANTS de tweets, que l'API Node hydrate
 * ensuite en tweets complets (`GET /api/neural-rank/recommendations`) : ni le
 * score, ni la confiance ne traversent. Côté app, `_recommendation_confidence`
 * vaut toujours 0 — un déclencheur basé dessus n'aurait jamais rien affiché.
 *
 * Le signal utilisé ici est donc celui que l'app observe vraiment, et il
 * couvre le cas qui compte le plus : **l'algorithme ne reçoit rien**. Quand on
 * fait défiler des dizaines de tweets sans un like, un retweet ni une ouverture,
 * le recommandeur n'a aucune matière pour s'ajuster — c'est exactement là qu'une
 * réponse explicite vaut le plus cher. Un utilisateur qui interagit, lui, parle
 * déjà : on ne l'interrompt pas.
 *
 * Si un jour le score et la confiance descendent jusqu'au client, `hesitation`
 * ci-dessous acceptera ce signal en priorité sans rien changer au reste.
 *
 * ── Les règles, et ce qu'elles protègent ─────────────────────────────────
 * Une question mal placée est pire que pas de question : elle casse la lecture
 * et se fait balayer sans être lue. D'où les garde-fous, tous testés.
 */

/** Tweets à parcourir sans aucune interaction avant de se permettre de demander. */
export const SILENT_STREAK_BEFORE_ASK = 14;

/** Jamais deux questions à moins de tant de tweets d'écart. */
export const MIN_GAP_BETWEEN_ASKS = 30;

/** Plafond par session : au-delà, ce n'est plus une question, c'est un sondage. */
export const MAX_ASKS_PER_SESSION = 2;

/** En deçà de ce nombre de tweets vus, on laisse l'utilisateur arriver. */
export const MIN_TWEETS_BEFORE_FIRST_ASK = 8;

export interface AlgoCheckState {
  /** Position (index dans le fil) de la dernière question posée. `-1` si aucune. */
  lastAskIndex: number;
  /** Nombre de questions déjà posées dans la session. */
  asksThisSession: number;
  /** Tweets consécutifs parcourus sans interaction. */
  silentStreak: number;
  /** Identifiants déjà soumis à une question — jamais deux fois le même. */
  answered: Set<string>;
}

export function initialAlgoCheckState(): AlgoCheckState {
  return { lastAskIndex: -1, asksThisSession: 0, silentStreak: 0, answered: new Set() };
}

export interface AskDecisionInput {
  /** Index du tweet dans le fil affiché. */
  index: number;
  /** Identifiant du tweet candidat. */
  tweetId: string;
  state: AlgoCheckState;
  /**
   * Confiance du recommandeur sur ce tweet, si elle finit par arriver
   * jusqu'ici (0 = inconnue). Une valeur strictement entre 0 et
   * `HESITATION_CEILING` est traitée comme une hésitation avérée et court-
   * circuite la règle du silence.
   */
  confidence?: number;
}

/** Au-dessus, le recommandeur est sûr de lui : rien à demander. */
export const HESITATION_CEILING = 0.45;

/**
 * Faut-il poser la question juste avant le tweet d'index `index` ?
 *
 * Fonction pure : c'est ce qui permet de la tester sans fil, sans réseau et
 * sans appareil — le contraire du reste de l'écran.
 */
export function shouldAskAt({ index, tweetId, state, confidence = 0 }: AskDecisionInput): boolean {
  if (state.asksThisSession >= MAX_ASKS_PER_SESSION) return false;
  if (state.answered.has(tweetId)) return false;
  if (index < MIN_TWEETS_BEFORE_FIRST_ASK) return false;
  if (state.lastAskIndex >= 0 && index - state.lastAskIndex < MIN_GAP_BETWEEN_ASKS) return false;

  // Hésitation explicite du recommandeur : le meilleur signal possible, il
  // prime sur l'heuristique de silence.
  const hesitating = confidence > 0 && confidence < HESITATION_CEILING;
  if (hesitating) return true;

  return state.silentStreak >= SILENT_STREAK_BEFORE_ASK;
}

/** Le compteur de silence repart de zéro dès que l'utilisateur agit. */
export function afterInteraction(state: AlgoCheckState): AlgoCheckState {
  return { ...state, silentStreak: 0 };
}

/** Un tweet de plus parcouru sans rien faire. */
export function afterSilentView(state: AlgoCheckState): AlgoCheckState {
  return { ...state, silentStreak: state.silentStreak + 1 };
}

/** La question vient d'être posée à cet endroit. */
export function afterAsk(state: AlgoCheckState, index: number, tweetId: string): AlgoCheckState {
  const answered = new Set(state.answered);
  answered.add(tweetId);
  return {
    lastAskIndex: index,
    asksThisSession: state.asksThisSession + 1,
    // Répondre EST une interaction : le compteur repart, sinon la question
    // suivante se déclencherait immédiatement après celle-ci.
    silentStreak: 0,
    answered,
  };
}
