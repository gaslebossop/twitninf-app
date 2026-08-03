import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import apiService from './api';
import { API_CONFIG } from '../config/api';
import tokenStore from './tokenStore';
import { buildClientHeaders } from './clientIdentity';

export interface StoryAuthor {
  id: string;
  username: string;
  full_name: string;
  avatar: string | null;
  verified?: boolean;
  premium?: boolean;
  verification_style?: string;
}

export interface StoryItem {
  id: string;
  user_id: string;
  media_url: string;
  media_type: 'image' | 'video';
  thumbnail_url: string | null;
  caption: string | null;
  duration_ms: number;
  views_count: number;
  likes_count: number;
  created_at: string;
  expires_at: string;
  seen: boolean;
  liked: boolean;
  author?: StoryAuthor;
}

export interface StoryGroup {
  user: StoryAuthor | null;
  stories: StoryItem[];
  has_unseen: boolean;
  latest_at: string | null;
}

export interface StoriesFeed {
  self: StoryGroup;
  groups: StoryGroup[];
}

/** Collection épinglée sur le profil, qui survit à l'expiration 24 h. */
export interface StoryHighlight {
  id: string;
  title: string;
  cover_url: string | null;
  position: number;
  story_count: number;
  stories: StoryItem[];
}

const EMPTY_SELF: StoryGroup = { user: null, stories: [], has_unseen: false, latest_at: null };

/**
 * Les médias peuvent arriver en URL absolue (upload) ou en chemin relatif
 * (`/static/stories/...`) selon l'origine publique configurée sur l'API.
 */
