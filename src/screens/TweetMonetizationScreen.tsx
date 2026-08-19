/**
 * Monétisation des tweets — gains, éligibilité et statistiques de l'écosystème TWC.
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Modal,
  useWindowDimensions,
  LayoutAnimation,
  Platform,
  UIManager,
  StatusBar,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../contexts/AuthContext';
import TweetMonetizationService from '../services/tweetMonetizationService';
import MonetizationProgramService, { MonetizationProgramEligibility } from '../services/monetizationProgramService';
import NewEconomyService from '../services/newEconomyService';
import CurrencyService from '../services/currencyService';
import { colors, fonts, withAlpha, radius, statusBarStyle } from '../theme';
import { AppHeader, ScreenBackground, GlassCard, GlassButton, SectionLabel, Skeleton, celebrateReward } from '../components/ui';
import { toast } from '../components/ui/Toast';

if (Platform.OS === 'android' && (UIManager as any).setLayoutAnimationEnabledExperimental) {
  (UIManager as any).setLayoutAnimationEnabledExperimental(true);
}

/** Bref, sans rebond — un dépliage répond à un tap, pas à un montage. */
const expandAnim = () =>
  LayoutAnimation.configureNext(
    LayoutAnimation.create(180, LayoutAnimation.Types.easeOut, LayoutAnimation.Properties.opacity)
  );

interface TweetEligibility {
  isEligible: boolean;
  score: number;
  factors: {
    length: number;
    engagement: number;
    user: number;
    quality: number;
    age: number;
  };
  reasons: string[];
}

interface PreviewEarnings {
  totalRewards: number;
  currentBalance: number;
  newBalance: number;
  eligibleTweets: number;
  tweetDetails: Array<{
    tweetId: string;
    reward: number;
    views: number;
    likes: number;
    comments: number;
    retweets: number;
    content: string;
  }>;
  currency: string;
}

interface EligibleTweet {
  id: string;
  content: string;
  createdAt: string;
  likesCount: number;
  retweetsCount: number;
  repliesCount: number;
  eligibility: TweetEligibility;
  reward: number;
  multipliers: any;
  factors: any;
}

interface MonetizationStats {
  currency: {
    symbol: string;
    name: string;
    circulatingSupply: number;
    currentPrice: number;
  };
  wallets: {
    totalUsers: number;
    totalEarned: number;
    totalPurchased: number;
    totalSpent: number;
    totalLoyaltyPoints: number;
  };
  rewards: {
    totalRewards: number;
    totalAmount: number;
    averageAmount: number;
  };
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '0.00');

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

/* ── Petits composants de présentation ─────────────────────────────────── */

function ScoreBar({ score, eligible }: { score: number; eligible: boolean }) {
  const pct = Math.max(0, Math.min(100, Math.round(score)));
  const tint = eligible ? colors.success : pct >= 50 ? colors.warning : colors.textMuted;
  return (
    <View style={styles.scoreRow}>
      <View style={styles.scoreTrack}>
        <View style={[styles.scoreFill, { width: `${pct}%`, backgroundColor: tint }]} />
      </View>
      <Text style={[styles.scoreValue, { color: tint }]}>{pct}%</Text>
    </View>
  );
}

const FACTOR_LABELS: Array<[keyof TweetEligibility['factors'], string]> = [
  ['length', 'Longueur'],
  ['engagement', 'Engagement'],
  ['user', 'Compte'],
  ['quality', 'Qualité'],
  ['age', 'Ancienneté'],
];

