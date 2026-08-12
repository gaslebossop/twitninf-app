import React, { useRef } from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
  Animated,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { fontSize, borderRadius, hp } from '../utils/responsive';
import { colors, gradients, fonts, glow } from '../theme';

interface CustomButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
}

export default function CustomButton({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  style,
  textStyle,
  icon,
}: CustomButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (to: number) =>
    Animated.spring(scale, {
      toValue: to,
      useNativeDriver: true,
      speed: 40,
      bounciness: 6,
    }).start();

  const buttonStyle = [
    styles.button,
    styles[size],
    styles[variant],
    variant === 'primary' && !disabled && glow(colors.accent, 16),
    disabled && styles.disabled,
    style,
  ];

  const buttonTextStyle = [
    styles.text,
    styles[`${size}Text` as const],
    styles[`${variant}Text` as const],
    disabled && styles.disabledText,
    textStyle,
  ];

  const renderContent = () => {
    if (loading) {
      return (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? colors.onAccent : colors.accent}
        />
      );
    }
    return (
      <View style={styles.contentRow}>
        {icon ? <View style={styles.icon}>{icon}</View> : null}
        <Text style={buttonTextStyle} numberOfLines={1}>
          {title}
        </Text>
      </View>
    );
  };

  const inner =
    variant === 'primary' ? (
      <LinearGradient
        colors={gradients.accent}
        style={styles.fill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        {renderContent()}
      </LinearGradient>
    ) : (
      <View style={styles.fill}>{renderContent()}</View>
    );

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        style={buttonStyle}
        onPress={onPress}
        onPressIn={() => animateTo(0.97)}
        onPressOut={() => animateTo(1)}
        disabled={disabled || loading}
      >
        {inner}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fill: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    marginRight: 8,
  },
  // Tailles
  small: {
    paddingVertical: hp(11),
    paddingHorizontal: hp(20),
    minHeight: hp(44),
  },
  medium: {
    paddingVertical: hp(15),
    paddingHorizontal: hp(24),
    minHeight: hp(54),
  },
  large: {
    paddingVertical: hp(18),
    paddingHorizontal: hp(32),
    minHeight: hp(60),
  },
  // Variantes
  primary: {},
  secondary: {
    backgroundColor: colors.overlayMedium,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  outline: {
    borderWidth: 1.5,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  // États
  disabled: {
    opacity: 0.45,
  },
  // Texte
  text: {
    fontFamily: fonts.semibold,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  smallText: { fontSize: fontSize.base },
  mediumText: { fontSize: fontSize.md },
  largeText: { fontSize: fontSize.lg },
  primaryText: { color: colors.onAccent },
  secondaryText: { color: colors.textPrimary },
  outlineText: { color: colors.accent },
  ghostText: { color: colors.accent },
  disabledText: {},
});
