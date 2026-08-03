import { useState, useEffect } from 'react';
import { apiService } from '../services/api';

export const useAdminPermissions = () => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isModerator, setIsModerator] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isClasseur, setIsClasseur] = useState(false);
  const [isEconomyGuardian, setIsEconomyGuardian] = useState(false);
  const [userRole, setUserRole] = useState<string>('user');
  const [permissions, setPermissions] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkPermissions = async () => {
      try {
        setLoading(true);
        
        // Rafraîchir les données utilisateur du serveur pour éviter les rôles périmés
        await apiService.getCurrentUser();
        
        // Récupérer le rôle et les permissions de l'utilisateur
        const role = await apiService.getUserRole();
        const userPermissions = await apiService.getUserPermissions();
        
        setUserRole(role);
        setPermissions(userPermissions);
        
        // Définir les permissions en fonction du rôle
        setIsAdmin(await apiService.isAdmin());
        setIsModerator(await apiService.isModerator());
        setIsSuperAdmin(await apiService.isSuperAdmin());
        setIsClasseur(await apiService.hasRole('classeurdetweets'));
        setIsEconomyGuardian(await apiService.hasRole('economiegardien'));
        
        console.log('👑 Permissions chargées:', { role, permissions: userPermissions });
        
      } catch (error) {
        console.error('❌ Erreur lors de la vérification des permissions:', error);
        // En cas d'erreur, pas de permissions
        setIsAdmin(false);
        setIsModerator(false);
        setIsSuperAdmin(false);
        setIsClasseur(false);
        setIsEconomyGuardian(false);
        setUserRole('user');
        setPermissions({});
      } finally {
        setLoading(false);
      }
    };

    checkPermissions();
  }, []);

  const normalizeRole = (role?: string): string => {
    if (role === 'moderator') return 'moderateur';
    if (role === 'super_admin' || role === 'supermoderateur') return 'superadmin';
    return role || 'user';
  };

  const normalizedRole = normalizeRole(userRole);
  const hasSuperModerationAccess = ['superadmin', 'admin'].includes(normalizedRole);
  const hasModeratorAccess = ['moderateur', 'admin', 'superadmin', 'classeurdetweets', 'economiegardien'].includes(normalizedRole);

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
    userRole,
    permissions,
    loading,
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
