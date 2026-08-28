import apiService from './api';

export type ContractStatus =
  | 'pending' | 'rejected' | 'accepted' | 'draft_submitted'
  | 'changes_requested' | 'approved' | 'cancelled';

export interface ContractParty {
  id: string;
  username: string;
  avatar: string | null;
}

export interface ContractDraftContent {
  text?: string;
  media_urls?: string[];
}

export interface ContractRevisionEntry {
  type: 'draft' | 'feedback';
  content?: ContractDraftContent;
  feedback?: string;
  at: string;
}

export interface CreatorContract {
  id: string;
  brand_user_id: string;
  creator_user_id: string;
  price_nf: string;
  brief: string;
  status: ContractStatus;
  draft_content: ContractDraftContent | null;
  revision_history: ContractRevisionEntry[];
  tweet_id: string | null;
  created_at: string;
  accepted_at: string | null;
  published_at: string | null;
  cancelled_at: string | null;
  brand?: ContractParty;
  creator?: ContractParty;
}

export interface MarketplaceCreator {
  id: string;
  username: string;
  full_name: string | null;
  avatar: string | null;
  bio: string | null;
  verified: boolean;
  verification_style?: string | null;
  ultra_indicative_price_nf: string | null;
}

/**
 * Type "plat" plutôt qu'une union discriminée : le `tsc` de ce projet
 * échoue à rétrécir `{success:true,data}|{success:false,message}` même sur
 * l'exemple le plus basique (vérifié hors de ce fichier, en isolation totale
 * du reste du dépôt) — un problème d'environnement, pas de code. C'est très
 * probablement pourquoi le reste des services (`storiesService.ts` etc.)
 * suit déjà cette convention `{success, data?, message?}`.
 */
export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  message?: string;
}

function ok<T>(data: T): ServiceResult<T> {
  return { success: true, data };
}

function fail<T>(message: string): ServiceResult<T> {
  return { success: false, message };
}

const contractService = {
  async getMarketplace(
    params: { search?: string; minPrice?: number; maxPrice?: number } = {}
  ): Promise<ServiceResult<{ creators: MarketplaceCreator[]; total: number }>> {
    try {
      const res = await apiService.get('/api/contracts/marketplace', {
        search: params.search,
        min_price: params.minPrice,
        max_price: params.maxPrice,
      });
      if (!res?.success) return fail(res?.message || 'Impossible de charger la marketplace');
      return ok({
        creators: (res.data?.creators || []) as MarketplaceCreator[],
        total: Number(res.data?.total || 0),
      });
    } catch {
      return fail('Erreur de communication avec le serveur');
    }
  },

  async setIndicativePrice(priceNf: number | null): Promise<ServiceResult<{ ultra_indicative_price_nf: number | null }>> {
    try {
      const res = await apiService.put('/api/contracts/me/indicative-price', { price_nf: priceNf });
      if (!res?.success) return fail(res?.message || 'Mise à jour impossible');
      return ok(res.data);
    } catch {
      return fail('Erreur de communication avec le serveur');
    }
  },

  async proposeContract(creatorId: string, priceNf: number, brief: string): Promise<ServiceResult<CreatorContract>> {
    try {
      const res = await apiService.post('/api/contracts', { creator_id: creatorId, price_nf: priceNf, brief });
      if (!res?.success) return fail(res?.message || 'La proposition a échoué');
      return ok(res.data as CreatorContract);
    } catch {
      return fail('Erreur de communication avec le serveur');
    }
  },

  async getMyContracts(role?: 'brand' | 'creator'): Promise<ServiceResult<CreatorContract[]>> {
    try {
      const res = await apiService.get('/api/contracts', role ? { role } : undefined);
      if (!res?.success) return fail(res?.message || 'Impossible de charger vos contrats');
      return ok((res.data || []) as CreatorContract[]);
    } catch {
      return fail('Erreur de communication avec le serveur');
    }
  },

  async getContract(contractId: string): Promise<ServiceResult<CreatorContract>> {
    try {
      const res = await apiService.get(`/api/contracts/${contractId}`);
      if (!res?.success) return fail(res?.message || 'Contrat introuvable');
      return ok(res.data as CreatorContract);
    } catch {
      return fail('Erreur de communication avec le serveur');
    }
  },

  async respond(contractId: string, accept: boolean, reason?: string): Promise<ServiceResult<CreatorContract>> {
    try {
      const res = await apiService.post(`/api/contracts/${contractId}/respond`, { accept, reason });
      if (!res?.success) return fail(res?.message || 'La réponse a échoué');
      return ok(res.data as CreatorContract);
    } catch {
      return fail('Erreur de communication avec le serveur');
    }
  },

  async submitDraft(contractId: string, draftContent: ContractDraftContent): Promise<ServiceResult<CreatorContract>> {
    try {
      const res = await apiService.post(`/api/contracts/${contractId}/draft`, { draft_content: draftContent });
      if (!res?.success) return fail(res?.message || 'La soumission a échoué');
      return ok(res.data as CreatorContract);
    } catch {
      return fail('Erreur de communication avec le serveur');
    }
  },

  async review(contractId: string, action: 'approve' | 'request_changes', feedback?: string): Promise<ServiceResult<CreatorContract>> {
    try {
      const res = await apiService.post(`/api/contracts/${contractId}/review`, { action, feedback });
      if (!res?.success) return fail(res?.message || 'La revue a échoué');
      return ok(res.data as CreatorContract);
    } catch {
      return fail('Erreur de communication avec le serveur');
    }
  },

  async cancel(contractId: string): Promise<ServiceResult<CreatorContract>> {
    try {
      const res = await apiService.post(`/api/contracts/${contractId}/cancel`, {});
      if (!res?.success) return fail(res?.message || 'L\'annulation a échoué');
      return ok(res.data as CreatorContract);
    } catch {
      return fail('Erreur de communication avec le serveur');
    }
  },
};

export default contractService;
