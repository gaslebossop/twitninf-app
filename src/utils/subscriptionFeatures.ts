import type { SubscriptionTier } from './subscriptionTier';

/**
 * Catalogue des avantages de l'abonnement — source de vérité de l'offre.
 *
 * ⚠ DOIT rester aligné sur `twitninf-windows/src/data/subscriptionFeatures.ts`.
 * Les deux applications vendent le même abonnement : une divergence, et un
 * utilisateur paie sur PC pour un avantage que le mobile ne lui annonce pas.
 *
 * Les listes précédentes étaient recopiées à la main dans quatre fichiers, et
 * elles avaient déjà décroché : aucune ne mentionnait les tweets longs, les
 * brouillons, les frais réduits, le meilleur créneau ni le mode hors ligne.
 * D'où ce catalogue unique, que les écrans se contentent de rendre.
 *
 * `minTier` porte la seule règle qui compte : ce que chaque palier débloque.
 */

export interface SubscriptionFeature {
  /** Nom d'icône Ionicons. */
  icon: string;
  title: string;
  /** Une phrase, orientée bénéfice — pas une description technique. */
  text: string;
  minTier: 'plus' | 'pro';
  /** Mis en avant dans le comparatif court. */
  highlight?: boolean;
}

export const SUBSCRIPTION_FEATURES: SubscriptionFeature[] = [
  // ── Écriture ──────────────────────────────────────────────────────────
  {
    icon: 'document-text',
    title: 'Tweets longs',
    text: 'Jusqu\'à 1 000 caractères au lieu de 280, pour développer une idée.',
    minTier: 'plus',
    highlight: true,
  },
  {
    icon: 'bookmark',
    title: 'Brouillons',
    text: 'Garde tes tweets commencés et reprends-les quand tu veux.',
    minTier: 'plus',
    highlight: true,
  },
  {
    icon: 'time',
    title: 'Meilleur moment pour publier',
    text: 'On te prévient à l\'heure où ton audience est la plus réactive.',
    minTier: 'plus',
    highlight: true,
  },

  // ── Économie ──────────────────────────────────────────────────────────
  {
    icon: 'pricetag',
    title: 'Frais de virement divisés par deux',
    text: '10 % au lieu de 20 % sur chaque transfert, à vie tant que tu es abonné.',
    minTier: 'plus',
    highlight: true,
  },
  {
    icon: 'cash',
    title: 'Monétisation et boosts',
    text: 'Gagne sur tes tweets et pousse ceux qui méritent d\'être vus.',
    minTier: 'plus',
  },
  {
    icon: 'stats-chart',
    title: 'Stats créateur',
    text: 'Vues et engagement : comprends ce qui fonctionne vraiment.',
    minTier: 'plus',
  },

  // ── Identité ──────────────────────────────────────────────────────────
  {
    icon: 'color-palette',
    title: 'Profil signature',
    text: 'Thème, bannière et couleurs qui habillent toute ta page.',
    minTier: 'plus',
    highlight: true,
  },
  {
    icon: 'diamond',
    title: 'Badge à côté du pseudo',
    text: 'Une pastille qui te suit partout, accordée à ta certification.',
    minTier: 'plus',
  },
  {
    icon: 'sparkles',
    title: 'Parure animée',
    text: 'Contour de photo, effets et arrière-plans en mouvement.',
    minTier: 'plus',
  },
  {
    icon: 'eye-off',
    title: 'Fil sans publicité',
    text: 'Un parcours plus propre, du début à la fin.',
    minTier: 'plus',
  },

  // ── Réservé au palier Pro ─────────────────────────────────────────────
  {
    icon: 'cloud-offline',
    title: 'Mode hors ligne',
    text: 'Lis ton fil sans réseau ; tes tweets, likes et réponses partent au retour.',
    minTier: 'pro',
    highlight: true,
  },
  {
    icon: 'star',
    title: 'Badges et effets Pro',
    text: 'Étoile, trophée, planète et le pack visuel le plus complet.',
    minTier: 'pro',
    highlight: true,
  },
  {
    icon: 'rocket',
    title: 'Nouveautés en avant-première',
    text: 'Les fonctionnalités en bêta arrivent chez toi d\'abord.',
    minTier: 'pro',
    highlight: true,
  },
];

/** Avantages inclus dans un palier donné. */
export function featuresFor(tier: 'plus' | 'pro'): SubscriptionFeature[] {
  return tier === 'pro'
    ? SUBSCRIPTION_FEATURES
    : SUBSCRIPTION_FEATURES.filter((f) => f.minTier === 'plus');
}

/** Ce que Pro ajoute par rapport à Plus — l'argument de la mise à niveau. */
export const PRO_ONLY_FEATURES = SUBSCRIPTION_FEATURES.filter((f) => f.minTier === 'pro');

/** Sélection courte pour le tableau comparatif (colonnes Gratuit / Plus / Pro). */
export const COMPARE_FEATURES = SUBSCRIPTION_FEATURES.filter((f) => f.highlight);

/** Un palier donne-t-il accès à cet avantage ? */
export function tierUnlocks(tier: SubscriptionTier, feature: SubscriptionFeature): boolean {
  if (tier === 'pro') return true;
  if (tier === 'plus') return feature.minTier === 'plus';
  return false;
}

export const TRUST_POINTS: { icon: string; text: string }[] = [
  { icon: 'shield-checkmark', text: 'Prix verrouillé au moment de l\'achat' },
  { icon: 'calendar-outline', text: 'Sans reconduction automatique' },
  { icon: 'flash', text: 'Tous les avantages actifs immédiatement' },
];
