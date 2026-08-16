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
