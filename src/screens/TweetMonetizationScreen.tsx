/**
 * Monétisation — le relevé du créateur.
 *
 * ── Refonte du 2026-08-20 (quatrième passe) ────────────────────────────────
 * Les trois passes précédentes ont itéré À L'INTÉRIEUR du même paradigme :
 * huit sections identiques (un titre + une carte), un anneau de score, des
 * barres de progression, une grille de tuiles, quatre accordéons explicatifs.
 * Quand chaque bloc porte le même poids visuel, aucun n'en a — c'est le
 * gabarit « tableau de bord » que produit tout générateur par défaut, et il a
 * été rejeté comme tel (« ça fait dashboard IA »).
 *
 * Le changement n'est donc pas cosmétique, c'est un changement de sujet :
 * cette page n'est pas de l'analytique, c'est de l'ARGENT — une part
 * hebdomadaire d'un pot partagé. Elle emprunte au RELEVÉ, pas au dashboard.
 * Voir `components/monetization/statement.tsx` pour la règle complète ; en
 * résumé : aucune carte, la structure vient des filets ; tout chiffre à
 * chasse fixe pour que les virgules s'alignent ; une couleur par rôle (l'or
 * pour la monnaie, le magenta pour l'action et pour ta part).
 *
 * ── La signature ───────────────────────────────────────────────────────────
 * Presque tous les écrans de gains disent « tu as gagné X ». Ici l'argent est
 * une PART d'un pot que d'autres créateurs découpent en même temps : c'est ce
 * qu'il y a de plus caractéristique dans ce produit, et ça n'apparaissait
 * nulle part. `ShareBar` le montre — le pot en crans, les tiens allumés. Une
 * seule animation sur tout l'écran, et c'est celle-là.
 *
 * Cette page réunit les trois écrans qui étaient séparés : les gains,
 * l'entrée dans le programme (critères et candidature, via `ProgramOverview`)
 * et un accès à l'état du compte. `MonetizationProgramScreen` et
 * `AccountStatusScreen` restent pour le détail.
 *
 * L'ordre de lecture va du RÉSULTAT vers sa CAUSE : combien j'ai → ce qui
 * m'en empêche, le cas échéant → quelle part du pot → pourquoi → ce qui l'a
 * portée → d'où vient l'argent → l'historique.
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
  GlassIconButton,
  ScreenBackground,
  Skeleton,
  Tappable,
  celebrateReward,
} from '../components/ui';
import { toast } from '../components/ui/Toast';
import {
  ContentRow,
  Disclosure,
  DisclosureLine,
  Eyebrow,
  Figure,
  LedgerRow,
  PayoutRow,
  ProgramOverview,
  Rule,
  ShareBar,
  compact,
  deltaRatio,
  money,
  num,
  percent,
  periodLabel,
  signedPercent,
  timeUntil,
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

/**
 * Un percentile `[0, 1]` dit en rang lisible.
 *
 * « 80ᵉ / 100 » se comprend d'un coup d'œil et se compare d'une ligne à
 * l'autre ; une jauge remplie aux quatre cinquièmes demande d'être mesurée à
 * l'œil, et ajoutait un quatrième graphique à un écran qui en avait déjà
 * trop. Borné à 1 : personne n'est « 0ᵉ ».
 */
