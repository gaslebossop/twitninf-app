import { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { navigationRef } from '../navigation/NavigationService';
import { WEB_BASE_URL } from '../config/webUrl';

/**
 * Ouverture de l'app depuis un lien.
 *
 * Deux sources, une seule cible : le schéma privé `twitninf://…` (utilisé par
 * le retour de connexion G) et les adresses HTTPS du site — celles qu'on met
 * dans un partage. Sur Android, les App Links vérifiés (voir
 * `assetlinks.json` servi par twitninf.fr et `android.intentFilters` dans
 * app.config.js) font que le lien HTTPS ouvre l'app au lieu du navigateur.
 *
 * ── Pourquoi pas la prop `linking` de React Navigation ──────────────────
 * Elle exige de décrire le chemin complet de chaque écran dans un arbre
 * imbriqué (racine → MainApp → onglets → pile). Cet arbre-ci est profond et
 * bouge ; une description désynchronisée échoue en silence, sans erreur, et
 * le lien ne fait alors « rien ». Deux routes à ouvrir ne justifient pas ce
 * risque : on lit l'URL et on navigue nous-mêmes.
 */

export interface DeepLinkTarget {
  screen: 'TweetDetail' | 'UserProfile';
  params: Record<string, string>;
}

const WEB_HOSTS = new Set(
  [WEB_BASE_URL, 'https://twitninf.fr', 'https://www.twitninf.fr', 'https://web.twitninf.fr']
    .map((origin) => {
      try {
        return new URL(origin).host;
      } catch {
        return '';
      }
    })
    .filter(Boolean),
);

/** Rend la destination d'un lien, ou `null` si l'app n'a rien à en faire. */
export function parseDeepLink(rawUrl: string): DeepLinkTarget | null {
  if (!rawUrl) return null;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const scheme = url.protocol.replace(/:$/, '').toLowerCase();
  if (scheme === 'https' && !WEB_HOSTS.has(url.host)) return null;
  if (scheme !== 'https' && !/^(twitninf|exp(\+[a-z0-9._-]+)?)$/i.test(scheme)) return null;

  // `twitninf://tweet/123` met « tweet » dans le HOST et non dans le chemin :
  // un schéma privé n'a pas d'autorité. On recompose donc les segments à
  // partir des deux, sinon tous les liens du schéma privé sont ignorés.
  const segments = [
    ...(scheme === 'https' ? [] : [url.host]),
    ...url.pathname.split('/'),
  ].map((segment) => decodeURIComponent(segment).trim()).filter(Boolean);

  if (segments.length < 2) return null;
  const [kind, value] = segments;

  if (kind === 'tweet' || kind === 'tweets') return { screen: 'TweetDetail', params: { tweetId: value } };
  if (kind === 'profile' || kind === 'user') return { screen: 'UserProfile', params: { username: value } };

  return null;
}

/**
 * Ouvre l'écran demandé par un lien, une fois l'app prête ET connectée.
 *
 * Un lien reçu trop tôt n'est pas perdu : il attend. C'est le cas courant —
 * un utilisateur déconnecté qui ouvre un lien partagé doit d'abord passer par
 * la connexion, et c'est seulement après qu'il doit atterrir sur le tweet.
 */
export function useDeepLinkNavigation(isAuthenticated: boolean, isNavigationReady: boolean) {
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Lien qui a DÉMARRÉ l'app (l'app n'était pas lancée).
    Linking.getInitialURL()
      .then((url) => {
        if (!cancelled && url) setPendingUrl(url);
      })
      .catch(() => undefined);

    // Lien reçu alors que l'app tourne déjà.
    const subscription = Linking.addEventListener('url', ({ url }) => setPendingUrl(url));
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!pendingUrl || !isAuthenticated || !isNavigationReady) return;
    if (!navigationRef.isReady()) return;

    const target = parseDeepLink(pendingUrl);
    setPendingUrl(null);
    if (!target) return;

    // `navigationRef` est typé `any` (voir NavigationService) mais la
    // signature surchargée de `navigate` refuse deux arguments élargis.
    (navigationRef.navigate as (screen: string, params?: object) => void)(target.screen, target.params);
  }, [pendingUrl, isAuthenticated, isNavigationReady]);
}
