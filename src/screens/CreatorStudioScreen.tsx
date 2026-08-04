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
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenBackground, BackButton } from '../components/ui';
import { useHeaderMetrics, HEADER_CONTENT_HEIGHT } from '../hooks/useHeaderMetrics';
import Avatar from '../components/Avatar';
import Sparkline from '../components/Sparkline';
import { colors, radius, withAlpha } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { fetchSales, type SalesDashboard } from '../services/paidContentService';
import { fetchQueue, fetchBestHours, type ScheduledPost } from '../services/scheduleService';
import {
  fetchEarnings,
  fetchImpersonationAlerts,
  fetchIncognito,
  fetchNicheTrendingTweets,
  fetchRisingAccounts,
  fetchVisitorCount,
  setIncognito,
  type EarningsData,
  type ImpersonationAlert,
  type NicheTrendingTweet,
  type RisingAccount,
} from '../services/insightsService';
import { fetchMyMarket, type MyMarket } from '../services/usernameMarketService';
import { toast } from '../components/ui/Toast';
import {
  effectiveSubscriptionTier,
  isSubscriptionActiveFor,
} from '../utils/subscriptionTier';

/**
 * Studio créateur — ce que l'abonnement rapporte, et ce qu'il reste à faire.
 *
 * L'écran précédent était une liste de sept lignes identiques sous un seul
 * chiffre : rien ne se lisait sans ouvrir quelque chose, et les
 * fonctionnalités les plus fortes (prédiction, copilote) n'y figuraient même
 * pas. Trois principes ont guidé la refonte :
 *
 * 1. **Chaque carte porte sa donnée.** Le prochain départ avec son compte à
 *    rebours, les créneaux en barres, les visages du radar. On ouvre pour
 *    agir, pas pour découvrir.
 * 2. **Le montant a un passé.** Total, courbe, écart avec la période
 *    précédente, répartition par source. Un chiffre seul ne dit pas si ça
 *    monte, et c'est la seule question qu'on se pose en arrivant.
 * 3. **Ce qui manque se voit.** Un bloc sans données dit ce qu'il faut faire
 *    pour en avoir, jamais un vide.
 *
 * Chaque bloc est chargé indépendamment (`allSettled`) : une route refusée
 * parce que l'abonnement vient d'expirer laisse les autres s'afficher. Un
 * `Promise.all` transformerait un seul 403 en écran vide.
 */

interface Props {
  navigation: any;
}

interface Summary {
  earnings: EarningsData | null;
  sales: SalesDashboard | null;
  queue: ScheduledPost[];
  bestHours: number[];
  visitors: number | null;
  incognito: boolean;
  alerts: ImpersonationAlert[];
  rising: RisingAccount[];
  nicheTweets: NicheTrendingTweet[];
  market: MyMarket | null;
}

interface InsightFailures {
  impersonation: string | null;
  rising: string | null;
  niche: string | null;
}

const EMPTY: Summary = {
  earnings: null, sales: null, queue: [], bestHours: [],
  visitors: null, incognito: false, alerts: [], rising: [], nicheTweets: [], market: null,
};

const NO_INSIGHT_FAILURES: InsightFailures = {
  impersonation: null,
  rising: null,
  niche: null,
};

/** Valeur d'une promesse tenue, repli sinon. */
function settled<T>(result: PromiseSettledResult<any>, fallback: T): T {
  return result.status === 'fulfilled' && result.value != null ? (result.value as T) : fallback;
}

function failure(result: PromiseSettledResult<any>): string | null {
  if (result.status === 'fulfilled') return null;
  return result.reason?.message || 'Service momentanément indisponible.';
}

