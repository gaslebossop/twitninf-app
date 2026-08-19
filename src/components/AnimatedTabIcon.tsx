import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { colors, duration as D, easing as E } from '../theme';

/**
 * Icône d'onglet de la barre du bas.
 *
 * ── Pourquoi les animations précédentes avaient été retirées ──────────────
 * Elles montaient et démontaient la pastille de fond (`{focused && <View/>}`)
 * et animaient à l'entrée. Chaque changement d'onglet reconstruisait donc
 * l'élément pendant que l'écran changeait : la barre sautait, et la version
 * « sans animation » a été jugée moins pire. Elle l'était — mais elle laisse
 * l'élément le plus touché de l'app complètement figé.
 *
 * ── Ce qui rend celle-ci stable ───────────────────────────────────────────
 * Rien n'apparaît ni ne disparaît. La pastille et les DEUX glyphes (creux et
 * plein) sont montés en permanence ; seules leurs opacités et leur échelle
 * bougent, pilotées par une valeur unique. Tout est sur le thread natif, donc
 * l'animation ne dépend pas du travail que fait React pour monter l'écran
 * d'arrivée — c'est précisément ce qui faisait sauter l'ancienne version.
 *
 * Le mouvement répond à un geste (le tap) et se pose en 180 ms sans rebond.
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

/** Paire creux / plein à partir de l'un ou l'autre des deux noms. */
function glyphPair(name: string) {
  const solid = name.replace(/-outline$/, '');
  return {
    solid: solid as keyof typeof Ionicons.glyphMap,
    outline: `${solid}-outline` as keyof typeof Ionicons.glyphMap,
  };
}

/**
 * Badge de non-lus. Il pulse quand le NOMBRE change, jamais au montage :
 * l'onglet est remonté à chaque navigation, et un « pop » à chaque fois
 * ferait clignoter le badge sans qu'il ne se soit rien passé.
 */
function TabBadge({ count, style }: { count: number; style?: object }) {
  const scale = useRef(new Animated.Value(1)).current;
  const previous = useRef(count);

  useEffect(() => {
    const grew = count > previous.current;
    previous.current = count;
    if (!grew) return;
    scale.setValue(1);
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.28, duration: 110, easing: E.out, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 160, easing: E.out, useNativeDriver: true }),
    ]).start();
  }, [count, scale]);

  if (!count || count === 0) return null;

  return (
    <Animated.View style={[styles.badgeContainer, style, { transform: [{ scale }] }]}>
      <Text style={styles.badgeText}>{count > 99 ? '99+' : String(count)}</Text>
    </Animated.View>
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
  const { solid, outline } = glyphPair(iconName as string);

  // 0 = au repos, 1 = onglet actif. Une seule valeur pour la pastille et les
  // deux glyphes : ils ne peuvent pas se désynchroniser.
  const active = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(active, {
      toValue: focused ? 1 : 0,
      duration: D.fast,
      easing: E.out,
      useNativeDriver: true,
    }).start();
  }, [focused, active]);

  return (
    <View style={[styles.iconContainer, { width: boxWidth }]}>
      <View style={[styles.iconWrapper, dense && styles.iconWrapperDense]}>
        {/* Pastille : toujours montée, elle grandit depuis 0,8 et s'éteint en
            place. Aucun montage/démontage, donc aucune secousse de layout. */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pill,
            dense && styles.pillDense,
            {
              opacity: active,
              transform: [
                { scale: active.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) },
              ],
            },
          ]}
        />

        {/* Les deux glyphes se croisent en fondu. On ne peut pas animer la
            couleur d'une police d'icônes sur le thread natif — deux calques
            superposés, si. Le calque creux porte la taille de la case, le
            plein se pose dessus sans participer au layout. */}
        <View style={styles.glyphStack}>
          <Animated.View
            style={{ opacity: active.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }}
          >
            <Ionicons name={outline} size={glyphSize} color={colors.textSecondary} />
          </Animated.View>

          <Animated.View
            style={[
              styles.glyphSolid,
              {
                opacity: active,
                // Une pointe d'échelle : l'icône « prend » la place au lieu
                // de se substituer. Amplitude minuscule, sinon ça gigote.
                transform: [
                  { scale: active.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) },
                ],
              },
            ]}
          >
            <Ionicons name={solid} size={glyphSize} color={colors.accent} />
          </Animated.View>
        </View>

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
  glyphStack: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphSolid: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
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
