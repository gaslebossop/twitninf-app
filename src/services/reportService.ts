import { API_CONFIG } from '../config/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import tokenStore from './tokenStore';
import { buildClientHeaders } from './clientIdentity';

export type ReportTargetType = 'tweet' | 'user' | 'comment';

export type ReportCategoryKey =
  | 'spam' | 'harassment' | 'hate_speech' | 'violence' | 'sexual_content'
  | 'child_safety' | 'self_harm' | 'impersonation' | 'privacy'
  | 'misinformation' | 'illegal' | 'other';

export interface ReportCategory {
  key: ReportCategoryKey;
  label: string;
  description: string;
  requiresDetails: boolean;
  supportResources: boolean;
}

export interface Report {
  id: string;
  target_id: string;
  target_type: ReportTargetType;
  category?: ReportCategoryKey;
  category_label?: string;
  reason: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'investigating' | 'resolved' | 'dismissed';
  created_at: string;
  resolved_at?: string | null;
  reporter?: {
    id: string;
    username: string;
    full_name: string;
    avatar?: string;
  };
  target?: any;
}

export interface CreateReportData {
  target_id: string;
  target_type: ReportTargetType;
  category: ReportCategoryKey;
  details?: string;
}

export interface CreateReportResult {
  ok: boolean;
  /** Déjà signalé par cet utilisateur, ou quota atteint : à distinguer d'une panne. */
  alreadyReported?: boolean;
  rateLimited?: boolean;
  /** Catégories de détresse : afficher des ressources d'aide, pas un simple merci. */
  supportResources?: boolean;
  message?: string;
}

export interface UpdateReportData {
  status: 'pending' | 'investigating' | 'resolved' | 'dismissed';
  moderator_notes?: string;
  resolution_action?: 'none' | 'warn' | 'suspend' | 'ban' | 'delete';
  resolution_reason?: string;
}

/**
 * Repli local de la taxonomie.
 *
 * La source de vérité est le serveur (`GET /report-categories`) pour que
 * l'ajout d'une catégorie ne demande pas une mise à jour de l'app. Cette
 * copie ne sert qu'en cas d'échec réseau : sans elle, une coupure rendrait
 * le signalement totalement impossible.
 */
export const FALLBACK_CATEGORIES: ReportCategory[] = [
  { key: 'spam', label: 'Spam ou arnaque', description: 'Publicité répétée, faux concours, lien frauduleux', requiresDetails: false, supportResources: false },
  { key: 'harassment', label: 'Harcèlement ou intimidation', description: 'Attaques répétées, menaces visant une personne', requiresDetails: false, supportResources: false },
  { key: 'hate_speech', label: 'Haine ou discrimination', description: 'Propos visant une origine, une religion, une orientation, un handicap', requiresDetails: false, supportResources: false },
  { key: 'violence', label: 'Violence ou menaces', description: 'Menace de violence, apologie ou incitation', requiresDetails: false, supportResources: false },
  { key: 'sexual_content', label: 'Contenu sexuel non sollicité', description: 'Nudité ou contenu sexuel non signalé comme sensible', requiresDetails: false, supportResources: false },
  { key: 'child_safety', label: "Mise en danger d'un mineur", description: 'Contenu impliquant ou visant un mineur', requiresDetails: false, supportResources: false },
  { key: 'self_harm', label: 'Automutilation ou suicide', description: 'Détresse, incitation ou apologie', requiresDetails: false, supportResources: true },
  { key: 'impersonation', label: "Usurpation d'identité", description: "Se fait passer pour quelqu'un d'autre", requiresDetails: false, supportResources: false },
  { key: 'privacy', label: 'Données personnelles exposées', description: 'Adresse, téléphone, documents privés publiés sans accord', requiresDetails: false, supportResources: false },
  { key: 'misinformation', label: 'Fausse information', description: 'Information trompeuse présentée comme un fait', requiresDetails: false, supportResources: false },
  { key: 'illegal', label: 'Contenu illégal', description: 'Vente de produits interdits, contrefaçon, piratage', requiresDetails: false, supportResources: false },
  { key: 'other', label: 'Autre', description: 'Ne correspond à aucune catégorie ci-dessus', requiresDetails: true, supportResources: false },
];

/** Catégories du repli applicables à un type de cible. */
const fallbackFor = (targetType: ReportTargetType): ReportCategory[] => {
  if (targetType === 'user') {
    return FALLBACK_CATEGORIES.filter((c) => c.key !== 'misinformation');
  }
  if (targetType === 'comment') {
    return FALLBACK_CATEGORIES.filter((c) => c.key !== 'impersonation');
  }
  return FALLBACK_CATEGORIES;
};

