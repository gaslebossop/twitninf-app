/**
 * 🚀 Service de Recommandation Progressive - TwitNin Legacy
 * 
 * Service frontend pour l'algorithme de recommandation progressive
 * basé sur la viralité avec expansion des groupes.
 * 
 * @author TwitNin Team
 * @version 1.0.0 - Progressive Recommendation Service
 * @license MIT
 */

import { apiService } from './api';
import { Tweet, User } from '../types/api';

// Types pour les recommandations progressives
export interface ProgressiveRecommendationRequest {
  limit?: number;
  offset?: number;
  includeUser?: boolean;
  includeStats?: boolean;
  group?: 'auto' | 'initial' | 'expansion' | 'viral' | 'massive';
}

export interface ProgressiveRecommendationItem {
  id: string;
  tweet: Tweet;
  progressiveScore: number;
  viralScore: number;
  recommendationLevel: number;
  timeDecay: number;
  similarityScore: number;
  interactions: {
    likes: number;
    comments: number;
    retweets: number;
    views: number;
    shares: number;
  };
  author?: User;
  metadata?: {
    category?: string;
    trending_score?: number;
    user_affinity?: number;
    content_relevance?: number;
  };
}

export interface ProgressiveRecommendationResponse {
  success: boolean;
  data: {
    recommendations: ProgressiveRecommendationItem[];
    pagination: {
      limit: number;
      offset: number;
      total: number;
      hasMore: boolean;
    };
    metadata: {
      userGroup: string;
      totalCandidates: number;
      algorithm: string;
      generatedAt: string;
    };
  };
  message?: string;
  error?: string;
}

export interface InteractionTrackingRequest {
  tweetId: string;
  interactionType: string;
  metadata?: Record<string, any>;
}

export interface InteractionTrackingResponse {
  success: boolean;
  data: {
    interaction: {
      tweetId: string;
      userId: string;
      type: string;
      score: number;
      metadata: any;
    };
    virality: any;
    timestamp: string;
  };
  message?: string;
  error?: string;
}

export interface ViralTweet {
  id: string;
  tweet: Tweet;
  viralScore: number;
  engagementRate: number;
  progressionLevel: string;
  author?: User;
}

export interface ViralTweetsResponse {
  success: boolean;
  data: {
    viralTweets: ViralTweet[];
    count: number;
    timestamp: string;
  };
  message?: string;
  error?: string;
}

export interface TweetViralityStats {
  tweetId: string;
  virality: {
    totalScore: number;
    positiveInteractions: number;
    negativeInteractions: number;
    engagementRate: number;
    progressionLevel: string;
    timeInCurrentLevel: number;
  };
  detailedScore: {
    baseScore: number;
    timeDecay: number;
    performanceMultiplier: number;
    extensionMultiplier: number;
    finalScore: number;
  };
  timestamp: string;
}

export interface TweetViralityResponse {
  success: boolean;
  data: TweetViralityStats;
  message?: string;
  error?: string;
}

export interface UserInteractionStats {
  userId: string;
  timeWindow: number;
  stats: {
    totalInteractions: number;
    positiveInteractions: number;
    negativeInteractions: number;
    interactionTypes: Record<string, number>;
    averageScore: number;
    topInteractions: Array<{
      type: string;
      count: number;
      score: number;
    }>;
  };
  timestamp: string;
}

export interface UserInteractionResponse {
  success: boolean;
  data: UserInteractionStats;
  message?: string;
  error?: string;
}

export interface AlgorithmInfo {
  algorithm: string;
  version: string;
  description: string;
  features: string[];
  groups: Record<string, {
    size: number;
    description: string;
    criteria: string;
    isUnlimited?: boolean;
  }>;
  interactionScores: {
    positive: Record<string, number>;
    negative: Record<string, number>;
  };
  thresholds: Record<string, number>;
  progression: Record<string, string>;
}

export interface AlgorithmInfoResponse {
  success: boolean;
  data: AlgorithmInfo;
  message?: string;
  error?: string;
}

class ProgressiveRecommendationService {
  private baseUrl = '/api/progressive-recommendations';

