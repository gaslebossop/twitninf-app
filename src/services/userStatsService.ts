import apiService from './api';

export interface UserAnalytics {
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
}

export interface TweetAnalytics {
  id: string;
  content: string;
  views: number;
  likes: number;
  retweets: number;
  comments: number;
  shares: number;
  engagement_rate: number;
  created_at: string;
  performance_score: number;
}

export interface DailyStats {
  date: string;
  tweets: number;
  views: number;
  likes: number;
  retweets: number;
  comments: number;
  shares: number;
  followers_gained: number;
  profile_views: number;
  /**
   * Temps de lecture reellement chronometre sur les publications de ce compte
   * ce jour-la, en millisecondes. Servi par `/daily` depuis 2026-08-21 : il
   * n'existait avant qu'agrege A LA SEMAINE dans le pot createur, ce qui
   * interdisait toute courbe quotidienne.
   */
  dwell_ms: number;
  /**
   * Nombre de mesures de lecture du jour. Distingue « personne n'a lu » de
   * « personne n'etait instrumente » : sans lui, un zero est ambigu.
   */
  dwell_events: number;
  /** Ce que la plateforme a verse ce jour-la, dans la monnaie de plateforme. */
  earnings: number;
}

export interface ActivityData {
  hour: number;
  tweet_count: number;
  engagement_count: number;
  activity_score: number;
}

export interface EngagementBreakdown {
  likes: number;
  retweets: number;
  comments: number;
  shares: number;
  total: number;
}

export interface DeepInsights {
  behavior: {
    activeDays: number;
    loginSessions: number;
    devices: number;
    lastSessionAt: string | null;
    totalMinutes: number;
    averageActiveSeconds: number;
    screenViews: number;
    tweetsRead: number;
    profilesOpened: number;
    searches: number;
    bookmarks: number;
    sharesSent: number;
    mediaViews: number;
    contentPauses: number;
    contentReplays: number;
    fullscreenOpens: number;
    refreshes: number;
  };
  audience: {
    uniqueEngagedUsers: number;
    returningUsers: number;
    totalInteractions: number;
    interactionsPerUser: number;
    demographicsCoverage: number;
    ageBands: { label: string; count: number; percentage: number }[];
    countries: { label: string; code: string; count: number; percentage: number }[];
    cities: { label: string; code: string; count: number; percentage: number }[];
    privacyThreshold: number;
  };
  location: {
    consentStatus: 'granted' | 'denied' | 'restricted' | 'unavailable' | 'undetermined';
    capturedSessions: number;
    countries: number;
    regions: number;
    lastCapturedAt: string | null;
  };
  content: {
    storiesCreated: number;
    storyViews: number;
    storyLikes: number;
    profileViews: number;
    scheduledPosts: number;
    publishedScheduledPosts: number;
    paidOffers: number;
    paidSales: number;
    paidRevenueTwc: number;
    averageQualityScore: number;
    averageToxicityScore: number;
    algorithmicViews: number;
    algorithmEvaluations: number;
  };
  privateProfile: {
    declaredAge: number | null;
    birthDay: number | null;
    birthMonth: number | null;
    validated: boolean;
  };
}

export interface UserStatsResponse {
  analytics: UserAnalytics;
  dailyStats: DailyStats[];
  topTweets: TweetAnalytics[];
  activityData: ActivityData[];
  engagementBreakdown: EngagementBreakdown;
  deepInsights: DeepInsights | null;
  /** Monnaie de plateforme, resolue en base — jamais codee en dur cote app. */
  currency: { id: string; symbol: string; name: string } | null;
  weeklyGrowth: {
    week: string;
    followers: number;
    engagement: number;
    reach: number;
  }[];
}

class UserStatsService {
  private getSafeData<T = any>(response: any): T | null {
    if (!response?.success || !response?.data) return null;
    return response.data as T;
  }

