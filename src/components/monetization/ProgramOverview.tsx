import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { colors, fonts, radius, withAlpha } from '../../theme';
import GlassButton from '../ui/GlassButton';
import GlassCard from '../ui/GlassCard';
import CriterionRow from './CriterionRow';
import Disclosure, { DisclosureLine } from './Disclosure';
import SectionHeading from './SectionHeading';
import type {
  MonetizationProgramEligibility,
} from '../../services/monetizationProgramService';
import type { QualityRates } from '../../services/creatorPoolService';
import { compact, fullDate, money, num, percent } from './format';

/**
 * Le programme vu par quelqu'un qui n'y est pas encore.
 *
 * C'est TOUT ce que voit un créateur hors programme : ni gains, ni projection,
 * ni historique, ni score de qualité. Montrer un tableau de bord de revenus à
 * quelqu'un qui ne peut pas être payé donne un écran qu'on ne sait pas lire —
 * on y cherche un bouton d'encaissement qui n'existe pas. Ici la page ne
 * répond qu'à une seule question : qu'est-ce qu'il faut pour entrer.
 *
 * Le même bloc sert dans les deux écrans — `TweetMonetizationScreen` quand la
 * candidature n'est pas approuvée, et `MonetizationProgramScreen` en accès
 * direct depuis les réglages — pour qu'ils ne divergent jamais.
 *
 * Les chiffres du pot sont ceux de la plateforme, pas ceux du lecteur : ils
 * donnent l'ordre de grandeur de ce qui se partage, sans rien lui promettre.
 *
 * La présentation est celle du tableau de bord des gains (passe du
 * 2026-08-20) : panneau d'accueil surélevé à filet d'accent, titres portés
 * par un filet, listes à filets internes. Un prospect doit retrouver la
 * même écriture que celle qu'il verra une fois admis.
 */

interface Props {
  program: MonetizationProgramEligibility;
  symbol: string;
  applying: boolean;
  onApply: () => void;
  /** Le pot de la semaine en cours, quand il est connu. */
  pool?: { pool: number; shareOfInflows: number } | null;
  cohortSize?: number;
  weights?: QualityRates | null;
}

