import { apiService } from './api';

/**
 * Analytics prédictifs, co-pilote IA et radar de tendances — avantages Pro —
 * ainsi que le générateur à crédits commun aux abonnés Plus et Pro.
 *
 * Miroir de `api/src/routes/creatorIntelligenceRoutes.js`. Le serveur revalide
 * le palier ET l'expiration à chaque appel : masquer les entrées côté app est
 * du confort d'interface, jamais la sécurité.
 *
 * Les appels au co-pilote passent par Codex, qui lance un processus par requête
 * côté serveur : il faut compter une dizaine de secondes, d'où le délai
 * d'attente allongé plus bas. Le délai par défaut de l'app couperait avant la
 * réponse et ferait passer une génération réussie pour une panne.
 */

const BASE = '/api/creator-intelligence';
/** Codex met de longues secondes à répondre ; on lui laisse la marge. */
const COPILOT_TIMEOUT_MS = 60000;

// ── Types ──────────────────────────────────────────────────────────────────

export type Confidence = 'low' | 'medium' | 'high';

export interface PredictionFactor {
  key: string;
  label: string;
  explain: string;
  applies: boolean;
  direction: 'positive' | 'negative' | 'neutral';
  multiplier: number;
  impactPercent: number;
  sample: { with: number; without: number };
  confidence: number;
}

export interface PredictionRange {
  low: number;
  expected: number;
  high: number;
  interval95?: { low: number; high: number };
}

export interface TweetFeatures {
  length: number;
  words: number;
  hashtagCount: number;
  mentionCount: number;
  mediaCount: number;
  hasMedia: boolean;
  hasQuestion: boolean;
  hasEmoji: boolean;
  hasLink: boolean;
  hasLineBreaks: boolean;
  isUppercaseHeavy: boolean;
  hour: number;
  dayOfWeek: number;
  uniqueWords?: number;
  lexicalDiversity?: number;
  averageWordLength?: number;
  sentenceCount?: number;
  averageSentenceLength?: number;
  readabilityScore?: number;
  urlCount?: number;
  emojiCount?: number;
  questionCount?: number;
  exclamationCount?: number;
  lineBreakCount?: number;
  punctuationDensity?: number;
  uppercaseRatio?: number;
  digitRatio?: number;
  repeatedPunctuationCount?: number;
  repeatedCharacterRuns?: number;
  callToActionCount?: number;
  firstPersonCount?: number;
  secondPersonCount?: number;
  sentimentScore?: number;
  emotionalIntensity?: number;
  hookStrength?: number;
  startsWithQuestion?: boolean;
  startsWithNumber?: boolean;
  isWeekend?: boolean;
  hoursSinceLastPost?: number;
}

export interface ComparableTweet {
  id: string;
  content: string;
  similarity: number;
  engagement: number;
  views: number;
  createdAt: string;
  lexicalSimilarity?: number;
  adjustedEngagement?: number;
}

export interface PredictedComponent extends PredictionRange {
  sharePercent: number;
}

export interface PredictionDriver {
  label: string;
  impactPercent: number;
  direction: 'positive' | 'negative';
  strength: number;
}

export interface TimingForecast {
  publishAt: string;
  hour: number;
  dayOfWeek: number;
  expectedEngagement: number;
  expectedViews: number;
  upliftPercent: number;
  audienceActivityIndex: number;
}

