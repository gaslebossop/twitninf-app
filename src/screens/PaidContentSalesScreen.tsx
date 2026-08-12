import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenBackground, BackButton, EmptyState } from '../components/ui';
import { useHeaderMetrics, HEADER_CONTENT_HEIGHT } from '../hooks/useHeaderMetrics';
import { colors, radius , statusBarStyle} from '../theme';
import { toast } from '../components/ui/Toast';
import { confirmAsync } from '../components/ui/ConfirmSheet';
import {
  fetchPurchases,
  fetchSales,
  unlockContent,
  type PurchasedItem,
  type SalesDashboard,
} from '../services/paidContentService';

/**
 * Ventes de contenu à l'unité, et bibliothèque des achats.
 *
 * Les deux moitiés du même sujet, dans un seul écran : ce qu'on vend et ce
 * qu'on a acheté. Les séparer obligerait à chercher ses achats dans un coin
 * différent de l'app alors que la question posée est la même — « où est le
 * contenu payant qui me concerne ? ».
 *
 * La commission est affichée en clair sur chaque ligne. Un vendeur qui
 * découvre les 30 % après sa première vente est un vendeur qui ne remet rien
 * en vente.
 */

interface Props {
  navigation: any;
}

type Tab = 'sales' | 'library';

export default function PaidContentSalesScreen({ navigation }: Props) {
  const { top: headerTopInset } = useHeaderMetrics();

  const [tab, setTab] = useState<Tab>('sales');
  const [sales, setSales] = useState<SalesDashboard | null>(null);
  const [library, setLibrary] = useState<PurchasedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [salesResult, libraryResult] = await Promise.allSettled([
      fetchSales(),
      fetchPurchases(),
    ]);

    // Un compte non-Pro n'a pas accès au tableau de bord des ventes : ce n'est
    // pas une erreur à afficher en rouge, juste une section vide.
    setSales(salesResult.status === 'fulfilled' ? salesResult.value : null);
    setLibrary(libraryResult.status === 'fulfilled' ? libraryResult.value : []);
    setError(
      salesResult.status === 'rejected' && libraryResult.status === 'rejected'
        ? 'Données indisponibles pour le moment.'
        : null,
    );
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const confirmUnlock = (id: string, price: number) => {
    confirmAsync({
      title: 'Rendre ce contenu gratuit ?',
      message: `Il ne sera plus vendu à ${price} NF. Ceux qui l'ont déjà acheté gardent leur accès et ne sont pas remboursés.`,
      confirmLabel: 'Rendre gratuit',
      cancelLabel: 'Garder en vente',
      destructive: true,
    }).then((ok) => {
      if (ok) (async () => {
            try {
              await unlockContent(id);
              await load();
            } catch (e: any) {
              toast.error('Impossible', {
                description: e?.message || 'Réessaie dans un instant.',
              });
            }
          })();
    });
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
            <Text style={styles.title}>Contenus payants</Text>
          </View>
          <View style={styles.roundSlot} />
        </View>

        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, tab === 'sales' && styles.tabActive]}
            onPress={() => setTab('sales')}
            activeOpacity={0.85}
          >
            <Text style={[styles.tabText, tab === 'sales' && styles.tabTextActive]}>Mes ventes</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === 'library' && styles.tabActive]}
            onPress={() => setTab('library')}
            activeOpacity={0.85}
          >
            <Text style={[styles.tabText, tab === 'library' && styles.tabTextActive]}>Mes achats</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.loader}><ActivityIndicator color={colors.accent} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
          }
        >
          {!!error && <Text style={styles.error}>{error}</Text>}

          {tab === 'sales' ? (
            !sales ? (
              <View style={styles.lockedBox}>
                <Ionicons name="lock-closed-outline" size={22} color={colors.gold} />
                <Text style={styles.lockedTitle}>Réservé au palier Pro</Text>
                <Text style={styles.lockedText}>
                  Verrouille un tweet, une story ou un replay derrière un prix et garde 70 % de
                  chaque vente.
                </Text>
                <TouchableOpacity
                  style={styles.upgradeBtn}
                  onPress={() => navigation.navigate('Settings')}
                  activeOpacity={0.85}
                >
                  <Text style={styles.upgradeBtnText}>Voir l'abonnement</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.totalsRow}>
                  <Totals label="Encaissé" value={`${sales.totals.net} NF`} highlight />
                  <Totals label="Ventes" value={String(sales.totals.sales)} />
                  <Totals label="Commission" value={`${sales.totals.platform_fee} NF`} />
                </View>
                <Text style={styles.feeNote}>
                  TwitNinf prélève {Math.round(sales.fee_rate * 100)} % sur chaque vente.
                </Text>

                {sales.items.length === 0 ? (
                  <EmptyState
                    compact
                    icon="lock-closed-outline"
                    tint={colors.gold}
                    title="Rien en vente pour l’instant"
                    message="Depuis le menu « … » d’un de tes tweets, choisis « Rendre payant » pour en fixer le prix."
                    action={{
                      label: 'Écrire un tweet payant',
                      icon: 'create-outline',
                      onPress: () => navigation.navigate('CreateTweet'),
                    }}
                  />
                ) : sales.items.map((item) => (
                  <View key={item.id} style={styles.card}>
                    <View style={styles.cardHead}>
                      <View style={styles.pricePill}>
                        <Text style={styles.pricePillText}>{item.price_twc} NF</Text>
                      </View>
                      <Text style={[styles.stateText, !item.is_active && styles.stateOff]}>
                        {item.is_active ? 'En vente' : 'Redevenu gratuit'}
                      </Text>
                    </View>

                    <Text style={styles.cardBody} numberOfLines={2}>
                      {item.preview_text || 'Sans aperçu personnalisé'}
                    </Text>

                    <View style={styles.cardFoot}>
                      <Text style={styles.cardStat}>
                        {item.purchases_count} acheteur{item.purchases_count > 1 ? 's' : ''} ·{' '}
                        {item.net_twc} NF nets
                      </Text>
                      <View style={styles.cardActions}>
                        <TouchableOpacity
                          onPress={() => navigation.navigate('TweetDetail', { tweetId: item.content_id })}
                          hitSlop={8}
                          style={styles.iconBtn}
                        >
                          <Ionicons name="open-outline" size={17} color={colors.textMuted} />
                        </TouchableOpacity>
                        {item.is_active && (
                          <TouchableOpacity
                            onPress={() => confirmUnlock(item.id, item.price_twc)}
                            hitSlop={8}
                            style={styles.iconBtn}
                          >
                            <Ionicons name="lock-open-outline" size={17} color={colors.textMuted} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>
                ))}
              </>
            )
          ) : (
            library.length === 0 ? (
              <Text style={styles.empty}>
                Tu n'as encore rien débloqué. Les contenus achetés restent accessibles à vie.
              </Text>
            ) : library.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.card}
                activeOpacity={0.85}
                onPress={() => item.content_id
                  && navigation.navigate('TweetDetail', { tweetId: item.content_id })}
              >
                <View style={styles.cardHead}>
                  <Text style={styles.buyerName}>
                    @{item.creator?.username || 'inconnu'}
                  </Text>
                  <Text style={styles.stateText}>
                    {item.refunded ? 'Remboursé' : `${item.price_twc} NF`}
                  </Text>
                </View>
                <Text style={styles.cardStat}>
                  Acheté le {new Date(item.created_at).toLocaleDateString('fr-FR')}
                </Text>
              </TouchableOpacity>
            ))
          )}

          <View style={{ height: 50 }} />
        </ScrollView>
      )}
    </ScreenBackground>
  );
}

