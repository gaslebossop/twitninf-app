import { colors as themeColors, fonts, glow , statusBarStyle} from '../theme';
/**
 * Écran de gestion des événements fonctionnels pour les administrateurs
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAdminPermissions } from '../hooks/useAdminPermissions';
import { AppHeader } from '../components/ui';
import { useFunctionalEvents } from '../contexts/FunctionalEventContext';
import { FunctionalEvent } from '../types/functionalEvent';
import { FunctionalEventBanner } from '../components/FunctionalEventBanner';
import { toast } from '../components/ui/Toast';
import { confirmAsync } from '../components/ui/ConfirmSheet';

const COLORS = {
  primary: themeColors.accent,
  secondary: themeColors.accentHover,
  accent: themeColors.accentPressed,
  bgPrimary: themeColors.bg,
  bgSecondary: themeColors.surface,
  bgTertiary: themeColors.surfaceAlt,
  textPrimary: themeColors.textPrimary,
  textSecondary: themeColors.textSecondary,
  textMuted: themeColors.textMuted,
  success: themeColors.success,
  error: themeColors.red,
  warning: themeColors.gold,
  glassBorder: themeColors.borderSubtle,
  glassBackground: themeColors.surface,
};

export default function FunctionalEventManagementScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { isAdmin, isSuperAdmin, loading: permissionsLoading } = useAdminPermissions();
  const {
    activeEvents,
    isLoading,
    refreshActiveEvents,
    activateEvent,
    deactivateEvent,
    createEvent,
    updateEvent,
    deleteEvent,
    getAllEvents,
    initializeDefaultEvents,
  } = useFunctionalEvents();

  const [events, setEvents] = useState<FunctionalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Charger les événements
  const loadEvents = async () => {
    try {
      setLoading(true);
      const allEvents = await getAllEvents();
      setEvents(allEvents);
    } catch (error) {
      console.error('Erreur lors du chargement des événements:', error);
      toast.error('Impossible de charger les événements');
    } finally {
      setLoading(false);
    }
  };

  // Lancer l'événement Kospor Birthday par défaut
  const handleLaunchKosporEvent = async () => {
    try {
      confirmAsync({
        title: 'Lancer Kospor Birthday ?',
        message: 'L’événement devient visible par tout le monde immédiatement.',
        confirmLabel: 'Lancer',
        icon: 'gift-outline',
      }).then((ok) => {
        if (ok) (async () => {
              // Vérifier si l'événement existe déjà
              const existingEvents = await getAllEvents();
              let kosporEvent = existingEvents.find(event => event.slug === 'kosporbirthday');
              
              if (!kosporEvent) {
                // Créer l'événement s'il n'existe pas
                const defaultEvent = {
                  name: 'Kospor Birthday',
                  slug: 'kosporbirthday',
                  description: 'Célébrez l\'anniversaire de Kospor avec des fonctionnalités spéciales !',
                  target_pages: ['kosporbirthday'],
                  features: {
                    kosporbirthday: true,
                    special_page: true,
                    nav_tab: true,
                  },
                  icon: 'gift',
                  banner_message: '🎉 Joyeux Anniversaire Kospor ! 🎉',
                  auto_activate: false,
                  priority: 10,
                };
                
                kosporEvent = await createEvent(defaultEvent);
                if (!kosporEvent) {
                  toast.error('Impossible de créer l\'événement');
                  return;
                }
              }
              
              // Activer l'événement
              await activateEvent(kosporEvent.id, true);
              await loadEvents();
              toast.success('Événement Kospor Birthday lancé !');
        })();
      });
    } catch (error) {
      console.error('Erreur lors du lancement de l\'événement:', error);
      toast.error('Impossible de lancer l\'événement');
    }
  };

  // Rafraîchir les données
  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadEvents(), refreshActiveEvents()]);
    setRefreshing(false);
  };

  // Initialiser les événements par défaut
  const handleInitializeDefaults = async () => {
    try {
      confirmAsync({
        title: 'Initialiser les événements par défaut',
        message: 'Voulez-vous créer les événements par défaut ?',
        confirmLabel: 'Initialiser',
      }).then((ok) => {
        if (ok) (async () => {
              await initializeDefaultEvents();
              await loadEvents();
              toast.success('Événements par défaut initialisés');
            })();
      });
    } catch (error) {
      console.error('Erreur lors de l\'initialisation:', error);
      toast.error('Impossible d\'initialiser les événements par défaut');
    }
  };



  // Activer un événement
  const handleActivateEvent = async (eventId: string) => {
    try {
      confirmAsync({
        title: 'Activer l\'événement',
        message: 'Voulez-vous activer cet événement ? Les autres événements seront désactivés.',
        confirmLabel: 'Activer',
      }).then((ok) => {
        if (ok) (async () => {
              await activateEvent(eventId, true);
              await loadEvents();
              toast.success('Événement activé');
            })();
      });
    } catch (error) {
      console.error('Erreur lors de l\'activation:', error);
      toast.error('Impossible d\'activer l\'événement');
    }
  };

  // Désactiver un événement
  const handleDeactivateEvent = async (eventId: string) => {
    try {
      await deactivateEvent(eventId);
      await loadEvents();
      toast.success('Événement désactivé');
    } catch (error) {
      console.error('Erreur lors de la désactivation:', error);
      toast.error('Impossible de désactiver l\'événement');
    }
  };

  // Supprimer un événement
  const handleDeleteEvent = async (eventId: string) => {
    try {
      confirmAsync({
        title: 'Supprimer l\'événement',
        message: 'Êtes-vous sûr de vouloir supprimer cet événement ?',
        confirmLabel: 'Supprimer',
        destructive: true,
      }).then((ok) => {
        if (ok) (async () => {
              await deleteEvent(eventId);
              await loadEvents();
              toast.success('Événement supprimé');
            })();
      });
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
      toast.error('Impossible de supprimer l\'événement');
    }
  };


  // Charger les événements au montage
  useEffect(() => {
    loadEvents();
  }, []);

  if (permissionsLoading || loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Chargement...</Text>
      </View>
    );
  }

  if (!isAdmin && !isSuperAdmin) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="lock-closed" size={48} color={COLORS.error} />
        <Text style={styles.errorText}>Accès refusé</Text>
        <Text style={styles.errorSubtext}>Vous devez être administrateur pour accéder à cette page</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />

      <AppHeader
        navigation={navigation}
        title="Événements fonctionnels"
        right={(
          <TouchableOpacity style={styles.addButton} onPress={handleLaunchKosporEvent}>
            <Ionicons name="play" size={18} color={themeColors.white} />
          </TouchableOpacity>
        )}
      />

      {/* Bannière des événements actifs */}
      {activeEvents.length > 0 && (
        <FunctionalEventBanner events={activeEvents} />
      )}

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* Actions rapides */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={handleLaunchKosporEvent}
          >
            <Ionicons name="play-circle" size={24} color={COLORS.primary} />
            <Text style={styles.quickActionText}>Lancer l'Événement</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={handleRefresh}
          >
            <Ionicons name="refresh" size={24} color={COLORS.success} />
            <Text style={styles.quickActionText}>Rafraîchir</Text>
          </TouchableOpacity>
        </View>

        {/* Liste des événements */}
        <View style={styles.eventsSection}>
          <Text style={styles.sectionTitle}>Tous les événements ({events.length})</Text>
          
          {events.map((event) => (
            <View key={event.id} style={styles.eventCard}>
              <View style={styles.eventHeader}>
                <View style={styles.eventInfo}>
                  <Ionicons name={event.icon as any} size={20} color={COLORS.primary} />
                  <Text style={styles.eventName}>{event.name}</Text>
                  {event.is_active && (
                    <View style={styles.activeBadge}>
                      <Text style={styles.activeText}>ACTIF</Text>
                    </View>
                  )}
                </View>
                
                <View style={styles.eventActions}>
                  {event.is_active ? (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.deactivateButton]}
                      onPress={() => handleDeactivateEvent(event.id)}
                    >
                      <Ionicons name="pause" size={16} color={themeColors.white} />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.activateButton]}
                      onPress={() => handleActivateEvent(event.id)}
                    >
                      <Ionicons name="play" size={16} color={themeColors.white} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              
              <Text style={styles.eventDescription}>{event.description}</Text>
              
              <View style={styles.eventDetails}>
                <Text style={styles.eventDetail}>
                  Pages: {event.target_pages.join(', ')}
                </Text>
                <Text style={styles.eventDetail}>
                  Priorité: {event.priority}
                </Text>
                {event.auto_activate && (
                  <Text style={styles.eventDetail}>
                    Auto: {event.start_date ? new Date(event.start_date).toLocaleDateString() : 'N/A'} - {event.end_date ? new Date(event.end_date).toLocaleDateString() : 'N/A'}
                  </Text>
                )}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.bgPrimary,
  },
  loadingText: {
    color: COLORS.textPrimary,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.bgPrimary,
    padding: 20,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 20,
    fontWeight: 'bold', fontFamily: fonts.bold,
    marginTop: 16,
  },
  errorSubtext: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.bgSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: 'bold', fontFamily: fonts.bold,
    textAlign: 'center',
    marginHorizontal: 16,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...glow(themeColors.accent, 10),
  },
  scrollView: {
    flex: 1,
  },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  quickActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.glassBackground,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  quickActionText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '500', fontFamily: fonts.medium,
  },
  eventsSection: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: 'bold', fontFamily: fonts.bold,
    marginBottom: 16,
  },
  eventCard: {
    backgroundColor: COLORS.glassBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  eventInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  eventName: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: 'bold', fontFamily: fonts.bold,
    marginLeft: 8,
    flex: 1,
  },
  activeBadge: {
    backgroundColor: COLORS.success,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  activeText: {
    color: themeColors.white,
    fontSize: 10,
    fontWeight: 'bold', fontFamily: fonts.bold,
  },
  eventActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activateButton: {
    backgroundColor: COLORS.success,
  },
  deactivateButton: {
    backgroundColor: COLORS.warning,
  },
  eventDescription: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginBottom: 8,
  },
  eventDetails: {
    gap: 4,
  },
  eventDetail: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
});
