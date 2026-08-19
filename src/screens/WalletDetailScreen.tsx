import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Animated,
  StatusBar,
  useWindowDimensions,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { MainStackParamList } from '../navigation/MainNavigator';
import NewEconomyService, { WalletData } from '../services/newEconomyService';
import CurrencyService from '../services/currencyService';
import TransactionDetailModal from '../components/TransactionDetailModal';
import SendCoinsModal from '../components/SendCoinsModal';
import ExchangeModal from '../components/ExchangeModal';
import { WalletTransaction } from '../services/walletService';
import { useAuth } from '../contexts/AuthContext';
import { AppHeader, ScreenBackground, Button, IconButton, Skeleton, AppRefreshControl } from '../components/ui';
import { colors, fonts, radius, withAlpha, duration as D, easing as E , statusBarStyle} from '../theme';

interface TransactionHistoryItem {
  id: string;
  type: 'received' | 'sent' | 'purchase' | 'reward' | 'bonus';
  amount: number;
  description: string;
  date: string;
  status: 'completed' | 'pending' | 'failed';
  fromUser?: {
    id: string;
    username: string;
    avatar?: string;
  };
  toUser?: {
    id: string;
    username: string;
    avatar?: string;
  };
  metadata?: {
    orderId?: string;
    packageName?: string;
    bonusType?: string;
  };
}

interface WalletStats {
  totalReceived: number;
  totalSent: number;
  totalPurchased: number;
  transactionCount: number;
  averageTransaction: number;
  thisMonthChange: number;
}

type FilterKey = 'all' | 'received' | 'sent' | 'purchases';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Tout' },
  { key: 'received', label: 'Reçu' },
  { key: 'sent', label: 'Envoyé' },
  { key: 'purchases', label: 'Achats' },
];

type WalletDetailScreenNavigationProp = StackNavigationProp<MainStackParamList, 'WalletDetail'>;

