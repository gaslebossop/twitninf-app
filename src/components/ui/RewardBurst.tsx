import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, withAlpha } from '../../theme';
import feedback from '../../utils/feedback';

/**
 * La célébration d'un gain.
 *
 * Gagner au casino, encaisser ses tweets, vendre un pseudo, terminer un défi :
 * quatre moments qui rapportent, et qui se signalaient tous par la même
 * fenêtre système grise à valider. Rien ne distinguait un jackpot d'un message
 * d'erreur — c'est le contraire de ce que doit produire une économie de jeu.
 *
 * Ici, un seul geste visuel, réutilisé partout : le montant grossit au centre
 * pendant qu'une gerbe d'éclats dorés s'ouvre derrière lui, puis tout retombe.
 * 1,5 s au total, non bloquant — on peut relancer un tour pendant.
 *
 * Trois règles tenues, celles qui séparent une célébration d'un gadget :
 *  - l'effet est EN FOND, jamais un calque opaque par-dessus le jeu ;
 *  - rien n'oscille : chaque éclat part et s'éteint, il ne rebondit pas ;
 *  - le montant reste lisible du début à la fin, c'est lui l'information.
 */

const PARTICLE_COUNT = 14;
const BURST_MS = 900;
const HOLD_MS = 520;

export interface RewardOptions {
  /** Montant gagné. Affiché préfixé d'un « + ». */
  amount: number;
  /** Unité (« NF » par défaut). */
  unit?: string;
  /** Ligne sous le montant : d'où vient le gain. */
  label?: string;
  /** Multiplicateur mis en avant (casino) : « ×4 ». */
  multiplier?: string;
}

const RewardContext = createContext<(options: RewardOptions) => void>(() => {});

let hostCelebrate: ((options: RewardOptions) => void) | null = null;

/** Déclenche la célébration depuis n'importe où. */
export function celebrateReward(options: RewardOptions) {
  hostCelebrate?.(options);
}

function money(n: number): string {
  return Math.round(n).toLocaleString('fr-FR');
}

/**
 * Un éclat. Sa trajectoire est tirée une fois au montage et ne dépend plus de
 * React ensuite : les quatorze éclats coûtent quatorze animations natives, pas
 * quatorze rendus par image.
 */
function Particle({ index, progress }: { index: number; progress: Animated.Value }) {
  const { angle, distance, size, delay, tint } = useMemo(() => {
    // Réparties sur le cercle avec un peu de désordre : une couronne
    // parfaitement régulière se lit comme un motif, pas comme une gerbe.
    const base = (index / PARTICLE_COUNT) * Math.PI * 2;
    const jitter = (Math.random() - 0.5) * 0.5;
    return {
      angle: base + jitter,
      distance: 90 + Math.random() * 90,
      size: 6 + Math.random() * 7,
      delay: Math.random() * 0.15,
      tint: index % 3 === 0 ? colors.accent : colors.gold,
    };
  }, [index]);

  const travel = progress.interpolate({
    inputRange: [0, delay, 1],
    outputRange: [0, 0, 1],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: tint,
          opacity: travel.interpolate({ inputRange: [0, 0.15, 0.75, 1], outputRange: [0, 1, 1, 0] }),
          transform: [
            {
              translateX: travel.interpolate({
                inputRange: [0, 1],
                outputRange: [0, Math.cos(angle) * distance],
              }),
            },
            {
              translateY: travel.interpolate({
                inputRange: [0, 1],
                // Un peu de gravité en fin de course : les éclats retombent
                // au lieu de filer indéfiniment vers l'extérieur.
                outputRange: [0, Math.sin(angle) * distance + 26],
              }),
            },
            { scale: travel.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.3, 1, 0.6] }) },
          ],
        },
      ]}
    />
  );
}

export function RewardProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<RewardOptions | null>(null);
  const { width } = useWindowDimensions();

  const burst = useRef(new Animated.Value(0)).current;
  const enter = useRef(new Animated.Value(0)).current;

  const celebrate = useCallback((next: RewardOptions) => {
    setOptions(next);
  }, []);

  useEffect(() => {
    hostCelebrate = celebrate;
    return () => {
      if (hostCelebrate === celebrate) hostCelebrate = null;
    };
  }, [celebrate]);

  useEffect(() => {
    if (!options) return;
    feedback.reward();
    burst.setValue(0);
    enter.setValue(0);

    Animated.parallel([
      Animated.timing(burst, {
        toValue: 1,
        duration: BURST_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.sequence([
        // Montée franche puis maintien : pas de ressort, le chiffre se pose.
        Animated.timing(enter, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.delay(HOLD_MS),
        Animated.timing(enter, {
          toValue: 0,
          duration: 260,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start(({ finished }) => {
      if (finished) setOptions(null);
    });
  }, [options, burst, enter]);

  const value = useMemo(() => celebrate, [celebrate]);

  return (
    <RewardContext.Provider value={value}>
      {children}
      {options && (
        // `none` : la célébration ne prend jamais le doigt. On peut relancer
        // un tour pendant qu'elle se joue.
        <View style={styles.host} pointerEvents="none">
          {/* Halo de fond — il HABILLE l'écran, il ne le masque pas. */}
          <Animated.View
            style={[
              styles.halo,
              {
                width: width * 1.4,
                height: width * 1.4,
                borderRadius: width * 0.7,
                opacity: enter.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] }),
                transform: [
                  { scale: burst.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.1] }) },
                ],
              },
            ]}
          />

          <View style={styles.center}>
            {Array.from({ length: PARTICLE_COUNT }, (_, i) => (
              <Particle key={i} index={i} progress={burst} />
            ))}

            <Animated.View
              style={[
                styles.card,
                {
                  opacity: enter,
                  transform: [
                    { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }) },
                    { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
                  ],
                },
              ]}
            >
              {!!options.multiplier && (
                <View style={styles.multiplierTag}>
                  <Text style={styles.multiplierText}>{options.multiplier}</Text>
                </View>
              )}

              <View style={styles.amountRow}>
                <Ionicons name="diamond" size={22} color={colors.gold} />
                <Text style={styles.amount}>
                  +{money(options.amount)}
                </Text>
                <Text style={styles.unit}>{options.unit ?? 'NF'}</Text>
              </View>

              {!!options.label && <Text style={styles.label}>{options.label}</Text>}
            </Animated.View>
          </View>
        </View>
      )}
    </RewardContext.Provider>
  );
}

export function useReward() {
  return useContext(RewardContext);
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9995,
  },
  halo: {
    position: 'absolute',
    backgroundColor: withAlpha(colors.gold, 0.13),
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  particle: {
    position: 'absolute',
  },
  card: {
    alignItems: 'center',
    paddingHorizontal: 26,
    paddingVertical: 18,
    borderRadius: 22,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: withAlpha(colors.gold, 0.4),
    shadowColor: colors.gold,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 22,
    elevation: 16,
  },
  multiplierTag: {
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: withAlpha(colors.gold, 0.18),
    marginBottom: 8,
  },
  multiplierText: {
    color: colors.gold,
    fontFamily: fonts.displayHeavy,
    fontSize: 15,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  amount: {
    color: colors.textPrimary,
    fontFamily: fonts.displayHeavy,
    fontSize: 38,
    marginLeft: 8,
    fontVariant: ['tabular-nums'],
  },
  unit: {
    color: colors.gold,
    fontFamily: fonts.display,
    fontSize: 17,
    marginLeft: 6,
    marginTop: 8,
  },
  label: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: 13.5,
    marginTop: 4,
  },
});

export default RewardProvider;
