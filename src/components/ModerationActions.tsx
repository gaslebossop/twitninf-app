import { fonts , colors} from '../theme';
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  Dimensions,
  Platform,
  TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useAdminPermissions } from '../hooks/useAdminPermissions';
import { moderationService } from '../services/moderationService';
import SanctionModal, { SanctionData } from './SanctionModal';
import { toast } from './ui/Toast';
import { confirmAsync } from './ui/ConfirmSheet';

const { width } = Dimensions.get('window');

// Palette de couleurs futuriste selon le README
const COLORS = {
  // Couleurs principales - Bleus cybernétiques
  primary: '#4F7CFF',
  secondary: '#3D63D9',
  accent: '#3354C4',
  
  // Arrière-plans - Gradients sombres
  bgPrimary: '#0B0C0F',
  bgSecondary: '#15171C',
  bgTertiary: '#1B1E25',
  bgQuaternary: '#0B0C0F',

  // Texte - thémé (le fond de ce panneau est un voile translucide qui suit
  // déjà le thème via whiteAlpha0X ; un blanc figé ici devenait illisible
  // sur le voile clair en mode light).
  textPrimary: colors.textPrimary,
  textSecondary: colors.textSecondary,
  textMuted: colors.textMuted,

  // États et interactions
  success: '#4F7CFF',
  error: '#ff4757',
  warning: '#ffa502',
  
  // Couleurs transparentes pour les effets
  primaryAlpha10: 'rgba(79, 124, 255, 0.1)',
  primaryAlpha20: 'rgba(79, 124, 255, 0.14)',
  primaryAlpha30: 'rgba(79, 124, 255, 0.25)',
  whiteAlpha05: colors.overlaySoft,
  whiteAlpha10: colors.overlayMedium,
  whiteAlpha20: colors.overlayStrong,
};

// Typographie hiérarchisée
const TYPOGRAPHY = {
  h1: { fontSize: 28, fontWeight: '700', fontFamily: fonts.bold, letterSpacing: 0.5 },
  h2: { fontSize: 24, fontWeight: '600', fontFamily: fonts.semibold, letterSpacing: 0.3 },
  h3: { fontSize: 20, fontWeight: '600', fontFamily: fonts.semibold, letterSpacing: 0.2 },
  h4: { fontSize: 18, fontWeight: '600', fontFamily: fonts.semibold, letterSpacing: 0.1 },
  body: { fontSize: 16, fontWeight: '400', fontFamily: fonts.regular, letterSpacing: 0.1 },
  bodyMedium: { fontSize: 16, fontWeight: '500', fontFamily: fonts.medium, letterSpacing: 0.1 },
  caption: { fontSize: 14, fontWeight: '400', fontFamily: fonts.regular, letterSpacing: 0.1 },
  captionMedium: { fontSize: 14, fontWeight: '500', fontFamily: fonts.medium, letterSpacing: 0.1 },
  small: { fontSize: 12, fontWeight: '400', fontFamily: fonts.regular, letterSpacing: 0.1 },
} satisfies Record<string, TextStyle>;

// Espacement cohérent
const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

// Rayons de bordure
const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
};

interface ModerationActionsProps {
  targetType: 'user' | 'tweet';
  targetId: string;
  targetData?: any;
  onActionComplete?: () => void;
}

