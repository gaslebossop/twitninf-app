/**
 * Le contrat d'événement de twitninf — source unique.
 *
 * ── Ce qu'il remplace ─────────────────────────────────────────────────────
 * L'app pilotait ses événements par TROIS systèmes parallèles, chacun avec ses
 * routes, son cache et ses types :
 *
 *   - `/api/events`            — une DA (douze codes hexadécimaux, des drapeaux
 *                                d'effets) ;
 *   - `/api/functional-events` — des bascules de fonctionnalités par page ;
 *   - `/api/user-challenges`   — les quêtes et leur progression.
 *
 * Rien ne les reliait qu'une convention : un `event_slug` recopié à la main
 * d'un système à l'autre. Un événement dont la DA était active mais dont
 * l'événement fonctionnel avait expiré affichait donc ses couleurs de fête
 * au-dessus de quêtes devenues inaccessibles — sans que rien ne signale
 * l'incohérence, puisqu'aucun des trois ne connaissait les deux autres.
 *
 * Ici, un événement est UN objet : une période, une DA, des fonctionnalités et
 * des quêtes. Il est actif ou il ne l'est pas.
 *
 * ── Qui décide de quoi ────────────────────────────────────────────────────
 * Le serveur reste autoritaire : c'est lui qui dit quel événement est actif,
 * quelles quêtes existent, où en est la progression et qui a droit à quoi. Le
 * client ne s'auto-décerne rien — un client qui se crédite est une faille.
 *
 * Une exception assumée : la DA n'est PAS transmise en couleurs. Le serveur
 * envoie un identifiant (`art: "birthday"`), et l'app sait ce que cet
 * identifiant veut dire. Une direction artistique n'est pas une liste de codes
 * hexadécimaux — c'est une typographie, des dégradés, des particules, des
 * durées et des règles. La faire transiter en JSON revenait à laisser un
 * champ de formulaire décider de l'apparence de l'app, et c'est ce qui a donné
 * les thèmes d'événement actuels, que personne n'a jamais dessinés.
 */

// ─── Identité ────────────────────────────────────────────────────────────────

/**
 * Clé de direction artistique. Le serveur envoie cette chaîne ; l'app résout
 * le module correspondant dans `src/theme/eventArt`. Une valeur inconnue
 * retombe sur `none` — un événement dont la DA n'a pas encore été livrée
 * fonctionne, il est simplement rendu dans l'habillage ordinaire.
 */
export type EventArtId = 'none' | 'birthday';

/** Palier d'une quête. Sert au tri, à la couleur et au poids ressenti. */
export type QuestTier = 'bronze' | 'silver' | 'gold' | 'legendary';

// ─── Quêtes ──────────────────────────────────────────────────────────────────

/**
 * Nature d'une quête — c'est-à-dire ce qui la fait avancer.
 *
 * Le point n'est pas décoratif. L'événement précédent proposait dix quêtes qui
 * étaient toutes le même compteur avec un seuil différent : « aime 10 tweets »,
 * « aime 50 tweets », « publie 5 tweets ». On les remplissait sans les lire.
 * Les natures ci-dessous demandent des gestes DIFFÉRENTS, ce qui est la seule
 * façon de faire découvrir l'app par ses quêtes plutôt que de faire farmer.
 */
export type QuestKind =
  /** Répéter un geste N fois. Le classique, et il en faut — mais pas dix. */
  | 'count'
  /** N jours d'affilée. Se casse si on saute un jour : c'est ce qui fait revenir. */
  | 'streak'
  /** Un geste unique, fait ou pas fait. Pas de barre, une case. */
  | 'single'
  /** Il faut d'AUTRES gens : être lu, cité, suivi. Ne se farme pas seul. */
  | 'social'
  /** Toucher N fonctionnalités distinctes de l'app. Fait visiter. */
  | 'explore'
  /** Dans une fenêtre de temps précise. Donne un rendez-vous. */
  | 'timed'
  /** Objectif commun à TOUS les comptes. Réussi ou raté ensemble. */
  | 'collective'
  /** Rien n'est dit avant de l'avoir déclenchée. */
  | 'secret';

/**
 * Ce qu'une quête rapporte.
 *
 * `kind` dit au client comment l'annoncer et l'illustrer ; `payload` est opaque
 * et n'est interprété que par le serveur au moment de la remise. Le client
 * n'accorde jamais rien lui-même — il demande, le serveur tranche.
 */
