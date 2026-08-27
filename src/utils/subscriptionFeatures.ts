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
    title: 'Publications programmées',
    text: 'Écris quand tu veux, on publie à l\'heure choisie — ou au meilleur créneau de ton audience.',
    minTier: 'plus',
    highlight: true,
  },
  {
    icon: 'create',
    title: 'Modifier un tweet publié',
    text: '30 minutes pour corriger une faute, avec un historique consultable par tous.',
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

  {
    icon: 'at',
    title: 'Marché des pseudos',
    text: 'Réserve un nom d\'utilisateur libre, vends le tien ou rachète celui que tu veux.',
    minTier: 'plus',
    highlight: true,
  },

  // ── Renseignements ────────────────────────────────────────────────────
  {
    icon: 'eye',
    title: 'Qui a consulté ton profil',
    text: 'Les visiteurs des 7 derniers jours — et la possibilité de naviguer en discret.',
    minTier: 'plus',
    highlight: true,
  },
  {
    icon: 'shield-half',
    title: 'Alerte usurpation',
    text: 'On surveille les comptes qui copient ton pseudo, ta photo ou ta bio. Signalement en un tap.',
    minTier: 'plus',
    highlight: true,
  },
  {
    icon: 'flame',
    title: 'Alerte quand ton tweet décolle',
    text: 'Une notif dès qu\'un tweet va nettement plus vite que ton rythme habituel.',
    minTier: 'plus',
  },
  {
    icon: 'compass',
    title: 'Radar des comptes qui montent',
    text: 'Repère les comptes en croissance dans ton univers avant tout le monde.',
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
    icon: 'lock-closed',
    title: 'Vendre tes contenus à l\'unité',
    text: 'Verrouille un tweet, une story ou un replay derrière un prix : tu gardes 70 % de chaque vente.',
    minTier: 'pro',
    highlight: true,
  },
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
  {
    icon: 'trending-up',
    title: 'Analytics prédictifs',
    text: 'Avant de publier, on t\'estime la portée et l\'engagement probable de ton tweet. Et si un sujet proche du tien décolle en ce moment, une notif t\'arrive avec une idée de tweet prête à publier.',
    minTier: 'pro',
    highlight: true,
  },
  {
    icon: 'bulb',
    title: 'Co-pilote IA',
    text: 'Reformulation, ton et accroche suggérés en temps réel pendant que tu écris.',
    minTier: 'pro',
    highlight: true,
  },
  {
    icon: 'headset',
    title: 'Support prioritaire',
    text: 'Un ticket dédié, traité en priorité, pour toute question ou souci sur ton compte.',
    minTier: 'pro',
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

/** Un palier donne-t-il accès à cet avantage ? Ultra inclut tout ce que Pro donne. */
export function tierUnlocks(tier: SubscriptionTier, feature: SubscriptionFeature): boolean {
  if (tier === 'pro' || tier === 'ultra') return true;
  if (tier === 'plus') return feature.minTier === 'plus';
  return false;
}

/**
 * Avantages Ultra — palier séparé du catalogue Plus/Pro ci-dessus plutôt
 * qu'un troisième `minTier` : Ultra ne s'achète qu'en montée depuis Pro (pas
 * proposé dès l'inscription), donc rien ici ne doit apparaître dans le
 * tableau comparatif Gratuit/Plus/Pro ni dans la liste complète montrée à un
 * compte gratuit — ça n'aurait aucun sens pour quelqu'un qui ne peut pas
 * encore l'acheter.
 */
// `minTier: 'pro'` ici n'a rien à voir avec le palier réel (Ultra n'est
// jamais confondu avec Pro ailleurs) : c'est un pur drapeau de style, réutilisé
// tel quel par les mêmes lignes de rendu que Pro (icône couleur or, etc.) pour
// que la feuille n'ait pas besoin d'un troisième traitement visuel dupliqué.
export const ULTRA_ONLY_FEATURES: SubscriptionFeature[] = [
  {
    icon: 'search',
    title: 'Recherche prioritaire',
    text: 'Tes tweets remontent en premier dans les résultats, à pertinence égale.',
    minTier: 'pro',
  },
  {
    icon: 'megaphone',
    title: '100 € de crédit publicitaire',
    text: 'Reversés en NF sur ton portefeuille à chaque activation, pour booster tes publications.',
    minTier: 'pro',
  },
  {
    icon: 'flag',
    title: 'Strikes de diffusion',
    text: 'Bloque la diffusion d\'un tweet qui te vise, instantanément — contestable par son auteur.',
    minTier: 'pro',
  },
  {
    icon: 'shield-checkmark',
    title: 'Antifraude assoupli',
    text: 'Les transferts inhabituels mais légitimes passent plus facilement, sans blocage automatique.',
    minTier: 'pro',
  },
  {
    icon: 'eye-off',
    title: 'Immunité aux restrictions automatiques',
    text: 'Le système de réduction de portée automatique ne s\'applique pas à ton compte.',
    minTier: 'pro',
  },
  {
    icon: 'flash',
    title: 'API 15× plus permissive',
    text: '300 requêtes d\'écriture par minute au lieu de 20, pour les apps que tu connectes.',
    minTier: 'pro',
  },
];

export const TRUST_POINTS: { icon: string; text: string }[] = [
  { icon: 'shield-checkmark', text: 'Prix verrouillé au moment de l\'achat' },
  { icon: 'calendar-outline', text: 'Sans reconduction automatique' },
  { icon: 'flash', text: 'Tous les avantages actifs immédiatement' },
];