function Totals({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={[styles.totalBox, highlight && styles.totalBoxHighlight]}>
      <Text style={styles.totalValue}>{value}</Text>
      <Text style={styles.totalLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: colors.accent },
  tabText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: colors.textPrimary },

  content: { paddingHorizontal: 16, paddingTop: 14 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { color: colors.red, fontSize: 13, marginBottom: 12 },
  empty: { color: colors.textMuted, fontSize: 13, lineHeight: 19, paddingVertical: 18 },

  totalsRow: { flexDirection: 'row', marginBottom: 8 },
  totalBox: {
    flex: 1,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
  },
  totalBoxHighlight: { backgroundColor: colors.surfaceAlt, borderColor: colors.borderStrong },
  totalValue: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  totalLabel: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  feeNote: { color: colors.textMuted, fontSize: 12, marginBottom: 16 },

  card: {
    borderRadius: radius.md,
    padding: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  pricePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.round,
    backgroundColor: colors.accentMuted,
  },
  pricePillText: { color: colors.accentBright, fontSize: 12, fontWeight: '800' },
  stateText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  stateOff: { color: colors.textMuted },
  cardBody: { color: colors.textPrimary, fontSize: 14, lineHeight: 20 },
  cardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  cardStat: { color: colors.textMuted, fontSize: 12 },
  cardActions: { flexDirection: 'row' },
  iconBtn: { marginLeft: 14 },
  buyerName: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },

  lockedBox: {
    borderRadius: radius.lg,
    padding: 20,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'flex-start',
  },
  lockedTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 10,
  },
  lockedText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  upgradeBtn: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: radius.round,
    backgroundColor: colors.accent,
  },
  upgradeBtnText: { color: colors.onAccent, fontSize: 14, fontWeight: '700' },
});
