import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenBackground, BackButton } from '../components/ui';
import Avatar from '../components/Avatar';
import { useHeaderMetrics, HEADER_CONTENT_HEIGHT } from '../hooks/useHeaderMetrics';
import { colors, radius , statusBarStyle} from '../theme';
import { CoinBalancePill, EmptyState, HowItWorks, ScreenSkeleton } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { toast } from '../components/ui/Toast';
import { confirmAsync } from '../components/ui/ConfirmSheet';
import {
  UNAVAILABILITY_LABELS,
  browseListings,
  buyListing,
  cancelListing,
  checkAvailability,
  claimUsername,
  createListing,
  fetchConfig,
  fetchMyMarket,
  reserveUsername,
  sellerNetFor,
  type Availability,
  type Listing,
  type MarketConfig,
  type MyMarket,
} from '../services/usernameMarketService';

/**
 * Marché des noms d'utilisateur.
 *
 * Trois choses que l'écran doit dire clairement, parce qu'elles surprennent
 * si on les découvre en cours de route :
 *
 * - vendre son pseudo oblige à choisir MAINTENANT celui qu'on portera après ;
 * - acheter change l'identité publique des deux comptes immédiatement ;
 * - l'ancien pseudo reste bloqué un mois, il ne repart pas au marché.
 */

type Tab = 'browse' | 'mine';

interface Props {
  navigation: any;
}

