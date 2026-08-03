import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Stockage des jetons d'authentification dans le keystore de l'appareil.
 *
 * Auparavant l'access token, le refresh token et la liste complète des comptes
 * (avec leurs jetons) vivaient en clair dans AsyncStorage — lisible par
 * n'importe quel accès au sandbox de l'app sur un appareil rooté ou via une
 * sauvegarde. Tout passe désormais par SecureStore, avec une migration
 * unique et silencieuse des anciennes valeurs.
 *
 * SecureStore n'accepte pas de valeurs illimitées sur Android (2 048 octets
 * par entrée) : la liste des comptes est donc découpée en un index (métadonnées
 * non sensibles, dans AsyncStorage) + un jeton par compte dans le keystore.
 */

export const ACCESS_TOKEN_KEY = 'auth_token';
export const REFRESH_TOKEN_KEY = 'refresh_token';

const MIGRATION_FLAG = 'secure_token_migration_v1';

async function secureGet(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function secureSet(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    // Keystore indisponible (émulateur sans verrou d'écran, etc.).
    // On ne retombe volontairement PAS sur AsyncStorage : perdre la session
    // vaut mieux que réintroduire des jetons en clair sur disque.
  }
}

async function secureDelete(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {}
}

/** Clé keystore du jeton de rafraîchissement d'un compte donné. */
function accountRefreshKey(accountId: string): string {
  return `acct_refresh_${String(accountId).replace(/[^A-Za-z0-9._-]/g, '_')}`;
}

/** Clé keystore du jeton d'accès d'un compte donné. */
function accountAccessKey(accountId: string): string {
  return `acct_access_${String(accountId).replace(/[^A-Za-z0-9._-]/g, '_')}`;
}

export const tokenStore = {
  async getAccessToken(): Promise<string | null> {
    return secureGet(ACCESS_TOKEN_KEY);
  },

  async getRefreshToken(): Promise<string | null> {
    return secureGet(REFRESH_TOKEN_KEY);
  },

  async setTokens(access: string | null, refresh?: string | null): Promise<void> {
    if (access) await secureSet(ACCESS_TOKEN_KEY, access);
    else await secureDelete(ACCESS_TOKEN_KEY);

    if (refresh !== undefined) {
      if (refresh) await secureSet(REFRESH_TOKEN_KEY, refresh);
      else await secureDelete(REFRESH_TOKEN_KEY);
    }
  },

  async clear(): Promise<void> {
    await secureDelete(ACCESS_TOKEN_KEY);
    await secureDelete(REFRESH_TOKEN_KEY);
  },

  // ── Jetons par compte (multi-compte) ────────────────────────────────────────

  async getAccountTokens(
    accountId: string
  ): Promise<{ token: string | null; refreshToken: string | null }> {
    const [token, refreshToken] = await Promise.all([
      secureGet(accountAccessKey(accountId)),
      secureGet(accountRefreshKey(accountId)),
    ]);
    return { token, refreshToken };
  },

  async setAccountTokens(
    accountId: string,
    token: string | null,
    refreshToken: string | null
  ): Promise<void> {
    if (token) await secureSet(accountAccessKey(accountId), token);
    else await secureDelete(accountAccessKey(accountId));

    if (refreshToken) await secureSet(accountRefreshKey(accountId), refreshToken);
    else await secureDelete(accountRefreshKey(accountId));
  },

  async removeAccountTokens(accountId: string): Promise<void> {
    await secureDelete(accountAccessKey(accountId));
    await secureDelete(accountRefreshKey(accountId));
  },

  /**
   * Déplace les jetons hérités d'AsyncStorage vers le keystore.
   * Idempotent : à appeler une fois au démarrage, avant toute requête.
   */
  async migrateLegacyStorage(): Promise<void> {
    try {
      if (await AsyncStorage.getItem(MIGRATION_FLAG)) return;

      const [legacyAccess, legacyRefresh] = await Promise.all([
        AsyncStorage.getItem(ACCESS_TOKEN_KEY),
        AsyncStorage.getItem(REFRESH_TOKEN_KEY),
      ]);

      if (legacyAccess) await secureSet(ACCESS_TOKEN_KEY, legacyAccess);
      if (legacyRefresh) await secureSet(REFRESH_TOKEN_KEY, legacyRefresh);

      await AsyncStorage.multiRemove([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY]);
      await AsyncStorage.setItem(MIGRATION_FLAG, '1');
    } catch {
      // Une migration ratée n'est pas fatale : l'utilisateur se reconnectera.
    }
  },
};

export default tokenStore;