class ReportService {
  private baseUrl = `${API_CONFIG.BASE_URL}/api/moderation`;

  /** Cache mémoire : la taxonomie ne change pas en cours de session. */
  private categoryCache: Partial<Record<ReportTargetType, ReportCategory[]>> = {};

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await tokenStore.getAccessToken();
    return {
      ...(await buildClientHeaders({ 'Content-Type': 'application/json' })),
      ...(token && { Authorization: `Bearer ${token}` }),
    };
  }

  private async makeRequest(
    endpoint: string,
    options: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: any } = {}
  ): Promise<{ status: number; data: any }> {
    const { method = 'GET', body } = options;
    const headers = await this.getAuthHeaders();

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    const data = await response.json().catch(() => ({}));
    return { status: response.status, data };
  }

  /** Taxonomie servie par le serveur, avec repli local si le réseau lâche. */
  async getCategories(targetType: ReportTargetType = 'tweet'): Promise<ReportCategory[]> {
    if (this.categoryCache[targetType]) return this.categoryCache[targetType]!;

    try {
      const { status, data } = await this.makeRequest(
        `/report-categories?target_type=${targetType}`
      );
      if (status === 200 && Array.isArray(data?.data?.categories) && data.data.categories.length) {
        this.categoryCache[targetType] = data.data.categories;
        return data.data.categories;
      }
    } catch {
      // silencieux : le repli couvre le cas
    }
    return fallbackFor(targetType);
  }

  /**
   * Crée un signalement.
   *
   * Renvoie un résultat détaillé plutôt qu'un booléen : « déjà signalé » et
   * « quota atteint » ne sont pas des erreurs, et les présenter comme un
   * échec pousse l'utilisateur à réessayer pour rien.
   */
  async createReport(data: CreateReportData): Promise<CreateReportResult> {
    try {
      const { status, data: body } = await this.makeRequest('/reports', {
        method: 'POST',
        body: { ...data, source: 'mobile' },
      });

      if (status === 201 && body?.success) {
        return {
          ok: true,
          supportResources: !!body?.data?.support_resources,
          message: body?.message,
        };
      }
      if (status === 409) {
        return { ok: false, alreadyReported: true, message: body?.message };
      }
      if (status === 429) {
        return { ok: false, rateLimited: true, message: body?.message };
      }
      return { ok: false, message: body?.message || 'Impossible d\'envoyer le signalement.' };
    } catch (error) {
      console.error('❌ Erreur lors de la création du signalement:', error);
      return { ok: false, message: 'Vérifiez votre connexion et réessayez.' };
    }
  }

  /** Signalements envoyés par l'utilisateur courant, avec leur statut. */
  async getMyReports(page = 1, limit = 20): Promise<{ reports: Report[]; pagination: any } | null> {
    try {
      const { status, data } = await this.makeRequest(`/my-reports?page=${page}&limit=${limit}`);
      return status === 200 && data?.success ? data.data : null;
    } catch (error) {
      console.error('❌ Erreur lors de la récupération de mes signalements:', error);
      return null;
    }
  }

  // ── Modération (rôles modérateur et au-dessus) ─────────────────────
  async getReports(params?: {
    page?: number;
    limit?: number;
    status?: string;
    severity?: string;
    type?: string;
  }): Promise<{ reports: Report[]; pagination: any } | null> {
    try {
      const q = new URLSearchParams();
      if (params?.page) q.append('page', String(params.page));
      if (params?.limit) q.append('limit', String(params.limit));
      if (params?.status) q.append('status', params.status);
      if (params?.severity) q.append('severity', params.severity);
      if (params?.type) q.append('type', params.type);

      const { status, data } = await this.makeRequest(
        `/reports${q.toString() ? `?${q.toString()}` : ''}`
      );
      return status === 200 && data?.success ? data.data : null;
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des signalements:', error);
      return null;
    }
  }

  async updateReportStatus(reportId: string, data: UpdateReportData): Promise<boolean> {
    try {
      const { status, data: body } = await this.makeRequest(`/reports/${reportId}`, {
        method: 'PUT',
        body: data,
      });
      return status === 200 && !!body?.success;
    } catch (error) {
      console.error('❌ Erreur lors de la mise à jour du signalement:', error);
      return false;
    }
  }
}

export const reportService = new ReportService();
