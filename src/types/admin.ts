// Types pour l'administration de l'application TwitNin

export interface AdminUser extends User {
  role: 'user' | 'moderator' | 'admin' | 'super_admin';
  is_suspended: boolean;
  ban_count: number;
  suspension_reason?: string;
  suspended_until?: string;
  last_moderation_action?: string;
  moderation_notes?: string;
}

export interface AdminTweet extends Tweet {
  moderation_status: 'pending' | 'approved' | 'rejected' | 'flagged';
  moderation_reason?: string;
  is_eligible_for_recommendations: boolean;
  moderation_notes?: string;
  flagged_by?: string[];
  flagged_at?: string;
  moderated_by?: string;
  moderated_at?: string;
}

export interface ModerationAction {
  id: string;
  moderator_id: string;
  moderator: AdminUser;
  target_type: 'user' | 'tweet' | 'comment';
  target_id: string;
  action_type: 'ban' | 'suspend' | 'warn' | 'flag' | 'approve' | 'reject';
  reason: string;
  duration?: number; // en heures
  notes?: string;
  created_at: string;
}

export interface BanRequest {
  user_id: string;
  reason: string;
  duration?: number; // en heures, undefined = permanent
  notes?: string;
}

export interface SuspendRequest {
  user_id: string;
  reason: string;
  duration: number; // en heures
  notes?: string;
}

export interface TweetModerationRequest {
  tweet_id: string;
  action: 'approve' | 'reject' | 'flag';
  reason?: string;
  is_eligible_for_recommendations?: boolean;
  notes?: string;
}

export interface VerificationRequest {
  user_id: string;
  status: 'pending' | 'approved' | 'rejected';
  documents?: string[];
  notes?: string;
  verified_by?: string;
  verified_at?: string;
}

export interface AdminStats {
  total_users: number;
  active_users: number;
  suspended_users: number;
  total_tweets: number;
  pending_moderation: number;
  flagged_tweets: number;
  total_reports: number;
  pending_reports: number;
}

export interface Report {
  id: string;
  reporter_id: string;
  reporter: AdminUser;
  reported_user_id?: string;
  reported_user?: AdminUser;
  reported_tweet_id?: string;
  reported_tweet?: AdminTweet;
  reason: string;
  description?: string;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  moderator_notes?: string;
  assigned_to?: string;
  assigned_moderator?: AdminUser;
  created_at: string;
  updated_at: string;
}

export interface AdminDashboardData {
  stats: AdminStats;
  recent_reports: Report[];
  pending_moderations: Array<{
    tweets: AdminTweet[];
    users: AdminUser[];
  }>;
  recent_actions: ModerationAction[];
}
