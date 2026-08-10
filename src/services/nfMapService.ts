/**
 * Client de la Carte NF.
 *
 * Toutes les routes sont sous le drapeau `fil.cartenf` : un 404 ne veut pas
 * dire « cassé » mais « pas encore ouvert pour ce compte ». Les appels ne
 * lèvent donc pas sur cette réponse-là, ils rendent un état vide.
 */

import { apiService } from './api';

export type SharingMode = 'ghost' | 'city' | 'precise';
/**
 * Qui peut me voir. `connections` = n'importe quel lien, dans un sens ou dans
 * l'autre — c'est le réglage le plus proche de « mes amis ». Dans tous les cas
 * un lien est requis : la carte ne montre jamais un inconnu.
 */
export type MapAudience = 'mutuals' | 'followers' | 'connections';

/** Un compte lié à moi, qu'il partage sa position ou non. */
export interface NfMapFriend {
  id: string;
  username: string;
  full_name: string | null;
  avatar: string | null;
  verified: boolean;
  premium: boolean;
  is_sharing: boolean;
  i_follow: boolean;
  follows_me: boolean;
}

export interface NfMapSettings {
  sharing_mode: SharingMode;
  audience: MapAudience;
  place_label: string | null;
  shared_at: string | null;
  expires_at: string | null;
  is_live: boolean;
  policy?: {
    modes: SharingMode[];
    audiences: MapAudience[];
    ttl_hours: number;
    city_precision_km: number;
  };
}

export interface NfMapPerson {
  id: string;
  username: string;
  full_name: string | null;
  avatar: string | null;
  verified: boolean;
  premium: boolean;
  latitude: string | number;
  longitude: string | number;
  place_label: string | null;
  sharing_mode: Exclude<SharingMode, 'ghost'>;
  shared_at: string;
}

const BASE = '/api/nf-map';

export const nfMapService = {
  async getSettings(): Promise<NfMapSettings | null> {
    const response = await apiService.get(`${BASE}/me`);
    return response?.success ? response.data : null;
  },

  async setSettings(changes: { sharing_mode?: SharingMode; audience?: MapAudience }): Promise<NfMapSettings> {
    const response = await apiService.put(`${BASE}/me`, changes);
    if (!response?.success) throw new Error(response?.message || 'Réglage impossible');
    return response.data;
  },

  /** Pousse la position courante. Le serveur décide de la précision retenue. */
  async pushPosition(latitude: number, longitude: number, placeLabel?: string): Promise<void> {
    await apiService.post(`${BASE}/position`, {
      latitude,
      longitude,
      ...(placeLabel ? { place_label: placeLabel } : {}),
    });
  },

  /** Disparaître tout de suite, sans attendre l'expiration. */
  async clearPosition(): Promise<void> {
    await apiService.delete(`${BASE}/position`);
  },

  /**
   * Mes liens et leur état de partage.
   *
   * C'est la réponse à « pourquoi ma carte est vide » : un ami qui ne partage
   * pas apparaît ici par son nom, jamais par une position — il n'en a aucune
   * à montrer tant qu'il n'a rien activé.
   */
  async friends(): Promise<{ people: NfMapFriend[]; sharingCount: number }> {
    const response = await apiService.get(`${BASE}/friends`);
    if (!response?.success) return { people: [], sharingCount: 0 };
    return {
      people: response.data?.people || [],
      sharingCount: response.data?.sharing_count || 0,
    };
  },

  /** Demande à un ami d'activer sa position. Une fois par jour et par personne. */
  async invite(userId: string): Promise<boolean> {
    const response = await apiService.post(`${BASE}/invite/${userId}`);
    return !!response?.data?.sent;
  },

  /**
   * Comptes visibles dans le rectangle affiché. Une zone trop large est
   * refusée par le serveur : on rend une liste vide plutôt qu'une erreur, la
   * carte se remplira au prochain déplacement.
   */
  async nearby(bounds: { north: number; south: number; east: number; west: number }): Promise<NfMapPerson[]> {
    const response = await apiService.get(`${BASE}/nearby`, {
      north: String(bounds.north),
      south: String(bounds.south),
      east: String(bounds.east),
      west: String(bounds.west),
    });
    return response?.success ? response.data?.people || [] : [];
  },
};
