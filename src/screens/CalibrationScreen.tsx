import React, { useCallback, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, duration as D, easing as E, fonts, radius, spacing, withAlpha } from '../theme';
import { AppHeader, Button, Card, ScreenBackground, ScreenSkeleton } from '../components/ui';
import { toast } from '../components/ui/Toast';
import Tappable from '../components/ui/Tappable';
import Avatar from '../components/Avatar';
import neuralRankService from '../services/neuralRankService';
import type { Tweet } from '../types/api';

/**
 * « Recalibrer l'algorithme » — Paramètres → Recalibration, jamais proposée
 * automatiquement (demande explicite de l'utilisateur, à distinguer de la
 * carte `AlgoCheckCard` qui apparaît d'elle-même dans le fil).
 *
 * 5 tours de 6 tweets. Les 2 premiers explorent large (thèmes et auteurs
 * distincts), les 3 suivants resserrent sur ce que la session vient de
 * montrer comme intérêt — voir `rust-recommender/src/calibration.rs`, qui
 * porte toute la logique de sélection.
 *
 * Signal privé : un « ça m'intéresse » ici n'est jamais un like public — pas
 * de notification à l'auteur, pas de compteur qui bouge. Seul l'algorithme en
 * tient compte (voir `calibration::finish`).
 */

const ROUNDS = 5;
const PER_ROUND = 6;

type Phase = 'intro' | 'loading' | 'round' | 'finishing' | 'done';

