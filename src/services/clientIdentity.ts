import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * En-têtes d'identification du client officiel.
 *
 * L'API reconnaît l'app mobile via le triplet
 * `X-TwitNinf-Client` / `User-Platform` / `X-Device-ID`
 * (voir api/src/middleware/fraudMiddleware.js → hasMobileAppTransport).
 * Accompagnés d'un JWT valide, ils exemptent la requête du scoring
 * comportemental anti-fraude — calibré pour du trafic web, il bannissait
 * à tort le polling et le préchargement normaux de l'app.
 *
 * La détection d'injection reste appliquée quoi qu'il arrive : ces en-têtes
 * ne donnent aucun droit supplémentaire, et login/paiements restent
 * intégralement protégés côté serveur.
 */
export const CLIENT_NAME = 'mobile-expo';

const DEVICE_ID_KEY = 'twitninf_device_id';

/**
 * Fuseau de l'appareil, en nom IANA (« Europe/Paris »).
 *
 * On envoie le NOM et pas le décalage : un décalage vaut pour l'instant où
 * on le mesure, alors qu'une publication programmée pour dans trois semaines
 * peut tomber de l'autre côté du changement d'heure. Seul le nom permet au
 * serveur de calculer le bon décalage à la bonne date.
 */
function resolveDeviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

let cachedDeviceId: string | null = null;
let deviceIdLoading: Promise<string> | null = null;

function generateDeviceId(): string {
  // 32 caractères hex sans dépendance native supplémentaire. Cet identifiant
  // sert uniquement d'empreinte d'appareil stable — il n'a aucune valeur de
  // secret, donc une source pseudo-aléatoire suffit.
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
  }
  return out;
}

/**
 * Identifiant d'appareil stable, persisté dans le keystore.
 * Migre silencieusement une éventuelle valeur laissée dans AsyncStorage.
 */
export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  if (deviceIdLoading) return deviceIdLoading;

  deviceIdLoading = (async () => {
    let id: string | null = null;
    try {
      id = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    } catch {}

    if (!id) {
      try {
        const legacy = await AsyncStorage.getItem(DEVICE_ID_KEY);
        if (legacy) {
          id = legacy;
          await AsyncStorage.removeItem(DEVICE_ID_KEY);
        }
      } catch {}
    }

    if (!id) id = generateDeviceId();

    try {
      await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
    } catch {
      // Keystore indisponible : on garde l'identifiant en mémoire pour la
      // session plutôt que d'échouer. Il sera régénéré au prochain lancement.
    }

    cachedDeviceId = id;
    deviceIdLoading = null;
    return id;
  })();

  return deviceIdLoading;
}

/** Précharge l'identifiant pour que les premières requêtes le portent déjà. */
export function primeDeviceId(): void {
  getDeviceId().catch(() => {});
}

/**
 * Version synchrone : renvoie l'identifiant si déjà chargé, sinon null.
 * Utilisée sur les chemins qui ne peuvent pas attendre (rares).
 */
export function getCachedDeviceId(): string | null {
  return cachedDeviceId;
}

/** Source unique de la version affichée — ne pas relire `Constants` ailleurs. */
export const APP_VERSION =
  Constants.expoConfig?.version ||
  (Constants as any).manifest?.version ||
  '0.0.0';

/**
 * En-têtes à joindre à TOUTE requête vers l'API twitninf.
 * Source unique : ne pas réécrire ces en-têtes à la main ailleurs.
 */
export async function buildClientHeaders(
  extra: Record<string, string> = {}
): Promise<Record<string, string>> {
  const deviceId = await getDeviceId();
  return {
    Accept: 'application/json',
    'X-TwitNinf-Client': CLIENT_NAME,
    'User-Platform': Platform.OS,
    'X-Device-ID': deviceId,
    'X-App-Version': APP_VERSION,
    'X-App-Ownership': (Constants as any).appOwnership || 'standalone',
    // Le serveur tourne en UTC et la base aussi. Tant qu'on échange des
    // instants, aucune importance ; dès qu'on parle d'HEURE DE LA JOURNÉE
    // (« tes meilleurs créneaux », « publie à 8 h »), il lui faut l'horloge
    // de l'appareil, sinon il répond en heures UTC — deux de moins qu'à
    // Paris l'été. Envoyé partout : le fuseau suit l'utilisateur en voyage.
    'X-Timezone': resolveDeviceTimeZone(),
    ...extra,
  };
}
