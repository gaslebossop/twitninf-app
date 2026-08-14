/**
 * Lecture du flux de versions AltStore — logique pure, sans dépendance à
 * React Native ni au stockage.
 *
 * Séparé de `updateCheck.ts` pour être exécutable hors application : c'est ici
 * que vit la comparaison qui décide si un appareil est périmé, et une erreur à
 * cet endroit se voit mal (soit personne n'est jamais prévenu, soit tout le
 * monde est harcelé sur une version pourtant à jour). Voir
 * `tests/update-feed.test.js`.
 */

export interface PublishedVersion {
  /** Compteur strictement croissant, seul champ qui fait autorité. */
  buildVersion: number;
  /** Libellé humain (« 1.1.0 »), purement décoratif. */
  label: string | null;
  /** Date de publication ISO. */
  date: string | null;
}

/**
 * Extrait le manifeste AltStore de la charge utile reçue.
 *
 * Deux formes sont acceptées : l'`apps.json` brut, et la réponse de l'API
 * GitHub qui l'enveloppe dans `files['apps.json'].content` sous forme de
 * chaîne. C'est cette seconde forme qu'utilise la CI, parce qu'elle fonctionne
 * sur un gist secret sans avoir à connaître le compte propriétaire.
 *
 * Renvoie `null` quand l'API a TRONQUÉ le contenu — voir `manifestRawUrl`,
 * qui donne alors l'adresse à suivre.
 */
export function extractManifest(payload: any): any | null {
  if (!payload || typeof payload !== 'object') return null;
  if (Array.isArray(payload.apps)) return payload;

  const content = payload.files?.['apps.json']?.content;
  if (typeof content !== 'string' || content === '') return null;

  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed?.apps) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Adresse de repli quand l'API GitHub n'a pas inclus le contenu du fichier.
 *
 * Ce n'est pas un cas exotique : c'est ce que le gist de production renvoie.
 * L'API tronque le contenu des fichiers dès que le gist est volumineux — or
 * celui-ci héberge l'IPA (~27 Mo) à côté d'`apps.json`. Le champ arrive donc
 * avec `truncated: true` et une chaîne VIDE, alors même qu'`apps.json` ne pèse
 * que 1,3 Ko. Sans ce repli, la détection de mise à jour ne fonctionnerait
 * jamais en production — et échouerait silencieusement, puisqu'un flux
 * illisible est traité comme « rien de neuf ».
 */
export function manifestRawUrl(payload: any): string | null {
  const file = payload?.files?.['apps.json'];
  const rawUrl = file?.raw_url;
  return typeof rawUrl === 'string' && rawUrl ? rawUrl : null;
}

/** Version la plus récemment publiée, ou `null` si le flux est inexploitable. */
export function readPublishedVersion(payload: any): PublishedVersion | null {
  const manifest = extractManifest(payload);
  const published = manifest?.apps?.[0]?.versions?.[0];
  if (!published) return null;

  // `buildVersion` est stocké en chaîne par AltStore ; un flux corrompu peut
  // aussi le perdre en route. Sans entier exploitable, aucune comparaison
  // honnête n'est possible — mieux vaut ne rien annoncer.
  const buildVersion = Number(published.buildVersion);
  if (!Number.isFinite(buildVersion)) return null;

  return {
    buildVersion,
    label: typeof published.version === 'string' ? published.version : null,
    date: typeof published.date === 'string' ? published.date : null,
  };
}

/**
 * La version publiée est-elle plus récente que celle installée ?
 *
 * Renvoie `null` — et non `false` — quand l'estampille installée est absente ou
 * illisible : c'est le cas d'un build local ou d'Expo Go, où la question n'a
 * pas de sens. Un `false` laisserait croire que la comparaison a eu lieu.
 */
export function findNewerVersion(
  payload: any,
  installedBuildVersion: string | number | null | undefined,
): PublishedVersion | null {
  if (installedBuildVersion === null || installedBuildVersion === undefined) return null;
  if (installedBuildVersion === '') return null;

  const installed = Number(installedBuildVersion);
  if (!Number.isFinite(installed)) return null;

  const published = readPublishedVersion(payload);
  if (!published) return null;

  return published.buildVersion > installed ? published : null;
}