export function resolveStoryMedia(url?: string | null): string | null {
  if (!url) return null;
  if (/^(https?:|data:|file:)/i.test(url)) return url;
  return `${API_CONFIG.BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

export function resolveAvatar(avatar?: string | null): string | null {
  if (!avatar) return null;
  if (/^(https?:|data:|file:)/i.test(avatar)) return avatar;
  if (avatar.includes('/')) return `${API_CONFIG.BASE_URL}${avatar.startsWith('/') ? '' : '/'}${avatar}`;
  return `${API_CONFIG.BASE_URL}/static/avatars/${avatar}`;
}

/** "il y a 3 h" compact, façon Instagram (2 m / 5 h / 1 j). */
export function formatStoryAge(createdAt?: string): string {
  if (!createdAt) return '';
  const ms = Date.now() - new Date(createdAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'maintenant';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'maintenant';
  if (minutes < 60) return `${minutes} m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} j`;
}

function normalizeGroup(raw: any): StoryGroup {
  return {
    user: raw?.user || null,
    stories: Array.isArray(raw?.stories) ? raw.stories : [],
    has_unseen: !!raw?.has_unseen,
    latest_at: raw?.latest_at || null,
  };
}

export const storiesService = {
  async getFeed(): Promise<StoriesFeed> {
    try {
      const res = await apiService.get('/api/stories/feed');
      if (!res?.success) return { self: EMPTY_SELF, groups: [] };
      const data = res?.data || {};
      return {
        self: normalizeGroup(data.self),
        groups: Array.isArray(data.groups) ? data.groups.map(normalizeGroup) : [],
      };
    } catch {
      return { self: EMPTY_SELF, groups: [] };
    }
  },

  async getUserStories(userId: string): Promise<StoryGroup> {
    try {
      const res = await apiService.get(`/api/stories/user/${userId}`);
      if (!res?.success) return EMPTY_SELF;
      return normalizeGroup(res?.data);
    } catch {
      return EMPTY_SELF;
    }
  },

  async markViewed(storyId: string): Promise<void> {
    try {
      await apiService.post(`/api/stories/${storyId}/view`, {});
    } catch {
      // Une vue perdue n'a pas d'impact fonctionnel : jamais bloquant.
    }
  },

  async getViewers(storyId: string): Promise<{
    views_count: number;
    likes_count: number;
    viewers: Array<StoryAuthor & { viewed_at: string; liked?: boolean }>;
  }> {
    try {
      const res = await apiService.get(`/api/stories/${storyId}/viewers`);
      if (!res?.success) return { views_count: 0, likes_count: 0, viewers: [] };
      return {
        views_count: Number(res?.data?.views_count || 0),
        likes_count: Number(res?.data?.likes_count || 0),
        viewers: Array.isArray(res?.data?.viewers) ? res.data.viewers : [],
      };
    } catch {
      return { views_count: 0, likes_count: 0, viewers: [] };
    }
  },

  async setLiked(
    storyId: string,
    liked: boolean,
  ): Promise<{ success: boolean; liked: boolean; likes_count: number; message?: string }> {
    try {
      const res = await apiService.put(`/api/stories/${storyId}/like`, { liked });
      return {
        success: !!res?.success,
        liked: !!res?.data?.liked,
        likes_count: Number(res?.data?.likes_count || 0),
        message: res?.message,
      };
    } catch (error) {
      return {
        success: false,
        liked: !liked,
        likes_count: 0,
        message: error instanceof Error ? error.message : 'Like impossible',
      };
    }
  },

  /** Réponse contextuelle : le DM conserve la référence à la story. */
  async reply(
    storyId: string,
    authorId: string,
    content: string,
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const res = await apiService.post(`/api/messages/direct/${authorId}`, {
        content: content.trim(),
        story_id: storyId,
      });
      return {
        success: !!res?.success,
        message: typeof res?.message === 'string' ? res.message : undefined,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Réponse impossible',
      };
    }
  },

  /** Mes stories des 30 derniers jours, expirées comprises. */
  async getArchive(): Promise<StoryItem[]> {
    try {
      const res = await apiService.get('/api/stories/archive');
      return res?.success && Array.isArray(res?.data?.stories) ? res.data.stories : [];
    } catch {
      return [];
    }
  },

  async getHighlights(userId: string): Promise<StoryHighlight[]> {
    try {
      const res = await apiService.get(`/api/stories/highlights/user/${userId}`);
      return res?.success && Array.isArray(res?.data?.highlights) ? res.data.highlights : [];
    } catch {
      return [];
    }
  },

  async createHighlight(title: string, storyIds: string[], coverStoryId?: string): Promise<{ success: boolean; message?: string }> {
    try {
      const res = await apiService.post('/api/stories/highlights', { title, storyIds, coverStoryId });
      return { success: !!res?.success, message: res?.message };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Création impossible' };
    }
  },

  async renameHighlight(highlightId: string, title: string): Promise<boolean> {
    try {
      const res = await apiService.put(`/api/stories/highlights/${highlightId}`, { title });
      return !!res?.success;
    } catch {
      return false;
    }
  },

  async addToHighlight(highlightId: string, storyIds: string[]): Promise<boolean> {
    try {
      const res = await apiService.post(`/api/stories/highlights/${highlightId}/items`, { storyIds });
      return !!res?.success;
    } catch {
      return false;
    }
  },

  async removeFromHighlight(highlightId: string, storyId: string): Promise<boolean> {
    try {
      const res = await apiService.delete(`/api/stories/highlights/${highlightId}/items/${storyId}`);
      return !!res?.success;
    } catch {
      return false;
    }
  },

  async deleteHighlight(highlightId: string): Promise<boolean> {
    try {
      const res = await apiService.delete(`/api/stories/highlights/${highlightId}`);
      return !!res?.success;
    } catch {
      return false;
    }
  },

  async remove(storyId: string): Promise<boolean> {
    try {
      const res = await apiService.delete(`/api/stories/${storyId}`);
      return !!res?.success;
    } catch {
      return false;
    }
  },

  /**
   * Publie une story. L'upload est fait à la main (et non via `apiService`)
   * parce que `fetch` doit poser lui-même la frontière multipart : fixer
   * `Content-Type` casserait le corps de la requête.
   */
  async publish(
    fileUri: string,
    options: { caption?: string; isVideo?: boolean } = {},
  ): Promise<{ success: boolean; message?: string; story?: StoryItem }> {
    try {
      const token = await tokenStore.getAccessToken();
      const isVideo = !!options.isVideo;
      const fallbackName = `story_${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`;
      const name = fileUri.split('/').pop() || fallbackName;

      const form = new FormData();
      form.append('media', {
        uri: fileUri,
        name,
        type: isVideo ? 'video/mp4' : 'image/jpeg',
      } as any);
      if (options.caption?.trim()) form.append('caption', options.caption.trim());

      const res = await fetch(`${API_CONFIG.BASE_URL}/api/stories`, {
        method: 'POST',
        headers: {
          ...(await buildClientHeaders()),
          Authorization: token ? `Bearer ${token}` : '',
        } as any,
        body: form as any,
      });

      const text = await res.text();
      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        json = { success: res.ok, message: text };
      }
      if (!res.ok || !json?.success) {
        return { success: false, message: json?.message || `HTTP ${res.status}` };
      }
      return { success: true, story: json?.data?.story };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Publication impossible',
      };
    }
  },
};

export default storiesService;