const ModerationActions: React.FC<ModerationActionsProps> = ({
  targetType,
  targetId,
  targetData,
  onActionComplete,
}) => {
  const [showSanctionModal, setShowSanctionModal] = useState(false);
  const [sanctionType, setSanctionType] = useState<'ban' | 'suspend' | null>(null);
  const [loading, setLoading] = useState(false);
  
  const { 
    canBanUsers, 
    canSuspendUsers, 
    canDeleteTweets, 
    canVerifyUsers, 
    canModerateContent,
    isClasseur 
  } = useAdminPermissions();

  const targetUsername = targetData?.username || targetData?.author?.username || 'utilisateur';
  const targetUserId = targetType === 'user' ? targetId : targetData?.author?.id;

  const handleAction = async (action: string) => {
    console.log('🎯 Action de modération:', action, 'sur', targetType, targetId);

    switch (action) {
      case 'ban':
        if (!canBanUsers) {
          toast.error('⚠️ Permission refusée', {
            description: 'Vous n\'avez pas la permission de bannir des utilisateurs',
          });
          return;
        }
        setSanctionType('ban');
        setShowSanctionModal(true);
        break;
        
      case 'suspend':
        if (!canSuspendUsers) {
          toast.error('⚠️ Permission refusée', {
            description: 'Vous n\'avez pas la permission de suspendre des utilisateurs',
          });
          return;
        }
        setSanctionType('suspend');
        setShowSanctionModal(true);
        break;
        
      case 'verify':
        if (!canVerifyUsers) {
          toast.error('⚠️ Permission refusée', {
            description: 'Vous n\'avez pas la permission de vérifier des utilisateurs',
          });
          return;
        }
        executeSimpleAction('verify');
        break;
        
      case 'unverify':
        if (!canVerifyUsers) {
          toast.error('⚠️ Permission refusée', {
            description: 'Vous n\'avez pas la permission de modifier la vérification',
          });
          return;
        }
        executeSimpleAction('unverify');
        break;
        
      case 'approve':
        if (targetType === 'tweet' && (canModerateContent || canDeleteTweets)) {
          executeSimpleAction('approve');
        } else {
          toast.error('⚠️ Permission refusée', {
            description: 'Vous n\'avez pas la permission d\'approuver ce contenu',
          });
        }
        break;
        
      case 'reject':
        if (targetType === 'tweet' && (canModerateContent || canDeleteTweets)) {
          executeSimpleAction('reject');
        } else {
          toast.error('⚠️ Permission refusée', {
            description: 'Vous n\'avez pas la permission de rejeter ce contenu',
          });
        }
        break;
        
      default:
        toast.info('ℹ️ Information', {
          description: 'Action non disponible',
        });
    }
  };

  const executeSimpleAction = async (action: string) => {
    const actionTexts = {
      verify: 'vérifier',
      unverify: 'retirer la vérification de',
      approve: 'approuver',
      reject: 'exclure des recommandations'
    };

    const confirmText = actionTexts[action as keyof typeof actionTexts] || action;
    
    confirmAsync({
      title: '🔧 Confirmation d\'action',
      message: `Voulez-vous ${confirmText} ${targetType === 'user' ? `@${targetUsername}` : 'ce contenu'} ?`,
      confirmLabel: 'Confirmer',
    }).then((ok) => {
      if (ok) (async () => {
            try {
              setLoading(true);
              let success = false;

              if (targetType === 'user') {
                switch (action) {
                  case 'verify':
                    success = await moderationService.verifyUser(targetUserId);
                    break;
                  case 'unverify':
                    success = await moderationService.unverifyUser(targetUserId);
                    break;
                }
              } else if (targetType === 'tweet') {
                switch (action) {
                  case 'approve':
                    success = await moderationService.approveTweet(targetId);
                    break;
                  case 'reject':
                    success = await moderationService.rejectTweet(targetId, 'Contenu non conforme');
                    break;
                }
              }

              if (success) {
                toast.success(`Action ${confirmText} effectuée avec succès.`);
                onActionComplete?.();
              } else {
                toast.error('Impossible d\'effectuer cette action.');
              }
            } catch (error) {
              console.error('Erreur lors de l\'action:', error);
              toast.error('Une erreur est survenue lors de l\'exécution de l\'action');
            } finally {
              setLoading(false);
            }
          })();
    });
  };

  const handleSanctionConfirm = async (sanctionData: SanctionData) => {
    try {
      setLoading(true);
      let success = false;
      
      if (sanctionData.type === 'ban') {
        success = await moderationService.banUser(targetUserId, sanctionData.reason, undefined, sanctionData.permanent);
      } else if (sanctionData.type === 'suspend') {
        const durationHours = sanctionData.duration; // Le service attend des heures
        success = await moderationService.suspendUser(targetUserId, sanctionData.reason, durationHours);
      }

      if (success) {
        const actionText = sanctionData.type === 'ban' ? 'banni' : 'suspendu';
        toast.success('✅ Sanction appliquée', {
          description: `Utilisateur ${actionText} avec succès.`,
        });
        setShowSanctionModal(false);
        onActionComplete?.();
      } else {
        toast.error('Impossible d\'effectuer cette action.');
      }
    } catch (error) {
      console.error('Erreur lors de la sanction:', error);
      toast.error('❌ Erreur système', {
        description: 'Une erreur est survenue lors de l\'exécution de l\'action',
      });
    } finally {
      setLoading(false);
    }
  };

  const getAvailableActions = () => {
    const actions: any[] = [];

    if (targetType === 'user') {
      // Actions pour les utilisateurs
      if (canVerifyUsers) {
        const isVerified = targetData?.verified;
        actions.push({
          id: isVerified ? 'unverify' : 'verify',
          title: isVerified ? 'Retirer Badge' : 'Certifier',
          subtitle: isVerified ? 'Supprimer la vérification' : 'Ajouter un badge de vérification',
          icon: isVerified ? 'shield-outline' : 'shield-checkmark',
          color: isVerified ? COLORS.warning : COLORS.success,
          gradient: isVerified 
            ? [COLORS.warning, '#ff6b6b'] 
            : [COLORS.success, COLORS.primary],
          glowColor: isVerified ? COLORS.warning : COLORS.success,
        });
      }

      // Suspendre (pas pour les classeurs)
      if (canSuspendUsers && !isClasseur) {
        actions.push({
          id: 'suspend',
          title: 'Suspendre',
          subtitle: 'Restriction temporaire d\'accès',
          icon: 'time-outline',
          color: COLORS.warning,
          gradient: [COLORS.warning, '#ff9500'],
          glowColor: COLORS.warning,
        });
      }

      // Bannir (pas pour les classeurs)
      if (canBanUsers && !isClasseur) {
        actions.push({
          id: 'ban',
          title: 'Bannir',
          subtitle: 'Exclusion définitive de la plateforme',
          icon: 'ban-outline',
          color: COLORS.error,
          gradient: [COLORS.error, '#ff3838'],
          glowColor: COLORS.error,
        });
      }
    } else if (targetType === 'tweet') {
      // Actions pour les tweets (classeurs et modérateurs)
      if (canModerateContent || canDeleteTweets) {
        actions.push({
          id: 'approve',
          title: 'Approuver',
          subtitle: 'Valider et promouvoir le contenu',
          icon: 'checkmark-circle',
          color: COLORS.success,
          gradient: [COLORS.success, COLORS.primary],
          glowColor: COLORS.success,
        });

        actions.push({
          id: 'reject',
          title: 'Masquer',
          subtitle: 'Retirer des recommandations',
          icon: 'eye-off-outline',
          color: COLORS.warning,
          gradient: [COLORS.warning, '#ff6b6b'],
          glowColor: COLORS.warning,
        });
      }
    }

    return actions;
  };

  const availableActions = getAvailableActions();
  
  // Ne pas afficher le composant si aucune action n'est disponible
  if (availableActions.length === 0) {
    return null;
  }

  return (
    <>
      {/* Container principal avec effet glassmorphism */}
      <BlurView intensity={20} style={styles.container}>
        <LinearGradient
          colors={[COLORS.whiteAlpha10, COLORS.whiteAlpha05]}
          style={styles.containerGradient}
        >
          {/* En-tête avec design futuriste */}
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <LinearGradient
                colors={[COLORS.primary, COLORS.accent]}
                style={styles.headerIconGradient}
              >
                <Ionicons name="settings" size={20} color={colors.onAccent} />
              </LinearGradient>
            </View>
            
            <View style={styles.headerText}>
              <Text style={[styles.title, TYPOGRAPHY.h3]}>
                Actions de Modération
              </Text>
              <Text style={[styles.subtitle, TYPOGRAPHY.caption]}>
                {targetType === 'user' 
                  ? `Gérer l'utilisateur @${targetUsername}`
                  : 'Gérer ce contenu publié'
                }
              </Text>
            </View>
          </View>

          {/* Grille d'actions avec design cybernétique */}
          <View style={styles.actionsGrid}>
            {availableActions.map((action, index) => (
              <TouchableOpacity
                key={action.id}
                style={[
                  styles.actionCard,
                  { 
                    shadowColor: action.glowColor,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.3,
                    shadowRadius: 8,
                    elevation: 8,
                  }
                ]}
                onPress={() => handleAction(action.id)}
                activeOpacity={0.8}
                disabled={loading}
              >
                <BlurView intensity={40} style={styles.actionCardBlur}>
                  <LinearGradient
                    colors={[COLORS.whiteAlpha10, COLORS.whiteAlpha05]}
                    style={styles.actionCardGradient}
                  >
                    {/* Icône avec halo */}
                    <View style={styles.actionIconContainer}>
                      <LinearGradient
                        colors={action.gradient}
                        style={styles.actionIconGradient}
                      >
                        <Ionicons
                          name={action.icon as keyof typeof Ionicons.glyphMap}
                          size={24}
                          color={colors.onAccent}
                        />
                      </LinearGradient>
                    </View>
                    
                    {/* Texte de l'action */}
                    <View style={styles.actionTextContainer}>
                      <Text style={[styles.actionTitle, TYPOGRAPHY.bodyMedium]}>
                        {action.title}
                      </Text>
                      <Text style={[styles.actionSubtitle, TYPOGRAPHY.small]}>
                        {action.subtitle}
                      </Text>
                    </View>
                    
                    {/* Indicateur visuel */}
                    <View style={styles.actionIndicator}>
                      <View style={[styles.actionDot, { backgroundColor: action.color }]} />
                    </View>
                  </LinearGradient>
                </BlurView>
              </TouchableOpacity>
            ))}
          </View>
        </LinearGradient>
      </BlurView>

      {/* Utiliser le SanctionModal existant */}
      <SanctionModal
        visible={showSanctionModal}
        onClose={() => setShowSanctionModal(false)}
        onConfirm={handleSanctionConfirm}
        user={{
          id: targetUserId,
          username: targetUsername,
          fullName: targetData?.full_name || targetUsername
        }}
        sanctionType={sanctionType || 'ban'}
      />
    </>
  );
};

