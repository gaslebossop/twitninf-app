import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenBackground, BackButton, ScreenSkeleton } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useHeaderMetrics, HEADER_CONTENT_HEIGHT } from '../hooks/useHeaderMetrics';
import { colors, fonts } from '../theme';
import {
  fetchCreatorProfile,
  predictTweet,
  fetchRadar,
  generateRadarIdea,
  confidenceLabel,
  formatHour,
  formatImpact,
  scoreLabel,
  type CreatorProfile,
  type PredictionResult,
  type RadarResult,
  type PredictionFactor,
} from '../services/creatorIntelligenceService';
import {
  canUseFeature,
  effectiveSubscriptionTier,
  isSubscriptionActiveFor,
} from '../utils/subscriptionTier';

/**
 * Analytics prédictifs — écran principal de l'avantage Pro.
 *
 * Trois onglets, trois questions différentes :
 *  - « Mon profil » : qu'est-ce qui marche chez moi, mesuré sur mon historique ;
 *  - « Tester »     : ce brouillon-là, il vaut quoi avant que je le publie ;
 *  - « Radar »      : quel sujet proche de mes thèmes décolle en ce moment.
 *
 * Tout ce qui est affiché ici vient de l'historique réel du compte. Quand il
 * n'y a pas assez de matière, l'écran le DIT au lieu d'afficher un chiffre :
 * sur une fonctionnalité payante, un nombre inventé se paie plus cher qu'un
 * espace vide.
 */

type TabKey = 'profile' | 'test' | 'radar';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'profile', label: 'Mon profil', icon: 'person-circle-outline' },
  { key: 'test', label: 'Tester', icon: 'flask-outline' },
  { key: 'radar', label: 'Radar', icon: 'radio-outline' },
];

const DAY_NAMES = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

interface Props {
  navigation: any;
}

export default function PredictiveAnalyticsScreen({ navigation }: Props) {
  const { user } = useAuth() as any;
  const { top: headerTopInset } = useHeaderMetrics();

  const tier = effectiveSubscriptionTier(!!user?.premium, user?.subscription_tier);
  const isPro =
    canUseFeature(tier, 'pro') && isSubscriptionActiveFor(tier, user?.subscription_expires_at);

  const [tab, setTab] = useState<TabKey>('profile');

  // ── Profil ──
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Test de brouillon ──
  const [draft, setDraft] = useState('');
  const [draftMedia, setDraftMedia] = useState(0);
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [predicting, setPredicting] = useState(false);
  const [predictError, setPredictError] = useState<string | null>(null);

  // ── Radar ──
  const [radar, setRadar] = useState<RadarResult | null>(null);
  const [radarLoading, setRadarLoading] = useState(false);
  const [radarError, setRadarError] = useState<string | null>(null);
  const [ideaFor, setIdeaFor] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<Record<string, { idea: string; angle: string }>>({});

  const loadProfile = useCallback(async () => {
    const result = await fetchCreatorProfile();
    if (result.ok && result.data) {
      setProfile(result.data);
      setProfileError(null);
    } else {
      setProfileError(result.message || 'Profil indisponible.');
    }
    setProfileLoading(false);
  }, []);

  const loadRadar = useCallback(async () => {
    setRadarLoading(true);
    const result = await fetchRadar();
    if (result.ok && result.data) {
      setRadar(result.data);
      setRadarError(null);
    } else {
      setRadarError(result.message || 'Radar indisponible.');
    }
    setRadarLoading(false);
  }, []);

  useEffect(() => {
    if (isPro) loadProfile();
    else setProfileLoading(false);
  }, [isPro, loadProfile]);

  // Le radar coûte des embeddings côté serveur : il n'est chargé qu'à
  // l'ouverture de son onglet, pas au montage de l'écran.
  useEffect(() => {
    if (tab === 'radar' && isPro && !radar && !radarLoading) loadRadar();
  }, [tab, isPro, radar, radarLoading, loadRadar]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadProfile();
    if (tab === 'radar') await loadRadar();
    setRefreshing(false);
  }, [loadProfile, loadRadar, tab]);

  const runPrediction = useCallback(async () => {
    if (!draft.trim()) return;
    setPredicting(true);
    setPredictError(null);
    const result = await predictTweet({ content: draft, mediaCount: draftMedia });
    if (result.ok && result.data) setPrediction(result.data);
    else setPredictError(result.message || 'Analyse impossible.');
    setPredicting(false);
  }, [draft, draftMedia]);

  const requestIdea = useCallback(async (term: string) => {
    setIdeaFor(term);
    const result = await generateRadarIdea(term);
    if (result.ok && result.data) {
      setIdeas((prev) => ({
        ...prev,
        [term]: { idea: result.data!.idea, angle: result.data!.angle },
      }));
    } else {
      setIdeas((prev) => ({
        ...prev,
        [term]: { idea: '', angle: result.message || 'Aucune idée générée.' },
      }));
    }
    setIdeaFor(null);
  }, []);

  // ── Rendu ────────────────────────────────────────────────────────────────

  const header = (
    <View style={[styles.headerShell, { paddingTop: headerTopInset }]}>
      <View style={[styles.header, { minHeight: HEADER_CONTENT_HEIGHT }]}>
        <View style={styles.roundSlot}>
          <BackButton navigation={navigation} style={styles.roundButton} />
        </View>
        <View style={styles.titleGroup}>
          <Text style={styles.title} numberOfLines={1}>Analytics prédictifs</Text>
          <Text style={styles.subtitle} numberOfLines={1}>Avantage Pro</Text>
        </View>
        <View style={styles.roundSlot} />
      </View>
    </View>
  );

  if (!isPro) {
    return (
      <ScreenBackground>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
        {header}
        <View style={styles.lockedWrap}>
          <View style={styles.lockedIcon}>
            <Ionicons name="trending-up" size={28} color={colors.accent} />
          </View>
          <Text style={styles.lockedTitle}>Réservé au palier Pro</Text>
          <Text style={styles.lockedText}>
            Estime la portée d'un tweet avant de le publier, découvre ce qui marche
            réellement sur ton compte, et reçois une idée de tweet quand un sujet
            proche des tiens décolle.
          </Text>
          <TouchableOpacity
            style={styles.lockedCta}
            onPress={() => navigation.navigate('Profile')}
            activeOpacity={0.85}
          >
            <Text style={styles.lockedCtaText}>Voir l'abonnement Pro</Text>
          </TouchableOpacity>
        </View>
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      {header}

      <View style={styles.tabBar}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setTab(t.key)}
              activeOpacity={0.8}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Ionicons
                name={t.icon as any}
                size={16}
                color={active ? colors.accent : colors.textMuted}
              />
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
            />
          }
        >
          {tab === 'profile' && (
            <ProfileTab
              profile={profile}
              loading={profileLoading}
              error={profileError}
              onRetry={loadProfile}
            />
          )}

          {tab === 'test' && (
            <TestTab
              draft={draft}
              setDraft={setDraft}
              mediaCount={draftMedia}
              setMediaCount={setDraftMedia}
              prediction={prediction}
              predicting={predicting}
              error={predictError}
              onRun={runPrediction}
            />
          )}

          {tab === 'radar' && (
            <RadarTab
              radar={radar}
              loading={radarLoading}
              error={radarError}
              ideas={ideas}
              ideaFor={ideaFor}
              onRequestIdea={requestIdea}
              onRetry={loadRadar}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenBackground>
  );
}

