import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { userStatsService } from '../services/userStatsService';
import { formatCompactCount } from '../utils/format';
import { colors, fonts, withAlpha } from '../theme';

const CHART_PRIMARY = colors.accent;
const CHART_SECONDARY = colors.cyan;
/**
 * Teintes catégorielles (4 premières de l'ordre par défaut du skill dataviz),
 * validées adjacentes-sûres sur fond sombre. Les couleurs de marque restent
 * réservées aux séries UNIQUES.
 */
const CHART_BREAKDOWN_COLORS = {
  likes: '#3987E5',
  retweets: '#E06A32',
  comments: '#25A878',
  shares: '#D69A21',
} as const;

interface UserStats {
  totalTweets: number;
  totalViews: number;
  followerCount: number;
  followingCount: number;
  engagementRate: number;
  mostActiveHours: number[];
  activityData: {
    hour: number;
    tweet_count: number;
    engagement_count: number;
    activity_score: number;
  }[];
  dailyStats: {
    date: string;
    tweets: number;
    views: number;
    likes: number;
    retweets: number;
    comments: number;
    followers_gained?: number;
  }[];
  engagementBreakdown: {
    likes: number;
    retweets: number;
    comments: number;
    shares: number;
    total: number;
  };
  topTweets: {
    id: string;
    content: string;
    views: number;
    likes: number;
    retweets: number;
    comments: number;
    engagement_rate: number;
  }[];
}

interface UserStatsTabProps {
  userId: string;
  embedded?: boolean;
  baseStats?: {
    followers?: number;
    following?: number;
    tweets?: number;
  };
}

type Timeframe = '7d' | '30d' | '90d' | '1y';
type Section = 'overview' | 'content' | 'audience';
type MetricKey = 'views' | 'followers' | 'interactions' | 'tweets';

type Trend = { pct: number; positive: boolean } | null;

const sanitizeNumber = (value: unknown): number => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

function computeTrend(
  daily: UserStats['dailyStats'],
  selector: (day: UserStats['dailyStats'][number]) => number,
): Trend {
  if (daily.length < 4) return null;
  const sorted = [...daily].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const midpoint = Math.floor(sorted.length / 2);
  const sum = (items: typeof sorted) => items.reduce((total, day) => total + sanitizeNumber(selector(day)), 0);
  const before = sum(sorted.slice(0, midpoint));
  const after = sum(sorted.slice(midpoint));

  if (before === 0 && after === 0) return null;
  if (before === 0) return { pct: 100, positive: true };

  const percentage = ((after - before) / before) * 100;
  return { pct: Math.round(Math.abs(percentage)), positive: percentage >= 0 };
}

/**
 * Un point par jour tant que la période reste lisible (comme le graphe
 * Instagram, qui trace chaque jour du mois) ; au-delà, regroupement pour
 * éviter une courbe illisible.
 */
