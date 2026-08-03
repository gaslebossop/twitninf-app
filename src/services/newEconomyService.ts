import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG } from '../config/api';
import tokenStore from './tokenStore';

/** Intervalles de graphique disponibles côté API (NF et monnaies communautaires). */
export type ChartRange = '1h' | '24h' | '7d' | '30d';

export interface PurchasePackage {
  id: string;
  name: string;
  coins: number;
  originalPrice: number;
  currentPrice: string;
  bonusCoins: number;
  totalCoins: number;
  savings: number;
  pricePerCoin: string;
  popular: boolean;
}

export interface EconomicStatus {
  trend: 'stable' | 'rising' | 'falling';
  multiplier: number;
  bonus: number;
}

export interface PurchasePackagesResponse {
  packages: PurchasePackage[];
  economicStatus: EconomicStatus;
}

export interface WalletData {
  wallet: {
    id: string;
    balance: number;
    totalPurchased: number;
    totalSpent: number;
    loyaltyPoints: number;
    lastPurchaseDate: string | null;
  };
  currency: {
    id?: string;
    symbol: string;
    name: string;
    currentPrice: number;
    basePrice: number;
    economicTrend: 'stable' | 'rising' | 'falling';
  };
  user?: {
    username: string;
    email: string;
  };
}

export interface TransactionData {
  id: string;
  hash: string;
  type: string;
  amount: number;
  amountInEur: number;
  description: string;
  status: string;
  metadata: any;
  createdAt: string;
  confirmedAt: string;
  currency: {
    symbol: string;
    name: string;
  };
}

export interface UserCurrency {
  id: string;
  name: string;
  symbol: string;
  description?: string | null;
  color: string;
  priceEur: number;
  totalSupply: number;
  marketCap: number;
  isActive: boolean;
  createdAt: string;
  creator: { id: string; username: string; full_name?: string; avatar?: string } | null;
  /** Solde du demandeur sur cette monnaie. */
  holding: number;
}

export interface CurrencyHolder {
  userId: string;
  username: string;
  avatar?: string;
  balance: number;
  share: number;
}

export interface UserCurrencyDetail extends Omit<UserCurrency, 'totalSupply' | 'marketCap'> {
  priceNf: number | null;
  basePriceEur: number;
  changeSinceLaunch: number;
  issuedAtLaunch: number;
  circulatingSupply: number;
  mintedByTrading: number;
  marketCapEur: number;
  holders: CurrencyHolder[];
  holderCount: number;
  activity: { operations: number; volume: number; activeAccounts: number };
  priceSeries: { date: string; priceEur: number; trades: number }[];
  priceSeriesRange?: ChartRange;
}

export interface EconomicStats {
  currency: {
    symbol: string;
    name: string;
    currentPrice: number;
    basePrice: number;
    multiplier: number;
    trend: 'stable' | 'rising' | 'falling';
    purchaseBonus: number;
    priceChange24h: number;
    volume24h: number;
    marketCap: number;
    circulatingSupply: number;
  };
  priceHistory: Array<{
    date: string;
    price: number;
    volume: number;
    multiplier: number;
  }>;
}

class NewEconomyService {
  private static async getAuthToken(): Promise<string> {
    const token = await tokenStore.getAccessToken();
    if (!token) {
      throw new Error('Token d\'authentification non trouvé');
    }
    return token;
  }

  static async makeRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
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
   * Obtenir les packages d'achat disponibles
   */
  static async getPurchasePackages(currencyId: string): Promise<PurchasePackagesResponse> {
    try {
      const response = await NewEconomyService.makeRequest(`/api/new-economy/packages/${currencyId}`);
      return response.data;
    } catch (error) {
      console.error('Erreur lors de la récupération des packages:', error);
      throw error;
    }
  }

  /**
   * Acheter des TwitCoins
   */
  static async purchaseCoins(
    currencyId: string,
    packageId: string,
    paymentMethod: string
  ): Promise<any> {
    try {
      const response = await this.makeRequest('/api/new-economy/purchase', {
        method: 'POST',
        body: JSON.stringify({
          currencyId,
          packageId,
          paymentMethod
        })
      });
      return response.data;
    } catch (error) {
      console.error('Erreur lors de l\'achat:', error);
      throw error;
    }
  }

  /**
   * Dépenser des TwitCoins
   */
  static async spendCoins(
    currencyId: string,
    amount: number,
    itemType: string,
    itemId?: string,
    description?: string
  ): Promise<any> {
    try {
      const response = await this.makeRequest('/api/new-economy/spend', {
        method: 'POST',
        body: JSON.stringify({
          currencyId,
          amount,
          itemType,
          itemId,
          description
        })
      });
      return response.data;
    } catch (error) {
      console.error('Erreur lors de la dépense:', error);
      throw error;
    }
  }

  /**
   * Obtenir le portefeuille utilisateur
   */
  static async getUserWallet(currencyId: string): Promise<WalletData> {
    try {
      const response = await this.makeRequest(`/api/new-economy/wallet/${currencyId}`);
      return response.data;
    } catch (error) {
      console.error('Erreur lors de la récupération du portefeuille:', error);
      throw error;
    }
  }

  /**
   * Portefeuilles pour toutes les monnaies actives (NF + EUR interne).
   */
  static async getAllWallets(): Promise<WalletData[]> {
    try {
      const response = await this.makeRequest('/api/new-economy/wallets');
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.error('Erreur lors de la récupération des portefeuilles:', error);
      throw error;
    }
  }

