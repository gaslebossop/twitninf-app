// Types pour l'API TwitNin

// Types de base
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  errors?: string[];
}

// Types d'authentification
export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  fullName: string;
  password: string;
  platform?: 'ios' | 'android' | 'web';
}

export interface AuthData {
  token: string;
  refreshToken: string;
  user: User;
}

export interface AuthResponse extends ApiResponse<AuthData> {}

// Types utilisateur
export interface User {
  id: string;
  username: string;
  email: string;
  full_name: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  avatar?: string;
  /** Image de bannière profil (URL) */
  banner?: string | null;
  bio?: string | null;
  /** Ville affichée sur le profil (déclarative, distincte du consentement géoloc) */
  city?: string | null;
  verified: boolean;
  is_ios_native?: boolean;
  verification_style?: string;
  premium: boolean;
  /**
   * Langue de lecture des tweets traduits. `null` = jamais choisie : l'app
   * pose la question à la première connexion (voir LanguagePickerModal).
   */
  preferred_language?: string | null;
  /** Donnees privees, uniquement renvoyees sur /api/auth/me. */
  declared_age?: number | null;
  birth_day?: number | null;
  birth_month?: number | null;
  demographics_validated_at?: string | null;
  location_consent_status?: 'granted' | 'denied' | 'restricted' | 'unavailable' | 'undetermined';
  location_consent_updated_at?: string | null;
  /**
   * Consentement RGPD. `needs_consent` est calcule par le SERVEUR (il compare
   * la version acceptee au socle en vigueur) : c'est cette valeur qu'il faut
   * lire, jamais une comparaison de versions faite dans l'app.
   */
  consent_version?: string | null;
  consent_accepted_at?: string | null;
  consent_preferences?: Record<string, boolean>;
  consent_required_version?: string;
  needs_consent?: boolean;
  /** Palier d'abonnement payant (API) */
  subscription_tier?: 'free' | 'plus' | 'pro';
  subscription_expires_at?: string | null;
  /** Compte privé : tweets/profil visibles uniquement aux abonnés acceptés */
  is_private_account?: boolean;
  platform: 'ios' | 'android' | 'web';
  last_activity: string;
  id_notif?: string;
  is_active: boolean;
  email_verified: boolean;
  phone_verified: boolean;
  reset_password_token?: string;
  reset_password_expires?: string;
  stats: UserStats;
  preferences: UserPreferences;
  created_at: string;
  updated_at: string;
}

export interface UserStats {
  followers: number;
  following: number;
  tweets: number;
  likes: number;
}

export interface UserPreferences {
  language: string;
  theme: 'light' | 'dark';
  notifications: {
    push: boolean;
    email: boolean;
    sms: boolean;
  };
}

// Types pour les posts
export interface Post {
  id: string;
  content: string;
  user_id: string;
  user: User;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  is_liked: boolean;
  media?: PostMedia[];
  hashtags?: string[];
  mentions?: string[];
  created_at: string;
  updated_at: string;
}

export interface PostMedia {
  id: string;
  type: 'image' | 'video' | 'gif';
  url: string;
  thumbnail_url?: string;
  alt_text?: string;
}

export interface CreatePostRequest {
  content: string;
  media?: File[];
  hashtags?: string[];
  mentions?: string[];
}

// Types pour les commentaires
export interface Comment {
  id: string;
  content: string;
  user_id: string;
  post_id: string;
  user: User;
  likes_count: number;
  is_liked: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Les types Notification et SearchResponse sont définis plus bas avec les Tweet types ───

// Types pour la recherche
export interface SearchRequest {
  query: string;
  type: 'users' | 'posts' | 'hashtags';
  limit?: number;
  offset?: number;
}



// Types pour les erreurs
export interface ApiError {
  message: string;
  code?: string;
  field?: string;
  details?: any;
}

// Types pour les réponses paginées
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}

// Types pour les statistiques
export interface AppStats {
  total_users: number;
  total_posts: number;
  total_likes: number;
  active_users_today: number;
  new_users_today: number;
}

// Types pour les paramètres de requête
export interface QueryParams {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  search?: string;
  filter?: Record<string, any>;
}

// Types pour les uploads
export interface UploadResponse extends ApiResponse<{
  url: string;
  filename: string;
  size: number;
  type: string;
}> {}

