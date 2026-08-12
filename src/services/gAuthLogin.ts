import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { API_CONFIG } from '../config/api';
import apiService from './api';

/**
 * Connexion / association de compte via g-auth, côté app.
 *
 * Le flux est piloté par le serveur (voir api: services/gAuthService.js) : on
 * ouvre juste le navigateur système sur /start et on récupère l'URL de retour
 * — ni PKCE ni secret client ici.
 *
 * L'URI de retour est calculée avec `Linking.createURL()`, jamais codée en
 * dur. Le schéma natif `twitninf://` (app.config.js) n'existe que dans un
 * build natif — Expo Go a déjà le sien (`exp://…`) et ignore complètement
 * celui déclaré côté app, donc un `twitninf://…` fixe ne serait jamais
 * intercepté là-bas. `Linking.createURL()` résout le bon schéma dans les deux
 * cas, à l'exécution.
 */

const REDIRECT_PATH = 'g-auth-callback';

export type GAuthLoginResult =
  | { type: 'success'; token: string; refreshToken: string; isNewAccount: boolean }
  | { type: 'error'; message: string }
  | { type: 'cancel' };

export type GAuthLinkResult =
  | { type: 'linked'; bonus: number }
  | { type: 'already_linked' }
  | { type: 'taken' }
  | { type: 'error'; message: string }
  | { type: 'cancel' };

function errorMessageFor(code: string | null): string {
  switch (code) {
    case 'access_denied':
      return 'Connexion à G annulée.';
    case 'missing_code':
    case 'server_error':
      return "La connexion à G n'a pas pu aboutir. Réessaie.";
    default:
      return 'La connexion à G a échoué.';
  }
}

async function runAuthSession(startUrl: string, redirectUri: string) {
  const result = await WebBrowser.openAuthSessionAsync(startUrl, redirectUri);
  if (result.type !== 'success' || !('url' in result) || !result.url) return null;
  return new URL(result.url).searchParams;
}

export async function signInWithGAuth(): Promise<GAuthLoginResult> {
  const redirectUri = Linking.createURL(REDIRECT_PATH);
  // Toujours demander le choix de compte : sans ça, g-auth reprend
  // silencieusement la session déjà active dans le navigateur système et
  // l'utilisateur ne voit jamais la liste de ses comptes G ni l'option d'en
  // ajouter un autre — même la toute première fois où il n'y a qu'un compte.
  const startUrl =
    `${API_CONFIG.BASE_URL}/api/auth/g-auth/start` +
    `?intent=login&prompt=select_account&mobile_redirect=${encodeURIComponent(redirectUri)}`;

  const params = await runAuthSession(startUrl, redirectUri);
  if (!params) return { type: 'cancel' };

  const error = params.get('error');
  if (error) return { type: 'error', message: errorMessageFor(error) };

  const token = params.get('token');
  const refreshToken = params.get('refreshToken');
  if (!token || !refreshToken) {
    return { type: 'error', message: 'Réponse de connexion G incomplète.' };
  }

  return { type: 'success', token, refreshToken, isNewAccount: params.get('isNewAccount') === '1' };
}

export async function linkGAuthAccount(): Promise<GAuthLinkResult> {
  const tokenResponse = await apiService.getGAuthLinkToken();
  const linkToken = tokenResponse.data?.linkToken;
  if (!tokenResponse.success || !linkToken) {
    return { type: 'error', message: "Impossible de préparer l'association à G." };
  }

  const redirectUri = Linking.createURL(REDIRECT_PATH);
  // Même raison qu'à la connexion : sans ce paramètre, g-auth reprend
  // silencieusement la session déjà ouverte dans le navigateur système et
  // associe au dernier compte utilisé, sans jamais montrer la liste.
  const startUrl =
    `${API_CONFIG.BASE_URL}/api/auth/g-auth/start` +
    `?intent=link&prompt=select_account&link_token=${encodeURIComponent(linkToken)}` +
    `&mobile_redirect=${encodeURIComponent(redirectUri)}`;

  const params = await runAuthSession(startUrl, redirectUri);
  if (!params) return { type: 'cancel' };

  const error = params.get('error');
  if (error) return { type: 'error', message: errorMessageFor(error) };

  const status = params.get('status');
  const bonus = Number(params.get('bonus') || '0');

  if (status === 'linked') return { type: 'linked', bonus };
  if (status === 'already_linked') return { type: 'already_linked' };
  if (status === 'taken' || status === 'account_already_linked_elsewhere') return { type: 'taken' };
  return { type: 'error', message: "L'association à G a échoué." };
}
