import { useAuth } from '../contexts/AuthContext';

/**
 * Dérivée pure de `user`, plus une source de vérité indépendante.
 *
 * Cette version rechargeait le rôle et les permissions elle-même à chaque
 * montage : un `getCurrentUser()` réseau plus cinq lectures AsyncStorage,
 * dans un `useEffect`. `AuthContext` fait déjà EXACTEMENT le même
 * `getCurrentUser()` au démarrage et à chaque rafraîchissement de session —
 * et `user.role` / `user.moderation_permissions` en sont le résultat direct.
 * Chaque composant qui utilisait ce hook (dont `TweetCard`, monté une fois
 * par tweet affiché) relançait donc son propre appel réseau redondant : sur
 * un profil de 50 tweets, 50 requêtes `/api/auth/me` concurrentes rien que
 * pour savoir si le lecteur est modérateur.
 *
 * Plus grave qu'une redondance : ces 50 requêtes concurrentes touchent le
 * même mécanisme de rafraîchissement de jeton que la déconnexion / le
 * changement de compte. Un logout pendant que des dizaines de
 * `getCurrentUser()` sont en vol multiplie les échecs 401 quasi simultanés,
 * chacun pouvant redéclencher le rafraîchissement de session — un terrain
 * fertile pour la cascade de mises à jour d'état observée dans « Maximum
 * update depth exceeded » au changement de compte.
 *
 * Une dérivation pure ne peut structurellement pas boucler : pas d'effet,
 * pas d'état, pas d'appel réseau — juste une lecture de ce que le contexte
 * porte déjà.
 */
export const useAdminPermissions = () => {
  const { user } = useAuth();

  const rawRole = String(user?.role || 'user');
  const permissions: Record<string, boolean> = user?.moderation_permissions || {};

  const normalizeRole = (role: string): string => {
    if (role === 'moderator') return 'moderateur';
    if (role === 'super_admin' || role === 'supermoderateur') return 'superadmin';
    return role;
  };

  const normalizedRole = normalizeRole(rawRole);
  const hasSuperModerationAccess = ['superadmin', 'admin'].includes(normalizedRole);
  const hasModeratorAccess = ['moderateur', 'admin', 'superadmin', 'classeurdetweets', 'economiegardien'].includes(normalizedRole);

  const isAdmin = normalizedRole === 'admin' || normalizedRole === 'superadmin';
  const isModerator = hasModeratorAccess;
  const isSuperAdmin = normalizedRole === 'superadmin';
  const isClasseur = normalizedRole === 'classeurdetweets';
  const isEconomyGuardian = normalizedRole === 'economiegardien';

  const hasPermission = (permission: string): boolean => {
    return hasSuperModerationAccess || permissions[permission] === true;
  };

  const canBanUsers = hasPermission('can_ban_users');
  const canSuspendUsers = hasPermission('can_suspend_users');
  const canDeleteTweets = hasPermission('can_delete_tweets');
  const canVerifyUsers = hasPermission('can_verify_users');
  const canViewReports = hasPermission('can_view_reports');
  const canViewAnalytics = hasPermission('can_view_analytics');
  const canManageModerators = hasPermission('can_manage_moderators');

  // Permissions spéciales
  const canModerateContent = hasModeratorAccess || isClasseur || hasPermission('can_moderate_content') || hasPermission('can_delete_tweets');
  const canExcludeFromRecommendations = isClasseur || hasPermission('can_exclude_recommendations');
  const canManageEconomy = isEconomyGuardian || isAdmin || isSuperAdmin || isModerator || hasPermission('can_manage_economy');

  return {
    isAdmin,
    isModerator,
    isSuperAdmin,
    isClasseur,
    userRole: normalizedRole,
    permissions,
    // Rien à charger : `user` est déjà là ou ne l'est pas. Conservé pour ne
    // pas casser les appelants qui affichent un état de chargement.
    loading: false,
    hasPermission,
    canBanUsers,
    canSuspendUsers,
    canDeleteTweets,
    canVerifyUsers,
    canViewReports,
    canViewAnalytics,
    canManageModerators,
    canModerateContent,
    canExcludeFromRecommendations,
    isEconomyGuardian,
    canManageEconomy,
  };
};

// Export par défaut pour la compatibilité
export default useAdminPermissions;