export default function UsernameMarketScreen({ navigation }: Props) {
  const { top: headerTopInset } = useHeaderMetrics();
  const { user, refreshCurrentUser } = useAuth() as any;

  const [tab, setTab] = useState<Tab>('browse');
  const [config, setConfig] = useState<MarketConfig | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [mine, setMine] = useState<MyMarket | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [lookup, setLookup] = useState('');
  const [lookupState, setLookupState] = useState<Availability | null>(null);
  const [checking, setChecking] = useState(false);

  const [sellPrice, setSellPrice] = useState('');
  const [replacement, setReplacement] = useState('');
  const [selling, setSelling] = useState(false);

  const load = useCallback(async () => {
    try {
      const [cfg, browse, market] = await Promise.all([
        fetchConfig(),
        browseListings({ search: search || undefined, sort: 'recent' }),
        fetchMyMarket(),
      ]);
      setConfig(cfg);
      setListings(browse);
      setMine(market);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Marché indisponible.');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const runLookup = async () => {
    const candidate = lookup.trim();
    if (candidate.length < 3 || checking) return;
    setChecking(true);
    try {
      setLookupState(await checkAvailability(candidate));
    } catch (e: any) {
      setLookupState(null);
      toast.error('Vérification impossible', {
        description: e?.message || 'Réessaie dans un instant.',
      });
    } finally {
      setChecking(false);
    }
  };

  const onReserve = async () => {
    if (!lookupState?.available || !config) return;
    confirmAsync({
      title: `Réserver @${lookupState.username} ?`,
      message: `${config.reservation_price_twc} NF seront débités. Le pseudo t'est réservé ${config.reservation_days} jours, personne d'autre ne peut le prendre.`,
      confirmLabel: 'Réserver',
    }).then((ok) => {
      if (ok) (async () => {
            try {
              await reserveUsername(lookupState.username);
              setLookupState(null);
              setLookup('');
              await load();
            } catch (e: any) {
              toast.error('Réservation impossible', {
                description: e?.message || 'Réessaie dans un instant.',
              });
            }
          })();
    });
  };

  const onClaim = (username: string) => {
    confirmAsync({
      title: `Devenir @${username} ?`,
      message: `Ton pseudo actuel @${user?.username} sera libéré et protégé 30 jours. Les liens qui pointent vers ton ancien pseudo ne fonctionneront plus.`,
      confirmLabel: 'Changer de pseudo',
    }).then((ok) => {
      if (ok) (async () => {
            try {
              await claimUsername(username);
              // L'identité publique vient de changer : sans rafraîchir la
              // session, toute l'app continue d'afficher l'ancien pseudo.
              await refreshCurrentUser?.();
              await load();
            } catch (e: any) {
              toast.error('Changement impossible', {
                description: e?.message || 'Réessaie dans un instant.',
              });
            }
          })();
    });
  };

  const onSell = async () => {
    const price = Number(sellPrice.replace(',', '.'));
    if (!config || !Number.isFinite(price) || selling) return;
    if (replacement.trim().length < 3) {
      toast.error('Pseudo de remplacement requis', {
        description: 'Choisis le pseudo que tu porteras après la vente.',
      });
      return;
    }

    setSelling(true);
    try {
      await createListing({ priceTwc: price, replacementUsername: replacement.trim() });
      setSellPrice('');
      setReplacement('');
      await load();
      toast.info('Pseudo en vente', {
        description: `Tu deviendras @${replacement.trim()} dès qu'un acheteur se présente. Ce pseudo t'est réservé jusque-là.`,
      });
    } catch (e: any) {
      toast.error('Mise en vente impossible', {
        description: e?.message || 'Réessaie dans un instant.',
      });
    } finally {
      setSelling(false);
    }
  };

  const onBuy = (listing: Listing) => {
    confirmAsync({
      title: `Acheter @${listing.username} ?`,
      message: `${listing.price_twc} NF seront débités. Tu deviens @${listing.username} immédiatement, et ton pseudo actuel @${user?.username} sera protégé 30 jours.`,
      confirmLabel: 'Acheter',
    }).then((ok) => {
      if (ok) (async () => {
            try {
              const result = await buyListing(listing.id);
              await refreshCurrentUser?.();
              await load();
              toast.success('C\'est fait', {
                description: `Tu es maintenant @${result.username}.`,
              });
            } catch (e: any) {
              toast.error('Achat impossible', {
                description: e?.message || 'Réessaie dans un instant.',
              });
            }
          })();
    });
  };

  const activeListing = mine?.listings.find((l) => l.status === 'active');

  return (
    <ScreenBackground>
      <StatusBar barStyle={statusBarStyle()} backgroundColor={colors.bg} />

      <View style={[styles.headerShell, { paddingTop: headerTopInset }]}>
        <View style={[styles.header, { minHeight: HEADER_CONTENT_HEIGHT }]}>
          <View style={styles.roundSlot}>
            <BackButton navigation={navigation} style={styles.roundButton} />
          </View>
          <View style={styles.titleGroup}>
            <Text style={styles.title}>Marché des pseudos</Text>
          </View>
          {/* Tout se paie en NF sur cet écran : le solde doit être sous les
              yeux au moment de choisir, pas découvert au refus. */}
          <CoinBalancePill compact />
        </View>

        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, tab === 'browse' && styles.tabActive]}
            onPress={() => setTab('browse')}
            activeOpacity={0.85}
          >
            <Text style={[styles.tabText, tab === 'browse' && styles.tabTextActive]}>À vendre</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === 'mine' && styles.tabActive]}
            onPress={() => setTab('mine')}
            activeOpacity={0.85}
          >
            <Text style={[styles.tabText, tab === 'mine' && styles.tabTextActive]}>Mon espace</Text>
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {loading ? (
          <ScreenSkeleton variant="list" />
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
            }
          >
            {!!error && <Text style={styles.error}>{error}</Text>}

            {/* Les règles du marché (réservation, frais, pseudo de repli)
                n'étaient écrites nulle part : on les découvrait en vendant. */}
            <HowItWorks
              id="username-market"
              title="Le marché des pseudos en 4 points"
              tint={colors.gold}
              points={[
                { icon: 'search-outline', text: 'Un pseudo libre peut être réservé : il t’est gardé quelques jours, personne d’autre ne peut le prendre.' },
                { icon: 'pricetag-outline', text: 'Un pseudo que tu possèdes peut être mis en vente au prix que tu fixes, payable en NF.' },
                { icon: 'swap-horizontal-outline', text: 'En vendant, tu changes de pseudo sur-le-champ : choisis d’abord celui que tu porteras après.' },
                { icon: 'wallet-outline', text: 'Le montant de la vente arrive sur ton portefeuille, moins les frais du marché.' },
              ]}
              warning="Un changement de pseudo casse les mentions déjà écrites vers l’ancien."
              style={styles.howItWorks}
            />

            {tab === 'browse' ? (
              <>
                <View style={styles.searchBox}>
                  <Ionicons name="search" size={16} color={colors.textMuted} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Chercher un pseudo en vente"
                    placeholderTextColor={colors.textMuted}
                    value={search}
                    onChangeText={setSearch}
                    onSubmitEditing={load}
                    autoCapitalize="none"
                    returnKeyType="search"
                  />
                </View>

                {listings.length === 0 ? (
                  <EmptyState
                    icon="storefront-outline"
                    tint={colors.gold}
                    title={search ? 'Aucun pseudo à ce nom' : 'Le marché est vide'}
                    message={
                      search
                        ? 'Personne ne vend ce pseudo pour l’instant. Vérifie s’il est simplement libre — dans ce cas, réserve-le.'
                        : 'Personne ne vend son pseudo en ce moment. Tu peux être le premier : mets le tien en vente depuis « Mon espace ».'
                    }
                    action={
                      search
                        ? { label: 'Voir s’il est libre', icon: 'search-outline', onPress: () => { setLookup(search); setTab('mine'); } }
                        : { label: 'Vendre mon pseudo', icon: 'pricetag-outline', onPress: () => setTab('mine') }
                    }
                  />
                ) : listings.map((listing) => (
                  <View key={listing.id} style={styles.listingCard}>
                    <View style={styles.listingHead}>
                      <Text style={styles.listingName}>@{listing.username}</Text>
                      <Text style={styles.listingPrice}>{listing.price_twc} NF</Text>
                    </View>
                    <View style={styles.listingFoot}>
                      <View style={styles.sellerRow}>
                        <Avatar
                          size={20}
                          username={listing.seller?.username || 'U'}
                          uri={listing.seller?.avatar || undefined}
                        />
                        <Text style={styles.sellerText} numberOfLines={1}>
                          vendu par @{listing.seller?.username || 'inconnu'}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.buyBtn}
                        onPress={() => onBuy(listing)}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.buyBtnText}>Acheter</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </>
            ) : (
              <>
                {/* Vérifier / réserver un pseudo libre */}
                <Text style={styles.sectionLabel}>Réserver un pseudo</Text>
                <View style={styles.searchBox}>
                  <Text style={styles.at}>@</Text>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="pseudo_recherché"
                    placeholderTextColor={colors.textMuted}
                    value={lookup}
                    onChangeText={(t) => { setLookup(t); setLookupState(null); }}
                    onSubmitEditing={runLookup}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={30}
                  />
                  <TouchableOpacity onPress={runLookup} disabled={checking} hitSlop={8}>
                    {checking
                      ? <ActivityIndicator size="small" color={colors.textMuted} />
                      : <Ionicons name="arrow-forward-circle" size={22} color={colors.accent} />}
                  </TouchableOpacity>
                </View>

                {!!lookupState && (
                  <View style={styles.lookupResult}>
                    <Ionicons
                      name={lookupState.available ? 'checkmark-circle' : 'close-circle'}
                      size={18}
                      color={lookupState.available ? colors.success : colors.red}
                    />
                    <Text style={styles.lookupText}>
                      {lookupState.available
                        ? `@${lookupState.username} est libre`
                        : UNAVAILABILITY_LABELS[lookupState.reason || ''] || 'Indisponible'}
                    </Text>
                    {lookupState.available && config && (
                      <TouchableOpacity style={styles.smallBtn} onPress={onReserve} activeOpacity={0.85}>
                        <Text style={styles.smallBtnText}>
                          Réserver · {config.reservation_price_twc} NF
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* Réservations en cours */}
                {!!mine?.reservations.length && (
                  <>
                    <Text style={styles.sectionLabel}>Tes réservations</Text>
                    {mine.reservations.map((r) => (
                      <View key={r.id} style={styles.rowCard}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowTitle}>@{r.username}</Text>
                          <Text style={styles.rowHint}>
                            jusqu'au {new Date(r.expires_at).toLocaleDateString('fr-FR')}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.smallBtn}
                          onPress={() => onClaim(r.username)}
                          activeOpacity={0.85}
                        >
                          <Text style={styles.smallBtnText}>Prendre</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </>
                )}

                {/* Vendre son pseudo */}
                <Text style={styles.sectionLabel}>Vendre @{user?.username}</Text>
                {activeListing ? (
                  <View style={styles.rowCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>En vente à {activeListing.price_twc} NF</Text>
                      <Text style={styles.rowHint}>
                        tu deviendras @{activeListing.replacement_username}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.smallBtnGhost}
                      onPress={async () => {
                        try {
                          await cancelListing(activeListing.id);
                          await load();
                        } catch (e: any) {
                          toast.error('Retrait impossible', {
                            description: e?.message || 'Réessaie.',
                          });
                        }
                      }}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.smallBtnGhostText}>Retirer</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.sellBox}>
                    <Text style={styles.sellHint}>
                      Choisis le pseudo que tu porteras après la vente : il te sera réservé tant que
                      l'annonce est en ligne, et l'échange sera instantané le jour où quelqu'un
                      achète.
                    </Text>

                    <View style={styles.field}>
                      <Text style={styles.at}>@</Text>
                      <TextInput
                        style={styles.fieldInput}
                        placeholder="ton_futur_pseudo"
                        placeholderTextColor={colors.textMuted}
                        value={replacement}
                        onChangeText={setReplacement}
                        autoCapitalize="none"
                        autoCorrect={false}
                        maxLength={30}
                      />
                    </View>

                    <View style={styles.field}>
                      <TextInput
                        style={styles.fieldInput}
                        placeholder="Prix en NF"
                        placeholderTextColor={colors.textMuted}
                        value={sellPrice}
                        onChangeText={setSellPrice}
                        keyboardType="decimal-pad"
                      />
                      <Text style={styles.fieldSuffix}>NF</Text>
                    </View>

                    {!!config && !!Number(sellPrice.replace(',', '.')) && (
                      <Text style={styles.netHint}>
                        Tu toucheras {sellerNetFor(Number(sellPrice.replace(',', '.')), config.platform_fee_rate)} NF
                        {' '}({Math.round(config.platform_fee_rate * 100)} % de commission).
                      </Text>
                    )}

                    <TouchableOpacity
                      style={[styles.primaryBtn, selling && styles.btnDisabled]}
                      onPress={onSell}
                      disabled={selling}
                      activeOpacity={0.85}
                    >
                      {selling
                        ? <ActivityIndicator size="small" color={colors.onAccent} />
                        : <Text style={styles.primaryBtnText}>Mettre en vente</Text>}
                    </TouchableOpacity>
                  </View>
                )}

                {!!mine?.sales.length && (
                  <>
                    <Text style={styles.sectionLabel}>Tes ventes</Text>
                    {mine.sales.map((s) => (
                      <View key={s.id} style={styles.rowCard}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowTitle}>@{s.username}</Text>
                          <Text style={styles.rowHint}>
                            {new Date(s.created_at).toLocaleDateString('fr-FR')}
                          </Text>
                        </View>
                        <Text style={styles.netText}>+{s.net_twc} NF</Text>
                      </View>
                    ))}
                  </>
                )}
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
  roundButton: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  titleGroup: { flex: 1, alignItems: 'center' },
  title: { color: colors.textPrimary, fontSize: 17, fontWeight: '700' },

  tabs: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 6 },
  tab: {
    flex: 1, paddingVertical: 10, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: colors.accent },
  tabText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: colors.textPrimary },

  content: { paddingHorizontal: 16, paddingTop: 12 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { color: colors.red, fontSize: 13, marginBottom: 12 },
  empty: { color: colors.textMuted, fontSize: 13, paddingVertical: 18 },
  howItWorks: { marginBottom: 16 },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: radius.round,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
  },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: 14, marginHorizontal: 8, padding: 0 },
  at: { color: colors.textMuted, fontSize: 15, fontWeight: '700' },

  lookupResult: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 6,
  },
  lookupText: { flex: 1, color: colors.textPrimary, fontSize: 13, marginLeft: 8 },

  sectionLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 20,
    marginBottom: 10,
  },

  listingCard: {
    borderRadius: radius.md,
    padding: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  listingHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  listingName: { color: colors.textPrimary, fontSize: 17, fontWeight: '700' },
  listingPrice: { color: colors.accentBright, fontSize: 15, fontWeight: '800' },
  listingFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  sellerRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 },
  sellerText: { color: colors.textMuted, fontSize: 12, marginLeft: 8 },
  buyBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.round,
    backgroundColor: colors.accent,
  },
  buyBtnText: { color: colors.onAccent, fontSize: 13, fontWeight: '700' },

  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  rowTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  rowHint: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
  netText: { color: colors.success, fontSize: 14, fontWeight: '700' },

  smallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.round,
    backgroundColor: colors.accent,
  },
  smallBtnText: { color: colors.onAccent, fontSize: 12, fontWeight: '700' },
  smallBtnGhost: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.round,
    borderWidth: 1,
    borderColor: colors.border,
  },
  smallBtnGhostText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },

  sellBox: {
    borderRadius: radius.lg,
    padding: 16,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  sellHint: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginBottom: 14 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  fieldInput: { flex: 1, color: colors.textPrimary, fontSize: 14, marginLeft: 6, padding: 0 },
  fieldSuffix: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  netHint: { color: colors.textSecondary, fontSize: 12, marginBottom: 12 },
  primaryBtn: {
    paddingVertical: 13,
    borderRadius: radius.round,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  primaryBtnText: { color: colors.onAccent, fontSize: 14, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },
});
