/**
 * Programme de monétisation côté frontend — candidature et statut.
 */

import { API_CONFIG } from '../config/api';
import tokenStore from './tokenStore';

export interface MonetizationProgramStats {
  views30d: number;
  followersCount: number;
  followerBehaviorScore: number;
}

export interface MonetizationProgramThresholds {
  views30d: number;
  followersCount: number;
  followerBehaviorScore: number;
}

export interface MonetizationProgramEligibility {
  stats: MonetizationProgramStats;
  thresholds: MonetizationProgramThresholds;
  criteria: {
    meetsViews: boolean;
    meetsFollowers: boolean;
    meetsBehavior: boolean;
  };
  meetsAllThresholds: boolean;
  hasActiveSubscription: boolean;
  programStatus: 'none' | 'pending' | 'approved' | 'rejected';
  appliedAt: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  canApply: boolean;
}

export interface MonetizationProgramApplication {
  id: string;
  username: string;
  fullName: string | null;
  avatar: string | null;
  verified: boolean;
  appliedAt: string;
  stats: MonetizationProgramStats;
  thresholds: MonetizationProgramThresholds;
}

class MonetizationProgramService {
  private static async makeRequest(endpoint: string, options: RequestInit = {}) {
    const token = await tokenStore.getAccessToken();
    if (!token) {
      throw new Error('Token d\'authentification non trouvé');
    }

    const response = await fetch(`${API_CONFIG.BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      },
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.message || `Erreur HTTP: ${response.status}`);
    }
    return body;
  }

  static async getStatus(): Promise<MonetizationProgramEligibility> {
    const response = await this.makeRequest('/api/monetization-program/status');
    return response.data;
  }

  static async apply(): Promise<void> {
    await this.makeRequest('/api/monetization-program/apply', { method: 'POST' });
  }

  static async listApplications(): Promise<MonetizationProgramApplication[]> {
    const response = await this.makeRequest('/api/monetization-program/admin/applications');
    return response.data;
  }

  static async reviewApplication(userId: string, decision: 'approve' | 'reject', reason?: string): Promise<void> {
    await this.makeRequest(`/api/monetization-program/admin/applications/${userId}/review`, {
      method: 'POST',
      body: JSON.stringify({ decision, reason }),
    });
  }
}

export default MonetizationProgramService;
