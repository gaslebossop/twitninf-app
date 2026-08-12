import { colors, fonts } from '../theme';
import { ScreenBackground, BackButton, ScreenSkeleton } from '../components/ui';
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { MainStackParamList } from '../navigation/MainNavigator';
import NewEconomyService, { UserCurrency } from '../services/newEconomyService';
import Avatar from '../components/Avatar';
import CreateCurrencyModal from '../components/CreateCurrencyModal';

function fmt(value: number, maxDigits = 2) {
  return Number(value ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: maxDigits });
}

/**
 * Marché des monnaies COMMUNAUTAIRES — émises par des utilisateurs contre
 * 10 000 NF, convertibles en NF/EUR à tout moment. Pendant mobile de
 * TradingPage (twitninf-windows) : avant cet écran, l'app mobile n'avait
 * aucune visibilité sur ces monnaies (ni liste, ni détail, ni portefeuille).
 */
export default function CommunityCurrenciesScreen() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const [currencies, setCurrencies] = useState<UserCurrency[] | null>(null);
  const [pricing, setPricing] = useState<{ creationCostNf: number; initialSupply: number; minBasePriceEur: number; maxBasePriceEur: number; totalValueEur: number | null } | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setError('');
    try {
      const [list, price] = await Promise.all([
        NewEconomyService.listUserCurrencies(),
        NewEconomyService.getCurrencyPricing(),
      ]);
      setCurrencies(list);
      setPricing(price);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Monnaies indisponibles');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  };

  return (
    <ScreenBackground>
      <View style={styles.header}>
        <BackButton navigation={navigation} />
        <Text style={styles.headerTitle}>Monnaies communautaires</Text>
        <TouchableOpacity style={styles.iconButton} onPress={() => setCreateOpen(true)}>
          <Ionicons name="add" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <Text style={styles.subtitle}>
        Émettez la vôtre pour {pricing ? fmt(pricing.creationCostNf, 0) : '10 000'} NF. Convertible en NF ou en euros à tout moment.
      </Text>

      {notice !== '' && (
        <View style={styles.noticeBox}>
          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      )}

      {error !== '' && !currencies ? (
        <View style={styles.centerWrap}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => void load()}>
            <Text style={styles.retryButtonText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      ) : !currencies ? (
        <ScreenSkeleton variant="list" />
      ) : (
        <FlatList
          data={currencies}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          ListEmptyComponent={
            <View style={styles.centerWrap}>
              <Text style={styles.emptyText}>Aucune monnaie communautaire pour l'instant. Soyez le premier.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, { borderColor: `${item.color}55` }]}
              onPress={() => navigation.navigate('CurrencyDetail', { currencyId: item.id })}
              activeOpacity={0.7}
            >
              <View style={[styles.mark, { backgroundColor: item.color }]}>
                <Text style={styles.markText}>{item.symbol.slice(0, 3)}</Text>
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.cardMeta}>{item.symbol} · {item.priceEur.toFixed(4)} €</Text>
                {item.creator && <Text style={styles.cardCreator} numberOfLines={1}>par @{item.creator.username}</Text>}
              </View>
              <View style={styles.cardHolding}>
                <Text style={styles.cardHoldingValue}>{fmt(item.holding)}</Text>
                <Text style={styles.cardHoldingLabel}>détenu</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        />
      )}

      <CreateCurrencyModal
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        costNf={pricing?.creationCostNf ?? 10000}
        minPriceEur={pricing?.minBasePriceEur ?? 0.0001}
        maxPriceEur={pricing?.maxBasePriceEur ?? 1000}
        totalValueEur={pricing?.totalValueEur ?? null}
        onCreated={(symbol) => { setNotice(`${symbol} émise avec succès.`); void load(); }}
      />
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4,
  },
  iconButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.overlaySoft },
  headerTitle: { fontSize: 16, fontWeight: '700', fontFamily: fonts.bold, color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, lineHeight: 18 },
  noticeBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 10, padding: 12, borderRadius: 12, backgroundColor: colors.successMuted },
  noticeText: { flex: 1, fontSize: 13, color: colors.success, fontWeight: '500' },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12, paddingTop: 60 },
  errorText: { color: colors.textSecondary, fontSize: 14, textAlign: 'center' },
  retryButton: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.overlayMedium },
  retryButtonText: { color: colors.textPrimary, fontWeight: '600' },
  emptyText: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
  listContent: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16,
    backgroundColor: colors.surface, borderWidth: 1,
  },
  mark: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  markText: { color: '#fff', fontWeight: '800', fontFamily: fonts.bold, fontSize: 12 },
  cardBody: { flex: 1, minWidth: 0 },
  cardName: { fontSize: 15, fontWeight: '700', fontFamily: fonts.bold, color: colors.textPrimary },
  cardMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  cardCreator: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  cardHolding: { alignItems: 'flex-end' },
  cardHoldingValue: { fontSize: 14, fontWeight: '700', fontFamily: fonts.bold, color: colors.textPrimary },
  cardHoldingLabel: { fontSize: 10, color: colors.textMuted },
});
