import { colors, fonts, statusBarStyle } from '../theme';
import { ScreenBackground, AppHeader, IconButton, ScreenSkeleton } from '../components/ui';
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  StatusBar,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { MainStackParamList } from '../navigation/MainNavigator';
import NewEconomyService, { UserCurrency } from '../services/newEconomyService';
import Avatar from '../components/Avatar';
import { LIST_TUNING } from '../utils/listTuning';

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

  // Rechargée à chaque retour de focus : c'est ainsi que la monnaie qu'on
  // vient de créer sur `CreateCurrencyScreen` apparaît dans la liste, sans
  // callback à faire remonter entre les deux écrans.
  useFocusEffect(
    useCallback(() => {
      void load(true);
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  };

  const keyExtractor = useCallback((item: UserCurrency) => item.id, []);

  const renderItem = useCallback(({ item }: { item: UserCurrency }) => (
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
  ), [navigation]);

  return (
    <ScreenBackground>
      <StatusBar barStyle={statusBarStyle()} backgroundColor={colors.bg} />
      <AppHeader
        navigation={navigation}
        title="Monnaies communautaires"
        subtitle="Émises par la communauté"
        right={<IconButton icon="add" onPress={() => navigation.navigate('CreateCurrency')} />}
      />

      <Text style={styles.subtitle}>
        Émettez la vôtre pour {pricing ? fmt(pricing.creationCostNf, 0) : '10 000'} NF. Convertible en NF ou en euros à tout moment.
      </Text>

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
          {...LIST_TUNING}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          ListEmptyComponent={
            <View style={styles.centerWrap}>
              <Text style={styles.emptyText}>Aucune monnaie communautaire pour l'instant. Soyez le premier.</Text>
            </View>
          }
          renderItem={renderItem}
        />
      )}
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontSize: 13, color: colors.textSecondary, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, lineHeight: 18 },
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
