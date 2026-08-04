import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, radius, withAlpha } from '../../theme';
import { useCoinBalance } from '../../hooks/useCoinBalance';
import Tappable from './Tappable';

/**
 * Le solde NF, dans l'en-tête de tout écran qui dépense.
 *
 * Sans lui, l'utilisateur devait connaître son solde de mémoire pour décider
 * s'il pouvait miser, promouvoir un tweet ou acheter un pseudo — et il ne
 * l'apprenait qu'en échouant. Le voir en permanence change la nature de ces
 * écrans : on arrête de tenter, on choisit.
 *
 * Le chiffre COMPTE quand il change (400 ms) au lieu de sauter : un gain qui
 * se déroule se remarque, un gain qui se substitue passe inaperçu. Un appui
 * ouvre le portefeuille.
 */

function money(n: number): string {
  return Math.round(n).toLocaleString('fr-FR');
}

const COUNT_MS = 420;

export default function CoinBalancePill({
  style,
  compact = false,
}: {
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  const navigation = useNavigation<any>();
  const { balance, symbol, loading } = useCoinBalance();

  // Valeur affichée : elle rattrape `balance` en glissant, elle ne saute pas.
  const [shown, setShown] = useState<number | null>(balance);
  const fromRef = useRef<number | null>(balance);
  const rafRef = useRef<number | null>(null);
  const flash = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (balance === null) return;
    const from = fromRef.current;
    fromRef.current = balance;

    if (from === null || from === balance) {
      setShown(balance);
      return;
    }

    // Un gain s'éclaire brièvement en or, une dépense non : on souligne ce qui
    // fait plaisir, on n'insiste pas sur ce qui coûte.
    if (balance > from) {
      flash.setValue(0);
      Animated.sequence([
        Animated.timing(flash, { toValue: 1, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: false }),
        Animated.timing(flash, { toValue: 0, duration: 520, easing: Easing.in(Easing.quad), useNativeDriver: false }),
      ]).start();
    }

    const start = Date.now();
    const step = () => {
      const t = Math.min(1, (Date.now() - start) / COUNT_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(from + (balance - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
      else rafRef.current = null;
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [balance, flash]);

  const backgroundColor = flash.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.surface, withAlpha(colors.gold, 0.24)],
  });

  return (
    <Tappable
      onPress={() => navigation.navigate('WalletDetail')}
      scaleTo={0.94}
      style={style}
      accessibilityLabel={`Solde : ${shown === null ? 'inconnu' : money(shown)} ${symbol}`}
    >
      <Animated.View style={[styles.pill, compact && styles.pillCompact, { backgroundColor }]}>
        <View style={styles.dot}>
          <Ionicons name="diamond" size={compact ? 10 : 11} color={colors.gold} />
        </View>
        <Text style={[styles.value, compact && styles.valueCompact]} numberOfLines={1}>
          {loading || shown === null ? '···' : money(shown)}
        </Text>
        {!compact && <Text style={styles.symbol}>{symbol}</Text>}
      </Animated.View>
    </Tappable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 34,
    paddingLeft: 6,
    paddingRight: 12,
    borderRadius: radius.round,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(colors.gold, 0.32),
  },
  pillCompact: {
    height: 28,
    paddingRight: 9,
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(colors.gold, 0.16),
    marginRight: 7,
  },
  value: {
    color: colors.textPrimary,
    fontFamily: fonts.display,
    fontSize: 14.5,
    // Chiffres à chasse fixe : sans ça, le comptage fait vibrer la pastille
    // à chaque changement de largeur de glyphe.
    fontVariant: ['tabular-nums'],
  },
  valueCompact: {
    fontSize: 13,
  },
  symbol: {
    color: colors.gold,
    fontFamily: fonts.bold,
    fontSize: 11,
    marginLeft: 4,
    marginTop: 1,
  },
});
