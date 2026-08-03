import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radius } from '../../theme';

/**
 * Bloc « chargement » gris — la brique de tous les squelettes de l'app.
 * Respiration douce et courte (900 ms, easeInOut, jamais de ressort) : c'est
 * un état qui dure quelques centaines de ms à quelques secondes, pas une
 * animation d'entrée qu'on regarde.
 */
export default function Skeleton({
  width,
  height,
  rounded = radius.md,
  style,
}: {
  width?: number | `${number}%`;
  height?: number;
  rounded?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        styles.base,
        { width, height, borderRadius: rounded },
        { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0.9] }) },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surfaceElevated,
  },
});
