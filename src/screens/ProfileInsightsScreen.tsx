import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ScreenBackground, BackButton } from '../components/ui';
import Avatar from '../components/Avatar';
import { useHeaderMetrics, HEADER_CONTENT_HEIGHT } from '../hooks/useHeaderMetrics';
import { colors, radius , statusBarStyle} from '../theme';
import { toast } from '../components/ui/Toast';
import { confirmAsync } from '../components/ui/ConfirmSheet';
import {
  REASON_LABELS,
  InsightsError,
  dismissAlert,
  fetchImpersonationAlerts,
  fetchIncognito,
  fetchNicheTrendingTweets,
  fetchRisingAccounts,
  fetchVelocityAlerts,
  fetchVisitors,
  relativeDay,
  reportAlert,
  rescanImpersonation,
  setIncognito,
  type ImpersonationAlert,
  type NicheTrendingTweet,
  type RisingAccount,
  type VelocityAlert,
  type VisitorsData,
} from '../services/insightsService';

/**
 * Les quatre renseignements réservés aux abonnés, dans un seul écran à
 * onglets : visiteurs, usurpation, radar, décollages.
 *
 * Ensemble parce qu'ils répondent à la même question — « que se passe-t-il
 * autour de mon compte que je ne vois pas ? » — et qu'un abonné les consulte
 * d'affilée. Quatre entrées séparées dans les réglages auraient été trois de
 * trop.
 */

type Tab = 'visitors' | 'impersonation' | 'rising' | 'niche' | 'velocity';

const TAB_LABELS: Record<Tab, string> = {
  visitors: 'Visiteurs',
  impersonation: 'Usurpation',
  rising: 'Radar',
  niche: 'Ta niche',
  velocity: 'Décollages',
};

interface Props {
  navigation: any;
  route?: { params?: { tab?: Tab } };
}

