import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ScreenBackground, BackButton, CoinBalancePill, EmptyState, HowItWorks, ScreenSkeleton, promptAsync } from '../components/ui';
import Avatar from '../components/Avatar';
import { useHeaderMetrics, HEADER_CONTENT_HEIGHT } from '../hooks/useHeaderMetrics';
import { colors, radius, statusBarStyle } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { toast } from '../components/ui/Toast';
import { effectiveSubscriptionTier, canUseFeature } from '../utils/subscriptionTier';
import contractService, { type CreatorContract, type MarketplaceCreator } from '../services/contractService';

type Tab = 'marketplace' | 'mine';

interface Props {
  navigation: any;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente de réponse',
  rejected: 'Refusé',
  accepted: 'Accepté · brouillon attendu',
  draft_submitted: 'Brouillon en revue',
  changes_requested: 'Modification demandée',
  approved: 'Publié',
  cancelled: 'Annulé',
};

export default function ContractsScreen({ navigation }: Props) {
  const { top: headerTopInset } = useHeaderMetrics();
  const { user } = useAuth() as any;
  const tier = effectiveSubscriptionTier(!!user?.premium, user?.subscription_tier);
  const isUltra = canUseFeature(tier, 'ultra');

  const [tab, setTab] = useState<Tab>('marketplace');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [search, setSearch] = useState('');
  const [creators, setCreators] = useState<MarketplaceCreator[]>([]);
  const [contracts, setContracts] = useState<CreatorContract[]>([]);

  const [indicativePrice, setIndicativePrice] = useState<string | null>(user?.ultra_indicative_price_nf ?? null);

  const editIndicativePrice = async () => {
    const value = await promptAsync({
      title: 'Prix indicatif',
      message: 'Purement informatif : une marque peut proposer n\'importe quel montant.',
      placeholder: 'Prix en NF (laisser vide pour retirer)',
      defaultValue: indicativePrice || '',
      required: false,
    });
    if (value === null) return;
    const trimmed = value.trim();
    const price = trimmed ? Number(trimmed.replace(',', '.')) : null;
    if (price != null && (!Number.isFinite(price) || price < 0)) {
      toast.error('Prix invalide');
      return;
    }
    const res = await contractService.setIndicativePrice(price);
    if (!res.success) {
      toast.error('Mise à jour impossible', { description: res.message });
      return;
    }
    setIndicativePrice(price != null ? String(price) : null);
    toast.success('Prix mis à jour');
  };

  const [openProposalFor, setOpenProposalFor] = useState<string | null>(null);
  const [proposalPrice, setProposalPrice] = useState('');
  const [proposalBrief, setProposalBrief] = useState('');
  const [proposing, setProposing] = useState(false);

  const load = useCallback(async () => {
    const [marketRes, contractsRes] = await Promise.all([
      contractService.getMarketplace({ search: search || undefined }),
      contractService.getMyContracts(),
    ]);
    if (marketRes.success) setCreators(marketRes.data!.creators);
    if (contractsRes.success) setContracts(contractsRes.data!);
  }, [search]);

  useFocusEffect(useCallback(() => { load().finally(() => setLoading(false)); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const onPropose = async (creatorId: string) => {
    const price = Number(proposalPrice.replace(',', '.'));
    if (!Number.isFinite(price) || price <= 0) {
      toast.error('Prix invalide', { description: 'Indique un montant en NF supérieur à zéro.' });
      return;
    }
    if (!proposalBrief.trim()) {
      toast.error('Brief requis', { description: 'Décris ce que tu attends du créateur.' });
      return;
    }
    setProposing(true);
    try {
      const res = await contractService.proposeContract(creatorId, price, proposalBrief.trim());
      if (!res.success) {
        toast.error('Proposition impossible', { description: res.message });
        return;
      }
      setOpenProposalFor(null);
      setProposalPrice('');
      setProposalBrief('');
      toast.success('Contrat proposé', { description: 'Le créateur va recevoir ta proposition.' });
      setTab('mine');
      await load();
    } finally {
      setProposing(false);
    }
  };

  return (
    <ScreenBackground>
      <StatusBar barStyle={statusBarStyle()} backgroundColor={colors.bg} />

      <View style={[styles.headerShell, { paddingTop: headerTopInset }]}>
        <View style={[styles.header, { minHeight: HEADER_CONTENT_HEIGHT }]}>
          <View style={styles.roundSlot}>
            <BackButton navigation={navigation} style={styles.roundButton} />
          </View>
          <View style={styles.titleGroup}>
            <Text style={styles.title}>Contrats sponsorisés</Text>
          </View>
          <CoinBalancePill compact />
        </View>

        <View style={styles.tabs}>
          <TouchableOpacity style={[styles.tab, tab === 'marketplace' && styles.tabActive]} onPress={() => setTab('marketplace')} activeOpacity={0.85}>
            <Text style={[styles.tabText, tab === 'marketplace' && styles.tabTextActive]}>Marketplace</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, tab === 'mine' && styles.tabActive]} onPress={() => setTab('mine')} activeOpacity={0.85}>
            <Text style={[styles.tabText, tab === 'mine' && styles.tabTextActive]}>Mes contrats{contracts.length ? ` (${contracts.length})` : ''}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {loading ? (
          <ScreenSkeleton variant="list" />
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          >
            {tab === 'marketplace' ? (
              <>
                <HowItWorks
                  id="creator-contracts"
                  title="Comment marche un contrat"
                  tint={colors.gold}
                  points={[
                    { icon: 'cash-outline', text: 'Le montant proposé est séquestré dès que le créateur accepte — personne n\'est payé ni débité avant.' },
                    { icon: 'document-text-outline', text: 'Le créateur soumet un brouillon avant toute publication : tu le valides ou demandes une modification, sans limite de tours.' },
                    { icon: 'checkmark-done-outline', text: 'Une fois validé, le tweet est publié immédiatement et marqué « partenariat rémunéré ».' },
                  ]}
                  style={styles.howItWorks}
                />

                <View style={styles.searchBox}>
                  <Ionicons name="search" size={16} color={colors.textMuted} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Chercher un créateur Ultra"
                    placeholderTextColor={colors.textMuted}
                    value={search}
                    onChangeText={setSearch}
                    onSubmitEditing={load}
                    autoCapitalize="none"
                    returnKeyType="search"
                  />
                </View>

                {creators.length === 0 ? (
                  <EmptyState
                    icon="briefcase-outline"
                    tint={colors.gold}
                    title="Aucun créateur Ultra"
                    message="Personne n'est éligible aux contrats pour l'instant."
                  />
                ) : creators.map((creator) => (
                  <View key={creator.id} style={styles.creatorCard}>
                    <TouchableOpacity
                      style={styles.creatorRow}
                      onPress={() => navigation.navigate('UserProfile', { userId: creator.id, username: creator.username })}
                      activeOpacity={0.8}
                    >
                      <Avatar size={40} username={creator.username} uri={creator.avatar || undefined} />
                      <View style={styles.creatorInfo}>
                        <Text style={styles.creatorName} numberOfLines={1}>{creator.full_name || creator.username}</Text>
                        <Text style={styles.creatorHandle} numberOfLines={1}>@{creator.username}</Text>
                      </View>
                      {!!creator.ultra_indicative_price_nf && (
                        <Text style={styles.creatorPrice}>~{creator.ultra_indicative_price_nf} NF</Text>
                      )}
                    </TouchableOpacity>

                    {openProposalFor === creator.id ? (
                      <View style={styles.proposalBox}>
                        <View style={styles.field}>
                          <TextInput
                            style={styles.fieldInput}
                            placeholder="Prix en NF"
                            placeholderTextColor={colors.textMuted}
                            value={proposalPrice}
                            onChangeText={setProposalPrice}
                            keyboardType="decimal-pad"
                          />
                          <Text style={styles.fieldSuffix}>NF</Text>
                        </View>
                        <View style={[styles.field, styles.fieldMultiline]}>
                          <TextInput
                            style={[styles.fieldInput, styles.fieldInputMultiline]}
                            placeholder="Ce que tu attends du créateur (brief)"
                            placeholderTextColor={colors.textMuted}
                            value={proposalBrief}
                            onChangeText={setProposalBrief}
                            multiline
                            maxLength={2000}
                          />
                        </View>
                        <View style={styles.proposalActions}>
                          <TouchableOpacity style={styles.smallBtnGhost} onPress={() => setOpenProposalFor(null)} activeOpacity={0.85}>
                            <Text style={styles.smallBtnGhostText}>Annuler</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.smallBtn, proposing && styles.btnDisabled]}
                            onPress={() => onPropose(creator.id)}
                            disabled={proposing}
                            activeOpacity={0.85}
                          >
                            {proposing ? <ActivityIndicator size="small" color={colors.onAccent} /> : <Text style={styles.smallBtnText}>Envoyer</Text>}
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.proposeBtn}
                        onPress={() => setOpenProposalFor(creator.id)}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.proposeBtnText}>Proposer un contrat</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </>
            ) : (
              <>
                {isUltra && (
                  <TouchableOpacity style={styles.rowCard} onPress={editIndicativePrice} activeOpacity={0.85}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>Mon prix indicatif</Text>
                      <Text style={styles.rowHint}>Affiché sur ta fiche marketplace, purement informatif</Text>
                    </View>
                    <Text style={styles.creatorPrice}>{indicativePrice ? `${indicativePrice} NF` : 'Non défini'}</Text>
                  </TouchableOpacity>
                )}

                {contracts.length === 0 ? (
                  <EmptyState
                    icon="document-text-outline"
                    tint={colors.gold}
                    title="Aucun contrat"
                    message={isUltra
                      ? 'Les propositions reçues d\'une marque apparaîtront ici.'
                      : 'Propose un contrat à un créateur Ultra depuis l\'onglet Marketplace.'}
                  />
                ) : contracts.map((contract) => {
                  const isBrand = contract.brand_user_id === user?.id;
                  const other = isBrand ? contract.creator : contract.brand;
                  return (
                    <TouchableOpacity
                      key={contract.id}
                      style={styles.rowCard}
                      onPress={() => navigation.navigate('ContractDetail', { contractId: contract.id })}
                      activeOpacity={0.85}
                    >
                      <Avatar size={36} username={other?.username || '?'} uri={other?.avatar || undefined} />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={styles.rowTitle} numberOfLines={1}>
                          {isBrand ? `@${other?.username || '?'}` : `De @${other?.username || '?'}`} · {contract.price_nf} NF
                        </Text>
                        <Text style={styles.rowHint}>{STATUS_LABELS[contract.status] || contract.status}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                  );
                })}
              </>
            )}

            <View style={{ height: 60 }} />
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerShell: { backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  roundSlot: { width: 40, alignItems: 'center' },
  roundButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  titleGroup: { flex: 1, alignItems: 'center' },
  title: { color: colors.textPrimary, fontSize: 17, fontWeight: '700' },

  tabs: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 6 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.accent },
  tabText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: colors.textPrimary },

  content: { paddingHorizontal: 16, paddingTop: 12 },
  howItWorks: { marginBottom: 16 },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11,
    borderRadius: radius.round, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 14,
  },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: 14, marginHorizontal: 8, padding: 0 },

  creatorCard: { borderRadius: radius.md, padding: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
  creatorRow: { flexDirection: 'row', alignItems: 'center' },
  creatorInfo: { flex: 1, marginLeft: 10 },
  creatorName: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  creatorHandle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  creatorPrice: { color: colors.accentBright, fontSize: 13, fontWeight: '700' },

  proposeBtn: { marginTop: 12, paddingVertical: 10, borderRadius: radius.round, backgroundColor: colors.accent, alignItems: 'center' },
  proposeBtnText: { color: colors.onAccent, fontSize: 13, fontWeight: '700' },

  proposalBox: { marginTop: 12, gap: 8 },
  field: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  fieldMultiline: { alignItems: 'flex-start' },
  fieldInput: { flex: 1, color: colors.textPrimary, fontSize: 14, padding: 0 },
  fieldInputMultiline: { minHeight: 70, textAlignVertical: 'top' },
  fieldSuffix: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  proposalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },

  rowCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  rowTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  rowHint: { color: colors.textMuted, fontSize: 12, marginTop: 3 },

  smallBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.round, backgroundColor: colors.accent },
  smallBtnText: { color: colors.onAccent, fontSize: 12, fontWeight: '700' },
  smallBtnGhost: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.round, borderWidth: 1, borderColor: colors.border },
  smallBtnGhostText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },
});