export default function ProgramOverview({
  program,
  symbol,
  applying,
  onApply,
  pool,
  cohortSize,
  weights,
}: Props) {
  const met = [
    program.criteria.meetsViews,
    program.criteria.meetsFollowers,
    program.criteria.meetsBehavior,
  ].filter(Boolean).length;

  const pending = program.programStatus === 'pending';
  const rejected = program.programStatus === 'rejected';

  return (
    <>
      {/* --- Ce que c'est ------------------------------------------------ */}
      <GlassCard style={styles.hero} contentStyle={styles.heroFlush}>
        <View style={styles.heroAccentBar} />
        <View style={styles.heroBody}>
          <View style={styles.heroIcon}>
            <Ionicons name="trophy" size={20} color={colors.accent} />
          </View>
          <Text style={styles.heroTitle}>Programme de monétisation</Text>
          <Text style={styles.heroText}>
            Chaque lundi, une part de ce que la plateforme a réellement encaissé dans la semaine est
            partagée entre les créateurs du programme. Pas de paiement au tweet, pas de contrat
            publicitaire à négocier : une part, calculée sur l’attention que ton contenu a vraiment
            retenue.
          </Text>

          {!!pool && (
            <View style={styles.poolStrip}>
              <View style={styles.poolItem}>
                <Text style={styles.poolValue}>
                  {money(pool.pool, 0)} <Text style={styles.poolUnit}>{symbol}</Text>
                </Text>
                <Text style={styles.poolLabel}>partagés cette semaine</Text>
              </View>
              <View style={styles.poolDivider} />
              <View style={styles.poolItem}>
                <Text style={styles.poolValue}>{compact(cohortSize)}</Text>
                <Text style={styles.poolLabel}>créateurs se le partagent</Text>
              </View>
            </View>
          )}
        </View>
      </GlassCard>

      {/* --- Où j'en suis ------------------------------------------------ */}
      <SectionHeading>Les conditions</SectionHeading>
      <GlassCard style={styles.card} contentStyle={styles.body}>
        <View style={styles.progressHead}>
          <Text style={styles.progressCount}>
            {met}
            <Text style={styles.progressCountTotal}> / 3</Text>
          </Text>
          <Text style={styles.progressLabel}>
            {met === 3
              ? 'Tous les seuils sont franchis.'
              : `Encore ${3 - met} seuil${3 - met > 1 ? 's' : ''} à franchir avant de pouvoir candidater.`}
          </Text>
        </View>

        <View style={styles.criteria}>
          <CriterionRow
            icon="eye-outline"
            label="Vues sur 30 jours"
            current={compact(program.stats.views30d)}
            target={compact(program.thresholds.views30d)}
            ratio={num(program.stats.views30d) / Math.max(1, num(program.thresholds.views30d))}
            done={program.criteria.meetsViews}
            remaining={`encore ${compact(
              Math.max(0, num(program.thresholds.views30d) - num(program.stats.views30d)),
            )} vues sur les 30 derniers jours`}
          />
          <CriterionRow
            icon="people-outline"
            label="Abonnés"
            current={compact(program.stats.followersCount)}
            target={compact(program.thresholds.followersCount)}
            ratio={
              num(program.stats.followersCount) / Math.max(1, num(program.thresholds.followersCount))
            }
            done={program.criteria.meetsFollowers}
            remaining={`encore ${compact(
              Math.max(0, num(program.thresholds.followersCount) - num(program.stats.followersCount)),
            )} abonnés`}
          />
          <CriterionRow
            icon="pulse-outline"
            label="Qualité de l’audience"
            current={percent(program.stats.followerBehaviorScore)}
            target={percent(program.thresholds.followerBehaviorScore)}
            ratio={
              num(program.stats.followerBehaviorScore)
              / Math.max(0.01, num(program.thresholds.followerBehaviorScore))
            }
            done={program.criteria.meetsBehavior}
            remaining="mesure la part de tes abonnés qui lisent vraiment — les comptes créés en rafale la font baisser"
          />
        </View>

        {/* L'abonnement n'est pas un seuil qu'on franchit avec le temps :
            il se coche ou non, d'où la ligne à part plutôt qu'une barre. */}
        <View style={[styles.subRow, program.hasActiveSubscription && styles.subRowDone]}>
          <Ionicons
            name={program.hasActiveSubscription ? 'checkmark-circle' : 'ellipse-outline'}
            size={16}
            color={program.hasActiveSubscription ? colors.success : colors.textMuted}
          />
          <Text style={styles.subText}>
            Abonnement Plus ou Pro actif
            {program.hasActiveSubscription ? '' : ' — requis pour encaisser'}
          </Text>
        </View>
      </GlassCard>

      {/* --- Candidater --------------------------------------------------- */}
      <GlassCard style={styles.card} contentStyle={styles.body}>
        {pending ? (
          <View style={styles.statusBox}>
            <View style={styles.statusIcon}>
              <Ionicons name="hourglass-outline" size={16} color={colors.warning} />
            </View>
            <View style={styles.statusBody}>
              <Text style={styles.statusTitle}>Candidature en cours de revue</Text>
              <Text style={styles.statusText}>
                Déposée le {fullDate(program.appliedAt)}. Tes chiffres continuent d’être comptés
                pendant la revue — rien n’est perdu.
              </Text>
            </View>
          </View>
        ) : rejected ? (
          <>
            <View style={styles.statusBox}>
              <View style={[styles.statusIcon, styles.statusIconRejected]}>
                <Ionicons name="close-circle-outline" size={16} color={colors.red} />
              </View>
              <View style={styles.statusBody}>
                <Text style={styles.statusTitle}>Candidature refusée</Text>
                <Text style={styles.statusText}>
                  {program.rejectionReason || 'Aucun motif n’a été précisé.'}
                  {!!program.reviewedAt && ` (${fullDate(program.reviewedAt)})`}
                </Text>
              </View>
            </View>
            {program.canApply && (
              <GlassButton
                label={applying ? 'Envoi…' : 'Candidater à nouveau'}
                icon="refresh-outline"
                onPress={onApply}
                disabled={applying}
                loading={applying}
                fullWidth
                style={styles.applyButton}
              />
            )}
          </>
        ) : program.canApply ? (
          <>
            <Text style={styles.readyTitle}>Tu remplis les conditions</Text>
            <Text style={styles.readyText}>
              Une équipe relit chaque candidature. Tant qu’elle n’est pas approuvée, tes vues
              continuent d’être comptées mais rien n’est versé.
            </Text>
            <GlassButton
              label={applying ? 'Envoi…' : 'Déposer ma candidature'}
              icon="send-outline"
              onPress={onApply}
              disabled={applying}
              loading={applying}
              fullWidth
              style={styles.applyButton}
            />
          </>
        ) : (
          <View style={styles.statusBox}>
            <View style={styles.statusIcon}>
              <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
            </View>
            <View style={styles.statusBody}>
              <Text style={styles.statusTitle}>Candidature pas encore ouverte</Text>
              <Text style={styles.statusText}>
                {program.meetsAllThresholds
                  ? 'Il te manque un abonnement Plus ou Pro actif.'
                  : 'Franchis les seuils ci-dessus et le bouton s’ouvrira ici même.'}
              </Text>
            </View>
          </View>
        )}
      </GlassCard>

      {/* --- Comment on est payé ------------------------------------------ */}
      <SectionHeading>Comment on est payé</SectionHeading>
      <GlassCard style={styles.card} contentStyle={styles.body}>
        <Step
          index={1}
          title="Un pot est constitué chaque semaine"
          text={`Une part de ce que la plateforme encaisse — publicité, abonnements, commissions${
            pool ? ` — soit ${percent(pool.shareOfInflows)} des entrées` : ''
          }. Il ne peut jamais dépasser ce qui est réellement entré.`}
        />
        <Step
          index={2}
          title="Tes vues sont pondérées par leur qualité"
          text="Une vue qui retient l’attention pèse plus qu’une vue traversée. C’est ce qui remplace le paiement au volume."
        />
        <Step
          index={3}
          title="Ta part est figée le lundi"
          text="À la clôture, le montant est arrêté. Il ne bouge plus, et l’encaisser ne déclenche aucun recalcul."
        />
        <Step
          index={4}
          title="Tu encaisses quand tu veux"
          text={`Semaine par semaine ou tout d’un coup. Les ${symbol} arrivent dans ton portefeuille.`}
          last
        />

        <Disclosure label="Ce qui fait le poids de tes vues">
          <DisclosureLine term="Attention">
            le temps réellement passé sur tes publications, rapporté à leurs vues
            {weights ? ` — ${percent(weights.attention)} du score` : ''}. C’est le seul signal
            qu’on ne peut pas fabriquer, donc celui qui pèse le plus.
          </DisclosureLine>
          <DisclosureLine term="Rétention">
            les abonnés gagnés et les gens qui reviennent te lire un autre jour
            {weights ? ` — ${percent(weights.retention)}` : ''}.
          </DisclosureLine>
          <DisclosureLine term="DAU gagnée">
            les comptes inactifs la veille dont ta publication a ouvert la journée
            {weights ? ` — ${percent(weights.dau)}` : ''}.
          </DisclosureLine>
          <DisclosureLine term="Signaux négatifs">
            les « pas intéressé », les signalements, les publications retirées
            {weights ? ` — ${percent(weights.penalty)} retranchés` : ''}.
          </DisclosureLine>
          <DisclosureLine>
            Chaque signal compte comme un RANG dans le vivier de la semaine, pas comme un volume :
            un petit compte très suivi passe devant un gros compte tiède. Les interactions venues
            de comptes créés en rafale comptent pour zéro.
          </DisclosureLine>
        </Disclosure>
      </GlassCard>
    </>
  );
}

