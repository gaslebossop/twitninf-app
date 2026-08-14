import { artOf } from '../theme/eventArt';
import type { QuestView, TwEvent } from '../types/events';

/**
 * Jeu d'essai de la page d'événement, pour le banc d'aperçu.
 *
 * ── Ce qu'un jeu d'essai doit couvrir ─────────────────────────────────────
 * Pas « un événement », mais TOUS LES ÉTATS qu'une quête peut prendre. Un
 * aperçu où tout est à zéro ne montre qu'un seul cas, et c'est précisément
 * celui qu'on voit déjà en production hors période :
 *
 *  - réclamable (terminée, non encaissée) — la seule qui appelle une action ;
 *  - en cours, à mi-parcours ;
 *  - pas commencée ;
 *  - verrouillée derrière un prérequis ;
 *  - déjà encaissée ;
 *  - l'objectif commun, avec son compteur de communauté.
 *
 * Les paliers sont volontairement panachés : c'est le seul moyen de vérifier
 * que les quatre teintes tiennent côte à côte, y compris l'argent, qui est un
 * gris et s'était déjà révélé illisible sur fond clair.
 *
 * ── Ce qui reste réel ─────────────────────────────────────────────────────
 * Rien n'est simulé au-delà des données : la page rendue est le vrai
 * `EventScreen`, avec la vraie DA. Le livre d'or, lui, interroge le serveur
 * pour de bon — il sera donc vide sous ce slug d'essai, et c'est normal.
 */

const NOW = Date.now();

function quest(
  id: string,
  partial: Partial<QuestView> & Pick<QuestView, 'title' | 'description' | 'reward' | 'tier' | 'kind'>,
  progress: number,
  goal: number,
  flags: { claimed?: boolean; locked?: boolean; community?: { progress: number; goal: number } } = {},
): QuestView {
  return {
    id,
    icon: 'sparkles-outline',
    goal,
    ...partial,
    locked: !!flags.locked,
    state: {
      quest_id: id,
      progress,
      goal,
      completed: progress >= goal,
      claimed: !!flags.claimed,
      community: flags.community,
    },
  } as QuestView;
}

export const PREVIEW_EVENT: TwEvent = {
  id: 'preview',
  slug: 'preview-event',
  name: 'Anniversaire twitninf',
  description:
    "Aperçu : onze quêtes, des récompenses qu'on ne reverra pas, et un badge qui disparaît le 31 août.",
  starts_at: new Date(NOW - 2 * 24 * 3600 * 1000).toISOString(),
  ends_at: new Date(NOW + 5 * 24 * 3600 * 1000 + 3 * 3600 * 1000).toISOString(),
  is_active: true,
  priority: 100,
  art: 'birthday',
  features: { hub: true, banner: true, intro: true, skinApp: false, dailyGift: true },
  quests: [],
  banner_message: 'twitninf fête son anniversaire — 11 quêtes, une semaine.',
};

export const PREVIEW_QUESTS: QuestView[] = [
  quest(
    'candle',
    {
      kind: 'single',
      tier: 'bronze',
      title: 'Allume ta bougie',
      description: "Publie un tweet avec #JoyeuxTwitninf. C'est la porte d'entrée.",
      icon: 'flame-outline',
      reward: { kind: 'coins', label: '120 NF', payload: { amount: 120 } },
    },
    1,
    1,
  ),
  quest(
    'spread',
    {
      kind: 'count',
      tier: 'bronze',
      title: 'Distributeur de bonne humeur',
      description: 'Aime 50 tweets pendant la semaine. Celle-là se remplit toute seule.',
      icon: 'heart-outline',
      reward: { kind: 'multiplier', label: 'Gains × 2 pendant 24 h' },
    },
    31,
    50,
  ),
  quest(
    'tour',
    {
      kind: 'explore',
      tier: 'silver',
      title: 'Le grand tour',
      description: "Passe voir les six recoins de l'app.",
      icon: 'compass-outline',
      reward: {
        kind: 'lootbox',
        label: 'Paquet surprise',
        teaser: ['300 NF', '3 jours de Pro', 'Un effet de profil'],
      },
    },
    0,
    6,
  ),
  quest(
    'toast',
    {
      kind: 'social',
      tier: 'silver',
      title: 'Trinque',
      description: 'Fais aimer ta bougie par 5 comptes différents.',
      icon: 'wine-outline',
      reward: { kind: 'cosmetic', label: "Décoration d'avatar « Pétales »" },
      requires: ['candle'],
    },
    0,
    5,
    { locked: true },
  ),
  quest(
    'guestbook',
    {
      kind: 'single',
      tier: 'silver',
      title: "Le livre d'or",
      description: "Laisse un mot d'anniversaire sur la page de l'événement.",
      icon: 'create-outline',
      reward: { kind: 'title', label: 'Titre « Invité d’honneur »' },
    },
    1,
    1,
    { claimed: true },
  ),
  quest(
    'sevennights',
    {
      kind: 'streak',
      tier: 'gold',
      title: 'Sept nuits',
      description: "Reviens chaque jour de l'événement.",
      icon: 'flame',
      reward: { kind: 'pro_days', label: '7 jours de Pro' },
    },
    3,
    7,
  ),
  quest(
    'founder',
    {
      kind: 'count',
      tier: 'legendary',
      title: 'Fondateur',
      description: 'Termine huit des autres quêtes.',
      icon: 'ribbon-outline',
      reward: { kind: 'badge', label: 'Badge « Fondateur » + 1 000 NF' },
    },
    2,
    8,
  ),
  quest(
    'cake',
    {
      kind: 'collective',
      tier: 'silver',
      title: 'Le gâteau géant',
      description:
        "Un objectif commun à TOUTE l'app : 10 000 tweets publiés pendant la semaine.",
      icon: 'people-outline',
      reward: { kind: 'coins', label: '300 NF pour tout le monde' },
    },
    4213,
    10000,
    { community: { progress: 4213, goal: 10000 } },
  ),
];

/** L'état complet, prêt à être injecté dans `EventsPreviewProvider`. */
export function buildPreviewState() {
  const endsIn = Date.parse(PREVIEW_EVENT.ends_at) - Date.now();
  return {
    event: { ...PREVIEW_EVENT, quests: PREVIEW_QUESTS },
    quests: PREVIEW_QUESTS,
    loading: false,
    error: null,
    fetchedAt: Date.now(),
    art: artOf('birthday'),
    isLive: true,
    endsIn,
    refresh: async () => {},
    // La réclamation est neutralisée : un aperçu ne doit rien accorder, et
    // surtout pas échouer bruyamment sur un slug qui n'existe pas.
    claim: async () => ({ ok: false, message: 'Aperçu — aucune récompense accordée' }),
    signal: () => {},
  };
}
