import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG } from '../config/api';
import tokenStore from './tokenStore';

/**
 * Interface pour une transaction du portefeuille
 */
export interface WalletTransaction {
  id: string;
  type: 'received' | 'sent' | 'purchase' | 'reward' | 'bonus' | 'mining' | 'transfer';
  amount: number;
  description: string;
  date: string;
  status: 'completed' | 'pending' | 'failed' | 'cancelled';
  fromUserId?: string;
  toUserId?: string;
  fromUsername?: string;
  toUsername?: string;
  currencyId: string;
  currencySymbol: string;
  metadata?: {
    orderId?: string;
    packageName?: string;
    bonusType?: string;
    referenceId?: string;
    fee?: number;
    exchangeRate?: number;
  };
  txHash?: string; // Pour les futures implémentations blockchain
}

/**
 * Interface pour les statistiques du portefeuille
 */
export interface WalletStatistics {
  totalBalance: number;
  totalReceived: number;
  totalSent: number;
  totalPurchased: number;
  totalRewards: number;
  transactionCount: number;
  averageTransaction: number;
  monthlyChange: number;
  yearlyChange: number;
  mostActiveMonth: string;
  biggestTransaction: number;
  lastActivityDate: string;
}

/**
 * Interface pour les filtres de transaction
 */
export interface TransactionFilters {
  type?: WalletTransaction['type'][];
  status?: WalletTransaction['status'][];
  dateFrom?: string;
  dateTo?: string;
  amountMin?: number;
  amountMax?: number;
  userId?: string;
  currencyId?: string;
  limit?: number;
  offset?: number;
}

/**
 * Service pour gérer le portefeuille et les transactions
 */
class WalletService {
  private static async getAuthToken(): Promise<string> {
    const token = await tokenStore.getAccessToken();
    if (!token) {
      throw new Error('Token d\'authentification non trouvé');
    }
    return token;
  }

  private static async makeRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
    const token = await this.getAuthToken();
    
