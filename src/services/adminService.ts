import apiService from './api';
import { 
  AdminUser, 
  AdminTweet, 
  ModerationAction, 
  BanRequest, 
  SuspendRequest, 
  TweetModerationRequest, 
  VerificationRequest, 
  AdminDashboardData,
  Report 
} from '../types/admin';

class AdminService {
  private baseUrl = '/admin';

  // Vérifier si l'utilisateur actuel est admin
  async checkAdminStatus(): Promise<boolean> {
    try {
      const response = await apiService.get(`${this.baseUrl}/status`);
      return response?.success || false;
    } catch (error) {
      console.error('Erreur lors de la vérification du statut admin:', error);
      return false;
    }
  }

  // Obtenir le tableau de bord d'administration
  async getDashboard(): Promise<AdminDashboardData | null> {
    try {
      const response = await apiService.get(`${this.baseUrl}/dashboard`);
      return response?.success ? response.data : null;
    } catch (error) {
      console.error('Erreur lors de la récupération du tableau de bord:', error);
      return null;
    }
  }

  // Gestion des utilisateurs
  async getUsers(params?: {
    page?: number;
    limit?: number;
    search?: string;
    role?: string;
    status?: 'active' | 'suspended' | 'banned';
  }): Promise<{ users: AdminUser[]; total: number } | null> {
    try {
      const response = await apiService.get(`${this.baseUrl}/users`, { params });
      return response?.success ? response.data : null;
    } catch (error) {
      console.error('Erreur lors de la récupération des utilisateurs:', error);
      return null;
    }
  }

  async getUserDetails(userId: string): Promise<AdminUser | null> {
    try {
      const response = await apiService.get(`${this.baseUrl}/users/${userId}`);
      return response?.success ? response.data : null;
    } catch (error) {
      console.error('Erreur lors de la récupération des détails utilisateur:', error);
      return null;
    }
  }

  async banUser(banRequest: BanRequest): Promise<boolean> {
    try {
      const response = await apiService.post(`${this.baseUrl}/users/ban`, banRequest);
      return response?.success || false;
    } catch (error) {
      console.error('Erreur lors du bannissement de l\'utilisateur:', error);
      return false;
    }
  }

  async suspendUser(suspendRequest: SuspendRequest): Promise<boolean> {
    try {
      const response = await apiService.post(`${this.baseUrl}/users/suspend`, suspendRequest);
      return response?.success || false;
    } catch (error) {
      console.error('Erreur lors de la suspension de l\'utilisateur:', error);
      return false;
    }
  }

  async unbanUser(userId: string): Promise<boolean> {
    try {
      const response = await apiService.post(`${this.baseUrl}/users/${userId}/unban`);
      return response?.success || false;
    } catch (error) {
      console.error('Erreur lors du débannissement de l\'utilisateur:', error);
      return false;
    }
  }

  async unsuspendUser(userId: string): Promise<boolean> {
    try {
      const response = await apiService.post(`${this.baseUrl}/users/${userId}/unsuspend`);
      return response?.success || false;
    } catch (error) {
      console.error('Erreur lors de la levée de suspension:', error);
      return false;
    }
  }

  // Gestion des tweets
  async getTweets(params?: {
    page?: number;
    limit?: number;
    search?: string;
    moderation_status?: string;
    is_eligible_for_recommendations?: boolean;
  }): Promise<{ tweets: AdminTweet[]; total: number } | null> {
    try {
      const response = await apiService.get(`${this.baseUrl}/tweets`, { params });
      return response?.success ? response.data : null;
    } catch (error) {
      console.error('Erreur lors de la récupération des tweets:', error);
      return null;
    }
  }

  async getTweetDetails(tweetId: string): Promise<AdminTweet | null> {
    try {
      const response = await apiService.get(`${this.baseUrl}/tweets/${tweetId}`);
      return response?.success ? response.data : null;
    } catch (error) {
      console.error('Erreur lors de la récupération des détails du tweet:', error);
      return null;
    }
  }

