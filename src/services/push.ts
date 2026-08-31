import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { configureNotifications, getChannelForType } from './notificationConfig';
import { apiService } from './api';

const PARIS_TIMEZONE = 'Europe/Paris';
const DAILY_REMINDER_HOURS = [12, 16, 20];
const DAILY_REMINDER_TAG = 'twitninf_fr_daily_reminder';
const CUSTOM_DEBUG_TAG = 'twitninf_custom_debug_reminder';
const DAILY_REMINDER_MESSAGES: Record<number, { title: string; body: string }> = {
  12: {
    title: 'Pause midi sur TwitNinf',
    body: 'Les sujets chauds t attendent. Viens voir ce qui buzz maintenant.'
  },
  16: {
    title: 'Ca bouge sur ton fil',
    body: 'Nouveaux posts, trends et interactions: passe faire un tour.'
  },
  20: {
    title: 'Soiree TwitNinf',
    body: 'Le meilleur moment pour rattraper les actus et rejoindre les discussions.'
  }
};

// Variable pour tracker si les notifications sont configurées
let notificationsConfigured = false;

// Configuration globale des notifications
export const initializeNotifications = async () => {
  if (!notificationsConfigured) {
    console.log('🔔 Initialisation des notifications...');
    await configureNotifications();
    notificationsConfigured = true;
    console.log('🔔 Notifications initialisées avec succès');
  }
  return notificationsConfigured;
};

/**
 * Identifiant du projet EAS, lu dans la config du build.
 *
 * ── Le bug qu'il corrige ─────────────────────────────────────────────────
 * Cinq endroits codaient `341da021-111f-4a0c-9f54-0b5f4c9c3965` en dur, alors
 * que le projet EAS de ce build est `5370e501-b1a8-4999-bc98-83194b608a8e`
 * (`app.config.js`, `extra.eas.projectId`). `getExpoPushTokenAsync` echoue
 * quand le projectId ne correspond pas aux identifiants du build : aucun
 * jeton, donc aucun envoi au serveur.
 *
 * Constat en base le 2026-08-31 : **1 jeton push pour 3 562 comptes.** Aucune
 * notification distante n'atteignait personne, quel qu'en soit le type — ce
 * n'est pas une fonctionnalite qui manquait, c'est le transport entier qui
 * etait mort, en silence.
 *
 * Le piege qui l'a rendu invisible : `App.tsx` resolvait DEJA correctement
 * l'identifiant depuis `Constants`, mais il se contente de garder le jeton en
 * etat local. Le seul chemin qui le POSTE au serveur est celui d'
 * `AuthContext`, et c'est precisement celui qui codait le mauvais en dur.
 *
 * Plus aucun repli code en dur : un identifiant faux echoue silencieusement,
 * alors qu'un identifiant absent se voit dans les logs.
 */
export function resolveProjectId(): string | null {
  const c = Constants as any;
  return c?.expoConfig?.extra?.eas?.projectId || c?.easConfig?.projectId || null;
}

export async function registerForPushNotifications(
  projectId: string = resolveProjectId() ?? '',
): Promise<string | null> {
  try {
    console.log('🔔 Push Service - Début enregistrement notifications');
    console.log('🔔 Push Service - Project ID:', projectId);
    console.log('🔔 Push Service - Est un device:', Device.isDevice);
    console.log('🔔 Push Service - Platform:', Platform.OS);
    
    if (!Device.isDevice) {
      console.log('🔔 Push Service - Pas un device physique, arrêt');
      return null;
    }

    // IMPORTANT: Initialiser les notifications AVANT tout
    console.log('🔔 Push Service - Initialisation des notifications...');
    await initializeNotifications();
    console.log('🔔 Push Service - Notifications initialisées');

    // Vérifier et demander les permissions
    const perms = await Notifications.getPermissionsAsync();
    console.log('🔔 Push Service - Permissions actuelles:', perms.status);
    
    let status = perms.status;
    if (status !== 'granted') {
      console.log('🔔 Push Service - Demande de permissions...');
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
      console.log('🔔 Push Service - Nouveau statut permissions:', status);
    }
    
    if (status !== 'granted') {
      console.log('🔔 Push Service - Permissions refusées, arrêt');
      return null;
    }

    console.log('🔔 Push Service - Canaux Android configurés et permissions accordées');

    console.log('🔔 Push Service - Tentative d\'obtention du token Expo...');
    
    // Obtenir le token avec la configuration appropriée
    if (!projectId) {
      // Sans identifiant, `getExpoPushTokenAsync` echouerait avec un message
      // opaque. On le dit ici, une fois, en clair.
      console.warn('🔔 Push Service - projectId EAS introuvable : aucun jeton ne sera demande');
      return null;
    }

    const tokenResult = await Notifications.getExpoPushTokenAsync({
      projectId
    });
    
    const token = tokenResult.data;
    
    console.log('🔔 Push Service - Token obtenu:', token ? 'Oui' : 'Non');
    
    console.log('🔔 Push Service - Enregistrement terminé avec succès');
    return token;
  } catch (error) {
    console.error('❌ Push Service - Erreur lors de l\'enregistrement:', error);
    console.error('❌ Push Service - Détails de l\'erreur:', {
      message: error.message,
      stack: error.stack,
      code: error.code
    });
    return null;
  }
}