  /**
   * Obtient les recommandations progressives pour l'utilisateur connecté
   */
  async getProgressiveRecommendations(
    options: ProgressiveRecommendationRequest = {}
  ): Promise<ProgressiveRecommendationResponse> {
    try {
      console.log('🚀 Récupération des recommandations progressives...');
      
      const queryParams = new URLSearchParams();
      
      if (options.limit) queryParams.append('limit', options.limit.toString());
      if (options.offset) queryParams.append('offset', options.offset.toString());
      if (options.includeUser !== undefined) queryParams.append('includeUser', options.includeUser.toString());
      if (options.includeStats !== undefined) queryParams.append('includeStats', options.includeStats.toString());
      if (options.group) queryParams.append('group', options.group);

      const endpoint = `${this.baseUrl}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await apiService.request(endpoint, { method: 'GET', requiresAuth: true });
      
      console.log('✅ Recommandations progressives récupérées');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la récupération des recommandations progressives';
      console.error('❌ Erreur de récupération des recommandations progressives:', errorMessage);
      return {
        success: false,
        data: {
          recommendations: [],
          pagination: {
            limit: options.limit || 50,
            offset: options.offset || 0,
            total: 0,
            hasMore: false
          },
          metadata: {
            userGroup: 'unknown',
            totalCandidates: 0,
            algorithm: 'progressive_viral',
            generatedAt: new Date().toISOString()
          }
        },
        error: errorMessage
      };
    }
  }

  /**
   * Enregistre une interaction et met à jour la viralité
   */
  async trackInteraction(
    request: InteractionTrackingRequest
  ): Promise<InteractionTrackingResponse> {
    try {
      console.log(`📊 Tracking interaction: ${request.interactionType} sur tweet ${request.tweetId}`);
      
      const response = await apiService.request(
        `${this.baseUrl}/track-interaction`,
        {
          method: 'POST',
          body: JSON.stringify(request),
          requiresAuth: true
        }
      );
      
      console.log('✅ Interaction trackée avec succès');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors du tracking de l\'interaction';
      console.error('❌ Erreur de tracking d\'interaction:', errorMessage);
      return {
        success: false,
        data: {
          interaction: {
            tweetId: request.tweetId,
            userId: '',
            type: request.interactionType,
            score: 0,
            metadata: {}
          },
          virality: {},
          timestamp: new Date().toISOString()
        },
        error: errorMessage
      };
    }
  }

  /**
   * Obtient les tweets viraux en temps réel
   */
  async getViralTweets(limit: number = 20): Promise<ViralTweetsResponse> {
    try {
      console.log(`🔥 Récupération des tweets viraux (limite: ${limit})`);
      
      const response = await apiService.request(
        `${this.baseUrl}/viral-tweets?limit=${limit}`,
        { method: 'GET', requiresAuth: true }
      );
      
      console.log('✅ Tweets viraux récupérés');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la récupération des tweets viraux';
      console.error('❌ Erreur de récupération des tweets viraux:', errorMessage);
      return {
        success: false,
        data: {
          viralTweets: [],
          count: 0,
          timestamp: new Date().toISOString()
        },
        error: errorMessage
      };
    }
  }

  /**
   * Obtient les statistiques de viralité d'un tweet
   */
  async getTweetViralityStats(tweetId: string): Promise<TweetViralityResponse> {
    try {
      console.log(`📊 Récupération des statistiques de viralité pour le tweet ${tweetId}`);
      
      const response = await apiService.request(
        `${this.baseUrl}/tweet-virality/${tweetId}`,
        { method: 'GET', requiresAuth: true }
      );
      
      console.log('✅ Statistiques de viralité récupérées');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la récupération des statistiques de viralité';
      console.error('❌ Erreur de récupération des statistiques de viralité:', errorMessage);
      return {
        success: false,
        data: {
          tweetId,
          virality: {
            totalScore: 0,
            positiveInteractions: 0,
            negativeInteractions: 0,
            engagementRate: 0,
            progressionLevel: 'unknown',
            timeInCurrentLevel: 0
          },
          detailedScore: {
            baseScore: 0,
            timeDecay: 0,
            performanceMultiplier: 1,
            extensionMultiplier: 1,
            finalScore: 0
          },
          timestamp: new Date().toISOString()
        },
        error: errorMessage
      };
    }
  }

  /**
   * Obtient les statistiques d'interaction de l'utilisateur
   */
  async getUserInteractionStats(timeWindow: number = 24): Promise<UserInteractionResponse> {
    try {
      console.log(`👤 Récupération des statistiques d'interaction (${timeWindow}h)`);
      
      const response = await apiService.request(
        `${this.baseUrl}/user-interactions?timeWindow=${timeWindow}`,
        { method: 'GET', requiresAuth: true }
      );
      
      console.log('✅ Statistiques d\'interaction récupérées');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la récupération des statistiques d\'interaction';
      console.error('❌ Erreur de récupération des statistiques d\'interaction:', errorMessage);
      return {
        success: false,
        data: {
          userId: '',
          timeWindow,
          stats: {
            totalInteractions: 0,
            positiveInteractions: 0,
            negativeInteractions: 0,
            interactionTypes: {},
            averageScore: 0,
            topInteractions: []
          },
          timestamp: new Date().toISOString()
        },
        error: errorMessage
      };
    }
  }