// ── Onglet « Mon profil » ──────────────────────────────────────────────────

function ProfileTab({
  profile,
  loading,
  error,
  onRetry,
}: {
  profile: CreatorProfile | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (loading) return <Loader label="Analyse de ton historique…" />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (!profile) return null;

  if (!profile.hasEnoughData) {
    return (
      <EmptyState
        icon="bar-chart-outline"
        title="Pas encore assez d'historique"
        text={`Il faut au moins ${profile.minimumRequired} tweets originaux pour que les chiffres veuillent dire quelque chose. Tu en as ${profile.sampleSize}.`}
      />
    );
  }

  const base = profile.baseline!;
  const trend = profile.trend;

  return (
    <View>
      <SectionTitle
        title="Ta base de référence"
        hint={`Sur ${profile.sampleSize} tweets des ${profile.historyDays} derniers jours`}
      />

      <View style={styles.statGrid}>
        <StatCard
          label="Engagement médian"
          value={String(base.medianEngagement)}
          hint="par tweet"
        />
        <StatCard label="Vues médianes" value={String(base.medianViews)} hint="par tweet" />
        <StatCard
          label="Ton meilleur"
          value={String(base.bestEverEngagement)}
          hint="record d'engagement"
        />
        <StatCard
          label="Top 10 %"
          value={String(base.p90Engagement)}
          hint="seuil d'un bon tweet"
        />
      </View>

      {trend?.comparable ? (
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>Tendance récente</Text>
            <View
              style={[
                styles.pill,
                (trend.changePercent ?? 0) >= 0 ? styles.pillGood : styles.pillWeak,
              ]}
            >
              <Text
                style={[
                  styles.pillText,
                  (trend.changePercent ?? 0) >= 0 ? styles.pillTextGood : styles.pillTextWeak,
                ]}
              >
                {formatImpact(trend.changePercent ?? 0)}
              </Text>
            </View>
          </View>
          <Text style={styles.cardBody}>
            Médiane récente {trend.recentMedian} contre {trend.previousMedian} sur la
            période précédente.
          </Text>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Tendance récente</Text>
          <Text style={styles.cardBody}>
            Pas assez de tweets sur chacune des deux périodes pour comparer
            honnêtement. On préfère ne rien afficher qu'un pourcentage bricolé.
          </Text>
        </View>
      )}

      {!!profile.factors?.length && (
        <>
          <SectionTitle
            title="Ce qui marche chez toi"
            hint="Mesuré en comparant tes propres tweets entre eux"
          />
          {profile.factors.slice(0, 8).map((f) => (
            <FactorRow key={f.key} factor={f} />
          ))}
        </>
      )}

      {!!profile.bestHours?.length && (
        <>
          <SectionTitle title="Tes meilleurs créneaux" hint="Engagement moyen par tweet publié" />
          <View style={styles.card}>
            {profile.bestHours.map((h, index) => (
              <View
                key={h.hour}
                style={[styles.slotRow, index > 0 && styles.slotRowDivider]}
              >
                <View style={styles.slotRank}>
                  <Text style={styles.slotRankText}>{index + 1}</Text>
                </View>
                <Text style={styles.slotHour}>{formatHour(h.hour)}</Text>
                <View style={styles.slotBarTrack}>
                  <View
                    style={[
                      styles.slotBarFill,
                      {
                        width: `${Math.min(
                          100,
                          (h.avgEngagement / (profile.bestHours![0].avgEngagement || 1)) * 100,
                        )}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.slotValue}>{h.avgEngagement}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {!!profile.topTweets?.length && (
        <>
          <SectionTitle title="Tes tweets les plus forts" hint="Ce qu'il faudrait rééditer" />
          {profile.topTweets.map((t) => (
            <View key={t.id} style={styles.card}>
              <Text style={styles.tweetContent} numberOfLines={3}>
                {t.content}
              </Text>
              <View style={styles.tweetStats}>
                <MiniStat icon="heart" value={t.likes} />
                <MiniStat icon="repeat" value={t.retweets} />
                <MiniStat icon="chatbubble" value={t.replies} />
                <MiniStat icon="eye" value={t.views} />
                {t.hasMedia && (
                  <View style={styles.miniStat}>
                    <Ionicons name="image" size={13} color={colors.textMuted} />
                  </View>
                )}
              </View>
            </View>
          ))}
        </>
      )}

      <Text style={styles.footnote}>
        Ces chiffres sont calculés à la demande sur tes tweets originaux publiés
        (hors réponses et retweets). Aucun n'est estimé ni lissé.
      </Text>
    </View>
  );
}

// ── Onglet « Tester » ──────────────────────────────────────────────────────

function TestTab({
  draft,
  setDraft,
  mediaCount,
  setMediaCount,
  prediction,
  predicting,
  error,
  onRun,
}: {
  draft: string;
  setDraft: (v: string) => void;
  mediaCount: number;
  setMediaCount: (n: number) => void;
  prediction: PredictionResult | null;
  predicting: boolean;
  error: string | null;
  onRun: () => void;
}) {
  const score = prediction?.score ?? null;
  const label = useMemo(() => (score !== null ? scoreLabel(score) : null), [score]);

  return (
    <View>
      <SectionTitle
        title="Teste un brouillon"
        hint="Rien n'est publié : l'analyse se fait sur le texte seul"
      />

      <View style={styles.composer}>
        <TextInput
          style={styles.composerInput}
          placeholder="Colle ou écris le tweet que tu envisages…"
          placeholderTextColor={colors.textMuted}
          value={draft}
          onChangeText={setDraft}
          multiline
          textAlignVertical="top"
          maxLength={1000}
        />
        <View style={styles.composerFooter}>
          <TouchableOpacity
            style={styles.mediaToggle}
            onPress={() => setMediaCount(mediaCount > 0 ? 0 : 1)}
            activeOpacity={0.8}
            accessibilityLabel="Simuler une image jointe"
          >
            <Ionicons
              name={mediaCount > 0 ? 'image' : 'image-outline'}
              size={16}
              color={mediaCount > 0 ? colors.accent : colors.textMuted}
            />
            <Text style={[styles.mediaToggleText, mediaCount > 0 && styles.mediaToggleTextOn]}>
              {mediaCount > 0 ? 'Avec image' : 'Sans image'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.charCount}>{draft.length}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, (!draft.trim() || predicting) && styles.buttonDisabled]}
        onPress={onRun}
        disabled={!draft.trim() || predicting}
        activeOpacity={0.85}
      >
        {predicting ? (
          <ActivityIndicator size="small" color={colors.onAccent} />
        ) : (
          <>
            <Ionicons name="flash" size={16} color={colors.onAccent} />
            <Text style={styles.primaryButtonText}>Estimer la performance</Text>
          </>
        )}
      </TouchableOpacity>

      {!!error && <ErrorState message={error} />}

      {prediction && !prediction.hasEnoughData && (
        <EmptyState
          icon="hourglass-outline"
          title="Pas encore assez d'historique"
          text={prediction.message || ''}
        />
      )}

      {prediction?.hasEnoughData && (
        <>
          <View style={styles.scoreCard}>
            <View style={styles.scoreRow}>
              <Text
                style={[
                  styles.scoreValue,
                  label?.tone === 'good' && styles.scoreGood,
                  label?.tone === 'weak' && styles.scoreWeak,
                ]}
              >
                {score}
              </Text>
              <Text style={styles.scoreMax}>/100</Text>
            </View>
            <Text style={styles.scoreLabel}>{label?.label}</Text>
            <Text style={styles.scoreHint}>
              {confidenceLabel(prediction.confidence)}
              {prediction.confidenceScore != null ? ` (${prediction.confidenceScore} %)` : ''}
              {' '}· basée sur {prediction.sampleSize} tweets
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Engagement attendu</Text>
            <View style={styles.rangeRow}>
              <RangeCell label="Bas" value={prediction.prediction!.engagement.low} />
              <RangeCell
                label="Attendu"
                value={prediction.prediction!.engagement.expected}
                emphasis
              />
              <RangeCell label="Haut" value={prediction.prediction!.engagement.high} />
            </View>
            <Text style={styles.cardBody}>
              Vues : {prediction.prediction!.views.low}–{prediction.prediction!.views.high},
              {' '}attendu {prediction.prediction!.views.expected}.
              {prediction.prediction!.engagementRatePercent != null
                ? ` Taux d'engagement estimé : ${prediction.prediction!.engagementRatePercent} %.`
                : ''}
            </Text>
            {!!prediction.prediction!.engagement.interval95 && (
              <Text style={styles.intervalNote}>
                Intervalle prudent à 95 % : {prediction.prediction!.engagement.interval95.low}–
                {prediction.prediction!.engagement.interval95.high} interactions.
              </Text>
            )}
          </View>

          {!!prediction.prediction!.components && (
            <>
              <SectionTitle title="Détail des interactions" hint="Répartition apprise sur les tweets les plus proches" />
              <View style={styles.statGrid}>
                <StatCard
                  label="Likes attendus"
                  value={String(prediction.prediction!.components.likes.expected)}
                  hint={`${prediction.prediction!.components.likes.sharePercent} % du total`}
                />
                <StatCard
                  label="Retweets attendus"
                  value={String(prediction.prediction!.components.retweets.expected)}
                  hint={`${prediction.prediction!.components.retweets.sharePercent} % du total`}
                />
                <StatCard
                  label="Réponses attendues"
                  value={String(prediction.prediction!.components.replies.expected)}
                  hint={`${prediction.prediction!.components.replies.sharePercent} % du total`}
                />
                <StatCard
                  label="Clics attendus"
                  value={String(prediction.prediction!.clicks?.expected ?? 0)}
                  hint={prediction.prediction!.clicks?.clickThroughRatePercent != null
                    ? `CTR ${prediction.prediction!.clicks.clickThroughRatePercent} %`
                    : 'signal incomplet'}
                />
              </View>
            </>
          )}

          {!!prediction.probabilities && (
            <>
              <SectionTitle title="Probabilités calibrées" hint="Calculées sur les erreurs du backtest temporel" />
              <View style={styles.card}>
                <MetricRow
                  label="Faire mieux que ton tweet habituel"
                  value={`${prediction.probabilities.aboveUsualPercent} %`}
                />
                <MetricRow
                  label="Entrer dans ton top 10 %"
                  value={`${prediction.probabilities.top10Percent} %`}
                  divider
                />
                <MetricRow
                  label="Rester sous ta médiane"
                  value={`${prediction.probabilities.belowUsualPercent} %`}
                  divider
                />
              </View>
            </>
          )}

          {!!prediction.drivers?.length && (
            <>
              <SectionTitle
                title="Signaux qui déplacent la prédiction"
                hint="Contribution du modèle, toutes choses égales par ailleurs"
              />
              {prediction.drivers.map((driver) => (
                <DriverRow key={driver.label} driver={driver} />
              ))}
            </>
          )}

          {!!prediction.timingForecast?.length && (
            <>
              <SectionTitle title="Meilleurs créneaux pour ce brouillon" hint="Simulation des 7 prochains jours" />
              <View style={styles.card}>
                {prediction.timingForecast.map((slot, index) => (
                  <View key={slot.publishAt} style={[styles.forecastRow, index > 0 && styles.slotRowDivider]}>
                    <View style={styles.forecastTime}>
                      <Text style={styles.forecastDay}>{DAY_NAMES[slot.dayOfWeek]}</Text>
                      <Text style={styles.forecastHour}>{formatHour(slot.hour)}</Text>
                    </View>
                    <View style={styles.forecastValues}>
                      <Text style={styles.forecastPrimary}>{slot.expectedEngagement} interactions</Text>
                      <Text style={styles.forecastSecondary}>
                        {slot.expectedViews} vues · audience {slot.audienceActivityIndex}/100
                      </Text>
                    </View>
                    <Text style={[styles.forecastUplift, slot.upliftPercent >= 0 ? styles.impactGood : styles.impactWeak]}>
                      {formatImpact(slot.upliftPercent)}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {!!prediction.advice?.length && (
            <>
              <SectionTitle title="Ce que tu peux améliorer" hint="Tiré de ton propre historique" />
              {prediction.advice.map((a, i) => (
                <View key={`${a.icon}-${i}`} style={styles.adviceRow}>
                  <View style={styles.adviceIcon}>
                    <Ionicons name={a.icon as any} size={15} color={colors.accent} />
                  </View>
                  <Text style={styles.adviceText}>{a.text}</Text>
                </View>
              ))}
            </>
          )}

          {!!prediction.factors?.length && (
            <>
              <SectionTitle
                title="Facteurs pris en compte"
                hint="Ceux marqués « appliqué » pèsent sur cette estimation"
              />
              {prediction.factors.map((f) => (
                <FactorRow key={f.key} factor={f} showApplied />
              ))}
            </>
          )}

          {!!prediction.comparables?.length && (
            <>
              <SectionTitle
                title="Tes tweets comparables"
                hint="Textes proches que tu as déjà publiés"
              />
              {prediction.comparables.map((c) => (
                <View key={c.id} style={styles.card}>
                  <Text style={styles.tweetContent} numberOfLines={2}>{c.content}</Text>
                  <Text style={styles.comparableMeta}>
                    {c.similarity} % de mots communs · {c.engagement} interactions ·{' '}
                    {c.views} vues
                  </Text>
                </View>
              ))}
            </>
          )}

          {!!prediction.model && (
            <>
              <SectionTitle title="Fiabilité du modèle" hint={prediction.modelVersion} />
              <View style={styles.card}>
                <MetricRow label="Variables analysées" value={String(prediction.model.featuresConsidered)} />
                <MetricRow
                  label="Tweets réellement exploitables"
                  value={`${prediction.model.dataQuality.matureSampleSize}/${prediction.model.dataQuality.rawSampleSize}`}
                  divider
                />
                <MetricRow
                  label="Couverture des vues"
                  value={`${prediction.model.dataQuality.viewCoveragePercent} %`}
                  divider
                />
                <MetricRow
                  label="Couverture comportementale"
                  value={`${prediction.model.dataQuality.behaviorCoveragePercent} %`}
                  divider
                />
                <MetricRow
                  label="Erreur moyenne du backtest"
                  value={prediction.model.backtest.meanAbsoluteError == null
                    ? 'pas assez de recul'
                    : `± ${prediction.model.backtest.meanAbsoluteError}`}
                  divider
                />
                <Text style={styles.modelWeights}>
                  Poids : base robuste {prediction.model.ensembleWeights.baseline} % · régression{' '}
                  {prediction.model.ensembleWeights.ridge} % · tweets proches{' '}
                  {prediction.model.ensembleWeights.neighbors} %
                </Text>
                {!!prediction.confidenceDetails?.caveats.length && (
                  <Text style={styles.modelCaveats}>
                    {prediction.confidenceDetails.caveats.join('\n')}
                  </Text>
                )}
              </View>
            </>
          )}
        </>
      )}
    </View>
  );
}

// ── Onglet « Radar » ───────────────────────────────────────────────────────

function RadarTab({
  radar,
  loading,
  error,
  ideas,
  ideaFor,
  onRequestIdea,
  onRetry,
}: {
  radar: RadarResult | null;
  loading: boolean;
  error: string | null;
  ideas: Record<string, { idea: string; angle: string }>;
  ideaFor: string | null;
  onRequestIdea: (term: string) => void;
  onRetry: () => void;
}) {
  if (loading) return <Loader label="Analyse des sujets qui montent…" />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (!radar) return null;

  if (!radar.hasProfile) {
    return (
      <EmptyState
        icon="radio-outline"
        title="Le radar ne te connaît pas encore"
        text={radar.message || 'Publie quelques tweets de plus pour qu\'il apprenne tes sujets.'}
      />
    );
  }

  if (radar.topics.length === 0) {
    return (
      <EmptyState
        icon="radio-outline"
        title="Rien qui décolle sur tes sujets"
        text={`Aucun sujet proche de tes thèmes ne sort du lot sur les ${radar.windowHours ?? 12} dernières heures. C'est le cas la plupart du temps — le radar se manifeste quand il y a vraiment quelque chose.`}
      />
    );
  }

  return (
    <View>
      <SectionTitle
        title="Sujets qui montent"
        hint={`Fenêtre de ${radar.windowHours}h, filtrés sur tes thèmes`}
      />

      {radar.topics.map((t) => {
        const idea = ideas[t.term];
        const busy = ideaFor === t.term;
        return (
          <View key={t.term} style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.topicTerm} numberOfLines={1}>{t.term}</Text>
              <View style={[styles.pill, styles.pillGood]}>
                <Text style={[styles.pillText, styles.pillTextGood]}>×{t.acceleration}</Text>
              </View>
            </View>
            <Text style={styles.topicMeta}>
              {t.mentions} mentions · {t.authors} comptes différents ·{' '}
              {Math.round(t.affinity * 100)} % proche de tes sujets
            </Text>

            {idea ? (
              idea.idea ? (
                <View style={styles.ideaBox}>
                  <Text style={styles.ideaText}>{idea.idea}</Text>
                  {!!idea.angle && <Text style={styles.ideaAngle}>{idea.angle}</Text>}
                </View>
              ) : (
                <Text style={styles.ideaError}>{idea.angle}</Text>
              )
            ) : (
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => onRequestIdea(t.term)}
                disabled={busy}
                activeOpacity={0.85}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <>
                    <Ionicons name="bulb-outline" size={15} color={colors.accent} />
                    <Text style={styles.secondaryButtonText}>Proposer une idée de tweet</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        );
      })}

      <Text style={styles.footnote}>
        Un sujet « monte » quand il accélère nettement par rapport à son rythme
        habituel, porté par plusieurs comptes différents — pas simplement quand
        il est souvent cité. Tu reçois aussi une notification quand l'un d'eux
        perce, sans avoir à ouvrir cet onglet.
      </Text>
    </View>
  );
}

// ── Briques d'interface ────────────────────────────────────────────────────

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.sectionTitleText}>{title}</Text>
      {!!hint && <Text style={styles.sectionHint}>{hint}</Text>}
    </View>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {!!hint && <Text style={styles.statHint}>{hint}</Text>}
    </View>
  );
}

function RangeCell({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <View style={styles.rangeCell}>
      <Text style={[styles.rangeValue, emphasis && styles.rangeValueEmphasis]}>{value}</Text>
      <Text style={styles.rangeLabel}>{label}</Text>
    </View>
  );
}

function FactorRow({
  factor,
  showApplied,
}: {
  factor: PredictionFactor;
  showApplied?: boolean;
}) {
  const positive = factor.impactPercent > 0;
  const magnitude = Math.min(100, Math.abs(factor.impactPercent));

  return (
    <View style={[styles.factorRow, showApplied && !factor.applies && styles.factorRowMuted]}>
      <View style={styles.factorHead}>
        <Text style={styles.factorLabel} numberOfLines={1}>{factor.label}</Text>
        <Text style={[styles.factorImpact, positive ? styles.impactGood : styles.impactWeak]}>
          {formatImpact(factor.impactPercent)}
        </Text>
      </View>

      <View style={styles.factorBarTrack}>
        <View
          style={[
            styles.factorBarFill,
            { width: `${magnitude}%` },
            positive ? styles.factorBarGood : styles.factorBarWeak,
          ]}
        />
      </View>

      <Text style={styles.factorExplain}>{factor.explain}</Text>
      <Text style={styles.factorSample}>
        {factor.sample.with} tweets avec · {factor.sample.without} sans · fiabilité{' '}
        {factor.confidence} %
        {showApplied ? (factor.applies ? ' · appliqué' : ' · non appliqué') : ''}
      </Text>
    </View>
  );
}

function DriverRow({
  driver,
}: {
  driver: NonNullable<PredictionResult['drivers']>[number];
}) {
  const positive = driver.impactPercent >= 0;
  const magnitude = Math.min(100, Math.abs(driver.impactPercent));
  return (
    <View style={styles.factorRow}>
      <View style={styles.factorHead}>
        <Text style={styles.factorLabel}>{driver.label}</Text>
        <Text style={[styles.factorImpact, positive ? styles.impactGood : styles.impactWeak]}>
          {formatImpact(driver.impactPercent)}
        </Text>
      </View>
      <View style={styles.factorBarTrack}>
        <View
          style={[
            styles.factorBarFill,
            { width: `${magnitude}%` },
            positive ? styles.factorBarGood : styles.factorBarWeak,
          ]}
        />
      </View>
    </View>
  );
}

function MetricRow({
  label,
  value,
  divider,
}: {
  label: string;
  value: string;
  divider?: boolean;
}) {
  return (
    <View style={[styles.metricRow, divider && styles.slotRowDivider]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function MiniStat({ icon, value }: { icon: string; value: number }) {
  return (
    <View style={styles.miniStat}>
      <Ionicons name={icon as any} size={13} color={colors.textMuted} />
      <Text style={styles.miniStatText}>{value}</Text>
    </View>
  );
}

function Loader({ label }: { label: string }) {
  return (
    <ScreenSkeleton variant="detail" />
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.centered} accessibilityRole="alert">
      <Ionicons name="cloud-offline-outline" size={22} color={colors.warning} />
      <Text style={styles.centeredText}>{message}</Text>
      {!!onRetry && (
        <TouchableOpacity style={styles.secondaryButton} onPress={onRetry} activeOpacity={0.85}>
          <Text style={styles.secondaryButtonText}>Réessayer</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function EmptyState({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <View style={styles.centered}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon as any} size={24} color={colors.textSecondary} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.centeredText}>{text}</Text>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },

  headerShell: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  roundSlot: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  roundButton: {
    width: 40,
    height: 40,
    padding: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  titleGroup: { flex: 1, minWidth: 0, paddingHorizontal: 10 },
  title: {
    color: colors.textPrimary,
    fontSize: 17,
    textAlign: 'center',
    fontFamily: fonts.heading,
  },
  subtitle: {
    color: colors.accent,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 1,
    fontFamily: fonts.regular,
  },

  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  tabActive: { backgroundColor: colors.accentMuted },
  tabLabel: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.regular },
  tabLabelActive: { color: colors.accent, fontFamily: fonts.bold },

  // Marge basse généreuse : la barre d'onglets de l'app est en position
  // absolue et recouvrirait sinon le dernier bloc.
  scrollContent: { padding: 16, paddingBottom: 120 },

  sectionTitle: { marginTop: 20, marginBottom: 10 },
  sectionTitleText: { color: colors.textPrimary, fontSize: 15, fontFamily: fonts.bold },
  sectionHint: { color: colors.textMuted, fontSize: 11.5, marginTop: 2, fontFamily: fonts.regular },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: {
    flexGrow: 1,
    flexBasis: '46%',
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  statValue: { color: colors.textPrimary, fontSize: 22, fontFamily: fonts.heading },
  statLabel: { color: colors.textSecondary, fontSize: 12, marginTop: 3, fontFamily: fonts.regular },
  statHint: { color: colors.textMuted, fontSize: 10.5, marginTop: 1, fontFamily: fonts.regular },

  card: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginTop: 10,
  },
  cardTitle: { color: colors.textPrimary, fontSize: 14, fontFamily: fonts.bold },
  cardBody: {
    color: colors.textSecondary,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 6,
    fontFamily: fonts.regular,
  },
  intervalNote: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 7,
    fontFamily: fonts.regular,
  },

  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  pill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
  pillGood: { backgroundColor: colors.successMuted },
  pillWeak: { backgroundColor: colors.redMuted },
  pillText: { fontSize: 11.5, fontFamily: fonts.bold },
  pillTextGood: { color: colors.success },
  pillTextWeak: { color: colors.red },

  factorRow: {
    padding: 13,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginTop: 8,
  },
  // Un facteur non appliqué reste lisible mais recule visuellement : il
  // informe, il ne pèse pas sur l'estimation affichée.
  factorRowMuted: { opacity: 0.55 },
  factorHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  factorLabel: { color: colors.textPrimary, fontSize: 13.5, flex: 1, fontFamily: fonts.bold },
  factorImpact: { fontSize: 13, marginLeft: 8, fontFamily: fonts.bold },
  impactGood: { color: colors.success },
  impactWeak: { color: colors.red },
  factorBarTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceElevated,
    marginTop: 8,
    overflow: 'hidden',
  },
  factorBarFill: { height: '100%', borderRadius: 2 },
  factorBarGood: { backgroundColor: colors.success },
  factorBarWeak: { backgroundColor: colors.red },
  factorExplain: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 7,
    fontFamily: fonts.regular,
  },
  factorSample: { color: colors.textMuted, fontSize: 10.5, marginTop: 4, fontFamily: fonts.regular },

  slotRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  slotRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  slotRank: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotRankText: { color: colors.accent, fontSize: 11, fontFamily: fonts.bold },
  slotHour: {
    color: colors.textPrimary,
    fontSize: 13,
    width: 42,
    marginLeft: 10,
    fontFamily: fonts.bold,
  },
  slotBarTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceElevated,
    overflow: 'hidden',
  },
  slotBarFill: { height: '100%', borderRadius: 3, backgroundColor: colors.accent },
  slotValue: {
    color: colors.textSecondary,
    fontSize: 12,
    width: 44,
    textAlign: 'right',
    fontFamily: fonts.regular,
  },

  tweetContent: {
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: fonts.regular,
  },
  tweetStats: { flexDirection: 'row', gap: 14, marginTop: 9 },
  miniStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  miniStatText: { color: colors.textMuted, fontSize: 11.5, fontFamily: fonts.regular },
  comparableMeta: { color: colors.textMuted, fontSize: 11, marginTop: 7, fontFamily: fonts.regular },

  composer: {
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  composerInput: {
    minHeight: 120,
    padding: 14,
    color: colors.textPrimary,
    fontSize: 14.5,
    lineHeight: 21,
    fontFamily: fonts.regular,
  },
  composerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  mediaToggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mediaToggleText: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.regular },
  mediaToggleTextOn: { color: colors.accent },
  charCount: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.regular },

  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.accent,
    marginTop: 12,
  },
  primaryButtonText: { color: colors.onAccent, fontSize: 14, fontFamily: fonts.bold },
  buttonDisabled: { opacity: 0.45 },

  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.accentSoft,
    marginTop: 12,
  },
  secondaryButtonText: { color: colors.accent, fontSize: 13, fontFamily: fonts.bold },

  scoreCard: {
    alignItems: 'center',
    padding: 20,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginTop: 16,
  },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline' },
  scoreValue: { color: colors.textPrimary, fontSize: 44, fontFamily: fonts.heading },
  scoreGood: { color: colors.success },
  scoreWeak: { color: colors.warning },
  scoreMax: { color: colors.textMuted, fontSize: 16, marginLeft: 2, fontFamily: fonts.regular },
  scoreLabel: { color: colors.textPrimary, fontSize: 14, marginTop: 4, fontFamily: fonts.bold },
  scoreHint: { color: colors.textMuted, fontSize: 11.5, marginTop: 3, fontFamily: fonts.regular },

  rangeRow: { flexDirection: 'row', marginTop: 12 },
  rangeCell: { flex: 1, alignItems: 'center' },
  rangeValue: { color: colors.textSecondary, fontSize: 20, fontFamily: fonts.heading },
  rangeValueEmphasis: { color: colors.accent, fontSize: 26 },
  rangeLabel: { color: colors.textMuted, fontSize: 11, marginTop: 2, fontFamily: fonts.regular },

  metricRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  metricLabel: { flex: 1, color: colors.textSecondary, fontSize: 12.5, fontFamily: fonts.regular },
  metricValue: { color: colors.textPrimary, fontSize: 13, textAlign: 'right', fontFamily: fonts.bold },

  forecastRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  forecastTime: { width: 50 },
  forecastDay: { color: colors.textMuted, fontSize: 10.5, fontFamily: fonts.regular },
  forecastHour: { color: colors.textPrimary, fontSize: 14, marginTop: 1, fontFamily: fonts.bold },
  forecastValues: { flex: 1, minWidth: 0, paddingHorizontal: 8 },
  forecastPrimary: { color: colors.textPrimary, fontSize: 12.5, fontFamily: fonts.bold },
  forecastSecondary: { color: colors.textMuted, fontSize: 10.5, marginTop: 3, fontFamily: fonts.regular },
  forecastUplift: { width: 48, textAlign: 'right', fontSize: 11.5, fontFamily: fonts.bold },

  modelWeights: { color: colors.textMuted, fontSize: 10.5, lineHeight: 16, marginTop: 10, fontFamily: fonts.regular },
  modelCaveats: {
    color: colors.warning,
    fontSize: 10.5,
    lineHeight: 16,
    marginTop: 9,
    paddingTop: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    fontFamily: fonts.regular,
  },

  adviceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginTop: 8,
  },
  adviceIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adviceText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 12.5,
    lineHeight: 18,
    paddingTop: 4,
    fontFamily: fonts.regular,
  },

  topicTerm: { color: colors.textPrimary, fontSize: 15, flex: 1, fontFamily: fonts.bold },
  topicMeta: { color: colors.textMuted, fontSize: 11.5, marginTop: 5, fontFamily: fonts.regular },
  ideaBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.bgElevated,
    borderLeftWidth: 2,
    borderLeftColor: colors.accent,
  },
  ideaText: {
    color: colors.textPrimary,
    fontSize: 13.5,
    lineHeight: 20,
    fontFamily: fonts.regular,
  },
  ideaAngle: { color: colors.textMuted, fontSize: 11.5, marginTop: 7, fontFamily: fonts.regular },
  ideaError: { color: colors.warning, fontSize: 12, marginTop: 10, fontFamily: fonts.regular },

  centered: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 8 },
  centeredText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 10,
    fontFamily: fonts.regular,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    marginTop: 12,
    fontFamily: fonts.bold,
  },

  footnote: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 22,
    fontFamily: fonts.regular,
  },

  lockedWrap: { alignItems: 'center', paddingHorizontal: 28, paddingTop: 70 },
  lockedIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    marginTop: 16,
    fontFamily: fonts.heading,
  },
  lockedText: {
    color: colors.textSecondary,
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 10,
    fontFamily: fonts.regular,
  },
  lockedCta: {
    height: 46,
    paddingHorizontal: 26,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
  },
  lockedCtaText: { color: colors.onAccent, fontSize: 14, fontFamily: fonts.bold },
});
