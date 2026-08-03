import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Animated,
  ViewStyle,
  TextStyle,
  TextInputProps,
} from 'react-native';
import { fontSize, spacing, borderRadius, hp } from '../utils/responsive';
import { colors, fonts } from '../theme';

interface CustomInputProps extends TextInputProps {
  label: string;
  error?: string;
  containerStyle?: ViewStyle;
  labelStyle?: TextStyle;
  inputStyle?: ViewStyle;
  errorStyle?: TextStyle;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export default function CustomInput({
  label,
  error,
  containerStyle,
  labelStyle,
  inputStyle,
  errorStyle,
  leftIcon,
  rightIcon,
  value,
  onFocus,
  onBlur,
  ...props
}: CustomInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const focusAnim = useRef(new Animated.Value(0)).current;

  const animate = (to: number) =>
    Animated.timing(focusAnim, {
      toValue: to,
      duration: 180,
      useNativeDriver: false,
    }).start();

  useEffect(() => {
    // garde l'état visuel cohérent si la valeur est pré-remplie
  }, []);

  const handleFocus = (e: any) => {
    setIsFocused(true);
    animate(1);
    onFocus?.(e);
  };

  const handleBlur = (e: any) => {
    setIsFocused(false);
    animate(0);
    onBlur?.(e);
  };

  const borderColor = error
    ? colors.red
    : focusAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [colors.border, colors.accent],
      });

  const backgroundColor = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.surface, colors.surfaceAlt],
  });

  return (
    <View style={[styles.container, containerStyle]}>
      <Text style={[styles.label, isFocused && styles.labelFocused, labelStyle]}>
        {label}
      </Text>

      <Animated.View
        style={[
          styles.inputContainer,
          { borderColor, backgroundColor },
          isFocused && styles.inputContainerFocused,
          inputStyle,
        ]}
      >
        {leftIcon ? <View style={styles.affix}>{leftIcon}</View> : null}
        <TextInput
          style={styles.input}
          value={value}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholderTextColor={colors.textMuted}
          {...props}
        />
        {rightIcon ? <View style={styles.affix}>{rightIcon}</View> : null}
      </Animated.View>

      {error ? <Text style={[styles.errorText, errorStyle]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  label: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    letterSpacing: 0.2,
  },
  labelFocused: {
    color: colors.accent,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: borderRadius.lg,
    backgroundColor: 'rgba(255,255,255,0.09)',
    paddingHorizontal: spacing.lg,
  },
  inputContainerFocused: {
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 2,
  },
  input: {
    flex: 1,
    height: hp(54),
    fontFamily: fonts.medium,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    letterSpacing: 0.1,
  },
  affix: {
    marginHorizontal: spacing.xs,
  },
  errorText: {
    fontFamily: fonts.medium,
    color: colors.red,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
    marginLeft: spacing.xs,
  },
});
