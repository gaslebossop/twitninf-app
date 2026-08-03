import { fonts } from '../theme';
import { ScreenBackground, BackButton } from '../components/ui';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  StatusBar,
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
import { moderationService, Tweet } from '../services/moderationService';
import VerifiedBadge from '../components/VerifiedBadge';

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

export default function ContentModerationScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { isModerator, canDeleteTweets, isClasseur, canModerateContent } = useAdminPermissions();
  const { user } = useAuth();
  
  const [selectedTweet, setSelectedTweet] = useState<Tweet | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'not_eligible' | 'high' | 'critical'>('all');
  const [animationValue] = useState(new Animated.Value(0));
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTweets();
    Animated.timing(animationValue, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  const loadTweets = async () => {
    try {
      console.log('🔄 Début du chargement des tweets...');
      setLoading(true);
      const tweetsData = await moderationService.getTweets();
      console.log('🐦 Tweets data reçu:', tweetsData);
      console.log('🐦 Tweets data type:', typeof tweetsData);
      console.log('🐦 Tweets data length:', tweetsData?.length);
      console.log('🐦 Tweets data is array:', Array.isArray(tweetsData));
      setTweets(tweetsData || []);
      console.log('✅ Tweets chargés avec succès');
    } catch (error) {
      console.error('❌ Erreur lors du chargement des tweets:', error);
      Alert.alert('Erreur', 'Impossible de charger les tweets');
      setTweets([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredTweets = tweets?.filter(tweet => {
    if (filter === 'all') return true;
    if (filter === 'pending') return tweet.moderation_status === 'pending';
    if (filter === 'approved') return tweet.moderation_status === 'approved';
    if (filter === 'rejected') return tweet.moderation_status === 'rejected';
    if (filter === 'not_eligible') return tweet.moderation_status === 'not_eligible';
    if (filter === 'high') return tweet.severity === 'high' || tweet.severity === 'critical';
    if (filter === 'critical') return tweet.severity === 'critical';
    return true;
  }) || [];

  const handleModerationAction = async (tweet: Tweet, action: 'approve' | 'reject' | 'delete' | 'not_eligible') => {
    const actionTexts = {
      approve: 'approuver',
      reject: 'exclure des recommandations',
      delete: 'bannir l\'utilisateur',
      not_eligible: 'marquer comme non éligible'
    };

    const actionDescriptions = {
      approve: 'Le tweet sera approuvé et visible normalement',
      reject: 'Le tweet sera exclu des recommandations mais restera visible',
      delete: 'L\'utilisateur sera banni pour ce contenu inapproprié',
      not_eligible: 'Le tweet sera marqué comme non éligible aux recommandations mais restera visible sur le profil'
    };

    // Pour les actions destructives, demander un motif
    if (action === 'delete') {
      Alert.prompt(
        'Motif du bannissement',
        'Veuillez indiquer le motif du bannissement :',
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Bannir',
            style: 'destructive',
            onPress: async (motif) => {
              if (!motif || motif.trim().length === 0) {
                Alert.alert('Erreur', 'Veuillez indiquer un motif pour le bannissement');
                return;
              }
              await executeAction(tweet, action, motif);
            }
          }
        ],
        'plain-text',
        'Contenu inapproprié'
      );
    } else {
      Alert.alert(
        `${actionTexts[action].charAt(0).toUpperCase() + actionTexts[action].slice(1)}`,
        actionDescriptions[action],
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Confirmer',
            style: 'default',
            onPress: async () => {
              await executeAction(tweet, action, 'Action de modération');
            }
          }
        ]
      );
    }
  };

  const executeAction = async (tweet: Tweet, action: 'approve' | 'reject' | 'delete' | 'not_eligible', motif: string) => {
    try {
      let success = false;
      
      switch (action) {
        case 'approve':
          success = await moderationService.approveTweet(tweet.id);
          break;
        case 'reject':
          success = await moderationService.rejectTweet(tweet.id, motif);
          break;
        case 'delete':
          // Bannir l'utilisateur au lieu de supprimer le tweet
          success = await moderationService.banUser(tweet.author.id, motif);
          break;
        case 'not_eligible':
          success = await moderationService.markTweetNotEligible(tweet.id, motif);
          break;
      }

      if (success) {
        const actionTexts = {
          approve: 'approuvé',
          reject: 'exclu des recommandations',
          delete: 'utilisateur banni',
          not_eligible: 'marqué comme non éligible'
        };
        Alert.alert('Succès', `Tweet ${actionTexts[action]} avec succès.`);
        loadTweets(); // Recharger les données
      } else {
        Alert.alert('Erreur', `Impossible d'effectuer cette action`);
      }
    } catch (error) {
      console.error('❌ Erreur lors de l\'action sur le tweet:', error);
      Alert.alert('Erreur', 'Une erreur est survenue');
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return COLORS.error;
      case 'high': return COLORS.warning;
      case 'medium': return '#ffc107';
      case 'low': return COLORS.success;
      default: return COLORS.textMuted;
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return 'warning';
      case 'high': return 'alert-circle';
      case 'medium': return 'information-circle';
      case 'low': return 'checkmark-circle';
      default: return 'help-circle';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return COLORS.success;
      case 'rejected': return COLORS.warning;
      case 'pending': return COLORS.primary;
      case 'not_eligible': return '#ff9800'; // Orange pour non éligible
      default: return COLORS.textMuted;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return 'checkmark-circle';
      case 'rejected': return 'close-circle';
      case 'pending': return 'time';
      case 'not_eligible': return 'remove-circle';
      default: return 'help-circle';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'approved': return 'APPROUVÉ';
      case 'rejected': return 'REJETÉ';
      case 'pending': return 'EN ATTENTE';
      case 'not_eligible': return 'NON ÉLIGIBLE';
      default: return 'INCONNU';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'À l\'instant';
    if (diffInHours < 24) return `Il y a ${diffInHours}h`;
    return date.toLocaleDateString('fr-FR');
  };

  if (!canDeleteTweets && !canModerateContent) {
    return (
      <View style={styles.container}>
        <View style={[styles.accessDeniedGradient, { backgroundColor: COLORS.bgPrimary }]}>
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
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.bgPrimary} />
        <View style={styles.gradient}>
          <View style={styles.loadingContainer}>
            <Ionicons name="refresh" size={48} color={COLORS.primary} />
            <Text style={styles.loadingText}>Chargement des tweets...</Text>
          </View>
        </View>
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
             <Text style={styles.headerTitle}>
               {isClasseur ? 'Classification de Contenu' : 'Modération de Contenu'}
             </Text>
             <View style={styles.headerRight}>
               <View style={styles.headerStats}>
                 <Text style={styles.headerStatsText}>
                   {tweets?.filter(t => t.moderation_status === 'pending').length || 0} en attente
                 </Text>
               </View>
             </View>
           </View>
         </Animated.View>

        {/* Note informative pour les classeurs */}
        {isClasseur && (
          <Animated.View 
            style={[
              styles.classeurInfoContainer,
              {
                opacity: animationValue,
                transform: [{ translateY: animationValue.interpolate({
                  inputRange: [0, 1],
                  outputRange: [20, 0],
                })}],
              }
            ]}
          >
            <BlurView intensity={20} style={styles.classeurInfoBlur}>
              <View style={styles.classeurInfoContent}>
                <Ionicons name="information-circle" size={20} color={COLORS.primary} />
                <Text style={styles.classeurInfoText}>
                  En tant que classeur de tweets, vous pouvez approuver ou exclure des recommandations, mais pas bannir d'utilisateurs.
                </Text>
              </View>
            </BlurView>
          </Animated.View>
        )}

        {/* Filtres */}
        <Animated.View 
          style={[
            styles.filtersContainer,
            {
              opacity: animationValue,
              transform: [{ translateY: animationValue.interpolate({
                inputRange: [0, 1],
                outputRange: [30, 0],
              })}],
            }
          ]}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                                     {[
                 { key: 'all', label: 'Tous', count: tweets?.length || 0 },
                 { key: 'pending', label: 'En attente', count: tweets?.filter(t => t.moderation_status === 'pending').length || 0 },
                 { key: 'approved', label: 'Approuvés', count: tweets?.filter(t => t.moderation_status === 'approved').length || 0 },
                 { key: 'rejected', label: 'Rejetés', count: tweets?.filter(t => t.moderation_status === 'rejected').length || 0 },
                 { key: 'not_eligible', label: 'Non éligibles', count: tweets?.filter(t => t.moderation_status === 'not_eligible').length || 0 },
                 { key: 'high', label: 'Priorité haute', count: tweets?.filter(t => t.severity === 'high' || t.severity === 'critical').length || 0 },
                 { key: 'critical', label: 'Critique', count: tweets?.filter(t => t.severity === 'critical').length || 0 },
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

        {/* Liste des tweets */}
        <ScrollView 
          style={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {filteredTweets.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-circle" size={64} color={COLORS.textMuted} />
              <Text style={styles.emptyStateTitle}>Aucun tweet</Text>
              <Text style={styles.emptyStateText}>
                {filter === 'all' ? 'Aucun tweet trouvé' : 'Aucun tweet dans cette catégorie'}
              </Text>
            </View>
          ) : (
            filteredTweets.map((tweet, index) => (
              <Animated.View
                key={tweet.id}
                style={[
                  styles.tweetCard,
                  {
                    opacity: animationValue,
                    transform: [{ translateY: animationValue.interpolate({
                      inputRange: [0, 1],
                      outputRange: [50 + (index * 20), 0],
                    })}],
                  }
                ]}
              >
                <BlurView intensity={30} style={styles.tweetCardBlur}>
                  {/* En-tête du tweet */}
                  <View style={styles.tweetHeader}>
                    <View style={styles.authorInfo}>
                      <View style={styles.authorAvatar}>
                        <LinearGradient
                          colors={[`${getSeverityColor(tweet.severity)}40`, `${getSeverityColor(tweet.severity)}20`]}
                          style={styles.avatarGradient}
                        >
                          <Ionicons 
                            name={getSeverityIcon(tweet.severity) as any} 
                            size={20} 
                            color={getSeverityColor(tweet.severity)} 
                          />
                        </LinearGradient>
                      </View>
                      
                      <View style={styles.authorDetails}>
                                                 <View style={styles.authorNameRow}>
                           <Text style={styles.authorName}>{tweet.author.full_name || tweet.author.username}</Text>
                           {tweet.author.verified && (
                             <View style={{ marginLeft: 6 }}>
                               <VerifiedBadge 
                                 verificationStyle={(tweet.author as any).verification_style || 'default'}
                                 size={14} 
                                 animated={true}
                               />
                             </View>
                           )}
                         </View>
                         <Text style={styles.authorHandle}>@{tweet.author.username}</Text>
                         <Text style={styles.tweetDate}>{formatDate(tweet.created_at)}</Text>
                      </View>
                    </View>
                    
                    <View style={styles.badgesContainer}>
                      {/* Badge de gravité */}
                      <View style={styles.severityBadge}>
                        <LinearGradient
                          colors={[`${getSeverityColor(tweet.severity)}20`, `${getSeverityColor(tweet.severity)}10`]}
                          style={styles.severityGradient}
                        >
                          <Ionicons 
                            name={getSeverityIcon(tweet.severity) as any} 
                            size={12} 
                            color={getSeverityColor(tweet.severity)} 
                          />
                          <Text style={[styles.severityText, { color: getSeverityColor(tweet.severity) }]}>
                            {tweet.severity === 'critical' ? 'CRITIQUE' : 
                             tweet.severity === 'high' ? 'HAUTE' : 
                             tweet.severity === 'medium' ? 'MOYENNE' : 'FAIBLE'}
                          </Text>
                        </LinearGradient>
                      </View>

                                             {/* Badge de statut de modération */}
                       <View style={styles.statusBadge}>
                         <LinearGradient
                           colors={[`${getStatusColor(tweet.moderation_status)}20`, `${getStatusColor(tweet.moderation_status)}10`]}
                           style={styles.statusGradient}
                         >
                           <Ionicons 
                             name={getStatusIcon(tweet.moderation_status) as any} 
                             size={12} 
                             color={getStatusColor(tweet.moderation_status)} 
                           />
                           <Text style={[styles.statusText, { color: getStatusColor(tweet.moderation_status) }]}>
                             {getStatusLabel(tweet.moderation_status)}
                           </Text>
                         </LinearGradient>
                       </View>
                    </View>
                  </View>

                  {/* Contenu du tweet */}
                  <View style={styles.tweetContent}>
                    <Text style={styles.tweetText}>{tweet.content}</Text>
                  </View>

                  {/* Statistiques du tweet */}
                  <View style={styles.tweetStats}>
                    <View style={styles.statItem}>
                      <Ionicons name="heart" size={14} color={COLORS.textMuted} />
                      <Text style={styles.statText}>{tweet.likes}</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Ionicons name="repeat" size={14} color={COLORS.textMuted} />
                      <Text style={styles.statText}>{tweet.retweets}</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Ionicons name="chatbubble" size={14} color={COLORS.textMuted} />
                      <Text style={styles.statText}>{tweet.replies}</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Ionicons name="flag" size={14} color={COLORS.error} />
                      <Text style={[styles.statText, { color: COLORS.error }]}>{tweet.reports}</Text>
                    </View>
                  </View>

                  {/* Flags */}
                  {tweet.flags && tweet.flags.length > 0 && (
                    <View style={styles.flagsContainer}>
                      <Text style={styles.flagsTitle}>Raisons de signalement :</Text>
                      <View style={styles.flagsList}>
                        {tweet.flags.map((flag, flagIndex) => (
                          <View key={flagIndex} style={styles.flagItem}>
                            <Text style={styles.flagText}>{flag}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* Actions de modération */}
                  <View style={styles.moderationActions}>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.approveButton]}
                      onPress={() => handleModerationAction(tweet, 'approve')}
                      activeOpacity={0.8}
                    >
                      <LinearGradient
                        colors={['rgba(67, 233, 123, 0.2)', 'rgba(67, 233, 123, 0.1)']}
                        style={styles.actionButtonGradient}
                      >
                        <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
                        <Text style={[styles.actionButtonText, { color: COLORS.success }]}>
                          Approuver
                        </Text>
                      </LinearGradient>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionButton, styles.rejectButton]}
                      onPress={() => handleModerationAction(tweet, 'reject')}
                      activeOpacity={0.8}
                    >
                      <LinearGradient
                        colors={['rgba(255, 165, 2, 0.2)', 'rgba(255, 165, 2, 0.1)']}
                        style={styles.actionButtonGradient}
                      >
                        <Ionicons name="close-circle" size={16} color={COLORS.warning} />
                        <Text style={[styles.actionButtonText, { color: COLORS.warning }]}>
                          Exclure
                        </Text>
                      </LinearGradient>
                    </TouchableOpacity>

                 

                    {/* Bouton Bannir - seulement pour les modérateurs, pas les classeurs */}
                    {!isClasseur && (
                      <TouchableOpacity
                        style={[styles.actionButton, styles.deleteButton]}
                        onPress={() => handleModerationAction(tweet, 'delete')}
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
                  </View>
                </BlurView>
              </Animated.View>
            ))
          )}
          
          <View style={{ height: insets.bottom + SPACING.xxl }} />
        </ScrollView>
      </View>
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
    marginBottom: SPACING.md,
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
  tweetCard: {
    marginBottom: SPACING.lg,
    borderRadius: 24,
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  tweetCardBlur: {
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.glassBackground,
    padding: SPACING.lg,
  },
  tweetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  authorInfo: {
    flexDirection: 'row',
    flex: 1,
  },
  authorAvatar: {
    marginRight: SPACING.md,
  },
  avatarGradient: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  authorDetails: {
    flex: 1,
  },
  authorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  authorName: {
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: COLORS.textPrimary,
    marginRight: SPACING.xs,
  },
  authorHandle: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginBottom: SPACING.xs,
  },
  tweetDate: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  badgesContainer: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignSelf: 'flex-start',
  },
  severityBadge: {
    alignSelf: 'flex-start',
  },
  severityGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: 12,
    gap: SPACING.xs,
  },
  severityText: {
    fontSize: 10,
    fontWeight: '600', fontFamily: fonts.semibold,
    textTransform: 'uppercase',
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
  tweetContent: {
    marginBottom: SPACING.md,
  },
  tweetText: {
    fontSize: 16,
    color: COLORS.textPrimary,
    lineHeight: 24,
  },
  tweetStats: {
    flexDirection: 'row',
    marginBottom: SPACING.md,
    gap: SPACING.lg,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  statText: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  flagsContainer: {
    marginBottom: SPACING.md,
  },
  flagsTitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: SPACING.xs,
  },
  flagsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  flagItem: {
    backgroundColor: 'rgba(255, 71, 87, 0.1)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 71, 87, 0.2)',
  },
  flagText: {
    fontSize: 10,
    color: COLORS.error,
    fontWeight: '500', fontFamily: fonts.medium,
  },
  moderationActions: {
    flexDirection: 'row',
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
  approveButton: {},
  rejectButton: {},
  deleteButton: {},
  notEligibleButton: {},
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
    paddingVertical: SPACING.xxl,
  },
  loadingText: {
    marginTop: SPACING.md,
    color: COLORS.textMuted,
    fontSize: 16,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: SPACING.xxl,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: 'bold', fontFamily: fonts.bold,
    color: COLORS.textPrimary,
    marginTop: SPACING.md,
  },
  emptyStateText: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
  classeurInfoContainer: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  classeurInfoBlur: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(79, 124, 255, 0.3)',
  },
  classeurInfoContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
  },
  classeurInfoText: {
    flex: 1,
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginLeft: SPACING.sm,
  },
});
