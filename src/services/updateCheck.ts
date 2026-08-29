import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import {
  extractManifest,
  findNewerVersion,
  manifestRawUrl,
  type PublishedVersion,
} from './updateFeed';

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
 * Intervalle minimal entre deux interrogations du flux.
 *
 * Il valait 6 h, par crainte des quotas anonymes de l'API GitHub (60
 * requêtes/heure/IP). C'était trop prudent, et ça s'est vu au premier essai
 * réel : l'app avait vérifié au lancement — rien de neuf à cet instant — puis
 * une version a été publiée dans la minute, et plus aucun lancement ne
 * regardait le flux pendant six heures. Une mise à jour publiée juste après un
 * démarrage restait donc invisible une demi-journée.
 *
 * Le compte est vite fait : la vérification n'a lieu qu'une fois par démarrage
 * à froid, et coûte deux requêtes (l'API, puis `raw_url`). Même une dizaine
 * d'appareils derrière la même adresse restent très loin du plafond. Ce délai
 * ne sert donc qu'à absorber les fermetures/réouvertures en rafale.
 */
const CHECK_INTERVAL_MS = 15 * 60 * 1000;

/** Version publiée, strictement plus récente que celle installée. */
export type UpdateInfo = PublishedVersion;

/** Nom du canal d'installation, tel qu'il s'appelle sur l'appareil. */
export const INSTALL_CHANNEL = Platform.OS === 'ios' ? 'Kospor Injection' : 'G-Store';

/**
 * Lien direct vers la fiche TwitNinf dans G-Store (Android).
 *
 * Un lien implicite `gstore://` plutôt qu'un intent explicite : Android 11
 * cloisonne la visibilité des paquets, et viser `com.gstore` nommément
 * exigerait de le déclarer en `<queries>` ici. Le schéma marche sans rien
 * déclarer, et échoue proprement si G-Store n'est pas installé — d'où le
 * repli sur la page web ci-dessous.
 */
export const STORE_DEEP_LINK = 'gstore://app/com.gasleboss.TwitNin';

/** Page d'installation publique, quand G-Store n'est pas encore sur l'appareil. */
export const STORE_WEB_URL = 'https://api.twitninf.fr/static/gstore/';

/**
 * Interroge le flux et renvoie la version publiée si elle est plus récente que
 * celle installée. `null` couvre tous les autres cas — y compris les pannes,
 * volontairement indistinguables d'un « rien de neuf » du point de vue de
 * l'appelant.
 */
/**
 * Le flux est un petit JSON servi par GitHub : 10 s suffisent largement, et
 * au-delà il vaut mieux rendre la main que retarder le démarrage.
 */
async function fetchJson(url: string): Promise<any | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Catalogue G-Store — la source de verite ANDROID.
 *
 * ── Pourquoi une source par plateforme ───────────────────────────────────────
 * Les deux plateformes partageaient le `buildVersion` du gist, mais seule la
 * CI iOS l'incremente : Android se contentait de l'estampiller. Android ne
 * pouvait donc jamais publier deux fois entre deux sorties iOS, et le serveur
 * refusait la publication (« versionCode 25 deja publie, catalogue : 26 »).
 *
 * Chaque plateforme a maintenant son compteur, dans le flux qui la distribue :
 * le gist pour iOS, le catalogue G-Store pour Android. Ils n'ont plus aucune
 * raison de coincider.
 */
const GSTORE_CATALOG_URL = 'https://api.twitninf.fr/static/gstore/catalog.json';
const ANDROID_PACKAGE = 'com.gasleboss.TwitNin';

async function fetchAndroidUpdate(): Promise<UpdateInfo | null> {
  const catalog = await fetchJson(GSTORE_CATALOG_URL);
  const apps = Array.isArray(catalog?.apps) ? catalog.apps : [];
  const entry = apps.find((a: any) => a?.packageName === ANDROID_PACKAGE);
  const published = Number(entry?.versionCode);

  if (!Number.isFinite(published) || published <= BUILD_VERSION) return null;

  return {
    buildVersion: published,
    label: typeof entry?.versionName === 'string' ? entry.versionName : undefined,
  } as UpdateInfo;
}

async function fetchAvailableUpdate(): Promise<UpdateInfo | null> {
  if (!BUILD_VERSION) return null;

  // Android ne lit plus le gist : il interroge le store qui le distribue.
  if (Platform.OS === 'android') {
    try {
      return await fetchAndroidUpdate();
    } catch {
      return null;
    }
  }

  if (!FEED_URL) return null;

  try {
    const payload = await fetchJson(FEED_URL);
    if (!payload) return null;

    // Cas nominal en production : l'API GitHub renvoie `apps.json` TRONQUÉ
    // (contenu vide) parce que le gist héberge aussi l'IPA. Il faut alors
    // suivre `raw_url` — sans quoi le flux paraît illisible et l'app se croit
    // à jour pour toujours. Voir `manifestRawUrl`.
    if (extractManifest(payload)) {
      return findNewerVersion(payload, BUILD_VERSION);
    }

    const rawUrl = manifestRawUrl(payload);
    if (!rawUrl) return null;

    const raw = await fetchJson(rawUrl);
    return raw ? findNewerVersion(raw, BUILD_VERSION) : null;
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
  // Android n'a pas besoin de FEED_URL : son flux est le catalogue G-Store.
  if (!BUILD_VERSION) return null;
  if (Platform.OS !== 'android' && !FEED_URL) return null;

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
