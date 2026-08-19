import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, FlatList, RefreshControl, Modal, KeyboardAvoidingView,
  Platform, StatusBar, Clipboard,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppHeader, ScreenBackground, ScreenSkeleton, GlassCard, GlassButton, EmptyState, showActionSheet } from '../components/ui';
import { toast } from '../components/ui/Toast';
import { colors, fonts, radius, statusBarStyle } from '../theme';
import { apiService } from '../services/api';

type TabType = 'analytics' | 'transactions' | 'holders' | 'management';
type TransactionTypeFilter = 'ALL' | 'TRANSFER' | 'PURCHASE' | 'SYSTEM' | 'REWARD' | 'REFUND';

const TABS: { key: TabType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'analytics', label: 'Stats', icon: 'bar-chart-outline' },
  { key: 'transactions', label: 'Flux', icon: 'swap-horizontal-outline' },
  { key: 'holders', label: 'Riches', icon: 'trophy-outline' },
  { key: 'management', label: 'Gérer', icon: 'construct-outline' },
];

const TX_FILTERS: { key: TransactionTypeFilter; label: string }[] = [
  { key: 'ALL', label: 'Tout' },
  { key: 'TRANSFER', label: 'Transferts' },
  { key: 'PURCHASE', label: 'Achats' },
  { key: 'REWARD', label: 'Récompenses' },
  { key: 'SYSTEM', label: 'Système' },
  { key: 'REFUND', label: 'Annulations' },
];

const TX_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  TRANSFER: 'swap-horizontal-outline', PURCHASE: 'cart-outline', REWARD: 'gift-outline',
  REFUND: 'refresh-outline', SYSTEM: 'cog-outline',
};

function formatAmount(val: number): string {
  if (val >= 1_000_000_000) return (val / 1_000_000_000).toFixed(2) + 'B';
  if (val >= 1_000_000) return (val / 1_000_000).toFixed(2) + 'M';
  return new Intl.NumberFormat('fr-FR').format(Math.floor(val));
}

function formatPreciseAmount(val: number): string {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(val);
}

function StatTile({ label, value, sub, tone = 'neutral', wide }: { label: string; value: string; sub?: string; tone?: 'gold' | 'accent' | 'neutral'; wide?: boolean }) {
  const tintColor = tone === 'gold' ? colors.gold : tone === 'accent' ? colors.accent : colors.textPrimary;
  return (
    <GlassCard style={[styles.statTile, wide && styles.statTileWide]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: tintColor }]}>{value}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </GlassCard>
  );
}

