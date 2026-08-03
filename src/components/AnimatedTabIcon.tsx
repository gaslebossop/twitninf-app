import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '../theme';

/**
 * Icône d'onglet de la barre du bas : pastille de fond quand l'onglet est
 * actif, glyphe, et badge de non-lus.
 *
 * Volontairement sans animation. Les versions animées (pastille qui grandit,
 * glyphe qui respire, badge qui « pop ») ont été retirées : elles se jouaient
 * en même temps que le changement d'écran et rendaient la barre instable.
 * Le composant ne fait plus que du rendu, l'état vient entièrement de
 * `focused` et de `badgeCount`.
 */

type Props = {
  focused: boolean;
  iconName: keyof typeof Ionicons.glyphMap;
  glyphSize: number;
  boxWidth: number;
  dense: boolean;
  badgeCount?: number;
  badgeStyle?: object;
};

function TabBadge({ count, style }: { count: number; style?: object }) {
  if (!count || count === 0) return null;

  return (
    <View style={[styles.badgeContainer, style]}>
      <Text style={styles.badgeText}>{count > 99 ? '99+' : String(count)}</Text>
    </View>
  );
}

export default function AnimatedTabIcon({
  focused,
  iconName,
  glyphSize,
  boxWidth,
  dense,
  badgeCount = 0,
  badgeStyle,
}: Props) {
  return (
    <View style={[styles.iconContainer, { width: boxWidth }]}>
      <View style={[styles.iconWrapper, dense && styles.iconWrapperDense]}>
        {focused && (
          <View
            pointerEvents="none"
            style={[styles.pill, dense && styles.pillDense]}
          />
        )}
        <Ionicons
          name={iconName}
          size={glyphSize}
          color={focused ? colors.accent : colors.textSecondary}
        />
        <TabBadge count={badgeCount} style={badgeStyle} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
  },
  iconWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 36,
    borderRadius: 12,
  },
  iconWrapperDense: {
    width: 34,
    height: 32,
    borderRadius: 10,
  },
  pill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 12,
    backgroundColor: colors.accentMuted,
  },
  pillDense: {
    borderRadius: 10,
  },
  badgeContainer: {
    position: 'absolute',
    backgroundColor: colors.accent,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: colors.bg,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});
