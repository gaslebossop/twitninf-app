import AsyncStorage from '@react-native-async-storage/async-storage';

import { FLAGS } from '../config/featureFlagKeys';

/**
 * Onglets optionnels de la navbar : Accueil, Recherche, Notifications et
 * Profil restent fixes (navigation de base) — seuls ceux-ci se choisissent.
 * Ceux qui ne sont pas retenus restent joignables depuis Réglages (voir
 * SettingsScreen), jamais totalement retirés de l'app.
 */
export type OptionalTabKey =
  | 'video'
  | 'messages'
  | 'casino'
  | 'revue'
  | 'trading'
  | 'wallet'
  | 'analytics'
  | 'monetization'
  | 'nfmap'
  | 'swipe';

export interface OptionalTabInfo {
  key: OptionalTabKey;
  label: string;
  description: string;
  icon: string;
  /**
   * Drapeau qui conditionne l'existence de l'onglet, s'il y en a un.
   *
   * Déclaré ici plutôt que testé au cas par cas dans l'écran de
   * personnalisation : sans ça, chaque fonctionnalité derrière un drapeau
   * ajouterait sa propre exception dans un composant qui n'a pas à les
   * connaître. Un onglet dont le drapeau est fermé ne se propose pas — et,
   * même s'il a été choisi avant sa fermeture, ne se monte pas non plus (voir
   * `BottomTabNavigator`).
   */
  flag?: string;
}

export const OPTIONAL_TABS: OptionalTabInfo[] = [
  { key: 'video', label: 'Vidéos', description: 'Le fil vidéo façon TikTok', icon: 'play-circle-outline' },
  { key: 'messages', label: 'Messages', description: 'Tes conversations privées', icon: 'mail-outline' },
  { key: 'casino', label: 'Casino NF', description: 'Pile ou face et machine à sous', icon: 'dice-outline' },
  { key: 'revue', label: 'Revue communautaire', description: 'Juge des contenus signalés', icon: 'hammer-outline' },
  { key: 'trading', label: 'Trading', description: 'Analyse technique et cours en direct', icon: 'analytics-outline' },
  { key: 'wallet', label: 'Portefeuille', description: 'Solde et historique de tes TwitCoins', icon: 'wallet-outline' },
  { key: 'analytics', label: 'Analytiques', description: 'Statistiques et performance de ton compte', icon: 'stats-chart-outline' },
  { key: 'monetization', label: 'Monétisation', description: 'Suivi de tes gains sur tes tweets', icon: 'cash-outline' },
  {
    key: 'nfmap',
    label: 'Carte NF',
    description: 'Où sont les comptes liés à toi',
    icon: 'map-outline',
    flag: FLAGS.NF_MAP,
  },
  {
    key: 'swipe',
    label: 'Swipe',
    description: 'Découvre des comptes à suivre, un par un',
    icon: 'albums-outline',
  },
];

/** Nombre maximum d'onglets optionnels affichables en même temps dans la navbar. */
export const MAX_OPTIONAL_TABS = 5;

/**
 * Emplacements libres de la barre du fil « 2B » : **zéro ou deux, jamais un,
 * jamais plus**.
 *
 * ── Pourquoi pas cinq, comme la barre d'origine ──
 * La barre 2B est une pilule à colonnes égales (`flex: 1`). À cinq raccourcis
 * elle compte dix colonnes : les icônes rétrécissent sous le seuil tactile et
 * la pastille active n'a plus de place. Les préférences écrites AVANT le test
 * 2B contiennent encore jusqu'à cinq entrées — d'où des barres illisibles
 * chez les comptes qui avaient personnalisé la leur.
 *
 * ── Pourquoi pas UN ──
 * Le bouton « Publier » occupe une colonne au milieu de la rangée, à
 * `ceil(routes.length / 2)` (voir `BottomTabNavigator2B`). Le socle en compte
 * quatre — Accueil, Recherche, Messages, Profil — donc la rangée n'est
 * équilibrée autour du bouton que si le nombre de raccourcis est PAIR :
 *
 *     0 raccourci  → 4 routes → 2 | Publier | 2   ✅
 *     1 raccourci  → 5 routes → 3 | Publier | 2   ❌ bouton décentré
 *     2 raccourcis → 6 routes → 3 | Publier | 3   ✅
 *     3 raccourcis → 7 routes → 4 | Publier | 3   ❌
 *
 * ⚠️ Un direct en cours ajoute une colonne le temps qu'il dure et déséquilibre
 * la rangée de la même façon. C'est transitoire et connu ; ce n'est pas ce que
 * cette règle corrige.
 */
export const FEED_2B_SLOTS = 2;

/** Une sélection tient-elle dans la barre 2B ? */
export function isValidFor2B(selected: OptionalTabKey[]): boolean {
  const count = Array.isArray(selected) ? selected.length : 0;
  return count === 0 || count === FEED_2B_SLOTS;
}

/**
 * Ramène une sélection à une forme valide, sans jamais rien inventer.
 *
 * Trop de raccourcis : on garde les premiers, qui sont ceux que
 * l'utilisateur a choisis en premier. Pas assez (un seul) : on retombe à
 * ZÉRO plutôt que d'en ajouter un au hasard — mettre dans la barre de
 * quelqu'un un raccourci qu'il n'a pas demandé est pire que de lui en
 * retirer un.
 *
 * C'est un filet de sécurité au rendu, pas une correction : la préférence
 * stockée n'est pas réécrite, c'est la popup qui demande à l'utilisateur ce
 * qu'il veut vraiment.
 */
export function normalizeFor2B(selected: OptionalTabKey[]): OptionalTabKey[] {
  const list = Array.isArray(selected) ? selected : [];
  if (list.length >= FEED_2B_SLOTS) return list.slice(0, FEED_2B_SLOTS);
  return [];
}

const keyFor = (userId: string) => `@twitninf_navbar_prefs:${userId}`;

interface StoredPrefs {
  configured: boolean;
  selected: OptionalTabKey[];
}

const DEFAULT_PREFS: StoredPrefs = { configured: false, selected: [] };

export async function getNavbarPrefs(userId: string): Promise<StoredPrefs> {
  if (!userId) return DEFAULT_PREFS;
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw);
    return {
      configured: !!parsed.configured,
      selected: Array.isArray(parsed.selected) ? parsed.selected : [],
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function saveNavbarPrefs(userId: string, selected: OptionalTabKey[]): Promise<void> {
  if (!userId) return;
  const prefs: StoredPrefs = { configured: true, selected };
  await AsyncStorage.setItem(keyFor(userId), JSON.stringify(prefs));
}
