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
 *
 * ⚠ Chaque entrée doit correspondre à une règle RÉELLEMENT appliquée par le
 * serveur. Les plafonds cités ici (2 500 caractères, 200 en file, 30 jours de
 * visiteurs, 20 tickets…) sont résolus par palier côté API — voir
 * `api/src/utils/ultraGate.js` et les constantes `*_ULTRA`. Une ligne ajoutée
 * ici sans son pendant serveur, et on vend quelque chose qui n'existe pas.
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
  /**
   * Existait dans l'app depuis toujours (`ContractsScreen`, `creatorContractService`
   * côté API) et n'était vendu nulle part : le seul avantage Ultra vraiment
   * TANGIBLE — celui qu'on utilise avec les doigts — n'apparaissait pas dans
   * l'argumentaire.
   */
  {
    icon: 'briefcase',
    title: 'Marketplace des créateurs',
    text: 'Tu apparais dans l\'annuaire des créateurs réservables, avec ton prix indicatif, et tu reçois les propositions de collaboration.',
    minTier: 'pro',
  },
  {
    icon: 'megaphone-outline',
    title: 'Notifier tes abonnés',
    text: 'À la publication, préviens tes abonnés avec ton propre message — ou n\'en préviens aucun.',
    minTier: 'pro',
  },

  // ── Argent ────────────────────────────────────────────────────
  /**
   * Le seul avantage de la liste qui se re-consomme À CHAQUE USAGE plutôt
   * qu'une fois à la souscription — donc le seul qui pèse encore au moment de
   * renouveler, l'offre étant sans reconduction automatique.
   */
  {
    icon: 'swap-horizontal',
    title: 'Virements sans commission',
    text: 'Zéro frais sur tes transferts, au lieu de 10 % pour un abonné et 20 % sans abonnement.',
    minTier: 'pro',
  },
  {
    icon: 'lock-open',
    title: 'Tu gardes 80 % de tes ventes',
    text: 'La commission tombe de 30 % à 20 %, sur tes contenus verrouillés comme sur tes pseudos vendus.',
    minTier: 'pro',
  },

  // ── Écriture ────────────────────────────────────────────────
  {
    icon: 'document-text',
    title: 'Tweets de 2 500 caractères',
    text: 'Deux fois et demie la limite abonné : de quoi poser un vrai texte sans le couper en fil.',
    minTier: 'pro',
  },
  {
    icon: 'bulb',
    title: 'Co-pilote IA débridé',
    text: '60 reformulations par tranche de 5 minutes au lieu de 12, et sur des brouillons bien plus longs.',
    minTier: 'pro',
  },
  {
    icon: 'create',
    title: '10 corrections par tweet',
    text: 'Deux fois plus de retouches dans la fenêtre de modification — qui reste de 30 minutes pour tout le monde.',
    minTier: 'pro',
  },
  {
    icon: 'time',
    title: 'Programmation à six mois',
    text: 'Prépare 200 publications d\'avance, jusqu\'à 180 jours — au lieu de 50 sur 60 jours.',
    minTier: 'pro',
  },
  {
    icon: 'git-compare',
    title: 'Deux tests A/B en parallèle',
    text: 'Fais tourner deux expériences en même temps au lieu d\'attendre la fin de la première.',
    minTier: 'pro',
  },

  // ── Renseignements ──────────────────────────────────────────
  {
    icon: 'eye',
    title: 'Visiteurs sur 30 jours',
    text: 'Tout l\'historique conservé, au lieu des 7 derniers jours.',
    minTier: 'pro',
  },
  {
    icon: 'trending-up',
    title: 'Un an d\'analytics',
    text: 'Assez de recul pour voir une saisonnalité, là où 4 mois ne montrent qu\'une tendance.',
    minTier: 'pro',
  },

  // ── Identité et présence ────────────────────────────────────
  {
    icon: 'heart',
    title: '25 Super Cœurs',
    text: 'Deux fois et demie la dotation Pro, pour peser sur ce qui remonte dans le Spotlight.',
    minTier: 'pro',
  },
  {
    icon: 'play-circle',
    title: 'Stories de 48 heures',
    text: 'Le double de durée d\'affichage, et des vidéos de 30 secondes au lieu de 15.',
    minTier: 'pro',
  },
  {
    icon: 'at',
    title: '20 pseudos réservés',
    text: 'Quatre fois plus de noms tenus en réserve : de quoi protéger toutes tes variantes.',
    minTier: 'pro',
  },

  // ── Support ──────────────────────────────────────────────────
  /**
   * Existait depuis toujours (`UltraSupportAgentScreen`, `requireUltra` sur
   * `/api/support/ai-agent`) et n'était vendu nulle part — exactement le même
   * oubli que la marketplace des créateurs plus haut.
   */
  {
    icon: 'headset',
    title: 'Agent de support IA',
    text: 'Il lit ton compte et agit dessus : corriger ton profil, supprimer un tweet, ouvrir un ticket à ta place.',
    minTier: 'pro',
  },
  {
    icon: 'chatbubbles',
    title: '20 tickets ouverts à la fois',
    text: 'Tes dossiers avancent en parallèle au lieu de faire la queue derrière un seul fil.',
    minTier: 'pro',
  },

  // ── Publier ───────────────────────────────────────────────────────────
  {
    icon: 'mic',
    title: 'Vocaux de 5 minutes',
    text: 'Deux fois et demie la durée habituelle, pour un vrai message parlé.',
    minTier: 'pro',
  },
  {
    icon: 'images',
    title: 'Huit images par tweet',
    text: 'Deux rangées au lieu d\'une, pour une série ou un avant/après complet.',
    minTier: 'pro',
  },
  {
    icon: 'cloud-upload',
    title: 'Fichiers jusqu\'à 50 Mo',
    text: 'Publie tes photos telles que l\'appareil les sort, sans les compresser avant.',
    minTier: 'pro',
  },
  {
    icon: 'text',
    title: 'Légendes de story de 500 signes',
    text: 'Presque le double, pour raconter au lieu de légender.',
    minTier: 'pro',
  },

  // ── Toucher son audience ──────────────────────────────────────────────
  {
    icon: 'megaphone',
    title: 'Message de notification de 280 signes',
    text: 'Le double : tu annonces ta publication au lieu de la résumer.',
    minTier: 'pro',
  },
  {
    icon: 'flame',
    title: 'Alerte de décollage plus tôt',
    text: 'Prévenu dès le double de ton rythme au lieu du triple — le moment où tu peux encore relancer.',
    minTier: 'pro',
  },
  {
    icon: 'map',
    title: 'Carte NF en grand',
    text: 'Un rectangle continental et 500 points servis d\'un coup, au lieu de 200.',
    minTier: 'pro',
  },
  {
    icon: 'albums',
    title: 'Archive de stories sur 3 mois',
    text: 'Pioche dans un trimestre pour composer tes « unes », au lieu de 30 jours.',
    minTier: 'pro',
  },

  // ── Tester et vendre ──────────────────────────────────────────────────
  {
    icon: 'flask',
    title: 'Six versions par test A/B',
    text: 'Et jusqu\'à 1 000 caractères par version, aligné sur ce que tu as le droit de publier.',
    minTier: 'pro',
  },
  {
    icon: 'pricetag',
    title: 'Contenus jusqu\'à 5 000 NF',
    text: 'Dix fois le plafond commun : vends une formation, pas seulement un extrait.',
    minTier: 'pro',
  },
  {
    icon: 'trophy',
    title: 'Concours sur un trimestre',
    text: 'Jusqu\'à 90 jours au lieu de 30, pour une opération qui s\'installe.',
    minTier: 'pro',
  },
  {
    icon: 'bookmark',
    title: 'Réservations de pseudo de 90 jours',
    text: 'Trois fois plus longtemps tenues, au même prix unitaire.',
    minTier: 'pro',
  },

  // ── Être protégé et aidé ──────────────────────────────────────────────
  {
    icon: 'shield-half',
    title: 'Surveillance d\'usurpation sur un an',
    text: 'Les faux comptes créés longtemps à l\'avance sont vus aussi, pas seulement les récents.',
    minTier: 'pro',
  },
  {
    icon: 'chatbubble-ellipses',
    title: 'Fils de support de 300 messages',
    text: 'Un dossier long reste dans un seul fil, avec tout son contexte.',
    minTier: 'pro',
  },
  {
    icon: 'sparkles',
    title: 'Agent IA à 200 messages par jour',
    text: 'Plus du triple : il devient un vrai copilote de compte, pas un dépannage.',
    minTier: 'pro',
  },
  {
    icon: 'bulb',
    title: 'Dix idées produit ouvertes',
    text: 'Remonte ce qui manque sans devoir en fermer une pour en ouvrir une autre.',
    minTier: 'pro',
  },

  // ── Identité et présence ──────────────────────────────────────────────
  {
    icon: 'heart-circle',
    title: 'Super Cœurs rechargés tous les 3 jours',
    text: 'Avec 25 en réserve, c\'est plus de huit par jour contre deux pour un Pro.',
    minTier: 'pro',
  },
  {
    icon: 'id-card',
    title: 'Titre de profil de 60 signes',
    text: 'De quoi tenir un intitulé réel sous ton pseudo.',
    minTier: 'pro',
  },
  {
    icon: 'sparkles-outline',
    title: 'Images en haute définition',
    text: '2 560 px et une compression plus douce : tes photos gardent leur détail sur l\'écran de tes lecteurs.',
    minTier: 'pro',
  },
];

// ⚠ Ces phrases sont des ENGAGEMENTS affichés au moment de payer. « Sans
// reconduction automatique » y figurait ; depuis que le mandat existe, la
// reconduction est possible — mais elle reste un choix, jamais un défaut, et
// c'est ce que dit la ligne qui l'a remplacée. Toute évolution du mandat doit
// repasser par ici, sinon la page promet le contraire de ce qu'elle fait.
export const TRUST_POINTS: { icon: string; text: string }[] = [
  { icon: 'shield-checkmark', text: 'Prix verrouillé au moment de l\'achat' },
  { icon: 'calendar-outline', text: 'Reconduction facultative, résiliable à tout moment' },
  { icon: 'flash', text: 'Tous les avantages actifs immédiatement' },
];