export default function EconomyManagementScreen() {
  const navigation = useNavigation();

  const [activeTab, setActiveTab] = useState<TabType>('analytics');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [stats, setStats] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [transactionStats, setTransactionStats] = useState({ volume24h: 0, count24h: 0 });
  const [richList, setRichList] = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<TransactionTypeFilter>('ALL');

  const [modalVisible, setModalVisible] = useState(false);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [modalType, setModalType] = useState<'balance' | 'lock' | 'transfer'>('balance');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [modalValue, setModalValue] = useState('');
  const [modalReason, setModalReason] = useState('');
  const [processing, setProcessing] = useState(false);

  const loadData = useCallback(async (filter: TransactionTypeFilter = 'ALL') => {
    setLoading(true);
    try {
      const [statsRes, txRes, richRes] = await Promise.all([
        apiService.getEconomyStats(),
        apiService.getEconomyTransactions({ limit: 50, type: filter }),
        apiService.getEconomyRichList(30),
      ]);
      if (statsRes.success) setStats((statsRes as any).stats);
      if (txRes.success) {
        const txData = txRes as any;
        setTransactions(txData.data);
        if (txData.stats24h) setTransactionStats({ volume24h: txData.stats24h.volume, count24h: txData.stats24h.count });
      }
      if (richRes.success) setRichList((richRes as any).data);
    } catch {
      toast.error('Impossible de charger les données économiques');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(selectedFilter); }, [loadData, selectedFilter]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData(selectedFilter);
    setRefreshing(false);
  };

  const openActionModal = (user: any, type: 'balance' | 'lock' | 'transfer') => {
    setSelectedUser(user);
    setModalType(type);
    setModalValue(type === 'balance' ? user.balance.toString() : '');
    setModalReason('');
    setModalVisible(true);
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
      } else {
        res = await apiService.manualEconomyTransfer({
          fromUserId: null,
          toUserId: selectedUser.id,
          amount: parseFloat(modalValue),
          description: modalReason || 'Récompense Gardien',
        });
      }
      if (res?.success) {
        toast.success('Opération effectuée avec succès');
        setModalVisible(false);
        loadData(selectedFilter);
        if (activeTab === 'management') handleSearchUsers();
      } else {
        toast.error(res?.message || 'L\'opération a échoué');
      }
    } catch {
      toast.error('Une erreur technique est survenue');
    } finally {
      setProcessing(false);
    }
  };

  const handleSearchUsers = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    const res = await apiService.searchEconomyWallets(searchQuery);
    if (res.success) setSearchResults((res as any).data);
    setLoading(false);
  };

  const executeDelete = async (id: string, refund: boolean) => {
    setProcessing(true);
    try {
      const res = await apiService.deleteEconomyTransaction(id, refund);
      if (res.success) {
        toast.success('La transaction a été traitée.');
        loadData(selectedFilter);
      } else {
        toast.error(res.message || 'Échec de l\'opération');
      }
    } catch {
      toast.error('Erreur technique');
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteTransaction = (id: string) => {
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
          hint: 'Les soldes sont ajustés comme si la transaction n\'avait pas eu lieu.',
          destructive: true,
          onPress: () => executeDelete(id, true),
        },
      ],
    });
  };

  const renderAnalytics = () => (
    <ScrollView
      style={styles.tabContent}
      contentContainerStyle={{ paddingBottom: 100 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}
    >
      <StatTile
        wide
        label="Masse monétaire (M0)"
        value={`${formatAmount(stats?.circulatingSupply || 0)} TWC`}
        sub="Total injecté dans l'écosystème"
        tone="gold"
      />
      <View style={styles.statRow}>
        <StatTile label="Réserve système" value={formatAmount(stats?.systemReserve || 0)} sub="Solde TwitNinf" tone="gold" />
        <StatTile label="Prix marché" value={`${stats?.currencyPrice?.toFixed(4) || 0} €`} sub={`x${stats?.multiplier?.toFixed(2) || 1} multiplicateur`} tone="accent" />
      </View>
      <StatTile
        wide
        label="Solde réel total app"
        value={`${formatAmount(stats?.realTimeTotalBalance || 0)} TWC`}
        sub="Somme cumulée de tous les portefeuilles"
        tone="accent"
      />

      <View style={styles.infoBox}>
        <Ionicons name="information-circle-outline" size={20} color={colors.gold} />
        <Text style={styles.infoText}>
          En tant que <Text style={{ fontFamily: fonts.bold, color: colors.gold }}>Gardien</Text>, ta mission est de garder l'inflation sous contrôle.
          Un écart trop grand entre M0 et le solde réel peut indiquer des duplications frauduleuses.
        </Text>
      </View>
    </ScrollView>
  );

  const transactionKeyExtractor = useCallback((item: any) => item.id, []);

  const renderTransactionItem = useCallback(({ item }: { item: any }) => {
    const isPositive = item.type === 'PURCHASE' || item.type === 'REWARD';
    return (
      <TouchableOpacity style={styles.txCard} onPress={() => { setSelectedTransaction(item); setDetailsModalVisible(true); }} activeOpacity={0.85}>
        <View style={styles.txTopRow}>
          <View style={[styles.txIcon, { backgroundColor: isPositive ? colors.successMuted : 'rgba(255,210,77,0.10)' }]}>
            <Ionicons name={TX_ICON[item.type] || 'cog-outline'} size={17} color={isPositive ? colors.success : colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.txType}>{item.type === 'TRANSFER' ? 'Transfert forcé' : item.type}</Text>
            <Text style={styles.txDate}>
              {new Date(item.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · {new Date(item.createdAt).toLocaleDateString('fr-FR')}
            </Text>
          </View>
          <Text style={[styles.txAmount, { color: isPositive ? colors.success : item.amount > 100000 ? colors.red : colors.textPrimary }]}>
            {item.fromUserId === null ? '+' : ''}{formatPreciseAmount(item.amount)}
          </Text>
        </View>

        <View style={styles.txUsersRow}>
          <Text style={styles.txUserName} numberOfLines={1}>{item.fromUser?.username || 'SYSTÈME'}</Text>
          <Ionicons name="arrow-forward" size={12} color={colors.textMuted} style={{ marginHorizontal: 6 }} />
          <Text style={styles.txUserName} numberOfLines={1}>{item.toUser?.username || 'Inconnu'}</Text>
        </View>

        {item.description ? <Text style={styles.txDescription} numberOfLines={1}>« {item.description} »</Text> : null}

        <View style={styles.txFooter}>
          <View style={styles.txStatusBadge}>
            <View style={[styles.statusDot, { backgroundColor: item.status === 'COMPLETED' ? colors.success : colors.gold }]} />
            <Text style={styles.txStatusText}>{item.status}</Text>
          </View>
          <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleDeleteTransaction(item.id); }} style={styles.txDeleteBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="trash-outline" size={15} color={colors.red} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  }, [handleDeleteTransaction]);

  const holderKeyExtractor = useCallback((item: any) => item.userId, []);

  const renderHolderItem = useCallback(({ item, index }: { item: any; index: number }) => (
    <GlassCard style={styles.holderCard} contentStyle={styles.holderCardContent}>
      <View style={styles.rankBox}>
        {index < 3 ? (
          <Text style={styles.rankEmoji}>{index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}</Text>
        ) : (
          <Text style={styles.rankNumber}>#{index + 1}</Text>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.holderName} numberOfLines={1}>{item.username}</Text>
        <Text style={styles.holderShare}>
          {((item.balance / (stats?.circulatingSupply || 1)) * 100).toFixed(2)}% de l'économie
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.holderBalance}>{formatPreciseAmount(item.balance)}</Text>
        <Text style={styles.holderCurrency}>TWC</Text>
      </View>
    </GlassCard>
  ), [stats?.circulatingSupply]);

  const renderTransactions = () => (
    <View style={{ flex: 1 }}>
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

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterRowContent}>
        {TX_FILTERS.map((f) => {
          const active = selectedFilter === f.key;
          return (
            <TouchableOpacity key={f.key} style={[styles.filterChip, active && styles.filterChipActive]} onPress={() => setSelectedFilter(f.key)} activeOpacity={0.8}>
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <FlatList
        data={transactions}
        keyExtractor={transactionKeyExtractor}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}
        ListEmptyComponent={<EmptyState icon="receipt-outline" title="Aucune transaction" message="Rien à afficher pour ce filtre." />}
        renderItem={renderTransactionItem}
      />
    </View>
  );

  const renderHolders = () => (
    <FlatList
      data={richList}
      keyExtractor={holderKeyExtractor}
      style={styles.tabContent}
      contentContainerStyle={{ paddingBottom: 100 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}
      renderItem={renderHolderItem}
    />
  );

  const renderManagement = () => (
    <ScrollView style={styles.tabContent} contentContainerStyle={{ paddingBottom: 100 }}>
      <Text style={styles.sectionTitle}>Gestion des comptes</Text>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Pseudo ou ID utilisateur..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearchUsers}
        />
        <TouchableOpacity style={styles.searchBtn} onPress={handleSearchUsers} activeOpacity={0.85}>
          <Ionicons name="search" size={19} color={colors.onAccent} />
        </TouchableOpacity>
      </View>

      {searchResults.map((u) => (
        <GlassCard key={u.id} style={styles.resultCard}>
          <View style={styles.resultTopRow}>
            <View style={styles.resultAvatar}>
              <Text style={styles.resultAvatarInitial}>{u.username[0]?.toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.resultName}>{u.username}</Text>
              <Text style={styles.resultBalance}>{formatPreciseAmount(u.balance)} TWC</Text>
            </View>
            {u.isLocked && (
              <View style={styles.frozenBadge}><Text style={styles.frozenText}>GELÉ</Text></View>
            )}
          </View>

          <View style={styles.resultActionsRow}>
            <GlassButton label="Donner" icon="gift-outline" variant="secondary" style={{ flex: 1 }} onPress={() => openActionModal(u, 'transfer')} />
            <GlassButton label="Éditer" icon="create-outline" variant="secondary" style={{ flex: 1 }} onPress={() => openActionModal(u, 'balance')} />
            <GlassButton
              label={u.isLocked ? 'Dégeler' : 'Geler'}
              icon={u.isLocked ? 'lock-open-outline' : 'snow-outline'}
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => openActionModal(u, 'lock')}
            />
          </View>
        </GlassCard>
      ))}

      <View style={styles.cautionBox}>
        <Ionicons name="warning-outline" size={20} color={colors.red} />
        <View style={{ flex: 1 }}>
          <Text style={styles.cautionTitle}>Actions irréversibles</Text>
          <Text style={styles.cautionText}>Toute modification de solde impacte la masse monétaire. Sois vigilant.</Text>
        </View>
      </View>
    </ScrollView>
  );

  return (
    <ScreenBackground>
      <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
      <AppHeader
        navigation={navigation}
        title="Économie"
        subtitle="Nœud réseau actif"
        right={(
          <TouchableOpacity onPress={() => loadData(selectedFilter)} style={styles.refreshBtn}>
            <Ionicons name="sync-outline" size={19} color={colors.gold} />
          </TouchableOpacity>
        )}
      />

      <View style={styles.tabBar}>
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity key={tab.key} onPress={() => setActiveTab(tab.key)} style={[styles.tabBtn, active && styles.tabBtnActive]} activeOpacity={0.85}>
              <Ionicons name={tab.icon} size={16} color={active ? colors.gold : colors.textMuted} />
              {active && <Text style={styles.tabBtnText}>{tab.label}</Text>}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={{ flex: 1 }}>
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
      </View>

      <Modal animationType="slide" transparent visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>
                {modalType === 'balance' ? 'Ajuster le solde' : modalType === 'lock' ? (selectedUser?.isLocked ? 'Dégeler le compte' : 'Geler le compte') : 'Donner des TWC'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalTarget}>Utilisateur : <Text style={{ color: colors.gold, fontFamily: fonts.semibold }}>@{selectedUser?.username}</Text></Text>

            {modalType !== 'lock' && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{modalType === 'balance' ? 'Nouveau solde' : 'Montant à envoyer'}</Text>
                <TextInput style={styles.modalInput} keyboardType="numeric" value={modalValue} onChangeText={setModalValue} placeholder="0.00" placeholderTextColor={colors.textMuted} />
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Raison de l'action (interne)</Text>
              <TextInput
                style={[styles.modalInput, styles.modalInputMultiline]}
                multiline
                value={modalReason}
                onChangeText={setModalReason}
                placeholder="Ex : correction bug, récompense concours..."
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <GlassButton
              label={modalType === 'balance' ? 'Mettre à jour' : modalType === 'lock' ? (selectedUser?.isLocked ? 'Confirmer le dégel' : 'Confirmer le gel') : 'Envoyer les fonds'}
              onPress={handleAction}
              loading={processing}
              fullWidth
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {selectedTransaction && (
        <Modal visible={detailsModalVisible} transparent animationType="slide" onRequestClose={() => setDetailsModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.detailsSheet}>
              <View style={styles.detailsHeader}>
                <View style={styles.detailsIcon}><Ionicons name="receipt-outline" size={26} color={colors.gold} /></View>
                <Text style={styles.detailsTitle}>Détails transaction</Text>
                <Text style={styles.detailsId}>{selectedTransaction.id}</Text>
              </View>

              <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
                <View style={styles.detailRow}><Text style={styles.detailLabel}>Type</Text><Text style={styles.detailValue}>{selectedTransaction.type}</Text></View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Statut</Text>
                  <View style={[styles.statusPill, { backgroundColor: selectedTransaction.status === 'COMPLETED' ? colors.successMuted : 'rgba(255,210,77,0.10)' }]}>
                    <Text style={[styles.statusPillText, { color: selectedTransaction.status === 'COMPLETED' ? colors.success : colors.gold }]}>{selectedTransaction.status}</Text>
                  </View>
                </View>
                <View style={styles.detailRow}><Text style={styles.detailLabel}>Montant</Text><Text style={styles.detailValueLarge}>{formatPreciseAmount(selectedTransaction.amount)} TWC</Text></View>

                <Text style={styles.detailSectionTitle}>Flux monétaire</Text>
                <View style={styles.flowCard}>
                  <Text style={styles.flowLabel}>Expéditeur</Text>
                  <Text style={styles.flowName}>{selectedTransaction.fromUser?.username || 'Système'}</Text>
                </View>
                <View style={{ alignItems: 'center', marginVertical: 4 }}><Ionicons name="arrow-down" size={16} color={colors.textMuted} /></View>
                <View style={styles.flowCard}>
                  <Text style={styles.flowLabel}>Destinataire</Text>
                  <Text style={styles.flowName}>{selectedTransaction.toUser?.username || 'Utilisateur'}</Text>
                </View>

                {selectedTransaction.description ? (
                  <>
                    <Text style={styles.detailSectionTitle}>Description</Text>
                    <View style={styles.descriptionCard}><Text style={styles.descriptionText}>{selectedTransaction.description}</Text></View>
                  </>
                ) : null}

                {selectedTransaction.transactionHash ? (
                  <>
                    <Text style={styles.detailSectionTitle}>Preuve (hash)</Text>
                    <TouchableOpacity
                      style={styles.hashCard}
                      onPress={() => { Clipboard.setString(selectedTransaction.transactionHash); toast.success('Copié', { description: 'Le hash a été copié' }); }}
                    >
                      <Text style={styles.hashText} numberOfLines={1}>{selectedTransaction.transactionHash}</Text>
                      <Ionicons name="copy-outline" size={15} color={colors.gold} />
                    </TouchableOpacity>
                  </>
                ) : null}

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Horodatage</Text>
                  <Text style={styles.detailValue}>{new Date(selectedTransaction.createdAt).toLocaleString('fr-FR')}</Text>
                </View>
              </ScrollView>

              <GlassButton label="Fermer" variant="secondary" fullWidth onPress={() => setDetailsModalVisible(false)} />
            </View>
          </View>
        </Modal>
      )}
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  refreshBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(255,210,77,0.2)', alignItems: 'center', justifyContent: 'center' },
  tabBar: { flexDirection: 'row', backgroundColor: colors.overlaySoft, marginHorizontal: 16, marginTop: 6, marginBottom: 6, borderRadius: radius.md, padding: 4 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: radius.sm },
  tabBtnActive: { backgroundColor: 'rgba(255,210,77,0.10)' },
  tabBtnText: { fontSize: 12, fontFamily: fonts.bold, color: colors.gold },
  tabContent: { paddingHorizontal: 16, paddingTop: 4 },
  statTile: { padding: 16, marginBottom: 10, flex: 1 },
  statTileWide: { flex: undefined },
  statLabel: { fontSize: 12, fontFamily: fonts.semibold, color: colors.textMuted, marginBottom: 6 },
  statValue: { fontSize: 22, fontFamily: fonts.bold, letterSpacing: -0.5 },
  statSub: { fontSize: 11, color: colors.textMuted, marginTop: 6 },
  statRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  infoBox: {
    flexDirection: 'row', gap: 10, padding: 14, borderRadius: radius.lg,
    backgroundColor: 'rgba(255,210,77,0.06)', borderWidth: 1, borderColor: 'rgba(255,210,77,0.15)', marginTop: 4,
  },
  infoText: { flex: 1, fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
  fluxStatsBar: { flexDirection: 'row', backgroundColor: colors.surface, marginHorizontal: 16, borderRadius: radius.lg, padding: 12, borderWidth: 1, borderColor: colors.border },
  fluxStatItem: { flex: 1, alignItems: 'center' },
  fluxStatDivider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border },
  fluxStatLabel: { fontSize: 10, fontFamily: fonts.bold, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 4 },
  fluxStatValue: { fontSize: 15, fontFamily: fonts.bold, color: colors.textPrimary },
  filterRow: { maxHeight: 46, flexGrow: 0, marginVertical: 10 },
  filterRowContent: { paddingHorizontal: 16, gap: 8 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.round, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  filterChipActive: { backgroundColor: 'rgba(255,210,77,0.14)', borderColor: 'rgba(255,210,77,0.4)' },
  filterChipText: { fontSize: 12, fontFamily: fonts.medium, color: colors.textSecondary },
  filterChipTextActive: { color: colors.gold, fontFamily: fonts.semibold },
  txCard: { borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10 },
  txTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  txIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  txType: { fontSize: 13, fontFamily: fonts.semibold, color: colors.textPrimary },
  txDate: { fontSize: 10.5, color: colors.textMuted, marginTop: 1 },
  txAmount: { fontSize: 15, fontFamily: fonts.bold },
  txUsersRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.overlaySoft, padding: 8, borderRadius: radius.sm, marginBottom: 8 },
  txUserName: { flex: 1, fontSize: 12, fontFamily: fonts.medium, color: colors.textSecondary },
  txDescription: { fontSize: 11.5, color: colors.textMuted, fontStyle: 'italic', marginBottom: 10 },
  txFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  txStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.overlaySoft, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  txStatusText: { fontSize: 10, fontFamily: fonts.bold, color: colors.textSecondary },
  txDeleteBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.redMuted },
  holderCard: { marginBottom: 10 },
  holderCardContent: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  rankBox: { width: 34, alignItems: 'center' },
  rankEmoji: { fontSize: 20 },
  rankNumber: { fontSize: 13, fontFamily: fonts.bold, color: colors.textMuted },
  holderName: { fontSize: 14.5, fontFamily: fonts.semibold, color: colors.textPrimary },
  holderShare: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  holderBalance: { fontSize: 15, fontFamily: fonts.bold, color: colors.success },
  holderCurrency: { fontSize: 10, color: colors.textMuted },
  sectionTitle: { fontSize: 16, fontFamily: fonts.bold, color: colors.textPrimary, marginBottom: 12 },
  searchRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  searchInput: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border },
  searchBtn: { width: 46, height: 46, borderRadius: radius.md, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  resultCard: { padding: 14, marginBottom: 12 },
  resultTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  resultAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.overlaySoft, alignItems: 'center', justifyContent: 'center' },
  resultAvatarInitial: { fontFamily: fonts.bold, color: colors.gold },
  resultName: { fontSize: 14.5, fontFamily: fonts.semibold, color: colors.textPrimary },
  resultBalance: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  frozenBadge: { backgroundColor: colors.redMuted, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm },
  frozenText: { fontSize: 9.5, fontFamily: fonts.bold, color: colors.red },
  resultActionsRow: { flexDirection: 'row', gap: 8 },
  cautionBox: { flexDirection: 'row', gap: 10, marginTop: 8, padding: 14, borderRadius: radius.lg, backgroundColor: colors.redMuted, borderWidth: 1, borderColor: 'rgba(245,55,43,0.2)' },
  cautionTitle: { fontSize: 12.5, fontFamily: fonts.bold, color: colors.red },
  cautionText: { fontSize: 11.5, color: colors.textSecondary, marginTop: 2, lineHeight: 16 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 20, borderWidth: 1, borderColor: colors.border, borderBottomWidth: 0 },
  modalHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  modalTitle: { fontSize: 18, fontFamily: fonts.bold, color: colors.textPrimary },
  modalTarget: { fontSize: 13, color: colors.textMuted, marginBottom: 18 },
  inputGroup: { marginBottom: 16 },
  inputLabel: { fontSize: 11.5, fontFamily: fonts.bold, color: colors.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.3 },
  modalInput: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, color: colors.textPrimary, fontSize: 16, fontFamily: fonts.semibold, borderWidth: 1, borderColor: colors.border },
  modalInputMultiline: { height: 80, textAlignVertical: 'top', fontFamily: fonts.regular, fontSize: 14 },
  detailsSheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 20, maxHeight: '88%', borderWidth: 1, borderColor: colors.border, borderBottomWidth: 0 },
  detailsHeader: { alignItems: 'center', marginBottom: 18 },
  detailsIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,210,77,0.10)', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  detailsTitle: { fontSize: 17, fontFamily: fonts.bold, color: colors.textPrimary },
  detailsId: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  detailLabel: { fontSize: 12, fontFamily: fonts.bold, color: colors.textMuted, textTransform: 'uppercase' },
  detailValue: { fontSize: 13.5, fontFamily: fonts.semibold, color: colors.textPrimary },
  detailValueLarge: { fontSize: 18, fontFamily: fonts.bold, color: colors.success },
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.sm },
  statusPillText: { fontSize: 10.5, fontFamily: fonts.bold },
  detailSectionTitle: { fontSize: 11, fontFamily: fonts.bold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 16, marginBottom: 8 },
  flowCard: { backgroundColor: colors.surface, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  flowLabel: { fontSize: 10, fontFamily: fonts.bold, color: colors.textMuted },
  flowName: { fontSize: 14, fontFamily: fonts.semibold, color: colors.textPrimary, marginTop: 3 },
  descriptionCard: { backgroundColor: 'rgba(255,210,77,0.06)', padding: 12, borderRadius: radius.md, borderLeftWidth: 3, borderLeftColor: colors.gold },
  descriptionText: { fontSize: 13, color: colors.textSecondary, fontStyle: 'italic', lineHeight: 18 },
  hashCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: 8 },
  hashText: { flex: 1, fontSize: 11, color: colors.textMuted, fontFamily: 'monospace' },
});