const WalletDetailScreen: React.FC = () => {
  const navigation = useNavigation<WalletDetailScreenNavigationProp>();
  const { user } = useAuth();
  const { width } = useWindowDimensions();

  // Mesuré à chaque rendu plutôt qu'au chargement du module : la rotation et
  // le mode fenêtré changent la largeur en cours de vie de l'écran.
  const twoColumn = width >= 900;
  const columnMax = twoColumn ? 1100 : 560;
  const gutter = width < 360 ? 16 : 20;

  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<TransactionHistoryItem[]>([]);
  const [stats, setStats] = useState<WalletStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterKey>('all');
  const [currencyId, setCurrencyId] = useState<string | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<WalletTransaction | null>(null);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showExchangeModal, setShowExchangeModal] = useState(false);
  const [walletMode, setWalletMode] = useState<'total' | 'avance'>('total');
  const [eurWallet, setEurWallet] = useState<{ currencyId: string; balance: number } | null>(null);

  // Le solde et l'historique ont deux sorts distincts : un historique en échec
  // ne doit pas masquer un solde qui, lui, s'est chargé correctement.
  const [walletLoadError, setWalletLoadError] = useState(false);
  const [txLoadError, setTxLoadError] = useState(false);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const riseAnim = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    initializePage();
  }, []);

  /**
   * Le contenu remplace le squelette. Ce mouvement-là garde son sens — il dit
   * « les vraies données viennent d'arriver » — mais il doit être bref : à
   * 360 ms on attendait le portefeuille une deuxième fois, après l'avoir déjà
   * attendu pendant la requête.
   */
  const startAnimations = () => {
    fadeAnim.setValue(0);
    riseAnim.setValue(18);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: D.fast, easing: E.out, useNativeDriver: true }),
      Animated.timing(riseAnim, { toValue: 0, duration: D.fast, easing: E.out, useNativeDriver: true }),
    ]).start();
  };

  const initializePage = async () => {
    try {
      const id = await CurrencyService.getTwitCoinsCurrencyId();
      setCurrencyId(id);
      await loadWalletData(id);
    } catch (error) {
      console.error('Erreur lors de l\'initialisation:', error);
      const fallbackId = '077ae58c-7ba5-4da0-bb67-5829a83a2ea1';
      setCurrencyId(fallbackId);
      await loadWalletData(fallbackId);
    }
  };

  const loadWalletData = async (id: string, silent = false) => {
    try {
      if (!silent) setLoading(true);
      setWalletLoadError(false);

      const wallet = await NewEconomyService.getUserWallet(id);
      setWalletData(wallet);

      // Portefeuille EUR interne (échangé depuis le NF) — tolérant à l'échec,
      // ne doit jamais bloquer l'affichage du solde NF principal.
      try {
        const allWallets = await NewEconomyService.getAllWallets();
        const eur = allWallets.find((w) => w.currency?.symbol === 'EUR');
        setEurWallet(eur && eur.currency.id ? { currencyId: eur.currency.id, balance: eur.wallet.balance } : null);
      } catch (eurError) {
        console.warn('Portefeuille EUR indisponible:', eurError);
      }

      // Pas de repli sur des transactions générées : un faux historique dans
      // un portefeuille est pire qu'un état d'erreur explicite.
      try {
        setTxLoadError(false);
        const realTransactions = await loadRealTransactions(id);
        setTransactions(realTransactions);
        setStats(calculateWalletStats(realTransactions));
      } catch (txError) {
        console.error('Erreur lors du chargement des transactions:', txError);
        setTxLoadError(true);
        setTransactions([]);
        setStats(calculateWalletStats([]));
      }

      startAnimations();
    } catch (error) {
      console.error('Erreur lors du chargement du portefeuille:', error);
      setWalletLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const loadRealTransactions = async (currencyId: string): Promise<TransactionHistoryItem[]> => {
    const response = await NewEconomyService.makeRequest(`/api/virtual-currency/transactions?currencyId=${currencyId}&limit=50`);

    if (response.success && response.data && response.data.transactions) {
      return response.data.transactions.map((tx: any) => {
        const type = mapTransactionType(tx);
        return {
          id: tx.id,
          type,
          amount: parseFloat(tx.amount),
          description: tx.description || getTransactionDescription(type),
          date: tx.createdAt || tx.timestamp,
          status: mapTransactionStatus(tx.status),
          fromUser: tx.fromUser ? {
            id: tx.fromUser.id,
            username: tx.fromUser.username,
            avatar: tx.fromUser.avatar
          } : undefined,
          toUser: tx.toUser ? {
            id: tx.toUser.id,
            username: tx.toUser.username,
            avatar: tx.toUser.avatar
          } : undefined,
          metadata: {
            orderId: tx.orderId,
            packageName: tx.packageName,
            bonusType: tx.bonusType,
            referenceId: tx.referenceId
          }
        };
      });
    }

    return [];
  };

  // L'API renvoie l'enum réel du ledger ('TRANSFER'/'MINING'/'PURCHASE'/
  // 'REWARD'/'REFUND'/'SYSTEM', en majuscules) — les anciennes clés
  // ('transfer_in', 'receive', 'mining_reward', ...) ne correspondaient à
  // rien et faisaient tomber CHAQUE transaction dans le cas par défaut
  // 'received', même les envois. Une fois plusieurs monnaies échangées entre
  // elles (NF/EUR/monnaies communautaires via exchangeCurrency), les deux
  // lignes d'un même échange partagent from=to=utilisateur : impossible de
  // savoir laquelle est sortante sans lire metadata.direction, isIncoming/
  // isOutgoing valent `true` des deux côtés dans ce cas précis.
  const mapTransactionType = (tx: any): TransactionHistoryItem['type'] => {
    if (tx.type === 'PURCHASE') return 'purchase';
    if (tx.type === 'MINING' || tx.type === 'REWARD') return 'reward';
    if (tx.metadata?.ledger === 'EXCHANGE') {
      return tx.metadata?.direction === 'out' ? 'sent' : 'received';
    }
    return tx.isIncoming ? 'received' : 'sent';
  };

  const mapTransactionStatus = (apiStatus: string): TransactionHistoryItem['status'] => {
    if (!apiStatus) return 'completed';

    switch (apiStatus.toLowerCase()) {
      case 'completed':
      case 'success':
      case 'successful':
      case 'confirmed':
      case 'paid':
        return 'completed';
      case 'pending':
      case 'processing':
      case 'waiting':
        return 'pending';
      case 'failed':
      case 'error':
      case 'cancelled':
      case 'rejected':
        return 'failed';
      default:
        return 'completed';
    }
  };

  const getTransactionDescription = (type: TransactionHistoryItem['type']): string => {
    switch (type) {
      case 'received': return 'Reçu de';
      case 'sent': return 'Envoyé à';
      case 'purchase': return 'Achat de TwitCoins';
      case 'reward': return 'Récompense d\'engagement';
      case 'bonus': return 'Bonus de fidélité';
      default: return 'Transaction';
    }
  };

  const calculateWalletStats = (transactions: TransactionHistoryItem[]): WalletStats => {
    const received = transactions.filter(t => t.type === 'received' && t.status === 'completed');
    const sent = transactions.filter(t => t.type === 'sent' && t.status === 'completed');
    const purchases = transactions.filter(t => t.type === 'purchase' && t.status === 'completed');

    const totalReceived = received.reduce((sum, t) => sum + t.amount, 0);
    const totalSent = sent.reduce((sum, t) => sum + t.amount, 0);
    const totalPurchased = purchases.reduce((sum, t) => sum + t.amount, 0);

    const thisMonth = new Date();
    thisMonth.setMonth(thisMonth.getMonth() - 1);
    const thisMonthTransactions = transactions.filter(t => new Date(t.date) > thisMonth);
    const thisMonthBalance = thisMonthTransactions.reduce((sum, t) => {
      return sum + (t.type === 'received' || t.type === 'purchase' || t.type === 'reward' || t.type === 'bonus' ? t.amount : -t.amount);
    }, 0);

    return {
      totalReceived,
      totalSent,
      totalPurchased,
      transactionCount: transactions.length,
      averageTransaction: transactions.length > 0 ? (totalReceived + totalSent) / transactions.length : 0,
      thisMonthChange: thisMonthBalance,
    };
  };

  const onRefresh = async () => {
    if (!currencyId) return;
    setRefreshing(true);
    await loadWalletData(currencyId, true);
    setRefreshing(false);
  };

  const formatAmount = (amount: number, showSign = false): string => {
    const sign = showSign ? (amount >= 0 ? '+' : '') : '';
    return `${sign}${amount.toFixed(2)}`;
  };

  const formatTime = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  /** Libellé du séparateur de jour : « Aujourd'hui », « Hier », puis la date. */
  const formatDayLabel = (dateString: string): string => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const sameDay = (a: Date, b: Date) =>
      a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();

    if (sameDay(date, today)) return 'Aujourd\'hui';
    if (sameDay(date, yesterday)) return 'Hier';

    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}),
    });
  };

  const getTransactionIcon = (type: TransactionHistoryItem['type']): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case 'received': return 'arrow-down';
      case 'sent': return 'arrow-up';
      case 'purchase': return 'card-outline';
      case 'reward': return 'trophy-outline';
      case 'bonus': return 'gift-outline';
      default: return 'swap-horizontal';
    }
  };

  // Couleurs sémantiques du thème, jamais de hex en dur. L'achat sort du vert
  // (il n'est pas un gain reçu) pour rester distinguable sans légende.
  const getTransactionColor = (type: TransactionHistoryItem['type'], status: string): string => {
    if (status === 'failed') return colors.red;
    if (status === 'pending') return colors.warning;

    switch (type) {
      case 'received':
      case 'reward':
      case 'bonus':
        return colors.success;
      case 'purchase':
        return colors.gold;
      case 'sent':
        return colors.red;
      default:
        return colors.textSecondary;
    }
  };

  const filteredTransactions = useMemo(() => {
    switch (activeTab) {
      case 'received':
        return transactions.filter(t => t.type === 'received' || t.type === 'reward' || t.type === 'bonus');
      case 'sent':
        return transactions.filter(t => t.type === 'sent');
      case 'purchases':
        return transactions.filter(t => t.type === 'purchase');
      default:
        return transactions;
    }
  }, [transactions, activeTab]);

  /** Regroupe l'historique par jour : un relevé se lit par date, pas à plat. */
  const groupedTransactions = useMemo(() => {
    const groups: { label: string; items: TransactionHistoryItem[] }[] = [];
    for (const tx of filteredTransactions) {
      const label = formatDayLabel(tx.date);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(tx);
      else groups.push({ label, items: [tx] });
    }
    return groups;
  }, [filteredTransactions]);

  const emptyStateLabel = (): string => {
    switch (activeTab) {
      case 'received': return 'Aucune réception pour l\'instant.';
      case 'sent': return 'Aucun envoi pour l\'instant.';
      case 'purchases': return 'Aucun achat pour l\'instant.';
      default: return 'Tes transactions apparaîtront ici.';
    }
  };

  const handleTransactionPress = (transaction: TransactionHistoryItem) => {
    const walletTransaction: WalletTransaction = {
      id: transaction.id,
      type: transaction.type,
      amount: transaction.amount,
      description: transaction.description,
      date: transaction.date,
      status: transaction.status,
      fromUserId: transaction.fromUser?.id,
      toUserId: transaction.toUser?.id,
      fromUsername: transaction.fromUser?.username,
      toUsername: transaction.toUser?.username,
      currencyId: currencyId || '',
      currencySymbol: 'TWC',
      metadata: transaction.metadata,
    };

    setSelectedTransaction(walletTransaction);
    setShowTransactionModal(true);
  };

  const renderHeader = () => (
    <AppHeader
      navigation={navigation}
      title="Portefeuille"
      subtitle="Solde, échanges et historique"
      right={<IconButton icon="layers-outline" onPress={() => navigation.navigate('CommunityCurrencies')} />}
    />
  );

  const renderHero = () => {
    if (!walletData) return null;

    const balance = walletData.wallet?.balance || (walletData as any).balance || 0;
    // Pas de valeur par défaut fictive ici : un ancien code retombait sur
    // 0.579€ (un prix inventé, sans rapport avec le taux réel) si le champ
    // manquait — mieux vaut ne pas afficher d'estimation EUR du tout que
    // d'en afficher une fausse.
    const rawPrice = walletData.currency?.currentPrice ?? (walletData as any).currentPrice;
    const hasPrice = typeof rawPrice === 'number' && Number.isFinite(rawPrice) && rawPrice > 0;
    const eurValue = hasPrice ? balance * rawPrice : 0;
    const changeUp = !!stats && stats.thisMonthChange >= 0;

    return (
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>Solde disponible</Text>

        <View style={styles.heroAmountRow}>
          <Text style={styles.heroAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
            {formatAmount(balance)}
          </Text>
          <Text style={styles.heroUnit}>TWC</Text>
        </View>

        {hasPrice ? (
          <View style={styles.heroSecondary}>
            <Text style={styles.heroEur}>
              {walletMode === 'total' ? `≈ ${formatAmount(eurValue)} €` : `${formatAmount(eurWallet?.balance ?? 0)} €`}
            </Text>
            <Text style={styles.heroEurHint}>
              {walletMode === 'total'
                ? `estimation · 1 TWC = ${rawPrice.toFixed(4)} €`
                : 'solde EUR réellement détenu'}
            </Text>
          </View>
        ) : (
          <Text style={styles.heroEurHint}>Estimation EUR indisponible</Text>
        )}

        {hasPrice && (
          <View style={styles.modeSwitch}>
            {(['total', 'avance'] as const).map((mode) => {
              const active = walletMode === mode;
              return (
                <Pressable
                  key={mode}
                  onPress={() => setWalletMode(mode)}
                  style={({ pressed }) => [
                    styles.modeChip,
                    active && styles.modeChipActive,
                    pressed && !active && styles.modeChipPressed,
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.modeChipText, active && styles.modeChipTextActive]}>
                    {mode === 'total' ? 'Estimation' : 'Solde réel'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={styles.heroChange}>
          <Ionicons name={changeUp ? 'trending-up' : 'trending-down'} size={13} color={changeUp ? colors.success : colors.red} />
          <Text style={[styles.heroChangeText, { color: changeUp ? colors.success : colors.red }]}>
            {stats ? formatAmount(stats.thisMonthChange, true) : '0.00'} TWC
          </Text>
          <Text style={styles.heroChangePeriod}>ce mois</Text>
        </View>

        <View style={styles.actionsRow}>
          <Button label="Envoyer" icon="arrow-up" variant="primary" onPress={() => setShowSendModal(true)} style={styles.actionBtn} />
          {hasPrice && (
            <Button label="Échanger" icon="swap-horizontal" variant="secondary" onPress={() => setShowExchangeModal(true)} style={styles.actionBtn} />
          )}
        </View>
      </View>
    );
  };

  /**
   * Barre de flux entrées/sorties.
   *
   * Remplace trois tuiles de statistiques identiques : la proportion se lit
   * d'un coup d'œil, ce qu'un alignement de nombres ne permet pas.
   */
  const renderFlow = () => {
    if (!stats) return null;

    const inbound = stats.totalReceived + stats.totalPurchased;
    const outbound = stats.totalSent;
    const total = inbound + outbound;
    const inShare = total > 0 ? inbound / total : 0.5;

    return (
      <View style={styles.block}>
        <View style={styles.blockHead}>
          <Text style={styles.blockTitle}>Flux</Text>
          <Text style={styles.blockMeta}>
            {stats.transactionCount} opération{stats.transactionCount > 1 ? 's' : ''}
          </Text>
        </View>

        {total > 0 ? (
          <>
            <View style={styles.flowBar} accessible accessibilityLabel={`Entrées ${Math.round(inShare * 100)} %, sorties ${Math.round((1 - inShare) * 100)} %`}>
              <View style={[styles.flowSegment, { flex: Math.max(inShare, 0.02), backgroundColor: colors.success }]} />
              <View style={[styles.flowSegment, { flex: Math.max(1 - inShare, 0.02), backgroundColor: colors.red }]} />
            </View>
            <View style={styles.flowLegend}>
              <View style={styles.flowLegendItem}>
                <View style={[styles.flowDot, { backgroundColor: colors.success }]} />
                <Text style={styles.flowLegendLabel}>Entrées</Text>
                <Text style={[styles.flowLegendValue, { color: colors.success }]}>{formatAmount(inbound)}</Text>
              </View>
              <View style={styles.flowLegendItem}>
                <View style={[styles.flowDot, { backgroundColor: colors.red }]} />
                <Text style={styles.flowLegendLabel}>Sorties</Text>
                <Text style={[styles.flowLegendValue, { color: colors.red }]}>{formatAmount(outbound)}</Text>
              </View>
            </View>
          </>
        ) : (
          <Text style={styles.flowEmpty}>Aucun mouvement enregistré pour l'instant.</Text>
        )}
      </View>
    );
  };

  const renderMonetization = () => (
    <Pressable
      onPress={() => navigation.navigate('TweetMonetization')}
      style={({ pressed }) => [styles.monetizationRow, pressed && styles.rowPressed]}
      accessibilityRole="button"
    >
      <View style={styles.monetizationIcon}>
        <Ionicons name="cash-outline" size={19} color={colors.accent} />
      </View>
      <View style={styles.monetizationText}>
        <Text style={styles.monetizationTitle}>Monétisation des tweets</Text>
        <Text style={styles.monetizationSubtitle}>Gagne des TWC avec tes publications</Text>
      </View>
      <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
    </Pressable>
  );

  const renderTabs = () => (
    <View style={styles.tabs}>
      {FILTERS.map((tab) => {
        const active = activeTab === tab.key;
        return (
          <Pressable
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
            <View style={[styles.tabUnderline, active && styles.tabUnderlineActive]} />
          </Pressable>
        );
      })}
    </View>
  );

  const renderTransactionRow = (transaction: TransactionHistoryItem) => {
    const color = getTransactionColor(transaction.type, transaction.status);

    let isPositive = false;
    if (transaction.fromUser && transaction.toUser && user?.id) {
      if (transaction.toUser.id === user.id && transaction.fromUser.id !== user.id) {
        isPositive = true;
      } else if (transaction.fromUser.id === user.id && transaction.toUser.id !== user.id) {
        isPositive = false;
      } else {
        isPositive = transaction.type === 'received' || transaction.type === 'reward' || transaction.type === 'bonus' || transaction.type === 'purchase';
      }
    } else {
      isPositive = transaction.type === 'received' || transaction.type === 'reward' || transaction.type === 'bonus' || transaction.type === 'purchase';
    }

    const counterpart = transaction.fromUser
      ? `@${transaction.fromUser.username}`
      : transaction.toUser
        ? `@${transaction.toUser.username}`
        : transaction.metadata?.packageName || null;

    return (
      <Pressable
        key={transaction.id}
        onPress={() => handleTransactionPress(transaction)}
        style={({ pressed }) => [styles.txRow, pressed && styles.rowPressed]}
        accessibilityRole="button"
      >
        <View style={[styles.txIcon, { borderColor: withAlpha(color, 0.35) }]}>
          <Ionicons name={getTransactionIcon(transaction.type)} size={15} color={color} />
        </View>

        <View style={styles.txInfo}>
          <Text style={styles.txDescription} numberOfLines={1}>{transaction.description}</Text>
          <Text style={styles.txMeta} numberOfLines={1}>
            {counterpart ? `${counterpart} · ${formatTime(transaction.date)}` : formatTime(transaction.date)}
          </Text>
        </View>

        <View style={styles.txRight}>
          <Text style={[styles.txAmount, { color: isPositive ? colors.success : colors.textPrimary }]} numberOfLines={1}>
            {isPositive ? '+' : '−'}{formatAmount(Math.abs(transaction.amount))}
          </Text>
          {transaction.status !== 'completed' && (
            <Text style={[styles.txStatus, { color: transaction.status === 'pending' ? colors.warning : colors.red }]}>
              {transaction.status === 'pending' ? 'En cours' : 'Échoué'}
            </Text>
          )}
        </View>
      </Pressable>
    );
  };

  const renderHistory = () => (
    <View style={styles.block}>
      <View style={styles.blockHead}>
        <Text style={styles.blockTitle}>Historique</Text>
        {!txLoadError && filteredTransactions.length > 0 && (
          <Text style={styles.blockMeta}>{filteredTransactions.length}</Text>
        )}
      </View>

      {renderTabs()}

      {txLoadError ? (
        <View style={styles.stateBox}>
          <Ionicons name="alert-circle-outline" size={24} color={colors.warning} />
          <Text style={styles.stateText}>Impossible de charger l'historique.</Text>
          <Pressable
            onPress={() => currencyId && loadWalletData(currencyId, true)}
            style={({ pressed }) => pressed && styles.linkPressed}
          >
            <Text style={styles.stateAction}>Réessayer</Text>
          </Pressable>
        </View>
      ) : groupedTransactions.length === 0 ? (
        <View style={styles.stateBox}>
          <Ionicons name="receipt-outline" size={24} color={colors.textMuted} />
          <Text style={styles.stateText}>{emptyStateLabel()}</Text>
        </View>
      ) : (
        groupedTransactions.map((group) => (
          <View key={group.label} style={styles.dayGroup}>
            <Text style={styles.dayLabel}>{group.label}</Text>
            {group.items.map(renderTransactionRow)}
          </View>
        ))
      )}
    </View>
  );

  const renderLoading = () => (
    <ScreenBackground>
      <StatusBar barStyle={statusBarStyle()} backgroundColor={colors.bg} />
      {renderHeader()}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingHorizontal: gutter, maxWidth: columnMax }]}
      >
        <Skeleton width="55%" height={16} rounded={radius.sm} style={{ marginBottom: 14 }} />
        <Skeleton width="80%" height={54} rounded={radius.md} style={{ marginBottom: 14 }} />
        <Skeleton width="45%" height={18} rounded={radius.sm} style={{ marginBottom: 28 }} />
        <Skeleton width="100%" height={54} rounded={radius.lg} style={{ marginBottom: 32 }} />
        <Skeleton width="100%" height={92} rounded={radius.lg} style={{ marginBottom: 32 }} />
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} width="100%" height={58} rounded={radius.md} style={{ marginBottom: 8 }} />
        ))}
      </ScrollView>
    </ScreenBackground>
  );

  const renderWalletError = () => (
    <ScreenBackground>
      <StatusBar barStyle={statusBarStyle()} backgroundColor={colors.bg} />
      {renderHeader()}
      <View style={styles.fullState}>
        <Ionicons name="cloud-offline-outline" size={44} color={colors.textMuted} />
        <Text style={styles.fullStateTitle}>Portefeuille indisponible</Text>
        <Text style={styles.fullStateText}>
          Impossible de charger ton solde. Vérifie ta connexion, puis réessaie.
        </Text>
        <Button
          label="Réessayer"
          icon="refresh"
          onPress={() => currencyId && loadWalletData(currencyId)}
          style={styles.fullStateBtn}
        />
      </View>
    </ScreenBackground>
  );

  if (loading) return renderLoading();
  if (walletLoadError && !walletData) return renderWalletError();

  return (
    <ScreenBackground>
      <StatusBar barStyle={statusBarStyle()} backgroundColor={colors.bg} />
      {renderHeader()}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingHorizontal: gutter, maxWidth: columnMax }]}
        refreshControl={
          <AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <Animated.View style={[styles.animated, { opacity: fadeAnim, transform: [{ translateY: riseAnim }] }]}>
          {/* Grand écran : le solde et ses actions restent visibles à gauche
              pendant qu'on parcourt l'historique à droite. Sur mobile la même
              structure retombe naturellement en colonne unique. */}
          <View style={twoColumn ? styles.split : undefined}>
            <View style={twoColumn ? styles.splitLeft : undefined}>
              {renderHero()}
              {renderFlow()}
              {renderMonetization()}
            </View>
            <View style={twoColumn ? styles.splitRight : undefined}>
              {renderHistory()}
            </View>
          </View>
        </Animated.View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <TransactionDetailModal
        visible={showTransactionModal}
        transaction={selectedTransaction}
        onClose={() => {
          setShowTransactionModal(false);
          setSelectedTransaction(null);
        }}
      />

      {walletData && currencyId && (
        <SendCoinsModal
          visible={showSendModal}
          onClose={() => setShowSendModal(false)}
          currencyId={currencyId}
          symbol={walletData.currency?.symbol || 'TWC'}
          balance={walletData.wallet?.balance || 0}
          eurCurrencyId={eurWallet?.currencyId ?? null}
          eurBalance={eurWallet?.balance ?? null}
          price={typeof walletData.currency?.currentPrice === 'number' ? walletData.currency.currentPrice : null}
          onSent={() => { void loadWalletData(currencyId, true); }}
        />
      )}

      {walletData && (
        <ExchangeModal
          visible={showExchangeModal}
          onClose={() => setShowExchangeModal(false)}
          symbol={walletData.currency?.symbol || 'TWC'}
          nfBalance={walletData.wallet?.balance || 0}
          eurBalance={eurWallet?.balance ?? 0}
          price={typeof walletData.currency?.currentPrice === 'number' ? walletData.currency.currentPrice : null}
          onDone={() => { if (currencyId) void loadWalletData(currencyId, true); }}
        />
      )}
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  scroll: {
    paddingTop: 28,
    width: '100%',
    alignSelf: 'center',
  },
  animated: { width: '100%' },

  // Deux colonnes réelles au-delà de 900 pt (tablette paysage, fenêtré large).
  split: { flexDirection: 'row', gap: 40 },
  splitLeft: { flex: 1, minWidth: 0 },
  splitRight: { flex: 1.15, minWidth: 0 },

  // ── Héros ──
  hero: { marginBottom: 36 },
  heroLabel: {
    fontSize: 12,
    fontFamily: fonts.semibold,
    color: colors.textMuted,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  heroAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    marginTop: 10,
  },
  heroAmount: {
    flexShrink: 1,
    fontSize: 56,
    lineHeight: 60,
    fontFamily: fonts.displayHeavy,
    color: colors.textPrimary,
    letterSpacing: -2,
  },
  heroUnit: {
    fontSize: 17,
    fontFamily: fonts.bold,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  heroSecondary: { marginTop: 6 },
  heroEur: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: colors.textSecondary,
  },
  heroEurHint: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.textMuted,
    marginTop: 3,
  },
  modeSwitch: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.round,
    overflow: 'hidden',
  },
  modeChip: { paddingHorizontal: 14, paddingVertical: 8, minHeight: 34, justifyContent: 'center' },
  modeChipActive: { backgroundColor: colors.textPrimary },
  modeChipPressed: { backgroundColor: colors.surfaceHover },
  modeChipText: {
    fontSize: 11.5,
    fontFamily: fonts.semibold,
    color: colors.textSecondary,
    letterSpacing: 0.2,
  },
  modeChipTextActive: { color: colors.bg },
  heroChange: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 18,
  },
  heroChangeText: { fontSize: 13, fontFamily: fonts.bold },
  heroChangePeriod: { fontSize: 12.5, fontFamily: fonts.regular, color: colors.textMuted },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
  },
  actionBtn: { flex: 1 },

  // ── Blocs de section (pas de carte : filet haut + titre) ──
  block: { marginBottom: 36 },
  blockHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingBottom: 12,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  blockTitle: {
    fontSize: 12,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  blockMeta: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.textMuted,
  },

  // ── Flux ──
  flowBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    gap: 2,
  },
  flowSegment: { height: '100%' },
  flowLegend: {
    flexDirection: 'row',
    marginTop: 14,
    gap: 28,
  },
  flowLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  flowDot: { width: 7, height: 7, borderRadius: 4 },
  flowLegendLabel: { fontSize: 12.5, fontFamily: fonts.regular, color: colors.textSecondary },
  flowLegendValue: { fontSize: 13.5, fontFamily: fonts.bold },
  flowEmpty: { fontSize: 13, fontFamily: fonts.regular, color: colors.textMuted },

  // ── Monétisation ──
  monetizationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 36,
    minHeight: 64,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  monetizationIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monetizationText: { flex: 1, minWidth: 0 },
  monetizationTitle: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
  },
  monetizationSubtitle: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.textMuted,
    marginTop: 2,
  },

  // ── Onglets soulignés ──
  tabs: {
    flexDirection: 'row',
    gap: 22,
    marginBottom: 8,
  },
  tab: { paddingTop: 2, minHeight: 40 },
  tabPressed: { opacity: 0.6 },
  tabLabel: {
    fontSize: 13.5,
    fontFamily: fonts.semibold,
    color: colors.textMuted,
    paddingBottom: 8,
  },
  tabLabelActive: { color: colors.textPrimary },
  tabUnderline: { height: 2, borderRadius: 1, backgroundColor: 'transparent' },
  tabUnderlineActive: { backgroundColor: colors.accent },

  // ── Historique ──
  dayGroup: { marginTop: 18 },
  dayLabel: {
    fontSize: 11,
    fontFamily: fonts.semibold,
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 12,
    minHeight: 60,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowPressed: { backgroundColor: colors.surfaceHover },
  txIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txInfo: { flex: 1, minWidth: 0 },
  txDescription: {
    fontSize: 13.5,
    fontFamily: fonts.medium,
    color: colors.textPrimary,
  },
  txMeta: {
    fontSize: 11.5,
    fontFamily: fonts.regular,
    color: colors.textMuted,
    marginTop: 2,
  },
  txRight: { alignItems: 'flex-end' },
  txAmount: { fontSize: 14, fontFamily: fonts.bold, letterSpacing: -0.2 },
  txStatus: { fontSize: 10.5, fontFamily: fonts.semibold, marginTop: 2 },

  // ── États ──
  stateBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 10,
  },
  stateText: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  stateAction: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: colors.accent,
  },
  linkPressed: { opacity: 0.6 },
  fullState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  fullStateTitle: {
    fontSize: 17,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
    marginTop: 16,
    marginBottom: 6,
  },
  fullStateText: {
    fontSize: 13.5,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },
  fullStateBtn: { marginTop: 22, minWidth: 180 },
});

export default WalletDetailScreen;
