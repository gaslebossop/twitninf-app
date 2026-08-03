import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { colors } from '../../theme';

interface ScreenBackgroundProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Fond signature « Pulse ».
 *
 * Noir plat et net — pas de flou, pas de halos dégradés. Se place en
 * racine d'écran ; le contenu vient par-dessus, dans des `Card` pleines.
 */
export default function ScreenBackground({ children, style }: ScreenBackgroundProps) {
  return <View style={[styles.root, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
});
