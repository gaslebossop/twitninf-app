import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp, Pressable, Platform } from 'react-native';
import { colors, radius } from '../../theme';

interface GlassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  onPress?: () => void;
  /** Bord accent (pour les cartes mises en avant). */
  highlight?: boolean;
  padding?: number;
}

/**
 * Carte pleine de la DA « Pulse » — surface solide, bordure fine,
 * aucune transparence ni flou. Brique de base de tous les écrans.
 */
export default function GlassCard({
  children,
  style,
  contentStyle,
  onPress,
  highlight = false,
  padding = 16,
}: GlassCardProps) {
  const inner = (
    <View style={[{ padding }, contentStyle]}>{children}</View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.wrap,
          highlight && styles.wrapHighlight,
          pressed && styles.pressed,
          style,
        ]}
      >
        {inner}
      </Pressable>
    );
  }

  return (
    <View style={[styles.wrap, highlight && styles.wrapHighlight, style]}>
      {inner}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  wrapHighlight: {
    borderColor: colors.accent,
    borderWidth: 1.5,
  },
  pressed: {
    backgroundColor: colors.surfaceAlt,
  },
});
