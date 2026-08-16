/**
 * Le rappel de nuit : « il est tard, va dormir ».
 *
 * Une suggestion, jamais un verrou. On ne sait pas pourquoi quelqu'un ouvre
 * l'app à minuit — il travaille de nuit, il est dans un autre fuseau, il ne
 * dort pas. Bloquer l'accès serait une décision qui ne nous appartient pas ;
 * on dit ce qu'on a à dire, et on s'efface dès qu'on a été entendu.
 *
 * Le report est stocké sur l'appareil et pas côté serveur : c'est un réglage
 * de confort qui dépend de l'heure LOCALE, et l'heure locale d'un appareil
 * n'est connue que de lui.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Horodatage (ms) jusqu'auquel on ne redit rien. */
const CLE_REPORT = 'nuit_report_jusqua';

/** Bornes de la nuit, en heure locale de l'appareil. */
export const DEBUT_NUIT = 23;
export const FIN_NUIT = 5;

/** Durée du report quand on choisit « encore une heure ». */
export const REPORT_MS = 60 * 60 * 1000;

/**
 * Sommes-nous dans la plage de nuit ?
 *
 * La plage enjambe minuit : `heure >= 23 || heure < 5`. Écrite avec un `&&`,
 * elle ne serait jamais vraie — c'est l'erreur classique sur un intervalle qui
 * traverse la fin de journée.
 */
export function estNuit(maintenant: Date = new Date()): boolean {
  const heure = maintenant.getHours();
  return heure >= DEBUT_NUIT || heure < FIN_NUIT;
}

/**
 * Le prochain lever, c'est-à-dire la fin de la nuit en cours.
 *
 * Avant minuit, c'est 5 h le lendemain ; après minuit, 5 h le jour même. Sert
 * au report de « bonne nuit » : la question ne doit pas se reposer si l'app
 * est rouverte vingt minutes plus tard.
 */
export function finDeNuit(maintenant: Date = new Date()): number {
  const fin = new Date(maintenant);
  fin.setHours(FIN_NUIT, 0, 0, 0);
  if (maintenant.getHours() >= DEBUT_NUIT) fin.setDate(fin.getDate() + 1);
  return fin.getTime();
}

/**
 * Faut-il afficher le rappel maintenant ?
 *
 * Ne lit que l'appareil : aucun appel réseau, pour que la réponse soit connue
 * avant la première image et que la page n'arrive pas en retard par-dessus le
 * fil déjà affiché.
 */
export async function doitRappeler(maintenant: Date = new Date()): Promise<boolean> {
  if (!estNuit(maintenant)) return false;
  try {
    const brut = await AsyncStorage.getItem(CLE_REPORT);
    const jusqua = brut ? Number(brut) : 0;
    // `Number('')` vaut 0 et `Number('abc')` vaut NaN : les deux doivent se
    // lire comme « aucun report », pas comme une comparaison au hasard.
    if (Number.isFinite(jusqua) && jusqua > maintenant.getTime()) return false;
  } catch {
    // Un stockage illisible ne doit pas empêcher le rappel : au pire il
    // réapparaît une fois de trop, ce qui est moins grave que de disparaître.
  }
  return true;
}

/** « Encore une heure. » */
export async function reporterUneHeure(maintenant: Date = new Date()): Promise<void> {
  await ecrireReport(maintenant.getTime() + REPORT_MS);
}

/** « Bonne nuit » — plus rien jusqu'au matin. */
export async function reporterJusquAuMatin(maintenant: Date = new Date()): Promise<void> {
  await ecrireReport(finDeNuit(maintenant));
}

async function ecrireReport(jusqua: number): Promise<void> {
  try {
    await AsyncStorage.setItem(CLE_REPORT, String(jusqua));
  } catch {
    // Sans écriture, le rappel se reposera au prochain lancement. C'est
    // ennuyeux, jamais bloquant : rien ne doit dépendre de ce succès.
  }
}

/** Remet le rappel à zéro. Utilisé par les réglages et les tests. */
export async function oublierReport(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CLE_REPORT);
  } catch {
    /* sans effet */
  }
}
