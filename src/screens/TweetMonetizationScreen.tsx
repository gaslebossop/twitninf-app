/**
 * Monétisation créateur — pot hebdomadaire en NF.
 *
 * Écran refait entièrement le 2026-08-20. Ce qu'il remplace et pourquoi :
 *
 * - L'ancienne page affichait un montant RECALCULÉ à chaque ouverture, puis en
 *   versait un autre au moment du clic. Ici, le chiffre du bandeau vient d'une
 *   part FIGÉE à la clôture du lundi : ce qui est affiché est ce qui est versé,
 *   et encaisser ne déclenche aucun calcul.
 * - Elle listait `tweet.views` / `tweet.likes` là où l'API renvoyait ces
 *   champs sous `stats` — chaque ligne affichait donc `undefined`. Toutes les
 *   valeurs de cet écran sont désormais typées (`creatorPoolService.ts`) et
 *   passées par `num()`, qui ne laisse jamais sortir autre chose qu'un nombre.
 * - Elle parlait de « TWC ». Le symbole réellement en base est **NF** ; il est
 *   maintenant lu depuis la réponse plutôt qu'écrit en dur.
 *
 * Le principe de lecture de l'écran : on descend du RÉSULTAT vers sa CAUSE.
 * Combien j'ai → combien la semaine en cours rapporte → pourquoi (les quatre
 * signaux, avec mon rang) → ce qui peut l'augmenter → d'où vient l'argent.
 * Quelqu'un qui s'arrête à la première carte a déjà l'essentiel ; quelqu'un
 * qui descend comprend comment le faire monter.
 */

import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  StatusBar,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useAuth } from '../contexts/AuthContext';
import CreatorPoolService, {
  CreatorPoolDashboard,
  PeriodProjection,
} from '../services/creatorPoolService';
import MonetizationProgramService, {
  MonetizationProgramEligibility,
} from '../services/monetizationProgramService';
import { colors, fonts, withAlpha, radius, statusBarStyle } from '../theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import {
  AppHeader,
  ScreenBackground,
  GlassCard,
  GlassButton,
  SectionLabel,
  EmptyState,
  Skeleton,
  celebrateReward,
} from '../components/ui';
import { toast } from '../components/ui/Toast';

if (Platform.OS === 'android' && (UIManager as any).setLayoutAnimationEnabledExperimental) {
  (UIManager as any).setLayoutAnimationEnabledExperimental(true);
}

/** Bref, sans rebond — un dépliage répond à un tap, pas à un montage. */
const expand = () =>
  LayoutAnimation.configureNext(
    LayoutAnimation.create(180, LayoutAnimation.Types.easeOut, LayoutAnimation.Properties.opacity)
  );

/* ------------------------------------------------------------------ */
/* Formatage                                                           */
/* ------------------------------------------------------------------ */

/**
 * Garde-fou unique de l'écran.
 *
 * Toute valeur numérique venue du réseau passe par ici. C'est la réponse
 * directe au défaut de l'ancienne page : un champ renommé côté serveur y
 * devenait `undefined`, puis s'affichait tel quel au milieu d'une phrase. Ici
 * il devient `0`, et un zéro se voit tout de suite comme une anomalie.
 */
