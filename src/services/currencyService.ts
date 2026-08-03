import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG } from '../config/api';
import tokenStore from './tokenStore';

/**
 * Service pour gérer les informations de cryptomonnaie
 */
class CurrencyService {
  private static currencyId: string | null = null;

  /**
   * Récupérer l'ID de la cryptomonnaie TwitCoins
   */
  static async getTwitCoinsCurrencyId(): Promise<string> {
    // Utiliser le cache si disponible
    if (this.currencyId) {
      return this.currencyId;
    }

    try {
      const token = await tokenStore.getAccessToken();
      if (!token) {
        throw new Error('Token d\'authentification non trouvé');
      }

      const response = await fetch(`${API_CONFIG.BASE_URL}/api/virtual-currency/currency/NF`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Erreur lors de la récupération de la cryptomonnaie');
      }

      if (data.success && data.data && data.data.id) {
        this.currencyId = data.data.id;
        return this.currencyId;
      } else {
        throw new Error('ID de cryptomonnaie non trouvé dans la réponse');
      }
    } catch (error) {
      console.error('Erreur lors de la récupération de l\'ID de cryptomonnaie:', error);
      
      // Fallback: utiliser l'ID réel de TwitCoins
      // Cela permettra à l'app de fonctionner même si la récupération de l'ID échoue
      this.currencyId = '6371769b-57d1-4afd-abad-4001b20df5cc'; // ID NINFI en DB
      console.warn('Utilisation de l\'ID de cryptomonnaie par défaut:', this.currencyId);
      return this.currencyId;
    }
  }

  /**
   * Vider le cache de l'ID de cryptomonnaie
   */
  static clearCache(): void {
    this.currencyId = null;
  }
}

export default CurrencyService;
