import { resolveServerUrl } from './serverUrl';

/**
 * Adresse du client WEB — la seule surface qu'un lien partagé peut ouvrir.
 *
 * Distincte de `EXPO_PUBLIC_API_URL` : l'API et le site sont deux hôtes
 * (`api.twitninf.fr` / `twitninf.fr`), et un lien de partage doit mener au
 * site, pas à une réponse JSON.
 *
 * Le repli est le domaine de production, pas une adresse morte : contrairement
 * à l'API, une valeur absente ne doit pas désactiver le partage — d'où le
 * silence à la place de l'avertissement « mode hors ligne ».
 */
const resolved = resolveServerUrl(
  process.env.EXPO_PUBLIC_WEB_URL,
  'EXPO_PUBLIC_WEB_URL',
  'https://twitninf.fr',
  () => {},
);

export const WEB_BASE_URL = resolved.url.replace(/\/$/, '');

/** Lien public d'un tweet. Doit suivre la route `/tweet/:id` de twitninf-web. */
export function webTweetUrl(tweetId: string): string {
  return `${WEB_BASE_URL}/tweet/${tweetId}`;
}

/** Lien public d'un compte. Doit suivre la route `/profile/:username`. */
export function webProfileUrl(username: string): string {
  return `${WEB_BASE_URL}/profile/${encodeURIComponent(username)}`;
}
