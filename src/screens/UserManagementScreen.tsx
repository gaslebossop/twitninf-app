import { fonts } from '../theme';
import { ScreenBackground, BackButton } from '../components/ui';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StatusBar,
  Platform,
  Animated,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAdminPermissions } from '../hooks/useAdminPermissions';
import { useAuth } from '../contexts/AuthContext';
import { moderationService, User } from '../services/moderationService';
import SanctionModal, { SanctionData } from '../components/SanctionModal';
import VerifiedBadge from '../components/VerifiedBadge';
import { toast } from '../components/ui/Toast';
import { confirmAsync } from '../components/ui/ConfirmSheet';

const { width: screenWidth } = Dimensions.get('window');

const COLORS = {
  primary: '#4F7CFF',
  secondary: '#3D63D9',
  accent: '#3354C4',
  bgPrimary: '#0B0C0F',
  bgSecondary: '#15171C',
  bgTertiary: '#1B1E25',
  textPrimary: '#F2F4F7',
  textSecondary: '#cbd5e0',
  textMuted: '#9BA1AC',
  success: '#2BC48A',
  error: '#F4365B',
  warning: '#E0A458',
  glassBorder: '#23262D',
  glassBackground: '#15171C',
};

const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
};

export default function UserManagementScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { isModerator, canBanUsers, canSuspendUsers, canVerifyUsers } = useAdminPermissions();
  const { user } = useAuth();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'suspended' | 'banned'>('all');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [animationValue] = useState(new Animated.Value(1));
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [sanctionModalVisible, setSanctionModalVisible] = useState(false);
  const [selectedSanctionType, setSelectedSanctionType] = useState<'ban' | 'suspend'>('suspend');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      console.log('🔄 Début du chargement des utilisateurs...');
      setLoading(true);
      const usersData = await moderationService.getUsers();
      console.log('👥 Users data reçu:', usersData);
      console.log('👥 Users data type:', typeof usersData);
      console.log('👥 Users data length:', usersData?.length);
      console.log('👥 Users data is array:', Array.isArray(usersData));
      
      // Traiter les données pour s'assurer que le statut est correct
      const processedUsers = (usersData || []).map((user: any) => {
        console.log('👤 User raw data:', user);
        
        // L'API retourne maintenant le statut correctement formaté
        // Mais on s'assure que tous les champs requis existent
        return {
          ...user,
          fullName: user.fullName || user.full_name || user.username,
          username: user.username,
          verified: user.verified || false,
          followers: user.followers || 0,
          tweets: user.tweets || 0,
          reports: user.reports || 0,
          status: user.status || 'active'
        } as User;
      });
      
      console.log('👥 Users traités:', processedUsers);
      setUsers(processedUsers);
      console.log('✅ Utilisateurs chargés avec succès');
    } catch (error) {
      console.error('❌ Erreur lors du chargement des utilisateurs:', error);
      toast.error('Impossible de charger les utilisateurs');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users?.filter(user => {
    const matchesSearch = user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         user.fullName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filter === 'all' || user.status === filter;
    return matchesSearch && matchesFilter;
  }) || [];

  const handleUserAction = async (user: User, action: 'ban' | 'suspend' | 'verify' | 'unverify' | 'unban' | 'unsuspend') => {
    const actionTexts = {
      ban: 'bannir',
      suspend: 'suspendre',
      verify: 'vérifier',
      unverify: 'révoquer la vérification',
      unban: 'débannir',
      unsuspend: 'réactiver'
    };

    // Pour les actions destructives, utiliser le modal professionnel
    if (action === 'ban' || action === 'suspend') {
      setSelectedUser(user);
      setSelectedSanctionType(action);
      setSanctionModalVisible(true);
    } else {
      confirmAsync({
        title: `${actionTexts[action].charAt(0).toUpperCase() + actionTexts[action].slice(1)} l'utilisateur`,
        message: `Êtes-vous sûr de vouloir ${actionTexts[action]} @${user.username} ?`,
        confirmLabel: 'Confirmer',
      }).then((ok) => {
        if (ok) (async () => {
              await executeUserAction(user, action, 'Action de modération');
            })();
      });
    }
  };

  const handleSanctionConfirm = async (sanctionData: SanctionData) => {
    if (!selectedUser) return;

    try {
      let success = false;
      
      if (sanctionData.type === 'ban') {
        success = await moderationService.banUser(selectedUser.id, sanctionData.reason, undefined, sanctionData.permanent);
      } else if (sanctionData.type === 'suspend') {
        success = await moderationService.suspendUser(selectedUser.id, sanctionData.reason, sanctionData.duration);
      }

      if (success) {
        const actionTexts = {
          ban: 'banni',
          suspend: 'suspendu'
        };
        toast.success(`Utilisateur ${actionTexts[sanctionData.type]} avec succès.`);
        loadUsers(); // Recharger les données
      } else {
        toast.error(`Impossible d'effectuer cette action`);
      }
    } catch (error) {
      console.error('❌ Erreur lors de l\'action sur l\'utilisateur:', error);
      toast.error('Une erreur est survenue');
    } finally {
      setSanctionModalVisible(false);
      setSelectedUser(null);
    }
  };

  const executeUserAction = async (user: User, action: 'ban' | 'suspend' | 'verify' | 'unverify' | 'unban' | 'unsuspend', motif: string) => {
    try {
      let success = false;
      
      switch (action) {
        case 'ban':
          success = await moderationService.banUser(user.id, motif);
          break;
        case 'suspend':
          success = await moderationService.suspendUser(user.id, motif, 168); // 7 jours
          break;
        case 'verify':
          success = await moderationService.verifyUser(user.id);
          break;
        case 'unverify':
          success = await moderationService.unverifyUser(user.id);
          break;
        case 'unban':
          success = await moderationService.unbanUser(user.id);
          break;
        case 'unsuspend':
          success = await moderationService.unsuspendUser(user.id);
          break;
      }

      if (success) {
        const actionTexts = {
          ban: 'banni',
          suspend: 'suspendu',
          verify: 'vérifié',
          unverify: 'vérification révoquée',
          unban: 'débanni',
          unsuspend: 'réactivé'
        };
        toast.success(`Utilisateur ${actionTexts[action]} avec succès.`);
        loadUsers(); // Recharger les données
      } else {
        toast.error(`Impossible d'effectuer cette action`);
      }
    } catch (error) {
      console.error('❌ Erreur lors de l\'action sur l\'utilisateur:', error);
      toast.error('Une erreur est survenue');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return COLORS.success;
      case 'suspended': return COLORS.warning;
      case 'banned': return COLORS.error;
      default: return COLORS.textMuted;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return 'checkmark-circle';
      case 'suspended': return 'pause-circle';
      case 'banned': return 'ban';
      default: return 'help-circle';
    }
  };

  if (!canBanUsers && !canSuspendUsers) {
    return (
      <View style={styles.accessDenied}>
        <LinearGradient colors={[COLORS.bgPrimary, COLORS.bgSecondary]} style={styles.accessDeniedGradient}>
          <View style={styles.accessDeniedContent}>
            <Ionicons name="shield-outline" size={80} color={COLORS.error} />
            <Text style={styles.accessDeniedTitle}>Accès Restreint</Text>
            <Text style={styles.accessDeniedText}>
              Vous n'avez pas les permissions nécessaires pour accéder à cette section.
            </Text>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => navigation.goBack()}
              activeOpacity={0.8}
            >
              <View style={styles.backBtnInner}>
                <Text style={styles.backButtonText}>Retour</Text>
              </View>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.bgPrimary} />
        <LinearGradient
          colors={[COLORS.bgPrimary, COLORS.bgSecondary, COLORS.bgTertiary]}
          style={styles.gradient}
        >
          <View style={styles.loadingContainer}>
            <Ionicons name="refresh" size={48} color={COLORS.primary} />
            <Text style={styles.loadingText}>Chargement des utilisateurs...</Text>
          </View>
        </LinearGradient>
      </View>
    );
  }

  return (
    <ScreenBackground>
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <View style={styles.gradient}>
        {/* Header avec effet de blur */}
        <Animated.View 
          style={[
            styles.header,
            {
              opacity: animationValue,
              transform: [{ translateY: animationValue.interpolate({
                inputRange: [0, 1],
                outputRange: [20, 0],
              })}],
              paddingTop: insets.top + SPACING.md,
            }
          ]}
        >
          <View style={styles.headerContent}>
            <BackButton navigation={navigation} />
            <Text style={styles.headerTitle}>Gestion Utilisateurs</Text>
            <View style={styles.headerRight}>
              <View style={styles.headerStats}>
                <Text style={styles.headerStatsText}>
                  {users?.length || 0} utilisateurs
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Barre de recherche */}
        <Animated.View 
          style={[
            styles.searchContainer,
            {
              opacity: animationValue,
              transform: [{ translateY: animationValue.interpolate({
                inputRange: [0, 1],
                outputRange: [30, 0],
              })}],
            }
          ]}
        >
          <BlurView intensity={30} style={styles.searchBlur}>
            <View style={styles.searchInputContainer}>
              <Ionicons name="search" size={20} color={COLORS.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Rechercher un utilisateur..."
                placeholderTextColor={COLORS.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
          </BlurView>
        </Animated.View>

        {/* Filtres */}
        <Animated.View 
          style={[
            styles.filtersContainer,
            {
              opacity: animationValue,
              transform: [{ translateY: animationValue.interpolate({
                inputRange: [0, 1],
                outputRange: [40, 0],
              })}],
            }
          ]}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                         {[
               { key: 'all', label: 'Tous', count: users?.length || 0 },
               { key: 'active', label: 'Actifs', count: users?.filter(u => u.status === 'active').length || 0 },
               { key: 'suspended', label: 'Suspendus', count: users?.filter(u => u.status === 'suspended').length || 0 },
               { key: 'banned', label: 'Bannis', count: users?.filter(u => u.status === 'banned').length || 0 },
             ].map((filterOption) => (
              <TouchableOpacity
                key={filterOption.key}
                style={[
                  styles.filterButton,
                  filter === filterOption.key && styles.activeFilterButton
                ]}
                onPress={() => setFilter(filterOption.key as any)}
                activeOpacity={0.8}
              >
                <Text style={[
                  styles.filterButtonText,
                  filter === filterOption.key && styles.activeFilterButtonText
                ]}>
                  {filterOption.label} ({filterOption.count})
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Animated.View>

        {/* Liste des utilisateurs */}
        <ScrollView 
          style={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {filteredUsers.map((user, index) => (
            <Animated.View
              key={user.id}
              style={[
                styles.userCard,
                {
                  opacity: animationValue,
                  transform: [{ translateY: animationValue.interpolate({
                    inputRange: [0, 1],
                    outputRange: [50 + (index * 20), 0],
                  })}],
                }
              ]}
            >
              <BlurView intensity={30} style={styles.userCardBlur}>
                <View style={styles.userCardHeader}>
                  <View style={styles.userInfo}>
                    <View style={styles.userAvatar}>
                      <LinearGradient
                        colors={[`${getStatusColor(user.status)}40`, `${getStatusColor(user.status)}20`]}
                        style={styles.avatarGradient}
                      >
                        <Ionicons 
                          name={getStatusIcon(user.status) as any} 
                          size={24} 
                          color={getStatusColor(user.status)} 
                        />
                      </LinearGradient>
                    </View>
                    
                    <View style={styles.userDetails}>
                      <View style={styles.userNameRow}>
                        <Text style={styles.userName}>{user.fullName || user.username}</Text>
                        {user.verified && (
                          <View style={{ marginLeft: 6 }}>
                            <VerifiedBadge 
                              verificationStyle={(user as any).verification_style || 'default'}
                              size={16} 
                              animated={true}
                            />
                          </View>
                        )}
                      </View>
                      <Text style={styles.userHandle}>@{user.username}</Text>
                      <View style={styles.userStats}>
                        <Text style={styles.userStat}>{user.followers} abonnés</Text>
                        <Text style={styles.userStat}>•</Text>
                        <Text style={styles.userStat}>{user.tweets} tweets</Text>
                        {user.reports > 0 && (
                          <>
                            <Text style={styles.userStat}>•</Text>
                            <Text style={[styles.userStat, { color: COLORS.error }]}>
                              {user.reports} signalements
                            </Text>
                          </>
                        )}
                      </View>
                    </View>
                  </View>
                  
                  <View style={styles.statusBadge}>
                    <LinearGradient
                      colors={[`${getStatusColor(user.status)}20`, `${getStatusColor(user.status)}10`]}
                      style={styles.statusGradient}
                    >
                      <Ionicons 
                        name={getStatusIcon(user.status) as any} 
                        size={12} 
                        color={getStatusColor(user.status)} 
                      />
                      <Text style={[styles.statusText, { color: getStatusColor(user.status) }]}>
                        {user.status === 'active' ? 'Actif' : 
                         user.status === 'suspended' ? 'Suspendu' : 'Banni'}
                      </Text>
                    </LinearGradient>
                  </View>
                </View>
                
                <View style={styles.userCardActions}>
                  {user.status === 'active' ? (
                    <>
                      {canSuspendUsers && (
                        <TouchableOpacity
                          style={[styles.actionButton, styles.suspendButton]}
                          onPress={() => handleUserAction(user, 'suspend')}
                          activeOpacity={0.8}
                        >
                          <LinearGradient
                            colors={['rgba(255, 165, 2, 0.2)', 'rgba(255, 165, 2, 0.1)']}
                            style={styles.actionButtonGradient}
                          >
                            <Ionicons name="pause" size={16} color={COLORS.warning} />
                            <Text style={[styles.actionButtonText, { color: COLORS.warning }]}>
                              Suspendre
                            </Text>
                          </LinearGradient>
                        </TouchableOpacity>
                      )}
                      
                      {canBanUsers && (
                        <TouchableOpacity
                          style={[styles.actionButton, styles.banButton]}
                          onPress={() => handleUserAction(user, 'ban')}
                          activeOpacity={0.8}
                        >
                          <LinearGradient
                            colors={['rgba(255, 71, 87, 0.2)', 'rgba(255, 71, 87, 0.1)']}
                            style={styles.actionButtonGradient}
                          >
                            <Ionicons name="ban" size={16} color={COLORS.error} />
                            <Text style={[styles.actionButtonText, { color: COLORS.error }]}>
                              Bannir
                            </Text>
                          </LinearGradient>
                        </TouchableOpacity>
                      )}
                    </>
                  ) : user.status === 'suspended' ? (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.reactivateButton]}
                      onPress={() => handleUserAction(user, 'unsuspend')}
                      activeOpacity={0.8}
                    >
                      <LinearGradient
                        colors={['rgba(67, 233, 123, 0.2)', 'rgba(67, 233, 123, 0.1)']}
                        style={styles.actionButtonGradient}
                      >
                        <Ionicons name="refresh" size={16} color={COLORS.success} />
                        <Text style={[styles.actionButtonText, { color: COLORS.success }]}>
                          Réactiver
                        </Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  ) : user.status === 'banned' ? (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.reactivateButton]}
                      onPress={() => handleUserAction(user, 'unban')}
                      activeOpacity={0.8}
                    >
                      <LinearGradient
                        colors={['rgba(67, 233, 123, 0.2)', 'rgba(67, 233, 123, 0.1)']}
                        style={styles.actionButtonGradient}
                      >
                        <Ionicons name="refresh" size={16} color={COLORS.success} />
                        <Text style={[styles.actionButtonText, { color: COLORS.success }]}>
                          Débannir
                        </Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  ) : null}
                  
                  {!user.verified && canVerifyUsers && (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.verifyButton]}
                      onPress={() => handleUserAction(user, 'verify')}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.actionButtonGradient, { backgroundColor: 'rgba(79, 124, 255, 0.14)' }]}>
                        <Ionicons name="checkmark-circle" size={16} color={COLORS.primary} />
                        <Text style={[styles.actionButtonText, { color: COLORS.primary }]}>
                          Vérifier
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}
                  
                  {user.verified && canVerifyUsers && (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.unverifyButton]}
                      onPress={() => handleUserAction(user, 'unverify')}
                      activeOpacity={0.8}
                    >
                      <LinearGradient
                        colors={['rgba(255, 71, 87, 0.2)', 'rgba(255, 71, 87, 0.1)']}
                        style={styles.actionButtonGradient}
                      >
                        <Ionicons name="close-circle" size={16} color={COLORS.error} />
                        <Text style={[styles.actionButtonText, { color: COLORS.error }]}>
                          Révoquer
                        </Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  )}
                </View>
              </BlurView>
            </Animated.View>
          ))}
          
          <View style={{ height: insets.bottom + SPACING.xxl }} />
        </ScrollView>
      </View>

      {/* Modal de sanction professionnel */}
      {selectedUser && (
        <SanctionModal
          visible={sanctionModalVisible}
          onClose={() => {
            setSanctionModalVisible(false);
            setSelectedUser(null);
          }}
          onConfirm={handleSanctionConfirm}
          user={selectedUser}
          sanctionType={selectedSanctionType}
        />
      )}
    </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  gradient: {
    flex: 1,
  },
  header: {
    position: 'relative',
    zIndex: 100,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
    paddingTop: SPACING.md,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingTop: 16,
  },
  backBtn: {
    marginRight: 16,
  },
  backBtnInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700', fontFamily: fonts.bold,
    flex: 1,
  },
  headerRight: {
    width: 80,
    alignItems: 'center',
  },
  headerStats: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  headerStatsText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '500', fontFamily: fonts.medium,
  },
  searchContainer: {
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  searchBlur: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.glassBackground,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    marginLeft: SPACING.sm,
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  filtersContainer: {
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  filterButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 24,
    marginRight: SPACING.sm,
    backgroundColor: COLORS.glassBackground,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  activeFilterButton: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterButtonText: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontWeight: '500', fontFamily: fonts.medium,
  },
  activeFilterButtonText: {
    color: COLORS.bgPrimary,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
  },
  userCard: {
    marginBottom: SPACING.lg,
    borderRadius: 24,
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  userCardBlur: {
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.glassBackground,
  },
  userCardHeader: {
    flexDirection: 'row',
    padding: SPACING.lg,
    alignItems: 'center',
  },
  userInfo: {
    flexDirection: 'row',
    flex: 1,
    alignItems: 'center',
  },
  userAvatar: {
    marginRight: SPACING.md,
  },
  avatarGradient: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  userDetails: {
    flex: 1,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: COLORS.textPrimary,
    marginRight: SPACING.xs,
  },
  userHandle: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginBottom: SPACING.xs,
  },
  userStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userStat: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginRight: SPACING.xs,
  },
  statusBadge: {
    alignSelf: 'flex-start',
  },
  statusGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: 12,
    gap: SPACING.xs,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600', fontFamily: fonts.semibold,
    textTransform: 'uppercase',
  },
  userCardActions: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    gap: SPACING.sm,
  },
  actionButton: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  actionButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    position: 'relative',
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  suspendButton: {},
  banButton: {},
  reactivateButton: {},
  verifyButton: {},
  unverifyButton: {},
  accessDenied: {
    flex: 1,
  },
  accessDeniedGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accessDeniedContent: {
    alignItems: 'center',
    paddingHorizontal: SPACING.xxl,
    maxWidth: 320,
  },
  accessDeniedTitle: {
    fontSize: 28,
    fontWeight: 'bold', fontFamily: fonts.bold,
    color: COLORS.textPrimary,
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  accessDeniedText: {
    fontSize: 16,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: SPACING.xxl,
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xxl,
  },
  loadingText: {
    marginTop: SPACING.md,
    color: COLORS.textMuted,
    fontSize: 18,
  },
});
