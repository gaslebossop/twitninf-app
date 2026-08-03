/**
 * Configuration des permissions d'administration
 * Système simplifié et fonctionnel
 */

export const ADMIN_CONFIG = {
  // Mode test : active les permissions admin pour tous les utilisateurs
  TEST_MODE: true,
  
  // Permissions par défaut en mode test
  TEST_PERMISSIONS: {
    // Tous les utilisateurs sont admin en mode test
    DEFAULT_ROLE: 'admin',
    
    // Permissions accordées à tous les utilisateurs en mode test
    GRANTED_PERMISSIONS: [
      'manage_users',
      'manage_tweets',
      'moderate_content',
      'view_admin_dashboard',
      'ban_users',
      'suspend_users',
      'delete_content',
      'manage_verifications',
      'view_reports',
      'assign_moderators'
    ],
    
    // Restrictions en mode test (même les admins ne peuvent pas se bannir eux-mêmes)
    RESTRICTIONS: [
      'cannot_ban_self',
      'cannot_suspend_self',
      'cannot_delete_own_content'
    ]
  },
  
  // Configuration des actions d'administration
  ACTIONS: {
    USER: {
      BAN: {
        enabled: true,
        requires_reason: true,
        duration_options: [1, 3, 7, 30, 0], // 0 = permanent
        max_duration: 365 // jours
      },
      SUSPEND: {
        enabled: true,
        requires_reason: true,
        duration_options: [1, 3, 7, 30],
        max_duration: 90 // jours
      },
      VERIFY: {
        enabled: true,
        requires_documents: false
      }
    },
    TWEET: {
      DELETE: {
        enabled: true,
        requires_reason: true
      },
      MODERATE: {
        enabled: true,
        actions: ['approve', 'reject', 'flag'],
        requires_reason: true
      },
      RECOMMENDATION: {
        enabled: true,
        can_toggle: true
      }
    }
  },
  
  // Configuration de l'interface utilisateur
  UI: {
    SHOW_ADMIN_BUTTONS: true,
    ADMIN_BUTTON_STYLE: 'prominent', // 'prominent' | 'subtle' | 'minimal'
    SHOW_ADMIN_INDICATOR: true,
    ADMIN_COLOR_SCHEME: {
      primary: '#4F7CFF',
      secondary: '#667eea',
      success: '#43e97b',
      warning: '#ffc107',
      danger: '#ff6b6b',
      info: '#4facfe'
    }
  },
  
  // Configuration des logs et audit
  AUDIT: {
    LOG_ALL_ACTIONS: true,
    LOG_LEVEL: 'info', // 'debug' | 'info' | 'warn' | 'error'
    STORE_ACTION_HISTORY: true,
    MAX_HISTORY_DAYS: 90
  }
};

/**
 * Vérifier si une permission est accordée en mode test
 */
export const hasTestPermission = (permission: string): boolean => {
  if (!ADMIN_CONFIG.TEST_MODE) return false;
  return ADMIN_CONFIG.TEST_PERMISSIONS.GRANTED_PERMISSIONS.includes(permission);
};

/**
 * Vérifier si une restriction s'applique en mode test
 */
export const hasTestRestriction = (restriction: string): boolean => {
  if (!ADMIN_CONFIG.TEST_MODE) return false;
  return ADMIN_CONFIG.TEST_PERMISSIONS.RESTRICTIONS.includes(restriction);
};

/**
 * Obtenir le rôle par défaut en mode test
 */
export const getTestRole = (): string => {
  return ADMIN_CONFIG.TEST_MODE ? ADMIN_CONFIG.TEST_PERMISSIONS.DEFAULT_ROLE : 'user';
};

export default ADMIN_CONFIG;
