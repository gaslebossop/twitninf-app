import apiService from './api';
import { SwipeCandidate } from '../types/api';

/**
 * Swipe or Follow — découverte active de comptes. Miroir de
 * `api/src/routes/swipeRoutes.js`, alimenté par le moteur `swipe-recommender`
 * (voir swipe-recommender/README.md pour l'algorithme de classement).
 *
 * Le "follow" ne passe pas par ce service : il utilise directement
 * `apiService.followUser`, déjà utilisé par `UserSuggestions.tsx`, qui porte
 * la logique compte privé / notifications. Ce service ne gère que la
 * récupération de la file et le "pass".
 */

export async function getSwipeCandidates(limit: number = 20, forceRefresh: boolean = false): Promise<{
  success: boolean;
  data?: SwipeCandidate[];
  message?: string;
}> {
  try {
    const response = await apiService.getSwipeCandidates(limit, forceRefresh);
    if (response.success && Array.isArray(response.data)) {
      return { success: true, data: response.data };
    }
    return { success: false, message: response.message || 'Aucun profil disponible' };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Erreur réseau' };
  }
}

export async function passUser(targetUserId: string): Promise<{ success: boolean; message?: string }> {
  try {
    const response = await apiService.passSwipeUser(targetUserId);
    return { success: !!response.success, message: response.message };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Erreur réseau' };
  }
}

export default { getSwipeCandidates, passUser };
