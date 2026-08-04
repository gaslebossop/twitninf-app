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
 * contexte au-dessus (voir `format_thread` dans `services/recommender.rs`).
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

export default withoutOrphanReplies;