function Step({
  index,
  title,
  text,
  last = false,
}: {
  index: number;
  title: string;
  text: string;
  last?: boolean;
}) {
  return (
    <View style={styles.step}>
      <View style={styles.stepRail}>
        <View style={styles.stepDot}>
          <Text style={styles.stepIndex}>{index}</Text>
        </View>
        {/* Le trait relie les étapes : sans lui, quatre pastilles numérotées
            se lisent comme quatre éléments indépendants, pas comme un ordre. */}
        {!last && <View style={styles.stepLine} />}
      </View>
      <View style={styles.stepBody}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepText}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 14 },
  body: { padding: 14 },

  /* Panneau d'accueil — même écriture que le héro des gains : surface
     surélevée, bord franc, filet d'accent. Le prospect entre par la même
     porte que celle du tableau de bord qu'on lui promet. */
  hero: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.borderStrong,
  },
  heroFlush: { padding: 0 },
  heroAccentBar: { height: 3, backgroundColor: colors.accent },
  heroBody: { padding: 18 },
  heroIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentMuted,
    marginBottom: 12,
  },
  heroTitle: { fontFamily: fonts.bold, fontSize: 19, color: colors.textPrimary, letterSpacing: -0.4 },
  heroText: {
    marginTop: 7,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },

  poolStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  poolItem: { flex: 1 },
  poolDivider: { width: StyleSheet.hairlineWidth, height: 30, backgroundColor: colors.border },
  poolValue: { fontFamily: fonts.mono, fontSize: 16, color: colors.accent, letterSpacing: -0.5 },
  poolUnit: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted },
  poolLabel: { marginTop: 3, fontFamily: fonts.regular, fontSize: 10.5, color: colors.textMuted },

  /* Conditions */
  progressHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  progressCount: { fontFamily: fonts.mono, fontSize: 26, color: colors.accent, letterSpacing: -1 },
  progressCountTotal: { fontSize: 15, color: colors.textMuted },
  progressLabel: { flex: 1, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: colors.textSecondary },

  criteria: {
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },

  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    padding: 11,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
  },
  subRowDone: { backgroundColor: withAlpha(colors.success, 0.1) },
  subText: { flex: 1, fontFamily: fonts.medium, fontSize: 12.5, color: colors.textSecondary },

  /* Candidature */
  statusBox: { flexDirection: 'row', gap: 11, alignItems: 'flex-start' },
  statusIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  statusIconRejected: { backgroundColor: colors.redMuted },
  statusBody: { flex: 1 },
  statusTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.textPrimary },
  statusText: {
    marginTop: 4,
    fontFamily: fonts.regular,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  readyTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.success },
  readyText: {
    marginTop: 5,
    fontFamily: fonts.regular,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  applyButton: { marginTop: 13 },

  /* Étapes */
  step: { flexDirection: 'row', gap: 12 },
  stepRail: { alignItems: 'center', width: 22 },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentMuted,
  },
  stepIndex: { fontFamily: fonts.mono, fontSize: 10.5, color: colors.accent },
  stepLine: { flex: 1, width: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 4 },
  stepBody: { flex: 1, paddingBottom: 16 },
  stepTitle: { fontFamily: fonts.medium, fontSize: 13, color: colors.textPrimary },
  stepText: {
    marginTop: 3,
    fontFamily: fonts.regular,
    fontSize: 11.5,
    lineHeight: 17,
    color: colors.textMuted,
  },
});