  private buildFallbackOverviewFromData(input: {
    topTweets?: TweetAnalytics[];
    dailyStats?: DailyStats[];
    activityData?: ActivityData[];
    engagementBreakdown?: EngagementBreakdown;
  }): UserAnalytics {
    const topTweets = input.topTweets || [];
    const dailyStats = input.dailyStats || [];
    const activityData = input.activityData || [];
    const engagementBreakdown = input.engagementBreakdown;

    const sumFromTweets = topTweets.reduce(
      (acc, tweet) => {
        acc.views += Number(tweet.views || 0);
        acc.likes += Number(tweet.likes || 0);
        acc.retweets += Number(tweet.retweets || 0);
        acc.comments += Number(tweet.comments || 0);
        acc.shares += Number(tweet.shares || 0);
        return acc;
      },
      { views: 0, likes: 0, retweets: 0, comments: 0, shares: 0 }
    );

    const sumFromDaily = dailyStats.reduce(
      (acc, day) => {
        acc.views += Number(day.views || 0);
        acc.likes += Number(day.likes || 0);
        acc.retweets += Number(day.retweets || 0);
        acc.comments += Number(day.comments || 0);
        acc.shares += Number(day.shares || 0);
        return acc;
      },
      { views: 0, likes: 0, retweets: 0, comments: 0, shares: 0 }
    );

    const totalViews = sumFromDaily.views || sumFromTweets.views;
    const totalLikes = engagementBreakdown?.likes ?? (sumFromDaily.likes || sumFromTweets.likes);
    const totalRetweets = engagementBreakdown?.retweets ?? (sumFromDaily.retweets || sumFromTweets.retweets);
    const totalComments = engagementBreakdown?.comments ?? (sumFromDaily.comments || sumFromTweets.comments);
    const totalShares = engagementBreakdown?.shares ?? (sumFromDaily.shares || sumFromTweets.shares);
    const totalTweets = dailyStats.reduce((acc, day) => acc + Number(day.tweets || 0), 0) || topTweets.length;
    const totalEngagement = totalLikes + totalRetweets + totalComments + totalShares;

    const activityEngagement = activityData.reduce((acc, h) => acc + Number(h.engagement_count || 0), 0);
    const safeEngagement = totalEngagement || activityEngagement;

    return {
      totalTweets,
      totalViews,
      totalLikes,
      totalRetweets,
      totalComments,
      totalShares,
      followerCount: 0,
      followingCount: 0,
      profileViews: 0,
      engagementRate: totalViews > 0 ? Number(((safeEngagement / totalViews) * 100).toFixed(2)) : 0,
      averageViewsPerTweet: totalTweets > 0 ? Number((totalViews / totalTweets).toFixed(2)) : 0,
      reachGrowth: 0,
      engagementGrowth: 0,
    };
  }

  /**
   * Récupère les statistiques complètes d'un utilisateur
   */
  async getUserStats(userId: string, timeframe: '7d' | '30d' | '90d' | '1y' = '30d'): Promise<UserStatsResponse> {
    try {
      // Récupérer toutes les données en parallèle sans casser le flux si un endpoint tombe
      const [overviewResult, dailyResult, topTweetsResult, activityResult, engagementResult, deepResult] = await Promise.allSettled([
        apiService.get(`/api/user-stats/${userId}/overview?timeframe=${timeframe}`),
        apiService.get(`/api/user-stats/${userId}/daily?timeframe=${timeframe}`),
        apiService.get(`/api/user-stats/${userId}/top-tweets?timeframe=${timeframe}&limit=20`),
        apiService.get(`/api/user-stats/${userId}/activity?timeframe=${timeframe}`),
        apiService.get(`/api/user-stats/${userId}/engagement-breakdown?timeframe=${timeframe}`),
        apiService.get(`/api/user-stats/${userId}/deep-insights?timeframe=${timeframe}`)
      ]);

      const overviewResponse = overviewResult.status === 'fulfilled' ? overviewResult.value : null;
      const dailyResponse = dailyResult.status === 'fulfilled' ? dailyResult.value : null;
      const topTweetsResponse = topTweetsResult.status === 'fulfilled' ? topTweetsResult.value : null;
      const activityResponse = activityResult.status === 'fulfilled' ? activityResult.value : null;
      const engagementResponse = engagementResult.status === 'fulfilled' ? engagementResult.value : null;
      const deepResponse = deepResult.status === 'fulfilled' ? deepResult.value : null;

      const overviewData = this.getSafeData<{ analytics?: UserAnalytics }>(overviewResponse);
      const dailyData = this.getSafeData<{
        dailyStats?: DailyStats[];
        currency?: { id: string; symbol: string; name: string } | null;
      }>(dailyResponse);
      const topTweetsData = this.getSafeData<{ topTweets?: TweetAnalytics[] }>(topTweetsResponse);
      const activityDataRes = this.getSafeData<{ activityData?: ActivityData[] }>(activityResponse);
      const engagementData = this.getSafeData<{ engagementBreakdown?: EngagementBreakdown }>(engagementResponse);
      const deepInsights = this.getSafeData<DeepInsights>(deepResponse);

      const dailyStats = dailyData?.dailyStats || [];
      const topTweets = topTweetsData?.topTweets || [];
      const activityData = activityDataRes?.activityData || [];
      const engagementBreakdown = engagementData?.engagementBreakdown || {
        likes: 0,
        retweets: 0,
        comments: 0,
        shares: 0,
        total: 0,
      };

      const analytics =
        overviewData?.analytics ||
        this.buildFallbackOverviewFromData({
          topTweets,
          dailyStats,
          activityData,
          engagementBreakdown,
        });

      const hasAnyRealData =
        !!overviewData?.analytics ||
        !!deepInsights ||
        dailyStats.length > 0 ||
        topTweets.length > 0 ||
        activityData.length > 0 ||
        engagementBreakdown.total > 0;

      if (!hasAnyRealData) {
        throw new Error('Aucune donnee statistique reelle disponible');
      }

      return {
        analytics,
        dailyStats,
        topTweets,
        activityData,
        engagementBreakdown,
        deepInsights,
        currency: dailyData?.currency || null,
        // Aucun endpoint ne calcule encore une vraie croissance hebdomadaire
        // (voir `analytics.reachGrowth`/`engagementGrowth` toujours à 0 côté
        // API) : renvoyer des données simulées ICI les ferait passer pour
        // réelles aux yeux de l'écran de stats, alors que tout le reste de
        // cette réponse est authentique. Tableau vide plutôt qu'un mensonge.
        weeklyGrowth: [],
      };
    } catch (error) {
      console.error('Erreur lors de la récupération des statistiques utilisateur:', error);
      throw error;
    }
  }

