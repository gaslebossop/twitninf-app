import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configuration globale des notifications
export const configureNotifications = async () => {
  console.log('🔔 Configuration des notifications démarrée...');
  
  // Configuration du gestionnaire de notifications
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  // Configuration des canaux Android de manière synchrone
  if (Platform.OS === 'android') {
    console.log('🔔 Configuration des canaux Android...');
    await configureAndroidChannels();
    console.log('🔔 Configuration des notifications terminée');
  } else {
    console.log('🔔 Configuration des notifications terminée (iOS)');
  }
};

// Configuration des canaux Android
const configureAndroidChannels = async () => {
  try {
    // Canal principal
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Notifications générales',
      description: 'Notifications de l\'application TwitNinf',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      enableVibrate: true,
      vibrationPattern: [0, 250, 250, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: false,
    });

    // Canal pour les mentions
    await Notifications.setNotificationChannelAsync('mentions', {
      name: 'Mentions',
      description: 'Quand quelqu\'un vous mentionne',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      enableVibrate: true,
      vibrationPattern: [0, 250, 250, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: false,
    });

    // Canal pour les likes
    await Notifications.setNotificationChannelAsync('likes', {
      name: 'Likes et interactions',
      description: 'Quand quelqu\'un like ou retweete vos tweets',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
      enableVibrate: true,
      vibrationPattern: [0, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      bypassDnd: false,
    });

    // Canal pour les réponses
    await Notifications.setNotificationChannelAsync('replies', {
      name: 'Réponses',
      description: 'Quand quelqu\'un répond à vos tweets',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      enableVibrate: true,
      vibrationPattern: [0, 250, 250, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: false,
    });

    console.log('✅ Canaux Android configurés avec succès');
  } catch (error) {
    console.error('❌ Erreur lors de la configuration des canaux Android:', error);
  }
};

// Types de notifications
export const NOTIFICATION_TYPES = {
  MENTION: 'mention',
  LIKE: 'like',
  RETWEET: 'retweet',
  REPLY: 'reply',
  FOLLOW: 'follow',
  SYSTEM: 'system',
} as const;

// Configuration des canaux par type
export const getChannelForType = (type: string): string => {
  switch (type) {
    case NOTIFICATION_TYPES.MENTION:
      return 'mentions';
    case NOTIFICATION_TYPES.LIKE:
    case NOTIFICATION_TYPES.RETWEET:
      return 'likes';
    case NOTIFICATION_TYPES.REPLY:
      return 'replies';
    default:
      return 'default';
  }
};
