/**
 * Mention « untel a retweeté », quand ils sont plusieurs.
 *
 * ── Pourquoi ──
 * Quand trois comptes suivis retweetent le même tweet, l'API n'envoie plus
 * trois lignes identiques mais UNE, accompagnée de la liste de ceux qui l'ont
 * retweeté (voir `attachRetweeters` dans `api/src/routes/neuralRankRoutes.js`).
 * Reste à l'écrire.
 *
 * ── Les règles d'écriture ──
 * On nomme jusqu'à trois personnes, puis on compte. Nommer est toujours plus
 * utile que compter — « @gas » dit quelque chose, « 3 personnes » non — mais
 * au-delà de trois noms la ligne déborde et se fait tronquer, ce qui perd
 * justement les noms. Le seuil est là, pas ailleurs.
 *
 * On ne nomme QUE des comptes suivis : l'API ne renvoie qu'eux. « @inconnu et
 * 400 autres » n'apprendrait rien, et le total des retweets est déjà affiché
 * sous le tweet.
 */

export interface Retweeter {
  id: string;
  username: string;
  full_name?: string;
  avatar?: string | null;
  verified?: boolean;
}

/** Au-delà, on cesse de nommer et on compte. */
const MAX_NAMED = 3;

/**
 * Construit la mention complète, verbe accordé.
 *
 * @param verb participe passé — « retweeté » (fil normal) ou « reposté » (2B).
 *             Les deux fils n'emploient pas le même mot, délibérément.
 */
export function retweetersLabel(people: Retweeter[], verb: string): string | null {
  const names = people
    .map((person) => person?.username)
    .filter((username): username is string => typeof username === 'string' && username.length > 0);

  if (names.length === 0) return null;

  const handles = names.map((username) => `@${username}`);

  if (handles.length === 1) return `${handles[0]} a ${verb}`;

  if (handles.length <= MAX_NAMED) {
    // « @a et @b ont », « @a, @b et @c ont » — la virgule sépare, le « et »
    // ferme. Une liste qui se termine par une virgule se lit comme tronquée.
    const last = handles[handles.length - 1];
    const head = handles.slice(0, -1).join(', ');
    return `${head} et ${last} ont ${verb}`;
  }

  const shown = handles.slice(0, MAX_NAMED - 1).join(', ');
  const others = handles.length - (MAX_NAMED - 1);
  return `${shown} et ${others} autres ont ${verb}`;
}

/**
 * Liste à afficher pour un tweet, quelle que soit la version de l'API.
 *
 * Un client à jour reçoit `retweeters`. Un serveur qui ne l'envoie pas encore
 * — ou un chemin de feed qui ne passe pas par le recommandeur — laisse
 * l'auteur de la ligne, qui EST le retweeteur. Sans ce repli, la mention
 * disparaîtrait purement et simplement de ces tweets.
 */
export function retweetersOf(tweet: any): Retweeter[] {
  const list = Array.isArray(tweet?.retweeters) ? tweet.retweeters : null;
  if (list && list.length > 0) return list;
  return tweet?.author?.username ? [tweet.author as Retweeter] : [];
}

/**
 * Deux listes de retweeteurs se valent si elles nomment les mêmes comptes dans
 * le même ordre. Comparer les seuls pseudos suffit : c'est tout ce que la
 * mention affiche.
 *
 * Sert aux comparateurs `React.memo` des deux lignes de fil. Sans elle, une
 * ligne garderait son ancienne mention après un rafraîchissement : le tweet
 * n'a pas changé d'identité, donc rien d'autre ne la ferait rejouer.
 */
export function sameRetweeters(a?: any[] | null, b?: any[] | null): boolean {
  const left = Array.isArray(a) ? a : [];
  const right = Array.isArray(b) ? b : [];
  if (left.length !== right.length) return false;
  return left.every((person, index) => person?.username === right[index]?.username);
}
