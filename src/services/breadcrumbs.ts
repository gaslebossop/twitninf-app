import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Network from 'expo-network';
import { APP_VERSION } from './clientIdentity';

/**
 * Le fil — trace des derniers écrans traversés.
 *
 * Un rapport de bug exploitable tient en une phrase : « ça a cassé ICI, en
 * venant de LÀ ». C'est précisément la partie que l'utilisateur ne sait pas
 * donner (« ça marche pas ») et que l'app, elle, connaît déjà. On la garde
 * donc en continu, pour que l'écran de signalement n'ait plus rien à demander
 * là-dessus : l'utilisateur pointe le moment au lieu de le raconter.
 *
 * Volontairement en MÉMOIRE VIVE seulement : ce journal ne survit pas à un
 * redémarrage, n'est jamais écrit sur le disque, et ne quitte l'appareil que
 * si l'utilisateur envoie un rapport — après l'avoir lu en clair. C'est aussi
 * ce qui permet de l'annoncer sans réserve dans l'écran : il n'y a rien de
 * plus derrière.
 */

export interface Crumb {
  /** Nom de route React Navigation. */
  route: string;
  /** Instant d'arrivée sur l'écran. */
  at: number;
}

/**
 * Dix suffit largement : au-delà, le parcours remonte à si loin qu'il ne dit
 * plus rien du bug, et la liste devient un mur que personne ne lit.
 */
const MAX_CRUMBS = 10;

const trail: Crumb[] = [];

/**
 * Enregistre une arrivée d'écran. Appelé par le `onStateChange` du
 * `NavigationContainer` — un seul point d'entrée, pour qu'aucun écran n'ait à
 * penser à se déclarer.
 */
export function recordScreen(route: string | undefined | null): void {
  if (!route) return;
  const last = trail[trail.length - 1];
  // Un changement de paramètre (ouvrir un autre tweet, changer d'onglet
  // interne) relance `onStateChange` sans qu'on ait changé d'écran. Sans ce
  // garde-fou le fil se remplirait de dix « Accueil » d'affilée.
  if (last && last.route === route) return;
  trail.push({ route, at: Date.now() });
  if (trail.length > MAX_CRUMBS) trail.shift();
}

/** Copie du fil, du plus ancien au plus récent. */
export function getTrail(): Crumb[] {
  return trail.slice();
}

/**
 * Noms lisibles des routes.
 *
 * Une bonne partie des routes de l'app est déjà nommée en français (les
 * onglets : « Accueil », « Profil »…) : elles n'ont pas besoin d'entrée ici et
 * traversent `labelForRoute` telles quelles. Cette table ne couvre donc que
 * les routes techniques qu'un utilisateur ne reconnaîtrait pas.
 */
const ROUTE_LABELS: Record<string, string> = {
  AccountManager: 'Comptes',
  AccountStats: 'Statistiques du compte',
  AddAccount: 'Ajouter un compte',
  Analytics: 'Analytics',
  Casino: 'Casino',
  CommunityCurrencies: 'Monnaies de communauté',
  CommunityReview: 'Revue communautaire',
  ConversationThread: 'Conversation',
  CreateTweet: 'Composer un tweet',
  CreateVideo: 'Créer une vidéo',
  CreatorStudio: 'Studio créateur',
  CurrencyDetail: 'Détail de monnaie',
  DeveloperPortal: 'Portail développeur',
  EditProfile: 'Modifier le profil',
  EditTweet: 'Modifier un tweet',
  FollowRequests: "Demandes d'abonnement",
  GoLive: 'Passer en direct',
  GroupMembers: 'Membres du groupe',
  LiveViewer: 'Direct',
  Messages: 'Messages',
  Monetization: 'Monétisation',
  MonetizationProgram: 'Programme créateur',
  NewConversation: 'Nouvelle conversation',
  NewEconomy: 'Économie',
  NfMap: 'Carte NF',
  Notifications: 'Notifications',
  PaidContentSales: 'Ventes de contenu payant',
  PredictiveAnalytics: 'Analytics prédictifs',
  PrivacyData: 'Confidentialité et données',
  ProfileCustomization: 'Personnalisation du profil',
  ProfileInsights: 'Insights du profil',
  RecordVideo: 'Enregistrer une vidéo',
  ReportBug: 'Signaler un bug',
  Reports: 'Signalements',
  ScheduledPosts: 'Publications programmées',
  Settings: 'Paramètres',
  Support: 'Support',
  SupportTicket: 'Ticket de support',
  Theme: 'Apparence',
  Trading: 'Trading',
  TweetDetail: 'Détail du tweet',
  TweetMonetization: 'Monétisation des tweets',
  UserConnections: 'Abonnés et abonnements',
  VerificationStyle: 'Style de certification',
  Video: 'Vidéos',
  VideoCaption: 'Légende de la vidéo',
  VideoEditor: 'Éditeur vidéo',
  WalletDetail: 'Portefeuille',
};

/**
 * Nom d'écran présentable. À défaut d'entrée dans la table, on décolle le
 * chameau (`ProfileInsights` → « Profile Insights ») : imparfait, mais
 * toujours plus parlant qu'un identifiant collé, et ça évite qu'une route
 * ajoutée demain s'affiche vide.
 */
export function labelForRoute(route: string): string {
  const known = ROUTE_LABELS[route];
  if (known) return known;
  return route
    .replace(/Screen$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
}

/**
 * Âge d'un passage, en français courant. Les secondes comptent ici : entre
 * « il y a 8 s » et « il y a 4 min », ce n'est pas le même bug.
 */
export function describeAge(at: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 5) return "à l'instant";
  if (seconds < 60) return `il y a ${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `il y a ${hours} h`;
}

export interface DiagnosticLine {
  label: string;
  value: string;
}

/**
 * Ce que l'app sait d'elle-même et qu'un développeur redemanderait sinon.
 *
 * Rien n'est deviné ni inventé : chaque ligne est mesurée, et une mesure
 * indisponible s'affiche « inconnu » plutôt que de disparaître — un champ
 * absent laisserait croire qu'on cache quelque chose dans un écran dont tout
 * l'argument est justement de montrer ce qui part.
 */
export async function collectDiagnostics(): Promise<DiagnosticLine[]> {
  const model = [Device.brand, Device.modelName].filter(Boolean).join(' ') || 'inconnu';
  const os = [Device.osName || Platform.OS, Device.osVersion].filter(Boolean).join(' ');

  let network = 'inconnu';
  try {
    const state = await Network.getNetworkStateAsync();
    const kind = String(state.type || 'inconnu').toLowerCase();
    network = state.isConnected === false ? `${kind} (hors ligne)` : kind;
  } catch {
    // Certaines ROM Android refusent la lecture de l'état réseau. Ce n'est pas
    // une raison pour faire échouer un rapport de bug.
  }

  return [
    { label: 'Version', value: APP_VERSION },
    { label: 'Appareil', value: model },
    { label: 'Système', value: os || 'inconnu' },
    { label: 'Réseau', value: network },
    { label: 'Heure', value: new Date().toISOString() },
  ];
}

export default { recordScreen, getTrail, labelForRoute, describeAge, collectDiagnostics };
