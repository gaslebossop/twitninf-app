/**
 * Statistiques — le relevé d'écoute.
 *
 * ── Refonte du 2026-08-21 ──────────────────────────────────────────────────
 * La version précédente était le gabarit « tableau de bord » au complet :
 * trois onglets de section, quatre puces de période, un carrousel de cinq
 * puces métriques, un grand graphique à métrique commutable, une grille de dix
 * tuiles grises, puis huit sections identiques « titre + carte », dont un
 * anneau de score marqué d'un badge « IA ». Quand chaque bloc porte le même
 * poids visuel, aucun n'en a — et l'écran devient interchangeable avec celui
 * de n'importe quelle autre application.
 *
 * Le changement n'est pas cosmétique, c'est un changement de SUJET. Cette page
 * ne parle pas de vues : elle parle du TEMPS que des gens ont passé à lire ce
 * que ce compte publie. C'est la mesure qui décide de la rémunération dans
 * cette application — le signal Attention est le plus lourd du score du pot
 * créateur — et elle n'apparaissait sur aucun écran. L'objet du monde réel
 * dont cette page est la version écran n'est donc pas un tableau de bord, c'est
 * un RELEVÉ D'ÉCOUTE : une audience cumulée, une durée d'écoute, et ce que
 * cette durée rapporte.
 *
 * ── La signature ───────────────────────────────────────────────────────────
 * `DailyChart` : sept séries quotidiennes en barres, dont deux que personne
 * d'autre ne montre — le temps de lecture reçu et ce que la plateforme a versé.
 * Elles n'existaient au jour NULLE PART avant le 2026-08-21 : `/daily` ne
 * servait ni `dwell_ms` ni `earnings`, et le pot créateur ne les agrège qu'à
 * la semaine. Les deux colonnes ont été ajoutées côté API pour cet écran.
 *
 * ── Ce qui a été supprimé, et pourquoi ─────────────────────────────────────
 *   * Les trois onglets de section — trois façons de couper la même page ;
 *     ce qui est derrière un onglet fermé n'existe pour personne.
 *   * Le carrousel de puces métriques — des sélecteurs déguisés en chiffres :
 *     ni tout à fait un chiffre, ni tout à fait un contrôle. Le choix de série
 *     est resté, sous forme d'une rangée d'onglets qui ressemble à un contrôle.
 *   * La grille de dix tuiles — dix îlots gris, devenus dix lignes de registre.
 *   * « Analyse de l'algorithme », son badge « IA » et ses accordéons —
 *     déplacés là où ils ont un écran entier : `PredictiveAnalyticsScreen`,
 *     joint en pied de page. Un appel réseau de moins au chargement.
 *   * L'« indice d'activité » horaire — un score sans unité ni définition
 *     affichée ; la barre compte maintenant des interactions réelles.
 *   * Le bouton « actualiser » — le tirer-pour-rafraîchir dit déjà ça.
 *   * La courbe hebdomadaire attention/RPM d'une première passe : deux
 *     échelles superposées sur un même cadre, illisibles. Tout ce qu'elle
 *     portait est dans `DailyChart`, au jour et à une seule échelle.
 *
 * ── Ce qui a été ajouté ────────────────────────────────────────────────────
 *   * Le temps de lecture reçu, au jour, et sa moyenne par vue.
 *   * Les revenus versés et le RPM, au jour eux aussi.
 *   * Le rang d'attention dans le vivier de la semaine, écrit et non dessiné.
 *   * Une sélection qui RESTE au relâchement du doigt (voir `DailyChart`).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Skeleton, Tappable } from './ui';
import { userStatsService } from '../services/userStatsService';
import CreatorPoolService, { type CreatorPoolDashboard } from '../services/creatorPoolService';
import { colors, fonts } from '../theme';
import {
  BigFigure,
  DailyChart,
  Eyebrow,
  HourBand,
  LedgerRow,
  Note,
  ReadRow,
  Rule,
  buildAttentionWeeks,
  compact,
  duration as formatDuration,
  durationInline,
  num,
  rank as formatRank,
  signedPercent,
  summarizeAttention,
  summarizeDailyDwell,
  trim,
  type DailyPoint,
  type HourSlot,
} from './stats';

type Timeframe = '7d' | '30d' | '90d' | '1y';

const TIMEFRAMES: { key: Timeframe; label: string; period: string }[] = [
  { key: '7d', label: '7 j', period: '7 derniers jours' },
  { key: '30d', label: '30 j', period: '30 derniers jours' },
  { key: '90d', label: '90 j', period: '90 derniers jours' },
  { key: '1y', label: '1 an', period: '12 derniers mois' },
];

/** Cinq suffisent : au-delà, la liste redit ce que la courbe a déjà dit. */
const TOP_COUNT = 5;

