// Export du service API principal
export { default as apiService } from './api';
export * from './push';

// Export du service de recommandation progressive
export { default as progressiveRecommendationService } from './progressiveRecommendationService';
export * from './progressiveRecommendationService';

// Export des types API
export type {
  // Types de base
  ApiResponse,
  
  // Types d'authentification
  LoginRequest,
  RegisterRequest,
  AuthData,
  AuthResponse,
  
  // Types utilisateur
  User,
  UserStats,
  UserPreferences,
  
  // Types pour les tweets
  Tweet,
  CreateTweetRequest,
  UpdateTweetRequest,
  TweetLike,
  TweetRetweet,
  TweetStats,
  
  // Types pour les notifications
  Notification,
  NotificationWithRelations,
  NotificationSettings,
  
  // Types pour la recherche
  SearchQuery,
  UserSearchQuery,
  TweetSearchQuery,
  HashtagSearchQuery,
  TrendingQuery,
  SearchResults,
  TrendingHashtag,
  
  // Types pour la pagination
  PaginationInfo,
  
  // Types pour les réponses API étendues
  TweetsResponse,
  TweetResponse,
  NotificationsResponse,
  SearchResponse,
  TrendingResponse,
  
  // Types pour les recommandations progressives
  ProgressiveRecommendationRequest,
  ProgressiveRecommendationItem,
  ProgressiveRecommendationResponse,
  InteractionTrackingRequest,
  InteractionTrackingResponse,
  ViralTweet,
  ViralTweetsResponse,
  TweetViralityStats,
  TweetViralityResponse,
  UserInteractionStats,
  UserInteractionResponse,
  AlgorithmInfo,
  AlgorithmInfoResponse,
} from '../types/api';
