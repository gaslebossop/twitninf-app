/**
 * Service frontend pour les presets de thèmes d'événements
 */

import { apiService } from './api';

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
    shadow: string;
    error: string;
    warning: string;
    success: string;
  };
  effects: {
    glow: boolean;
    shimmer: boolean;
    pulse: boolean;
    particles: boolean;
    sparkles: boolean;
  };
  preview: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    backgroundColor: string;
  };
}

export interface ThemePreview {
  id: string;
  name: string;
  description: string;
  icon: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  hasGlow: boolean;
  hasShimmer: boolean;
  hasPulse: boolean;
  hasParticles: boolean;
  hasSparkles: boolean;
}

class ThemePresetService {
  /**
   * Récupère tous les presets de thèmes disponibles
   */
  async getAvailablePresets(): Promise<ThemePreset[] | null> {
    try {
      await apiService.refreshToken();
      const response = await apiService.get('/api/theme-presets');
      return response?.data || null;
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des presets:', error);
      return null;
    }
  }

  /**
   * Récupère un preset de thème spécifique
   */
  async getPresetById(themeId: string): Promise<ThemePreset | null> {
    try {
      await apiService.refreshToken();
      const response = await apiService.get(`/api/theme-presets/${themeId}`);
      return response?.data || null;
    } catch (error) {
      console.error('❌ Erreur lors de la récupération du preset:', error);
      return null;
    }
  }

  /**
   * Récupère les informations de preview d'un thème
   */
  async getThemePreview(themeId: string): Promise<ThemePreview | null> {
    try {
      await apiService.refreshToken();
      const response = await apiService.get(`/api/theme-presets/${themeId}/preview`);
      return response?.data || null;
    } catch (error) {
      console.error('❌ Erreur lors de la récupération du preview:', error);
      return null;
    }
  }

  /**
   * Valide qu'un preset de thème existe
   */
  async isValidPreset(themeId: string): Promise<boolean> {
    try {
      const preset = await this.getPresetById(themeId);
      return preset !== null;
    } catch (error) {
      console.error('❌ Erreur lors de la validation du preset:', error);
      return false;
    }
  }

  /**
   * Récupère les presets avec cache local
   */
  private presetsCache: ThemePreset[] | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  async getPresetsWithCache(): Promise<ThemePreset[] | null> {
    const now = Date.now();
    
    // Vérifier si le cache est valide
    if (this.presetsCache && (now - this.cacheTimestamp) < this.CACHE_DURATION) {
      return this.presetsCache;
    }

    // Récupérer les presets depuis l'API
    const presets = await this.getAvailablePresets();
    
    if (presets) {
      this.presetsCache = presets;
      this.cacheTimestamp = now;
    }

    return presets;
  }

  /**
   * Vide le cache des presets
   */
  clearCache(): void {
    this.presetsCache = null;
    this.cacheTimestamp = 0;
  }
}

export const themePresetService = new ThemePresetService();
export default themePresetService;
