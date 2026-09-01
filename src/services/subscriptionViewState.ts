import { colors } from '../theme';
import {
  SUBSCRIPTION_FEATURES,
  ULTRA_ONLY_FEATURES,
  TRUST_POINTS,
  type SubscriptionFeature,
} from '../utils/subscriptionFeatures';
import {
  isSubscriptionActiveFor,
  subscriptionRemainingLabel,
  type SubscriptionTier,
} from '../utils/subscriptionTier';
import type { SubscriptionPricing } from './subscriptionPricingService';

/**
 * Assemble ce que la page d'abonnement affiche.
 *
 * ── Pourquoi ce fichier existe ──
 * La page servie en WebView ne sait rien : elle n'a ni jeton, ni accès à
 * l'API, ni catalogue. Tout ce qu'elle montre vient d'ici, poussé par l'écran
 * qui l'héberge (voir `screens/SubscriptionScreen.tsx`).
 *
 * ── D'où vient le contenu ──
 * De `subscriptionFeatures.ts`, et de nulle part ailleurs. C'est la source
 * unique de l'offre, partagée avec la feuille de paiement et l'app Windows :
 * recopier les avantages ici les ferait diverger, et quelqu'un finirait par
 * payer pour un avantage qu'un écran annonce et qu'un autre ignore.
 */

export type Tier = 'free' | 'plus' | 'pro' | 'ultra';

const RANK: Record<Tier, number> = { free: 0, plus: 1, pro: 2, ultra: 3 };

interface Benefit {
  icon: string;
  title: string;
  text: string;
  owned?: boolean;
}

interface Group {
  title: string;
  items: Benefit[];
}

interface Plan {
  tier: Tier;
  name: string;
  priceLabel: string;
  priceNf: number | null;
  durationDays: number;
  tagline: string;
  groups: Group[];
}

/**
 * Le renouvellement automatique, tel que la page l'affiche.
 *
 * `available` est faux tant que la table `subscription_mandates` n'a pas été
 * posée en base : l'interrupteur est alors masqué, plutôt que de proposer une
 * bascule qui échouerait.
 */
export interface MandateView {
  available: boolean;
  enabled: boolean;
  state: 'ACTIVE' | 'DUNNING' | 'GRACE' | 'DEFAULTED' | null;
  /** Déjà formatée : la page ne manipule aucune date. */
  nextChargeLabel: string | null;
  /** Prix de la prochaine échéance, en NF, au cours du moment. */
  priceNf: number | null;
  /** Vrai quand un prélèvement a échoué : la page le dit explicitement. */
  unpaid: boolean;
  /**
   * Le palier sur lequel le mandat se reconduira. Égal au palier courant en
   * temps normal ; INFÉRIEUR quand une rétrogradation est programmée à
   * l'échéance. La page s'en sert pour marquer le palier cible dans les offres.
   */
  renewsAs: Tier | null;
}

export interface SubscriptionViewState {
  currentTier: Tier;
  expiresAt: string | null;
  balanceNf: number;
  plans: Plan[];
  comparisons: { label: string; values: Partial<Record<Tier, string>> }[];
  trust: { icon: string; text: string }[];
  mandate: MandateView;
  palette: Record<string, string>;
  theme: 'dark' | 'light';
  insets: { top: number; bottom: number };
}

/**
 * Regroupement des avantages par ce qu'ils servent.
 *
 * Le catalogue est une liste à plat, dans l'ordre où les avantages sont
 * arrivés. Sur une page qui doit CONVAINCRE, cet ordre ne veut rien dire —
 * d'où ce classement, tenu ici et pas dans le catalogue, qui reste la liste de
 * référence pour les autres écrans.
 */
const GROUP_OF_ICON: Record<string, string> = {
  // Argent
  swap: 'Ton argent', pricetag: 'Ton argent', cash: 'Ton argent',
  'lock-closed': 'Ton argent', 'lock-open': 'Ton argent',
  megaphone: 'Ton argent', 'megaphone-outline': 'Ton argent',
  briefcase: 'Ton argent', at: 'Ton argent', 'swap-horizontal': 'Ton argent',
  // Publier
  'document-text': 'Publier', bookmark: 'Publier', time: 'Publier',
  create: 'Publier', mic: 'Publier', images: 'Publier',
  'cloud-upload': 'Publier', text: 'Publier', 'play-circle': 'Publier',
  'sparkles-outline': 'Publier',
  // Outils
  bulb: 'Tes outils', 'trending-up': 'Tes outils', 'stats-chart': 'Tes outils',
  flask: 'Tes outils', 'git-compare': 'Tes outils', flash: 'Tes outils',
  headset: 'Tes outils', chatbubbles: 'Tes outils',
  'chatbubble-ellipses': 'Tes outils', rocket: 'Tes outils',
  'cloud-offline': 'Tes outils', map: 'Tes outils', albums: 'Tes outils',
  // Protection et visibilité
  'shield-checkmark': 'Ta protection', 'shield-half': 'Ta protection',
  'eye-off': 'Ta protection', flag: 'Ta protection', search: 'Ta protection',
  eye: 'Ta protection',
  // Identité
  'color-palette': 'Ton identité', diamond: 'Ton identité',
  sparkles: 'Ton identité', star: 'Ton identité', heart: 'Ton identité',
  'heart-circle': 'Ton identité', 'id-card': 'Ton identité',
  trophy: 'Ton identité',
};