export interface PredictionResult {
  hasEnoughData: boolean;
  sampleSize: number;
  minimumRequired?: number;
  message?: string;
  confidence?: Confidence;
  confidenceScore?: number;
  confidenceDetails?: {
    numeric: number;
    label: Confidence;
    components: {
      sample: number;
      maturity: number;
      viewCoverage: number;
      backtest: number;
      modelAgreement: number;
    };
    caveats: string[];
  };
  score?: number;
  modelVersion?: string;
  method?: string;
  features: TweetFeatures;
  prediction?: {
    engagement: PredictionRange;
    views: PredictionRange;
    multiplier: number;
    components?: {
      likes: PredictedComponent;
      retweets: PredictedComponent;
      replies: PredictedComponent;
    };
    clicks?: {
      expected: number;
      clickThroughRatePercent: number | null;
    };
    engagementRatePercent?: number | null;
    reachVsFollowersPercent?: number | null;
  };
  baseline?: {
    medianEngagement: number;
    medianViews: number;
    bestEverEngagement: number;
    averageEngagement: number;
    p90Engagement?: number;
    medianEngagementRatePercent?: number;
  };
  factors?: PredictionFactor[];
  bestHours?: { hour: number; avgEngagement: number; tweets: number }[];
  advice?: { icon: string; text: string; gain: number | null }[];
  comparables?: ComparableTweet[];
  probabilities?: {
    aboveUsualPercent: number;
    top10Percent: number;
    belowUsualPercent: number;
  };
  drivers?: PredictionDriver[];
  timingForecast?: TimingForecast[];
  audienceSignal?: {
    activityIndex: number;
    confidencePercent: number;
    interactionsAnalyzed: number;
  };
  model?: {
    featuresConsidered: number;
    ensembleWeights: { baseline: number; ridge: number; neighbors: number };
    backtest: {
      holdoutSize: number;
      meanAbsoluteError: number | null;
      logRmse: Record<string, number | null>;
    };
    dataQuality: {
      rawSampleSize: number;
      matureSampleSize: number;
      effectiveSampleSize: number;
      viewCoveragePercent: number;
      behaviorCoveragePercent: number;
      completenessPercent: number;
      zeroEngagementPercent: number;
      outlierPercent: number;
      medianTweetAgeHours: number;
    };
    recencyHalfLifeDays: number;
    maturityModelHours: number;
  };
  generatedAt: string;
}

export interface CreatorProfile {
  hasEnoughData: boolean;
  sampleSize: number;
  minimumRequired?: number;
  historyDays?: number;
  confidence?: Confidence;
  baseline?: {
    medianEngagement: number;
    averageEngagement: number;
    medianViews: number;
    bestEverEngagement: number;
    p90Engagement: number;
  };
  trend?: {
    comparable: boolean;
    recentMedian?: number;
    previousMedian?: number;
    changePercent?: number;
  };
  factors?: PredictionFactor[];
  bestHours?: { hour: number; avgEngagement: number; tweets: number }[];
  topTweets?: {
    id: string;
    content: string;
    engagement: number;
    views: number;
    likes: number;
    retweets: number;
    replies: number;
    createdAt: string;
    hasMedia: boolean;
    length: number;
  }[];
  generatedAt: string;
}

export interface RadarTopic {
  term: string;
  mentions: number;
  authors: number;
  acceleration: number;
  affinity: number;
}

export interface RadarResult {
  hasProfile: boolean;
  profileSampleSize?: number;
  topics: RadarTopic[];
  windowHours?: number;
  message?: string;
  generatedAt: string;
}

export interface CopilotSuggestion {
  text: string;
  why: string;
}

export interface CopilotReview {
  tone: string | null;
  clarity: number | null;
  hook: number | null;
  strengths: string[];
  improvements: string[];
  hashtags: string[];
}

export interface CopilotMode {
  key: string;
  label: string;
}

export interface TweetGeneratorStatus {
  credits: number;
  creditsPerSubscription: number;
  costPerGeneration: number;
  available: boolean;
}

export interface GeneratedCustomTweet {
  success: true;
  tweet: string;
  angle: string;
  creditsRemaining: number;
  styleSamples: number;
}

/** Réponse uniforme : jamais d'exception jetée vers les écrans. */
export interface Outcome<T> {
  ok: boolean;
  data?: T;
  message?: string;
  code?: string;
}

// ── Appels ─────────────────────────────────────────────────────────────────

function fail<T>(response: any, fallback: string): Outcome<T> {
  return {
    ok: false,
    message: response?.message || fallback,
    code: response?.code,
  };
}

export async function fetchCreatorProfile(days = 120): Promise<Outcome<CreatorProfile>> {
  try {
    const res = await apiService.get(`${BASE}/profile`, { days: String(days) });
    if (!res?.success) return fail(res, 'Profil créateur indisponible.');
    return { ok: true, data: res.data as CreatorProfile };
  } catch {
    return { ok: false, message: 'Profil créateur indisponible.' };
  }
}

export async function predictTweet(params: {
  content: string;
  mediaCount?: number;
  publishAt?: Date | string | null;
}): Promise<Outcome<PredictionResult>> {
  try {
    const res = await apiService.post(`${BASE}/predict`, {
      content: params.content,
      mediaCount: params.mediaCount ?? 0,
      publishAt: params.publishAt
        ? new Date(params.publishAt).toISOString()
        : undefined,
    });
    if (!res?.success) return fail(res, 'Analyse impossible.');
    return { ok: true, data: res.data as PredictionResult };
  } catch {
    return { ok: false, message: 'Analyse impossible.' };
  }
}

