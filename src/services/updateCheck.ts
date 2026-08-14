import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { findNewerVersion, type PublishedVersion } from './updateFeed';

/**
 * Détection d'une nouvelle version disponible en sideload.
 *
 * ## Comment une app sait qu'elle est périmée
 *
 * L'app n'est distribuée par aucun store : l'IPA est publié dans un gist qui
 * sert de source AltStore, et l'APK est installé depuis le Kospor Store. Rien
 * ne vient donc prévenir l'utilisateur qu'une version plus récente existe — un
 * appareil pouvait rester des semaines sur un build périmé sans le savoir.
 *
 * Le gist porte déjà le compteur qui fait autorité : `buildVersion`, un entier
 * strictement croissant (c'est ce qu'AltStore compare pour proposer la mise à
 * jour). On s'appuie sur LUI plutôt que sur `version`, qui n'est qu'un libellé
 * humain laissé tel quel d'une publication à l'autre.
 *
 * Chaque build est estampillé au moment du bundling avec le numéro qu'il
 * portera une fois publié (`EXPO_PUBLIC_BUILD_VERSION`, calculé par la CI à
 * partir du gist — voir .github/workflows/ios-build.yml). L'app compare ensuite
 * son estampille au `buildVersion` du gist : si celui du gist est plus grand,
 * c'est qu'une version plus récente a été publiée depuis.
 *
 * ## Ce qui désactive la vérification
 *
 * - Pas d'estampille (`EXPO_PUBLIC_BUILD_VERSION` absent) : build local ou
 *   Expo Go. Comparer n'aurait aucun sens, et harceler un développeur avec une
 *   invitation à réinstaller son propre build serait absurde.
 * - Pas de source (`EXPO_PUBLIC_UPDATE_FEED_URL` absent) : rien à interroger.
 *
 * Dans les deux cas la fonction renvoie `null` sans jamais lever : une panne
 * réseau ou un gist malformé ne doit pas empêcher l'app de démarrer.
 */

/** URL du flux de versions. La CI y met l'API du gist AltStore. */
const FEED_URL = process.env.EXPO_PUBLIC_UPDATE_FEED_URL || '';

/**
 * Numéro de build gravé au bundling. Chaîne, car c'est ainsi qu'AltStore le
 * stocke ; converti en nombre au moment de comparer.
 */
const BUILD_VERSION = process.env.EXPO_PUBLIC_BUILD_VERSION || '';

/** Dernier `buildVersion` que l'utilisateur a explicitement écarté. */
const DISMISSED_KEY = 'update_notice_dismissed_build';
/** Horodatage de la dernière interrogation réussie ou non. */
const LAST_CHECK_KEY = 'update_notice_last_check';

/**
 * Une seule interrogation par tranche de 6 h. Le flux ne bouge qu'à chaque
 * publication (quelques fois par semaine au mieux) et il est servi par GitHub,
 * dont les quotas anonymes se comptent par adresse IP : interroger à chaque
 * lancement n'apporterait rien et exposerait à un 403 collectif.
 */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Version publiée, strictement plus récente que celle installée. */
export type UpdateInfo = PublishedVersion;

/** Nom du canal d'installation, tel qu'il s'appelle sur l'appareil. */
export const INSTALL_CHANNEL = Platform.OS === 'ios' ? 'Kospor Injection' : 'Kospor Store';

/**
 * Interroge le flux et renvoie la version publiée si elle est plus récente que
 * celle installée. `null` couvre tous les autres cas — y compris les pannes,
 * volontairement indistinguables d'un « rien de neuf » du point de vue de
 * l'appelant.
 */
export async function fetchAvailableUpdate(): Promise<UpdateInfo | null> {
  if (!FEED_URL || !BUILD_VERSION) return null;

  try {
    // Le flux est un petit JSON servi par GitHub : 10 s suffisent largement, et
    // au-delà il vaut mieux rendre la main que retarder le démarrage.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let response: Response;
    try {
      response = await fetch(FEED_URL, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) return null;

    return findNewerVersion(await response.json(), BUILD_VERSION);
  } catch {
    // Réseau coupé, JSON malformé, gist supprimé : rien à signaler.
    return null;
  }
}

/**
 * Même chose, mais en respectant l'intervalle d'interrogation et le refus déjà
 * exprimé par l'utilisateur. C'est cette fonction que l'écran appelle.
 *
 * Un refus ne vaut que pour LE build refusé : une publication ultérieure
 * repropose la mise à jour, sans quoi un « plus tard » enterrerait toutes les
 * versions suivantes.
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!FEED_URL || !BUILD_VERSION) return null;

  try {
    const lastCheck = Number(await AsyncStorage.getItem(LAST_CHECK_KEY));
    if (Number.isFinite(lastCheck) && Date.now() - lastCheck < CHECK_INTERVAL_MS) {
      return null;
    }
  } catch {
    // Stockage indisponible : on interroge, quitte à le faire un peu souvent.
  }

  const update = await fetchAvailableUpdate();

  try {
    await AsyncStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
  } catch {
    // Sans persistance, l'intervalle ne tient pas — sans gravité.
  }

  if (!update) return null;

  try {
    const dismissed = Number(await AsyncStorage.getItem(DISMISSED_KEY));
    if (Number.isFinite(dismissed) && dismissed >= update.buildVersion) return null;
  } catch {
    // Refus illisible : mieux vaut reproposer que de taire une mise à jour.
  }

  return update;
}

/** Mémorise que cette version-là a été écartée. */
export async function dismissUpdate(buildVersion: number): Promise<void> {
  try {
    await AsyncStorage.setItem(DISMISSED_KEY, String(buildVersion));
  } catch {
    // La proposition reviendra au prochain lancement : acceptable.
  }
}

/** Exposé pour l'écran « À propos » et le diagnostic. */
export const installedBuildVersion = BUILD_VERSION || null;