function buildSeries(
  sortedDaily: UserStats['dailyStats'],
  selector: (day: UserStats['dailyStats'][number]) => number,
): { labels: string[]; values: number[] } {
  const maxPoints = 31;
  const bucketSize = Math.max(1, Math.ceil(sortedDaily.length / maxPoints));
  const labels: string[] = [];
  const values: number[] = [];

  for (let index = 0; index < sortedDaily.length; index += bucketSize) {
    const bucket = sortedDaily.slice(index, index + bucketSize);
    const lastDate = bucket[bucket.length - 1]?.date;
    values.push(bucket.reduce((total, day) => total + sanitizeNumber(selector(day)), 0));
    labels.push(
      lastDate
        ? new Date(lastDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
        : `P${labels.length + 1}`,
    );
  }

  return { labels, values };
}

function useSkeletonPulse() {
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.78,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.35,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return opacity;
}

function SkeletonBlock({ style }: { style?: any }) {
  const opacity = useSkeletonPulse();
  return <Animated.View style={[styles.skeletonBlock, style, { opacity }]} />;
}

function StatsSkeleton({ gutter }: { gutter: number }) {
  return (
    <View
      style={[styles.pageInner, { paddingHorizontal: gutter }]}
      accessibilityLabel="Chargement des statistiques"
    >
      <SkeletonBlock style={styles.skeletonTabs} />
      <View style={styles.skeletonCardRow}>
        {[0, 1, 2].map((item) => (
          <SkeletonBlock key={item} style={styles.skeletonCard} />
        ))}
      </View>
      <SkeletonBlock style={styles.skeletonChart} />
      <SkeletonBlock style={styles.skeletonBars} />
    </View>
  );
}

const timeframeOptions: { key: Timeframe; longLabel: string; shortLabel: string }[] = [
  { key: '7d', longLabel: '7 jours', shortLabel: '7 J' },
  { key: '30d', longLabel: '30 jours', shortLabel: '30 J' },
  { key: '90d', longLabel: '3 mois', shortLabel: '3 M' },
  { key: '1y', longLabel: '1 an', shortLabel: '1 AN' },
];

const sections: { key: Section; label: string }[] = [
  { key: 'overview', label: 'Aperçu' },
  { key: 'content', label: 'Contenu' },
  { key: 'audience', label: 'Audience' },
];

/**
 * Courbe pleine largeur façon « Statistiques » d'Instagram : trait épais,
 * angles nets (pas de bézier), deux lignes de repère seulement, et au
 * toucher un trait pointillé + une bulle qui annonce la valeur du point.
 */
function InsightChart({
  labels,
  values,
  color,
  width,
  height,
  selectedIndex,
  onSelect,
}: {
  labels: string[];
  values: number[];
  color: string;
  width: number;
  height: number;
  selectedIndex: number | null;
  onSelect: (index: number | null) => void;
}) {
  const padLeft = 34;
  const padRight = 12;
  const padTop = 34;
  const padBottom = 26;
  const innerWidth = Math.max(1, width - padLeft - padRight);
  const innerHeight = Math.max(1, height - padTop - padBottom);

  const maximum = Math.max(1, ...values);
  const step = values.length > 1 ? innerWidth / (values.length - 1) : 0;
  const pointX = (index: number) => padLeft + index * step;
  const pointY = (value: number) => padTop + (1 - value / maximum) * innerHeight;

  const path = values
    .map((value, index) => `${index === 0 ? 'M' : 'L'}${pointX(index)} ${pointY(value)}`)
    .join(' ');

  const gridValues = [0, Math.round(maximum / 2), maximum];
  const labelIndexes = Array.from(
    new Set([0, Math.floor((values.length - 1) / 2), values.length - 1].filter((index) => index >= 0)),
  );

  const selected =
    selectedIndex !== null && selectedIndex >= 0 && selectedIndex < values.length ? selectedIndex : null;

  const handleTouch = (locationX: number) => {
    if (values.length === 0) return;
    if (values.length === 1) {
      onSelect(0);
      return;
    }
    const ratio = (locationX - padLeft) / innerWidth;
    const index = Math.round(ratio * (values.length - 1));
    onSelect(Math.min(values.length - 1, Math.max(0, index)));
  };

  const bubbleWidth = 92;
  const bubbleLeft = selected !== null
    ? Math.min(Math.max(pointX(selected) - bubbleWidth / 2, 0), Math.max(0, width - bubbleWidth))
    : 0;

  return (
    <View
      style={{ width, height }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(event) => handleTouch(event.nativeEvent.locationX)}
      onResponderMove={(event) => handleTouch(event.nativeEvent.locationX)}
      accessibilityRole="image"
      accessibilityLabel={`Courbe de ${values.length} points, maximum ${maximum}`}
    >
      <Svg width={width} height={height}>
        {gridValues.map((value, index) => (
          <React.Fragment key={`grid-${index}`}>
            <Line
              x1={padLeft}
              x2={width - padRight}
              y1={pointY(value)}
              y2={pointY(value)}
              stroke={colors.border}
              strokeWidth={1}
            />
            <SvgText
              x={padLeft - 8}
              y={pointY(value) + 4}
              fill={colors.textMuted}
              fontSize={11}
              textAnchor="end"
            >
              {formatCompactCount(value)}
            </SvgText>
          </React.Fragment>
        ))}

        {selected !== null && (
          <Line
            x1={pointX(selected)}
            x2={pointX(selected)}
            y1={padTop - 12}
            y2={height - padBottom}
            stroke={colors.borderStrong}
            strokeWidth={1}
            strokeDasharray="4 5"
          />
        )}

        <Path
          d={path}
          stroke={color}
          strokeWidth={4}
          strokeLinejoin="round"
          strokeLinecap="round"
          fill="none"
        />

        {selected !== null && (
          <Circle
            cx={pointX(selected)}
            cy={pointY(values[selected])}
            r={5}
            fill={colors.bg}
            stroke={color}
            strokeWidth={3}
          />
        )}

        {labelIndexes.map((index) => (
          <SvgText
            key={`label-${index}`}
            x={pointX(index)}
            y={height - 6}
            fill={colors.textMuted}
            fontSize={11}
            textAnchor={index === 0 ? 'start' : index === values.length - 1 ? 'end' : 'middle'}
          >
            {labels[index]}
          </SvgText>
        ))}
      </Svg>

      {selected !== null && (
        <View style={[styles.bubble, { left: bubbleLeft, width: bubbleWidth }]} pointerEvents="none">
          <Text style={styles.bubbleValue}>{formatCompactCount(values[selected])}</Text>
          <Text style={styles.bubbleLabel}>{labels[selected]}</Text>
        </View>
      )}
    </View>
  );
}

const UserStatsTab: React.FC<UserStatsTabProps> = ({ userId, embedded = false, baseStats }) => {
  const { width: viewportWidth } = useWindowDimensions();
  const compact = viewportWidth < 390;
  const tablet = viewportWidth >= 700;
  const pageGutter = compact ? 16 : tablet ? 28 : 20;
  const constrainedWidth = Math.min(viewportWidth, 900);
  const usableWidth = Math.max(280, constrainedWidth - pageGutter * 2);
  const chartWidth = usableWidth;
  const chartHeight = tablet ? 280 : 232;

  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>('30d');
  const [selectedSection, setSelectedSection] = useState<Section>('overview');
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('views');
  const [inspectedIndex, setInspectedIndex] = useState<number | null>(null);
  const requestSequence = useRef(0);

  const loadUserStats = useCallback(
    async (refresh = false) => {
      if (!userId) {
        setLoading(false);
        setRefreshing(false);
        setStats(null);
        setLoadError('Aucun utilisateur connecté.');
        return;
      }

      const requestId = ++requestSequence.current;
      if (refresh) setRefreshing(true);
      setLoading(true);
      setLoadError(null);

      try {
        const statsResponse = await userStatsService.getUserStats(userId, selectedTimeframe);
        if (requestId !== requestSequence.current) return;

        const activityData = statsResponse.activityData || [];
        const adaptedStats: UserStats = {
          totalTweets: sanitizeNumber(statsResponse.analytics.totalTweets),
          totalViews: sanitizeNumber(statsResponse.analytics.totalViews),
          followerCount: sanitizeNumber(statsResponse.analytics.followerCount),
          followingCount: sanitizeNumber(statsResponse.analytics.followingCount),
          engagementRate: sanitizeNumber(statsResponse.analytics.engagementRate),
          activityData,
          mostActiveHours: [...activityData]
            .sort((a, b) => sanitizeNumber(b.activity_score) - sanitizeNumber(a.activity_score))
            .slice(0, 5)
            .map((item) => item.hour),
          dailyStats: statsResponse.dailyStats || [],
          engagementBreakdown: statsResponse.engagementBreakdown || {
            likes: 0,
            retweets: 0,
            comments: 0,
            shares: 0,
            total: 0,
          },
          topTweets: (statsResponse.topTweets || []).map((tweet) => ({
            id: tweet.id,
            content: tweet.content,
            views: sanitizeNumber(tweet.views),
            likes: sanitizeNumber(tweet.likes),
            retweets: sanitizeNumber(tweet.retweets),
            comments: sanitizeNumber(tweet.comments),
            engagement_rate: sanitizeNumber(tweet.engagement_rate),
          })),
        };

        setStats(adaptedStats);
      } catch (error) {
        if (requestId !== requestSequence.current) return;
        console.error('Erreur lors du chargement des statistiques:', error);
        setLoadError('Impossible de charger les statistiques pour le moment.');
        setStats(null);
      } finally {
        if (requestId === requestSequence.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [selectedTimeframe, userId],
  );

  useEffect(() => {
    loadUserStats();
  }, [loadUserStats]);

  useEffect(() => {
    setInspectedIndex(null);
  }, [selectedMetric, selectedTimeframe, selectedSection]);

  const sortedDaily = useMemo(
    () =>
      stats
        ? [...stats.dailyStats].sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
          )
        : [],
    [stats],
  );
  const hasDaily = sortedDaily.length > 0;

  const followerCount =
    sanitizeNumber(stats?.followerCount) > 0
      ? sanitizeNumber(stats?.followerCount)
      : sanitizeNumber(baseStats?.followers);
  const followingCount =
    sanitizeNumber(stats?.followingCount) > 0
      ? sanitizeNumber(stats?.followingCount)
      : sanitizeNumber(baseStats?.following);
  const totalTweets = hasDaily
    ? sanitizeNumber(stats?.totalTweets)
    : sanitizeNumber(baseStats?.tweets);
  const totalInteractions = stats
    ? sanitizeNumber(stats.engagementBreakdown.likes) +
      sanitizeNumber(stats.engagementBreakdown.retweets) +
      sanitizeNumber(stats.engagementBreakdown.comments) +
      sanitizeNumber(stats.engagementBreakdown.shares)
    : 0;
  const netFollowers = sortedDaily.reduce(
    (total, day) => total + sanitizeNumber(day.followers_gained),
    0,
  );

  const periodLabel =
    selectedTimeframe === '7d'
      ? '7 derniers jours'
      : selectedTimeframe === '30d'
        ? '30 derniers jours'
        : selectedTimeframe === '90d'
          ? '90 derniers jours'
          : '12 derniers mois';

  const metricCards: {
    key: MetricKey;
    label: string;
    value: string;
    available: boolean;
    selector: (day: UserStats['dailyStats'][number]) => number;
    color: string;
  }[] = [
    {
      key: 'views',
      label: 'Vues',
      value: hasDaily ? formatCompactCount(sanitizeNumber(stats?.totalViews)) : '—',
      available: hasDaily,
      selector: (day) => sanitizeNumber(day.views),
      color: CHART_PRIMARY,
    },
    {
      key: 'followers',
      label: 'Abonnés nets',
      value: hasDaily ? `${netFollowers >= 0 ? '+' : ''}${formatCompactCount(netFollowers)}` : '—',
      available: hasDaily,
      selector: (day) => sanitizeNumber(day.followers_gained),
      color: CHART_SECONDARY,
    },
    {
      key: 'interactions',
      label: 'Interactions',
      value: formatCompactCount(totalInteractions),
      available: hasDaily,
      selector: (day) => sanitizeNumber(day.likes) + sanitizeNumber(day.retweets) + sanitizeNumber(day.comments),
      color: CHART_PRIMARY,
    },
    {
      key: 'tweets',
      label: 'Publications',
      value: totalTweets > 0 ? formatCompactCount(totalTweets) : '—',
      available: hasDaily,
      selector: (day) => sanitizeNumber(day.tweets),
      color: CHART_PRIMARY,
    },
  ];

  const activeMetric = metricCards.find((card) => card.key === selectedMetric) || metricCards[0];
  const activeSeries = useMemo(
    () => (hasDaily ? buildSeries(sortedDaily, activeMetric.selector) : { labels: [], values: [] }),
    [hasDaily, sortedDaily, activeMetric],
  );
  const activeTrend = stats ? computeTrend(stats.dailyStats, activeMetric.selector) : null;

  const renderTrend = (trend: Trend) => {
    if (!trend || trend.pct === 0) {
      return <Text style={styles.trendUnavailable}>Tendance en attente</Text>;
    }

    const tint = trend.positive ? colors.success : colors.red;
    return (
      <View style={styles.trend}>
        <Ionicons name={trend.positive ? 'arrow-up' : 'arrow-down'} size={12} color={tint} />
        <Text style={[styles.trendText, { color: tint }]}>{trend.pct}%</Text>
      </View>
    );
  };

  const renderSectionTabs = () => (
    <View style={styles.sectionTabs} accessibilityRole="tablist">
      {sections.map((section) => {
        const active = section.key === selectedSection;
        return (
          <Pressable
            key={section.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={section.label}
            onPress={() => setSelectedSection(section.key)}
            style={(state: any) => [
              styles.sectionTab,
              state.pressed && styles.controlPressed,
            ]}
          >
            <Text style={[styles.sectionTabText, active && styles.sectionTabTextActive]}>
              {section.label}
            </Text>
            <View style={[styles.sectionTabUnderline, active && styles.sectionTabUnderlineActive]} />
          </Pressable>
        );
      })}
    </View>
  );

  const renderPeriodRow = () => (
    <View style={styles.periodRow}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.periodControl}
      >
        {timeframeOptions.map((option) => {
          const active = option.key === selectedTimeframe;
          return (
            <Pressable
              key={option.key}
              accessibilityRole="tab"
              accessibilityLabel={`Afficher les statistiques sur ${option.longLabel}`}
              accessibilityState={{ selected: active }}
              onPress={() => setSelectedTimeframe(option.key)}
              style={(state: any) => [
                styles.periodChip,
                active && styles.periodChipActive,
                state.pressed && styles.controlPressed,
              ]}
            >
              <Text style={[styles.periodChipText, active && styles.periodChipTextActive]}>
                {compact ? option.shortLabel : option.longLabel}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Actualiser les statistiques"
        accessibilityState={{ busy: refreshing || loading }}
        hitSlop={8}
        onPress={() => loadUserStats(true)}
        style={(state: any) => [styles.refreshButton, state.pressed && styles.controlPressed]}
      >
        {loading || refreshing ? (
          <ActivityIndicator size="small" color={colors.textPrimary} />
        ) : (
          <Ionicons name="refresh" size={17} color={colors.textPrimary} />
        )}
      </Pressable>
    </View>
  );

  const renderMetricCards = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.metricRow}
      accessibilityRole="tablist"
    >
      {metricCards.map((card) => {
        const active = card.key === selectedMetric;
        return (
          <Pressable
            key={card.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${card.label}, ${card.value}`}
            onPress={() => setSelectedMetric(card.key)}
            style={(state: any) => [
              styles.metricCard,
              active && styles.metricCardActive,
              state.pressed && styles.controlPressed,
            ]}
          >
            <Text style={[styles.metricLabel, active && styles.metricLabelActive]}>{card.label}</Text>
            <Text style={[styles.metricValue, compact && styles.metricValueCompact]}>{card.value}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  const renderChart = () => {
    if (!hasDaily || activeSeries.values.length === 0) {
      return (
        <View style={styles.chartEmptyState} accessibilityRole="alert">
          <View style={styles.chartEmptyIcon}>
            <Ionicons name="analytics-outline" size={24} color={colors.textSecondary} />
          </View>
          <Text style={styles.chartEmptyTitle}>Signal insuffisant</Text>
          <Text style={styles.chartEmptyText}>
            Les données quotidiennes ne sont pas encore disponibles sur cette période.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.chartBlock}>
        <View style={styles.chartHeading}>
          <Text style={styles.chartTitle}>{activeMetric.label}</Text>
          {renderTrend(activeTrend)}
        </View>
        <Text style={styles.chartCaption}>{periodLabel}</Text>
        <InsightChart
          labels={activeSeries.labels}
          values={activeSeries.values}
          color={activeMetric.color}
          width={chartWidth}
          height={chartHeight}
          selectedIndex={inspectedIndex}
          onSelect={setInspectedIndex}
        />
      </View>
    );
  };

  const renderBreakdown = () => {
    const breakdown = stats?.engagementBreakdown;
    if (!breakdown || totalInteractions === 0) return null;

    const rows = [
      { key: 'likes', label: 'J’aime', value: sanitizeNumber(breakdown.likes), color: CHART_BREAKDOWN_COLORS.likes },
      { key: 'retweets', label: 'Republications', value: sanitizeNumber(breakdown.retweets), color: CHART_BREAKDOWN_COLORS.retweets },
      { key: 'comments', label: 'Commentaires', value: sanitizeNumber(breakdown.comments), color: CHART_BREAKDOWN_COLORS.comments },
      { key: 'shares', label: 'Partages', value: sanitizeNumber(breakdown.shares), color: CHART_BREAKDOWN_COLORS.shares },
    ];
    const maximum = Math.max(1, ...rows.map((row) => row.value));

    return (
      <View style={styles.block}>
        <Text style={styles.blockTitle}>Interactions par type</Text>
        <View style={styles.blockTotalRow}>
          <Text style={styles.blockTotalLabel}>Total des interactions</Text>
          <Text style={styles.blockTotalValue}>{formatCompactCount(totalInteractions)}</Text>
        </View>
        {rows.map((row) => (
          <View key={row.key} style={styles.barRow}>
            <Text style={styles.barLabel}>{row.label}</Text>
            <View style={styles.barLine}>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${(row.value / maximum) * 100}%`, backgroundColor: row.color },
                  ]}
                />
              </View>
              <Text style={styles.barValue}>{formatCompactCount(row.value)}</Text>
            </View>
          </View>
        ))}
      </View>
    );
  };

  const renderTweetItem = (tweet: UserStats['topTweets'][number], index: number) => (
    <View key={tweet.id} style={styles.tweetItem}>
      <Text style={[styles.tweetRank, index === 0 && styles.tweetRankFirst]}>
        {String(index + 1).padStart(2, '0')}
      </Text>
      <View style={styles.tweetBody}>
        <Text style={styles.tweetContent} numberOfLines={3}>{tweet.content}</Text>
        <View style={styles.tweetStats}>
          <View style={styles.tweetStat}>
            <Ionicons name="eye-outline" size={13} color={colors.textMuted} />
            <Text style={styles.tweetStatText}>{formatCompactCount(tweet.views)}</Text>
          </View>
          <View style={styles.tweetStat}>
            <Ionicons name="heart-outline" size={13} color={colors.textMuted} />
            <Text style={styles.tweetStatText}>{formatCompactCount(tweet.likes)}</Text>
          </View>
          <View style={styles.tweetStat}>
            <Ionicons name="repeat-outline" size={13} color={colors.textMuted} />
            <Text style={styles.tweetStatText}>{formatCompactCount(tweet.retweets)}</Text>
          </View>
          <View style={styles.tweetStat}>
            <Ionicons name="chatbubble-outline" size={13} color={colors.textMuted} />
            <Text style={styles.tweetStatText}>{formatCompactCount(tweet.comments)}</Text>
          </View>
          <Text style={styles.tweetRate}>{sanitizeNumber(tweet.engagement_rate)}%</Text>
        </View>
      </View>
    </View>
  );

  const renderTopTweets = () => {
    if (!stats) return null;

    return (
      <View style={styles.block}>
        <Text style={styles.blockTitle}>Publications les plus vues</Text>
        {stats.topTweets.length === 0 ? (
          <View style={styles.blockEmpty}>
            <Ionicons name="document-text-outline" size={22} color={colors.textMuted} />
            <Text style={styles.blockEmptyTitle}>Classement en attente</Text>
            <Text style={styles.blockEmptyText}>
              Les publications les plus performantes apparaîtront ici.
            </Text>
          </View>
        ) : (
          stats.topTweets.map(renderTweetItem)
        )}
      </View>
    );
  };

  const renderAudience = () => {
    if (!stats) return null;

    const hasFollowerHistory = sortedDaily.some((day) => sanitizeNumber(day.followers_gained) > 0);
    let cumulative: { labels: string[]; values: number[] } = { labels: [], values: [] };

    if (hasFollowerHistory) {
      let runningTotal = Math.max(0, followerCount - netFollowers);
      const points = sortedDaily.map((day) => {
        runningTotal += sanitizeNumber(day.followers_gained);
        return runningTotal;
      });
      const maxPoints = 31;
      const bucketSize = Math.max(1, Math.ceil(points.length / maxPoints));
      for (let index = 0; index < points.length; index += bucketSize) {
        const pointIndex = Math.min(index + bucketSize - 1, points.length - 1);
        const date = sortedDaily[pointIndex]?.date;
        cumulative.labels.push(
          date
            ? new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
            : `P${cumulative.labels.length + 1}`,
        );
        cumulative.values.push(points[pointIndex]);
      }
    }

    const hourlyActivity = Array.from({ length: 24 }, (_, hour) => {
      const slot = stats.activityData.find((item) => item.hour === hour);
      return sanitizeNumber(slot?.activity_score);
    });
    const hasActivity = hourlyActivity.some((value) => value > 0);
    const maxActivity = Math.max(1, ...hourlyActivity);

    return (
      <>
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Total des abonnés</Text>
          <View style={styles.blockTotalRow}>
            <Text style={styles.blockTotalLabel}>{formatCompactCount(followingCount)} abonnements</Text>
            <Text style={styles.blockTotalValue}>{formatCompactCount(followerCount)}</Text>
          </View>
          {hasFollowerHistory ? (
            <InsightChart
              labels={cumulative.labels}
              values={cumulative.values}
              color={CHART_SECONDARY}
              width={chartWidth}
              height={chartHeight}
              selectedIndex={inspectedIndex}
              onSelect={setInspectedIndex}
            />
          ) : (
            <Text style={styles.blockEmptyText}>
              Il faut davantage de données quotidiennes pour tracer l’évolution des abonnés.
            </Text>
          )}
        </View>

        <View style={styles.block}>
          <Text style={styles.blockTitle}>Heures d’activité</Text>
          {hasActivity ? (
            <>
              <View style={styles.hourGrid}>
                {hourlyActivity.map((value, hour) => (
                  <View key={hour} style={styles.hourColumn}>
                    <View style={styles.hourTrack}>
                      <View
                        style={[
                          styles.hourFill,
                          {
                            height: `${Math.max(3, (value / maxActivity) * 100)}%`,
                            backgroundColor:
                              value === maxActivity ? colors.accent : withAlpha(colors.accent, 0.4),
                          },
                        ]}
                      />
                    </View>
                    {hour % 6 === 0 && <Text style={styles.hourLabel}>{hour}h</Text>}
                  </View>
                ))}
              </View>
              <View style={styles.hourChips}>
                {stats.mostActiveHours.map((hour, index) => (
                  <View key={`${hour}-${index}`} style={styles.hourChip}>
                    <Text style={styles.hourChipText}>{hour}h</Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <Text style={styles.blockEmptyText}>
              Aucune activité mesurable n’est disponible sur cette période.
            </Text>
          )}
        </View>
      </>
    );
  };

  if (loading && !stats) {
    return (
      <View style={embedded ? styles.embeddedContainer : styles.container}>
        <StatsSkeleton gutter={pageGutter} />
      </View>
    );
  }

  const content = (
    <View style={[styles.pageInner, { paddingHorizontal: pageGutter }]}>
      {renderSectionTabs()}
      {renderPeriodRow()}

      {loadError && !stats ? (
        <View style={styles.errorState} accessibilityRole="alert">
          <Ionicons name="cloud-offline-outline" size={22} color={colors.warning} />
          <View style={styles.errorCopy}>
            <Text style={styles.errorTitle}>Données momentanément indisponibles</Text>
            <Text style={styles.errorText}>{loadError}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => loadUserStats()}
            style={(state: any) => [styles.retryButton, state.pressed && styles.controlPressed]}
          >
            <Text style={styles.retryButtonText}>Réessayer</Text>
          </Pressable>
        </View>
      ) : null}

      {stats ? (
        <>
          {!hasDaily && (
            <View style={styles.notice} accessibilityRole="alert">
              <Ionicons name="information-circle-outline" size={17} color={colors.cyan} />
              <Text style={styles.noticeText}>
                Vue partielle : les données quotidiennes manquent, les totaux du profil restent visibles.
              </Text>
            </View>
          )}

          {selectedSection === 'overview' && (
            <>
              {renderMetricCards()}
              {renderChart()}
              {renderBreakdown()}
            </>
          )}
          {selectedSection === 'content' && (
            <>
              {renderTopTweets()}
              {renderBreakdown()}
            </>
          )}
          {selectedSection === 'audience' && renderAudience()}
        </>
      ) : null}
    </View>
  );

  if (embedded) {
    return <View style={styles.embeddedContainer}>{content}</View>;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => loadUserStats(true)}
          tintColor={colors.accent}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {content}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  embeddedContainer: {
    backgroundColor: 'transparent',
  },
  scrollContent: {
    paddingBottom: 120,
  },
  pageInner: {
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
  },

  sectionTabs: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sectionTab: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  sectionTabText: {
    color: colors.textMuted,
    fontSize: 15,
    marginBottom: 11,
    fontFamily: fonts.semibold,
  },
  sectionTabTextActive: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
  },
  sectionTabUnderline: {
    height: 2,
    width: '100%',
    backgroundColor: 'transparent',
  },
  sectionTabUnderlineActive: {
    backgroundColor: colors.textPrimary,
  },

  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
  },
  periodControl: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 4,
  },
  periodChip: {
    minHeight: 34,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: colors.surface,
  },
  periodChipActive: {
    backgroundColor: colors.textPrimary,
  },
  periodChipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontFamily: fonts.semibold,
  },
  periodChipTextActive: {
    color: colors.bg,
  },
  refreshButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: colors.surface,
  },
  controlPressed: {
    opacity: 0.72,
  },

  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: colors.cyanSoft,
  },
  noticeText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: fonts.regular,
  },
  errorState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    padding: 16,
    borderRadius: 14,
    backgroundColor: colors.warningMuted,
  },
  errorCopy: {
    flex: 1,
  },
  errorTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontFamily: fonts.bold,
  },
  errorText: {
    marginTop: 3,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: fonts.regular,
  },
  retryButton: {
    minHeight: 36,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: colors.textPrimary,
  },
  retryButtonText: {
    color: colors.bg,
    fontSize: 12,
    fontFamily: fonts.bold,
  },

  metricRow: {
    gap: 10,
    paddingVertical: 20,
    paddingRight: 4,
  },
  metricCard: {
    minWidth: 152,
    minHeight: 92,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.surface,
  },
  metricCardActive: {
    borderColor: colors.textPrimary,
    backgroundColor: colors.surfaceElevated,
  },
  metricLabel: {
    color: colors.textSecondary,
    fontSize: 14,
    fontFamily: fonts.semibold,
  },
  metricLabelActive: {
    color: colors.textPrimary,
  },
  metricValue: {
    marginTop: 8,
    color: colors.textPrimary,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -1,
    fontFamily: fonts.displayHeavy,
  },
  metricValueCompact: {
    fontSize: 25,
    lineHeight: 31,
  },

  chartBlock: {
    paddingBottom: 24,
    borderBottomWidth: 8,
    borderBottomColor: colors.bgElevated,
  },
  chartHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  chartTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    letterSpacing: -0.4,
    fontFamily: fonts.display,
  },
  chartCaption: {
    marginTop: 2,
    marginBottom: 8,
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: fonts.regular,
  },
  trend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  trendText: {
    fontSize: 12,
    fontFamily: fonts.bold,
  },
  trendUnavailable: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: fonts.medium,
  },
  bubble: {
    position: 'absolute',
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: colors.surfaceElevated,
  },
  bubbleValue: {
    color: colors.textPrimary,
    fontSize: 15,
    fontFamily: fonts.bold,
  },
  bubbleLabel: {
    marginTop: 1,
    color: colors.textSecondary,
    fontSize: 11,
    fontFamily: fonts.medium,
  },
  chartEmptyState: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  chartEmptyIcon: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 26,
    backgroundColor: colors.surface,
  },
  chartEmptyTitle: {
    marginTop: 12,
    color: colors.textPrimary,
    fontSize: 15,
    fontFamily: fonts.bold,
  },
  chartEmptyText: {
    maxWidth: 360,
    marginTop: 5,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    fontFamily: fonts.regular,
  },

  block: {
    paddingTop: 26,
    paddingBottom: 24,
    borderBottomWidth: 8,
    borderBottomColor: colors.bgElevated,
  },
  blockTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    letterSpacing: -0.4,
    fontFamily: fonts.display,
  },
  blockTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 14,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  blockTotalLabel: {
    color: colors.textSecondary,
    fontSize: 14,
    fontFamily: fonts.semibold,
  },
  blockTotalValue: {
    color: colors.textPrimary,
    fontSize: 20,
    fontFamily: fonts.displayHeavy,
  },
  barRow: {
    marginTop: 16,
  },
  barLabel: {
    color: colors.textPrimary,
    fontSize: 14,
    marginBottom: 8,
    fontFamily: fonts.semibold,
  },
  barLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  barTrack: {
    flex: 1,
    height: 8,
    overflow: 'hidden',
    borderRadius: 4,
    backgroundColor: colors.surface,
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  barValue: {
    minWidth: 44,
    color: colors.textPrimary,
    fontSize: 14,
    textAlign: 'right',
    fontFamily: fonts.bold,
  },
  blockEmpty: {
    minHeight: 150,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  blockEmptyTitle: {
    marginTop: 10,
    color: colors.textPrimary,
    fontSize: 14,
    fontFamily: fonts.bold,
  },
  blockEmptyText: {
    marginTop: 8,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: fonts.regular,
  },

  tweetItem: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tweetRank: {
    width: 26,
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 21,
    fontFamily: fonts.displayHeavy,
  },
  tweetRankFirst: {
    color: colors.accent,
  },
  tweetBody: {
    flex: 1,
    minWidth: 0,
  },
  tweetContent: {
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: fonts.regular,
  },
  tweetStats: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  tweetStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tweetStatText: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: fonts.medium,
  },
  tweetRate: {
    color: colors.success,
    fontSize: 11,
    fontFamily: fonts.bold,
  },

  hourGrid: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 132,
    marginTop: 18,
  },
  hourColumn: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },
  hourTrack: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  hourFill: {
    width: '100%',
    borderRadius: 2,
  },
  hourLabel: {
    marginTop: 6,
    color: colors.textMuted,
    fontSize: 9,
    fontFamily: fonts.medium,
  },
  hourChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  hourChip: {
    minHeight: 30,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: colors.surface,
  },
  hourChipText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontFamily: fonts.semibold,
  },

  skeletonBlock: {
    backgroundColor: colors.surface,
    borderRadius: 14,
  },
  skeletonTabs: {
    width: '100%',
    height: 48,
    marginTop: 4,
  },
  skeletonCardRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  skeletonCard: {
    flex: 1,
    height: 92,
  },
  skeletonChart: {
    height: 232,
    marginTop: 20,
  },
  skeletonBars: {
    height: 180,
    marginTop: 26,
  },
});

export default UserStatsTab;
