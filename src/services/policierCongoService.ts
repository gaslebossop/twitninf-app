import { apiService } from './index';

export interface PolicierCongoInstruction {
  id: number;
  text: string;
  adminId: string;
  createdAt: string;
  status?: 'pending' | 'executed';
  executedAt?: string;
}

export interface PolicierCongoInstructionsResponse {
  success: boolean;
  instructions: {
    personality: PolicierCongoInstruction[];
    immediate_orders: PolicierCongoInstruction[];
  };
}

export interface PolicierCongoMemoryResponse {
  success: boolean;
  memory: {
    communityMood: string;
    priorities: string[];
    personalityProfile: any;
    lastActions: Array<any>;
    bigContexts: Array<any>;
    lastUpdated: string | null;
    lastAnalysis: any;
  };
}

class PolicierCongoService {
  /**
   * Récupère toutes les instructions
   */
  async getInstructions(): Promise<PolicierCongoInstructionsResponse> {
    try {
      return await apiService.get('/api/admin/policiercongo/instructions');
    } catch (error) {
      console.error('❌ Erreur getInstructions:', error);
      throw error;
    }
  }

  /**
   * Envoie une nouvelle instruction (immédiate ou de personnalité)
   */
  async sendInstruction(text: string, type: 'immediate' | 'personality'): Promise<{ success: boolean; message: string }> {
    try {
      return await apiService.post('/api/admin/policiercongo/instruct', { text, type });
    } catch (error) {
      console.error('❌ Erreur sendInstruction:', error);
      throw error;
    }
  }

  /**
   * Supprime une directive de personnalité
   */
  async deletePersonalityInstruction(id: number): Promise<{ success: boolean; message: string }> {
    try {
      return await apiService.delete(`/api/admin/policiercongo/personality/${id}`);
    } catch (error) {
      console.error('❌ Erreur deletePersonalityInstruction:', error);
      throw error;
    }
  }

  /**
   * Récupère le statut actuel du bot
   */
  async getStatus(): Promise<any> {
    try {
      return await apiService.get('/api/policiercongo/status');
    } catch (error) {
      console.error('❌ Erreur getStatus:', error);
      throw error;
    }
  }

  /**
   * Déclenche une analyse manuelle
   */
  async triggerAnalysis(): Promise<any> {
    try {
      return await apiService.post('/api/policiercongo/analyze');
    } catch (error) {
      console.error('❌ Erreur triggerAnalysis:', error);
      throw error;
    }
  }

  /**
   * Récupère la mémoire persistée (DB) pour la page admin.
   */
  async getMemory(): Promise<PolicierCongoMemoryResponse> {
    try {
      return await apiService.get('/api/admin/policiercongo/memory');
    } catch (error) {
      console.error('❌ Erreur getMemory:', error);
      throw error;
    }
  }

  /**
   * Récupère la mémoire V2 (PostgreSQL) complète.
   */
  async getV2Memory(): Promise<any> {
    try {
      return await apiService.get('/api/admin/policiercongo/memory/v2');
    } catch (error) {
      console.error('❌ Erreur getV2Memory:', error);
      throw error;
    }
  }
  /**
   * Récupère l'état du scheduler (prochain réveil du bot)
   */
  async getScheduler(): Promise<any> {
    try {
      return await apiService.get('/api/admin/policiercongo/scheduler');
    } catch (error) {
      console.error('❌ Erreur getScheduler:', error);
      throw error;
    }
  }

  /**
   * Réinitialise le scheduler (force le bot à se réveiller au prochain cycle)
   */
  async resetScheduler(): Promise<any> {
    try {
      return await apiService.delete('/api/admin/policiercongo/scheduler');
    } catch (error) {
      console.error('Error resetting scheduler:', error);
      throw error;
    }
  }

  async runAutomation(): Promise<any> {
    try {
      return await apiService.post('/api/admin/policiercongo/scheduler/run', {});
    } catch (error) {
      console.error('Error running automation:', error);
      throw error;
    }
  }
}

export const policierCongoService = new PolicierCongoService();