  async moderateTweet(moderationRequest: TweetModerationRequest): Promise<boolean> {
    try {
      const response = await apiService.post(`${this.baseUrl}/tweets/moderate`, moderationRequest);
      return response?.success || false;
    } catch (error) {
      console.error('Erreur lors de la modération du tweet:', error);
      return false;
    }
  }

  async setTweetRecommendationEligibility(tweetId: string, isEligible: boolean): Promise<boolean> {
    try {
      const response = await apiService.patch(`${this.baseUrl}/tweets/${tweetId}/recommendations`, {
        is_eligible_for_recommendations: isEligible
      });
      return response?.success || false;
    } catch (error) {
      console.error('Erreur lors de la modification de l\'éligibilité:', error);
      return false;
    }
  }

  // Gestion des vérifications
  async getVerificationRequests(params?: {
    page?: number;
    limit?: number;
    status?: string;
  }): Promise<{ requests: VerificationRequest[]; total: number } | null> {
    try {
      const response = await apiService.get(`${this.baseUrl}/verifications`, { params });
      return response?.success ? response.data : null;
    } catch (error) {
      console.error('Erreur lors de la récupération des demandes de vérification:', error);
      return null;
    }
  }

  async approveVerification(userId: string, notes?: string): Promise<boolean> {
    try {
      const response = await apiService.post(`${this.baseUrl}/verifications/${userId}/approve`, { notes });
      return response?.success || false;
    } catch (error) {
      console.error('Erreur lors de l\'approbation de la vérification:', error);
      return false;
    }
  }

  async rejectVerification(userId: string, notes?: string): Promise<boolean> {
    try {
      const response = await apiService.post(`${this.baseUrl}/verifications/${userId}/reject`, { notes });
      return response?.success || false;
    } catch (error) {
      console.error('Erreur lors du rejet de la vérification:', error);
      return false;
    }
  }

  // Gestion des rapports
  async getReports(params?: {
    page?: number;
    limit?: number;
    status?: string;
    priority?: string;
  }): Promise<{ reports: Report[]; total: number } | null> {
    try {
      const response = await apiService.get(`${this.baseUrl}/reports`, { params });
      return response?.success ? response.data : null;
    } catch (error) {
      console.error('Erreur lors de la récupération des rapports:', error);
      return null;
    }
  }

  async updateReportStatus(reportId: string, status: string, notes?: string): Promise<boolean> {
    try {
      const response = await apiService.patch(`${this.baseUrl}/reports/${reportId}`, { status, notes });
      return response?.success || false;
    } catch (error) {
      console.error('Erreur lors de la mise à jour du statut du rapport:', error);
      return false;
    }
  }

  async assignReport(reportId: string, moderatorId: string): Promise<boolean> {
    try {
      const response = await apiService.patch(`${this.baseUrl}/reports/${reportId}/assign`, { moderator_id: moderatorId });
      return response?.success || false;
    } catch (error) {
      console.error('Erreur lors de l\'assignation du rapport:', error);
      return false;
    }
  }

  // Historique des actions de modération
  async getModerationHistory(params?: {
    page?: number;
    limit?: number;
    moderator_id?: string;
    action_type?: string;
    target_type?: string;
  }): Promise<{ actions: ModerationAction[]; total: number } | null> {
    try {
      const response = await apiService.get(`${this.baseUrl}/moderation/history`, { params });
      return response?.success ? response.data : null;
    } catch (error) {
      console.error('Erreur lors de la récupération de l\'historique de modération:', error);
      return null;
    }
  }

  // Statistiques avancées
  async getAdvancedStats(period: '24h' | '7d' | '30d' | '90d'): Promise<any> {
    try {
      const response = await apiService.get(`${this.baseUrl}/stats/advanced`, { params: { period } });
      return response?.success ? response.data : null;
    } catch (error) {
      console.error('Erreur lors de la récupération des statistiques avancées:', error);
      return null;
    }
  }
}

export default new AdminService();