// Types pour les websockets
export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: string;
}

export interface WebSocketEvent {
  event: string;
  data: any;
}

// Types pour les analytics
export interface AnalyticsData {
  date: string;
  value: number;
  label: string;
}

export interface UserAnalytics {
  posts_count: number;
  likes_received: number;
  followers_growth: AnalyticsData[];
  engagement_rate: number;
  top_posts: Post[];
}

// Types pour les paramètres de l'application
export interface AppSettings {
  maintenance_mode: boolean;
  registration_enabled: boolean;
  max_file_size: number;
  allowed_file_types: string[];
  rate_limits: {
    posts_per_hour: number;
    likes_per_hour: number;
    follows_per_hour: number;
  };
}

// Types pour les réponses d'erreur HTTP
export interface HttpErrorResponse {
  status: number;
  message: string;
  errors?: ApiError[];
  timestamp: string;
  path: string;
}

// Types pour les tokens
export interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

// Types pour les sessions
export interface Session {
  id: string;
  user_id: string;
  device_info: {
    platform: string;
    version: string;
    device_id: string;
  };
  ip_address: string;
  user_agent: string;
  is_active: boolean;
  last_activity: string;
  created_at: string;
}

// Types pour les rapports
export interface Report {
  id: string;
  reporter_id: string;
  reported_user_id?: string;
  reported_post_id?: string;
  reason: string;
  description?: string;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  moderator_notes?: string;
  created_at: string;
  updated_at: string;
}

