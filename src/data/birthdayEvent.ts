import type { EventQuest, TwEvent } from '../types/events';

/**
 * « Minuit » — l'anniversaire de twitninf.
 *
 * ── À quoi sert ce fichier ────────────────────────────────────────────────
 * Le serveur reste autoritaire : à l'exécution, l'app lit les quêtes que
 * l'API lui envoie, jamais celles-ci. Ce module est la SOURCE de ce qu'on
 * injecte dans le serveur — versionnée, typée, relue en revue de code.
 *
 * C'est la seule façon d'éviter ce qui s'est passé jusqu'ici : des quêtes
 * saisies à la main dans un panneau d'admin, sans historique, sans relecture,
 * et sans que personne ne puisse dire six mois plus tard pourquoi l'une
 * demandait 47 likes.
 *
 * La charge JSON à injecter est reprise telle quelle dans `docs/EVENTS_API.md`,
 * avec le contrat des routes que le VPS doit exposer et la règle de mesure de
 * chaque quête.
 *
 * ── Le principe de conception des dix quêtes ──────────────────────────────
 * L'événement précédent en proposait dix qui étaient toutes le même compteur :
 * aime 10, aime 50, publie 5, publie 20. On les remplissait sans les lire, et
 * elles ne faisaient rien découvrir.
 *
 * Ici, une seule quête est un compteur pur. Les dix autres demandent des
 * gestes différents — être lu par d'autres, revenir, fouiller, viser une
 * heure précise, donner, chercher. Trois d'entre elles sont impossibles à
 * réussir seul, et une n'est même pas annoncée.
 */

/** Paris, UTC+2 en août. Une semaine pleine, du lundi au dimanche soir. */
export const BIRTHDAY_START = '2026-08-24T00:00:00+02:00';
export const BIRTHDAY_END = '2026-08-31T23:59:59+02:00';

/** La fenêtre du coup de minuit — vingt minutes, et pas une de plus. */
const MIDNIGHT_FROM = '2026-08-24T00:00:00+02:00';
const MIDNIGHT_TO = '2026-08-24T00:20:00+02:00';

export const BIRTHDAY_HASHTAG = '#JoyeuxTwitninf';

/**
 * Les six recoins du « grand tour ».
 *
 * Choisis parce que ce sont exactement les pages que personne n'ouvre jamais
 * spontanément — la carte, le studio, le marché des pseudos. Une quête
 * d'exploration ne sert à rien si elle envoie sur le fil et le profil.
 * Les identifiants correspondent aux écrans, et c'est le client qui les
 * signale : l'API ne voit pas passer une navigation.
 */
export const TOUR_STOPS = [
  { id: 'map', label: 'la Carte NF', screen: 'NfMap' },
  { id: 'casino', label: 'le Casino', screen: 'Casino' },
  { id: 'studio', label: 'le Studio créateur', screen: 'CreatorStudio' },
  { id: 'trading', label: 'le Trading', screen: 'Trading' },
  { id: 'lives', label: 'les Lives', screen: 'Lives' },
  { id: 'market', label: 'le Marché des pseudos', screen: 'UsernameMarket' },
] as const;