export async function scheduleLocalNotification(title: string, body: string, data?: Record<string, any>) {
  try {
    console.log('🔔 Push Service - Planification notification locale:', { title, body });
    
    // S'assurer que les notifications sont initialisées
    await initializeNotifications();
    
    const result = await Notifications.scheduleNotificationAsync({
      content: { title, body, data },
      trigger: null,
    });
    console.log('🔔 Push Service - Notification locale planifiée:', result);
    return result;
  } catch (error) {
    console.error('❌ Push Service - Erreur planification notification locale:', error);
    throw error;
  }
}

// Fonction pour envoyer une notification immédiate (pour tests)
export async function sendImmediateNotification(title: string, body: string, data?: Record<string, any>) {
  try {
    console.log('🔔 Push Service - Envoi notification immédiate:', { title, body });
    
    // S'assurer que les notifications sont initialisées
    await initializeNotifications();
    
    const result = await Notifications.scheduleNotificationAsync({
      content: { 
        title, 
        body, 
        data,
        sound: true,
        priority: 'high'
      },
      trigger: null, // Immédiat
    });
    
    console.log('🔔 Push Service - Notification immédiate envoyée:', result);
    return result;
  } catch (error) {
    console.error('❌ Push Service - Erreur notification immédiate:', error);
    throw error;
  }
}

// Fonction pour vérifier l'état des notifications
export async function checkNotificationStatus() {
  try {
    const permissions = await Notifications.getPermissionsAsync();
    const channels = await Notifications.getNotificationChannelsAsync();
    
    console.log('🔔 Push Service - État des notifications:');
    console.log('  - Permissions:', permissions.status);
    console.log('  - Canaux Android:', channels.length);
    
    return {
      permissions: permissions.status,
      channelsCount: channels.length,
      configured: notificationsConfigured
    };
  } catch (error) {
    console.error('❌ Push Service - Erreur vérification état:', error);
    return null;
  }
}

/**
 * Le serveur peut-il relancer ce compte lui-même ?
 *
 * `true` quand au moins un abonnement Web Push est enregistré ET que le
 * serveur a ses clés VAPID. `null` quand la question n'a pas de réponse —
 * hors ligne, ou pas encore connecté.
 *
 * La distinction compte : `null` ne doit PAS être traité comme `false`
 * seulement, mais comme « on ne sait pas », et dans le doute on garde les
 * rappels locaux. Perdre une notification est pire que d'en avoir deux.
 */
async function serverHandlesReminders(): Promise<boolean | null> {
  try {
    const response = await apiService.get('/api/push/status');
    const data = response?.data;
    if (!response?.success || !data) return null;
    return Boolean(data.configured) && Number(data.subscriptions) > 0;
  } catch {
    return null;
  }
}

/** Retire les rappels quotidiens déjà posés par cette fonctionnalité. */
async function cancelDailyReminders(): Promise<number> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const tagged = scheduled.filter(
    (item) => item.content?.data?.localScheduleTag === DAILY_REMINDER_TAG
  );
  for (const reminder of tagged) {
    await Notifications.cancelScheduledNotificationAsync(reminder.identifier);
  }
  return tagged.length;
}

/**
 * Rappels quotidiens LOCAUX — désormais un repli, plus le mécanisme principal.
 *
 * Le serveur relance chaque personne à l'heure où elle est réellement active
 * (voir `dailyNudgeService` côté API), et son message porte un vrai contenu.
 * Ces rappels-ci restent pour qui n'est joignable par aucun autre moyen :
 * l'app iOS sideloadée ne peut pas obtenir de jeton push (l'entitlement
 * `aps-environment` demande un compte Apple payant), et sans abonnement Web
 * Push elle n'aurait plus aucune notification.
 *
 * Dès qu'un abonnement Web Push existe, ces rappels sont ANNULÉS : les
 * laisser tourner en plus donnerait deux notifications pour la même
 * intention, à des heures différentes — et les heures fixes sont justement
 * celles qui visent à côté (mesuré : le pic d'audience réel est à minuit).
 */