function TweetCard({ tweet }: { tweet: EligibleTweet }) {
  const [expanded, setExpanded] = useState(false);
  const toggle = () => {
    expandAnim();
    setExpanded((v) => !v);
  };

  const factors = tweet.eligibility.factors || ({} as TweetEligibility['factors']);
  const factorTotal = FACTOR_LABELS.reduce((sum, [key]) => sum + (factors[key] || 0), 0) || 1;
  const eligible = tweet.eligibility.isEligible;
  const pct = Math.max(0, Math.min(100, Math.round(tweet.eligibility.score)));
  const scoreTint = eligible ? colors.success : pct >= 50 ? colors.warning : colors.textMuted;

  return (
    <GlassCard style={styles.tweetCard}>
      {/* Ligne principale — même grammaire que les lignes de transaction du
          portefeuille : icône d'état, contenu, montant en gros à droite. Le
          gain de CE tweet doit se lire d'un coup d'œil, pas seulement dans
          la modale de collecte. */}
      <View style={styles.tweetMainRow}>
        <View style={[styles.tweetStatusIcon, { backgroundColor: withAlpha(eligible ? colors.success : colors.textMuted, 0.16) }]}>
          <Ionicons name={eligible ? 'checkmark' : 'close'} size={18} color={eligible ? colors.success : colors.textMuted} />
        </View>

        <View style={styles.tweetBody}>
          <Text style={styles.tweetContent} numberOfLines={2}>
            {tweet.content}
          </Text>
          <View style={styles.tweetMetaRow}>
            <Text style={styles.tweetMetaText}>{formatDate(tweet.createdAt)}</Text>
            <View style={styles.tweetMetaDot} />
            <Ionicons name="heart-outline" size={12} color={colors.textMuted} />
            <Text style={styles.tweetMetaText}>{tweet.likesCount}</Text>
            <Ionicons name="repeat-outline" size={12} color={colors.textMuted} style={{ marginLeft: 8 }} />
            <Text style={styles.tweetMetaText}>{tweet.retweetsCount}</Text>
            <Ionicons name="chatbubble-outline" size={12} color={colors.textMuted} style={{ marginLeft: 8 }} />
            <Text style={styles.tweetMetaText}>{tweet.repliesCount}</Text>
          </View>
        </View>

        <View style={styles.tweetRewardBlock}>
          {eligible ? (
            <Text style={styles.tweetRewardValue} numberOfLines={1}>
              +{tweet.reward.toFixed(2)}
              <Text style={styles.tweetRewardCurrency}> TWC</Text>
            </Text>
          ) : (
            <Text style={styles.tweetRewardMuted}>—</Text>
          )}
        </View>
      </View>

      <TouchableOpacity
        style={styles.scoreToggleRow}
        onPress={toggle}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.scoreToggleText}>
          Score d'éligibilité <Text style={{ color: scoreTint, fontFamily: fonts.bold }}>{pct}%</Text>
        </Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.detailsPanel}>
          <ScoreBar score={tweet.eligibility.score} eligible={eligible} />

          {FACTOR_LABELS.map(([key, label]) => (
            <View key={key} style={styles.factorRow}>
              <Text style={styles.factorLabel}>{label}</Text>
              <View style={styles.factorTrack}>
                <View
                  style={[
                    styles.factorFill,
                    { width: `${Math.max(4, ((factors[key] || 0) / factorTotal) * 100)}%` },
                  ]}
                />
              </View>
            </View>
          ))}

          {tweet.eligibility.reasons?.length > 0 && (
            <View style={styles.reasonsList}>
              {tweet.eligibility.reasons.map((reason, index) => (
                <Text key={`${tweet.id}-reason-${index}`} style={styles.reasonText}>
                  •  {reason}
                </Text>
              ))}
            </View>
          )}
        </View>
      )}
    </GlassCard>
  );
}

function EmptyState({
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <GlassCard style={styles.emptyCard} contentStyle={styles.emptyCardContent}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name={icon} size={30} color={colors.textSecondary} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySubtitle}>{subtitle}</Text>
      {actionLabel && onAction && (
        <GlassButton label={actionLabel} onPress={onAction} variant="secondary" style={{ marginTop: 18 }} />
      )}
    </GlassCard>
  );
}

function StatTile({
  icon,
  label,
  value,
  tint,
  wide,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  tint: string;
  wide?: boolean;
}) {
  return (
    <GlassCard style={[styles.statTile, wide && styles.statTileWide]}>
      <View style={[styles.statIcon, { backgroundColor: withAlpha(tint, 0.16) }]}>
        <Ionicons name={icon} size={17} color={tint} />
      </View>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </GlassCard>
  );
}

/* ── Écran principal ────────────────────────────────────────────────────── */

