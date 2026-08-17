import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Clipboard,
  Platform,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radius, statusBarStyle } from '../theme';
import {
  AppHeader,
  AppRefreshControl,
  Button,
  EmptyState,
  ErrorState,
  ScreenBackground,
  ScreenSkeleton,
  Tappable,
} from '../components/ui';
import { confirmAsync } from '../components/ui/ConfirmSheet';
import { showActionSheet } from '../components/ui/ActionSheet';
import { toast } from '../components/ui/Toast';
import eventPassService, {
  DOOR_LINK_HOURS,
  MAX_BATCH,
  STATUS_LABELS,
  TIERS,
  TIER_LABELS,
  type AdminPass,
  type EventStats,
  type EventSummary,
  type PassTier,
} from '../services/eventPassService';

/**
 * Émission et suivi des places d'invitation — côté organisation.
 *
 * Trois vues dans un seul écran : la liste des événements, le formulaire
 * d'émission, et le détail d'un événement (compteurs, refus, places).
 *
 * ── Ce que cet écran ne montre pas ────────────────────────────────────────
 * Ni `event_slug` brut comme identité principale, ni `max_scans` sous son nom
 * de colonne : un écran d'administration propose des choix prêts à l'emploi,
 * il n'expose pas le modèle de données du serveur. L'identifiant technique
 * reste visible, parce que c'est lui qu'on retrouve dans un lien de contrôle
 * et dans une URL, mais il se remplit tout seul depuis le nom.
 */

type Mode = 'events' | 'issue' | 'event';

/** Comment les places sont attribuées à l'émission. */
type Assignment = 'named' | 'bearer';

const REFUSAL_LABELS: Record<string, string> = {
  bad_signature: 'Faux code',
  unknown: 'Code inconnu',
  revoked: 'Place annulée',
  expired: 'Place expirée',
  already_used: 'Déjà utilisée',
  wrong_event: 'Autre événement',
};

