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
      const dailyData = this.getSafeData<{ dailyStats?: DailyStats[] }>(dailyResponse);
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
   * Récupère les métriques de monétisation d'un utilisateur
   */
  async getUserMonetizationStats(userId: string, period: string = 'month') {
    try {
      const response = await apiService.get(`/api/monetization/revenue?period=${period}`);
      return response.data;
    } catch (error) {
      console.error('Erreur lors de la récupération des stats de monétisation:', error);
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

  /**
   * Données simulées pour les tests et le développement
   */
  private getMockUserStats(timeframe: string): UserStatsResponse {
    const daysCount = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : timeframe === '90d' ? 90 : 365;
    
    return {
      analytics: {
        totalTweets: 1247,
        totalViews: 567890,
        totalLikes: 23456,
        totalRetweets: 4567,
        totalComments: 3456,
        totalShares: 1234,
        followerCount: 12567,
        followingCount: 456,
        profileViews: 8902,
        engagementRate: 4.2,
        averageViewsPerTweet: 455,
        reachGrowth: 12.5,
        engagementGrowth: 8.3,
      },
      dailyStats: this.generateMockDailyStats(daysCount),
      topTweets: this.getMockTopTweets(),
      activityData: this.getMockActivityData(),
      engagementBreakdown: {
        likes: 23456,
        retweets: 4567,
        comments: 3456,
        shares: 1234,
        total: 32713,
      },
      deepInsights: null,
      weeklyGrowth: this.getMockWeeklyGrowth(),
    };
  }

  private generateMockDailyStats(days: number): DailyStats[] {
    const stats: DailyStats[] = [];
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      
      const baseActivity = Math.sin((days - i) / days * Math.PI) * 50 + 50;
      
      stats.push({
        date: date.toISOString().split('T')[0],
        tweets: Math.floor(Math.random() * 8) + 2,
        views: Math.floor(baseActivity * 20) + Math.floor(Math.random() * 500) + 200,
        likes: Math.floor(baseActivity * 2) + Math.floor(Math.random() * 50) + 10,
        retweets: Math.floor(baseActivity * 0.4) + Math.floor(Math.random() * 15) + 2,
        comments: Math.floor(baseActivity * 0.6) + Math.floor(Math.random() * 20) + 5,
        shares: Math.floor(baseActivity * 0.2) + Math.floor(Math.random() * 8) + 1,
        followers_gained: Math.floor(Math.random() * 15) + 1,
        profile_views: Math.floor(baseActivity * 3) + Math.floor(Math.random() * 100) + 20,
      });
    }
    
    return stats;
  }

  private getMockTopTweets(): TweetAnalytics[] {
    return [
      {
        id: '1',
        content: 'Premier tweet viral avec beaucoup d\'engagement sur les nouvelles technologies et l\'IA...',
        views: 25678,
        likes: 1234,
        retweets: 234,
        comments: 123,
        shares: 67,
        engagement_rate: 6.8,
        created_at: '2024-01-15T10:30:00Z',
        performance_score: 94,
      },
      {
        id: '2',
        content: 'Deuxième tweet populaire sur les tendances tech et l\'avenir du développement...',
        views: 18456,
        likes: 987,
        retweets: 156,
        comments: 89,
        shares: 45,
        engagement_rate: 6.2,
        created_at: '2024-01-12T14:20:00Z',
        performance_score: 87,
      },
      {
        id: '3',
        content: 'Troisième tweet avec une belle discussion sur l\'innovation et les startups...',
        views: 12345,
        likes: 654,
        retweets: 98,
        comments: 145,
        shares: 32,
        engagement_rate: 5.4,
        created_at: '2024-01-08T16:45:00Z',
        performance_score: 81,
      },
      {
        id: '4',
        content: 'Quatrième tweet sur les bonnes pratiques en développement mobile...',
        views: 9876,
        likes: 432,
        retweets: 67,
        comments: 78,
        shares: 23,
        engagement_rate: 4.9,
        created_at: '2024-01-05T11:15:00Z',
        performance_score: 76,
      },
      {
        id: '5',
        content: 'Cinquième tweet partageant des insights sur l\'UX/UI design...',
        views: 8901,
        likes: 345,
        retweets: 45,
        comments: 56,
        shares: 19,
        engagement_rate: 4.3,
        created_at: '2024-01-02T09:30:00Z',
        performance_score: 72,
      },
    ];
  }

  private getMockActivityData(): ActivityData[] {
    const hours: ActivityData[] = [];
    
    for (let hour = 0; hour < 24; hour++) {
      let activityScore = 20;
      
      // Pics d'activité aux heures typiques
      if (hour >= 8 && hour <= 10) activityScore += 40;
      if (hour >= 12 && hour <= 14) activityScore += 50;
      if (hour >= 17 && hour <= 20) activityScore += 60;
      if (hour >= 21 && hour <= 23) activityScore += 30;
      
      // Ajouter de la variabilité
      activityScore += Math.random() * 20;
      
      hours.push({
        hour,
        tweet_count: Math.floor(activityScore / 10),
        engagement_count: Math.floor(activityScore / 5),
        activity_score: Math.floor(activityScore),
      });
    }
    
    return hours;
  }

  private getMockWeeklyGrowth() {
    const weeks = [];
    
    for (let i = 11; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - (i * 7));
      
      const weekNumber = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
      
      weeks.push({
        week: `S${weekNumber}`,
        followers: Math.floor(Math.random() * 200) + 50,
        engagement: Math.floor(Math.random() * 5000) + 1000,
        reach: Math.floor(Math.random() * 10000) + 2000,
      });
    }
    
    return weeks;
  }

  private getMockGrowthData() {
    return {
      followers: {
        current: 12567,
        previous: 11234,
        growth: 11.87,
        trend: 'up'
      },
      engagement: {
        current: 4.2,
        previous: 3.8,
        growth: 10.53,
        trend: 'up'
      },
      reach: {
        current: 567890,
        previous: 498234,
        growth: 13.98,
        trend: 'up'
      }
    };
  }

  private getMockOptimalTimes() {
    return {
      bestHours: [9, 12, 14, 18, 20],
      bestDays: ['monday', 'tuesday', 'wednesday', 'friday'],
      engagement_by_hour: {
        9: 85,
        12: 92,
        14: 78,
        18: 96,
        20: 88
      },
      recommendations: [
        'Postez entre 12h et 13h pour un engagement maximal',
        'Évitez les heures tardives (après 22h)',
        'Les lundis et mardis sont vos jours les plus performants'
      ]
    };
  }
}

export const userStatsService = new UserStatsService();
