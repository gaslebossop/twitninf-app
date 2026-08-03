import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG } from '../config/api';
import CurrencyService from './currencyService';
import tokenStore from './tokenStore';

export interface WheelMode {
  id: string;
  label: string;
  hint: string;
  jackpotLabel: string;
  segments: string[];
  prizes: string[];
}

export interface SlotPaytableEntry {
  id: string;
  label: string;
  multiplier: number;
  chancePercent: number;
}

export interface CasinoConfig {
  minBet: number;
  maxBet: number;
  wheel?: { defaultMode: string; modes: WheelMode[] };
  coinflip?: { label: string; hint: string; winChance: number; pushChance: number; loseChance: number; winMultiplier: number };
  slots?: { label: string; hint: string; winChance: number; paytable: SlotPaytableEntry[] };
}

export interface CasinoResult {
  game: 'wheel' | 'coinflip' | 'slots';
  won: boolean;
  bet: number;
  payout: number;
  netProfit: number;
  newBalance: number;
  // roue
  mode?: string;
  modeLabel?: string;
  segmentIndex?: number;
  segment?: string;
  multiplier?: number;
  // pile ou face
  choice?: 'pile' | 'face';
  result?: string;
  outcome?: 'win' | 'push' | 'lose';
  // machine à sous
  reels?: { id: string; label: string }[];
  matchedSymbol?: string | null;
}

export interface CasinoHistoryRow {
  id: string;
  game: string;
  mode?: string;
  modeLabel?: string;
  betAmount: number;
  multiplier: number;
  won: boolean;
  payout: number;
  netProfit?: number;
  createdAt: string;
  choice?: string;
  result?: string;
  outcome?: string;
  reels?: { id: string; label: string }[];
}

class CasinoService {
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

    if (!response.ok || data?.success === false) {
      throw new Error(data?.message || 'Erreur lors de la requête casino');
    }

    return data;
  }

  static async getConfig(): Promise<CasinoConfig> {
    const response = await this.makeRequest('/api/casino/config');
    return response.data;
  }

  static async playWheel(amount: number, mode: string = 'classic'): Promise<CasinoResult> {
    const currencyId = await CurrencyService.getTwitCoinsCurrencyId();
    const response = await this.makeRequest('/api/casino/wheel', {
      method: 'POST',
      body: JSON.stringify({ currencyId, amount, mode }),
    });
    return response.data;
  }

  static async playCoinflip(amount: number, choice: 'pile' | 'face' = 'pile'): Promise<CasinoResult> {
    const currencyId = await CurrencyService.getTwitCoinsCurrencyId();
    const response = await this.makeRequest('/api/casino/coinflip', {
      method: 'POST',
      body: JSON.stringify({ currencyId, amount, choice }),
    });
    return response.data;
  }

  static async playSlots(amount: number): Promise<CasinoResult> {
    const currencyId = await CurrencyService.getTwitCoinsCurrencyId();
    const response = await this.makeRequest('/api/casino/slots', {
      method: 'POST',
      body: JSON.stringify({ currencyId, amount }),
    });
    return response.data;
  }

  static async getHistory(limit: number = 20): Promise<CasinoHistoryRow[]> {
    const response = await this.makeRequest(`/api/casino/history?limit=${limit}`);
    return response.data ?? [];
  }
}

export default CasinoService;
