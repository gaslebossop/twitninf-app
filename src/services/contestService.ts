import { apiService } from './api';

/**
 * Concours : une cagnotte attachée à un tweet, des conditions à remplir, un
 * tirage automatique à l'échéance.
 *
 * Miroir de `api/src/routes/contestRoutes.js`. Trois choses à garder en tête
 * en lisant l'app :
 *
 * - **La cagnotte est prélevée d'avance.** À la création, `montant ×
 *   gagnants` quitte le portefeuille de l'organisateur et attend à la
 *   trésorerie ; au tirage, chaque gagnant est crédité automatiquement et la
 *   part non attribuée revient à l'organisateur. C'est ce qui rend le
 *   concours crédible, et l'écran doit le dire — sinon on croit à une simple
 *   promesse.
 * - **Les monnaies viennent du catalogue**, jamais d'une saisie libre :
 *   `fetchCurrencies` renvoie NF, l'EUR interne et les monnaies
 *   communautaires actives, avec le solde. Une devise inventée serait une
 *   somme que personne ne peut verser.
 * - **`missing_conditions` est la vérité affichable.** Quand le serveur
 *   refuse une participation, il renvoie la liste de ce qu'il reste à faire :
 *   c'est cette liste qu'on montre, jamais un « conditions non remplies »
 *   générique.
 * - **Le concours n'est pas dans la charge utile du fil.** Le fil est servi
 *   par plusieurs moteurs (Node et Rust) ; la carte le récupère donc à part,
 *   via `fetchByTweet`, uniquement pour les tweets de type `concours`.
 */

const BASE = '/api/contests';

export class ContestError extends Error {
  code?: string;
  /** Renseigné quand le refus vient de conditions non remplies. */
  missing?: ContestCondition[];

  constructor(message: string, code?: string, missing?: ContestCondition[]) {
    super(message);
    this.name = 'ContestError';
    this.code = code;
    this.missing = missing;
  }
}

export type ContestStatus = 'open' | 'drawing' | 'closed' | 'cancelled';

export interface ContestCondition {
  key: string;
  label: string;
}

/** Ce que le créateur exige pour participer. Tout à `false`/`0` = libre. */
export interface ContestConditions {
  follow_creator: boolean;
  like_tweet: boolean;
  retweet_tweet: boolean;
  reply_tweet: boolean;
  min_account_age_days: number;
  min_followers: number;
}

export interface ContestUser {
  id: string;
  username: string;
  full_name?: string | null;
  avatar?: string | null;
  verified?: boolean;
}

export interface ContestEntry {
  id: string;
  user_id: string;
  status: 'pending' | 'eligible' | 'rejected';
  rejected_reason?: string | null;
  is_winner: boolean;
  rank?: number | null;
  entered_at: string;
  user?: ContestUser;
}

/** Une monnaie proposée pour la cagnotte, avec le solde de l'utilisateur. */
export interface ContestCurrency {
  id: string;
  name: string;
  symbol: string;
  color?: string | null;
  icon?: string | null;
  balance: number;
  is_community: boolean;
  price_eur: number;
}

export type EscrowStatus = 'none' | 'held' | 'paid' | 'refunded';

export interface Contest {
  id: string;
  tweet_id: string;
  creator_id: string;
  title?: string | null;
  /** Gain PAR gagnant. */
  prize_amount: string | number;
  prize_currency: string;
  currency_id?: string | null;
  /** Où en est l'argent. `none` = ancien concours, purement déclaratif. */
  escrow?: { status: EscrowStatus; total: string | number; is_funded: boolean };
  prize_note?: string | null;
  winners_count: number;
  conditions: ContestConditions;
  ends_at: string;
  status: ContestStatus;
  entries_count: number;
  drawn_at?: string | null;
  cancelled_reason?: string | null;
  /** Empreinte de la graine, publiée dès la création. */
  seed_commitment: string;
  /** Graine révélée — présente uniquement une fois le tirage effectué. */
  draw_seed?: string;
  creator?: ContestUser;
  tweet?: { id: string; content: string; media_urls?: string[]; created_at: string };
  viewer: {
    is_owner: boolean;
    is_participating: boolean;
    entry_status: 'pending' | 'eligible' | 'rejected' | null;
    is_winner: boolean;
    rank: number | null;
    rejected_reason: string | null;
    can_participate: boolean;
    missing_conditions: ContestCondition[];
  };
  winners: ContestEntry[];
}

function unwrap(response: any, fallback: string) {
  if (response?.success) return response.data;
  throw new ContestError(response?.message || fallback, response?.code, response?.missing);
}

/** Monnaies utilisables, avec le solde — à appeler avant d'ouvrir le formulaire. */
export async function fetchCurrencies(): Promise<{
  currencies: ContestCurrency[];
  min_prize: number;
}> {
  const response = await apiService.get(`${BASE}/currencies`);
  return unwrap(response, 'Monnaies indisponibles.');
}

/**
 * Publie le concours ET prélève la cagnotte, en une seule opération côté
 * serveur : un refus (solde insuffisant, anti-fraude) ne publie aucun tweet.
 */
