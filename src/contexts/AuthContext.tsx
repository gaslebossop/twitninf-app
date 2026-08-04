import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {  } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiService from '../services/api';
import tokenStore from '../services/tokenStore';
import { resetToRoot } from '../navigation/NavigationService';
import { registerForPushNotifications } from '../services/push';
import { toast } from '../components/ui/Toast';

interface User {
  id: string;
  username: string;
  full_name: string;
  email?: string;
  phone?: string;
  avatar?: string;
  bio?: string | null;
  created_at?: string;
  verified?: boolean;
  premium?: boolean;
  subscription_tier?: 'free' | 'plus' | 'pro';
  subscription_expires_at?: string | null;
  verification_style?: string;
  is_private_account?: boolean;
  // Informations de ban
  is_suspended?: boolean;
  ban_count?: number;
  suspension_reason?: string;
  suspended_until?: string;
  // Permissions admin
  role?: 'user' | 'moderator' | 'admin' | 'super_admin';
  is_admin?: boolean;
  stream_key?: string;
}

/**
 * Métadonnées d'affichage d'un compte enregistré.
 *
 * ⚠️ Ne contient PLUS de jeton : l'access token et le refresh token de chaque
 * compte vivent dans le keystore (voir services/tokenStore). Auparavant la
 * liste complète — jetons compris — était sérialisée en clair dans
 * AsyncStorage, et chaque changement de compte supprimait le refresh token
 * commun, ce qui rendait les comptes secondaires irrécupérables à expiration.
 */