const QUESTS: EventQuest[] = [
  // ── L'arrivée ────────────────────────────────────────────────────────────
  {
    id: 'candle',
    kind: 'single',
    tier: 'bronze',
    title: 'Allume ta bougie',
    description: `Publie un tweet avec ${BIRTHDAY_HASHTAG}. C'est la porte d'entrée : tout le reste s'ouvre derrière.`,
    icon: 'flame-outline',
    goal: 1,
    reward: { kind: 'coins', label: '120 NF', payload: { amount: 120 } },
  },
  {
    id: 'toast',
    kind: 'social',
    tier: 'bronze',
    // Volontairement dépendante des autres : on ne peut pas se faire aimer
    // tout seul, et c'est le but — la première quête sociale de l'événement.
    title: 'Trinque',
    description: 'Fais aimer ta bougie par 5 comptes différents. Un même compte ne compte qu\'une fois.',
    icon: 'wine-outline',
    goal: 5,
    requires: ['candle'],
    reward: {
      kind: 'cosmetic',
      label: 'Décoration d\'avatar « Pétales »',
      payload: { slot: 'avatar_decoration', value: 'petals' },
    },
  },
  {
    id: 'spread',
    kind: 'count',
    tier: 'bronze',
    // L'unique compteur pur de l'événement, et il est assumé : il faut une
    // quête qu'on remplit sans y penser, sinon la liste n'avance jamais.
    title: 'Distributeur de bonne humeur',
    description: 'Aime 50 tweets pendant la semaine. Celle-là se remplit toute seule.',
    icon: 'heart-outline',
    goal: 50,
    reward: {
      kind: 'multiplier',
      label: 'Gains × 2 pendant 24 h',
      payload: { factor: 2, hours: 24 },
    },
  },

  // ── La visite ────────────────────────────────────────────────────────────
  {
    id: 'tour',
    kind: 'explore',
    tier: 'silver',
    title: 'Le grand tour',
    description:
      'Passe voir les six recoins de l\'app : la Carte NF, le Casino, le Studio créateur, le Trading, les Lives et le Marché des pseudos.',
    icon: 'compass-outline',
    goal: TOUR_STOPS.length,
    reward: {
      kind: 'lootbox',
      label: 'Paquet surprise',
      // On annonce la table, jamais le tirage. Savoir ce qu'on PEUT gagner
      // donne envie ; savoir ce qu'on VA gagner supprime le paquet.
      teaser: ['300 NF', '3 jours de Pro', 'Un effet de profil', 'Une police de nom'],
    },
  },
  {
    id: 'gift',
    kind: 'social',
    tier: 'silver',
    title: 'On n\'offre pas qu\'à soi',
    description: 'Envoie des NF à 3 comptes différents. Le montant n\'a aucune importance.',
    icon: 'gift-outline',
    goal: 3,
    reward: {
      kind: 'lootbox',
      label: 'Paquet surprise (rare)',
      teaser: ['700 NF', '7 jours de Pro', 'Un cadre d\'avatar exclusif', 'Un titre de profil'],
    },
  },
  {
    id: 'guestbook',
    kind: 'single',
    tier: 'silver',
    title: 'Le livre d\'or',
    description: 'Laisse un mot d\'anniversaire sur la page de l\'événement. Il sera lisible par tout le monde.',
    icon: 'create-outline',
    goal: 1,
    reward: {
      kind: 'title',
      label: 'Titre « Invité d\'honneur »',
      payload: { title: 'Invité d\'honneur' },
    },
  },

  // ── Ce qui demande d'être là ─────────────────────────────────────────────
  {
    id: 'midnight',
    kind: 'timed',
    tier: 'gold',
    title: 'À minuit pile',
    description:
      'Publie quelque chose dans les vingt minutes qui suivent minuit, la nuit du 24. Vingt minutes, une fois. Après, c\'est fini.',
    icon: 'moon-outline',
    goal: 1,
    window: { from: MIDNIGHT_FROM, to: MIDNIGHT_TO },
    reward: {
      kind: 'cosmetic',
      label: 'Police de nom « Minuit », exclusive',
      payload: { slot: 'name_font', value: 'roman', exclusive: true },
    },
  },
  {
    id: 'sevennights',
    kind: 'streak',
    tier: 'gold',
    title: 'Sept nuits',
    description:
      'Reviens chaque jour de l\'événement. Sauter un jour remet le compteur à zéro — c\'est le principe.',
    icon: 'flame',
    goal: 7,
    reward: { kind: 'pro_days', label: '7 jours de Pro', payload: { days: 7 } },
  },

  // ── Ce qui ne dépend pas que de soi ──────────────────────────────────────
  {
    id: 'cake',
    kind: 'collective',
    tier: 'silver',
    title: 'Le gâteau géant',
    description:
      'Un objectif commun à TOUTE l\'app : 10 000 tweets publiés pendant la semaine. Si le compte y est, tout le monde touche la récompense, y compris ceux qui n\'ont rien posté.',
    icon: 'people-outline',
    goal: 10000,
    reward: { kind: 'coins', label: '300 NF pour tout le monde', payload: { amount: 300 } },
  },

  // ── Ce qui n'est pas annoncé ─────────────────────────────────────────────
  {
    id: 'echo',
    kind: 'secret',
    tier: 'legendary',
    // `hidden` : absente de la liste tant qu'elle n'a pas bougé. Elle
    // apparaît, déjà terminée, au moment où on la déclenche — ce qui est
    // exactement l'effet recherché.
    hidden: true,
    title: 'L\'écho',
    description: 'Tu as trouvé quelque chose que personne ne t\'avait dit de chercher.',
    icon: 'sparkles',
    goal: 1,
    reward: {
      kind: 'badge',
      label: 'Badge « Chat noir »',
      payload: { badge: 'black_cat', permanent: true },
    },
  },

  // ── Le sommet ────────────────────────────────────────────────────────────
  {
    id: 'founder',
    kind: 'count',
    tier: 'legendary',
    title: 'Fondateur',
    description:
      'Termine huit des autres quêtes. Ce badge ne sera plus jamais distribué après le 31 août.',
    icon: 'ribbon-outline',
    goal: 8,
    // Pas de `requires` : la quête doit être VISIBLE dès le premier jour,
    // verrouillée elle serait invisible et personne ne viserait les huit.
    reward: {
      kind: 'badge',
      label: 'Badge « Fondateur » + 1 000 NF + 30 jours de Pro',
      payload: {
        badge: 'founder',
        permanent: true,
        coins: 1000,
        pro_days: 30,
        title: 'Là depuis la première bougie',
      },
    },
  },
];

/**
 * L'événement complet, prêt à être injecté côté serveur.
 *
 * `is_active: false` volontairement : c'est le VPS qui l'allumera à la date
 * dite. Poser un événement déjà actif dans la base, c'est le lancer à
 * l'instant de l'injection — soit dix jours trop tôt.
 */
export const BIRTHDAY_EVENT: TwEvent = {
  id: 'twitninf-birthday-2026',
  slug: 'birthday2026',
  name: 'Anniversaire twitninf',
  description:
    'Une semaine pour fêter twitninf : onze quêtes, des récompenses qu\'on ne reverra pas, et un badge qui disparaît le 31 août.',
  starts_at: BIRTHDAY_START,
  ends_at: BIRTHDAY_END,
  is_active: false,
  priority: 100,
  art: 'birthday',
  features: {
    hub: true,
    banner: true,
    intro: true,
    // La DA reste sur la page d'événement et le bandeau. Repeindre le fil
    // entier en doré pendant huit jours, c'est obliger tout le monde à
    // réapprendre où sont les choses pour fêter quelque chose qu'il n'a pas
    // demandé.
    skinApp: false,
    earnMultiplier: 1.5,
    dailyGift: true,
  },
  quests: QUESTS,
  banner_message: 'twitninf fête son anniversaire — 11 quêtes, une semaine.',
};

export default BIRTHDAY_EVENT;
