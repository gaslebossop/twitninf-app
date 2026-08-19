import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radius, spacing, withAlpha } from '../theme';
import { AppHeader, Button, ScreenBackground, ScreenSkeleton } from '../components/ui';
import { toast } from '../components/ui/Toast';
import Avatar from '../components/Avatar';
import feedback from '../utils/feedback';
import neuralRankService from '../services/neuralRankService';
import type { Tweet } from '../types/api';

/**
 * « Recalibrer l'algorithme » — Paramètres uniquement, jamais proposé
 * automatiquement (à distinguer de `AlgoCheckCard`, qui apparaît d'elle-même
 * dans le fil).
 *
 * Le geste, pas deux boutons : glisser à droite = ça m'intéresse, à gauche =
 * non. Un tampon apparaît sous le doigt dès que le seuil est franchi, avant
 * même de lâcher — sans ce retour immédiat, un glissé est un pari. C'est le
 * seul point de l'app où l'on demande 18 réponses d'affilée : chaque
 * aller-retour vers un bouton se paierait 18 fois.
 *
 * 3 tours de 6 cartes : le premier couvre le plus large possible, les deux
 * suivants visent ce que le moteur ne sait pas encore trancher — voir
 * `rust-recommender/src/calibration.rs`, qui porte toute la sélection.
 */

const { width: SCREEN_W } = Dimensions.get('window');
/** Distance à partir de laquelle le glissé compte comme une réponse. */
const COMMIT_X = SCREEN_W * 0.28;
/** Vitesse qui vaut décision, même sans avoir parcouru `COMMIT_X`. */
const COMMIT_VELOCITY = 800;
/** Seuil d'apparition du tampon — plus tôt que la validation, à dessein. */
const STAMP_X = 40;

// Doit rester synchronisé avec rust-recommender/src/calibration.rs.
// La taille réelle d'un tour vient de toute façon de la réponse serveur.
const ROUNDS = 3;

type Phase = 'intro' | 'loading' | 'round' | 'finishing' | 'done';

