/**
 * Attribution d'une part hebdomadaire aux publications qui l'ont portée.
 *
 * À LIRE AVANT DE S'EN SERVIR : le pot créateur ne paie PAS au tweet. Il
 * verse une part unique par semaine, calculée sur des vues qualifiées et un
 * score de qualité agrégés au niveau du compte — le serveur a d'ailleurs
 * retiré ses anciennes routes de paiement par tweet (`410 Gone`). Il n'existe
 * donc aucun montant réel par publication à afficher.
 *
 * Ce module produit une ESTIMATION : la part de la semaine répartie au
 * prorata des vues de chaque publication. Deux écarts assumés, que l'écran
 * doit écrire noir sur blanc plutôt que les taire :
 *
 * 1. les vues utilisées ici sont les vues brutes cumulées d'une publication,
 *    quand le pot compte des vues qualifiées sur la seule semaine en cours ;
 * 2. la fenêtre est celle demandée à `top-tweets` (7 jours glissants), pas la
 *    semaine du pot qui court de lundi à lundi.
 *
 * Le module est volontairement pur — aucun import réseau, aucun import React
 * Native — pour rester testable sous `node --test`.
 */

/** Ce que renvoie `GET /api/user-stats/:id/top-tweets`, en tolérant les variantes. */
export interface SourceTweet {
  id?: string | null;
  content?: string | null;
  views?: unknown;
  viewCount?: unknown;
  view_count?: unknown;
  likes?: unknown;
  retweets?: unknown;
  comments?: unknown;
  created_at?: string | null;
  createdAt?: string | null;
  [key: string]: unknown;
}

export interface ContentEarning {
  id: string;
  content: string;
  views: number;
  likes: number;
  retweets: number;
  comments: number;
  createdAt: string | null;
  /** Part des vues de la fenêtre, entre 0 et 1. */
  share: number;
  /** Montant estimé, dans la devise de la part répartie. */
  amount: number;
}

export interface EarningsSplit {
  rows: ContentEarning[];
  totalViews: number;
  /** `false` quand aucune vue n'a été mesurée : il n'y a rien à répartir. */
  hasData: boolean;
}

/** Tout ce qui vient du réseau passe par ici : jamais de `NaN` en sortie. */
function count(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Un extrait de publication tient sur deux lignes : les retours à la ligne sautent. */
function flatten(content: unknown): string {
  if (typeof content !== 'string') return '';
  return content.replace(/\s+/g, ' ').trim();
}

/**
 * Répartit `total` entre les publications, au prorata de leurs vues.
 *
 * Les entrées sans identifiant sont écartées — une ligne qu'on ne peut pas
 * ouvrir n'a rien à faire dans une liste tapable. Un total absent, négatif ou
 * non fini donne des montants nuls tout en conservant les parts de vues :
 * l'écran peut alors montrer la répartition sans annoncer d'argent.
 */
export function splitEarnings(tweets: SourceTweet[] | null | undefined, total: unknown): EarningsSplit {
  const source = Array.isArray(tweets) ? tweets : [];

  const cleaned = source
    .filter((t): t is SourceTweet => !!t && typeof t === 'object' && typeof t.id === 'string' && !!t.id)
    .map((t) => ({
      id: t.id as string,
      content: flatten(t.content),
      views: count(t.views ?? t.viewCount ?? t.view_count),
      likes: count(t.likes),
      retweets: count(t.retweets),
      comments: count(t.comments),
      createdAt: (typeof t.created_at === 'string' && t.created_at)
        || (typeof t.createdAt === 'string' && t.createdAt)
        || null,
    }));

  const totalViews = cleaned.reduce((acc, t) => acc + t.views, 0);
  const payable = Number.isFinite(Number(total)) && Number(total) > 0 ? Number(total) : 0;

  const rows: ContentEarning[] = cleaned
    .map((t) => {
      const share = totalViews > 0 ? t.views / totalViews : 0;
      return { ...t, share, amount: payable * share };
    })
    .sort((a, b) => b.amount - a.amount || b.views - a.views);

  return { rows, totalViews, hasData: totalViews > 0 };
}

export default splitEarnings;
