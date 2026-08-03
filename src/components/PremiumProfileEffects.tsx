import React, { useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { effectiveSubscriptionTier } from '../utils/subscriptionTier';

/** Épaisseur de l’anneau (px). L’avatar enfant doit faire `size - 2 * RING` pour rester aligné. */
export const PREMIUM_PROFILE_RING = 3;

export type PremiumProfileEffectKey =
  | 'none'
  | 'flow'
  | 'rainbow'
  | 'galaxy'
  | 'fire'
  | 'ocean'
  | 'aurora'
  | 'cosmic'
  | 'diamond'
  | 'ember'
  | 'mint'
  | 'lavender'
  | 'noir'
  | 'gold'
  | 'sunset'
  | 'ice';

const RING_COLORS: Partial<Record<PremiumProfileEffectKey, string[]>> = {
  rainbow: ['#ff006e', '#ffbe0b', '#06ffa5', '#3a86ff'],
  galaxy: ['#1a0033', '#5a189a', '#9d4edd', '#e0aaff'],
  fire: ['#dc2626', '#f97316', '#fbbf24'],
  ocean: ['#0369a1', '#0ea5e9', '#7dd3fc'],
  aurora: ['#059669', '#22d3ee', '#818cf8'],
  cosmic: ['#0f0c29', '#302b63', '#764ba2'],
  diamond: ['#fef3c7', '#e9d5ff', '#c4b5fd', '#a78bfa'],
  ember: ['#7f1d1d', '#ea580c', '#fcd34d'],
  mint: ['#064e3b', '#14b8a6', '#99f6e4'],
  lavender: ['#4c1d95', '#a78bfa', '#f5d0fe'],
  noir: ['#171717', '#525252', '#d4d4d4'],
  gold: ['#78350f', '#eab308', '#fef08a'],
  sunset: ['#be123c', '#fb7185', '#fdba74'],
  ice: ['#0c4a6e', '#38bdf8', '#e0f2fe'],
};

/** Dégradé multicolore pour l’effet « Flux » (rotation). */
const FLOW_RING_COLORS = ['#ff006e', '#ffbe0b', '#06ffa5', '#3a86ff', '#c084fc', '#f472b6', '#ff006e'];

const PRO_ONLY: PremiumProfileEffectKey[] = ['aurora', 'cosmic', 'diamond', 'ice'];

function clampEffectForTier(
  effectType: PremiumProfileEffectKey,
  isPremium: boolean,
  subscriptionTier?: string | null
): PremiumProfileEffectKey {
  if (!isPremium || effectType === 'none') return 'none';
  const tier = effectiveSubscriptionTier(isPremium, subscriptionTier);
  if (tier === 'free') return 'none';
  if (tier === 'pro') {
    return effectType in RING_COLORS || effectType === 'flow' ? effectType : 'flow';
  }
  if (tier === 'plus') {
    if (PRO_ONLY.includes(effectType as PremiumProfileEffectKey)) return 'flow';
    return effectType in RING_COLORS || effectType === 'flow' ? effectType : 'flow';
  }
  return 'none';
}

interface PremiumProfileEffectsProps {
  effectType: PremiumProfileEffectKey | string;
  children: React.ReactNode;
  size?: number;
  isPremium: boolean;
  subscriptionTier?: string | null;
}

export default function PremiumProfileEffects({
  effectType,
  children,
  size = 100,
  isPremium,
  subscriptionTier,
}: PremiumProfileEffectsProps) {
  const pulse = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;

  const resolved = useMemo(() => {
    const raw = (effectType || 'none') as PremiumProfileEffectKey;
    return clampEffectForTier(raw, isPremium, subscriptionTier);
  }, [effectType, isPremium, subscriptionTier]);

  useEffect(() => {
    if (!isPremium || resolved === 'none') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isPremium, resolved, pulse]);

  useEffect(() => {
    if (!isPremium || resolved !== 'flow') return;
    const rotate = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 9000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    rotate.start();
    return () => rotate.stop();
  }, [isPremium, resolved, spin]);

  if (!isPremium || resolved === 'none') {
    return <View style={[styles.wrap, { width: size, height: size, borderRadius: size / 2 }]}>{children}</View>;
  }

  const ring = PREMIUM_PROFILE_RING;
  const inner = Math.max(1, size - ring * 2);

  const pulseStyle = {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }),
    transform: [
      {
        scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, resolved === 'flow' ? 1.02 : 1.03] }),
      },
    ],
  };

  if (resolved === 'flow') {
    const glowSize = size * 2.35;
    const glowOffset = (size - glowSize) / 2;
    const spinStyle = {
      transform: [
        {
          rotate: spin.interpolate({
            inputRange: [0, 1],
            outputRange: ['0deg', '360deg'],
          }),
        },
      ],
    };

    return (
      <View style={[styles.wrap, { width: size, height: size, borderRadius: size / 2 }]}>
        <Animated.View style={[StyleSheet.absoluteFillObject, pulseStyle]} pointerEvents="none">
          <View style={[StyleSheet.absoluteFillObject, { borderRadius: size / 2, overflow: 'hidden' }]}>
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  width: glowSize,
                  height: glowSize,
                  left: glowOffset,
                  top: glowOffset,
                },
                spinStyle,
              ]}
            >
              <LinearGradient
                colors={FLOW_RING_COLORS}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ width: '100%', height: '100%' }}
              />
            </Animated.View>
          </View>
        </Animated.View>
        <View
          style={[
            styles.inner,
            {
              margin: ring,
              width: inner,
              height: inner,
              borderRadius: inner / 2,
            },
          ]}
        >
          {children}
        </View>
      </View>
    );
  }

  const colors = RING_COLORS[resolved] || RING_COLORS.rainbow!;

  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: size / 2 }]}>
      <Animated.View style={[StyleSheet.absoluteFillObject, pulseStyle]} pointerEvents="none">
        <LinearGradient
          colors={colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFillObject, { borderRadius: size / 2 }]}
        />
      </Animated.View>
      <View
        style={[
          styles.inner,
          {
            margin: ring,
            width: inner,
            height: inner,
            borderRadius: inner / 2,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  inner: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
});
