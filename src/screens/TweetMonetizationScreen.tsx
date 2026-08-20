/**
 * Monétisation — tableau de bord du créateur.
 *
 * Refonte du 2026-08-20 (seconde passe). Ce que la version précédente ratait,
 * bien qu'elle affichât les bons chiffres :
 *
 * - Sept cartes identiques empilées, chacune précédée d'un intertitre : la
 *   somme à encaisser et « le pot de la semaine » avaient le même poids
 *   visuel. Rien ne disait où regarder en premier.
 * - Aucune donnée graphique. Douze semaines d'historique en colonne de
 *   nombres, qu'il fallait comparer de tête pour savoir si ça montait.
 * - Six paragraphes de pédagogie affichés en permanence entre les chiffres.
 *   On les lit une fois ; ensuite ils font défiler l'écran pour rien. Ils sont
 *   désormais tous derrière un `Disclosure`.
 * - Les montants en police de texte, donc non alignés d'une ligne à l'autre.
 *   Le repo a `fonts.mono` exactement pour ça.
 *
 * Cette page réunit maintenant les trois écrans qui étaient séparés : les
 * gains, l'entrée dans le programme (critères et candidature, remontés tout en
 * haut quand ils bloquent le paiement) et un accès à l'état du compte.
 * `MonetizationProgramScreen` et `AccountStatusScreen` restent pour le détail.
 *
 * L'ordre de lecture va du RÉSULTAT vers sa CAUSE : combien j'ai → ce qui
 * m'en empêche, le cas échéant → ce que la semaine rapporte → pourquoi → ce
 * qui l'a porté → d'où vient l'argent → l'historique.
 */

import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  UIManager,
  View,
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
import { userStatsService } from '../services/userStatsService';
import { splitEarnings, type ContentEarning } from '../services/contentEarningsSplit';
import { colors, fonts, radius, statusBarStyle, withAlpha } from '../theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import {
  AppHeader,
  EmptyState,
  ErrorState,
  GlassButton,
  GlassCard,
  GlassIconButton,
  ScreenBackground,
  SectionLabel,
  Skeleton,
  Tappable,
  celebrateReward,
} from '../components/ui';
import { toast } from '../components/ui/Toast';
import {
  ContentRow,
  Disclosure,
  DisclosureLine,
  EarningsBars,
  MetricTile,
  PayoutRow,
  ProgramOverview,
  QualityRing,
  SignalBar,
  compact,
  deltaRatio,
  money,
  num,
  percent,
  periodLabel,
  shortDate,
  signedPercent,
  timeUntil,
  type EarningsBar,
} from '../components/monetization';

if (Platform.OS === 'android' && (UIManager as any).setLayoutAnimationEnabledExperimental) {
  (UIManager as any).setLayoutAnimationEnabledExperimental(true);
}

/** Bref, sans rebond — un dépliage répond à un appui, pas à un montage. */
const expand = () =>
  LayoutAnimation.configureNext(
    LayoutAnimation.create(180, LayoutAnimation.Types.easeOut, LayoutAnimation.Properties.opacity),
  );

/** Le sentinelle « toutes les semaines » de l'état d'encaissement. */
const CLAIM_ALL = '__all__';

/** Combien de publications avant le repli. Au-delà, la liste devient un fil. */
const CONTENT_PREVIEW = 4;

interface Props {
  navigation: any;
}

