import { fonts , colors, statusBarStyle} from '../theme';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Dimensions,
  Animated,
  Modal,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Clipboard,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiService } from '../services/api';
import { BackButton, ScreenSkeleton } from '../components/ui';
import { toast } from '../components/ui/Toast';
import { showActionSheet } from '../components/ui/ActionSheet';

const { width } = Dimensions.get('window');

type TabType = 'analytics' | 'transactions' | 'holders' | 'management';
type TransactionTypeFilter = 'ALL' | 'TRANSFER' | 'PURCHASE' | 'SYSTEM' | 'REWARD' | 'REFUND';

interface TransactionStats {
  volume24h: number;
  count24h: number;
}

export default function EconomyManagementScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  
  const [activeTab, setActiveTab] = useState<TabType>('analytics');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Data States
  const [stats, setStats] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [transactionStats, setTransactionStats] = useState<TransactionStats>({ volume24h: 0, count24h: 0 });
  const [richList, setRichList] = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<TransactionTypeFilter>('ALL');
  
  // Modal States
  const [modalVisible, setModalVisible] = useState(false);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [modalType, setModalType] = useState<'balance' | 'lock' | 'transfer'>('balance');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [modalValue, setModalValue] = useState('');
  const [modalReason, setModalReason] = useState('');
  const [processing, setProcessing] = useState(false);

  // Animation (Initialisée à 1 pour éviter l'écran noir)
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const loadData = useCallback(async (filter: TransactionTypeFilter = 'ALL') => {
    setLoading(true);
    try {
      const [statsRes, txRes, richRes] = await Promise.all([
        apiService.getEconomyStats(),
        apiService.getEconomyTransactions({ limit: 50, type: filter }),
        apiService.getEconomyRichList(30)
      ]);

      if (statsRes.success) setStats((statsRes as any).stats);
      if (txRes.success) {
        const txData = txRes as any;
        setTransactions(txData.data);
        if (txData.stats24h) {
          setTransactionStats({
            volume24h: txData.stats24h.volume,
            count24h: txData.stats24h.count
          });
        }
      }
      if (richRes.success) setRichList(richRes.data);
      
    } catch (error) {
      console.error('Erreur chargement économie:', error);
      toast.error('Impossible de charger les données économiques');
    } finally {
      setLoading(false);
      // Toujours lancer l'animation pour éviter l'écran noir si une requête a échoué
    }
  }, []);

  useEffect(() => {
    loadData(selectedFilter);
  }, [loadData, selectedFilter]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleAction = async () => {
    if (!selectedUser) return;
    setProcessing(true);
    
    try {
      let res;
      if (modalType === 'balance') {
        res = await apiService.updateWalletBalance(selectedUser.id, parseFloat(modalValue), modalReason || 'Ajustement Gardien');
      } else if (modalType === 'lock') {
        res = await apiService.toggleWalletLock(selectedUser.id, !selectedUser.isLocked, modalReason || 'Action Gardien');
      } else if (modalType === 'transfer') {
        res = await apiService.manualEconomyTransfer({
          fromUserId: null, // System by default for now
          toUserId: selectedUser.id,
          amount: parseFloat(modalValue),
          description: modalReason || 'Récompense Gardien'
        });
      }

      if (res?.success) {
        toast.success('Opération effectuée avec succès');
        setModalVisible(false);
        loadData();
        if (activeTab === 'management') handleSearchUsers();
      } else {
        toast.error(res?.message || 'L\'opération a échoué');
      }
    } catch (e) {
      toast.error('Une erreur technique est survenue');
    } finally {
      setProcessing(false);
    }
  };

  const openActionModal = (user: any, type: 'balance' | 'lock' | 'transfer') => {
    setSelectedUser(user);
    setModalType(type);
    setModalValue(type === 'balance' ? user.balance.toString() : '');
    setModalReason('');
    setModalVisible(true);
  };

  const handleSearchUsers = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    const res = await apiService.searchEconomyWallets(searchQuery);
    if (res.success) {
      setSearchResults(res.data);
    }
    setLoading(false);
  };

  const formatAmount = (val: number) => {
    if (val >= 1000000000) return (val / 1000000000).toFixed(2) + 'B';
    if (val >= 1000000) return (val / 1000000).toFixed(2) + 'M';
    return new Intl.NumberFormat('fr-FR').format(Math.floor(val));
  };

  const formatPreciseAmount = (val: number) => {
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(val);
  };

  const handleDeleteTransaction = async (id: string) => {
    showActionSheet({
      title: 'Supprimer cette transaction',
      message: 'Deux effets très différents — le libellé seul ne suffisait pas à les distinguer.',
      items: [
        {
          label: 'Supprimer la trace seule',
          icon: 'document-outline',
          hint: 'Les soldes des comptes concernés ne bougent pas.',
          destructive: true,
          onPress: () => executeDelete(id, false),
        },
        {
          label: 'Supprimer et rembourser',
          icon: 'swap-horizontal-outline',
          hint: 'Les soldes sont ajustés comme si la transaction n’avait pas eu lieu.',
          destructive: true,
          onPress: () => executeDelete(id, true),
        },
      ],
    });
  };

  const executeDelete = async (id: string, refund: boolean) => {
    setProcessing(true);
    try {
      const res = await apiService.deleteEconomyTransaction(id, refund);
      if (res.success) {
        toast.success('La transaction a été traitée.');
        loadData();
      } else {
        toast.error(res.message);
      }
    } catch (e) {
      toast.error('Erreur technique');
    } finally {
      setProcessing(false);
    }
  };

  const renderAnalytics = () => (
    <ScrollView 
      style={styles.tabContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f7931e" />}
    >
      <View style={styles.statsGrid}>
        <LinearGradient colors={['#1a1c2c', '#151724']} style={styles.statCardLarge}>
          <Ionicons name="globe-outline" size={24} color="#f7931e" style={styles.cardIcon} />
          <Text style={styles.statLabel}>Masse Monétaire (M0)</Text>
          <Text style={styles.statValueLarge}>{formatAmount(stats?.circulatingSupply || 0)} <Text style={styles.currencySuffix}>TWC</Text></Text>
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { width: '70%' }]} />
          </View>
          <Text style={styles.statSub}>Total injecté dans l'écosystème</Text>
        </LinearGradient>
        
        <View style={styles.statRow}>
          <LinearGradient colors={['#1a1c2c', '#151724']} style={styles.statCardSmall}>
            <Text style={styles.statLabel}>Réserve Système</Text>
            <Text style={[styles.statValue, { color: '#f7931e' }]}>{formatAmount(stats?.systemReserve || 0)}</Text>
            <Text style={styles.statSub}>Solde TwitNinf</Text>
          </LinearGradient>

          <LinearGradient colors={['#1a1c2c', '#151724']} style={styles.statCardSmall}>
            <Text style={styles.statLabel}>Prix Marché</Text>
            <Text style={[styles.statValue, { color: '#43e97b' }]}>{stats?.currencyPrice?.toFixed(4) || 0} €</Text>
            <Text style={styles.statSub}>x{stats?.multiplier?.toFixed(2) || 1} multiplicateur</Text>
          </LinearGradient>
        </View>

        <LinearGradient colors={['#1a1c2c', '#151724']} style={styles.statCardMedium}>
          <View style={styles.cardHeader}>
            <Text style={styles.statLabel}>Solde Réel Total App</Text>
            <Ionicons name="shield-checkmark" size={20} color="#43e97b" />
          </View>
          <Text style={styles.statValueMedium}>{formatAmount(stats?.realTimeTotalBalance || 0)} TWC</Text>
          <Text style={styles.statSub}>Somme cumulée de tous les portefeuilles</Text>
        </LinearGradient>
      </View>

      <BlurView intensity={20} tint="dark" style={styles.infoBox}>
        <Ionicons name="information-circle" size={24} color="#f7931e" />
        <Text style={styles.infoText}>
          En tant que <Text style={{fontWeight: 'bold', fontFamily: fonts.bold, color: '#f7931e'}}>Gardien</Text>, votre mission est de maintenir l'inflation sous contrôle. 
          Un écart trop grand entre M0 et le Solde Réel peut indiquer des duplications frauduleuses.
        </Text>
      </BlurView>
      <View style={{ height: 100 }} />
    </ScrollView>
  );

  const renderTransactions = () => (
    <View style={{ flex: 1 }}>
      {/* Stats Header */}
      <View style={styles.fluxStatsBar}>
        <View style={styles.fluxStatItem}>
          <Text style={styles.fluxStatLabel}>Vol. 24h</Text>
          <Text style={styles.fluxStatValue}>{formatAmount(transactionStats.volume24h)} TWC</Text>
        </View>
        <View style={styles.fluxStatDivider} />
        <View style={styles.fluxStatItem}>
          <Text style={styles.fluxStatLabel}>Transactions</Text>
          <Text style={styles.fluxStatValue}>{transactionStats.count24h}</Text>
        </View>
      </View>

      {/* Filters */}
      <View style={{ height: 50 }}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          style={styles.filterBar}
          contentContainerStyle={styles.filterBarContent}
        >
          {(['ALL', 'TRANSFER', 'PURCHASE', 'REWARD', 'SYSTEM', 'REFUND'] as TransactionTypeFilter[]).map((f) => (
            <TouchableOpacity 
              key={f} 
              style={[styles.filterChip, selectedFilter === f && styles.filterChipActive]}
              onPress={() => setSelectedFilter(f)}
            >
              <Text style={[styles.filterChipText, selectedFilter === f && styles.filterChipTextActive]}>
                {f === 'ALL' ? 'Tout' : f === 'TRANSFER' ? 'Transferts' : f === 'PURCHASE' ? 'Achats' : f === 'REWARD' ? 'Récompenses' : f === 'SYSTEM' ? 'Système' : 'Annulations'}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f7931e" />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="receipt-outline" size={64} color="#333" />
            <Text style={styles.emptyText}>Aucune transaction trouvée</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isPositive = item.type === 'PURCHASE' || item.type === 'REWARD';
          const typeIcon = 
            item.type === 'TRANSFER' ? 'swap-horizontal-outline' :
            item.type === 'PURCHASE' ? 'cart-outline' :
            item.type === 'REWARD' ? 'gift-outline' :
            item.type === 'REFUND' ? 'refresh-outline' : 'cog-outline';
          
          return (
            <TouchableOpacity 
              style={styles.transactionCardNew}
              onPress={() => {
                setSelectedTransaction(item);
                setDetailsModalVisible(true);
              }}
            >
              <LinearGradient 
                colors={['#1a1c2c', '#151724']} 
                style={styles.txGradient}
                start={{x: 0, y: 0}} 
                end={{x: 1, y: 1}}
              >
                <View style={styles.txHeaderNew}>
                  <View style={[styles.txIconContainer, { backgroundColor: isPositive ? 'rgba(67, 233, 123, 0.1)' : 'rgba(247, 147, 30, 0.1)' }]}>
                    <Ionicons name={typeIcon} size={18} color={isPositive ? '#43e97b' : '#f7931e'} />
                  </View>
                  <View style={styles.txMainInfoNew}>
                    <Text style={styles.txTypeTitle}>{item.type === 'TRANSFER' ? 'TRANSFERT FORCE' : item.type}</Text>
                    <Text style={styles.txDateNew}>{new Date(item.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} • {new Date(item.createdAt).toLocaleDateString()}</Text>
                  </View>
                  <View style={styles.txAmountContainerNew}>
                    <Text style={[styles.txAmountNew, { color: isPositive ? '#43e97b' : (item.amount > 100000 ? '#ff4757' : '#fff') }]}>
                      {item.fromUserId === null ? '+' : ''}{formatPreciseAmount(item.amount)}
                    </Text>
                  </View>
                </View>

                <View style={styles.txUsersRowNew}>
                  <Text style={styles.txUserNameNew} numberOfLines={1}>{item.fromUser?.username || 'SYSTEM'}</Text>
                  <Ionicons name="arrow-forward" size={12} color="#444" style={{ marginHorizontal: 8 }} />
                  <Text style={styles.txUserNameNew} numberOfLines={1}>{item.toUser?.username || 'INCONNU'}</Text>
                </View>

                {item.description && (
                  <View style={styles.txDescriptionBoxNew}>
                    <Text style={styles.txDescriptionTextNew} numberOfLines={1}>"{item.description}"</Text>
                  </View>
                )}

                <View style={styles.txFooterNew}>
                  <View style={styles.txStatusBadgeNew}>
                    <View style={[styles.statusDotNew, { backgroundColor: item.status === 'COMPLETED' ? '#43e97b' : '#f7931e' }]} />
                    <Text style={styles.statusTextNew}>{item.status}</Text>
                  </View>
                  <TouchableOpacity 
                    onPress={(e) => {
                      e.stopPropagation();
                      handleDeleteTransaction(item.id);
                    }}
                    style={styles.txActionBtnNew}
                  >
                    <Ionicons name="trash-outline" size={16} color="#ff4757" />
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );

  const renderHolders = () => (
    <FlatList
      data={richList}
      keyExtractor={(item) => item.userId}
      style={[styles.tabContent, { flex: 1 }]}
      contentContainerStyle={{ paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f7931e" />}
      renderItem={({ item, index }) => (
        <LinearGradient 
          colors={[colors.overlaySoft, colors.overlaySoft]} 
          style={styles.holderItem}
        >
          <View style={styles.rankContainer}>
            {index < 3 ? (
              <Text style={styles.rankBadge}>{index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}</Text>
            ) : (
              <Text style={styles.rankText}>#{index + 1}</Text>
            )}
          </View>
          
          <View style={styles.holderInfo}>
            <Text style={styles.holderName} numberOfLines={1}>{item.username}</Text>
            <View style={styles.holderMeta}>
              {item.isVerified && <Ionicons name="checkmark-circle" size={12} color="#4F7CFF" />}
              <Text style={styles.holderShare}>{( (item.balance / (stats?.circulatingSupply || 1)) * 100 ).toFixed(2)}% de l'éco</Text>
            </View>
          </View>

          <View style={styles.holderValue}>
            <Text style={styles.holderBalance}>{formatPreciseAmount(item.balance)}</Text>
            <Text style={styles.holderCurrency}>TWC</Text>
          </View>
        </LinearGradient>
      )}
    />
  );

  const renderManagement = () => (
    <ScrollView style={styles.tabContent} contentContainerStyle={{ paddingBottom: 100 }}>
      {/* Recherche Pro */}
      <View style={styles.managementCard}>
        <Text style={styles.cardTitle}>Gestion des Comptes</Text>
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchBar}
            placeholder="Pseudo ou ID utilisateur..."
            placeholderTextColor="#9BA1AC"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearchUsers}
          />
          <TouchableOpacity style={styles.searchExecute} onPress={handleSearchUsers}>
            <Ionicons name="search" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {searchResults.map(user => (
          <View key={user.id} style={styles.userResultCard}>
            <View style={styles.userMain}>
              <View style={styles.userAvatar}>
                <Text style={styles.avatarInitial}>{user.username[0].toUpperCase()}</Text>
              </View>
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{user.username}</Text>
                <Text style={styles.userBalance}>{formatPreciseAmount(user.balance)} TWC</Text>
              </View>
              {user.isLocked && <View style={styles.frozenBadge}><Text style={styles.frozenText}>GELÉ</Text></View>}
            </View>
            
            <View style={styles.userActionsRow}>
              <TouchableOpacity 
                style={[styles.miniActionBtn, { backgroundColor: '#43e97b' }]}
                onPress={() => openActionModal(user, 'transfer')}
              >
                <Ionicons name="gift-outline" size={16} color="#000" />
                <Text style={styles.miniActionTxt}>Donner</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.miniActionBtn, { backgroundColor: '#f7931e' }]}
                onPress={() => openActionModal(user, 'balance')}
              >
                <Ionicons name="create-outline" size={16} color="#000" />
                <Text style={styles.miniActionTxt}>Éditer</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.miniActionBtn, { backgroundColor: user.isLocked ? '#9BA1AC' : '#ff4757' }]}
                onPress={() => openActionModal(user, 'lock')}
              >
                <Ionicons name={user.isLocked ? "lock-open-outline" : "snow-outline"} size={16} color="#fff" />
                <Text style={[styles.miniActionTxt, { color: '#fff' }]}>{user.isLocked ? 'Dégeler' : 'Geler'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.cautionBox}>
        <Ionicons name="warning-outline" size={24} color="#ff4757" />
        <View style={styles.cautionContent}>
          <Text style={styles.cautionTitle}>Actions Irréversibles</Text>
          <Text style={styles.cautionText}>Toute modification de solde impacte la masse monétaire. Soyez vigilant.</Text>
        </View>
      </View>
    </ScrollView>
  );

  const renderDetailsModal = () => {
    if (!selectedTransaction) return null;

    return (
      <Modal
        visible={detailsModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailsModalVisible(false)}
      >
        <BlurView intensity={80} tint="dark" style={styles.modalOverlay}>
          <View style={styles.detailsContainer}>
            <View style={styles.detailsHeader}>
              <View style={styles.detailsIconCircle}>
                <Ionicons name="receipt" size={32} color="#f7931e" />
              </View>
              <Text style={styles.detailsTitle}>Détails Transaction</Text>
              <Text style={styles.detailsId}>ID: {selectedTransaction.id.substring(0, 18)}...</Text>
            </View>

            <ScrollView style={styles.detailsContent}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Type</Text>
                <Text style={styles.detailValue}>{selectedTransaction.type}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Statut</Text>
                <View style={[styles.statusBadgeLarge, { backgroundColor: selectedTransaction.status === 'COMPLETED' ? 'rgba(67, 233, 123, 0.1)' : 'rgba(247, 147, 30, 0.1)' }]}>
                  <Text style={[styles.statusTextLarge, { color: selectedTransaction.status === 'COMPLETED' ? '#43e97b' : '#f7931e' }]}>{selectedTransaction.status}</Text>
                </View>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Montant</Text>
                <Text style={styles.detailValueLarge}>{formatPreciseAmount(selectedTransaction.amount)} TWC</Text>
              </View>

              <View style={styles.detailsDivider} />

              <View style={styles.detailSection}>
                <Text style={styles.sectionTitle}>Flux Monétaire</Text>
                <View style={styles.actorCard}>
                  <View style={styles.actorInfo}>
                    <Text style={styles.actorLabel}>EXPÉDITEUR</Text>
                    <Text style={styles.actorName}>{selectedTransaction.fromUser?.username || 'SYSTÈME'}</Text>
                    <Text style={styles.actorId}>{selectedTransaction.fromUserId || 'N/A'}</Text>
                  </View>
                </View>
                <View style={styles.detailsArrow}>
                  <Ionicons name="arrow-down" size={20} color="#444" />
                </View>
                <View style={styles.actorCard}>
                  <View style={styles.actorInfo}>
                    <Text style={styles.actorLabel}>DESTINATAIRE</Text>
                    <Text style={styles.actorName}>{selectedTransaction.toUser?.username || 'Utilisateur'}</Text>
                    <Text style={styles.actorId}>{selectedTransaction.toUserId}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.detailsDivider} />

              <View style={styles.detailSection}>
                <Text style={styles.sectionTitle}>Description & Message</Text>
                <View style={styles.descriptionCard}>
                  <Text style={styles.descriptionTextFull}>{selectedTransaction.description || 'Aucune description fournie.'}</Text>
                </View>
              </View>

              <View style={styles.detailSection}>
                <Text style={styles.sectionTitle}>Preuve (Hash)</Text>
                <TouchableOpacity 
                  style={styles.hashCard}
                  onPress={() => {
                    Clipboard.setString(selectedTransaction.transactionHash);
                    toast.success('Copié', {
                      description: 'Le hash a été copié',
                    });
                  }}
                >
                  <Text style={styles.hashText}>{selectedTransaction.transactionHash}</Text>
                  <Ionicons name="copy-outline" size={16} color="#f7931e" />
                </TouchableOpacity>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Horodatage</Text>
                <Text style={styles.detailValue}>{new Date(selectedTransaction.createdAt).toLocaleString('fr-FR')}</Text>
              </View>
              
              <View style={{ height: 40 }} />
            </ScrollView>

            <TouchableOpacity 
              style={styles.closeDetailsBtn}
              onPress={() => setDetailsModalVisible(false)}
            >
              <Text style={styles.closeDetailsText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </BlurView>
      </Modal>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle={statusBarStyle()} />
      <LinearGradient colors={['#0a0b14', '#121422']} style={StyleSheet.absoluteFill} />
      
      {/* Dynamic Header */}
      <View style={styles.header}>
        <BackButton navigation={navigation} />
        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle}>Economy Admin</Text>
          <View style={styles.badgeRow}>
            <View style={styles.statusDot} />
            <Text style={styles.headerSub}>NOEUD RÉSEAU ACTIF</Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => loadData(selectedFilter)} style={styles.refreshCircle}>
          <Ionicons name="sync-outline" size={20} color="#f7931e" />
        </TouchableOpacity>
      </View>

      {/* Modern Tabs */}
      <View style={styles.tabContainer}>
        {(['analytics', 'transactions', 'holders', 'management'] as TabType[]).map(tab => (
          <TouchableOpacity 
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[styles.tabButton, activeTab === tab && styles.tabButtonActive]}
          >
            <Ionicons 
              name={
                tab === 'analytics' ? 'bar-chart' : 
                tab === 'transactions' ? 'swap-horizontal' : 
                tab === 'holders' ? 'list' : 'construct'
              } 
              size={18} 
              color={activeTab === tab ? '#f7931e' : '#9BA1AC'} 
            />
            {activeTab === tab && <Text style={styles.tabTextActive}>{
              tab === 'analytics' ? 'Stats' : 
              tab === 'transactions' ? 'Flux' : 
              tab === 'holders' ? 'Riches' : 'Gérer'
            }</Text>}
          </TouchableOpacity>
        ))}
      </View>

      {/* Main Content Area */}
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        {loading && !refreshing ? (
          <ScreenSkeleton variant="list" />
        ) : (
          <>
            {activeTab === 'analytics' && renderAnalytics()}
            {activeTab === 'transactions' && renderTransactions()}
            {activeTab === 'holders' && renderHolders()}
            {activeTab === 'management' && renderManagement()}
          </>
        )}
      </Animated.View>

      {/* Custom Action Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <BlurView intensity={80} tint="dark" style={styles.modalBlur}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {modalType === 'balance' ? 'Ajuster le Solde' : 
                   modalType === 'lock' ? (selectedUser?.isLocked ? 'Dégeler le Compte' : 'Geler le Compte') : 
                   'Donner des TWC'}
                </Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Ionicons name="close-circle" size={28} color="#9BA1AC" />
                </TouchableOpacity>
              </View>

              <Text style={styles.modalTarget}>Utilisateur : <Text style={{color: '#f7931e'}}>{selectedUser?.username}</Text></Text>
              
              {modalType !== 'lock' && (
                <View style={styles.inputGroup}>
                  <Text style={styles.modalLabel}>{modalType === 'balance' ? 'Nouveau Solde' : 'Montant à envoyer'}</Text>
                  <TextInput
                    style={styles.modalInput}
                    keyboardType="numeric"
                    value={modalValue}
                    onChangeText={setModalValue}
                    placeholder="0.00"
                    placeholderTextColor="#444"
                  />
                </View>
              )}

              <View style={styles.inputGroup}>
                <Text style={styles.modalLabel}>Raison de l'action (interne)</Text>
                <TextInput
                  style={[styles.modalInput, { height: 80, textAlignVertical: 'top' }]}
                  multiline
                  numberOfLines={3}
                  value={modalReason}
                  onChangeText={setModalReason}
                  placeholder="Ex: Correction bug, Récompense concours..."
                  placeholderTextColor="#444"
                />
              </View>

              <TouchableOpacity 
                style={[styles.confirmBtn, { backgroundColor: modalType === 'lock' && !selectedUser?.isLocked ? '#ff4757' : '#f7931e' }]} 
                onPress={handleAction}
                disabled={processing}
              >
                {processing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.confirmBtnText}>
                    {modalType === 'balance' ? 'Mettre à jour' : 
                     modalType === 'lock' ? (selectedUser?.isLocked ? 'Confirmer le dégel' : 'Confirmer le gel') : 
                     'Envoyer les Fonds'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </BlurView>
        </KeyboardAvoidingView>
      </Modal>
      {renderDetailsModal()}
    </View>
  );
};


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0b14',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  backCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.overlayMedium,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitles: {
    marginLeft: 15,
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800', fontFamily: fonts.bold,
    color: '#fff',
    letterSpacing: -0.5,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#43e97b',
    marginRight: 6,
    shadowColor: '#43e97b',
    shadowRadius: 4,
    shadowOpacity: 0.8,
  },
  headerSub: {
    fontSize: 10,
    color: '#9BA1AC',
    fontWeight: '700', fontFamily: fonts.bold,
    letterSpacing: 1,
  },
  refreshCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(247, 147, 30, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.overlaySoft,
    marginHorizontal: 20,
    marginTop: 10,
    borderRadius: 16,
    padding: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  tabButtonActive: {
    backgroundColor: 'rgba(247, 147, 30, 0.1)',
  },
  tabTextActive: {
    color: '#f7931e',
    fontSize: 12,
    fontWeight: 'bold', fontFamily: fonts.bold,
    marginLeft: 6,
  },
  content: {
    flex: 1,
  },
  tabContent: {
    padding: 20,
  },
  statsGrid: {
    gap: 12,
  },
  statCardLarge: {
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.overlayMedium,
  },
  cardIcon: {
    position: 'absolute',
    right: 20,
    top: 20,
    opacity: 0.2,
  },
  statLabel: {
    color: '#9BA1AC',
    fontSize: 13,
    fontWeight: '600', fontFamily: fonts.semibold,
    marginBottom: 8,
  },
  statValueLarge: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '900', fontFamily: fonts.bold,
    letterSpacing: -1,
  },
  currencySuffix: {
    fontSize: 14,
    color: '#9BA1AC',
    fontWeight: '400', fontFamily: fonts.regular,
  },
  progressContainer: {
    height: 4,
    backgroundColor: colors.overlayMedium,
    borderRadius: 2,
    marginTop: 15,
    marginBottom: 5,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#f7931e',
    borderRadius: 2,
  },
  statSub: {
    color: '#9BA1AC',
    fontSize: 11,
  },
  statRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCardSmall: {
    flex: 1,
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.overlayMedium,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800', fontFamily: fonts.bold,
    marginBottom: 4,
  },
  statCardMedium: {
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.overlayMedium,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  statValueMedium: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800', fontFamily: fonts.bold,
  },
  infoBox: {
    marginTop: 20,
    padding: 16,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(247, 147, 30, 0.1)',
    overflow: 'hidden',
  },
  infoText: {
    color: '#cbd5e0',
    fontSize: 12,
    marginLeft: 12,
    flex: 1,
    lineHeight: 18,
  },
  transactionItem: {
    flexDirection: 'row',
    backgroundColor: colors.overlaySoft,
    marginHorizontal: 20,
    marginBottom: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.overlayMedium,
    overflow: 'hidden',
  },
  txIndicator: {
    width: 4,
    backgroundColor: '#f7931e',
    paddingVertical: 10,
  },
  txMain: {
    flex: 1,
    padding: 12,
  },
  txHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  txType: {
    color: '#9BA1AC',
    fontSize: 9,
    fontWeight: '900', fontFamily: fonts.bold,
    letterSpacing: 1,
  },
  txDate: {
    color: '#555',
    fontSize: 10,
  },
  txFlow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  txUserText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  txFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  txAmount: {
    color: '#43e97b',
    fontSize: 16,
    fontWeight: '800', fontFamily: fonts.bold,
  },
  txActionBtn: {
    padding: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 60,
  },
  emptyText: {
    color: '#1a1c2c',
    fontSize: 14,
    fontWeight: 'bold', fontFamily: fonts.bold,
    marginTop: 10,
  },
  holderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.overlaySoft,
  },
  rankContainer: {
    width: 40,
    alignItems: 'center',
  },
  rankBadge: {
    fontSize: 22,
  },
  rankText: {
    color: '#444',
    fontWeight: 'bold', fontFamily: fonts.bold,
    fontSize: 14,
  },
  holderInfo: {
    flex: 1,
    paddingHorizontal: 12,
  },
  holderName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700', fontFamily: fonts.bold,
    marginBottom: 2,
  },
  holderMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  holderShare: {
    color: '#9BA1AC',
    fontSize: 10,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  holderValue: {
    alignItems: 'flex-end',
  },
  holderBalance: {
    color: '#43e97b',
    fontSize: 16,
    fontWeight: '900', fontFamily: fonts.bold,
  },
  holderCurrency: {
    fontSize: 10,
    color: '#444',
    fontWeight: 'bold', fontFamily: fonts.bold,
  },
  managementCard: {
    backgroundColor: colors.overlaySoft,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.overlayMedium,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800', fontFamily: fonts.bold,
    marginBottom: 15,
  },
  searchContainer: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  searchBar: {
    flex: 1,
    backgroundColor: 'transparent',
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#1a1c2c',
  },
  searchExecute: {
    backgroundColor: '#f7931e',
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  userResultCard: {
    backgroundColor: '#0a0b14',
    padding: 15,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1a1c2c',
  },
  userMain: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1a1c2c',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    color: '#f7931e',
    fontWeight: 'bold', fontFamily: fonts.bold,
  },
  userInfo: {
    marginLeft: 12,
    flex: 1,
  },
  userName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700', fontFamily: fonts.bold,
  },
  userBalance: {
    color: '#9BA1AC',
    fontSize: 12,
  },
  frozenBadge: {
    backgroundColor: 'rgba(255, 71, 87, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 71, 87, 0.3)',
  },
  frozenText: {
    color: '#ff4757',
    fontSize: 9,
    fontWeight: 'bold', fontFamily: fonts.bold,
  },
  userActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  miniActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  miniActionTxt: {
    fontSize: 11,
    fontWeight: 'bold', fontFamily: fonts.bold,
    color: '#000',
  },
  cautionBox: {
    marginTop: 20,
    backgroundColor: 'rgba(255, 71, 87, 0.05)',
    padding: 16,
    borderRadius: 16,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: 'rgba(255, 71, 87, 0.1)',
  },
  cautionContent: {
    marginLeft: 12,
    flex: 1,
  },
  cautionTitle: {
    color: '#ff4757',
    fontSize: 13,
    fontWeight: 'bold', fontFamily: fonts.bold,
    marginBottom: 2,
  },
  cautionText: {
    color: '#9BA1AC',
    fontSize: 11,
    lineHeight: 16,
  },
  loadingOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#9BA1AC',
    marginTop: 10,
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalBlur: {
    borderRadius: 32,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.overlayMedium,
  },
  modalContent: {
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900', fontFamily: fonts.bold,
  },
  modalTarget: {
    color: '#9BA1AC',
    fontSize: 14,
    marginBottom: 25,
  },
  inputGroup: {
    marginBottom: 20,
  },
  modalLabel: {
    color: '#9BA1AC',
    fontSize: 12,
    fontWeight: '700', fontFamily: fonts.bold,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  modalInput: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 16,
    padding: 16,
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold', fontFamily: fonts.bold,
    borderWidth: 1,
    borderColor: '#1a1c2c',
  },
  confirmBtn: {
    paddingVertical: 18,
    borderRadius: 20,
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  confirmBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '900', fontFamily: fonts.bold,
  },
  // New Flux Styles
  fluxStatsBar: {
    flexDirection: 'row',
    backgroundColor: '#0a0b14',
    margin: 16,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.overlayMedium,
  },
  fluxStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  fluxStatDivider: {
    width: 1,
    height: '60%',
    backgroundColor: colors.overlayMedium,
    alignSelf: 'center',
  },
  fluxStatLabel: {
    color: '#9BA1AC',
    fontSize: 10,
    fontWeight: 'bold', fontFamily: fonts.bold,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  fluxStatValue: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900', fontFamily: fonts.bold,
  },
  filterBar: {
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  filterBarContent: {
    gap: 8,
    paddingRight: 32,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#0a0b14',
    borderWidth: 1,
    borderColor: colors.overlayMedium,
  },
  filterChipActive: {
    backgroundColor: '#f7931e',
    borderColor: '#f7931e',
  },
  filterChipText: {
    color: '#9BA1AC',
    fontSize: 12,
    fontWeight: 'bold', fontFamily: fonts.bold,
  },
  filterChipTextActive: {
    color: '#000',
  },
  transactionCardNew: {
    marginBottom: 12,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.overlaySoft,
  },
  txGradient: {
    padding: 16,
  },
  txHeaderNew: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  txIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  txMainInfoNew: {
    flex: 1,
    marginLeft: 12,
  },
  txTypeTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold', fontFamily: fonts.bold,
  },
  txDateNew: {
    color: '#555',
    fontSize: 10,
  },
  txAmountContainerNew: {
    alignItems: 'flex-end',
  },
  txAmountNew: {
    fontSize: 16,
    fontWeight: '900', fontFamily: fonts.bold,
  },
  txUsersRowNew: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    padding: 8,
    borderRadius: 10,
    marginBottom: 8,
  },
  txUserNameNew: {
    color: '#9BA1AC',
    fontSize: 12,
    fontWeight: '600', fontFamily: fonts.semibold,
    flex: 1,
  },
  txDescriptionBoxNew: {
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  txDescriptionTextNew: {
    color: '#555',
    fontSize: 11,
    fontStyle: 'italic',
  },
  txFooterNew: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  txStatusBadgeNew: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.overlaySoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusDotNew: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusTextNew: {
    color: '#9BA1AC',
    fontSize: 10,
    fontWeight: 'bold', fontFamily: fonts.bold,
  },
  txActionBtnNew: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 71, 87, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Details Modal Styles
  detailsContainer: {
    backgroundColor: '#0a0b14',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: colors.overlayMedium,
  },
  detailsHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  detailsIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(247, 147, 30, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  detailsTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900', fontFamily: fonts.bold,
  },
  detailsId: {
    color: '#444',
    fontSize: 12,
    marginTop: 4,
  },
  detailsContent: {
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  detailLabel: {
    color: '#9BA1AC',
    fontSize: 13,
    fontWeight: 'bold', fontFamily: fonts.bold,
    textTransform: 'uppercase',
  },
  detailValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  detailValueLarge: {
    color: '#43e97b',
    fontSize: 20,
    fontWeight: '900', fontFamily: fonts.bold,
  },
  statusBadgeLarge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusTextLarge: {
    fontSize: 11,
    fontWeight: 'bold', fontFamily: fonts.bold,
  },
  detailsDivider: {
    height: 1,
    backgroundColor: colors.overlayMedium,
    marginVertical: 16,
  },
  detailSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#444',
    fontSize: 11,
    fontWeight: 'bold', fontFamily: fonts.bold,
    textTransform: 'uppercase',
    marginBottom: 12,
    letterSpacing: 1,
  },
  actorCard: {
    backgroundColor: colors.overlaySoft,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.overlayMedium,
  },
  actorInfo: {
    marginLeft: 0,
  },
  actorLabel: {
    color: '#9BA1AC',
    fontSize: 9,
    fontWeight: 'bold', fontFamily: fonts.bold,
    marginBottom: 4,
  },
  actorName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold', fontFamily: fonts.bold,
  },
  actorId: {
    color: '#333',
    fontSize: 10,
    marginTop: 2,
  },
  detailsArrow: {
    alignItems: 'center',
    marginVertical: 4,
  },
  descriptionCard: {
    backgroundColor: 'rgba(247, 147, 30, 0.05)',
    padding: 16,
    borderRadius: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#f7931e',
  },
  descriptionTextFull: {
    color: '#fff',
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  hashCard: {
    backgroundColor: 'transparent',
    padding: 12,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1a1c2c',
  },
  hashText: {
    color: '#9BA1AC',
    fontSize: 11,
    fontFamily: 'monospace',
    flex: 1,
    marginRight: 10,
  },
  closeDetailsBtn: {
    backgroundColor: '#fff',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  closeDetailsText: {
    color: '#000',
    fontSize: 15,
    fontWeight: 'bold', fontFamily: fonts.bold,
  },
});