const TweetMonetizationScreen = ({ navigation }: any) => {
  const { user, isAuthenticated } = useAuth();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [eligibleTweets, setEligibleTweets] = useState<EligibleTweet[]>([]);
  const [stats, setStats] = useState<MonetizationStats | null>(null);
  const [selectedTab, setSelectedTab] = useState<'tweets' | 'stats'>('tweets');
  const [error, setError] = useState<string | null>(null);
  const [showEarningsModal, setShowEarningsModal] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewEarnings | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [programEligibility, setProgramEligibility] = useState<MonetizationProgramEligibility | null>(null);

  useEffect(() => {
    if (isAuthenticated && user) {
      loadData();
    } else {
      setLoading(false);
      setError('Vous devez être connecté pour accéder à la monétisation des tweets.');
    }
  }, [isAuthenticated, user]);

  const getDemoData = (): EligibleTweet[] => [
    {
      id: 'demo-tweet-1',
      content: 'Ceci est un tweet de démonstration avec #hashtag et @mention pour tester la monétisation !',
      createdAt: new Date().toISOString(),
      likesCount: 25,
      retweetsCount: 10,
      repliesCount: 5,
      eligibility: {
        isEligible: true,
        score: 85,
        factors: { length: 20, engagement: 30, user: 25, quality: 10, age: 15 },
        reasons: [
          'Tweet suffisamment long',
          'Engagement suffisant',
          'Utilisateur avec de nombreux followers',
          'Contenu de qualité avec hashtags/mentions',
          'Tweet récent (moins de 7 jours)',
          'Tweet éligible à la monétisation',
        ],
      },
      reward: 2.5,
      multipliers: { engagement: 1.5, user: 2.0, followers: 1.2, quality: 1.1, economy: 1.0 },
      factors: { likes: 25, retweets: 10, replies: 5, hashtags: 2, isVerified: true, followersCount: 5000 },
    },
    {
      id: 'demo-tweet-2',
      content: 'Un autre tweet de test pour la monétisation #TwitNin #Test',
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      likesCount: 8,
      retweetsCount: 3,
      repliesCount: 2,
      eligibility: {
        isEligible: false,
        score: 45,
        factors: { length: 15, engagement: 15, user: 10, quality: 5, age: 15 },
        reasons: [
          'Tweet trop court (minimum 50 caractères)',
          'Engagement insuffisant (minimum 10 interactions)',
          'Utilisateur avec peu de followers',
          'Contenu de qualité avec hashtags/mentions',
          'Tweet récent (moins de 7 jours)',
          'Tweet non éligible (score insuffisant)',
        ],
      },
      reward: 0,
      multipliers: { engagement: 0.5, user: 1.0, followers: 0.8, quality: 1.0, economy: 1.0 },
      factors: { likes: 8, retweets: 3, replies: 2, hashtags: 2, isVerified: false, followersCount: 500 },
    },
  ];

  const getDemoStats = (): MonetizationStats => ({
    currency: { symbol: 'TWC', name: 'TwitCoins', circulatingSupply: 0, currentPrice: 0.01 },
    wallets: { totalUsers: 0, totalEarned: 0, totalPurchased: 0, totalSpent: 0, totalLoyaltyPoints: 0 },
    rewards: { totalRewards: 0, totalAmount: 0, averageAmount: 0 },
  });

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!isAuthenticated || !user) {
        throw new Error('Utilisateur non authentifié. Veuillez vous reconnecter.');
      }

      try {
        const tweetsData = await TweetMonetizationService.getUserEligibleTweets(user.id);
        setEligibleTweets(tweetsData.tweets || []);

        try {
          setProgramEligibility(await MonetizationProgramService.getStatus());
        } catch {
          setProgramEligibility(null);
        }

        const statsData = await TweetMonetizationService.getMonetizationStats();

        // Le cours affiché doit rester identique à celui de NewEconomyScreen/WalletDetail —
        // même monnaie, même source, pour ne jamais montrer deux prix différents.
        try {
          // L'ID était codé en dur sur l'ancien identifiant de TwitCoins, qui
          // n'existe plus en base (la monnaie a été recréée) — 500 systématique.
          // `CurrencyService` résout le bon ID par symbole (NF), avec l'ancien
          // comme secours seulement si cet appel échoue à son tour.
          const currencyId = await CurrencyService.getTwitCoinsCurrencyId();
          const walletData = await NewEconomyService.getUserWallet(currencyId);
          setStats({ ...statsData, currency: { ...statsData.currency, currentPrice: walletData.currency.currentPrice } });
        } catch {
          setStats(statsData);
        }
      } catch (serviceError: any) {
        setEligibleTweets(getDemoData());
        setStats(getDemoStats());
        setError(`Service indisponible, données de démonstration affichées : ${serviceError?.message || ''}`);
      }
    } catch (criticalError: any) {
      setError(`Erreur de chargement : ${criticalError?.message || ''}`);
      setEligibleTweets(getDemoData());
      setStats(getDemoStats());
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    setError(null);
    await loadData();
    setRefreshing(false);
  };

  const previewEarnings = async () => {
    if (!isAuthenticated || !user) {
      toast.error('Vous devez être connecté pour voir vos gains.');
      return;
    }
    setPreviewLoading(true);
    try {
      const result = await TweetMonetizationService.previewEarnings();
      setPreviewData(result);
      setShowEarningsModal(true);
    } catch (previewError) {
      toast.error('Impossible de prévisualiser tes gains pour le moment.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const processAllTweets = async () => {
    try {
      setProcessing(true);
      const result = await TweetMonetizationService.processEligibleTweets();
      setShowEarningsModal(false);
      setPreviewData(null);
      loadData();
      // Encaisser ses tweets est le seul moment de l'écran où l'on gagne
      // vraiment quelque chose : il se voit, au lieu de se lire dans un coin.
      celebrateReward({
        amount: result.totalRewards,
        label: `${result.eligibleCount} tweet${result.eligibleCount > 1 ? 's' : ''} encaissé${result.eligibleCount > 1 ? 's' : ''}`,
      });
    } catch (processError) {
      toast.error('Impossible de traiter tes tweets pour le moment.');
    } finally {
      setProcessing(false);
    }
  };

  const goToCreateTweet = () => {
    navigation?.navigate?.('CreateTweet');
  };

  if (loading) {
    return (
      <ScreenBackground>
        <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
        <AppHeader navigation={navigation} title="Monétisation" subtitle="Gagne des TWC avec tes tweets" />
        <View style={styles.content}>
          <Skeleton width="100%" height={148} rounded={16} style={{ marginBottom: 20 }} />
          <View style={styles.tabRow}>
            <Skeleton width="100%" height={42} rounded={12} />
            <Skeleton width="100%" height={42} rounded={12} />
          </View>
          <Skeleton width="100%" height={120} rounded={16} style={{ marginBottom: 12 }} />
          <Skeleton width="100%" height={120} rounded={16} />
        </View>
      </ScreenBackground>
    );
  }

  // Cet écran est à la fois un onglet de la navbar ET un écran poussé depuis
  // Réglages/Portefeuille (voir BottomTabNavigator + MainNavigator). Sur un
  // onglet, `canGoBack()` peut renvoyer vrai à cause de l'historique d'un
  // navigateur PARENT (le Stack racine) — ce n'est pas ce qu'on veut savoir.
  // Seul le type du navigateur qui possède CET écran fait foi : jamais de
  // flèche retour quand on est affiché comme onglet.
  const notAuthenticated = !isAuthenticated || !user;
  const eligibleCount = eligibleTweets.filter((t) => t.eligibility.isEligible).length;
  const contentMaxWidth = isWide ? { maxWidth: 640, alignSelf: 'center' as const, width: '100%' as const } : null;

  return (
    <ScreenBackground>
      <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
      <AppHeader
        navigation={navigation}
        title="Monétisation"
        subtitle="Gagne des TWC avec tes tweets"
      />

      {notAuthenticated ? (
        <View style={[styles.content, contentMaxWidth]}>
          <EmptyState
            icon="lock-closed-outline"
            title="Connexion requise"
            subtitle="Connecte-toi pour suivre l'éligibilité de tes tweets et collecter tes gains en TWC."
          />
        </View>
      ) : programEligibility && programEligibility.programStatus !== 'approved' ? (
        <View style={[styles.content, contentMaxWidth]}>
          <EmptyState
            icon={programEligibility.programStatus === 'pending' ? 'time-outline' : 'trophy-outline'}
            title={
              programEligibility.programStatus === 'pending'
                ? 'Candidature en cours de revue'
                : 'Rejoins le programme de monétisation'
            }
            subtitle={
              programEligibility.programStatus === 'pending'
                ? 'On vérifie ton compte manuellement — reviens un peu plus tard.'
                : 'Avant de toucher des TWC sur tes tweets, ton compte doit être accepté dans le programme de monétisation.'
            }
            actionLabel={programEligibility.programStatus === 'pending' ? undefined : 'Voir les conditions'}
            onAction={
              programEligibility.programStatus === 'pending'
                ? undefined
                : () => navigation?.navigate?.('MonetizationProgram')
            }
          />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, contentMaxWidth]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}
        >
          {error && (
            <View style={styles.errorBanner}>
              <Ionicons name="warning-outline" size={18} color={colors.warning} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Carte héro — pas de chiffre inventé : le solde réel n'est connu qu'après aperçu. */}
          <GlassCard style={styles.heroCard} highlight contentStyle={styles.heroCardContent}>
            <View style={styles.heroIcon}>
              <Ionicons name="cash-outline" size={24} color={colors.accent} />
            </View>
            <Text style={styles.heroTitle}>Récupère tes gains</Text>
            <Text style={styles.heroSubtitle}>
              {eligibleCount > 0
                ? `${eligibleCount} tweet${eligibleCount > 1 ? 's' : ''} éligible${eligibleCount > 1 ? 's' : ''} en attente de collecte.`
                : 'Vérifie tes tweets éligibles et récupère ce qui t\'est dû, quand tu veux.'}
            </Text>
            <GlassButton
              label="Voir mes gains disponibles"
              icon="wallet-outline"
              onPress={previewEarnings}
              loading={previewLoading}
              fullWidth
              style={{ marginTop: 16 }}
            />
          </GlassCard>

          {/* Segmented control */}
          <View style={styles.tabRow}>
            {([
              { key: 'tweets', label: 'Mes tweets', icon: 'documents-outline' },
              { key: 'stats', label: 'Statistiques', icon: 'stats-chart-outline' },
            ] as const).map((tab) => {
              const active = selectedTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.tabChip, active && styles.tabChipActive]}
                  onPress={() => setSelectedTab(tab.key)}
                  activeOpacity={0.8}
                >
                  <Ionicons name={tab.icon} size={16} color={active ? colors.accent : colors.textSecondary} />
                  <Text style={[styles.tabChipText, active && styles.tabChipTextActive]}>{tab.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {selectedTab === 'tweets' ? (
            <View>
              <View style={styles.sectionHeaderRow}>
                <SectionLabel style={{ marginBottom: 0 }}>Tweets éligibles ({eligibleTweets.length})</SectionLabel>
              </View>

              {eligibleTweets.length === 0 ? (
                <EmptyState
                  icon="chatbubble-ellipses-outline"
                  title="Aucun tweet à évaluer"
                  subtitle="Publie du contenu engageant pour commencer à gagner des TWC."
                  actionLabel="Créer un tweet"
                  onAction={goToCreateTweet}
                />
              ) : (
                eligibleTweets.map((tweet) => <TweetCard key={tweet.id} tweet={tweet} />)
              )}
            </View>
          ) : (
            <View>
              <SectionLabel>Écosystème TWC</SectionLabel>
              <Text style={styles.statsHint}>Chiffres de toute la communauté TwitNinf, pas seulement ton compte.</Text>
              <View style={styles.statsGrid}>
                <StatTile icon="people-outline" label="Créateurs rémunérés" value={String(stats?.wallets.totalUsers ?? 0)} tint={colors.accent} />
                <StatTile icon="cash-outline" label="TWC distribués" value={fmt(stats?.wallets.totalEarned ?? 0)} tint={colors.success} />
                <StatTile icon="trophy-outline" label="Récompenses versées" value={String(stats?.rewards.totalRewards ?? 0)} tint={colors.gold} />
                <StatTile icon="trending-up-outline" label="Récompense moyenne" value={`${fmt(stats?.rewards.averageAmount ?? 0)} TWC`} tint={colors.cyan} />
              </View>

              <SectionLabel style={{ marginTop: 8 }}>Cours du token</SectionLabel>
              <GlassCard style={styles.priceCard}>
                <View style={styles.priceRow}>
                  <View>
                    <Text style={styles.priceLabel}>Prix actuel</Text>
                    <Text style={styles.priceValue}>${(stats?.currency.currentPrice ?? 0).toFixed(4)}</Text>
                  </View>
                  <View style={styles.priceDivider} />
                  <View>
                    <Text style={styles.priceLabel}>Supply en circulation</Text>
                    <Text style={styles.priceValue}>{(stats?.currency.circulatingSupply ?? 0).toLocaleString('fr-FR')}</Text>
                  </View>
                </View>
              </GlassCard>
            </View>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      )}

      {/* Bottom sheet de collecte */}
      <Modal visible={showEarningsModal} animationType="slide" transparent onRequestClose={() => setShowEarningsModal(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setShowEarningsModal(false)} activeOpacity={1} />

          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />

            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Tes gains</Text>
                <Text style={styles.modalSubtitle}>Prêts à être collectés</Text>
              </View>
              <TouchableOpacity onPress={() => setShowEarningsModal(false)} style={styles.modalClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {previewData && (
              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                <View style={styles.balanceRow}>
                  <View style={styles.balanceBlock}>
                    <Text style={styles.balanceLabel}>Solde actuel</Text>
                    <Text style={styles.balanceValue}>{fmt(previewData.currentBalance)} TWC</Text>
                  </View>
                  <View style={styles.balanceBlock}>
                    <Text style={styles.balanceLabel}>Gains disponibles</Text>
                    <Text style={[styles.balanceValue, { color: colors.success }]}>+{fmt(previewData.totalRewards)} TWC</Text>
                  </View>
                  <View style={styles.balanceBlock}>
                    <Text style={styles.balanceLabel}>Nouveau solde</Text>
                    <Text style={styles.balanceValue}>{fmt(previewData.newBalance)} TWC</Text>
                  </View>
                </View>

                <SectionLabel style={{ marginTop: 20 }}>Détail ({previewData.eligibleTweets} tweets)</SectionLabel>
                {previewData.tweetDetails.map((tweet) => (
                  <GlassCard key={tweet.tweetId} style={styles.previewTweetCard}>
                    <Text style={styles.previewTweetContent} numberOfLines={2}>
                      {tweet.content}
                    </Text>
                    <View style={styles.previewMetricsRow}>
                      <View style={styles.previewMetric}>
                        <Ionicons name="eye-outline" size={13} color={colors.textSecondary} />
                        <Text style={styles.previewMetricText}>{tweet.views}</Text>
                      </View>
                      <View style={styles.previewMetric}>
                        <Ionicons name="heart-outline" size={13} color={colors.textSecondary} />
                        <Text style={styles.previewMetricText}>{tweet.likes}</Text>
                      </View>
                      <View style={styles.previewMetric}>
                        <Ionicons name="chatbubble-outline" size={13} color={colors.textSecondary} />
                        <Text style={styles.previewMetricText}>{tweet.comments}</Text>
                      </View>
                      <View style={styles.previewMetric}>
                        <Ionicons name="repeat-outline" size={13} color={colors.textSecondary} />
                        <Text style={styles.previewMetricText}>{tweet.retweets}</Text>
                      </View>
                      <View style={styles.previewReward}>
                        <Text style={styles.previewRewardText}>+{tweet.reward} TWC</Text>
                      </View>
                    </View>
                  </GlassCard>
                ))}
              </ScrollView>
            )}

            <View style={styles.modalFooter}>
              {previewData && previewData.totalRewards > 0 ? (
                <GlassButton
                  label={`Récupérer ${fmt(previewData.totalRewards)} TWC`}
                  icon="download-outline"
                  onPress={processAllTweets}
                  loading={processing}
                  fullWidth
                />
              ) : (
                <View style={styles.noEarnings}>
                  <Ionicons name="information-circle-outline" size={20} color={colors.textSecondary} />
                  <Text style={styles.noEarningsText}>Aucun gain disponible pour l'instant — reviens après ta prochaine publication.</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 8 },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: withAlpha(colors.warning, 0.12),
    borderWidth: 1,
    borderColor: withAlpha(colors.warning, 0.35),
    borderRadius: radius.lg,
    padding: 12,
    marginBottom: 16,
  },
  errorText: { flex: 1, fontSize: 12.5, color: colors.textPrimary, lineHeight: 17 },

  heroCard: { marginBottom: 20 },
  heroCardContent: { alignItems: 'flex-start' },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heroTitle: { fontSize: 19, fontFamily: fonts.display, color: colors.textPrimary, marginBottom: 4 },
  heroSubtitle: { fontSize: 13.5, color: colors.textSecondary, lineHeight: 19 },

  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  tabChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabChipActive: { borderColor: colors.accent, backgroundColor: colors.accentMuted },
  tabChipText: { fontSize: 13, fontFamily: fonts.semibold, color: colors.textSecondary },
  tabChipTextActive: { color: colors.accent },

  sectionHeaderRow: { marginBottom: 12 },
  statsHint: { fontSize: 12, color: colors.textMuted, marginTop: -6, marginBottom: 12 },

  emptyCard: { marginBottom: 8 },
  emptyCardContent: { alignItems: 'center', paddingVertical: 30 },
  emptyIconWrap: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 16, fontFamily: fonts.semibold, color: colors.textPrimary, marginBottom: 6, textAlign: 'center' },
  emptySubtitle: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 18, paddingHorizontal: 12 },

  tweetCard: { marginBottom: 12 },

  tweetMainRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  tweetStatusIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  tweetBody: { flex: 1 },
  tweetContent: { fontSize: 14.5, color: colors.textPrimary, lineHeight: 20, marginBottom: 6 },
  tweetMetaRow: { flexDirection: 'row', alignItems: 'center' },
  tweetMetaText: { fontSize: 11.5, color: colors.textMuted, fontFamily: fonts.medium, marginLeft: 4 },
  tweetMetaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.textMuted, marginHorizontal: 8 },

  tweetRewardBlock: { alignItems: 'flex-end', minWidth: 64 },
  tweetRewardValue: { fontSize: 15, fontFamily: fonts.bold, color: colors.success },
  tweetRewardCurrency: { fontSize: 11, fontFamily: fonts.semibold, color: colors.success, opacity: 0.75 },
  tweetRewardMuted: { fontSize: 15, fontFamily: fonts.medium, color: colors.textMuted },

  scoreToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  scoreToggleText: { fontSize: 12.5, color: colors.textSecondary, fontFamily: fonts.medium },

  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  scoreTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.surfaceElevated, overflow: 'hidden' },
  scoreFill: { height: '100%', borderRadius: 3 },
  scoreValue: { fontSize: 12, fontFamily: fonts.bold, width: 36, textAlign: 'right' },

  detailsPanel: { marginTop: 14 },
  factorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  factorLabel: { fontSize: 11.5, color: colors.textMuted, width: 78 },
  factorTrack: { flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.surfaceElevated, overflow: 'hidden' },
  factorFill: { height: '100%', borderRadius: 3, backgroundColor: colors.cyan },
  reasonsList: { marginTop: 6, gap: 4 },
  reasonText: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  statTile: { width: '48%', alignItems: 'flex-start' },
  statTileWide: { width: '23.5%' },
  statIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  statValue: { fontSize: 18, fontFamily: fonts.bold, color: colors.textPrimary },
  statLabel: { fontSize: 11.5, color: colors.textMuted, marginTop: 2 },

  priceCard: {},
  priceRow: { flexDirection: 'row', alignItems: 'center' },
  priceDivider: { width: StyleSheet.hairlineWidth, height: 36, backgroundColor: colors.border, marginHorizontal: 24 },
  priceLabel: { fontSize: 11.5, color: colors.textMuted, marginBottom: 4 },
  priceValue: { fontSize: 17, fontFamily: fonts.bold, color: colors.textPrimary },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  modalBackdrop: { ...StyleSheet.absoluteFillObject },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    minHeight: '45%',
    paddingBottom: 24,
  },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: 'center', marginTop: 10, marginBottom: 6 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modalTitle: { fontSize: 18, fontFamily: fonts.bold, color: colors.textPrimary },
  modalSubtitle: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  modalClose: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  modalBody: { paddingHorizontal: 20 },

  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 },
  balanceBlock: { flex: 1 },
  balanceLabel: { fontSize: 11, color: colors.textMuted, marginBottom: 4 },
  balanceValue: { fontSize: 15, fontFamily: fonts.bold, color: colors.textPrimary },

  previewTweetCard: { marginTop: 10, padding: 14 },
  previewTweetContent: { fontSize: 13.5, color: colors.textPrimary, lineHeight: 18, marginBottom: 10 },
  previewMetricsRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  previewMetric: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  previewMetricText: { fontSize: 11.5, color: colors.textSecondary },
  previewReward: { marginLeft: 'auto', backgroundColor: colors.successMuted, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  previewRewardText: { fontSize: 11.5, fontFamily: fonts.bold, color: colors.success },

  modalFooter: { paddingHorizontal: 20, paddingTop: 16 },
  noEarnings: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surfaceElevated, borderRadius: radius.lg, padding: 14 },
  noEarningsText: { flex: 1, fontSize: 12.5, color: colors.textSecondary, lineHeight: 17 },
});

export default TweetMonetizationScreen;
