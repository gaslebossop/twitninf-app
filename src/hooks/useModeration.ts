import { useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import moderationService, { 
  ModerationAction, 
  Report, 
  BanRequest, 
  SuspendRequest, 
  DeleteRequest 
} from '../services/moderationService';
import useAdminPermissions from './useAdminPermissions';

export const useModeration = () => {
  const { user } = useAuth();
  const { isTestMode, hasAdminAccess } = useAdminPermissions();
  
  const [actions, setActions] = useState<ModerationAction[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    totalActions: 0,
    activeBans: 0,
    activeSuspensions: 0,
    pendingReports: 0,
    resolvedReports: 0,
    actionsThisWeek: 0,
  });

  // Charger les données initiales
  useEffect(() => {
    if (hasAdminAccess || isTestMode) {
      loadModerationData();
    }
  }, [hasAdminAccess, isTestMode]);

  // Charger toutes les données de modération
  const loadModerationData = useCallback(async () => {
    if (!hasAdminAccess && !isTestMode) return;

    setLoading(true);
    try {
      const [actionsData, reportsData, statsData] = await Promise.all([
        moderationService.getModerationActions(),
        moderationService.getReports(),
        moderationService.getModerationStats(),
      ]);

      setActions(actionsData);
      setReports(reportsData);
      setStats(statsData);
    } catch (error) {
      console.error('Erreur lors du chargement des données de modération:', error);
      Alert.alert('Erreur', 'Impossible de charger les données de modération');
    } finally {
      setLoading(false);
    }
  }, [hasAdminAccess, isTestMode]);

  // Bannir un utilisateur
  const banUser = useCallback(async (userId: string, reason: string, duration?: number) => {
    if (!hasAdminAccess && !isTestMode) {
      Alert.alert('Accès refusé', 'Vous n\'avez pas les permissions nécessaires');
      return null;
    }

    if (!user?.id) {
      Alert.alert('Erreur', 'Utilisateur non connecté');
      return null;
    }

    const request: BanRequest = {
      userId,
      reason,
      duration,
      moderatorId: user.id,
    };

    try {
      const action = await moderationService.banUser(request);
      setActions(prev => [action, ...prev]);
      await loadModerationData(); // Recharger les stats
      
      Alert.alert(
        'Succès', 
        `Utilisateur banni${duration ? ` pour ${duration}h` : ' définitivement'}`
      );
      
      return action;
    } catch (error) {
      console.error('Erreur lors du bannissement:', error);
      Alert.alert('Erreur', 'Impossible de bannir l\'utilisateur');
      return null;
    }
  }, [hasAdminAccess, isTestMode, user?.id, loadModerationData]);

  // Suspendre un utilisateur
  const suspendUser = useCallback(async (userId: string, reason: string, duration: number) => {
    if (!hasAdminAccess && !isTestMode) {
      Alert.alert('Accès refusé', 'Vous n\'avez pas les permissions nécessaires');
      return null;
    }

    if (!user?.id) {
      Alert.alert('Erreur', 'Utilisateur non connecté');
      return null;
    }

    const request: SuspendRequest = {
      userId,
      reason,
      duration,
      moderatorId: user.id,
    };

    try {
      const action = await moderationService.suspendUser(request);
      setActions(prev => [action, ...prev]);
      await loadModerationData(); // Recharger les stats
      
      Alert.alert(
        'Succès', 
        `Utilisateur suspendu pour ${duration}h`
      );
      
      return action;
    } catch (error) {
      console.error('Erreur lors de la suspension:', error);
      Alert.alert('Erreur', 'Impossible de suspendre l\'utilisateur');
      return null;
    }
  }, [hasAdminAccess, isTestMode, user?.id, loadModerationData]);

  // Supprimer du contenu
  const deleteContent = useCallback(async (targetId: string, targetType: 'tweet' | 'comment', reason: string) => {
    if (!hasAdminAccess && !isTestMode) {
      Alert.alert('Accès refusé', 'Vous n\'avez pas les permissions nécessaires');
      return null;
    }

    if (!user?.id) {
      Alert.alert('Erreur', 'Utilisateur non connecté');
      return null;
    }

    const request: DeleteRequest = {
      targetId,
      targetType,
      reason,
      moderatorId: user.id,
    };

    try {
      const action = await moderationService.deleteContent(request);
      setActions(prev => [action, ...prev]);
      await loadModerationData(); // Recharger les stats
      
      Alert.alert('Succès', 'Contenu supprimé avec succès');
      
      return action;
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
      Alert.alert('Erreur', 'Impossible de supprimer le contenu');
      return null;
    }
  }, [hasAdminAccess, isTestMode, user?.id, loadModerationData]);

  // Avertir un utilisateur
  const warnUser = useCallback(async (userId: string, reason: string) => {
    if (!hasAdminAccess && !isTestMode) {
      Alert.alert('Accès refusé', 'Vous n\'avez pas les permissions nécessaires');
      return null;
    }

    if (!user?.id) {
      Alert.alert('Erreur', 'Utilisateur non connecté');
      return null;
    }

    try {
      const action = await moderationService.warnUser(userId, reason, user.id);
      setActions(prev => [action, ...prev]);
      await loadModerationData(); // Recharger les stats
      
      Alert.alert('Succès', 'Avertissement envoyé avec succès');
      
      return action;
    } catch (error) {
      console.error('Erreur lors de l\'avertissement:', error);
      Alert.alert('Erreur', 'Impossible d\'envoyer l\'avertissement');
      return null;
    }
  }, [hasAdminAccess, isTestMode, user?.id, loadModerationData]);

  // Résoudre un signalement
  const resolveReport = useCallback(async (reportId: string, action: 'resolve' | 'dismiss' | 'escalate') => {
    if (!hasAdminAccess && !isTestMode) {
      Alert.alert('Accès refusé', 'Vous n\'avez pas les permissions nécessaires');
      return;
    }

    try {
      await moderationService.resolveReport(reportId, action);
      await loadModerationData(); // Recharger les données
      
      const actionText = {
        resolve: 'résolu',
        dismiss: 'rejeté',
        escalate: 'escaladé'
      }[action];
      
      Alert.alert('Succès', `Signalement ${actionText} avec succès`);
    } catch (error) {
      console.error('Erreur lors de la résolution du signalement:', error);
      Alert.alert('Erreur', 'Impossible de traiter le signalement');
    }
  }, [hasAdminAccess, isTestMode, loadModerationData]);

  // Créer un signalement
  const createReport = useCallback(async (report: Omit<Report, 'id' | 'createdAt' | 'status'>) => {
    try {
      const newReport = await moderationService.createReport(report);
      setReports(prev => [newReport, ...prev]);
      await loadModerationData(); // Recharger les stats
      
      Alert.alert('Succès', 'Signalement créé avec succès');
      
      return newReport;
    } catch (error) {
      console.error('Erreur lors de la création du signalement:', error);
      Alert.alert('Erreur', 'Impossible de créer le signalement');
      return null;
    }
  }, [loadModerationData]);

  // Annuler une action de modération
  const reverseAction = useCallback(async (actionId: string) => {
    if (!hasAdminAccess && !isTestMode) {
      Alert.alert('Accès refusé', 'Vous n\'avez pas les permissions nécessaires');
      return;
    }

    if (!user?.id) {
      Alert.alert('Erreur', 'Utilisateur non connecté');
      return;
    }

    try {
      await moderationService.reverseAction(actionId, user.id);
      await loadModerationData(); // Recharger les données
      
      Alert.alert('Succès', 'Action annulée avec succès');
    } catch (error) {
      console.error('Erreur lors de l\'annulation:', error);
      Alert.alert('Erreur', 'Impossible d\'annuler l\'action');
    }
  }, [hasAdminAccess, isTestMode, user?.id, loadModerationData]);

  // Vérifier le statut d'un utilisateur
  const checkUserStatus = useCallback(async (userId: string) => {
    try {
      const [isBanned, isSuspended] = await Promise.all([
        moderationService.isUserBanned(userId),
        moderationService.isUserSuspended(userId),
      ]);

      return {
        isBanned,
        isSuspended,
        hasRestrictions: isBanned || isSuspended,
      };
    } catch (error) {
      console.error('Erreur lors de la vérification du statut:', error);
      return {
        isBanned: false,
        isSuspended: false,
        hasRestrictions: false,
      };
    }
  }, []);

  // Nettoyer les actions expirées
  const cleanupExpiredActions = useCallback(async () => {
    try {
      await moderationService.cleanupExpiredActions();
      await loadModerationData(); // Recharger les données
    } catch (error) {
      console.error('Erreur lors du nettoyage:', error);
    }
  }, [loadModerationData]);

  // Filtrer les actions
  const getFilteredActions = useCallback((filters?: {
    type?: string;
    targetType?: string;
    status?: string;
    limit?: number;
  }) => {
    let filtered = [...actions];

    if (filters?.type) {
      filtered = filtered.filter(action => action.type === filters.type);
    }

    if (filters?.targetType) {
      filtered = filtered.filter(action => action.targetType === filters.targetType);
    }

    if (filters?.status) {
      filtered = filtered.filter(action => action.status === filters.status);
    }

    if (filters?.limit) {
      filtered = filtered.slice(0, filters.limit);
    }

    return filtered;
  }, [actions]);

  // Filtrer les signalements
  const getFilteredReports = useCallback((filters?: {
    status?: string;
    severity?: string;
    type?: string;
  }) => {
    let filtered = [...reports];

    if (filters?.status) {
      filtered = filtered.filter(report => report.status === filters.status);
    }

    if (filters?.severity) {
      filtered = filtered.filter(report => report.severity === filters.severity);
    }

    if (filters?.type) {
      filtered = filtered.filter(report => report.type === filters.type);
    }

    return filtered;
  }, [reports]);

  return {
    // Données
    actions,
    reports,
    stats,
    loading,
    
    // Actions principales
    banUser,
    suspendUser,
    deleteContent,
    warnUser,
    resolveReport,
    createReport,
    reverseAction,
    
    // Utilitaires
    checkUserStatus,
    cleanupExpiredActions,
    getFilteredActions,
    getFilteredReports,
    loadModerationData,
    
    // Permissions
    hasAccess: hasAdminAccess || isTestMode,
    isTestMode,
  };
};

export default useModeration;
