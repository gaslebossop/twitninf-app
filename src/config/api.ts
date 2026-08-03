// Configuration de l'API TwitNin

/**
 * L'adresse du serveur était écrite en dur ici. Le dépôt est destiné à
 * devenir public : y laisser le domaine réel revient à le publier en clair,
 * ce qu'un simple `git grep` suffit à retrouver. Elle vient désormais de
 * `EXPO_PUBLIC_API_URL` — voir `.env.example` à la racine du projet.
 *
 * `EXPO_PUBLIC_*` est inliné par Metro au moment du bundle (voir
 * `@expo/metro-config` dans metro.config.js), donc la valeur doit exister
 * AVANT de lancer un build, que ce soit en local (`.env` non versionné) ou en
 * CI (voir l'étape dédiée dans `.github/workflows/ios-build.yml`).
 */
if (!process.env.EXPO_PUBLIC_API_URL) {
  throw new Error(
    "EXPO_PUBLIC_API_URL manquant. Créer un fichier .env à la racine du " +
    'projet avec EXPO_PUBLIC_API_URL=... (voir .env.example), puis relancer.',
  );
}

export const API_CONFIG = {
  // URL de base de l'API
  BASE_URL: process.env.EXPO_PUBLIC_API_URL,

  // Timeout des requêtes
  TIMEOUT: 15000,

  // Headers par défaut.
  // ⚠️ Ne contient volontairement PAS d'en-tête d'identification client :
  // ceux-ci sont dynamiques (plateforme réelle, device id, version) et
  // proviennent uniquement de `buildClientHeaders()` dans
  // src/services/clientIdentity.ts.
  DEFAULT_HEADERS: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },

  // Endpoints
  ENDPOINTS: {
    AUTH: {
      LOGIN: '/api/auth/login',
      REGISTER: '/api/auth/register',
      LOGOUT: '/api/auth/logout',
      REFRESH: '/api/auth/refresh',
      ME: '/api/auth/me',
      PROFILE: '/api/auth/profile',
    },
    USERS: {
      PROFILE: '/api/users/profile',
      PROFILE_BY_ID: '/api/users',
      SEARCH: '/api/users/search',
      FOLLOW: '/api/users',
      UNFOLLOW: '/api/users',
    },
    POSTS: {
      CREATE: '/posts',
      LIST: '/posts',
      DETAIL: '/posts/:id',
      LIKE: '/posts/:id/like',
      UNLIKE: '/posts/:id/unlike',
    },
  },
};

// Fonction pour obtenir l'URL complète d'un endpoint
export const getApiUrl = (endpoint: string): string => {
  return `${API_CONFIG.BASE_URL}${endpoint}`;
};

// Fonction pour remplacer les paramètres dans les URLs
export const replaceUrlParams = (url: string, params: Record<string, string>): string => {
  let result = url;
  Object.entries(params).forEach(([key, value]) => {
    result = result.replace(`:${key}`, value);
  });
  return result;
};