export async function setupFranceDailyLocalNotifications() {
  try {
    await initializeNotifications();

    if (await serverHandlesReminders()) {
      const removed = await cancelDailyReminders();
      console.log(`🔔 Rappels FR - pris en charge par le serveur (${removed} rappel(s) local(aux) retiré(s))`);
      return false;
    }

    const existingPermissions = await Notifications.getPermissionsAsync();
    let permissionStatus = existingPermissions.status;
    if (permissionStatus !== 'granted') {
      const requestedPermissions = await Notifications.requestPermissionsAsync();
      permissionStatus = requestedPermissions.status;
    }

    if (permissionStatus !== 'granted') {
      console.log('🔔 Rappels FR - permissions non accordées');
      return false;
    }

    await cancelDailyReminders();

    for (const hour of DAILY_REMINDER_HOURS) {
      const message = DAILY_REMINDER_MESSAGES[hour] || {
        title: 'TwitNinf',
        body: 'Nouveaux posts a voir sur TwitNinf.'
      };

      const content = {
        title: message.title,
        body: message.body,
        data: {
          localScheduleTag: DAILY_REMINDER_TAG,
          slotHour: hour
        }
      };

      try {
        await Notifications.scheduleNotificationAsync({
          content,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
            timezone: PARIS_TIMEZONE,
            hour,
            minute: 0,
            repeats: true
          } as any
        });
      } catch (error) {
        // Fallback de compatibilite (Expo Go / plateformes qui ignorent timezone).
        // Sans le discriminant `type`, ce trigger etait invalide pour les
        // versions recentes d'expo-notifications (« The `trigger` object you
        // provided is invalid ») — jete silencieusement par le catch englobant,
        // aucun rappel n'etait jamais programme.
        await Notifications.scheduleNotificationAsync({
          content,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour,
            minute: 0
          } as any
        });
        console.log(`🔔 Rappels FR - fallback applique pour ${hour}:00`);
      }
    }

    console.log('🔔 Rappels FR planifiés: 12h, 16h, 20h (Europe/Paris)');
    return true;
  } catch (error) {
    console.error('❌ Rappels FR - erreur planification:', error);
    return false;
  }
}

export async function getFranceDailyLocalNotificationsDebug() {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const reminders = scheduled
      .filter((item) => item.content?.data?.localScheduleTag === DAILY_REMINDER_TAG)
      .map((item) => {
        const trigger = (item as any).trigger || {};
        return {
          id: item.identifier,
          hour: trigger.hour ?? null,
          minute: trigger.minute ?? null,
          timezone: trigger.timezone || null
        };
      });

    return {
      totalScheduled: scheduled.length,
      reminders
    };
  } catch (error) {
    console.error('❌ Rappels FR - debug impossible:', error);
    return {
      totalScheduled: 0,
      reminders: [],
      error: String((error as any)?.message || error)
    };
  }
}

export async function scheduleRandomDebugNotificationAtTime(hour: number, minute: number) {
  try {
    await initializeNotifications();

    const existingPermissions = await Notifications.getPermissionsAsync();
    let permissionStatus = existingPermissions.status;
    if (permissionStatus !== 'granted') {
      const requestedPermissions = await Notifications.requestPermissionsAsync();
      permissionStatus = requestedPermissions.status;
    }
    if (permissionStatus !== 'granted') {
      throw new Error('Permissions notifications non accordees');
    }

    const messagePool = Object.values(DAILY_REMINDER_MESSAGES);
    const randomMessage = messagePool[Math.floor(Math.random() * messagePool.length)];

    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: randomMessage.title,
        body: randomMessage.body,
        data: {
          localScheduleTag: CUSTOM_DEBUG_TAG,
          chosenHour: hour,
          chosenMinute: minute
        }
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
        timezone: PARIS_TIMEZONE,
        hour,
        minute,
        repeats: false
      } as any
    });

    return {
      success: true,
      identifier,
      hour,
      minute,
      title: randomMessage.title,
      body: randomMessage.body
    };
  } catch (error) {
    console.error('❌ Debug custom notif - erreur:', error);
    return {
      success: false,
      error: String((error as any)?.message || error)
    };
  }
}