  /**
   * Obtient les informations sur l'algorithme de recommandation progressive
   */
  async getAlgorithmInfo(): Promise<AlgorithmInfoResponse> {
    try {
      console.log('ℹ️ Récupération des informations de l\'algorithme');
      
      const response = await apiService.request(
        `${this.baseUrl}/algorithm-info`,
        { method: 'GET', requiresAuth: true }
      );
      
      console.log('✅ Informations de l\'algorithme récupérées');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la récupération des informations de l\'algorithme';
      console.error('❌ Erreur de récupération des informations de l\'algorithme:', errorMessage);
      return {
        success: false,
        data: {
          algorithm: 'Progressive Viral Recommendation',
          version: '1.0.0',
          description: 'Algorithme de recommandation basé sur la viralité progressive',
          features: [],
          groups: {},
          interactionScores: { positive: {}, negative: {} },
          thresholds: {},
          progression: {}
        },
        error: errorMessage
      };
    }
  }

  /**
   * Nettoie les caches du système de recommandation
   */
  async cleanupCache(): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      console.log('🧹 Nettoyage des caches des recommandations progressives');
      
      const response = await apiService.request(
        `${this.baseUrl}/cleanup-cache`,
        {
          method: 'POST',
          requiresAuth: true
        }
      );
      
      console.log('✅ Caches nettoyés avec succès');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors du nettoyage des caches';
      console.error('❌ Erreur de nettoyage des caches:', errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Méthode utilitaire pour normaliser les recommandations progressives en tweets
   */
  normalizeProgressiveRecommendationToTweet(rec: any): Tweet | null {
    try {
      // Les données de l'API progressif sont directement le tweet, pas imbriquées dans rec.tweet
      if (!rec || !rec.id) {
        console.warn('⚠️ Recommandation progressive invalide - pas d\'ID');
        return null;
      }

      const tweet = rec; // Les données sont directement le tweet
      
      // Validation des champs essentiels
      if (!tweet.id) {
        console.warn('⚠️ Recommandation progressive sans ID:', rec);
        return null;
      }

      // Accepter les retweets et tweets spéciaux même avec contenu vide
      const isRetweet = tweet.is_retweet || tweet.tweet_type === 'retweet';
      const isQuote = tweet.is_quote || tweet.tweet_type === 'quote';
      
      // Debug simplifié - seulement en cas d'erreur
      if (!tweet.content && !isRetweet && !isQuote) {
        console.warn('⚠️ Tweet sans contenu:', { id: tweet.id, isRetweet, isQuote });
      }
      
      // Vérifier le contenu seulement pour les tweets normaux (pas les retweets)
      if (!isRetweet && !isQuote && (!tweet.content || typeof tweet.content !== 'string' || tweet.content.trim().length === 0)) {
        console.warn('⚠️ Tweet normal sans contenu valide:', { id: tweet.id, content: tweet.content, isRetweet, isQuote });
        return null;
      }

      // Validation simplifiée de l'auteur - accepter même sans auteur complet
      if (!tweet.author) {
        console.warn('⚠️ Tweet sans auteur - création d\'un auteur par défaut');
        tweet.author = {
          id: tweet.user_id || 'unknown',
          username: 'unknown',
          full_name: 'Utilisateur inconnu',
          avatar: null,
          verified: false,
          verification_style: 'default',
          premium: false,
          stats: {}
        };
      } else {
        // S'assurer que le style de vérification est présent
        tweet.author.verification_style = tweet.author.verification_style || 'default';
      }

      // Retourner le tweet normalisé avec les métadonnées de recommandation
      const normalizedTweet = {
        ...tweet,
        // Ajouter les métadonnées de recommandation si nécessaire
        recommendationScore: rec.progressiveScore,
        viralScore: rec.viralScore,
        recommendationLevel: rec.recommendationLevel
      } as Tweet;
      
      // Log de succès seulement pour les premiers tweets
      if (Math.random() < 0.1) { // 10% des tweets seulement
        console.log('✅ Tweet normalisé:', normalizedTweet.id);
      }
      
      return normalizedTweet;
    } catch (error) {
      console.error('❌ Erreur lors de la normalisation de la recommandation progressive:', error);
      return null;
    }
  }

  /**
   * Méthode utilitaire pour obtenir le niveau de recommandation en texte
   */
  getRecommendationLevelText(level: number): string {
    switch (level) {
      case 0:
        return 'Aucune recommandation';
      case 1:
        return 'Groupe initial';
      case 2:
        return 'Groupe d\'expansion';
      case 3:
        return 'Groupe viral';
      case 4:
        return 'Groupe massif';
      default:
        return 'Niveau inconnu';
    }
  }

  /**
   * Méthode utilitaire pour obtenir la couleur du niveau de recommandation
   */
  getRecommendationLevelColor(level: number): string {
    switch (level) {
      case 0:
        return '#6B7280'; // Gris
      case 1:
        return '#3B82F6'; // Bleu
      case 2:
        return '#10B981'; // Vert
      case 3:
        return '#F59E0B'; // Orange
      case 4:
        return '#EF4444'; // Rouge
      default:
        return '#6B7280'; // Gris
    }
  }
}

// Export de l'instance singleton
export const progressiveRecommendationService = new ProgressiveRecommendationService();
export default progressiveRecommendationService;
