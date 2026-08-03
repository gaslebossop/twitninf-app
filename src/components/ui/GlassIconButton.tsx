import React from 'react';
import { StyleSheet, TouchableOpacity, ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';

interface GlassIconButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  size?: number;
  iconSize?: number;
  color?: string;
  active?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Pastille d'action pleine (retour, options, fermeture…). */
export default function GlassIconButton({
  icon,
  onPress,
  size = 40,
  iconSize = 20,
  color = colors.textPrimary,
  active = false,
  style,
}: GlassIconButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[
        { width: size, height: size, borderRadius: size / 3.2 },
        styles.wrap,
        active && styles.wrapActive,
        style,
      ]}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Ionicons name={icon} size={iconSize} color={active ? colors.onAccent : color} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  wrapActive: {
    backgroundColor: colors.accent,
  },
});
