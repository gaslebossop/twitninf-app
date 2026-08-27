import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, fonts, statusBarStyle } from '../theme';
import {
  AppHeader,
  Button,
  Card,
  ScreenBackground,
  Tappable,
  useConfirm,
  useToast,
} from '../components/ui';
import { useBeta } from '../contexts/BetaContext';
import betaService, { BetaState } from '../services/betaService';

/**
 * 🧪 Programme beta — l'unique écran du programme.
 *
 * ── Une seule porte ───────────────────────────────────────────────────────
 * On est sur la version beta de l'app, ou on ne l'est pas. Pas de liste de
 * fonctionnalités à cocher : le membre reçoit ce qui est en test, aujourd'hui
 * la refonte du fil, demain autre chose. Un écran qui exposerait chaque test
 * séparément demanderait à l'utilisateur de comprendre le découpage interne
 * du produit pour choisir.
 *
 * ── Pourquoi un seul écran pour quatre états ──────────────────────────────
 * Candidater, attendre, être membre, avoir été refusé : c'est la même page à
 * quatre moments de la même histoire. La découper donnerait quatre écrans
 * dont trois seraient inaccessibles à un instant donné, et une navigation à
 * maintenir entre eux.
 *
 * ── Pourquoi il n'est pas décliné en 2B ───────────────────────────────────
 * Les sous-écrans de Réglages ne sont pas dupliqués par le test « 2B »
 * (`MainNavigator` ne double que le détail d'un tweet, les messages et un
 * fil de conversation). En faire une exception ici créerait une divergence à
 * maintenir pour un écran qu'on ouvre trois fois dans sa vie.
 *
 * ── Ce qu'il ne promet pas ────────────────────────────────────────────────
 * Aucun délai de traitement, aucune date. Une file d'attente dont on annonce
 * le délai est une file dont on doit tenir le délai.
 */

interface Props {
  navigation: any;
}

/** Ce que le membre reçoit. Court, concret, au présent. */
const WHAT_YOU_GET = [
  {
    icon: 'newspaper-outline' as const,
    title: 'La refonte du fil',
    body: 'Le fil « gouttière » : engagement sorti du texte, navigation en pilule flottante.',
  },
  {
    icon: 'flask-outline' as const,
    title: 'Ce qui vient ensuite',
    body: 'Les prochains essais arrivent sur ton compte avant tout le monde, sans rien réinstaller.',
  },
  {
    icon: 'chatbubble-ellipses-outline' as const,
    title: 'Ton avis compte vraiment',
    body: 'Tes signalements de bug sont lus en premier — c\'est le seul intérêt du programme pour nous.',
  },
];