export async function fetchRadar(): Promise<Outcome<RadarResult>> {
  try {
    const res = await apiService.get(`${BASE}/radar`);
    if (!res?.success) return fail(res, 'Radar indisponible.');
    return { ok: true, data: res.data as RadarResult };
  } catch {
    return { ok: false, message: 'Radar indisponible.' };
  }
}

export async function generateRadarIdea(
  term: string,
): Promise<Outcome<{ topic: string; idea: string; angle: string }>> {
  try {
    const res = await apiService.post(`${BASE}/radar/idea`, { term }, true, COPILOT_TIMEOUT_MS);
    if (!res?.success) return fail(res, 'Aucune idée générée.');
    return { ok: true, data: res.data };
  } catch {
    return { ok: false, message: 'Aucune idée générée.' };
  }
}

export async function fetchTweetGeneratorStatus(): Promise<Outcome<TweetGeneratorStatus>> {
  try {
    const res = await apiService.get(`${BASE}/generator`);
    if (!res?.success) return fail(res, 'Crédits du générateur indisponibles.');
    return { ok: true, data: res.data as TweetGeneratorStatus };
  } catch {
    return { ok: false, message: 'Crédits du générateur indisponibles.' };
  }
}

export async function generateCustomTweet(
  request: string,
): Promise<Outcome<GeneratedCustomTweet | { creditsRemaining: number }>> {
  try {
    const res = await apiService.post(
      `${BASE}/generator`,
      { request },
      true,
      COPILOT_TIMEOUT_MS,
    );
    if (!res?.success) {
      return {
        ...fail(res, 'Aucun tweet généré.'),
        data: res?.data,
      };
    }
    return { ok: true, data: res.data as GeneratedCustomTweet };
  } catch {
    return { ok: false, message: 'Le générateur est indisponible.' };
  }
}

export async function fetchCopilotModes(): Promise<
  Outcome<{ available: boolean; modes: CopilotMode[]; expectedLatencySeconds: number }>
> {
  try {
    const res = await apiService.get(`${BASE}/copilot/modes`);
    if (!res?.success) return fail(res, 'Co-pilote indisponible.');
    return { ok: true, data: res.data };
  } catch {
    return { ok: false, message: 'Co-pilote indisponible.' };
  }
}

export async function copilotSuggest(
  content: string,
  mode: string,
): Promise<Outcome<{ mode: string; modeLabel: string; suggestions: CopilotSuggestion[] }>> {
  try {
    const res = await apiService.post(
      `${BASE}/copilot/suggest`,
      { content, mode },
      true,
      COPILOT_TIMEOUT_MS,
    );
    if (!res?.success) return fail(res, 'Le co-pilote n\'a rien proposé.');
    return { ok: true, data: res.data };
  } catch {
    return { ok: false, message: 'Le co-pilote n\'a rien proposé.' };
  }
}

export async function copilotReview(
  content: string,
): Promise<Outcome<{ review: CopilotReview }>> {
  try {
    const res = await apiService.post(
      `${BASE}/copilot/review`,
      { content },
      true,
      COPILOT_TIMEOUT_MS,
    );
    if (!res?.success) return fail(res, 'Relecture impossible.');
    return { ok: true, data: res.data };
  } catch {
    return { ok: false, message: 'Relecture impossible.' };
  }
}

// ── Mise en forme partagée ─────────────────────────────────────────────────

/** « 14h » plutôt que « 14:00 » — c'est ainsi qu'on parle d'un créneau. */
export function formatHour(hour: number): string {
  return `${hour}h`;
}

export function formatImpact(percent: number): string {
  return `${percent > 0 ? '+' : ''}${percent} %`;
}

/**
 * Étiquette d'un score de prédiction.
 * Le score est un PERCENTILE dans l'historique de l'auteur : 50 veut dire
 * « dans ta moyenne », pas « moyen dans l'absolu ».
 */
export function scoreLabel(score: number): { label: string; tone: 'good' | 'ok' | 'weak' } {
  if (score >= 75) return { label: 'Au-dessus de tes habitudes', tone: 'good' };
  if (score >= 40) return { label: 'Dans ta moyenne', tone: 'ok' };
  return { label: 'En dessous de tes habitudes', tone: 'weak' };
}

export function confidenceLabel(confidence?: Confidence): string {
  switch (confidence) {
    case 'high': return 'Estimation fiable';
    case 'medium': return 'Estimation indicative';
    default: return 'Estimation fragile';
  }
}