function formatDay(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatMoment(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('fr-FR', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

/* ── Écran ──────────────────────────────────────────────────────────────── */

export default function EventPassAdminScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<Mode>('events');
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<EventSummary | null>(null);

  const loadEvents = useCallback(async (fromRefresh = false) => {
    if (!fromRefresh) setLoading(true);
    const res = await eventPassService.fetchEvents();
    if (res.success) {
      setEvents(res.data || []);
      setError(null);
    } else {
      setError(res.message || 'Lecture impossible.');
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const openEvent = useCallback((event: EventSummary) => {
    setSelected(event);
    setMode('event');
  }, []);

  const afterIssue = useCallback(async (slug: string) => {
    const res = await eventPassService.fetchEvents();
    const list = res.success ? (res.data || []) : [];
    setEvents(list);
    const found = list.find((event) => event.event_slug === slug);
    if (found) {
      setSelected(found);
      setMode('event');
    } else {
      setMode('events');
    }
  }, []);

  const header = () => {
    if (mode === 'issue') {
      return (
        <AppHeader
          navigation={navigation}
          title="Émettre des places"
          subtitle="Un lot pour un événement"
          right={(
            <Tappable style={styles.headerAction} onPress={() => setMode('events')} hitSlop={10}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </Tappable>
          )}
        />
      );
    }

    if (mode === 'event' && selected) {
      return (
        <AppHeader
          navigation={navigation}
          title={selected.event_name}
          subtitle={[formatDay(selected.event_date), selected.event_place].filter(Boolean).join('  ·  ') || 'Places émises'}
          right={(
            <Tappable style={styles.headerAction} onPress={() => setMode('events')} hitSlop={10}>
              <Ionicons name="arrow-back" size={20} color={colors.textSecondary} />
            </Tappable>
          )}
        />
      );
    }

    return (
      <AppHeader
        navigation={navigation}
        title="Places d’invitation"
        subtitle="Émettre, suivre, contrôler à l’entrée"
      />
    );
  };

  const body = () => {
    if (mode === 'issue') {
      return <IssueForm onDone={afterIssue} onCancel={() => setMode('events')} />;
    }

    if (mode === 'event' && selected) {
      return <EventDetail event={selected} onChanged={() => loadEvents(true)} />;
    }

    if (loading) return <ScreenSkeleton variant="list" />;
    if (error) return <ErrorState detail={error} onRetry={() => loadEvents()} />;

    return (
      <ScrollView
        contentContainerStyle={[styles.scrollInner, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={(
          <AppRefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadEvents(true); }}
          />
        )}
      >
        <Button
          label="Émettre un lot de places"
          icon="add-circle-outline"
          fullWidth
          onPress={() => setMode('issue')}
        />

        {!events?.length ? (
          <EmptyState
            icon="ticket-outline"
            title="Aucune place émise"
            message="Émets un premier lot : les places apparaîtront ici avec leur suivi d’entrée."
            style={{ marginTop: 24 }}
          />
        ) : (
          <>
            <Text style={styles.sectionTitle}>Événements</Text>
            {events.map((event) => (
              <Tappable
                key={event.event_slug}
                style={styles.eventCard}
                onPress={() => openEvent(event)}
              >
                <View style={styles.eventHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eventName} numberOfLines={1}>{event.event_name}</Text>
                    <Text style={styles.eventMeta} numberOfLines={1}>
                      {[formatDay(event.event_date), event.event_place].filter(Boolean).join('  ·  ')
                        || `Identifiant « ${event.event_slug} »`}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </View>

                <View style={styles.tallyRow}>
                  <Tally label="Places" value={event.total} />
                  <Tally label="Valables" value={event.valid} tint={colors.success} />
                  <Tally label="Passées" value={event.used} tint={colors.cyan} />
                  <Tally label="Annulées" value={event.revoked} tint={colors.red} />
                </View>
              </Tappable>
            ))}
          </>
        )}
      </ScrollView>
    );
  };

  return (
    <ScreenBackground>
      <View style={styles.container}>
        <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
        {header()}
        {body()}
      </View>
    </ScreenBackground>
  );
}

function Tally({ label, value, tint = colors.textPrimary }: { label: string; value: number; tint?: string }) {
  return (
    <View style={styles.tally}>
      <Text style={[styles.tallyValue, { color: tint }]}>{value}</Text>
      <Text style={styles.tallyLabel}>{label}</Text>
    </View>
  );
}

/* ── Émission d'un lot ──────────────────────────────────────────────────── */

function IssueForm({
  onDone, onCancel,
}: {
  onDone: (slug: string) => void;
  onCancel: () => void;
}) {
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  /** Vrai dès que l'identifiant a été touché : on cesse alors de le déduire. */
  const [slugTouched, setSlugTouched] = useState(false);
  const [slug, setSlug] = useState('');
  const [place, setPlace] = useState('');
  const [withDate, setWithDate] = useState(false);
  const [when, setWhen] = useState(new Date());
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);
  const [tier, setTier] = useState<PassTier>('standard');
  const [assignment, setAssignment] = useState<Assignment>('named');
  const [guestList, setGuestList] = useState('');
  const [quantity, setQuantity] = useState('20');
  const [entries, setEntries] = useState('1');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  const effectiveSlug = slugTouched ? eventPassService.slugify(slug) : eventPassService.slugify(name);

  const guests = useMemo(
    () => guestList.split('\n').map((line) => line.trim()).filter(Boolean),
    [guestList],
  );

  const count = assignment === 'named' ? guests.length : (Number.parseInt(quantity, 10) || 0);
  const canSend = !!name.trim() && !!effectiveSlug && count > 0 && count <= MAX_BATCH && !sending;

  const submit = useCallback(async () => {
    if (!canSend) return;
    setSending(true);

    const res = await eventPassService.createBatch({
      event_slug: effectiveSlug,
      event_name: name.trim(),
      event_date: withDate ? when.toISOString() : null,
      event_place: place.trim() || null,
      tier,
      guests: assignment === 'named' ? guests.map((guest) => ({ name: guest })) : undefined,
      quantity: assignment === 'bearer' ? count : undefined,
      max_scans: Math.max(1, Number.parseInt(entries, 10) || 1),
      note: note.trim() || null,
    });

    setSending(false);

    if (!res.success) {
      toast.error('Émission impossible', { description: res.message });
      return;
    }

    toast.success(`${res.data?.count ?? count} place(s) émise(s)`, {
      description: 'Elles sont prêtes à être envoyées aux invités.',
    });
    onDone(effectiveSlug);
  }, [
    canSend, effectiveSlug, name, withDate, when, place, tier,
    assignment, guests, count, entries, note, onDone,
  ]);

  return (
    <ScrollView
      contentContainerStyle={[styles.scrollInner, { paddingBottom: insets.bottom + 40 }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.fieldLabel}>Nom de l’événement</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Nuit TwitNinf"
        placeholderTextColor={colors.textMuted}
        maxLength={120}
      />

      <Text style={styles.fieldLabel}>Identifiant</Text>
      <TextInput
        style={styles.input}
        value={slugTouched ? slug : effectiveSlug}
        onChangeText={(next) => { setSlugTouched(true); setSlug(next); }}
        placeholder="nuit-twitninf"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={64}
      />
      <Text style={styles.fieldHint}>
        Il regroupe les places d’un même événement et sert au contrôle à l’entrée.
        Réutilise le même identifiant pour ajouter des places plus tard.
      </Text>

      <Text style={styles.fieldLabel}>Lieu</Text>
      <TextInput
        style={styles.input}
        value={place}
        onChangeText={setPlace}
        placeholder="Institut français"
        placeholderTextColor={colors.textMuted}
        maxLength={120}
      />

      <Text style={styles.fieldLabel}>Date</Text>
      <View style={styles.chipRow}>
        <Chip label="Sans date" active={!withDate} onPress={() => setWithDate(false)} />
        <Chip label="Choisir" active={withDate} onPress={() => setWithDate(true)} />
      </View>

      {withDate && (
        <>
          <View style={styles.chipRow}>
            <Tappable style={styles.whenButton} onPress={() => setPicker('date')}>
              <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.whenText}>
                {when.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
              </Text>
            </Tappable>
            <Tappable style={styles.whenButton} onPress={() => setPicker('time')}>
              <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.whenText}>
                {when.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </Tappable>
          </View>

          {picker && (
            <DateTimePicker
              value={when}
              mode={picker}
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(event, chosen) => {
                // Android referme le sélecteur à chaque interaction ; iOS le
                // garde ouvert tant qu'on ne le referme pas.
                if (Platform.OS === 'android') setPicker(null);
                if (event.type === 'dismissed' || !chosen) return;
                setWhen(chosen);
              }}
            />
          )}
          {picker && Platform.OS === 'ios' && (
            <Button label="Terminé" variant="ghost" onPress={() => setPicker(null)} />
          )}
        </>
      )}

      <Text style={styles.fieldLabel}>Palier</Text>
      <View style={styles.chipRow}>
        {TIERS.map((item) => (
          <Chip
            key={item.key}
            label={item.label}
            active={tier === item.key}
            onPress={() => setTier(item.key)}
          />
        ))}
      </View>
      <Text style={styles.fieldHint}>
        {TIERS.find((item) => item.key === tier)?.hint}
        {'  '}Le palier colore la carte de la place, jamais son code.
      </Text>

      <Text style={styles.fieldLabel}>À qui</Text>
      <View style={styles.chipRow}>
        <Chip label="Invités nommés" active={assignment === 'named'} onPress={() => setAssignment('named')} />
        <Chip label="Places au porteur" active={assignment === 'bearer'} onPress={() => setAssignment('bearer')} />
      </View>

      {assignment === 'named' ? (
        <>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={guestList}
            onChangeText={setGuestList}
            placeholder={'Un nom par ligne\nThéo Mabiala\nAïcha N.'}
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
          />
          <Text style={styles.fieldHint}>
            Le nom s’imprime sur la place. {guests.length} place(s) seront émises.
          </Text>
        </>
      ) : (
        <>
          <TextInput
            style={styles.input}
            value={quantity}
            onChangeText={(next) => setQuantity(next.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            placeholder="20"
            placeholderTextColor={colors.textMuted}
            maxLength={3}
          />
          <Text style={styles.fieldHint}>
            Des places sans nom, à distribuer librement. Chacune reste unique et vérifiée.
          </Text>
        </>
      )}

      <Text style={styles.fieldLabel}>Entrées autorisées par place</Text>
      <TextInput
        style={styles.input}
        value={entries}
        onChangeText={(next) => setEntries(next.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
        maxLength={2}
      />
      <Text style={styles.fieldHint}>
        1 pour une invitation ordinaire. Au-delà, c’est un laissez-passer d’équipe :
        il peut franchir la porte plusieurs fois.
      </Text>

      <Text style={styles.fieldLabel}>Note interne</Text>
      <TextInput
        style={styles.input}
        value={note}
        onChangeText={setNote}
        placeholder="Partenaires, plateau, etc."
        placeholderTextColor={colors.textMuted}
        maxLength={160}
      />
      <Text style={styles.fieldHint}>Jamais imprimée sur la place.</Text>

      {count > MAX_BATCH && (
        <Text style={styles.warning}>
          Un lot va jusqu’à {MAX_BATCH} places. Émets-en plusieurs.
        </Text>
      )}

      <View style={styles.formActions}>
        <Button
          label={count > 0 ? `Émettre ${count} place${count > 1 ? 's' : ''}` : 'Émettre'}
          icon="ticket-outline"
          fullWidth
          loading={sending}
          disabled={!canSend}
          onPress={submit}
        />
        <Button label="Annuler" variant="ghost" fullWidth onPress={onCancel} />
      </View>
    </ScrollView>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Tappable
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      scaleTo={0.96}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Tappable>
  );
}

/* ── Détail d'un événement ──────────────────────────────────────────────── */

function EventDetail({ event, onChanged }: { event: EventSummary; onChanged: () => void }) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [stats, setStats] = useState<EventStats | null>(null);
  const [passes, setPasses] = useState<AdminPass[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (fromRefresh = false) => {
    if (!fromRefresh) setLoading(true);
    const [statsRes, passesRes] = await Promise.all([
      eventPassService.fetchEventStats(event.event_slug),
      eventPassService.fetchPasses({ eventSlug: event.event_slug, limit: 200 }),
    ]);
    if (statsRes.success) setStats(statsRes.data || null);
    if (passesRes.success) setPasses(passesRes.data?.passes || []);
    setLoading(false);
    setRefreshing(false);
  }, [event.event_slug]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Le lien de contrôle.
   *
   * Il n'ouvre que la porte de CET événement et expire tout seul — c'est ce qui
   * permet de le confier à une équipe d'accueil sans lui donner un rôle de
   * modération qu'on oubliera de retirer après la soirée.
   */
  const issueDoorLink = useCallback(async (hours: number) => {
    const res = await eventPassService.createDoorLink(event.event_slug, hours);
    if (!res.success || !res.data) {
      toast.error('Lien impossible', { description: res.message });
      return;
    }

    const { url, expires_at: expiresAt } = res.data;
    const shareIt = await confirmAsync({
      title: 'Lien de contrôle prêt',
      message: `Il cesse de fonctionner tout seul le ${formatMoment(expiresAt)}.`,
      detail: 'Il n’ouvre que la porte de cet événement, et rien d’autre.',
      confirmLabel: 'Envoyer',
      cancelLabel: 'Copier seulement',
    });

    if (shareIt) {
      await Share.share({ message: url });
    } else {
      Clipboard.setString(url);
      toast.success('Lien copié');
    }
  }, [event.event_slug]);

  const makeDoorLink = useCallback(() => {
    showActionSheet({
      title: 'Durée du lien de contrôle',
      message: 'Passé ce délai, le lien cesse de fonctionner sans qu’on ait à y penser.',
      items: DOOR_LINK_HOURS.map((hours) => ({
        label: `${hours} heures`,
        icon: 'time-outline' as const,
        onPress: () => { issueDoorLink(hours); },
      })),
    });
  }, [issueDoorLink]);

  /**
   * La liste des places, prête à coller dans un publipostage.
   *
   * Construite ici plutôt que téléchargée depuis `export.csv` : sur un
   * téléphone, un fichier CSV ne s'ouvre nulle part, alors qu'un texte se colle
   * dans un courriel ou une feuille de calcul. Mêmes colonnes, même séparateur
   * point-virgule — c'est celui qu'attend un tableur en français.
   */
  const shareList = useCallback(async () => {
    if (!passes?.length) {
      toast.info('Aucune place à partager');
      return;
    }

    const lines = ['numero;code;invite;palier;statut;lien'];
    for (const pass of passes) {
      lines.push([
        pass.serial,
        pass.code,
        pass.guest_name || '',
        pass.tier,
        pass.status,
        pass.url || '',
      ].join(';'));
    }

    await Share.share({
      title: `Places — ${event.event_name}`,
      message: lines.join('\n'),
    });
  }, [passes, event.event_name]);

  const togglePass = useCallback(async (pass: AdminPass) => {
    if (pass.status === 'revoked') {
      const res = await eventPassService.restorePass(pass.id);
      if (!res.success) {
        toast.error('Restauration impossible', { description: res.message });
        return;
      }
      toast.success('Place remise en circulation');
    } else {
      const sure = await confirmAsync({
        title: `Annuler la place Nº ${String(pass.serial).padStart(3, '0')} ?`,
        message: 'Elle sera refusée à l’entrée. Tu pourras la remettre en circulation ensuite.',
        confirmLabel: 'Annuler la place',
        destructive: true,
      });
      if (!sure) return;

      const res = await eventPassService.revokePass(pass.id);
      if (!res.success) {
        toast.error('Révocation impossible', { description: res.message });
        return;
      }
      toast.success('Place annulée');
    }

    load(true);
    onChanged();
  }, [load, onChanged]);

  if (loading) return <ScreenSkeleton variant="list" />;

  const refusals = stats?.refusals || [];

  return (
    <ScrollView
      contentContainerStyle={[styles.scrollInner, { paddingBottom: insets.bottom + 32 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={(
        <AppRefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(true); }}
        />
      )}
    >
      <View style={styles.tallyCard}>
        <Tally label="Places" value={stats?.total ?? event.total} />
        <Tally label="Entrées" value={stats?.entries ?? 0} tint={colors.success} />
        <Tally label="Valables" value={stats?.valid ?? event.valid} />
        <Tally label="Annulées" value={stats?.revoked ?? event.revoked} tint={colors.red} />
      </View>

      <View style={styles.actionColumn}>
        <Button
          label="Contrôler à l’entrée"
          icon="scan-outline"
          fullWidth
          onPress={() => (navigation as any).navigate('EventPassScan', {
            eventSlug: event.event_slug,
            eventName: event.event_name,
          })}
        />
        <Button
          label="Lien de contrôle pour l’équipe"
          variant="secondary"
          icon="link-outline"
          fullWidth
          onPress={makeDoorLink}
        />
        <Button
          label="Envoyer la liste des places"
          variant="secondary"
          icon="share-outline"
          fullWidth
          onPress={shareList}
        />
      </View>

      {refusals.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Refus à la porte</Text>
          <View style={styles.refusalCard}>
            {refusals.map((refusal) => (
              <View key={refusal.result} style={styles.refusalRow}>
                <Text style={styles.refusalLabel}>
                  {REFUSAL_LABELS[refusal.result] || refusal.result}
                </Text>
                <Text style={styles.refusalCount}>{refusal.count}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {!!stats?.recent?.length && (
        <>
          <Text style={styles.sectionTitle}>Derniers passages</Text>
          <View style={styles.refusalCard}>
            {stats.recent.slice(0, 10).map((scan) => (
              <View key={scan.id} style={styles.scanRow}>
                <View
                  style={[
                    styles.scanDot,
                    { backgroundColor: scan.result === 'admitted' ? colors.success : colors.red },
                  ]}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.scanTitle} numberOfLines={1}>
                    {scan.pass?.guest_name || scan.pass?.code || scan.code_attempt || 'Code inconnu'}
                  </Text>
                  <Text style={styles.scanMeta}>
                    {scan.result === 'admitted'
                      ? 'Entrée accordée'
                      : (REFUSAL_LABELS[scan.result] || scan.result)}
                    {'  ·  '}{formatMoment(scan.createdAt)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      <Text style={styles.sectionTitle}>Places ({passes?.length ?? 0})</Text>
      {!passes?.length ? (
        <EmptyState compact icon="ticket-outline" title="Aucune place" />
      ) : (
        passes.map((pass) => (
          <Tappable key={pass.id} style={styles.passRow} onPress={() => togglePass(pass)}>
            <View style={styles.passSerial}>
              <Text style={styles.passSerialText}>{String(pass.serial).padStart(3, '0')}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.passName} numberOfLines={1}>
                {pass.guest_name || 'Au porteur'}
              </Text>
              <Text style={styles.passMeta} numberOfLines={1}>
                {pass.code}{'  ·  '}{TIER_LABELS[pass.tier]}{'  ·  '}{STATUS_LABELS[pass.status]}
              </Text>
            </View>
            <Ionicons
              name={pass.status === 'revoked' ? 'refresh-outline' : 'close-circle-outline'}
              size={19}
              color={pass.status === 'revoked' ? colors.cyan : colors.textMuted}
            />
          </Tappable>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  scrollInner: { paddingHorizontal: 20, paddingTop: 4 },
  headerAction: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt,
  },

  sectionTitle: {
    color: colors.textPrimary, fontFamily: fonts.bold, fontSize: 13.5,
    marginTop: 22, marginBottom: 10,
  },

  eventCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: 14, marginBottom: 12,
  },
  eventHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  eventName: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: 15.5 },
  eventMeta: { color: colors.textMuted, fontSize: 11.5, marginTop: 3 },

  tallyRow: { flexDirection: 'row', marginTop: 14 },
  tallyCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, paddingVertical: 14, marginBottom: 16,
  },
  tally: { flex: 1, alignItems: 'center' },
  tallyValue: { fontFamily: fonts.bold, fontSize: 19 },
  tallyLabel: { color: colors.textMuted, fontSize: 10.5, marginTop: 2 },

  actionColumn: { gap: 10 },

  fieldLabel: {
    color: colors.textPrimary, fontFamily: fonts.bold, fontSize: 12.5,
    marginTop: 18, marginBottom: 8,
  },
  fieldHint: { color: colors.textMuted, fontSize: 11.5, lineHeight: 16, marginTop: 6 },
  input: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12,
    color: colors.textPrimary, fontSize: 15,
  },
  inputMultiline: { minHeight: 140, paddingTop: 12 },
  warning: { color: colors.red, fontSize: 12.5, marginTop: 14 },
  formActions: { marginTop: 26, gap: 10 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.textSecondary, fontSize: 13, fontFamily: fonts.semibold },
  chipTextActive: { color: colors.onAccent },

  whenButton: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 11, borderRadius: radius.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  whenText: { color: colors.textPrimary, fontSize: 13.5, fontFamily: fonts.semibold },

  refusalCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 6,
  },
  refusalRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10,
  },
  refusalLabel: { color: colors.textSecondary, fontSize: 13 },
  refusalCount: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: 14 },

  scanRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  scanDot: { width: 8, height: 8, borderRadius: 4 },
  scanTitle: { color: colors.textPrimary, fontSize: 13.5, fontFamily: fonts.semibold },
  scanMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },

  passRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: 12, marginBottom: 8,
  },
  passSerial: {
    width: 40, height: 34, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt,
  },
  passSerialText: { color: colors.textSecondary, fontFamily: fonts.bold, fontSize: 12.5 },
  passName: { color: colors.textPrimary, fontSize: 14, fontFamily: fonts.semibold },
  passMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
});
