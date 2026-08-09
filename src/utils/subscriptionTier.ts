/** Aligné sur l’API : free, plus, pro */

export type SubscriptionTier = 'free' | 'plus' | 'pro';

/**
 * Durée d'un abonnement, en jours.
 *
 * ⚠ Doit rester aligné sur `DEFAULT_DURATION_DAYS`
 * (`api/src/constants/subscriptionTiers.js`). Ne sert QU'AU REPLI d'affichage :
 * la valeur qui fait foi arrive dans `duration_days` de /subscription-pricing.
 */
export const SUBSCRIPTION_DURATION_DAYS = 5;

/**
 * Reste à courir sur un abonnement, en clair. Sans cette information, un
 * abonné voit « Membre Premium » sans jamais savoir quand ça s'arrête.
 */
export function subscriptionRemainingLabel(expiresAt?: string | Date | null): string {
  if (!expiresAt) return 'Sans échéance sur ce compte';
  const end = new Date(expiresAt);
  if (Number.isNaN(end.getTime())) return '';
  const msLeft = end.getTime() - Date.now();
  if (msLeft <= 0) return 'Abonnement terminé';
  const hoursLeft = Math.ceil(msLeft / 3600000);
  if (hoursLeft <= 24) return `Se termine dans ${hoursLeft} h`;
  const daysLeft = Math.ceil(msLeft / 86400000);
  const dateLabel = end.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  return `Encore ${daysLeft} jour${daysLeft > 1 ? 's' : ''} · jusqu'au ${dateLabel}`;
}

export const SUBSCRIPTION_PLUS_FEATURES: { icon: string; text: string }[] = [
  { icon: 'image-outline', text: 'Bannière de profil personnalisable' },
  { icon: 'sparkles', text: 'Contour animé autour de la photo (Plus / Pro)' },
  { icon: 'diamond-outline', text: 'Badge diamant à côté du pseudo' },
  { icon: 'trending-up', text: 'Une identité qui se remarque dans la timeline' },
  { icon: 'stats-chart', text: 'Stats créateur pour comprendre ce qui fonctionne' },
  { icon: 'cash-outline', text: 'Outils de monétisation et boosts de publications' },
  { icon: 'notifications-outline', text: 'Expérience plus propre, fluide et sans publicité' },
  { icon: 'heart-outline', text: 'Accès prioritaire aux prochaines nouveautés' },
];

export const SUBSCRIPTION_PRO_EXTRAS: { icon: string; text: string }[] = [
  { icon: 'star', text: 'Badge étoile Pro à côté du pseudo' },
  { icon: 'rocket', text: 'Nouveautés et bêta en avant-première' },
  { icon: 'flame', text: 'Le pack visuel le plus complet de TwitNinf' },
];

export function normalizedTier(raw?: string | null): SubscriptionTier {
  if (raw === 'plus' || raw === 'pro') return raw;
  return 'free';
}

export function tierRank(t: SubscriptionTier): number {
  if (t === 'pro') return 2;
  if (t === 'plus') return 1;
  return 0;
}

/** Anciens comptes : premium sans palier explicite → accès complet (Pro). */
export function effectiveSubscriptionTier(premium: boolean, tier?: string | null): SubscriptionTier {
  const n = normalizedTier(tier);
  if (n !== 'free') return n;
  return premium ? 'pro' : 'free';
}

export function canUseFeature(userTier: SubscriptionTier, required: 'plus' | 'pro'): boolean {
  return tierRank(userTier) >= tierRank(required);
}

/**
 * Frais sur les virements P2P.
 *
 * ⚠ Doit rester aligné sur `api/src/economy/constants.js`
 * (`P2P_TRANSFER_FEE_RATE` / `P2P_TRANSFER_FEE_RATE_SUBSCRIBER`).
 * Ces valeurs ne servent QU'À L'AFFICHAGE de l'estimation avant envoi : le
 * taux réellement débité est recalculé par le serveur au moment de l'écriture,
 * jamais lu depuis le client.
 */
export const P2P_FEE_RATE_FREE = 0.2;
export const P2P_FEE_RATE_SUBSCRIBER = 0.1;

/**
 * Un abonnement expiré ne donne plus la remise — même règle que
 * `isSubscriptionActive` côté API. Sans cette vérification, l'app annoncerait
 * 10 % à un abonné dont l'abonnement vient d'expirer, et le serveur en
 * prélèverait 20 % : la mauvaise surprise porterait sur de l'argent.
 */
export function isSubscriptionActiveFor(
  tier: SubscriptionTier,
  expiresAt?: string | Date | null,
): boolean {
  if (tier === 'free') return false;
  if (!expiresAt) return true;
  return new Date(expiresAt) > new Date();
}

export function p2pFeeRate(tier: SubscriptionTier, expiresAt?: string | Date | null): number {
  return isSubscriptionActiveFor(tier, expiresAt) ? P2P_FEE_RATE_SUBSCRIBER : P2P_FEE_RATE_FREE;
}

/**
 * Longueur maximale d'un tweet.
 *
 * Les comptes certifiés n'ont pas de limite côté serveur (comportement
 * historique), mais l'éditeur en impose une : un champ sans plafond n'a plus
 * de compteur, donc plus aucun repère pendant la frappe. On leur applique la
 * limite des abonnés — ils la dépassent rarement, et le serveur les laissera
 * passer s'ils le font.
 *
 * ⚠ Doit rester aligné sur `api/src/utils/tweetLimits.js`.
 */
export const TWEET_MAX_CHARS_FREE = 280;
export const TWEET_MAX_CHARS_SUBSCRIBER = 1000;

export function tweetCharLimit(
  tier: SubscriptionTier,
  expiresAt?: string | Date | null,
  verified?: boolean,
): number {
  if (verified) return TWEET_MAX_CHARS_SUBSCRIBER;
  return isSubscriptionActiveFor(tier, expiresAt)
    ? TWEET_MAX_CHARS_SUBSCRIBER
    : TWEET_MAX_CHARS_FREE;
}