export async function createContest(params: {
  content: string;
  prizeAmount: number;
  currencyId: string;
  prizeNote?: string | null;
  title?: string | null;
  winnersCount: number;
  endsAt: Date;
  conditions: Partial<ContestConditions>;
  mediaUrls?: string[];
}): Promise<{ tweet: any; contest: Contest; remaining_balance?: number }> {
  const response = await apiService.post(BASE, {
    content: params.content,
    prize_amount: params.prizeAmount,
    currency_id: params.currencyId,
    prize_note: params.prizeNote ?? null,
    title: params.title ?? null,
    winners_count: params.winnersCount,
    ends_at: params.endsAt.toISOString(),
    conditions: params.conditions,
    media_urls: params.mediaUrls ?? [],
  });
  return unwrap(response, 'Création du concours impossible.');
}

export async function fetchContest(contestId: string): Promise<Contest> {
  const response = await apiService.get(`${BASE}/${contestId}`);
  return unwrap(response, 'Concours indisponible.');
}

/** Utilisé par la carte du fil : retrouve le concours porté par un tweet. */
export async function fetchByTweet(tweetId: string): Promise<Contest | null> {
  try {
    const response = await apiService.get(`${BASE}/by-tweet/${tweetId}`);
    return unwrap(response, 'Concours indisponible.');
  } catch (error) {
    // Un tweet sans concours n'est pas une erreur à remonter à l'écran : la
    // carte se contente alors de ne rien afficher de particulier.
    return null;
  }
}

export async function listOpenContests(limit = 20): Promise<Contest[]> {
  const response = await apiService.get(`${BASE}?limit=${limit}`);
  return unwrap(response, 'Liste des concours indisponible.');
}

/**
 * Participe. Lève une `ContestError` avec `missing` renseigné quand il reste
 * des conditions à remplir — c'est le cas normal, pas une panne.
 */
export async function participate(contestId: string): Promise<{ entries_count: number }> {
  const response = await apiService.post(`${BASE}/${contestId}/participate`, {});
  if (!response?.success) {
    throw new ContestError(
      response?.message || 'Participation impossible.',
      response?.code,
      response?.missing
    );
  }
  return response.data ?? { entries_count: 0 };
}

export async function withdraw(contestId: string): Promise<{ entries_count: number }> {
  const response = await apiService.delete(`${BASE}/${contestId}/participate`);
  return unwrap(response, 'Retrait impossible.');
}

export async function fetchWinners(contestId: string): Promise<{
  drawn: boolean;
  drawn_at?: string;
  winners: ContestEntry[];
  proof?: { seed: string; seed_commitment: string; algorithm: string };
}> {
  const response = await apiService.get(`${BASE}/${contestId}/winners`);
  return unwrap(response, 'Gagnants indisponibles.');
}

export async function fetchParticipants(contestId: string): Promise<ContestEntry[]> {
  const response = await apiService.get(`${BASE}/${contestId}/participants`);
  return unwrap(response, 'Participants indisponibles.');
}

export async function cancelContest(contestId: string, reason?: string): Promise<Contest> {
  const response = await apiService.post(`${BASE}/${contestId}/cancel`, { reason });
  return unwrap(response, 'Annulation impossible.');
}

// ---------------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------------

/** « 250 EUR », « 5000 XAF » — le code de devise est libre côté serveur. */
export function formatAmount(value: number | string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '?';
  // Les montants sont stockés en DECIMAL(20,8) : « 250.00000000 » sur une
  // carte de fil est illisible. On coupe les zéros de fin sans jamais
  // arrondir vers le haut un solde réel.
  return Number.isInteger(amount)
    ? amount.toLocaleString('fr-FR')
    : amount.toLocaleString('fr-FR', { maximumFractionDigits: 8 });
}

export function formatPrize(contest: Pick<Contest, 'prize_amount' | 'prize_currency'>): string {
  return `${formatAmount(contest.prize_amount)} ${contest.prize_currency}`;
}

/**
 * Temps restant en clair. Renvoie `null` une fois l'échéance passée — l'appelant
 * affiche alors l'état réel du concours (tirage en cours, terminé) plutôt
 * qu'un compte à rebours négatif.
 */
export function formatTimeLeft(endsAt: string): string | null {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;

  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ${minutes % 60 ? `${minutes % 60} min` : ''}`.trim();
  const days = Math.floor(hours / 24);
  return `${days} j ${hours % 24 ? `${hours % 24} h` : ''}`.trim();
}

/** Libellés des conditions, pour les afficher avant même de participer. */
export function describeConditions(conditions: ContestConditions | undefined): string[] {
  if (!conditions) return [];
  const out: string[] = [];
  if (conditions.follow_creator) out.push("Suivre l'organisateur");
  if (conditions.like_tweet) out.push('Aimer le tweet');
  if (conditions.retweet_tweet) out.push('Retweeter');
  if (conditions.reply_tweet) out.push('Répondre au tweet');
  if (conditions.min_account_age_days > 0) {
    out.push(`Compte de plus de ${conditions.min_account_age_days} jour(s)`);
  }
  if (conditions.min_followers > 0) {
    out.push(`Au moins ${conditions.min_followers} abonné(s)`);
  }
  return out;
}
