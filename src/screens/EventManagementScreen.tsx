import { fonts } from '../theme';
import { ScreenBackground, BackButton } from '../components/ui';
/**
 * Écran de gestion des événements pour les administrateurs
 * Permet de créer, modifier, activer et désactiver des événements thématiques
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  Switch,
  StatusBar,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { useEventStyles } from '../hooks/useEventStyles';
import { EventBanner } from '../components/EventBanner';
import { eventThemes, getAllEventThemes } from '../themes/eventThemes';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAdminPermissions } from '../hooks/useAdminPermissions';
import { useEvents } from '../contexts/EventContext';
import eventService, { Event, EventTheme } from '../services/eventService';
import EventThemeDisplay from '../components/EventThemeDisplay';
import { themePresetService, ThemePreset } from '../services/themePresetService';

const { width: screenWidth } = Dimensions.get('window');

// Couleurs du système
const COLORS = {
  primary: '#4F7CFF',
  secondary: '#3D63D9',
  accent: '#3354C4',
  bgPrimary: '#0B0C0F',
  bgSecondary: '#15171C',
  bgTertiary: '#1B1E25',
  textPrimary: '#F2F4F7',
  textSecondary: '#cbd5e0',
  textMuted: '#9BA1AC',
  success: '#2BC48A',
  error: '#F4365B',
  warning: '#E0A458',
  glassBorder: '#23262D',
  glassBackground: '#15171C',
};

const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
};

export default function EventManagementScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { isAdmin, isSuperAdmin, loading: permissionsLoading } = useAdminPermissions();
  const { 
    activeEvent, 
    refreshActiveEvent,
    activateEvent,
    deactivateEvent,
    createEvent,
    updateEvent,
    deleteEvent,
  } = useEvents();

  const { styles: eventStyles, theme: currentTheme } = useEventStyles();

  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [themePresets, setThemePresets] = useState<ThemePreset[]>([]);
  const [selectedThemePreset, setSelectedThemePreset] = useState<string | null>(null);
  const [showThemePresetModal, setShowThemePresetModal] = useState(false);

  // Formulaire pour créer/modifier un événement
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    icon: 'star',
    colors: ['#000000', '#ffffff'],
    theme_id: '',
    auto_activate: false,
    start_date: '',
    end_date: '',
    priority: 0,
  });

  // Charger les presets de thèmes
  const loadThemePresets = async () => {
    try {
      console.log('🎨 Chargement des presets de thèmes...');
      // Utiliser les thèmes locaux au lieu de l'API
      const allThemes = getAllEventThemes();
      console.log('🎨 Thèmes récupérés:', Object.keys(allThemes));
      
      const presets: ThemePreset[] = Object.values(allThemes).map(theme => ({
        id: theme.id,
        name: theme.name,
        description: theme.description,
        icon: theme.icon,
        colors: theme.colors,
        effects: theme.effects,
        preview: {
          primaryColor: theme.colors.primary,
          secondaryColor: theme.colors.secondary,
          accentColor: theme.colors.accent,
          backgroundColor: theme.colors.background,
        }
      }));
      
      setThemePresets(presets);
      console.log('✅ Presets de thèmes chargés:', presets.length, presets.map(p => p.name));
    } catch (error) {
      console.error('❌ Erreur lors du chargement des presets:', error);
    }
  };

  // Charger les événements
  const loadEvents = async () => {
    try {
      setLoading(true);
      const response = await eventService.getEvents({ include_inactive: true });
      if (response) {
        setEvents(response.events);
      }
    } catch (error) {
      console.error('❌ Erreur lors du chargement des événements:', error);
      Alert.alert('Erreur', 'Impossible de charger les événements');
    } finally {
      setLoading(false);
    }
  };

  // Rafraîchir les données
  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      loadEvents(),
      refreshActiveEvent(),
    ]);
    setRefreshing(false);
  };

  // Activer un événement
  const handleActivateEvent = async (event: Event) => {
    Alert.alert(
      '🎉 Activer l\'événement',
      `Voulez-vous activer l'événement "${event.name}" ?\n\nCela désactivera automatiquement les autres événements.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Activer',
          style: 'default',
          onPress: async () => {
            try {
              const success = await activateEvent(event.id);
              if (success) {
                Alert.alert('✅ Succès', `L'événement "${event.name}" a été activé !`);
                loadEvents();
              } else {
                Alert.alert('❌ Erreur', 'Impossible d\'activer l\'événement');
              }
            } catch (error) {
              Alert.alert('❌ Erreur', 'Une erreur est survenue lors de l\'activation');
            }
          },
        },
      ]
    );
  };

  // Désactiver un événement
  const handleDeactivateEvent = async (event: Event) => {
    Alert.alert(
      '🛑 Désactiver l\'événement',
      `Voulez-vous désactiver l'événement "${event.name}" ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Désactiver',
          style: 'destructive',
          onPress: async () => {
            try {
              const success = await deactivateEvent(event.id);
              if (success) {
                Alert.alert('✅ Succès', `L'événement "${event.name}" a été désactivé !`);
                loadEvents();
              } else {
                Alert.alert('❌ Erreur', 'Impossible de désactiver l\'événement');
              }
            } catch (error) {
              Alert.alert('❌ Erreur', 'Une erreur est survenue lors de la désactivation');
            }
          },
        },
      ]
    );
  };

  // Supprimer un événement
  const handleDeleteEvent = async (event: Event) => {
    Alert.alert(
      '🗑️ Supprimer l\'événement',
      `Êtes-vous sûr de vouloir supprimer l'événement "${event.name}" ?\n\nCette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              const success = await deleteEvent(event.id);
              if (success) {
                Alert.alert('✅ Succès', `L'événement "${event.name}" a été supprimé !`);
                loadEvents();
              } else {
                Alert.alert('❌ Erreur', 'Impossible de supprimer l\'événement');
              }
            } catch (error) {
              Alert.alert('❌ Erreur', 'Une erreur est survenue lors de la suppression');
            }
          },
        },
      ]
    );
  };

  // Ouvrir le modal d'édition
  const handleEditEvent = (event: Event) => {
    console.log('🔍 Édition d\'événement:', {
      name: event.name,
      theme_id: event.theme_id,
      hasThemeId: !!event.theme_id
    });
    
    setEditingEvent(event);
    setFormData({
      name: event.name,
      slug: event.slug,
      description: event.description || '',
      icon: event.icon || 'star',
      colors: event.colors || ['#000000', '#ffffff'],
      theme_id: event.theme_id || '',
      auto_activate: event.auto_activate,
      start_date: event.start_date || '',
      end_date: event.end_date || '',
      priority: event.priority,
    });
    setSelectedThemePreset(event.theme_id || null);
    setShowCreateModal(true);
  };

  // Créer ou modifier un événement
  const handleSubmitEvent = async () => {
    if (!formData.name.trim() || !formData.slug.trim()) {
      Alert.alert('❌ Erreur', 'Le nom et le slug sont requis');
      return;
    }

    try {
      const eventData = {
        ...formData,
        theme_config: {
          id: formData.slug,
          name: formData.name,
          description: formData.description,
          colors: formData.colors,
          icon: formData.icon,
        },
        effects: {
          particles: formData.slug === 'halloween' ? 'pumpkins' : 
                    formData.slug === 'christmas' ? 'snowflakes' :
                    formData.slug === 'new-year' ? 'fireworks' :
                    formData.slug === 'valentine' ? 'hearts' : 'none',
          animations: ['float'],
          sounds: false,
        },
      };

      let success = false;
      if (editingEvent) {
        const updatedEvent = await updateEvent(editingEvent.id, eventData);
        success = updatedEvent !== null;
      } else {
        const newEvent = await createEvent(eventData);
        success = newEvent !== null;
      }

      if (success) {
        Alert.alert(
          '✅ Succès',
          editingEvent ? 'Événement mis à jour !' : 'Événement créé !'
        );
        setShowCreateModal(false);
        setEditingEvent(null);
        resetForm();
        loadEvents();
      } else {
        Alert.alert('❌ Erreur', 'Impossible de sauvegarder l\'événement');
      }
    } catch (error: any) {
      Alert.alert('❌ Erreur', error.message || 'Une erreur est survenue');
    }
  };

  // Réinitialiser le formulaire
  const resetForm = () => {
    setFormData({
      name: '',
      slug: '',
      description: '',
      icon: 'star',
      colors: ['#000000', '#ffffff'],
      theme_id: '',
      auto_activate: false,
      start_date: '',
      end_date: '',
      priority: 0,
    });
    setSelectedThemePreset(null);
  };

  // Initialiser les événements par défaut
  const handleInitializeDefaults = async () => {
    Alert.alert(
      '🎉 Initialiser les événements',
      'Voulez-vous créer les événements par défaut (Halloween, Noël, etc.) ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Créer',
          style: 'default',
          onPress: async () => {
            try {
              const success = await eventService.initializeDefaultEvents();
              if (success) {
                Alert.alert('✅ Succès', 'Événements par défaut créés !');
                loadEvents();
              } else {
                Alert.alert('❌ Erreur', 'Impossible de créer les événements par défaut');
              }
            } catch (error) {
              Alert.alert('❌ Erreur', 'Une erreur est survenue');
            }
          },
        },
      ]
    );
  };

  // Charger les données au démarrage
  useEffect(() => {
    if (!permissionsLoading && (isAdmin || isSuperAdmin)) {
      loadEvents();
      loadThemePresets();
    }
  }, [permissionsLoading, isAdmin, isSuperAdmin]);

  // Vérification des permissions
  if (permissionsLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Vérification des permissions...</Text>
      </View>
    );
  }

  if (!isAdmin && !isSuperAdmin) {
    return (
      <View style={styles.noAccessContainer}>
        <Ionicons name="lock-closed" size={64} color={COLORS.error} />
        <Text style={styles.noAccessTitle}>Accès Refusé</Text>
        <Text style={styles.noAccessText}>
          Vous devez être administrateur pour accéder à cette fonctionnalité.
        </Text>
        <TouchableOpacity
          style={styles.goBackButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.goBackText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const renderEventCard = (event: Event) => (
    <View key={event.id} style={styles.eventCard}>
      <LinearGradient
        colors={event.colors && event.colors.length >= 2 ? [event.colors[0], event.colors[1]] : [COLORS.bgSecondary, COLORS.bgTertiary]}
        style={styles.eventCardGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <BlurView intensity={20} style={styles.eventCardBlur}>
          <View style={styles.eventCardHeader}>
            <View style={styles.eventInfo}>
              <View style={styles.eventIconContainer}>
                <Ionicons
                  name={event.icon as any || 'star'}
                  size={24}
                  color={COLORS.textPrimary}
                />
              </View>
              <View style={styles.eventDetails}>
                <Text style={styles.eventName}>{event.name}</Text>
                <Text style={styles.eventSlug}>@{event.slug}</Text>
                {event.description && (
                  <Text style={styles.eventDescription}>{event.description}</Text>
                )}
              </View>
            </View>
            <View style={styles.eventStatus}>
              {event.is_active && (
                <View style={styles.activeIndicator}>
                  <Text style={styles.activeText}>ACTIF</Text>
                </View>
              )}
              {event.theme_id && (
                <View style={styles.themeIndicator}>
                  <Text style={styles.themeText}>Thème: {event.theme_id}</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.eventActions}>
            {event.is_active ? (
              <TouchableOpacity
                style={[styles.actionButton, styles.deactivateButton]}
                onPress={() => handleDeactivateEvent(event)}
              >
                <Ionicons name="stop" size={16} color={COLORS.textPrimary} />
                <Text style={styles.actionButtonText}>Désactiver</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.actionButton, styles.activateButton]}
                onPress={() => handleActivateEvent(event)}
              >
                <Ionicons name="play" size={16} color={COLORS.textPrimary} />
                <Text style={styles.actionButtonText}>Activer</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.actionButton, styles.editButton]}
              onPress={() => handleEditEvent(event)}
            >
              <Ionicons name="pencil" size={16} color={COLORS.textPrimary} />
              <Text style={styles.actionButtonText}>Modifier</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.deleteButton]}
              onPress={() => handleDeleteEvent(event)}
            >
              <Ionicons name="trash" size={16} color={COLORS.textPrimary} />
              <Text style={styles.actionButtonText}>Supprimer</Text>
            </TouchableOpacity>
          </View>
        </BlurView>
      </LinearGradient>
    </View>
  );

  return (
    <ScreenBackground>
    <View style={[styles.container, eventStyles.container]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Bannière d'événement actif */}
      <EventBanner />
      
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }, eventStyles.header]}>
        <BackButton navigation={navigation} />
        <Text style={[styles.headerTitle, eventStyles.headerText]}>Gestion des Événements</Text>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={handleRefresh}
        >
          <Ionicons name="refresh" size={24} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {/* Événement actif */}
      {activeEvent && (
        <EventThemeDisplay 
          style={styles.activeEventDisplay}
          onPress={() => {}}
        />
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
            onPress={() => setShowCreateModal(true)}
          >
            <Ionicons name="add-circle" size={24} color={COLORS.primary} />
            <Text style={styles.quickActionText}>Nouvel Événement</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={handleInitializeDefaults}
          >
            <Ionicons name="download" size={24} color={COLORS.success} />
            <Text style={styles.quickActionText}>Événements par Défaut</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={handleRefresh}
          >
            <Ionicons name="refresh" size={24} color={COLORS.primary} />
            <Text style={styles.quickActionText}>Rafraîchir</Text>
          </TouchableOpacity>
        </View>

        {/* Liste des événements */}
        <View style={styles.eventsSection}>
          <Text style={styles.sectionTitle}>
            Événements ({events.length})
          </Text>

          {loading ? (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>Chargement...</Text>
            </View>
          ) : events.length > 0 ? (
            events.map(renderEventCard)
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="calendar-outline" size={64} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>Aucun événement</Text>
              <Text style={styles.emptyText}>
                Créez votre premier événement ou initialisez les événements par défaut.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Modal de création/modification */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowCreateModal(false);
          setEditingEvent(null);
          resetForm();
        }}
      >
        <View style={styles.modalOverlay}>
          <BlurView intensity={50} style={styles.modalBlur}>
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {editingEvent ? 'Modifier l\'événement' : 'Nouvel événement'}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setShowCreateModal(false);
                    setEditingEvent(null);
                    resetForm();
                  }}
                >
                  <Ionicons name="close" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalContent}>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Nom de l'événement</Text>
                  <TextInput
                    style={styles.formInput}
                    value={formData.name}
                    onChangeText={(text) => setFormData({ ...formData, name: text })}
                    placeholder="Ex: Halloween, Noël..."
                    placeholderTextColor={COLORS.textMuted}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Slug (identifiant unique)</Text>
                  <TextInput
                    style={styles.formInput}
                    value={formData.slug}
                    onChangeText={(text) => setFormData({ ...formData, slug: text.toLowerCase() })}
                    placeholder="Ex: halloween, christmas..."
                    placeholderTextColor={COLORS.textMuted}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Description</Text>
                  <TextInput
                    style={[styles.formInput, styles.textArea]}
                    value={formData.description}
                    onChangeText={(text) => setFormData({ ...formData, description: text })}
                    placeholder="Description de l'événement..."
                    placeholderTextColor={COLORS.textMuted}
                    multiline
                    numberOfLines={3}
                  />
                </View>

                <View style={styles.formRow}>
                  <View style={styles.formGroupSmall}>
                    <Text style={styles.formLabel}>Icône</Text>
                    <TextInput
                      style={styles.formInput}
                      value={formData.icon}
                      onChangeText={(text) => setFormData({ ...formData, icon: text })}
                      placeholder="star"
                      placeholderTextColor={COLORS.textMuted}
                    />
                  </View>

                  <View style={styles.formGroupSmall}>
                    <Text style={styles.formLabel}>Priorité</Text>
                    <TextInput
                      style={styles.formInput}
                      value={formData.priority.toString()}
                      onChangeText={(text) => setFormData({ ...formData, priority: parseInt(text) || 0 })}
                      placeholder="0"
                      placeholderTextColor={COLORS.textMuted}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Preset de thème pour les tweets</Text>
                  <TouchableOpacity
                    style={styles.themePresetSelector}
                    onPress={() => {
                      console.log('🎨 Ouverture de la modal de sélection de thème');
                      loadThemePresets();
                      setShowThemePresetModal(true);
                    }}
                  >
                    <View style={styles.themePresetContent}>
                      {selectedThemePreset ? (
                        <>
                          <View style={styles.themePresetInfo}>
                            <Text style={styles.themePresetName}>
                              {themePresets.find(p => p.id === selectedThemePreset)?.name || 'Thème sélectionné'}
                            </Text>
                            <Text style={styles.themePresetDescription}>
                              {themePresets.find(p => p.id === selectedThemePreset)?.description || ''}
                            </Text>
                          </View>
                          <View style={styles.themePresetPreview}>
                            <View style={[
                              styles.themePresetColor,
                              { backgroundColor: themePresets.find(p => p.id === selectedThemePreset)?.preview.primaryColor || '#000000' }
                            ]} />
                            <View style={[
                              styles.themePresetColor,
                              { backgroundColor: themePresets.find(p => p.id === selectedThemePreset)?.preview.accentColor || '#000000' }
                            ]} />
                          </View>
                        </>
                      ) : (
                        <Text style={styles.themePresetPlaceholder}>
                          Sélectionner un preset de thème...
                        </Text>
                      )}
                    </View>
                    <Ionicons name="chevron-down" size={20} color={COLORS.textMuted} />
                  </TouchableOpacity>
                </View>

                <View style={styles.formGroup}>
                  <View style={styles.switchRow}>
                    <Text style={styles.formLabel}>Activation automatique</Text>
                    <Switch
                      value={formData.auto_activate}
                      onValueChange={(value) => setFormData({ ...formData, auto_activate: value })}
                      trackColor={{ false: COLORS.textMuted, true: COLORS.primary }}
                    />
                  </View>
                </View>

                {formData.auto_activate && (
                  <>
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>Date de début</Text>
                      <TextInput
                        style={styles.formInput}
                        value={formData.start_date}
                        onChangeText={(text) => setFormData({ ...formData, start_date: text })}
                        placeholder="YYYY-MM-DD HH:MM:SS"
                        placeholderTextColor={COLORS.textMuted}
                      />
                    </View>

                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>Date de fin</Text>
                      <TextInput
                        style={styles.formInput}
                        value={formData.end_date}
                        onChangeText={(text) => setFormData({ ...formData, end_date: text })}
                        placeholder="YYYY-MM-DD HH:MM:SS"
                        placeholderTextColor={COLORS.textMuted}
                      />
                    </View>
                  </>
                )}
              </ScrollView>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => {
                    setShowCreateModal(false);
                    setEditingEvent(null);
                    resetForm();
                  }}
                >
                  <Text style={styles.cancelButtonText}>Annuler</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalButton, styles.saveButton]}
                  onPress={handleSubmitEvent}
                >
                  <Text style={styles.saveButtonText}>
                    {editingEvent ? 'Modifier' : 'Créer'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </BlurView>
        </View>
      </Modal>

      {/* Modal de sélection de preset de thème */}
      <Modal
        visible={showThemePresetModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowThemePresetModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.themePresetModal}>
            <View style={styles.themePresetModalHeader}>
              <Text style={styles.themePresetModalTitle}>Sélectionner un preset de thème</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowThemePresetModal(false)}
              >
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.themePresetList}>
              {themePresets.length === 0 ? (
                <Text style={styles.themePresetPlaceholder}>Aucun preset disponible</Text>
              ) : (
                themePresets.map((preset) => (
                  <TouchableOpacity
                    key={preset.id}
                    style={[
                      styles.themePresetItem,
                      selectedThemePreset === preset.id && styles.themePresetItemSelected
                    ]}
                    onPress={() => {
                      console.log('🎨 Sélection du preset:', preset.name);
                      setSelectedThemePreset(preset.id);
                      setFormData({ ...formData, theme_id: preset.id });
                      setShowThemePresetModal(false);
                    }}
                  >
                    <View style={styles.themePresetItemContent}>
                      <View style={styles.themePresetItemInfo}>
                        <Text style={styles.themePresetItemName}>{preset.name}</Text>
                        <Text style={styles.themePresetItemDescription}>{preset.description}</Text>
                      </View>
                      <View style={styles.themePresetItemPreview}>
                        <View style={[
                          styles.themePresetItemColor,
                          { backgroundColor: preset.preview.primaryColor }
                        ]} />
                        <View style={[
                          styles.themePresetItemColor,
                          { backgroundColor: preset.preview.accentColor }
                        ]} />
                      </View>
                    </View>
                    {selectedThemePreset === preset.id && (
                      <Ionicons name="checkmark-circle" size={24} color={COLORS.primary} />
                    )}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.bgSecondary,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.glassBorder,
  },
  backButton: {
    padding: SPACING.sm,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700', fontFamily: fonts.bold,
    color: COLORS.textPrimary,
    flex: 1,
    textAlign: 'center',
  },
  refreshButton: {
    padding: SPACING.sm,
  },
  activeEventDisplay: {
    marginHorizontal: SPACING.md,
    marginVertical: SPACING.sm,
  },
  scrollView: {
    flex: 1,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
  },
  quickActionButton: {
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: 12,
    backgroundColor: COLORS.glassBackground,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    minWidth: 120,
  },
  quickActionText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600', fontFamily: fonts.semibold,
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
  eventsSection: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700', fontFamily: fonts.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.lg,
  },
  eventCard: {
    marginBottom: SPACING.lg,
    borderRadius: 16,
    overflow: 'hidden',
  },
  eventCardGradient: {
    flex: 1,
  },
  eventCardBlur: {
    padding: SPACING.lg,
  },
  eventCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  eventInfo: {
    flexDirection: 'row',
    flex: 1,
  },
  eventIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.glassBackground,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  eventDetails: {
    flex: 1,
  },
  eventName: {
    fontSize: 18,
    fontWeight: '700', fontFamily: fonts.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  eventSlug: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  eventDescription: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  eventStatus: {
    alignItems: 'flex-end',
  },
  activeIndicator: {
    backgroundColor: COLORS.success,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: 8,
  },
  activeText: {
    color: COLORS.textPrimary,
    fontSize: 10,
    fontWeight: '700', fontFamily: fonts.bold,
  },
  eventActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    flex: 1,
    marginHorizontal: SPACING.xs,
    justifyContent: 'center',
  },
  activateButton: {
    backgroundColor: COLORS.success,
  },
  deactivateButton: {
    backgroundColor: COLORS.warning,
  },
  editButton: {
    backgroundColor: COLORS.primary,
  },
  deleteButton: {
    backgroundColor: COLORS.error,
  },
  actionButtonText: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '600', fontFamily: fonts.semibold,
    marginLeft: SPACING.xs,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 16,
  },
  noAccessContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
    backgroundColor: COLORS.bgPrimary,
  },
  noAccessTitle: {
    fontSize: 24,
    fontWeight: '700', fontFamily: fonts.bold,
    color: COLORS.textPrimary,
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
  },
  noAccessText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  goBackButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: 12,
  },
  goBackText: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  emptyContainer: {
    alignItems: 'center',
    padding: SPACING.xl,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700', fontFamily: fonts.bold,
    color: COLORS.textSecondary,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Styles du modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  modalBlur: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 500,
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 20,
    overflow: 'hidden',
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.glassBorder,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700', fontFamily: fonts.bold,
    color: COLORS.textPrimary,
  },
  modalContent: {
    padding: SPACING.lg,
    maxHeight: 400,
  },
  formGroup: {
    marginBottom: SPACING.lg,
  },
  formRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  formGroupSmall: {
    flex: 1,
    marginHorizontal: SPACING.xs,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  formInput: {
    backgroundColor: COLORS.glassBackground,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    borderRadius: 12,
    padding: SPACING.md,
    color: COLORS.textPrimary,
    fontSize: 16,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.glassBorder,
  },
  modalButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: 12,
    alignItems: 'center',
    marginHorizontal: SPACING.xs,
  },
  cancelButton: {
    backgroundColor: COLORS.glassBackground,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
  },
  cancelButtonText: {
    color: COLORS.textSecondary,
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  saveButtonText: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
  },

  // Styles pour la sélection de preset de thème
  themePresetSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.glassBackground,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    borderRadius: 12,
    padding: SPACING.md,
    marginTop: SPACING.sm,
  },
  themePresetContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  themePresetInfo: {
    flex: 1,
  },
  themePresetName: {
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  themePresetDescription: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  themePresetPreview: {
    flexDirection: 'row',
    marginLeft: SPACING.md,
  },
  themePresetColor: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginLeft: 4,
  },
  themePresetPlaceholder: {
    fontSize: 16,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },

  // Styles pour le modal de sélection de preset
  themePresetModal: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 20,
    overflow: 'hidden',
    maxHeight: '80%',
  },
  themePresetModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.glassBorder,
  },
  themePresetModalTitle: {
    fontSize: 18,
    fontWeight: '700', fontFamily: fonts.bold,
    color: COLORS.textPrimary,
  },
  closeButton: {
    padding: SPACING.sm,
  },
  themePresetList: {
    maxHeight: 400,
  },
  themePresetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.glassBorder,
  },
  themePresetItemSelected: {
    backgroundColor: COLORS.primary + '20',
  },
  themePresetItemContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  themePresetItemInfo: {
    flex: 1,
  },
  themePresetItemName: {
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  themePresetItemDescription: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  themePresetItemEffects: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  effectTag: {
    fontSize: 12,
    color: COLORS.primary,
    backgroundColor: COLORS.primary + '20',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginRight: 4,
    marginBottom: 4,
  },
  themePresetItemPreview: {
    flexDirection: 'row',
    marginLeft: SPACING.md,
  },
  themePresetItemColor: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginLeft: 4,
  },
  themeIndicator: {
    backgroundColor: COLORS.primary + '20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 4,
  },
  themeText: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
});