interface UserStatsTabProps {
  userId: string;
  baseStats?: {
    followers?: number;
    following?: number;
    tweets?: number;
  };
  /** Ouvre l'analyse prédictive, qui a son propre écran. */
  onOpenPrediction?: () => void;
}

interface Loaded {
  totalTweets: number;
  totalViews: number;
  totalLikes: number;
  totalRetweets: number;
  totalComments: number;
  totalShares: number;
  followerCount: number;
  profileViews: number;
  engagementRate: number;
  averageViewsPerTweet: number;
  followersGained: number;
  daily: DailyPoint[];
  hours: HourSlot[];
  topTweets: {
    id: string;
    content: string;
    views: number;
    interactions: number;
  }[];
  audience: {
    uniqueEngagedUsers: number;
    returningUsers: number;
    topCountry: string | null;
    topAgeBand: string | null;
  } | null;
  currencySymbol: string;
}

const n = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function UserStatsTab({ userId, baseStats, onOpenPrediction }: UserStatsTabProps) {
  const { width: viewportWidth } = useWindowDimensions();
  const compactLayout = viewportWidth < 390;
  const gutter = compactLayout ? 16 : viewportWidth >= 700 ? 28 : 20;
  const contentWidth = Math.max(280, Math.min(viewportWidth, 760) - gutter * 2);

  const [timeframe, setTimeframe] = useState<Timeframe>('30d');
  const [data, setData] = useState<Loaded | null>(null);
  const [pool, setPool] = useState<CreatorPoolDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!userId) {
        setLoading(false);
        setRefreshing(false);
        setError('Aucun utilisateur connecté.');
        return;
      }

      const requestId = ++sequence.current;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      // Le relevé du pot est facultatif : il peut être refusé (compte hors
      // programme) sans que les statistiques classiques en pâtissent. D'où
      // `allSettled` plutôt qu'un `all` qui ferait tomber toute la page.
      const [statsResult, poolResult] = await Promise.allSettled([
        userStatsService.getUserStats(userId, timeframe),
        CreatorPoolService.getDashboard(),
      ]);

      if (requestId !== sequence.current) return;

      if (statsResult.status === 'rejected') {
        setData(null);
        setError('Impossible de charger les statistiques pour le moment.');
      } else {
        const response = statsResult.value;
        const analytics = response.analytics;
        const daily = response.dailyStats || [];

        setData({
          totalTweets: n(analytics.totalTweets) || n(baseStats?.tweets),
          totalViews: n(analytics.totalViews),
          totalLikes: n(analytics.totalLikes) || n(response.engagementBreakdown?.likes),
          totalRetweets: n(analytics.totalRetweets) || n(response.engagementBreakdown?.retweets),
          totalComments: n(analytics.totalComments) || n(response.engagementBreakdown?.comments),
          totalShares: n(analytics.totalShares) || n(response.engagementBreakdown?.shares),
          followerCount: n(analytics.followerCount) || n(baseStats?.followers),
          profileViews:
            n(analytics.profileViews) ||
            daily.reduce((total, day) => total + n(day.profile_views), 0),
          engagementRate: n(analytics.engagementRate),
          averageViewsPerTweet: n(analytics.averageViewsPerTweet),
          followersGained: daily.reduce((total, day) => total + n(day.followers_gained), 0),
          daily: [...daily]
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .map((day) => ({
              date: day.date,
              views: n(day.views),
              interactions:
                n(day.likes) + n(day.retweets) + n(day.comments) + n(day.shares),
              followers: n(day.followers_gained),
              profileViews: n(day.profile_views),
              // Servis depuis l'ajout du 2026-08-21 à `/daily`. Une API plus
              // ancienne ne les envoie pas : `n()` les ramène à 0 plutôt que
              // de faire tomber toute la série.
              dwellMs: n((day as any).dwell_ms),
              dwellEvents: n((day as any).dwell_events),
              earnings: n((day as any).earnings),
            })),
          hours: (response.activityData || []).map((item) => ({
            hour: Math.min(23, Math.max(0, Math.round(n(item.hour)))),
            tweets: n(item.tweet_count),
            interactions: n(item.engagement_count),
          })),
          topTweets: (response.topTweets || [])
            .map((tweet) => ({
              id: tweet.id,
              content: tweet.content,
              views: n(tweet.views),
              interactions:
                n(tweet.likes) + n(tweet.retweets) + n(tweet.comments) + n(tweet.shares),
            }))
            .sort((a, b) => b.views - a.views)
            .slice(0, TOP_COUNT),
          audience: response.deepInsights
            ? {
                uniqueEngagedUsers: n(response.deepInsights.audience?.uniqueEngagedUsers),
                returningUsers: n(response.deepInsights.audience?.returningUsers),
                topCountry: response.deepInsights.audience?.countries?.[0]?.label ?? null,
                topAgeBand: response.deepInsights.audience?.ageBands?.[0]?.label ?? null,
              }
            : null,
          currencySymbol: response.currency?.symbol || 'NF',
        });
      }

      setPool(poolResult.status === 'fulfilled' ? poolResult.value : null);
      setLoading(false);
      setRefreshing(false);
    },
    [userId, timeframe, baseStats?.tweets, baseStats?.followers],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Le temps de lecture vient des JOURS, comme tout le reste de l'écran. La
  // version précédente le prenait au pot créateur, qui ne l'agrège qu'à la
  // semaine : l'écran affichait alors deux périodes différentes à la fois.
  const dwell = useMemo(() => summarizeDailyDwell(data?.daily ?? []), [data?.daily]);

  // Le pot n'est plus interrogé que pour ce qu'il est SEUL à savoir : où ce
  // compte se situe parmi les créateurs de la semaine. Un rang ne se calcule
  // pas sans le vivier.
  const cohort = useMemo(() => {
    const weeks = buildAttentionWeeks(pool, 1);
    return summarizeAttention(weeks);
  }, [pool]);

  const currency = data?.currencySymbol || pool?.currency?.symbol || 'NF';
  const periodLabel = TIMEFRAMES.find((t) => t.key === timeframe)?.period ?? '';
  const totalInteractions = data
    ? data.totalLikes + data.totalRetweets + data.totalComments + data.totalShares
    : 0;

  const readTime = formatDuration(dwell.totalMs);
  const delta = signedPercent(dwell.deltaRatio);

  const periodControl = (
    <View style={styles.periodRow} accessibilityRole="tablist">
      {TIMEFRAMES.map((option) => {
        const active = option.key === timeframe;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`Afficher ${option.period}`}
            hitSlop={8}
            onPress={() => setTimeframe(option.key)}
            style={styles.periodButton}
          >
            <Text style={[styles.periodLabel, active && styles.periodLabelActive]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  if (loading && !data) {
    return (
      <View style={[styles.page, { paddingHorizontal: gutter }]}>
        {periodControl}
        <Rule />
        <View style={styles.block}>
          <Skeleton width="40%" height={12} />
          <Skeleton width="70%" height={56} style={{ marginTop: 16 }} />
          <Skeleton width="52%" height={16} style={{ marginTop: 12 }} />
        </View>
        <Rule />
        <View style={styles.block}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} width="100%" height={20} style={{ marginTop: i === 0 ? 0 : 24 }} />
          ))}
        </View>
        <Rule />
        <View style={styles.block}>
          <Skeleton width="100%" height={168} />
        </View>
      </View>
    );
  }

  if (error && !data) {
    return (
      <View style={[styles.page, styles.errorPage, { paddingHorizontal: gutter }]}>
        <Text style={styles.errorTitle}>Relevé indisponible</Text>
        <Text style={styles.errorText}>{error}</Text>
        <Tappable
          style={styles.retry}
          onPress={() => load()}
          accessibilityRole="button"
          accessibilityLabel="Réessayer de charger le relevé"
        >
          <Text style={styles.retryText}>Réessayer</Text>
        </Tappable>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.page, { paddingHorizontal: gutter }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => load(true)}
          tintColor={colors.accent}
        />
      }
    >
      {periodControl}
      <Rule />

      {/* ─── Le temps lu ───────────────────────────────────── */}
      <View style={styles.block}>
        <Eyebrow trailing={periodLabel}>Temps de lecture reçu</Eyebrow>

        {dwell.measured ? (
          <>
            <BigFigure value={readTime.value} unit={readTime.unit} />
            <Text style={styles.caption}>
              passées à lire tes publications
              {delta ? (
                <Text style={delta.startsWith('+') ? styles.up : styles.down}>
                  {`  ${delta} vs le début de période`}
                </Text>
              ) : null}
            </Text>
            <Text style={styles.caption}>
              {durationInline(dwell.perDayMs)} par jour · {trim(dwell.msPerView / 1000)}
              {' '}s par vue en moyenne
            </Text>
          </>
        ) : (
          <>
            <BigFigure value="—" tone="estimated" />
            <Text style={styles.caption}>
              Aucune lecture chronométrée sur {periodLabel.toLowerCase()}. La mesure démarre dès
              qu'une de tes publications reste plus d'une seconde à l'écran de quelqu'un.
            </Text>
          </>
        )}
      </View>
      <Rule />

      {/* ─── Le graphique ─────────────────────────────────── */}
      <View style={styles.block}>
        {data && data.daily.length > 1 ? (
          <DailyChart
            days={data.daily}
            width={contentWidth}
            currencySymbol={currency}
            periodLabel={periodLabel}
          />
        ) : (
          <>
            <Eyebrow>Jour par jour</Eyebrow>
            <Note>Il faut au moins deux jours d'activité pour tracer une série.</Note>
          </>
        )}
      </View>
      <Rule />

      {/* ─── Où tu te situes ───────────────────────────────── */}
      <View style={styles.block}>
        <Eyebrow trailing="cette semaine">Où tu te situes</Eyebrow>
        <View style={styles.ledger}>
          <LedgerRow
            first
            label="Rang d'attention"
            value={formatRank(cohort.latestRank) ?? '—'}
            hint="parmi les créateurs du pot cette semaine"
            tone={cohort.latestRank !== null && cohort.latestRank >= 0.5 ? 'positive' : 'muted'}
          />
          <LedgerRow
            label="Revenu pour mille vues"
            value={cohort.latestRpm > 0 ? trim(cohort.latestRpm) : '—'}
            unit={cohort.latestRpm > 0 ? currency : undefined}
            hint="semaine de relevé en cours"
            tone="money"
          />
        </View>
        <Note>
          Le temps de lecture est le signal le plus lourd du pot créateur : c'est lui, avant les
          vues, qui décide de ta part. Le rang se lit sur la semaine du pot, pas sur la période
          choisie plus haut — un rang n'a de sens que contre le vivier du moment.
        </Note>
      </View>
      <Rule />

      {/* ─── Ce qui a été lu ─────────────────────────────────────────────── */}
      <View style={styles.block}>
        <Eyebrow trailing={data && data.topTweets.length > 0 ? `top ${data.topTweets.length}` : null}>
          Ce qui a été lu
        </Eyebrow>

        {data && data.topTweets.length > 0 ? (
          <>
            <View style={styles.ledger}>
              {data.topTweets.map((tweet, index) => (
                <ReadRow
                  key={tweet.id}
                  first={index === 0}
                  content={tweet.content}
                  views={tweet.views}
                  interactions={tweet.interactions}
                  msPerView={dwell.msPerView}
                />
              ))}
            </View>
            {dwell.msPerView > 0 && (
              <Note>
                Durées estimées : le temps de lecture est mesuré par semaine et par compte, jamais
                par publication. Ce sont les vues de chacune ramenées à la durée moyenne de la
                période.
              </Note>
            )}
          </>
        ) : (
          <Note>Rien de publié sur {periodLabel.toLowerCase()}.</Note>
        )}
      </View>
      <Rule />

      {/* ─── Quand on te lit ─────────────────────────────────────────────── */}
      <View style={styles.block}>
        <Eyebrow>Quand on te lit</Eyebrow>
        {data && data.hours.length > 0 ? (
          <View style={styles.curve}>
            <HourBand slots={data.hours} width={contentWidth} />
          </View>
        ) : (
          <Note>Pas encore assez d'interactions pour dégager un créneau.</Note>
        )}
      </View>
      <Rule />

      {/* ─── Qui te lit ──────────────────────────────────────────────────── */}
      <View style={styles.block}>
        <Eyebrow>Qui te lit</Eyebrow>
        <View style={styles.ledger}>
          <LedgerRow first label="Abonnés" value={compact(data?.followerCount ?? 0)} />
          <LedgerRow
            label="Gagnés sur la période"
            value={`${(data?.followersGained ?? 0) > 0 ? '+' : ''}${num(data?.followersGained ?? 0)}`}
            hint={periodLabel}
            tone={(data?.followersGained ?? 0) > 0 ? 'positive' : 'muted'}
          />
          {data?.audience && (
            <>
              <LedgerRow
                label="Personnes qui ont réagi"
                value={compact(data.audience.uniqueEngagedUsers)}
                hint="comptes distincts"
              />
              <LedgerRow
                label="Dont revenues"
                value={compact(data.audience.returningUsers)}
                hint="ont réagi plus d'une fois"
              />
              {!!data.audience.topCountry && (
                <LedgerRow label="Premier pays" value={data.audience.topCountry} />
              )}
              {!!data.audience.topAgeBand && (
                <LedgerRow label="Tranche d'âge dominante" value={data.audience.topAgeBand} />
              )}
            </>
          )}
        </View>
        {!data?.audience && (
          <Note>
            L'audience détaillée s'ouvre à partir d'un nombre minimum de comptes distincts, pour
            qu'aucune personne ne soit identifiable.
          </Note>
        )}
      </View>
      <Rule />

      {/* ─── Le reste du relevé ──────────────────────────────────────────── */}
      <View style={styles.block}>
        <Eyebrow trailing={periodLabel}>Le reste du relevé</Eyebrow>
        <View style={styles.ledger}>
          <LedgerRow first label="Publications" value={num(data?.totalTweets ?? 0)} />
          <LedgerRow
            label="Vues par publication"
            value={compact(Math.round(data?.averageViewsPerTweet ?? 0))}
          />
          <LedgerRow label="Visites du profil" value={compact(data?.profileViews ?? 0)} />
          <LedgerRow
            label="Taux d'engagement"
            value={trim(data?.engagementRate ?? 0)}
            unit="%"
            hint="interactions rapportées aux vues"
          />
          <LedgerRow label="Interactions" value={compact(totalInteractions)} />
          <LedgerRow label="J'aime" value={compact(data?.totalLikes ?? 0)} tone="muted" />
          <LedgerRow label="Republications" value={compact(data?.totalRetweets ?? 0)} tone="muted" />
          <LedgerRow label="Commentaires" value={compact(data?.totalComments ?? 0)} tone="muted" />
          <LedgerRow label="Partages" value={compact(data?.totalShares ?? 0)} tone="muted" />
        </View>
      </View>

      {!!onOpenPrediction && (
        <>
          <Rule />
          <Tappable
            style={styles.link}
            onPress={onOpenPrediction}
            accessibilityRole="button"
            accessibilityLabel="Ouvrir l'analyse prédictive"
          >
            <View style={styles.linkText}>
              <Text style={styles.linkTitle}>Analyse prédictive</Text>
              <Text style={styles.linkHint}>
                Ce que l'algorithme retient de tes publications, et ce qu'il projette
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Tappable>
        </>
      )}

      {!!error && !!data && (
        <Text style={styles.partial}>
          Relevé partiel : {error.toLowerCase()} Tire vers le bas pour réessayer.
        </Text>
      )}

      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  page: { paddingTop: 4 },

  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    paddingBottom: 12,
  },
  periodButton: {
    minHeight: 44,
    justifyContent: 'center',
  },
  periodLabel: {
    fontSize: 15,
    fontFamily: fonts.medium,
    color: colors.textMuted,
    letterSpacing: 0.2,
  },
  periodLabelActive: {
    color: colors.textPrimary,
  },

  block: {
    paddingVertical: 24,
    gap: 12,
  },
  ledger: {
    marginTop: 4,
  },
  curve: {
    marginTop: 8,
  },

  caption: {
    fontSize: 15,
    lineHeight: 21,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
  },
  up: { fontFamily: fonts.mono, color: colors.success },
  down: { fontFamily: fonts.mono, color: colors.red },

  link: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 16,
  },
  linkText: { flex: 1, gap: 2 },
  linkTitle: {
    fontSize: 17,
    fontFamily: fonts.medium,
    color: colors.textPrimary,
  },
  linkHint: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.regular,
    color: colors.textMuted,
  },

  partial: {
    marginTop: 24,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.regular,
    color: colors.warning,
  },

  errorPage: {
    flex: 1,
    justifyContent: 'center',
    gap: 12,
  },
  errorTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  errorText: {
    fontSize: 15,
    lineHeight: 21,
    fontFamily: fonts.regular,
    color: colors.textMuted,
  },
  retry: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    borderRadius: 999,
  },
  retryText: {
    fontSize: 15,
    fontFamily: fonts.medium,
    color: colors.textPrimary,
  },
});