const GROUP_ORDER = [
  'Ton argent',
  'Publier',
  'Tes outils',
  'Ta protection',
  'Ton identité',
  'Autres avantages',
];

function groupFeatures(features: SubscriptionFeature[], ownedTier: Tier, planTier: Tier): Group[] {
  const buckets = new Map<string, Benefit[]>();
  for (const feature of features) {
    const title = GROUP_OF_ICON[feature.icon] ?? 'Autres avantages';
    if (!buckets.has(title)) buckets.set(title, []);
    buckets.get(title)!.push({
      icon: feature.icon,
      title: feature.title,
      text: feature.text,
      // Un avantage est « déjà actif » quand le palier du compte l'inclut
      // ET que le palier regardé n'est pas au-dessus de ce qu'on a.
      owned: RANK[ownedTier] >= RANK[planTier],
    });
  }
  return GROUP_ORDER.filter((title) => buckets.has(title)).map((title) => ({
    title,
    items: buckets.get(title)!,
  }));
}

/**
 * Comparatif chiffré.
 *
 * Écrit ici plutôt que déduit du catalogue : les valeurs par palier ne sont
 * pas dans `subscriptionFeatures.ts`, qui décrit des avantages en prose. Les
 * chiffres doivent rester alignés sur les constantes serveur — chaque ligne
 * porte donc le nom de celle qui fait autorité.
 */
const COMPARISONS: SubscriptionViewState['comparisons'] = [
  // P2P_TRANSFER_FEE_RATE* (api/src/economy/constants.js)
  { label: 'Frais de virement', values: { free: '20 %', plus: '10 %', pro: '10 %', ultra: '0 %' } },
  // PLATFORM_CONTENT_FEE_RATE* (api/src/constants/premiumMarket.js)
  { label: 'Part sur une vente', values: { pro: '70 %', ultra: '80 %' } },
  // TWEET_MAX_CHARS_* (api/src/utils/tweetLimits.js)
  { label: 'Signes par tweet', values: { free: '280', plus: '1 000', pro: '1 000', ultra: '2 500' } },
  // MAX_IMAGES_PER_TWEET* (api/src/services/tweetImageService.js)
  { label: 'Images par tweet', values: { free: '4', plus: '4', pro: '4', ultra: '8' } },
  // MAX_DURATION_SECONDS* (api/src/services/tweetAudioService.js)
  { label: 'Vocal', values: { free: '2 min', plus: '2 min', pro: '2 min', ultra: '5 min' } },
  // PROFILE_VIEW_WINDOW_DAYS* (api/src/constants/premiumMarket.js)
  { label: 'Visiteurs du profil', values: { plus: '7 j', pro: '7 j', ultra: '30 j' } },
  // SCHEDULE_MAX_PENDING* (api/src/constants/premiumMarket.js)
  { label: 'Programmation', values: { plus: '50', pro: '50', ultra: '200' } },
  // SUPER_HEART_CAPS (api/src/utils/superHeartHelpers.js)
  { label: 'Super Cœurs', values: { plus: '3', pro: '10', ultra: '25' } },
  // MAX_OPEN_TICKETS_* (api/src/routes/supportRoutes.js)
  { label: 'Tickets de support', values: { free: '1', plus: '1', pro: '5', ultra: '20' } },
];

const TAGLINES: Record<Exclude<Tier, 'free'>, string> = {
  plus: 'Pour écrire mieux et voir ce qui marche. Tweets longs, brouillons, programmation, et des frais de virement divisés par deux.',
  pro: 'Pour vendre et mesurer. Tout ce que Plus donne, plus la vente à l’unité, le mode hors ligne et les outils prédictifs.',
  ultra: 'Pour ceux qui vivent de leur compte. Zéro commission sur tes virements, 80 % de tes ventes, et des outils que personne d’autre n’a.',
};

/** Les jetons de couleur que la page utilise, tels quels. */
function palette(): Record<string, string> {
  return {
    bg: colors.bg,
    surface: colors.surface,
    'surface-alt': colors.surfaceAlt,
    'surface-elevated': colors.surfaceElevated,
    border: colors.border,
    hairline: colors.hairline,
    edge: colors.overlaySoft,
    text: colors.textPrimary,
    'text-secondary': colors.textSecondary,
    'text-muted': colors.textMuted,
    accent: colors.accent,
    'accent-bright': colors.accentBright,
    'accent-glow': colors.accentGlow,
    'accent-soft': colors.accentSoft,
    'on-accent': colors.onAccent,
    gold: colors.gold,
    success: colors.success,
  };
}

