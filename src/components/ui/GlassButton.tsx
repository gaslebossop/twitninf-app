import React, { useRef } from 'react';
import {
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Easing,
  View,
  ViewStyle,
  StyleProp,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, glow } from '../../theme';
import feedback from '../../utils/feedback';

interface GlassButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Bouton plein de la DA « Pulse » : bloc de couleur franc, pas de dégradé. */
export default function GlassButton({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
}: GlassButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;
  // `bounciness: 6` faisait osciller le bouton après chaque appui : sur un
  // élément aussi présent, ce tremblement se lit comme un défaut. Durée courte
  // et décélération, jamais de rebond.
  const to = (v: number) =>
    Animated.timing(scale, {
      toValue: v,
      duration: v < 1 ? 110 : 140,
      easing: v < 1 ? Easing.out(Easing.quad) : Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

  const textColor =
    variant === 'primary' ? colors.onAccent : variant === 'secondary' ? colors.textPrimary : colors.accent;

  return (
    <Animated.View style={[{ transform: [{ scale }] }, fullWidth && styles.fullWidth, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          to(0.97);
          feedback.tap();
        }}
        onPressOut={() => to(1)}
        disabled={disabled || loading}
        style={[
          styles.base,
          styles[variant],
          variant === 'primary' && !disabled && glow(colors.accent, 14),
          disabled && styles.disabled,
        ]}
      >
        <View style={styles.row}>
          {loading ? (
            <ActivityIndicator size="small" color={textColor} />
          ) : (
            <>
              {icon ? <Ionicons name={icon} size={18} color={textColor} style={styles.icon} /> : null}
              <Text style={[styles.label, { color: textColor }]} numberOfLines={1}>
                {label}
              </Text>
            </>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fullWidth: { alignSelf: 'stretch' },
  base: {
    height: 54,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  primary: {
    backgroundColor: colors.accent,
  },
  secondary: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  icon: { marginRight: 8 },
  label: {
    fontFamily: fonts.bold,
    fontSize: 16,
    letterSpacing: 0.2,
  },
  disabled: { opacity: 0.45 },
});