export default function CreatorStudioScreen({ navigation }: Props) {
  const { top: headerTopInset } = useHeaderMetrics();
  const { width } = useWindowDimensions();
  const { user } = useAuth();

  const [summary, setSummary] = useState<Summary>(EMPTY);
  const [insightFailures, setInsightFailures] = useState<InsightFailures>(NO_INSIGHT_FAILURES);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingIncognito, setSavingIncognito] = useState(false);

  const tier = effectiveSubscriptionTier(!!user?.premium, user?.subscription_tier);
  const isPro = tier === 'pro';
  const hasInsights = tier !== 'free'
    && isSubscriptionActiveFor(tier, user?.subscription_expires_at);

  const load = useCallback(async () => {
    const results = await Promise.allSettled([
      fetchEarnings(30),
      isPro ? fetchSales() : Promise.resolve(null),
      fetchQueue('pending'),
      fetchBestHours(),
      fetchVisitorCount(),
      fetchIncognito(),
      fetchImpersonationAlerts('open'),
      fetchRisingAccounts({ limit: 6 }),
      fetchNicheTrendingTweets({ days: 7, limit: 3 }),
      fetchMyMarket(),
    ]);

    setSummary({
      earnings: settled<EarningsData | null>(results[0], null),
      sales: settled<SalesDashboard | null>(results[1], null),
      queue: settled<ScheduledPost[]>(results[2], []),
      bestHours: settled<{ hours: number[] }>(results[3], { hours: [] }).hours || [],
      visitors: results[4].status === 'fulfilled' ? (results[4].value as any).count : null,
      incognito: settled<boolean>(results[5], false),
      alerts: settled<ImpersonationAlert[]>(results[6], []),
      rising: settled<RisingAccount[]>(results[7], []),
      nicheTweets: settled<NicheTrendingTweet[]>(results[8], []),
      market: settled<MyMarket | null>(results[9], null),
    });
    setInsightFailures({
      impersonation: failure(results[6]),
      rising: failure(results[7]),
      niche: failure(results[8]),
    });
    setLoading(false);
  }, [isPro]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const toggleIncognito = useCallback(async (next: boolean) => {
    // État posé tout de suite : un interrupteur qui attend le réseau donne
    // l'impression de n'avoir pas été touché.
    setSummary((prev) => ({ ...prev, incognito: next }));
    setSavingIncognito(true);
    try {
      await setIncognito(next);
    } catch (e: any) {
      setSummary((prev) => ({ ...prev, incognito: !next }));
      toast.error('Réglage impossible', {
        description: e?.message || 'Réessaie dans un instant.',
      });
    } finally {
      setSavingIncognito(false);
    }
  }, []);

  const earnings = summary.earnings;
  const net = earnings?.net ?? 0;
  const contentNet = earnings?.by_source.content ?? 0;
  const usernameNet = earnings?.by_source.username ?? 0;
  const nextPost = summary.queue[0] || null;
  const firstAlert = summary.alerts[0] || null;
  const activeListings = summary.market?.listings.filter((l) => l.status === 'active').length ?? 0;

  return (
    <ScreenBackground>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

      <View style={[styles.headerShell, { paddingTop: headerTopInset }]}>
        <View style={[styles.header, { minHeight: HEADER_CONTENT_HEIGHT }]}>
          <View style={styles.roundSlot}>
            <BackButton navigation={navigation} style={styles.roundButton} />
          </View>
          <View style={styles.titleGroup}>
            <Text style={styles.title}>Studio créateur</Text>
          </View>
          <View style={styles.roundSlot} />
        </View>
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
          }
        >
          <EarningsHero
            net={net}
            windowDays={earnings?.window_days ?? 30}
            deltaPercent={earnings?.delta_percent ?? null}
            series={earnings?.series.map((p) => p.net) ?? []}
            contentNet={contentNet}
            usernameNet={usernameNet}
            width={width - 64}
          />

          <Text style={styles.sectionLabel}>Publier</Text>

          <NextPostCard
            post={nextPost}
            queueLength={summary.queue.length}
            onPress={() => navigation.navigate('ScheduledPosts')}
          />

          <BestHoursCard hours={summary.bestHours} />

          <StudioCard
            icon="sparkles"
            tone="gold"
            title="Prédire un tweet"
            subtitle="Score, portée estimée et réécriture avant de publier"
            trailing={isPro ? undefined : 'PRO'}
            onPress={() => navigation.navigate('PredictiveAnalytics')}
          />

          <Text style={styles.sectionLabel}>Vendre</Text>

          <StudioCard
            icon="lock-closed"
            tone="gold"
            title="Contenus payants"
            subtitle={isPro
              ? (summary.sales?.items.length
                ? `${summary.sales.items.length} en vente · ${summary.sales.totals.sales} vente(s)`
                : 'Verrouille un tweet et fixe son prix')
              : 'Réservé au palier Pro'}
            value={contentNet > 0 ? `${contentNet} NF` : undefined}
            trailing={isPro ? undefined : 'PRO'}
            onPress={() => navigation.navigate('PaidContentSales')}
          />

          <StudioCard
            icon="at"
            tone="magenta"
            title="Marché des pseudos"
            subtitle={summary.market
              ? `${activeListings} annonce(s) · ${summary.market.reservations.length} réservation(s)`
              : 'Réserve, vends ou rachète un nom d\'utilisateur'}
            value={usernameNet > 0 ? `${usernameNet} NF` : undefined}
            onPress={() => navigation.navigate('UsernameMarket')}
          />

          <Text style={styles.sectionLabel}>Audience</Text>

          <VisitorsCard
            count={summary.visitors}
            incognito={summary.incognito}
            saving={savingIncognito}
            onToggle={toggleIncognito}
            onPress={() => navigation.navigate('ProfileInsights', { tab: 'visitors' })}
          />

          <RisingCard
            accounts={summary.rising}
            failureMessage={insightFailures.rising}
            hasAccess={hasInsights}
            onPress={() => navigation.navigate('ProfileInsights', { tab: 'rising' })}
          />

          <StudioCard
            icon="pulse"
            tone="cyan"
            title="Tweets qui percent dans ta niche"
            subtitle={!hasInsights
              ? 'Réservé aux abonnés Plus et Pro'
              : insightFailures.niche
                ? 'Radar indisponible · touche pour réessayer'
                : summary.nicheTweets.length
                  ? `@${summary.nicheTweets[0].tweet.author.username} accélère · ${summary.nicheTweets.length} signal(s)`
                  : 'Aucun signal récent · le radar continue de chercher'}
            badge={summary.nicheTweets.length || undefined}
            trailing={hasInsights ? undefined : 'PLUS'}
            onPress={() => navigation.navigate('ProfileInsights', { tab: 'niche' })}
          />

          <StudioCard
            icon="flame"
            tone="magenta"
            title="Tes tweets qui ont décollé"
            subtitle="Quand tu sors de ta propre courbe"
            onPress={() => navigation.navigate('ProfileInsights', { tab: 'velocity' })}
          />

          <Text style={styles.sectionLabel}>Protection</Text>

          <StudioCard
            icon="shield-half"
            tone={firstAlert ? 'danger' : 'cyan'}
            title="Alerte usurpation"
            subtitle={!hasInsights
              ? 'Réservé aux abonnés Plus et Pro'
              : insightFailures.impersonation
                ? 'Veille indisponible · touche pour réessayer'
                : firstAlert?.suspect
                  ? `@${firstAlert.suspect.username} — ${firstAlert.reasons.length} signal(s) concordant(s)`
                  : 'Aucun compte suspect détecté après le dernier scan'}
            badge={summary.alerts.length || undefined}
            trailing={hasInsights ? undefined : 'PLUS'}
            onPress={() => navigation.navigate('ProfileInsights', { tab: 'impersonation' })}
          />

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </ScreenBackground>
  );
}

