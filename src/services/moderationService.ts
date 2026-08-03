import { API_CONFIG } from '../config/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import tokenStore from './tokenStore';
import { buildClientHeaders } from './clientIdentity';

export interface Report {
  id: string;
  type: 'tweet' | 'user' | 'comment';
  reporterId: string;
  reporterName: string;
  targetId: string;
  targetName: string;
  reason: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'reviewing' | 'resolved' | 'dismissed';
  createdAt: string;
  priority: number;
}

export interface ModerationAction {
  id: string;
  type: 'ban' | 'suspend' | 'delete' | 'warn' | 'approve';
  targetType: 'user' | 'tweet' | 'comment';
  targetId: string;
  targetName: string;
  moderatorId: string;
  moderatorName: string;
  reason: string;
  duration?: number;
  createdAt: string;
  status: 'active' | 'expired' | 'reversed';
}

export interface User {
  id: string;
  username: string;
  fullName: string;
  email: string;
  avatar?: string;
  verified: boolean;
  status: 'active' | 'suspended' | 'banned';
  joinDate: string;
  lastSeen: string;
  followers: number;
  following: number;
  tweets: number;
  reports: number;
}

export interface Tweet {
  id: string;
  content: string;
  author: {
    id: string;
    username: string;
    full_name: string;
    avatar?: string;
    verified: boolean;
  };
  created_at: string;
  likes: number;
  retweets: number;
  replies: number;
  reports: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  moderation_status: 'pending' | 'reviewed' | 'approved' | 'rejected' | 'not_eligible';
  flags: string[];
}

export interface ModerationStats {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  bannedUsers: number;
  totalTweets: number;
  pendingTweets: number;
  totalReports: number;
  pendingReports: number;
  moderationActions: number;
}

