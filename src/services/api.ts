import AsyncStorage from '@react-native-async-storage/async-storage';
import { 
  AuthResponse, 
  LoginRequest, 
  RegisterRequest, 
  User, 
  ApiResponse,
  Tweet,
  CreateTweetRequest,
  UpdateTweetRequest,
  TweetsResponse,
  TweetResponse,
  TweetTranslationsResponse,
  BatchTranslationsResponse,
  ReadingLanguageResponse,
  Notification,
  NotificationWithRelations,
  NotificationSettings,
  SearchQuery,
  UserSearchQuery,
  TweetSearchQuery,
  HashtagSearchQuery,
  TrendingQuery,
  SearchResults,
  TrendingHashtag,
  PaginationInfo,
  NotificationsResponse,
  SearchResponse,
  TrendingResponse,
  RecommendationRequest,
  RecommendationResponse,
  RecommendationFeedback,
  RecommendationStats,
  UserSuggestionsResponse
} from '../types/api';
import { API_CONFIG } from '../config/api';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { io } from 'socket.io-client';
import { buildClientHeaders, primeDeviceId } from './clientIdentity';
import tokenStore from './tokenStore';

/**
 * Issue d'une tentative de rafraîchissement.
 * - `renewed`  : nouveaux jetons en place, la requête peut être rejouée.
 * - `rejected` : le serveur a refusé le jeton (révoqué/expiré) → déconnexion.
 * - `unavailable` : réseau ou serveur injoignable → NE PAS déconnecter.
 */
type RefreshOutcome = 'renewed' | 'rejected' | 'unavailable';

class ApiService {
  public token: string | null = null;
  private searchSummarySocket: any | null = null;
  private searchSummarySocketConnecting: Promise<any> | null = null;

  // Une seule tentative de rafraîchissement en vol à la fois. Sans ce verrou,
  // N requêtes concurrentes prenant un 401 déclencheraient N rafraîchissements
  // parallèles ; la rotation côté serveur invaliderait alors les jetons les uns
  // après les autres et déconnecterait l'utilisateur — exactement le bug qu'on
  // cherche à supprimer.
  private refreshInFlight: Promise<RefreshOutcome> | null = null;

  // Notifié quand la session est définitivement perdue (refresh refusé).
  private onSessionExpired: (() => void) | null = null;

  constructor() {
    primeDeviceId();
    // Initialiser le token au démarrage
    this.initializeToken();
    // Preconnect pour reduire la latence du premier stream IA
    if (API_CONFIG.IS_CONFIGURED) {
      this.ensureSearchSummarySocketConnected().catch(() => {});
    }
  }

  private async ensureSearchSummarySocketConnected(): Promise<any> {
    if (this.searchSummarySocket?.connected) {
      return this.searchSummarySocket;
    }

    if (this.searchSummarySocketConnecting) {
      return this.searchSummarySocketConnecting;
    }

    if (!this.searchSummarySocket) {
      this.searchSummarySocket = io(API_CONFIG.BASE_URL, {
        transports: ['websocket'],
        timeout: 10000,
        reconnection: true,
        reconnectionAttempts: 5
      });
    }

    this.searchSummarySocketConnecting = new Promise((resolve, reject) => {
      const socket = this.searchSummarySocket;
      const timeout = setTimeout(() => {
        socket.off('connect', onConnect);
        socket.off('connect_error', onConnectError);
        this.searchSummarySocketConnecting = null;
        reject(new Error('Timeout connexion socket resume IA'));
      }, 10000);

      const onConnect = () => {
        clearTimeout(timeout);
        socket.off('connect_error', onConnectError);
        this.searchSummarySocketConnecting = null;
        resolve(socket);
      };

      const onConnectError = (err: any) => {
        clearTimeout(timeout);
        socket.off('connect', onConnect);
        this.searchSummarySocketConnecting = null;
        reject(err || new Error('Erreur connexion socket resume IA'));
      };

      socket.once('connect', onConnect);
      socket.once('connect_error', onConnectError);

      if (!socket.connected) {
        socket.connect();
      } else {
        onConnect();
      }
    });

    return this.searchSummarySocketConnecting;
  }

  private async initializeToken() {
    await tokenStore.migrateLegacyStorage();
    this.token = await tokenStore.getAccessToken();
  }

  /** Enregistre le callback appelé quand la session est irrécupérable. */
  setSessionExpiredHandler(handler: (() => void) | null): void {
    this.onSessionExpired = handler;
  }

  /**
   * Positionne le couple de jetons de la session courante.
   * `refresh` omis → le jeton de rafraîchissement existant est conservé
   * (important lors d'un simple changement de compte actif).
   */
  async setSessionAccessToken(
    token: string | null,
    refresh?: string | null
  ): Promise<void> {
    this.token = token;
    await tokenStore.setTokens(token, refresh);
  }

  async getSessionRefreshToken(): Promise<string | null> {
    return tokenStore.getRefreshToken();
  }

  async getSessionAccessTokenValue(): Promise<string | null> {
    return this.token || (await tokenStore.getAccessToken());
  }