const BetaScreen: React.FC<Props> = ({ navigation }) => {
  const { state, hydrated, refresh, setState } = useBeta();
  const toast = useToast();
  const confirm = useConfirm();

  const [motivation, setMotivation] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!hydrated);

  // Une lecture fraîche à l'ouverture : c'est l'écran où l'on vient VOIR si
  // sa candidature a avancé, donc l'instantané persisté n'y suffit pas.
  useEffect(() => {
    let cancelled = false;
    refresh().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const { status, is_member: isMember, position, program } = state;

  const handleApply = useCallback(async () => {
    setBusy(true);
    const outcome = await betaService.apply(motivation);
    setBusy(false);

    if (!outcome.success || !outcome.data) {
      toast.error(outcome.message || 'Candidature impossible.');
      return;
    }
    setState(outcome.data as BetaState);
    setMotivation('');
    toast.success('Candidature envoyée. On revient vers toi.');
  }, [motivation, setState, toast]);

  const handleLeave = useCallback(async () => {
    const confirmed = await confirm({
      title: 'Quitter la beta ?',
      message: 'Tu retrouves l\'app normale. Tu pourras recandidater plus tard.',
      confirmLabel: 'Quitter',
      destructive: true,
    });
    if (!confirmed) return;

    setBusy(true);
    const outcome = await betaService.leave();
    setBusy(false);

    if (!outcome.success || !outcome.data) {
      toast.error(outcome.message || 'Impossible de quitter la beta.');
      return;
    }
    setState(outcome.data as BetaState);
    toast.info('Tu as quitté la beta.');
  }, [confirm, setState, toast]);

  const subtitle = useMemo(() => {
    if (isMember) return 'Tu en fais partie';
    if (status === 'pending') return position ? `${position}e dans la file` : 'Candidature en file';
    if (!program.is_open) return 'Candidatures fermées';
    if (program.seats_left !== null) return `${program.seats_left} place${program.seats_left > 1 ? 's' : ''} restante${program.seats_left > 1 ? 's' : ''}`;
    return 'Sur candidature';
  }, [isMember, status, position, program]);

  return (
    <ScreenBackground>
      <View style={S.container}>
        <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
        <AppHeader navigation={navigation} title="Programme beta" subtitle={subtitle} />

        {loading && !hydrated ? (
          <View style={S.loading}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <ScrollView
            style={S.scroll}
            contentContainerStyle={S.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {isMember ? (
              <MemberPanel
                navigation={navigation}
                busy={busy}
                onLeave={handleLeave}
                approvedAt={state.approved_at}
              />
            ) : status === 'pending' ? (
              <PendingPanel position={position} appliedAt={state.applied_at} />
            ) : (
              <ApplyPanel
                previousStatus={status}
                program={program}
                motivation={motivation}
                onChangeMotivation={setMotivation}
                busy={busy}
                onApply={handleApply}
              />
            )}
          </ScrollView>
        )}
      </View>
    </ScreenBackground>
  );
};

// ───────────────────────────── Membre ─────────────────────────────

const MemberPanel: React.FC<{
  navigation: any;
  busy: boolean;
  onLeave: () => void;
  approvedAt: string | null;
}> = ({ navigation, busy, onLeave, approvedAt }) => (
  <>
    <Card highlight style={S.hero}>
      <View style={S.heroTop}>
        <View style={S.heroBadge}>
          <Text style={S.heroBadgeText} allowFontScaling={false}>
            BETA
          </Text>
        </View>
        <Text style={S.heroTitle}>Tu es dans la beta</Text>
      </View>
      <Text style={S.heroBody}>
        Le badge à côté du logo te le rappelle. Ce que tu vois n'est pas ce que voient les
        autres : c'est normal, et c'est exactement ce qu'on veut que tu nous racontes.
      </Text>
      {approvedAt ? <Text style={S.heroMeta}>Admis le {formatDate(approvedAt)}</Text> : null}
    </Card>

    <Text style={S.sectionLabel}>Ce que tu as en plus</Text>
    {WHAT_YOU_GET.map((item) => (
      <FeatureRow key={item.title} {...item} />
    ))}

    <Text style={S.sectionLabel}>Un truc casse ?</Text>
    <Card>
      <Tappable onPress={() => navigation.navigate('ReportBug')}>
        <View style={S.actionRow}>
          <Ionicons name="bug-outline" size={20} color={colors.accent} />
          <View style={S.actionText}>
            <Text style={S.actionTitle}>Signaler un bug</Text>
            <Text style={S.actionBody}>
              Les signalements des membres beta passent devant les autres.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </View>
      </Tappable>
    </Card>

    <Button
      label="Quitter la beta"
      variant="ghost"
      onPress={onLeave}
      loading={busy}
      fullWidth
      style={S.leaveButton}
    />
    <Text style={S.footnote}>
      En quittant, tu retrouves l'app normale au prochain démarrage. Tu pourras recandidater.
    </Text>
  </>
);

// ─────────────────────────── En attente ───────────────────────────

const PendingPanel: React.FC<{ position: number | null; appliedAt: string | null }> = ({
  position,
  appliedAt,
}) => (
  <>
    <Card style={S.hero}>
      <View style={S.heroTop}>
        <Ionicons name="hourglass-outline" size={22} color={colors.accent} />
        <Text style={S.heroTitle}>Candidature reçue</Text>
      </View>
      {position !== null ? (
        <>
          <Text style={S.queueNumber}>{position}</Text>
          <Text style={S.queueLabel}>
            {position === 1 ? 'Tu es le prochain sur la liste' : 'ta place dans la file'}
          </Text>
        </>
      ) : (
        <Text style={S.heroBody}>Ta candidature est enregistrée.</Text>
      )}
      {appliedAt ? <Text style={S.heroMeta}>Envoyée le {formatDate(appliedAt)}</Text> : null}
    </Card>

    <Card>
      <Text style={S.plainBody}>
        On admet par vagues, pour garder le programme à une taille où chaque retour est
        vraiment lu. Rien à faire de ton côté : tu verras le badge BETA apparaître à côté
        du logo le jour où c'est ton tour.
      </Text>
    </Card>

    <Text style={S.sectionLabel}>Ce qui t'attend</Text>
    {WHAT_YOU_GET.map((item) => (
      <FeatureRow key={item.title} {...item} />
    ))}
  </>
);

// ────────────────────────── Candidature ──────────────────────────

const ApplyPanel: React.FC<{
  previousStatus: BetaState['status'];
  program: BetaState['program'];
  motivation: string;
  onChangeMotivation: (next: string) => void;
  busy: boolean;
  onApply: () => void;
}> = ({ previousStatus, program, motivation, onChangeMotivation, busy, onApply }) => {
  const closed = !program.is_open;

  return (
    <>
      <Card style={S.hero}>
        <View style={S.heroTop}>
          <View style={S.heroBadge}>
            <Text style={S.heroBadgeText} allowFontScaling={false}>
              BETA
            </Text>
          </View>
          <Text style={S.heroTitle}>{program.headline}</Text>
        </View>
        <Text style={S.heroBody}>
          {program.pitch ||
            'Une poignée de comptes reçoit les nouveautés de Twitninf avant tout le monde, et nous dit ce qui cloche. Rien à installer : ça arrive sur ton compte.'}
        </Text>
        {program.capacity !== null && program.seats_left !== null ? (
          <Text style={S.heroMeta}>
            {program.members} membre{program.members > 1 ? 's' : ''} · {program.seats_left} place
            {program.seats_left > 1 ? 's' : ''} restante{program.seats_left > 1 ? 's' : ''}
          </Text>
        ) : null}
      </Card>

      {previousStatus ? <PreviousDecision status={previousStatus} /> : null}

      <Text style={S.sectionLabel}>Ce que tu aurais</Text>
      {WHAT_YOU_GET.map((item) => (
        <FeatureRow key={item.title} {...item} />
      ))}

      {closed ? (
        <Card style={S.closedCard}>
          <Ionicons name="lock-closed-outline" size={19} color={colors.textMuted} />
          <Text style={S.closedText}>
            Les candidatures sont fermées pour le moment. Repasse plus tard — on rouvre à
            chaque nouvelle vague.
          </Text>
        </Card>
      ) : (
        <>
          <Text style={S.sectionLabel}>Un mot sur toi (facultatif)</Text>
          <Card padding={0}>
            <TextInput
              style={S.input}
              value={motivation}
              onChangeText={onChangeMotivation}
              placeholder="Comment tu utilises Twitninf, ce que tu aimerais voir changer…"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={500}
              textAlignVertical="top"
            />
          </Card>
          <Text style={S.footnote}>
            Facultatif, vraiment : on lit tout, mais une candidature vide n'est pas moins
            bien traitée.
          </Text>

          <Button
            label="Rejoindre la liste d'attente"
            onPress={onApply}
            loading={busy}
            fullWidth
            style={S.applyButton}
          />
        </>
      )}
    </>
  );
};

/**
 * Rappel de la décision précédente pour qui a été refusé, révoqué, ou est
 * parti. Le taire donnerait un écran identique à celui d'un nouveau venu, et
 * la question « ma candidature est passée où ? » resterait sans réponse.
 */
const PreviousDecision: React.FC<{ status: NonNullable<BetaState['status']> }> = ({ status }) => {
  const copy: Record<string, { icon: keyof typeof Ionicons.glyphMap; text: string }> = {
    rejected: {
      icon: 'close-circle-outline',
      text: 'Ta candidature précédente n\'a pas été retenue. Tu peux recandidater : la file repart de zéro pour toi.',
    },
    revoked: {
      icon: 'remove-circle-outline',
      text: 'Ton accès a été retiré. Tu peux recandidater.',
    },
    left: {
      icon: 'exit-outline',
      text: 'Tu as quitté la beta. Tu peux y revenir quand tu veux.',
    },
  };
  const entry = copy[status];
  if (!entry) return null;

  return (
    <Card style={S.noticeCard}>
      <Ionicons name={entry.icon} size={19} color={colors.textMuted} />
      <Text style={S.noticeText}>{entry.text}</Text>
    </Card>
  );
};

const FeatureRow: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}> = ({ icon, title, body }) => (
  <Card style={S.featureCard}>
    <View style={S.actionRow}>
      <Ionicons name={icon} size={20} color={colors.accent} />
      <View style={S.actionText}>
        <Text style={S.actionTitle}>{title}</Text>
        <Text style={S.actionBody}>{body}</Text>
      </View>
    </View>
  </Card>
);

/** Date courte et lisible. `Intl` n'est pas garanti sur tous les Android. */
function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const months = [
    'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
    'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
  ];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 48 },

  hero: { marginBottom: 20 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 10 },
  heroBadge: {
    backgroundColor: colors.accent,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  heroBadgeText: {
    color: colors.bg,
    fontSize: 9.5,
    letterSpacing: 1,
    fontFamily: fonts.bold,
  },
  heroTitle: { flex: 1, color: colors.textPrimary, fontSize: 19, fontFamily: fonts.semibold },
  heroBody: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  heroMeta: { color: colors.textMuted, fontSize: 12, marginTop: 12 },

  queueNumber: {
    color: colors.accent,
    fontSize: 44,
    lineHeight: 50,
    fontFamily: fonts.bold,
  },
  queueLabel: { color: colors.textSecondary, fontSize: 14, marginTop: -2 },

  sectionLabel: {
    color: colors.textMuted,
    fontSize: 11.5,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 8,
    marginBottom: 10,
  },

  featureCard: { marginBottom: 10 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  actionText: { flex: 1 },
  actionTitle: { color: colors.textPrimary, fontSize: 15, fontFamily: fonts.semibold },
  actionBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 3 },

  plainBody: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },

  noticeCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, marginBottom: 20 },
  noticeText: { flex: 1, color: colors.textSecondary, fontSize: 13.5, lineHeight: 19 },

  closedCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, marginTop: 8 },
  closedText: { flex: 1, color: colors.textSecondary, fontSize: 13.5, lineHeight: 19 },

  input: {
    color: colors.textPrimary,
    fontSize: 14.5,
    lineHeight: 20,
    minHeight: 104,
    padding: 14,
  },

  applyButton: { marginTop: 18 },
  leaveButton: { marginTop: 26 },
  footnote: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 10 },
});

export default BetaScreen;