    const response = await fetch(`${API_CONFIG.BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      },
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Erreur lors de la requête');
    }

    return data;
  }

  /**
   * Récupérer l'historique des transactions
   */
  static async getTransactionHistory(currencyId: string, filters: TransactionFilters = {}): Promise<{
    transactions: WalletTransaction[];
    total: number;
    hasMore: boolean;
  }> {
    try {
      const queryParams = new URLSearchParams();
      
      if (filters.type && filters.type.length > 0) {
        queryParams.append('type', filters.type.join(','));
      }
      if (filters.status && filters.status.length > 0) {
        queryParams.append('status', filters.status.join(','));
      }
      if (filters.dateFrom) {
        queryParams.append('dateFrom', filters.dateFrom);
      }
      if (filters.dateTo) {
        queryParams.append('dateTo', filters.dateTo);
      }
      if (filters.amountMin !== undefined) {
        queryParams.append('amountMin', filters.amountMin.toString());
      }
      if (filters.amountMax !== undefined) {
        queryParams.append('amountMax', filters.amountMax.toString());
      }
      if (filters.limit) {
        queryParams.append('limit', filters.limit.toString());
      }
      if (filters.offset) {
        queryParams.append('offset', filters.offset.toString());
      }

      const endpoint = `/api/wallet/transactions/${currencyId}?${queryParams.toString()}`;
      const data = await this.makeRequest(endpoint);

      return {
        transactions: data.data.transactions || [],
        total: data.data.total || 0,
        hasMore: data.data.hasMore || false,
      };
    } catch (error) {
      console.error('Erreur lors de la récupération des transactions:', error);
      throw error;
    }
  }

  /**
   * Récupérer les statistiques détaillées du portefeuille
   */
  static async getWalletStatistics(currencyId: string, period = '1y'): Promise<WalletStatistics> {
    try {
      const endpoint = `/api/wallet/statistics/${currencyId}?period=${period}`;
      const data = await this.makeRequest(endpoint);

      return data.data;
    } catch (error) {
      console.error('Erreur lors de la récupération des statistiques:', error);
      throw error;
    }
  }

  /**
   * Exporter l'historique des transactions
   */
  static async exportTransactions(currencyId: string, format: 'csv' | 'pdf' | 'json' = 'csv', filters: TransactionFilters = {}): Promise<{
    downloadUrl: string;
    filename: string;
  }> {
    try {
      const data = await this.makeRequest(`/api/wallet/export/${currencyId}`, {
        method: 'POST',
        body: JSON.stringify({ format, filters }),
      });

      return {
        downloadUrl: data.data.downloadUrl,
        filename: data.data.filename,
      };
    } catch (error) {
      console.error('Erreur lors de l\'export des transactions:', error);
      throw error;
    }
  }

  /**
   * Rechercher des transactions par texte
   */
  static async searchTransactions(currencyId: string, query: string, limit = 20): Promise<WalletTransaction[]> {
    try {
      const endpoint = `/api/wallet/search/${currencyId}?q=${encodeURIComponent(query)}&limit=${limit}`;
      const data = await this.makeRequest(endpoint);

      return data.data.transactions || [];
    } catch (error) {
      console.error('Erreur lors de la recherche de transactions:', error);
      throw error;
    }
  }

  /**
   * Obtenir une transaction spécifique
   */
  static async getTransaction(transactionId: string): Promise<WalletTransaction> {
    try {
      const endpoint = `/api/wallet/transaction/${transactionId}`;
      const data = await this.makeRequest(endpoint);

      return data.data;
    } catch (error) {
      console.error('Erreur lors de la récupération de la transaction:', error);
      throw error;
    }
  }

  /**
   * Marquer une transaction comme lue
   */
  static async markTransactionAsRead(transactionId: string): Promise<void> {
    try {
      await this.makeRequest(`/api/wallet/transaction/${transactionId}/read`, {
        method: 'POST',
      });
    } catch (error) {
      console.error('Erreur lors du marquage de la transaction:', error);
      throw error;
    }
  }

  /**
   * Obtenir le résumé mensuel des transactions
   */
  static async getMonthlySummary(currencyId: string, year: number): Promise<{
    month: number;
    received: number;
    sent: number;
    purchased: number;
    transactionCount: number;
  }[]> {
    try {
      const endpoint = `/api/wallet/summary/${currencyId}?year=${year}`;
      const data = await this.makeRequest(endpoint);

      return data.data.summary || [];
    } catch (error) {
      console.error('Erreur lors de la récupération du résumé mensuel:', error);
      throw error;
    }
  }

  /**
   * Formater un montant avec la devise
   */
  static formatAmount(amount: number, currencySymbol = 'TWC', showSign = false): string {
    const sign = showSign ? (amount >= 0 ? '+' : '') : '';
    return `${sign}${amount.toFixed(2)} ${currencySymbol}`;
  }

  /**
   * Formater une date relative
   */
  static formatRelativeDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInHours = diffInMs / (1000 * 60 * 60);
    const diffInDays = diffInHours / 24;

    if (diffInHours < 1) {
      return 'À l\'instant';
    } else if (diffInHours < 24) {
      return `Il y a ${Math.floor(diffInHours)}h`;
    } else if (diffInDays < 7) {
      return `Il y a ${Math.floor(diffInDays)}j`;
    } else if (diffInDays < 30) {
      return `Il y a ${Math.floor(diffInDays / 7)} semaine${Math.floor(diffInDays / 7) > 1 ? 's' : ''}`;
    } else {
      return date.toLocaleDateString('fr-FR', { 
        day: '2-digit', 
        month: 'short',
        year: diffInDays > 365 ? 'numeric' : undefined
      });
    }
  }

  /**
   * Obtenir l'icône pour un type de transaction
   */
  static getTransactionIcon(type: WalletTransaction['type']): string {
    const icons = {
      received: 'arrow-down-circle',
      sent: 'arrow-up-circle',
      purchase: 'card',
      reward: 'trophy',
      bonus: 'gift',
      mining: 'hardware-chip',
      transfer: 'swap-horizontal',
    };
    return icons[type] || 'swap-horizontal';
  }

  /**
   * Obtenir la couleur pour un type de transaction
   */
  static getTransactionColor(type: WalletTransaction['type'], isIncoming = true): string {
    if (type === 'sent') return '#EF4444';
    if (type === 'received' || type === 'reward' || type === 'bonus' || type === 'purchase' || type === 'mining') {
      return '#10B981';
    }
    return '#6B7280';
  }
}

export default WalletService;