export default function CalibrationScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();

  const [phase, setPhase] = useState<Phase>('intro');
  const [round, setRound] = useState(1);
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [answered, setAnswered] = useState<null | boolean>(null);
  const [error, setError] = useState<string | null>(null);

  // Cumulés depuis le tour 1 : le moteur en a besoin pour ne jamais
  // reproposer un tweet déjà montré cette session.
  const likedIds = useRef<string[]>([]);
  const skippedIds = useRef<string[]>([]);

  const fade = useRef(new Animated.Value(1)).current;

  const loadRound = useCallback(async (targetRound: number) => {
    setPhase('loading');
    setError(null);
    const res = await neuralRankService.getCalibrationRound(
      targetRound,
      likedIds.current,
      skippedIds.current,
    );
    if (!res.success || res.tweets.length === 0) {
      setError(res.message || 'Impossible de charger ce tour pour le moment.');
      setPhase('intro');
      return;
    }
    setTweets(res.tweets);
    setCardIndex(0);
    setAnswered(null);
    setRound(targetRound);
    fade.setValue(1);
    setPhase('round');
  }, [fade]);

  const start = useCallback(() => {
    likedIds.current = [];
    skippedIds.current = [];
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

  const advance = useCallback(() => {
    const nextIndex = cardIndex + 1;
    if (nextIndex < tweets.length) {
      setCardIndex(nextIndex);
      setAnswered(null);
      fade.setValue(1);
      return;
    }
    // Tour terminé.
    if (round >= ROUNDS) {
      finish();
    } else {
      loadRound(round + 1);
    }
  }, [cardIndex, tweets.length, round, fade, finish, loadRound]);

  const answer = useCallback(
    (liked: boolean) => {
      if (answered !== null || phase !== 'round') return;
      const current = tweets[cardIndex];
      if (!current) return;
      setAnswered(liked);
      (liked ? likedIds : skippedIds).current.push(current.id);

      Animated.sequence([
        Animated.delay(260),
        Animated.timing(fade, {
          toValue: 0,
          duration: D.fast,
          easing: E.in,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) advance();
      });
    },
    [answered, phase, tweets, cardIndex, fade, advance],
  );

  const progressLabel = `Tour ${round}/${ROUNDS} · ${Math.min(cardIndex + 1, PER_ROUND)}/${tweets.length || PER_ROUND}`;

  return (
    <ScreenBackground>
      <AppHeader navigation={navigation} title="Recalibrer l'algorithme" />
      <View style={[styles.body, { paddingBottom: insets.bottom + spacing.lg }]}>
        {phase === 'intro' && (
          <View style={styles.introWrap}>
            <View style={styles.introIcon}>
              <Ionicons name="sparkles" size={26} color={colors.accent} />
            </View>
            <Text style={styles.introTitle}>Réaccorder ton fil</Text>
            <Text style={styles.introBody}>
              5 tours de 6 tweets, d'auteurs et de thèmes différents. Dis ce qui
              t'intéresse ou non — l'algorithme resserre à chaque tour. Rien de
              ce que tu choisis ici n'est un like public : ni notification à
              l'auteur, ni compteur qui bouge. Ça ne sert qu'à mieux te
              connaître.
            </Text>
            {error && <Text style={styles.errorText}>{error}</Text>}
            <Button label="Commencer" onPress={start} style={styles.startBtn} />
          </View>
        )}

        {phase === 'loading' && <ScreenSkeleton variant="list" />}
        {phase === 'finishing' && <ScreenSkeleton variant="list" />}

        {phase === 'round' && tweets[cardIndex] && (
          <View style={styles.roundWrap}>
            <Text style={styles.progress}>{progressLabel}</Text>

            <Animated.View style={[styles.cardOuter, { opacity: fade }]}>
              <Card style={styles.card}>
                <View style={styles.authorRow}>
                  <Avatar
                    size={40}
                    username={tweets[cardIndex].author?.username}
                    uri={tweets[cardIndex].author?.avatar}
                  />
                  <View style={styles.authorText}>
                    <Text style={styles.authorName} numberOfLines={1}>
                      {tweets[cardIndex].author?.full_name || tweets[cardIndex].author?.username}
                    </Text>
                    <Text style={styles.authorHandle} numberOfLines={1}>
                      @{tweets[cardIndex].author?.username}
                    </Text>
                  </View>
                </View>
                <Text style={styles.content} numberOfLines={8}>
                  {tweets[cardIndex].content}
                </Text>
              </Card>
            </Animated.View>

            <View style={styles.actions}>
              <Tappable onPress={() => answer(false)} scaleTo={0.96} haptic={false} style={styles.half}>
                <View style={[styles.btn, styles.btnGhost]}>
                  <Ionicons name="thumbs-down-outline" size={18} color={colors.textSecondary} />
                  <Text style={styles.btnGhostLabel}>Pas intéressé</Text>
                </View>
              </Tappable>
              <Tappable onPress={() => answer(true)} scaleTo={0.96} haptic={false} style={styles.half}>
                <View style={[styles.btn, styles.btnPrimary]}>
                  <Ionicons name="thumbs-up" size={18} color={colors.onAccent} />
                  <Text style={styles.btnPrimaryLabel}>Ça m'intéresse</Text>
                </View>
              </Tappable>
            </View>
          </View>
        )}

        {phase === 'done' && (
          <View style={styles.introWrap}>
            <View style={[styles.introIcon, styles.introIconDone]}>
              <Ionicons name="checkmark" size={26} color={colors.success} />
            </View>
            <Text style={styles.introTitle}>C'est noté</Text>
            <Text style={styles.introBody}>
              {likedIds.current.length} choix pris en compte. Ton fil va s'ajuster
              dès le prochain chargement.
            </Text>
            <Button label="Terminer" onPress={() => navigation?.goBack?.()} style={styles.startBtn} />
          </View>
        )}
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  introWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  introIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(colors.accent, 0.16),
  },
  introIconDone: {
    backgroundColor: withAlpha(colors.success, 0.16),
  },
  introTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.heading,
    fontSize: 22,
    textAlign: 'center',
  },
  introBody: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 14.5,
    lineHeight: 21,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  errorText: {
    color: colors.like,
    fontFamily: fonts.medium,
    fontSize: 13,
    textAlign: 'center',
  },
  startBtn: {
    marginTop: spacing.sm,
    minWidth: 200,
  },
  roundWrap: {
    flex: 1,
    paddingTop: spacing.md,
  },
  progress: {
    color: colors.textMuted,
    fontFamily: fonts.semibold,
    fontSize: 12.5,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
  },
  cardOuter: {
    flex: 1,
  },
  card: {
    padding: spacing.lg,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  authorText: {
    marginLeft: spacing.sm,
    flex: 1,
  },
  authorName: {
    color: colors.textPrimary,
    fontFamily: fonts.semibold,
    fontSize: 15,
  },
  authorHandle: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 13,
    marginTop: 1,
  },
  content: {
    color: colors.textPrimary,
    fontFamily: fonts.regular,
    fontSize: 16,
    lineHeight: 23,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  half: {
    flex: 1,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
    borderRadius: radius.md,
    gap: spacing.xs,
  },
  btnGhost: {
    backgroundColor: colors.surfaceElevated,
  },
  btnGhostLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.semibold,
    fontSize: 14.5,
  },
  btnPrimary: {
    backgroundColor: colors.accent,
  },
  btnPrimaryLabel: {
    color: colors.onAccent,
    fontFamily: fonts.bold,
    fontSize: 14.5,
  },
});