const percentileRank = (value: unknown) => Math.max(1, Math.round(num(value) * 100));

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
  const hasClaimable = claimableTotal > 0;
  const enabledBonuses = (data?.bonusCatalog || []).filter((b) => b.enabled);

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

        {/* --- 1. Le chiffre ------------------------------------------- */}
        {/* Plein cadre, posé directement sur le noir : le seul bloc de l'écran
            sans filet ni conteneur. La question que le créateur vient poser
            est « combien » — elle trouve sa réponse avant le premier mot. */}
        <View style={styles.figureBlock}>
          <Eyebrow>{hasClaimable ? 'À encaisser' : 'Projection de la semaine'}</Eyebrow>

          <Figure
            value={money(hasClaimable ? claimableTotal : num(projection?.amount))}
            unit={symbol}
            tone={hasClaimable ? 'money' : 'muted'}
          />

          <Text style={styles.figureMeta}>
            {hasClaimable
              ? claimableCount > 1
                ? `${claimableCount} semaines · figé à la clôture, ne bougera plus`
                : 'Figé à la clôture, ne bougera plus'
              : `Estimation · clôture dans ${timeUntil(data?.currentPeriod?.end)}`}
          </Text>

          {hasClaimable && (
            <GlassButton
              label={claimingAll ? 'Encaissement…' : `Encaisser ${money(claimableTotal)} ${symbol}`}
              icon="arrow-down-circle-outline"
              onPress={claimAll}
              disabled={!!claimingKey}
              loading={claimingAll}
              fullWidth
              style={styles.claimButton}
            />
          )}

          <View style={styles.figureFoot}>
            <Text style={styles.figureFootLabel}>
              Total gagné{'   '}
              <Text style={styles.figureFootValue}>
                {money(lifetimeTotal)} {symbol}
              </Text>
            </Text>

            <Tappable
              style={styles.figureFootLink}
              onPress={() => navigation?.navigate?.('WalletDetail')}
              accessibilityRole="button"
            >
              <Text style={styles.figureFootLinkText}>Portefeuille</Text>
              <Ionicons name="chevron-forward" size={13} color={colors.accent} />
            </Tappable>
          </View>
        </View>

        {/* --- 2. Le paiement est suspendu ----------------------------- */}
        {/* Seul un créateur DÉJÀ dans le programme arrive ici : les prospects
            sont partis sur `ProgramOverview` plus haut. Le blocage vient donc
            d'autre chose que des seuils d'entrée — un abonnement expiré, le
            plus souvent — et afficher les critères d'admission n'aiderait pas.
            Teinté en avertissement, bord compris : c'est le seul état de
            l'écran qui retarde un versement, il doit se voir. */}
        {!eligible && (
          <View style={styles.notice}>
            <Ionicons name="lock-closed" size={14} color={colors.warning} />
            <View style={styles.noticeText}>
              <Text style={styles.noticeTitle}>Paiement suspendu</Text>
              <Text style={styles.noticeBody}>
                {lockedReason
                  || 'Il te faut un abonnement Plus ou Pro actif pour encaisser tes parts.'}
                {' '}Tes chiffres continuent d’être comptés : ce que tu vois plus bas est
                exactement ce que tu toucheras une fois débloqué.
              </Text>
            </View>
          </View>
        )}

        {/* --- 3. LA SIGNATURE : ta part du pot ------------------------ */}
        {/* Le fait le plus caractéristique de ce produit, et il n'apparaissait
            nulle part : l'argent n'est pas gagné à l'unité, il est DÉCOUPÉ
            dans un pot que d'autres créateurs découpent en même temps. D'où
            les crans plutôt qu'une jauge — des parts discrètes partagées. */}
        {projection ? (
          <View style={styles.block}>
            <Rule />
            <View style={styles.blockHead}>
              <Eyebrow>Ta part du pot</Eyebrow>
              <Text style={styles.blockMeta}>
                {periodLabel(data?.currentPeriod?.start, data?.currentPeriod?.end)}
              </Text>
            </View>

            <View style={styles.shareLine}>
              <Text style={styles.sharePct}>{percent(projection.share, 2)}</Text>
              {!!pool && (
                <Text style={styles.sharePot}>
                  de {money(pool.pool, 0)} {symbol}
                </Text>
              )}
            </View>

            <ShareBar share={num(projection.share)} cohortSize={data?.currentPeriod?.cohortSize} />

            <View style={styles.ledger}>
              <LedgerRow
                first
                label="Part projetée"
                value={money(projection.amount)}
                unit={symbol}
                tone="money"
                hint={
                  weekDelta !== null
                    ? `${signedPercent(weekDelta)} vs semaine passée`
                    : 'première semaine'
                }
              />
              <LedgerRow
                label="RPM"
                value={money(projection.rpm)}
                unit={symbol}
                hint="pour 1000 vues"
              />
              <LedgerRow
                label="Vues qualifiées"
                value={compact(projection.qualifiedViews)}
                hint={`${compact(projection.rawViews)} brutes`}
              />
              <LedgerRow
                label="Spectateurs"
                value={compact(projection.distinctViewers)}
                hint="comptes distincts"
              />
              {bonusMultiplier > 1 && (
                <LedgerRow
                  label="Récompenses"
                  value={`× ${money(bonusMultiplier, 2)}`}
                  tone="success"
                  hint={
                    projection.bonuses?.capped
                      ? 'plafonné'
                      : `${earnedKeys.size} obtenue${earnedKeys.size > 1 ? 's' : ''}`
                  }
                />
              )}
            </View>

            {!projection.hasRealDwell && (
              <View style={styles.warnRow}>
                <Ionicons name="information-circle-outline" size={14} color={colors.warning} />
                <Text style={styles.warnText}>
                  Aucun temps de lecture réel mesuré cette semaine. L’attention est estimée, donc
                  décotée de {percent(1 - num(projection.attentionFactor, 1))}.
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
          </View>
        ) : (
          <View style={styles.block}>
            <Rule />
            <EmptyState
              compact
              icon="eye-off-outline"
              title="Aucune vue cette semaine"
              message="Dès la première vue sur une publication, ta part apparaît ici."
            />
          </View>
        )}

        {/* --- 4. Pourquoi cette part ---------------------------------- */}
        {projection && weights && (
          <View style={styles.block}>
            <Rule />
            <View style={styles.blockHead}>
              <Eyebrow>Ta qualité</Eyebrow>
              <Text style={styles.blockMetaStrong}>{money(projection.quality, 3)}</Text>
            </View>

            <Text style={styles.blockIntro}>
              Elle multiplie tes vues pour donner ton poids dans le partage. Chaque signal compte
              comme un RANG dans le vivier de la semaine, pas comme un volume : un petit compte
              très suivi passe devant un gros compte tiède.
            </Text>

            {/* Le rang, pas la barre. Un percentile EST un classement — l'écrire
                « 80ᵉ / 100 » le dit mieux qu'une jauge remplie aux 4/5, et évite
                le quatrième graphique de l'écran. */}
            <View style={styles.ledger}>
              <LedgerRow
                first
                label="Attention"
                value={`${percentileRank(projection.percentiles.attention)}ᵉ`}
                unit="/100"
                tone="accent"
                hint={`${money(num(projection.rates.attention) / 1000, 1)} s par vue · poids ${percent(weights.attention, 0)}`}
              />
              <LedgerRow
                label="Rétention"
                value={`${percentileRank(projection.percentiles.retention)}ᵉ`}
                unit="/100"
                hint={`${compact(projection.raw.followsGained)} abonnés · ${compact(
                  projection.raw.returningViewers,
                )} revenus · poids ${percent(weights.retention, 0)}`}
              />
              <LedgerRow
                label="DAU gagnée"
                value={`${percentileRank(projection.percentiles.dau)}ᵉ`}
                unit="/100"
                hint={`${compact(projection.raw.dauGained)} réactivations · poids ${percent(weights.dau, 0)}`}
              />
              <LedgerRow
                label="Signaux négatifs"
                value={`${percentileRank(projection.percentiles.penalty)}ᵉ`}
                unit="/100"
                tone={num(projection.raw.negatives) > 0 ? 'muted' : 'default'}
                hint={`${compact(projection.raw.negatives)} au total · retranché à ${percent(weights.penalty, 0)}`}
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
          </View>
        )}

        {/* --- 5. Ce qui a porté ta part ------------------------------- */}
        {!!visibleContent.length && (
          <View style={styles.block}>
            <Rule />
            <View style={styles.blockHead}>
              <Eyebrow>Ce qui a porté ta part</Eyebrow>
            </View>
            {visibleContent.map((row, index) => (
              <ContentRow
                key={row.id}
                first={index === 0}
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
                style={styles.moreButton}
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
          </View>
        )}

        {/* --- 6. Récompenses ------------------------------------------ */}
        {!!enabledBonuses.length && (
          <View style={styles.block}>
            <Rule />
            <View style={styles.blockHead}>
              <Eyebrow>Récompenses</Eyebrow>
              <Text style={styles.blockMeta}>
                {earnedKeys.size} sur {enabledBonuses.length}
              </Text>
            </View>

            <View style={styles.ledger}>
              {enabledBonuses.map((bonus, index) => {
                const won = earnedKeys.has(bonus.key);
                return (
                  <LedgerRow
                    key={bonus.key}
                    first={index === 0}
                    label={bonus.label}
                    hint={bonus.description}
                    value={`+${Math.round((num(bonus.multiplier, 1) - 1) * 100)} %`}
                    tone={won ? 'success' : 'muted'}
                  />
                );
              })}
            </View>

            <Disclosure label="Comment une récompense agit">
              <DisclosureLine>
                Elle multiplie ton poids dans le partage — elle ne puise pas dans le pot, elle
                déplace une part vers toi. Le pot, lui, ne change pas de taille.
              </DisclosureLine>
            </Disclosure>
          </View>
        )}

        {/* --- 7. D'où vient l'argent ---------------------------------- */}
        {pool && (
          <View style={styles.block}>
            <Rule />
            <View style={styles.blockHead}>
              <Eyebrow>Le pot de la semaine</Eyebrow>
            </View>

            <View style={styles.ledger}>
              <LedgerRow
                first
                label="Entré en trésorerie"
                value={money(pool.inflows, 0)}
                unit={symbol}
                hint={`${compact(pool.inflowTransactions)} opérations`}
              />
              <LedgerRow
                label="Reversé aux créateurs"
                value={money(pool.pool, 0)}
                unit={symbol}
                tone="money"
                hint={`${percent(pool.shareOfInflows)} des entrées`}
              />
            </View>

            {pool.cappedByTreasury && (
              <View style={styles.warnRow}>
                <Ionicons name="information-circle-outline" size={14} color={colors.warning} />
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
          </View>
        )}

        {/* --- 8. Historique ------------------------------------------- */}
        {!!history.length && (
          <View style={styles.block}>
            <Rule />
            <View style={styles.blockHead}>
              <Eyebrow>Historique</Eyebrow>
              <Text style={styles.blockMeta}>
                {history.length} semaine{history.length > 1 ? 's' : ''}
              </Text>
            </View>
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
          </View>
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

/**
 * Échelle de type native (iOS), appliquée sans exception :
 *   body 17/22 · callout 16/21 · subheadline 15/20 · footnote 13/18
 * Rien en dessous de 13. Un relevé se lit à bout de bras ; la première
 * version de cet écran descendait à 11–12,5 px sur du texte de contenu, ce
 * qui le rendait illisible quelle que soit la qualité de la mise en page.
 *
 * Espacement sur grille de 4.
 */
const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 8 },
  skeleton: { marginBottom: 12, borderRadius: radius.lg },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    marginBottom: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    backgroundColor: withAlpha(colors.warning, 0.1),
    borderColor: withAlpha(colors.warning, 0.32),
  },
  errorText: { flex: 1, fontFamily: fonts.regular, fontSize: 15, lineHeight: 20, color: colors.warning },

  /* ── 1. Le chiffre ───────────────────────────────────────────────
     Aucun fond, aucun bord : posé sur le noir de l'écran. C'est ce qui le
     distingue de tout le reste — les autres blocs sont introduits par un
     filet, lui n'a besoin de rien. */
  figureBlock: { paddingTop: 20, paddingBottom: 8 },
  figureMeta: {
    marginTop: 14,
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: colors.textSecondary,
  },
  claimButton: { marginTop: 24 },

  figureFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 24,
  },
  figureFootLabel: { fontFamily: fonts.regular, fontSize: 15, color: colors.textMuted },
  figureFootValue: { fontFamily: fonts.mono, fontSize: 15, color: colors.textPrimary },
  figureFootLink: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  figureFootLinkText: { fontFamily: fonts.medium, fontSize: 15, color: colors.accent },

  /* ── Avertissement bloquant ──────────────────────────────────────
     Le seul état de l'écran qui retarde un versement. Teinté, mais toujours
     sans carte : un liseré à gauche suffit à le détacher. */
  notice: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
    padding: 16,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
    backgroundColor: withAlpha(colors.warning, 0.07),
  },
  noticeText: { flex: 1, gap: 6 },
  noticeTitle: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 22, color: colors.warning },
  noticeBody: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: colors.textSecondary,
  },

  /* ── Bloc générique ──────────────────────────────────────────────
     Un filet, un sur-titre, du contenu. C'est TOUTE la structure de la page :
     pas d'autre conteneur, donc pas de hiérarchie inventée. */
  block: { marginTop: 32 },
  blockHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 24,
    marginBottom: 16,
  },
  blockMeta: { fontFamily: fonts.mono, fontSize: 13, color: colors.textMuted },
  blockMetaStrong: { fontFamily: fonts.mono, fontSize: 20, color: colors.textPrimary },
  blockIntro: {
    marginBottom: 20,
    fontFamily: fonts.regular,
    fontSize: 16,
    lineHeight: 23,
    color: colors.textSecondary,
  },

  /* ── 3. La signature : part du pot ───────────────────────────────
     Le pourcentage est le second chiffre le plus gros de l'écran, juste
     après le montant — c'est la mesure qui explique tous les autres. */
  shareLine: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 18 },
  sharePct: {
    fontFamily: fonts.mono,
    fontSize: 40,
    lineHeight: 46,
    letterSpacing: -1.5,
    color: colors.accent,
  },
  sharePot: { fontFamily: fonts.regular, fontSize: 16, color: colors.textSecondary },

  ledger: { marginTop: 20 },

  /* ── Notes ───────────────────────────────────────────────────────── */
  warnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  warnText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: colors.warning,
  },

  moreButton: { marginTop: 16 },

  estimateRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  estimateText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
  },

  bottomSpinner: { marginTop: 16 },
});
