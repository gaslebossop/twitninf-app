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
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { userStatsService, type DeepInsights } from '../services/userStatsService';
import {
  fetchCreatorProfile,
  type CreatorProfile,
} from '../services/creatorIntelligenceService';
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
  totalLikes: number;
  totalRetweets: number;
  totalComments: number;
  totalShares: number;
  followerCount: number;
  followingCount: number;
  profileViews: number;
  engagementRate: number;
  averageViewsPerTweet: number;
  reachGrowth: number;
  engagementGrowth: number;
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
    shares: number;
    followers_gained?: number;
    profile_views?: number;
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
    shares: number;
    engagement_rate: number;
    performance_score: number;
  }[];
  deepInsights: DeepInsights | null;
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
type MetricKey = 'views' | 'followers' | 'interactions' | 'tweets' | 'profileViews';

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
  onInteractionChange,
}: {
  labels: string[];
  values: number[];
  color: string;
  width: number;
  height: number;
  selectedIndex: number | null;
  onSelect: (index: number | null) => void;
  onInteractionChange?: (active: boolean) => void;
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
      onResponderTerminationRequest={() => false}
      onResponderGrant={(event) => {
        onInteractionChange?.(true);
        handleTouch(event.nativeEvent.locationX);
      }}
      onResponderMove={(event) => handleTouch(event.nativeEvent.locationX)}
      onResponderRelease={() => onInteractionChange?.(false)}
      onResponderTerminate={() => onInteractionChange?.(false)}
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

/** Histogramme horaire inspectable, sans conflit avec le scroll vertical. */
function HourlyActivityChart({
  data,
  width,
  height,
  selectedHour,
  onSelect,
  onInteractionChange,
}: {
  data: UserStats['activityData'];
  width: number;
  height: number;
  selectedHour: number | null;
  onSelect: (hour: number) => void;
  onInteractionChange: (active: boolean) => void;
}) {
  const padLeft = 32;
  const padRight = 8;
  const padTop = 48;
  const padBottom = 28;
  const innerWidth = Math.max(1, width - padLeft - padRight);
  const innerHeight = Math.max(1, height - padTop - padBottom);
  const slotWidth = innerWidth / 24;
  const barWidth = Math.max(4, slotWidth * 0.62);
  const slots = Array.from({ length: 24 }, (_, hour) => {
    const source = data.find((item) => sanitizeNumber(item.hour) === hour);
    return {
      hour,
      score: sanitizeNumber(source?.activity_score),
      tweets: sanitizeNumber(source?.tweet_count),
      engagement: sanitizeNumber(source?.engagement_count),
    };
  });
  const maximum = Math.max(1, ...slots.map((slot) => slot.score));
  const selected = selectedHour !== null ? slots[selectedHour] : null;
  const centerX = (hour: number) => padLeft + slotWidth * hour + slotWidth / 2;
  const barHeight = (score: number) => Math.max(3, (score / maximum) * innerHeight);

  const handleTouch = (locationX: number) => {
    const raw = Math.floor((locationX - padLeft) / slotWidth);
    onSelect(Math.min(23, Math.max(0, raw)));
  };

  const bubbleWidth = 154;
  const bubbleLeft = selected
    ? Math.min(Math.max(centerX(selected.hour) - bubbleWidth / 2, 0), Math.max(0, width - bubbleWidth))
    : 0;

  return (
    <View>
      <View
        style={{ width, height }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(event) => {
          onInteractionChange(true);
          handleTouch(event.nativeEvent.locationX);
        }}
        onResponderMove={(event) => handleTouch(event.nativeEvent.locationX)}
        onResponderRelease={() => onInteractionChange(false)}
        onResponderTerminate={() => onInteractionChange(false)}
        accessibilityRole="image"
        accessibilityLabel="Activité de l’audience heure par heure. Fais glisser le doigt pour inspecter un créneau."
      >
        <Svg width={width} height={height}>
          {[0, Math.round(maximum / 2), maximum].map((value, index) => {
            const y = padTop + innerHeight - (value / maximum) * innerHeight;
            return (
              <React.Fragment key={`hour-grid-${index}`}>
                <Line
                  x1={padLeft}
                  x2={width - padRight}
                  y1={y}
                  y2={y}
                  stroke={colors.border}
                  strokeWidth={1}
                />
                <SvgText
                  x={padLeft - 7}
                  y={y + 4}
                  fill={colors.textMuted}
                  fontSize={10}
                  textAnchor="end"
                >
                  {formatCompactCount(value)}
                </SvgText>
              </React.Fragment>
            );
          })}

          {slots.map((slot) => {
            const heightValue = barHeight(slot.score);
            const active = selectedHour === slot.hour;
            const best = slot.score === maximum;
            return (
              <Rect
                key={slot.hour}
                x={centerX(slot.hour) - barWidth / 2}
                y={padTop + innerHeight - heightValue}
                width={barWidth}
                height={heightValue}
                rx={Math.min(4, barWidth / 2)}
                fill={active || best ? colors.accent : withAlpha(colors.accent, 0.38)}
                opacity={selectedHour === null || active ? 1 : 0.55}
              />
            );
          })}

          {[0, 6, 12, 18, 23].map((hour) => (
            <SvgText
              key={`hour-label-${hour}`}
              x={centerX(hour)}
              y={height - 7}
              fill={colors.textMuted}
              fontSize={10}
              textAnchor="middle"
            >
              {hour}h
            </SvgText>
          ))}
        </Svg>

        {selected && (
          <View style={[styles.hourBubble, { left: bubbleLeft, width: bubbleWidth }]} pointerEvents="none">
            <Text style={styles.hourBubbleTitle}>{selected.hour}h–{(selected.hour + 1) % 24}h</Text>
            <Text style={styles.hourBubbleText}>
              Indice {formatCompactCount(selected.score)} · {formatCompactCount(selected.engagement)} interactions
            </Text>
          </View>
        )}
      </View>
      <View style={styles.chartGestureHint}>
        <Ionicons name="move-outline" size={13} color={colors.textMuted} />
        <Text style={styles.chartGestureHintText}>Maintiens et glisse pour comparer les heures</Text>
      </View>
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
  const [creatorProfile, setCreatorProfile] = useState<CreatorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>('30d');
  const [selectedSection, setSelectedSection] = useState<Section>('overview');
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('views');
  const [inspectedIndex, setInspectedIndex] = useState<number | null>(null);
  const [inspectedHour, setInspectedHour] = useState<number | null>(null);
  const [isInspectingChart, setIsInspectingChart] = useState(false);
  const requestSequence = useRef(0);

  const loadUserStats = useCallback(
    async (refresh = false) => {
      if (!userId) {
        setLoading(false);
        setRefreshing(false);
        setStats(null);
        setCreatorProfile(null);
        setLoadError('Aucun utilisateur connecté.');
        return;
      }

      const requestId = ++requestSequence.current;
      if (refresh) setRefreshing(true);
      setLoading(true);
      setLoadError(null);

      try {
        const profileDays = selectedTimeframe === '7d'
          ? 7
          : selectedTimeframe === '30d'
            ? 30
            : selectedTimeframe === '90d'
              ? 90
              : 365;
        const [statsResponse, profileResponse] = await Promise.all([
          userStatsService.getUserStats(userId, selectedTimeframe),
          // Cette analyse peut être réservée par le serveur selon le palier du
          // compte. Un refus n'empêche jamais les statistiques classiques.
          fetchCreatorProfile(profileDays),
        ]);
        if (requestId !== requestSequence.current) return;

        const activityData = statsResponse.activityData || [];
        const analytics = statsResponse.analytics;
        const adaptedStats: UserStats = {
          totalTweets: sanitizeNumber(analytics.totalTweets),
          totalViews: sanitizeNumber(analytics.totalViews),
          totalLikes: sanitizeNumber(analytics.totalLikes),
          totalRetweets: sanitizeNumber(analytics.totalRetweets),
          totalComments: sanitizeNumber(analytics.totalComments),
          totalShares: sanitizeNumber(analytics.totalShares),
          followerCount: sanitizeNumber(analytics.followerCount),
          followingCount: sanitizeNumber(analytics.followingCount),
          profileViews: sanitizeNumber(analytics.profileViews),
          engagementRate: sanitizeNumber(analytics.engagementRate),
          averageViewsPerTweet: sanitizeNumber(analytics.averageViewsPerTweet),
          reachGrowth: sanitizeNumber(analytics.reachGrowth),
          engagementGrowth: sanitizeNumber(analytics.engagementGrowth),
          activityData: activityData.map((item) => ({
            hour: Math.min(23, Math.max(0, Math.round(sanitizeNumber(item.hour)))),
            tweet_count: sanitizeNumber(item.tweet_count),
            engagement_count: sanitizeNumber(item.engagement_count),
            activity_score: sanitizeNumber(item.activity_score),
          })),
          dailyStats: (statsResponse.dailyStats || []).map((day) => ({
            date: day.date,
            tweets: sanitizeNumber(day.tweets),
            views: sanitizeNumber(day.views),
            likes: sanitizeNumber(day.likes),
            retweets: sanitizeNumber(day.retweets),
            comments: sanitizeNumber(day.comments),
            shares: sanitizeNumber(day.shares),
            followers_gained: sanitizeNumber(day.followers_gained),
            profile_views: sanitizeNumber(day.profile_views),
          })),
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
            shares: sanitizeNumber(tweet.shares),
            engagement_rate: sanitizeNumber(tweet.engagement_rate),
            performance_score: sanitizeNumber(tweet.performance_score),
          })),
          deepInsights: statsResponse.deepInsights || null,
        };

        setStats(adaptedStats);
        setCreatorProfile(profileResponse.ok && profileResponse.data ? profileResponse.data : null);
      } catch (error) {
        if (requestId !== requestSequence.current) return;
        console.error('Erreur lors du chargement des statistiques:', error);
        setLoadError('Impossible de charger les statistiques pour le moment.');
        setStats(null);
        setCreatorProfile(null);
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
    setInspectedHour(null);
    setIsInspectingChart(false);
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
  const periodProfileViews = sanitizeNumber(stats?.profileViews) > 0
    ? sanitizeNumber(stats?.profileViews)
    : sortedDaily.reduce((total, day) => total + sanitizeNumber(day.profile_views), 0);
  const averageViewsPerTweet = sanitizeNumber(stats?.averageViewsPerTweet) > 0
    ? sanitizeNumber(stats?.averageViewsPerTweet)
    : totalTweets > 0
      ? sanitizeNumber(stats?.totalViews) / totalTweets
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
      selector: (day) =>
        sanitizeNumber(day.likes) +
        sanitizeNumber(day.retweets) +
        sanitizeNumber(day.comments) +
        sanitizeNumber(day.shares),
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
    {
      key: 'profileViews',
      label: 'Visites du profil',
      value: periodProfileViews > 0 ? formatCompactCount(periodProfileViews) : '—',
      available: sortedDaily.some((day) => sanitizeNumber(day.profile_views) > 0),
      selector: (day) => sanitizeNumber(day.profile_views),
      color: CHART_SECONDARY,
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
            disabled={!card.available}
            onPress={() => setSelectedMetric(card.key)}
            style={(state: any) => [
              styles.metricCard,
              active && styles.metricCardActive,
              !card.available && styles.metricCardDisabled,
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

  const renderPerformanceSnapshot = () => {
    if (!stats) return null;

    const likes = sanitizeNumber(stats.totalLikes) || sanitizeNumber(stats.engagementBreakdown.likes);
    const retweets = sanitizeNumber(stats.totalRetweets) || sanitizeNumber(stats.engagementBreakdown.retweets);
    const comments = sanitizeNumber(stats.totalComments) || sanitizeNumber(stats.engagementBreakdown.comments);
    const shares = sanitizeNumber(stats.totalShares) || sanitizeNumber(stats.engagementBreakdown.shares);
    const interactionsPerPost = totalTweets > 0 ? totalInteractions / totalTweets : 0;
    const averagePerformance = stats.topTweets.length > 0
      ? stats.topTweets.reduce((total, tweet) => total + sanitizeNumber(tweet.performance_score), 0) /
        stats.topTweets.length
      : 0;
    const decimal = (value: number, suffix = '') =>
      `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}${suffix}`;

    const items = [
      { key: 'rate', icon: 'pulse-outline', label: 'Taux d’engagement', value: decimal(stats.engagementRate, '%'), hint: 'interactions / vues' },
      { key: 'averageViews', icon: 'eye-outline', label: 'Vues / publication', value: formatCompactCount(Math.round(averageViewsPerTweet)), hint: 'moyenne sur la période' },
      { key: 'profile', icon: 'person-outline', label: 'Visites du profil', value: formatCompactCount(periodProfileViews), hint: 'intérêt pour ton compte' },
      { key: 'perPost', icon: 'sparkles-outline', label: 'Interactions / publication', value: decimal(interactionsPerPost), hint: 'moyenne calculée' },
      { key: 'likes', icon: 'heart-outline', label: 'J’aime', value: formatCompactCount(likes), hint: 'total de la période' },
      { key: 'retweets', icon: 'repeat-outline', label: 'Republications', value: formatCompactCount(retweets), hint: 'total de la période' },
      { key: 'comments', icon: 'chatbubble-outline', label: 'Commentaires', value: formatCompactCount(comments), hint: 'total de la période' },
      { key: 'shares', icon: 'share-social-outline', label: 'Partages', value: formatCompactCount(shares), hint: 'total de la période' },
      ...(averagePerformance > 0
        ? [{ key: 'performance', icon: 'speedometer-outline', label: 'Score contenu', value: decimal(averagePerformance, '/100'), hint: 'moyenne du top contenu' }]
        : []),
      ...(stats.reachGrowth !== 0
        ? [{ key: 'reachGrowth', icon: 'trending-up-outline', label: 'Croissance portée', value: `${stats.reachGrowth > 0 ? '+' : ''}${decimal(stats.reachGrowth, '%')}`, hint: 'évolution mesurée' }]
        : []),
      ...(stats.engagementGrowth !== 0
        ? [{ key: 'engagementGrowth', icon: 'analytics-outline', label: 'Croissance engagement', value: `${stats.engagementGrowth > 0 ? '+' : ''}${decimal(stats.engagementGrowth, '%')}`, hint: 'évolution mesurée' }]
        : []),
    ];

    return (
      <View style={styles.block}>
        <Text style={styles.blockTitle}>Performance détaillée</Text>
        <Text style={styles.blockSubtitle}>Tous les signaux disponibles sur {periodLabel}</Text>
        <View style={styles.performanceGrid}>
          {items.map((item) => (
            <View
              key={item.key}
              style={[styles.performanceTile, { width: tablet ? '23.5%' : '48%' }]}
              accessible
              accessibilityLabel={`${item.label} : ${item.value}`}
            >
              <View style={styles.performanceIcon}>
                <Ionicons name={item.icon as any} size={16} color={colors.accent} />
              </View>
              <Text style={styles.performanceValue}>{item.value}</Text>
              <Text style={styles.performanceLabel}>{item.label}</Text>
              <Text style={styles.performanceHint}>{item.hint}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderAlgorithmInsights = () => {
    if (!creatorProfile) return null;

    if (!creatorProfile.hasEnoughData || !creatorProfile.baseline) {
      return (
        <View style={styles.block}>
          <View style={styles.algorithmHeading}>
            <Text style={styles.blockTitle}>Analyse de l’algorithme</Text>
            <View style={styles.algorithmBadge}><Text style={styles.algorithmBadgeText}>IA</Text></View>
          </View>
          <Text style={styles.blockEmptyText}>
            {creatorProfile.sampleSize} publications analysées sur {creatorProfile.minimumRequired || 'davantage'} nécessaires. Les indicateurs prédictifs apparaîtront automatiquement avec plus d’historique.
          </Text>
        </View>
      );
    }

    const baseline = creatorProfile.baseline;
    const confidence = creatorProfile.confidence === 'high'
      ? 'Fiabilité élevée'
      : creatorProfile.confidence === 'medium'
        ? 'Fiabilité moyenne'
        : 'Fiabilité limitée';
    const factors = [...(creatorProfile.factors || [])]
      .filter((factor) => factor.applies)
      .sort((a, b) => Math.abs(b.impactPercent) - Math.abs(a.impactPercent))
      .slice(0, 6);

    const baselineItems = [
      { label: 'Engagement médian', value: baseline.medianEngagement },
      { label: 'Engagement moyen', value: baseline.averageEngagement },
      { label: 'Vues médianes', value: baseline.medianViews },
      { label: 'Top 10 %', value: baseline.p90Engagement },
      { label: 'Meilleur résultat', value: baseline.bestEverEngagement },
      { label: 'Publications analysées', value: creatorProfile.sampleSize },
    ];

    return (
      <View style={styles.block}>
        <View style={styles.algorithmHeading}>
          <View style={styles.algorithmTitleCopy}>
            <View style={styles.algorithmTitleRow}>
              <Text style={styles.blockTitle}>Analyse de l’algorithme</Text>
              <View style={styles.algorithmBadge}><Text style={styles.algorithmBadgeText}>IA</Text></View>
            </View>
            <Text style={styles.blockSubtitle}>
              {creatorProfile.historyDays || 'Historique'} jours · {confidence}
            </Text>
          </View>
        </View>

        <View style={styles.algorithmMetricGrid}>
          {baselineItems.map((item) => (
            <View key={item.label} style={styles.algorithmMetric}>
              <Text style={styles.algorithmMetricValue}>{formatCompactCount(item.value)}</Text>
              <Text style={styles.algorithmMetricLabel}>{item.label}</Text>
            </View>
          ))}
        </View>

        {creatorProfile.trend?.comparable && creatorProfile.trend.changePercent !== undefined && (
          <View style={styles.algorithmTrend}>
            <Ionicons
              name={creatorProfile.trend.changePercent >= 0 ? 'trending-up' : 'trending-down'}
              size={18}
              color={creatorProfile.trend.changePercent >= 0 ? colors.success : colors.red}
            />
            <View style={styles.algorithmTrendCopy}>
              <Text style={styles.algorithmTrendTitle}>Tendance récente</Text>
              <Text style={styles.algorithmTrendText}>
                {creatorProfile.trend.changePercent >= 0 ? '+' : ''}{creatorProfile.trend.changePercent.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}% par rapport à la période précédente
              </Text>
            </View>
          </View>
        )}

        {factors.length > 0 && (
          <View style={styles.factorList}>
            <Text style={styles.factorSectionTitle}>Ce qui influence tes performances</Text>
            {factors.map((factor) => {
              const positive = factor.impactPercent >= 0;
              return (
                <View key={factor.key} style={styles.factorRow}>
                  <View style={styles.factorHead}>
                    <Text style={styles.factorLabel} numberOfLines={1}>{factor.label}</Text>
                    <Text style={[styles.factorImpact, { color: positive ? colors.success : colors.red }]}>
                      {positive ? '+' : ''}{factor.impactPercent.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}%
                    </Text>
                  </View>
                  <View style={styles.factorTrack}>
                    <View
                      style={[
                        styles.factorFill,
                        {
                          width: `${Math.min(100, Math.abs(factor.impactPercent))}%`,
                          backgroundColor: positive ? colors.success : colors.red,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.factorExplain}>{factor.explain}</Text>
                  <Text style={styles.factorSample}>
                    {factor.sample.with} publications avec · {factor.sample.without} sans · fiabilité {factor.confidence}%
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  const renderUsageInsights = () => {
    if (!stats?.deepInsights) return null;
    const { behavior, location, privateProfile } = stats.deepInsights;
    const birthday = privateProfile.birthDay && privateProfile.birthMonth
      ? `${String(privateProfile.birthDay).padStart(2, '0')}/${String(privateProfile.birthMonth).padStart(2, '0')}`
      : '—';
    const items = [
      { key: 'activeDays', icon: 'calendar-outline', label: 'Jours actifs', value: formatCompactCount(behavior.activeDays), hint: periodLabel },
      { key: 'sessions', icon: 'log-in-outline', label: 'Connexions', value: formatCompactCount(behavior.loginSessions), hint: 'sessions distinctes' },
      { key: 'devices', icon: 'phone-portrait-outline', label: 'Appareils', value: formatCompactCount(behavior.devices), hint: 'observés sur la période' },
      { key: 'minutes', icon: 'timer-outline', label: 'Temps actif', value: `${formatCompactCount(behavior.totalMinutes)} min`, hint: 'mesuré par l’algorithme' },
      { key: 'screens', icon: 'albums-outline', label: 'Écrans consultés', value: formatCompactCount(behavior.screenViews), hint: 'navigation réelle' },
      { key: 'read', icon: 'eye-outline', label: 'Tweets lus', value: formatCompactCount(behavior.tweetsRead), hint: 'vues comportementales' },
      { key: 'profiles', icon: 'people-outline', label: 'Profils ouverts', value: formatCompactCount(behavior.profilesOpened), hint: 'exploration de comptes' },
      { key: 'searches', icon: 'search-outline', label: 'Recherches', value: formatCompactCount(behavior.searches), hint: 'requêtes effectuées' },
      { key: 'media', icon: 'images-outline', label: 'Médias ouverts', value: formatCompactCount(behavior.mediaViews), hint: 'photos et vidéos' },
      { key: 'refreshes', icon: 'refresh-outline', label: 'Actualisations', value: formatCompactCount(behavior.refreshes), hint: 'rafraîchissements du fil' },
      { key: 'geoSessions', icon: 'location-outline', label: 'Connexions localisées', value: formatCompactCount(location.capturedSessions), hint: location.consentStatus === 'granted' ? 'consentement actif' : 'localisation inactive' },
      { key: 'geoZones', icon: 'earth-outline', label: 'Zones détectées', value: `${location.countries} pays · ${location.regions} régions`, hint: 'données privées agrégées' },
      { key: 'age', icon: 'person-outline', label: 'Âge déclaré', value: privateProfile.declaredAge ? `${privateProfile.declaredAge} ans` : '—', hint: 'visible uniquement par toi' },
      { key: 'birthday', icon: 'gift-outline', label: 'Anniversaire', value: birthday, hint: 'jour et mois privés' },
    ];

    return (
      <View style={styles.block}>
        <Text style={styles.blockTitle}>Usage et profil</Text>
        <Text style={styles.blockSubtitle}>Signaux réels enregistrés par l’application sur {periodLabel}</Text>
        <View style={styles.performanceGrid}>
          {items.map((item) => (
            <View key={item.key} style={[styles.performanceTile, { width: tablet ? '23.5%' : '48%' }]}>
              <View style={styles.performanceIcon}>
                <Ionicons name={item.icon as any} size={16} color={colors.accent} />
              </View>
              <Text style={styles.performanceValue}>{item.value}</Text>
              <Text style={styles.performanceLabel}>{item.label}</Text>
              <Text style={styles.performanceHint}>{item.hint}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

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
          onInteractionChange={setIsInspectingChart}
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
          <View style={styles.tweetStat}>
            <Ionicons name="share-social-outline" size={13} color={colors.textMuted} />
            <Text style={styles.tweetStatText}>{formatCompactCount(tweet.shares)}</Text>
          </View>
        </View>
        <View style={styles.tweetQualityRow}>
          <Text style={styles.tweetRate}>{sanitizeNumber(tweet.engagement_rate)}% d’engagement</Text>
          {tweet.performance_score > 0 && (
            <View style={styles.tweetScoreBadge}>
              <Text style={styles.tweetScoreText}>Score {Math.round(tweet.performance_score)}/100</Text>
            </View>
          )}
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

  const renderContentSignals = () => {
    if (!stats?.deepInsights) return null;
    const content = stats.deepInsights.content;
    const decimalValue = (value: number) => value.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
    const items = [
      { key: 'algoViews', icon: 'git-network-outline', label: 'Vues algorithmiques', value: formatCompactCount(content.algorithmicViews), hint: 'distribution progressive' },
      { key: 'evaluations', icon: 'analytics-outline', label: 'Évaluations algo', value: formatCompactCount(content.algorithmEvaluations), hint: 'cycles de classement' },
      { key: 'quality', icon: 'sparkles-outline', label: 'Qualité IA moyenne', value: decimalValue(content.averageQualityScore), hint: 'analyse des publications' },
      { key: 'toxicity', icon: 'shield-checkmark-outline', label: 'Toxicité moyenne', value: decimalValue(content.averageToxicityScore), hint: 'signal de modération' },
      { key: 'stories', icon: 'radio-button-on-outline', label: 'Stories créées', value: formatCompactCount(content.storiesCreated), hint: 'sur la période' },
      { key: 'storyViews', icon: 'eye-outline', label: 'Vues des stories', value: formatCompactCount(content.storyViews), hint: 'vues cumulées' },
      { key: 'storyLikes', icon: 'heart-outline', label: 'J’aime des stories', value: formatCompactCount(content.storyLikes), hint: 'réactions cumulées' },
      { key: 'profileViews', icon: 'person-outline', label: 'Visites du profil', value: formatCompactCount(content.profileViews), hint: 'compteur canonique' },
      { key: 'scheduled', icon: 'time-outline', label: 'Posts programmés', value: formatCompactCount(content.scheduledPosts), hint: `${content.publishedScheduledPosts} publiés` },
      { key: 'offers', icon: 'lock-closed-outline', label: 'Contenus payants', value: formatCompactCount(content.paidOffers), hint: 'offres créées' },
      { key: 'sales', icon: 'cart-outline', label: 'Ventes de contenus', value: formatCompactCount(content.paidSales), hint: 'hors remboursements' },
      { key: 'revenue', icon: 'cash-outline', label: 'Revenu contenu', value: `${decimalValue(content.paidRevenueTwc)} TWC`, hint: 'net créateur' },
    ];

    return (
      <View style={styles.block}>
        <Text style={styles.blockTitle}>Signaux de contenu</Text>
        <Text style={styles.blockSubtitle}>Algorithme, stories, programmation et contenus payants · {periodLabel}</Text>
        <View style={styles.performanceGrid}>
          {items.map((item) => (
            <View key={item.key} style={[styles.performanceTile, { width: tablet ? '23.5%' : '48%' }]}>
              <View style={styles.performanceIcon}>
                <Ionicons name={item.icon as any} size={16} color={colors.accent} />
              </View>
              <Text style={styles.performanceValue}>{item.value}</Text>
              <Text style={styles.performanceLabel}>{item.label}</Text>
              <Text style={styles.performanceHint}>{item.hint}</Text>
            </View>
          ))}
        </View>
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
    const selectedActivity = inspectedHour !== null
      ? stats.activityData.find((item) => item.hour === inspectedHour) || null
      : null;
    const bestActivitySlots = [...stats.activityData]
      .filter((item) => sanitizeNumber(item.activity_score) > 0)
      .sort((a, b) => sanitizeNumber(b.activity_score) - sanitizeNumber(a.activity_score))
      .slice(0, 3);
    const algorithmHours = (creatorProfile?.bestHours || []).slice(0, 5);
    const audienceInsights = stats.deepInsights?.audience;

    const renderDistribution = (
      title: string,
      subtitle: string,
      rows: { label: string; count: number; percentage: number }[],
      emptyText: string,
    ) => (
      <View style={styles.block}>
        <Text style={styles.blockTitle}>{title}</Text>
        <Text style={styles.blockSubtitle}>{subtitle}</Text>
        {rows.length > 0 ? rows.map((row) => (
          <View key={row.label} style={styles.barRow}>
            <View style={styles.distributionHead}>
              <Text style={styles.barLabel}>{row.label}</Text>
              <Text style={styles.distributionPercent}>{row.percentage.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}%</Text>
            </View>
            <View style={styles.barLine}>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${Math.max(2, Math.min(100, row.percentage))}%`, backgroundColor: colors.cyan }]} />
              </View>
              <Text style={styles.barValue}>{formatCompactCount(row.count)}</Text>
            </View>
          </View>
        )) : (
          <Text style={styles.blockEmptyText}>{emptyText}</Text>
        )}
      </View>
    );

    return (
      <>
        {audienceInsights ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Audience engagée</Text>
            <Text style={styles.blockSubtitle}>Personnes distinctes ayant interagi avec tes contenus sur {periodLabel}</Text>
            <View style={styles.performanceGrid}>
              {[
                { label: 'Audience unique', value: audienceInsights.uniqueEngagedUsers, hint: 'personnes distinctes' },
                { label: 'Audience fidèle', value: audienceInsights.returningUsers, hint: 'au moins 2 interactions' },
                { label: 'Interactions', value: audienceInsights.totalInteractions, hint: 'tous types confondus' },
                { label: 'Interactions / personne', value: audienceInsights.interactionsPerUser, hint: 'moyenne observée' },
              ].map((item) => (
                <View key={item.label} style={[styles.performanceTile, { width: tablet ? '23.5%' : '48%' }]}>
                  <Text style={styles.performanceValue}>{Number(item.value).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}</Text>
                  <Text style={styles.performanceLabel}>{item.label}</Text>
                  <Text style={styles.performanceHint}>{item.hint}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

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
              onInteractionChange={setIsInspectingChart}
            />
          ) : (
            <Text style={styles.blockEmptyText}>
              Il faut davantage de données quotidiennes pour tracer l’évolution des abonnés.
            </Text>
          )}
        </View>

        <View style={styles.block}>
          <Text style={styles.blockTitle}>Activité de l’audience</Text>
          <Text style={styles.blockSubtitle}>
            Indice horaire calculé à partir des publications et interactions observées
          </Text>
          {hasActivity ? (
            <>
              <HourlyActivityChart
                data={stats.activityData}
                width={chartWidth}
                height={chartHeight}
                selectedHour={inspectedHour}
                onSelect={setInspectedHour}
                onInteractionChange={setIsInspectingChart}
              />

              {selectedActivity && (
                <View style={styles.selectedHourSummary}>
                  <View style={styles.selectedHourIcon}>
                    <Ionicons name="time-outline" size={18} color={colors.accent} />
                  </View>
                  <View style={styles.selectedHourCopy}>
                    <Text style={styles.selectedHourTitle}>
                      {selectedActivity.hour}h–{(selectedActivity.hour + 1) % 24}h
                    </Text>
                    <Text style={styles.selectedHourText}>
                      {formatCompactCount(selectedActivity.tweet_count)} publications · {formatCompactCount(selectedActivity.engagement_count)} interactions observées
                    </Text>
                  </View>
                  <View style={styles.selectedHourScore}>
                    <Text style={styles.selectedHourScoreValue}>{formatCompactCount(selectedActivity.activity_score)}</Text>
                    <Text style={styles.selectedHourScoreLabel}>indice</Text>
                  </View>
                </View>
              )}

              <Text style={styles.hourSectionLabel}>
                {algorithmHours.length > 0 ? 'Créneaux recommandés par l’algorithme' : 'Créneaux les plus actifs'}
              </Text>
              <View style={styles.bestHourList}>
                {(algorithmHours.length > 0 ? algorithmHours : bestActivitySlots).map((slot, index) => {
                  const hour = sanitizeNumber(slot.hour);
                  const algorithmSlot = 'avgEngagement' in slot;
                  const value = algorithmSlot
                    ? sanitizeNumber(slot.avgEngagement)
                    : sanitizeNumber(slot.activity_score);
                  const sample = algorithmSlot
                    ? sanitizeNumber(slot.tweets)
                    : sanitizeNumber(slot.tweet_count);
                  return (
                    <View key={`${hour}-${index}`} style={[styles.bestHourRow, index > 0 && styles.bestHourDivider]}>
                      <View style={[styles.bestHourRank, index === 0 && styles.bestHourRankFirst]}>
                        <Text style={[styles.bestHourRankText, index === 0 && styles.bestHourRankTextFirst]}>{index + 1}</Text>
                      </View>
                      <View style={styles.bestHourCopy}>
                        <Text style={styles.bestHourTime}>{hour}h–{(hour + 1) % 24}h</Text>
                        <Text style={styles.bestHourSample}>{formatCompactCount(sample)} publications analysées</Text>
                      </View>
                      <View style={styles.bestHourValueCopy}>
                        <Text style={styles.bestHourValue}>{formatCompactCount(value)}</Text>
                        <Text style={styles.bestHourValueLabel}>{algorithmSlot ? 'engagement moy.' : 'indice'}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          ) : (
            <Text style={styles.blockEmptyText}>
              Aucune activité mesurable n’est disponible sur cette période.
            </Text>
          )}
        </View>

        {audienceInsights ? renderDistribution(
          'Tranches d’âge',
          `Répartition déclarée · groupes de ${audienceInsights.privacyThreshold} personnes minimum`,
          audienceInsights.ageBands,
          `Pas encore assez de profils renseignés pour afficher une tranche sans identifier indirectement quelqu’un.`,
        ) : null}

        {audienceInsights ? renderDistribution(
          'Pays de l’audience',
          `Localisations consenties · groupes de ${audienceInsights.privacyThreshold} personnes minimum`,
          audienceInsights.countries,
          `Pas encore assez de localisations consenties pour afficher une zone de manière anonyme.`,
        ) : null}

        {audienceInsights ? renderDistribution(
          'Villes de l’audience',
          `Localisations consenties · groupes de ${audienceInsights.privacyThreshold} personnes minimum`,
          audienceInsights.cities,
          `Pas encore assez de localisations consenties pour afficher une ville de manière anonyme.`,
        ) : null}
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
              {renderPerformanceSnapshot()}
              {renderUsageInsights()}
              {renderAlgorithmInsights()}
              {renderBreakdown()}
            </>
          )}
          {selectedSection === 'content' && (
            <>
              {renderContentSignals()}
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
      scrollEnabled={!isInspectingChart}
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
  metricCardDisabled: {
    opacity: 0.42,
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
  hourBubble: {
    position: 'absolute',
    top: 4,
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  hourBubbleTitle: {
    color: colors.textPrimary,
    fontSize: 12,
    fontFamily: fonts.bold,
  },
  hourBubbleText: {
    marginTop: 1,
    color: colors.textSecondary,
    fontSize: 9.5,
    fontFamily: fonts.medium,
  },
  chartGestureHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 6,
  },
  chartGestureHintText: {
    color: colors.textMuted,
    fontSize: 10.5,
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
  blockSubtitle: {
    marginTop: 5,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: fonts.regular,
  },
  performanceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
  },
  performanceTile: {
    minHeight: 138,
    padding: 14,
    borderRadius: 15,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  performanceIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: colors.accentMuted,
  },
  performanceValue: {
    marginTop: 12,
    color: colors.textPrimary,
    fontSize: 21,
    lineHeight: 25,
    fontFamily: fonts.displayHeavy,
  },
  performanceLabel: {
    marginTop: 3,
    color: colors.textSecondary,
    fontSize: 11.5,
    fontFamily: fonts.semibold,
  },
  performanceHint: {
    marginTop: 3,
    color: colors.textMuted,
    fontSize: 9.5,
    lineHeight: 13,
    fontFamily: fonts.regular,
  },
  algorithmHeading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  algorithmTitleCopy: {
    flex: 1,
  },
  algorithmTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  algorithmBadge: {
    minWidth: 26,
    height: 19,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
    borderRadius: 999,
    backgroundColor: colors.accentMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(colors.accent, 0.5),
  },
  algorithmBadgeText: {
    color: colors.accentBright,
    fontSize: 9,
    letterSpacing: 0.6,
    fontFamily: fonts.bold,
  },
  algorithmMetricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  algorithmMetric: {
    width: '50%',
    minHeight: 78,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  algorithmMetricValue: {
    color: colors.textPrimary,
    fontSize: 20,
    fontFamily: fonts.displayHeavy,
  },
  algorithmMetricLabel: {
    marginTop: 3,
    color: colors.textMuted,
    fontSize: 10.5,
    fontFamily: fonts.medium,
  },
  algorithmTrend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  algorithmTrendCopy: {
    flex: 1,
  },
  algorithmTrendTitle: {
    color: colors.textPrimary,
    fontSize: 12.5,
    fontFamily: fonts.bold,
  },
  algorithmTrendText: {
    marginTop: 2,
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: fonts.regular,
  },
  factorList: {
    marginTop: 22,
  },
  factorSectionTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontFamily: fonts.bold,
  },
  factorRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  factorHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  factorLabel: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 13,
    fontFamily: fonts.semibold,
  },
  factorImpact: {
    fontSize: 12,
    fontFamily: fonts.bold,
  },
  factorTrack: {
    height: 5,
    overflow: 'hidden',
    marginTop: 9,
    borderRadius: 3,
    backgroundColor: colors.surfaceElevated,
  },
  factorFill: {
    height: '100%',
    borderRadius: 3,
  },
  factorExplain: {
    marginTop: 8,
    color: colors.textSecondary,
    fontSize: 11.5,
    lineHeight: 17,
    fontFamily: fonts.regular,
  },
  factorSample: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 9.5,
    fontFamily: fonts.medium,
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
  distributionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  distributionPercent: {
    color: colors.textSecondary,
    fontSize: 12,
    fontFamily: fonts.bold,
  },
  tweetQualityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 9,
  },
  tweetScoreBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.accentMuted,
  },
  tweetScoreText: {
    color: colors.accentBright,
    fontSize: 9.5,
    fontFamily: fonts.bold,
  },

  selectedHourSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginTop: 14,
    padding: 13,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  selectedHourIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: colors.accentMuted,
  },
  selectedHourCopy: {
    flex: 1,
  },
  selectedHourTitle: {
    color: colors.textPrimary,
    fontSize: 13,
    fontFamily: fonts.bold,
  },
  selectedHourText: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 10.5,
    lineHeight: 15,
    fontFamily: fonts.regular,
  },
  selectedHourScore: {
    alignItems: 'flex-end',
  },
  selectedHourScoreValue: {
    color: colors.textPrimary,
    fontSize: 18,
    fontFamily: fonts.displayHeavy,
  },
  selectedHourScoreLabel: {
    color: colors.textMuted,
    fontSize: 9,
    fontFamily: fonts.medium,
  },
  hourSectionLabel: {
    marginTop: 22,
    marginBottom: 8,
    color: colors.textSecondary,
    fontSize: 12,
    fontFamily: fonts.bold,
  },
  bestHourList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  bestHourRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  bestHourDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  bestHourRank: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    backgroundColor: colors.surface,
  },
  bestHourRankFirst: {
    backgroundColor: colors.accentMuted,
  },
  bestHourRankText: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: fonts.bold,
  },
  bestHourRankTextFirst: {
    color: colors.accentBright,
  },
  bestHourCopy: {
    flex: 1,
  },
  bestHourTime: {
    color: colors.textPrimary,
    fontSize: 13,
    fontFamily: fonts.semibold,
  },
  bestHourSample: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 10,
    fontFamily: fonts.regular,
  },
  bestHourValueCopy: {
    alignItems: 'flex-end',
  },
  bestHourValue: {
    color: colors.textPrimary,
    fontSize: 15,
    fontFamily: fonts.bold,
  },
  bestHourValueLabel: {
    marginTop: 1,
    color: colors.textMuted,
    fontSize: 8.5,
    fontFamily: fonts.medium,
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