function num(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function money(value: unknown, decimals = 2): string {
  return num(value).toLocaleString('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function compact(value: unknown): string {
  const n = Math.round(num(value));
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '')} M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace('.0', '')} k`;
  return n.toLocaleString('fr-FR');
}

function percent(value: unknown): string {
  return `${Math.round(num(value) * 100)} %`;
}

/** « 3 j 04 h » — assez précis pour situer la clôture, sans faux compte à rebours. */
function timeUntil(iso: string | undefined): string {
  if (!iso) return '—';
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 'imminente';
  const hours = Math.floor(ms / 3_600_000);
  const days = Math.floor(hours / 24);
  if (days >= 1) return `${days} j ${String(hours % 24).padStart(2, '0')} h`;
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return `${hours} h ${String(minutes).padStart(2, '0')} min`;
}

function periodLabel(startIso?: string, endIso?: string): string {
  if (!startIso) return '';
  const start = new Date(startIso);
  const end = endIso ? new Date(new Date(endIso).getTime() - 1) : null;
  const fmt = (d: Date) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return end ? `${fmt(start)} — ${fmt(end)}` : fmt(start);
}

/* ------------------------------------------------------------------ */
/* Briques d'affichage                                                 */
/* ------------------------------------------------------------------ */

function Stat({
  icon,
  label,
  value,
  hint,
  tone = 'default',
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'accent';
}) {
  return (
    <View style={styles.stat}>
      <Ionicons
        name={icon}
        size={16}
        color={tone === 'accent' ? colors.accent : colors.textSecondary}
      />
      <Text style={[styles.statValue, tone === 'accent' && styles.statValueAccent]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {!!hint && <Text style={styles.statHint}>{hint}</Text>}
    </View>
  );
}

/**
 * Une composante de qualité, avec le rang dans le vivier.
 *
 * La barre montre le RANG (0 = dernier, 100 % = premier), pas la valeur brute :
 * « 42 ms de lecture moyenne » ne dit rien à personne, « mieux que 78 % des
 * créateurs cette semaine » dit tout. La valeur brute reste en légende pour qui
 * veut vérifier.
 */
function QualityBar({
  label,
  percentile,
  weight,
  raw,
  negative = false,
}: {
  label: string;
  percentile: number;
  weight: number;
  raw: string;
  negative?: boolean;
}) {
  const pct = Math.max(0, Math.min(1, num(percentile)));
  const tint = negative ? colors.warning : colors.accent;

  return (
    <View style={styles.quality}>
      <View style={styles.qualityHead}>
        <Text style={styles.qualityLabel}>{label}</Text>
        <Text style={styles.qualityWeight}>
          {negative ? '−' : ''}
          {Math.round(num(weight) * 100)} %
        </Text>
      </View>
      <View style={styles.qualityTrack}>
        <View
          style={[
            styles.qualityFill,
            { width: `${Math.max(2, pct * 100)}%`, backgroundColor: tint },
          ]}
        />
      </View>
      <View style={styles.qualityFoot}>
        <Text style={styles.qualityRank}>
          {negative
            ? `Plus signalé que ${Math.round(pct * 100)} % du vivier`
            : `Devant ${Math.round(pct * 100)} % du vivier`}
        </Text>
        <Text style={styles.qualityRaw}>{raw}</Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Écran                                                               */
/* ------------------------------------------------------------------ */

interface Props {
  navigation: any;
}

export default function TweetMonetizationScreen({ navigation }: Props) {
  const { user, isAuthenticated } = useAuth();
  const { width } = useResponsiveLayout();
  const isWide = width >= 700;
  // La barre d'onglets est posée en absolu au-dessus du contenu. Le contexte
  // vaut `undefined` quand l'écran est poussé sur la pile plutôt qu'affiché
  // comme onglet — d'où le repli, plutôt que `useBottomTabBarHeight` qui lève.
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;

  const [data, setData] = useState<CreatorPoolDashboard | null>(null);
  const [program, setProgram] = useState<MonetizationProgramEligibility | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [openPeriod, setOpenPeriod] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAuthenticated || !user) return;
    try {
      setError(null);
      // Les deux ensemble : la page doit pouvoir dire « tu n'es pas encore
      // dans le programme » ET montrer les vrais chiffres derrière.
      const [dashboard, eligibility] = await Promise.all([
        CreatorPoolService.getDashboard(),
        MonetizationProgramService.getStatus().catch(() => null),
      ]);
      setData(dashboard);
      setProgram(eligibility);
    } catch (e: any) {
      setError(e?.message || 'Impossible de charger tes gains');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const symbol = data?.currency?.symbol || 'NF';
  const claimableTotal = num(data?.claimable?.total);
  const claimableCount = num(data?.claimable?.count);
  const projection: PeriodProjection | null = data?.currentPeriod?.projection || null;

  const handleClaim = useCallback(async () => {
    if (claiming || claimableTotal <= 0) return;
    setClaiming(true);
    try {
      const result = await CreatorPoolService.claim();
      const total = num(result?.total);
      // La célébration porte le montant RÉELLEMENT versé par le serveur, pas
      // celui qu'affichait l'écran : si les deux divergeaient un jour, c'est
      // le versement qui fait foi.
      celebrateReward({
        amount: total,
        unit: symbol,
        label: claimableCount > 1 ? `${claimableCount} semaines encaissées` : 'Part créateur',
      });
      await load();
    } catch (e: any) {
      toast.error('Encaissement impossible', { description: e?.message });
    } finally {
      setClaiming(false);
    }
  }, [claiming, claimableTotal, claimableCount, symbol, load]);

  const contentWidth = useMemo(
    () => [
      isWide ? { maxWidth: 680, alignSelf: 'center' as const, width: '100%' as const } : null,
      { paddingBottom: 32 + tabBarHeight },
    ],
    [isWide, tabBarHeight]
  );

  /* --- États bloquants ------------------------------------------------ */

  if (!isAuthenticated || !user) {
    return (
      <ScreenBackground>
        <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
        <AppHeader navigation={navigation} title="Monétisation" />
        <View style={[styles.content, contentWidth]}>
          <EmptyState
            icon="lock-closed-outline"
            title="Connexion requise"
            message={`Connecte-toi pour suivre tes gains en ${symbol} et encaisser tes parts.`}
          />
        </View>
      </ScreenBackground>
    );
  }

  if (loading && !data) {
    return (
      <ScreenBackground>
        <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
        <AppHeader navigation={navigation} title="Monétisation" />
        <View style={[styles.content, contentWidth]}>
          <Skeleton height={148} style={styles.skeleton} />
          <Skeleton height={104} style={styles.skeleton} />
          <Skeleton height={220} style={styles.skeleton} />
        </View>
      </ScreenBackground>
    );
  }

  const eligible = !!projection?.eligible;
  const lockedReason = projection?.lockedReason || null;
  const pool = data?.currentPeriod?.pool;
  const weights = data?.weights;
  const earnedBonuses = projection?.bonuses?.earned || [];
  const earnedKeys = new Set(earnedBonuses.map((b) => b.key));

  return (
    <ScreenBackground>
      <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
      <AppHeader
        navigation={navigation}
        title="Monétisation"
        subtitle={`Ta part du pot hebdomadaire en ${symbol}`}
        right={
          <GlassButton
            label="Mon compte"
            variant="ghost"
            icon="shield-checkmark-outline"
            onPress={() => navigation?.navigate?.('AccountStatus')}
          />
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, contentWidth]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
      >
        {!!error && (
          <View style={styles.errorBanner}>
            <Ionicons name="warning-outline" size={18} color={colors.warning} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* --- 1. Ce qu'il y a à encaisser --------------------------------- */}
        <GlassCard style={styles.hero} highlight contentStyle={styles.heroContent}>
          <View style={styles.heroTop}>
            <View style={styles.heroBadge}>
              <Ionicons name="wallet-outline" size={18} color={colors.accent} />
            </View>
            <Text style={styles.heroKicker}>
              {claimableTotal > 0 ? 'Prêt à encaisser' : 'Rien à encaisser'}
            </Text>
          </View>

          <View style={styles.heroAmountRow}>
            <Text style={styles.heroAmount}>{money(claimableTotal)}</Text>
            <Text style={styles.heroUnit}>{symbol}</Text>
          </View>

          <Text style={styles.heroHint}>
            {claimableTotal > 0
              ? claimableCount > 1
                ? `${claimableCount} semaines closes t'attendent. Le montant est figé : il ne bougera plus.`
                : 'Montant figé à la clôture de lundi. Il ne bougera plus.'
              : `La semaine en cours se clôture dans ${timeUntil(data?.currentPeriod?.end)}. Ta part sera figée à ce moment-là.`}
          </Text>

          {claimableTotal > 0 ? (
            <GlassButton
              label={claiming ? 'Encaissement…' : `Encaisser ${money(claimableTotal)} ${symbol}`}
              icon="arrow-down-circle-outline"
              onPress={handleClaim}
              disabled={claiming}
              loading={claiming}
              fullWidth
              style={styles.heroButton}
            />
          ) : null}

          {!!data?.claimable?.periods?.length && claimableCount > 1 && (
            <View style={styles.heroPeriods}>
              {data.claimable.periods.map((p) => (
                <View key={p.periodKey} style={styles.heroPeriodRow}>
                  <Text style={styles.heroPeriodLabel}>
                    {periodLabel(p.periodStart, p.periodEnd)}
                  </Text>
                  <Text style={styles.heroPeriodValue}>
                    {money(p.amount)} {symbol}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </GlassCard>

        {/* --- 2. La semaine en cours -------------------------------------- */}
        <SectionLabel>Cette semaine</SectionLabel>
        <GlassCard contentStyle={styles.cardBody}>
          <View style={styles.periodHead}>
            <Text style={styles.periodRange}>
              {periodLabel(data?.currentPeriod?.start, data?.currentPeriod?.end)}
            </Text>
            <View style={styles.countdown}>
              <Ionicons name="time-outline" size={13} color={colors.textSecondary} />
              <Text style={styles.countdownText}>{timeUntil(data?.currentPeriod?.end)}</Text>
            </View>
          </View>

          {projection ? (
            <>
              <View style={styles.statRow}>
                <Stat
                  icon="trending-up-outline"
                  label="Part projetée"
                  value={`${money(projection.amount)} ${symbol}`}
                  tone="accent"
                />
                <Stat
                  icon="speedometer-outline"
                  label="RPM"
                  value={money(projection.rpm)}
                  hint={`${symbol} / 1000 vues`}
                />
              </View>
              <View style={styles.statRow}>
                <Stat
                  icon="eye-outline"
                  label="Vues qualifiées"
                  value={compact(projection.qualifiedViews)}
                  hint={`${compact(projection.rawViews)} brutes`}
                />
                <Stat
                  icon="people-outline"
                  label="Spectateurs"
                  value={compact(projection.distinctViewers)}
                  hint="comptes distincts"
                />
              </View>

              <Text style={styles.note}>
                Une projection, pas une promesse : elle bouge tant que la semaine n’est pas
                close, parce que ta part dépend aussi de ce que font les {compact(data?.currentPeriod?.cohortSize)} autres
                créateurs de la semaine.
              </Text>

              {!projection.hasRealDwell && (
                <View style={styles.warnRow}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.warning} />
                  <Text style={styles.warnText}>
                    Aucun temps de lecture réel n’a été mesuré sur ton contenu cette semaine.
                    L’attention est estimée, donc décotée de {percent(1 - num(projection.attentionFactor, 1))}.
                  </Text>
                </View>
              )}
            </>
          ) : (
            <Text style={styles.note}>
              Personne n’a encore vu tes publications cette semaine. Dès la première vue, ta
              projection apparaît ici.
            </Text>
          )}
        </GlassCard>

        {/* --- 3. Pourquoi ce montant -------------------------------------- */}
        {projection && weights && (
          <>
            <SectionLabel>Ta qualité</SectionLabel>
            <GlassCard contentStyle={styles.cardBody}>
              <View style={styles.qualityHeader}>
                <Text style={styles.qualityScore}>{percent(projection.quality)}</Text>
                <Text style={styles.qualityScoreLabel}>
                  score de qualité{'\n'}
                  <Text style={styles.qualityScoreHint}>
                    multiplie tes vues pour donner ton poids dans le partage
                  </Text>
                </Text>
              </View>

              <QualityBar
                label="Attention"
                percentile={projection.percentiles.attention}
                weight={weights.attention}
                raw={`${Math.round(num(projection.rates.attention) / 1000)} s / vue`}
              />
              <QualityBar
                label="Rétention"
                percentile={projection.percentiles.retention}
                weight={weights.retention}
                raw={`${compact(projection.raw.followsGained)} abonnés · ${compact(projection.raw.returningViewers)} revenus`}
              />
              <QualityBar
                label="DAU gagnée"
                percentile={projection.percentiles.dau}
                weight={weights.dau}
                raw={`${compact(projection.raw.dauGained)} réactivations`}
              />
              <QualityBar
                label="Signaux négatifs"
                percentile={projection.percentiles.penalty}
                weight={weights.penalty}
                raw={`${compact(projection.raw.negatives)} au total`}
                negative
              />

              <GlassButton
                label={showDetail ? 'Masquer le détail' : 'Comment ça se calcule'}
                variant="ghost"
                icon={showDetail ? 'chevron-up' : 'chevron-down'}
                onPress={() => {
                  expand();
                  setShowDetail((v) => !v);
                }}
                fullWidth
                style={styles.detailToggle}
              />

              {showDetail && (
                <View style={styles.detail}>
                  <Text style={styles.detailLine}>
                    <Text style={styles.detailStrong}>Attention</Text> — le temps réellement passé
                    sur tes publications, rapporté à leurs vues. C’est le seul signal qu’on ne
                    peut pas fabriquer, donc celui qui pèse le plus.
                  </Text>
                  <Text style={styles.detailLine}>
                    <Text style={styles.detailStrong}>Rétention</Text> — les abonnés gagnés et les
                    gens qui reviennent te lire un autre jour.
                  </Text>
                  <Text style={styles.detailLine}>
                    <Text style={styles.detailStrong}>DAU gagnée</Text> — les comptes qui n’étaient
                    pas actifs la veille et dont ta publication a ouvert la journée. Tu les as
                    ramenés.
                  </Text>
                  <Text style={styles.detailLine}>
                    <Text style={styles.detailStrong}>Signaux négatifs</Text> — les « pas
                    intéressé », les signalements, les publications retirées. Ils se retranchent.
                  </Text>
                  <Text style={styles.detailLine}>
                    Chaque signal est un <Text style={styles.detailStrong}>rang</Text>, pas un
                    volume : un petit compte très suivi passe devant un gros compte tiède. Les
                    interactions venues de comptes créés en rafale comptent pour zéro.
                  </Text>
                </View>
              )}
            </GlassCard>
          </>
        )}

        {/* --- 4. Récompenses supplémentaires ------------------------------ */}
        {!!data?.bonusCatalog?.length && (
          <>
            <SectionLabel>Récompenses</SectionLabel>
            <GlassCard contentStyle={styles.cardBody}>
              {data.bonusCatalog
                .filter((b) => b.enabled)
                .map((bonus) => {
                  const won = earnedKeys.has(bonus.key);
                  return (
                    <View
                      key={bonus.key}
                      style={[styles.bonus, won && styles.bonusWon]}
                    >
                      <View style={[styles.bonusIcon, won && styles.bonusIconWon]}>
                        <Ionicons
                          name={won ? 'sparkles' : 'sparkles-outline'}
                          size={16}
                          color={won ? colors.accent : colors.textSecondary}
                        />
                      </View>
                      <View style={styles.bonusBody}>
                        <View style={styles.bonusTitleRow}>
                          <Text style={[styles.bonusTitle, won && styles.bonusTitleWon]}>
                            {bonus.label}
                          </Text>
                          <Text style={[styles.bonusMult, won && styles.bonusMultWon]}>
                            +{Math.round((num(bonus.multiplier, 1) - 1) * 100)} %
                          </Text>
                        </View>
                        <Text style={styles.bonusDesc}>{bonus.description}</Text>
                      </View>
                    </View>
                  );
                })}
              <Text style={styles.note}>
                Une récompense multiplie ton poids dans le partage — elle ne puise pas dans le pot,
                elle déplace une part vers toi.
              </Text>
            </GlassCard>
          </>
        )}

        {/* --- 5. D'où vient l'argent -------------------------------------- */}
        {pool && (
          <>
            <SectionLabel>Le pot de la semaine</SectionLabel>
            <GlassCard contentStyle={styles.cardBody}>
              <View style={styles.poolRow}>
                <Text style={styles.poolLabel}>Entré en trésorerie</Text>
                <Text style={styles.poolValue}>
                  {money(pool.inflows)} {symbol}
                </Text>
              </View>
              <View style={styles.poolRow}>
                <Text style={styles.poolLabel}>
                  Reversé aux créateurs ({percent(pool.shareOfInflows)})
                </Text>
                <Text style={[styles.poolValue, styles.poolValueAccent]}>
                  {money(pool.pool)} {symbol}
                </Text>
              </View>
              <View style={styles.poolRow}>
                <Text style={styles.poolLabel}>Créateurs qui se le partagent</Text>
                <Text style={styles.poolValue}>{compact(data?.currentPeriod?.cohortSize)}</Text>
              </View>
              <Text style={styles.note}>
                Le pot vaut une part de ce que la plateforme a réellement encaissé cette semaine —
                campagnes publicitaires, abonnements Plus et Pro, commissions. Il ne peut jamais
                dépasser ce qui est entré, donc la monétisation ne peut pas coûter plus qu’elle ne
                rapporte.
              </Text>
              {pool.cappedByTreasury && (
                <View style={styles.warnRow}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.warning} />
                  <Text style={styles.warnText}>
                    Le pot est plafonné cette semaine pour préserver la trésorerie.
                  </Text>
                </View>
              )}
            </GlassCard>
          </>
        )}

        {/* --- 6. Verrou d'éligibilité ------------------------------------- */}
        {!eligible && (
          <GlassCard contentStyle={styles.cardBody}>
            <View style={styles.lockHead}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.warning} />
              <Text style={styles.lockTitle}>Pas encore payé</Text>
            </View>
            <Text style={styles.lockReason}>
              {program?.programStatus === 'pending'
                ? 'Ta candidature au programme est en cours de revue.'
                : lockedReason
                  || 'Il te faut un abonnement Plus ou Pro actif et une entrée dans le programme de monétisation.'}
            </Text>
            <Text style={styles.note}>
              Les chiffres ci-dessus sont bien les tiens : c’est exactement ce que tu toucherais.
            </Text>
            {program?.programStatus !== 'pending' && (
              <GlassButton
                label="Voir les conditions"
                icon="trophy-outline"
                variant="secondary"
                onPress={() => navigation?.navigate?.('MonetizationProgram')}
                fullWidth
                style={styles.detailToggle}
              />
            )}
          </GlassCard>
        )}

        {/* --- 7. Historique ------------------------------------------------ */}
        {!!data?.history?.length && (
          <>
            <SectionLabel>Historique</SectionLabel>
            {data.history.map((entry) => {
              const open = openPeriod === entry.periodKey;
              return (
                <GlassCard
                  key={entry.periodKey}
                  contentStyle={styles.historyBody}
                  onPress={() => {
                    expand();
                    setOpenPeriod(open ? null : entry.periodKey);
                  }}
                >
                  <View style={styles.historyRow}>
                    <View style={styles.historyLeft}>
                      <Text style={styles.historyPeriod}>
                        {periodLabel(entry.periodStart, entry.periodEnd)}
                      </Text>
                      <Text style={styles.historyMeta}>
                        {compact(entry.qualifiedViews)} vues · qualité {percent(entry.quality)}
                      </Text>
                    </View>
                    <View style={styles.historyRight}>
                      <Text style={styles.historyAmount}>
                        {money(entry.amount)} {symbol}
                      </Text>
                      <Text
                        style={[
                          styles.historyStatus,
                          entry.status === 'claimable' && styles.historyStatusPending,
                        ]}
                      >
                        {entry.status === 'claimed' ? 'encaissé' : 'à encaisser'}
                      </Text>
                    </View>
                  </View>

                  {open && (
                    <View style={styles.historyDetail}>
                      <View style={styles.historyDetailRow}>
                        <Text style={styles.historyDetailLabel}>RPM</Text>
                        <Text style={styles.historyDetailValue}>
                          {money(entry.rpm)} {symbol} / 1000
                        </Text>
                      </View>
                      <View style={styles.historyDetailRow}>
                        <Text style={styles.historyDetailLabel}>Récompenses</Text>
                        <Text style={styles.historyDetailValue}>
                          ×{num(entry.bonusMultiplier, 1).toFixed(2)}
                        </Text>
                      </View>
                      <View style={styles.historyDetailRow}>
                        <Text style={styles.historyDetailLabel}>Vivier</Text>
                        <Text style={styles.historyDetailValue}>
                          {compact(entry.breakdown?.cohortSize)} créateurs
                        </Text>
                      </View>
                      {!!entry.claimedAt && (
                        <View style={styles.historyDetailRow}>
                          <Text style={styles.historyDetailLabel}>Encaissé le</Text>
                          <Text style={styles.historyDetailValue}>
                            {new Date(entry.claimedAt).toLocaleDateString('fr-FR')}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </GlassCard>
              );
            })}
          </>
        )}

        {!data?.history?.length && !projection && (
          <EmptyState
            icon="stats-chart-outline"
            title="Rien à afficher pour l'instant"
            message="Publie, laisse tourner une semaine, et ta première part apparaîtra ici après la clôture du lundi."
          />
        )}

        {refreshing && <ActivityIndicator color={colors.accent} style={styles.bottomSpinner} />}
      </ScrollView>
    </ScreenBackground>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16 },
  skeleton: { marginBottom: 14, borderRadius: radius.lg },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    marginBottom: 14,
    borderRadius: radius.md,
    backgroundColor: withAlpha(colors.warning, 0.12),
  },
  errorText: { flex: 1, color: colors.warning, fontFamily: fonts.regular, fontSize: 13 },

  /* Héro */
  hero: { marginBottom: 20 },
  heroContent: { padding: 20 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  heroBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentMuted,
  },
  heroKicker: {
    fontFamily: fonts.bold,
    fontSize: 12,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors.textSecondary,
  },
  heroAmountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  heroAmount: { fontFamily: fonts.bold, fontSize: 40, color: colors.textPrimary, letterSpacing: -1 },
  heroUnit: { fontFamily: fonts.bold, fontSize: 18, color: colors.accent },
  heroHint: {
    marginTop: 8,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  heroButton: { marginTop: 16 },
  heroPeriods: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: 8,
  },
  heroPeriodRow: { flexDirection: 'row', justifyContent: 'space-between' },
  heroPeriodLabel: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary },
  heroPeriodValue: { fontFamily: fonts.bold, fontSize: 13, color: colors.textPrimary },

  /* Cartes */
  cardBody: { padding: 16 },

  periodHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  periodRange: { fontFamily: fonts.bold, fontSize: 15, color: colors.textPrimary },
  countdown: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  countdownText: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary },

  statRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  stat: {
    flex: 1,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  statValue: {
    marginTop: 6,
    fontFamily: fonts.bold,
    fontSize: 19,
    color: colors.textPrimary,
  },
  statValueAccent: { color: colors.accent },
  statLabel: { marginTop: 2, fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary },
  statHint: { marginTop: 1, fontFamily: fonts.regular, fontSize: 11, color: colors.textSecondary, opacity: 0.75 },

  note: {
    marginTop: 4,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },

  warnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: withAlpha(colors.warning, 0.1),
  },
  warnText: { flex: 1, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: colors.warning },

  /* Qualité */
  qualityHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  qualityScore: { fontFamily: fonts.bold, fontSize: 32, color: colors.accent, letterSpacing: -0.5 },
  qualityScoreLabel: { flex: 1, fontFamily: fonts.bold, fontSize: 13, color: colors.textPrimary, lineHeight: 18 },
  qualityScoreHint: { fontFamily: fonts.regular, fontSize: 11, color: colors.textSecondary },

  quality: { marginBottom: 16 },
  qualityHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  qualityLabel: { fontFamily: fonts.bold, fontSize: 13, color: colors.textPrimary },
  qualityWeight: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary },
  qualityTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceElevated,
    overflow: 'hidden',
  },
  qualityFill: { height: 6, borderRadius: 3 },
  qualityFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  qualityRank: { fontFamily: fonts.regular, fontSize: 11, color: colors.textSecondary },
  qualityRaw: { fontFamily: fonts.regular, fontSize: 11, color: colors.textSecondary, opacity: 0.8 },

  detailToggle: { marginTop: 6 },
  detail: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: 10,
  },
  detailLine: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: colors.textSecondary },
  detailStrong: { fontFamily: fonts.bold, color: colors.textPrimary },

  /* Récompenses */
  bonus: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    marginBottom: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  bonusWon: { backgroundColor: colors.accentSoft },
  bonusIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  bonusIconWon: { backgroundColor: colors.accentMuted },
  bonusBody: { flex: 1 },
  bonusTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bonusTitle: { fontFamily: fonts.bold, fontSize: 13, color: colors.textSecondary },
  bonusTitleWon: { color: colors.textPrimary },
  bonusMult: { fontFamily: fonts.bold, fontSize: 13, color: colors.textSecondary },
  bonusMultWon: { color: colors.accent },
  bonusDesc: { marginTop: 3, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: colors.textSecondary },

  /* Pot */
  poolRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  poolLabel: { flex: 1, fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary },
  poolValue: { fontFamily: fonts.bold, fontSize: 13, color: colors.textPrimary },
  poolValueAccent: { color: colors.accent },

  /* Verrou */
  lockHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  lockTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.textPrimary },
  lockReason: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.textPrimary, marginBottom: 8 },

  /* Historique */
  historyBody: { padding: 14 },
  historyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  historyLeft: { flex: 1 },
  historyPeriod: { fontFamily: fonts.bold, fontSize: 14, color: colors.textPrimary },
  historyMeta: { marginTop: 2, fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary },
  historyRight: { alignItems: 'flex-end' },
  historyAmount: { fontFamily: fonts.bold, fontSize: 15, color: colors.textPrimary },
  historyStatus: { marginTop: 2, fontFamily: fonts.regular, fontSize: 11, color: colors.textSecondary },
  historyStatusPending: { color: colors.accent },
  historyDetail: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: 7,
  },
  historyDetailRow: { flexDirection: 'row', justifyContent: 'space-between' },
  historyDetailLabel: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary },
  historyDetailValue: { fontFamily: fonts.regular, fontSize: 12, color: colors.textPrimary },

  bottomSpinner: { marginTop: 16 },
});