  /**
   * Récupère les statistiques d'engagement d'un utilisateur
   */
  async getUserEngagementStats(userId: string, timeframe: string = '30d') {
    try {
      const response = await apiService.get(`/api/behavior/stats?timeframe=${timeframe}&userId=${userId}`);
      return response.data;
    } catch (error) {
      console.error('Erreur lors de la récupération des stats d\'engagement:', error);
      throw error;
    }
  }

  /**
   * Récupère les tweets les plus performants d'un utilisateur
   */
  async getTopPerformingTweets(userId: string, limit: number = 20, timeframe: string = '30d') {
    try {
      const response = await apiService.get(`/api/user-stats/${userId}/top-tweets?limit=${limit}&timeframe=${timeframe}`);
      return response.data;
    } catch (error) {
      console.error('Erreur lors de la récupération des top tweets:', error);
      throw error;
    }
  }

  /**
   * Récupère l'historique d'activité d'un utilisateur
   */
  async getUserActivityHistory(userId: string, timeframe: string = '30d') {
    try {
      const response = await apiService.get(`/api/user-stats/${userId}/activity?timeframe=${timeframe}`);
      return response.data;
    } catch (error) {
      console.error('Erreur lors de la récupération de l\'historique d\'activité:', error);
      throw error;
    }
  }

  /**
   * Récupère les tendances de croissance d'un utilisateur
   */
  async getUserGrowthTrends(userId: string, metric: 'followers' | 'engagement' | 'reach' = 'followers') {
    try {
      const response = await apiService.get(`/api/user-stats/${userId}/growth?metric=${metric}`);
      return response.data;
    } catch (error) {
      console.error('Erreur lors de la récupération des tendances de croissance:', error);
      throw error;
    }
  }

  /**
   * Récupère les heures d'activité optimales d'un utilisateur
   */
  async getOptimalPostingTimes(userId: string) {
    try {
      const response = await apiService.get(`/api/user-stats/${userId}/optimal-times`);
      return response.data;
    } catch (error) {
      console.error('Erreur lors de la récupération des heures optimales:', error);
      throw error;
    }
  }

  // Un bloc d'environ 190 lignes de generateurs de donnees simulees vivait ici
  // (`getMockUserStats` et ses huit auxiliaires). Il n'etait appele de nulle
  // part : `getUserStats` leve plutot que de retomber dessus, et le meme
  // fichier explique deja pourquoi — « renvoyer des donnees simulees ICI les
  // ferait passer pour reelles aux yeux de l'ecran de stats ». Retire avec la
  // refonte de l'ecran de statistiques du 2026-08-21, ou il obligeait a
  // inventer un `dwell_ms` et un `earnings` de plus.
}

export const userStatsService = new UserStatsService();
