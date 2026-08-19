import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, Switch,
  StatusBar, RefreshControl, Platform, KeyboardAvoidingView, ActivityIndicator,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { AppHeader, ScreenBackground, GlassCard, GlassButton, EmptyState, confirmAsync, showActionSheet } from '../components/ui';
import { useEventStyles } from '../hooks/useEventStyles';
import { EventBanner } from '../components/EventBanner';
import { getAllEventThemes } from '../themes/eventThemes';
import { useAdminPermissions } from '../hooks/useAdminPermissions';
import { useEvents } from '../contexts/EventContext';
import eventService, { Event } from '../services/eventService';
import EventThemeDisplay from '../components/EventThemeDisplay';
import { ThemePreset } from '../services/themePresetService';
import { toast } from '../components/ui/Toast';
import { colors, fonts, radius, statusBarStyle } from '../theme';

const emptyForm = {
  name: '', slug: '', description: '', icon: 'star',
  colors: ['#000000', '#ffffff'] as string[],
  theme_id: '', auto_activate: false, start_date: '', end_date: '', priority: 0,
};

export default function EventManagementScreen() {
  const navigation = useNavigation();
  const { isAdmin, isSuperAdmin, loading: permissionsLoading } = useAdminPermissions();
  const { activeEvent, refreshActiveEvent, activateEvent, deactivateEvent, createEvent, updateEvent, deleteEvent } = useEvents();
  const { styles: eventStyles } = useEventStyles();

  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [themePresets, setThemePresets] = useState<ThemePreset[]>([]);
  const [selectedThemePreset, setSelectedThemePreset] = useState<string | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const loadThemePresets = () => {
    const allThemes = getAllEventThemes();
    const presets: ThemePreset[] = Object.values(allThemes).map((theme) => ({
      id: theme.id, name: theme.name, description: theme.description, icon: theme.icon, colors: theme.colors,
      effects: {
        glow: Boolean(theme.effects.glow), shimmer: Boolean(theme.effects.shimmer), pulse: Boolean(theme.effects.pulse),
        particles: Boolean(theme.effects.particles), sparkles: Boolean(theme.effects.sparkles),
      },
      preview: {
        primaryColor: theme.colors.primary, secondaryColor: theme.colors.secondary,
        accentColor: theme.colors.accent, backgroundColor: theme.colors.background,
      },
    }));
    setThemePresets(presets);
  };

  const loadEvents = useCallback(async () => {
    try {
      setLoading(true);
      const response = await eventService.getEvents({ include_inactive: true });
      if (response) setEvents(response.events);
    } catch {
      toast.error('Impossible de charger les événements');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!permissionsLoading && (isAdmin || isSuperAdmin)) {
      loadEvents();
      loadThemePresets();
    }
  }, [permissionsLoading, isAdmin, isSuperAdmin, loadEvents]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadEvents(), refreshActiveEvent()]);
    setRefreshing(false);
  };

  const activate = (event: Event) => {
    confirmAsync({
      title: 'Activer l\'événement',
      message: `Activer « ${event.name} » désactivera automatiquement les autres événements.`,
      confirmLabel: 'Activer',
    }).then(async (ok) => {
      if (!ok) return;
      setBusyId(event.id);
      const success = await activateEvent(event.id);
      setBusyId(null);
      if (success) { toast.success(`« ${event.name} » activé`); loadEvents(); }
      else toast.error('Impossible d\'activer l\'événement');
    });
  };

  const deactivate = (event: Event) => {
    confirmAsync({
      title: 'Désactiver l\'événement',
      message: `Désactiver « ${event.name} » ?`,
      confirmLabel: 'Désactiver',
      destructive: true,
    }).then(async (ok) => {
      if (!ok) return;
      setBusyId(event.id);
      const success = await deactivateEvent(event.id);
      setBusyId(null);
      if (success) { toast.success(`« ${event.name} » désactivé`); loadEvents(); }
      else toast.error('Impossible de désactiver l\'événement');
    });
  };

  const remove = (event: Event) => {
    confirmAsync({
      title: 'Supprimer l\'événement',
      message: `Supprimer « ${event.name} » ? Cette action est irréversible.`,
      confirmLabel: 'Supprimer',
      destructive: true,
    }).then(async (ok) => {
      if (!ok) return;
      setBusyId(event.id);
      const success = await deleteEvent(event.id);
      setBusyId(null);
      if (success) { toast.success(`« ${event.name} » supprimé`); loadEvents(); }
      else toast.error('Impossible de supprimer l\'événement');
    });
  };

  const openCreate = () => {
    setEditingEvent(null);
    setFormData(emptyForm);
    setSelectedThemePreset(null);
    setShowFormModal(true);
  };

  const openEdit = (event: Event) => {
    setEditingEvent(event);
    setFormData({
      name: event.name, slug: event.slug, description: event.description || '',
      icon: event.icon || 'star', colors: event.colors || ['#000000', '#ffffff'],
      theme_id: event.theme_id || '', auto_activate: event.auto_activate,
      start_date: event.start_date || '', end_date: event.end_date || '', priority: event.priority,
    });
    setSelectedThemePreset(event.theme_id || null);
    setShowFormModal(true);
  };

  const pickThemePreset = () => {
    if (themePresets.length === 0) { toast.info('Aucun preset disponible'); return; }
    showActionSheet({
      title: 'Preset de thème',
      items: themePresets.map((p) => ({
        label: p.name,
        hint: p.description,
        icon: (selectedThemePreset === p.id ? 'checkmark-circle' : 'color-palette-outline') as any,
        onPress: () => { setSelectedThemePreset(p.id); setFormData((f) => ({ ...f, theme_id: p.id })); },
      })),
    });
  };

  const submit = async () => {
    if (!formData.name.trim() || !formData.slug.trim()) {
      toast.error('Le nom et le slug sont requis');
      return;
    }
    setSaving(true);
    try {
      const eventData = {
        ...formData,
        theme_config: { id: formData.slug, name: formData.name, description: formData.description, colors: formData.colors, icon: formData.icon },
        effects: {
          particles: formData.slug === 'halloween' ? 'pumpkins' : formData.slug === 'christmas' ? 'snowflakes' : formData.slug === 'new-year' ? 'fireworks' : formData.slug === 'valentine' ? 'hearts' : 'none',
          animations: ['float'],
          sounds: false,
        },
      };
      const success = editingEvent ? (await updateEvent(editingEvent.id, eventData)) !== null : (await createEvent(eventData)) !== null;
      if (success) {
        toast.success(editingEvent ? 'Événement mis à jour' : 'Événement créé');
        setShowFormModal(false);
        loadEvents();
      } else {
        toast.error('Impossible de sauvegarder l\'événement');
      }
    } catch (error: any) {
      toast.error(error.message || 'Une erreur est survenue');
    } finally {
      setSaving(false);
    }
  };

  const initializeDefaults = () => {
    confirmAsync({
      title: 'Initialiser les événements',
      message: 'Créer les événements par défaut (Halloween, Noël, etc.) ?',
      confirmLabel: 'Créer',
    }).then(async (ok) => {
      if (!ok) return;
      const success = await eventService.initializeDefaultEvents();
      if (success) { toast.success('Événements par défaut créés'); loadEvents(); }
      else toast.error('Impossible de créer les événements par défaut');
    });
  };

  if (permissionsLoading) {
    return (
      <ScreenBackground>
        <View style={styles.loadingBox}><ActivityIndicator color={colors.accent} /></View>
      </ScreenBackground>
    );
  }

  if (!isAdmin && !isSuperAdmin) {
    return (
      <ScreenBackground>
        <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
        <AppHeader navigation={navigation} title="Événements" />
        <View style={styles.deniedBox}>
          <Ionicons name="lock-closed-outline" size={56} color={colors.red} />
          <Text style={styles.deniedTitle}>Accès refusé</Text>
          <Text style={styles.deniedText}>Tu dois être administrateur pour accéder à cette fonctionnalité.</Text>
        </View>
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
      <View style={eventStyles.container}>
        <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
        <EventBanner />
        <AppHeader
          navigation={navigation}
          title="Événements"
          style={eventStyles.header}
          right={(
            <TouchableOpacity onPress={onRefresh} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="refresh-outline" size={20} color={colors.accent} />
            </TouchableOpacity>
          )}
        />

        {activeEvent && <EventThemeDisplay style={styles.activeEventDisplay} onPress={() => {}} />}

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        >
          <View style={styles.quickActionsRow}>
            <GlassButton label="Nouvel événement" icon="add-circle-outline" style={{ flex: 1 }} onPress={openCreate} />
            <GlassButton label="Par défaut" icon="download-outline" variant="secondary" style={{ flex: 1 }} onPress={initializeDefaults} />
          </View>

          <Text style={styles.sectionTitle}>Événements ({events.length})</Text>

          {loading ? (
            <View style={styles.loadingBox}><ActivityIndicator color={colors.accent} /></View>
          ) : events.length === 0 ? (
            <EmptyState icon="calendar-outline" title="Aucun événement" message="Crée ton premier événement ou initialise les événements par défaut." />
          ) : (
            events.map((event) => {
              const busy = busyId === event.id;
              return (
                <GlassCard key={event.id} style={styles.card}>
                  <View style={styles.cardTopRow}>
                    <View style={[styles.eventIcon, { backgroundColor: colors.accentSoft }]}>
                      <Ionicons name={(event.icon as any) || 'star'} size={20} color={colors.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.eventName}>{event.name}</Text>
                      <Text style={styles.eventSlug}>@{event.slug}</Text>
                    </View>
                    {event.is_active && (
                      <View style={styles.activeBadge}><Text style={styles.activeBadgeText}>Actif</Text></View>
                    )}
                  </View>

                  {event.description ? <Text style={styles.eventDescription}>{event.description}</Text> : null}
                  {event.theme_id ? (
                    <View style={styles.themeBadge}><Text style={styles.themeBadgeText}>Thème : {event.theme_id}</Text></View>
                  ) : null}

                  <View style={styles.actionsRow}>
                    {event.is_active ? (
                      <GlassButton label="Désactiver" icon="stop-outline" variant="secondary" style={{ flex: 1 }} loading={busy} disabled={busy} onPress={() => deactivate(event)} />
                    ) : (
                      <GlassButton label="Activer" icon="play-outline" variant="secondary" style={{ flex: 1 }} loading={busy} disabled={busy} onPress={() => activate(event)} />
                    )}
                    <GlassButton label="Modifier" icon="pencil-outline" variant="secondary" style={{ flex: 1 }} disabled={busy} onPress={() => openEdit(event)} />
                    <GlassButton label="Suppr." icon="trash-outline" variant="secondary" style={{ flex: 1 }} disabled={busy} onPress={() => remove(event)} />
                  </View>
                </GlassCard>
              );
            })
          )}
          <View style={{ height: 40 }} />
        </ScrollView>

        <Modal visible={showFormModal} animationType="slide" transparent onRequestClose={() => setShowFormModal(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>{editingEvent ? 'Modifier l\'événement' : 'Nouvel événement'}</Text>
                <TouchableOpacity onPress={() => setShowFormModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Nom</Text>
                  <TextInput style={styles.input} value={formData.name} onChangeText={(t) => setFormData({ ...formData, name: t })} placeholder="Ex : Halloween, Noël..." placeholderTextColor={colors.textMuted} />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Slug (identifiant unique)</Text>
                  <TextInput style={styles.input} value={formData.slug} onChangeText={(t) => setFormData({ ...formData, slug: t.toLowerCase() })} placeholder="Ex : halloween, christmas..." placeholderTextColor={colors.textMuted} autoCapitalize="none" />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Description</Text>
                  <TextInput style={[styles.input, styles.inputMultiline]} value={formData.description} onChangeText={(t) => setFormData({ ...formData, description: t })} placeholder="Description de l'événement..." placeholderTextColor={colors.textMuted} multiline />
                </View>

                <View style={styles.inputRow}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Icône</Text>
                    <TextInput style={styles.input} value={formData.icon} onChangeText={(t) => setFormData({ ...formData, icon: t })} placeholder="star" placeholderTextColor={colors.textMuted} />
                  </View>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Priorité</Text>
                    <TextInput style={styles.input} value={String(formData.priority)} onChangeText={(t) => setFormData({ ...formData, priority: parseInt(t, 10) || 0 })} placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Preset de thème (tweets)</Text>
                  <TouchableOpacity style={styles.presetSelector} onPress={pickThemePreset} activeOpacity={0.8}>
                    <Text style={selectedThemePreset ? styles.presetSelectorText : styles.presetSelectorPlaceholder}>
                      {selectedThemePreset ? themePresets.find((p) => p.id === selectedThemePreset)?.name || 'Sélectionné' : 'Choisir un preset...'}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>

                <View style={styles.switchRow}>
                  <Text style={styles.inputLabel}>Activation automatique</Text>
                  <Switch value={formData.auto_activate} onValueChange={(v) => setFormData({ ...formData, auto_activate: v })} trackColor={{ false: colors.overlaySoft, true: colors.accentMuted }} thumbColor={formData.auto_activate ? colors.accent : undefined} />
                </View>

                {formData.auto_activate && (
                  <>
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Date de début</Text>
                      <TextInput style={styles.input} value={formData.start_date} onChangeText={(t) => setFormData({ ...formData, start_date: t })} placeholder="AAAA-MM-JJ HH:MM:SS" placeholderTextColor={colors.textMuted} />
                    </View>
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Date de fin</Text>
                      <TextInput style={styles.input} value={formData.end_date} onChangeText={(t) => setFormData({ ...formData, end_date: t })} placeholder="AAAA-MM-JJ HH:MM:SS" placeholderTextColor={colors.textMuted} />
                    </View>
                  </>
                )}
              </ScrollView>

              <View style={styles.modalActionsRow}>
                <GlassButton label="Annuler" variant="secondary" style={{ flex: 1 }} onPress={() => setShowFormModal(false)} />
                <GlassButton label={editingEvent ? 'Modifier' : 'Créer'} style={{ flex: 1 }} loading={saving} onPress={submit} />
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  activeEventDisplay: { marginHorizontal: 16, marginVertical: 8 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 20 },
  quickActionsRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  sectionTitle: { fontSize: 15, fontFamily: fonts.bold, color: colors.textPrimary, marginBottom: 12 },
  card: { padding: 14, marginBottom: 12 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  eventIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  eventName: { fontSize: 15, fontFamily: fonts.semibold, color: colors.textPrimary },
  eventSlug: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  activeBadge: { backgroundColor: colors.successMuted, paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.round },
  activeBadgeText: { fontSize: 10, fontFamily: fonts.bold, color: colors.success, textTransform: 'uppercase' },
  eventDescription: { fontSize: 12.5, color: colors.textSecondary, marginTop: 10, lineHeight: 18 },
  themeBadge: { alignSelf: 'flex-start', backgroundColor: colors.accentSoft, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm, marginTop: 8 },
  themeBadgeText: { fontSize: 10.5, fontFamily: fonts.semibold, color: colors.accent },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  deniedBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 },
  deniedTitle: { fontSize: 20, fontFamily: fonts.bold, color: colors.textPrimary, marginTop: 8 },
  deniedText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 20, maxHeight: '90%', borderWidth: 1, borderColor: colors.border, borderBottomWidth: 0 },
  modalHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontFamily: fonts.bold, color: colors.textPrimary },
  inputGroup: { marginBottom: 14 },
  inputRow: { flexDirection: 'row', gap: 10 },
  inputLabel: { fontSize: 11.5, fontFamily: fonts.bold, color: colors.textMuted, marginBottom: 7, textTransform: 'uppercase', letterSpacing: 0.3 },
  input: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 12, color: colors.textPrimary, fontSize: 14, borderWidth: 1, borderColor: colors.border },
  inputMultiline: { height: 72, textAlignVertical: 'top' },
  presetSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.border },
  presetSelectorText: { fontSize: 14, color: colors.textPrimary, fontFamily: fonts.medium },
  presetSelectorPlaceholder: { fontSize: 14, color: colors.textMuted },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  modalActionsRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
});