const styles = StyleSheet.create({
  // Container principal
  container: {
    marginHorizontal: SPACING.sm,
    marginVertical: SPACING.md,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.whiteAlpha10,
    width: '100%',
  },
  containerGradient: {
    padding: SPACING.lg,
  },

  // En-tête
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  headerIcon: {
    marginRight: SPACING.md,
  },
  headerIconGradient: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    color: COLORS.textMuted,
  },

  // Grille d'actions
  actionsGrid: {
    gap: SPACING.sm,
  },
  actionCard: {
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  actionCardBlur: {
    borderRadius: RADIUS.md,
  },
  actionCardGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.whiteAlpha10,
  },
  actionIconContainer: {
    marginRight: SPACING.md,
  },
  actionIconGradient: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTextContainer: {
    flex: 1,
  },
  actionTitle: {
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  actionSubtitle: {
    color: COLORS.textMuted,
  },
  actionIndicator: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionDot: {
    width: 8,
    height: 8,
    borderRadius: RADIUS.full,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  modalBlur: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  modalContainer: {
    width: '95%',
    maxWidth: 450,
    maxHeight: '90%',
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.whiteAlpha20,
  },
  modalGradient: {
    flex: 1,
  },

  // En-tête du modal
  modalHeader: {
    position: 'relative',
    padding: SPACING.lg,
  },
  modalHeaderGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    gap: SPACING.sm,
  },
  modalTitle: {
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: SPACING.md,
    right: SPACING.md,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  closeButtonBlur: {
    padding: SPACING.sm,
  },

  // Contenu du modal
  modalContent: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
  },

  // Section cible
  targetSection: {
    marginBottom: SPACING.xl,
  },
  sectionLabel: {
    color: COLORS.primary,
    marginBottom: SPACING.md,
    letterSpacing: 1,
  },
  targetCard: {
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.primaryAlpha20,
  },
  targetCardGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    gap: SPACING.md,
  },
  targetUsername: {
    color: COLORS.primary,
  },

  // Section durée
  durationSection: {
    marginBottom: SPACING.xl,
  },
  durationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  durationChip: {
    flex: 1,
    minWidth: 60,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.whiteAlpha10,
  },
  durationChipBlur: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.md,
  },
  durationChipSelected: {
    borderColor: COLORS.primary,
  },
  durationChipSelectedGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  durationChipText: {
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  durationChipTextSelected: {
    color: COLORS.primary,
  },

  // Section motif
  reasonSection: {
    marginBottom: SPACING.xl,
  },
  reasonInputContainer: {
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.whiteAlpha10,
  },
  reasonInput: {
    padding: SPACING.md,
    color: COLORS.textPrimary,
    minHeight: 120,
    textAlignVertical: 'top',
  },

  // Actions du modal
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.md,
    paddingBottom: SPACING.lg,
  },
  cancelButton: {
    flex: 1,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.whiteAlpha20,
  },
  cancelButtonBlur: {
    padding: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: COLORS.textSecondary,
  },
  confirmButton: {
    flex: 2,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  confirmButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  confirmButtonText: {
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  disabledButton: {
    opacity: 0.5,
  },
});

// Export par défaut du composant
export default ModerationActions;
