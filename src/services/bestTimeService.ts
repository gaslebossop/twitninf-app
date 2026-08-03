import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiService } from './api';
import { initializeNotifications } from './push';

/**
 * « Meilleur moment pour publier » — avantage abonné (Plus / Pro).
 *
 * Le serveur calcule les créneaux où l'AUDIENCE du compte réagit le plus
 * (engagement moyen par tweet publié, pas engagement total — voir
 * `GET /api/user-stats/:id/best-time`). L'app se contente de poser un rappel
 * local un quart d'heure avant, pour laisser le temps d'écrire.
 *
 * Rappel LOCAL et non push : le créneau est déjà connu à l'avance, faire
 * remonter ça au serveur pour qu'il réveille l'appareil n'apporterait rien et
 * ferait dépendre un avantage payant de la disponibilité du réseau au moment
 * précis du créneau.
 */

const TAG = 'twitninf_best_time_to_post';
const PARIS_TIMEZONE = 'Europe/Paris';
/** On prévient avant l'heure creuse : publier pile à l'heure arrive trop tard. */
const LEAD_MINUTES = 15;
const lastSyncKey = (userId: string) => `@twitninf_best_time_sync:${userId}`;
/** Recalculer à chaque ouverture serait inutile : l'audience ne bouge pas en une heure. */
const RESYNC_INTERVAL_MS = 24 * 3600 * 1000;

export interface BestTimeSlot {
  hour: number;
  tweets: number;
  engagement: number;
  avg_engagement: number;
  reliable: boolean;
}

export interface BestTimeData {
  hourly: BestTimeSlot[];
  bestHours: number[];
  hasEnoughData: boolean;
  sampleTweets: number;
}

export async function fetchBestTime(userId: string): Promise<BestTimeData | null> {
  if (!userId) return null;
  try {
    const response = await apiService.get(`/api/user-stats/${userId}/best-time`);
    if (!response?.success || !response.data) return null;
    return response.data as BestTimeData;
  } catch {
    return null;
  }
}

/** Retire les rappels déjà posés par cette fonctionnalité. */
async function cancelExisting(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const item of scheduled) {
    if (item.content?.data?.localScheduleTag === TAG) {
      await Notifications.cancelScheduledNotificationAsync(item.identifier);
    }
  }
}

/**
 * Aligne le rappel quotidien sur le meilleur créneau connu.
 *
 * Sans données suffisantes, on ANNULE au lieu de deviner : mieux vaut aucun
 * rappel qu'un rappel à une heure tirée d'un seul tweet.
 */
export async function syncBestTimeReminder(
  userId: string,
  options: { force?: boolean } = {},
): Promise<number | null> {
  if (!userId) return null;

  if (!options.force) {
    const last = await AsyncStorage.getItem(lastSyncKey(userId));
    if (last && Date.now() - Number(last) < RESYNC_INTERVAL_MS) return null;
  }

  const data = await fetchBestTime(userId);
  // Une requête ratée ne doit pas supprimer un rappel déjà correct.
  if (!data) return null;

  await initializeNotifications();

  const permissions = await Notifications.getPermissionsAsync();
  if (permissions.status !== 'granted') return null;

  await cancelExisting();
  await AsyncStorage.setItem(lastSyncKey(userId), String(Date.now()));

  if (!data.hasEnoughData || data.bestHours.length === 0) return null;

  const targetHour = data.bestHours[0];
  // 15 min avant l'heure pleine → l'heure précédente à :45.
  const notifyHour = (targetHour + 23) % 24;
  const notifyMinute = 60 - LEAD_MINUTES;

  const content = {
    title: 'C\'est le bon moment',
    body: `Ton audience est la plus réactive vers ${targetHour}h. Un tweet maintenant ?`,
    data: { localScheduleTag: TAG, targetHour },
  };

  try {
    await Notifications.scheduleNotificationAsync({
      content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
        timezone: PARIS_TIMEZONE,
        hour: notifyHour,
        minute: notifyMinute,
        repeats: true,
      } as any,
    });
  } catch {
    // Repli pour les plateformes qui ignorent `timezone` (même contournement
    // que les rappels quotidiens de `push.ts`).
    await Notifications.scheduleNotificationAsync({
      content,
      trigger: { hour: notifyHour, minute: notifyMinute, repeats: true } as any,
    });
  }

  return targetHour;
}

/** Coupe le rappel — perte de l'abonnement, ou refus explicite. */
export async function disableBestTimeReminder(userId: string): Promise<void> {
  await cancelExisting();
  if (userId) await AsyncStorage.removeItem(lastSyncKey(userId));
}
