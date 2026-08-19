import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  LayoutAnimation,
  Platform,
  StyleProp,
  StyleSheet,
  Text,
  UIManager,
  View,
  ViewStyle,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, fonts, radius, withAlpha } from '../../theme';
import Tappable from './Tappable';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * « Comment ça marche », en tête d'un écran de jeu ou d'économie.
 *
 * Le casino, le trading, le marché des pseudos et la monétisation ont chacun
 * leurs règles — mises, frais, délais, ce qu'on gagne, ce qu'on risque — et
 * aucune n'était écrite nulle part dans l'app. On apprenait en perdant.
 *
 * Deux exigences opposées à tenir : l'expliquer à qui arrive, et ne pas
 * encombrer qui sait déjà. D'où le comportement : DÉPLIÉE la première fois
 * qu'on ouvre l'écran, repliée ensuite (et l'état est retenu par écran).
 * Ce n'est jamais une modale : rien à fermer pour commencer à jouer.
 */

export interface HowItWorksProps {
  /** Identifiant de stockage — un par écran. */
  id: string;
  title?: string;
  /** Trois à cinq règles, la plus utile en premier. */
  points: Array<{ icon?: keyof typeof Ionicons.glyphMap; text: string }>;
  /** Mise en garde affichée en bas, en rouge (argent réel, perte possible…). */
  warning?: string;
  tint?: string;
  style?: StyleProp<ViewStyle>;
}

const KEY = (id: string) => `howitworks:seen:${id}`;

export default function HowItWorks({
  id,
  title = 'Comment ça marche',
  points,
  warning,
  tint = colors.cyan,
  style,
}: HowItWorksProps) {
  // `null` = on ne sait pas encore si l'écran a déjà été vu : on n'affiche
  // rien plutôt que de déplier puis replier sous les yeux de l'utilisateur.
  const [open, setOpen] = useState<boolean | null>(null);
  const chevron = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let seen = false;
      try {
        seen = (await AsyncStorage.getItem(KEY(id))) === '1';
      } catch {
        // Stockage indisponible : on considère que c'est la première fois.
      }
      if (cancelled) return;
      setOpen(!seen);
      chevron.setValue(seen ? 0 : 1);
      if (!seen) {
        try {
          await AsyncStorage.setItem(KEY(id), '1');
        } catch {
          // Sans importance : la carte se rouvrira au prochain lancement.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, chevron]);

  const toggle = useCallback(() => {
    const next = !open;
    LayoutAnimation.configureNext({
      duration: 180,
      update: { type: LayoutAnimation.Types.easeOut, property: LayoutAnimation.Properties.opacity },
    });
    setOpen(next);
    Animated.timing(chevron, {
      toValue: next ? 1 : 0,
      duration: 160,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [open, chevron]);

  if (open === null) return null;

  return (
    <View style={[styles.card, { borderColor: withAlpha(tint, 0.24) }, style]}>
      <Tappable onPress={toggle} scaleTo={0.99} haptic="select">
        <View style={styles.header}>
          <View style={[styles.headerIcon, { backgroundColor: withAlpha(tint, 0.16) }]}>
            <Ionicons name="help-circle-outline" size={17} color={tint} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Animated.View
            style={{
              transform: [
                {
                  rotate: chevron.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '180deg'],
                  }),
                },
              ],
            }}
          >
            <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
          </Animated.View>
        </View>
      </Tappable>

      {open && (
        <View style={styles.body}>
          {points.map((point, index) => (
            <View key={index} style={styles.point}>
              <Ionicons
                name={point.icon ?? 'ellipse'}
                size={point.icon ? 15 : 6}
                color={tint}
                style={styles.pointIcon}
              />
              <Text style={styles.pointText}>{point.text}</Text>
            </View>
          ))}

          {!!warning && (
            <View style={styles.warning}>
              <Ionicons name="warning-outline" size={15} color={colors.warning} />
              <Text style={styles.warningText}>{warning}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  headerIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  title: {
    flex: 1,
    color: colors.textPrimary,
    fontFamily: fonts.heading,
    fontSize: 14.5,
  },
  body: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  point: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 9,
  },
  pointIcon: {
    width: 20,
    marginTop: 3,
  },
  pointText: {
    flex: 1,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 13.5,
    lineHeight: 19,
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  warningText: {
    flex: 1,
    color: colors.warning,
    fontFamily: fonts.medium,
    fontSize: 12.5,
    lineHeight: 18,
    marginLeft: 8,
  },
});