export default function ProfileInsightsScreen({ navigation, route }: Props) {
  const { top: headerTopInset } = useHeaderMetrics();

  const [tab, setTab] = useState<Tab>(route?.params?.tab || 'visitors');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<InsightsError | null>(null);

  const [visitors, setVisitors] = useState<VisitorsData | null>(null);
  const [incognito, setIncognitoState] = useState(false);
  const [alerts, setAlerts] = useState<ImpersonationAlert[]>([]);
  const [rising, setRising] = useState<RisingAccount[]>([]);
  const [nicheTweets, setNicheTweets] = useState<NicheTrendingTweet[]>([]);
  const [velocity, setVelocity] = useState<VelocityAlert[]>([]);
  const requestSequence = useRef(0);

  // Un même écran peut rester monté dans la pile. Revenir depuis le Studio
  // avec un autre onglet doit donc mettre à jour l'état, pas seulement lire
  // le paramètre lors du tout premier rendu.
  useEffect(() => {
    const requested = route?.params?.tab;
    if (requested) setTab((current) => requested === current ? current : requested);
  }, [route?.params?.tab]);

  /**
   * Chaque onglet charge ce qui le concerne, à l'ouverture.
   * Tout charger d'un coup ferait quatre requêtes pour un écran dont on ne
   * consulte souvent qu'un seul volet.
   */
  const load = useCallback(async (target: Tab, foreground = true) => {
    const sequence = ++requestSequence.current;
    if (foreground) setLoading(true);
    setError(null);
    try {
      if (target === 'visitors') {
        const [data, mode] = await Promise.all([
          fetchVisitors(),
          fetchIncognito().catch(() => false),
        ]);
        if (sequence !== requestSequence.current) return;
        setVisitors(data);
        setIncognitoState(mode);
      } else if (target === 'impersonation') {
        const data = await fetchImpersonationAlerts('open');
        if (sequence !== requestSequence.current) return;
        setAlerts(data);
      } else if (target === 'rising') {
        const data = await fetchRisingAccounts({ days: 7, limit: 25 });
        if (sequence !== requestSequence.current) return;
        setRising(data);
      } else if (target === 'niche') {
        const data = await fetchNicheTrendingTweets({ days: 7, limit: 25 });
        if (sequence !== requestSequence.current) return;
        setNicheTweets(data);
      } else {
        const data = await fetchVelocityAlerts(30);
        if (sequence !== requestSequence.current) return;
        setVelocity(data);
      }
    } catch (e: any) {
      if (sequence !== requestSequence.current) return;
      setError(e instanceof InsightsError
        ? e
        : new InsightsError(e?.message || 'Données indisponibles.'));
    } finally {
      if (sequence === requestSequence.current && foreground) setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    load(tab);
    return () => { requestSequence.current += 1; };
  }, [load, tab]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(tab, false);
    setRefreshing(false);
  }, [load, tab]);

  const toggleIncognito = async (value: boolean) => {
    // Optimiste : l'interrupteur doit répondre tout de suite. En cas d'échec
    // on revient à l'état précédent plutôt que de laisser croire au discret.
    setIncognitoState(value);
    try {
      const applied = await setIncognito(value);
      setIncognitoState(applied);
    } catch (e: any) {
      setIncognitoState(!value);
      toast.error('Réglage impossible', {
        description: e?.message || 'Réessaie dans un instant.',
      });
    }
  };

  const onDismiss = async (alert: ImpersonationAlert) => {
    try {
      await dismissAlert(alert.id);
      setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
    } catch (e: any) {
      toast.error('Action impossible', {
        description: e?.message || 'Réessaie dans un instant.',
      });
    }
  };

  const onReport = (alert: ImpersonationAlert) => {
    confirmAsync({
      title: `Signaler @${alert.suspect?.username} ?`,
      message: 'Le compte part en modération pour usurpation d\'identité.',
      confirmLabel: 'Signaler',
      destructive: true,
    }).then((ok) => {
      if (ok) (async () => {
            try {
              await reportAlert(alert.id);
              setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
              toast.success('Signalement envoyé', {
                description: 'Notre équipe examine ce compte.',
              });
            } catch (e: any) {
              toast.error('Signalement impossible', {
                description: e?.message || 'Réessaie dans un instant.',
              });
            }
          })();
    });
  };

  const onRescan = async () => {
    setLoading(true);
    setError(null);
    try {
      setAlerts(await rescanImpersonation());
    } catch (e: any) {
      setError(e instanceof InsightsError
        ? e
        : new InsightsError(e?.message || 'Scan impossible.'));
    } finally {
      setLoading(false);
    }
  };

  const openProfile = (userId: string, username: string) =>
    navigation.navigate('UserProfile', { userId, username });

  return (
    <ScreenBackground>
      <StatusBar barStyle={statusBarStyle()} backgroundColor={colors.bg} />

      <View style={[styles.headerShell, { paddingTop: headerTopInset }]}>
        <View style={[styles.header, { minHeight: HEADER_CONTENT_HEIGHT }]}>
          <View style={styles.roundSlot}>
            <BackButton navigation={navigation} style={styles.roundButton} />
          </View>
          <View style={styles.titleGroup}>
            <Text style={styles.title}>Autour de ton compte</Text>
          </View>
          <View style={styles.roundSlot} />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabs}
        >
          {(Object.keys(TAB_LABELS) as Tab[]).map((key) => (
            <TouchableOpacity
              key={key}
              style={[styles.tabChip, tab === key && styles.tabChipActive]}
              onPress={() => setTab(key)}
              activeOpacity={0.85}
            >
              <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>
                {TAB_LABELS[key]}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.loader}><ActivityIndicator color={colors.accent} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
          }
        >
          {!!error && (
            <View style={styles.errorCard}>
              <Ionicons
                name={error.kind === 'premium_required' ? 'lock-closed' : 'cloud-offline-outline'}
                size={18}
                color={colors.red}
              />
              <View style={styles.errorTexts}>
                <Text style={styles.errorTitle}>
                  {error.kind === 'premium_required' ? 'Fonction Premium' : 'Chargement impossible'}
                </Text>
                <Text style={styles.error}>{error.message}</Text>
              </View>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => error.kind === 'premium_required'
                  ? navigation.navigate('Settings')
                  : load(tab)}
                activeOpacity={0.85}
              >
                <Text style={styles.retryText}>
                  {error.kind === 'premium_required' ? 'Voir' : 'Réessayer'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {tab === 'visitors' && visitors && (
            <>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>{visitors.total_visitors}</Text>
                <Text style={styles.summaryLabel}>
                  visiteur{visitors.total_visitors > 1 ? 's' : ''} sur {visitors.window_days} jours
                </Text>
                {visitors.hidden_visitors > 0 && (
                  <Text style={styles.summaryHint}>
                    dont {visitors.hidden_visitors} en navigation discrète
                  </Text>
                )}
              </View>

              <View style={styles.switchRow}>
                <View style={styles.switchTexts}>
                  <Text style={styles.switchTitle}>Naviguer en discret</Text>
                  <Text style={styles.switchHint}>
                    Ton passage sur les profils reste compté, mais ton nom n'est jamais montré.
                  </Text>
                </View>
                <Switch
                  value={incognito}
                  onValueChange={toggleIncognito}
                  trackColor={{ false: colors.border, true: colors.accentMuted }}
                  thumbColor={incognito ? colors.accent : colors.textMuted}
                />
              </View>

              {!error && visitors.visitors.length === 0 ? (
                <Text style={styles.empty}>Personne n'est passé cette semaine.</Text>
              ) : visitors.visitors.map((entry) => (
                <TouchableOpacity
                  key={entry.user.id}
                  style={styles.userRow}
                  activeOpacity={0.85}
                  onPress={() => openProfile(entry.user.id, entry.user.username)}
                >
                  <Avatar size={40} username={entry.user.username} uri={entry.user.avatar} />
                  <View style={styles.userTexts}>
                    <Text style={styles.userName} numberOfLines={1}>{entry.user.full_name}</Text>
                    <Text style={styles.userHandle} numberOfLines={1}>@{entry.user.username}</Text>
                  </View>
                  <Text style={styles.userMeta}>{relativeDay(entry.viewed_on)}</Text>
                </TouchableOpacity>
              ))}
            </>
          )}

          {tab === 'impersonation' && (
            <>
              <View style={styles.actionHeader}>
                <Text style={styles.explain}>
                  Comptes utilisant un pseudo, une photo ou une bio proches des tiens. Une alerte
                  n'est pas une sanction : c'est toi qui décides.
                </Text>
                <TouchableOpacity style={styles.ghostBtn} onPress={onRescan} activeOpacity={0.85}>
                  <Ionicons name="refresh" size={15} color={colors.textSecondary} />
                  <Text style={styles.ghostBtnText}>Relancer</Text>
                </TouchableOpacity>
              </View>

              {!error && alerts.length === 0 ? (
                <Text style={styles.empty}>Aucun compte suspect détecté.</Text>
              ) : alerts.map((alert) => (
                <View key={alert.id} style={styles.alertCard}>
                  <TouchableOpacity
                    style={styles.userRowPlain}
                    activeOpacity={0.85}
                    onPress={() => alert.suspect
                      && openProfile(alert.suspect.id, alert.suspect.username)}
                  >
                    <Avatar
                      size={40}
                      username={alert.suspect?.username || 'U'}
                      uri={alert.suspect?.avatar || undefined}
                    />
                    <View style={styles.userTexts}>
                      <Text style={styles.userName} numberOfLines={1}>
                        {alert.suspect?.full_name || 'Compte'}
                      </Text>
                      <Text style={styles.userHandle} numberOfLines={1}>
                        @{alert.suspect?.username}
                        {alert.suspect?.username_at_detection
                          && alert.suspect.username_at_detection !== alert.suspect.username
                          ? ` (était @${alert.suspect.username_at_detection})`
                          : ''}
                      </Text>
                    </View>
                    <View style={styles.scorePill}>
                      <Text style={styles.scoreText}>{Math.round(alert.score * 100)}%</Text>
                    </View>
                  </TouchableOpacity>

                  <View style={styles.reasonsRow}>
                    {alert.reasons.map((reason) => (
                      <View key={reason} style={styles.reasonChip}>
                        <Text style={styles.reasonText}>{REASON_LABELS[reason] || reason}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.alertActions}>
                    <TouchableOpacity
                      style={styles.secondaryBtn}
                      onPress={() => onDismiss(alert)}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.secondaryBtnText}>Ignorer</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.dangerBtn}
                      onPress={() => onReport(alert)}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.dangerBtnText}>Signaler</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </>
          )}

          {tab === 'rising' && (
            !error && rising.length === 0 ? (
              <Text style={styles.empty}>
                Rien à signaler cette semaine. Le radar compare la croissance récente à la taille
                des comptes — un gros compte qui gagne des abonnés n'y apparaît pas.
              </Text>
            ) : rising.map((entry) => (
              <TouchableOpacity
                key={entry.user.id}
                style={styles.userRow}
                activeOpacity={0.85}
                onPress={() => openProfile(entry.user.id, entry.user.username)}
              >
                <Avatar size={40} username={entry.user.username} uri={entry.user.avatar} />
                <View style={styles.userTexts}>
                  <Text style={styles.userName} numberOfLines={1}>{entry.user.full_name}</Text>
                  <Text style={styles.userHandle} numberOfLines={1}>
                    +{entry.new_followers} abonnés en {entry.window_days} j
                    {entry.common_follows > 0 ? ` · ${entry.common_follows} en commun` : ''}
                  </Text>
                </View>
                <View style={styles.growthPill}>
                  <Ionicons name="trending-up" size={12} color={colors.success} />
                </View>
              </TouchableOpacity>
            ))
          )}

          {tab === 'niche' && (
            !error && nicheTweets.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="pulse-outline" size={22} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>Pas encore de signal dans ta niche</Text>
                <Text style={styles.empty}>
                  Le radar cherche les tweets récents qui accélèrent chez les comptes proches de
                  tes abonnements. Suis quelques créateurs de ton univers pour affiner les résultats.
                </Text>
              </View>
            ) : nicheTweets.map((entry) => (
              <TouchableOpacity
                key={entry.tweet.id}
                style={styles.alertCard}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('TweetDetail', { tweetId: entry.tweet.id })}
              >
                <View style={styles.nicheAuthorRow}>
                  <Avatar
                    size={34}
                    username={entry.tweet.author.username}
                    uri={entry.tweet.author.avatar || undefined}
                  />
                  <View style={styles.userTexts}>
                    <Text style={styles.userName} numberOfLines={1}>
                      {entry.tweet.author.full_name || entry.tweet.author.username}
                    </Text>
                    <Text style={styles.userHandle} numberOfLines={1}>
                      @{entry.tweet.author.username} · {relativeDay(entry.tweet.created_at)}
                    </Text>
                  </View>
                  <View style={styles.ratioPill}>
                    <Ionicons name="pulse" size={12} color={colors.accentBright} />
                    <Text style={styles.ratioText}>
                      ×{Math.max(1, Math.round(entry.velocity_ratio * 10) / 10)}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.cardBody, styles.nicheBody]} numberOfLines={4}>
                  {entry.tweet.content}
                </Text>
                <Text style={styles.cardStat}>
                  {entry.engagements} interactions en {entry.window_hours} h
                  {entry.niche_affinity > 0
                    ? ` · ${Math.round(entry.niche_affinity * 100)} % d’affinité`
                    : ''}
                </Text>
              </TouchableOpacity>
            ))
          )}

          {tab === 'velocity' && (
            !error && velocity.length === 0 ? (
              <Text style={styles.empty}>
                Aucun décollage pour l'instant. On te préviendra dès qu'un de tes tweets ira
                nettement plus vite que ton rythme habituel.
              </Text>
            ) : velocity.map((alert) => (
              <TouchableOpacity
                key={alert.id}
                style={styles.alertCard}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('TweetDetail', { tweetId: alert.tweet_id })}
              >
                <View style={styles.velocityHead}>
                  <View style={styles.ratioPill}>
                    <Ionicons name="flame" size={12} color={colors.accentBright} />
                    <Text style={styles.ratioText}>×{Math.round(alert.ratio)}</Text>
                  </View>
                  <Text style={styles.userMeta}>{relativeDay(alert.detected_at)}</Text>
                </View>
                <Text style={styles.cardBody} numberOfLines={3}>
                  {alert.tweet?.content || 'Tweet supprimé'}
                </Text>
                <Text style={styles.cardStat}>
                  {alert.engagements} interactions en {Math.round(alert.tweet_age_minutes / 60)} h
                </Text>
              </TouchableOpacity>
            ))
          )}

          <View style={{ height: 50 }} />
        </ScrollView>
      )}
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  headerShell: { backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  roundSlot: { width: 40, alignItems: 'center' },
  roundButton: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  titleGroup: { flex: 1, alignItems: 'center' },
  title: { color: colors.textPrimary, fontSize: 17, fontWeight: '700' },

  tabs: { paddingHorizontal: 16, paddingBottom: 10, paddingTop: 4 },
  tabChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.round,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
  },
  tabChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  tabText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: colors.onAccent },

  content: { paddingHorizontal: 16, paddingTop: 8 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.red,
    backgroundColor: colors.redMuted,
    marginBottom: 14,
  },
  errorTexts: { flex: 1, marginHorizontal: 10 },
  errorTitle: { color: colors.red, fontSize: 13, fontWeight: '700' },
  error: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 2 },
  retryBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.round,
    backgroundColor: colors.surfaceElevated,
  },
  retryText: { color: colors.textPrimary, fontSize: 11, fontWeight: '700' },
  empty: { color: colors.textMuted, fontSize: 13, lineHeight: 19, paddingVertical: 18 },
  emptyState: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 28 },
  emptyTitle: { color: colors.textSecondary, fontSize: 14, fontWeight: '700', marginTop: 9 },
  explain: { color: colors.textMuted, fontSize: 12, lineHeight: 17, flex: 1, marginRight: 10 },

  summaryCard: {
    borderRadius: radius.lg,
    padding: 18,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    marginBottom: 12,
  },
  summaryValue: { color: colors.textPrimary, fontSize: 32, fontWeight: '800' },
  summaryLabel: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  summaryHint: { color: colors.textMuted, fontSize: 12, marginTop: 6 },

  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  switchTexts: { flex: 1, marginRight: 12 },
  switchTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  switchHint: { color: colors.textMuted, fontSize: 12, marginTop: 3, lineHeight: 17 },

  actionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  ghostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.round,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ghostBtnText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600', marginLeft: 5 },

  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  userRowPlain: { flexDirection: 'row', alignItems: 'center' },
  userTexts: { flex: 1, marginLeft: 12 },
  userName: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  userHandle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  userMeta: { color: colors.textMuted, fontSize: 11 },

  alertCard: {
    borderRadius: radius.md,
    padding: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  scorePill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.round,
    backgroundColor: colors.redMuted,
  },
  scoreText: { color: colors.red, fontSize: 11, fontWeight: '800' },
  reasonsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 },
  reasonChip: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceElevated,
    marginRight: 6,
    marginBottom: 6,
  },
  reasonText: { color: colors.textSecondary, fontSize: 11 },
  alertActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6 },
  secondaryBtn: { paddingHorizontal: 14, paddingVertical: 9, marginRight: 6 },
  secondaryBtnText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  dangerBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radius.round,
    backgroundColor: colors.redMuted,
  },
  dangerBtnText: { color: colors.red, fontSize: 13, fontWeight: '700' },

  growthPill: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.successMuted,
  },
  velocityHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  nicheAuthorRow: { flexDirection: 'row', alignItems: 'center' },
  nicheBody: { marginTop: 12 },
  ratioPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.round,
    backgroundColor: colors.accentMuted,
  },
  ratioText: { color: colors.accentBright, fontSize: 12, fontWeight: '800', marginLeft: 4 },
  cardBody: { color: colors.textPrimary, fontSize: 14, lineHeight: 20 },
  cardStat: { color: colors.textMuted, fontSize: 12, marginTop: 8 },
});
