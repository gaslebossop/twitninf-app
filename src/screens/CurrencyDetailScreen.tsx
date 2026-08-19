import { colors, fonts, statusBarStyle } from '../theme';
import { ScreenBackground, AppHeader, ScreenSkeleton } from '../components/ui';
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { MainStackParamList } from '../navigation/MainNavigator';
import NewEconomyService, { UserCurrencyDetail, ChartRange } from '../services/newEconomyService';
import Avatar from '../components/Avatar';
import ConvertCurrencyModal from '../components/ConvertCurrencyModal';
import SendCoinsModal from '../components/SendCoinsModal';
import RangePicker from '../components/RangePicker';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function fmt(value: number, maxDigits = 2) {
  return Number(value ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: maxDigits });
}

function PriceChart({ points, color }: { points: UserCurrencyDetail['priceSeries']; color: string }) {
  const w = SCREEN_WIDTH - 32;
  const h = 140;
  const pad = 8;

  if (points.length < 2) {
    return (
      <View style={[styles.chartEmpty, { width: w, height: h }]}>
        <Text style={styles.chartEmptyText}>Pas encore assez d'échanges pour tracer une courbe.</Text>
      </View>
    );
  }

  const prices = points.map((p) => p.priceEur);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || max || 1;
  const x = (i: number) => pad + (i / (points.length - 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - ((v - min) / span) * (h - pad * 2);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.priceEur).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${h} L${x(0).toFixed(1)},${h} Z`;
  const rising = prices[prices.length - 1] >= prices[0];

  return (
    <View>
      <Svg width={w} height={h}>
        <Defs>
          <SvgLinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </SvgLinearGradient>
        </Defs>
        <Path d={area} fill="url(#fill)" />
        <Path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      </Svg>
      <View style={styles.chartScale}>
        <Text style={styles.chartScaleText}>{points[0].date}</Text>
        <Text style={[styles.chartScaleText, { color: rising ? colors.success : colors.red, fontWeight: '700' }]}>
          {min.toFixed(4)} € → {max.toFixed(4)} €
        </Text>
        <Text style={styles.chartScaleText}>{points[points.length - 1].date}</Text>
      </View>
    </View>
  );
}

export default function CurrencyDetailScreen() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const route = useRoute();
  const { currencyId } = (route.params as { currencyId: string }) ?? { currencyId: '' };

  const [detail, setDetail] = useState<UserCurrencyDetail | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [convertOpen, setConvertOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [chartRange, setChartRange] = useState<ChartRange>('30d');

  const load = useCallback(() => {
    setError('');
    NewEconomyService.getUserCurrencyDetail(currencyId, chartRange)
      .then(setDetail)
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Fiche indisponible'));
  }, [currencyId, chartRange]);

  // Chargée une seule fois à l'ouverture, cette fiche restait figée jusqu'à
  // ce qu'on quitte puis revienne sur l'écran. Même cadence que le reste de
  // l'app pour les données de marché (rafraîchi toutes les 30 s).
  useEffect(() => {
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <ScreenBackground>
      <StatusBar barStyle={statusBarStyle()} backgroundColor={colors.bg} />
      <AppHeader
        navigation={navigation}
        title={detail ? `${detail.name} · ${detail.symbol}` : 'Chargement…'}
      />

      {error !== '' && (
        <View style={styles.centerWrap}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={load}>
            <Text style={styles.retryButtonText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      )}

      {!error && !detail && (
        <ScreenSkeleton variant="detail" />
      )}

      {detail && (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {notice !== '' && (
            <View style={styles.noticeBox}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={styles.noticeText}>{notice}</Text>
            </View>
          )}

          <View style={[styles.hero, { borderColor: `${detail.color}44` }]}>
            <View style={[styles.mark, { backgroundColor: detail.color }]}>
              <Text style={styles.markText}>{detail.symbol.slice(0, 3)}</Text>
            </View>
            <View style={styles.heroBody}>
              <Text style={styles.heroPrice}>{detail.priceEur.toFixed(4)} €</Text>
              <Text style={styles.heroMeta}>
                {detail.priceNf !== null ? `${detail.priceNf.toFixed(4)} NF · ` : ''}
                <Text style={{ color: detail.changeSinceLaunch >= 0 ? colors.success : colors.red, fontWeight: '700' }}>
                  {detail.changeSinceLaunch >= 0 ? '+' : ''}{detail.changeSinceLaunch.toFixed(2)} % depuis l'émission
                </Text>
              </Text>
            </View>
            {detail.creator && (
              <View style={styles.heroCreator}>
                <Avatar size={26} username={detail.creator.username} uri={detail.creator.avatar} />
                <Text style={styles.heroCreatorText}>@{detail.creator.username}</Text>
              </View>
            )}
          </View>

          {detail.description ? <Text style={styles.description}>{detail.description}</Text> : null}

          <View style={styles.chartHeader}>
            <Text style={[styles.sectionTitle, { marginTop: 0, marginBottom: 0 }]}>Cours</Text>
            <RangePicker value={chartRange} onChange={setChartRange} />
          </View>
          <PriceChart points={detail.priceSeries} color={detail.color} />

          <View style={styles.statsGrid}>
            {([
              ['Vous détenez', fmt(detail.holding)],
              ['Capitalisation', `${fmt(detail.marketCapEur)} €`],
              ['En circulation', fmt(detail.circulatingSupply)],
              ['Émis à la création', fmt(detail.issuedAtLaunch)],
              ['Détenteurs', fmt(detail.holderCount)],
              ['Opérations (30 j)', fmt(detail.activity.operations)],
            ] as [string, string][]).map(([label, value]) => (
              <View style={styles.statCard} key={label}>
                <Text style={styles.statLabel}>{label}</Text>
                <Text style={styles.statValue}>{value}</Text>
              </View>
            ))}
          </View>

          {detail.mintedByTrading > 0 && (
            <Text style={styles.mintedNote}>
              {fmt(detail.mintedByTrading)} unités créées par les achats, au-delà des {fmt(detail.issuedAtLaunch)} émises au départ — l'offre n'est pas plafonnée.
            </Text>
          )}

          <Text style={styles.sectionTitle}>Principaux détenteurs</Text>
          <View style={styles.holdersList}>
            {detail.holders.map((h, index) => (
              <View style={styles.holderRow} key={h.userId}>
                <Text style={styles.holderRank}>{index + 1}</Text>
                <Avatar size={26} username={h.username} uri={h.avatar} />
                <Text style={styles.holderName} numberOfLines={1}>@{h.username}</Text>
                <View style={styles.holderBarTrack}>
                  <View style={[styles.holderBarFill, { width: `${Math.min(100, h.share)}%`, backgroundColor: detail.color }]} />
                </View>
                <Text style={styles.holderShare}>{h.share.toFixed(1)} %</Text>
              </View>
            ))}
            {!detail.holders.length && <Text style={styles.emptyText}>Aucun détenteur.</Text>}
          </View>

          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.primaryButton} onPress={() => setConvertOpen(true)}>
              <Ionicons name="swap-horizontal" size={16} color={colors.onAccent} />
              <Text style={styles.primaryButtonText}>Convertir {detail.symbol}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryButton, !detail.holding && styles.secondaryButtonDisabled]}
              disabled={!detail.holding}
              onPress={() => setSendOpen(true)}
            >
              <Ionicons name="send" size={16} color={colors.textPrimary} />
              <Text style={styles.secondaryButtonText}>Envoyer {detail.symbol}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {detail && (
        <ConvertCurrencyModal
          visible={convertOpen}
          onClose={() => setConvertOpen(false)}
          currencyId={detail.id}
          symbol={detail.symbol}
          holding={detail.holding}
          priceEur={detail.priceEur}
          onDone={(message) => { setNotice(message); setConvertOpen(false); load(); }}
        />
      )}
      {detail && (
        <SendCoinsModal
          visible={sendOpen}
          onClose={() => setSendOpen(false)}
          currencyId={detail.id}
          symbol={detail.symbol}
          balance={detail.holding}
          onSent={() => { setNotice(`${detail.symbol} envoyés.`); setSendOpen(false); load(); }}
        />
      )}
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  errorText: { color: colors.textSecondary, fontSize: 14, textAlign: 'center' },
  retryButton: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.overlayMedium },
  retryButtonText: { color: colors.textPrimary, fontWeight: '600' },
  emptyText: { color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 12 },
  body: { paddingHorizontal: 16, paddingBottom: 32 },
  noticeBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, padding: 12, borderRadius: 12, backgroundColor: colors.successMuted },
  noticeText: { flex: 1, fontSize: 13, color: colors.success, fontWeight: '500' },
  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 18,
    backgroundColor: colors.surface, borderWidth: 1, marginBottom: 12,
  },
  mark: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  markText: { color: '#fff', fontWeight: '800', fontFamily: fonts.bold, fontSize: 13 },
  heroBody: { flex: 1, minWidth: 0 },
  heroPrice: { fontSize: 22, fontWeight: '800', fontFamily: fonts.bold, color: colors.textPrimary },
  heroMeta: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  heroCreator: { alignItems: 'center', gap: 4 },
  heroCreatorText: { fontSize: 11, color: colors.textMuted },
  description: { fontSize: 13, color: colors.textSecondary, lineHeight: 19, marginBottom: 14 },
  chartHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  chartEmpty: { alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chartEmptyText: { color: colors.textMuted, fontSize: 12, textAlign: 'center', paddingHorizontal: 24 },
  chartScale: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  chartScaleText: { fontSize: 10, color: colors.textMuted },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  statCard: { width: '31%', padding: 10, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  statLabel: { fontSize: 10, color: colors.textMuted },
  statValue: { fontSize: 14, fontWeight: '700', fontFamily: fonts.bold, color: colors.textPrimary, marginTop: 4 },
  mintedNote: { fontSize: 11, color: colors.textMuted, marginTop: 12, lineHeight: 16 },
  sectionTitle: { fontSize: 14, fontWeight: '700', fontFamily: fonts.bold, color: colors.textPrimary, marginTop: 22, marginBottom: 10 },
  holdersList: { gap: 8 },
  holderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  holderRank: { width: 18, fontSize: 12, color: colors.textMuted, fontWeight: '700' },
  holderName: { flex: 1, fontSize: 13, color: colors.textPrimary, fontWeight: '600' },
  holderBarTrack: { width: 60, height: 6, borderRadius: 3, backgroundColor: colors.overlayMedium, overflow: 'hidden' },
  holderBarFill: { height: '100%', borderRadius: 3 },
  holderShare: { width: 44, fontSize: 11, color: colors.textSecondary, textAlign: 'right' },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 24 },
  primaryButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: 14, backgroundColor: colors.accent },
  primaryButtonText: { fontSize: 14, fontWeight: '700', fontFamily: fonts.bold, color: colors.onAccent },
  secondaryButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: 14, backgroundColor: colors.overlayMedium, borderWidth: 1, borderColor: colors.border },
  secondaryButtonDisabled: { opacity: 0.4 },
  secondaryButtonText: { fontSize: 14, fontWeight: '700', fontFamily: fonts.bold, color: colors.textPrimary },
});