  /**
   * Rafraîchit le couple de jetons. Toutes les requêtes concurrentes
   * partagent la même promesse. Retourne `true` si la session est repartie.
   */
  private async performRefresh(): Promise<RefreshOutcome> {
    if (this.refreshInFlight) return this.refreshInFlight;

    this.refreshInFlight = (async () => {
      try {
        const refresh = await tokenStore.getRefreshToken();
        if (!refresh) return 'rejected';

        const headers = await buildClientHeaders({
          'Content-Type': 'application/json',
        });

        const res = await fetch(`${API_CONFIG.BASE_URL}/api/auth/refresh`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ refreshToken: refresh }),
        });

        // 401/403 → le jeton est révoqué ou expiré : la session est perdue.
        // Un 5xx est en revanche transitoire, on garde la session intacte.
        if (res.status === 401 || res.status === 403) return 'rejected';
        if (!res.ok) return 'unavailable';

        const data = await res.json();
        const newToken = data?.data?.token || data?.token;
        const newRefresh = data?.data?.refreshToken || data?.refreshToken;
        if (!newToken) return 'rejected';

        this.token = newToken;
        await tokenStore.setTokens(newToken, newRefresh ?? refresh);
        return 'renewed';
      } catch {
        // Panne réseau : on ne détruit surtout pas la session.
        return 'unavailable';
      } finally {
        this.refreshInFlight = null;
      }
    })();

    return this.refreshInFlight;
  }

  // Méthode publique pour forcer la récupération du token
  // async refreshToken() {
  //   this.token = await AsyncStorage.getItem('auth_token');
  //   console.log('🔄 Token rafraîchi:', this.token ? 'Présent' : 'Absent');
  //   return this.token;
  // }

  // Méthode publique pour les requêtes génériques
  async request(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      body?: any;
      requiresAuth?: boolean;
      token?: string;
      timeout?: number;
    } = {}
  ): Promise<any> {
    return this.makeRequest(endpoint, options);
  }

  // Méthodes de commodité pour les requêtes HTTP
  async get(endpoint: string, params?: any, requiresAuth: boolean = true, timeout?: number): Promise<any> {
    const queryString = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request(`${endpoint}${queryString}`, { method: 'GET', requiresAuth, timeout });
  }

  async post(endpoint: string, data?: any, requiresAuth: boolean = true, timeout?: number): Promise<any> {
    return this.request(endpoint, { method: 'POST', body: data, requiresAuth, timeout });
  }

  async put(endpoint: string, data?: any, requiresAuth: boolean = true): Promise<any> {
    return this.request(endpoint, { method: 'PUT', body: data, requiresAuth });
  }

  async patch(endpoint: string, data?: any, requiresAuth: boolean = true): Promise<any> {
    return this.request(endpoint, { method: 'PUT', body: data, requiresAuth });
  }

  async delete(endpoint: string, requiresAuth: boolean = true): Promise<any> {
    return this.request(endpoint, { method: 'DELETE', requiresAuth });
  }

  /** Transforme une réponse HTTP en échec en objet ApiResponse normalisé. */
  private async parseErrorResponse(response: Response): Promise<any> {
    const errorText = await response.text();

    try {
      const errorJson = JSON.parse(errorText);

      // Normaliser : l'API retourne parfois "error" au lieu de "message"
      if (errorJson.error && !errorJson.message) {
        errorJson.message = errorJson.error;
      }

      if (errorJson.message) {
        // Si il y a des erreurs de validation détaillées, les formater
        if (Array.isArray(errorJson.errors) && errorJson.errors.length > 0) {
          return {
            success: false,
            message: errorJson.errors.map((err: any) => err.msg).join('. '),
            errors: errorJson.errors,
          };
        }
        return { success: false, message: errorJson.message };
      }

      if (errorJson.success) return errorJson;
      return { success: false, message: 'Erreur inconnue' };
    } catch {
      return { success: false, message: 'Erreur de communication avec le serveur' };
    }
  }

  /** Exécute un aller-retour HTTP unique, avec annulation réelle au timeout. */
  private async executeRequest(
    url: string,
    method: string,
    headers: Record<string, string>,
    body: any,
    timeoutMs: number
  ): Promise<Response> {
    // AbortController plutôt que Promise.race : sans lui, la requête continuait
    // en arrière-plan après le timeout et alimentait pour rien les compteurs
    // de cadence côté anti-fraude.
    const controller = new AbortController();
    const timer =
      timeoutMs > 0
        ? setTimeout(() => controller.abort(), timeoutMs)
        : null;

    try {
      return await fetch(url, {
        method,
        headers,
        signal: controller.signal,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // Méthode générique pour faire des requêtes avec timeout
  private async makeRequest(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      body?: any;
      requiresAuth?: boolean;
      token?: string;
      timeout?: number;
    } = {}
  ): Promise<any> {
    const { method = 'GET', body, requiresAuth = false, token: providedToken, timeout: customTimeout } = options;

    const url = `${API_CONFIG.BASE_URL}${endpoint}`;
    const timeoutMs = typeof customTimeout === 'number' ? customTimeout : API_CONFIG.TIMEOUT;

    // Les routes d'authentification ne doivent jamais déclencher de
    // rafraîchissement ni de déconnexion : un 401 y signifie simplement
    // « identifiants incorrects ».
    const isAuthEndpoint = /\/(login|register|refresh)\b/.test(url);

    const baseHeaders = await buildClientHeaders({
      'Content-Type': 'application/json',
    });

    const buildHeaders = async (): Promise<Record<string, string>> => {
      const headers = { ...baseHeaders };
      if (!requiresAuth) return headers;

      let authToken = providedToken;
      if (!authToken) {
        if (!this.token) this.token = await tokenStore.getAccessToken();
        authToken = this.token || undefined;
      }
      if (authToken) headers.Authorization = `Bearer ${authToken}`;
      return headers;
    };

    try {
      let response = await this.executeRequest(
        url,
        method,
        await buildHeaders(),
        body,
        timeoutMs
      );

      // ── Interception du 401 : rafraîchir puis rejouer une seule fois ────────
      // C'est le correctif central des déconnexions silencieuses : la branche
      // `!response.ok` retournait auparavant immédiatement, si bien que le
      // rafraîchissement n'était jamais tenté.
      if (
        response.status === 401 &&
        requiresAuth &&
        !isAuthEndpoint &&
        !providedToken
      ) {
        const outcome = await this.performRefresh();

        if (outcome === 'renewed') {
          response = await this.executeRequest(
            url,
            method,
            await buildHeaders(),
            body,
            timeoutMs
          );
        } else if (outcome === 'rejected') {
          await this.clearAuthTokens();
          this.onSessionExpired?.();
          return { success: false, message: 'Session expirée', sessionExpired: true };
        } else {
          // Serveur ou réseau indisponible : on remonte l'échec sans toucher
          // à la session, l'appel suivant réessaiera.
          return { success: false, message: 'Service momentanément indisponible' };
        }
      }

      if (!response.ok) {
        return this.parseErrorResponse(response);
      }

      return await response.json();
    } catch (error: any) {
      const message = String(error?.message || '');

      if (error?.name === 'AbortError') {
        throw new Error('Timeout de la requête');
      }

      if (
        message.includes('Network request failed') ||
        message.includes('Network Error') ||
        message.includes('fetch') ||
        message.includes('ENOTFOUND') ||
        message.includes('ECONNREFUSED')
      ) {
        throw new Error('Erreur de connectivité réseau. Vérifiez votre connexion internet et que l\'API est accessible.');
      }

      throw error;
    }
  }

  // Test de connectivité simple
  async testConnection(): Promise<boolean> {
    try {
      console.log('🧪 Test de connectivité...');
      const response = await this.makeRequest('/api/health');
      console.log('✅ Connectivité OK:', response);
      return true;
    } catch (error) {
      console.error('❌ Échec de connectivité:', error);
      return false;
    }
  }

  // Test des différentes configurations de routes
  async testRouteConfigurations(): Promise<void> {
    console.log('🔍 Test des configurations de routes...');
    
    const testRoutes = [
      '/api/auth/register',
      '/auth/register',
      '/users/register',
      '/register',
      '/signup'
    ];

    for (const route of testRoutes) {
      try {
        console.log(`🔍 Test de: ${route}`);
        const testUser = {
          username: `testuser_${Date.now()}`,
          fullName: 'Test User',
          email: `test${Date.now()}@example.com`,
          phone: '+33123456789',
          password: 'TestPass123!',
          platform: 'mobile'
        };

        const response = await fetch(`${API_CONFIG.BASE_URL}${route}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Platform': 'mobile',
          },
          body: JSON.stringify(testUser),
        });

        console.log(`📊 Statut ${route}: ${response.status}`);
        
        if (response.ok) {
          const data = await response.text();
          console.log(`✅ Route ${route} fonctionne: ${data.substring(0, 100)}...`);
          return; // Route trouvée
        } else {
          const errorText = await response.text();
          console.log(`❌ Route ${route}: ${errorText}`);
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
        console.log(`❌ Erreur ${route}: ${errorMessage}`);
      }
    }
    
    console.log('❌ Aucune route d\'inscription trouvée');
  }

  // Méthodes d'authentification
  async login(credentials: LoginRequest): Promise<AuthResponse> {
    try {
      console.log('🔐 Tentative de connexion...');
      console.log('👤 Username:', credentials.username);
      
      const response = await this.makeRequest('/api/auth/login', {
        method: 'POST',
        body: credentials,
      });
      
      console.log('📦 Réponse de connexion:', response);
      
      if (response.success && response.data) {
        await this.setAuthTokens(
          response.data.token,
          response.data.refreshToken
        );
        this.token = response.data.token;
        
        // Stocker les informations de l'utilisateur incluant le rôle
        if (response.data.user) {
          await AsyncStorage.setItem('user_role', response.data.user.role || 'user');
          await AsyncStorage.setItem('user_permissions', JSON.stringify(response.data.user.moderation_permissions || {}));
          console.log('👑 Rôle utilisateur stocké:', response.data.user.role);
        }
        
        console.log('✅ Connexion réussie');
      }
      
      return response;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur de connexion';
      console.error('❌ Erreur de connexion:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  // Récupérer le rôle de l'utilisateur actuel
  async getUserRole(): Promise<string> {
    try {
      const role = await AsyncStorage.getItem('user_role');
      return role || 'user';
    } catch (error) {
      console.error('❌ Erreur lors de la récupération du rôle:', error);
      return 'user';
    }
  }

  // Récupérer les permissions de l'utilisateur actuel
  async getUserPermissions(): Promise<any> {
    try {
      const permissions = await AsyncStorage.getItem('user_permissions');
      return permissions ? JSON.parse(permissions) : {};
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des permissions:', error);
      return {};
    }
  }

  // Vérifier si l'utilisateur a un rôle spécifique
  async hasRole(role: string): Promise<boolean> {
    const userRole = await this.getUserRole();
    return userRole === role;
  }

  // Vérifier si l'utilisateur a une permission spécifique
  async hasPermission(permission: string): Promise<boolean> {
    const permissions = await this.getUserPermissions();
    return permissions[permission] === true;
  }

  // Vérifier si l'utilisateur est modérateur ou plus
  async isModerator(): Promise<boolean> {
    const userRole = await this.getUserRole();
    return ['moderateur', 'admin', 'superadmin', 'classeurdetweets', 'economiegardien'].includes(userRole);
  }

  // Vérifier si l'utilisateur est admin ou plus
  async isAdmin(): Promise<boolean> {
    const userRole = await this.getUserRole();
    return ['admin', 'superadmin'].includes(userRole);
  }

  // Vérifier si l'utilisateur est superadmin
  async isSuperAdmin(): Promise<boolean> {
    const userRole = await this.getUserRole();
    return userRole === 'superadmin';
  }

  async register(userData: RegisterRequest): Promise<AuthResponse> {
    try {
      console.log('📝 Tentative d\'inscription...');
      console.log('👤 Données utilisateur:', userData);
      
      const response = await this.makeRequest('/api/auth/register', {
        method: 'POST',
        body: userData,
      });
      
      console.log('📦 Réponse d\'inscription:', response);
      
      if (response.success && response.data) {
        await this.setAuthTokens(
          response.data.token,
          response.data.refreshToken
        );
        this.token = response.data.token;
        console.log('✅ Inscription réussie');
      }
      
      return response;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur d\'inscription';
      console.error('❌ Erreur d\'inscription:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  async logout(): Promise<void> {
    // Transmettre le refresh token permet au serveur de révoquer CETTE session
    // uniquement : les autres comptes du multi-compte restent connectés.
    const refreshToken = await tokenStore.getRefreshToken();

    try {
      await this.makeRequest('/api/auth/logout', {
        method: 'POST',
        requiresAuth: true,
        body: refreshToken ? { refreshToken } : undefined,
      });
    } catch {
      // Une déconnexion serveur ratée ne doit pas empêcher le nettoyage local.
    } finally {
      await this.clearAuthTokens();
      this.token = null;
    }
  }

  /**
   * Rafraîchissement explicite (appelé par quelques services legacy).
   * Délègue au même verrou que l'interception 401 pour éviter deux rotations
   * concurrentes qui s'annuleraient mutuellement.
   */
  async refreshToken(): Promise<boolean> {
    const outcome = await this.performRefresh();
    if (outcome === 'rejected') {
      await this.clearAuthTokens();
      this.token = null;
      this.onSessionExpired?.();
    }
    return outcome === 'renewed';
  }

  // Méthodes pour les utilisateurs
  async getCurrentUser(): Promise<User | null> {
    try {
      console.log('👤 Récupération de l\'utilisateur actuel...');
      const response = await this.makeRequest('/api/auth/me', {
        requiresAuth: true,
      });
      
      console.log('📡 Réponse API getCurrentUser:', {
        success: response.success,
        message: response.message,
        data: response.data,
        dataType: typeof response.data,
        dataKeys: response.data ? Object.keys(response.data) : 'null'
      });
      
      if (response.success && response.data) {
        console.log('✅ Utilisateur récupéré:', response.data.username);
        
        // Mettre à jour le rôle et les permissions en local pour la cohérence
        if (response.data.role) {
          await AsyncStorage.setItem('user_role', response.data.role);
        }
        if (response.data.moderation_permissions) {
          await AsyncStorage.setItem('user_permissions', JSON.stringify(response.data.moderation_permissions));
        }

        return response.data;
      } else {
        console.log('❌ Échec de récupération de l\'utilisateur');
        return null;
      }
    } catch (error) {
      console.error('❌ Erreur lors de la récupération de l\'utilisateur:', error);
      return null;
    }
  }

  async updateProfile(userData: Partial<User>): Promise<ApiResponse<User>> {
    try {
      console.log('📝 Mise à jour du profil...');
      const response = await this.makeRequest('/api/auth/profile', {
        method: 'PUT',
        body: userData,
        requiresAuth: true,
      });
      console.log('✅ Profil mis à jour');
      return response;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur de mise à jour du profil';
      console.error('❌ Erreur de mise à jour du profil:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  async uploadUserAvatar(fileUri: string): Promise<ApiResponse<{ url: string }>> {
    try {
      // Préparer FormData
      const formData = new FormData();
      const fileName = fileUri.split('/').pop() || `avatar_${Date.now()}.jpg`;
      const file: any = {
        uri: fileUri,
        name: fileName,
        type: 'image/jpeg',
      };
      formData.append('avatar', file);

      const endpoint = `${API_CONFIG.BASE_URL}/api/users/me/avatar`;

      // Auth header
      if (!this.token) {
        this.token = await tokenStore.getAccessToken();
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          ...(await buildClientHeaders()),
          Authorization: this.token ? `Bearer ${this.token}` : '',
          // Ne pas définir Content-Type pour laisser fetch gérer le boundary multipart
        } as any,
        body: formData as any,
      });

      const text = await res.text();
      let json: any;
      try { json = JSON.parse(text); } catch { json = { success: res.ok, message: text }; }
      if (!res.ok) {
        return { success: false, message: json?.message || `HTTP ${res.status}` } as any;
      }
      return json;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de l\'upload de l\'avatar';
      console.error('❌ Erreur upload avatar:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      } as any;
    }
  }

  async uploadUserBanner(fileUri: string): Promise<ApiResponse<{ url: string }>> {
    try {
      const formData = new FormData();
      const fileName = fileUri.split('/').pop() || `banner_${Date.now()}.jpg`;
      const file: any = {
        uri: fileUri,
        name: fileName,
        type: 'image/jpeg',
      };
      formData.append('banner', file);

      const endpoint = `${API_CONFIG.BASE_URL}/api/users/me/banner`;

      if (!this.token) {
        this.token = await tokenStore.getAccessToken();
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          ...(await buildClientHeaders()),
          Authorization: this.token ? `Bearer ${this.token}` : '',
        } as any,
        body: formData as any,
      });

      const text = await res.text();
      let json: any;
      try { json = JSON.parse(text); } catch { json = { success: res.ok, message: text }; }
      if (!res.ok) {
        return { success: false, message: json?.message || `HTTP ${res.status}` } as any;
      }
      return json;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de l\'upload de la bannière';
      console.error('❌ Erreur upload bannière:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      } as any;
    }
  }

  /**
   * Envoie une pièce jointe (image ou message vocal) dans une conversation.
   * Upload à la main (comme `uploadUserAvatar`/`uploadUserBanner`) : `fetch`
   * doit poser lui-même la frontière multipart.
   */
  async sendMessageAttachment(
    conversationId: string,
    fileUri: string,
    options: { kind: 'image' | 'audio'; durationMs?: number; waveform?: number[] },
  ): Promise<ApiResponse<{ message: any }>> {
    try {
      const isAudio = options.kind === 'audio';
      const fallbackName = `message_${Date.now()}.${isAudio ? 'm4a' : 'jpg'}`;
      const name = fileUri.split('/').pop() || fallbackName;

      const form = new FormData();
      form.append('media', {
        uri: fileUri,
        name,
        type: isAudio ? 'audio/m4a' : 'image/jpeg',
      } as any);
      if (isAudio && options.durationMs) {
        form.append('duration_ms', String(Math.round(options.durationMs)));
      }
      if (isAudio && Array.isArray(options.waveform) && options.waveform.length > 0) {
        form.append('waveform', JSON.stringify(options.waveform));
      }

      if (!this.token) {
        this.token = await tokenStore.getAccessToken();
      }

      const res = await fetch(
        `${API_CONFIG.BASE_URL}/api/messages/conversations/${conversationId}/messages/attachment`,
        {
          method: 'POST',
          headers: {
            ...(await buildClientHeaders()),
            Authorization: this.token ? `Bearer ${this.token}` : '',
          } as any,
          body: form as any,
        },
      );

      const text = await res.text();
      let json: any;
      try { json = JSON.parse(text); } catch { json = { success: res.ok, message: text }; }
      if (!res.ok) {
        return { success: false, message: json?.message || `HTTP ${res.status}` } as any;
      }
      return json;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de l\'envoi de la pièce jointe';
      console.error('❌ Erreur envoi pièce jointe message:', errorMessage);
      return { success: false, message: errorMessage } as any;
    }
  }

  // Méthodes utilitaires
  async isAuthenticated(): Promise<boolean> {
    return !!(await tokenStore.getAccessToken());
  }

  private async setAuthTokens(token: string, refreshToken: string): Promise<void> {
    this.token = token;
    await tokenStore.setTokens(token, refreshToken);
  }

  private async clearAuthTokens(): Promise<void> {
    this.token = null;
    await tokenStore.clear();
  }

  // Méthode pour obtenir l'état de la connexion
  getConnectionStatus(): { isConnected: boolean; baseURL: string } {
    return {
      isConnected: !!this.token,
      baseURL: API_CONFIG.BASE_URL
    };
  }

  // ========================================
  // MÉTHODES POUR LES TWEETS
  // ========================================

  async getTweets(params?: {
    limit?: number;
    offset?: number;
    type?: 'all' | 'tweets' | 'replies' | 'retweets' | 'quotes';
    sort?: 'latest' | 'popular' | 'trending' | 'recommended' | 'personalized' | 'ultra_recommended' | 'smart_recommended';
    algorithm?: string;
  }): Promise<TweetsResponse> {
    try {
      console.log('🐦 Récupération des tweets...');
      const queryParams = new URLSearchParams();
      if (params?.limit) queryParams.append('limit', params.limit.toString());
      if (params?.offset) queryParams.append('offset', params.offset.toString());
      if (params?.type) queryParams.append('type', params.type);
      if (params?.sort) queryParams.append('sort', params.sort);
      if (params?.algorithm) queryParams.append('algorithm', params.algorithm);

      const endpoint = `/api/tweets${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await this.makeRequest(endpoint, { requiresAuth: true });
    //  console.log('✅ Tweets récupérés');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la récupération des tweets';
      console.error('❌ Erreur de récupération des tweets:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  async getTweet(id: string): Promise<TweetResponse> {
    try {
      console.log(`🐦 Récupération du tweet ${id}...`);
      const response = await this.makeRequest(`/api/tweets/${id}`, { requiresAuth: true });
      console.log('✅ Tweet récupéré');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la récupération du tweet';
      console.error('❌ Erreur de récupération du tweet:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  async createTweet(tweetData: CreateTweetRequest): Promise<TweetResponse> {
    try {
      console.log('🐦 Création d\'un nouveau tweet...');
      const response = await this.makeRequest('/api/tweets', {
        method: 'POST',
        body: tweetData,
        requiresAuth: true,
      });
      console.log('✅ Tweet créé');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la création du tweet';
      console.error('❌ Erreur de création du tweet:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  /**
   * Traductions IA d'un tweet (« Traduction bêta »).
   *
   * Appelée à la demande, quand le lecteur ouvre le sélecteur de langue :
   * les traductions ne voyagent pas dans le fil, ce qui multiplierait par
   * onze le poids de chaque page de tweets.
   */
  async getTweetTranslations(id: string): Promise<TweetTranslationsResponse> {
    try {
      const response = await this.makeRequest(`/api/tweets/${id}/translations`, {
        method: 'GET',
        requiresAuth: true,
      });
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la récupération des traductions';
      console.error('❌ Erreur de récupération des traductions:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      } as TweetTranslationsResponse;
    }
  }

  /**
   * Traductions de plusieurs tweets dans une seule langue.
   * Un appel par page de fil, pas un par carte.
   */
  async getTweetTranslationsBatch(
    tweetIds: string[],
    language: string,
  ): Promise<BatchTranslationsResponse> {
    try {
      const response = await this.makeRequest('/api/tweets/translations/batch', {
        method: 'POST',
        body: { tweet_ids: tweetIds, language },
        requiresAuth: true,
      });
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la récupération des traductions';
      console.error('❌ Erreur traductions groupées:', errorMessage);
      return { success: false, message: errorMessage, errors: [] } as BatchTranslationsResponse;
    }
  }

  /** Langue de lecture actuelle + catalogue des 11 langues. */
  async getReadingLanguage(): Promise<ReadingLanguageResponse> {
    try {
      return await this.makeRequest('/api/users/me/language', {
        method: 'GET',
        requiresAuth: true,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la récupération de la langue';
      return { success: false, message: errorMessage, errors: [] } as ReadingLanguageResponse;
    }
  }

  async setReadingLanguage(language: string): Promise<ApiResponse<{ preferred_language: string }>> {
    try {
      return await this.makeRequest('/api/users/me/language', {
        method: 'PUT',
        body: { language },
        requiresAuth: true,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de l\'enregistrement de la langue';
      console.error('❌ Erreur enregistrement langue:', errorMessage);
      return { success: false, message: errorMessage, errors: [] };
    }
  }

  async updateTweet(id: string, tweetData: UpdateTweetRequest): Promise<TweetResponse> {
    try {
      console.log(`🐦 Mise à jour du tweet ${id}...`);
      const response = await this.makeRequest(`/api/tweets/${id}`, {
        method: 'PUT',
        body: tweetData,
        requiresAuth: true,
      });
      console.log('✅ Tweet mis à jour');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la mise à jour du tweet';
      console.error('❌ Erreur de mise à jour du tweet:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  async deleteTweet(id: string): Promise<ApiResponse> {
    try {
      console.log(`🐦 Suppression du tweet ${id}...`);
      const response = await this.makeRequest(`/api/tweets/${id}`, {
        method: 'DELETE',
        requiresAuth: true,
      });
      console.log('✅ Tweet supprimé');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la suppression du tweet';
      console.error('❌ Erreur de suppression du tweet:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  async likeTweet(id: string): Promise<ApiResponse<{ liked: boolean }>> {
    try {
      console.log(`❤️ Like du tweet ${id}...`);
      const response = await this.makeRequest(`/api/tweets/${id}/like`, {
        method: 'POST',
        requiresAuth: true,
      });
      console.log('✅ Tweet liké/unliké');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors du like du tweet';
      console.error('❌ Erreur de like du tweet:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  async retweet(id: string, comment?: string): Promise<ApiResponse<{ retweeted: boolean }>> {
    try {
      console.log(`🔄 Retweet du tweet ${id}...`);
      const body = comment ? { comment } : {};
      const response = await this.makeRequest(`/api/tweets/${id}/retweet`, {
        method: 'POST',
        body,
        requiresAuth: true,
      });
      console.log('✅ Tweet retweeté');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors du retweet';
      console.error('❌ Erreur de retweet:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  /**
   * Incrémenter les vues de plusieurs tweets en une seule requête (optimisé)
   */
  async incrementTweetViews(tweetIds: string[]): Promise<ApiResponse<{ updated: number }>> {
    try {
      console.log(`👁️ Incrémentation des vues pour ${tweetIds.length} tweets...`);
      const response = await this.makeRequest('/api/tweets/views/increment', {
        method: 'POST',
        body: { tweetIds },
        requiresAuth: true,
      });
      console.log('✅ Vues incrémentées');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de l\'incrémentation des vues';
      console.error('❌ Erreur d\'incrémentation des vues:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  async getTweetLikes(id: string, params?: { limit?: number; offset?: number }): Promise<ApiResponse<{ likes: any[]; pagination: PaginationInfo }>> {
    try {
      console.log(`❤️ Récupération des likes du tweet ${id}...`);
      const queryParams = new URLSearchParams();
      if (params?.limit) queryParams.append('limit', params.limit.toString());
      if (params?.offset) queryParams.append('offset', params.offset.toString());

      const endpoint = `/api/tweets/${id}/likes${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await this.makeRequest(endpoint);
      console.log('✅ Likes récupérés');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la récupération des likes';
      console.error('❌ Erreur de récupération des likes:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  async getTweetRetweets(id: string, params?: { limit?: number; offset?: number }): Promise<ApiResponse<{ retweets: any[]; pagination: PaginationInfo }>> {
    try {
      console.log(`🔄 Récupération des retweets du tweet ${id}...`);
      const queryParams = new URLSearchParams();
      if (params?.limit) queryParams.append('limit', params.limit.toString());
      if (params?.offset) queryParams.append('offset', params.offset.toString());

      const endpoint = `/api/tweets/${id}/retweets${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await this.makeRequest(endpoint);
      console.log('✅ Retweets récupérés');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la récupération des retweets';
      console.error('❌ Erreur de récupération des retweets:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  async getTweetReplies(id: string, params?: { limit?: number; offset?: number; nested?: boolean }): Promise<ApiResponse<{ replies: Tweet[]; pagination: PaginationInfo }>> {
    try {
      console.log(`💬 Récupération des réponses du tweet ${id}...`);
      const queryParams = new URLSearchParams();
      if (params?.limit) queryParams.append('limit', params.limit.toString());
      if (params?.offset) queryParams.append('offset', params.offset.toString());
      if (params?.nested) queryParams.append('nested', 'true');

      const endpoint = `/api/tweets/${id}/replies${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await this.makeRequest(endpoint, { requiresAuth: true });
      console.log('✅ Réponses récupérées');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la récupération des réponses';
      console.error('❌ Erreur de récupération des réponses:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  async getSimilarTweets(id: string): Promise<ApiResponse<Tweet[]>> {
    try {
      console.log(`🔍 Récupération des tweets similaires pour ${id}...`);
      const endpoint = `/api/tweets/${id}/similar`;
      const response = await this.makeRequest(endpoint, { requiresAuth: true });
      console.log('✅ Tweets similaires récupérés');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la récupération des tweets similaires';
      console.error('❌ Erreur de récupération des tweets similaires:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  // ========================================
  // MÉTHODES POUR LES NOTIFICATIONS
  // ========================================

  async getNotifications(params?: {
    limit?: number;
    offset?: number;
    unread_only?: boolean;
    type?: 'all' | 'like' | 'retweet' | 'reply' | 'mention' | 'follow' | 'unfollow' | 'quote' | 'system' | 'verification' | 'premium';
  }): Promise<NotificationsResponse> {
    try {
      console.log('🔔 Récupération des notifications...');
      const queryParams = new URLSearchParams();
      if (params?.limit) queryParams.append('limit', params.limit.toString());
      if (params?.offset) queryParams.append('offset', params.offset.toString());
      if (params?.unread_only) queryParams.append('unread_only', params.unread_only.toString());
      if (params?.type) queryParams.append('type', params.type);

      const endpoint = `/api/notifications${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await this.makeRequest(endpoint, { requiresAuth: true });
     // console.log('✅ Notifications récupérées');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la récupération des notifications';
      console.error('❌ Erreur de récupération des notifications:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  async getUnreadNotificationsCount(): Promise<ApiResponse<{ unread_count: number }>> {
    try {
      console.log('🔔 Récupération du nombre de notifications non lues...');
      const response = await this.makeRequest('/api/notifications/unread-count', { requiresAuth: true });
      console.log('✅ Nombre de notifications non lues récupéré');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la récupération du nombre de notifications';
      console.error('❌ Erreur de récupération du nombre de notifications:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  async getNotification(id: string): Promise<ApiResponse<NotificationWithRelations>> {
    try {
      console.log(`🔔 Récupération de la notification ${id}...`);
      const response = await this.makeRequest(`/api/notifications/${id}`, { requiresAuth: true });
      console.log('✅ Notification récupérée');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la récupération de la notification';
      console.error('❌ Erreur de récupération de la notification:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  async markNotificationAsRead(id: string): Promise<ApiResponse<{ id: string; is_read: boolean; read_at: string }>> {
    try {
      console.log(`🔔 Marquage de la notification ${id} comme lue...`);
      const response = await this.makeRequest(`/api/notifications/${id}/read`, {
        method: 'PUT',
        requiresAuth: true,
      });
      console.log('✅ Notification marquée comme lue');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors du marquage de la notification';
      console.error('❌ Erreur de marquage de la notification:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  async markAllNotificationsAsRead(): Promise<ApiResponse<{ updated_count: number }>> {
    try {
      console.log('🔔 Marquage de toutes les notifications comme lues...');
      const response = await this.makeRequest('/api/notifications/read-all', {
        method: 'PUT',
        requiresAuth: true,
      });
      console.log('✅ Toutes les notifications marquées comme lues');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors du marquage des notifications';
      console.error('❌ Erreur de marquage des notifications:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  async deleteNotification(id: string): Promise<ApiResponse> {
    try {
      console.log(`🔔 Suppression de la notification ${id}...`);
      const response = await this.makeRequest(`/api/notifications/${id}`, {
        method: 'DELETE',
        requiresAuth: true,
      });
      console.log('✅ Notification supprimée');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la suppression de la notification';
      console.error('❌ Erreur de suppression de la notification:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  async clearAllNotifications(type?: 'all' | 'read' | 'unread'): Promise<ApiResponse<{ deleted_count: number }>> {
    try {
      console.log('🔔 Suppression de toutes les notifications...');
      const queryParams = new URLSearchParams();
      if (type) queryParams.append('type', type);

      const endpoint = `/api/notifications/clear-all${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await this.makeRequest(endpoint, {
        method: 'DELETE',
        requiresAuth: true,
      });
      console.log('✅ Toutes les notifications supprimées');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la suppression des notifications';
      console.error('❌ Erreur de suppression des notifications:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  async getNotificationSettings(): Promise<ApiResponse<{ notifications: NotificationSettings }>> {
    try {
      console.log('🔔 Récupération des paramètres de notifications...');
      const response = await this.makeRequest('/api/notifications/settings', { requiresAuth: true });
      console.log('✅ Paramètres de notifications récupérés');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la récupération des paramètres';
      console.error('❌ Erreur de récupération des paramètres:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  async updateNotificationSettings(settings: Partial<NotificationSettings>): Promise<ApiResponse<{ notifications: NotificationSettings }>> {
    try {
      console.log('🔔 Mise à jour des paramètres de notifications...');
      const response = await this.makeRequest('/api/notifications/settings', {
        method: 'PUT',
        body: { notifications: settings },
        requiresAuth: true,
      });
      console.log('✅ Paramètres de notifications mis à jour');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la mise à jour des paramètres';
      console.error('❌ Erreur de mise à jour des paramètres:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  // Méthode pour mettre à jour le token de notification
  async updateNotificationToken(token: string): Promise<ApiResponse<any>> {
    try {
      console.log('🔔 Mise à jour du token de notification...');
      const response = await this.makeRequest('/api/notifications/register-device', {
        method: 'POST',
        body: { expoPushToken: token },
        requiresAuth: true,
      });
      console.log('✅ Token de notification mis à jour');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la mise à jour du token';
      console.error('❌ Erreur de mise à jour du token:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  // ========================================
  // MÉTHODES POUR LA RECHERCHE
  // ========================================

  async search(query: SearchQuery, token?: string): Promise<SearchResponse> {
    try {
      console.log(`🔍 Recherche globale: ${query.q}...`);
      const queryParams = new URLSearchParams();
      queryParams.append('q', query.q);
      if (query.type) queryParams.append('type', query.type);
      if (query.limit) queryParams.append('limit', query.limit.toString());
      if (query.offset) queryParams.append('offset', query.offset.toString());
      if (query.sort) queryParams.append('sort', query.sort);

      const endpoint = `/api/search${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await this.makeRequest(endpoint, { requiresAuth: true, token });
      console.log('✅ Recherche effectuée');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la recherche';
      console.error('❌ Erreur de recherche:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  async searchUsers(query: UserSearchQuery, token?: string): Promise<ApiResponse<{ query: string; users: User[]; pagination: PaginationInfo }>> {
    try {
      console.log(`👥 Recherche d'utilisateurs: ${query.q}...`);
      const queryParams = new URLSearchParams();
      queryParams.append('q', query.q);
      if (query.limit) queryParams.append('limit', query.limit.toString());
      if (query.offset) queryParams.append('offset', query.offset.toString());
      if (query.sort) queryParams.append('sort', query.sort);
      if (query.verified !== undefined) queryParams.append('verified', query.verified.toString());

      const endpoint = `/api/search/users${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await this.makeRequest(endpoint, { requiresAuth: true, token });
      console.log('✅ Recherche d\'utilisateurs effectuée');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la recherche d\'utilisateurs';
      console.error('❌ Erreur de recherche d\'utilisateurs:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  async searchTweets(query: TweetSearchQuery, token?: string): Promise<ApiResponse<{ query: string; tweets: Tweet[]; pagination: PaginationInfo }>> {
    try {
      console.log(`🐦 Recherche de tweets: ${query.q}...`);
      const queryParams = new URLSearchParams();
      queryParams.append('q', query.q);
      if (query.limit) queryParams.append('limit', query.limit.toString());
      if (query.offset) queryParams.append('offset', query.offset.toString());
      if (query.sort) queryParams.append('sort', query.sort);
      if (query.type) queryParams.append('type', query.type);
      if (query.hashtag) queryParams.append('hashtag', query.hashtag);
      if (query.from_user) queryParams.append('from_user', query.from_user);

      // Utiliser la route authentifiée si un token est fourni
      const endpoint = token 
        ? `/api/search/tweets/authenticated${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
        : `/api/search/tweets${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      
      const response = await this.makeRequest(endpoint, { requiresAuth: !!token, token });
      console.log('✅ Recherche de tweets effectuée');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la recherche de tweets';
      console.error('❌ Erreur de recherche de tweets:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  async searchHashtags(query: HashtagSearchQuery, token?: string): Promise<ApiResponse<{ query: string; hashtags: Array<{ tag: string; count: number }>; pagination: PaginationInfo }>> {
    try {
      console.log(`#️⃣ Recherche de hashtags: ${query.q}...`);
      const queryParams = new URLSearchParams();
      queryParams.append('q', query.q);
      if (query.limit) queryParams.append('limit', query.limit.toString());
      if (query.offset) queryParams.append('offset', query.offset.toString());
      if (query.sort) queryParams.append('sort', query.sort);

      const endpoint = `/api/search/hashtags${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await this.makeRequest(endpoint, { requiresAuth: true, token });
      console.log('✅ Recherche de hashtags effectuée');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la recherche de hashtags';
      console.error('❌ Erreur de recherche de hashtags:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  async getTrendingHashtags(query: TrendingQuery): Promise<TrendingResponse> {
    try {
      console.log('🔥 Récupération des hashtags tendance...');
      const queryParams = new URLSearchParams();
      if (query.limit) queryParams.append('limit', query.limit.toString());
      if (query.period) queryParams.append('period', query.period);

      const endpoint = `/api/search/trending${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await this.makeRequest(endpoint);
      console.log('✅ Hashtags tendance récupérés');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la récupération des hashtags tendance';
      console.error('❌ Erreur de récupération des hashtags tendance:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  async getSearchSuggestions(limit?: number): Promise<ApiResponse<{
    following_suggestions: User[];
    hashtag_suggestions: Array<{ tag: string; count: number }>;
  }>> {
    try {
      console.log('💡 Récupération des suggestions de recherche...');
      const queryParams = new URLSearchParams();
      if (limit) queryParams.append('limit', limit.toString());

      const endpoint = `/api/search/suggestions${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await this.makeRequest(endpoint, { requiresAuth: true });
      console.log('✅ Suggestions de recherche récupérées');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la récupération des suggestions';
      console.error('❌ Erreur de récupération des suggestions:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  async streamSearchSummary(
    payload: {
      q: string;
      type?: 'all' | 'users' | 'tweets' | 'trends';
      users?: any[];
      tweets?: any[];
      hashtags?: Array<{ tag: string; count: number }>;
    },
    onChunk: (text: string) => void,
    token?: string
  ): Promise<{ success: boolean; text: string }> {
    try {
      const endpoint = `${API_CONFIG.BASE_URL}/api/search/ai-summary/stream`;

      let authToken = token;
      if (!authToken) {
        if (!this.token) {
          this.token = await tokenStore.getAccessToken();
        }
        authToken = this.token || undefined;
      }

      const headers: Record<string, string> = await buildClientHeaders({
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      });

      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Erreur HTTP ${response.status}`);
      }

      if (!response.body || typeof (response.body as any).getReader !== 'function') {
        throw new Error('Streaming non supporté par cette plateforme');
      }

      const reader = (response.body as any).getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;
      let buffer = '';
      let fullText = '';

      while (!done) {
        const chunk = await reader.read();
        done = chunk.done;
        if (chunk.value) {
          buffer += decoder.decode(chunk.value, { stream: !done });
          const events = buffer.split('\n\n');
          buffer = events.pop() || '';

          for (const rawEvent of events) {
            const lines = rawEvent.split('\n');
            const eventLine = lines.find((line) => line.startsWith('event:'));
            const dataLine = lines.find((line) => line.startsWith('data:'));
            const eventName = eventLine ? eventLine.replace('event:', '').trim() : '';
            const dataRaw = dataLine ? dataLine.replace('data:', '').trim() : '';
            if (!dataRaw) continue;

            let parsed: any = null;
            try {
              parsed = JSON.parse(dataRaw);
            } catch {
              parsed = null;
            }

            if (eventName === 'chunk' && parsed?.text) {
              fullText += parsed.text;
              onChunk(parsed.text);
            }
            if (eventName === 'done' && parsed?.text) {
              fullText = parsed.text;
            }
          }
        }
      }

      return { success: true, text: fullText.trim() };
    } catch (error: any) {
      console.error('❌ Erreur streamSearchSummary:', error);
      return {
        success: false,
        text: ''
      };
    }
  }

  async streamSearchSummaryWs(
    payload: {
      q: string;
      type?: 'all' | 'users' | 'tweets' | 'trends';
      users?: any[];
      tweets?: any[];
      hashtags?: Array<{ tag: string; count: number }>;
    },
    onChunk: (text: string) => void,
    onStatus?: (status: string) => void
  ): Promise<{ success: boolean; text: string }> {
    return new Promise(async (resolve) => {
      const requestId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      let socket: any;
      try {
        socket = await this.ensureSearchSummarySocketConnected();
      } catch {
        resolve({ success: false, text: '' });
        return;
      }

      let finished = false;
      let fullText = '';
      let timeoutRef: ReturnType<typeof setTimeout> | null = null;

      const clean = () => {
        socket.off('search:summary:chunk', onChunkEvent);
        socket.off('search:summary:done', onDoneEvent);
        socket.off('search:summary:error', onErrorEvent);
        socket.off('search:summary:status', onStatusEvent);
        if (timeoutRef) {
          clearTimeout(timeoutRef);
          timeoutRef = null;
        }
      };

      const finalize = (result: { success: boolean; text: string }) => {
        if (finished) return;
        finished = true;
        clean();
        resolve(result);
      };

      const onChunkEvent = (data: any) => {
        if (data?.requestId !== requestId) return;
        const text = data?.text || '';
        if (!text) return;
        fullText += text;
        onChunk(text);
      };

      const onDoneEvent = (data: any) => {
        if (data?.requestId !== requestId) return;
        const finalText = (data?.text || fullText || '').trim();
        finalize({ success: true, text: finalText });
      };

      const onErrorEvent = (data: any) => {
        if (data?.requestId !== requestId) return;
        finalize({ success: false, text: fullText.trim() });
      };

      const onStatusEvent = (data: any) => {
        if (data?.requestId !== requestId) return;
        if (typeof onStatus === 'function' && typeof data?.status === 'string') {
          onStatus(data.status);
        }
      };

      socket.on('search:summary:chunk', onChunkEvent);
      socket.on('search:summary:done', onDoneEvent);
      socket.on('search:summary:error', onErrorEvent);
      socket.on('search:summary:status', onStatusEvent);

      socket.emit('search:summary:start', {
        ...payload,
        requestId
      });

      timeoutRef = setTimeout(() => finalize({ success: false, text: fullText.trim() }), 30000);
    });
  }

  // ========================================
  // MÉTHODES UTILISATEURS ET ABONNEMENTS
  // ========================================

  async getUserProfile(userId: string): Promise<ApiResponse<{ user: User }>> {
    try {
      console.log(`👤 Récupération du profil utilisateur par ID: ${userId}...`);
      const endpoint = `/api/users/${userId}`;
      const response = await this.makeRequest(endpoint, { requiresAuth: true });
      console.log('✅ Profil utilisateur récupéré');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la récupération du profil';
      console.error('❌ Erreur de récupération du profil:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  async getUserProfileByUsername(username: string): Promise<ApiResponse<{ user: User }>> {
    try {
      console.log(`👤 Récupération du profil utilisateur par username: ${username}...`);
      // Toujours utiliser la route authentifiée côté app
      const endpoint = `/api/users/profile/authenticated/${username}`;
      const response = await this.makeRequest(endpoint, { requiresAuth: true });
      console.log('✅ Profil utilisateur récupéré par username');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la récupération du profil par username';
      console.error('❌ Erreur de récupération du profil par username:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  async getUserTweets(userId: string, options: {
    limit?: number;
    offset?: number;
    type?: 'all' | 'tweets' | 'replies' | 'retweets' | 'media' | 'likes';
  } = {}): Promise<ApiResponse<{
    user: User;
    tweets: Tweet[];
    pagination: PaginationInfo;
  }>> {
    try {
   //   console.log(`🐦 Récupération des tweets de l'utilisateur: ${userId}...`);
      const queryParams = new URLSearchParams();
      if (options.limit) queryParams.append('limit', options.limit.toString());
      if (options.offset) queryParams.append('offset', options.offset.toString());
      if (options.type) queryParams.append('type', options.type);

      const endpoint = `/api/users/${userId}/tweets${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await this.makeRequest(endpoint, { requiresAuth: true });
    //  console.log('✅ Tweets de l\'utilisateur récupérés');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la récupération des tweets';
      console.error('❌ Erreur de récupération des tweets:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  async getFollowStatus(userId: string): Promise<ApiResponse<{ isFollowing: boolean; status: 'active' | 'pending' | null }>> {
    try {
      console.log(`🔍 Vérification du statut de suivi: ${userId}...`);
      const endpoint = `/api/users/${userId}/follow-status`;
      const response = await this.makeRequest(endpoint, { requiresAuth: true });
      console.log('✅ Statut de suivi vérifié');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la vérification du statut';
      console.error('❌ Erreur de vérification du statut:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  async getFollowRequests(): Promise<ApiResponse<{ requests: any[] }>> {
    try {
      const response = await this.makeRequest('/api/users/follow-requests', { requiresAuth: true });
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la récupération des demandes de suivi';
      return { success: false, message: errorMessage, errors: [] };
    }
  }

  async acceptFollowRequest(followId: string): Promise<ApiResponse<{ follow: any }>> {
    try {
      const response = await this.makeRequest(`/api/users/follow-requests/${followId}/accept`, {
        method: 'PUT',
        requiresAuth: true
      });
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de l\'acceptation de la demande';
      return { success: false, message: errorMessage, errors: [] };
    }
  }

  async rejectFollowRequest(followId: string): Promise<ApiResponse<null>> {
    try {
      const response = await this.makeRequest(`/api/users/follow-requests/${followId}/reject`, {
        method: 'PUT',
        requiresAuth: true
      });
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors du refus de la demande';
      return { success: false, message: errorMessage, errors: [] };
    }
  }

  async updatePrivacy(isPrivate: boolean): Promise<ApiResponse<User>> {
    return this.updateProfile({ is_private_account: isPrivate });
  }

  async followUser(userId: string): Promise<ApiResponse<{ follow: any }>> {
    try {
      console.log(`➕ Abonnement à l'utilisateur: ${userId}...`);
      const endpoint = `/api/users/${userId}/follow`;
      const response = await this.makeRequest(endpoint, { 
        method: 'POST',
        requiresAuth: true 
      });
      console.log('✅ Abonnement créé');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la création de l\'abonnement';
      console.error('❌ Erreur de création de l\'abonnement:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  async unfollowUser(userId: string): Promise<ApiResponse<null>> {
    try {
      console.log(`➖ Désabonnement de l'utilisateur: ${userId}...`);
      const endpoint = `/api/users/${userId}/follow`;
      const response = await this.makeRequest(endpoint, { 
        method: 'DELETE',
        requiresAuth: true 
      });
      console.log('✅ Désabonnement effectué');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors du désabonnement';
      console.error('❌ Erreur de désabonnement:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  async getUserFollowers(userId: string, options: {
    limit?: number;
    offset?: number;
  } = {}): Promise<ApiResponse<{
    user: User;
    followers: User[];
    pagination: PaginationInfo;
  }>> {
    try {
      console.log(`👥 Récupération des followers: ${userId}...`);
      const queryParams = new URLSearchParams();
      if (options.limit) queryParams.append('limit', options.limit.toString());
      if (options.offset) queryParams.append('offset', options.offset.toString());

      const endpoint = `/api/users/${userId}/followers${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await this.makeRequest(endpoint);
      console.log('✅ Followers récupérés');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la récupération des followers';
      console.error('❌ Erreur de récupération des followers:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  async getUserFollowing(userId: string, options: {
    limit?: number;
    offset?: number;
  } = {}): Promise<ApiResponse<{
    user: User;
    following: User[];
    pagination: PaginationInfo;
  }>> {
    try {
      console.log(`👥 Récupération des abonnements: ${userId}...`);
      const queryParams = new URLSearchParams();
      if (options.limit) queryParams.append('limit', options.limit.toString());
      if (options.offset) queryParams.append('offset', options.offset.toString());

      const endpoint = `/api/users/${userId}/following${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await this.makeRequest(endpoint);
      console.log('✅ Abonnements récupérés');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la récupération des abonnements';
      console.error('❌ Erreur de récupération des abonnements:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  async getFollowSuggestions(limit?: number): Promise<ApiResponse<{ suggestions: User[] }>> {
    try {
      console.log('💡 Récupération des suggestions d\'abonnement...');
      const queryParams = new URLSearchParams();
      if (limit) queryParams.append('limit', limit.toString());

      const endpoint = `/api/users/suggestions${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await this.makeRequest(endpoint, { requiresAuth: true });
      console.log('✅ Suggestions d\'abonnement récupérées');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la récupération des suggestions';
      console.error('❌ Erreur de récupération des suggestions:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  // Méthodes pour l'algorithme de recommandation
  async getRecommendations(options: RecommendationRequest = {}): Promise<RecommendationResponse> {
    try {
      console.log('🚀 Récupération des recommandations...');
      const queryParams = new URLSearchParams();
      
      if (options.limit) queryParams.append('limit', options.limit.toString());
      if (options.offset) queryParams.append('offset', options.offset.toString());
      if (options.algorithm) queryParams.append('algorithm', options.algorithm);
      if (options.includeUser !== undefined) queryParams.append('includeUser', options.includeUser.toString());
      if (options.includeStats !== undefined) queryParams.append('includeStats', options.includeStats.toString());
      if (options.forceRefresh) queryParams.append('forceRefresh', 'true');

      const endpoint = `/api/recommendations${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await this.makeRequest(endpoint, { requiresAuth: true });
      console.log('✅ Recommandations récupérées');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la récupération des recommandations';
      console.error('❌ Erreur de récupération des recommandations:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  // Nouvelle méthode pour récupérer les recommandations des abonnements
  async getFollowingRecommendations(options: { limit?: number; offset?: number } = {}): Promise<RecommendationResponse> {
    try {
      console.log('👥 Récupération des recommandations (Abonnements)...');
      const queryParams = new URLSearchParams();
      
      if (options.limit) queryParams.append('limit', options.limit.toString());
      if (options.offset) queryParams.append('offset', options.offset.toString());

      const endpoint = `/api/recommendations/following${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await this.makeRequest(endpoint, { requiresAuth: true });
      console.log('✅ Recommandations abonnements récupérées');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la récupération des recommandations abonnements';
      console.error('❌ Erreur:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

   // Nouvelle méthode pour récupérer les tweets recommandés avec pagination complète
  async getRecommendedTweets(options: {
    limit?: number;
    offset?: number;
    algorithm?: string;
    type?: string;
    sort?: string;
    context?: string;
    includeUser?: boolean;
    includeStats?: boolean;
    forceRefresh?: boolean;
  } = {}): Promise<ApiResponse<{
    tweets: Tweet[];
    pagination: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
    recommendation: {
      algorithm: string;
      context: string;
      userBehavior: any;
      trends: any;
    };
  }>> {
    try {
      console.log('🚀 Récupération des tweets recommandés...');
      const queryParams = new URLSearchParams();
      
      if (options.limit) queryParams.append('limit', options.limit.toString());
      if (options.offset) queryParams.append('offset', options.offset.toString());
      if (options.algorithm) queryParams.append('algorithm', options.algorithm);
      if (options.type) queryParams.append('type', options.type);
      if (options.sort) queryParams.append('sort', options.sort);
      if (options.context) queryParams.append('context', options.context);
      if (options.includeUser !== undefined) queryParams.append('includeUser', options.includeUser.toString());
      if (options.includeStats !== undefined) queryParams.append('includeStats', options.includeStats.toString());
      if (options.forceRefresh) queryParams.append('forceRefresh', 'true');

      const endpoint = `/api/recommendations/tweets${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await this.makeRequest(endpoint, { requiresAuth: true });
      console.log('✅ Tweets recommandés récupérés');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la récupération des tweets recommandés';
      console.error('❌ Erreur de récupération des tweets recommandés:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  async getRecommendationsByAlgorithm(algorithm: string, options: {
    limit?: number;
    offset?: number;
    includeUser?: boolean;
    includeStats?: boolean;
  } = {}): Promise<RecommendationResponse> {
    try {
      console.log(`🚀 Récupération des recommandations ${algorithm}...`);
      const queryParams = new URLSearchParams();
      
      if (options.limit) queryParams.append('limit', options.limit.toString());
      if (options.offset) queryParams.append('offset', options.offset.toString());
      if (options.includeUser !== undefined) queryParams.append('includeUser', options.includeUser.toString());
      if (options.includeStats !== undefined) queryParams.append('includeStats', options.includeStats.toString());

      const endpoint = `/api/recommendations/algorithm/${algorithm}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await this.makeRequest(endpoint, { requiresAuth: true });
      console.log(`✅ Recommandations ${algorithm} récupérées`);
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : `Erreur lors de la récupération des recommandations ${algorithm}`;
      console.error('❌ Erreur de récupération des recommandations:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  async sendRecommendationFeedback(feedback: RecommendationFeedback): Promise<ApiResponse> {
    try {
      console.log('📊 Envoi du feedback de recommandation...');
      const endpoint = '/api/recommendations/feedback';
      const response = await this.makeRequest(endpoint, {
        method: 'POST',
        body: feedback,
        requiresAuth: true
      });
      console.log('✅ Feedback de recommandation envoyé');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de l\'envoi du feedback';
      console.error('❌ Erreur d\'envoi du feedback:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  /**
   * Récupère des suggestions d'utilisateurs basées sur l'IA et le graphe social.
   * @param limit Nombre maximum de suggestions à retourner.
   */
  async getUserSuggestions(limit: number = 15): Promise<UserSuggestionsResponse> {
    try {
      console.log(`🤖 Récupération des suggestions d'utilisateurs (limit: ${limit})...`);
      const response = await this.makeRequest(`/api/recommendations/user-suggestions?limit=${limit}`, {
        requiresAuth: true
      });
      console.log('✅ Suggestions d\'utilisateurs récupérées');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la récupération des suggestions';
      console.error('❌ Erreur suggestions:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  async getRecommendationStats(): Promise<ApiResponse<RecommendationStats>> {
    try {
      console.log('📊 Récupération des statistiques de recommandation...');
      const endpoint = '/api/recommendations/stats';
      const response = await this.makeRequest(endpoint, { requiresAuth: true });
      console.log('✅ Statistiques de recommandation récupérées');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la récupération des statistiques';
      console.error('❌ Erreur de récupération des statistiques:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  // Méthode spécifique pour le Smart Recommendation Engine
  async getSmartRecommendations(options: {
    limit?: number;
    offset?: number;
    context?: string;
    refreshCache?: boolean;
  } = {}): Promise<ApiResponse<{
    recommendations: Tweet[];
    pagination: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
      nextOffset: number;
      currentPage: number;
    };
    metadata: {
      algorithm: string;
      context: string;
      processingTime: number;
      userProfile: any;
      qualityMetrics: any;
      performance: any;
    };
  }>> {
    try {
      console.log('🧠 Récupération des Smart Recommendations...');
      const queryParams = new URLSearchParams();
      
      if (options.limit) queryParams.append('limit', options.limit.toString());
      if (options.offset) queryParams.append('offset', options.offset.toString());
      if (options.context) queryParams.append('context', options.context);
      if (options.refreshCache) queryParams.append('refreshCache', 'true');

      const endpoint = `/api/recommendations/smart${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await this.makeRequest(endpoint, { requiresAuth: true });
      console.log('✅ Smart Recommendations récupérées');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la récupération des Smart Recommendations';
      console.error('❌ Erreur Smart Recommendations:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  // Statistiques du Smart Engine
  async getSmartEngineStats(): Promise<ApiResponse<any>> {
    try {
      console.log('📊 Récupération des statistiques Smart Engine...');
      const endpoint = '/api/recommendations/smart/stats';
      const response = await this.makeRequest(endpoint, { requiresAuth: true });
      console.log('✅ Statistiques Smart Engine récupérées');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la récupération des statistiques Smart Engine';
      console.error('❌ Erreur statistiques Smart Engine:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  // Méthodes pour l'algorithme de recommandation progressive
  async getProgressiveRecommendations(options: any = {}): Promise<any> {
    try {
      console.log('🚀 Récupération des recommandations progressives...');
      const queryParams = new URLSearchParams();
      
      if (options.limit) queryParams.append('limit', options.limit.toString());
      if (options.offset) queryParams.append('offset', options.offset.toString());
      if (options.includeUser !== undefined) queryParams.append('includeUser', options.includeUser.toString());
      if (options.includeStats !== undefined) queryParams.append('includeStats', options.includeStats.toString());
      if (options.group) queryParams.append('group', options.group);

      const endpoint = `/api/progressive-recommendations${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await this.makeRequest(endpoint, { requiresAuth: true });
      console.log('✅ Recommandations progressives récupérées');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la récupération des recommandations progressives';
      console.error('❌ Erreur de récupération des recommandations progressives:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  async trackProgressiveInteraction(tweetId: string, interactionType: string, metadata: any = {}): Promise<any> {
    try {
      console.log(`📊 Tracking interaction progressive: ${interactionType} sur tweet ${tweetId}`);
      
      const response = await this.makeRequest('/api/progressive-recommendations/track-interaction', {
        method: 'POST',
        body: JSON.stringify({
          tweetId,
          interactionType,
          metadata
        }),
        requiresAuth: true
      });
      
      console.log('✅ Interaction progressive trackée avec succès');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors du tracking de l\'interaction progressive';
      console.error('❌ Erreur de tracking d\'interaction progressive:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  async getViralTweets(limit: number = 20): Promise<any> {
    try {
      console.log(`🔥 Récupération des tweets viraux (limite: ${limit})`);
      
      const response = await this.makeRequest(
        `/api/progressive-recommendations/viral-tweets?limit=${limit}`,
        { requiresAuth: true }
      );
      
      console.log('✅ Tweets viraux récupérés');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la récupération des tweets viraux';
      console.error('❌ Erreur de récupération des tweets viraux:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  async getTweetViralityStats(tweetId: string): Promise<any> {
    try {
      console.log(`📊 Récupération des statistiques de viralité pour le tweet ${tweetId}`);
      
      const response = await this.makeRequest(
        `/api/progressive-recommendations/tweet-virality/${tweetId}`,
        { requiresAuth: true }
      );
      
      console.log('✅ Statistiques de viralité récupérées');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la récupération des statistiques de viralité';
      console.error('❌ Erreur de récupération des statistiques de viralité:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  async getProgressiveAlgorithmInfo(): Promise<any> {
    try {
      console.log('ℹ️ Récupération des informations de l\'algorithme progressif');
      
      const response = await this.makeRequest(
        '/api/progressive-recommendations/algorithm-info',
        { requiresAuth: true }
      );
      
      console.log('✅ Informations de l\'algorithme progressif récupérées');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la récupération des informations de l\'algorithme progressif';
      console.error('❌ Erreur de récupération des informations de l\'algorithme progressif:', errorMessage);
      return {
        success: false,
        message: errorMessage,
        errors: []
      };
    }
  }

  // --- ÉCONOMIE ADMIN (Gardien de l'Économie) ---

  async getEconomyStats(): Promise<ApiResponse> {
    try {
      const response = await this.makeRequest('/api/admin/economy/stats', { requiresAuth: true });
      return response;
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Erreur stats économie' };
    }
  }

  async getEconomyTransactions(params: any = {}): Promise<ApiResponse> {
    try {
      const queryParams = new URLSearchParams(params).toString();
      const endpoint = `/api/admin/economy/transactions${queryParams ? `?${queryParams}` : ''}`;
      const response = await this.makeRequest(endpoint, { requiresAuth: true });
      return response;
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Erreur transactions économie' };
    }
  }

  async getEconomyRichList(limit: number = 20): Promise<ApiResponse> {
    try {
      const response = await this.makeRequest(`/api/admin/economy/wallets/rich-list?limit=${limit}`, { requiresAuth: true });
      return response;
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Erreur rich list' };
    }
  }

  async searchEconomyWallets(query: string): Promise<ApiResponse> {
    try {
      const response = await this.makeRequest(`/api/admin/economy/wallets/search?query=${encodeURIComponent(query)}`, { requiresAuth: true });
      return response;
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Erreur recherche portefeuilles' };
    }
  }

  async updateWalletBalance(userId: string, amount: number, reason: string): Promise<ApiResponse> {
    try {
      const response = await this.makeRequest('/api/admin/economy/wallets/balance', {
        method: 'PUT',
        body: { userId, amount, reason },
        requiresAuth: true
      });
      return response;
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Erreur mise à jour solde' };
    }
  }

  async manualEconomyTransfer(data: { fromUserId: string | null, toUserId: string, amount: number, description: string }): Promise<ApiResponse> {
    try {
      const response = await this.makeRequest('/api/admin/economy/transfer', {
        method: 'POST',
        body: data,
        requiresAuth: true
      });
      return response;
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Erreur transfert manuel' };
    }
  }

  async deleteEconomyTransaction(id: string, refund: boolean = false): Promise<ApiResponse> {
    try {
      const response = await this.makeRequest(`/api/admin/economy/transactions/${id}`, {
        method: 'DELETE',
        body: { refund },
        requiresAuth: true
      });
      return response;
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Erreur suppression transaction' };
    }
  }

  async toggleWalletLock(userId: string, isLocked: boolean, reason?: string): Promise<ApiResponse> {
    try {
      const response = await this.makeRequest('/api/admin/economy/wallets/lock', {
        method: 'PUT',
        body: { userId, isLocked, reason },
        requiresAuth: true
      });
      return response;
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Erreur verrouillage' };
    }
  }

  async getSimilarityAlgorithmAdmin(): Promise<ApiResponse> {
    try {
      return await this.makeRequest('/api/admin/similarity/algorithm', { requiresAuth: true });
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Erreur chargement similarity' };
    }
  }

  async updateSimilarityAlgorithmAdmin(body: Record<string, unknown>): Promise<ApiResponse> {
    try {
      return await this.makeRequest('/api/admin/similarity/algorithm', {
        method: 'PUT',
        body,
        requiresAuth: true,
      });
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Erreur mise à jour similarity' };
    }
  }

  async getShadowbanOverview(): Promise<ApiResponse> {
    try {
      return await this.makeRequest('/api/admin/shadowban/overview', { requiresAuth: true });
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Erreur shadowban' };
    }
  }

  async shadowbanLookupUser(username: string): Promise<ApiResponse> {
    try {
      const q = encodeURIComponent(username.trim());
      return await this.makeRequest(`/api/admin/shadowban/lookup?username=${q}`, { requiresAuth: true });
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Erreur recherche' };
    }
  }

  async shadowbanSetUserVisibility(userId: string, algorithmic_visibility_multiplier: number): Promise<ApiResponse> {
    try {
      return await this.makeRequest(`/api/admin/shadowban/users/${userId}`, {
        method: 'PUT',
        body: { algorithmic_visibility_multiplier },
        requiresAuth: true,
      });
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Erreur mise à jour' };
    }
  }

  async shadowbanListHashtags(): Promise<ApiResponse> {
    try {
      return await this.makeRequest('/api/admin/shadowban/hashtags', { requiresAuth: true });
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Erreur liste hashtags' };
    }
  }

  async shadowbanUpsertHashtag(body: { tag: string; multiplier: number; note?: string }): Promise<ApiResponse> {
    try {
      return await this.makeRequest('/api/admin/shadowban/hashtags', {
        method: 'POST',
        body,
        requiresAuth: true,
      });
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Erreur enregistrement' };
    }
  }

  async shadowbanDeleteHashtag(id: string): Promise<ApiResponse> {
    try {
      return await this.makeRequest(`/api/admin/shadowban/hashtags/${id}`, {
        method: 'DELETE',
        requiresAuth: true,
      });
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Erreur suppression' };
    }
  }
}

// Instance singleton
export const apiService = new ApiService();
export default apiService;
