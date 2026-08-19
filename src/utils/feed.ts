import type { Tweet } from '../types/api';

/**
 * Mise en forme du fil, côté client.
 *
 * Ces fonctions vivent hors de l'écran parce qu'elles sont de la logique pure :
 * c'est la seule partie du fil qu'on peut vérifier par un test, sans appareil
 * ni rendu.
 */

/**
 * Écarte les réponses privées de leur contexte.
 *
 * Une réponse lue seule est illisible : elle commence au milieu d'une phrase
 * qu'on n'a pas vue. « Complètement d'accord », « lol c'est exactement ça »,
 * « non mais il a raison » — sans le tweet auquel elles répondent, ce sont des
 * lignes vides de sens posées entre deux vrais tweets.
 *
 * Le recommandeur Rust traite déjà le problème de son côté : il écarte toute
 * réponse dont il ne peut pas reconstituer la chaîne d'ancêtres, et marque ces
 * ancêtres comme « à l'écran » en comptant sur le client pour les afficher en
 * contexte au-dessus (voir `shape_feed` dans `services/recommender.rs`).
 *
 * Sauf que le fil de l'API ne sérialise `thread_ancestors` que sur le DÉTAIL
 * d'un tweet (`GET /api/tweets/:id`), jamais dans la liste : le client n'a donc
 * jamais reçu de quoi rendre ce contexte, et affichait la réponse toute seule.
 * D'où ce garde-fou côté app — le seul endroit où l'on sait vraiment ce qui est
 * affiché à l'écran, et à quelle position.
 *
 * Règle appliquée : une réponse n'est gardée que si son parent est présent
 * JUSTE au-dessus d'elle. Pas « quelque part dans la liste » — trente tweets
 * plus haut, le contexte est perdu de la même façon.
 *
 * Le jour où le fil enverra `parentTweet` ou `thread_ancestors`, il n'y aura
 * rien à défaire ici : il suffira de rendre l'ancêtre en carte de contexte, et
 * la réponse cessera d'être orpheline au sens de cette fonction.
 */
export function withoutOrphanReplies(list: Tweet[]): Tweet[] {
  const out: Tweet[] = [];

  for (const tweet of list) {
    const parentId = (tweet as any)?.parent_tweet_id;
    if (!parentId) {
      out.push(tweet);
      continue;
    }

    // Un retweet ou une citation porte son contexte avec lui (`originalTweet`),
    // et une réponse livrée avec son parent (`parentTweet`) aussi : ce ne sont
    // pas des orphelines, même si `parent_tweet_id` est renseigné.
    const carriesOwnContext =
      !!(tweet as any).originalTweet ||
      !!(tweet as any).parentTweet ||
      !!(tweet as any).is_retweet ||
      !!(tweet as any).is_quote;
    if (carriesOwnContext) {
      out.push(tweet);
      continue;
    }

    const previous = out[out.length - 1];
    if (previous && String(previous.id) === String(parentId)) {
      out.push(tweet);
    }
    // Sinon : écartée. Mieux vaut un tweet de moins qu'une ligne hors sujet.
  }

  return out;
}

/**
 * Profondeur maximale d'un fil de discussion à l'écran.
 *
 * Alignée sur `MAX_THREAD_DEPTH` du recommandeur Rust (`shape_feed`), qui ne
 * sert jamais une chaîne plus longue : quatre tweets, donc des rangs 0 à 3.
 */
export const MAX_THREAD_DEPTH = 4;

/**
 * Rang d'un tweet dans son fil de discussion : 0 pour une racine, 1 pour sa
 * réponse, 2 pour la réponse de sa réponse…
 *
 * ── Pourquoi ça se calcule et ne se lit pas ──
 * Le fil ne transporte pas la chaîne d'ancêtres : l'API ne sérialise
 * `thread_ancestors` que sur le DÉTAIL d'un tweet, jamais dans la liste. Mais
 * `withoutOrphanReplies` (ci-dessus) garantit qu'une réponse gardée suit
 * IMMÉDIATEMENT son parent — le rang se lit donc en remontant la liste tant
 * que la chaîne tient, sans requête supplémentaire.
 *
 * ── À quoi ça sert à l'écran ──
 * Sans lui, une réponse de réponse se dessine exactement comme une réponse
 * simple : un fil de quatre paraît plat et on ne voit plus qui répond à qui.
 * C'est ce rang qui fait croître le retrait.
 *
 * Borné à `MAX_THREAD_DEPTH - 1` : la boucle fait au pire trois tours, ce qui
 * la rend sûre dans le chemin chaud du rendu d'une liste.
 */
export function threadDepthAt(list: Tweet[], index: number): number {
  let depth = 0;

  for (let i = index; i > 0 && depth < MAX_THREAD_DEPTH - 1; i--) {
    const child = list[i] as any;
    const above = list[i - 1];
    if (!child?.parent_tweet_id || !above) break;
    if (String(child.parent_tweet_id) !== String(above.id)) break;
    depth += 1;
  }

  return depth;
}

export default withoutOrphanReplies;