class ModerationService {
  private baseUrl = `${API_CONFIG.BASE_URL}/api/moderation`;

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await tokenStore.getAccessToken();
    return {
      ...(await buildClientHeaders({ 'Content-Type': 'application/json' })),
      ...(token && { 'Authorization': `Bearer ${token}` })
    };
  }

  private async makeRequest(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      body?: any;
    } = {}
  ): Promise<any> {
    const { method = 'GET', body } = options;
    const url = `${this.baseUrl}${endpoint}`;
    const headers = await this.getAuthHeaders();

    const config: RequestInit = {
      method,
      headers,
    };

    if (body) {
      config.body = JSON.stringify(body);
    }

    try {
      console.log(`🌐 Modération API: ${method} ${url}`);
      console.log('🔑 Headers:', headers);
      if (body) {
        console.log('📦 Request Body:', JSON.stringify(body, null, 2));
      }
      
      const response = await fetch(url, config);
      
      console.log(`📡 Response Status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Erreur API modération:', response.status, errorText);
        throw new Error(`Erreur ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log('✅ Response Data:', JSON.stringify(data, null, 2));
      return data;
    } catch (error) {
      console.error('❌ Erreur lors de la requête de modération:', error);
      console.error('❌ Error Stack:', error.stack);
      throw error;
    }
  }

  // === GESTION DES SIGNALEMENTS ===
  async getReports(): Promise<Report[]> {
    try {
      console.log('🚩 Récupération de tous les signalements...');
      const response = await this.makeRequest('/reports?limit=1000&page=1');
      console.log('🚩 Reports response:', response);
      const reports = response.data?.reports || response.reports || response.data || [];
      console.log('🚩 Reports array:', reports);
      console.log('🚩 Reports type:', typeof reports);
      console.log('🚩 Reports length:', reports.length);
      return Array.isArray(reports) ? reports : [];
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des signalements:', error);
      return [];
    }
  }

  async resolveReport(reportId: string, action: 'resolve' | 'dismiss' | 'escalate', reason?: string): Promise<boolean> {
    try {
      const response = await this.makeRequest(`/reports/${reportId}/resolve`, {
        method: 'POST',
        body: { action, reason }
      });
      return response.success;
    } catch (error) {
      console.error('❌ Erreur lors de la résolution du signalement:', error);
      return false;
    }
  }

  // === GESTION DES UTILISATEURS ===
  async getUsers(): Promise<User[]> {
    try {
      console.log('🔍 Récupération de tous les utilisateurs...');
      const response = await this.makeRequest('/users?limit=1000&page=1');
      console.log('👥 Users response:', response);
      const users = response.data?.users || response.users || response.data || [];
      console.log('👥 Users array:', users);
      console.log('👥 Users type:', typeof users);
      console.log('👥 Users length:', users.length);
      return Array.isArray(users) ? users : [];
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des utilisateurs:', error);
      return [];
    }
  }

  async banUser(userId: string, reason: string, duration?: number, permanent?: boolean): Promise<boolean> {
    try {
      const response = await this.makeRequest(`/users/${userId}/ban`, {
        method: 'POST',
        body: { reason, duration, permanent }
      });
      return response.success;
    } catch (error) {
      console.error('❌ Erreur lors du bannissement:', error);
      return false;
    }
  }

  async suspendUser(userId: string, reason: string, duration: number): Promise<boolean> {
    try {
      const response = await this.makeRequest(`/users/${userId}/suspend`, {
        method: 'POST',
        body: { reason, duration }
      });
      return response.success;
    } catch (error) {
      console.error('❌ Erreur lors de la suspension:', error);
      return false;
    }
  }

  async unbanUser(userId: string): Promise<boolean> {
    try {
      const response = await this.makeRequest(`/users/${userId}/unban`, {
        method: 'POST'
      });
      return response.success;
    } catch (error) {
      console.error('❌ Erreur lors du débannissement:', error);
      return false;
    }
  }

  async unsuspendUser(userId: string): Promise<boolean> {
    try {
      const response = await this.makeRequest(`/users/${userId}/unsuspend`, {
        method: 'POST'
      });
      return response.success;
    } catch (error) {
      console.error('❌ Erreur lors de la réactivation:', error);
      return false;
    }
  }

  async verifyUser(userId: string): Promise<boolean> {
    try {
      const response = await this.makeRequest(`/users/${userId}/verify`, {
        method: 'POST'
      });
      return response.success;
    } catch (error) {
      console.error('❌ Erreur lors de la vérification:', error);
      return false;
    }
  }

  async unverifyUser(userId: string): Promise<boolean> {
    try {
      const response = await this.makeRequest(`/users/${userId}/unverify`, {
        method: 'POST'
      });
      return response.success;
    } catch (error) {
      console.error('❌ Erreur lors de la révocation de vérification:', error);
      return false;
    }
  }

  // === GESTION DU CONTENU ===
  async getTweets(): Promise<Tweet[]> {
    try {
      console.log('🐦 Récupération de tous les tweets...');
      const response = await this.makeRequest('/tweets?limit=50&page=1');
      console.log('🐦 Tweets response:', response);
      const tweets = response.data?.tweets || response.tweets || response.data || [];
      console.log('🐦 Tweets array:', tweets);
      console.log('🐦 Tweets type:', typeof tweets);
      console.log('🐦 Tweets length:', tweets.length);
      return Array.isArray(tweets) ? tweets : [];
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des tweets:', error);
      return [];
    }
  }

  async approveTweet(tweetId: string): Promise<boolean> {
    try {
      const response = await this.makeRequest(`/tweets/${tweetId}/approve`, {
        method: 'POST'
      });
      return response.success;
    } catch (error) {
      console.error('❌ Erreur lors de l\'approbation:', error);
      return false;
    }
  }

  async rejectTweet(tweetId: string, reason: string): Promise<boolean> {
    try {
      const response = await this.makeRequest(`/tweets/${tweetId}/reject`, {
        method: 'POST',
        body: { reason }
      });
      return response.success;
    } catch (error) {
      console.error('❌ Erreur lors du rejet:', error);
      return false;
    }
  }

  async deleteTweet(tweetId: string, reason: string): Promise<boolean> {
    try {
      const response = await this.makeRequest(`/tweets/${tweetId}`, {
        method: 'DELETE',
        body: { reason }
      });
      return response.success;
    } catch (error) {
      console.error('❌ Erreur lors de la suppression:', error);
      return false;
    }
  }

  async markTweetNotEligible(tweetId: string, reason: string): Promise<boolean> {
    try {
      const response = await this.makeRequest(`/tweets/${tweetId}/not-eligible`, {
        method: 'POST',
        body: { reason }
      });
      return response.success;
    } catch (error) {
      console.error('❌ Erreur lors du marquage comme non éligible:', error);
      return false;
    }
  }

  // === HISTORIQUE ET STATISTIQUES ===
  async getModerationHistory(): Promise<ModerationAction[]> {
    try {
      console.log('📜 Récupération de tout l\'historique...');
      const response = await this.makeRequest('/history?limit=1000&page=1');
      console.log('📜 History response:', response);
      const history = response.data?.history || response.history || response.data || [];
      console.log('📜 History array:', history);
      console.log('📜 History type:', typeof history);
      console.log('📜 History length:', history.length);
      return Array.isArray(history) ? history : [];
    } catch (error) {
      console.error('❌ Erreur lors de la récupération de l\'historique:', error);
      return [];
    }
  }

  async getModerationStats(): Promise<ModerationStats> {
    try {
      console.log('📊 Récupération des statistiques...');
      const response = await this.makeRequest('/stats');
      console.log('📊 Stats response:', response);
      const apiStats = response.data?.stats || response.stats || response.data || {};
      console.log('📊 Stats object:', apiStats);
      console.log('📊 Stats type:', typeof apiStats);
      
      // Mapper la structure de l'API vers l'interface ModerationStats
      const stats: ModerationStats = {
        totalUsers: apiStats.users?.total || 0,
        activeUsers: apiStats.users?.active || 0,
        suspendedUsers: apiStats.users?.suspended || 0,
        bannedUsers: apiStats.users?.banned || 0,
        totalTweets: apiStats.tweets?.total || 0,
        pendingTweets: apiStats.tweets?.pending || 0,
        totalReports: apiStats.reports?.total || 0,
        pendingReports: apiStats.reports?.pending || 0,
        moderationActions: apiStats.actions?.total || 0
      };
      
      console.log('📊 Mapped stats:', stats);
      return stats;
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des statistiques:', error);
      return {
        totalUsers: 0,
        activeUsers: 0,
        suspendedUsers: 0,
        bannedUsers: 0,
        totalTweets: 0,
        pendingTweets: 0,
        totalReports: 0,
        pendingReports: 0,
        moderationActions: 0
      };
    }
  }

  // === GESTION DES MODÉRATEURS ===
  async promoteModerator(userId: string, permissions: string[]): Promise<boolean> {
    try {
      const response = await this.makeRequest('/moderators', {
        method: 'POST',
        body: { userId, permissions }
      });
      return response.success;
    } catch (error) {
      console.error('❌ Erreur lors de la promotion:', error);
      return false;
    }
  }

  async updateModeratorPermissions(userId: string, permissions: string[]): Promise<boolean> {
    try {
      const response = await this.makeRequest(`/moderators/${userId}`, {
        method: 'PUT',
        body: { permissions }
      });
      return response.success;
    } catch (error) {
      console.error('❌ Erreur lors de la mise à jour des permissions:', error);
      return false;
    }
  }

  async demoteModerator(userId: string): Promise<boolean> {
    try {
      const response = await this.makeRequest(`/moderators/${userId}`, {
        method: 'DELETE'
      });
      return response.success;
    } catch (error) {
      console.error('❌ Erreur lors de la rétrogradation:', error);
      return false;
    }
  }

  // === GESTION DES TICKETS D'UNBAN ===
  async submitUnbanTicket(reason: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.makeRequest('/unban-tickets', {
        method: 'POST',
        body: { reason }
      });
      return response;
    } catch (error) {
      console.error('❌ Erreur lors de la soumission du ticket d\'unban:', error);
      throw error;
    }
  }

  async getUnbanTickets(status: string = 'pending'): Promise<any[]> {
    try {
      const response = await this.makeRequest(`/unban-tickets?status=${status}`);
      return response.data?.tickets || response.tickets || [];
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des tickets d\'unban:', error);
      return [];
    }
  }

  async processUnbanTicket(ticketId: string, status: 'approved' | 'rejected', adminNotes: string): Promise<boolean> {
    try {
      const response = await this.makeRequest(`/unban-tickets/${ticketId}`, {
        method: 'PUT',
        body: { status, admin_notes: adminNotes }
      });
      return response.success;
    } catch (error) {
      console.error('❌ Erreur lors du traitement du ticket d\'unban:', error);
      return false;
    }
  }
}

export const moderationService = new ModerationService();