export default function CalibrationScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();

  const [phase, setPhase] = useState<Phase>('intro');
  const [round, setRound] = useState(1);
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [totalSeen, setTotalSeen] = useState(0);

  const likedIds = useRef<string[]>([]);
  const skippedIds = useRef<string[]>([]);

  const x = useSharedValue(0);
  const settling = useSharedValue(false);

  const loadRound = useCallback(async (targetRound: number) => {
    setPhase('loading');
    setError(null);
    const res = await neuralRankService.getCalibrationRound(
      targetRound,
      likedIds.current,
      skippedIds.current,
    );
    if (!res.success || res.tweets.length === 0) {
      setError(res.message || 'Plus assez de contenu pour continuer.');
      setPhase('intro');
      return;
    }
    setTweets(res.tweets);
    setCardIndex(0);
    setRound(targetRound);
    x.value = 0;
    settling.value = false;
    setPhase('round');
  }, [x, settling]);

  const start = useCallback(() => {
    likedIds.current = [];
    skippedIds.current = [];
    setTotalSeen(0);
    loadRound(1);
  }, [loadRound]);

  const finish = useCallback(async () => {
    setPhase('finishing');
    const res = await neuralRankService.finishCalibration(likedIds.current);
    if (!res.success) {
      toast.error('La recalibration a échoué — retente un peu plus tard.');
      setPhase('intro');
      return;
    }
    setPhase('done');
  }, []);

  /** Enregistre la réponse puis avance. Appelé depuis le worklet via runOnJS. */
  const commit = useCallback(
    (liked: boolean) => {
      const current = tweets[cardIndex];
      if (!current) return;
      (liked ? likedIds : skippedIds).current.push(current.id);
      setTotalSeen((n) => n + 1);
      feedback.success();

      const nextIndex = cardIndex + 1;
      if (nextIndex < tweets.length) {
        setCardIndex(nextIndex);
        x.value = 0;
        settling.value = false;
        return;
      }
      if (round >= ROUNDS) finish();
      else loadRound(round + 1);
    },
    [tweets, cardIndex, round, x, settling, finish, loadRound],
  );

  const swipe = Gesture.Pan()
    .activeOffsetX([-14, 14])
    .failOffsetY([-24, 24])
    .onUpdate((e) => {
      'worklet';
      if (settling.value) return;
      x.value = e.translationX;
    })
    .onEnd((e) => {
      'worklet';
      if (settling.value) return;
      const decided =
        Math.abs(e.translationX) > COMMIT_X || Math.abs(e.velocityX) > COMMIT_VELOCITY;
      if (!decided) {
        x.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic) });
        return;
      }
      const liked = e.translationX > 0;
      settling.value = true;
      x.value = withTiming(
        liked ? SCREEN_W * 1.2 : -SCREEN_W * 1.2,
        { duration: 180, easing: Easing.out(Easing.cubic) },
        (done) => {
          'worklet';
          if (done) runOnJS(commit)(liked);
        },
      );
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { rotate: `${interpolate(x.value, [-SCREEN_W, 0, SCREEN_W], [-9, 0, 9])}deg` },
    ] as const,
  }));
  const yesStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [STAMP_X, COMMIT_X], [0, 1], 'clamp'),
  }));
  const noStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [-COMMIT_X, -STAMP_X], [1, 0], 'clamp'),
  }));

  // La carte suivante, visible derrière : sans elle, le glissé découvre du
  // vide et la pile paraît finie à chaque réponse.
  const nextTweet = tweets[cardIndex + 1];
  const current = tweets[cardIndex];
  const totalCards = ROUNDS * (tweets.length || 6);

  useEffect(() => { x.value = 0; }, [cardIndex, x]);

  return (
    <ScreenBackground>
      <AppHeader navigation={navigation} title="Recalibrer l'algorithme" />
      <View style={[styles.body, { paddingBottom: insets.bottom + spacing.lg }]}>
        {phase === 'intro' && (
          <View style={styles.center}>
            <View style={styles.bigIcon}>
              <Ionicons name="sparkles" size={26} color={colors.accent} />
            </View>
            <Text style={styles.title}>Réaccorder ton fil</Text>
            <Text style={styles.body2}>
              Une pile de tweets à trier au doigt. Glisse à droite si ça
              t'intéresse, à gauche sinon. Une vingtaine de cartes, une minute.
            </Text>
            <Text style={styles.note}>
              Rien de tout ça n'est un like public : ni notification à l'auteur,
              ni compteur qui bouge.
            </Text>
            {error && <Text style={styles.error}>{error}</Text>}
            <Button label="Commencer" onPress={start} style={styles.cta} />
          </View>
        )}

        {(phase === 'loading' || phase === 'finishing') && <ScreenSkeleton variant="tweet" />}

        {phase === 'round' && current && (
          <View style={styles.stage}>
            <View style={styles.progressRow}>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.min(100, (totalSeen / totalCards) * 100)}%` },
                  ]}
                />
              </View>
              <Text style={styles.progressText}>
                {totalSeen}/{totalCards}
              </Text>
            </View>

            <View style={styles.deck}>
              {nextTweet && (
                <View style={[styles.card, styles.cardBehind]}>
                  <CardBody tweet={nextTweet} />
                </View>
              )}

              <GestureDetector gesture={swipe}>
                <Reanimated.View style={[styles.card, cardStyle]}>
                  <CardBody tweet={current} />

                  <Reanimated.View style={[styles.stamp, styles.stampYes, yesStyle]}>
                    <Ionicons name="heart" size={16} color={colors.success} />
                    <Text style={[styles.stampText, { color: colors.success }]}>
                      ÇA M'INTÉRESSE
                    </Text>
                  </Reanimated.View>

                  <Reanimated.View style={[styles.stamp, styles.stampNo, noStyle]}>
                    <Ionicons name="close" size={16} color={colors.like} />
                    <Text style={[styles.stampText, { color: colors.like }]}>PAS POUR MOI</Text>
                  </Reanimated.View>
                </Reanimated.View>
              </GestureDetector>
            </View>

            <View style={styles.hintRow}>
              <View style={styles.hint}>
                <Ionicons name="arrow-back" size={14} color={colors.textMuted} />
                <Text style={styles.hintText}>Pas pour moi</Text>
              </View>
              <View style={styles.hint}>
                <Text style={styles.hintText}>Ça m'intéresse</Text>
                <Ionicons name="arrow-forward" size={14} color={colors.textMuted} />
              </View>
            </View>
          </View>
        )}

        {phase === 'done' && (
          <View style={styles.center}>
            <View style={[styles.bigIcon, styles.bigIconDone]}>
              <Ionicons name="checkmark" size={26} color={colors.success} />
            </View>
            <Text style={styles.title}>C'est noté</Text>
            <Text style={styles.body2}>
              {likedIds.current.length} tweet{likedIds.current.length > 1 ? 's' : ''} retenu
              {likedIds.current.length > 1 ? 's' : ''}. Ton fil est déjà à jour.
            </Text>
            <Button label="Voir mon fil" onPress={() => navigation?.goBack?.()} style={styles.cta} />
          </View>
        )}
      </View>
    </ScreenBackground>
  );
}

function CardBody({ tweet }: { tweet: Tweet }) {
  return (
    <>
      <View style={styles.authorRow}>
        <Avatar size={38} username={tweet.author?.username} uri={tweet.author?.avatar} />
        <View style={styles.authorText}>
          <Text style={styles.authorName} numberOfLines={1}>
            {tweet.author?.full_name || tweet.author?.username}
          </Text>
          <Text style={styles.authorHandle} numberOfLines={1}>
            @{tweet.author?.username}
          </Text>
        </View>
      </View>
      <Text style={styles.content} numberOfLines={12}>
        {tweet.content}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: spacing.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  bigIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(colors.accent, 0.16),
  },
  bigIconDone: { backgroundColor: withAlpha(colors.success, 0.16) },
  title: { color: colors.textPrimary, fontFamily: fonts.heading, fontSize: 22, textAlign: 'center' },
  body2: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 14.5,
    lineHeight: 21,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  note: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  error: { color: colors.like, fontFamily: fonts.medium, fontSize: 13, textAlign: 'center' },
  cta: { marginTop: spacing.sm, minWidth: 200 },

  stage: { flex: 1, paddingTop: spacing.md },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceElevated,
    overflow: 'hidden',
  },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: colors.accent },
  progressText: {
    color: colors.textMuted,
    fontFamily: fonts.semibold,
    fontSize: 12,
    minWidth: 42,
    textAlign: 'right',
  },

  deck: { flex: 1, marginTop: spacing.lg, marginBottom: spacing.md },
  card: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: withAlpha(colors.textMuted, 0.18),
    padding: spacing.lg,
  },
  cardBehind: { transform: [{ scale: 0.96 }, { translateY: 10 }], opacity: 0.5 },

  authorRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  authorText: { marginLeft: spacing.sm, flex: 1 },
  authorName: { color: colors.textPrimary, fontFamily: fonts.semibold, fontSize: 15 },
  authorHandle: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, marginTop: 1 },
  content: { color: colors.textPrimary, fontFamily: fonts.regular, fontSize: 17, lineHeight: 25 },

  stamp: {
    position: 'absolute',
    top: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 2,
  },
  stampYes: {
    right: spacing.lg,
    borderColor: colors.success,
    backgroundColor: withAlpha(colors.success, 0.12),
  },
  stampNo: {
    left: spacing.lg,
    borderColor: colors.like,
    backgroundColor: withAlpha(colors.like, 0.12),
  },
  stampText: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.5 },

  hintRow: { flexDirection: 'row', justifyContent: 'space-between' },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  hintText: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 12.5 },
});