// Types pour les badges et récompenses
export interface Badge {
  id: string;
  name: string;
  description: string;
  icon_url: string;
  category: string;
  criteria: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

export interface UserBadge {
  badge_id: string;
  user_id: string;
  earned_at: string;
  badge: Badge;
}

// Types pour les événements
export interface Event {
  id: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  location?: string;
  is_virtual: boolean;
  max_participants?: number;
  current_participants: number;
  organizer_id: string;
  organizer: User;
  participants: User[];
  created_at: string;
  updated_at: string;
}

/** Morceau Spotify attaché à un tweet (recherche via `GET /api/spotify/search`). */
export interface SpotifyTrack {
  id: string;
  name: string;
  artist: string | null;
  albumName: string | null;
  albumArt: string | null;
  previewUrl: string | null;
  externalUrl: string;
  durationMs: number | null;
}

// Types pour les tweets
export interface Tweet {
  id: string;
  content: string;
  user_id: string;
  author: User;
  parent_tweet_id?: string;
  original_tweet_id?: string;
  tweet_type: 'tweet' | 'reply' | 'retweet' | 'quote';
  is_retweet: boolean;
  is_quote: boolean;
  quote_content?: string;
  media_urls: string[];
  hashtags: string[];
  mentions: string[];
  urls: string[];
  location?: string;
  language: string;
  is_sensitive: boolean;
  is_pinned: boolean;
  is_private: boolean;
  view_count: number;
  click_count: number;
  moderation_status: 'pending' | 'approved' | 'rejected';
  moderation_reason?: string;
  /** « Traduction (bêta) » activée à la publication (option Pro) */
  translation_enabled?: boolean;
  /** Morceau Spotify attaché, s'il y en a un */
  spotify_track?: SpotifyTrack | null;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  // Compatibilité avec l'API
  created_at?: string;
  updated_at?: string;
  deleted_at?: string;
  // Nouvelles propriétés enrichies
  stats?: {
    likes: number;
    retweets: number;
    replies: number;
    views: number;
  };
  user_interaction?: {
    is_liked: boolean;
    is_retweeted: boolean;
    /** Super Cœur posé (pression longue, palier Pro) — distinct d'un like classique. */
    is_super_liked?: boolean;
  };
  parentTweet?: Tweet;
  /** Chaine de conversation ordonnee de la racine au parent direct. */
  thread_ancestors?: Tweet[];
}

export interface CreateTweetRequest {
  content: string;
  parent_tweet_id?: string;
  media_urls?: string[];
  is_private?: boolean;
  is_sensitive?: boolean;
  location?: string;
  language?: string;
  /** Réservé aux abonnés Pro : l'API refuse la publication (403) sinon */
  translation_enabled?: boolean;
  spotify_track?: SpotifyTrack | null;
}

/** Une version traduite d'un tweet, générée à la publication. */
export interface TweetTranslation {
  language: string;
  label: string;
  content: string;
  source_language?: string | null;
  model?: string | null;
  updated_at?: string;
}

/** Un compte proposé à l'inscription, avec de quoi juger s'il vaut le suivi. */
export interface OnboardingSuggestion {
  id: string;
  username: string;
  full_name: string;
  avatar?: string | null;
  bio?: string | null;
  verified?: boolean;
  premium?: boolean;
  followers: number;
  recent_tweets: number;
  recent_likes: number;
}

/**
 * Une finalité de traitement telle que décrite par le serveur. Les libellés
 * sont volontairement absents du code de l'app : voir `getConsentState`.
 */
export interface ConsentPurpose {
  key: string;
  title: string;
  summary: string;
  legalBasis?: 'contract' | 'consent' | 'legal_obligation' | 'legitimate_interest';
  /** Chemin relatif du document à lire, à résoudre contre l'URL de l'API. */
  documentPath?: string;
}

/** Traitement obligatoire, présenté comme information et non comme choix. */
export interface ConsentNotice {
  key: string;
  title: string;
  summary: string;
}

export interface ConsentState {
  version: string;
  minimum_age: number;
  /** Socle contractuel : refuser rend le compte inutilisable. */
  required: ConsentPurpose[];
  /** Finalités facultatives, refusables une par une. */
  optional: ConsentPurpose[];
  notices: ConsentNotice[];
  accepted_version: string | null;
  accepted_at: string | null;
  preferences: Record<string, boolean>;
  needs_consent: boolean;
}

/** Une langue proposée au lecteur ; `original: true` pour le français source. */
export interface ReadableLanguage {
  code: string;
  label: string;
  original: boolean;
}

export interface ReadingLanguageResponse extends ApiResponse<{
  preferred_language: string | null;
  languages: ReadableLanguage[];
}> {}

export interface BatchTranslationsResponse extends ApiResponse<{
  language: string;
  translations: Record<string, { language: string; label: string; content: string }>;
}> {}

export interface TweetTranslationsResponse extends ApiResponse<{
  tweet_id: string;
  source_language: string | null;
  translation_enabled: boolean;
  translations: TweetTranslation[];
}> {}

export interface UpdateTweetRequest {
  content: string;
  media_urls?: string[];
  is_private?: boolean;
  is_sensitive?: boolean;
}

export interface TweetLike {
  id: string;
  user_id: string;
  tweet_id: string;
  like_type: 'like' | 'love' | 'laugh' | 'wow' | 'sad' | 'angry';
  metadata?: any;
  created_at: string;
}

export interface TweetRetweet {
  id: string;
  user_id: string;
  tweet_id: string;
  retweet_type: 'retweet' | 'quote';
  comment?: string;
  metadata?: any;
  created_at: string;
}

export interface TweetStats {
  likes_count: number;
  retweets_count: number;
  replies_count: number;
  views_count: number;
  is_liked: boolean;
  is_retweeted: boolean;
}

// Types pour les notifications
export interface Notification {
  id: string;
  recipient_id: string;
  sender_id: string;
  tweet_id?: string;
  original_tweet_id?: string;
  type: 'like' | 'retweet' | 'reply' | 'mention' | 'follow' | 'unfollow' | 'quote' | 'system' | 'verification' | 'premium';
  title: string;
  message: string;
  content?: any;
  is_read: boolean;
  read_at?: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  metadata?: any;
  created_at: string;
  updated_at: string;
}

export interface NotificationWithRelations extends Notification {
  sender?: User;
  tweet?: Tweet;
}

export interface NotificationSettings {
  push: boolean;
  email: boolean;
  sms: boolean;
}

// Types pour la recherche
export interface SearchQuery {
  q: string;
  type?: string;
  limit?: number;
  offset?: number;
  sort?: string;
}

export interface UserSearchQuery extends SearchQuery {
  sort?: 'relevance' | 'followers' | 'latest' | 'verified';
  verified?: boolean;
}

export interface TweetSearchQuery extends SearchQuery {
  sort?: 'relevance' | 'latest' | 'popular' | 'trending';
  type?: 'all' | 'tweets' | 'replies' | 'retweets' | 'quotes';
  hashtag?: string;
  from_user?: string;
}

export interface HashtagSearchQuery extends SearchQuery {
  sort?: 'popularity' | 'recent' | 'alphabetical';
}

export interface TrendingQuery {
  limit?: number;
  period?: '1h' | '24h' | '7d' | '30d';
}

export interface SearchResults {
  users: User[];
  tweets: Tweet[];
  hashtags: Array<{ tag: string; count: number }>;
  total: number;
}

export interface TrendingHashtag {
  tag: string;
  count: number;
  total_views: number;
  recent_usage: string;
  trend_score: number;
}

// Types pour la pagination
export interface PaginationInfo {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// Types pour les réponses API étendues
export interface TweetsResponse extends ApiResponse<{
  tweets: Tweet[];
  pagination: PaginationInfo;
}> {}

export interface TweetResponse extends ApiResponse<Tweet> {}

export interface NotificationsResponse extends ApiResponse<{
  notifications: NotificationWithRelations[];
  unread_count: number;
  pagination: PaginationInfo;
}> {}

export interface SearchResponse extends ApiResponse<{
  query: string;
  type: string;
  results: SearchResults;
  pagination: PaginationInfo;
}> {}

export interface TrendingResponse extends ApiResponse<{
  period: string;
  hashtags: TrendingHashtag[];
  generated_at: string;
}> {}

// Types pour l'algorithme de recommandation
export interface RecommendationRequest {
  limit?: number;
  offset?: number;
  algorithm?: 'hybrid' | 'collaborative' | 'content' | 'popularity';
  includeUser?: boolean;
  includeStats?: boolean;
  forceRefresh?: boolean;
}

export interface RecommendationItem {
  id: string;
  tweet: Tweet;
  score: number;
  algorithm: string;
  reason: string;
  metadata?: {
    category?: string;
    trending_score?: number;
    user_affinity?: number;
    content_relevance?: number;
  };
}

export interface RecommendationResponse extends ApiResponse<{
  recommendations: RecommendationItem[];
  pagination: PaginationInfo;
  algorithm: string;
  timestamp: string;
}> {}

export interface RecommendationFeedback {
  tweetId: string;
  action: 'like' | 'dislike' | 'skip' | 'share' | 'bookmark';
  algorithm?: string;
  sessionId?: string;
}

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

export interface ProgressiveRecommendationResponse extends ApiResponse<{
  recommendations: ProgressiveRecommendationItem[];
  pagination: PaginationInfo;
  metadata: {
    userGroup: string;
    totalCandidates: number;
    algorithm: string;
    generatedAt: string;
  };
}> {}

export interface InteractionTrackingRequest {
  tweetId: string;
  interactionType: string;
  metadata?: Record<string, any>;
}

export interface InteractionTrackingResponse extends ApiResponse<{
  interaction: {
    tweetId: string;
    userId: string;
    type: string;
    score: number;
    metadata: any;
  };
  virality: any;
  timestamp: string;
}> {}

export interface ViralTweet {
  id: string;
  tweet: Tweet;
  viralScore: number;
  engagementRate: number;
  progressionLevel: string;
  author?: User;
}

export interface ViralTweetsResponse extends ApiResponse<{
  viralTweets: ViralTweet[];
  count: number;
  timestamp: string;
}> {}

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

export interface TweetViralityResponse extends ApiResponse<TweetViralityStats> {}

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

export interface UserInteractionResponse extends ApiResponse<UserInteractionStats> {}

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

export interface AlgorithmInfoResponse extends ApiResponse<AlgorithmInfo> {}

export interface UserSuggestion extends User {
  suggestion_score: number;
  suggestion_reasons: string[];
  mutual_follows_count: number;
  followers_count: number;
}

export interface UserSuggestionsResponse extends ApiResponse<UserSuggestion[]> {}

export interface RecommendationStats {
  total_recommendations: number;
  algorithm_performance: {
    hybrid: number;
    collaborative: number;
    content: number;
    popularity: number;
  };
  user_engagement: {
    likes: number;
    shares: number;
    bookmarks: number;
    skips: number;
  };
  cache_status: string;
  last_update: string;
}
