import { apiService as api } from './api';

export interface VirtualCurrency {
  id: string;
  name: string;
  symbol: string;
  currentPrice: number;
  priceChange24h: number;
  marketCap: number;
  volume24h: number;
  icon: string;
  color: string;
}

export interface UserWallet {
  id: string;
  balance: number;
  totalEarned: number;
  totalSpent: number;
  dailyMiningCount: number;
  lastMiningDate: string;
  isLocked: boolean;
}

export interface Transaction {
  id: string;
  transactionHash: string;
  amount: number;
  amountInEur: number;
  type: 'TRANSFER' | 'MINING' | 'PURCHASE' | 'REWARD' | 'REFUND' | 'SYSTEM';
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  description: string;
  fee: number;
  createdAt: string;
  confirmedAt: string;
  fromUser?: { username: string; avatar: string };
  toUser?: { username: string; avatar: string };
  currency: { name: string; symbol: string; icon: string; color: string };
}

export interface MiningResult {
  reward: number;
  newBalance: number;
  transaction: Transaction;
}

export interface TransferResult {
  transaction: Transaction;
  fee: number;
}

class VirtualCurrencyService {
  /**
   * Obtenir les informations d'une cryptomonnaie
   */
  static async getCurrency(symbol: string): Promise<VirtualCurrency> {
    const response = await api.get(`/virtual-currency/currency/${symbol}`);
    return response.data.data;
  }

  /**
   * Obtenir le portefeuille de l'utilisateur
   */
  static async getUserWallet(currencyId: string): Promise<{ wallet: UserWallet; currency: VirtualCurrency }> {
    const response = await api.get(`/virtual-currency/wallet/${currencyId}`);
    return response.data.data;
  }

  /**
   * Miner de la cryptomonnaie
   */
  static async mineCurrency(currencyId: string, action: string, amount?: number): Promise<MiningResult> {
    const response = await api.post('/virtual-currency/mine', {
      currencyId,
      action,
      amount
    });
    return response.data.data;
  }

  /**
   * Transférer de la cryptomonnaie (frais 20 % reversés à la trésorerie)
   */
  static async transferCurrency(
    toUserId: string,
    currencyId: string,
    amount: number,
    description?: string,
    amountCurrency: 'NF' | 'EUR' = 'NF'
  ): Promise<TransferResult> {
    const response = await api.post('/api/new-economy/transfer', {
      toUserId,
      currencyId,
      amount,
      description,
      amountCurrency
    });
    if (!response?.success) throw new Error(response?.message || 'Virement impossible');
    return response.data;
  }

  /**
   * Obtenir l'historique des transactions
   */
  static async getUserTransactions(
    currencyId?: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Transaction[]> {
    const params = new URLSearchParams();
    if (currencyId) params.append('currencyId', currencyId);
    params.append('limit', limit.toString());
    params.append('offset', offset.toString());

    const response = await api.get(`/virtual-currency/transactions?${params.toString()}`);
    return response.data.data;
  }

  /**
   * Obtenir le classement des utilisateurs
   */
  static async getLeaderboard(currencyId: string, limit: number = 100): Promise<any[]> {
    const response = await api.get(`/virtual-currency/leaderboard/${currencyId}?limit=${limit}`);
    return response.data.data;
  }

  /**
   * Acheter de la cryptomonnaie
   */
  static async purchaseCurrency(currencyId: string, amountEur: number): Promise<any> {
    const response = await api.post('/virtual-currency/purchase', {
      currencyId,
      amountEur
    });
    return response.data.data;
  }

  /**
   * Obtenir les statistiques de la cryptomonnaie
   */
  static async getCurrencyStats(currencyId: string): Promise<VirtualCurrency> {
    const response = await api.get(`/virtual-currency/currency/${currencyId}/stats`);
    return response.data.data;
  }

  /**
   * Calculer la valeur en euros d'un montant de cryptomonnaie
   */
  static calculateEurValue(amount: number, currentPrice: number): number {
    return amount * currentPrice;
  }

  /**
   * Formater un montant de cryptomonnaie
   */
  static formatAmount(amount: number, symbol: string): string {
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 8
    }).format(amount) + ' ' + symbol;
  }

  /**
   * Formater une valeur en euros
   */
  static formatEurValue(amount: number): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  }

  /**
   * Formater une date
   */
  static formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * Obtenir l'icône d'une transaction
   */
  static getTransactionIcon(type: string): string {
    switch (type) {
      case 'MINING':
        return 'hammer';
      case 'TRANSFER':
        return 'swap-horizontal';
      case 'PURCHASE':
        return 'card';
      case 'REWARD':
        return 'gift';
      case 'REFUND':
        return 'refresh';
      case 'SYSTEM':
        return 'settings';
      default:
        return 'ellipse';
    }
  }

  /**
   * Obtenir la couleur d'une transaction
   */
  static getTransactionColor(type: string): string {
    switch (type) {
      case 'MINING':
      case 'REWARD':
        return '#4CAF50';
      case 'TRANSFER':
        return '#2196F3';
      case 'PURCHASE':
        return '#FF9800';
      case 'REFUND':
        return '#9C27B0';
      case 'SYSTEM':
        return '#607D8B';
      default:
        return '#9E9E9E';
    }
  }

  /**
   * Vérifier si l'utilisateur peut miner
   */
  static canMine(dailyMiningCount: number, maxMiningPerDay: number): boolean {
    return dailyMiningCount < maxMiningPerDay;
  }

  /**
   * Calculer le pourcentage de minage quotidien utilisé
   */
  static getMiningProgress(dailyMiningCount: number, maxMiningPerDay: number): number {
    return (dailyMiningCount / maxMiningPerDay) * 100;
  }
}

export default VirtualCurrencyService;
