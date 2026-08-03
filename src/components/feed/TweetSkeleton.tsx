import React, { memo, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { colors, withAlpha } from '../../theme';

/**
 * Ossature d'une ligne de fil, avec un balayage lumineux.
 *
 * Remplace le logo qui tournait en plein écran : l'utilisateur voit
 * immédiatement la forme du contenu à venir, ce qui rend l'attente beaucoup
 * plus courte perçue. L'animation tourne sur le thread UI.
 */
function SkeletonRow({ delay = 0 }: { delay?: number }) {
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [shimmer]);

  const pulse = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 1], [0.38, 0.75]),
  }));

  return (
    <View style={S.row}>
      <Animated.View style={[S.avatar, pulse]} />
      <View style={S.content}>
        <View style={S.headerLine}>
          <Animated.View style={[S.bar, { width: '34%' }, pulse]} />
          <Animated.View style={[S.bar, { width: '20%' }, pulse]} />
        </View>
        <Animated.View style={[S.bar, S.textBar, { width: '96%' }, pulse]} />
        <Animated.View style={[S.bar, S.textBar, { width: '88%' }, pulse]} />
        <Animated.View style={[S.bar, S.textBar, { width: '54%' }, pulse]} />
        <View style={S.actionsRow}>
          {[0, 1, 2, 3].map((i) => (
            <Animated.View key={i} style={[S.actionPill, pulse]} />
          ))}
        </View>
      </View>
    </View>
  );
}

const Row = memo(SkeletonRow);

/** `count` lignes d'ossature, à la place d'un écran de chargement vide. */
function TweetSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }, (_, i) => (
        <Row key={i} delay={i * 90} />
      ))}
    </View>
  );
}

export default memo(TweetSkeleton);

const bone = withAlpha(colors.textMuted, 0.22);

const S = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: bone,
  },
  content: {
    flex: 1,
    gap: 7,
  },
  headerLine: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 2,
  },
  bar: {
    height: 11,
    borderRadius: 6,
    backgroundColor: bone,
  },
  textBar: {
    height: 10,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 22,
    marginTop: 8,
  },
  actionPill: {
    width: 34,
    height: 14,
    borderRadius: 7,
    backgroundColor: bone,
  },
});