export default function TweetMonetizationScreen({ navigation }: Props) {
  const { user, isAuthenticated } = useAuth();
  const { width } = useResponsiveLayout();
  const isWide = width >= 700;
  // Posée en absolu au-dessus du contenu. Le contexte vaut `undefined` quand
  // l'écran est poussé sur la pile plutôt qu'affiché comme onglet — d'où le
  // repli, contrairement à `useBottomTabBarHeight` qui lève.
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;

  const [data, setData] = useState<CreatorPoolDashboard | null>(null);
  const [program, setProgram] = useState<MonetizationProgramEligibility | null>(null);
  const [content, setContent] = useState<ContentEarning[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimingKey, setClaimingKey] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [selectedBar, setSelectedBar] = useState<string | null>(null);
  const [openPeriod, setOpenPeriod] = useState<string | null>(null);
  const [showAllContent, setShowAllContent] = useState(false);

  /* ---------------------------------------------------------------- */
  /* Chargement                                                        */
  /* ---------------------------------------------------------------- */

  const load = useCallback(async () => {
    if (!isAuthenticated || !user) {
      setLoading(false);
      return;
    }
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

      // Volontairement après, et sans bloquer : l'attribution par publication
      // est un complément estimé. Son indisponibilité ne doit pas priver
      // l'écran de son sujet principal, qui est le montant.
      const projected = num(dashboard?.currentPeriod?.projection?.amount);
      try {
        const raw: any = await userStatsService.getTopPerformingTweets(user.id, 25, '7d');
        const list = Array.isArray(raw) ? raw : raw?.topTweets || [];
        setContent(splitEarnings(list, projected).rows);
      } catch {
        setContent(null);
      }
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

  /* ---------------------------------------------------------------- */
  /* Données dérivées                                                  */
  /* ---------------------------------------------------------------- */

  const symbol = data?.currency?.symbol || 'NF';
  const claimableTotal = num(data?.claimable?.total);
  const claimableCount = num(data?.claimable?.count);
  const projection: PeriodProjection | null = data?.currentPeriod?.projection || null;

  /**
   * L'historique arrive du plus récent au plus ancien (`ORDER BY … DESC`).
   *
   * Mémoïsé pour lui-même : écrit `data?.history || []`, le repli produit un
   * NOUVEAU tableau à chaque rendu, ce qui invalide les cinq `useMemo` qui en
   * dépendent — le tri des barres et les totaux se recalculeraient à chaque
   * frappe d'état, y compris pendant le défilement.
   */
  const history = useMemo(() => data?.history || [], [data?.history]);

  const lifetimeTotal = useMemo(
    () => history.reduce((acc, h) => acc + num(h.amount), 0),
    [history],
  );

  const historyMax = useMemo(
    () => history.reduce((acc, h) => Math.max(acc, num(h.amount)), 0),
    [history],
  );

  /** Sept semaines closes, dans l'ordre du temps, plus la semaine en cours. */
  const bars = useMemo<EarningsBar[]>(() => {
    const chronological = [...history].sort(
      (a, b) => new Date(a.periodStart).getTime() - new Date(b.periodStart).getTime(),
    );
    const rows: EarningsBar[] = chronological.slice(-7).map((h) => ({
      key: h.periodKey,
      short: shortDate(h.periodStart),
      amount: num(h.amount),
      kind: h.status === 'claimed' ? 'claimed' : 'claimable',
    }));

    if (projection && data?.currentPeriod?.key) {
      rows.push({
        key: data.currentPeriod.key,
        short: shortDate(data.currentPeriod.start),
        amount: num(projection.amount),
        kind: 'projected',
      });
    }
    return rows;
  }, [history, projection, data?.currentPeriod?.key, data?.currentPeriod?.start]);

  /** Le détail de la barre tapée, sinon rien : la légende reste une ligne. */
  const selected = useMemo(() => {
    if (!selectedBar) return null;
    const bar = bars.find((b) => b.key === selectedBar);
    if (!bar) return null;
    const entry = history.find((h) => h.periodKey === selectedBar);
    return {
      label: entry
        ? periodLabel(entry.periodStart, entry.periodEnd)
        : periodLabel(data?.currentPeriod?.start, data?.currentPeriod?.end),
      amount: bar.amount,
      kind: bar.kind,
    };
  }, [selectedBar, bars, history, data?.currentPeriod?.start, data?.currentPeriod?.end]);

  /**
   * Variation de la projection par rapport à la dernière semaine close.
   *
   * Comparer à la semaine EN COURS n'aurait aucun sens (elle n'est pas finie),
   * et comparer au cumul à encaisser non plus (il peut couvrir trois semaines).
   */
  const weekDelta = useMemo(
    () => (projection ? deltaRatio(projection.amount, history[0]?.amount) : null),
    [projection, history],
  );

  /**
   * L'appartenance au programme, et non l'éligibilité au paiement.
   *
   * Un créateur hors programme ne voit QUE les conditions d'entrée : lui
   * montrer un tableau de bord de revenus qu'il ne peut pas encaisser donne un
   * écran qu'on ne sait pas lire.
   *
   * `program === null` signifie que l'appel de statut a échoué, PAS que la
   * personne est dehors : dans ce cas on garde le tableau de bord. Une panne
   * réseau ne doit jamais rétrograder un créateur approuvé en prospect et lui
   * cacher l'argent qui l'attend.
   */
  const inProgram = !program || program.programStatus === 'approved';

  const eligible = !!projection?.eligible;
  const lockedReason = projection?.lockedReason || null;
  const pool = data?.currentPeriod?.pool;
  const weights = data?.weights;
  const earnedKeys = useMemo(
    () => new Set((projection?.bonuses?.earned || []).map((b) => b.key)),
    [projection],
  );
  const bonusMultiplier = num(projection?.bonuses?.multiplier, 1);

  const visibleContent = useMemo(() => {
    const rows = (content || []).filter((row) => row.views > 0);
    return showAllContent ? rows : rows.slice(0, CONTENT_PREVIEW);
  }, [content, showAllContent]);

  const hiddenContentCount = Math.max(0, (content || []).filter((r) => r.views > 0).length - visibleContent.length);

  /* ---------------------------------------------------------------- */
  /* Actions                                                           */
  /* ---------------------------------------------------------------- */

  const runClaim = useCallback(
    async (periodKey: string | undefined, busyKey: string, label: string) => {
      if (claimingKey) return;
      setClaimingKey(busyKey);
      try {
        const result = await CreatorPoolService.claim(periodKey);
        // La célébration porte le montant RÉELLEMENT versé par le serveur, pas
        // celui qu'affichait l'écran : si les deux divergeaient un jour, c'est
        // le versement qui fait foi.
        celebrateReward({ amount: num(result?.total), unit: symbol, label });
        await load();
      } catch (e: any) {
        toast.error('Encaissement impossible', { description: e?.message });
      } finally {
        setClaimingKey(null);
      }
    },
    [claimingKey, symbol, load],
  );

  const claimAll = useCallback(() => {
    if (claimableTotal <= 0) return;
    runClaim(
      undefined,
      CLAIM_ALL,
      claimableCount > 1 ? `${claimableCount} semaines encaissées` : 'Part créateur',
    );
  }, [claimableTotal, claimableCount, runClaim]);

  const claimOne = useCallback(
    (periodKey: string, label: string) => runClaim(periodKey, periodKey, label),
    [runClaim],
  );

  const apply = useCallback(async () => {
    if (applying || !program?.canApply) return;
    setApplying(true);
    try {
      await MonetizationProgramService.apply();
      toast.success('Candidature envoyée', { description: 'On te tient au courant après revue.' });
      await load();
    } catch (e: any) {
      toast.error('Envoi impossible', { description: e?.message });
    } finally {
      setApplying(false);
    }
  }, [applying, program, load]);

  const togglePeriod = useCallback((key: string) => {
    expand();
    setOpenPeriod((current) => (current === key ? null : key));
  }, []);

  const contentStyle = useMemo(
    () => [
      styles.content,
      isWide ? { maxWidth: 680, alignSelf: 'center' as const, width: '100%' as const } : null,
      { paddingBottom: 32 + tabBarHeight },
    ],
    [isWide, tabBarHeight],
  );

  /* ---------------------------------------------------------------- */
  /* États bloquants                                                   */
  /* ---------------------------------------------------------------- */

  const header = (
    <AppHeader
      navigation={navigation}
      title="Monétisation"
      subtitle={
        data?.currentPeriod?.start
          ? `Semaine du ${periodLabel(data.currentPeriod.start, data.currentPeriod.end)}`
          : `Ta part du pot hebdomadaire en ${symbol}`
      }
      right={
        <GlassIconButton
          icon="shield-checkmark-outline"
          onPress={() => navigation?.navigate?.('AccountStatus')}
        />
      }
    />
  );

  if (!isAuthenticated || !user) {
    return (
      <ScreenBackground>
        <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
        {header}
        <View style={contentStyle}>
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
        {header}
        <View style={contentStyle}>
          <Skeleton height={230} style={styles.skeleton} />
          <Skeleton height={150} style={styles.skeleton} />
          <Skeleton height={190} style={styles.skeleton} />
        </View>
      </ScreenBackground>
    );
  }

  if (error && !data) {
    return (
      <ScreenBackground>
        <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
        {header}
        <View style={contentStyle}>
          <ErrorState detail={error} onRetry={load} retrying={loading} />
        </View>
      </ScreenBackground>
    );
  }

  /* ---------------------------------------------------------------- */
  /* Hors programme — la page ne montre que l'entrée                   */
  /* ---------------------------------------------------------------- */

  if (!inProgram && program) {
    return (
      <ScreenBackground>
        <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
        {header}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={contentStyle}
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
          <ProgramOverview
            program={program}
            symbol={symbol}
            applying={applying}
            onApply={apply}
            pool={pool ? { pool: pool.pool, shareOfInflows: pool.shareOfInflows } : null}
            cohortSize={data?.currentPeriod?.cohortSize}
            weights={weights}
          />
        </ScrollView>
      </ScreenBackground>
    );
  }

  const claimingAll = claimingKey === CLAIM_ALL;

  /* ---------------------------------------------------------------- */
  /* Écran                                                             */
  /* ---------------------------------------------------------------- */

  return (
    <ScreenBackground>
      <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
      {header}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={contentStyle}
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
            <Ionicons name="warning-outline" size={16} color={colors.warning} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* --- 1. Ce qu'il y a à encaisser ----------------------------- */}
        <GlassCard style={styles.hero} highlight contentStyle={styles.heroContent}>
          <View style={styles.heroTop}>
            <Text style={styles.kicker}>
              {claimableTotal > 0 ? 'À encaisser' : 'Rien à encaisser'}
            </Text>
            {claimableCount > 1 && (
              <View style={styles.pill}>
                <Text style={styles.pillText}>{claimableCount} semaines</Text>
              </View>
            )}
          </View>

          <View style={styles.amountRow}>
            <Text style={styles.amount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {money(claimableTotal)}
            </Text>
            <Text style={styles.amountUnit}>{symbol}</Text>
          </View>

          {bars.length > 0 && (
            <>
              <EarningsBars
                bars={bars}
                symbol={symbol}
                selectedKey={selectedBar}
                onSelect={(key) => setSelectedBar((current) => (current === key ? null : key))}
                style={styles.bars}
              />

              {/* Une seule ligne, qui change de contenu : soit la légende des
                  barres, soit le détail de celle qu'on vient de taper. La
                  hauteur ne bouge pas, donc rien ne saute sous le doigt. */}
              <View style={styles.legend}>
                {selected ? (
                  <>
                    <Text style={styles.legendStrong} numberOfLines={1}>
                      {selected.label}
                    </Text>
                    <Text style={styles.legendValue}>
                      {selected.kind === 'projected' ? '≈ ' : ''}
                      {money(selected.amount)} {symbol}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.legendMuted} numberOfLines={1}>
                      {claimableTotal > 0
                        ? 'Montant figé à la clôture. Il ne bougera plus.'
                        : `Clôture dans ${timeUntil(data?.currentPeriod?.end)}`}
                    </Text>
                    <Text style={styles.legendHint}>appuie sur une barre</Text>
                  </>
                )}
              </View>
            </>
          )}

          {claimableTotal > 0 && (
            <GlassButton
              label={claimingAll ? 'Encaissement…' : `Encaisser ${money(claimableTotal)} ${symbol}`}
              icon="arrow-down-circle-outline"
              onPress={claimAll}
              disabled={!!claimingKey}
              loading={claimingAll}
              fullWidth
              style={styles.heroButton}
            />
          )}

          <View style={styles.heroFoot}>
            <View style={styles.heroFootItem}>
              <Text style={styles.heroFootLabel}>Total gagné</Text>
              <Text style={styles.heroFootValue}>
                {money(lifetimeTotal)} <Text style={styles.heroFootUnit}>{symbol}</Text>
              </Text>
            </View>

            <Tappable
              style={styles.heroFootLink}
              onPress={() => navigation?.navigate?.('WalletDetail')}
              accessibilityRole="button"
            >
              <Text style={styles.heroFootLinkText}>Portefeuille</Text>
              <Ionicons name="chevron-forward" size={13} color={colors.accent} />
            </Tappable>
          </View>
        </GlassCard>

        {/* --- 2. Le paiement est suspendu ----------------------------- */}
        {/* Seul un créateur DÉJÀ dans le programme arrive ici : les prospects
            sont partis sur `ProgramOverview` plus haut. Le blocage vient donc
            d'autre chose que des seuils d'entrée — un abonnement expiré, le
            plus souvent — et afficher les critères d'admission n'aiderait pas. */}
        {!eligible && (
          <GlassCard style={styles.card} contentStyle={styles.cardBody}>
            <View style={styles.lockHead}>
              <View style={styles.lockIcon}>
                <Ionicons name="lock-closed" size={14} color={colors.warning} />
              </View>
              <View style={styles.lockHeadText}>
                <Text style={styles.lockTitle}>Paiement suspendu</Text>
                <Text style={styles.lockReason}>
                  {lockedReason
                    || 'Il te faut un abonnement Plus ou Pro actif pour encaisser tes parts.'}
                </Text>
                <Text style={styles.note}>
                  Tes chiffres continuent d’être comptés : ce que tu vois ci-dessous est
                  exactement ce que tu toucheras une fois débloqué.
                </Text>
              </View>
            </View>
          </GlassCard>
        )}

        {/* --- 3. La semaine en cours ---------------------------------- */}
        <SectionLabel>Cette semaine</SectionLabel>
        <GlassCard style={styles.card} contentStyle={styles.cardBody}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {periodLabel(data?.currentPeriod?.start, data?.currentPeriod?.end)}
            </Text>
            <View style={styles.countdown}>
              <Ionicons name="time-outline" size={12} color={colors.textMuted} />
              <Text style={styles.countdownText}>{timeUntil(data?.currentPeriod?.end)}</Text>
            </View>
          </View>

          {projection ? (
            <>
              <View style={styles.grid}>
                <MetricTile
                  label="Part projetée"
                  value={money(projection.amount)}
                  unit={symbol}
                  hint={weekDelta !== null ? `${signedPercent(weekDelta)} vs sem. passée` : 'première semaine'}
                  tone="accent"
                />
                <MetricTile
                  label="RPM"
                  value={money(projection.rpm)}
                  unit={symbol}
                  hint="pour 1000 vues"
                />
              </View>
              <View style={styles.grid}>
                <MetricTile
                  label="Part du pot"
                  value={percent(projection.share, 2)}
                  hint={`sur ${compact(data?.currentPeriod?.cohortSize)} créateurs`}
                />
                <MetricTile
                  label="Vues qualifiées"
                  value={compact(projection.qualifiedViews)}
                  hint={`${compact(projection.rawViews)} brutes`}
                />
              </View>
              <View style={styles.grid}>
                <MetricTile
                  label="Spectateurs"
                  value={compact(projection.distinctViewers)}
                  hint="comptes distincts"
                />
                <MetricTile
                  label="Récompenses"
                  value={`× ${money(bonusMultiplier, 2)}`}
                  hint={
                    projection.bonuses?.capped
                      ? 'plafonné'
                      : `${earnedKeys.size} obtenue${earnedKeys.size > 1 ? 's' : ''}`
                  }
                  tone={bonusMultiplier > 1 ? 'success' : 'default'}
                />
              </View>

              {!projection.hasRealDwell && (
                <View style={styles.warnRow}>
                  <Ionicons name="information-circle-outline" size={15} color={colors.warning} />
                  <Text style={styles.warnText}>
                    Aucun temps de lecture réel n’a été mesuré cette semaine. L’attention est
                    estimée, donc décotée de {percent(1 - num(projection.attentionFactor, 1))}.
                  </Text>
                </View>
              )}

              <Disclosure label="Pourquoi ce chiffre bouge">
                <DisclosureLine>
                  C’est une projection, pas une promesse. Ta part dépend de ce que font les{' '}
                  {compact(data?.currentPeriod?.cohortSize)} autres créateurs de la semaine : elle
                  baisse s’ils publient mieux, monte s’ils lèvent le pied, même si tes propres
                  chiffres ne changent pas.
                </DisclosureLine>
                <DisclosureLine>
                  Elle se fige à la clôture du lundi. À partir de là, le montant affiché est
                  exactement celui qui sera versé — encaisser ne déclenche aucun recalcul.
                </DisclosureLine>
              </Disclosure>
            </>
          ) : (
            <EmptyState
              compact
              icon="eye-off-outline"
              title="Aucune vue cette semaine"
              message="Dès la première vue sur une publication, ta projection apparaît ici."
            />
          )}
        </GlassCard>

        {/* --- 4. Pourquoi ce montant ---------------------------------- */}
        {projection && weights && (
          <>
            <SectionLabel>Ta qualité</SectionLabel>
            <GlassCard style={styles.card} contentStyle={styles.cardBody}>
              <View style={styles.qualityHead}>
                <QualityRing value={projection.quality} label="score" />
                <View style={styles.qualityText}>
                  <Text style={styles.qualityTitle}>
                    Multiplie tes vues pour donner ton poids dans le partage
                  </Text>
                  <Text style={styles.qualitySub}>
                    Quatre signaux, chacun compté comme un RANG dans le vivier de la semaine — pas
                    comme un volume. Un petit compte très suivi passe devant un gros compte tiède.
                  </Text>
                </View>
              </View>

              <View style={styles.signals}>
                <SignalBar
                  label="Attention"
                  percentile={projection.percentiles.attention}
                  weight={weights.attention}
                  raw={`${money(num(projection.rates.attention) / 1000, 1)} s / vue`}
                />
                <SignalBar
                  label="Rétention"
                  percentile={projection.percentiles.retention}
                  weight={weights.retention}
                  raw={`${compact(projection.raw.followsGained)} abonnés · ${compact(
                    projection.raw.returningViewers,
                  )} revenus`}
                />
                <SignalBar
                  label="DAU gagnée"
                  percentile={projection.percentiles.dau}
                  weight={weights.dau}
                  raw={`${compact(projection.raw.dauGained)} réactivations`}
                />
                <SignalBar
                  label="Signaux négatifs"
                  percentile={projection.percentiles.penalty}
                  weight={weights.penalty}
                  raw={`${compact(projection.raw.negatives)} au total`}
                  negative
                />
              </View>

              <Disclosure label="Ce que mesure chaque signal">
                <DisclosureLine term="Attention">
                  le temps réellement passé sur tes publications, rapporté à leurs vues. C’est le
                  seul signal qu’on ne peut pas fabriquer, donc celui qui pèse le plus.
                </DisclosureLine>
                <DisclosureLine term="Rétention">
                  les abonnés gagnés et les gens qui reviennent te lire un autre jour.
                </DisclosureLine>
                <DisclosureLine term="DAU gagnée">
                  les comptes qui n’étaient pas actifs la veille et dont ta publication a ouvert la
                  journée. Tu les as ramenés.
                </DisclosureLine>
                <DisclosureLine term="Signaux négatifs">
                  les « pas intéressé », les signalements, les publications retirées. Ils se
                  retranchent.
                </DisclosureLine>
                <DisclosureLine>
                  Les interactions venues de comptes créés en rafale comptent pour zéro.
                </DisclosureLine>
              </Disclosure>
            </GlassCard>
          </>
        )}

        {/* --- 5. Ce qui a porté ta part ------------------------------- */}
        {!!visibleContent.length && (
          <>
            <SectionLabel>Ce qui a porté ta part</SectionLabel>
            <GlassCard style={styles.card} contentStyle={styles.cardBody}>
              {visibleContent.map((row, index) => (
                <ContentRow
                  key={row.id}
                  rank={index + 1}
                  content={row.content}
                  views={row.views}
                  amount={row.amount}
                  share={row.share}
                  symbol={symbol}
                  onPress={() => navigation?.navigate?.('TweetDetail', { tweetId: row.id })}
                />
              ))}

              {hiddenContentCount > 0 && (
                <GlassButton
                  label={`Voir les ${hiddenContentCount} autres`}
                  variant="ghost"
                  icon="chevron-down"
                  onPress={() => {
                    expand();
                    setShowAllContent(true);
                  }}
                  fullWidth
                />
              )}

              {/* L'avertissement n'est pas une précaution de forme : sans lui,
                  ces montants se liraient comme des versements par publication,
                  ce que le pot ne fait pas. */}
              <View style={styles.estimateRow}>
                <Ionicons name="calculator-outline" size={14} color={colors.textMuted} />
                <Text style={styles.estimateText}>
                  Estimation. Le pot verse une part unique par semaine, jamais au tweet : ta part
                  projetée est ici répartie au prorata des vues de tes publications des 7 derniers
                  jours.
                </Text>
              </View>
            </GlassCard>
          </>
        )}

        {/* --- 6. Récompenses ------------------------------------------ */}
        {!!data?.bonusCatalog?.length && (
          <>
            <SectionLabel>Récompenses</SectionLabel>
            <GlassCard style={styles.card} contentStyle={styles.cardBody}>
              {data.bonusCatalog
                .filter((b) => b.enabled)
                .map((bonus) => {
                  const won = earnedKeys.has(bonus.key);
                  return (
                    <View key={bonus.key} style={[styles.bonus, won && styles.bonusWon]}>
                      <Ionicons
                        name={won ? 'checkmark-circle' : 'ellipse-outline'}
                        size={16}
                        color={won ? colors.success : colors.textMuted}
                      />
                      <View style={styles.bonusBody}>
                        <Text style={[styles.bonusTitle, won && styles.bonusTitleWon]} numberOfLines={1}>
                          {bonus.label}
                        </Text>
                        <Text style={styles.bonusDesc} numberOfLines={2}>
                          {bonus.description}
                        </Text>
                      </View>
                      <Text style={[styles.bonusMult, won && styles.bonusMultWon]}>
                        +{Math.round((num(bonus.multiplier, 1) - 1) * 100)} %
                      </Text>
                    </View>
                  );
                })}

              <Disclosure label="Comment une récompense agit">
                <DisclosureLine>
                  Elle multiplie ton poids dans le partage — elle ne puise pas dans le pot, elle
                  déplace une part vers toi. Le pot, lui, ne change pas de taille.
                </DisclosureLine>
              </Disclosure>
            </GlassCard>
          </>
        )}

        {/* --- 7. D'où vient l'argent ---------------------------------- */}
        {pool && (
          <>
            <SectionLabel>Le pot de la semaine</SectionLabel>
            <GlassCard style={styles.card} contentStyle={styles.cardBody}>
              <View style={styles.grid}>
                <MetricTile
                  label="Entré en trésorerie"
                  value={money(pool.inflows, 0)}
                  unit={symbol}
                  hint={`${compact(pool.inflowTransactions)} opérations`}
                />
                <MetricTile
                  label="Reversé aux créateurs"
                  value={money(pool.pool, 0)}
                  unit={symbol}
                  hint={`${percent(pool.shareOfInflows)} des entrées`}
                  tone="accent"
                />
              </View>

              {pool.cappedByTreasury && (
                <View style={styles.warnRow}>
                  <Ionicons name="information-circle-outline" size={15} color={colors.warning} />
                  <Text style={styles.warnText}>
                    Le pot est plafonné cette semaine pour préserver la trésorerie.
                  </Text>
                </View>
              )}

              <Disclosure label="D’où sort cet argent">
                <DisclosureLine>
                  Le pot vaut une part de ce que la plateforme a réellement encaissé cette
                  semaine — campagnes publicitaires, abonnements Plus et Pro, commissions. Il ne
                  peut jamais dépasser ce qui est entré, donc la monétisation ne peut pas coûter
                  plus qu’elle ne rapporte.
                </DisclosureLine>
              </Disclosure>
            </GlassCard>
          </>
        )}

        {/* --- 8. Historique ------------------------------------------- */}
        {!!history.length && (
          <>
            <SectionLabel>Historique</SectionLabel>
            {history.map((entry) => (
              <PayoutRow
                key={entry.periodKey}
                label={periodLabel(entry.periodStart, entry.periodEnd)}
                amount={entry.amount}
                symbol={symbol}
                status={entry.status}
                views={entry.qualifiedViews}
                quality={entry.quality}
                rpm={entry.rpm}
                bonusMultiplier={entry.bonusMultiplier}
                cohortSize={num(entry.breakdown?.cohortSize) || undefined}
                claimedAt={entry.claimedAt}
                ratio={historyMax > 0 ? num(entry.amount) / historyMax : 0}
                expanded={openPeriod === entry.periodKey}
                onToggle={() => togglePeriod(entry.periodKey)}
                claiming={claimingKey === entry.periodKey}
                onClaim={() =>
                  claimOne(
                    entry.periodKey,
                    `Semaine du ${periodLabel(entry.periodStart, entry.periodEnd)}`,
                  )
                }
              />
            ))}
          </>
        )}

        {!history.length && !projection && (
          <EmptyState
            icon="stats-chart-outline"
            title="Rien à afficher pour l’instant"
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
  content: { paddingHorizontal: 16, paddingTop: 4 },
  skeleton: { marginBottom: 12, borderRadius: radius.lg },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 11,
    marginBottom: 12,
    borderRadius: radius.md,
    backgroundColor: withAlpha(colors.warning, 0.12),
  },
  errorText: { flex: 1, fontFamily: fonts.regular, fontSize: 12.5, color: colors.warning },

  /* Héro */
  hero: { marginBottom: 16 },
  heroContent: { padding: 18 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  kicker: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    backgroundColor: colors.accentMuted,
  },
  pillText: { fontFamily: fonts.bold, fontSize: 10, color: colors.accent },

  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7, marginTop: 8 },
  amount: {
    fontFamily: fonts.mono,
    fontSize: 38,
    letterSpacing: -2,
    color: colors.textPrimary,
  },
  amountUnit: { fontFamily: fonts.bold, fontSize: 16, color: colors.accent },

  bars: { marginTop: 16 },

  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    height: 22,
    marginTop: 8,
  },
  legendStrong: { flex: 1, fontFamily: fonts.medium, fontSize: 11.5, color: colors.textPrimary },
  legendValue: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.accent },
  legendMuted: { flex: 1, fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted },
  legendHint: { fontFamily: fonts.regular, fontSize: 10, color: colors.textDisabled },

  heroButton: { marginTop: 14 },

  heroFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  heroFootItem: { flex: 1 },
  heroFootLabel: {
    fontFamily: fonts.bold,
    fontSize: 9.5,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  heroFootValue: { marginTop: 3, fontFamily: fonts.mono, fontSize: 14, color: colors.textPrimary },
  heroFootUnit: { fontFamily: fonts.regular, fontSize: 10.5, color: colors.textMuted },
  heroFootLink: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  heroFootLinkText: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.accent },

  /* Cartes */
  card: { marginBottom: 16 },
  cardBody: { padding: 14 },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  cardTitle: { flex: 1, fontFamily: fonts.medium, fontSize: 13.5, color: colors.textPrimary },
  countdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  countdownText: { fontFamily: fonts.mono, fontSize: 10.5, color: colors.textSecondary },

  grid: { flexDirection: 'row', gap: 8, marginBottom: 8 },

  note: {
    marginTop: 8,
    fontFamily: fonts.regular,
    fontSize: 11.5,
    lineHeight: 17,
    color: colors.textMuted,
  },

  warnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: withAlpha(colors.warning, 0.1),
  },
  warnText: { flex: 1, fontFamily: fonts.regular, fontSize: 11.5, lineHeight: 16, color: colors.warning },

  /* Verrou */
  lockHead: { flexDirection: 'row', gap: 10 },
  lockIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(colors.warning, 0.14),
  },
  lockHeadText: { flex: 1 },
  lockTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.textPrimary },
  lockReason: {
    marginTop: 3,
    fontFamily: fonts.regular,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  criteria: {
    marginTop: 14,
    paddingTop: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  lockActions: { marginTop: 12, gap: 8 },
  rejection: {
    padding: 11,
    borderRadius: radius.md,
    backgroundColor: withAlpha(colors.red, 0.1),
  },
  rejectionLabel: {
    fontFamily: fonts.bold,
    fontSize: 9.5,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: colors.red,
  },
  rejectionText: {
    marginTop: 4,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },

  /* Qualité */
  qualityHead: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  qualityText: { flex: 1 },
  qualityTitle: { fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 17, color: colors.textPrimary },
  qualitySub: {
    marginTop: 5,
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textMuted,
  },
  signals: {
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },

  /* Contenus */
  estimateRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  estimateText: { flex: 1, fontFamily: fonts.regular, fontSize: 10.5, lineHeight: 15, color: colors.textMuted },

  /* Récompenses */
  bonus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    marginBottom: 6,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  bonusWon: { backgroundColor: colors.accentSoft },
  bonusBody: { flex: 1 },
  bonusTitle: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.textSecondary },
  bonusTitleWon: { color: colors.textPrimary },
  bonusDesc: { marginTop: 2, fontFamily: fonts.regular, fontSize: 10.5, lineHeight: 15, color: colors.textMuted },
  bonusMult: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.textMuted },
  bonusMultWon: { color: colors.success },

  bottomSpinner: { marginTop: 12 },
});