interface UserAccount {
  id: string;
  username: string;
  full_name: string;
  avatar?: string;
  verified?: boolean;
  verification_style?: string;
  premium?: boolean;
  subscription_tier?: 'free' | 'plus' | 'pro';
  subscription_expires_at?: string | null;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  // Informations de ban
  isUserBanned: boolean;
  isUserSuspended: boolean;
  banInfo: {
    is_suspended: boolean;
    ban_count: number;
    suspension_reason?: string;
    suspended_until?: string;
  } | null;
  // Permissions admin
  isAdmin: boolean;
  isModerator: boolean;
  hasAdminAccess: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; message: string }>;
  register: (username: string, fullName: string, password: string) => Promise<{ success: boolean; message: string }>;
  logout: () => void;
  checkAuthStatus: () => Promise<void>;
  refreshCurrentUser: () => Promise<void>;
  accounts: UserAccount[];
  switchAccount: (userId: string) => Promise<void>;
  addAccountByCredentials: (username: string, password: string) => Promise<{ success: boolean; message: string }>;
  removeAccount: (userId: string) => Promise<void>;
  clearAllAccountsAndLogout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [accounts, setAccounts] = useState<UserAccount[]>([]);

  // Calculer les informations de ban
  const isUserBanned = user ? (user.ban_count || 0) >= 5 : false;
  const isUserSuspended = user ? (user.is_suspended || false) : false;
  const banInfo = user ? {
    is_suspended: user.is_suspended || false,
    ban_count: user.ban_count || 0,
    suspension_reason: user.suspension_reason,
    suspended_until: user.suspended_until
  } : null;

  // Permissions admin réelles. Le `|| true` de la phase de test donnait un
  // accès admin/modérateur à tout le monde côté client.
  const isAdmin = user
    ? Boolean(user.is_admin || user.role === 'admin' || user.role === 'super_admin')
    : false;
  const isModerator = user
    ? isAdmin || user.role === 'moderator'
    : false;
  const hasAdminAccess = isAdmin || isModerator;

  // v2 : les jetons ont quitté cette liste pour le keystore.
  const ACCOUNTS_KEY = 'accounts_v2';
  const LEGACY_ACCOUNTS_KEY = 'accounts_v1';

  // Fonction pour envoyer le token de notification au serveur
  const sendNotificationToken = async () => {
    try {
      console.log('AuthContext - Envoi token notification');
      const projectId = '341da021-111f-4a0c-9f54-0b5f4c9c3965';
      const notificationToken = await registerForPushNotifications(projectId);
      
      if (notificationToken) {
        console.log('AuthContext - Token obtenu envoi serveur');
        await apiService.updateNotificationToken(notificationToken);
        console.log('AuthContext - Token notification envoye');
      } else {
        console.log('AuthContext - Pas de token notification');
      }
    } catch (error) {
      console.error('AuthContext - Erreur envoi token:', error);
    }
  };

  const readAccountsFromStorage = async (): Promise<UserAccount[]> => {
    try {
      const raw = await AsyncStorage.getItem(ACCOUNTS_KEY);
      if (!raw) return [];
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  };

  /**
   * Reprend une liste `accounts_v1` (jetons en clair) : les jetons d'accès
   * sont déplacés vers le keystore et les métadonnées réécrites en v2.
   * Ces comptes n'ont pas de refresh token — ils resteront valides jusqu'à
   * expiration de leur access token, puis demanderont une reconnexion.
   */
  const migrateLegacyAccounts = async () => {
    try {
      const raw = await AsyncStorage.getItem(LEGACY_ACCOUNTS_KEY);
      if (!raw) return;

      const legacy = JSON.parse(raw);
      if (Array.isArray(legacy)) {
        const migrated: UserAccount[] = [];
        for (const acct of legacy) {
          if (!acct?.id) continue;
          const { token, ...meta } = acct;
          if (token) await tokenStore.setAccountTokens(acct.id, token, null);
          migrated.push(meta as UserAccount);
        }
        if (migrated.length > 0) {
          await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(migrated));
        }
      }

      await AsyncStorage.removeItem(LEGACY_ACCOUNTS_KEY);
    } catch {}
  };

  const loadAccounts = async () => {
    const list = await readAccountsFromStorage();
    setAccounts(list);
  };

  const saveAccounts = async (list: UserAccount[]) => {
    setAccounts(list);
    try {
      await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
    } catch {}
  };

  /** Enregistre les métadonnées d'un compte et, si fournis, ses jetons. */
  const upsertAccount = async (
    account: UserAccount,
    tokens?: { token: string; refreshToken?: string | null }
  ) => {
    if (tokens?.token) {
      await tokenStore.setAccountTokens(
        account.id,
        tokens.token,
        tokens.refreshToken ?? null
      );
    }

    const current = await readAccountsFromStorage();
    const idx = current.findIndex((a) => a.id === account.id);
    const next = [...current];
    if (idx >= 0) next[idx] = account;
    else next.unshift(account);
    await saveAccounts(next);
  };

  /** Métadonnées d'affichage extraites d'un objet utilisateur. */
  const toAccountMeta = (u: any): UserAccount => ({
    id: u.id,
    username: u.username,
    full_name: u.full_name,
    avatar: u.avatar,
    verified: u.verified,
    verification_style: u.verification_style,
    premium: u.premium,
    subscription_tier: u.subscription_tier,
    subscription_expires_at: u.subscription_expires_at,
  });

  /**
   * Bascule la session active sur les jetons d'un compte enregistré, et
   * mémorise les jetons du compte qu'on quitte pour pouvoir y revenir.
   */
  const activateAccount = async (accountId: string): Promise<boolean> => {
    const previousId = user?.id;
    if (previousId && previousId !== accountId) {
      const [access, refresh] = await Promise.all([
        apiService.getSessionAccessTokenValue(),
        apiService.getSessionRefreshToken(),
      ]);
      if (access) await tokenStore.setAccountTokens(previousId, access, refresh);
    }

    const { token, refreshToken } = await tokenStore.getAccountTokens(accountId);
    if (!token) return false;

    await apiService.setSessionAccessToken(token, refreshToken);
    return true;
  };

  // Vérifier le statut d'authentification au démarrage
  useEffect(() => {
    (async () => {
      await tokenStore.migrateLegacyStorage();
      await migrateLegacyAccounts();
      await loadAccounts();
      await checkAuthStatus();
    })();
  }, []);

  // L'api service prévient quand une session est définitivement perdue
  // (refresh refusé par le serveur) : c'est le seul chemin de déconnexion
  // automatique. Une simple panne réseau ne déclenche rien.
  useEffect(() => {
    apiService.setSessionExpiredHandler(() => {
      setUser(null);
      setIsAuthenticated(false);
    });
    return () => apiService.setSessionExpiredHandler(null);
  }, []);

  const checkAuthStatus = async () => {
    try {
      const token = await tokenStore.getAccessToken();

      if (!token) {
        setUser(null);
        setIsAuthenticated(false);
        return;
      }

      await apiService.setSessionAccessToken(token);

      // `getCurrentUser` passe par makeRequest : un 401 y déclenche déjà un
      // rafraîchissement puis un rejeu. On n'arrive ici avec un utilisateur
      // nul que si la session est réellement perdue ou si l'API est
      // injoignable — d'où la distinction ci-dessous.
      const currentUser = await apiService.getCurrentUser();

      if (currentUser) {
        setUser(currentUser);
        setIsAuthenticated(true);
        return;
      }

      // Dernier recours explicite avant de déconnecter.
      const renewed = await apiService.refreshToken();
      if (renewed) {
        const retried = await apiService.getCurrentUser();
        if (retried) {
          setUser(retried);
          setIsAuthenticated(true);
          return;
        }
      }

      setUser(null);
      setIsAuthenticated(false);
    } catch (error) {
      // Erreur réseau au démarrage : on NE détruit PAS les jetons. L'ancienne
      // version les effaçait ici, ce qui déconnectait au moindre démarrage
      // hors ligne.
      console.error('AuthContext - checkAuthStatus:', error);
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (username: string, password: string) => {
    try {
      console.log('AuthContext - login: Debut');
      const response = await apiService.login({ username, password });
      
      if (response.success && response.data) {
        const { token, refreshToken, user: userData } = response.data as any;
        await apiService.setSessionAccessToken(token, refreshToken ?? null);
        setUser(userData);
        setIsAuthenticated(true);
        await upsertAccount(toAccountMeta(userData), { token, refreshToken });

        await sendNotificationToken();

        return { success: true, message: 'Connexion réussie' };
      } else {
        const errorMessage = response.message || 'Échec de connexion';
        console.log('AuthContext - login: Echec connexion:', errorMessage);
        return { success: false, message: errorMessage };
      }
    } catch (error: any) {
      console.error('AuthContext - login: Erreur:', error);
      
      let errorMessage = 'Une erreur est survenue lors de la connexion';
      
      if (error.message) {
        if (error.message.includes('{')) {
          try {
            const jsonMatch = error.message.match(/\{.*\}/);
            if (jsonMatch) {
              const errorJson = JSON.parse(jsonMatch[0]);
              if (errorJson.message) {
                errorMessage = errorJson.message;
              }
            }
          } catch {
            errorMessage = error.message.replace(/^HTTP \d+: /, '').replace(/\{.*\}/, '').trim();
          }
        } else {
          errorMessage = error.message.replace(/^HTTP \d+: /, '').trim();
        }
      }
      
      return { success: false, message: errorMessage };
    }
  };

  const register = async (username: string, fullName: string, password: string) => {
    try {
      console.log('AuthContext - register: Debut');
      const response = await apiService.register({ 
        username, 
        fullName, 
        password
      });
      
      if (response.success && response.data) {
        const { token, refreshToken, user: userData } = response.data as any;
        await apiService.setSessionAccessToken(token, refreshToken ?? null);
        setUser(userData);
        setIsAuthenticated(true);
        await upsertAccount(toAccountMeta(userData), { token, refreshToken });

        await sendNotificationToken();

        return { success: true, message: 'Inscription réussie' };
      } else {
        const errorMessage = response.message || 'Échec d\'inscription';
        console.log('AuthContext - register: Echec inscription:', errorMessage);
        return { success: false, message: errorMessage };
      }
    } catch (error: any) {
      console.error('AuthContext - register: Erreur:', error);
      
      let errorMessage = 'Une erreur est survenue lors de l\'inscription';
      
      if (error.message) {
        if (error.message.includes('{')) {
          try {
            const jsonMatch = error.message.match(/\{.*\}/);
            if (jsonMatch) {
              const errorJson = JSON.parse(jsonMatch[0]);
              if (errorJson.message) {
                errorMessage = errorJson.message;
              }
            }
          } catch {
            errorMessage = error.message.replace(/^HTTP \d+: /, '').replace(/\{.*\}/, '').trim();
          }
        } else {
          errorMessage = error.message.replace(/^HTTP \d+: /, '').trim();
        }
      }
      
      return { success: false, message: errorMessage };
    }
  };

  const logout = async () => {
    const currentId = user?.id;
    try {
      // Révoque la session côté serveur (uniquement celle-ci : les autres
      // comptes enregistrés restent utilisables).
      await apiService.logout();
    } catch {}

    if (currentId) await tokenStore.removeAccountTokens(currentId);

    setUser(null);
    setIsAuthenticated(false);
  };

  const switchAccount = async (userId: string) => {
    try {
      const fromStorage = await readAccountsFromStorage();
      const merged = fromStorage.length > 0 ? fromStorage : accounts;
      if (fromStorage.length > 0) setAccounts(fromStorage);

      const account = merged.find((a) => a.id === userId);
      if (!account) {
        toast.error('Ce compte est introuvable.');
        return;
      }

      const activated = await activateAccount(userId);
      if (!activated) {
        toast.error('Session expirée', {
          description: `Reconnecte-toi à @${account.username} pour continuer.`,
        });
        return;
      }

      const me = await apiService.getCurrentUser();
      if (!me) {
        toast.error('Session expirée', {
          description: `Reconnecte-toi à @${account.username} pour continuer.`,
        });
        return;
      }

      setUser(me);
      setIsAuthenticated(true);

      // Les jetons peuvent avoir tourné pendant getCurrentUser : on
      // resynchronise ceux du compte avec la session active.
      const [access, refresh] = await Promise.all([
        apiService.getSessionAccessTokenValue(),
        apiService.getSessionRefreshToken(),
      ]);
      await upsertAccount(
        toAccountMeta(me),
        access ? { token: access, refreshToken: refresh } : undefined
      );

      resetToRoot();
    } catch (error) {
      console.error('AuthContext - switchAccount:', error);
      toast.error('Impossible de changer de compte.');
    }
  };

  const addAccountByCredentials = async (username: string, password: string) => {
    try {
      // Mémoriser les jetons du compte courant avant de basculer, sinon
      // `login()` les écrase et le compte quitté devient irrécupérable.
      const previousId = user?.id;
      if (previousId) {
        const [access, refresh] = await Promise.all([
          apiService.getSessionAccessTokenValue(),
          apiService.getSessionRefreshToken(),
        ]);
        if (access) await tokenStore.setAccountTokens(previousId, access, refresh);
      }

      const response = await apiService.login({ username, password });
      if (response.success && response.data) {
        const { token, refreshToken, user: userData } = response.data as any;

        await upsertAccount(toAccountMeta(userData), { token, refreshToken });
        await apiService.setSessionAccessToken(token, refreshToken ?? null);
        setUser(userData);
        setIsAuthenticated(true);

        await sendNotificationToken();

        resetToRoot();
        return { success: true, message: 'Compte ajouté' };
      }
      return { success: false, message: response.message || 'Échec de l\'ajout du compte' };
    } catch (e: any) {
      return { success: false, message: e?.message || 'Erreur' };
    }
  };

  const removeAccount = async (userId: string) => {
    const current = await readAccountsFromStorage();
    const next = current.filter((a) => a.id !== userId);
    await saveAccounts(next);

    const wasActive = user?.id === userId;

    if (wasActive) {
      // Révoquer la session serveur du compte retiré avant d'en activer un autre.
      try { await apiService.logout(); } catch {}
    }
    await tokenStore.removeAccountTokens(userId);

    if (!wasActive) return;

    for (const candidate of next) {
      if (await activateAccount(candidate.id)) {
        const me = await apiService.getCurrentUser();
        if (me) {
          setUser(me);
          setIsAuthenticated(true);
          resetToRoot();
          return;
        }
      }
    }

    setUser(null);
    setIsAuthenticated(false);
    await apiService.setSessionAccessToken(null, null);
  };

  const clearAllAccountsAndLogout = async () => {
    const current = await readAccountsFromStorage();
    try { await apiService.logout(); } catch {}
    await Promise.all(current.map((a) => tokenStore.removeAccountTokens(a.id)));
    await apiService.setSessionAccessToken(null, null);
    setUser(null);
    setIsAuthenticated(false);
    await saveAccounts([]);
  };

  // Mémoïsé : sans cela, cet objet est recréé à chaque rendu du provider et
  // fait re-rendre l'intégralité de l'arbre applicatif.
  const value = React.useMemo(
    () => ({
      user,
      isAuthenticated,
      isLoading,
      isUserBanned,
      isUserSuspended,
      banInfo,
      isAdmin,
      isModerator,
      hasAdminAccess,
      login,
      register,
      logout,
      checkAuthStatus,
      refreshCurrentUser: checkAuthStatus,
      accounts,
      switchAccount,
      addAccountByCredentials,
      removeAccount,
      clearAllAccountsAndLogout,
    }),
    [user, isAuthenticated, isLoading, accounts]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
