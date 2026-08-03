/**
 * Hook pour gérer les notifications d'inventaire
 */

import { useState, useEffect, useCallback } from 'react';
import InventoryNotificationService, { InventoryNotification } from '../services/inventoryNotificationService';

export interface UseInventoryNotificationsReturn {
  notifications: InventoryNotification[];
  currentNotification: InventoryNotification | null;
  showNotification: boolean;
  showNextNotification: () => void;
  markAsShown: (notificationId: string) => void;
  clearAllNotifications: () => void;
  hasUnshownNotifications: boolean;
}

export function useInventoryNotifications(): UseInventoryNotificationsReturn {
  const [notifications, setNotifications] = useState<InventoryNotification[]>([]);
  const [currentNotification, setCurrentNotification] = useState<InventoryNotification | null>(null);
  const [showNotification, setShowNotification] = useState(false);
  const [hasUnshownNotifications, setHasUnshownNotifications] = useState(false);

  // Charger les notifications au montage
  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    try {
      const unshownNotifications = await InventoryNotificationService.getUnshownNotifications();
      setNotifications(unshownNotifications);
      setHasUnshownNotifications(unshownNotifications.length > 0);
      
      // Afficher la première notification s'il y en a une
      if (unshownNotifications.length > 0) {
        setCurrentNotification(unshownNotifications[0]);
        setShowNotification(true);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des notifications:', error);
    }
  };

  const showNextNotification = useCallback(() => {
    const unshownNotifications = notifications.filter(n => !n.shown);
    const currentIndex = unshownNotifications.findIndex(n => n.id === currentNotification?.id);
    const nextIndex = currentIndex + 1;
    
    if (nextIndex < unshownNotifications.length) {
      setCurrentNotification(unshownNotifications[nextIndex]);
      setShowNotification(true);
    } else {
      setShowNotification(false);
      setCurrentNotification(null);
    }
  }, [notifications, currentNotification]);

  const markAsShown = useCallback(async (notificationId: string) => {
    try {
      await InventoryNotificationService.markAsShown(notificationId);
      
      // Mettre à jour l'état local
      setNotifications(prev => 
        prev.map(notification => 
          notification.id === notificationId 
            ? { ...notification, shown: true }
            : notification
        )
      );
      
      // Afficher la notification suivante
      showNextNotification();
    } catch (error) {
      console.error('Erreur lors du marquage de la notification:', error);
    }
  }, [showNextNotification]);

  const clearAllNotifications = useCallback(async () => {
    try {
      await InventoryNotificationService.clearAllNotifications();
      setNotifications([]);
      setCurrentNotification(null);
      setShowNotification(false);
      setHasUnshownNotifications(false);
    } catch (error) {
      console.error('Erreur lors de la suppression des notifications:', error);
    }
  }, []);

  return {
    notifications,
    currentNotification,
    showNotification,
    showNextNotification,
    markAsShown,
    clearAllNotifications,
    hasUnshownNotifications,
  };
}