  /**
   * Portefeuille NF courant.
   *
   * L'identifiant de la monnaie peut changer entre les bases locales et la
   * production. On le résout donc par symbole au lieu de conserver un UUID
   * codé en dur dans les écrans.
   */
  static async getNfWallet(): Promise<WalletData> {
    const wallets = await this.getAllWallets();
    const nfWallet = wallets.find(
      item => String(item?.currency?.symbol || '').trim().toUpperCase() === 'NF'
    );

    if (!nfWallet) {
      throw new Error('Portefeuille NF introuvable');
    }

    return nfWallet;
  }

  // === MONNAIES COMMUNAUTAIRES ===
  // Émises par des utilisateurs (10 000 NF), vivent dans la même table que
  // NF/EUR — mêmes routes que côté Windows (/api/currencies).

  static async getCurrencyPricing(): Promise<{ creationCostNf: number; initialSupply: number; minBasePriceEur: number; maxBasePriceEur: number; totalValueEur: number | null }> {
    const response = await this.makeRequest('/api/currencies/pricing');
    return response.data;
  }

  static async listUserCurrencies(): Promise<UserCurrency[]> {
    const response = await this.makeRequest('/api/currencies');
    return Array.isArray(response.data) ? response.data : [];
  }

  static async getUserCurrencyDetail(currencyId: string, range: ChartRange = '30d'): Promise<UserCurrencyDetail> {
    const response = await this.makeRequest(`/api/currencies/${currencyId}?range=${range}`);
    return response.data;
  }

  static async createUserCurrency(body: { name: string; symbol: string; description?: string; color?: string; basePriceEur?: number }): Promise<{ id: string; symbol: string; priceEur: number; totalSupply: number }> {
    const response = await this.makeRequest('/api/currencies', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return response.data;
  }

  /** `reverse: false` vend la monnaie communautaire contre `target`, `true` l'achète. */
  static async convertUserCurrency(currencyId: string, target: 'NF' | 'EUR', amount: number, reverse = false): Promise<{
    symbol: string; target: string; reverse: boolean; rate: number; debited: number; credited: number; fromBalance: number; toBalance: number;
  }> {
    const response = await this.makeRequest(`/api/currencies/${currencyId}/convert`, {
      method: 'POST',
      body: JSON.stringify({ target, amount, reverse }),
    });
    return response.data;
  }

  /**
   * Échange entre le portefeuille NF et le portefeuille EUR interne (parité fixe), taux réel courant.
   */
  static async exchangeCurrency(
    direction: 'NF_TO_EUR' | 'EUR_TO_NF',
    amount: number
  ): Promise<{ debited: number; credited: number; fromBalance: number; toBalance: number; rate: number }> {
    try {
      const response = await this.makeRequest('/api/new-economy/exchange', {
        method: 'POST',
        body: JSON.stringify({ direction, amount })
      });
      return response.data;
    } catch (error) {
      console.error('Erreur lors de l\'échange NF/EUR:', error);
      throw error;
    }
  }

  /**
   * Obtenir l'historique des transactions
   */
  static async getTransactionHistory(
    currencyId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{
    transactions: TransactionData[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  }> {
    try {
      const response = await this.makeRequest(
        `/api/new-economy/transactions/${currencyId}?page=${page}&limit=${limit}`
      );
      return response.data;
    } catch (error) {
      console.error('Erreur lors de la récupération de l\'historique:', error);
      throw error;
    }
  }

  /**
   * Obtenir les statistiques économiques
   */
  static async getEconomicStats(currencyId: string, range: ChartRange = '30d'): Promise<EconomicStats> {
    try {
      const response = await this.makeRequest(`/api/new-economy/stats/${currencyId}?range=${range}`);
      return response.data;
    } catch (error) {
      console.error('Erreur lors de la récupération des statistiques:', error);
      throw error;
    }
  }

  /**
   * Obtenir le classement des acheteurs
   */
  static async getPurchaseLeaderboard(
    currencyId: string,
    limit: number = 50
  ): Promise<any[]> {
    try {
      const response = await this.makeRequest(
        `/api/new-economy/leaderboard/${currencyId}?limit=${limit}`
      );
      return response.data.leaderboard;
    } catch (error) {
      console.error('Erreur lors de la récupération du classement:', error);
      throw error;
    }
  }

  /**
   * Formatage du nombre de TwitCoins
   */
  static formatCoins(amount: number): string {
    if (amount >= 1000000) {
      return `${(amount / 1000000).toFixed(1)}M`;
    } else if (amount >= 1000) {
      return `${(amount / 1000).toFixed(1)}k`;
    } else {
      return amount.toFixed(0);
    }
  }

  /**
   * Formatage du prix en euros
   */
  static formatPrice(amount: number): string {
    return `${amount.toFixed(2)}€`;
  }

  /**
   * Obtenir l'icône de tendance économique
   */
  static getTrendIcon(trend: 'stable' | 'rising' | 'falling'): string {
    switch (trend) {
      case 'rising':
        return '📈';
      case 'falling':
        return '📉';
      default:
        return '📊';
    }
  }

  /**
   * Obtenir la couleur de tendance économique
   */
  static getTrendColor(trend: 'stable' | 'rising' | 'falling'): string {
    switch (trend) {
      case 'rising':
        return '#10B981';
      case 'falling':
        return '#EF4444';
      default:
        return '#6B7280';
    }
  }
}

export default NewEconomyService;