export type QuestRewardKind =
  /** NF, la monnaie de l'app. */
  | 'coins'
  /** Jours d'accès Pro. */
  | 'pro_days'
  /** Un élément du catalogue de personnalisation, débloqué à vie. */
  | 'cosmetic'
  /** Badge de profil, visible par tous, plus jamais distribué après coup. */
  | 'badge'
  /** Titre affiché sous le pseudo. */
  | 'title'
  /**
   * Lot à tirage : le serveur pioche dans une réserve. C'est la seule
   * récompense qu'on ne peut pas viser, donc la seule qui surprend vraiment.
   */
  | 'lootbox'
  /** Bonus temporaire sur les gains (× N pendant D heures). */
  | 'multiplier'
  /** Une capacité normalement payante, prêtée le temps de l'événement. */
  | 'unlock';

export interface QuestReward {
  kind: QuestRewardKind;
  /** Libellé montré à l'utilisateur. Écrit par l'événement, pas déduit. */
  label: string;
  /** Détail opaque au client : montant, identifiant de cosmétique, table de tirage. */
  payload?: Record<string, unknown>;
  /** Pour les lots à tirage : ce qu'on peut y gagner, sans dire lequel. */
  teaser?: string[];
}

/** Définition d'une quête, telle que le serveur la publie. */
export interface EventQuest {
  id: string;
  kind: QuestKind;
  tier: QuestTier;
  title: string;
  description: string;
  /** Nom d'icône Ionicons. */
  icon: string;
  /** Valeur à atteindre. Toujours 1 pour `single` et `secret`. */
  goal: number;
  reward: QuestReward;
  /**
   * Quêtes à terminer avant que celle-ci n'apparaisse. C'est ce qui permet de
   * raconter une progression au lieu d'afficher dix cases en vrac.
   */
  requires?: string[];
  /** Masquée tant qu'elle n'est pas déclenchée (`secret`) ou débloquée. */
  hidden?: boolean;
  /** Fenêtre propre à la quête, dans la période de l'événement (`timed`). */
  window?: { from: string; to: string };
}

/** Où en est CE compte sur CETTE quête. Autorité serveur, sans exception. */
export interface QuestProgress {
  quest_id: string;
  progress: number;
  goal: number;
  completed: boolean;
  claimed: boolean;
  claimed_at?: string;
  /** Pour `collective` : l'avancement de toute la communauté. */
  community?: { progress: number; goal: number };
}

/** Une quête et son état, tels que l'écran les consomme. */
export interface QuestView extends EventQuest {
  state: QuestProgress;
  /** Vrai quand `requires` n'est pas encore satisfait : affichée verrouillée. */
  locked: boolean;
}

// ─── Événement ───────────────────────────────────────────────────────────────

/**
 * Bascules de fonctionnalité portées par l'événement.
 *
 * Remplace `functional_events.features`, qui était un `Record<string, any>`
 * libre : n'importe quelle clé mal orthographiée dans le panneau admin
 * désactivait silencieusement la fonctionnalité qu'elle prétendait allumer.
 * Ici la liste est fermée, donc une faute de frappe se voit à la compilation.
 */
export interface EventFeatures {
  /** Onglet et page de l'événement dans la navigation. */
  hub?: boolean;
  /** Bandeau en haut du fil. */
  banner?: boolean;
  /** Popup au démarrage, une fois par compte. */
  intro?: boolean;
  /** La DA s'applique à toute l'app, pas seulement à la page d'événement. */
  skinApp?: boolean;
  /** Multiplicateur de gains appliqué pendant l'événement. */
  earnMultiplier?: number;
  /** Cadeau quotidien à venir chercher. */
  dailyGift?: boolean;
}

export interface TwEvent {
  id: string;
  slug: string;
  name: string;
  description?: string;
  /** ISO 8601. Le serveur reste juge de l'activation ; ces dates servent à
   *  l'affichage du compte à rebours et au tri, jamais à décider seul. */
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  priority: number;
  art: EventArtId;
  features: EventFeatures;
  quests: EventQuest[];
  /** Phrase du bandeau. Vide = pas de bandeau, même si `features.banner`. */
  banner_message?: string;
}

/**
 * Tout ce que l'app sait de l'événement en cours, en un seul objet.
 *
 * `event` nul est un état NORMAL, pas une erreur : la plupart du temps il ne se
 * passe rien, et c'est le cas que le reste du code doit gérer en premier.
 */
export interface EventState {
  event: TwEvent | null;
  quests: QuestView[];
  /** Faux dès la première réponse, y compris négative. */
  loading: boolean;
  /** Dernière erreur réseau. L'app reste utilisable : un événement n'est jamais critique. */
  error: string | null;
  /** Horodatage de la dernière réponse serveur retenue. */
  fetchedAt: number | null;
}

/** Réponse de `POST /api/events/quests/:id/claim`. */
export interface ClaimResult {
  ok: boolean;
  /** Ce que le serveur a réellement accordé — un tirage n'est connu qu'ici. */
  granted?: QuestReward;
  message?: string;
}
