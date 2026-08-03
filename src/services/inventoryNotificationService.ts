/**
 * Service pour gérer les notifications d'inventaire
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface InventoryNotification {
  id: string;
  itemName: string;
  itemDescription?: string;
  itemRarity: 'common' | 'rare' | 'epic' | 'legendary' | 'ultra_rare';
  timestamp: number;
  shown: boolean;
}

class InventoryNotificationService {
  private static readonly STORAGE_KEY = 'inventory_notifications';
  private static readonly SHOWN_NOTIFICATIONS_KEY = 'shown_inventory_notifications';

  /**
   * Ajoute une nouvelle notification d'inventaire
   */
  static async addNotification(notification: Omit<InventoryNotification, 'id' | 'timestamp' | 'shown'>): Promise<void> {
    try {
      const notifications = await this.getNotifications();
      const newNotification: InventoryNotification = {
        ...notification,
        id: Date.now().toString(),
        timestamp: Date.now(),
        shown: false,
      };

      notifications.push(newNotification);
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(notifications));
    } catch (error) {
      console.error('Erreur lors de l\'ajout de la notification:', error);
    }
  }

  /**
   * Récupère toutes les notifications non affichées
   */
  static async getNotifications(): Promise<InventoryNotification[]> {
    try {
      const stored = await AsyncStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Erreur lors de la récupération des notifications:', error);
      return [];
    }
  }

  /**
   * Récupère les notifications non affichées
   */
  static async getUnshownNotifications(): Promise<InventoryNotification[]> {
    try {
      const notifications = await this.getNotifications();
      return notifications.filter(notification => !notification.shown);
    } catch (error) {
      console.error('Erreur lors de la récupération des notifications non affichées:', error);
      return [];
    }
  }

  /**
   * Marque une notification comme affichée
   */
  static async markAsShown(notificationId: string): Promise<void> {
    try {
      const notifications = await this.getNotifications();
      const notification = notifications.find(n => n.id === notificationId);
      
      if (notification) {
        notification.shown = true;
        await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(notifications));
      }
    } catch (error) {
      console.error('Erreur lors du marquage de la notification:', error);
    }
  }

  /**
   * Supprime les anciennes notifications (plus de 7 jours)
   */
  static async cleanupOldNotifications(): Promise<void> {
    try {
      const notifications = await this.getNotifications();
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      
      const recentNotifications = notifications.filter(
        notification => notification.timestamp > sevenDaysAgo
      );
      
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(recentNotifications));
    } catch (error) {
      console.error('Erreur lors du nettoyage des notifications:', error);
    }
  }

  /**
   * Supprime toutes les notifications
   */
  static async clearAllNotifications(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
      console.error('Erreur lors de la suppression des notifications:', error);
    }
  }

  /**
   * Vérifie s'il y a des notifications non affichées
   */
  static async hasUnshownNotifications(): Promise<boolean> {
    try {
      const unshownNotifications = await this.getUnshownNotifications();
      return unshownNotifications.length > 0;
    } catch (error) {
      console.error('Erreur lors de la vérification des notifications:', error);
      return false;
    }
  }

  /**
   * Simule l'ajout d'un item (pour les tests)
   */
  static async simulateItemReceived(
    itemName: string, 
    itemDescription?: string, 
    itemRarity: 'common' | 'rare' | 'epic' | 'legendary' | 'ultra_rare' = 'common'
  ): Promise<void> {
    await this.addNotification({
      itemName,
      itemDescription,
      itemRarity,
    });
  }
}

export default InventoryNotificationService;