/* ────────────────────────────── Héros revenus ───────────────────────────── */

/**
 * Le montant compte vers sa valeur en 700 ms, puis ne bouge plus.
 *
 * Un chiffre qui s'installe se remarque ; un chiffre déjà là ne se lit pas.
 * Sortie amortie, jamais de ressort qui oscille.
 */
function useCountUp(target: number, duration = 700) {
  const [value, setValue] = useState(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (!Number.isFinite(target) || target <= 0) {
      setValue(target || 0);
      return undefined;
    }
    const start = Date.now();
    const tick = () => {
      const ratio = Math.min((Date.now() - start) / duration, 1);
      // Cubique en sortie : rapide au début, se pose sans rebondir.
      const eased = 1 - Math.pow(1 - ratio, 3);
      setValue(target * eased);
      if (ratio < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current != null) cancelAnimationFrame(frame.current);
    };
  }, [target, duration]);

  return value;
}

function EarningsHero({
  net, windowDays, deltaPercent, series, contentNet, usernameNet, width,
}: {
  net: number;
  windowDays: number;
  deltaPercent: number | null;
  series: number[];
  contentNet: number;
  usernameNet: number;
  width: number;
}) {
  const shown = useCountUp(net);
  const sweep = useSharedValue(0);

  useEffect(() => {
    // Balayage lent et continu : c'est ce qui sépare une carte vendue d'un
    // simple encadré. Boucle linéaire, sans entrée, avec un temps mort hors
    // cadre pour ne pas scintiller en permanence.
    sweep.value = withRepeat(
      withTiming(1, { duration: 5200, easing: Easing.linear }),
      -1,
      false,
    );
  }, [sweep]);

  const sweepStyle = useAnimatedStyle(() => {
    const advance = Math.min(sweep.value / 0.45, 1);
    return {
      transform: [
        { translateX: -160 + advance * (width + 220) },
        { rotate: '18deg' },
      ] as [{ translateX: number }, { rotate: string }],
    };
  }, [width]);

  const positive = (deltaPercent ?? 0) >= 0;

  return (
    <View style={styles.hero}>
      <LinearGradient
        colors={['#231018', '#160D12', '#120C0E']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View style={[styles.heroSweep, sweepStyle]} pointerEvents="none">
        <LinearGradient
          colors={['transparent', withAlpha(colors.textPrimary, 0.07), 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <Text style={styles.heroLabel}>Encaissé ces {windowDays} jours</Text>
      <View style={styles.heroValueLine}>
        <Text style={styles.heroValue}>{shown.toFixed(2).replace('.', ',')}</Text>
        <Text style={styles.heroUnit}>NF</Text>
      </View>

      {deltaPercent != null ? (
        <View style={[styles.deltaChip, !positive && styles.deltaChipDown]}>
          <Ionicons
            name={positive ? 'arrow-up' : 'arrow-down'}
            size={11}
            color={positive ? colors.success : colors.red}
          />
          <Text style={[styles.deltaText, !positive && styles.deltaTextDown]}>
            {Math.abs(deltaPercent)} % vs {windowDays} j précédents
          </Text>
        </View>
      ) : (
        <Text style={styles.heroHint}>
          {net > 0 ? 'Première période mesurée' : 'Aucune vente pour le moment'}
        </Text>
      )}

      <Sparkline values={series} width={width} style={styles.heroSpark} />

      <View style={styles.chips}>
        <Chip label="Contenus" value={`${contentNet} NF`} />
        <Chip label="Pseudos" value={`${usernameNet} NF`} />
        <Chip label="Commission" value="30 %" />
      </View>
    </View>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipLabel}>{label} </Text>
      <Text style={styles.chipValue}>{value}</Text>
    </View>
  );
}

/* ─────────────────────────── Prochaine publication ──────────────────────── */

/** « 2 h 41 » — un départ dans trois heures ne se lit pas en date complète. */
function untilLabel(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms)) return '—';
  if (ms <= 0) return 'imminent';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ${String(minutes % 60).padStart(2, '0')}`;
  return `${Math.floor(hours / 24)} j ${hours % 24} h`;
}

function NextPostCard({
  post, queueLength, onPress,
}: {
  post: ScheduledPost | null;
  queueLength: number;
  onPress: () => void;
}) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!post) return undefined;
    // Rafraîchi à la minute : le compte à rebours s'affiche en heures et en
    // minutes, la seconde n'apporterait que des rendus.
    const timer = setInterval(() => setTick((t) => t + 1), 60 * 1000);
    return () => clearInterval(timer);
  }, [post]);

  if (!post) {
    return (
      <StudioCard
        icon="time"
        tone="cyan"
        title="Publications programmées"
        subtitle="Écris maintenant, publie au bon moment"
        onPress={onPress}
      />
    );
  }

  const time = new Date(post.scheduled_for).toLocaleTimeString('fr-FR', {
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.cardTop}>
        <View style={[styles.cardIcon, styles.toneCyan]}>
          <Ionicons name="time" size={17} color={colors.cyan} />
        </View>
        <View style={styles.cardTexts}>
          <Text style={styles.cardTitle}>Prochaine publication</Text>
          <Text style={styles.cardSubtitle} numberOfLines={1}>« {post.content} »</Text>
        </View>
        {queueLength > 1 && (
          <View style={styles.pillGhost}>
            <Text style={styles.pillGhostText}>{queueLength} en file</Text>
          </View>
        )}
      </View>

      <View style={styles.countdown}>
        <Text style={styles.countdownValue}>{untilLabel(post.scheduled_for)}</Text>
        <Text style={styles.countdownHint}>
          départ à {time}{post.mode === 'best_time' ? ' au plus tôt' : ''}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

/* ────────────────────────────── Créneaux ────────────────────────────────── */

/**
 * Vingt-quatre barres, une par heure, l'heure courante cerclée.
 *
 * Les heures viennent du serveur DANS LE FUSEAU DE L'APPAREIL : elles se
 * comparent donc directement à l'horloge de l'écran.
 */
function BestHoursCard({ hours }: { hours: number[] }) {
  const currentHour = new Date().getHours();
  const best = new Set(hours);
  const near = new Set(hours.flatMap((h) => [(h + 23) % 24, (h + 1) % 24]));

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={[styles.cardIcon, styles.toneMagenta]}>
          <Ionicons name="stats-chart" size={17} color={colors.accent} />
        </View>
        <View style={styles.cardTexts}>
          <Text style={styles.cardTitle}>Tes créneaux</Text>
          <Text style={styles.cardSubtitle} numberOfLines={2}>
            {hours.length
              ? `Meilleur engagement vers ${hours.map((h) => `${h} h`).join(', ')}`
              : 'Pas encore assez de publications pour les mesurer'}
          </Text>
        </View>
      </View>

      <View style={styles.heat}>
        {Array.from({ length: 24 }, (_, hour) => (
          <View
            key={hour}
            style={[
              styles.heatBar,
              near.has(hour) && styles.heatBarWarm,
              best.has(hour) && styles.heatBarHot,
              hour === currentHour && styles.heatBarNow,
            ]}
          />
        ))}
      </View>
      <View style={styles.heatLegend}>
        <Text style={styles.heatLegendText}>0 h</Text>
        <Text style={styles.heatLegendText}>12 h</Text>
        <Text style={styles.heatLegendText}>23 h</Text>
      </View>
    </View>
  );
}

/* ────────────────────────────── Audience ────────────────────────────────── */

function VisitorsCard({
  count, incognito, saving, onToggle, onPress,
}: {
  count: number | null;
  incognito: boolean;
  saving: boolean;
  onToggle: (next: boolean) => void;
  onPress: () => void;
}) {
  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.cardTop} onPress={onPress} activeOpacity={0.85}>
        <View style={[styles.cardIcon, styles.toneCyan]}>
          <Ionicons name="eye" size={17} color={colors.cyan} />
        </View>
        <View style={styles.cardTexts}>
          <Text style={styles.cardTitle}>Visiteurs de ton profil</Text>
          <Text style={styles.cardSubtitle}>
            {count != null ? `${count} sur 7 jours` : 'Qui est passé sur ta page'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </TouchableOpacity>

      {/* Le réglage est ici parce que c'est ici qu'on y pense : au moment où
          l'on regarde qui nous observe. */}
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Navigation discrète</Text>
        <Switch
          value={incognito}
          onValueChange={onToggle}
          disabled={saving}
          trackColor={{ false: colors.surfaceElevated, true: colors.accent }}
          thumbColor={colors.textPrimary}
        />
      </View>
    </View>
  );
}

function RisingCard({
  accounts, failureMessage, hasAccess, onPress,
}: {
  accounts: RisingAccount[];
  failureMessage: string | null;
  hasAccess: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.cardTop}>
        <View style={[styles.cardIcon, styles.toneMagenta]}>
          <Ionicons name="trending-up" size={17} color={colors.accent} />
        </View>
        <View style={styles.cardTexts}>
          <Text style={styles.cardTitle}>Comptes qui montent</Text>
          <Text style={styles.cardSubtitle} numberOfLines={1}>
            {!hasAccess
              ? 'Réservé aux abonnés Plus et Pro'
              : failureMessage
                ? 'Radar indisponible · touche pour réessayer'
                : accounts.length
                  ? `Dans ton univers · @${accounts[0].user.username} en tête`
                  : 'Aucun signal récent · le radar continue de chercher'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </View>

      {accounts.length > 0 && (
        <View style={styles.faces}>
          {accounts.slice(0, 5).map((account, index) => (
            <View key={account.user.id} style={[styles.face, index > 0 && styles.faceStacked]}>
              <Avatar size={28} username={account.user.username} uri={account.user.avatar} />
            </View>
          ))}
          <Text style={styles.facesHint}>
            +{accounts[0].new_followers} abonnés en {accounts[0].window_days} j
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

/* ──────────────────────────── Carte générique ───────────────────────────── */

function StudioCard({
  icon, title, subtitle, onPress, badge, value, trailing, tone = 'magenta',
}: {
  icon: any;
  title: string;
  subtitle: string;
  onPress: () => void;
  badge?: number;
  value?: string;
  trailing?: string;
  tone?: 'magenta' | 'cyan' | 'gold' | 'danger';
}) {
  const toneStyle = tone === 'cyan' ? styles.toneCyan
    : tone === 'gold' ? styles.toneGold
      : tone === 'danger' ? styles.toneDanger
        : styles.toneMagenta;
  const iconColor = tone === 'cyan' ? colors.cyan
    : tone === 'gold' ? colors.gold
      : tone === 'danger' ? colors.red
        : colors.accent;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.cardTop}>
        <View style={[styles.cardIcon, toneStyle]}>
          <Ionicons name={icon} size={17} color={iconColor} />
        </View>
        <View style={styles.cardTexts}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardSubtitle} numberOfLines={2}>{subtitle}</Text>
        </View>

        {value ? (
          <View style={styles.pillGhost}><Text style={styles.pillGhostText}>{value}</Text></View>
        ) : null}
        {trailing ? (
          <View style={styles.proTag}><Text style={styles.proTagText}>{trailing}</Text></View>
        ) : null}
        {badge ? (
          <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View>
        ) : null}

        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  headerShell: { backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  roundSlot: { width: 40, alignItems: 'center' },
  roundButton: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface,
  },
  titleGroup: { flex: 1, alignItems: 'center' },
  title: { color: colors.textPrimary, fontSize: 17, fontWeight: '700' },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 16, paddingTop: 8 },

  // ── Héros ──
  hero: {
    borderRadius: radius.lg,
    padding: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: withAlpha(colors.gold, 0.22),
  },
  heroSweep: { position: 'absolute', top: -60, bottom: -60, left: 0, width: 150 },
  heroLabel: { color: colors.textMuted, fontSize: 12 },
  heroValueLine: { flexDirection: 'row', alignItems: 'baseline', marginTop: 2 },
  heroValue: { color: colors.gold, fontSize: 38, fontWeight: '800', letterSpacing: -0.5 },
  heroUnit: { color: colors.gold, fontSize: 17, fontWeight: '700', marginLeft: 5, opacity: 0.75 },
  heroHint: { color: colors.textMuted, fontSize: 12, marginTop: 8 },
  heroSpark: { marginTop: 12 },
  deltaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    marginTop: 8, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: radius.round, backgroundColor: colors.successMuted,
  },
  deltaChipDown: { backgroundColor: colors.redMuted },
  deltaText: { color: colors.success, fontSize: 12, fontWeight: '700' },
  deltaTextDown: { color: colors.red },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 9, paddingVertical: 5,
    borderRadius: radius.round,
    backgroundColor: withAlpha(colors.textPrimary, 0.05),
    borderWidth: 1, borderColor: colors.border,
  },
  chipLabel: { color: colors.textMuted, fontSize: 11 },
  chipValue: { color: colors.textPrimary, fontSize: 11, fontWeight: '700' },

  sectionLabel: {
    color: colors.textMuted, fontSize: 12, fontWeight: '700',
    letterSpacing: 0.8, textTransform: 'uppercase',
    marginTop: 22, marginBottom: 10,
  },

  // ── Cartes ──
  card: {
    paddingVertical: 13, paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    marginBottom: 9,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  cardIcon: {
    width: 34, height: 34, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center', marginRight: 11,
  },
  toneMagenta: { backgroundColor: withAlpha(colors.accent, 0.15) },
  toneCyan: { backgroundColor: colors.cyanMuted },
  toneGold: { backgroundColor: colors.warningMuted },
  toneDanger: { backgroundColor: colors.redMuted },
  cardTexts: { flex: 1 },
  cardTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  cardSubtitle: { color: colors.textMuted, fontSize: 12.5, marginTop: 2, lineHeight: 17 },

  pillGhost: {
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.round,
    backgroundColor: withAlpha(colors.textPrimary, 0.07), marginRight: 8,
  },
  pillGhostText: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
  proTag: {
    marginRight: 8, paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 4, backgroundColor: colors.warningMuted,
  },
  proTagText: { color: colors.gold, fontSize: 10, fontWeight: '800' },
  badge: {
    minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.red, marginRight: 8,
  },
  badgeText: { color: colors.onAccent, fontSize: 11, fontWeight: '800' },

  // ── Compte à rebours ──
  countdown: {
    flexDirection: 'row', alignItems: 'baseline', gap: 8,
    marginTop: 11, paddingVertical: 9, paddingHorizontal: 11,
    borderRadius: radius.sm, backgroundColor: withAlpha(colors.textPrimary, 0.04),
  },
  countdownValue: { color: colors.cyan, fontSize: 19, fontWeight: '800' },
  countdownHint: { color: colors.textMuted, fontSize: 12 },

  // ── Bande horaire ──
  heat: { flexDirection: 'row', gap: 2, marginTop: 11 },
  heatBar: {
    flex: 1, height: 26, borderRadius: 3,
    backgroundColor: withAlpha(colors.textPrimary, 0.06),
  },
  heatBarWarm: { backgroundColor: withAlpha(colors.accent, 0.32) },
  heatBarHot: { backgroundColor: colors.accent },
  heatBarNow: { borderWidth: 1.5, borderColor: colors.cyan },
  heatLegend: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  heatLegendText: { color: colors.textMuted, fontSize: 10 },

  // ── Audience ──
  switchRow: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 11, paddingVertical: 6, paddingHorizontal: 11,
    borderRadius: radius.sm, backgroundColor: withAlpha(colors.textPrimary, 0.04),
  },
  switchLabel: { color: colors.textSecondary, fontSize: 12.5, flex: 1 },
  faces: { flexDirection: 'row', alignItems: 'center', marginTop: 11 },
  face: { borderRadius: 16, borderWidth: 2, borderColor: colors.surface },
  faceStacked: { marginLeft: -9 },
  facesHint: { color: colors.textMuted, fontSize: 12, marginLeft: 10 },
});