/** Prix affiché pour un palier, tel que le serveur le facturera. */
function priceOf(tier: Exclude<Tier, 'free'>, pricing: SubscriptionPricing) {
  if (tier === 'ultra') {
    return { label: `${pricing.ultra.nf} NF`, nf: pricing.ultra.nf };
  }
  const entry = pricing[tier];
  // Sans cours du NF, on n'invente pas de montant : la page affiche « — » et
  // l'achat reste possible, le serveur recalculant de toute façon le prix.
  return { label: entry.live ? `${entry.eur} €` : '—', nf: null };
}

/** L'état brut du mandat, tel que `GET /api/users/subscription-mandate` le rend. */
export interface MandatePayload {
  available?: boolean;
  enabled?: boolean;
  state?: string | null;
  /** Palier de reconduction. Peut différer du palier courant (rétrogradation). */
  tier?: string | null;
  nextChargeAt?: string | null;
  priceNf?: number | null;
}

const TIER_NAME: Record<Exclude<Tier, 'free'>, string> = {
  plus: 'Plus',
  pro: 'Pro',
  ultra: 'Ultra',
};

/**
 * « Se renouvelle le 6 septembre ».
 *
 * Un compte sous mandat a `subscription_expires_at = null`, ce que
 * `subscriptionRemainingLabel` traduit par « Sans échéance sur ce compte ».
 * C'est exact mais illisible : ce qui intéresse la personne, c'est la date du
 * prochain prélèvement, qui vit dans le mandat et nulle part ailleurs.
 */
function formatDay(iso?: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

function nextChargeLabel(iso?: string | null): string | null {
  const day = formatDay(iso);
  return day ? `Se renouvelle le ${day}` : null;
}

/**
 * « Passe à Plus le 6 septembre » — quand une rétrogradation est programmée.
 * On dit le palier cible ET la date : c'est un changement à venir, pas un
 * simple renouvellement.
 */
function downgradeLabel(iso: string | null | undefined, targetName: string): string | null {
  const day = formatDay(iso);
  return day ? `Passe à ${targetName} le ${day}` : `Passe bientôt à ${targetName}`;
}

export function buildSubscriptionViewState(params: {
  tier: SubscriptionTier;
  expiresAt?: string | Date | null;
  balanceNf: number;
  pricing: SubscriptionPricing;
  mandate?: MandatePayload | null;
  theme: 'dark' | 'light';
  insets: { top: number; bottom: number };
}): SubscriptionViewState {
  const { tier, expiresAt, balanceNf, pricing, mandate, theme, insets } = params;
  const active = isSubscriptionActiveFor(tier, expiresAt) ? (tier as Tier) : 'free';

  const plusFeatures = SUBSCRIPTION_FEATURES.filter((f) => f.minTier === 'plus');
  const proFeatures = SUBSCRIPTION_FEATURES.filter((f) => f.minTier === 'pro');

  const plans: Plan[] = (['plus', 'pro', 'ultra'] as const).map((planTier) => {
    const price = priceOf(planTier, pricing);
    const features =
      planTier === 'plus' ? plusFeatures : planTier === 'pro' ? proFeatures : ULTRA_ONLY_FEATURES;
    return {
      tier: planTier,
      name: planTier === 'plus' ? 'Plus' : planTier === 'pro' ? 'Pro' : 'Ultra',
      priceLabel: price.label,
      priceNf: price.nf,
      durationDays: pricing.duration_days,
      tagline: TAGLINES[planTier],
      groups: groupFeatures(features, active, planTier),
    };
  });

  const mandateEnabled = !!mandate?.enabled && active !== 'free';
  // Le palier de reconduction. En temps normal égal au palier courant ; plus
  // bas quand une rétrogradation a été programmée à l'échéance.
  const renewsAs =
    mandateEnabled && mandate?.tier && mandate.tier !== 'free' ? (mandate.tier as Tier) : null;
  const downgradeScheduled = !!renewsAs && RANK[renewsAs] < RANK[active];
  const renewLabel = !mandateEnabled
    ? null
    : downgradeScheduled
      ? downgradeLabel(mandate?.nextChargeAt, TIER_NAME[renewsAs as Exclude<Tier, 'free'>])
      : nextChargeLabel(mandate?.nextChargeAt);

  return {
    currentTier: active,
    // Déjà formatée : la page ne manipule aucune date, et le format reste
    // celui que le reste de l'app emploie. Sous mandat, la date de fin
    // n'existe plus — on affiche la prochaine échéance à la place.
    expiresAt:
      active === 'free'
        ? null
        : renewLabel || subscriptionRemainingLabel(expiresAt) || null,
    balanceNf: Math.round(balanceNf),
    plans,
    comparisons: COMPARISONS,
    trust: TRUST_POINTS,
    mandate: {
      // L'interrupteur n'a de sens que sur un abonnement en cours : sur un
      // compte gratuit, il n'y a rien à reconduire.
      available: !!mandate?.available && active !== 'free',
      enabled: mandateEnabled,
      state: (mandate?.state as SubscriptionViewState['mandate']['state']) || null,
      nextChargeLabel: renewLabel,
      priceNf: mandate?.priceNf ?? null,
      unpaid: mandate?.state === 'DUNNING' || mandate?.state === 'GRACE',
      renewsAs,
    },
    palette: palette(),
    theme,
    insets,
  };
}
