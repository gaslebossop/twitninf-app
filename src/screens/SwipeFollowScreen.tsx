import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, ActivityIndicator, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { colors, fonts, radius, spacing } from '../theme';
import { timing } from '../utils/gesture';
import { ScreenBackground, AppHeader, EmptyState, Tappable, toast } from '../components/ui';
import Avatar from '../components/Avatar';
import { apiService } from '../services';
import swipeService from '../services/swipeService';
import { SwipeCandidate } from '../types/api';
import { formatCompactCount } from '../utils/format';

const { width: WINDOW_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = WINDOW_WIDTH - spacing.lg * 2;
const CARD_HEIGHT = CARD_WIDTH * 1.28;
const SWIPE_THRESHOLD = CARD_WIDTH * 0.32;
const ROTATION_DEG = 12;

type Direction = 'left' | 'right';

/**
 * Swipe or Follow — découverte active de comptes, servie par
 * swipe-recommender. Swipe droite / bouton ✓ = follow (via
 * apiService.followUser, même chemin que UserSuggestions), swipe gauche /
 * bouton ✕ = pass (swipeService, cooldown côté serveur).
 *
 * Pas d'animation au montage (règle de ce repo) : la première carte est
 * visible immédiatement dès que les données arrivent, rien ne se dévoile.
 */
export default function SwipeFollowScreen() {
  const navigation = useNavigation();
  const [queue, setQueue] = useState<SwipeCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [exhausted, setExhausted] = useState(false);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const load = useCallback(async (forceRefresh: boolean) => {
    setLoading(true);
    setExhausted(false);
    const res = await swipeService.getSwipeCandidates(20, forceRefresh);
    setLoading(false);
    if (res.success && res.data && res.data.length > 0) {
      setQueue(res.data);
    } else {
      setQueue([]);
      setExhausted(true);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  const current = queue[0];
  const next = queue[1];

  // Lu par `resolveSwipe`, qui ne se déclenche qu'à la fin de l'animation de
  // sortie — un `useCallback` sur `queue` serait périmé à ce moment-là si la
  // file avait déjà changé entre-temps.
  const queueRef = useRef(queue);
  queueRef.current = queue;

  const advance = useCallback(() => {
    translateX.value = 0;
    translateY.value = 0;
    setQueue((q) => q.slice(1));
  }, [translateX, translateY]);

  const handlePass = useCallback((candidate: SwipeCandidate) => {
    swipeService.passUser(candidate.id);
  }, []);

  const handleFollow = useCallback(async (candidate: SwipeCandidate) => {
    const res = await apiService.followUser(candidate.id);
    if (res.success) {
      toast.success(`Vous suivez @${candidate.username}`);
    } else {
      toast.error(res.message || 'Impossible de suivre ce compte');
    }
  }, []);

  // Appelé uniquement quand l'animation de sortie de carte s'est terminée
  // (voir `flingOut`) : c'est là qu'on agit vraiment sur le candidat.
  const resolveSwipe = useCallback((direction: Direction) => {
    const candidate = queueRef.current[0];
    if (candidate) {
      if (direction === 'right') handleFollow(candidate);
      else handlePass(candidate);
      advance();
    }
    setBusy(false);
  }, [handleFollow, handlePass, advance]);

  // `busy` se pose ICI, au déclenchement du geste/bouton — pas à la
  // résolution — sinon la fenêtre pendant laquelle la carte est encore en
  // train de voler reste sans garde, et un second tap déclenche une seconde
  // animation sur la même carte avant que la première n'ait fini.
  const flingOut = useCallback((direction: Direction) => {
    if (busy || !queueRef.current[0]) return;
    setBusy(true);
    const target = direction === 'right' ? WINDOW_WIDTH * 1.3 : -WINDOW_WIDTH * 1.3;
    translateX.value = withTiming(target, timing.exit, (finished) => {
      if (finished) runOnJS(resolveSwipe)(direction);
    });
  }, [busy, translateX, resolveSwipe]);

  const snapBack = useCallback(() => {
    translateX.value = withTiming(0, timing.base);
    translateY.value = withTiming(0, timing.base);
  }, [translateX, translateY]);

  const pan = Gesture.Pan()
    .enabled(!busy)
    .onUpdate((e) => {
      'worklet';
      translateX.value = e.translationX;
      translateY.value = e.translationY;
    })
    .onEnd((e) => {
      'worklet';
      if (e.translationX > SWIPE_THRESHOLD) {
        runOnJS(flingOut)('right');
      } else if (e.translationX < -SWIPE_THRESHOLD) {
        runOnJS(flingOut)('left');
      } else {
        runOnJS(snapBack)();
      }
    });

  const cardStyle = useAnimatedStyle(() => {
    const rotate = interpolate(
      translateX.value,
      [-WINDOW_WIDTH, 0, WINDOW_WIDTH],
      [-ROTATION_DEG, 0, ROTATION_DEG],
      Extrapolation.CLAMP
    );
    // Mélanger translateX/translateY/rotate dans un seul tableau de transform
    // fait perdre le typage strict de RN (chaque variante du type exige les
    // autres clés en `never`, pas seulement absentes) — sans effet à
    // l'exécution, Reanimated ignore les types. `as ViewStyle['transform']`
    // plutôt que `any` pour rester local à cette seule valeur.
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${rotate}deg` },
      ] as ViewStyle['transform'],
    };
  });

  const likeStampStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [20, SWIPE_THRESHOLD], [0, 1], Extrapolation.CLAMP),
  }));
  const passStampStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-SWIPE_THRESHOLD, -20], [1, 0], Extrapolation.CLAMP),
  }));

  return (
    <ScreenBackground>
      <View style={styles.container}>
        <AppHeader navigation={navigation} title="Swipe" subtitle="Découvre des comptes à suivre" />

        <View style={styles.stage}>
          {loading ? (
            <ActivityIndicator size="large" color={colors.accent} />
          ) : exhausted || !current ? (
            <EmptyState
              icon="albums-outline"
              title="Plus personne à découvrir"
              message="Revenez plus tard, ou relancez la recherche de profils."
              action={{ label: 'Actualiser', icon: 'refresh', onPress: () => load(true) }}
            />
          ) : (
            <View style={styles.cardArea}>
              {next && (
                <View style={[styles.card, styles.cardBehind]}>
                  <CandidateCard candidate={next} />
                </View>
              )}

              <GestureDetector gesture={pan}>
                <Animated.View style={[styles.card, cardStyle]}>
                  <CandidateCard candidate={current} />
                  <Animated.View style={[styles.stamp, styles.stampLike, likeStampStyle]}>
                    <Text style={styles.stampLikeText}>SUIVRE</Text>
                  </Animated.View>
                  <Animated.View style={[styles.stamp, styles.stampPass, passStampStyle]}>
                    <Text style={styles.stampPassText}>PASS</Text>
                  </Animated.View>
                </Animated.View>
              </GestureDetector>
            </View>
          )}
        </View>

        {!loading && current && (
          <View style={styles.actions}>
            <Tappable
              onPress={() => flingOut('left')}
              disabled={busy}
              scaleTo={0.92}
              style={[styles.actionBtn, styles.passBtn]}
            >
              <Ionicons name="close" size={30} color={colors.red} />
            </Tappable>
            <Tappable
              onPress={() => flingOut('right')}
              disabled={busy}
              scaleTo={0.92}
              style={[styles.actionBtn, styles.followBtn]}
            >
              <Ionicons name="checkmark" size={30} color={colors.onAccent} />
            </Tappable>
          </View>
        )}
      </View>
    </ScreenBackground>
  );
}

function CandidateCard({ candidate }: { candidate: SwipeCandidate }) {
  return (
    <View style={styles.cardBody}>
      <View style={styles.avatarWrap}>
        <Avatar size={96} username={candidate.username} uri={candidate.avatar} />
      </View>

      <View style={styles.nameRow}>
        <Text style={styles.fullName} numberOfLines={1}>{candidate.full_name}</Text>
        {candidate.verified && (
          <Ionicons name="checkmark-circle" size={18} color={colors.accent} style={styles.verifiedIcon} />
        )}
      </View>
      <Text style={styles.username}>@{candidate.username}</Text>

      {!!candidate.city && (
        <View style={styles.cityRow}>
          <Ionicons name="location-outline" size={13} color={colors.textSecondary} />
          <Text style={styles.cityText}>{candidate.city}</Text>
        </View>
      )}

      {!!candidate.bio && (
        <Text style={styles.bio} numberOfLines={3}>{candidate.bio}</Text>
      )}

      <View style={styles.statsRow}>
        <Text style={styles.statsNum}>{formatCompactCount(candidate.followers_count)}</Text>
        <Text style={styles.statsLabel}> abonnés</Text>
      </View>

      {candidate.reasons.length > 0 && (
        <View style={styles.reasonsRow}>
          {candidate.reasons.slice(0, 2).map((reason, i) => (
            <View key={i} style={styles.reasonPill}>
              <Text style={styles.reasonText}>{reason}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  cardArea: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  },
  card: {
    position: 'absolute',
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cardBehind: {
    top: 10,
    transform: [{ scale: 0.96 }],
    opacity: 0.7,
  },
  cardBody: {
    flex: 1,
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  avatarWrap: {
    marginBottom: spacing.md,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fullName: {
    fontSize: 20,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
    maxWidth: CARD_WIDTH - 80,
  },
  verifiedIcon: {
    marginLeft: 6,
  },
  username: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
  },
  cityText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  bio: {
    fontSize: 14,
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 14,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 18,
  },
  statsNum: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  statsLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  reasonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
  },
  reasonPill: {
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.md,
  },
  reasonText: {
    fontSize: 11,
    color: colors.accent,
    fontFamily: fonts.semibold,
  },
  stamp: {
    position: 'absolute',
    top: 24,
    borderWidth: 3,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  stampLike: {
    left: 20,
    borderColor: colors.success,
    transform: [{ rotate: '-18deg' }],
  },
  stampLikeText: {
    color: colors.success,
    fontFamily: fonts.bold,
    fontSize: 20,
    letterSpacing: 1,
  },
  stampPass: {
    right: 20,
    borderColor: colors.red,
    transform: [{ rotate: '18deg' }],
  },
  stampPassText: {
    color: colors.red,
    fontFamily: fonts.bold,
    fontSize: 20,
    letterSpacing: 1,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xl,
    paddingBottom: spacing.xl,
    paddingTop: spacing.md,
  },
  actionBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  followBtn: {
    backgroundColor: colors.accent,
  },
});
