import React, { useCallback, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
} from 'react-native';
import feedback from '../../utils/feedback';

/**
 * Zone tapable de l'app.
 *
 * `TouchableOpacity` ne fait que baisser l'opacité : sur fond noir, le retour
 * est quasi invisible, et l'interface paraît morte sous le doigt. Ici, la
 * cible s'enfonce légèrement (échelle) ET vibre, dès l'APPUI — pas au
 * relâchement — pour que le retour précède le résultat réseau.
 *
 * L'échelle est animée en 110 ms avec `Easing.out`, sans ressort : un ressort
 * qui oscille sur un simple bouton se lit comme un défaut, pas comme du soin.
 *
 * `scaleTo` se règle selon la taille de la cible : une grande carte doit
 * s'enfoncer moins qu'une petite pastille pour parcourir la même distance
 * apparente (0.98 pour une carte pleine largeur, 0.92 pour une icône).
 */

export interface TappableProps extends Omit<PressableProps, 'style'> {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Échelle atteinte à l'appui. 0.97 par défaut. */
  scaleTo?: number;
  /** Retour tactile joué à l'appui. `false` pour le couper (listes denses). */
  haptic?: false | 'tap' | 'select';
}

const PRESS_IN_MS = 110;
const PRESS_OUT_MS = 140;

export default function Tappable({
  children,
  style,
  scaleTo = 0.97,
  haptic = 'tap',
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}: TappableProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const animate = useCallback(
    (toValue: number, duration: number) => {
      Animated.timing(scale, {
        toValue,
        duration,
        easing: toValue < 1 ? Easing.out(Easing.quad) : Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    },
    [scale],
  );

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        {...rest}
        disabled={disabled}
        onPressIn={(e) => {
          if (!disabled) {
            animate(scaleTo, PRESS_IN_MS);
            if (haptic === 'tap') feedback.tap();
            else if (haptic === 'select') feedback.select();
          }
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          animate(1, PRESS_OUT_MS);
          onPressOut?.(e);
        }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
